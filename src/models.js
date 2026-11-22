// Procedural low-poly models, baked into single vertex-coloured geometries.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';

const gradientData = new Uint8Array([120, 178, 228, 255]);
const gradient = new THREE.DataTexture(gradientData, 4, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

export const toonOptions = { gradientMap: gradient };
export const toonVC = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Bakes a transform and colour into a non-indexed geometry ready for merging. */
export function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = 1, flat = false, paint } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  tmpP.set(...p);
  tmpQ.setFromEuler(tmpE.set(...r));
  if (Array.isArray(s)) tmpS.set(...s); else tmpS.setScalar(s);
  g.applyMatrix4(tmpM.compose(tmpP, tmpQ, tmpS));
  if (flat) g.computeVertexNormals();

  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  tmpC.set(color);
  for (let i = 0; i < count; i++) {
    if (paint) paint(tmpC, g.attributes.normal, g.attributes.position, i);
    colors.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export const bake = (parts) => mergeGeometries(parts, false);

const sphere = (d = 1) => new THREE.IcosahedronGeometry(1, d);
const smooth = new THREE.SphereGeometry(1, 16, 12);
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
const cone = new THREE.ConeGeometry(1, 1, 10);

/* ---------- Scenery ---------- */

function foliagePaint(dark, light) {
  const a = new THREE.Color(dark);
  const b = new THREE.Color(light);
  return (c, n, _p, i) => c.copy(n.getY(i) > 0.35 ? b : a);
}

export function treeGeometry(dark = '#e9919c', light = '#f6c3c8') {
  const trunk = '#5b3a26';
  const paint = foliagePaint(dark, light);
  return bake([
    part(new THREE.CylinderGeometry(0.3, 0.55, 2.6, 7), trunk, { p: [0, 1.3, 0], r: [0, 0, 0.1] }),
    part(new THREE.CylinderGeometry(0.2, 0.32, 2.2, 6), trunk, { p: [0.28, 3.4, 0], r: [0, 0, -0.22] }),
    part(new THREE.CylinderGeometry(0.1, 0.18, 1.5, 5), trunk, { p: [-0.5, 3.5, 0.1], r: [0, 0, 0.8] }),
    part(sphere(1), '#000', { p: [0.6, 5.1, 0], s: [1.9, 1.35, 1.8], flat: true, paint }),
    part(sphere(1), '#000', { p: [-1.25, 4.25, 0.2], s: [1.25, 0.95, 1.2], flat: true, paint }),
    part(sphere(1), '#000', { p: [1.75, 4.15, -0.3], s: [1.05, 0.8, 1.05], flat: true, paint }),
  ]);
}

export function saplingGeometry() {
  const paint = foliagePaint('#e9919c', '#f6c3c8');
  return bake([
    part(new THREE.CylinderGeometry(0.12, 0.2, 0.6, 6), '#5b3a26', { p: [0, 0.3, 0] }),
    part(sphere(1), '#000', { p: [0, 0.82, 0], s: [0.8, 0.58, 0.8], flat: true, paint }),
    part(sphere(1), '#000', { p: [0.42, 0.62, 0.15], s: [0.45, 0.36, 0.45], flat: true, paint }),
    part(sphere(1), '#000', { p: [-0.42, 0.6, -0.1], s: [0.42, 0.34, 0.42], flat: true, paint }),
  ]);
}

export function bushGeometry() {
  const paint = foliagePaint('#4f9a35', '#7fc63f');
  return bake([
    part(sphere(1), '#000', { p: [0, 0.55, 0], s: [1.5, 0.95, 1.3], flat: true, paint }),
    part(sphere(1), '#000', { p: [1.1, 0.35, 0.2], s: [0.9, 0.62, 0.85], flat: true, paint }),
    part(sphere(1), '#000', { p: [-1.05, 0.32, -0.15], s: [0.8, 0.55, 0.8], flat: true, paint }),
  ]);
}

export function rockGeometry() {
  const lit = new THREE.Color('#d8c8aa');
  const mid = new THREE.Color('#b9a88e');
  const dark = new THREE.Color('#8f8068');
  const paint = (c, n, _p, i) => {
    const l = n.getY(i) * 0.75 + n.getX(i) * -0.45;
    c.copy(l > 0.62 ? lit : l > 0.1 ? mid : dark);
  };
  const base = new THREE.DodecahedronGeometry(1, 0);
  return bake([
    part(base, '#000', { p: [0, 0.65, 0], s: [1.7, 1.05, 1.25], r: [0.2, 0.5, 0.12], flat: true, paint }),
    part(base, '#000', { p: [1.25, 0.4, 0.25], s: [0.85, 0.62, 0.8], r: [0.7, 0.2, 0], flat: true, paint }),
  ]);
}

/** One log fence section, 6.4 long, running along Z. */
export function fenceGeometry() {
  const parts = [];
  for (const z of [-3.2, 3.2]) {
    parts.push(
      part(new THREE.CylinderGeometry(0.25, 0.28, 1.65, 9), '#7a5a30', { p: [0, 0.82, z] }),
      part(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 9), '#f2c977', { p: [0, 1.66, z] }),
    );
  }
  for (const y of [0.62, 1.16]) {
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 7), '#a97c3f', { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
  }
  return bake(parts);
}

