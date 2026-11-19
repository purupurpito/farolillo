// Piezas de interfaz reutilizables: creación de nodos, botones, retratos, barras, avisos y diálogos. Dueño: UI.

import * as S from '../gfx/sprites.js';

/**
 * h('div.clase#id', { attr, on: { click } }, ...hijos). Los hijos pueden ser texto, nodos, arrays o null.
 */
export function h(sel, attrs, ...hijos) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    hijos.unshift(attrs);
    attrs = {};
  }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const p of m[2].match(/[.#][\w-]+/g)) {
      if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1);
    }
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'on') { for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); }
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  anadir(el, hijos);
  return el;
}

function anadir(el, hijos) {
  for (const c of hijos) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) anadir(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Vacía un nodo y le pone hijos nuevos. */
export function poner(el, ...hijos) { el.replaceChildren(); anadir(el, hijos); return el; }

/** Botón. tipo: '' | 'prim' | 'ok' | 'peligro' | 'fino'. */
export function boton(texto, fn, { tipo = '', ancho = false, deshabilitado = false, icono = null, titulo = null, extra = '' } = {}) {
  return h('button', {
    class: ['btn', tipo, ancho ? 'ancho' : '', extra].filter(Boolean).join(' '),
    type: 'button', disabled: !!deshabilitado, title: titulo,
    on: { click: (e) => { e.stopPropagation(); vibrar(10); fn && fn(e); } },
  }, icono ? icon(icono) : null, texto);
}

// ------------------------------------------------------------------ respuesta háptica

let appRef = null;
/** Lo llama router.iniciar: da acceso a las preferencias (app.ui.vibrar) y a «reducir animaciones». */
export function configurar(app) { appRef = app; }

/** ¿Se puede vibrar? Respeta el ajuste (app.ui.vibrar !== false) y «reducir animaciones». */
export function puedeVibrar() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  if (appRef && appRef.ui && appRef.ui.vibrar === false) return false;
  if (document.documentElement.dataset.reducirAnim === '1') return false;
  return true;
}

/** Vibración corta: 10 ms en pestañas y botones, [15, 40, 15] al recoger. En iOS no existe: no hace nada. */
export function vibrar(patron = 10) {
  if (!puedeVibrar()) return;
  try { navigator.vibrate(patron); } catch { /* sin vibración */ }
}

/** Icono SVG propio de assets/ui. */
export function icon(nombre, clase = 'ico-i', alt = '') {
  return h('img', { class: clase + ' px', src: `assets/ui/${nombre}.svg`, alt, width: 14, height: 14 });
}

/** Retrato <img> con respaldo a Normal. */
export function retrato(sp, { vr = false, emo = 'Normal', clase = '', silueta = false, alt = '' } = {}) {
  const url = sp ? S.urlRetrato(sp, emo, vr) : '';
  return h('img', {
    class: ['retrato', clase, silueta ? 'silueta' : ''].filter(Boolean).join(' '),
    src: url || 'assets/ui/faro.svg', alt, loading: 'lazy', decoding: 'async', width: 40, height: 40, draggable: 'false',
  });
}

