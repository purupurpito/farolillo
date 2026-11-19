// fx.js — dueño: GRÁFICOS. Efectos de los momentos especiales (SPEC §9.2.3, §15.2).
// En v0.1 son sencillos; las secuencias largas (§19 v0.2) se afinan después.
// Las secuencias usan un rAF propio y temporal mientras duran (el canvas es suyo en ese rato).

import * as S from './sprites.js';

function esperarFrame() { return new Promise(r => requestAnimationFrame(r)); }

/** Destello blanco breve sobre el canvas (con CSS, no pinta en él). */
export function destello(canvas) {
  if (!canvas || !canvas.animate) return Promise.resolve();
  const suave = S.reducirAnim();
  const a = canvas.animate(
    [{ filter: `brightness(${suave ? 1.4 : 3}) saturate(0.4)` }, { filter: 'brightness(1) saturate(1)' }],
    { duration: suave ? 250 : 420, easing: 'ease-out' });
  return a.finished.catch(() => {});
}

function fondo(ctx, dim) {
  ctx.fillStyle = '#14213d';
  ctx.fillRect(0, 0, dim.w + 1, dim.h + 1);
  // Halo de farol detrás del sprite.
  const cx = Math.round(dim.w / 2), cy = Math.round(dim.h * 0.72) - 10;
  for (let i = 3; i >= 1; i--) {
    ctx.fillStyle = `rgba(255,181,71,${0.06 * (4 - i)})`;
    ctx.beginPath(); ctx.arc(cx, cy, 14 * i, 0, Math.PI * 2); ctx.fill();
  }
}

function escalaPara(canvas) {
  const r = canvas.getBoundingClientRect();
  return r.height >= 240 ? 3 : 2;
}

/**
 * Evolución: siluetas de A y B que alternan cada vez más deprisa (~4 s), destello y B en color.
 * Resuelve al terminar (la UI muestra luego el texto «¡X se ha convertido en Y!»).
 */
export async function secuenciaEvolucion(canvas, spA, spB, vr = false) {
  await Promise.all([S.precargar(spA, ['Idle'], vr), S.precargar(spB, ['Idle', 'Hop'], vr)]);
  const dim = S.prepararCanvas(canvas, escalaPara(canvas));
  const ctx = dim.ctx;
  const suave = S.reducirAnim();
  const DUR = suave ? 2200 : 4000;
  const ini = performance.now();
  const x = Math.round(dim.w / 2), y = Math.round(dim.h * 0.72);
  for (;;) {
    const t = await esperarFrame() - ini;
    if (t >= DUR) break;
    const k = t / DUR;
    // Intervalo de cambio: de 520 ms a 60 ms (en suave, cambios lentos y sin parpadeo).
    const periodo = suave ? 700 : 520 - 460 * k * k;
    let acc = 0, cual = 0;
    while (acc + periodo <= t) { acc += periodo; cual ^= 1; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fondo(ctx, dim);
    S.dibujar(ctx, { sp: cual ? spB : spA, vr, anim: 'Idle', dir: 0, tMs: t, x, y, silueta: true });
  }
  destello(canvas);
  const fin = performance.now();
  for (;;) {
    const t = await esperarFrame() - fin;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fondo(ctx, dim);
    const hop = S.tieneAnim(spB, 'Hop', vr);
    S.dibujar(ctx, { sp: spB, vr, anim: hop ? 'Hop' : 'Idle', dir: 0, tMs: t, x, y, bucle: !hop });
    if (t > Math.max(900, hop ? S.duracionAnim(spB, 'Hop', vr) : 0)) break;
  }
}

/** Revelación variocolor: silueta, destello y el sprite variocolor con chispas (~2,5 s). */
export async function revelarVario(canvas, sp) {
  await S.precargar(sp, ['Idle', 'Hop'], true);
  const dim = S.prepararCanvas(canvas, escalaPara(canvas));
  const ctx = dim.ctx;
  const suave = S.reducirAnim();
  const x = Math.round(dim.w / 2), y = Math.round(dim.h * 0.72);
  const ini = performance.now();
  let destellado = false;
  for (;;) {
    const t = await esperarFrame() - ini;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fondo(ctx, dim);
    if (t < 700) {
      S.dibujar(ctx, { sp, vr: true, anim: 'Idle', dir: 0, tMs: t, x, y, silueta: true });
      continue;
    }
    if (!destellado) { destellado = true; destello(canvas); }
    const tt = t - 700;
    const hop = S.tieneAnim(sp, 'Hop', true);
    S.dibujar(ctx, { sp, vr: true, anim: hop && tt < S.duracionAnim(sp, 'Hop', true) ? 'Hop' : 'Idle', dir: 0, tMs: tt, x, y, bucle: !hop || tt >= S.duracionAnim(sp, 'Hop', true) });
    chispas(ctx, x, y - 20, tt, suave);
    if (tt > 1800) break;
  }
}

/** Estrellitas de 4 puntas girando alrededor de (cx, cy). */
export function chispas(ctx, cx, cy, t, suave = false) {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (suave ? 0 : t / 900);
    const r = 18 + 4 * Math.sin(t / 300 + i);
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.7);
    const on = suave || (Math.floor(t / 120) + i) % 3 !== 0;
    if (!on) continue;
    ctx.fillStyle = i % 2 ? '#fff3c4' : '#ffd84a';
    ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
  }
}

/**
 * Imagen para compartir: el contenido actual del canvas con una banda inferior con `texto`
 * y la firma «Farolillo». Devuelve un Blob PNG.
 */
export function capturaCompartir(canvas, texto = '') {
  // El búfer de las escenas está a px de sprite: se amplía con un factor ENTERO (el mismo S con el que se ve en
  // pantalla, o el que lleve el ancho a ≥ 720 px) y sin suavizado, para que la imagen salga grande y nítida.
  const dprReal = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const kPantalla = canvas._pxS || Math.max(1, Math.round((canvas.getBoundingClientRect().width * dprReal) / Math.max(1, canvas.width)));
  const k = Math.max(kPantalla, Math.ceil(720 / Math.max(1, canvas.width)));
  const W = canvas.width * k, Hc = canvas.height * k;
  const u = Math.max(1, W / 360);                 // unidad de la banda: proporcional al ancho de la imagen
  const banda = Math.round(40 * u);
  const c = document.createElement('canvas');
  c.width = W; c.height = Hc + banda;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#14213d'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, W, Hc);
  x.fillStyle = '#ffb547'; x.fillRect(0, Hc, c.width, Math.max(1, Math.round(2 * u)));
  x.fillStyle = '#f6efe0';
  x.textBaseline = 'middle';
  x.font = `${Math.round(14 * u)}px system-ui, sans-serif`;
  x.fillText(texto, Math.round(8 * u), Hc + banda / 2, c.width - Math.round(90 * u));
  x.textAlign = 'right';
  x.fillStyle = '#ffb547';
  x.font = `bold ${Math.round(13 * u)}px system-ui, sans-serif`;
  x.fillText('Farolillo', c.width - Math.round(8 * u), Hc + banda / 2);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('No se pudo crear la imagen.'))), 'image/png'));
}
