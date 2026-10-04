// retry with an exponential schedule: two attempts fail at the gate, each wait twice as long as the
// last, and the third gets through. Failures flash in the Fail signal, the success turns Pass
// (ADR-0078).
struct Params {
  resolution: vec2f,
  time: f32,
  pad: f32,
  passColor: vec4f,
  failColor: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;

const LOOP: f32 = 7.0;
const START: f32 = 0.08;
const GATE: f32 = 0.6;
const RAIL: f32 = 0.42;
const TRAVEL: f32 = 0.09;

fn attemptAt(n: i32) -> f32 {
  // attempts start after waits of 1, 2 and 4 units
  if (n == 0) { return 0.02; }
  if (n == 1) { return 0.02 + TRAVEL + 0.08; }
  return 0.02 + TRAVEL * 2.0 + 0.08 + 0.16;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let aspect = res.x / res.y;
  let phase = fract(params.time / LOOP);
  let x = uv.x;
  let y = uv.y;
  var lum = 0.0;
  var ok = 0.0;
  var bad = 0.0;

  let open = smoothstep(attemptAt(2) + TRAVEL * 0.9, attemptAt(2) + TRAVEL * 1.1, phase);
  // the rail and the gate
  let dRail = abs(y - RAIL) * res.y;
  lum = lum + (exp(-(dRail * dRail) / 1.2) * 0.22 + exp(-dRail / 6.0) * 0.03) * step(START, x);
  let dGate = abs(x - GATE) * res.x;
  let gateBand = step(abs(y - RAIL), 0.16);
  lum = lum + exp(-(dGate * dGate) / 3.0) * 0.9 * gateBand * (1.0 - open);

  for (var n = 0; n < 3; n = n + 1) {
    let t0 = attemptAt(n);
    let local = (phase - t0) / TRAVEL;
    if (local < 0.0) { continue; }
    let succeeds = n == 2;
    var head = mix(START, GATE, clamp(local, 0.0, 1.0));
    var fade = 1.0;
    if (succeeds && local > 1.0) {
      head = GATE + (local - 1.0) * (GATE - START);
    } else if (!succeeds) {
      fade = 1.0 - smoothstep(1.0, 1.6, local);
    }
    let hd = length(vec2f((x - head) * aspect, y - RAIL)) * res.y;
    let behind = head - x;
    let trail = select(0.0, exp(-behind * 16.0), behind >= 0.0 && x > START) * exp(-(dRail * dRail) / 5.0);
    // a failed attempt flashes at the gate
    let flash = select(0.0, exp(-length(vec2f((x - GATE) * aspect, y - RAIL)) * res.y / 10.0) * (1.0 - smoothstep(1.0, 1.5, local)) * step(1.0, local), !succeeds);
    let pulse = (exp(-hd / 4.0) * 1.4 + trail * 0.8) * fade;
    if (succeeds && local > 1.0) {
      ok = ok + pulse;
    } else {
      lum = lum + pulse;
    }
    bad = bad + flash * 1.1;
  }

  // the schedule: ticks spaced 1, 2, 4 on a time axis below the rail
  let axis = 0.74;
  let dAxis = abs(y - axis) * res.y;
  lum = lum + exp(-(dAxis * dAxis) / 0.8) * 0.12 * step(START, x) * step(x, 0.92);
  for (var n = 0; n < 3; n = n + 1) {
    let tx = START + (attemptAt(n) - 0.02) * 1.6;
    let lit = smoothstep(attemptAt(n), attemptAt(n) + 0.02, phase);
    let dTick = abs(x - tx) * res.x;
    let tick = exp(-(dTick * dTick) / 1.5) * step(abs(y - axis), 0.035);
    lum = lum + tick * mix(0.25, 1.0, lit);
  }

  let ink = vec3f(0.094, 0.094, 0.102);
  let white = vec3f(1.0 - exp(-lum * 1.3));
  let col = min(white + params.passColor.rgb * (1.0 - exp(-ok * 1.3)) + params.failColor.rgb * (1.0 - exp(-bad * 1.3)), vec3f(1.0));
  return vec4f(ink + col * (1.0 - ink), 1.0);
}
