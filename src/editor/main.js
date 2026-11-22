// Standalone character editor. Edits are saved in the browser and picked up by the game.
import * as THREE from 'three';
import { BASE_CHARACTERS, buildCharacter, CHARACTERS } from '../characters.js';
import {
  clearSavedConfig, COLORS, configFileText, configLink, diffConfig, EXPRESSIONS, EYE_SHAPES, HILL_GROUP, mergeConfig, parseConfigText, saveConfig, SHARED_KEYS, SLIDERS,
} from '../characterSchema.js';
import { DitherPipeline, HERO_LAYER, LANE_LAYER } from '../dither/pipeline.js';
import { DESIGNS, patternTexture } from '../blanket/blankets.js';
import { addWigglyArms, disposeWigglyArms, measureFigure, raisedArmTop, setArmLift, WRAP_START, WRAP_STEP } from '../blanket/rig.js';
import { poseArms, toonOptions } from '../models.js';

const $ = (id) => document.getElementById(id);
const PIXEL_HEIGHT = 440;
const PREVIEW_BLANKETS = 3;
// Blanket Hill replaces the short arms, so only its own arm settings are shown.
const EDITOR_SLIDERS = SLIDERS.filter((s) => s.key !== 'armLength' && s.key !== 'handSize');
const PREVIEW_ACCENTS = ['#262418', '#ffffff', '#fbf7f0', '#17131f', ...DESIGNS.slice(0, PREVIEW_BLANKETS).flatMap((b) => [b.a, b.b])];
const CAMERAS = {
  body: { look: new THREE.Vector3(0, 1.22, 0), distance: 6.4 },
  face: { look: new THREE.Vector3(0, 1.62, 0), distance: 3 },
};

const cast = CHARACTERS.map((c) => ({ ...c }));
let index = 0;
let figure = null;
let hillRig = null;
let wrapPreview = null;
const hillClock = { value: 0 };
const blanketMaps = DESIGNS.slice(0, PREVIEW_BLANKETS).map(patternTexture);
let dirty = false;
let pose = 'hill';
let raised = 0;
let cameraMode = 'body';
let styleMode = 'pixel';
let autoSpin = true;
let turn = 0;
let tilt = 0.08;
let zoom = 1;
let lastTime = performance.now();

/* ---------- Scene ---------- */

const canvas = $('view');
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const smoothBackground = new THREE.Color('#93c7f8');
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
const look = CAMERAS.body.look.clone();
let distance = CAMERAS.body.distance;

const hemi = new THREE.HemisphereLight('#f2f6fa', '#b9b27e', 1.75);
const sun = new THREE.DirectionalLight('#fff8ec', 2.5);
sun.position.set(-3, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 4, bottom: -2, near: 1, far: 16 });
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.03;
for (const light of [hemi, sun]) {
  light.layers.enable(HERO_LAYER);
  light.layers.enable(LANE_LAYER);
}
scene.add(hemi, sun);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(1.25, 1.36, 0.2, 40),
  new THREE.MeshToonMaterial({ ...toonOptions, color: '#fbf7f0' }),
);
pedestal.position.y = -0.1;
pedestal.receiveShadow = true;
pedestal.layers.enable(HERO_LAYER);
scene.add(pedestal);

const holder = new THREE.Group();
scene.add(holder);
const pipeline = new DitherPipeline(renderer, 216, PIXEL_HEIGHT, { accents: PREVIEW_ACCENTS });

/** Blanket layers around the body, sized exactly as they are in Blanket Hill. */
function buildWrapPreview(d) {
  const group = new THREE.Group();
  const { fit, middle, top, bottom } = measureFigure(figure, d);
  for (let i = 0; i < PREVIEW_BLANKETS; i++) {
    const radius = ((WRAP_START + WRAP_STEP * i) * d.hillSize) / fit;
    const length = (top - bottom + (PREVIEW_BLANKETS - i) * 0.035) / fit;
    const side = new THREE.MeshToonMaterial({ ...toonOptions, map: blanketMaps[i] });
    const cap = new THREE.MeshToonMaterial({ ...toonOptions, color: DESIGNS[i].b });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 30), [side, cap, cap]);
    mesh.position.y = ((top + bottom) / 2 + middle) / fit;
    group.add(mesh);
  }
  return group;
}

