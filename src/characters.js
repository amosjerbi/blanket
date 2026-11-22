// The chibi anime cast, shared by both game versions and the character editor.
// Each is built standing on y=0 and facing +Z, with a big head and a small body.
import * as THREE from 'three';
import savedInProject from './characterConfig.js';
import { loadSavedConfig, mergeConfig, SLIDERS } from './characterSchema.js';
import { addArm, bake, capsule, cone, part, RoundedBoxGeometry, smooth, toonVC } from './models.js';

export const HEAD = { y: 1.56, r: 0.6 };
const { y: Y, r: R } = HEAD;
const CHIN = Y - R;

const TUNING = Object.fromEntries(SLIDERS.map((s) => [s.key, s.value]));

export const BASE_CHARACTERS = [
  { id: 'cutie', name: 'Mochi', tag: 'Idol boxer', expression: 'joy', skin: '#ffd3b4', hair: '#2f9bea', iris: '#2f9bea', lid: '#7fd8ee', top: '#f0562b', sleeve: '#f0562b', leg: '#ffffff', shoe: '#f0562b', hand: '#ffd3b4', detail: '#f8cb45', trim: '#e0262b', handSize: 1.8 },
  { id: 'ren', name: 'Kuro', tag: 'Cheerful wandering swordsman', expression: 'grin', skin: '#f2c19c', hair: '#17131f', iris: '#c8402f', lid: '#2f3a66', top: '#2f3a66', sleeve: '#2f3a66', leg: '#1f2747', shoe: '#c9a27e', hand: '#f2c19c', detail: '#1f2747', trim: '#c8402f' },
  { id: 'mara', name: 'Suzu', tag: 'Shrine maiden', expression: 'beam', skin: '#ffe0cc', hair: '#2c2438', iris: '#8a2f3f', lid: '#ff8f8f', top: '#ffffff', sleeve: '#ffffff', leg: '#e0262b', shoe: '#ffffff', hand: '#ffe0cc', detail: '#e0262b', trim: '#ffffff' },
  { id: 'vera', name: 'Momo', tag: 'Magical girl on her day off', expression: 'wink', skin: '#ffe0cc', hair: '#ff7fb8', iris: '#8a5cd6', lid: '#c9a6ff', top: '#8a5cd6', sleeve: '#c9a6ff', leg: '#ffe0cc', shoe: '#ff7fb8', hand: '#ffe0cc', detail: '#c9a6ff', trim: '#ffd23c' },
].map((def) => ({ ...TUNING, hasBun: false, eyeShape: 'circle', ...def }));

// Built-in designs, then the project's saved file, then edits saved in this browser.
const projectCast = mergeConfig(BASE_CHARACTERS, savedInProject);
export const CHARACTERS = mergeConfig(projectCast, loadSavedConfig());

/* ---------- Face ---------- */

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const eyeDisc = new THREE.CircleGeometry(1, 40);
const EYE_RADIUS = 0.33;
const EYE_BORDER = 0.034; // One line weight around every eye shape.
const EYE_WHITE = new THREE.Color(3, 3, 3); // Bright enough to stay pure white under any lighting.

/** A dome of radius r, cut flat at height floor, so nested layers keep an even border. */
function domeGeometry(r, floor) {
  const cut = Math.asin(Math.min(0.95, floor / r));
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r, cut, Math.PI - cut, false);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 28);
}
const LINE = '#17131f';
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f);

