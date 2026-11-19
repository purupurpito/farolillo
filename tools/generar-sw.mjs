// Reescribe en sw.js la lista PRECACHE, VERSION (de js/config.js) y REVISION (huella del contenido),
// y en index.html los <link rel="modulepreload"> con el grafo estático de imports de js/main.js.
// Ejecutarlo antes de publicar y siempre que se creen o borren módulos.
//   node tools/generar-sw.mjs            → reescribe
//   node tools/generar-sw.mjs --comprobar → no escribe; sale con código 1 si algo está desactualizado
// Dueño: PWA.

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPROBAR = process.argv.includes('--comprobar');

async function listar(dir, filtro, recursivo = true) {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const n of (await readdir(abs)).sort()) {
    const rel = posix.join(dir, n);
    const s = await stat(join(RAIZ, rel));
    if (s.isDirectory()) { if (recursivo) out.push(...await listar(rel, filtro, true)); }
    else if (filtro(n)) out.push(rel);
  }
  return out;
}

/** Lista del armazón, en orden estable. */
export async function listaPrecache() {
  const fijos = ['./', 'index.html', 'manifest.webmanifest', 'assets/manifest.json', 'assets/creditos.json'].filter((p) => p === './' || existsSync(join(RAIZ, p)));
  return [
    ...fijos,
    ...await listar('css', (n) => n.endsWith('.css')),
    ...await listar('js', (n) => n.endsWith('.js')),
    ...await listar('data', (n) => n.endsWith('.json'), false),
    ...await listar('assets/ui', (n) => n.endsWith('.svg'), false),
    ...await listar('assets/ui/icons', (n) => n.endsWith('.png'), false),
  ];
}

/** Imports estáticos (import ... from '...' / import '...'), transitivos, a partir de js/main.js. */
export async function grafoMain() {
  const vistos = new Set();
  const pila = ['js/main.js'];
  while (pila.length) {
    const f = pila.pop();
    if (vistos.has(f) || !existsSync(join(RAIZ, f))) continue;
    vistos.add(f);
    const src = (await readFile(join(RAIZ, f), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?:[\w*{}\s,$]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      pila.push(posix.normalize(posix.join(posix.dirname(f), m[1])));
    }
  }
  vistos.delete('js/main.js');
  return [...vistos].sort();
}

function reemplazar(texto, marca, nuevo, archivo) {
  const re = new RegExp(`([ \\t]*)(<!-- |// )<generado:${marca}>( -->)?\\n[\\s\\S]*?\\1(?:<!-- |// )</generado:${marca}>( -->)?`);
  if (!re.test(texto)) throw new Error(`No encuentro la marca <generado:${marca}> en ${archivo}`);
  return texto.replace(re, (_, sangria, a, b) => {
    const cierre = b || '';
    return `${sangria}${a}<generado:${marca}>${cierre}\n${nuevo}${sangria}${a}</generado:${marca}>${cierre}`;
  });
}

const config = await readFile(join(RAIZ, 'js/config.js'), 'utf8');
const mv = config.match(/export\s+const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
if (!mv) throw new Error('No encuentro VERSION en js/config.js');
const VERSION = mv[1];

const lista = await listaPrecache();
const huella = createHash('sha1');
for (const p of lista) {
  if (p === './') continue;
  huella.update(p + '\0');
  huella.update(await readFile(join(RAIZ, p)));
}
const REVISION = huella.digest('hex').slice(0, 10);

const rutaSw = join(RAIZ, 'sw.js');
let sw = await readFile(rutaSw, 'utf8');
const swAntes = sw;
sw = reemplazar(sw, 'version', `const VERSION = '${VERSION}';\nconst REVISION = '${REVISION}';\n`, 'sw.js');
sw = reemplazar(sw, 'precache', `const PRECACHE = [\n${lista.map((p) => `  '${p}',`).join('\n')}\n];\n`, 'sw.js');

const rutaIndex = join(RAIZ, 'index.html');
let index = await readFile(rutaIndex, 'utf8');
const indexAntes = index;
const modulos = await grafoMain();
index = reemplazar(index, 'modulepreload', modulos.map((m) => `<link rel="modulepreload" href="${m}">\n`).join(''), 'index.html');

// La REVISION cambia con cada edición: en --comprobar solo cuenta la lista y la versión.
const sinRev = (s) => s.replace(/const REVISION = '[^']*';/, '');
const swDesfase = sinRev(sw) !== sinRev(swAntes);
const indexDesfase = index !== indexAntes;
if (COMPROBAR) {
  if (swDesfase) console.log('sw.js desactualizado (PRECACHE o VERSION)');
  if (indexDesfase) console.log('index.html desactualizado (modulepreload)');
  if (swDesfase || indexDesfase) process.exit(1);
  console.log(`sw.js e index.html al día (${lista.length} archivos en precache, ${modulos.length} modulepreload).`);
} else {
  if (sw !== swAntes) await writeFile(rutaSw, sw);
  if (index !== indexAntes) await writeFile(rutaIndex, index);
  console.log(`sw.js: VERSION ${VERSION}, REVISION ${REVISION}, ${lista.length} archivos en precache.`);
  console.log(`index.html: ${modulos.length} modulepreload.`);
}
