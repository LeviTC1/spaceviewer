/* tslint:disable */
/* eslint-disable */

export class WgpuSkyRenderer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    backend(): string;
    camera_distance(): number;
    cancel_transition(): void;
    static create(canvas: HTMLCanvasElement, prefer_webgpu: boolean): Promise<WgpuSkyRenderer>;
    focus_star(index: number, immediate: boolean): void;
    is_transitioning(): boolean;
    orbit(delta_x: number, delta_y: number): void;
    pick(x: number, y: number, interactive_count: number): number;
    project(index: number): Float32Array;
    render(): void;
    reset(immediate: boolean): void;
    resize(width: number, height: number): void;
    set_lines(data: Float32Array): void;
    set_stars(data: Float32Array): void;
    tick(delta_seconds: number): void;
    zoom(delta_y: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wgpuskyrenderer_free: (a: number, b: number) => void;
    readonly wgpuskyrenderer_backend: (a: number, b: number) => void;
    readonly wgpuskyrenderer_camera_distance: (a: number) => number;
    readonly wgpuskyrenderer_cancel_transition: (a: number) => void;
    readonly wgpuskyrenderer_create: (a: number, b: number) => number;
    readonly wgpuskyrenderer_focus_star: (a: number, b: number, c: number) => void;
    readonly wgpuskyrenderer_is_transitioning: (a: number) => number;
    readonly wgpuskyrenderer_orbit: (a: number, b: number, c: number) => void;
    readonly wgpuskyrenderer_pick: (a: number, b: number, c: number, d: number) => number;
    readonly wgpuskyrenderer_project: (a: number, b: number, c: number) => void;
    readonly wgpuskyrenderer_render: (a: number, b: number) => void;
    readonly wgpuskyrenderer_reset: (a: number, b: number) => void;
    readonly wgpuskyrenderer_resize: (a: number, b: number, c: number) => void;
    readonly wgpuskyrenderer_set_lines: (a: number, b: number, c: number, d: number) => void;
    readonly wgpuskyrenderer_set_stars: (a: number, b: number, c: number, d: number) => void;
    readonly wgpuskyrenderer_tick: (a: number, b: number) => void;
    readonly wgpuskyrenderer_zoom: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_1064: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_1095: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export5: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