export function tuftGeometry() {
  return bake([
    part(cone, '#5fae35', { p: [0, 0.36, 0], s: [0.1, 0.72, 0.05] }),
    part(cone, '#8fd23c', { p: [-0.13, 0.27, 0.03], r: [0, 0, 0.3], s: [0.09, 0.55, 0.05] }),
    part(cone, '#8fd23c', { p: [0.13, 0.25, -0.03], r: [0, 0, -0.32], s: [0.09, 0.5, 0.05] }),
  ]);
}

function flowerGeometry(petal, center) {
  const parts = [part(new THREE.CylinderGeometry(0.025, 0.035, 0.6, 5), '#5fae35', { p: [0, 0.3, 0] })];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(smooth, petal, { p: [Math.cos(a) * 0.14, 0.64, Math.sin(a) * 0.14], s: [0.11, 0.035, 0.11] }));
  }
  parts.push(part(smooth, center, { p: [0, 0.66, 0], s: [0.07, 0.05, 0.07] }));
  return bake(parts);
}
export const redFlowerGeometry = () => flowerGeometry('#e8503a', '#f2c14e');
export const daisyGeometry = () => flowerGeometry('#fbf7f0', '#f2c14e');

export function cattailGeometry() {
  return bake([
    part(new THREE.CylinderGeometry(0.035, 0.05, 1.7, 6), '#5fae35', { p: [0, 0.85, 0] }),
    part(capsule(0.12, 0.42), '#8a5a33', { p: [0, 1.62, 0] }),
    part(cone, '#4f9a35', { p: [0.2, 0.55, 0.05], r: [0, 0, -0.42], s: [0.1, 1.15, 0.04] }),
    part(cone, '#7fc63f', { p: [-0.2, 0.42, -0.04], r: [0, 0, 0.5], s: [0.09, 0.9, 0.04] }),
  ]);
}

/** A huge sitting cat, about 8 tall and 7 wide, facing the oncoming roll (+Z). */
export function catGeometry() {
  const fur = '#77737f', dark = '#565261', pale = '#fbf7f0', pink = '#f6c3c8', ink = '#262418';
  const parts = [
    part(smooth, fur, { p: [0, 2.4, -0.3], s: [2.9, 2.6, 2.3] }),
    part(smooth, pale, { p: [0, 2.8, 1.45], s: [1.55, 1.9, 0.95] }),
    part(smooth, fur, { p: [0, 5.6, 0.5], s: [2.5, 2.1, 2] }),
    part(smooth, pale, { p: [0, 4.95, 1.85], s: [1.05, 0.72, 0.68] }),
    part(capsule(0.34, 2.6), '#6a6672', { p: [2.9, 0.45, 0.4], r: [Math.PI / 2, 0, -0.18] }),
    part(smooth, dark, { p: [3.15, 0.45, 1.95], s: 0.42 }),
    part(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 5), ink, { p: [0, 0, 0], s: 0 }),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      part(smooth, fur, { p: [side * 2.3, 1.1, -0.4], s: [1.2, 1.15, 1.7] }),
      part(capsule(0.62, 1.7), fur, { p: [side * 1.05, 1.25, 1.55] }),
      part(smooth, pale, { p: [side * 1.1, 0.42, 2.1], s: [0.86, 0.48, 1.05] }),
      part(cone, fur, { p: [side * 1.55, 7.45, 0.4], r: [0, 0, -side * 0.3], s: [0.85, 1.6, 0.55] }),
      part(cone, pink, { p: [side * 1.52, 7.3, 0.72], r: [0, 0, -side * 0.3], s: [0.48, 1.05, 0.25] }),
      part(smooth, '#f2c14e', { p: [side * 0.98, 5.85, 2.24], s: [0.46, 0.52, 0.16] }),
      part(smooth, ink, { p: [side * 0.98, 5.85, 2.38], s: [0.15, 0.43, 0.07] }),
      part(smooth, pink, { p: [side * 1.62, 5.05, 1.85], s: [0.34, 0.2, 0.1] }),
    );
    for (const y of [4.82, 5.08]) {
      parts.push(part(new THREE.CylinderGeometry(0.025, 0.025, 2, 4), ink, { p: [side * 1.75, y + (y - 4.95) * 0.5, 2.05], r: [0, 0, side * (Math.PI / 2 + (y - 4.95) * 0.7)] }));
    }
  }
  for (const x of [-0.55, 0, 0.55]) {
    parts.push(part(new THREE.BoxGeometry(0.2, 0.75, 0.14), dark, { p: [x, 7.25 - Math.abs(x) * 0.3, 1.82], r: [-0.55, 0, 0] }));
  }
  parts.push(part(cone, pink, { p: [0, 5.2, 2.5], r: [Math.PI, 0, 0], s: [0.2, 0.17, 0.09] }));
  return bake(parts.filter((_, i) => i !== 6));
}