function faceParts(d) {
  const { expression, iris, lid, eyeShape, eyeRotation, eyeSize: E, eyeSpacing, eyeHeight, irisSize, pupilSize, mouthSize: M, mouthHeight, blush } = d;
  const place = (u, v, off) => {
    const x = u * R;
    const dy = v * R;
    const z = Math.sqrt(Math.max(0.01 * R * R, R * R - x * x - dy * dy));
    return { p: [x * (1 + off), Y + dy * (1 + off), z * (1 + off)], rot: [-Math.asin(Math.max(-0.95, Math.min(0.95, v))), Math.atan2(x, z)] };
  };
  const disc = (u, v, off, ru, rv, color, roll = 0) => {
    const { p, rot } = place(u, v, off);
    return part(smooth, color, { p, r: [rot[0], rot[1], roll, 'YXZ'], s: [ru * R, rv * R, 0.016 * R] });
  };
  const bar = (u, v, off, w, h, color, roll = 0) => {
    const { p, rot } = place(u, v, off);
    return part(unitBox, color, { p, r: [rot[0], rot[1], roll, 'YXZ'], s: [w * R, h * R, 0.02 * R] });
  };
  const arc = (u, v, width, flip, roll = 0) => {
    const { p, rot } = place(u, v, 0.03);
    return part(new THREE.TorusGeometry(width * R, 0.028 * R, 5, 12, Math.PI), LINE, { p, r: [rot[0], rot[1], (flip ? Math.PI : 0) + roll, 'YXZ'] });
  };

  const parts = [];
  for (const side of [-1, 1]) {
    const eu = side * 0.45 * eyeSpacing;
    const ev = 0.06 + eyeHeight;
    if (blush > 0) parts.push(disc(side * 0.68, -0.27, 0.008, 0.14 * blush, 0.07 * blush, '#ff9c9c'));

    // Each eye turns around its own centre, mirrored so both outer corners move together.
    const turn = -side * THREE.MathUtils.degToRad(eyeRotation);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const at = (ox, oy) => [eu + ox * cos - oy * sin, ev + ox * sin + oy * cos];

    // Happy closed eye, curved upward.
    if (expression === 'beam' || (expression === 'wink' && side === -1)) {
      parts.push(arc(...at(0, -0.08 * E), 0.2 * E, false, turn));
      continue;
    }

    // Every layer of an eye shares one plane, so they stack cleanly without cutting into each other.
    // The plane is widened to cancel the head's curve, so shapes read true from the front.
    const { p: centre, rot: facing } = place(eu, ev, 0);
    const eyePlane = new THREE.Matrix4().compose(
      new THREE.Vector3(...centre),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(facing[0], facing[1], 0, 'YXZ')),
      new THREE.Vector3(1 / Math.max(0.6, Math.cos(facing[1])), 1 / Math.max(0.6, Math.cos(facing[0])), 1),
    );
    const layer = (geometry, color, ox, oy, off, scale, roll = 0) => {
      const p = [(ox * cos - oy * sin) * R, (ox * sin + oy * cos) * R, off * R];
      return part(geometry, color, { p, r: [0, 0, roll], s: scale }).applyMatrix4(eyePlane);
    };
    const round = (ox, oy, off, r, color) => layer(eyeDisc, color, ox, oy, off, [r * R, r * R, 1]);
    const dome = (oy, off, r, floor, color) => layer(domeGeometry(r, floor), color, 0, oy, off, [R, R, 1], turn);
    // Lashes point straight out from the eye's rim, clear of its border.
    const lashes = (cy) => {
      for (const angle of [0.85, 0.42]) {
        const reach = (EYE_RADIUS + 0.065) * E;
        parts.push(layer(unitBox, LINE, side * Math.cos(angle) * reach, cy + Math.sin(angle) * reach, 0.012, [0.04 * R, 0.1 * E * R, 0.02 * R], side * (angle - Math.PI / 2) + turn));
      }
    };
    const sparkle = (ox, oy, size) => {
      for (const angle of [0.78, -0.78]) parts.push(layer(unitBox, EYE_WHITE, ox, oy, 0.042, [0.13 * size * R, 0.03 * R, 0.01 * R], angle + turn));
    };
    const I = E * irisSize;
    const P = I * pupilSize;

    if (eyeShape === 'half') {
      // The dome is shifted down so the half circle stays centred where the full eye sat.
      const base = -0.14 * E;
      const border = EYE_BORDER * E;
      const outer = EYE_RADIUS * E;
      const inner = base + border;
      parts.push(dome(base + 0.03 * E, 0.004, outer + 0.02 * E, 0, lid), dome(base, 0.008, outer, 0, LINE), dome(base, 0.02, outer - border, border, EYE_WHITE));
      const irisR = Math.max(border * 1.5, 0.17 * I);
      parts.push(dome(base, 0.026, irisR, border, iris));
      const pupilR = 0.085 * P;
      if (pupilR > border * 1.15) parts.push(dome(base, 0.032, pupilR, border, LINE));
      parts.push(round(0.05 * I, inner + 0.09 * I, 0.038, 0.045 * I, EYE_WHITE));
      if (expression === 'sparkle') sparkle(-0.07 * I, inner + 0.05 * I, I * 0.7);
      lashes(base);
      continue;
    }

    parts.push(round(0, 0.035 * E, 0.004, (EYE_RADIUS + 0.02) * E, lid), round(0, 0, 0.008, EYE_RADIUS * E, LINE), round(0, 0, 0.016, (EYE_RADIUS - EYE_BORDER) * E, EYE_WHITE));
    parts.push(round(0, -0.05 * E, 0.024, 0.2 * I, iris), round(0, -0.05 * E, 0.03, 0.1 * P, LINE));
    parts.push(round(0.07 * I, 0.03 * I, 0.036, 0.06 * I, EYE_WHITE));
    if (expression === 'sparkle') sparkle(-0.07 * I, -0.12 * I, I);
    lashes(0);
  }

  const mv = -0.56 + mouthHeight;
  if (expression === 'grin') {
    parts.push(bar(0, mv, 0.018, 0.46 * M, 0.16 * M, '#6b1f2b'), bar(0, mv + 0.05 * M, 0.028, 0.42 * M, 0.07 * M, '#ffffff'), bar(0.15 * M, mv - 0.01, 0.03, 0.06 * M, 0.08 * M, '#ffffff'));
  } else if (expression === 'cat') {
    parts.push(arc(-0.09 * M, mv + 0.04, 0.09 * M, true), arc(0.09 * M, mv + 0.04, 0.09 * M, true));
  } else if (expression === 'smile') {
    parts.push(arc(0, mv + 0.06, 0.15 * M, true));
  } else {
    const big = (expression === 'beam' ? 1.2 : 1) * M;
    parts.push(
      disc(0, mv, 0.018, 0.2 * big, 0.17 * big, '#6b1f2b'),
      disc(0, mv - 0.07 * big, 0.026, 0.12 * big, 0.08 * big, '#ff8f8f'),
      bar(0, mv + 0.11 * big, 0.03, 0.27 * big, 0.05 * big, '#ffffff'),
    );
  }
  return parts;
}

