// Arranque, objeto app, reloj (?test=1, ?reloj=), bucle único de animación, guardado y cola de momentos. Dueño: UI.

import { cargarDatos } from './data.js';
import * as state from './core/state.js';
import * as game from './core/game.js';
import * as bus from './core/bus.js';
import * as eco from './core/economy.js';
import * as S from './gfx/sprites.js';
import * as fmt from './fmt.js';
import * as audio from './audio.js';
import * as router from './ui/router.js';
import { toast } from './ui/componentes.js';
import { VERSION } from './config.js';

// ------------------------------------------------------------------ reloj
// ?reloj=2026-11-18T10:00 (hora local) o milisegundos fija el instante de partida; el reloj avanza en tiempo real.
// ?test=1 sin ?reloj usa 18-nov-2026 10:00, sin IndexedDB, y expone window.__farolillo para las pruebas.
const q = new URLSearchParams(location.search);
const TEST = q.has('test');
let base = Date.now();
const t0 = Date.now();
let desfase = 0;
if (q.get('reloj')) {
  const r = q.get('reloj');
  const v = /^\d+$/.test(r) ? Number(r) : Date.parse(r);
  if (Number.isFinite(v)) base = v;
} else if (TEST) base = new Date(2026, 10, 18, 10, 0, 0).getTime();
const ahora = () => base + (Date.now() - t0) + desfase;

// ------------------------------------------------------------------ preferencias de interfaz (por navegador)
const CLAVE_UI = 'farolillo.ui';
function leerUI() { try { return JSON.parse(localStorage.getItem(CLAVE_UI)) || {}; } catch { return {}; } }
function escribirUI(o) { try { localStorage.setItem(CLAVE_UI, JSON.stringify(o)); } catch { /* sin almacenamiento */ } }

// ------------------------------------------------------------------ app
const app = {
  save: null, datos: null, almacen: null, test: TEST, version: VERSION,
  game, sprites: S, router, bus, fmt, eco, audio,
  acciones: game,
  ahora,
  ctx: () => game.crearCtx(app.datos, ahora()),
  textos: () => (app.datos && app.datos.textos) || {},
  ui: leerUI(),
  guardarUI() { escribirUI(app.ui); },
  avisos: [],
};

let avisoGrande = false;
app.guardar = function (inmediato = true) {
  if (!app.save || !app.almacen) return;
  const r = state.guardar(app.almacen, app.save, { inmediato });
  if (r && r.conflicto) { pestanaObsoleta(); return; }
  if (r && r.grande && !avisoGrande) { avisoGrande = true; toast('La partida ocupa mucho (más de 1,5 MB). Exporta una copia.', { error: true, ms: 5000 }); }
  if (r && r.volatil) avisoVolatil();
  else if (r && r.error && !app._avisoError) { app._avisoError = true; toast('No se pudo guardar en este navegador. Exporta la partida en Ajustes.', { error: true, ms: 6000 }); }
};

// ------------------------------------------------------------------ avisos fijos de guardado
/** Sin localStorage ni IndexedDB: se juega en memoria. Aviso permanente para exportar. */
function avisoVolatil() {
  if (document.getElementById('aviso-volatil')) return;
  const d = document.createElement('div');
  d.id = 'aviso-volatil';
  d.className = 'aviso-fijo';
  d.setAttribute('role', 'alert');
  d.append('Este navegador no deja guardar: la partida se perderá al cerrar. ');
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Exportar';
  b.addEventListener('click', () => router.abrir('ajustes'));
  d.append(b);
  document.body.append(d);
}

/** Otra pestaña ha guardado después: esta deja de guardar y pide recargar (si no, pisaría el progreso). */
function pestanaObsoleta() {
  if (!app.almacen) return;
  state.bloquear(app.almacen, true);
  if (document.getElementById('aviso-pestana')) return;
  const d = document.createElement('div');
  d.id = 'aviso-pestana';
  d.className = 'bloqueo-pestana';
  d.setAttribute('role', 'alertdialog');
  d.setAttribute('aria-modal', 'true');
  const p = document.createElement('div');
  p.className = 'panel';
  const t = document.createElement('p');
  t.textContent = 'Farolillo está abierto en otra pestaña y ha guardado allí. Esta se ha quedado atrás: recárgala para seguir sin perder nada.';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn prim ancho';
  b.textContent = 'Recargar';
  b.addEventListener('click', () => location.reload());
  p.append(t, b);
  d.append(p);
  document.body.append(d);
}
app.pestanaObsoleta = pestanaObsoleta;

