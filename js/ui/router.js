// Router: pestañas, capas a pantalla completa (Formar, Ficha, Ajustes…) y modales (Informe, Momento, Selector…).
// Cada pantalla exporta montar(raiz, app, params, ctl) → { actualizar(), desmontar(), latido?() }.
// ctl = { cerrar(valor), titulo(texto), escena(e), cabecera } según la capa. Dueño: UI.

import { h, boton, configurar, vibrar } from './componentes.js';
import * as cala from './cala.js';
import * as expediciones from './expediciones.js';
import * as bitacora from './bitacora.js';
import * as gremio from './gremio.js';
import * as formar from './formar.js';
import * as encurso from './encurso.js';
import * as ficha from './ficha.js';
import * as ajustes from './ajustes.js';
import * as creditos from './creditos.js';
import * as informe from './informe.js';
import * as momento from './momento.js';
import * as selector from './selector.js';
import * as dialogo from './dialogo.js';
import * as inicio from './inicio.js';
import * as llena from './llena.js';

const TABS = { cala, expediciones, bitacora, gremio };
const CAPAS = { formar, encurso, ficha, ajustes, creditos };
const MODALES = { informe, momento, selector, dialogo, llena };

let app = null;
let tabActual = null;      // { nombre, vista, escenas }
let inicioVista = null;
const capas = [];          // { nombre, el, vista, escenas }
const modales = [];        // { nombre, el, vista, escenas, resolver }
let sello = 0;

export function iniciar(a) {
  app = a;
  configurar(a);
  for (const b of document.querySelectorAll('#tabs .tab')) {
    b.addEventListener('click', () => { vibrar(10); irTab(b.dataset.tab); });
  }
  document.getElementById('b-menu').addEventListener('click', () => { vibrar(10); abrir('ajustes'); });
  iniciarAtras();
}

// ------------------------------------------------------------------ atrás del sistema (history)
// Cada capa o modal abierto tiene una entrada propia en el historial: history.state = { farolillo: n }, con n = cuántas
// capas + modales hay abiertos. El botón atrás de Android, el gesto de iOS o page.goBack() sacan una entrada (popstate)
// y aquí se cierra lo de arriba (modal antes que capa). Al cerrar desde la interfaz («‹», «✕», Cancelar) se consume la
// entrada con history.go(-n); la bandera enVuelo evita que ese popstate cierre otra cosa. La URL no cambia nunca.
let histN = 0;            // entradas propias por encima de la base (lo que dice history.state)
let enVuelo = false;      // hay un history.go() nuestro esperando su popstate
let tVuelo = 0;
let syncPedido = false;

function profundidad() { return capas.length + modales.length; }
function nivelDe(st) { return (st && typeof st === 'object' && Number.isFinite(st.farolillo)) ? st.farolillo | 0 : 0; }

/** Pide igualar el historial con lo abierto (en un microtask: irTab cierra varias capas de golpe). */
function sincronizarPronto() {
  if (syncPedido) return;
  syncPedido = true;
  queueMicrotask(() => { syncPedido = false; sincronizar(); });
}

function sincronizar() {
  if (enVuelo) return;
  const d = profundidad();
  if (d > histN) {
    for (let k = histN + 1; k <= d; k++) {
      // Safari limita pushState (≈100 cada 10 s): si falla se queda sin entrada y se reintenta en el siguiente cambio.
      try { history.pushState({ farolillo: k }, ''); histN = k; } catch { break; }
    }
  } else if (d < histN) {
    enVuelo = true;
    clearTimeout(tVuelo);
    // Red de seguridad: si el popstate no llega (navegador raro), se recalcula con lo que diga history.state.
    tVuelo = setTimeout(() => { if (!enVuelo) return; enVuelo = false; histN = nivelDe(history.state); sincronizar(); }, 800);
    history.go(d - histN);
  }
}

/** Atrás sobre lo de arriba. Devuelve false si no había nada o si la pantalla decide quedarse (se vuelve a meter la entrada). */
function atrasSuperior() {
  if (modales.length) {
    const m = modales[modales.length - 1];
    if (m.vista && typeof m.vista.atras === 'function') {
      let r = false;
      try { r = m.vista.atras(); } catch (e) { console.error(e); }
      return !!r;
    }
    cerrarModal(m, m.nombre === 'dialogo' && !m.params.campo ? false : null);
    return true;
  }
  if (capas.length) {
    const c = capas[capas.length - 1];
    if (c.vista && typeof c.vista.atras === 'function') {
      let r = false;
      try { r = c.vista.atras(); } catch (e) { console.error(e); }
      if (r === false) return false;
      if (r === true) return true;
    }
    cerrarCapa(c);
    return true;
  }
  return false;
}

