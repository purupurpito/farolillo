// scene-cala.js — dueño: GRÁFICOS. La cala del faro (SPEC §7.4, §9.2.1).
//
// crear(canvas, opciones) → Escena { actualizar, iniciar, parar, destruir, alTocar, render, reaccionar, centrarEn }
// estado = { vecinos: [{uid, sp, vr, dormido?, fav?}], visitante: {sp, vr?}|null,
//            farolillos: n, dorados: n, soloLectura: bool }
// Toques → alTocar(fn) recibe { tipo: "vecino", uid, sp } | { tipo: "visitante", sp } | { tipo: "faro" }.
// La escena hace sola la reacción visual (Hop o salto de 4 px + globo con retrato Happy);
// la UI puede añadir la frase con escena.reaccionar(uid, { frase, emocion }).

import * as S from './sprites.js';
import { rellenar, tono } from './tiles.js';

const MAX_ANIMADOS = 12;
const VEL = 16;                 // px de sprite por segundo al pasear
const DUR_GLOBO = 3200;         // ms

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function esHoraDeDormir(ms) { const h = new Date(ms).getHours(); return h >= 23 || h < 7; }
function esNoche(ms) { const h = new Date(ms).getHours(); return h >= 22 || h < 7; }

export function crear(canvas, opciones = {}) {
  const reloj = S.relojDe(opciones);
  let estado = { vecinos: [], visitante: null, farolillos: 0, dorados: 0, soloLectura: false };
  const vecinos = new Map();      // uid -> actor
  let mundo = { W: 0, H: 0, mar: 0, suelo0: 0, suelo1: 0, faroX: 4, muelleX: 0 };
  let camX = 0, camFijada = false;
  let tAhora = 0;
  let r = rng(opciones.semilla || 12345);
  let visitante = null;           // actor
  let animados = new Set();

  function apaisado() {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  }

  const impl = {
    medir(dim) {
      const H = dim.h;
      const W = Math.max(dim.w, Math.round(dim.w * (apaisado() ? 1.3 : 2)));
      const mar = Math.max(14, Math.round(H * 0.3));
      const viejo = mundo;
      mundo = { W, H, mar, suelo0: mar + 14, suelo1: H - 6, faroX: 6, muelleX: W - 46 };
      for (const v of vecinos.values()) {
        if (viejo.W) { v.fx = fraccion(v.x, 30, viejo.W - 60); v.fy = fraccion(v.y, viejo.suelo0, viejo.suelo1); }
        situar(v);
      }
      if (visitante) colocarVisitante();
      camX = Math.max(0, Math.min(camX, W - dim.w));
      if (!camFijada) camX = 0;
    },
    paso(t, dt) {
      tAhora = t;
      const ahora = reloj();
      const dormirAhora = esHoraDeDormir(ahora);
      const dim = motor.dim();
      // Qué vecinos se animan: visibles, favoritos primero, máx. 12.
      const vis = [];
      for (const v of vecinos.values()) if (v.x > camX - 24 && v.x < camX + dim.w + 24) vis.push(v);
      vis.sort((a, b) => (b.fav - a.fav) || (b.prio - a.prio));
      animados = new Set(vis.slice(0, MAX_ANIMADOS));
      // Precarga solo cuando cambia algo que la decide (cámara por media pantalla, quién se anima, noche, siestas).
      let fp = Math.round(camX / Math.max(1, dim.w / 2)) + '|' + (dormirAhora ? 1 : 0) + '|' + vecinos.size;
      for (const v of animados) fp += ',' + v.uid + (v.siesta ? 's' : '');
      for (const v of vecinos.values()) if (v.dormidoUI) fp += ',d' + v.uid;
      if (fp !== firmaPrecarga) { firmaPrecarga = fp; precargarSegun(dim, dormirAhora); }
      // Mar (baldosa cada 0,5 s) y, de noche, haz del faro, halo y brillo de farolillos: también cuentan en la
      // firma para que no vayan a saltos ni se congelen cuando los vecinos están quietos.
      const noche = esNoche(ahora);
      let firma = Math.round(camX) + '|' + (dormirAhora ? 1 : 0) + '|' + Math.floor(t / 500)
        + (noche ? `,${Math.floor(t / 150)},${Math.floor(t / 300) % 2},${Math.floor(t / 600)}` : '');
      for (const v of vecinos.values()) {
        if (animados.has(v)) pensar(v, t, dt, dormirAhora || v.dormidoUI);
        const anim = v.anim;
        const f = animados.has(v) ? S.indiceFrame(v.sp, anim, v.vr, t - v.t0, v.anim !== 'Hop') : 0;
        firma += `|${Math.round(v.x)},${Math.round(v.y)},${anim[0]}${f}${v.dir}${v.salto ? Math.round(v.salto) : ''}`;
        if (v.globo) { if (t > v.globo.fin) v.globo = null; else firma += 'g'; }
      }
      if (visitante) firma += '|v' + S.indiceFrame(visitante.sp, 'Idle', visitante.vr, t) + (Math.floor(t / 400) % 2);
      return firma;
    },
    pintar(ctx, dim, t) { pintar(ctx, dim, t); },
    tocar(x, y) { return tocar(x + camX, y); },
    arrastrar(dx) {
      const dim = motor.dim();
      camFijada = true;
      camX = Math.max(0, Math.min(mundo.W - dim.w, camX - dx));
    },
  };
  const motor = S.motorEscena(canvas, opciones, impl);
  const escena = motor.escena;

  function fraccion(x, a, b) { return b > a ? Math.max(0, Math.min(1, (x - a) / (b - a))) : 0.5; }
  function situar(v) {
    v.x = 30 + v.fx * Math.max(1, mundo.W - 90);
    v.y = mundo.suelo0 + v.fy * Math.max(1, mundo.suelo1 - mundo.suelo0);
    if (v.anim === 'Walk') { v.anim = 'Idle'; v.espera = 500; }
    acotar(v);
  }

  function acotar(v) {
    v.x = Math.max(14, Math.min(mundo.W - 14, v.x));
    v.y = Math.max(mundo.suelo0, Math.min(mundo.suelo1, v.y));
  }

  function nuevoActor(d, indice = 0) {
    const rr = rng(hashStr(d.uid || d.sp));
    // Reparto inicial casi uniforme en 2D (secuencia R2 de Roberts, más un poco de ruido por uid) para que no se
    // amontonen. Con 0,618/0,382 (que suman 1) todos caían sobre una antidiagonal.
    const fx0 = (indice * 0.7548777 + rr() * 0.06) % 1, fy0 = (indice * 0.5698403 + rr() * 0.06) % 1;
    const v = {
      uid: d.uid, sp: d.sp, vr: !!d.vr, fav: d.fav ? 1 : 0, prio: rr(),
      fx: fx0, fy: fy0, x: 0, y: 0,
      anim: 'Idle', dir: 0, t0: -rr() * 2000, espera: 500 + rr() * 4000, tx: 0, ty: 0,
      siesta: false, salto: 0, globo: null, dormidoUI: !!d.dormido,
    };
    if (mundo.W) situar(v);
    // Precarga mínima (móvil con datos): solo Idle. Walk cuando se anima (solo pasean los ≤ 12 animados),
    // Sleep cuando toca dormir y Hop al tocarlo. Mientras llega una PNG, S.dibujar pinta Idle: nunca queda vacío.
    S.precargar(v.sp, ['Idle'], v.vr);
    return v;
  }

  /** Pide las PNG que va a necesitar cada vecino según lo que hace ahora (llamadas repetidas no cuestan nada). */
  function precargarSegun(dim, dormirAhora) {
    for (const v of vecinos.values()) {
      if (animados.has(v)) S.precargar(v.sp, ['Walk'], v.vr);
      // Duermen (de noche, a ratos o por la UI): Sleep para los que están a la vista o a una pantalla.
      const cerca = v.x > camX - dim.w && v.x < camX + dim.w * 2;
      if ((dormirAhora || v.dormidoUI || v.siesta) && (cerca || animados.has(v))) S.precargar(v.sp, ['Sleep'], v.vr);
    }
  }
  let firmaPrecarga = '';

  function cambiarAnim(v, anim, t) { if (v.anim !== anim) { v.anim = anim; v.t0 = t; } }

  function pensar(v, t, dt, dormir) {
    // Reacción a un toque: manda sobre todo lo demás.
    if (v.reac) {
      const e = t - v.reac.t0;
      if (v.reac.hop) {
        cambiarAnim(v, 'Hop', v.reac.t0);
        if (e > v.reac.dur) v.reac = null;
      } else {
        cambiarAnim(v, 'Idle', v.anim === 'Idle' ? v.t0 : t);
        v.salto = e < 400 ? Math.sin(e / 400 * Math.PI) * 4 : 0;
        if (e > 600) { v.reac = null; v.salto = 0; }
      }
      if (v.reac) return;
    }
    if (dormir || v.siesta) {
      cambiarAnim(v, 'Sleep', t); v.dir = 0;
      if (v.siesta && (v.espera -= dt) <= 0) { v.siesta = false; v.espera = 1500 + r() * 3000; cambiarAnim(v, 'Idle', t); }
      return;
    }
    if (v.anim === 'Walk') {
      const dx = v.tx - v.x, dy = v.ty - v.y, dist = Math.hypot(dx, dy);
      const avance = VEL * dt / 1000;
      if (dist <= avance || dist < 0.5) {
        v.x = v.tx; v.y = v.ty; cambiarAnim(v, 'Idle', t); v.espera = 1500 + r() * 5000;
      } else {
        v.x += dx / dist * avance; v.y += dy / dist * avance;
      }
      return;
    }
    if (v.anim === 'Sleep') cambiarAnim(v, 'Idle', t);
    if ((v.espera -= dt) > 0) return;
    // Decide: siesta corta (a ratos), o pasear.
    if (r() < 0.08) { v.siesta = true; v.espera = 6000 + r() * 10000; S.precargar(v.sp, ['Sleep'], v.vr); return; }
    const ang = r() * Math.PI * 2, d = 12 + r() * 40;
    v.tx = v.x + Math.cos(ang) * d; v.ty = v.y + Math.sin(ang) * d * 0.4;
    v.tx = Math.max(14, Math.min(mundo.W - 14, v.tx));
    v.ty = Math.max(mundo.suelo0, Math.min(mundo.suelo1, v.ty));
    const ddx = v.tx - v.x, ddy = v.ty - v.y;
    v.dir = Math.abs(ddy) > Math.abs(ddx) * 1.5 && ddy > 0 ? 0 : (ddx >= 0 ? 2 : 6);
    cambiarAnim(v, 'Walk', t);
  }

  function colocarVisitante() {
    visitante.x = mundo.muelleX + 18;
    visitante.y = mundo.mar + 6;
  }

  function cajaToque(sp, vr, x, y) {
    const m = S.medidas(sp, 'Idle', vr);
    const ss = m ? m.ss : 1;
    // Mínimo por tamaño y, para las especies grandes, según el frame real (Gyarados, Steelix…: si no, la cabeza
    // no respondía). 0,85 descuenta el margen transparente del frame.
    let w = [16, 22, 30][ss] || 22, h = [20, 26, 36][ss] || 26;
    if (m) {
      w = Math.max(w, Math.round(m.fw * 0.6));
      h = Math.max(h, Math.round((m.fh / 2 - S.AJUSTE_Y) * 0.85));
    }
    return { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y + 4 };
  }
  const dentro = (c, x, y) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;

  function tocar(x, y) {
    if (visitante && dentro(cajaToque(visitante.sp, visitante.vr, visitante.x, visitante.y - 4), x, y)) {
      return { tipo: 'visitante', sp: visitante.sp, soloLectura: !!estado.soloLectura };
    }
    let mejor = null;
    for (const v of vecinos.values()) {
      if (dentro(cajaToque(v.sp, v.vr, v.x, v.y), x, y) && (!mejor || v.y > mejor.y)) mejor = v;
    }
    if (mejor) {
      reaccionVisual(mejor);
      return { tipo: 'vecino', uid: mejor.uid, sp: mejor.sp, soloLectura: !!estado.soloLectura };
    }
    const fx = mundo.faroX;
    if (x >= fx && x <= fx + 30 && y <= mundo.mar + 16) return { tipo: 'faro' };
    return null;
  }

  function reaccionVisual(v) {
    const hop = S.tieneAnim(v.sp, 'Hop', v.vr);
    if (hop) S.precargar(v.sp, ['Hop'], v.vr);
    v.siesta = false;
    v.dir = 0;
    v.reac = { t0: tAhora, hop, dur: hop ? S.duracionAnim(v.sp, 'Hop', v.vr) : 600 };
    v.globo = { emocion: 'Happy', frase: '', fin: tAhora + DUR_GLOBO };
    motor.marcarSucio();
  }

  // ---------------------------------------------------------------- pintura
  function pintar(ctx, dim, t) {
    const { W, H, mar } = mundo;
    const ahora = reloj();
    const noche = esNoche(ahora);
    const dormir = esHoraDeDormir(ahora);
    ctx.save();
    ctx.translate(-Math.round(camX), 0);
    const x0 = Math.floor(camX) - 2, ancho = dim.w + 4;
    // Mar con oleaje lento (la baldosa se desplaza 1 px cada ~0,5 s).
    rellenar(ctx, 'mar', null, x0, 0, ancho, mar + 2, Math.floor(t / 500), 0);
    // Orilla: espuma y arena mojada.
    ctx.fillStyle = '#f6efe0'; ctx.fillRect(x0, mar, ancho, 1);
    ctx.fillStyle = tono('#e8d4a2', -0.15); ctx.fillRect(x0, mar + 1, ancho, 3);
    rellenar(ctx, 'arena', null, x0, mar + 4, ancho, H - mar - 4);
    pintarMuelle(ctx);
    pintarFaro(ctx, noche, t);
    pintarFarolillos(ctx, noche, t);

    // Actores ordenados por profundidad.
    const lista = [...vecinos.values()];
    if (visitante) lista.push(visitante);
    lista.sort((a, b) => a.y - b.y);
    for (const v of lista) {
      if (v.x < camX - 40 || v.x > camX + dim.w + 40) continue;
      if (v === visitante) {
        S.dibujar(ctx, { sp: v.sp, vr: v.vr, anim: 'Idle', dir: 6, tMs: t, x: v.x, y: v.y });
        pintarExclamacion(ctx, v.x, v.y - 34, t);
        continue;
      }
      // Los que no se animan (más de 12 a la vista) duermen igual que los demás cuando toca.
      const dormidoQuieto = !animados.has(v) && (dormir || v.dormidoUI);
      const anim = animados.has(v) ? v.anim : (dormidoQuieto ? 'Sleep' : 'Idle');
      S.dibujar(ctx, {
        sp: v.sp, vr: v.vr, anim, dir: anim === 'Sleep' ? 0 : v.dir, tMs: t - v.t0,
        x: v.x, y: v.y - (v.salto || 0), frame: animados.has(v) ? undefined : 0, bucle: anim !== 'Hop',
      });
      if (anim === 'Sleep') pintarZzz(ctx, v.x + 6, v.y - 22, t);
    }
    // Noche: velo azul.
    if (noche) { ctx.fillStyle = 'rgba(20,33,61,.38)'; ctx.fillRect(x0, 0, ancho, H); pintarHaz(ctx, t); }
    ctx.restore();
    // Globos en la capa DOM (texto nítido y retrato a escala entera de px de dispositivo, fuera del búfer).
    // Solo si el vecino está a la vista (si no, el globo taparía la escena sin sentido).
    pintarGlobos(dim);
  }

  function pintarMuelle(ctx) {
    const { muelleX, mar } = mundo;
    // Postes y tablones que entran en el mar.
    ctx.fillStyle = '#5a3a22';
    for (let i = 0; i < 4; i++) ctx.fillRect(muelleX + 4 + i * 10, mar - 16, 2, 20);
    rellenar(ctx, 'madera', null, muelleX, mar - 14, 40, 22);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(muelleX, mar + 8, 40, 1);
    // Bote amarrado.
    ctx.fillStyle = '#e05a4f'; ctx.fillRect(muelleX + 8, mar - 24, 18, 5);
    ctx.fillStyle = '#7a2f28'; ctx.fillRect(muelleX + 10, mar - 19, 14, 2);
    ctx.fillStyle = '#f6efe0'; ctx.fillRect(muelleX + 8, mar - 24, 18, 1);
  }

  function pintarFaro(ctx, noche, t) {
    const x = mundo.faroX, base = mundo.mar + 10;
    const alto = Math.min(64, base - 4);
    const top = base - alto;
    // Roca.
    rellenar(ctx, 'roca', null, x - 4, base - 6, 38, 12);
    ctx.fillStyle = tono('#7d7f86', -0.3); ctx.fillRect(x - 4, base + 5, 38, 1);
    // Torre a franjas.
    const tw = 14, tx = x + 8;
    for (let y = top + 10; y < base - 6; y++) {
      const banda = Math.floor((y - top) / 8) % 2;
      const w = tw + Math.floor((y - top) / 12);
      ctx.fillStyle = banda ? '#e05a4f' : '#f6efe0';
      ctx.fillRect(tx + Math.floor((tw - w) / 2), y, w, 1);
    }
    // Puerta.
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(tx + 5, base - 12, 4, 6);
    // Linterna.
    ctx.fillStyle = '#1f3a5f'; ctx.fillRect(tx - 2, top + 8, tw + 4, 2);
    const parpadeo = noche ? 1 : 0.8;
    ctx.fillStyle = parpadeo > 0.9 ? '#fff3c4' : '#ffb547';
    ctx.fillRect(tx + 2, top + 2, tw - 4, 6);
    ctx.fillStyle = '#1f3a5f'; ctx.fillRect(tx + 1, top, tw - 2, 2); ctx.fillRect(tx + 6, top - 2, 2, 2);
    ctx.fillRect(tx + 1, top + 2, 1, 6); ctx.fillRect(tx + tw - 2, top + 2, 1, 6);
    if (noche) {
      ctx.fillStyle = 'rgba(255,243,196,.25)';
      ctx.beginPath(); ctx.arc(tx + tw / 2, top + 5, 12 + (Math.floor(t / 300) % 2), 0, Math.PI * 2); ctx.fill();
    }
    mundo.lampara = { x: tx + tw / 2, y: top + 5 };
  }

  function pintarHaz(ctx, t) {
    const l = mundo.lampara; if (!l) return;
    const ang = (t / 4000) % (Math.PI * 2);
    const dx = Math.cos(ang), lado = dx >= 0 ? 1 : -1;
    const largo = 120 * Math.abs(dx) + 20;
    ctx.fillStyle = 'rgba(255,243,196,.18)';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x + lado * largo, l.y - 10);
    ctx.lineTo(l.x + lado * largo, l.y + 10);
    ctx.closePath(); ctx.fill();
  }

  function pintarFarolillos(ctx, noche, t) {
    const n = Math.max(0, estado.farolillos | 0), d = Math.max(0, estado.dorados | 0);
    const total = Math.min(60, n + d);
    if (!total) return;
    const x0 = mundo.faroX + 34, y0 = mundo.mar + 9, paso = 7;
    const porFila = Math.max(1, Math.floor((mundo.muelleX - x0 - 6) / paso));
    for (let i = 0; i < total; i++) {
      const fila = Math.floor(i / porFila), col = i % porFila;
      const x = x0 + col * paso, y = y0 + fila * 6 + (col % 2);
      // Cuerda.
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 3, y - 1, paso, 1);
      const dorado = i >= n;
      const brillo = noche && (Math.floor(t / 600) + i) % 5 === 0;
      ctx.fillStyle = dorado ? (brillo ? '#fff3c4' : '#ffd84a') : (noche ? (brillo ? '#fff3c4' : '#ffb547') : '#e07a1f');
      ctx.fillRect(x, y, 3, 4);
      ctx.fillStyle = '#1f3a5f'; ctx.fillRect(x, y - 1, 3, 1);
      if (noche || dorado) { ctx.fillStyle = dorado ? 'rgba(255,216,74,.3)' : 'rgba(255,181,71,.25)'; ctx.fillRect(x - 1, y - 1, 5, 6); }
    }
  }

  function pintarExclamacion(ctx, x, y, t) {
    const dy = Math.floor(t / 400) % 2;
    ctx.fillStyle = '#14213d'; ctx.fillRect(x - 3, y - 1 - dy, 7, 11);
    ctx.fillStyle = '#ffb547'; ctx.fillRect(x - 2, y - dy, 5, 9);
    ctx.fillStyle = '#14213d'; ctx.fillRect(x, y + 1 - dy, 1, 4); ctx.fillRect(x, y + 6 - dy, 1, 1);
  }

  function pintarZzz(ctx, x, y, t) {
    const k = Math.floor(t / 700) % 3;
    ctx.fillStyle = '#f6efe0';
    for (let i = 0; i <= k; i++) { const X = x + i * 3, Y = y - i * 4; ctx.fillRect(X, Y, 3, 1); ctx.fillRect(X + 1, Y + 1, 1, 1); ctx.fillRect(X, Y + 2, 3, 1); }
  }

  // Globos: un <div> por vecino en la capa DOM del motor (px CSS). El retrato (40 px) va a escala entera en px de
  // dispositivo (≈ 60 px CSS) con pixelated; la frase, en texto del sistema de 14 px.
  const globosDom = new Map();   // uid -> { el, img, txt, pico, clave, w, h }
  function pintarGlobos(dim) {
    const vistos = new Set();
    for (const v of vecinos.values()) {
      if (!v.globo || v.x <= camX - 4 || v.x >= camX + dim.w + 4) continue;
      vistos.add(v.uid);
      pintarGlobo(dim, v);
    }
    for (const [uid, g] of globosDom) if (!vistos.has(uid)) { g.el.remove(); globosDom.delete(uid); }
  }

  function crearGlobo() {
    const el = document.createElement('div');
    el.className = 'globo-cala';
    Object.assign(el.style, {
      position: 'absolute', left: '0px', top: '0px', display: 'flex', alignItems: 'center', gap: '8px',
      padding: '4px', boxSizing: 'border-box', background: '#f6efe0', border: '2px solid #14213d', color: '#1b1b1f',
      font: '14px/1.25 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', maxWidth: 'calc(100% - 8px)',
      boxShadow: '0 2px 0 rgba(20,33,61,.35)', willChange: 'transform',
    });
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.className = 'px';
    img.style.imageRendering = 'pixelated';
    img.style.flex = '0 0 auto';
    img.style.display = 'block';
    const txt = document.createElement('span');
    Object.assign(txt.style, {
      maxWidth: '170px', overflowWrap: 'anywhere', display: '-webkit-box', webkitBoxOrient: 'vertical',
      webkitLineClamp: '4', overflow: 'hidden',
    });
    const pico = document.createElement('div');
    Object.assign(pico.style, {
      position: 'absolute', bottom: '-8px', width: '0', height: '0', marginLeft: '-7px',
      borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '7px solid #14213d',
    });
    const pico2 = document.createElement('div');
    Object.assign(pico2.style, {
      position: 'absolute', left: '-5px', top: '-9px', width: '0', height: '0',
      borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #f6efe0',
    });
    pico.append(pico2);
    el.append(img, txt, pico);
    return { el, img, txt, pico, clave: '', w: 0, h: 0 };
  }

  function pintarGlobo(dim, v) {
    let g = globosDom.get(v.uid);
    if (!g) { g = crearGlobo(); globosDom.set(v.uid, g); }
    const capa = motor.capa.el;
    if (g.el.parentNode !== capa) capa.append(g.el);
    const dpr = dim.dpr;
    const kRet = Math.max(1, Math.round(dpr * 1.5));          // px de dispositivo por px de retrato (40 px → ≈ 60 CSS)
    const lado = 40 * kRet / dpr;
    const url = S.urlRetrato(v.sp, v.globo.emocion, v.vr);
    const clave = url + '|' + lado + '|' + v.globo.frase;
    if (g.clave !== clave) {
      g.clave = clave;
      if (g.img.getAttribute('src') !== url) g.img.src = url;
      g.img.style.width = g.img.style.height = lado + 'px';
      g.txt.textContent = v.globo.frase || '';
      g.txt.style.display = v.globo.frase ? '-webkit-box' : 'none';
      g.w = g.el.offsetWidth; g.h = g.el.offsetHeight;
    }
    const cw = dim.cssW, k = dim.k, pad = 4;
    const sx = (v.x - camX) * k, sy = (v.y - 34) * k;
    const bx = Math.round(Math.max(pad, Math.min(cw - g.w - pad, sx - g.w / 2)));
    const by = Math.round(Math.max(pad, sy - g.h - 8));
    g.el.style.transform = `translate(${bx}px, ${by}px)`;
    g.pico.style.left = Math.round(Math.max(10, Math.min(g.w - 10, sx - bx))) + 'px';
  }

  // ---------------------------------------------------------------- API
  escena.actualizar = function (nuevo = {}) {
    estado = { ...estado, ...nuevo };
    if (nuevo.vecinos) {
      const vistos = new Set();
      for (const [i, d] of nuevo.vecinos.entries()) {
        const k = d.uid || d.sp;
        vistos.add(k);
        let v = vecinos.get(k);
        if (!v || v.sp !== d.sp || v.vr !== !!d.vr) { v = nuevoActor(d, i); vecinos.set(k, v); }
        v.fav = d.fav ? 1 : 0;
        v.dormidoUI = !!d.dormido;
      }
      for (const k of [...vecinos.keys()]) if (!vistos.has(k)) vecinos.delete(k);
    }
    if ('visitante' in nuevo) {
      const d = nuevo.visitante;
      if (!d) visitante = null;
      else if (!visitante || visitante.sp !== d.sp) {
        visitante = { sp: d.sp, vr: !!d.vr, x: 0, y: 0 };
        colocarVisitante();
        S.precargar(d.sp, ['Idle'], !!d.vr);
      }
    }
    motor.marcarSucio();
  };

  /** Añade la frase (y emoción) al globo del vecino tocado. */
  escena.reaccionar = function (uid, { frase = '', emocion = 'Happy' } = {}) {
    const v = vecinos.get(uid);
    if (!v) return;
    if (!v.globo) reaccionVisual(v);
    v.globo.frase = frase; v.globo.emocion = emocion;
    v.globo.fin = tAhora + DUR_GLOBO + Math.min(4000, frase.length * 40);
    motor.marcarSucio();
  };

  /** Desplaza la cámara para que se vea ese vecino (o el faro / el muelle). */
  escena.centrarEn = function (que) {
    const dim = motor.dim();
    let x = 0;
    if (que === 'muelle') x = mundo.muelleX + 20;
    else if (que === 'faro') x = 0;
    else { const v = vecinos.get(que); if (!v) return; x = v.x; }
    camFijada = true;
    camX = Math.max(0, Math.min(mundo.W - dim.w, x - dim.w / 2));
    motor.marcarSucio();
  };

  /** Posiciones en pantalla (px CSS) de los vecinos; para pruebas. */
  escena.posiciones = function () {
    const dim = motor.dim(), k = dim.k;
    return [...vecinos.values()].map(v => ({ uid: v.uid, sp: v.sp, x: (v.x - camX) * k, y: (v.y - 8) * k, anim: v.anim }));
  };

  if (opciones.estado) escena.actualizar(opciones.estado);
  return escena;
}

/** Atajo: crea, aplica `opts.estado` y arranca. */
export function montar(canvas, opts = {}) { const e = crear(canvas, opts); e.iniciar(); return e; }
