// Ceremony → essence: strands of Effect TypeScript tangle on the left and resolve into one beam.
import { hash2 } from "@vgpu/wgsl-std/hash";

struct Params {
  resolution: vec2f,
  pointer: vec2f,
  time: f32,
  tangle: f32,
  beamY: f32,
  converge: f32,
  textScale: f32,
  intro: f32,
  // the bottom of the copy, as a fraction of the height: strands on the left stay below it
  clear: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var sheet: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

const TAU: f32 = 6.2831853;
const STRANDS: i32 = 32;
const LOOPS: i32 = 18;

struct Hit { line: f32, near: f32, signed: f32, k: f32, u: f32 }

// the zone where strands are still ceremony: glyphs and beads, fading into one clean line
fn glyphZoneAt(t: f32, conv: f32) -> f32 {
  return 1.0 - smoothstep(conv * 0.45, conv * 0.9, t);
}

// a strand's light at a distance in device pixels: width and brightness vary per strand for depth
fn core(dPx: f32, width: f32, bright: f32) -> f32 {
  return (exp(-(dPx * dPx) / (0.9 * width * width)) * 0.5 / width + exp(-dPx / (7.0 * width)) * 0.06) * bright;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let h = res.y;
  let aspect = res.x / res.y;
  let frag = uv * res;
  var p = vec2f(uv.x * aspect, uv.y);
  let t = uv.x;
  let conv = params.converge;
  let time = params.time;

  // the envelope: 1 at the left edge, 0 where the strands converge
  let ramp = clamp(1.0 - t / conv, 0.0, 1.0);
  let env = pow(ramp, 1.6) * params.tangle;
  let denv = select(0.0, -1.6 / conv * pow(ramp, 0.6), t < conv) * params.tangle;

  // the pointer stirs the tangle
  let m = vec2f(params.pointer.x / h, params.pointer.y / h);
  let v = p - m;
  let fall = exp(-dot(v, v) / 0.014) * env;
  p = p + normalize(v + vec2f(1e-5)) * 0.05 * fall;

  var hit = Hit(0.0, 1e9, 0.0, 0.0, 0.0);
  for (var k = 0; k < STRANDS; k = k + 1) {
    let r = hash2(vec2f(f32(k), 7.0));
    let s = hash2(vec2f(f32(k), 13.0));
    let offset = mix(-0.05, 0.42, r.x);
    let a = mix(0.03, 0.19, r.y);
    let f = mix(1.2, 4.5, s.x) * TAU;
    let ph = s.y * TAU;
    let b = mix(0.015, 0.07, r.x * s.y);
    let g = mix(5.0, 11.0, r.y) * TAU;
    let sp = mix(0.12, 0.3, s.x);
    let w = offset + a * sin(f * t + ph + time * sp) + b * sin(g * t + ph * 1.7 - time * sp * 1.3);
    let dw = a * f * cos(f * t + ph + time * sp) + b * g * cos(g * t + ph * 1.7 - time * sp * 1.3);
    let y = params.beamY + env * w;
    let slope = (denv * w + env * dw) / aspect;
    let signed = (p.y - y) / sqrt(1.0 + slope * slope) * h;
    let d = abs(signed);
    let depth = hash2(vec2f(f32(k), 17.0));
    let bead = 0.18 + 1.7 * pow(0.5 + 0.5 * cos((frag.x - time * 40.0 * sp) * 0.75), 12.0);
    let beaded = mix(1.0, bead, glyphZoneAt(t, conv));
    hit.line = hit.line + core(d, mix(0.9, 2.2, depth.x * depth.x), mix(0.6, 1.5, depth.y)) * beaded;
    if (d < hit.near) { hit.near = d; hit.signed = signed; hit.k = f32(k); hit.u = frag.x; }
  }

  // curls in the knot: rotating ellipses, strongest at the far left
  for (var k = 0; k < LOOPS; k = k + 1) {
    let r = hash2(vec2f(f32(k), 29.0));
    let s = hash2(vec2f(f32(k), 31.0));
    let c = vec2f(mix(-0.05, 0.55, r.x) * aspect * conv, mix(0.66, 1.02, r.y));
    let rad = vec2f(mix(0.05, 0.17, s.x), mix(0.03, 0.11, s.y));
    let ang = time * mix(-0.08, 0.08, s.x) + r.y * TAU;
    let q = p - c;
    let rq = vec2f(q.x * cos(ang) + q.y * sin(ang), -q.x * sin(ang) + q.y * cos(ang));
    let e = length(rq / rad);
    let signed = (e - 1.0) * min(rad.x, rad.y) * h;
    let d = abs(signed);
    let weight = pow(clamp(1.0 - (c.x / aspect) / conv, 0.0, 1.0), 0.8) * params.tangle;
    hit.line = hit.line + core(d, mix(0.9, 1.8, s.y), 0.8) * weight;
    let dw = d + (1.0 - weight) * 40.0;
    if (dw < hit.near) {
      hit.near = dw; hit.signed = signed; hit.k = f32(STRANDS + k);
      hit.u = (atan2(rq.y / rad.y, rq.x / rad.x) + 3.14159) * (rad.x + rad.y) * 0.5 * h;
    }
  }

  // the strands are made of the ceremony itself: Effect TypeScript, drifting
  // each strand reads its own line of the sheet, so the glyphs bend with it
  let dims = vec2f(textureDimensions(sheet));
  let rows = floor(dims.y / 20.0);
  let row = hit.k - floor(hit.k / rows) * rows;
  let speed = 16.0 + hash2(vec2f(hit.k, 3.0)).x * 22.0;
  let sheetPx = vec2f(hit.u / params.textScale + time * speed + hit.k * 137.0, row * 20.0 + 10.0 + hit.signed / params.textScale);
  let glyph = textureSampleLevel(sheet, samp, sheetPx / dims, 0.0).r;
  let carries = step(0.2, hash2(vec2f(hit.k, 5.0)).x);
  let glyphZone = glyphZoneAt(t, conv);
  let band = smoothstep(8.0 * params.textScale, 5.0 * params.textScale, hit.near) * carries;

  // one beam from the convergence point to the right edge
  let dBeam = abs(uv.y - params.beamY) * h;
  let beamOn = smoothstep(conv - 0.14, conv + 0.03, t);
  let beam = (exp(-(dBeam * dBeam) / 1.4) * 1.5 + exp(-dBeam / 16.0) * 0.22 + exp(-dBeam / 90.0) * 0.05) * beamOn;
  let cp = vec2f(conv * aspect, params.beamY);
  let flare = exp(-length((p - cp) * vec2f(0.35, 1.0)) * h / 70.0) * 0.35;

  var lum = hit.line * mix(1.0, 0.75, glyphZone) + band * glyph * glyphZone * 2.1 + beam + flare;

  // dust in the light
  let cell = floor(frag / 3.0);
  let dust = hash2(cell + vec2f(floor(time * 0.6), 3.0));
  let nearBeam = exp(-dBeam / 140.0) * beamOn;
  lum = lum + step(0.9988, dust.x) * dust.y * (0.25 + nearBeam * 0.9);

  // the copy owns the space above `clear` on the left half; strands fade in just below it
  let below = smoothstep(params.clear - 0.01, params.clear + 0.11, uv.y);
  lum = lum * mix(1.0, below, 1.0 - smoothstep(0.42, 0.62, t));

  // the reveal draws the field in from the left
  let reveal = smoothstep(params.intro * 1.25 - 0.25, params.intro * 1.25, t);
  lum = lum * (1.0 - reveal);

  var col = 1.0 - exp(-lum * 1.15);
  let grain = hash2(frag + vec2f(fract(time) * 97.0, 1.0)).x - 0.5;
  col = col + grain * 0.03;
  let ink = vec3f(0.035, 0.035, 0.043);
  return vec4f(max(ink + vec3f(col), vec3f(0.0)), 1.0);
}
