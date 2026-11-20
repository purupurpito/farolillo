// vista.js — dibuja la mazmorra en un canvas a escala entera (1 px del búfer = 1 px de sprite) y anima
// los eventos que devuelve juego.jugar(). Bucle propio a 60 fps (rAF) mientras la pestaña está visible.

import * as S from '../../../js/gfx/sprites.js';
import { rellenar, tono, FONDOS } from '../../../js/gfx/tiles.js';
import { W, H } from './mapa.js';
import { COLORES } from './movs.js';
import { dibujarIcono } from './iconos.js';

export const T = 24;                       // px de sprite por casilla
const CASILLAS_LADO_CORTO = 8.5;            // casillas que caben en el lado corto de la pantalla

export function crearVista(canvas, capa, mini, opciones = {}) {
  const vel = opciones.rapido ? 0.3 : 1;
  const ganchos = opciones.ganchos || {};
  let P = null;
  let dim = null;
  let libre = () => ({ x: 0, y: 0, w: dim ? dim.cssW : 1, h: dim ? dim.cssH : 1 });
  let mapaCanvas = null, nieblaCanvas = null, nieblaCtx = null, nieblaImg = null;
  const vis = new Map();          // id → estado visual
  let items = [];                 // copia visual de los objetos del suelo
  const cola = [];
  let actual = null;
  const programados = [];         // { t, fn }
  const efectos = [];             // proyectiles, anillos, chispas
  const flotantes = [];           // textos DOM
  let fundido = 0, fundidoObj = 0;  // negro de cambio de piso (0..1)
  let temblor = 0;
  let peligroVis = [];            // casillas rojas del guardián, al ritmo de la animación (no del estado)
  let cam = { x: 0, y: 0 };
  let ultimoT = 0;
  let ultimaFirma = '', sucio = true;
  S.alCargar(() => { sucio = true; });

  // ------------------------------------------------------------------ tamaño
  function medir() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const corto = Math.max(1, Math.min(r.width, r.height));
    const Sdev = Math.max(2, Math.round(corto * dpr / (T * CASILLAS_LADO_CORTO)));
    dim = S.prepararCanvas(canvas, Sdev / dpr);
    sucio = true;
  }
  const ro = new ResizeObserver(() => medir());
  ro.observe(canvas);

  // ------------------------------------------------------------------ partida / piso
  function ponerPartida(p) {
    P = p;
    cola.length = 0; actual = null; programados.length = 0; efectos.length = 0;
    for (const f of flotantes) f.el.remove();
    flotantes.length = 0;
    fundido = 0; fundidoObj = 0;
    reconstruirPiso();
  }

  function reconstruirPiso() {
    vis.clear();
    peligroVis = [];
    for (const e of P.ents) crearVis(e);
    items = P.items.map(it => ({ ...it }));
    pintarMapa();
    nieblaCanvas = document.createElement('canvas');
    nieblaCanvas.width = W; nieblaCanvas.height = H;
    nieblaCtx = nieblaCanvas.getContext('2d');
    nieblaImg = nieblaCtx.createImageData(W, H);
    actualizarNiebla();
    pintarMini();
    precargarPiso();
    sucio = true;
  }

  function precargarPiso() {
    const anims = ['Idle', 'Walk', 'Attack', 'Hurt', 'Faint'];
    for (const e of P.ents) S.precargar(e.sp, anims);
  }

  function crearVis(e) {
    const v = {
      id: e.id, sp: e.sp, bando: e.bando, jefe: e.jefe,
      px: e.x * T + T / 2, py: e.y * T + T * 0.7,
      de: null, a: null, t0: 0, dur: 0,
      anim: 'Idle', tAnim: 0, bucle: true, idleEn: 0,
      dir: e.dir || 0, ladoH: 2,
      alfa: 1, oculto: !e.vivo, muriendo: false, vhp: e.hp, hpMax: e.hpMax,
    };
    ponerDir(v, v.dir);
    vis.set(e.id, v);
    return v;
  }
  function V(id) {
    let v = vis.get(id);
    if (!v) { const e = P.ents.find(x => x.id === id); if (e) v = crearVis(e); }
    return v;
  }
  function ponerDir(v, d) {
    v.dir = d;
    if (d === 1 || d === 2 || d === 3) v.ladoH = 2;
    else if (d === 5 || d === 6 || d === 7) v.ladoH = 6;
  }
  /** Dirección que se dibuja: los sprites solo traen abajo/derecha/izquierda; «arriba» mira de lado. */
  function dirDibujo(v) {
    if (v.dir === 4 || v.dir === 3 || v.dir === 5) return v.ladoH;
    return v.dir;
  }
  function ponerAnim(v, anim, now, bucle = true) {
    if (anim === 'Walk' && v.anim === 'Walk') { v.idleEn = Infinity; return; }
    v.anim = anim; v.tAnim = now; v.bucle = bucle; v.idleEn = Infinity;
  }

  // ------------------------------------------------------------------ mapa pre-pintado
  function pintarMapa() {
    const m = P.m;
    const fondo = FONDOS[m.tema] || '#7fbf5a';
    mapaCanvas = mapaCanvas || document.createElement('canvas');
    mapaCanvas.width = W * T; mapaCanvas.height = H * T;
    const c = mapaCanvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    const muro = tono(fondo, -0.55), muroOsc = tono(fondo, -0.72), cara = tono(fondo, -0.35), borde = tono(fondo, -0.8);
    c.fillStyle = muroOsc; c.fillRect(0, 0, W * T, H * T);
    const suelo = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.celdas[y * W + x] === 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const X = x * T, Y = y * T;
      if (suelo(x, y)) { rellenar(c, m.tema, fondo, X, Y, T, T, 0, 0); continue; }
      let cerca = false;
      for (let dy = -1; dy <= 1 && !cerca; dy++) for (let dx = -1; dx <= 1; dx++) if (suelo(x + dx, y + dy)) { cerca = true; break; }
      if (!cerca) {
        if (((x * 7 + y * 13) % 5) === 0) { c.fillStyle = tono(fondo, -0.66); c.fillRect(X + 6, Y + 9, 3, 2); }
        continue;
      }
      c.fillStyle = muro; c.fillRect(X, Y, T, T);
      // vetas de roca
      c.fillStyle = tono(fondo, -0.45);
      c.fillRect(X + ((x * 5) % 13) + 2, Y + 4, 6, 1);
      c.fillRect(X + ((y * 7) % 11) + 4, Y + 13, 5, 1);
      if (suelo(x, y + 1)) {           // cara frontal del muro
        c.fillStyle = cara; c.fillRect(X, Y + T - 8, T, 8);
        c.fillStyle = tono(fondo, -0.25); c.fillRect(X, Y + T - 8, T, 1);
        c.fillStyle = tono(fondo, -0.45); c.fillRect(X + 5, Y + T - 5, 1, 4); c.fillRect(X + 16, Y + T - 6, 1, 5);
      }
      c.fillStyle = borde;
      if (suelo(x, y - 1)) c.fillRect(X, Y, T, 2);
      if (suelo(x - 1, y)) c.fillRect(X, Y, 2, T);
      if (suelo(x + 1, y)) c.fillRect(X + T - 2, Y, 2, T);
    }
    // Sombra suave del muro sobre el suelo (debajo de cada muro).
    c.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (suelo(x, y) && !suelo(x, y - 1)) c.fillRect(x * T, y * T, T, 4);
    if (m.escalera) pintarEscalera(c, m.escalera.x * T, m.escalera.y * T);
  }

  function pintarEscalera(c, X, Y) {
    const cols = ['#3b2f2a', '#5a4638', '#7d634d', '#a3866a'];
    c.fillStyle = '#1e1714'; c.fillRect(X + 2, Y + 2, T - 4, T - 4);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = cols[3 - i];
      c.fillRect(X + 3 + i * 2, Y + 4 + i * 4, T - 6 - i * 4, 3);
    }
    c.fillStyle = '#fff3c4';
    c.fillRect(X + 2, Y + 2, T - 4, 1); c.fillRect(X + 2, Y + T - 3, T - 4, 1);
    c.fillRect(X + 2, Y + 2, 1, T - 4); c.fillRect(X + T - 3, Y + 2, 1, T - 4);
  }

  function actualizarNiebla() {
    const d = nieblaImg.data;
    for (let i = 0; i < W * H; i++) {
      d[i * 4] = 6; d[i * 4 + 1] = 8; d[i * 4 + 2] = 18;
      d[i * 4 + 3] = P.visible[i] ? 0 : P.descubierto[i] ? 150 : 255;
    }
    nieblaCtx.putImageData(nieblaImg, 0, 0);
  }

  function pintarMini() {
    if (!mini) return;
    const k = 2;
    if (mini.width !== W * k) { mini.width = W * k; mini.height = H * k; }
    const c = mini.getContext('2d');
    c.clearRect(0, 0, mini.width, mini.height);
    const m = P.m;
    for (let i = 0; i < W * H; i++) {
      if (!P.descubierto[i] || m.celdas[i] !== 1) continue;
      c.fillStyle = P.visible[i] ? 'rgba(246,239,224,.75)' : 'rgba(246,239,224,.4)';
      c.fillRect((i % W) * k, ((i / W) | 0) * k, k, k);
    }
    const esc = m.escalera;
    if (esc && P.descubierto[esc.y * W + esc.x]) { c.fillStyle = '#5ab0ff'; c.fillRect(esc.x * k - 1, esc.y * k - 1, k + 2, k + 2); }
    for (const it of P.items) if (P.descubierto[it.y * W + it.x]) { c.fillStyle = '#ffd34d'; c.fillRect(it.x * k, it.y * k, k, k); }
    for (const e of P.ents) {
      if (!e.vivo) continue;
      if (e.bando === 'en' && !P.visible[e.y * W + e.x]) continue;
      c.fillStyle = e.bando === 'en' ? (e.jefe ? '#ff3df2' : '#ff5a4f') : e.lider ? '#ffb547' : '#8fe388';
      c.fillRect(e.x * k - (e.lider ? 1 : 0), e.y * k - (e.lider ? 1 : 0), k + (e.lider ? 2 : 0), k + (e.lider ? 2 : 0));
    }
  }

  // ------------------------------------------------------------------ eventos
  /** Encola los eventos de un turno. Los «mover» seguidos se juntan en un solo paso simultáneo. */
  function reproducir(evs) {
    let grupo = null;
    for (const e of evs) {
      if (e.t === 'mover') {
        if (!grupo) { grupo = { t: 'paso', movs: [] }; cola.push(grupo); }
        grupo.movs.push(e);
      } else { grupo = null; cola.push(e); }
    }
    actualizarNiebla();
    pintarMini();
    sucio = true;
  }

  const enVista = (x, y) => P.visible[y * W + x] === 1;
  const visibleEnt = (id) => {
    const e = P.ents.find(x => x.id === id);
    if (!e) return false;
    if (e.bando === 'eq') return true;
    const v = vis.get(id);
    const cx = v ? Math.floor(v.px / T) : e.x, cy = v ? Math.floor(v.py / T) : e.y;
    return enVista(e.x, e.y) || enVista(cx, cy);
  };

  function iniciar(ev, now) {
    switch (ev.t) {
      case 'paso': {
        let algunoVisible = false;
        const dur = 135 * vel;
        for (const m of ev.movs) {
          const v = V(m.id);
          if (!v) continue;
          ponerDir(v, m.dir);
          const visto = visibleEnt(m.id) || enVista(m.x0, m.y0);
          v.de = { x: m.x0 * T + T / 2, y: m.y0 * T + T * 0.7 };
          v.a = { x: m.x1 * T + T / 2, y: m.y1 * T + T * 0.7 };
          if (!visto) { v.px = v.a.x; v.py = v.a.y; v.de = v.a = null; continue; }
          algunoVisible = true;
          v.t0 = now; v.dur = dur;
          ponerAnim(v, 'Walk', now);
        }
        if (!algunoVisible) return { fin: now };
        return {
          fin: now + dur,
          cb: () => { for (const m of ev.movs) { const v = vis.get(m.id); if (v) { if (v.a) { v.px = v.a.x; v.py = v.a.y; } v.de = v.a = null; v.idleEn = performance.now() + 70; } } },
        };
      }
      case 'giro': { const v = V(ev.id); if (v) ponerDir(v, ev.dir); return { fin: now }; }
      case 'ataque': return iniciarAtaque(ev, now);
      case 'texto': {
        ganchos.texto && ganchos.texto(ev);
        if (ev.flotar && ev.id) flotar(ev.id, ev.flotar, ev.fuerte ? 'ef-fuerte' : 'ef-flojo', -11);
        return { fin: now };
      }
      case 'cura': {
        const v = V(ev.id);
        if (v) { v.vhp = ev.hp; flotar(ev.id, '+' + ev.cant, 'cura'); chispas(v.px, v.py - 12, '#8fe388', 10); }
        return { fin: now + 380 * vel };
      }
      case 'aturdir': {
        anillo(ev.origen.x * T + T / 2, ev.origen.y * T + T / 2, '#ffe066', 3 * T + 10, 420 * vel);
        for (const id of ev.ids) flotar(id, 'Aturdido', 'ef-flojo', -11);
        return { fin: now + 420 * vel };
      }
      case 'coger': {
        items = items.filter(it => it.id !== ev.itemId);
        const L = P.ents.find(e => e.lider); const v = L && vis.get(L.id);
        if (v) chispas(v.px, v.py - 6, '#ffd34d', 6);
        ganchos.coger && ganchos.coger(ev);
        return { fin: now };
      }
      case 'ko': return { fin: now };
      case 'nivel': { for (const id of ev.ids) flotar(id, '¡Nivel!', 'nivel', -14); return { fin: now + 200 * vel }; }
      case 'avistar': ganchos.avistar && ganchos.avistar(ev); return { fin: now };
      case 'jefe': temblor = 500 * vel; ganchos.jefe && ganchos.jefe(ev); return { fin: now + 700 * vel };
      case 'carga': {
        const v = V(ev.id);
        temblor = 260 * vel;
        if (v) { flotar(ev.id, '¡Carga!', 'ef-fuerte', -16); anillo(v.px, v.py - 6, '#ff4d5e', T * 1.5, 420 * vel); }
        return { fin: now + 380 * vel };
      }
      case 'peligro': peligroVis = ev.casillas || []; sucio = true; return { fin: now };
      case 'escalera': ganchos.escalera && ganchos.escalera(ev); return { fin: now };
      case 'piso': {
        fundidoObj = 1;
        const medio = now + 320 * vel;
        programar(medio, () => { reconstruirPiso(); fundidoObj = 0; ganchos.piso && ganchos.piso(ev); });
        return { fin: medio + 380 * vel };
      }
      case 'fin': {
        const t = now + 700 * vel;
        programar(t, () => ganchos.fin && ganchos.fin(ev));
        return { fin: t };
      }
      default: return { fin: now };
    }
  }

  function iniciarAtaque(ev, now) {
    const v = V(ev.id);
    const vistoAtq = visibleEnt(ev.id);
    const vistoObj = ev.golpes.some(g => visibleEnt(g.id));
    if (!v || (!vistoAtq && !vistoObj)) {
      for (const g of ev.golpes) { const o = V(g.id); if (o) { o.vhp = g.hp; if (g.ko) o.oculto = true; } }
      return { fin: now };
    }
    ganchos.texto && ganchos.texto({ s: ev.s, ataque: true, bando: v.bando });
    ponerDir(v, ev.dir);
    ponerAnim(v, 'Attack', now, false);
    const durAtk = Math.min(700, Math.max(250, S.duracionAnim(v.sp, 'Attack'))) * vel;
    const golpe = Math.min(450, Math.max(120, S.msHasta(v.sp, 'Attack'))) * vel;
    const color = COLORES[ev.mov.tipo] || '#fff';
    let impacto = now + golpe;
    if (ev.mov.clase === 'rayo' && ev.hasta) {
      const hx = ev.hasta.x * T + T / 2, hy = ev.hasta.y * T + T / 2;
      const dist = Math.hypot(hx - v.px, hy - (v.py - 8)) / T;
      const dur = (50 + dist * 40) * vel;
      efectos.push({ tipo: 'bala', x0: v.px, y0: v.py - 10, x1: hx, y1: hy - 6, t0: now + golpe, dur, color });
      impacto = now + golpe + dur;
    } else if (ev.mov.clase === 'area') {
      programar(now + golpe, () => anillo(v.px, v.py - 6, color, T * 1.6, 300 * vel));
      impacto = now + golpe + 120 * vel;
    }
    let hayKo = false;
    programar(impacto, () => {
      const t = performance.now();
      for (const g of ev.golpes) {
        const o = V(g.id);
        if (!o) continue;
        o.vhp = g.hp;
        ponerAnim(o, 'Hurt', t, false);
        o.idleEn = t + 260 * vel;
        chispas(o.px, o.py - 12, color, g.ef > 1 ? 14 : 8);
        flotar(g.id, g.ef === 0 ? '0' : String(g.dano), o.bando === 'eq' ? 'dano-eq' : g.ef > 1 ? 'dano-fuerte' : 'dano');
        if (g.ko) programar(t + 260 * vel, () => desmayar(o));
      }
    });
    for (const g of ev.golpes) if (g.ko) hayKo = true;
    const finAtq = now + durAtk;
    const finImp = impacto + (hayKo ? 760 : 240) * vel;
    programar(finAtq, () => { if (v.anim === 'Attack') { v.anim = 'Idle'; v.tAnim = performance.now(); v.bucle = true; } });
    return { fin: Math.max(finAtq, finImp) };
  }

  function desmayar(o) {
    const t = performance.now();
    o.muriendo = true;
    const tiene = S.tieneAnim(o.sp, 'Faint');
    ponerAnim(o, tiene ? 'Faint' : 'Hurt', t, false);
    o.idleEn = Infinity;
    o.tMuerte = t; o.durMuerte = 480 * vel;
    programar(t + o.durMuerte, () => { o.oculto = true; o.muriendo = false; });
  }

  function programar(t, fn) { programados.push({ t, fn }); }

  // ------------------------------------------------------------------ efectos
  function chispas(x, y, color, n) {
    const t = performance.now();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const s = 18 + Math.random() * 26;
      efectos.push({ tipo: 'chispa', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, t0: t, dur: 380 * vel, color });
    }
  }
  function anillo(x, y, color, r, dur) { efectos.push({ tipo: 'anillo', x, y, r, t0: performance.now(), dur, color }); }

  function flotar(id, txt, clase, dy = 0) {
    const el = document.createElement('div');
    el.className = 'flot ' + clase;
    el.textContent = txt;
    capa.appendChild(el);
    flotantes.push({ el, id, dy, t0: performance.now(), dur: 900 });
  }

  // ------------------------------------------------------------------ bucle
  function tick(now) {
    const dt = ultimoT ? Math.min(100, now - ultimoT) : 16;
    ultimoT = now;
    // tareas programadas
    for (let i = programados.length - 1; i >= 0; i--) {
      if (programados[i].t <= now) { const p = programados.splice(i, 1)[0]; p.fn(); }
    }
    // cola de eventos (varios instantáneos en el mismo frame)
    for (let guard = 0; guard < 50; guard++) {
      if (actual && now < actual.fin) break;
      if (actual) { const cb = actual.cb; actual = null; cb && cb(); }
      if (!cola.length) break;
      actual = iniciar(cola.shift(), now);
    }
    if (!ocupada()) sincronizar();
    // interpolación de pasos
    for (const v of vis.values()) {
      if (v.de && v.a) {
        const k = Math.min(1, (now - v.t0) / v.dur);
        v.px = v.de.x + (v.a.x - v.de.x) * k;
        v.py = v.de.y + (v.a.y - v.de.y) * k;
      }
      if (now > v.idleEn && !v.muriendo) { v.anim = 'Idle'; v.tAnim = now; v.bucle = true; v.idleEn = Infinity; }
    }
    if (fundido !== fundidoObj) fundido = fundidoObj > fundido ? Math.min(1, fundido + dt / (300 * vel)) : Math.max(0, fundido - dt / (350 * vel));
    if (temblor > 0) temblor = Math.max(0, temblor - dt);
    pintar(now);
  }

  /** Sin animaciones pendientes, la vista se ajusta al estado real (vida regenerada, refuerzos, etc.). */
  function sincronizar() {
    for (const e of P.ents) {
      const v = V(e.id);
      if (!v) continue;
      v.vhp = e.hp; v.hpMax = e.hpMax;
      if (e.vivo && v.oculto) { v.oculto = false; v.alfa = 1; v.muriendo = false; v.anim = 'Idle'; }
      if (!e.vivo && !v.muriendo) v.oculto = true;
      if (!v.de) { v.px = e.x * T + T / 2; v.py = e.y * T + T * 0.7; }
    }
  }

  function pintar(now) {
    if (!dim || !P || !mapaCanvas) return;
    const L = P.ents.find(e => e.lider);
    const vl = L && vis.get(L.id);
    const zona = libre();
    if (vl) {
      const cxCss = zona.x + zona.w / 2, cyCss = zona.y + zona.h / 2;
      cam.x = Math.round(vl.px - cxCss / dim.k);
      cam.y = Math.round(vl.py - 10 - cyCss / dim.k);
    }
    // Si nada ha cambiado de aspecto (mismos frames y posiciones), no se repinta: menos trabajo de GPU y batería.
    let firma = '';
    if (!efectos.length && !flotantes.length && !temblor && fundido === fundidoObj && !peligroVis.length) {
      firma = `${cam.x},${cam.y},${dim.w},${dim.h},${fundido}|`;
      for (const v of vis.values()) {
        if (v.oculto) continue;
        const e = P.ents.find(x => x.id === v.id);
        firma += `${v.id}:${Math.round(v.px)},${Math.round(v.py)},${v.anim},${dirDibujo(v)},${S.indiceFrame(v.sp, v.anim, false, now - v.tAnim, v.bucle)},${e && e.aturdido > 0 ? (now / 60 | 0) : 0},${v.vhp};`;
      }
      for (const it of items) firma += Math.round(Math.sin(now / 300 + it.id));
      if (firma === ultimaFirma && !sucio) return;
    }
    ultimaFirma = firma; sucio = false;
    const ctx = dim.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, dim.w, dim.h);
    let ox = -cam.x, oy = -cam.y;
    if (temblor > 0) { ox += Math.round((Math.random() - 0.5) * 4); oy += Math.round((Math.random() - 0.5) * 3); }
    ctx.drawImage(mapaCanvas, ox, oy);
    // objetos
    for (const it of items) {
      if (!P.descubierto[it.y * W + it.x]) continue;
      const bob = Math.round(Math.sin(now / 300 + it.id) * 1);
      dibujarIcono(ctx, it.clave, ox + it.x * T + 6, oy + it.y * T + 6 + bob);
    }
    // casillas en peligro (el guardián está cargando): rojo que late
    if (peligroVis.length) {
      const a = 0.28 + 0.16 * Math.sin(now / 110);
      for (const c of peligroVis) {
        const X = ox + c.x * T, Y = oy + c.y * T;
        ctx.fillStyle = `rgba(255,50,70,${a.toFixed(3)})`; ctx.fillRect(X + 1, Y + 1, T - 2, T - 2);
        ctx.fillStyle = 'rgba(255,120,130,.9)';
        ctx.fillRect(X + 1, Y + 1, T - 2, 1); ctx.fillRect(X + 1, Y + T - 2, T - 2, 1);
        ctx.fillRect(X + 1, Y + 1, 1, T - 2); ctx.fillRect(X + T - 2, Y + 1, 1, T - 2);
      }
    }
    // personajes (por profundidad)
    const lista = [];
    for (const v of vis.values()) {
      if (v.oculto) continue;
      if (v.bando === 'en' && !v.muriendo && !visibleEnt(v.id)) continue;
      lista.push(v);
    }
    lista.sort((a, b) => a.py - b.py);
    for (const v of lista) {
      let alfa = 1;
      if (v.muriendo) alfa = Math.max(0, 1 - (now - v.tMuerte) / v.durMuerte);
      if (v.jefe) {     // aura del jefe
        ctx.fillStyle = `rgba(255,61,242,${0.18 + 0.08 * Math.sin(now / 200)})`;
        ctx.beginPath(); ctx.ellipse(ox + v.px, oy + v.py, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (v.bando === 'eq') {
        const e = P.ents.find(x => x.id === v.id);
        ctx.fillStyle = e && e.lider ? 'rgba(255,181,71,.55)' : 'rgba(143,227,136,.45)';
        ctx.fillRect(ox + Math.round(v.px) - 7, oy + Math.round(v.py) + 3, 14, 1);
      }
      S.dibujar(ctx, {
        sp: v.sp, anim: v.anim, dir: dirDibujo(v), tMs: now - v.tAnim, bucle: v.bucle,
        x: ox + Math.round(v.px), y: oy + Math.round(v.py), alfa,
      });
      // barra de vida de los enemigos tocados
      if (v.bando === 'en' && v.vhp < v.hpMax && !v.muriendo) {
        const bw = v.jefe ? 22 : 16, bx = ox + Math.round(v.px) - bw / 2, by = oy + Math.round(v.py) + 4;
        ctx.fillStyle = '#1b1b1f'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = '#e05a4f'; ctx.fillRect(bx, by, Math.max(1, Math.round(bw * v.vhp / v.hpMax)), 2);
      }
      const e = P.ents.find(x => x.id === v.id);
      if (e && e.aturdido > 0 && e.vivo) {
        for (let i = 0; i < 3; i++) {
          const a = now / 250 + i * 2.09;
          ctx.fillStyle = '#ffe066';
          ctx.fillRect(ox + Math.round(v.px + Math.cos(a) * 8), oy + Math.round(v.py - 30 + Math.sin(a) * 3), 2, 2);
        }
      }
    }
    // efectos
    for (let i = efectos.length - 1; i >= 0; i--) {
      const f = efectos[i];
      const k = (now - f.t0) / f.dur;
      if (k < 0) continue;
      if (k >= 1) { efectos.splice(i, 1); continue; }
      ctx.fillStyle = f.color; ctx.strokeStyle = f.color;
      if (f.tipo === 'bala') {
        const x = ox + Math.round(f.x0 + (f.x1 - f.x0) * k), y = oy + Math.round(f.y0 + (f.y1 - f.y0) * k);
        ctx.fillRect(x - 3, y - 2, 6, 4); ctx.fillRect(x - 2, y - 3, 4, 6);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.globalAlpha = 0.5; ctx.fillStyle = f.color;
        ctx.fillRect(ox + Math.round(f.x0 + (f.x1 - f.x0) * (k - 0.12)) - 1, oy + Math.round(f.y0 + (f.y1 - f.y0) * (k - 0.12)) - 1, 3, 3);
        ctx.globalAlpha = 1;
      } else if (f.tipo === 'chispa') {
        const t = (now - f.t0) / 1000;
        ctx.globalAlpha = 1 - k;
        ctx.fillRect(ox + Math.round(f.x + f.vx * t), oy + Math.round(f.y + f.vy * t + 60 * t * t), 2, 2);
        ctx.globalAlpha = 1;
      } else if (f.tipo === 'anillo') {
        ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ox + Math.round(f.x), oy + Math.round(f.y), Math.max(1, f.r * k), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // niebla (1 px por casilla, ampliada sin suavizado)
    ctx.drawImage(nieblaCanvas, ox, oy, W * T, H * T);
    if (fundido > 0) { ctx.fillStyle = `rgba(0,0,0,${fundido})`; ctx.fillRect(0, 0, dim.w, dim.h); }
    // textos flotantes (DOM, a px CSS)
    for (let i = flotantes.length - 1; i >= 0; i--) {
      const f = flotantes[i];
      const k = (now - f.t0) / f.dur;
      if (k >= 1) { f.el.remove(); flotantes.splice(i, 1); continue; }
      const v = vis.get(f.id);
      if (!v) continue;
      const x = (ox + v.px) * dim.k, y = (oy + v.py - 26 + f.dy - k * 8) * dim.k;
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      f.el.style.opacity = k < 0.7 ? 1 : (1 - (k - 0.7) / 0.3).toFixed(2);
    }
  }

  function ocupada() { return !!actual || cola.length > 0; }

  /** Casilla bajo un punto en px CSS del canvas. */
  function celdaEn(cssX, cssY) {
    if (!dim) return null;
    return { x: Math.floor((cssX / dim.k + cam.x) / T), y: Math.floor((cssY / dim.k + cam.y) / T) };
  }

  return {
    ponerPartida, reproducir, tick, ocupada, celdaEn,
    fijarZonaLibre(fn) { libre = fn; },
    /** Centro de una casilla en px CSS del canvas. */
    aPantalla(cx, cy) { return dim ? { x: (cx * T + T / 2 - cam.x) * dim.k, y: (cy * T + T / 2 - cam.y) * dim.k } : null; },
    vhp(id) { const v = vis.get(id); return v ? v.vhp : 0; },
    escala() { return dim ? { S: dim.S, k: dim.k, w: dim.w, h: dim.h } : null; },
    destruir() { ro.disconnect(); },
  };
}
