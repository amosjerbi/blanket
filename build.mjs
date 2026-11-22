// Bundles Blanket Hill into one self-contained index.html.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const at = (...p) => join(ROOT, ...p);

const remap = {
  name: 'three-paths',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: at('vendor/three/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: at('vendor/three/addons', a.path.slice('three/addons/'.length)) }));
  },
};

async function bundle(folder, output) {
const { outputFiles } = await build({
  entryPoints: [at(`src/${folder}/main.js`)],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  plugins: [remap],
});

const font = async (weight) => (await readFile(at(`vendor/fonts/silkscreen-latin-${weight}-normal.woff2`))).toString('base64');
const css = (await readFile(at(`src/${folder}/${folder}.css`), 'utf8'))
  .replace('__FONT_400__', await font(400))
  .replace('__FONT_700__', await font(700));
const js = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = (await readFile(at(`src/${folder}/template.html`), 'utf8'))
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);

await writeFile(at(output), html);
console.log(`${output} ${(html.length / 1024).toFixed(0)} KB`);
}

await bundle('blanket', 'index.html');
