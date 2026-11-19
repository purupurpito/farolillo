#!/usr/bin/env node
// Farolillo — pipeline de sprites (SPEC §13.3). Dueño: DATOS.
// Uso: node tools/build-assets.mjs [--solo [0001,0004,...]] [--sin-red]
//   --solo sin lista usa 20 especies de muestra para medir el tamaño.
import { PNG } from 'pngjs';
import { rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RAIZ, CACHE, SPRITE_SHA, obtener, obtenerSC, obtenerCSV, familias, dex4, leerJSON, escribirJSON,
  codificarPNG, stats, volcarFaltas, SC_RAW, opciones,
} from './comun.mjs';

const BASICAS = ['Idle', 'Walk', 'Attack', 'Sleep', 'Hurt'];
const EXTRAS = ['Hop', 'Faint'];
const EMO_BASE = ['Normal', 'Happy', 'Pain', 'Joyous', 'Surprised', 'Worried'];
const EMO_VARIO = ['Normal', 'Happy'];
const LIMITE_EXTRA = 25 * 1024;
const FILAS = [0, 2, 6];
const MUESTRA = ['0001', '0004', '0007', '0025', '0133', '0010', '0016', '0041', '0074', '0092',
  '0094', '0129', '0130', '0147', '0149', '0208', '0280', '0282', '0376', '0150'];

const OUT = join(RAIZ, 'assets', 'pmd');

function argSolo() {
  const i = process.argv.indexOf('--solo');
  if (i < 0) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) return MUESTRA;
  return v.split(',').map((s) => dex4(s.trim()));
}

function parseAnimData(xml) {
  const ss = +(/<ShadowSize>(\d+)<\/ShadowSize>/.exec(xml)?.[1] ?? 1);
  const anims = {};
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const b = m[1];
    const tag = (t) => /* */ (new RegExp(`<${t}>([^<]*)</${t}>`).exec(b)?.[1]);
    const name = tag('Name');
    if (!name) continue;
    anims[name] = {
      copyOf: tag('CopyOf') || null,
      fw: +tag('FrameWidth') || 0,
      fh: +tag('FrameHeight') || 0,
      hit: tag('HitFrame') != null ? +tag('HitFrame') : null,
      d: [...b.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((x) => +x[1]),
    };
  }
  return { ss, anims };
}

function recortar(png, fw, fh, filas) {
  const w = png.width;
  const out = Buffer.alloc(w * fh * filas.length * 4);
  filas.forEach((f, i) => {
    png.data.copy(out, i * w * fh * 4, f * w * fh * 4, (f + 1) * w * fh * 4);
  });
  return { w, h: fh * filas.length, data: out };
}

function leerCreditos(txt) {
  if (!txt) return [];
  const vistos = new Set();
  const res = [];
  for (const linea of txt.toString('utf8').split(/\r?\n/)) {
    const c = linea.split('\t');
    if (c.length < 4 || c[2] !== 'CUR') continue;
    const a = idArtista(c[1]);
    const lic = c[3] || 'Unspecified';
    const k = a + '|' + lic;
    if (vistos.has(k)) continue;
    vistos.add(k);
    res.push({ a, lic });
  }
  return res;
}
const idArtista = (s) => s.replace(/^<@!?/, '').replace(/>$/, '').trim();

