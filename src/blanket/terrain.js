// The hill's shape, in JavaScript for physics and GLSL for the ground and grass.
// A steep central hill sits in a valley with a rising rim, so a roll never runs out of world.
export const WORLD_LIMIT = 128;

// Phase 2 is desert dunes. From phase 3 it is snowy peaks, each with its own steepness.
// Phase 4 is the green hill again, in the rain. Rain only changes colours, not the shape.
// `snow` and `sand` are 0 or 1, and at most one is on. The shaders read them as uSnow and uSand.
export const terrain = { snow: 0, sand: 0 };

// [x, z, height, spread]. A smaller spread makes a steeper peak.
export const SNOW_PEAKS = [
  [0, 0, 34, 640],
  [44, -28, 22, 170],
  [-38, 32, 15, 1500],
  [-30, -46, 26, 380],
  [36, 44, 11, 240],
];

const peak = (x, z, [px, pz, h, spread]) => h * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / spread);

// Wide dune swells, two crossing sets of wavy ridges, and one long steep dune.
function dunes(x, z, r) {
  const ridge = (v) => (0.5 + 0.5 * Math.sin(v)) ** 3;
  return 22 * Math.exp(-(r * r) / 1800)
    + 5.5 * ridge(x * 0.075 + z * 0.03 + 2.2 * Math.sin(z * 0.03))
    + 3.5 * ridge(z * 0.11 - x * 0.05 + 1.5 * Math.sin(x * 0.045))
    + 14 * Math.exp(-((x - 42) ** 2) / 90 - ((z + 18) ** 2) / 900);
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const rim = Math.min(Math.max(r - 66, 0), 62); // Levels off so the sky stays visible.
  let hill = 30 * Math.exp(-(r * r) / 1296);
  if (terrain.snow > 0) {
    let snowy = 0;
    for (const p of SNOW_PEAKS) snowy += peak(x, z, p);
    hill += (snowy - hill) * terrain.snow;
  }
  if (terrain.sand > 0) hill += (dunes(x, z, r) - hill) * terrain.sand;
  return hill
    + rim * rim * 0.006
    + 1.6 * Math.sin(x * 0.085 + 1.2) * Math.cos(z * 0.07)
    + 0.7 * Math.sin(x * 0.19 + z * 0.13);
}

/** Slope along x and z. */
export function slopeAt(x, z, out = { x: 0, z: 0 }) {
  const e = 0.25;
  out.x = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  out.z = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return out;
}

const f = (v) => v.toFixed(1);
const SNOW_GLSL = SNOW_PEAKS.map(([x, z, h, s]) => `${f(h)} * exp(-dot(p - vec2(${f(x)}, ${f(z)}), p - vec2(${f(x)}, ${f(z)})) / ${f(s)})`).join('\n      + ');

