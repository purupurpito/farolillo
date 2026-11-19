#!/usr/bin/env node
// Farolillo — comprobación de datos y assets generados (SPEC §13.2 paso 5 y §16 «Datos»). Dueño: DATOS.
// Uso: node tools/check.mjs   (sin red, sin dependencias). Sale con código ≠ 0 si algo falla.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(import.meta.url), '..', '..');

export const TIPOS = ['normal', 'fuego', 'agua', 'planta', 'electrico', 'hielo', 'lucha', 'veneno', 'tierra',
  'volador', 'psiquico', 'bicho', 'roca', 'fantasma', 'dragon', 'siniestro', 'acero', 'hada'];
export const OBJETOS = ['piedra_hoja', 'piedra_agua', 'piedra_lunar', 'piedra_ocaso', 'piedra_fuego', 'piedra_hielo',
  'garra_afilada', 'piedra_trueno', 'piedra_solar', 'piedra_dia', 'piedra_alba', 'cordon_amistad', 'baya_grande'];
const CONDICIONES = ['nivel', 'piedra', 'amistad', 'intercambio', 'objeto'];
const BASICAS = ['Idle', 'Walk', 'Attack', 'Sleep', 'Hurt'];
const LICENCIAS = ['CC_BY-NC_4', 'PMDCollab_1', 'PMDCollab_2', 'Unspecified'];

/** Valida especies/islas/tipos (lo usa también build-data). Devuelve lista de errores. */
export function validarDatos({ especies, islas, tipos }) {
  const err = [];
  const E = especies.especies;
  const ids = Object.keys(E);
  if (ids.length !== 222) err.push(`especies.json tiene ${ids.length} especies (se esperaban 222)`);
  // tipos
  if (JSON.stringify(tipos.ids) !== JSON.stringify(TIPOS)) err.push('tipos.json: ids distintos de SPEC §3.1');
  for (const t of TIPOS) {
    if (!tipos.nombres?.[t]) err.push(`tipos.json: falta nombre de ${t}`);
    for (const [d, f] of Object.entries(tipos.ef?.[t] || {})) {
      if (!TIPOS.includes(d)) err.push(`tipos.json: ef.${t}.${d} no es un tipo`);
      if (![2, 0.5, 0].includes(f)) err.push(`tipos.json: ef.${t}.${d}=${f}`);
    }
  }
  if (!tipos.ef?.fuego || tipos.ef.fuego.planta !== 2 || tipos.ef.normal?.fantasma !== 0) err.push('tipos.json: tabla de eficacia sospechosa');
  // especies
  const porTipo = Object.fromEntries(TIPOS.map((t) => [t, 0]));
  for (const [d, e] of Object.entries(E)) {
    const p = `especie ${d}`;
    if (!/^\d{4}$/.test(d)) err.push(`${p}: id no es dex4`);
    if (!e.n) err.push(`${p}: sin nombre`);
    if (typeof e.g !== 'string') err.push(`${p}: género no es cadena`);
    if (!(e.gen >= 1 && e.gen <= 4)) err.push(`${p}: gen ${e.gen}`);
    if (!Array.isArray(e.t) || !e.t.length || e.t.length > 2 || e.t.some((t) => !TIPOS.includes(t))) err.push(`${p}: tipos ${e.t}`);
    else e.t.forEach((t) => porTipo[t]++);
    if (!Array.isArray(e.s) || e.s.length !== 6 || e.s.reduce((a, b) => a + b, 0) !== e.tot) err.push(`${p}: stats/tot`);
    if (!['C', 'PC', 'R', 'L'].includes(e.rar)) err.push(`${p}: rar ${e.rar}`);
    if (!E[e.fam]) err.push(`${p}: fam ${e.fam} fuera de la lista`);
    else if (E[e.fam].pre) err.push(`${p}: fam ${e.fam} no es base`);
    if (e.pre != null && !E[e.pre]) err.push(`${p}: pre ${e.pre} fuera de la lista`);
    if (e.pre != null && E[e.pre] && !E[e.pre].evo.some((x) => x.a === d)) err.push(`${p}: ${e.pre} no lo lista en evo`);
    if (!['norte', 'este', 'sur', 'oeste', null].includes(e.exc)) err.push(`${p}: exc ${e.exc}`);
    if (typeof e.vario !== 'boolean' || typeof e.leg !== 'boolean') err.push(`${p}: vario/leg`);
    if (e.leg !== (e.rar === 'L')) err.push(`${p}: leg y rar no cuadran`);
    for (const x of e.evo || []) {
      if (!E[x.a]) err.push(`${p}: evoluciona a ${x.a}, fuera de la lista`);
      else if (E[x.a].pre !== d) err.push(`${p}: evo ${x.a} con pre ${E[x.a].pre}`);
      if (!CONDICIONES.includes(x.c)) err.push(`${p}: condición ${x.c}`);
      if (x.c === 'nivel' && !(x.lv > 0)) err.push(`${p}: nivel sin lv`);
      if ((x.c === 'piedra' || x.c === 'objeto') && !OBJETOS.includes(x.it)) err.push(`${p}: objeto ${x.it}`);
      if (x.c === 'amistad' && x.momento != null && !['dia', 'noche'].includes(x.momento)) err.push(`${p}: momento ${x.momento}`);
    }
    if (E[e.fam] && E[e.fam].vario !== e.vario) err.push(`${p}: vario distinto del de su familia`);
    if (E[e.fam] && E[e.fam].exc !== e.exc) err.push(`${p}: exc distinto del de su familia`);
  }
  for (const [t, n] of Object.entries(porTipo)) if (n < 8) err.push(`tipo ${t}: solo ${n} especies (mínimo 8)`);
  // islas
  if (!Array.isArray(islas) || islas.length !== 8) err.push('islas.json: se esperaban 8 islas');
  const miembros = (b) => ids.filter((d) => E[d].fam === b);
  for (const isla of islas || []) {
    const p = `isla ${isla.id} ${isla.clave}`;
    for (const k of ['id', 'clave', 'n', 'tipos', 'F', 'tBase', 'jefe', 'fondo', 'especies', 'evolTardias', 'objetos', 'leg', 'dominioRaro']) {
      if (isla[k] === undefined) err.push(`${p}: falta ${k}`);
    }
    if (isla.tipos?.some((t) => !TIPOS.includes(t))) err.push(`${p}: tipos`);
    for (const d of [isla.jefe, isla.dominioRaro, ...(isla.leg || [])]) if (!E[d]) err.push(`${p}: ${d} fuera de la lista`);
    for (const d of isla.leg || []) if (E[d] && E[d].rar !== 'L') err.push(`${p}: ${d} en leg no es L`);
    for (const o of isla.objetos || []) if (!OBJETOS.includes(o)) err.push(`${p}: objeto ${o}`);
    const todas = new Set();
    for (const b of [...(isla.especies || []), ...(isla.sec || [])]) {
      if (!E[b]) { err.push(`${p}: ${b} fuera de la lista`); continue; }
      if (E[b].pre) err.push(`${p}: ${b} no es base de familia`);
      miembros(b).forEach((m) => todas.add(m));
    }
    for (const b of Object.keys(isla.extra || {})) if (!E[b] || E[b].pre) err.push(`${p}: extra ${b} no es base`);
    if (todas.size < 15) err.push(`${p}: solo ${todas.size} especies (mínimo 15)`);
  }
  return err;
}

