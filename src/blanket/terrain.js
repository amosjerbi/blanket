// The hill's shape, in JavaScript for physics and GLSL for the ground and grass.
// A steep central hill sits in a valley with a rising rim, so a roll never runs out of world.
export const WORLD_LIMIT = 128;

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const rim = Math.min(Math.max(r - 66, 0), 62); // Levels off so the sky stays visible.
  return 30 * Math.exp(-(r * r) / 1296)
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

export const HILL_GLSL = /* glsl */ `
  float hillHeight(vec2 p) {
    float r = length(p);
    float rim = clamp(r - 66.0, 0.0, 62.0);
    return 30.0 * exp(-(r * r) / 1296.0)
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
  vec3 groundTone(vec2 p, vec3 n) {
    float k = patchAt(p);
    vec3 c = mix(vec3(0.373, 0.478, 0.200), vec3(0.427, 0.522, 0.216), smoothstep(0.25, 0.5, k));
    c = mix(c, vec3(0.525, 0.573, 0.290), smoothstep(0.5, 0.78, k));
    return c * (0.84 + 0.24 * max(dot(n, normalize(vec3(0.45, 0.8, -0.35))), 0.0));
  }

  // The pixel pass expects linear colour, and these tones are written as display colour.
  vec4 toLinear(vec3 c) { return vec4(pow(c, vec3(2.2)), 1.0); }

  vec3 addHaze(vec3 c, float dist) {
    return mix(c, vec3(0.435, 0.470, 0.240), smoothstep(70.0, 210.0, dist) * 0.85);
  }
`;
