use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3, Vec4};
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;
use wgpu::util::DeviceExt;

const STAR_STRIDE_FLOATS: usize = 12;
const LINE_STRIDE_FLOATS: usize = 8;
const AU_PER_LIGHT_YEAR: f32 = 63_241.077;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SceneUniform {
    view_proj: [[f32; 4]; 4],
    viewport: [f32; 4],
    focus: [f32; 4],
    camera: [f32; 4],
    time: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct StarInstance {
    position_pad: [f32; 4],
    color_magnitude: [f32; 4],
    params: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct LineVertex {
    position_alpha: [f32; 4],
    color: [f32; 4],
}

fn js_error(label: &str, error: impl core::fmt::Display) -> JsValue {
    JsValue::from_str(&format!("{label}: {error}"))
}

fn compress_universe(delta: Vec3) -> Vec3 {
    let distance_ly = delta.length();
    if !distance_ly.is_finite() || distance_ly < 0.000_000_001 {
        return Vec3::ZERO;
    }
    let mapped_radius = if distance_ly < 0.01 {
        (distance_ly * AU_PER_LIGHT_YEAR).max(0.000_001).powf(0.44) * 1.5
    } else {
        28.0 + (1.0 + distance_ly).log2() * 9.5
    };
    delta / distance_ly * mapped_radius
}

#[wasm_bindgen]
pub struct WgpuSkyRenderer {
    canvas: HtmlCanvasElement,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    background_pipeline: wgpu::RenderPipeline,
    star_pipeline: wgpu::RenderPipeline,
    line_pipeline: wgpu::RenderPipeline,
    quad_buffer: wgpu::Buffer,
    star_buffer: wgpu::Buffer,
    line_buffer: wgpu::Buffer,
    uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    stars: Vec<StarInstance>,
    star_count: u32,
    line_count: u32,
    focus: Vec3,
    target_focus: Vec3,
    camera_distance: f32,
    target_camera_distance: f32,
    yaw: f32,
    pitch: f32,
    elapsed: f32,
    backend: String,
}

#[wasm_bindgen]
impl WgpuSkyRenderer {
    #[wasm_bindgen(js_name = create)]
    pub async fn create(canvas: HtmlCanvasElement, prefer_webgpu: bool) -> Result<WgpuSkyRenderer, JsValue> {
        console_error_panic_hook::set_once();
        let width = canvas.width().max(1);
        let height = canvas.height().max(1);
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: if prefer_webgpu { wgpu::Backends::BROWSER_WEBGPU } else { wgpu::Backends::GL },
            ..Default::default()
        });
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|error| js_error("Could not create the wgpu canvas surface", error))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
            })
            .await
            .ok_or_else(|| JsValue::from_str("No compatible WebGPU or WebGL2 adapter was available."))?;
        let adapter_info = adapter.get_info();
        let required_limits = wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits());
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("SpaceViewer universe device"),
                    required_features: wgpu::Features::empty(),
                    required_limits,
                    memory_hints: wgpu::MemoryHints::MemoryUsage,
                },
                None,
            )
            .await
            .map_err(|error| js_error("Could not request the wgpu device", error))?;

        let capabilities = surface.get_capabilities(&adapter);
        let format = capabilities
            .formats
            .iter()
            .copied()
            .find(wgpu::TextureFormat::is_srgb)
            .unwrap_or(capabilities.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode: wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: 2,
            alpha_mode: capabilities.alpha_modes[0],
            view_formats: vec![],
        };
        surface.configure(&device, &config);

        let uniform = SceneUniform::zeroed();
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("SpaceViewer scene uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("SpaceViewer scene layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SpaceViewer scene bind group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("SpaceViewer universe pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SpaceViewer hierarchical universe shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("sky.wgsl").into()),
        });
        let blend = wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::SrcAlpha,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent::OVER,
        };
        let target = Some(wgpu::ColorTargetState {
            format,
            blend: Some(blend),
            write_mask: wgpu::ColorWrites::ALL,
        });
        let background_target = Some(wgpu::ColorTargetState {
            format,
            blend: None,
            write_mask: wgpu::ColorWrites::ALL,
        });
        let background_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SpaceViewer deep sky pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("background_vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("background_fs"),
                compilation_options: Default::default(),
                targets: &[background_target],
            }),
            multiview: None,
            cache: None,
        });
        let star_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SpaceViewer stellar billboard pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("star_vs"),
                compilation_options: Default::default(),
                buffers: &[
                    wgpu::VertexBufferLayout {
                        array_stride: 8,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &[wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x2,
                            offset: 0,
                            shader_location: 0,
                        }],
                    },
                    wgpu::VertexBufferLayout {
                        array_stride: core::mem::size_of::<StarInstance>() as u64,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &[
                            wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x4, offset: 0, shader_location: 1 },
                            wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x4, offset: 16, shader_location: 2 },
                            wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x4, offset: 32, shader_location: 3 },
                        ],
                    },
                ],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("star_fs"),
                compilation_options: Default::default(),
                targets: &[target.clone()],
            }),
            multiview: None,
            cache: None,
        });
        let line_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SpaceViewer orbit guide pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("line_vs"),
                compilation_options: Default::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: core::mem::size_of::<LineVertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x4, offset: 0, shader_location: 0 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x4, offset: 16, shader_location: 1 },
                    ],
                }],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::LineList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("line_fs"),
                compilation_options: Default::default(),
                targets: &[target],
            }),
            multiview: None,
            cache: None,
        });

        let quad: [f32; 12] = [-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0];
        let quad_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("SpaceViewer stellar quad"),
            contents: bytemuck::cast_slice(&quad),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let empty_star = StarInstance::zeroed();
        let star_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("SpaceViewer empty stellar buffer"),
            contents: bytemuck::bytes_of(&empty_star),
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        });
        let empty_line = LineVertex::zeroed();
        let line_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("SpaceViewer empty orbit buffer"),
            contents: bytemuck::bytes_of(&empty_line),
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        });

        Ok(Self {
            canvas,
            surface,
            device,
            queue,
            config,
            background_pipeline,
            star_pipeline,
            line_pipeline,
            quad_buffer,
            star_buffer,
            line_buffer,
            uniform_buffer,
            bind_group,
            stars: vec![],
            star_count: 0,
            line_count: 0,
            focus: Vec3::ZERO,
            target_focus: Vec3::ZERO,
            camera_distance: 104.0,
            target_camera_distance: 104.0,
            yaw: -0.38,
            pitch: -0.14,
            elapsed: 0.0,
            backend: format!("{:?}", adapter_info.backend),
        })
    }

    pub fn backend(&self) -> String {
        self.backend.clone()
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if self.config.width == width && self.config.height == height {
            return;
        }
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }

    pub fn set_stars(&mut self, data: &[f32]) -> Result<(), JsValue> {
        if data.len() % STAR_STRIDE_FLOATS != 0 {
            return Err(JsValue::from_str("Star buffer must contain 12 floats per instance."));
        }
        self.stars = data
            .chunks_exact(STAR_STRIDE_FLOATS)
            .map(|star| StarInstance {
                position_pad: [star[0], star[1], star[2], 0.0],
                color_magnitude: [star[3], star[4], star[5], star[6]],
                params: [star[7], star[8], star[9], 0.0],
            })
            .collect();
        self.star_count = self.stars.len() as u32;
        if !self.stars.is_empty() {
            self.star_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("SpaceViewer stellar instances"),
                contents: bytemuck::cast_slice(&self.stars),
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            });
        }
        Ok(())
    }

    pub fn set_lines(&mut self, data: &[f32]) -> Result<(), JsValue> {
        if data.len() % LINE_STRIDE_FLOATS != 0 {
            return Err(JsValue::from_str("Line buffer must contain 8 floats per vertex."));
        }
        let lines: Vec<LineVertex> = data
            .chunks_exact(LINE_STRIDE_FLOATS)
            .map(|line| LineVertex {
                position_alpha: [line[0], line[1], line[2], line[3]],
                color: [line[4], line[5], line[6], line[7]],
            })
            .collect();
        self.line_count = lines.len() as u32;
        if !lines.is_empty() {
            self.line_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("SpaceViewer orbit lines"),
                contents: bytemuck::cast_slice(&lines),
                usage: wgpu::BufferUsages::VERTEX,
            });
        }
        Ok(())
    }

    pub fn orbit(&mut self, delta_x: f32, delta_y: f32) {
        self.yaw -= delta_x * 0.0042;
        self.pitch = (self.pitch - delta_y * 0.0038).clamp(-1.36, 1.36);
    }

    pub fn zoom(&mut self, delta_y: f32) {
        let multiplier = (delta_y * 0.0013).exp();
        self.target_camera_distance = (self.target_camera_distance * multiplier).clamp(3.8, 240.0);
    }

    pub fn focus_star(&mut self, index: u32, immediate: bool) {
        let Some(star) = self.stars.get(index as usize) else { return };
        self.target_focus = Vec3::from_array([
            star.position_pad[0],
            star.position_pad[1],
            star.position_pad[2],
        ]);
        self.target_camera_distance = 7.4;
        if immediate {
            self.focus = self.target_focus;
            self.camera_distance = self.target_camera_distance;
        }
    }

    pub fn reset(&mut self, immediate: bool) {
        self.target_focus = Vec3::ZERO;
        self.target_camera_distance = 104.0;
        if immediate {
            self.focus = self.target_focus;
            self.camera_distance = self.target_camera_distance;
        }
    }

    pub fn cancel_transition(&mut self) {
        self.target_focus = self.focus;
        self.target_camera_distance = self.camera_distance;
    }

    pub fn tick(&mut self, delta_seconds: f32) {
        let delta = delta_seconds.clamp(0.0, 0.1);
        self.elapsed += delta;
        let response = 1.0 - (-delta * 3.8).exp();
        self.focus = self.focus.lerp(self.target_focus, response);
        self.camera_distance += (self.target_camera_distance - self.camera_distance) * response;
    }

    pub fn camera_distance(&self) -> f32 {
        self.camera_distance
    }

    pub fn is_transitioning(&self) -> bool {
        self.focus.distance(self.target_focus) > 0.000_01
            || (self.camera_distance - self.target_camera_distance).abs() > 0.02
    }

    pub fn pick(&self, x: f32, y: f32, interactive_count: u32) -> i32 {
        let matrix = self.view_projection();
        let mut best_index = -1;
        let mut best_distance = 15.0_f32;
        for (index, star) in self.stars.iter().take(interactive_count as usize).enumerate() {
            let position = Vec3::new(star.position_pad[0], star.position_pad[1], star.position_pad[2]);
            let world = compress_universe(position - self.focus);
            let clip = matrix * Vec4::new(world.x, world.y, world.z, 1.0);
            if clip.w <= 0.0 { continue; }
            let ndc = clip.truncate() / clip.w;
            if ndc.z < 0.0 || ndc.z > 1.0 { continue; }
            let screen_x = (ndc.x * 0.5 + 0.5) * self.config.width as f32;
            let screen_y = (0.5 - ndc.y * 0.5) * self.config.height as f32;
            let distance = Vec3::new(screen_x - x, screen_y - y, 0.0).length();
            if distance < best_distance {
                best_distance = distance;
                best_index = index as i32;
            }
        }
        best_index
    }

    pub fn project(&self, index: u32) -> Vec<f32> {
        let Some(star) = self.stars.get(index as usize) else { return vec![0.0, 0.0, 0.0] };
        let position = Vec3::new(star.position_pad[0], star.position_pad[1], star.position_pad[2]);
        let world = compress_universe(position - self.focus);
        let clip = self.view_projection() * Vec4::new(world.x, world.y, world.z, 1.0);
        if clip.w <= 0.0 { return vec![0.0, 0.0, 0.0]; }
        let ndc = clip.truncate() / clip.w;
        let visible = (ndc.x.abs() <= 1.08 && ndc.y.abs() <= 1.08 && ndc.z >= 0.0 && ndc.z <= 1.0) as u8 as f32;
        vec![
            (ndc.x * 0.5 + 0.5) * self.config.width as f32,
            (0.5 - ndc.y * 0.5) * self.config.height as f32,
            visible,
        ]
    }

    pub fn render(&mut self) -> Result<(), JsValue> {
        self.write_uniform();
        let frame = match self.surface.get_current_texture() {
            Ok(frame) => frame,
            Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                self.surface.configure(&self.device, &self.config);
                return Ok(());
            }
            Err(wgpu::SurfaceError::Timeout) => return Ok(()),
            Err(error) => return Err(js_error("Could not acquire the next universe frame", error)),
        };
        let view = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("SpaceViewer universe encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SpaceViewer universe pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.0, g: 0.0, b: 0.003, a: 1.0 }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_pipeline(&self.background_pipeline);
            pass.draw(0..3, 0..1);
            if self.line_count > 0 {
                pass.set_pipeline(&self.line_pipeline);
                pass.set_vertex_buffer(0, self.line_buffer.slice(..));
                pass.draw(0..self.line_count, 0..1);
            }
            if self.star_count > 0 {
                pass.set_pipeline(&self.star_pipeline);
                pass.set_vertex_buffer(0, self.quad_buffer.slice(..));
                pass.set_vertex_buffer(1, self.star_buffer.slice(..));
                pass.draw(0..6, 0..self.star_count);
            }
        }
        self.queue.submit(Some(encoder.finish()));
        frame.present();
        Ok(())
    }
}

