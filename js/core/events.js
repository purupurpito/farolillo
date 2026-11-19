// Clima semanal, marea y (v0.2) evento semanal. Sin DOM. Dueño: ESTADO.
// v0.1: solo clima semanal (§4.9) y marea; eventoSemana devuelve null.

import { hashSeed, isoSemana } from './rng.js';

export const TIPOS = ['normal', 'fuego', 'agua', 'planta', 'electrico', 'hielo', 'lucha', 'veneno',
  'tierra', 'volador', 'psiquico', 'bicho', 'roca', 'fantasma', 'dragon', 'siniestro', 'acero', 'hada'];

/**
 * Climas en el orden de hashSeed(semana, isla) % 5.
 * tipos: multiplicador de poder por tipo del miembro.
 * climaT: factor de duración. pesoRaros: factor del peso R en encuentros.
 * niebla: el Explorador cuenta doble; sin Explorador, P × sinExplorador.
 */
export const CLIMAS = {
  despejado: { id: 'despejado', n: 'Despejado', tipos: {}, climaT: 1, climaD: 1, climaP: 1, pesoRaros: 1 },
  niebla: { id: 'niebla', n: 'Niebla', tipos: {}, climaT: 1, climaD: 1, climaP: 1, pesoRaros: 1, exploradorDoble: true, sinExplorador: 0.9 },
  calor: { id: 'calor', n: 'Calor', tipos: { fuego: 1.2, hielo: 0.9, planta: 0.9 }, climaT: 1, climaD: 1, climaP: 1, pesoRaros: 1 },
  tormenta: { id: 'tormenta', n: 'Tormenta', tipos: { electrico: 1.15, agua: 1.15 }, climaT: 1.1, climaD: 1, climaP: 1, pesoRaros: 1 },
  luna: { id: 'luna', n: 'Luna llena', tipos: { fantasma: 1.2, siniestro: 1.2 }, climaT: 1, climaD: 1, climaP: 1, pesoRaros: 1.5 },
};
const ORDEN = ['despejado', 'niebla', 'calor', 'tormenta', 'luna'];

/** Id de semana (año*100 + semana ISO, hora local) de un instante. */
export function semanaDe(ahoraMs) { return isoSemana(ahoraMs).id; }

/** Clima ('despejado'|'niebla'|'calor'|'tormenta'|'luna') de una isla (1..8 o 'misterio') esa semana. */
export function climaSemana(semanaId, islaId) {
  return ORDEN[hashSeed(semanaId, islaId) % ORDEN.length];
}

/** Objeto de efectos de un clima (acepta id u objeto). */
export function efectosClima(clima) {
  if (clima && typeof clima === 'object') return clima;
  return CLIMAS[clima] || CLIMAS.despejado;
}

/** Mapa { "1": id, ..., "8": id, misterio: id } para el Ctx. */
export function climasDeLaSemana(semanaId) {
  const m = {};
  for (let i = 1; i <= 8; i++) m[i] = climaSemana(semanaId, i);
  m.misterio = climaSemana(semanaId, 'misterio');
  return m;
}

/**
 * Multiplicador de clima para un miembro con esos tipos (§4.9):
 * mayor bonus × menor malus (el malus más suave). Sin tipos afectados, 1.
 */
export function climaTipo(clima, tiposMon) {
  const ef = efectosClima(clima).tipos;
  let bonus = 1, malus = null;
  for (const t of tiposMon || []) {
    const f = ef[t];
    if (f == null) continue;
    if (f > 1) bonus = Math.max(bonus, f);
    else if (f < 1) malus = malus == null ? f : Math.max(malus, f);
  }
  return bonus * (malus ?? 1);
}

/** Evento semanal (v0.2). En v0.1 no hay: null. */
export function eventoSemana(_semanaId, _datos) { return null; }

/** Marea: de 22:00 a 07:00 locales. */
export function esNoche(ahoraMs) {
  const h = new Date(ahoraMs).getHours();
  return h >= 22 || h < 7;
}

/** Momento del día para evoluciones por amistad: 'dia' (07-19) o 'noche' (19-07). */
export function momentoDia(ahoraMs) {
  const h = new Date(ahoraMs).getHours();
  return h >= 7 && h < 19 ? 'dia' : 'noche';
}

/** Patrulla nocturna (§4.6): inicio entre 22:00 y 03:00 y horas >= 4. */
export function esPatrullaNocturna(inicioMs, horas) {
  const h = new Date(inicioMs).getHours();
  return (h >= 22 || h < 3) && horas >= 4;
}

/** Dos tipos distintos de la Mazmorra Misterio esa semana. */
export function tiposMisterio(semanaId) {
  const a = hashSeed(semanaId, 'misterio', 'a') % TIPOS.length;
  let b = hashSeed(semanaId, 'misterio', 'b') % (TIPOS.length - 1);
  if (b >= a) b++;
  return [TIPOS[a], TIPOS[b]];
}

/** Número de día local (para toques diarios y días jugados). */
export function diaLocal(ahoraMs) {
  const d = new Date(ahoraMs);
  return Math.floor((ahoraMs - d.getTimezoneOffset() * 60000) / 86400000);
}
