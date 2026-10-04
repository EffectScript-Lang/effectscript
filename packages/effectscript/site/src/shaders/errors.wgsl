// Typed errors: values flow along one line, and the failures leave on a rail of their own, so the
// type says what can go wrong. Success is the Pass signal, failure the Fail signal (ADR-0078).
import { hash2 } from "@vgpu/wgsl-std/hash";

struct Params {
  resolution: vec2f,
  time: f32,
  pad: f32,
  passColor: vec4f,
  failColor: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;

const OK_Y: f32 = 0.36;
const ERR_Y: f32 = 0.7;
const SPLIT: f32 = 0.38;
const COUNT: i32 = 22;

fn errorRail(x: f32) -> f32 {
  return mix(OK_Y, ERR_Y, smoothstep(SPLIT, SPLIT + 0.2, x));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let aspect = res.x / res.y;
  let x = uv.x;
  let y = uv.y;
  var lum = 0.0;
  var ok = 0.0;
  var bad = 0.0;

  // the success rail: solid
  let dOk = abs(y - OK_Y) * res.y;
  ok = ok + exp(-(dOk * dOk) / 1.2) * 0.25 + exp(-dOk / 6.0) * 0.03;
  // the error rail: dashed, leaving at the split
  let ey = errorRail(x);
  let slope = (errorRail(x + 0.002) - errorRail(x - 0.002)) / 0.004 / aspect;
  let dErr = abs(y - ey) / sqrt(1.0 + slope * slope) * res.y;
  let dash = step(0.45, fract(x * 46.0));
  bad = bad + exp(-(dErr * dErr) / 1.0) * 0.3 * dash * step(SPLIT, x);

  for (var k = 0; k < COUNT; k = k + 1) {
    let i = f32(k);
    let speed = 0.085;
    let cycle = params.time * speed + i / f32(COUNT);
    let px = fract(cycle) * 1.15 - 0.05;
    let fails = hash2(vec2f(i, floor(cycle))).x < 0.24;
    let py = select(OK_Y, errorRail(px), fails);
    let d = length(vec2f((x - px) * aspect, y - py)) * res.y;
    let behind = px - x;
    let rail = select(OK_Y, errorRail(x), fails);
    let trail = select(0.0, exp(-behind * 30.0), behind >= 0.0) * exp(-pow(abs(y - rail) * res.y, 2.0) / 4.0);
    let light = exp(-d / 3.2) * 1.3 + trail * 0.5;
    // a value is white until it reaches the split, then takes its rail's signal
    let decided = smoothstep(SPLIT - 0.02, SPLIT + 0.06, px);
    if (fails) {
      bad = bad + light * decided;
    } else {
      ok = ok + light * decided;
    }
    lum = lum + light * (1.0 - decided);
  }

  let ink = vec3f(0.094, 0.094, 0.102);
  let white = vec3f(1.0 - exp(-lum * 1.3));
  let passLight = params.passColor.rgb * (1.0 - exp(-ok * 1.3));
  let failLight = params.failColor.rgb * (1.0 - exp(-bad * 1.3));
  let col = min(white + passLight + failLight, vec3f(1.0));
  return vec4f(ink + col * (1.0 - ink), 1.0);
}