/** Nombre visible de un Pokémon (apodo o especie). */
app.nombre = (mon) => game.nombreMon(mon, app.datos);
app.especie = (sp) => app.datos.especies[sp] || { n: sp, t: [], s: [0, 0, 0, 0, 0, 0] };
app.nombreIsla = (id) => {
  if (id === 'misterio') return 'Mazmorra Misterio';
  const i = app.datos.islaPorId[id] || app.datos.islas.find((x) => x.clave === id);
  return i ? i.n : String(id);
};

// ------------------------------------------------------------------ momentos especiales
// La cola vive en el guardado (save.momentosPendientes): si se recarga o se cierra con el informe abierto,
// los momentos (recluta, evolución, variocolor con su Compartir) salen al volver. Cada uno se quita al cerrarlo.
const colaSinPartida = [];
const cola = () => (app.save ? (app.save.momentosPendientes = app.save.momentosPendientes || []) : colaSinPartida);
let pausaMomentos = false;
let reproduciendo = false;
bus.on('momento', (m) => {
  const c = cola();
  c.push(m);
  if (c.length > state.MAX_MOMENTOS_PENDIENTES) c.splice(0, c.length - state.MAX_MOMENTOS_PENDIENTES);
  if (!pausaMomentos) setTimeout(reproducirMomentos, 0);
});

async function reproducirMomentos() {
  if (reproduciendo || pausaMomentos) return;
  reproduciendo = true;
  try {
    while (cola().length && !router.hayModal()) {
      const c = cola();
      const m = c[0];
      const r = await router.modal('momento', { momento: m, restantes: c.length - 1 }, { oscuro: true });
      const i = c.indexOf(m);
      if (i >= 0) c.splice(i, 1);
      if (r === 'saltar') {
        // «Saltar»: fuera todos los que quedan menos los variocolor (esos salen igual: son el momento estrella).
        const quedan = c.filter((x) => x && x.tipo === 'variocolor');
        c.splice(0, c.length, ...quedan);
      }
      // Saltar quita varios de golpe: se escribe ya (si se cierra la app ahora, no vuelven a salir).
      if (r === 'saltar') app.guardar(true); else if (i >= 0) app.guardar(false);
    }
  } finally { reproduciendo = false; }
  if (!cola().length && !router.hayModal()) revisarPendientes();
}
app.alCerrarModal = () => setTimeout(reproducirMomentos, 0);

// ------------------------------------------------------------------ cala llena (§3.8)
let liberandoPara = false;   // se abrió una ficha desde «Liberar a otro»
let preguntando = false;
async function revisarPendientes() {
  const s = app.save;
  if (!s || preguntando || router.hayModal() || (app.almacen && app.almacen.bloqueado)) return;
  if (liberandoPara && router.capaAbierta('ficha')) return;   // se decide al cerrar la ficha
  if (!game.pendientesLleno(s).length) return;
  if (s.pokemon.length < game.MAX_POKEMON) {
    // Ya hay sitio (se liberó a alguien): entra con su momento.
    liberandoPara = false;
    try { game.admitirPendiente(s, 0, app.ctx()); app.guardar(true); } catch (e) { toast(e.message, { error: true }); }
    return;
  }
  if (router.hayCapa() && !liberandoPara) return;   // se pregunta al volver a la pestaña, no encima de otra pantalla
  liberandoPara = false;
  preguntando = true;
  let r;
  try { r = await router.modal('llena', { indice: 0 }); } finally { preguntando = false; }
  if (r === 'ir') { game.descartarPendiente(app.save, 0); app.guardar(true); setTimeout(revisarPendientes, 0); }
  else if (r && r.liberar) { liberandoPara = true; router.abrir('ficha', { uid: r.liberar }); }
}
app.revisarPendientes = revisarPendientes;
app.alCerrarCapa = (nombre) => { if (nombre === 'ficha' || !router.hayCapa()) setTimeout(revisarPendientes, 0); };

