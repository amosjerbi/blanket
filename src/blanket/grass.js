// The sky, the painted ground, and the swaying rounded-finger grass.
import * as THREE from 'three';
import { HILL_GLSL, heightAt, terrain } from './terrain.js';

const BLADES = 9000;
const TILE = 76;
const ROWS = 7;
export const MAX_CLEARINGS = 30; // The nearest blankets and puddles clear their grass.
const FLAKES = 700;
const FLAKE_BOX = 60;
// The snowy level's colours: shadowed snow, snow, bright snow, haze and rock.
export const SNOW_COLORS = ['#b8cadb', '#cfdbe7', '#e7eff5', '#f8fafc', '#c4d3df', '#6a717e', '#8d97a6'];
// The desert's colours: sand from shadow to ripple, sandstone, haze and cactus greens.
export const SAND_COLORS = ['#c99a58', '#d9b26f', '#e8c98a', '#f2dca6', '#b07f45', '#8a6236', '#e6d3a8', '#4f7a34', '#6f9a44', '#9cba5c'];
// The rainy level's colours: wet greens, a grey sky, pale clouds, mist and raindrops.
export const RAIN_COLORS = ['#3a5a2a', '#4a6b30', '#56783a', '#7a8f66', '#9aa5ad', '#c3c9cc', '#aab3b5', '#7d8a78', '#d5e0e8'];
const CACTI = 22;
const DROPS = 900;
const RAIN_BOX = 50;

/** A flat finger: straight sides and a round top, with base at y = 0. */
function fingerGeometry() {
  const positions = [];
  const index = [];
  const rows = [];
  for (let i = 0; i <= ROWS; i++) {
    const a = i / ROWS;
    rows.push(a < 0.4 ? a * 1.6 : 0.64 + (a - 0.4) * 0.6);
  }
  rows[ROWS] = 1;
  rows.forEach((y, i) => {
    const half = y < 0.74 ? 0.5 : 0.5 * Math.sqrt(Math.max(0, 1 - ((y - 0.74) / 0.26) ** 2));
    positions.push(-half, y, 0, half, y, 0);
    if (i < ROWS) {
      const a = i * 2;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  });
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return g;
}

// The same sky blue, cloud and haze as Sushi Hill.
export const SKY_COLORS = ['#93c7f8', '#f0ece6', '#a1c4de'];
const skyGlsl = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
};

export class Scenery {
  constructor(scene, calm) {
    this.time = { value: 0 };
    this.center = { value: new THREE.Vector2() };
    this.player = { value: new THREE.Vector3(0, 0, 1) };
    this.eye = { value: new THREE.Vector2() };
    this.clearings = { value: Array.from({ length: MAX_CLEARINGS }, () => new THREE.Vector3(0, 0, 0)) };
    this.snow = { value: 0 };
    this.sand = { value: 0 };
    this.rain = { value: 0 };
    this.windAmount = calm ? 0.35 : 1;
    scene.add(this.makeSky(), this.makeGround(), this.makeGrass(), this.makeFlakes(), this.makeCacti(), this.makeRain());
  }

  /** Switches between the green hill, the snowy peaks and the desert dunes. */
  setBiome(biome) {
    terrain.snow = this.snow.value = biome === 'snow' ? 1 : 0;
    terrain.sand = this.sand.value = biome === 'desert' ? 1 : 0;
    this.flakes.visible = biome === 'snow';
    this.rain.value = biome === 'rain' ? 1 : 0;
    this.cacti.visible = biome === 'desert';
    this.drops.visible = biome === 'rain';
    if (biome === 'desert') this.plantCacti();
  }

