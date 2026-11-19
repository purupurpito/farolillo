// PRNG y semillas (§15.2). Sin DOM. Dueño: NÚCLEO.

/** PRNG mulberry32: devuelve una función que da números en [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Semilla uint32: FNV-1a de 32 bits sobre las partes unidas con '|'
 * (unidades UTF-16 de String(parte); cada unidad se mezcla en dos bytes si pasa de 255).
 */
export function hashSeed(...partes) {
  const s = partes.map(String).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) {
      h ^= c >>> 8;
      h = Math.imul(h, 0x01000193);
    }
    h ^= c & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Semana ISO de un instante, con la fecha en hora local (lunes 00:00 local).
 * Devuelve { año, semana, id } con id = año * 100 + semana.
 */
export function isoSemana(fechaMs) {
  const d = new Date(fechaMs);
  // Se trabaja en UTC con la fecha local para no depender del horario de verano.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaSemana = (t.getUTCDay() + 6) % 7; // lunes 0 … domingo 6
  t.setUTCDate(t.getUTCDate() - diaSemana + 3); // jueves de esa semana
  const año = t.getUTCFullYear();
  const primerJueves = new Date(Date.UTC(año, 0, 4));
  const ds = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - ds + 3);
  const semana = 1 + Math.round((t - primerJueves) / (7 * 86400000));
  return { año, semana, id: año * 100 + semana };
}

/**
 * Elige un valor de [[valor, peso], ...] con probabilidad proporcional al peso.
 * Pesos <= 0 se ignoran. Lista vacía o sin peso: null.
 */
export function elegirPonderado(rng, items) {
  let total = 0;
  for (const it of items) if (it[1] > 0) total += it[1];
  if (!(total > 0)) return null;
  let r = rng() * total;
  let ultimo = null;
  for (const it of items) {
    if (!(it[1] > 0)) continue;
    ultimo = it[0];
    r -= it[1];
    if (r < 0) return it[0];
  }
  return ultimo; // por redondeo
}

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Id aleatorio de n caracteres [a-z0-9]. Sin rng usa Math.random. */
export function idAleatorio(rng, n = 6) {
  const r = typeof rng === 'function' ? rng : Math.random;
  let s = '';
  for (let i = 0; i < n; i++) s += ALFABETO[Math.floor(r() * ALFABETO.length)];
  return s;
}