/** Recoge (todo o un equipo) sin enseñar nada: devuelve el Informe. Los momentos esperan al cierre del informe. */
app.recogerAhora = function (idx = null) {
  pausaMomentos = true;
  let inf;
  try {
    inf = idx == null ? game.recogerTodo(app.save, app.ctx()) : game.recogerEquipo(app.save, idx, app.ctx());
    app.guardar(true);
  } finally { pausaMomentos = false; }
  audio.sonar('recoger');
  refrescarYa();
  // Si nadie abre el informe, los momentos salen igual (con un informe abierto esperan a que se cierre).
  setTimeout(reproducirMomentos, 0);
  return inf;
};

/** Recoge y enseña el informe; al cerrarlo se reproducen los momentos. */
app.recoger = async function (idx = null) {
  const inf = app.recogerAhora(idx);
  if (inf.equipos.length || inf.cala.bayas) await router.modal('informe', { informe: inf });
  else toast('No había nada que recoger.');
  reproducirMomentos();
  return inf;
};

app.enviarTodos = function () {
  const n = game.enviarTodos(app.save, app.ctx());
  app.guardar(true);
  toast(n ? (n === 1 ? 'Un equipo ha salido.' : `${n} equipos han salido.`) : 'No hay equipos libres con quien salir.');
  refrescarYa();
  return n;
};

// ------------------------------------------------------------------ refresco
let pendiente = false;
function refrescar() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => { pendiente = false; refrescarYa(); });
}
function refrescarYa() {
  pintarBarra();
  router.actualizar();
}
app.refrescar = refrescar;

function pintarBarra() {
  const s = app.save;
  if (!s) return;
  const obj = Object.values(s.objetos || {}).reduce((a, b) => a + (b | 0), 0);
  // En pantallas estrechas (o con cifras grandes) formato corto, «31,6K»; el número entero va en el title.
  const estrecha = window.innerWidth < 400;
  const poner = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    const txt = estrecha || Math.abs(n) >= 10_000 ? fmt.corto(n) : fmt.num(n);
    if (el.textContent !== txt) el.textContent = txt;
    const tit = fmt.entero(n);
    if (el.title !== tit) el.title = tit;
  };
  poner('r-monedas', s.monedas);
  poner('r-bayas', s.bayas);
  poner('r-objetos', obj);
}

function pintarPuntos(lista) {
  const tabs = new Set(lista.map((a) => String(a.destino || '').split(':')[0]));
  for (const b of document.querySelectorAll('#tabs .tab')) {
    let p = b.querySelector('.punto');
    const t = b.dataset.tab;
    // «Equipo de vuelta» también se marca en Expediciones.
    const on = tabs.has(t) || (t === 'expediciones' && lista.some((a) => a.tipo === 'vuelta'));
    if (on && !p) b.append(Object.assign(document.createElement('i'), { className: 'punto' }));
    if (!on && p) p.remove();
  }
}

function aplicarTema() {
  const h = new Date(ahora()).getHours();
  const noche = h >= 22 || h < 7 || (!TEST && matchMedia('(prefers-color-scheme: dark)').matches);
  const tema = noche ? 'noche' : 'dia';
  if (document.documentElement.dataset.tema !== tema) document.documentElement.dataset.tema = tema;
  // Color de la barra del sistema (Android Chrome, PWA instalada) según el tema.
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = noche ? '#0a1328' : '#14213d';
  if (meta && meta.getAttribute('content') !== color) meta.setAttribute('content', color);
  const red = app.save && app.save.ajustes && app.save.ajustes.reducirAnim ? '1' : '';
  if ((document.documentElement.dataset.reducirAnim || '') !== red) {
    if (red) document.documentElement.dataset.reducirAnim = red; else delete document.documentElement.dataset.reducirAnim;
  }
  if (app.save) audio.ponerVolumen(app.save.ajustes.sonido);
}
app.aplicarTema = aplicarTema;

