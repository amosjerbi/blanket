// Low-resolution render pipeline: one small palette, a touch of dither and hard outlines.
import * as THREE from 'three';
import { CHARACTERS } from '../characters.js';
import { COLORS } from '../characterSchema.js';
import { BURNERS } from '../config.js';

export const HERO_LAYER = 1;
export const LANE_LAYER = 2;
// The whole game's colours. Keep this list short.
const SKY = '#93c7f8';
const HAZE = '#a1c4de';
const CLOUD = '#f0ece6';
const WHITE = '#fbf7f0';
const SIDE_GROUND = '#8fd23c';
const GROUND_SHADE = '#66a832';
const NORI_DARK = '#131d19';
const NORI = '#1f2f28';
const NORI_LIGHT = '#263830';
const NORI_SEAM = '#4a5f52';
const INK = '#262418';
const RED = '#d9593f';
const YELLOW = '#f2c14e';
const BARK = '#5b3a26';
const BLOSSOM = '#e9919c';
const PETAL = '#f6c3c8';
const ORANGE = '#f28a24';
const ORANGE_DARK = '#d96a14';
const LEAF = '#5fa83c';
const LEAF_LIGHT = '#7cc24a';
const AVOCADO_SKIN = '#2f4a24';
const AVOCADO = '#a8c84a';
const AVOCADO_CREAM = '#eef0a0';
const AVOCADO_PIT = '#7a4a28';
const GATE_RED = '#d8342b';
const GATE_DARK = '#2b2320';
const CAT_FUR = '#77737f';
const CAT_DARK = '#565261';
const GRASS_FOG = '#a9cce6';
const MOUNTAIN_NEAR = '#8fb7d8';
const MOUNTAIN_FAR = '#b5d3ea';
const GRASS_FAR = '#a6da7a';
const LEAF_DARK = '#4f9a35';
const CLIFF_TOP = '#e9b968';
const CLIFF_BASE = '#a97c3f';
const WOOD = '#7a5a30';
const STONE = '#b9a88e';
const FLOWER = '#e8503a';
const WATER = '#5bc6fa';
const WATER_LIGHT = '#84d8fc';

const WORLD = [INK, GROUND_SHADE, SIDE_GROUND, GRASS_FAR, GRASS_FOG, MOUNTAIN_NEAR, MOUNTAIN_FAR, LEAF_DARK, CLIFF_TOP, CLIFF_BASE, WOOD, STONE, FLOWER, YELLOW, HAZE, CLOUD, WHITE];
const BASE_ACCENTS = [GATE_RED, GATE_DARK, CAT_FUR, CAT_DARK, WATER, WATER_LIGHT, INK, WHITE, CLOUD, HAZE, SKY, SIDE_GROUND, RED, YELLOW, BARK, BLOSSOM, PETAL, ORANGE, ORANGE_DARK, LEAF, LEAF_LIGHT, AVOCADO_SKIN, AVOCADO, AVOCADO_CREAM, AVOCADO_PIT];

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const glsl = (hex) => `vec3(${rgb(hex).map((v) => v.toFixed(3)).join(', ')})`;
const flat = (list) => new Float32Array(list.flatMap(rgb));

// Character colours join the palette, so custom colours survive the pixel look.
const ACCENT_SLOTS = 72;
function accentData(characters, base = [...BURNERS.flatMap((b) => b.colors), ...BASE_ACCENTS]) {
  const custom = characters.flatMap((c) => COLORS.map(({ key }) => c[key].toLowerCase()));
  const all = [...new Set([...base, ...custom])];
  if (all.length > ACCENT_SLOTS) console.warn(`Palette full: ${all.length - ACCENT_SLOTS} colours dropped`);
  const list = all.slice(0, ACCENT_SLOTS);
  while (list.length < ACCENT_SLOTS) list.push(INK);
  return flat(list);
}

