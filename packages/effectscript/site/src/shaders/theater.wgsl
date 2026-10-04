// The film room: one raking beam of light with dust drifting through it, as in the film's stills.
import { hash2 } from "@vgpu/wgsl-std/hash";

struct Params {
  resolution: vec2f,
  time: f32,
  intensity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn dustLayer(frag: vec2f, cellSize: f32, drift: vec2f, seed: f32) -> f32 {
  let p = frag + drift;
  let cell = floor(p / cellSize);
  let h = hash2(cell + vec2f(seed, seed * 1.7));
  let center = (cell + 0.2 + h * 0.6) * cellSize;
  let d = length(p - center);
  let size = mix(0.6, 1.8, h.y) * cellSize / 40.0;
  return step(0.82, h.x) * exp(-(d * d) / (size * size)) * mix(0.4, 1.0, h.y);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  let frag = uv * res;
  let time = params.time;

  // the beam comes from above the upper-left corner and rakes down to the right
  let source = vec2f(-0.18, -0.35) * res;
  let dir = normalize(vec2f(0.62, 0.78));
  let rel = frag - source;
  let along = dot(rel, dir);
  let across = abs(rel.x * dir.y - rel.y * dir.x);
  let width = along * 0.16 + 30.0;
  let cone = exp(-(across * across) / (width * width)) * smoothstep(0.0, res.y * 0.6, along);
  let falloff = 1.0 / (1.0 + along / (res.y * 1.6));
  let flicker = 0.94 + 0.06 * sin(time * 1.3) * sin(time * 0.71 + 1.0);
  var lum = cone * falloff * 0.42 * flicker;

  // dust: three layers drifting at different speeds, lit only inside the beam
  let d1 = dustLayer(frag, 46.0, vec2f(time * 6.0, -time * 4.0), 1.0);
  let d2 = dustLayer(frag, 28.0, vec2f(time * 3.5, -time * 2.2), 7.0);
  let d3 = dustLayer(frag, 17.0, vec2f(time * 1.8, -time * 1.1), 13.0);
  lum = lum + (d1 * 1.0 + d2 * 0.7 + d3 * 0.45) * (cone * 1.6 + 0.04);

  lum = lum * params.intensity;
  let grain = hash2(frag + vec2f(fract(time) * 61.0, 2.0)).x - 0.5;
  let col = 1.0 - exp(-lum * 1.2) + grain * 0.025;
  let ink = vec3f(0.035, 0.035, 0.043);
  return vec4f(max(ink + vec3f(col), vec3f(0.0)), 1.0);
}