  /** Slanted rain streaks in a box that follows the camera. */
  makeRain() {
    const base = new Float32Array(DROPS * 6);
    const tip = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      const x = Math.random() * RAIN_BOX, y = Math.random() * RAIN_BOX, z = Math.random() * RAIN_BOX;
      base.set([x, y, z, x, y, z], i * 6);
      tip[i * 2 + 1] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
    geometry.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    const drops = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uEye: { value: new THREE.Vector3() }, uWind: { value: this.windAmount } },
      vertexShader: /* glsl */ `
        attribute float aTip;
        uniform float uTime, uWind;
        uniform vec3 uEye;
        void main() {
          vec3 p = position;
          p.y -= uTime * (26.0 + 8.0 * fract(position.x * 7.31)) * uWind;
          p.x += uTime * 4.0 * uWind;
          p = mod(p - uEye + ${(RAIN_BOX / 2).toFixed(1)}, ${RAIN_BOX.toFixed(1)}) - ${(RAIN_BOX / 2).toFixed(1)} + uEye;
          p += aTip * vec3(-0.25, 1.4, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: 'void main(){ gl_FragColor = vec4(pow(vec3(0.835, 0.878, 0.910), vec3(2.2)), 1.0); }',
    }));
    drops.frustumCulled = false;
    drops.visible = false;
    this.drops = drops;
    return drops;
  }

  /** Simple cacti around the edge of the dunes, outside where blankets land. */
  makeCacti() {
    const skin = new THREE.MeshLambertMaterial({ color: '#6f9a44' });
    const trunk = new THREE.CylinderGeometry(0.75, 0.85, 1, 8);
    trunk.translate(0, 0.5, 0);
    const tip = new THREE.SphereGeometry(0.75, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.cacti = new THREE.Group();
    this.cactusList = Array.from({ length: CACTI }, (_, i) => {
      const cactus = new THREE.Group();
      const height = 3.5 + (i * 0.618 % 1) * 3.5;
      const body = new THREE.Mesh(trunk, skin);
      body.scale.y = height;
      const top = new THREE.Mesh(tip, skin);
      top.position.y = height;
      cactus.add(body, top);
      // Most get one or two arms that bend upward.
      for (const side of i % 3 === 0 ? [] : i % 3 === 1 ? [1] : [1, -1]) {
        const out = new THREE.Mesh(trunk, skin);
        out.scale.set(0.55, 1.4, 0.55);
        out.rotation.z = side * -Math.PI / 2;
        out.position.y = height * (side > 0 ? 0.45 : 0.6);
        const up = new THREE.Mesh(trunk, skin);
        up.scale.set(0.55, height * 0.32, 0.55);
        up.position.set(side * 1.4, out.position.y, 0);
        const cap = new THREE.Mesh(tip, skin);
        cap.scale.setScalar(0.55);
        cap.position.set(side * 1.4, out.position.y + height * 0.32, 0);
        cactus.add(out, up, cap);
      }
      this.cacti.add(cactus);
      return cactus;
    });
    this.cacti.visible = false;
    return this.cacti;
  }

  plantCacti() {
    this.cactusList.forEach((cactus, i) => {
      const angle = (i / CACTI) * Math.PI * 2 + Math.sin(i * 12.9) * 0.12;
      const r = 86 + ((i * 0.381) % 1) * 30;
      const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
      cactus.position.set(x, heightAt(x, z) - 0.3, z);
      cactus.rotation.y = i * 2.4;
    });
  }

  /** Slow snowflakes in a box that follows the camera. */
  makeFlakes() {
    const base = new Float32Array(FLAKES * 3);
    for (let i = 0; i < base.length; i++) base[i] = Math.random() * FLAKE_BOX;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
    const flakes = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uEye: { value: new THREE.Vector3() }, uWind: { value: this.windAmount } },
      vertexShader: /* glsl */ `
        uniform float uTime, uWind;
        uniform vec3 uEye;
        void main() {
          vec3 p = position;
          p.y -= uTime * (2.2 + 1.4 * fract(position.x * 7.31)) * uWind;
          p.x += sin(uTime * 0.7 + position.z) * 1.5 * uWind;
          p = mod(p - uEye + ${(FLAKE_BOX / 2).toFixed(1)}, ${FLAKE_BOX.toFixed(1)}) - ${(FLAKE_BOX / 2).toFixed(1)} + uEye;
          vec4 view = viewMatrix * vec4(p, 1.0);
          gl_PointSize = view.z > -14.0 ? 2.0 : 1.0;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: 'void main(){ gl_FragColor = vec4(pow(vec3(0.973, 0.980, 0.988), vec3(2.2)), 1.0); }',
    }));
    flakes.frustumCulled = false;
    flakes.visible = false;
    this.flakes = flakes;
    return flakes;
  }

  makeSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uRain: this.rain },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 d;
        const vec3 BLUE = ${skyGlsl(SKY_COLORS[0])};
        const vec3 CLOUD = ${skyGlsl(SKY_COLORS[1])};
        const vec3 HAZE = ${skyGlsl(SKY_COLORS[2])};
        uniform float uRain;

        // One puffy cloud, built from three overlapping circles.
        bool puff(float a, float h, float at, float high, float size) {
          float x = atan(sin(a - at), cos(a - at));
          for (int i = -1; i <= 1; i++) {
            float px = x - float(i) * size * 1.15;
            float py = (h - high) * 2.4 + abs(float(i)) * size * 0.28;
            if (px * px + py * py < size * size * (i == 0 ? 1.0 : 0.56)) return py > -size * 0.5;
          }
          return false;
        }

        void main() {
          vec3 v = normalize(d);
          float a = atan(v.x, v.z);
          vec3 c = BLUE;
          for (int i = 0; i < 9; i++) {
            float n = float(i);
            if (puff(a, v.y, n * 0.698 + 0.3 * sin(n * 2.7), 0.2 + 0.11 * fract(n * 0.618) * 2.0, 0.075 + 0.035 * fract(n * 0.37))) c = CLOUD;
          }
          float bank = 0.075 + 0.028 * sin(a * 3.0 + 1.2) + 0.018 * sin(a * 7.0 + 0.4) + 0.009 * sin(a * 17.0);
          if (v.y < bank) c = CLOUD;
          if (v.y < bank - 0.035 - 0.01 * sin(a * 9.0)) c = HAZE;
          // Rain turns the sky overcast: grey sky, paler clouds and misty haze.
          if (uRain > 0.5) c = c == BLUE ? ${skyGlsl('#9aa5ad')} : c == CLOUD ? ${skyGlsl('#c3c9cc')} : ${skyGlsl('#aab3b5')};
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    return sky;
  }

  makeGround() {
    const geometry = new THREE.PlaneGeometry(340, 340, 210, 210);
    geometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: { uSnow: this.snow, uSand: this.sand, uRain: this.rain },
      vertexShader: /* glsl */ `
        ${HILL_GLSL}
        varying vec2 vP;
        varying float vDist;
        void main() {
          vec3 p = vec3(position.x, hillHeight(position.xz), position.z);
          vP = p.xz;
          vec4 view = viewMatrix * vec4(p, 1.0);
          vDist = -view.z;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        ${HILL_GLSL}
        varying vec2 vP;
        varying float vDist;
        void main() {
          gl_FragColor = toLinear(addHaze(groundTone(vP, hillNormal(vP)), vDist));
        }`,
    }));
    ground.frustumCulled = false;
    return ground;
  }

  makeGrass() {
    const geometry = fingerGeometry();
    const base = new Float32Array(BLADES * 3);
    const size = new Float32Array(BLADES * 2);
    for (let i = 0; i < BLADES; i++) {
      base[i * 3] = Math.random() * TILE;
      base[i * 3 + 1] = Math.random() * TILE;
      base[i * 3 + 2] = Math.random();
      size[i * 2] = 0.42 + Math.random() * 0.38;
      size[i * 2 + 1] = 0.8 + Math.random() ** 1.6 * 0.9;
    }
    geometry.setAttribute('iBase', new THREE.InstancedBufferAttribute(base, 3));
    geometry.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
    geometry.instanceCount = BLADES;

    const grass = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: this.time,
        uCenter: this.center,
        uPlayer: this.player,
        uEye: this.eye,
        uClear: this.clearings,
        uWind: { value: this.windAmount },
        uSnow: this.snow,
        uSand: this.sand,
        uRain: this.rain,
      },
      vertexShader: /* glsl */ `
        ${HILL_GLSL}
        attribute vec3 iBase;
        attribute vec2 iSize;
        uniform float uTime, uWind;
        uniform vec2 uCenter, uEye;
        uniform vec3 uPlayer;
        uniform vec3 uClear[${MAX_CLEARINGS}];
        varying vec3 vBase, vTip;
        varying vec2 vShape;
        varying float vDist;
        void main() {
          // Blades stay put in the world while the tile of grass follows the player.
          vec2 b = mod(iBase.xy - uCenter + ${(TILE / 2).toFixed(1)}, ${TILE.toFixed(1)}) - ${(TILE / 2).toFixed(1)} + uCenter;
          float fade = 1.0 - smoothstep(${(TILE * 0.36).toFixed(1)}, ${(TILE * 0.49).toFixed(1)}, length(b - uCenter));
          float h = iSize.y * fade * mix(1.0, 0.4, uSnow); // Only short frosty tufts poke through snow.
          h *= mix(1.0, iBase.z > 0.88 ? 0.75 : 0.0, uSand); // The desert has just a little dry scrub.

          // Blankets stay visible because the grass under them is short.
          for (int i = 0; i < ${MAX_CLEARINGS}; i++) {
            if (uClear[i].z > 0.0) h *= mix(0.04, 1.0, smoothstep(uClear[i].z * 0.8, uClear[i].z * 1.25, distance(b, uClear[i].xy)));
          }

          vec2 away = b - uPlayer.xy;
          float near = length(away);
          float press = 1.0 - smoothstep(uPlayer.z * 0.7, uPlayer.z + 2.8, near);
          h *= 1.0 - 0.55 * press;

          // Grass between the camera and the character stays low, so they're never hidden.
          vec2 sight = uPlayer.xy - uEye;
          float along = clamp(dot(b - uEye, sight) / max(dot(sight, sight), 0.001), 0.0, 1.0);
          float open = smoothstep(uPlayer.z + 0.3, uPlayer.z + 1.8, distance(b, uEye + sight * along));
          h *= mix(0.62, 1.0, open);

          float t = position.y;
          float gust = sin(uTime * 1.5 + b.x * 0.2 + b.y * 0.14) + 0.45 * sin(uTime * 2.9 + b.x * 0.47 - b.y * 0.31 + iBase.z * 6.28);
          vec2 bend = vec2(0.72, 0.34) * gust * 0.5 * uWind + (near > 0.01 ? away / near : vec2(0.0)) * press * 1.4;

          vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
          vec3 p = vec3(b.x, hillHeight(b) - 0.14, b.y);
          p += camRight * position.x * iSize.x * (0.25 + 0.75 * fade) * mix(0.75, 1.0, open);
          p.y += t * h;
          p.xz += bend * t * t * h * 0.55;

          vec3 n = hillNormal(b);
          vBase = groundTone(b, n);
          float clump = smoothstep(0.66, 0.74, softNoise(b * 0.11 + 19.0));
          vec3 tip = mix(vBase * 1.08 + vec3(0.055, 0.058, 0.025), vBase * 1.2 + vec3(0.07, 0.07, 0.03), iBase.z);
          vTip = mix(tip, vec3(0.285, 0.335, 0.215), clump * 0.8);
          vTip = mix(vTip, vec3(0.973, 0.980, 0.988), uSnow * 0.85);
          vBase = mix(vBase, vec3(0.541, 0.384, 0.212), uSand * 0.6);
          vTip = mix(vTip, vec3(0.612, 0.729, 0.361), uSand);
          vShape = vec2(position.x * 2.0, t);
          vec4 view = viewMatrix * vec4(p, 1.0);
          vDist = -view.z;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        ${HILL_GLSL}
        varying vec3 vBase, vTip;
        varying vec2 vShape;
        varying float vDist;
        void main() {
          // Each finger melts into the ground at its base, like a soft paint stroke.
          vec3 c = mix(vBase, vTip, smoothstep(0.05, 0.72, vShape.y));
          c *= 0.965 + 0.05 * (1.0 - abs(vShape.x));
          gl_FragColor = toLinear(addHaze(c, vDist));
        }`,
    }));
    grass.frustumCulled = false;
    return grass;
  }

  update(dt, camera, player, ahead) {
    this.time.value += dt;
    this.sky.position.copy(camera.position);
    this.flakes.material.uniforms.uEye.value.copy(camera.position);
    this.drops.material.uniforms.uEye.value.copy(camera.position);
    this.center.value.set(player.x + ahead.x * 14, player.z + ahead.z * 14);
    this.eye.value.set(camera.position.x, camera.position.z);
    this.player.value.set(player.x, player.z, player.radius);
  }

  setClearings(blankets, puddles, x, z) {
    const open = [
      ...blankets.filter((b) => b.waiting || b.fly > 0 || b.landing > 0).map((b) => [b.x, b.z, 3.7]),
      ...puddles.filter((p) => p.active).map((p) => [p.x, p.z, p.radius * 1.3]),
    ].sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z));
    this.clearings.value.forEach((v, i) => {
      if (open[i]) v.set(...open[i]);
      else v.set(0, 0, 0);
    });
  }
}
