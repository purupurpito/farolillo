// tablero.js — Prototipo B. Pinta la cuadrícula del combate (canvas a px de sprite, ampliado con
// píxeles enteros de dispositivo) y hace las animaciones: andar por la ruta, atacar, proyectil,
// daño, empuje, desaparecer y números flotantes (capa DOM nítida encima del canvas).

import * as S from '../../../js/gfx/sprites.js';
import * as T from '../../../js/gfx/tiles.js';
import { COLS, FILAS, clave } from './reglas.js';
import { COLOR_TIPO } from './datos.js';

export const CEL = 24;              // px de sprite por casilla (el tamaño de baldosa de PMD)
const MS = 10;                      // margen de arriba para las cabezas de la fila 0
const MI = 2;                       // margen de abajo
export const ANCHO = COLS * CEL;
export const ALTO = MS + FILAS * CEL + MI;

const q = new URLSearchParams(location.search);
/** Velocidad de las animaciones (?rapido=1 para las pruebas automáticas). */
export const VEL = q.has('rapido') ? 5 : 1;

const ahora = () => performance.now();

/** Píxeles de un anillo elíptico (bajo cada unidad) en un canvas pequeño, sin suavizado. */
function anillo(color, rx = 8, ry = 4) {
  const c = document.createElement('canvas');
  c.width = rx * 2 + 1; c.height = ry * 2 + 1;
  const x = c.getContext('2d');
  for (let j = 0; j <= ry * 2; j++) for (let i = 0; i <= rx * 2; i++) {
    const dx = (i - rx) / rx, dy = (j - ry) / ry;
    const d = dx * dx + dy * dy;
    if (d <= 1.05 && d >= 0.45) { x.fillStyle = color; x.fillRect(i, j, 1, 1); }
    else if (d < 0.45) { x.fillStyle = color + '40'; x.fillRect(i, j, 1, 1); }
  }
  return c;
}