export const HILL_GLSL = /* glsl */ `
  uniform float uSnow, uSand, uRain;

  float duneRidge(float v) { return pow(0.5 + 0.5 * sin(v), 3.0); }

  float hillHeight(vec2 p) {
    float r = length(p);
    float rim = clamp(r - 66.0, 0.0, 62.0);
    float green = 30.0 * exp(-(r * r) / 1296.0);
    float snowy = ${SNOW_GLSL};
    float sandy = 22.0 * exp(-(r * r) / 1800.0)
      + 5.5 * duneRidge(p.x * 0.075 + p.y * 0.03 + 2.2 * sin(p.y * 0.03))
      + 3.5 * duneRidge(p.y * 0.11 - p.x * 0.05 + 1.5 * sin(p.x * 0.045))
      + 14.0 * exp(-pow(p.x - 42.0, 2.0) / 90.0 - pow(p.y + 18.0, 2.0) / 900.0);
    return mix(mix(green, snowy, uSnow), sandy, uSand)
      + rim * rim * 0.006
      + 1.6 * sin(p.x * 0.085 + 1.2) * cos(p.y * 0.07)
      + 0.7 * sin(p.x * 0.19 + p.y * 0.13);
  }

  vec3 hillNormal(vec2 p) {
    float e = 0.6;
    float dx = (hillHeight(p + vec2(e, 0.0)) - hillHeight(p - vec2(e, 0.0))) / (2.0 * e);
    float dz = (hillHeight(p + vec2(0.0, e)) - hillHeight(p - vec2(0.0, e))) / (2.0 * e);
    return normalize(vec3(-dx, 1.0, -dz));
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float softNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float patchAt(vec2 p) {
    return softNoise(p * 0.045) * 0.6 + softNoise(p * 0.13 + 7.0) * 0.3 + softNoise(p * 0.41 + 3.0) * 0.1;
  }

  // Display colours sampled from the grass reference, written directly.
  vec3 grassTone(vec2 p, vec3 n) {
    float k = patchAt(p);
    vec3 c = mix(vec3(0.373, 0.478, 0.200), vec3(0.427, 0.522, 0.216), smoothstep(0.25, 0.5, k));
    c = mix(c, vec3(0.525, 0.573, 0.290), smoothstep(0.5, 0.78, k));
    return c * (0.84 + 0.24 * max(dot(n, normalize(vec3(0.45, 0.8, -0.35))), 0.0));
  }

  // Blue-white snow, with grey rock showing on the steepest slopes.
  vec3 snowTone(vec2 p, vec3 n) {
    float k = patchAt(p);
    float light = max(dot(n, normalize(vec3(0.45, 0.8, -0.35))), 0.0);
    vec3 c = mix(vec3(0.722, 0.792, 0.859), vec3(0.906, 0.937, 0.961), smoothstep(0.2, 0.75, light + (k - 0.5) * 0.3));
    c = mix(c, vec3(0.973, 0.980, 0.988), smoothstep(0.8, 0.95, light));
    float rock = smoothstep(0.74, 0.66, n.y) * smoothstep(0.45, 0.6, k);
    return mix(c, vec3(0.416, 0.443, 0.494), rock);
  }

  // Warm sand with wind ripples, and darker sandstone on the steepest faces.
  vec3 sandTone(vec2 p, vec3 n) {
    float k = patchAt(p);
    float light = max(dot(n, normalize(vec3(0.45, 0.8, -0.35))), 0.0);
    vec3 c = mix(vec3(0.788, 0.604, 0.345), vec3(0.910, 0.788, 0.541), smoothstep(0.25, 0.8, light + (k - 0.5) * 0.35));
    float ripple = sin(dot(p, vec2(0.82, 0.57)) * 2.4 + softNoise(p * 0.18) * 5.0);
    c = mix(c, vec3(0.949, 0.863, 0.651), smoothstep(0.55, 0.8, ripple) * smoothstep(0.35, 0.7, light));
    float stone = smoothstep(0.72, 0.62, n.y) * smoothstep(0.4, 0.6, k);
    return mix(c, vec3(0.690, 0.498, 0.271), stone);
  }

  vec3 groundTone(vec2 p, vec3 n) {
    if (uSand >= 1.0) return sandTone(p, n);
    if (uSnow >= 1.0) return snowTone(p, n);
    if (uRain >= 1.0) {
      // Rain-soaked grass: deeper and darker, with a wet sheen where the light catches it.
      vec3 c = grassTone(p, n) * vec3(0.8, 0.9, 0.8);
      float sheen = smoothstep(0.86, 0.97, max(dot(n, normalize(vec3(0.45, 0.8, -0.35))), 0.0)) * smoothstep(0.55, 0.75, patchAt(p * 1.7));
      return mix(c, vec3(0.478, 0.561, 0.400), sheen * 0.7);
    }
    if (uSnow <= 0.0) return grassTone(p, n);
    return mix(grassTone(p, n), snowTone(p, n), uSnow);
  }

  // The pixel pass expects linear colour, and these tones are written as display colour.
  vec4 toLinear(vec3 c) { return vec4(pow(c, vec3(2.2)), 1.0); }

  vec3 addHaze(vec3 c, float dist) {
    vec3 haze = mix(mix(vec3(0.435, 0.470, 0.240), vec3(0.769, 0.827, 0.875), uSnow), vec3(0.902, 0.827, 0.659), uSand);
    haze = mix(haze, vec3(0.490, 0.541, 0.471), uRain);
    return mix(c, haze, smoothstep(70.0, 210.0, dist) * 0.85);
  }
`;