/** A red shrine gate sized to frame one lane. */
export function gateGeometry() {
  const red = '#d8342b', dark = '#2b2320', gold = '#f2c14e';
  const parts = [
    part(new THREE.BoxGeometry(4.5, 0.26, 0.62), dark, { p: [0, 5.62, 0] }),
    part(new THREE.BoxGeometry(4.1, 0.3, 0.5), red, { p: [0, 5.36, 0] }),
    part(new THREE.BoxGeometry(3.7, 0.24, 0.3), red, { p: [0, 4.45, 0] }),
    part(new THREE.BoxGeometry(0.2, 0.7, 0.26), red, { p: [0, 4.9, 0] }),
    part(new THREE.BoxGeometry(0.5, 0.56, 0.08), gold, { p: [0, 4.9, 0.17] }),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      part(new THREE.CylinderGeometry(0.15, 0.2, 5.3, 10), red, { p: [side * 1.82, 2.65, 0] }),
      part(new THREE.CylinderGeometry(0.25, 0.27, 0.42, 10), dark, { p: [side * 1.82, 0.2, 0] }),
      part(new THREE.BoxGeometry(0.62, 0.26, 0.62), dark, { p: [side * 2.46, 5.72, 0], r: [0, 0, side * 0.32] }),
    );
  }
  return bake(parts);
}

/* ---------- Food ---------- */

export function carrotGeometry() {
  const paintBody = (c, _n, p, i) => c.set(Math.sin(p.getY(i) * 15) > 0.55 ? '#d96a14' : '#f28a24');
  return bake([
    part(new THREE.ConeGeometry(0.42, 1.35, 12, 10), '#000', { p: [0, 0.68, 0], r: [Math.PI, 0, 0], paint: paintBody }),
    part(cone, '#5fa83c', { p: [0, 1.58, 0], s: [0.16, 0.62, 0.16] }),
    part(cone, '#7cc24a', { p: [-0.17, 1.52, 0], r: [0, 0, 0.5], s: [0.13, 0.52, 0.13] }),
    part(cone, '#7cc24a', { p: [0.17, 1.52, 0], r: [0, 0, -0.5], s: [0.13, 0.52, 0.13] }),
  ]);
}

export function avocadoGeometry() {
  // Lathed pear profile, cut face toward +Z.
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = t * 1.5;
    const r = Math.sin(Math.PI * t) ** 0.72 * (0.62 - 0.26 * t);
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  const lathe = new THREE.LatheGeometry(pts, 16);
  return bake([
    part(lathe, '#2f4a24', { s: [1, 1, 0.62] }),
    part(lathe, '#a8c84a', { p: [0, 0.03, 0.09], s: [0.88, 0.96, 0.56] }),
    part(lathe, '#eef0a0', { p: [0, 0.09, 0.15], s: [0.68, 0.87, 0.5] }),
    part(smooth, '#7a4a28', { p: [0, 0.52, 0.34], s: [0.3, 0.3, 0.24] }),
  ]);
}

export function eggGeometry() {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    const r = Math.cos(a) * (0.5 - 0.09 * Math.sin(a));
    pts.push(new THREE.Vector2(Math.max(r, 0.001), 0.66 + Math.sin(a) * 0.66));
  }
  return bake([
    part(new THREE.LatheGeometry(pts, 14), '#fbf7f0'),
    part(new THREE.TorusGeometry(0.42, 0.075, 6, 16), '#f2c14e', { p: [0, 0.56, 0], r: [Math.PI / 2, 0, 0], s: [1.08, 1.08, 1] }),
  ]);
}

/* ---------- Mattress ---------- */

/** A plain slab that keeps its UVs, so the roll's single texture covers it. */
export const mattressGeometry = () => new RoundedBoxGeometry(2.5, 0.56, 1.72, 4, 0.2);

/* ---------- Posable arms ---------- */

/** Adds an arm that pivots at the shoulder. `side` is -1 for left and 1 for right. */
export function addArm(mesh, side, pivot, parts) {
  const group = new THREE.Group();
  group.position.set(...pivot);
  const arm = new THREE.Mesh(bake(parts), toonVC);
  arm.castShadow = true;
  group.add(arm);
  mesh.add(group);
  (mesh.userData.arms ??= []).push({ group, side });
}

/** Raises both arms: 0 is at rest and 1 is fully overhead. */
export function poseArms(mesh, amount) {
  for (const { group, side } of mesh.userData.arms ?? []) group.rotation.z = side * amount * mesh.userData.armRaise;
}

export { RoundedBoxGeometry, capsule, smooth, cone };
