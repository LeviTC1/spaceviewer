struct SceneUniform {
  view_proj: mat4x4<f32>,
  viewport: vec4<f32>,
  focus: vec4<f32>,
  camera: vec4<f32>,
  time: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniform;

fn rotate_y(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(c * value.x + s * value.z, value.y, -s * value.x + c * value.z);
}

fn rotate_x(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}

fn hash21(value: vec2<f32>) -> f32 {
  let p = fract(value * vec2<f32>(123.34, 456.21));
  let q = p + dot(p, p + 45.32);
  return fract(q.x * q.y);
}

fn compress_universe(delta_ly: vec3<f32>) -> vec3<f32> {
  let distance_ly = length(delta_ly);
  if (distance_ly < 0.000000001) {
    return vec3<f32>(0.0);
  }

  let distance_au = distance_ly * 63241.077;
  var mapped_radius: f32;
  if (distance_ly < 0.01) {
    mapped_radius = pow(max(distance_au, 0.000001), 0.44) * 1.5;
  } else {
    mapped_radius = 28.0 + log2(1.0 + distance_ly) * 9.5;
  }
  return delta_ly / distance_ly * mapped_radius;
}

struct BackgroundOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn background_vs(@builtin(vertex_index) index: u32) -> BackgroundOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  var output: BackgroundOut;
  output.position = vec4<f32>(positions[index], 0.999, 1.0);
  output.uv = positions[index] * 0.5 + 0.5;
  return output;
}

@fragment
fn background_fs(input: BackgroundOut) -> @location(0) vec4<f32> {
  let aspect = scene.viewport.x / max(scene.viewport.y, 1.0);
  let screen = vec2<f32>((input.uv.x - 0.5) * aspect, input.uv.y - 0.5);
  var ray = normalize(vec3<f32>(screen.x, screen.y, -0.82));
  ray = rotate_x(rotate_y(ray, scene.camera.y), -scene.camera.z * 0.72);

  let warp = 0.075 * sin(ray.x * 8.0 + ray.z * 3.0) + 0.025 * sin(ray.z * 21.0);
  let latitude = abs(ray.y + warp);
  let broad_band = exp(-latitude * latitude * 23.0);
  let bright_lane = exp(-latitude * latitude * 125.0);
  let rift_noise = hash21(floor((ray.xz + vec2<f32>(1.0)) * 73.0));
  let dust = smoothstep(0.38, 0.82, rift_noise) * exp(-latitude * latitude * 170.0);
  let core = pow(max(0.0, 1.0 - length(vec2<f32>(ray.x + 0.18, ray.y * 1.9))), 3.4);

  let fine_cell = floor((ray.xy / max(abs(ray.z), 0.12) + vec2<f32>(4.0)) * 690.0);
  let star_seed = hash21(fine_cell);
  let star = pow(smoothstep(0.989, 1.0, star_seed), 4.0);
  let blue_star = pow(smoothstep(0.996, 1.0, hash21(fine_cell + 91.7)), 3.0);

  var color = vec3<f32>(0.003, 0.006, 0.014);
  color += broad_band * vec3<f32>(0.045, 0.065, 0.105);
  color += bright_lane * vec3<f32>(0.19, 0.16, 0.17) * (0.62 + rift_noise * 0.62);
  color += core * vec3<f32>(0.46, 0.27, 0.13);
  color *= 1.0 - dust * 0.72;
  color += star * vec3<f32>(0.72, 0.82, 1.0) + blue_star * vec3<f32>(0.25, 0.45, 0.9);
  let vignette = smoothstep(0.92, 0.18, length(screen));
  color *= 0.48 + vignette * 0.52;
  return vec4<f32>(color, 1.0);
}

struct StarIn {
  @location(0) corner: vec2<f32>,
  @location(1) position_pad: vec4<f32>,
  @location(2) color_magnitude: vec4<f32>,
  @location(3) params: vec4<f32>,
};

struct StarOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) intensity: f32,
  @location(3) selected: f32,
  @location(4) kind: f32,
  @location(5) close_focus: f32,
};

@vertex
fn star_vs(input: StarIn) -> StarOut {
  let local_position = compress_universe(input.position_pad.xyz - scene.focus.xyz);
  var clip = scene.view_proj * vec4<f32>(local_position, 1.0);
  let magnitude = input.color_magnitude.w;
  let selected = input.params.y;
  let close_focus = selected * (1.0 - smoothstep(3.8, 16.0, scene.camera.x));
  let magnitude_size = 1.35 + clamp(6.2 - magnitude, 0.0, 9.0) * 0.48;
  let pixel_ratio = max(scene.viewport.z, 1.0);
  let pixel_size = clamp(((magnitude_size + selected * 2.8) * input.params.x + close_focus * 72.0) * pixel_ratio, 1.7, 184.0);
  clip.xy += input.corner * vec2<f32>(pixel_size * 2.0 / scene.viewport.x, pixel_size * 2.0 / scene.viewport.y) * clip.w;

  var output: StarOut;
  output.position = clip;
  output.uv = input.corner;
  output.color = input.color_magnitude.xyz;
  output.intensity = clamp(pow(2.512, -0.4 * magnitude), 0.2, 5.0);
  output.selected = selected;
  output.kind = input.params.z;
  output.close_focus = close_focus;
  return output;
}

@fragment
fn star_fs(input: StarOut) -> @location(0) vec4<f32> {
  let radius = length(input.uv);
  if (radius > 1.0) {
    discard;
  }
  let core = smoothstep(0.38, 0.02, radius);
  let halo = pow(max(0.0, 1.0 - radius), 3.2);
  let spike_x = pow(max(0.0, 1.0 - abs(input.uv.x) * 16.0), 4.0) * (1.0 - radius);
  let spike_y = pow(max(0.0, 1.0 - abs(input.uv.y) * 16.0), 4.0) * (1.0 - radius);
  let diffraction = (spike_x + spike_y) * (0.12 + input.selected * 0.32);
  let limb = mix(0.62, 1.35, smoothstep(0.88, 0.0, radius));
  let stellar_disc = smoothstep(0.76, 0.70, radius) * input.close_focus;
  let convection = 0.88 + 0.12 * sin(input.uv.x * 29.0 + sin(input.uv.y * 23.0 + scene.time.x * 0.2) * 2.4);
  let corona = pow(max(0.0, 1.0 - radius), 5.5) * input.close_focus;
  let alpha = clamp((core * 0.9 + halo * 0.7 + diffraction + stellar_disc) * (0.65 + input.intensity * 0.28), 0.0, 1.0);
  let selected_tint = mix(input.color, vec3<f32>(0.76, 0.9, 1.0), input.selected * 0.28);
  let point_light = selected_tint * (halo * 0.8 + core * 2.2) * limb * (0.68 + input.intensity * 0.24);
  let surface_light = selected_tint * stellar_disc * convection * (1.15 + corona * 1.8);
  let color = point_light + surface_light;
  return vec4<f32>(color, alpha);
}

struct LineIn {
  @location(0) position_alpha: vec4<f32>,
  @location(1) color: vec4<f32>,
};

struct LineOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn line_vs(input: LineIn) -> LineOut {
  var output: LineOut;
  let local_position = compress_universe(input.position_alpha.xyz - scene.focus.xyz);
  output.position = scene.view_proj * vec4<f32>(local_position, 1.0);
  output.color = vec4<f32>(input.color.rgb, input.color.a * input.position_alpha.w);
  return output;
}

@fragment
fn line_fs(input: LineOut) -> @location(0) vec4<f32> {
  return input.color;
}