const makeFragmentShader = (palette, drawnSky) => /* glsl */`
  uniform sampler2D tWorld, tHero, tLane, tDepth;
  uniform vec2 res;
  uniform vec3 accents[${ACCENT_SLOTS}];

  const float BAYER[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  const vec3 WORLD[${palette.length}] = vec3[${palette.length}](${palette.map(glsl).join(', ')});
  const vec3 INK = ${glsl(INK)};
  const vec3 NORI_DARK = ${glsl(NORI_DARK)};
  const vec3 NORI = ${glsl(NORI)};
  const vec3 NORI_LIGHT = ${glsl(NORI_LIGHT)};
  const vec3 NORI_SEAM = ${glsl(NORI_SEAM)};
  const vec3 WHITE = ${glsl(WHITE)};
  const vec3 SKY = ${glsl(SKY)};
  const vec3 CLOUD = ${glsl(CLOUD)};
  const vec3 HAZE = ${glsl(HAZE)};

  vec3 srgb(vec3 c) { return pow(max(c, vec3(0.)), vec3(1. / 2.2)); }
  float mask(ivec2 p) {
    return texelFetch(tHero, clamp(p, ivec2(0), ivec2(res) - 1), 0).a;
  }
  float heroLuma(ivec2 p) {
    return dot(srgb(texelFetch(tHero, clamp(p, ivec2(0), ivec2(res) - 1), 0).rgb), vec3(.3, .59, .11));
  }

  vec3 nearestAccent(vec3 c) {
    vec3 best = accents[0];
    float bestD = 9.;
    for (int i = 0; i < ${ACCENT_SLOTS}; i++) {
      vec3 d = c - accents[i];
      float dist = dot(d, d);
      if (dist < bestD) { bestD = dist; best = accents[i]; }
    }
    return best;
  }

  vec3 nearestWorld(vec3 c) {
    vec3 best = WORLD[0];
    float bestD = 9.;
    for (int i = 0; i < ${palette.length}; i++) {
      vec3 d = c - WORLD[i];
      float dist = dot(d, d);
      if (dist < bestD) { bestD = dist; best = WORLD[i]; }
    }
    return best;
  }

  // A flat blue sky with one soft bank of clouds.
  vec3 skyColor(vec2 uv, float b) {
    float x = uv.x * res.x / res.y;
    float edge = .68 + .055 * sin(x * 6. + 1.2) + .03 * sin(x * 15. + .4) + .014 * sin(x * 33.);
    float y = uv.y + (b - .5) * .006;
    if (y < edge - .07 - .02 * sin(x * 9.)) return HAZE;
    return y < edge ? CLOUD : SKY;
  }

  void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    float b = (BAYER[(px.x & 3) + (px.y & 3) * 4] + .5) / 16.;
    vec2 uv = (vec2(px) + .5) / res;

    vec4 hero = texelFetch(tHero, px, 0);
    if (hero.a > .5) {
      gl_FragColor = vec4(nearestAccent(srgb(hero.rgb)), 1.);
      return;
    }

    // Hard one-pixel outline. Very dark objects get a light one so they stay visible.
    ivec2 sides[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
    for (int i = 0; i < 4; i++) {
      if (mask(px + sides[i]) > .5) {
        gl_FragColor = vec4(heroLuma(px + sides[i]) < .12 ? WHITE : INK, 1.);
        return;
      }
    }

    vec3 col;
    vec4 lane = texelFetch(tLane, px, 0);
    if (lane.a > .5) {
      // Soft nori lanes, marked by a faint seam of grains.
      float luma = dot(srgb(lane.rgb), vec3(.3, .59, .11));
      col = luma > .31 ? NORI_SEAM : luma > .21 ? NORI_LIGHT : luma > .15 ? NORI : NORI_DARK;
    } else if (${drawnSky ? 'false' : 'texelFetch(tDepth, px, 0).r >= .99999'}) {
      col = skyColor(uv, b);
    } else {
      // A light touch of dither, only where two colours meet.
      col = nearestWorld(srgb(texelFetch(tWorld, px, 0).rgb) + (b - .5) * .06);
    }

    gl_FragColor = vec4(col, 1.);
  }
`;

export class DitherPipeline {
  /** `look` can replace the world palette and accents, and use a sky drawn in the scene. */
  constructor(renderer, width, height, look = {}) {
    this.renderer = renderer;
    this.baseAccents = look.accents;
    this.depth = new THREE.DepthTexture(width, height);
    this.depth.minFilter = this.depth.magFilter = THREE.NearestFilter;
    const options = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: this.depth };
    this.world = new THREE.WebGLRenderTarget(width, height, options);
    this.hero = new THREE.WebGLRenderTarget(width, height, options);
    this.lane = new THREE.WebGLRenderTarget(width, height, options);

    this.uniforms = {
      tWorld: { value: this.world.texture },
      tHero: { value: this.hero.texture },
      tLane: { value: this.lane.texture },
      tDepth: { value: this.depth },
      res: { value: new THREE.Vector2(width, height) },
      accents: { value: accentData(CHARACTERS, look.accents) },
    };
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: makeFragmentShader(look.palette ?? WORLD, !!look.drawnSky),
    })));
  }

  setCharacterColors(characters) {
    this.uniforms.accents.value = accentData(characters, this.baseAccents);
  }

  setSize(width, height) {
    this.world.setSize(width, height);
    this.hero.setSize(width, height);
    this.lane.setSize(width, height);
    this.uniforms.res.value.set(width, height);
  }

  render(scene, camera) {
    const { renderer } = this;

    // Full scene first, so everything casts shadows and fills the depth buffer.
    camera.layers.set(0);
    renderer.setRenderTarget(this.world);
    renderer.setClearColor(0x000000, 1);
    renderer.render(scene, camera);

    // Then the lanes and important objects, into masks that share that depth.
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    for (const [target, layer] of [[this.lane, LANE_LAYER], [this.hero, HERO_LAYER]]) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
      camera.layers.set(layer);
      renderer.render(scene, camera);
    }
    camera.layers.set(0);
    renderer.autoClear = true;
    renderer.shadowMap.autoUpdate = true;

    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }
}