function pngDim(ruta) {
  const b = readFileSync(ruta);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

export function validarAssets({ especies, manifest, creditos }) {
  const err = [];
  const avisos = [];
  const E = especies.especies;
  const M = manifest.esp || {};
  if (manifest.sha !== especies.sha) err.push('manifest.sha distinto de especies.sha');
  const esperadas = new Set();
  for (const d of Object.keys(E)) {
    const m = M[d];
    if (!m) { err.push(`manifest: falta ${d}`); continue; }
    if (![0, 1, 2].includes(m.ss)) err.push(`manifest ${d}: ss ${m.ss}`);
    const revisar = (a, pref, etiqueta) => {
      for (const k of BASICAS) if (!a?.[k]) err.push(`manifest ${d}${etiqueta}: falta ${k}`);
      for (const [k, x] of Object.entries(a || {})) {
        const ruta = join(RAIZ, 'assets', 'pmd', d, pref + k + '.png');
        esperadas.add(ruta);
        if (!existsSync(ruta)) { err.push(`falta ${ruta}`); continue; }
        const dim = pngDim(ruta);
        if (!dim) { err.push(`${ruta}: no es PNG`); continue; }
        if (!x.r?.length || !x.r.every((f) => [0, 2, 6].includes(f))) err.push(`manifest ${d}${etiqueta} ${k}: r=${x.r}`);
        if (dim.w !== x.fw * x.d.length || dim.h !== x.fh * x.r.length) {
          err.push(`${d}${etiqueta} ${k}: PNG ${dim.w}x${dim.h}, manifest ${x.fw}x${x.d.length} por ${x.fh}x${x.r.length}`);
        }
        if (x.d.some((v) => !(v > 0))) err.push(`manifest ${d}${etiqueta} ${k}: duración inválida`);
        if (x.hit != null && !(x.hit >= 0 && x.hit < x.d.length)) err.push(`manifest ${d}${etiqueta} ${k}: hit ${x.hit}`);
      }
    };
    const retratos = (p, pref, etiqueta, obligatorio) => {
      if (obligatorio && !p?.includes('Normal')) err.push(`manifest ${d}${etiqueta}: sin retrato Normal`);
      for (const emo of p || []) {
        const ruta = join(RAIZ, 'assets', 'pmd', d, pref + 'p', emo + '.png');
        esperadas.add(ruta);
        if (!existsSync(ruta)) err.push(`falta ${ruta}`);
        else { const dim = pngDim(ruta); if (!dim || dim.w !== 40 || dim.h !== 40) err.push(`${ruta}: no mide 40x40`); }
      }
    };
    revisar(m.a, '', '');
    retratos(m.p, '', '', true);
    if (E[d].vario) {
      if (!m.vario) err.push(`manifest ${d}: vario=true en especies pero sin variante`);
      else { revisar(m.vario.a, 'v/', ' (vario)'); retratos(m.vario.p, 'v/', ' (vario)', false); if (!m.vario.p?.length) avisos.push(`${d}: variocolor sin retratos propios`); }
    } else if (m.vario) err.push(`manifest ${d}: tiene variante pero vario=false`);
    // créditos
    const c = creditos.esp?.[d];
    if (!c) { err.push(`creditos: falta ${d}`); continue; }
    if (!c.sprite?.length) err.push(`creditos ${d}: sin autor de sprite`);
    if (!c.retrato?.length) err.push(`creditos ${d}: sin autor de retrato`);
    if (E[d].vario && !c.vSprite?.length) err.push(`creditos ${d}: sin autor de sprite variocolor`);
    for (const lista of Object.values(c)) for (const x of lista) {
      if (!creditos.artistas?.[x.a]) err.push(`creditos ${d}: artista ${x.a} sin ficha`);
      if (!LICENCIAS.includes(x.lic)) err.push(`creditos ${d}: licencia ${x.lic}`);
    }
  }
  for (const d of Object.keys(M)) if (!E[d]) err.push(`manifest: ${d} sobra`);
  for (const [id, a] of Object.entries(creditos.artistas || {})) {
    if (!a.n) err.push(`artista ${id}: sin nombre`);
    if (a.url && !/^https?:\/\//.test(a.url)) err.push(`artista ${id}: url ${a.url}`);
  }
  if (!creditos.fuente?.licenciaUrl) err.push('creditos: falta fuente/licencia');
  // archivos huérfanos
  const dirPmd = join(RAIZ, 'assets', 'pmd');
  let total = 0, n = 0;
  const recorrer = (dir) => {
    for (const f of readdirSync(dir)) {
      const r = join(dir, f);
      const st = statSync(r);
      if (st.isDirectory()) recorrer(r);
      else { total += st.size; n++; if (!esperadas.has(r)) avisos.push(`archivo sobrante: ${r}`); }
    }
  };
  if (existsSync(dirPmd)) recorrer(dirPmd);
  return { err, avisos, total, n };
}

function leer(r) { return JSON.parse(readFileSync(join(RAIZ, r), 'utf8')); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errores = [];
  let datos;
  try {
    datos = {
      especies: leer('data/especies.json'), islas: leer('data/islas.json'), tipos: leer('data/tipos.json'),
      manifest: leer('assets/manifest.json'), creditos: leer('assets/creditos.json'),
    };
  } catch (e) {
    console.error('ERROR leyendo datos:', e.message);
    process.exit(1);
  }
  errores.push(...validarDatos(datos));
  const r = validarAssets(datos);
  errores.push(...r.err);
  for (const a of r.avisos.slice(0, 30)) console.log('aviso:', a);
  if (r.avisos.length > 30) console.log(`… y ${r.avisos.length - 30} avisos más`);
  console.log(`Especies: ${Object.keys(datos.especies.especies).length} · Archivos en assets/pmd: ${r.n} · ${(r.total / 1048576).toFixed(2)} MB`);
  if (errores.length) {
    console.error(`FALLA (${errores.length}):\n  ` + errores.slice(0, 80).join('\n  ') + (errores.length > 80 ? '\n  …' : ''));
    process.exit(1);
  }
  console.log('OK: datos y assets correctos.');
}
