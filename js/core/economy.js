// Edificios, huerto offline y visitantes (§7). Sin DOM. Dueño: ESTADO.
// v0.1: los visitantes están implementados pero apagados (solo se tiran con ctx.visitantes === true).

import { K, costeEdificio, tasaHuerto, nvOri, topeOfflineHoras, segundosEfectivos, costeVisitante as costeVis } from './formulas.js';
import { mulberry32, hashSeed, elegirPonderado } from './rng.js';

export const EDIFICIOS = ['huerto', 'despensa', 'muelle', 'linterna', 'taberna'];
export const NOMBRES_EDIFICIO = {
  huerto: 'Huerto de bayas', despensa: 'Despensa', muelle: 'Muelle', linterna: 'Linterna', taberna: 'Taberna Marea',
};
const H = 3600 * 1000;
const VISITA_CADA = K.VISITA_CADA * 1000;
const VISITA_P = K.VISITA_P;
const VISITA_DURA = K.VISITA_H * H;
const GEN_FARO = K.FARO_GEN;

/** Jefes de isla distintos vencidos (0-8). */
export function jefesVencidos(save) {
  let n = 0;
  for (let i = 1; i <= 8; i++) if (save.islas[i]?.jefe) n++;
  return n;
}

/** Isla desbloqueada más alta (1-8). */
export function islaMax(save) {
  let m = 1;
  for (let i = 1; i <= 8; i++) if (save.islas[i]) m = i;
  return m;
}

/** Tope offline en horas: 8 + nivel de Despensa. */
export function topeHoras(save) { return topeOfflineHoras(save.base.despensa | 0); }

/** Bayas por hora del huerto ahora mismo. */
export function tasaActual(save) { return tasaHuerto(save.base.huerto | 0, jefesVencidos(save)); }

/** Tiempo efectivo de producción (§7.2): 100 % las 2 primeras horas y 75 % el resto, con tope. */
export function tiempoEfectivo(save, ahora) {
  const dt = Math.max(0, Math.min(ahora - save.base.ultimaRecogida, topeHoras(save) * H));
  return segundosEfectivos(dt / 1000) * 1000;
}

/** Bayas que daría recoger ahora (sin mutar). */
export function pendienteHuerto(save, ahora) {
  const b = tasaActual(save) * tiempoEfectivo(save, ahora) / H + (save.base.restoBayas || 0);
  return Math.floor(b);
}

/** ¿El huerto ha llegado al tope offline? */
export function huertoLleno(save, ahora) {
  return ahora - save.base.ultimaRecogida >= topeHoras(save) * H;
}

/**
 * Recoge el huerto (y tira visitantes si ctx.visitantes). Muta el save.
 * Devuelve { bayas, visitas, caducado } (visitas = visitantes nuevos; caducado = sp del que se fue).
 */
export function producir(save, ahora, ctx = {}) {
  if (ahora < save.base.ultimaRecogida) save.base.ultimaRecogida = ahora; // reloj hacia atrás
  const exacto = tasaActual(save) * tiempoEfectivo(save, ahora) / H + (save.base.restoBayas || 0);
  const bayas = Math.floor(exacto);
  save.base.restoBayas = exacto - bayas;
  save.bayas += bayas;
  save.base.ultimaRecogida = ahora;

  let caducado = null;
  if (save.visitante && save.visitante.vence <= ahora) { caducado = save.visitante.sp; save.visitante = null; }
  let visitas = 0;
  if (ctx.visitantes) visitas = tirarVisitas(save, ahora, ctx);
  else save.base.ultimaVisita = ahora;
  return { bayas, visitas, caducado };
}

/** Por cada 2 h de cala (con el mismo tope offline) se tira un visitante si el hueco está libre. */
function tirarVisitas(save, ahora, ctx) {
  const desde = Math.max(save.base.ultimaVisita || 0, ahora - topeHoras(save) * H);
  if (ahora < desde) { save.base.ultimaVisita = ahora; return 0; }
  const n = Math.floor((ahora - desde) / VISITA_CADA);
  let visitas = 0;
  for (let k = 0; k < n; k++) {
    const t = desde + (k + 1) * VISITA_CADA;
    if (save.visitante && save.visitante.vence <= t) save.visitante = null;
    if (save.visitante) continue;
    const rng = mulberry32(hashSeed(save.idDispositivo, 'visita', t));
    if (tiraVisitante(save, rng, { ...ctx, ahora: t })) visitas++;
  }
  save.base.ultimaVisita = desde + n * VISITA_CADA;
  return visitas;
}

/** Tabla de especies posibles para un visitante: islas desbloqueadas, C o PC, sin L ni exclusivas de otro faro. */
export function tablaVisitante(save, datos) {
  const gen = GEN_FARO[save.faro] || 1;
  const C = [], PC = [];
  const vistos = new Set();
  for (const isla of datos.islas) {
    if (!save.islas[isla.id]) continue;
    for (const sp of isla.especies || []) {
      if (vistos.has(sp)) continue;
      vistos.add(sp);
      const e = datos.especies[sp];
      if (!e || e.leg || e.rar === 'L' || e.rar === 'R') continue;
      if (e.exc && e.exc !== save.faro) continue;
      const peso = e.gen === gen ? K.PESO_FARO_GEN : 1;
      (e.rar === 'PC' ? PC : C).push([sp, peso]);
    }
  }
  return { C, PC };
}

/** Coste en bayas de atender a un visitante (§7.3). */
export function costeVisitante(save, visitante) {
  return costeVis(islaMax(save), !!visitante?.pc);
}

/** Nivel con el que entra un visitante. */
export function nivelVisitante(save) { return Math.max(1, nvOri(islaMax(save)) - 3); }

/** Tira un visitante (p = 0.35) si el hueco está libre. Devuelve el visitante o null. */
export function tiraVisitante(save, rng, ctx) {
  if (save.visitante) return null;
  if (rng() >= VISITA_P) return null;
  const { C, PC } = tablaVisitante(save, ctx.datos);
  let pc = rng() < K.VISITA_PC && PC.length > 0;
  const tabla = pc ? PC : C.length ? C : PC;
  if (!tabla.length) return null;
  if (tabla === PC) pc = true;
  const sp = elegirPonderado(rng, tabla);
  save.visitante = { sp, llega: ctx.ahora, vence: ctx.ahora + VISITA_DURA, pc };
  return save.visitante;
}

/** nivelCala = suma de niveles de edificios / 5 (redondeo hacia abajo). */
export function nivelCala(save) {
  return Math.floor(EDIFICIOS.reduce((s, b) => s + (save.base[b] | 0), 0) / 5);
}

/** Info de un edificio para la UI. */
export function infoEdificio(save, id) {
  const nivel = save.base[id] | 0;
  const coste = costeEdificio(id, nivel);
  return { id, n: NOMBRES_EDIFICIO[id], nivel, coste, alTope: coste == null, asequible: coste != null && save.monedas >= coste };
}