/** Roca de 20x17 px pintada a mano (pixel a pixel). */
function roca(variante) {
  const c = document.createElement('canvas');
  c.width = 20; c.height = 17;
  const x = c.getContext('2d');
  const cx = 9.5, cy = 9, rx = 9.4, ry = 7.6;
  for (let j = 0; j < 17; j++) for (let i = 0; i < 20; i++) {
    const dx = (i - cx) / rx, dy = (j - cy) / ry;
    const d = dx * dx + dy * dy + (variante && j < 5 && i > 12 ? 0.3 : 0);
    if (d > 1) continue;
    let col = '#8d877a';
    if (d > 0.72) col = '#45403a';
    else if (dx + dy < -0.55) col = '#b8b1a2';
    else if (dx + dy > 0.6) col = '#6b665c';
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  x.fillStyle = '#5fa35a'; x.fillRect(4, 3, 3, 1); x.fillRect(5, 2, 1, 1);
  x.fillStyle = '#d9d2c2'; x.fillRect(6, 5, 2, 1);
  return c;
}

export function crearTablero(contenedor, { alTocarCelda } = {}) {
  const lienzo = document.createElement('div');
  lienzo.className = 'lienzo';
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO; canvas.height = ALTO;
  canvas.setAttribute('aria-label', 'Tablero de combate');
  const capa = document.createElement('div');
  capa.className = 'capa';
  lienzo.append(canvas, capa);
  contenedor.append(lienzo);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas.style.imageRendering = 'pixelated';

  const anillos = { jugador: anillo('#4fb3ff'), rival: anillo('#ff5a4a'), jefe: anillo('#ffcf3a', 10, 5) };
  const rocas = [roca(0), roca(1)];
  let campo = null, isla = 'prado';
  let k = 1;
  const VACIO = { alcance: [], rango: [], area: [], amenaza: [], alerta: [], sel: null, pendientes: [] };
  let res = { ...VACIO };
  const anims = new Set();
  const proyectiles = [];
  let raf = 0, vivo = true;
  let temblor = 0;

  function medir() {
    const r = contenedor.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Escala entera de px de dispositivo (píxeles nítidos e iguales); si eso desperdicia más de un 12 % del
    // hueco, se usa la escala exacta (algún píxel de dispositivo de más o de menos, pero tablero más grande).
    const ajuste = Math.min(r.width * dpr / ANCHO, r.height * dpr / ALTO);
    let s = Math.max(1, Math.floor(ajuste));
    if (s / ajuste < 0.88) s = ajuste;
    const w = ANCHO * s / dpr, h = ALTO * s / dpr;
    lienzo.style.width = w + 'px';
    lienzo.style.height = h + 'px';
    k = w / ANCHO;
  }
  const ro = new ResizeObserver(medir);
  ro.observe(contenedor);
  medir();

  // Toques: una casilla por toque (sin arrastre).
  let abajo = null;
  canvas.addEventListener('pointerdown', (e) => { abajo = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!abajo || abajo.id !== e.pointerId) return;
    const a = abajo; abajo = null;
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 14) return;
    const rc = canvas.getBoundingClientRect();
    const px = (e.clientX - rc.left) / k, py = (e.clientY - rc.top) / k;
    const c = Math.floor(px / CEL), r = Math.max(0, Math.floor((py - MS) / CEL));
    if (c >= 0 && c < COLS && r < FILAS && alTocarCelda) alTocarCelda(c, r, golpeSprite(px, py));
  });
  /** Unidad cuyo cuerpo (no solo la baldosa) está bajo el punto; si se solapan, la de delante (fila mayor). */
  function golpeSprite(px, py) {
    if (!campo) return null;
    let mejor = null;
    for (const u of campo.unidades) {
      if (u.ps <= 0 || u.alfa <= 0) continue;
      const { x, y } = suelo(u);
      const ss = (S.medidas(u.sp, 'Idle') || {}).ss ?? 1;
      const alto = CEL * (0.95 + 0.3 * ss);
      if (px < x - CEL * 0.48 || px > x + CEL * 0.48 || py > y + 6 || py < y - alto) continue;
      if (!mejor || u.vy > mejor.vy) mejor = u;
    }
    return mejor;
  }
  canvas.addEventListener('pointercancel', () => { abajo = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const suelo = (u) => ({ x: Math.round(u.vx * CEL + CEL / 2), y: Math.round(MS + u.vy * CEL + CEL / 2 + 5 - (u.salto || 0)) });

  function pintarCeldas(lista, color, a) {
    ctx.fillStyle = color;
    ctx.globalAlpha = a;
    for (const p of lista) ctx.fillRect(p.c * CEL + 1, MS + p.r * CEL + 1, CEL - 2, CEL - 2);
    ctx.globalAlpha = 1;
  }
  function marco(p, color) {
    ctx.fillStyle = color;
    const x = p.c * CEL, y = MS + p.r * CEL;
    ctx.fillRect(x, y, CEL, 1); ctx.fillRect(x, y + CEL - 1, CEL, 1);
    ctx.fillRect(x, y, 1, CEL); ctx.fillRect(x + CEL - 1, y, 1, CEL);
  }

  function pintar(t) {
    const tx = temblor > 0 ? Math.round((Math.random() - 0.5) * 2) : 0;
    ctx.setTransform(1, 0, 0, 1, tx, 0);
    // Todo el lienzo con el suelo; los márgenes (donde asoman las cabezas de la fila 0) en sombra.
    T.rellenar(ctx, isla, null, -2, 0, ANCHO + 4, ALTO);
    ctx.fillStyle = 'rgba(10,19,40,.55)';
    ctx.fillRect(-2, 0, ANCHO + 4, MS);
    ctx.fillRect(-2, MS + FILAS * CEL, ANCHO + 4, MI);
    ctx.fillStyle = 'rgba(10,19,40,.35)';
    ctx.fillRect(-2, MS - 1, ANCHO + 4, 1);
    // Damero suave para leer la cuadrícula.
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.07;
    for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) if ((c + r) % 2) ctx.fillRect(c * CEL, MS + r * CEL, CEL, CEL);
    ctx.globalAlpha = 1;
    if (!campo) return;
    const pulso = 0.5 + 0.5 * Math.sin(t / 260);
    // Amenaza rival: rayado rojo (no tapa la hierba ni el resto de marcas).
    if (res.amenaza.length) {
      ctx.fillStyle = '#ff3b30';
      ctx.globalAlpha = 0.16;
      for (const p of res.amenaza) ctx.fillRect(p.c * CEL, MS + p.r * CEL, CEL, CEL);
      ctx.globalAlpha = 0.5;
      for (const p of res.amenaza) {
        const x0 = p.c * CEL, y0 = MS + p.r * CEL;
        for (let i = 0; i < CEL; i += 6) for (let j = 0; j < 2; j++) ctx.fillRect(x0 + ((i + j) % CEL), y0 + i + j, 2, 1);
      }
      ctx.globalAlpha = 1;
      for (const p of res.amenaza) marco(p, 'rgba(255,90,74,.45)');
    }
    pintarCeldas(res.alcance, '#3fa9ff', 0.32 + 0.12 * pulso);
    pintarCeldas(res.rango, '#ff9d1f', 0.4 + 0.12 * pulso);
    pintarCeldas(res.area, '#ff3b30', 0.48 + 0.14 * pulso);
    for (const p of res.alcance) marco(p, 'rgba(160,215,255,.55)');
    for (const p of res.rango) marco(p, 'rgba(255,214,120,.85)');
    // Casillas a las que puedes ir pero donde te pueden pegar: punto rojo en la esquina.
    for (const p of res.alerta) {
      const x0 = p.c * CEL + CEL - 8, y0 = MS + p.r * CEL + 2;
      ctx.fillStyle = '#0a1328'; ctx.fillRect(x0, y0, 7, 8);
      ctx.fillStyle = '#ff3b30'; ctx.fillRect(x0 + 1, y0 + 1, 5, 6);
      ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 3, y0 + 2, 1, 2); ctx.fillRect(x0 + 3, y0 + 5, 1, 1);
    }
    if (res.sel) { marco(res.sel, '#fff3c4'); }
    // Rocas.
    for (const kk of campo.rocas) {
      const [c, r] = kk.split(',').map(Number);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(c * CEL + 4, MS + r * CEL + 17, 16, 3);
      ctx.drawImage(rocas[(c + r) % 2], c * CEL + 2, MS + r * CEL + 3);
    }
    // Unidades, de atrás adelante.
    const us = campo.unidades.filter((u) => u.alfa > 0).sort((a, b) => a.vy - b.vy);
    const pend = new Set(res.pendientes);
    for (const u of us) {
      const { x, y } = suelo(u);
      const an = u.jefe ? anillos.jefe : anillos[u.bando];
      ctx.globalAlpha = u.alfa * (pend.has(u.uid) ? 0.75 + 0.25 * pulso : 0.8);
      ctx.drawImage(an, x - (an.width >> 1), y - (an.height >> 1));
      ctx.globalAlpha = 1;
      const hecho = u.bando === 'jugador' && u.actuado && res.turnoJugador;
      S.dibujar(ctx, {
        sp: u.sp, anim: u.anim, dir: u.dir, tMs: (t - u.t0) * VEL, bucle: u.bucle, x, y,
        escala: 1, sombra: false, alfa: u.alfa * (hecho ? 0.6 : 1),
      });
      // Barra de PS bajo los pies.
      if (u.ps > 0 || u.alfa > 0.3) {
        const w = 18, bx = x - 9, by = y + 4;
        const f = Math.max(0, u.psVis != null ? u.psVis : u.ps) / u.psMax;
        ctx.globalAlpha = u.alfa;
        ctx.fillStyle = '#0d0f14'; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
        ctx.fillStyle = f > 0.5 ? '#59d65a' : f > 0.25 ? '#f2c335' : '#ff4d3d';
        ctx.fillRect(bx, by, Math.round(w * f), 2);
        if (u.bando === 'rival') { ctx.fillStyle = u.jefe ? '#ffcf3a' : '#ff8a7a'; ctx.fillRect(bx - 1, by - 1, 2, 1); }
        ctx.globalAlpha = 1;
      }
    }
    // Proyectiles.
    for (const p of proyectiles) {
      ctx.fillStyle = p.color;
      for (let i = 0; i < 4; i++) {
        const a = Math.max(0, p.f - i * 0.06);
        const px = p.x0 + (p.x1 - p.x0) * a, py = p.y0 + (p.y1 - p.y0) * a - Math.sin(a * Math.PI) * 6;
        ctx.globalAlpha = 1 - i * 0.22;
        const s = i === 0 ? 3 : 2;
        ctx.fillRect(Math.round(px - s / 2), Math.round(py - s / 2), s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  function bucle(t) {
    if (!vivo) return;
    raf = requestAnimationFrame(bucle);
    if (document.hidden) return;
    for (const a of [...anims]) {
      const p = Math.min(1, (t - a.t0) * VEL / a.ms);
      a.fn(p, t);
      if (p >= 1) { anims.delete(a); a.res(); }
    }
    if (temblor > 0) temblor -= 1;
    pintar(t);
  }
  raf = requestAnimationFrame(bucle);

  /** Interpolación con el reloj del rAF (se para con la pestaña oculta). */
  function animar(ms, fn = () => {}) {
    return new Promise((res) => anims.add({ t0: ahora(), ms, fn, res }));
  }
  const esperar = (ms) => animar(ms);

  function ponerAnim(u, anim, bucle = true) { u.anim = anim; u.t0 = ahora(); u.bucle = bucle; }
  function mirarA(u, c, r) {
    const dc = c - u.c, dr = r - u.r;
    if (Math.abs(dc) >= Math.abs(dr) && dc !== 0) u.dir = dc > 0 ? 2 : 6;
    else if (dr > 0) u.dir = 0;
    else if (dr < 0) u.dir = dc > 0 ? 2 : dc < 0 ? 6 : (u.dir === 0 ? 2 : u.dir); // no hay fila «de espaldas»
  }

  /** Coloca un texto flotante sobre una casilla (px CSS de la capa). */
  function flotante(c, r, texto, clase = '') {
    const el = document.createElement('div');
    el.className = 'flotante ' + clase;
    el.textContent = texto;
    el.style.left = ((c + 0.5) * CEL * k) + 'px';
    el.style.top = ((MS + Math.max(r, 0.45) * CEL + 2) * k) + 'px';
    el.style.animationDuration = (1100 / VEL) + 'ms';
    capa.append(el);
    setTimeout(() => el.remove(), 1200 / VEL + 50);
  }

  let etiquetas = [];
  function ponerEtiquetas(lista) {
    for (const e of etiquetas) e.remove();
    etiquetas = lista.map((x) => {
      const el = document.createElement('div');
      // En la fila de arriba no cabe encima: se pone bajo los pies.
      const abajo = x.r === 0;
      el.className = 'etq ' + (x.clase || '') + (abajo ? ' abajo' : '');
      el.textContent = x.texto;
      el.style.left = ((x.c + 0.5) * CEL * k) + 'px';
      el.style.top = ((MS + (abajo ? x.r + 1 : x.r) * CEL - (abajo ? 1 : 4)) * k) + 'px';
      capa.append(el);
      return el;
    });
  }

  return {
    canvas,
    get k() { return k; },
    cargar(nuevoCampo, nuevaIsla) {
      campo = nuevoCampo; isla = nuevaIsla || 'prado';
      for (const u of campo.unidades) {
        u.vx = u.c; u.vy = u.r; u.alfa = 1; u.psVis = u.ps;
        ponerAnim(u, 'Idle');
        u.t0 -= Math.random() * 2000;   // que no respiren todos a la vez
      }
      res = { ...VACIO };
    },
    resaltar(r) { res = { ...VACIO, ...r }; },
    ponerEtiquetas,
    flotante,
    esperar,
    mirarA,
    /** Anda por la ruta casilla a casilla con Walk. */
    async andar(u, camino) {
      if (!camino.length) return;
      ponerAnim(u, 'Walk');
      for (const p of camino) {
        const c0 = u.vx, r0 = u.vy;
        mirarA(u, p.c, p.r);
        u.c = p.c; u.r = p.r;   // la casilla lógica cambia al empezar el paso (dir de la siguiente)
        await animar(170, (f) => { u.vx = c0 + (p.c - c0) * f; u.vy = r0 + (p.r - r0) * f; });
        u.vx = p.c; u.vy = p.r;
      }
      ponerAnim(u, 'Idle');
    },
    /** Attack orientado. Resuelve en el frame de golpe; `.fin` resuelve al terminar la animación. */
    async atacar(u, c, r) {
      if (r < u.r && Math.abs(c - u.c) < u.r - r) {
        // No hay fila «de espaldas»: de frente, con un saltito y una embestida solo en vertical.
        u.dir = 0;
        ponerAnim(u, 'Idle');
        const r0 = u.r;
        await animar(200, (f) => { u.vy = r0 - 0.3 * Math.sin(f * Math.PI / 2); u.salto = Math.round(5 * Math.sin(f * Math.PI)); });
        animar(160, (f) => { u.vy = r0 - 0.3 * (1 - f); u.salto = 0; }).then(() => { u.vy = u.r; u.salto = 0; });
        return;
      }
      mirarA(u, c, r);
      ponerAnim(u, 'Attack', false);
      const golpe = S.msHasta(u.sp, 'Attack');
      const total = S.duracionAnim(u.sp, 'Attack');
      await esperar(Math.max(120, golpe));
      const resto = Math.max(0, total - golpe);
      esperar(resto + 60).then(() => { if (u.anim === 'Attack') ponerAnim(u, 'Idle'); });
    },
    async proyectil(desde, hasta, tipo) {
      const o = suelo({ vx: desde.c, vy: desde.r }), d = suelo({ vx: hasta.c, vy: hasta.r });
      const p = { x0: o.x, y0: o.y - 10, x1: d.x, y1: d.y - 8, f: 0, color: COLOR_TIPO[tipo] || '#fff' };
      proyectiles.push(p);
      const n = Math.abs(hasta.c - desde.c) + Math.abs(hasta.r - desde.r);
      await animar(90 + n * 55, (f) => { p.f = f; });
      proyectiles.splice(proyectiles.indexOf(p), 1);
    },
    /** Hurt + barra de PS que baja. */
    async herir(u, psAntes) {
      ponerAnim(u, 'Hurt', false);
      const desde = psAntes, hasta = Math.max(0, u.ps);
      temblor = u.jefe ? 10 : 4;
      await animar(380, (f) => { u.psVis = desde + (hasta - desde) * f; });
      if (u.ps > 0) ponerAnim(u, 'Idle');
    },
    async deslizar(u, c, r) {
      const c0 = u.vx, r0 = u.vy;
      u.c = c; u.r = r;
      await animar(150, (f) => { u.vx = c0 + (c - c0) * f; u.vy = r0 + (r - r0) * f; });
      u.vx = c; u.vy = r;
    },
    async desaparecer(u) {
      ponerAnim(u, 'Faint', false);
      await esperar(Math.min(700, Math.max(300, S.duracionAnim(u.sp, 'Faint'))));
      await animar(380, (f) => { u.alfa = 1 - f; });
      u.alfa = 0;
    },
    /** Centro de una casilla en coordenadas de cliente (para las pruebas). */
    centroCelda(c, r) {
      const rc = canvas.getBoundingClientRect();
      return { x: rc.left + (c + 0.5) * CEL * k, y: rc.top + (MS + (r + 0.5) * CEL) * k };
    },
    destruir() { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); lienzo.remove(); },
    clave,
  };
}
