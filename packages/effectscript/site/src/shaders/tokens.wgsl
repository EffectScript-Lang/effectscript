// The token count, drawn: one cell per o200k_base token of the Effect TypeScript. The cells the
// EffectScript still needs are lit; the ceremony it drops stays visible as unlit ghost cells.
struct Params {
  resolution: vec2f,
  before: f32,
  after: f32,
  time: f32,
  progress: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let aspect = res.x / res.y;
  let cols = ceil(sqrt(params.before * aspect));
  let rows = ceil(params.before / cols);
  let cellW = res.x / cols;
  let cellH = res.y / rows;
  let frag = uv * res;
  let cell = floor(vec2f(frag.x / cellW, frag.y / cellH));
  let index = cell.y * cols + cell.x;
  let local = (frag - cell * vec2f(cellW, cellH)) / vec2f(cellW, cellH);

  let inset = 0.16;
  let q = abs(local - 0.5) * 2.0;
  let box = max(q.x, q.y);
  let fill = 1.0 - smoothstep(1.0 - inset * 2.0 - 0.08, 1.0 - inset * 2.0, box);
  let ring = smoothstep(1.0 - inset * 2.0 - 0.1, 1.0 - inset * 2.0, box) * (1.0 - smoothstep(1.0 - inset * 2.0 + 0.06, 1.0 - inset * 2.0 + 0.16, box));

  var lum = 0.0;
  if (index < params.before) {
    let shown = index < params.after * params.progress;
    let shimmer = 0.85 + 0.15 * sin(params.time * 1.7 + index * 0.37);
    if (shown) {
      lum = fill * 0.92 * shimmer;
    } else if (index >= params.after) {
      lum = ring * 0.22;
    } else {
      lum = ring * 0.1;
    }
  }
  let ink = vec3f(0.035, 0.035, 0.043);
  return vec4f(ink + vec3f(lum) * (1.0 - ink), 1.0);
}