/* ---------- Hair helpers ---------- */

const crownGeometry = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const crown = (hair) => part(crownGeometry, hair, { p: [0, Y, 0], r: [-0.55, 0, 0], s: R * 1.05 });
const skull = (hair) => part(smooth, hair, { p: [0, Y - 0.03, -0.14], s: [R * 1.03, R, R * 0.86] });

const fringe = (hair, us, length = 0.32, width = 0.15) => us.map((u) => {
  const x = u * R;
  const dy = 0.52 * R;
  const z = Math.sqrt(Math.max(0.01, R * R - x * x - dy * dy)) + 0.03;
  return part(cone, hair, { p: [x, Y + dy, z], r: [Math.PI - 0.5, 0, u * 0.3], s: [width, length, 0.09] });
});

const spikes = (hair, list) => list.map(([angle, length, width]) => {
  const dist = R * 0.92 + length * 0.35;
  return part(cone, hair, { p: [Math.sin(angle) * dist, Y + Math.cos(angle) * dist, -0.1], r: [-0.2, 0, -angle], s: [width, length, width * 0.8] });
});

const bun = (d, x, y, z, baseSize, tie) => {
  if (!d.hasBun) return [];
  const size = baseSize * d.bunSize;
  const top = y + (size - baseSize) * 0.7;
  return [
    part(smooth, d.hair, { p: [x, top, z], s: size }),
    part(new THREE.CylinderGeometry(size * 0.5, size * 0.6, 0.06, 10), tie, { p: [x, top - size * 0.92, z * 0.9] }),
  ];
};

