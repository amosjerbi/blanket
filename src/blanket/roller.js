// The chosen character: rolling physics, wiggly raised arms, and the growing blanket wrap.
import * as THREE from 'three';
import { buildCharacter, CHARACTERS } from '../characters.js';
import { toonOptions } from '../models.js';
import { addWigglyArms, disposeWigglyArms, measureFigure, setArmLift, WRAP_START, WRAP_STEP } from './rig.js';
import { heightAt, slopeAt, WORLD_LIMIT } from './terrain.js';

const GRAVITY = 26;
const STEER = 16;
const DAMPING = 0.3;
const MAX_SPEED = 26;

const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Later blankets add less girth, so a 60-blanket bundle still fits the view.
const wrapRadius = (n) => WRAP_START + WRAP_STEP * Math.min(n, 10) + 0.09 * Math.max(Math.min(n, 20) - 10, 0) + 0.04 * Math.max(n - 20, 0);

export class Roller {
  constructor(scene) {
    this.root = new THREE.Group();
    this.lay = new THREE.Group();
    this.spin = new THREE.Group();
    this.root.add(this.lay);
    this.lay.add(this.spin);
    scene.add(this.root);

    this.time = { value: 0 };
    this.holder = new THREE.Group();
    this.spin.add(this.holder);
    this.layers = [];
    this.armLift = 0;

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: '#2f3a22', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    scene.add(this.shadow);

    this.slope = { x: 0, z: 0 };
    Object.assign(this, { x: 0, z: 2.2, yaw: 0, rollAngle: 0, layAmount: 0 });
    this.setCharacter(CHARACTERS[0]);
    this.reset(0, 2.2);
  }

  /** Dresses the roller as one of the shared cast, with long wiggly arms in their colours. */
  setCharacter(def) {
    if (this.figure) {
      this.holder.remove(this.figure);
      this.figure.traverse((o) => o.geometry?.dispose());
      disposeWigglyArms(this.armRig);
    }
    this.def = def;
    const figure = buildCharacter(def);
    this.figure = figure;
    this.holder.add(figure);
    this.armRig = addWigglyArms(figure, def, this.time);

    const size = measureFigure(figure, def);
    this.holder.scale.setScalar(size.fit);
    this.holder.position.y = -size.middle;
    this.standHeight = size.height / 2;
    this.baseRadius = Math.max(0.72, 0.6 * def.headSize * size.fit);
    this.wrapLength = size.top - size.bottom;
    this.wrapCenter = (size.top + size.bottom) / 2;
    for (const layer of this.layers) layer.mesh.position.y = this.wrapCenter;

    this.setArms(this.armLift);
    this.radius = this.baseRadius;
    this.place();
  }

  /** 0 is arms by the sides, 1 is lifted over the head. */
  setArms(lift) {
    this.armLift = lift;
    setArmLift(this.armRig, this.def, lift);
  }