/** Procesa una variante (base o variocolor). Devuelve { a, archivos, avisos, extras } */
async function procesarSprites(d, nodo, prefijo, avisos, xmlRespaldo) {
  let xmlBuf = await obtenerSC(`sprite/${d}/${prefijo}AnimData.xml`);
  if (!xmlBuf && xmlRespaldo) xmlBuf = xmlRespaldo;
  if (!xmlBuf) throw new Error(`${d}: falta AnimData.xml (${prefijo || 'base'})`);
  const { ss, anims } = parseAnimData(xmlBuf.toString('utf8'));
  const a = {};
  const archivos = [];
  const extras = [];
  for (const nombre of [...BASICAS, ...EXTRAS]) {
    const extra = EXTRAS.includes(nombre);
    if (extra && !(nombre in nodo.sprite_files)) continue;
    let def = anims[nombre];
    if (!def) {
      if (extra) continue;
      throw new Error(`${d}${prefijo ? ' (vario)' : ''}: AnimData sin ${nombre}`);
    }
    let fuente = nombre;
    if (def.copyOf) {
      if (extra) { avisos.push(`${d}: ${nombre} es CopyOf ${def.copyOf}, se omite (respaldo en el juego)`); continue; }
      const visto = new Set([nombre]);
      while (def.copyOf) {
        fuente = def.copyOf;
        if (visto.has(fuente) || !anims[fuente]) throw new Error(`${d}: CopyOf roto en ${nombre}`);
        visto.add(fuente);
        def = anims[fuente];
      }
    }
    const buf = await obtenerSC(`sprite/${d}/${prefijo}${fuente}-Anim.png`);
    if (!buf) {
      if (extra) continue;
      throw new Error(`${d}${prefijo ? ' (vario)' : ''}: no se pudo bajar ${fuente}-Anim.png`);
    }
    const png = PNG.sync.read(buf);
    const { fw, fh } = def;
    const nFilas = Math.round(png.height / fh);
    const nFrames = Math.round(png.width / fw);
    if (png.height % fh || png.width % fw) avisos.push(`${d}: ${nombre} mide ${png.width}x${png.height}, no múltiplo de ${fw}x${fh}`);
    let dur = def.d.slice();
    if (dur.length !== nFrames) {
      avisos.push(`${d}: ${nombre} tiene ${nFrames} frames y ${dur.length} duraciones; se ajusta`);
      dur = dur.slice(0, nFrames);
      while (dur.length < nFrames) dur.push(dur[dur.length - 1] || 4);
    }
    const filas = nFilas === 1 ? [0] : FILAS.filter((f) => f < nFilas);
    if (nFilas !== 1 && nFilas !== 8) avisos.push(`${d}: ${nombre} tiene ${nFilas} filas`);
    const rec = filas.length === nFilas && nFilas === 1 ? { w: png.width, h: fh, data: png.data.subarray(0, png.width * fh * 4) } : recortar(png, fw, fh, filas);
    const salida = codificarPNG(rec.w, rec.h, rec.data);
    if (extra && salida.length > LIMITE_EXTRA) { avisos.push(`${d}: ${nombre} pesa ${(salida.length / 1024).toFixed(1)} KB, se descarta`); continue; }
    const ent = { fw, fh, d: dur, r: filas };
    if (def.hit != null) ent.hit = def.hit;
    a[nombre] = ent;
    archivos.push({ ruta: `${prefijo ? 'v/' : ''}${nombre}.png`, buf: salida });
    if (extra) extras.push(nombre);
  }
  return { ss, a, archivos, extras, xmlBuf };
}

async function procesarRetratos(d, nodo, prefijo, emociones) {
  const p = [];
  const archivos = [];
  for (const emo of emociones) {
    if (!(emo in (nodo.portrait_files || {}))) continue;
    const buf = await obtenerSC(`portrait/${d}/${prefijo}${emo}.png`);
    if (!buf) continue;
    let salida = buf;
    try {
      const png = PNG.sync.read(buf);
      const re = codificarPNG(png.width, png.height, png.data);
      if (re.length < buf.length) salida = re;
    } catch { /* se deja tal cual */ }
    p.push(emo);
    archivos.push({ ruta: `${prefijo ? 'v/' : ''}p/${emo}.png`, buf: salida });
  }
  return { p, archivos };
}

function validarBase(d, n) {
  const fallos = [];
  if (!n) return ['no está en tracker.json'];
  if (!(n.sprite_complete >= 1)) fallos.push(`sprite_complete=${n.sprite_complete}`);
  for (const k of BASICAS) if (!(k in (n.sprite_files || {}))) fallos.push(`sin ${k}`);
  if (!('Normal' in (n.portrait_files || {}))) fallos.push('sin retrato Normal');
  return fallos;
}
function nodoVario(n) { return n?.subgroups?.['0000']?.subgroups?.['0001'] || null; }
function varioValido(n) {
  const s = nodoVario(n);
  return !!s && s.sprite_complete >= 1 && BASICAS.every((k) => k in (s.sprite_files || {}));
}