const inHillPose = () => pose === 'hill' || pose === 'wrapped';

function fitCamera() {
  const d = cast[index];
  figure.geometry.computeBoundingBox();
  const bodyTop = figure.geometry.boundingBox.max.y;
  const top = inHillPose() ? Math.max(bodyTop, raisedArmTop(hillRig, d)) : bodyTop;
  CAMERAS.body.look.y = Math.max(1.22, top * 0.5);
  CAMERAS.body.distance = Math.max(6.4, top * 2.3);
  if (inHillPose()) {
    // Step back far enough to keep long, wide-spread arms in view.
    const spread = THREE.MathUtils.degToRad(d.hillArmSpread);
    const side = 0.3 + Math.sin(spread) * 1.75 * d.hillArmLength + 0.3 * d.hillWiggle + 0.2 * d.hillHandSize;
    CAMERAS.body.distance = Math.max(CAMERAS.body.distance, (side * 1.08) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  }
  CAMERAS.face.look.y = (0.96 + 0.3 * (d.legLength - 1)) * d.bodySize + 0.66 * d.headSize;
  CAMERAS.face.distance = 3 * d.headSize;
}

/** Shows the normal arms, or Blanket Hill's wiggly arms and blankets. */
function applyPose() {
  const hill = inHillPose();
  for (const { group } of figure.userData.arms) group.visible = !hill;
  for (const { pivot } of hillRig.arms) pivot.visible = hill;
  wrapPreview.visible = pose === 'wrapped';
  fitCamera();
}

function rebuild() {
  dirty = false;
  if (figure) {
    holder.remove(figure);
    disposeWigglyArms(hillRig);
    wrapPreview.traverse((o) => {
      if (!o.isMesh) return;
      o.material.forEach((m) => m.dispose());
    });
    figure.traverse((o) => o.geometry?.dispose());
  }
  const d = cast[index];
  figure = buildCharacter(d);
  hillRig = addWigglyArms(figure, d, hillClock);
  setArmLift(hillRig, d, 1);
  wrapPreview = buildWrapPreview(d);
  figure.add(wrapPreview);
  figure.traverse((o) => o.layers.enable(HERO_LAYER));
  holder.add(figure);
  poseArms(figure, raised);
  pipeline.setCharacterColors(cast);
  applyPose();
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (figure) fitCamera();
  if (styleMode === 'pixel') {
    const pw = Math.round((PIXEL_HEIGHT * w) / h);
    renderer.setPixelRatio(1);
    renderer.setSize(pw, PIXEL_HEIGHT, false);
    pipeline.setSize(pw, PIXEL_HEIGHT);
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
  }
}

function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  if (dirty) rebuild();
  if (autoSpin) turn += dt * 0.55;
  holder.rotation.y = turn;
  hillClock.value += dt * cast[index].hillWiggleSpeed;
  hillRig.wiggle.value = 0.24 * cast[index].hillWiggle;

  const goal = pose === 'hands' ? 1 : 0;
  if (raised !== goal) {
    raised += (goal - raised) * (1 - Math.exp(-14 * dt));
    if (Math.abs(goal - raised) < 0.002) raised = goal;
    poseArms(figure, raised);
  }

  const view = CAMERAS[cameraMode];
  const ease = 1 - Math.exp(-9 * dt);
  look.lerp(view.look, ease);
  distance += (view.distance * zoom - distance) * ease;
  // Narrow previews step back so the whole character stays in frame.
  const fit = Math.max(1, 0.9 / camera.aspect);
  camera.position.set(0, look.y + Math.sin(tilt) * distance * fit, Math.cos(tilt) * distance * fit);
  camera.lookAt(look);

  if (styleMode === 'pixel') {
    pipeline.render(scene, camera);
  } else {
    renderer.render(scene, camera);
  }
}