  reset(x, z) {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    this.yaw = 0;
    this.rollAngle = 0;
    this.layAmount = 0;
    this.radius = this.baseRadius;
    this.distance = 0;
    this.clearWrap();
    this.setArms(0);
    this.place();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  removeLayer(layer) {
    this.spin.remove(layer.mesh);
    layer.mesh.geometry.dispose();
    layer.mesh.material.forEach((m) => m.dispose());
  }

  clearWrap() {
    for (const layer of [...this.layers, ...(this.loose ?? [])]) this.removeLayer(layer);
    this.layers = [];
    this.loose = [];
    this.unwinding = 0;
  }

  /** Adds one blanket as a new outer layer. */
  wrap(item) {
    const side = new THREE.MeshToonMaterial({ ...toonOptions, map: item.map });
    const cap = new THREE.MeshToonMaterial({ ...toonOptions, color: item.design.b });
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 30);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i));
    const mesh = new THREE.Mesh(geometry, [side, cap, cap]);
    mesh.position.y = this.wrapCenter;
    this.spin.add(mesh);
    const start = this.layers.length ? this.layers.at(-1).radius : 0.5;
    this.layers.push({ item, mesh, radius: start, goal: wrapRadius(this.layers.length) * this.def.hillSize });
  }

  /** Takes off the outer blanket and returns it, or null if there are none. */
  peel() {
    const layer = this.layers.pop();
    if (!layer) return null;
    this.removeLayer(layer);
    return layer.item;
  }

  /** The finished bundle loosens while the next phase's blankets can already be collected. */
  unwind() {
    this.loose = this.layers;
    this.layers = [];
    this.unwinding = 0.5;
  }

  updateLayers(dt) {
    if (this.unwinding > 0) {
      this.unwinding = Math.max(0, this.unwinding - dt);
      const k = this.unwinding / 0.5;
      for (const layer of this.loose) {
        layer.radius = 0.2 + (layer.radius - 0.2) * k;
        layer.mesh.scale.x = layer.mesh.scale.z = layer.radius;
      }
      if (this.unwinding === 0) {
        this.loose.forEach((layer) => this.removeLayer(layer));
        this.loose = [];
      }
    }
    const count = this.layers.length;
    let outer = this.baseRadius;
    this.layers.forEach((layer, i) => {
      layer.radius += (layer.goal - layer.radius) * (1 - Math.exp(-11 * dt));
      // Older layers sit a little longer, so the ends show each blanket as a ring.
      layer.mesh.scale.set(layer.radius, this.wrapLength + (count - i) * Math.min(0.035, 0.7 / count), layer.radius);
      outer = Math.max(outer, layer.radius);
    });
    this.radius += (outer - this.radius) * (1 - Math.exp(-9 * dt));
  }

  /** Slope pulls the roller downhill, steering nudges it, and damping keeps it controllable. */
  update(dt, steerX, steerZ, rolling) {
    this.time.value += dt * this.def.hillWiggleSpeed;
    this.updateLayers(dt);

    if (rolling) {
      const s = slopeAt(this.x, this.z, this.slope);
      const fall = GRAVITY / (1 + s.x * s.x + s.z * s.z);
      this.vx += (-s.x * fall + steerX * STEER) * dt;
      this.vz += (-s.z * fall + steerZ * STEER) * dt;
      const keep = Math.exp(-DAMPING * dt);
      this.vx *= keep;
      this.vz *= keep;
      const speed = this.speed;
      if (speed > MAX_SPEED) {
        this.vx *= MAX_SPEED / speed;
        this.vz *= MAX_SPEED / speed;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.keepInWorld();

      if (this.speed > 0.4) {
        const heading = Math.atan2(-this.vx, -this.vz);
        // The body rolls either way, so it takes the nearer of the two matching angles.
        const a = shortAngle(heading - this.yaw);
        const b = shortAngle(heading + Math.PI - this.yaw);
        this.yaw += (Math.abs(a) < Math.abs(b) ? a : b) * (1 - Math.exp(-7 * dt));
      }
      const along = -Math.sin(this.yaw) * this.vx - Math.cos(this.yaw) * this.vz;
      this.rollAngle -= (along * dt) / this.radius;
      this.distance += this.speed * dt;
      this.armRig.wiggle.value = (0.2 + Math.min(0.16, this.speed * 0.012)) * this.def.hillWiggle;
    } else {
      this.armRig.wiggle.value = 0.22 * this.def.hillWiggle;
    }
    this.place();
  }

  /** Prepares to stand up and face the given direction for the phase-complete screen. */
  startCelebration(faceYaw) {
    this.showYaw = faceYaw;
    this.showRoll = Math.round(this.rollAngle / (Math.PI * 2)) * Math.PI * 2;
  }

  /** Slides to a stop, then stands the wrapped character upright, facing the camera. */
  celebrate(dt) {
    this.time.value += dt * this.def.hillWiggleSpeed;
    this.updateLayers(dt);
    const keep = Math.exp(-6 * dt);
    this.vx *= keep;
    this.vz *= keep;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.keepInWorld();
    const rate = 1 - Math.exp(-6 * dt);
    this.yaw += shortAngle(this.showYaw - this.yaw) * rate;
    this.rollAngle += (this.showRoll - this.rollAngle) * rate;
    this.layAmount += (0 - this.layAmount) * rate;
    this.armRig.wiggle.value = 0.3 * this.def.hillWiggle;
    this.place();
  }

  keepInWorld() {
    const r = Math.hypot(this.x, this.z);
    if (r <= WORLD_LIMIT) return;
    const nx = this.x / r, nz = this.z / r;
    this.x = nx * WORLD_LIMIT;
    this.z = nz * WORLD_LIMIT;
    const out = this.vx * nx + this.vz * nz;
    if (out > 0) {
      this.vx -= out * nx * 1.3;
      this.vz -= out * nz * 1.3;
    }
  }

  place() {
    const ground = heightAt(this.x, this.z);
    const s = slopeAt(this.x, this.z, this.slope);
    const normal = new THREE.Vector3(-s.x, 1, -s.z).normalize();
    const up = new THREE.Vector3(0, 1, 0).lerp(normal, this.layAmount).normalize();
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    const back = forward.clone().negate();
    const right = new THREE.Vector3().crossVectors(up, back).normalize();
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));

    // Standing up, a wrapped bundle rests on its bottom edge rather than sinking into the hill.
    const wrapped = this.layers.length ? this.wrapLength / 2 + 0.35 - this.wrapCenter : 0;
    const stand = Math.max(this.standHeight, wrapped);
    const lift = stand + (this.radius - stand) * this.layAmount;
    this.root.position.set(this.x, ground, this.z).addScaledVector(up, lift);
    this.lay.rotation.z = (-Math.PI / 2) * this.layAmount;
    this.spin.rotation.y = this.rollAngle;

    this.shadow.position.set(this.x, ground + 0.34, this.z).addScaledVector(normal, 0.05);
    this.shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    // A standing bundle is viewed against the slope, so its shadow is drawn tighter.
    const size = (0.3 + this.radius * 0.95) * (this.layers.length ? 0.72 + 0.28 * this.layAmount : 1);
    this.shadow.scale.set(size, size, 1);
  }
}
