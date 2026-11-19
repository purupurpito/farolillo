// Utilidades compartidas por build-assets.mjs, build-data.mjs y check.mjs (dueño: DATOS).
// Descargas con caché en tools/.cache/, reintentos y concurrencia limitada; CSV; codificador PNG indexado.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const TOOLS = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(TOOLS, '..');
export const CACHE = join(TOOLS, '.cache');

export const SPRITE_SHA = '1a294bec85e309d023c0b074617462c6c6b44a31';
export const POKEAPI_SHA = 'e98f2ad82fc61c46036689ecb10c3aa89d562d6b';

export const SC_RAW = `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${SPRITE_SHA}/`;
export const SC_CDN = `https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@${SPRITE_SHA}/`;
export const PA_RAW = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/`;

export const opciones = {
  sinRed: process.argv.includes('--sin-red'),
};

// ---------- concurrencia ----------
const MAX_CONC = 6;
let activos = 0;
const cola = [];
async function turno(fn) {
  if (activos >= MAX_CONC) await new Promise((r) => cola.push(r));
  activos++;
  try { return await fn(); }
  finally { activos--; const sig = cola.shift(); if (sig) sig(); }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export let stats = { red: 0, cache: 0, bytesRed: 0 };

async function fetchUno(url) {
  let ultimoError;
  for (let intento = 0; intento < 4; intento++) {
    try {
      const res = await turno(() => fetch(url, { headers: { 'user-agent': 'farolillo-build-tools' } }));
      if (res.status === 404 || res.status === 403) return { estado: res.status, buf: null };
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        stats.red++; stats.bytesRed += buf.length;
        return { estado: 200, buf };
      }
      ultimoError = new Error(`HTTP ${res.status} en ${url}`);
      if (res.status === 429) await espera(5000 * (intento + 1));
    } catch (e) {
      ultimoError = e;
    }
    await espera(700 * 2 ** intento);
  }
  throw ultimoError;
}

const faltasRuta = join(CACHE, 'faltan.json');
let faltas = null;
async function cargarFaltas() {
  if (faltas) return faltas;
  try { faltas = JSON.parse(await readFile(faltasRuta, 'utf8')); } catch { faltas = {}; }
  return faltas;
}
let guardarFaltasPend = null;
function guardarFaltas() {
  if (guardarFaltasPend) return;
  guardarFaltasPend = setTimeout(async () => {
    guardarFaltasPend = null;
    await mkdir(CACHE, { recursive: true });
    await writeFile(faltasRuta, JSON.stringify(faltas));
  }, 200);
}
export async function volcarFaltas() {
  if (!faltas) return;
  if (guardarFaltasPend) { clearTimeout(guardarFaltasPend); guardarFaltasPend = null; }
  await mkdir(CACHE, { recursive: true });
  await writeFile(faltasRuta, JSON.stringify(faltas));
}

/**
 * Descarga con caché. `clave` es la ruta relativa dentro de la caché; `urls` se prueban en orden
 * (404/403 pasa a la siguiente). Devuelve Buffer o null si no existe en ninguna.
 */
export async function obtener(clave, urls) {
  const ruta = join(CACHE, clave);
  if (existsSync(ruta)) { stats.cache++; return readFile(ruta); }
  const f = await cargarFaltas();
  if (f[clave]) return null;
  if (opciones.sinRed) return null;
  for (const url of urls) {
    const { buf } = await fetchUno(url);
    if (buf) {
      await mkdir(dirname(ruta), { recursive: true });
      await writeFile(ruta, buf);
      return buf;
    }
  }
  f[clave] = true; guardarFaltas();
  return null;
}

/** Archivo de SpriteCollab. Los PNG van por jsDelivr (con respaldo raw); XML y TXT por raw (jsDelivr da 403 en .xml). */
export function obtenerSC(ruta) {
  const urls = ruta.endsWith('.png') ? [SC_CDN + ruta, SC_RAW + ruta] : [SC_RAW + ruta, SC_CDN + ruta];
  return obtener('sc/' + ruta, urls);
}

export async function obtenerCSV(nombre) {
  const buf = await obtener('pokeapi/' + nombre + '.csv', [PA_RAW + nombre + '.csv']);
  if (!buf) throw new Error(`No se pudo obtener ${nombre}.csv de PokeAPI`);
  return parseCSV(buf.toString('utf8'));
}

export function parseCSV(texto) {
  const filas = [];
  let campo = '', fila = [], enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false; }
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
}

export const dex4 = (n) => String(n).padStart(4, '0');

export async function leerJSON(ruta) { return JSON.parse(await readFile(ruta, 'utf8')); }
export async function escribirJSON(ruta, obj, compacto = false) {
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, compacto ? JSON.stringify(obj) : JSON.stringify(obj, null, 1) + '\n');
}
export async function tamano(ruta) { try { return (await stat(ruta)).size; } catch { return 0; } }

/** Familias a partir de pokemon_species.csv: devuelve { raiz(dexNum)->dexNum, desde: Map(id->evolves_from) }. */
export function familias(especiesCSV) {
  const desde = new Map();
  for (const r of especiesCSV) desde.set(+r.id, r.evolves_from_species_id ? +r.evolves_from_species_id : null);
  const raiz = (id) => { let x = id; while (desde.get(x)) x = desde.get(x); return x; };
  return { desde, raiz };
}

// ---------- PNG indexado ----------
const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * Codifica RGBA (Buffer w*h*4) como PNG. Si hay ≤ 256 colores usa paleta (profundidad 1/2/4/8),
 * si no, RGBA de 8 bits. Los píxeles totalmente transparentes se normalizan a (0,0,0,0).
 */
export function codificarPNG(w, h, rgba) {
  const colores = new Map();
  const idx = new Uint8Array(w * h);
  let indexable = true;
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    const k = a === 0 ? 0 : ((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | a) >>> 0;
    let v = colores.get(k);
    if (v === undefined) {
      if (colores.size >= 256) { indexable = false; break; }
      v = colores.size; colores.set(k, v);
    }
    idx[i] = v;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const z = (raw) => zlib.deflateSync(raw, { level: 9, memLevel: 9 });
  if (!indexable) {
    ihdr[8] = 8; ihdr[9] = 6;
    const fila = w * 4 + 1;
    const raw = Buffer.alloc(fila * h);
    for (let y = 0; y < h; y++) {
      raw[y * fila] = 0;
      for (let x = 0; x < w * 4; x++) raw[y * fila + 1 + x] = rgba[y * w * 4 + x];
      for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] === 0) raw.fill(0, y * fila + 1 + x * 4, y * fila + 1 + x * 4 + 4);
    }
    return Buffer.concat([firma, chunk('IHDR', ihdr), chunk('IDAT', z(raw)), chunk('IEND', Buffer.alloc(0))]);
  }
  // Ordenar la paleta: transparentes/semitransparentes primero para acortar tRNS.
  const lista = [...colores.entries()].map(([k, v]) => ({ k, v, a: k === 0 ? 0 : k & 0xff }));
  lista.sort((p, q) => (p.a === 255) - (q.a === 255) || p.v - q.v);
  const remap = new Uint8Array(lista.length);
  lista.forEach((c, i) => { remap[c.v] = i; });
  const n = lista.length;
  const prof = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;
  ihdr[8] = prof; ihdr[9] = 3;
  const plte = Buffer.alloc(n * 3);
  const trnsN = lista.filter((c) => c.a !== 255).length;
  const trns = Buffer.alloc(trnsN);
  lista.forEach((c, i) => {
    plte[i * 3] = (c.k >>> 24) & 0xff; plte[i * 3 + 1] = (c.k >>> 16) & 0xff; plte[i * 3 + 2] = (c.k >>> 8) & 0xff;
    if (i < trnsN) trns[i] = c.a;
  });
  const porByte = 8 / prof;
  const bytesFila = Math.ceil(w / porByte);
  const raw = Buffer.alloc((bytesFila + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (bytesFila + 1);
    raw[o] = 0;
    for (let x = 0; x < w; x++) {
      const v = remap[idx[y * w + x]];
      const b = o + 1 + Math.floor(x / porByte);
      const desp = 8 - prof * ((x % porByte) + 1);
      raw[b] |= v << desp;
    }
  }
  const partes = [firma, chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (trnsN) partes.push(chunk('tRNS', trns));
  partes.push(chunk('IDAT', z(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(partes);
}
