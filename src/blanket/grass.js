// The sky, the painted ground, and the swaying rounded-finger grass.
import * as THREE from 'three';
import { HILL_GLSL } from './terrain.js';

const BLADES = 9000;
const TILE = 76;
const ROWS = 7;
export const MAX_CLEARINGS = 30; // The nearest blankets and puddles clear their grass.

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
    this.windAmount = calm ? 0.35 : 1;
    scene.add(this.makeSky(), this.makeGround(), this.makeGrass());
  }

  makeSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 d;
        const vec3 BLUE = ${skyGlsl(SKY_COLORS[0])};
        const vec3 CLOUD = ${skyGlsl(SKY_COLORS[1])};
        const vec3 HAZE = ${skyGlsl(SKY_COLORS[2])};

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
          float h = iSize.y * fade;

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