let ultimoDeVuelta = -1;
/** Tiempo oculta a partir del cual, al volver con equipos de vuelta, se abre «Mientras estabas fuera…». */
const VUELTA_INFORME_MS = 5 * 60_000;
function tick() {
  if (!app.save) return;
  const r = game.tick(app.save, app.ctx());
  app.avisos = r.avisos;
  document.title = r.titulo;
  pintarPuntos(r.avisos);
  ultimoDeVuelta = r.deVuelta;
}
app.tick = tick;

function latido() {
  if (!app.save) return;
  aplicarTema();
  const dv = game.equiposDeVuelta(app.save, app.ctx()).length;
  if (dv !== ultimoDeVuelta) { tick(); router.actualizar(); }
  router.latido();
}

// ------------------------------------------------------------------ arranque
function iconosTabs() {
  for (const i of document.querySelectorAll('#tabs .ico')) {
    i.style.setProperty('--m', `url("${new URL(`assets/ui/${i.dataset.ico}.svg`, location.href)}")`);
  }
}

// Bucle de animación bajo demanda y a ritmo de pixel-art: las escenas cambian de frame a 15 fps, así que no se
// despierta al hilo 60 veces por segundo. Entre paso y paso, setTimeout hasta ~12 ms antes del siguiente y
// entonces un rAF (que pinta alineado con el refresco). Sin toques durante 20 s o con «Reducir animaciones»,
// 8 fps. Solo sigue si la capa de arriba tiene escenas (router.hayEscenasActivas) y alguna de ellas ha querido
// frames (iniciada, en pantalla según IntersectionObserver y con la pestaña visible: S.consumirFrames). El router
// lo reactiva al registrar una escena o al cambiar de capa; una escena que vuelve a verse, con S.alDespertar.
const PASO_RAPIDO = 1000 / 15, PASO_LENTO = 1000 / 8, ADELANTO = 8, REPOSO_MS = 20_000;
let rafId = 0, timerId = 0, ultimoFrame = 0, ultimoToque = performance.now();
function pasoActual() {
  const lento = document.documentElement.dataset.reducirAnim === '1' || S.reducirAnim() || performance.now() - ultimoToque > REPOSO_MS;
  return lento ? PASO_LENTO : PASO_RAPIDO;
}
function bucle(t) {
  rafId = 0;
  ultimoFrame = performance.now();   // hora real del callback (t es el inicio del frame y puede ir por detrás)
  S.consumirFrames();
  router.render(t);
  if (router.hayEscenasActivas() && S.consumirFrames()) programar();
}
function programar() {
  if (rafId || timerId) return;
  const espera = ultimoFrame + pasoActual() - performance.now() - ADELANTO;
  if (espera > 1) timerId = setTimeout(() => { timerId = 0; rafId = requestAnimationFrame(bucle); }, espera);
  else rafId = requestAnimationFrame(bucle);
}
function pedirFrame() { programar(); }
app.pedirFrame = pedirFrame;
S.alDespertar(pedirFrame);
// Cualquier toque o tecla devuelve el bucle a 15 fps (y lo adelanta si estaba a 8).
function alToque() {
  const estabaLento = performance.now() - ultimoToque > REPOSO_MS;
  ultimoToque = performance.now();
  if (estabaLento && timerId) { clearTimeout(timerId); timerId = 0; programar(); }
}
for (const ev of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, alToque, { passive: true, capture: true });

/**
 * Sin conexión: pide al service worker que guarde el retrato y los sprites de cada miembro del gremio.
 * Se cargan a demanda, así que sin esto faltaría lo que aún no se ha visto con conexión (p. ej. el retrato
 * del guía en Expediciones si la primera vez solo se abrió la cala). El SW se salta lo que ya tiene.
 */
function guardarParaSinConexion() {
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!sw || !app.save || navigator.onLine === false) return;
  const urls = new Set();
  for (const m of app.save.pokemon || []) for (const u of S.urlsEsenciales(m.sp, !!m.vr)) urls.add(u);
  if (urls.size) sw.postMessage({ tipo: 'guardar-pmd', urls: [...urls] });
}
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('controllerchange', () => setTimeout(guardarParaSinConexion, 1000));

