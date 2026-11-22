// Blanket Hill: roll around a steep green hill and wrap yourself in every blanket.
import * as THREE from 'three';
import { CHARACTERS } from '../characters.js';
import { DitherPipeline, HERO_LAYER } from '../dither/pipeline.js';
import { Blankets, DESIGNS, MAX_BLANKETS, PHASES } from './blankets.js';
import { MAX_CLEARINGS, Scenery, SKY_COLORS } from './grass.js';
import { MAX_PUDDLES, PUDDLE_COLORS, Puddles } from './puddles.js';
import { Roller } from './roller.js';
import { Sound } from './sound.js';
import { heightAt } from './terrain.js';

const INTRO_SECONDS = 2.1;
const SNUG_SECONDS = 3.2;
const STICK_RANGE = 58;
const SPLASH_SAFE_SECONDS = 1.2;
const TOAST_SECONDS = 1.1;
const SKYLINE_ABOVE_CENTER = 0.24; // Radians. Leaves the top of the screen for the sky.
const MAX_LOOK_UP = 0.37; // Radians above the character, so they stay in frame.
const PIXEL_WIDTH = 216; // The same resolution as the dither game.
const CHARACTER_KEY = 'blanket-hill-character';
const POINTER_COLOR = '#fff6dc';

// The hill's colours, sampled from the grass reference, plus the blue sky.
const HILL_PALETTE = ['#262418', '#3f4e2c', '#46562e', '#4f6532', '#5f7a33', '#616f37', '#6d8537', '#6f783d', '#7f9444', '#93a353', '#a9b766', ...SKY_COLORS];
const HERO_COLORS = [POINTER_COLOR, '#262418', '#ffffff', '#fbf7f0', '#17131f', ...PUDDLE_COLORS, ...DESIGNS.flatMap((d) => [d.a, d.b])];

const readCharacter = () => {
  // The character editor's test link opens the game on the character being edited.
  const linked = CHARACTERS.findIndex((c) => c.id === new URLSearchParams(location.search).get('character'));
  if (linked >= 0) return linked;
  try { return Math.max(0, CHARACTERS.findIndex((c) => c.id === localStorage.getItem(CHARACTER_KEY))); } catch { return 0; }
};
const $ = (id) => document.getElementById(id);
const ease = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b);

