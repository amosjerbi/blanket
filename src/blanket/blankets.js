// Patterned blankets draped over the hill, ready to be rolled up.
import * as THREE from 'three';
import { toonOptions } from '../models.js';
import { heightAt } from './terrain.js';

// Phase 1 is 10 blankets. Every phase after that is 20.
export const PHASES = [{ blankets: 10, puddles: 6 }, { blankets: 20, puddles: 10 }];
export const MAX_BLANKETS = 20;
const WIDTH = 4.6;
const LENGTH = 3.6;
const SEGMENTS = 10;
const FLY_SECONDS = 0.42;
const REACH = 2;
const LAND_SECONDS = 0.7;

export const DESIGNS = [
  { a: '#a63f78', b: '#f0d9c0', kind: 'stripes' },
  { a: '#e6b53f', b: '#7d3f2e', kind: 'check' },
  { a: '#f3ead6', b: '#2f6f7a', kind: 'dots' },
  { a: '#d95f43', b: '#f6d9a4', kind: 'check' },
  { a: '#3f6fa8', b: '#f3ead6', kind: 'stripes' },
  { a: '#c48bd0', b: '#55306b', kind: 'dots' },
  { a: '#f19aa4', b: '#fff4e6', kind: 'stripes' },
  { a: '#2f8b86', b: '#f4d35e', kind: 'check' },
  { a: '#6b3f8f', b: '#f19aa4', kind: 'stripes' },
  { a: '#f4d35e', b: '#d95f43', kind: 'dots' },
];

// The second ten swap each design's colours and pattern, so all twenty look different.
const KINDS = ['stripes', 'check', 'dots'];
const ALL_DESIGNS = [...DESIGNS, ...DESIGNS.map((d) => ({ a: d.b, b: d.a, kind: KINDS[(KINDS.indexOf(d.kind) + 1) % 3] }))];

export function patternTexture({ a, b, kind }) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = a;
  x.fillRect(0, 0, S, S);
  x.fillStyle = b;
  if (kind === 'stripes') {
    for (let i = 0; i < 4; i++) x.fillRect(i * 32 + 6, 0, 13, S);
  } else if (kind === 'check') {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 32, j * 32, 32, 32);
  } else {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        x.beginPath();
        x.arc(i * 32 + (j % 2 ? 24 : 8), j * 32 + 16, 7, 0, Math.PI * 2);
        x.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Blankets {
  constructor(scene) {
    this.items = ALL_DESIGNS.slice(0, MAX_BLANKETS).map((design) => {
      const map = patternTexture(design);
      const geometry = new THREE.PlaneGeometry(WIDTH, LENGTH, SEGMENTS, SEGMENTS);
      geometry.rotateX(-Math.PI / 2);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 1.6);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ ...toonOptions, map, side: THREE.DoubleSide }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { design, map, mesh, flat: geometry.attributes.position.array.slice(), x: 0, z: 0, waiting: false, fly: 0, landing: 0 };
    });
  }

  /** The most open spot found, away from the roller, other blankets and puddles. */
  findSpot(playerX, playerZ, puddles, skip) {
    const others = this.items.filter((b) => b !== skip && (b.waiting || b.landing > 0));
    let best = null;
    let bestRoom = -Infinity;
    for (let tries = 0; tries < 60 && bestRoom < 0; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 56;
      const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
      const room = Math.min(
        Math.hypot(x - playerX, z - playerZ) - 13,
        ...others.map((b) => Math.hypot(b.x - x, b.z - z) - 10),
        ...puddles.map((p) => Math.hypot(p.x - x, p.z - z) - p.radius - 5),
      );
      if (room > bestRoom) { bestRoom = room; best = { x, z }; }
    }
    return best;
  }

  /** Lays out this phase's blankets and puts the rest away. */
  scatter(count, playerX, playerZ, puddles) {
    for (const item of this.items) Object.assign(item, { waiting: false, fly: 0, landing: 0 });
    this.items.forEach((item, i) => {
      if (i >= count) {
        item.mesh.visible = false;
        return;
      }
      const spot = this.findSpot(playerX, playerZ, puddles, item);
      this.lay(item, spot.x, spot.z, Math.random() * Math.PI);
    });
  }

  /** A blanket knocked off the roller arcs back onto the hill, ready to collect again. */
  drop(item, from, playerX, playerZ, puddles) {
    const spot = this.findSpot(playerX, playerZ, puddles, item);
    this.lay(item, spot.x, spot.z, Math.random() * Math.PI);
    item.waiting = false;
    item.landing = LAND_SECONDS;
    item.from = from.clone();
    item.target = item.mesh.position.clone();
    item.mesh.position.copy(from);
    item.mesh.scale.setScalar(0.2);
  }

  lay(item, x, z, turn) {
    item.x = x;
    item.z = z;
    item.waiting = true;
    item.fly = 0;
    const { mesh, flat } = item;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const centerY = heightAt(x, z);
    const pos = mesh.geometry.attributes.position;
    item.rest = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const u = flat[i * 3], v = flat[i * 3 + 2];
      const wx = x + u * cos - v * sin;
      const wz = z + u * sin + v * cos;
      const crumple = 0.09 * Math.sin(u * 2.1 + turn) * Math.cos(v * 2.6) + 0.05 * Math.sin(u * 4.3 - v * 3.4);
      item.rest[i] = heightAt(wx, wz) - centerY + 0.34 + crumple;
      pos.setXYZ(i, u * cos - v * sin, item.rest[i], u * sin + v * cos);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.position.set(x, centerY, z);
    mesh.scale.setScalar(1);
    mesh.rotation.y = 0;
    mesh.visible = true;
  }

  /** Animates the blankets and returns any the roller just reached. */
  update(dt, time, player) {
    const taken = [];
    for (const item of this.items) {
      if (item.waiting) {
        const pos = item.mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const edge = Math.abs(flatEdge(item.flat[i * 3], WIDTH));
          pos.setY(i, item.rest[i] + 0.06 * edge * Math.sin(time * 2.1 + i * 0.37));
        }
        pos.needsUpdate = true;
        if (Math.hypot(item.x - player.x, item.z - player.z) < REACH + player.radius * 0.8) {
          item.waiting = false;
          item.fly = FLY_SECONDS;
          taken.push(item);
        }
      } else if (item.landing > 0) {
        item.landing = Math.max(0, item.landing - dt);
        const t = 1 - item.landing / LAND_SECONDS;
        item.mesh.position.lerpVectors(item.from, item.target, t);
        item.mesh.position.y += 7 * Math.sin(Math.PI * t);
        item.mesh.scale.setScalar(0.2 + 0.8 * t);
        if (item.landing === 0) item.waiting = true;
      } else if (item.fly > 0) {
        item.fly = Math.max(0, item.fly - dt);
        const t = 1 - item.fly / FLY_SECONDS;
        item.mesh.position.lerp(player.root.position, 0.28);
        item.mesh.rotation.y += dt * 9;
        item.mesh.scale.setScalar(Math.max(0.02, 1 - t * t));
        if (item.fly === 0) {
          item.mesh.visible = false;
          item.mesh.rotation.y = 0;
        }
      }
    }
    return taken;
  }

  nearest(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const item of this.items) {
      if (!item.waiting) continue;
      const d = Math.hypot(item.x - x, item.z - z);
      if (d < bestD) { bestD = d; best = item; }
    }
    return best && { item: best, distance: bestD };
  }
}

const flatEdge = (u, width) => (u / width) * 2;