/* ---------- Heads ---------- */

const HEADS = {
  cutie: (d) => [
    crown(d.hair), skull(d.hair),
    ...fringe(d.hair, [-0.56, -0.28, 0, 0.28, 0.56], 0.36),
    ...bun(d, 0, Y + R + 0.13, -0.08, 0.2, d.trim),
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.36, 0.26, 0.1), d.trim, { p: [s * 0.22, Y + R * 0.86, 0.26], r: [-0.5, 0, s * 0.3] })),
    part(new THREE.BoxGeometry(0.15, 0.15, 0.13), shade(d.trim, 0.55), { p: [0, Y + R * 0.86, 0.3], r: [-0.5, 0, 0] }),
  ],
  ren: (d) => [
    crown(d.hair), skull(d.hair),
    ...spikes(d.hair, [[-1.25, 0.42, 0.17], [-0.85, 0.46, 0.18], [0.85, 0.46, 0.18], [1.25, 0.42, 0.17]]),
    ...fringe(d.hair, [-0.42, 0.05, 0.46], 0.4, 0.19),
    part(new THREE.CylinderGeometry(R * 0.99, R * 1.02, 0.09, 20), d.trim, { p: [0, Y + 0.31, -0.05], r: [-0.18, 0, 0] }),
    ...bun(d, 0, Y + R + 0.14, -0.14, 0.17, d.trim),
  ],
  mara: (d) => [
    crown(d.hair), skull(d.hair),
    // Straight, blunt-cut bangs.
    part(new RoundedBoxGeometry(0.98, 0.2, 0.2, 2, 0.05), d.hair, { p: [0, Y + 0.34, 0.39], r: [-0.45, 0, 0] }),
    ...[-1, 1].map((s) => part(new RoundedBoxGeometry(0.16, 0.72, 0.16, 2, 0.05), d.hair, { p: [s * 0.6, Y - 0.2, 0.1] })),
    ...bun(d, 0, Y + R + 0.13, -0.1, 0.2, d.trim),
    ...(d.hasBun ? [-1, 1].map((s) => part(new THREE.BoxGeometry(0.26, 0.15, 0.06), d.trim, { p: [s * 0.17, Y + R + 0.02, -0.1], r: [0, 0, s * 0.3] })) : []),
  ],
  vera: (d) => [
    crown(d.hair), skull(d.hair),
    ...fringe(d.hair, [-0.5, -0.2, 0.12, 0.42], 0.34),
    ...[-1, 1].flatMap((s) => bun(d, s * 0.46, Y + R * 0.86, -0.1, 0.23, d.trim)),
    part(new THREE.OctahedronGeometry(0.1), d.trim, { p: [0.42, Y + 0.34, 0.4] }),
  ],
};

/* ---------- Bodies ---------- */

const flare = (top, bottom, height, color, y) => part(new THREE.CylinderGeometry(top, bottom, height, 14), color, { p: [0, y, 0], s: [1, 1, 0.82] });