class Game {
  constructor() {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.pipeline = new DitherPipeline(this.renderer, PIXEL_WIDTH, PIXEL_WIDTH * 2, { palette: HILL_PALETTE, accents: HERO_COLORS, drawnSky: true });
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#6f783d', 90, 240);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

    // The same light as the dither game, so the characters keep their exact colours.
    const sky = new THREE.HemisphereLight('#f2f6fa', '#b9b27e', 1.75);
    const sun = new THREE.DirectionalLight('#fff8ec', 2.5);
    sun.position.set(18, 60, 34);
    this.scene.add(sky, sun);
    for (const light of [sky, sun]) light.layers.enable(HERO_LAYER);

    if (MAX_CLEARINGS < MAX_BLANKETS + MAX_PUDDLES) throw new Error('Grass needs a clearing for each blanket and puddle');
    this.scenery = new Scenery(this.scene, calm);
    this.blankets = new Blankets(this.scene);
    this.puddles = new Puddles(this.scene);
    this.player = new Roller(this.scene);
    this.sound = new Sound();
    this.pointer = this.makePointer();

    this.mode = 'menu';
    this.clock = 0;
    this.time = 0;
    this.rounds = 0;
    this.phase = 0;
    this.safe = 0;
    this.toastTimer = 0;
    this.heading = 0;
    this.keys = new Set();
    this.stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.look = new THREE.Vector3(0, heightAt(0, 2) + 1, 2);
    this.camera.position.set(0, heightAt(0, 2) + 2.2, 11.6);

    this.buildPicker();
    this.selectCharacter(readCharacter());
    this.setupPhase();
    this.bindInput();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  /** A small arrow on the ground that points at the closest blanket. */
  makePointer() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.62);
    shape.lineTo(0.44, -0.3);
    shape.lineTo(0, -0.08);
    shape.lineTo(-0.44, -0.3);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: POINTER_COLOR, depthTest: false, side: THREE.DoubleSide, fog: false,
    }));
    mesh.renderOrder = 5;
    mesh.visible = false;
    mesh.layers.enable(HERO_LAYER);
    this.scene.add(mesh);
    return mesh;
  }

  buildPicker() {
    $('char-dots').replaceChildren(...CHARACTERS.map(() => document.createElement('i')));
    $('char-prev').addEventListener('click', () => this.cycleCharacter(-1));
    $('char-next').addEventListener('click', () => this.cycleCharacter(1));
  }

  cycleCharacter(step) {
    if (this.mode !== 'menu') return;
    this.selectCharacter((this.charIndex + step + CHARACTERS.length) % CHARACTERS.length);
  }

  selectCharacter(index) {
    this.charIndex = index;
    const def = CHARACTERS[index];
    this.player.setCharacter(def);
    $('char-name').textContent = def.name;
    $('char-tag').textContent = def.tag;
    [...$('char-dots').children].forEach((dot, i) => dot.classList.toggle('on', i === index));
    try { localStorage.setItem(CHARACTER_KEY, def.id); } catch { /* Storage can be unavailable. */ }
  }

  get goal() { return PHASES[this.phase].blankets; }

  /** Scatters this phase's puddles and blankets and resets the progress display. */
  setupPhase() {
    const { player, puddles, blankets } = this;
    const { blankets: count, puddles: wet } = PHASES[this.phase];
    puddles.scatter(wet, player.x, player.z);
    blankets.scatter(count, player.x, player.z, puddles.active);
    $('pips').replaceChildren(...blankets.items.slice(0, count).map((item) => {
      const pip = document.createElement('i');
      pip.style.setProperty('--pip', item.design.a);
      return pip;
    }));
    this.showCount(0);
    this.scenery.setClearings(blankets.items, puddles.items);
  }

  showCount(count) {
    $('count').textContent = `Phase ${this.rounds + 1} - ${count} of ${this.goal}`;
  }

  toast(text) {
    $('toast').textContent = text;
    $('toast').classList.remove('hidden');
    this.toastTimer = TOAST_SECONDS;
  }

  bindInput() {
    $('btn-start').addEventListener('click', () => this.start());
    $('btn-sound').addEventListener('click', () => {
      const on = this.sound.toggle();
      $('btn-sound').textContent = on ? 'Sound on' : 'Sound off';
      $('btn-sound').setAttribute('aria-pressed', on);
    });
    $('btn-sound').textContent = this.sound.enabled ? 'Sound on' : 'Sound off';

    addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      }
      if (e.code === 'Enter' && this.mode === 'menu') this.start();
      if (!e.repeat && (e.code === 'ArrowLeft' || e.code === 'KeyA')) this.cycleCharacter(-1);
      if (!e.repeat && (e.code === 'ArrowRight' || e.code === 'KeyD')) this.cycleCharacter(1);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    const s = this.stick;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (s.id !== null) return;
      s.id = e.pointerId;
      s.ox = e.clientX;
      s.oy = e.clientY;
      s.x = s.y = 0;
      this.canvas.setPointerCapture(e.pointerId);
      this.showStick(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== s.id) return;
      const dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RANGE ? STICK_RANGE / len : 1;
      s.x = (dx * k) / STICK_RANGE;
      s.y = (-dy * k) / STICK_RANGE;
      $('stick-thumb').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== s.id) return;
      s.id = null;
      s.x = s.y = 0;
      $('stick').classList.add('hidden');
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  showStick(x, y) {
    if (this.mode !== 'roll' && this.mode !== 'snug') return;
    const el = $('stick');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $('stick-thumb').style.transform = '';
    el.classList.remove('hidden');
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const pixelH = Math.round((PIXEL_WIDTH * box.height) / box.width);
    this.renderer.setSize(PIXEL_WIDTH, pixelH, false);
    this.pipeline.setSize(PIXEL_WIDTH, pixelH);
    this.camera.aspect = box.width / box.height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.mode !== 'menu') return;
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.mode = 'intro';
    this.clock = 0;
    $('hint').classList.remove('gone');
  }

  /** Steering input in world space, relative to where the camera faces. */
  steer() {
    const k = this.keys;
    let x = this.stick.x + (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let y = this.stick.y + (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (len > 0.08) $('hint').classList.add('gone');
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    return { x: -cos * x + sin * y, z: sin * x + cos * y };
  }

  wrapBlanket(item) {
    const { player } = this;
    player.wrap(item);
    const count = player.layers.length;
    this.sound.wrap(count - 1);
    $('pips').children[this.blankets.items.indexOf(item)].classList.add('on');
    this.showCount(count);
    if (count === this.goal) {
      this.mode = 'snug';
      this.clock = 0;
      this.rounds++;
      this.sound.snug();
      $('snug').classList.remove('hidden');
      $('snug-count').textContent = this.rounds === 1 ? `Next up: ${PHASES[1].blankets} blankets` : `Wrapped up ${this.rounds} times`;
    }
  }

  /** A puddle knocks the outer blanket back onto the hill. */
  splash() {
    const { player, blankets, puddles } = this;
    this.safe = SPLASH_SAFE_SECONDS;
    this.sound.splash();
    const from = player.root.position.clone();
    const item = player.peel();
    if (!item) {
      this.toast('Splash!');
      return;
    }
    blankets.drop(item, from, player.x, player.z, puddles.active);
    $('pips').children[blankets.items.indexOf(item)].classList.remove('on');
    this.showCount(player.layers.length);
    this.toast('-1 blanket');
  }

  newRound() {
    this.phase = Math.min(this.phase + 1, PHASES.length - 1);
    this.player.unwind();
    this.setupPhase();
    $('snug').classList.add('hidden');
    this.mode = 'roll';
  }

  step(dt) {
    const { player, blankets } = this;
    this.time += dt;
    this.clock += dt;

    if (this.mode === 'menu') {
      player.setArms(0.5 + 0.5 * Math.sin(this.time * 1.4));
      player.update(dt, 0, 0, false);
    } else if (this.mode === 'intro') {
      player.setArms(ease(0.25, 0.85, this.clock));
      player.layAmount = ease(INTRO_SECONDS - 0.5, INTRO_SECONDS, this.clock);
      player.update(dt, 0, 0, false);
      if (this.clock >= INTRO_SECONDS) {
        player.setArms(1);
        player.layAmount = 1;
        player.vz = 3.5;
        this.mode = 'roll';
      }
    } else {
      const steer = this.steer();
      player.update(dt, steer.x, steer.z, true);
      for (const item of blankets.update(dt, this.time, player)) {
        // Anything reached after the last blanket simply waits for the next phase.
        if (this.mode === 'roll') this.wrapBlanket(item);
      }
      if (this.mode === 'snug' && this.clock >= SNUG_SECONDS) this.newRound();
    }
    if (this.mode === 'menu' || this.mode === 'intro') blankets.update(dt, this.time, { x: 1e6, z: 1e6, radius: 0, root: player.root });
    this.safe = Math.max(0, this.safe - dt);
    if (this.puddles.update(dt, player, this.mode === 'roll' && this.safe === 0)) this.splash();
    player.root.visible = this.safe === 0 || Math.floor(this.safe * 12) % 2 === 0;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('toast').classList.add('hidden');
    }
    this.scenery.setClearings(blankets.items, this.puddles.items);
    this.updatePointer();
    this.updateCamera(dt);
    const ahead = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    this.scenery.update(dt, this.camera, player, ahead);
  }

  updatePointer() {
    const { player, pointer } = this;
    const near = this.mode === 'roll' ? this.blankets.nearest(player.x, player.z) : null;
    pointer.visible = !!near && near.distance > 9;
    if (!pointer.visible) return;
    const dx = near.item.x - player.x, dz = near.item.z - player.z;
    const angle = Math.atan2(dx, dz);
    const reach = player.radius + 1.9;
    const x = player.x + Math.sin(angle) * reach;
    const z = player.z + Math.cos(angle) * reach;
    pointer.position.set(x, heightAt(x, z) + 0.75, z);
    pointer.rotation.y = angle + Math.PI;
    pointer.scale.setScalar(1 + 0.08 * Math.sin(this.time * 5));
  }

  updateCamera(dt) {
    const { player, camera, look } = this;
    const at = player.root.position;
    const target = new THREE.Vector3();
    const focus = new THREE.Vector3();

    if (this.mode === 'menu') {
      const a = Math.sin(this.time * 0.25) * 0.18;
      const size = player.def.hillSize;
      target.set(at.x + Math.sin(a) * 9.4 * size, at.y + 0.7 * size, at.z + Math.cos(a) * 9.4 * size);
      focus.set(at.x, at.y - 0.9 * size, at.z);
    } else if (this.mode === 'intro') {
      const back = ease(INTRO_SECONDS - 0.7, INTRO_SECONDS, this.clock);
      const near = 9 * player.def.hillSize;
      target.set(at.x, at.y + 0.7 + 6 * back, at.z + near - (near + 10) * back);
      focus.set(at.x, at.y + 0.2, at.z + 3 * back);
    } else {
      if (player.speed > 2) {
        const goal = Math.atan2(player.vx, player.vz);
        const turn = Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading));
        this.heading += turn * (1 - Math.exp(-1.7 * Math.min(1, player.speed / 10) * dt));
      }
      const distance = 9 + player.radius * 2;
      const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
      target.set(at.x - sin * distance, at.y + 3 + player.radius * 0.8, at.z - cos * distance);
      target.y = Math.max(target.y, heightAt(target.x, target.z) + 2.8);

      // Aim so the skyline sits near the top of the screen, without losing the character.
      let skyline = -Infinity;
      for (let d = 8; d <= 96; d += 8) {
        const ground = heightAt(target.x + sin * d, target.z + cos * d);
        skyline = Math.max(skyline, Math.atan2(ground - target.y, d));
      }
      const toPlayer = Math.atan2(at.y - target.y, distance);
      const pitch = Math.max(toPlayer, Math.min(skyline - SKYLINE_ABOVE_CENTER, toPlayer + MAX_LOOK_UP));
      const tilt = Math.tan(pitch);
      focus.set(target.x + sin * 20, target.y + tilt * 20, target.z + cos * 20);
    }
    target.y = Math.max(target.y, heightAt(target.x, target.z) + 2.8);
    const rate = 1 - Math.exp(-(this.mode === 'roll' || this.mode === 'snug' ? 6 : 4.5) * dt);
    camera.position.lerp(target, rate);
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 2.2);
    look.lerp(focus, 1 - Math.exp(-8 * dt));
    camera.lookAt(look);
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.step(dt);
    this.draw();
  }

  /** Only the character, blankets, puddles and arrow get outlines and their exact colours. */
  draw() {
    this.player.root.traverse((o) => o.layers.enable(HERO_LAYER));
    for (const item of this.blankets.items) item.mesh.layers.enable(HERO_LAYER);
    for (const puddle of this.puddles.items) puddle.mesh.layers.enable(HERO_LAYER);
    this.pipeline.render(this.scene, this.camera);
  }
}

const game = new Game();
if (location.search.includes('debug')) window.__blanket = game;
