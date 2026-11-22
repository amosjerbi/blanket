// Every customisable character setting, plus saving, loading and validating them.
export const STORAGE_KEY = 'rollover-hill-characters';
const LINK_PREFIX = 'characters=';

export const EXPRESSIONS = [
  { id: 'joy', label: 'Joy' },
  { id: 'grin', label: 'Grin' },
  { id: 'beam', label: 'Beam' },
  { id: 'cat', label: 'Cat smile' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'wink', label: 'Wink' },
  { id: 'smile', label: 'Soft smile' },
];

export const EYE_SHAPES = [
  { id: 'circle', label: 'Circle' },
  { id: 'half', label: 'Half circle' },
];

export const HILL_GROUP = 'Blanket Hill';

export const SLIDERS = [
  { group: 'Proportions', key: 'headSize', label: 'Head size', min: 0.6, max: 1.6, step: 0.01, value: 1 },
  { group: 'Proportions', key: 'bodySize', label: 'Body size', min: 0.6, max: 1.5, step: 0.01, value: 1 },
  { group: 'Proportions', key: 'legLength', label: 'Leg length', min: 0.5, max: 2.2, step: 0.01, value: 1 },
  { group: 'Proportions', key: 'armLength', label: 'Arm length', min: 0.6, max: 1.6, step: 0.01, value: 1 },
  { group: 'Proportions', key: 'handSize', label: 'Hand size', min: 0.6, max: 2.6, step: 0.01, value: 1 },
  { group: 'Bun', key: 'bunSize', label: 'Bun size', min: 0.5, max: 1.8, step: 0.01, value: 1 },
  { group: 'Eyes', key: 'eyeSize', label: 'Eye size', min: 0.6, max: 1.35, step: 0.01, value: 1 },
  { group: 'Eyes', key: 'eyeSpacing', label: 'Eye spacing', min: 0.75, max: 1.3, step: 0.01, value: 1 },
  { group: 'Eyes', key: 'eyeHeight', label: 'Eye height', min: -0.25, max: 0.25, step: 0.01, value: 0 },
  { group: 'Eyes', key: 'eyeRotation', label: 'Eye rotation', min: -180, max: 180, step: 1, value: 0, digits: 0, unit: '°' },
  { group: 'Eyes', key: 'irisSize', label: 'Iris size', min: 0.5, max: 1.5, step: 0.01, value: 1 },
  { group: 'Eyes', key: 'pupilSize', label: 'Pupil size', min: 0.3, max: 1.8, step: 0.01, value: 1 },
  { group: 'Mouth and cheeks', key: 'mouthSize', label: 'Mouth size', min: 0.5, max: 1.8, step: 0.01, value: 1 },
  { group: 'Mouth and cheeks', key: 'mouthHeight', label: 'Mouth height', min: -0.15, max: 0.2, step: 0.01, value: 0 },
  { group: 'Mouth and cheeks', key: 'blush', label: 'Blush', min: 0, max: 1.8, step: 0.01, value: 1 },
  { group: HILL_GROUP, key: 'hillSize', label: 'Character size', min: 0.7, max: 1.4, step: 0.01, value: 1 },
  { group: HILL_GROUP, key: 'hillArmLength', label: 'Arm length', min: 0.6, max: 1.8, step: 0.01, value: 1 },
  { group: HILL_GROUP, key: 'hillArmThickness', label: 'Arm thickness', min: 0.6, max: 2, step: 0.01, value: 1 },
  { group: HILL_GROUP, key: 'hillHandSize', label: 'Hand size', min: 0.5, max: 2.2, step: 0.01, value: 1 },
  { group: HILL_GROUP, key: 'hillArmSpread', label: 'Arm spread', min: 20, max: 85, step: 1, value: 40, digits: 0, unit: '°' },
  { group: HILL_GROUP, key: 'hillWiggle', label: 'Wiggle amount', min: 0, max: 2.5, step: 0.01, value: 1 },
  { group: HILL_GROUP, key: 'hillWiggleSpeed', label: 'Wiggle speed', min: 0.25, max: 2.5, step: 0.01, value: 1 },
];

export const COLORS = [
  { key: 'skin', label: 'Skin' },
  { key: 'hair', label: 'Hair' },
  { key: 'iris', label: 'Eyes' },
  { key: 'lid', label: 'Eyelids' },
  { key: 'top', label: 'Top' },
  { key: 'sleeve', label: 'Sleeves' },
  { key: 'leg', label: 'Legs' },
  { key: 'shoe', label: 'Shoes' },
  { key: 'hand', label: 'Hands' },
  { key: 'detail', label: 'Outfit detail' },
  { key: 'trim', label: 'Accessories' },
];

// What "Apply to all" copies. Hand sizes stay personal, since Cutie's is a boxing glove.
export const SHARED_KEYS = [...SLIDERS.map((s) => s.key).filter((k) => k !== 'handSize' && k !== 'hillHandSize'), 'expression', 'eyeShape', 'hasBun'];

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const TEXT_LIMITS = { name: 16, tag: 40 };

/** Keeps only known settings with valid values, so a bad file can't break the game. */
export function sanitizePatch(patch) {
  const clean = {};
  if (!patch || typeof patch !== 'object') return clean;
  for (const s of SLIDERS) {
    const v = patch[s.key];
    if (typeof v === 'number' && Number.isFinite(v)) clean[s.key] = Math.min(s.max, Math.max(s.min, v));
  }
  for (const c of COLORS) {
    if (typeof patch[c.key] === 'string' && COLOR_RE.test(patch[c.key])) clean[c.key] = patch[c.key].toLowerCase();
  }
  if (EXPRESSIONS.some((e) => e.id === patch.expression)) clean.expression = patch.expression;
  if (EYE_SHAPES.some((e) => e.id === patch.eyeShape)) clean.eyeShape = patch.eyeShape;
  if (typeof patch.hasBun === 'boolean') clean.hasBun = patch.hasBun;
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (typeof patch[key] === 'string' && patch[key].trim()) clean[key] = patch[key].trim().slice(0, max);
  }
  return clean;
}

export const mergeConfig = (base, config) => base.map((def) => ({ ...def, ...sanitizePatch(config?.[def.id]) }));

/** Only the settings that differ from the built-in designs. */
export function diffConfig(base, characters) {
  const out = {};
  base.forEach((def, i) => {
    const changed = {};
    for (const [key, value] of Object.entries(sanitizePatch(characters[i]))) {
      if (value !== def[key]) changed[key] = value;
    }
    if (Object.keys(changed).length) out[def.id] = changed;
  });
  return out;
}

/** A game link that carries the edits, for browsers that keep storage separate per file. */
export const configLink = (page, config) => `${page}#${LINK_PREFIX}${encodeURIComponent(JSON.stringify(config))}`;

function readConfigLink() {
  if (!location.hash.startsWith(`#${LINK_PREFIX}`)) return null;
  try {
    const config = JSON.parse(decodeURIComponent(location.hash.slice(LINK_PREFIX.length + 1)));
    if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
    saveConfig(config);
    history.replaceState(null, '', location.pathname + location.search);
    return config;
  } catch {
    return null;
  }
}

export function loadSavedConfig() {
  const linked = readConfigLink();
  if (linked) return linked;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* Storage can be unavailable in private mode. */ }
}

export const configFileText = (config) => `// Saved from the character editor. Run "npm run build" after replacing this file.\nexport default ${JSON.stringify(config, null, 2)};\n`;

/** Reads an exported file as data. It is parsed, never executed. */
export function parseConfigText(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No settings found');
  return JSON.parse(text.slice(start, end + 1));
}