const DETAILS = {
  cutie: (d) => [
    flare(0.2, 0.47, 0.34, d.detail, 0.44),
    part(new THREE.BoxGeometry(0.34, 0.09, 0.08), d.detail, { p: [0, 0.93, 0.17] }),
    part(smooth, d.hair, { p: [0, 0.98, -0.3], s: [0.48, 0.66, 0.15] }),
  ],
  ren: (d) => [
    flare(0.22, 0.42, 0.44, d.detail, 0.34),
    part(new THREE.CylinderGeometry(0.27, 0.28, 0.09, 14), d.trim, { p: [0, 0.57, 0], s: [1, 1, 0.82] }),
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.06, 0.4, 0.03), '#ffffff', { p: [s * 0.08, 0.78, 0.2], r: [0, 0, s * 0.42] })),
    part(new THREE.BoxGeometry(0.06, 1.3, 0.05), '#17131f', { p: [0.08, 0.85, -0.3], r: [0, 0, -0.72] }),
    part(new THREE.BoxGeometry(0.2, 0.05, 0.07), '#ffd23c', { p: [-0.26, 1.13, -0.3], r: [0, 0, -0.72] }),
  ],
  mara: (d) => [
    flare(0.22, 0.47, 0.5, d.detail, 0.33),
    part(smooth, d.hair, { p: [0, 0.95, -0.3], s: [0.46, 0.76, 0.15] }),
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.14, 0.07, 0.05), d.detail, { p: [s * 0.08, 0.66, 0.26], r: [0, 0, s * 0.4] })),
  ],
  vera: (d) => [
    flare(0.2, 0.52, 0.3, d.detail, 0.46),
    flare(0.5, 0.54, 0.07, '#ffffff', 0.3),
    part(new THREE.OctahedronGeometry(0.09), d.trim, { p: [0, 0.8, 0.26] }),
    ...[-1, 1].map((s) => part(capsule(0.14, 0.72), d.hair, { p: [s * 0.74, 1.12, -0.12], r: [0, 0, s * 0.14] })),
  ],
};

const headParts = (d) => [
  part(smooth, d.skin, { p: [0, Y, 0], s: [R, R * 0.97, R] }),
  ...HEADS[d.id](d),
  ...faceParts(d),
];

/** The head alone, centred on the origin, for the finished-roll display. */
export function buildHeadGeometry(def, radius) {
  const geometry = bake(headParts(def));
  geometry.translate(0, -Y, 0);
  geometry.scale(radius / R, radius / R, radius / R);
  return geometry;
}

export function buildCharacter(d) {
  const body = d.bodySize;
  const lift = 0.3 * (d.legLength - 1); // Longer legs raise everything above them.

  const upper = [
    part(new THREE.CylinderGeometry(0.21, 0.3, 0.54, 12), d.top, { p: [0, 0.72, 0], s: [1, 1, 0.8] }),
    part(smooth, d.top, { p: [0, 0.47, 0], s: [0.27, 0.13, 0.22] }),
    ...DETAILS[d.id](d),
  ];
  upper.forEach((g) => g.translate(0, lift, 0));

  const lower = [];
  for (const s of [-1, 1]) {
    const leg = part(capsule(0.085, 0.16), d.leg, { p: [s * 0.13, 0.22, 0] });
    leg.translate(0, -0.07, 0);
    leg.scale(1, d.legLength, 1);
    leg.translate(0, 0.07, 0);
    lower.push(leg, part(smooth, d.shoe, { p: [s * 0.13, 0.07, 0.05], s: [0.12, 0.07, 0.17] }));
  }
  [...upper, ...lower].forEach((g) => g.scale(body, body, body));

  const head = headParts(d);
  head.forEach((g) => {
    g.translate(0, -CHIN, 0);
    g.scale(d.headSize, d.headSize, d.headSize);
    g.translate(0, (CHIN + lift) * body, 0);
  });

  const mesh = new THREE.Mesh(bake([...upper, ...lower, ...head]), toonVC);
  mesh.castShadow = true;
  mesh.name = d.id;
  mesh.userData.armRaise = 1.9; // Out to the sides, so the hands show past the big head.
  const reach = d.armLength;
  for (const s of [-1, 1]) {
    const arm = [
      part(capsule(0.07, 0.36 * reach), d.sleeve, { p: [s * 0.04 * reach, -0.24 * reach, 0], r: [0, 0, s * 0.15] }),
      part(smooth, d.hand, { p: [s * 0.09 * reach, -0.5 * reach, 0], s: 0.095 * d.handSize }),
    ];
    arm.forEach((g) => g.scale(body, body, body));
    addArm(mesh, s, [s * 0.25 * body, (0.92 + lift) * body, 0.04 * body], arm);
  }
  return mesh;
}
