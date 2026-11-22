// Blanket Hill's character setup, shared by the game and the character editor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { toonOptions } from '../models.js';

export const WRAP_START = 0.58;
export const WRAP_STEP = 0.16;
const FIGURE_HEIGHT = 2.7;
const CHIN_HEIGHT = 0.96;
const ARM_LENGTH = 1.75;
const ARM_DOWN = 2.6;

function armGeometry(def) {
  const length = ARM_LENGTH * def.hillArmLength;
  const thick = def.hillArmThickness;
  const sleeve = new THREE.CylinderGeometry(0.1 * thick, 0.14 * thick, length, 9, Math.round(22 * Math.max(1, def.hillArmLength)));
  sleeve.translate(0, length / 2, 0);
  const handRadius = 0.2 * def.hillHandSize;
  const hand = new THREE.SphereGeometry(handRadius, 12, 9);
  hand.translate(0, length + handRadius * 0.4, 0);
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const data = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) data.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(data, 3));
    g.deleteAttribute('uv');
    return g;
  };
  return mergeGeometries([paint(sleeve, def.sleeve), paint(hand, def.hand)]);
}

/** Bends the arm into a travelling wave, with the shoulder held still. */
function wigglyMaterial(clock, amount, phase, length) {
  const material = new THREE.MeshToonMaterial({ ...toonOptions, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uT = clock;
    shader.uniforms.uAmount = amount;
    shader.uniforms.uPhase = { value: phase };
    shader.uniforms.uLength = { value: length };
    shader.vertexShader = `uniform float uT, uAmount, uPhase, uLength;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       // Past the wrist the offset stops changing, so the hand keeps its round shape.
       float wave = min(transformed.y, uLength);
       float along = clamp(wave / uLength, 0.0, 1.0);
       float reach = along * along * (3.0 - 2.0 * along);
       transformed.x += uAmount * reach * sin(wave * 3.3 - uT * 8.5 + uPhase);
       transformed.z += uAmount * 0.75 * reach * cos(wave * 2.6 - uT * 6.7 + uPhase * 1.7);`,
    );
  };
  return material;
}

/** Replaces the figure's short arms with long wiggly ones in the same colours. */
export function addWigglyArms(figure, def, clock) {
  const wiggle = { value: 0.2 * def.hillWiggle };
  const length = ARM_LENGTH * def.hillArmLength;
  const arms = figure.userData.arms.map(({ group, side }) => {
    group.visible = false;
    const pivot = new THREE.Group();
    pivot.position.copy(group.position);
    const mesh = new THREE.Mesh(armGeometry(def), wigglyMaterial(clock, wiggle, side > 0 ? 0 : 2.3, length));
    mesh.castShadow = true;
    pivot.add(mesh);
    figure.add(pivot);
    return { pivot, side };
  });
  return { arms, wiggle };
}

export function disposeWigglyArms(rig) {
  for (const { pivot } of rig.arms) {
    pivot.children[0].geometry.dispose();
    pivot.children[0].material.dispose();
  }
}

/** 0 is arms by the sides, 1 is lifted over the head at the chosen spread. */
export function setArmLift(rig, def, lift) {
  const up = THREE.MathUtils.degToRad(def.hillArmSpread);
  const angle = ARM_DOWN + (up - ARM_DOWN) * lift;
  for (const { pivot, side } of rig.arms) pivot.rotation.z = -side * angle;
}

/** How the figure sits inside the roll: its scale, centre, and the wrapped span. */
export function measureFigure(figure, def) {
  figure.geometry.computeBoundingBox();
  const box = figure.geometry.boundingBox;
  const height = FIGURE_HEIGHT * def.hillSize;
  const fit = height / (box.max.y - box.min.y);
  const middle = ((box.max.y + box.min.y) / 2) * fit;
  // The blankets cover the body from the chin down and leave the shoes peeking out.
  const top = (CHIN_HEIGHT + 0.3 * (def.legLength - 1)) * def.bodySize * fit - middle + 0.03;
  const bottom = box.min.y * fit - middle + 0.16;
  return { fit, middle, top, bottom, height };
}

/** The height the raised hands reach, in the figure's own units. */
export function raisedArmTop(rig, def) {
  const shoulder = rig.arms[0]?.pivot.position.y ?? 0;
  return shoulder + Math.cos(THREE.MathUtils.degToRad(def.hillArmSpread)) * ARM_LENGTH * def.hillArmLength + 0.2 * def.hillHandSize;
}