async function enLotes(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

async function main() {
  const t0 = Date.now();
  const lista = await leerJSON(join(RAIZ, 'tools', 'species-list.json'));
  const todas = lista.todas.map(dex4);
  const solo = argSolo();
  const objetivo = solo || todas;
  for (const d of objetivo) if (!todas.includes(d)) throw new Error(`--solo: ${d} no está en species-list.json`);

  const trackerBuf = await obtener('tracker.json', [SC_RAW + 'tracker.json']);
  const namesBuf = await obtener('credit_names.txt', [SC_RAW + 'credit_names.txt']);
  if (!trackerBuf || !namesBuf) throw new Error('No se pudo obtener tracker.json o credit_names.txt');
  const tracker = JSON.parse(trackerBuf.toString('utf8'));

  // Validación básica de toda la lista (SPEC §13.3 paso 2)
  const errores = [];
  for (const d of todas) {
    const f = validarBase(d, tracker[d]);
    if (f.length) errores.push(`${d}: ${f.join(', ')}`);
  }
  if (errores.length) { console.error('Especies que fallan lo básico:\n' + errores.join('\n')); process.exit(1); }

  // Variocolor por familia (con familias de PokeAPI)
  const fam = familias(await obtenerCSV('pokemon_species'));
  const porFam = {};
  for (const d of todas) { const r = dex4(fam.raiz(+d)); (porFam[r] ||= []).push(d); }
  const vario = {};
  const famSinVario = [];
  for (const [r, miembros] of Object.entries(porFam)) {
    const ok = miembros.every((d) => varioValido(tracker[d]));
    for (const d of miembros) vario[d] = ok;
    if (!ok) famSinVario.push(`${r} (fallan: ${miembros.filter((d) => !varioValido(tracker[d])).join(',')})`);
  }

  const avisos = [];
  const manifest = { v: 1, sha: SPRITE_SHA, esp: {} };
  const creditosEsp = {};
  const conExtras = [];
  const tamanos = {};

  await mkdir(OUT, { recursive: true });
  await enLotes(objetivo, 6, async (d) => {
    const n = tracker[d];
    const base = await procesarSprites(d, n, '', avisos);
    const ret = await procesarRetratos(d, n, '', EMO_BASE);
    const ent = { ss: base.ss, a: base.a, p: ret.p };
    let archivos = [...base.archivos, ...ret.archivos];
    const cred = {
      sprite: leerCreditos(await obtenerSC(`sprite/${d}/credits.txt`)),
      retrato: leerCreditos(await obtenerSC(`portrait/${d}/credits.txt`)),
    };
    if (base.extras.length) conExtras.push(`${d}:${base.extras.join('+')}`);
    if (vario[d]) {
      const nv = nodoVario(n);
      const vs = await procesarSprites(d, nv, '0000/0001/', avisos, base.xmlBuf);
      const vr = await procesarRetratos(d, nv, '0000/0001/', EMO_VARIO);
      ent.vario = { a: vs.a, p: vr.p };
      archivos.push(...vs.archivos, ...vr.archivos);
      cred.vSprite = leerCreditos(await obtenerSC(`sprite/${d}/0000/0001/credits.txt`));
      cred.vRetrato = leerCreditos(await obtenerSC(`portrait/${d}/0000/0001/credits.txt`));
      if (!vr.p.length) avisos.push(`${d}: variocolor sin retratos propios (el juego usa los normales)`);
    }
    const dir = join(OUT, d);
    await rm(dir, { recursive: true, force: true });
    let total = 0, totalV = 0;
    for (const f of archivos) {
      const ruta = join(dir, f.ruta);
      await mkdir(join(ruta, '..'), { recursive: true });
      await writeFile(ruta, f.buf);
      if (f.ruta.startsWith('v/')) totalV += f.buf.length; else total += f.buf.length;
    }
    tamanos[d] = { base: total, vario: totalV };
    manifest.esp[d] = ent;
    creditosEsp[d] = cred;
    process.stdout.write('.');
  });
  process.stdout.write('\n');
  await volcarFaltas();

  // Orden estable
  manifest.esp = Object.fromEntries(Object.entries(manifest.esp).sort(([a], [b]) => a.localeCompare(b)));

  // Artistas
  const nombres = {};
  for (const linea of namesBuf.toString('utf8').split(/\r?\n/).slice(1)) {
    const [nombre, discord, contacto] = linea.split('\t');
    if (!discord) continue;
    nombres[idArtista(discord)] = { n: (nombre || '').trim(), c: (contacto || '').trim() };
  }
  const usados = new Set();
  for (const c of Object.values(creditosEsp)) for (const lista2 of Object.values(c)) for (const x of lista2) usados.add(x.a);
  const artistas = {};
  for (const id of [...usados].sort()) {
    const info = nombres[id];
    const e = { n: info?.n || id };
    // Algunos contactos vienen entre < > en credit_names.txt (<https://…>): se quitan antes de validar.
    const contacto = (info?.c || '').replace(/^<|>$/g, '').trim();
    if (/^https?:\/\//.test(contacto)) e.url = contacto;
    artistas[id] = e;
  }
  const creditos = {
    fuente: {
      nombre: 'PMD Sprite Repository (PMDCollab)',
      url: 'https://sprites.pmdcollab.org/',
      repo: 'https://github.com/PMDCollab/SpriteCollab',
      sha: SPRITE_SHA,
      licencia: 'CC BY-NC 4.0',
      licenciaUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
      adaptacion: 'Adaptados: recortados a 3 direcciones (abajo, derecha, izquierda) y reempaquetados; sin cambios de dibujo.',
      chunsoft: 'Los sprites marcados CHUNSOFT proceden de los juegos originales de Pokémon Mystery Dungeon (Spike Chunsoft) y no están bajo licencia CC.',
      licencias: {
        'CC_BY-NC_4': 'Creative Commons Atribución-NoComercial 4.0 Internacional',
        PMDCollab_1: 'Términos de envío de PMDCollab, versión 1 (uso no comercial con atribución)',
        PMDCollab_2: 'Términos de envío de PMDCollab, versión 2 (uso no comercial con atribución)',
        Unspecified: 'Sin licencia indicada (habitual en los sprites originales de CHUNSOFT)',
      },
      pokeapi: 'Datos: PokéAPI (BSD-3-Clause), © 2013–2023 Paul Hallett and PokéAPI contributors',
    },
    artistas,
    esp: Object.fromEntries(Object.entries(creditosEsp).sort(([a], [b]) => a.localeCompare(b))),
  };

  await escribirJSON(join(RAIZ, 'assets', 'manifest.json'), manifest, true);
  await escribirJSON(join(RAIZ, 'assets', 'creditos.json'), creditos);
  await escribirJSON(join(CACHE, 'vario.json'), vario);

  // Limpieza de carpetas de especies que ya no están (solo en la ejecución completa)
  if (!solo) {
    for (const e of await readdir(OUT)) if (!todas.includes(e)) await rm(join(OUT, e), { recursive: true, force: true });
  }

  const sum = (k) => Object.values(tamanos).reduce((s, x) => s + x[k], 0);
  const tb = sum('base'), tv = sum('vario');
  const nVario = Object.values(tamanos).filter((x) => x.vario > 0).length;
  const informe = {
    especies: objetivo.length,
    bytesBase: tb, bytesVario: tv, bytesTotal: tb + tv,
    mediaBaseKB: +(tb / objetivo.length / 1024).toFixed(1),
    mediaVarioKB: nVario ? +(tv / nVario / 1024).toFixed(1) : 0,
    proyeccion222MB: +(((tb + tv) / objetivo.length) * todas.length / 1048576).toFixed(2),
    conExtras: conExtras.sort(),
    familiasSinVario: famSinVario.sort(),
    avisos,
    red: stats, segundos: Math.round((Date.now() - t0) / 1000),
  };
  await escribirJSON(join(CACHE, 'informe-assets.json'), informe);
  console.log(`Especies: ${informe.especies}`);
  console.log(`Tamaño: base ${(tb / 1048576).toFixed(2)} MB + variocolor ${(tv / 1048576).toFixed(2)} MB = ${((tb + tv) / 1048576).toFixed(2)} MB`);
  console.log(`Media por especie: ${informe.mediaBaseKB} KB base, ${informe.mediaVarioKB} KB variocolor`);
  if (solo) console.log(`Proyección a ${todas.length} especies: ${informe.proyeccion222MB} MB`);
  if ((tb / objetivo.length / 1024) > 45) console.log('AVISO: la media base supera 45 KB por especie (SPEC §13.3 paso 8).');
  console.log(`Con extras (Hop/Faint): ${conExtras.length}`);
  console.log(`Familias sin variocolor: ${famSinVario.length}\n  ${famSinVario.join('\n  ')}`);
  if (avisos.length) console.log(`Avisos (${avisos.length}):\n  ${avisos.slice(0, 40).join('\n  ')}${avisos.length > 40 ? '\n  …' : ''}`);
  console.log(`Red: ${stats.red} descargas (${(stats.bytesRed / 1048576).toFixed(1)} MB), caché: ${stats.cache}. ${informe.segundos} s.`);
  void opciones;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
