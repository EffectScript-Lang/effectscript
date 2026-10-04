// Lockstep: two dials, Effect's and EffectScript's, turning one notch at a time and never apart.
struct Params {
  resolution: vec2f,
  time: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

const TAU: f32 = 6.2831853;

fn ticks(angle: f32, count: f32, width: f32) -> f32 {
  let a = fract(angle / TAU * count + 0.5) - 0.5;
  return exp(-(a * a) / (width * width));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let frag = uv * res;
  let center = res * 0.5;
  let p = (frag - center) / (min(res.x, res.y) * 0.5);
  let r = length(p);
  // one notch per second, eased, both dials together
  let step_ = floor(params.time);
  let ease = smoothstep(0.0, 0.35, fract(params.time));
  let turn = (step_ + ease) * TAU / 60.0;
  let angle = atan2(p.x, -p.y) - turn;

  let px = 1.0 / (min(res.x, res.y) * 0.5);
  var lum = 0.0;
  // outer dial: Effect
  let outer = 0.92;
  lum = lum + exp(-pow((r - outer) / (px * 1.0), 2.0)) * 0.35;
  let outerTick = ticks(angle, 60.0, 0.06) * step(outer - 0.06, r) * step(r, outer - 0.015);
  let outerMajor = ticks(angle, 12.0, 0.012) * step(outer - 0.12, r) * step(r, outer - 0.015);
  lum = lum + outerTick * 0.4 + outerMajor * 0.9;
  // inner dial: EffectScript
  let inner = 0.64;
  lum = lum + exp(-pow((r - inner) / (px * 1.0), 2.0)) * 0.35;
  let innerTick = ticks(angle, 60.0, 0.06) * step(inner + 0.015, r) * step(r, inner + 0.06);
  let innerMajor = ticks(angle, 12.0, 0.012) * step(inner + 0.015, r) * step(r, inner + 0.12);
  lum = lum + innerTick * 0.4 + innerMajor * 0.9;
  // the lock: faint radial lines joining the major ticks of both dials
  let spoke = ticks(angle, 12.0, 0.006) * step(inner + 0.12, r) * step(r, outer - 0.12);
  lum = lum + spoke * 0.12;
  // the index at the top, fixed
  let a0 = atan2(p.x, -p.y);
  let index = exp(-pow(a0 / 0.012, 2.0)) * step(outer + 0.02, r) * step(r, outer + 0.07);
  lum = lum + index * 1.2;

  let col = 1.0 - exp(-lum * 1.4);
  let ink = vec3f(0.035, 0.035, 0.043);
  return vec4f(ink + vec3f(col) * (1.0 - ink), 1.0);
}