/** Tras crear la partida (pantalla de inicio) o al cargarla. */
app.empezar = function (save) {
  app.save = save;
  router.cerrarInicio();
  aplicarTema();
  pintarBarra();
  tick();
  router.irTab('cala', { forzar: true });
  const dv = game.equiposDeVuelta(save, app.ctx());
  if (dv.length) router.modal('informe', { pendiente: true });
  // Momentos que quedaron sin ver (recarga con el informe abierto) y reclutas esperando sitio.
  setTimeout(reproducirMomentos, 0);
  setTimeout(guardarParaSinConexion, 1500);
};

app.crearPartida = function ({ guia, faro, nombre }) {
  if (app.almacen) state.bloquear(app.almacen, false);
  const { save } = game.iniciarPartida({ guia, faro, nombre }, app.ctx());
  app.save = save;
  app.guardar(true);
  state.persistir(app.almacen);
  app.empezar(save);
};

/** Sustituye la partida (importar). */
app.reemplazarPartida = function (nueva) {
  app.save = nueva;
  app.guardar(true);
  tick();
  router.irTab('cala', { forzar: true });
  refrescarYa();
  setTimeout(reproducirMomentos, 0);
};

// ------------------------------------------------------------------ partida que no se puede cargar
/**
 * Hay una partida guardada pero no se puede convertir (versión más nueva, datos dañados…). No se ofrece partida
 * nueva sin avisar: se enseña el error, el texto en bruto para copiarlo o descargarlo, y «Empezar de cero» con
 * confirmación (el texto sigue a salvo en farolillo.save.roto).
 */
function mostrarRoto(roto) {
  const v = document.getElementById('vista');
  document.getElementById('app').classList.add('sin-nav');
  v.classList.add('inicio-fondo');
  v.replaceChildren();
  const el = (tag, props = {}, ...hijos) => { const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e; };
  const area = el('textarea', { className: 'txt', readOnly: true, rows: 6, value: roto.texto });
  area.setAttribute('aria-label', 'Texto de la partida guardada');
  const copiar = el('button', { type: 'button', className: 'btn' }, 'Copiar texto');
  copiar.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(roto.texto); toast('Copiado.'); } catch { area.select(); toast('Selecciona el texto y cópialo.'); }
  });
  const bajar = el('button', { type: 'button', className: 'btn' }, 'Descargar copia');
  bajar.addEventListener('click', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([roto.texto], { type: 'application/json' })), download: 'farolillo-partida.json' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  const reintentar = el('button', { type: 'button', className: 'btn prim' }, 'Volver a intentar');
  reintentar.addEventListener('click', () => location.reload());
  const cero = el('button', { type: 'button', className: 'btn peligro ancho' }, 'Empezar de cero');
  cero.addEventListener('click', async () => {
    const ok = await router.confirmar('¿Empezar una partida nueva? La que no se puede cargar se sustituirá (su texto queda guardado aparte).', { si: 'Empezar de cero', peligro: true });
    if (ok) { v.replaceChildren(); router.mostrarInicio(); }
  });
  v.append(el('div', { className: 'inicio' },
    el('h2', {}, 'No se pudo cargar tu partida'),
    el('p', {}, roto.error),
    el('p', { className: 'peq' }, 'No se ha borrado nada. Si acabas de volver a una versión anterior, abre la más reciente. Copia o descarga el texto para no perderlo.'),
    area,
    el('div', { className: 'botones' }, copiar, bajar),
    el('div', { className: 'botones' }, reintentar),
    cero));
}

