// Puddles on the hill. Rolling through one knocks the outer blanket off.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export const MAX_PUDDLES = 10;
// The dither game's pond colours: shore, water and ripple.
export const PUDDLE_COLORS = ['#f0ece6', '#5bc6fa', '#84d8fc'];
const RINGS = 5;
const SEGMENTS = 28;
const SPLASH_SECONDS = 0.6;

const glsl = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
};

function discGeometry() {
  const count = 1 + RINGS * SEGMENTS;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(count), 1));
  const index = [];
  for (let k = 0; k < SEGMENTS; k++) {
    const n = (k + 1) % SEGMENTS;
    index.push(0, 1 + n, 1 + k);
    for (let r = 0; r < RINGS - 1; r++) {
      const a = 1 + r * SEGMENTS + k, b = 1 + r * SEGMENTS + n;
      index.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
    }
  }
  g.setIndex(index);
  return g;
}

export class Puddles {
  constructor(scene) {
    this.time = { value: 0 };
    this.items = Array.from({ length: MAX_PUDDLES }, () => {
      const splash = { value: -1 };
      const mesh = new THREE.Mesh(discGeometry(), new THREE.ShaderMaterial({
        uniforms: { uT: this.time, uSplash: splash },
        vertexShader: /* glsl */ `
          attribute float aRing;
          varying float vRing;
          void main() {
            vRing = aRing;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uT, uSplash;
          varying float vRing;
          void main() {
            vec3 c = ${glsl(PUDDLE_COLORS[1])};
            if (sin(vRing * 15.0 - uT * 3.0) > 0.78) c = ${glsl(PUDDLE_COLORS[2])};
            if (uSplash >= 0.0 && abs(vRing - uSplash) < 0.13) c = ${glsl(PUDDLE_COLORS[2])};
            if (vRing > 0.86) c = ${glsl(PUDDLE_COLORS[0])};
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, splash, x: 0, z: 0, radius: 0, active: false, armed: true, splashing: 0 };
    });
  }

  get active() { return this.items.filter((p) => p.active); }

  /** Spreads this phase's puddles around the hill, away from the roller. */
  scatter(count, playerX, playerZ) {
    const placed = [];
    this.items.forEach((item, i) => {
      item.active = i < count;
      item.mesh.visible = item.active;
      if (!item.active) return;
      let best = null;
      let bestRoom = -Infinity;
      for (let tries = 0; tries < 50 && bestRoom < 0; tries++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 15 + Math.random() * 52;
        const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
        const room = Math.min(Math.hypot(x - playerX, z - playerZ) - 14, ...placed.map((p) => Math.hypot(p.x - x, p.z - z) - 17));
        if (room > bestRoom) { bestRoom = room; best = { x, z }; }
      }
      placed.push(best);
      this.lay(item, best.x, best.z, 2.4 + Math.random());
    });
  }

  lay(item, x, z, radius) {
    Object.assign(item, { x, z, radius, armed: true, splashing: 0 });
    item.splash.value = -1;
    const center = heightAt(x, z);
    const wobble = Math.random() * 6.28;
    const pos = item.mesh.geometry.attributes.position;
    const ring = item.mesh.geometry.attributes.aRing;
    const put = (i, u, v, t) => {
      pos.setXYZ(i, u, heightAt(x + u, z + v) - center + 0.26, v);
      ring.setX(i, t);
    };
    put(0, 0, 0, 0);
    for (let r = 0; r < RINGS; r++) {
      const t = (r + 1) / RINGS;
      for (let k = 0; k < SEGMENTS; k++) {
        const a = (k / SEGMENTS) * Math.PI * 2;
        const edge = radius * t * (1 + 0.14 * Math.sin(a * 3 + wobble) + 0.07 * Math.sin(a * 5 - wobble));
        put(1 + r * SEGMENTS + k, Math.cos(a) * edge, Math.sin(a) * edge, t);
      }
    }
    pos.needsUpdate = ring.needsUpdate = true;
    item.mesh.position.set(x, center, z);
  }

  /** Returns a puddle the roller just entered. A puddle re-arms once the roller leaves it. */
  update(dt, player, canHit) {
    this.time.value += dt;
    let hit = null;
    for (const item of this.items) {
      if (!item.active) continue;
      if (item.splashing > 0) {
        item.splashing = Math.max(0, item.splashing - dt);
        item.splash.value = item.splashing > 0 ? 1 - item.splashing / SPLASH_SECONDS : -1;
      }
      const distance = Math.hypot(item.x - player.x, item.z - player.z);
      if (distance > item.radius + player.radius + 0.5) item.armed = true;
      if (distance < item.radius * 0.85 + player.radius * 0.3 && item.armed) {
        item.armed = false;
        if (canHit && !hit) {
          item.splashing = SPLASH_SECONDS;
          hit = item;
        }
      }
    }
    return hit;
  }
}