/** Barra de progreso (0-1). */
export function barra(frac, { verde = false, titulo = null } = {}) {
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  return h('div', { class: 'barra-prog' + (verde ? ' verde' : ''), role: 'progressbar', 'aria-valuenow': Math.round(f * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, title: titulo },
    h('i', { style: { width: (f * 100).toFixed(1) + '%' } }));
}

export function estrellas(n) { return n ? h('span.estrellas', { title: `${n} estrellas` }, '★'.repeat(n)) : null; }

export function corazones(pv, max) {
  const llenos = Math.max(0, pv | 0), total = Math.max(llenos, max | 0);
  return h('span.pv', { title: `${llenos} de ${total} PV` }, '♥'.repeat(llenos) + '♡'.repeat(Math.max(0, total - llenos)));
}

export function simbolo(s) {
  return h('span', { class: s === '▲' ? 'sym-up' : s === '▼' ? 'sym-dn' : '' }, s);
}

const COLOR_TIPO = {
  normal: '#8a8a6a', fuego: '#d4602a', agua: '#3f7fd0', planta: '#4f9a3a', electrico: '#c9a20e', hielo: '#4fa6a6',
  lucha: '#a8342b', veneno: '#8a3f8f', tierra: '#a8823a', volador: '#7f78c8', psiquico: '#d4487a', bicho: '#7f9a1a',
  roca: '#9a8436', fantasma: '#5a4a8a', dragon: '#5a3ad0', siniestro: '#5a4a3f', acero: '#7f7f9a', hada: '#c86aa6',
};
export function chipTipo(t, nombres) {
  return h('span.tipo', { style: { background: COLOR_TIPO[t] || '#666' } }, (nombres && nombres[t]) || t);
}

// ------------------------------------------------------------------ toast

// Como mucho 2 a la vez y 2 s por defecto. Va arriba, bajo la barra; si en ese sitio pisa un botón principal
// (.btn.prim / .btn.ok) se prueba el siguiente de la lista (en horizontal: sobre el lienzo, a la derecha, abajo).
const MAX_TOASTS = 2;
const SITIOS_V = ['', 'pos-abajo', 'pos-centro'];
const SITIOS_H = ['', 'pos-der', 'pos-abajo', 'pos-abajo pos-der', 'pos-centro'];

function solape(a, b) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? x * y : 0;
}

/** Área del toast que pisa botones principales visibles. */
function pisa(raiz) {
  const r = raiz.getBoundingClientRect();
  if (!r.width || !r.height) return 0;
  let total = 0;
  for (const b of document.querySelectorAll('.btn.prim, .btn.ok')) {
    const q = b.getBoundingClientRect();
    if (!q.width || !q.height || q.bottom <= 0 || q.top >= innerHeight) continue;
    total += solape(r, q);
  }
  return total;
}

/** Coloca #toast en el primer sitio donde no pisa botones principales (o en el que menos pisa). */
export function recolocarToast() {
  const raiz = document.getElementById('toast');
  if (!raiz || !raiz.children.length) return;
  const horizontal = matchMedia('(orientation: landscape) and (max-height: 540px)').matches;
  const sitios = horizontal ? SITIOS_H : SITIOS_V;
  let mejor = null, menor = Infinity;
  for (const s of sitios) {
    raiz.className = s;
    const p = pisa(raiz);
    if (p < menor) { menor = p; mejor = s; }
    if (!p) break;
  }
  raiz.className = mejor || '';
}

export function toast(texto, { error = false, ms = 2000 } = {}) {
  const raiz = document.getElementById('toast');
  if (!raiz || !texto) return;
  const t = h('div', { class: 'toast' + (error ? ' error' : ''), role: error ? 'alert' : 'status' }, texto);
  raiz.append(t);
  while (raiz.children.length > MAX_TOASTS) raiz.firstChild.remove();
  // La pantalla suele cambiar justo después (refresco tras recoger o enviar): se vuelve a mirar un poco más tarde.
  recolocarToast();
  requestAnimationFrame(recolocarToast);
  setTimeout(recolocarToast, 150);
  setTimeout(recolocarToast, 600);
  setTimeout(() => { t.remove(); }, ms);
}

/** «Enviar a todos» desde cualquier pantalla: app.enviarTodos() con su sonido (main.js no lo pone). Devuelve cuántos salen. */
export function enviarTodos(app) {
  const n = app.enviarTodos();
  if (n && app.audio && app.audio.sonar) app.audio.sonar('enviar');
  return n;
}

/** Ejecuta fn y enseña su error (mensajes en castellano de game.js) como toast. */
export function intentar(fn) {
  try { return fn(); } catch (e) { toast(e.message || String(e), { error: true }); console.warn(e); return undefined; }
}