async function arrancar() {
  iconosTabs();
  const [datos] = await Promise.all([cargarDatos('./'), S.iniciar('./assets/')]);
  app.datos = datos;
  // localStorage de verdad (Safari con cookies bloqueadas lanza al leerlo o al escribir): si no, se avisa.
  const lsReal = (() => {
    try { const ls = window.localStorage; const k = 'farolillo.prueba'; ls.setItem(k, '1'); ls.removeItem(k); return ls; } catch { return null; }
  })();
  app.almacen = state.crearAlmacen({
    localStorage: lsReal,
    sinLocalStorage: !lsReal,
    indexedDB: TEST ? null : (window.indexedDB || null),
    storage: navigator.storage,
    // state.js llama a almacen.st(...): en el navegador setTimeout necesita su window (si no, «Illegal invocation»).
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  });
  if (TEST && q.has('nuevo')) {
    try { for (const k of [state.CLAVE, state.CLAVE_REV, state.CLAVE_ROTO, CLAVE_UI]) localStorage.removeItem(k); app.ui = {}; } catch { /* nada */ }
  }
  if (app.almacen.volatil) avisoVolatil();
  router.iniciar(app);
  bus.on('save:cambio', () => { app.guardar(false); refrescar(); });
  let ocultaDesde = 0;
  /** Vuelve a primer plano (pestaña visible otra vez o página restaurada de la bfcache de Safari/Chrome). */
  function alVolver() {
    // Otra pestaña guardó mientras esta estaba oculta: no seguir con el estado viejo.
    if (app.almacen && state.hayEscrituraAjena(app.almacen)) { pestanaObsoleta(); return; }
    ultimoToque = performance.now();
    tick(); refrescar(); pedirFrame();
    setTimeout(guardarParaSinConexion, 2000);
    // Al volver tras un rato con equipos de vuelta: «Mientras estabas fuera…» (§2.1), como al abrir en frío.
    const fuera = ocultaDesde ? Date.now() - ocultaDesde : 0;
    ocultaDesde = 0;
    if (app.save && fuera >= VUELTA_INFORME_MS && !router.hayModal() && game.equiposDeVuelta(app.save, app.ctx()).length) {
      router.modal('informe', { pendiente: true });
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ocultaDesde = Date.now(); app.guardar(true); return; }
    alVolver();
  });
  window.addEventListener('pagehide', () => { if (!ocultaDesde) ocultaDesde = Date.now(); app.guardar(true); });
  // iOS Safari y Chrome restauran la página de la bfcache sin visibilitychange en algunos casos.
  window.addEventListener('pageshow', (e) => { if (e.persisted) alVolver(); });
  // La barra cambia a cifras cortas por debajo de 400 px (al girar el móvil).
  window.addEventListener('resize', () => pintarBarra(), { passive: true });
  // Dos pestañas: si la otra guarda, esta se bloquea (nunca pisa el progreso con su copia vieja).
  window.addEventListener('storage', (e) => {
    if (e.key === state.CLAVE_REV && app.almacen && e.newValue !== app.almacen.rev) pestanaObsoleta();
  });
  const save = await state.cargar(app.almacen);
  aplicarTema();
  if (save) app.empezar(save);
  else if (app.almacen.roto) mostrarRoto(app.almacen.roto);
  else router.mostrarInicio();
  setInterval(tick, 30_000);
  setInterval(latido, 1000);
  pedirFrame();

  if (TEST) {
    window.__farolillo = {
      app, ahora,
      avanzar(ms) { desfase += ms; tick(); refrescarYa(); router.latido(); },
      /** Juega n rondas sin pantallas: mejora lo más barato, envía a todos, avanza y recoge (solo pruebas). */
      jugar(n = 5, ms = 3 * 3600_000) {
        pausaMomentos = true;
        try {
          for (let i = 0; i < n; i++) {
            const s = app.save;
            for (const b of ['muelle', 'linterna', 'huerto', 'taberna', 'despensa']) game.mejorar(s, b, app.ctx());
            game.igualar(s, app.ctx());
            for (const m of s.pokemon) {
              const op = game.opcionesEvolucion(s, m.id, app.ctx()).find((o) => o.posible);
              if (op) { try { game.evolucionar(s, m.id, op.a, app.ctx()); } catch { /* nada */ } }
            }
            game.enviarTodos(s, app.ctx());
            desfase += ms;
            game.recogerTodo(s, app.ctx());
          }
        } finally { pausaMomentos = false; cola().length = 0; game.pendientesLleno(app.save).length = 0; }
        app.guardar(true); tick(); refrescarYa();
      },
      listo: true,
    };
  }
}

arrancar().catch((e) => {
  console.error(e);
  const v = document.getElementById('vista');
  v.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'cargando';
  d.textContent = 'No se pudo arrancar: ' + (e.message || e);
  v.append(d);
});