/** Atrás de la propia app (Escape, gesto del borde): como el del sistema, pero sin pasar por el historial. */
export function atras() {
  const r = atrasSuperior();
  sincronizarPronto();
  return r;
}

function iniciarAtras() {
  histN = nivelDe(history.state);
  // Recarga con entradas viejas encima: se vuelve a la base (no hay nada abierto todavía).
  if (histN > 0) sincronizar();
  window.addEventListener('popstate', (ev) => {
    const n = nivelDe(ev.state);
    if (enVuelo) { enVuelo = false; clearTimeout(tVuelo); histN = n; sincronizar(); return; }
    histN = n;
    // El usuario ha ido atrás (o adelante): se cierra lo que sobra, de arriba abajo.
    let sobran = profundidad() - n;
    while (sobran-- > 0) { if (!atrasSuperior()) break; }
    sincronizarPronto();
  });
  // Escritorio: Escape cierra lo de arriba (salvo con un desplegable abierto, que ya lo usa).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !profundidad()) return;
    if (e.target && e.target.tagName === 'SELECT') return;
    e.preventDefault();
    atras();
  });
  iniciarGestoBorde();
}

// iOS en pantalla de inicio (standalone) no tiene botón atrás ni gesto de Safari: deslizar desde el borde izquierdo
// (empezando a menos de 24 px y recorriendo más de 60 px en horizontal) sobre una capa la cierra. En Safari normal
// ese gesto ya es el «atrás» del navegador (llega como popstate), así que aquí solo se escucha en standalone o con ?gesto=1.
function iniciarGestoBorde() {
  const q = new URLSearchParams(location.search);
  let standalone = false;
  try { standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches; } catch { /* nada */ }
  if (!standalone && !q.has('gesto')) return;
  let ini = null;
  document.addEventListener('touchstart', (e) => {
    ini = null;
    if (e.touches.length !== 1 || modales.length || !capas.length) return;
    const t = e.touches[0];
    if (t.clientX < 24) ini = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!ini) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ini.x, dy = Math.abs(t.clientY - ini.y);
    ini = null;
    if (dx > 60 && dy < dx) atras();
  }, { passive: true });
  document.addEventListener('touchcancel', () => { ini = null; }, { passive: true });
}

function ctlEscenas(capa) {
  return (e) => { capa.escenas.push(e); e.iniciar && e.iniciar(); despertar(); return e; };
}

/** Pide a main.js que vuelva a mover el bucle de animación (se para cuando la capa de arriba no tiene escenas). */
function despertar() { app && app.pedirFrame && app.pedirFrame(); }

/** ¿Tiene escenas vivas la capa visible de arriba? (main.js solo pide frames entonces). */
export function hayEscenasActivas() {
  const s = superior();
  return !!(s && s.escenas && s.escenas.some((e) => !e.destruida));
}

function desmontarVista(c) {
  try { c.vista && c.vista.desmontar && c.vista.desmontar(); } catch (e) { console.error(e); }
  for (const e of c.escenas || []) { try { e.destruir(); } catch (err) { console.error(err); } }
  c.escenas = [];
}

/** Pantalla de primer arranque (sin barra ni pestañas). */
export function mostrarInicio() {
  const raiz = document.getElementById('vista');
  document.getElementById('app').classList.add('sin-nav');
  raiz.replaceChildren();
  raiz.classList.add('inicio-fondo');
  const capa = { nombre: 'inicio', escenas: [] };
  capa.vista = inicio.montar(raiz, app, {}, { escena: ctlEscenas(capa) });
  inicioVista = capa;
}

export function cerrarInicio() {
  if (inicioVista) desmontarVista(inicioVista);
  inicioVista = null;
  const raiz = document.getElementById('vista');
  raiz.classList.remove('inicio-fondo');
  document.getElementById('app').classList.remove('sin-nav');
}

