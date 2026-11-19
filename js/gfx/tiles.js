// tiles.js — dueño: GRÁFICOS.
// Baldosas de 16 px generadas por código (sin tilesets de PMD), una por isla (§10),
// y las de la cala (arena, mar, madera del muelle, roca del faro).

export const TAM = 16;

/** Color de suelo por defecto si la isla no trae `fondo`. */
export const FONDOS = {
  prado: '#7fbf5a', arroyo: '#5aa7bf', cueva: '#8a7a66', bosque: '#3f5b3a',
  volcan: '#8f4a3a', pico: '#c9dde8', ruinas: '#9a9486', cumbre: '#8f86c9',
  misterio: '#6b5b8f', tutorial: '#7fbf5a',
  arena: '#e8d4a2', mar: '#3d6a8f', madera: '#8a5a36', roca: '#7d7f86',
};

const cache = new Map();

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngDe(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Mezcla un color hex con blanco (k>0) o negro (k<0). */
export function tono(hex, k) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const t = k > 0 ? 255 : 0, f = Math.abs(k);
  r = Math.round(r + (t - r) * f); g = Math.round(g + (t - g) * f); b = Math.round(b + (t - b) * f);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function lienzo() {
  const c = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined'
    ? new OffscreenCanvas(TAM, TAM) : document.createElement('canvas');
  c.width = TAM; c.height = TAM;
  return c;
}

const px = (x, c, X, Y, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };

/** Dibujantes por clave. Cada uno recibe (ctx2d, color base, rng). */
const PINTORES = {
  prado(x, f, r) {          // hierba con matojos y alguna flor
    for (let i = 0; i < 6; i++) { const X = r() * 14 | 0, Y = r() * 14 | 0; px(x, tono(f, -0.18), X, Y + 1, 1, 2); px(x, tono(f, -0.18), X + 2, Y + 1, 1, 2); px(x, tono(f, -0.1), X + 1, Y, 1, 3); }
    if (r() < 0.6) px(x, '#fff3c4', r() * 15 | 0, r() * 15 | 0);
  },
  arroyo(x, f, r) {         // agua somera con ondas y guijarros
    for (let i = 0; i < 3; i++) { const Y = 2 + i * 5 + (r() * 2 | 0), X = r() * 10 | 0; px(x, tono(f, 0.3), X, Y, 4, 1); px(x, tono(f, 0.15), X + 4, Y + 1, 2, 1); }
    if (r() < 0.5) px(x, tono(f, -0.25), r() * 14 | 0, r() * 14 | 0, 2, 1);
  },
  cueva(x, f, r) {          // roca con grietas
    px(x, tono(f, -0.15), 0, 15, 16, 1); px(x, tono(f, -0.15), 15, 0, 1, 16);
    let X = r() * 12 | 0, Y = 2;
    for (let i = 0; i < 6; i++) { px(x, tono(f, -0.3), X, Y); X += r() < 0.5 ? 1 : -1; Y += 2; X = Math.max(0, Math.min(15, X)); }
    px(x, tono(f, 0.15), r() * 14 | 0, r() * 14 | 0, 2, 1);
  },
  bosque(x, f, r) {         // hojarasca oscura
    for (let i = 0; i < 5; i++) { const X = r() * 13 | 0, Y = r() * 13 | 0; px(x, tono(f, i % 2 ? -0.25 : 0.12), X, Y, 2, 2); px(x, tono(f, -0.35), X + 1, Y + 2); }
  },
  volcan(x, f, r) {         // basalto con vetas de lava
    px(x, tono(f, -0.2), 0, 15, 16, 1);
    let X = 0, Y = r() * 14 | 0;
    while (X < 16) { px(x, '#ffb547', X, Y); if (r() < 0.3) px(x, '#e07a1f', X, Y + 1); X++; if (r() < 0.4) Y = Math.max(0, Math.min(15, Y + (r() < 0.5 ? 1 : -1))); }
    px(x, tono(f, -0.35), r() * 14 | 0, r() * 14 | 0, 2, 2);
  },
  pico(x, f, r) {           // nieve con brillos de hielo
    for (let i = 0; i < 4; i++) px(x, '#ffffff', r() * 15 | 0, r() * 15 | 0);
    px(x, tono(f, -0.12), r() * 12 | 0, r() * 15 | 0, 4, 1);
  },
  ruinas(x, f, r) {         // losas de piedra
    px(x, tono(f, -0.25), 0, 7, 16, 1); px(x, tono(f, -0.25), 0, 15, 16, 1);
    px(x, tono(f, -0.25), 7, 0, 1, 7); px(x, tono(f, -0.25), 3, 8, 1, 7); px(x, tono(f, -0.25), 12, 8, 1, 7);
    px(x, tono(f, 0.15), 0, 0, 7, 1); px(x, tono(f, 0.15), 0, 8, 3, 1);
    if (r() < 0.5) px(x, '#5fa35a', r() * 14 | 0, r() < 0.5 ? 6 : 14, 2, 1);
  },
  cumbre(x, f, r) {         // suelo de nubes con estrellitas
    for (let i = 0; i < 3; i++) { const X = r() * 12 | 0, Y = r() * 12 | 0; px(x, tono(f, 0.25), X, Y, 4, 2); px(x, tono(f, 0.25), X + 1, Y - 1, 2, 1); }
    if (r() < 0.6) px(x, '#fff3c4', r() * 15 | 0, r() * 15 | 0);
  },
  misterio(x, f, r) {       // damero con runa
    px(x, tono(f, -0.15), 0, 0, 8, 8); px(x, tono(f, -0.15), 8, 8, 8, 8);
    px(x, tono(f, 0.3), 3 + (r() * 2 | 0), 3, 2, 2);
  },
  arena(x, f, r) {
    for (let i = 0; i < 7; i++) px(x, tono(f, r() < 0.5 ? -0.08 : 0.12), r() * 16 | 0, r() * 16 | 0);
    if (r() < 0.25) px(x, '#f6efe0', r() * 14 | 0, r() * 14 | 0, 2, 1);
  },
  mar(x, f, r) {
    for (let i = 0; i < 2; i++) { const X = r() * 11 | 0, Y = 3 + i * 7 + (r() * 2 | 0); px(x, tono(f, 0.22), X, Y, 5, 1); }
  },
  madera(x, f) {
    px(x, tono(f, -0.25), 0, 0, 16, 1); px(x, tono(f, -0.25), 0, 8, 16, 1);
    px(x, tono(f, 0.12), 0, 1, 16, 1); px(x, tono(f, 0.12), 0, 9, 16, 1);
    px(x, tono(f, -0.4), 2, 4); px(x, tono(f, -0.4), 13, 12);
  },
  roca(x, f, r) {
    px(x, tono(f, -0.2), 0, 7, 16, 1); px(x, tono(f, -0.2), 0, 15, 16, 1);
    px(x, tono(f, -0.2), 5, 0, 1, 7); px(x, tono(f, -0.2), 11, 8, 1, 7);
    px(x, tono(f, 0.15), r() * 4 | 0, 1, 3, 1);
  },
};

/**
 * Baldosa de 16x16 (canvas) para una clave de isla (`prado`, `arroyo`, …, `misterio`)
 * o de la cala (`arena`, `mar`, `madera`, `roca`). `variante` da baldosas distintas
 * de la misma familia para romper la repetición.
 */
export function baldosa(clave, fondo, variante = 0) {
  const k = `${clave}|${fondo || ''}|${variante}`;
  let c = cache.get(k);
  if (c) return c;
  const f = fondo || FONDOS[clave] || '#7fbf5a';
  c = lienzo();
  const x = c.getContext('2d');
  x.fillStyle = f; x.fillRect(0, 0, TAM, TAM);
  const pintor = PINTORES[clave] || PINTORES.arena;
  pintor(x, f, rngDe(hash(k)));
  cache.set(k, c);
  return c;
}

/** CanvasPattern repetible de la baldosa (para fillRect de suelos). */
export function patron(ctx, clave, fondo) {
  const k = `pat|${clave}|${fondo || ''}`;
  // Un patrón con 2x2 variantes para que no se note la repetición.
  let big = cache.get(k);
  if (!big) {
    big = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(TAM * 2, TAM * 2);
    big.width = TAM * 2; big.height = TAM * 2;
    const x = big.getContext('2d');
    for (let i = 0; i < 4; i++) x.drawImage(baldosa(clave, fondo, i), (i % 2) * TAM, (i >> 1) * TAM);
    cache.set(k, big);
  }
  // El CanvasPattern se cachea por contexto (antes se creaba uno nuevo en cada rellenar: 60 por segundo).
  let porCtx = patrones.get(ctx);
  if (!porCtx) { porCtx = new Map(); patrones.set(ctx, porCtx); }
  let p = porCtx.get(k);
  if (!p) { p = ctx.createPattern(big, 'repeat'); porCtx.set(k, p); }
  return p;
}
const patrones = new WeakMap();

/** Rellena un rectángulo con el patrón desplazado `ox` px (para suelos que avanzan). */
export function rellenar(ctx, clave, fondo, x, y, w, h, ox = 0, oy = 0) {
  const p = patron(ctx, clave, fondo);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const dx = -(((Math.round(ox) % (TAM * 2)) + TAM * 2) % (TAM * 2));
  const dy = -(((Math.round(oy) % (TAM * 2)) + TAM * 2) % (TAM * 2));
  ctx.translate(x + dx, y + dy);
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, w + TAM * 2, h + TAM * 2);
  ctx.restore();
}