impl WgpuSkyRenderer {
    fn view_projection(&self) -> Mat4 {
        let cos_pitch = self.pitch.cos();
        let eye = Vec3::new(
            self.yaw.sin() * cos_pitch * self.camera_distance,
            self.pitch.sin() * self.camera_distance,
            self.yaw.cos() * cos_pitch * self.camera_distance,
        );
        let view = Mat4::look_at_rh(eye, Vec3::ZERO, Vec3::Y);
        let aspect = self.config.width as f32 / self.config.height.max(1) as f32;
        let projection = Mat4::perspective_rh(44.0_f32.to_radians(), aspect, 0.1, 1_000.0);
        projection * view
    }

    fn write_uniform(&self) {
        let client_width = self.canvas.client_width().max(1) as f32;
        let pixel_ratio = self.config.width as f32 / client_width;
        let uniform = SceneUniform {
            view_proj: self.view_projection().to_cols_array_2d(),
            viewport: [self.config.width as f32, self.config.height as f32, pixel_ratio, 0.0],
            focus: [self.focus.x, self.focus.y, self.focus.z, 0.0],
            camera: [self.camera_distance, self.yaw, self.pitch, 0.0],
            time: [self.elapsed, 0.0, 0.0, 0.0],
        };
        self.queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniform));
    }
}
