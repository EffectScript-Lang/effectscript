// Structured concurrency: one fiber forks into five, each finishes in its own time, and the parent
// resumes only when every child has joined.
struct Params {
  resolution: vec2f,
  time: f32,
  lanes: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

const FORK: f32 = 0.16;
const JOIN: f32 = 0.84;
const LOOP: f32 = 6.0;

fn laneOffset(i: f32, lanes: f32) -> f32 {
  return (i - (lanes - 1.0) * 0.5) / max(lanes - 1.0, 1.0) * 0.62;
}

fn spread(x: f32) -> f32 {
  return smoothstep(FORK, FORK + 0.16, x) * (1.0 - smoothstep(JOIN - 0.16, JOIN, x));
}

fn spreadSlope(x: f32) -> f32 {
  let e = 0.002;
  return (spread(x + e) - spread(x - e)) / (2.0 * e);
}

fn duration(i: f32) -> f32 {
  return 0.3 + fract(sin(i * 12.9898 + 4.1) * 43758.5453) * 0.32;
}

fn glowLine(dPx: f32) -> f32 {
  return exp(-(dPx * dPx) / 1.2) * 0.5 + exp(-dPx / 5.0) * 0.08;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let aspect = res.x / res.y;
  let x = uv.x;
  let y = uv.y;
  let phase = fract(params.time / LOOP);
  let lanes = params.lanes;

  // timeline: the parent runs to the fork, the children run, the parent resumes after the last join
  let toFork = clamp(phase / 0.12, 0.0, 1.0);
  var lastDone = 0.0;
  for (var k = 0; k < 8; k = k + 1) {
    if (f32(k) >= lanes) { break; }
    lastDone = max(lastDone, 0.12 + duration(f32(k)));
  }
  let resume = clamp((phase - lastDone) / 0.14, 0.0, 1.0);

  var lum = 0.0;
  // the parent's line before the fork and after the join
  let dParent = abs(y - 0.5) * res.y;
  let outside = 1.0 - smoothstep(FORK, FORK + 0.02, x) + smoothstep(JOIN - 0.02, JOIN, x);
  lum = lum + glowLine(dParent) * 0.35 * outside;
  let headIn = mix(0.0, FORK, toFork) * step(phase, 0.12 + 0.001) + FORK * step(0.12, phase) * step(phase, 0.13);
  let headOut = mix(JOIN, 1.05, resume);
  let parentHead = select(headIn, headOut, phase > lastDone);
  let pd = length(vec2f((x - parentHead) * aspect, y - 0.5)) * res.y;
  let parentVisible = select(1.0, step(0.001, resume), phase > lastDone) * step(phase, 0.12 + 0.001) + step(lastDone, phase) * step(0.001, resume);
  lum = lum + exp(-pd / 5.0) * 1.4 * parentVisible;

  for (var k = 0; k < 8; k = k + 1) {
    let i = f32(k);
    if (i >= lanes) { break; }
    let off = laneOffset(i, lanes);
    let ly = 0.5 + off * spread(x);
    let slope = off * spreadSlope(x) / aspect;
    let d = abs(y - ly) / sqrt(1.0 + slope * slope) * res.y;
    let inside = smoothstep(FORK, FORK + 0.01, x) * (1.0 - smoothstep(JOIN - 0.01, JOIN, x));
    lum = lum + glowLine(d) * 0.28 * inside;
    // the child's pulse, with a short trail
    let progress = clamp((phase - 0.12) / duration(i), 0.0, 1.0);
    let head = mix(FORK, JOIN, progress);
    let running = step(0.12, phase) * step(phase, lastDone + 0.001);
    let behind = head - x;
    let trail = select(0.0, exp(-behind * 14.0), behind >= 0.0 && x > FORK);
    let near = exp(-(d * d) / 6.0);
    let headGlow = exp(-length(vec2f((x - head) * aspect, y - (0.5 + off * spread(head)))) * res.y / 4.0);
    lum = lum + (trail * near * 0.9 + headGlow * 1.3) * running;
  }
  // the join glows while it waits for the last child
  let waiting = step(0.12, phase) * step(phase, lastDone);
  let jd = length(vec2f((x - JOIN) * aspect, y - 0.5)) * res.y;
  lum = lum + exp(-jd / 9.0) * 0.5 * waiting;

  let col = 1.0 - exp(-lum * 1.3);
  let ink = vec3f(0.094, 0.094, 0.102);
  return vec4f(ink + vec3f(col) * (1.0 - ink), 1.0);
}
