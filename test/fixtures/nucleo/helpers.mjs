// Ayudas de las pruebas de NÚCLEO: datos de fixture y guardados mínimos (§12.1) sin depender de state.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function cargarFixture() {
  const leer = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), 'utf8'));
  const especies = leer('especies').especies;
  const islas = leer('islas').sort((a, b) => a.id - b.id);
  const islaPorId = {};
  for (const i of islas) islaPorId[i.id] = i;
  return { especies, islas, islaPorId, tipos: leer('tipos'), textos: {} };
}

let n = 0;
export function mon(sp, extra = {}) {
  n++;
  return {
    id: extra.id || `m_t${String(n).padStart(4, '0')}`, sp, vr: false, ap: '', nv: 5, xp: 0, est: 0, car: 0,
    ot: 'local', otn: '', f: 0, de: 'faro', dia: [], fav: false, noEvo: false, toq: 0, ...extra,
  };
}

export function save(extra = {}) {
  const s = {
    saveVersion: 1, creado: 0, ultimaVez: 0, idDispositivo: 'test', nombre: 'Prueba', guia: '0004', faro: 'norte',
    monedas: 0, bayas: 0, objetos: {}, caramelos: {},
    base: { huerto: 0, despensa: 0, muelle: 0, linterna: 0, taberna: 0, ultimaRecogida: 0 },
    pokemon: [], equipos: [{ miembros: [], roles: [], ultimoPlan: null, exp: null }],
    islas: { 1: { pisoMax: 0, jefe: false, dominio: 0, dominioJefe: [false, false, false], piedad: 0, huellas: {}, huevo: false } },
    misterio: { wk: 0, record: 0 }, bitacora: { visto: {}, tenido: {} }, album: {}, cadenas: {},
    visitante: null, diarioExp: [], informesSinEspecial: 0, tutorial: { paso: 9, enviadas: 10 },
    misiones: { dia: 0, lista: [], semanal: null, cambios: 0, pendientes: [] }, diasJugados: [],
    stats: { exps: 10, jefes: 0, mejorP: 0 }, trade: { applied: {}, reserved: {}, pending: {}, leagues: [] },
    ajustes: { duplicados: 'fusionar', sonido: 0.6, reducirAnim: false },
  };
  return Object.assign(s, extra);
}

/** Un mediodía local fijo (para que la marea y la patrulla nocturna no dependan del reloj). */
export function mediodia() {
  return new Date(2026, 10, 18, 12, 0, 0).getTime();
}
