// Effect<A, E, R>: what an effect succeeds with, how it can fail and what it needs travel as three
// signal-coloured rails (ADR-0078) that merge into one line, the one type that carries all three.
struct Params {
  resolution: vec2f,
  time: f32,
  merge: f32,
  passColor: vec4f,
  failColor: vec4f,
  needColor: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;

const COUNT: i32 = 9;

fn railY(start: f32, x: f32, merge: f32) -> f32 {
  return mix(start, 0.5, smoothstep(merge - 0.34, merge, x));
}

fn line(dPx: f32) -> f32 {
  return exp(-(dPx * dPx) / 1.3) * 0.32 + exp(-dPx / 7.0) * 0.035;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let aspect = res.x / res.y;
  let x = uv.x;
  let y = uv.y;
  let merge = params.merge;
  var light = vec3f(0.0);
  var white = 0.0;

  let starts = array<f32, 3>(0.22, 0.5, 0.78);
  let colours = array<vec3f, 3>(params.passColor.rgb, params.failColor.rgb, params.needColor.rgb);
  for (var i = 0; i < 3; i = i + 1) {
    let start = starts[i];
    let colour = colours[i];
    let ry = railY(start, x, merge);
    let slope = (railY(start, x + 0.002, merge) - railY(start, x - 0.002, merge)) / 0.004 / aspect;
    let d = abs(y - ry) / sqrt(1.0 + slope * slope) * res.y;
    light = light + colour * line(d) * (1.0 - step(merge, x));
    // values travel along the rail and become part of one type at the merge
    for (var k = 0; k < COUNT; k = k + 1) {
      let phase = fract(params.time * 0.055 + f32(k) / f32(COUNT) + f32(i) * 0.037);
      let px = phase * 1.12 - 0.06;
      let py = select(railY(start, px, merge), 0.5, px >= merge);
      let pd = length(vec2f((x - px) * aspect, y - py)) * res.y;
      let behind = px - x;
      let trail = select(0.0, exp(-behind * 26.0), behind >= 0.0) * exp(-(d * d) / 5.0);
      let glow = exp(-pd / 3.4) * 1.3 + trail * 0.45;
      if (px < merge) {
        light = light + colour * glow;
      } else {
        white = white + glow * 0.8;
      }
    }
  }
  // the one line after the merge, and its flare
  let dOne = abs(y - 0.5) * res.y;
  white = white + (exp(-(dOne * dOne) / 1.6) * 0.9 + exp(-dOne / 12.0) * 0.12) * step(merge, x);
  let flare = exp(-length(vec2f((x - merge) * aspect, y - 0.5)) * res.y / 26.0) * 0.6;
  white = white + flare;

  let ink = vec3f(0.035, 0.035, 0.043);
  let col = min(vec3f(1.0 - exp(-white * 1.3)) + (vec3f(1.0) - exp(-light * 1.3)), vec3f(1.0));
  return vec4f(ink + col * (1.0 - ink), 1.0);
}