/* ---------- Controls ---------- */

const updatePlayLink = () => {
  const config = diffConfig(BASE_CHARACTERS, cast);
  $('play-hill').href = configLink(`index.html?character=${BASE_CHARACTERS[index].id}`, config);
};

const persist = () => {
  const ok = saveConfig(diffConfig(BASE_CHARACTERS, cast));
  updatePlayLink();
  $('status').textContent = ok ? 'Saved' : 'Could not save. Use Download.';
};

const change = (key, value) => {
  cast[index][key] = value;
  dirty = true;
  persist();
};

function fieldset(title) {
  const box = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  box.append(legend);
  return box;
}

function textField(key, label, maxLength) {
  const row = document.createElement('label');
  row.className = 'text';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.value = cast[index][key];
  input.maxLength = maxLength;
  input.addEventListener('input', () => {
    if (input.value.trim()) {
      cast[index][key] = input.value.trim();
      persist();
      renderTabs();
    }
  });
  row.append(span, input);
  return row;
}

function choices(options, current, attr, pick) {
  const grid = document.createElement('div');
  grid.className = 'options';
  for (const option of options) {
    const b = document.createElement('button');
    b.textContent = option.label;
    b.dataset[attr] = option.id;
    b.className = option.id === current ? 'on' : '';
    b.setAttribute('aria-pressed', option.id === current);
    b.addEventListener('click', () => {
      grid.querySelectorAll('button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', x === b);
      });
      pick(option.id);
    });
    grid.append(b);
  }
  return grid;
}

const sliderText = (s, v) => `${Number(v).toFixed(s.digits ?? 2)}${s.unit ?? ''}`;

function renderTabs() {
  $('apply-all').textContent = `Apply ${cast[index].name} to all`;
  $('tabs').replaceChildren(...cast.map((c, i) => {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.className = i === index ? 'on' : '';
    b.setAttribute('aria-pressed', i === index);
    b.addEventListener('click', () => {
      index = i;
      dirty = true;
      updatePlayLink();
      renderTabs();
      renderControls();
    });
    return b;
  }));
}

function renderControls() {
  const d = cast[index];
  const out = [];

  const about = fieldset('Identity');
  about.append(textField('name', 'Name', 16), textField('tag', 'Tagline', 40));
  out.push(about);

  const faces = fieldset('Expression');
  const grid = document.createElement('div');
  grid.id = 'expressions';
  for (const e of EXPRESSIONS) {
    const b = document.createElement('button');
    b.textContent = e.label;
    b.dataset.expression = e.id;
    b.className = d.expression === e.id ? 'on' : '';
    b.addEventListener('click', () => {
      change('expression', e.id);
      grid.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    grid.append(b);
  }
  faces.append(grid);
  out.push(faces);

  for (const group of [...new Set(EDITOR_SLIDERS.map((s) => s.group))]) {
    const box = fieldset(group);
    if (group === 'Bun') {
      box.append(choices([{ id: 'off', label: 'Off' }, { id: 'on', label: 'On' }], d.hasBun ? 'on' : 'off', 'bun', (id) => {
        change('hasBun', id === 'on');
        box.querySelector('input[data-key=bunSize]').disabled = id !== 'on';
      }));
    }
    if (group === 'Eyes') box.append(choices(EYE_SHAPES, d.eyeShape, 'eyeShape', (id) => change('eyeShape', id)));
    for (const s of EDITOR_SLIDERS.filter((x) => x.group === group)) {
      const row = document.createElement('label');
      row.className = 'field';
      const span = document.createElement('span');
      span.textContent = s.label;
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: s.min, max: s.max, step: s.step, value: d[s.key] });
      input.dataset.key = s.key;
      if (s.key === 'bunSize') input.disabled = !d.hasBun;
      const value = document.createElement('output');
      value.textContent = sliderText(s, d[s.key]);
      input.addEventListener('input', () => {
        change(s.key, Number(input.value));
        if (s.group === HILL_GROUP && !inHillPose()) setPose('hill');
        value.textContent = sliderText(s, input.value);
      });
      row.append(span, input, value);
      box.append(row);
    }
    out.push(box);
  }

  const colors = fieldset('Colors');
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const c of COLORS) {
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = c.label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = d[c.key];
    input.dataset.key = c.key;
    input.addEventListener('input', () => change(c.key, input.value));
    row.append(span, input);
    swatches.append(row);
  }
  colors.append(swatches);
  out.push(colors);

  $('controls').replaceChildren(...out);
}