export function irTab(nombre, params = {}) {
  if (!TABS[nombre]) nombre = 'cala';
  // Volver a una pestaña cierra las capas abiertas encima.
  while (capas.length) cerrar();
  if (tabActual && tabActual.nombre === nombre && !params.forzar) {
    document.getElementById('vista').scrollTop = 0;
    if (params.sub && tabActual.vista.sub) tabActual.vista.sub(params.sub);
    return;
  }
  if (tabActual) desmontarVista(tabActual);
  const raiz = document.getElementById('vista');
  raiz.replaceChildren();
  raiz.scrollTop = 0;
  const capa = { nombre, escenas: [] };
  tabActual = capa;
  capa.vista = TABS[nombre].montar(raiz, app, params, { escena: ctlEscenas(capa) });
  for (const b of document.querySelectorAll('#tabs .tab')) {
    if (b.dataset.tab === nombre) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  app.alCambiarTab && app.alCambiarTab(nombre);
}

export function tab() { return tabActual ? tabActual.nombre : null; }

/** Abre una capa a pantalla completa con cabecera «‹ Título». */
export function abrir(nombre, params = {}) {
  const mod = CAPAS[nombre];
  if (!mod) return;
  const titulo = h('h2', '');
  const cabecera = h('div.capa-cab',
    h('button', { class: 'btn-icono volver', type: 'button', 'aria-label': 'Volver', on: { click: () => cerrar() } }, '‹'),
    titulo);
  const cuerpo = h('div.capa-cuerpo');
  const el = h('section.capa', { role: 'dialog', 'aria-modal': 'true', 'data-capa': nombre }, cabecera, cuerpo);
  document.getElementById('capas').append(el);
  const capa = { nombre, el, escenas: [], id: ++sello };
  capas.push(capa);
  capa.vista = mod.montar(cuerpo, app, params, {
    cerrar: () => cerrarCapa(capa),
    titulo: (t) => { titulo.textContent = t; },
    escena: ctlEscenas(capa),
    cabecera,
  });
  sincronizarPronto();
  return capa;
}

function cerrarCapa(capa) {
  const i = capas.indexOf(capa);
  if (i < 0) return;
  // Cierra también lo que tenga encima.
  const cerradas = [];
  while (capas.length > i) {
    const c = capas.pop();
    desmontarVista(c);
    c.el.remove();
    cerradas.push(c.nombre);
  }
  sincronizarPronto();
  actualizar();
  for (const n of cerradas) app.alCerrarCapa && app.alCerrarCapa(n);
}

export function cerrar() { if (capas.length) cerrarCapa(capas[capas.length - 1]); }
export function capaAbierta(nombre) { return capas.some((c) => c.nombre === nombre); }

/** Abre un modal. Devuelve una promesa con el valor con el que se cierre. */
export function modal(nombre, params = {}, { oscuro = false } = {}) {
  const mod = MODALES[nombre];
  return new Promise((resolver) => {
    const panel = h('div', { class: nombre === 'momento' ? 'momento' : 'modal panel', role: 'dialog', 'aria-modal': 'true' });
    const fondo = h('div', { class: 'modal-fondo' + (oscuro ? ' oscuro' : ''), 'data-modal': nombre }, panel);
    document.getElementById('modales').append(fondo);
    const m = { nombre, el: fondo, escenas: [], resolver, id: ++sello, params };
    modales.push(m);
    m.vista = mod.montar(panel, app, params, {
      cerrar: (v) => cerrarModal(m, v),
      escena: ctlEscenas(m),
      titulo: () => {},
      panel,
    });
    if (params.cerrarFuera) fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrarModal(m, null); });
    sincronizarPronto();
  });
}

function cerrarModal(m, valor) {
  const i = modales.indexOf(m);
  if (i < 0) return;
  modales.splice(i, 1);
  desmontarVista(m);
  m.el.remove();
  sincronizarPronto();
  m.resolver(valor);
  actualizar();
  app.alCerrarModal && app.alCerrarModal(m.nombre);
}

export function hayCapa() { return capas.length > 0; }

export function hayModal(nombre) { return nombre ? modales.some((m) => m.nombre === nombre) : modales.length > 0; }

/** Capa visible arriba del todo (para animar solo sus escenas). */
function superior() {
  if (modales.length) return modales[modales.length - 1];
  if (capas.length) return capas[capas.length - 1];
  return inicioVista || tabActual;
}

/** Bucle único: lo llama main.js en cada requestAnimationFrame. */
export function render(t) {
  const s = superior();
  if (!s) return;
  // Las escenas destruidas por la propia pantalla (inicio.js al cambiar de paso) salen de la lista.
  if (s.escenas.some((e) => e.destruida)) s.escenas = s.escenas.filter((e) => !e.destruida);
  for (const e of s.escenas) { try { e.render(t); } catch (err) { console.error(err); } }
  // El modal de informe deja ver la pantalla de debajo: no hace falta animarla.
}

function cada(fn) {
  for (const c of [tabActual, ...capas, ...modales]) {
    if (!c || !c.vista) continue;
    try { fn(c.vista); } catch (e) { console.error(e); }
  }
}

/** Redibuja todo lo montado (tras un cambio del guardado). */
export function actualizar() { cada((v) => v.actualizar && v.actualizar()); despertar(); }

/** Actualización ligera cada segundo (cuentas atrás, barras). */
export function latido() { cada((v) => (v.latido ? v.latido() : null)); }

// ------------------------------------------------------------------ diálogos rápidos

export function confirmar(texto, { si = 'Sí', no = 'Cancelar', peligro = false } = {}) {
  return modal('dialogo', { texto, si, no, peligro });
}

export function pedirTexto(texto, { valor = '', max = 12, si = 'Guardar' } = {}) {
  return modal('dialogo', { texto, campo: true, valor, max, si, no: 'Cancelar' });
}

export { boton };