const refresh = () => {
  dirty = true;
  renderTabs();
  renderControls();
};

function segmented(attr, apply) {
  const buttons = document.querySelectorAll(`[data-${attr}]`);
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.classList.toggle('on', x === b));
    apply(b.dataset[attr]);
  }));
}

function setPose(value) {
  pose = value;
  document.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', b.dataset.pose === value));
  applyPose();
}

segmented('pose', setPose);
segmented('cam', (v) => { cameraMode = v; zoom = 1; });
segmented('style', (v) => {
  styleMode = v;
  canvas.classList.toggle('pixel', v === 'pixel');
  scene.background = v === 'pixel' ? null : smoothBackground;
  resize();
});

$('spin').addEventListener('click', () => {
  autoSpin = !autoSpin;
  $('spin').classList.toggle('on', autoSpin);
  $('spin').setAttribute('aria-pressed', autoSpin);
});

$('apply-all').addEventListener('click', () => {
  const source = cast[index];
  if (!confirm(`Copy ${source.name}'s face, proportions, Blanket Hill arms and bun setting to the other characters? Their colors, names and hair styles stay.`)) return;
  cast.forEach((c) => {
    if (c !== source) for (const key of SHARED_KEYS) c[key] = source[key];
  });
  persist();
  refresh();
});

$('reset-one').addEventListener('click', () => {
  cast[index] = { ...BASE_CHARACTERS[index] };
  persist();
  refresh();
});

$('reset-all').addEventListener('click', () => {
  if (!confirm('Reset all characters to their original designs?')) return;
  BASE_CHARACTERS.forEach((c, i) => { cast[i] = { ...c }; });
  clearSavedConfig();
  updatePlayLink();
  $('status').textContent = 'Saved';
  refresh();
});

$('export').addEventListener('click', () => {
  const blob = new Blob([configFileText(diffConfig(BASE_CHARACTERS, cast))], { type: 'text/javascript' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'characterConfig.js';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    mergeConfig(BASE_CHARACTERS, parseConfigText(await file.text())).forEach((c, i) => { cast[i] = c; });
    persist();
    refresh();
  } catch {
    $('status').textContent = 'That file could not be read.';
  }
});

/* ---------- Drag and zoom ---------- */

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  turn += (e.clientX - drag.x) * 0.012;
  tilt = Math.max(-0.35, Math.min(0.9, tilt + (e.clientY - drag.y) * 0.006));
  drag = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.max(0.55, Math.min(1.6, zoom * (1 + e.deltaY * 0.001)));
}, { passive: false });

/* ---------- Start ---------- */

canvas.classList.add('pixel');
updatePlayLink();
renderTabs();
renderControls();
rebuild();
new ResizeObserver(resize).observe(stage);
resize();
renderer.setAnimationLoop(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__editor = { cast, get rig() { return hillRig; }, get wrap() { return wrapPreview; }, get pose() { return pose; }, get figure() { return figure; }, get index() { return index; }, set turn(v) { turn = v; } };
}
