// PWA: registro del service worker, aviso de versión nueva, almacenamiento persistente e instalación.
// Se carga como <script type="module"> propio desde index.html; main.js no lo importa. Dueño: PWA.
//   ?test=1 → no se registra el SW (salvo con ?sw=1, que lo fuerza para las pruebas).
//   estado()   → { standalone, ios, android, persistido, puedeInstalar, sw }
//   instalar() → Promise<'accepted'|'dismissed'|'no-disponible'>

const EN_NAVEGADOR = typeof window !== 'undefined' && typeof navigator !== 'undefined';
const q = new URLSearchParams(EN_NAVEGADOR ? location.search : '');
const TEST = q.has('test');
const FORZAR_SW = q.has('sw');

const ua = (EN_NAVEGADOR && navigator.userAgent) || '';
// iPadOS 13+ se presenta como Mac: se distingue por la pantalla táctil.
const IOS = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && EN_NAVEGADOR && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(ua);

let promptInstalar = null;
let persistido = null;
let registro = null;
let recargando = false;
const oyentes = new Set();
// Cuanto antes: pasarAssetsCargados() lee esta lista y por defecto solo guarda 250 entradas.
if (EN_NAVEGADOR) { try { performance.setResourceTimingBufferSize(2000); } catch { /* nada */ } }

function standalone() {
  if (!EN_NAVEGADOR) return false;
  try {
    return navigator.standalone === true
      || matchMedia('(display-mode: standalone)').matches
      || matchMedia('(display-mode: fullscreen)').matches
      || matchMedia('(display-mode: minimal-ui)').matches;
  } catch { return false; }
}

/** Estado para la interfaz (ajustes, aviso de instalar). */
export function estado() {
  return {
    standalone: standalone(),
    ios: IOS,
    android: ANDROID,
    persistido,
    puedeInstalar: !!promptInstalar && !standalone(),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
  };
}

/** Se llama cuando cambia algo de estado() (prompt disponible, instalada, persistido). Devuelve la baja. */
export function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function avisar() { for (const fn of oyentes) { try { fn(estado()); } catch { /* nada */ } } }

/** Lanza el diálogo de instalación de Chrome (Android/escritorio). En iOS no existe: hay que usar Compartir. */
export async function instalar() {
  const p = promptInstalar;
  if (!p) return 'no-disponible';
  promptInstalar = null;
  try {
    await p.prompt();
    const r = await p.userChoice;
    avisar();
    return (r && r.outcome) || 'dismissed';
  } catch { avisar(); return 'no-disponible'; }
}

// ------------------------------------------------------------------ instalación
if (EN_NAVEGADOR) addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  avisar();
});
if (EN_NAVEGADOR) addEventListener('appinstalled', () => { promptInstalar = null; avisar(); });

// ------------------------------------------------------------------ almacenamiento persistente
// Sin persistencia el navegador puede borrar la partida si falta espacio (Safari, a los 7 días sin uso).
// Se reintenta en cada arranque: Chrome lo concede con el uso o al instalar.
async function persistir() {
  const st = navigator.storage;
  if (!st || !st.persisted) { persistido = null; return; }
  try {
    persistido = await st.persisted();
    if (!persistido && st.persist) persistido = await st.persist();
  } catch { persistido = false; }
  avisar();
}

// ------------------------------------------------------------------ service worker
function modalesVacios() {
  const m = document.getElementById('modales');
  return !m || m.children.length === 0;
}

/** Activa el SW en espera y recarga cuando tome el control (solo si no hay ningún modal abierto). */
function aplicarVersion(sw) {
  if (!sw) return;
  if (!modalesVacios()) { mostrarAviso(sw, 'Cierra la ventana abierta y vuelve a tocar «Reabrir».'); return; }
  // Ya activo (p. ej. otra pestaña lo activó): no habrá otro controllerchange, basta con recargar.
  if (sw.state === 'activated' || sw.state === 'redundant') { location.reload(); return; }
  recargando = true;
  sw.postMessage({ tipo: 'saltar' });
}

let avisoMostrado = null;
function mostrarAviso(sw, extra = '') {
  let d = document.getElementById('aviso-version');
  if (!d) {
    d = document.createElement('div');
    d.id = 'aviso-version';
    d.className = 'aviso-version';
    d.setAttribute('role', 'status');
    // Estilo propio (no depende de app.css): discreto, abajo, encima de las pestañas, al alcance del pulgar.
    Object.assign(d.style, {
      position: 'fixed', zIndex: 40, display: 'flex', alignItems: 'center', gap: '8px',
      left: 'calc(8px + var(--sa-l, 0px))', right: 'calc(8px + var(--sa-r, 0px))',
      bottom: 'calc(var(--alto-tabs, 56px) + var(--sa-b, 0px) + 8px)',
      padding: '6px 6px 6px 12px', borderRadius: '8px', border: '2px solid #000',
      background: '#14213d', color: '#fff3c4', font: '14px/1.3 system-ui, sans-serif', boxShadow: '0 4px 16px #0006',
    });
    document.body.append(d);
  }
  avisoMostrado = sw;
  d.replaceChildren();
  const t = document.createElement('span');
  t.textContent = 'Hay una versión nueva' + (extra ? '. ' + extra : '');
  t.style.flex = '1';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn prim';
  b.textContent = 'Reabrir';
  b.style.minHeight = '44px';
  b.addEventListener('click', () => aplicarVersion(avisoMostrado));
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'btn fino';
  x.setAttribute('aria-label', 'Ahora no');
  x.textContent = '×';
  Object.assign(x.style, { minWidth: '44px', minHeight: '44px', color: 'inherit' });
  x.addEventListener('click', () => d.remove());
  d.append(t, b, x);
}

// Si al abrir la página ya la controlaba un SW. Se mira ANTES de register(): en la primera instalación,
// clients.claim() pone navigator.serviceWorker.controller antes de que llegue (en WebKit) el statechange
// 'installed', y mirar controller en ese momento daba un falso «Hay una versión nueva».
let habiaControl = false;

function vigilarEspera(reg) {
  if (!habiaControl) return; // primera instalación: silenciosa
  if (reg.waiting) mostrarAviso(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const nuevo = reg.installing;
    if (!nuevo) return;
    nuevo.addEventListener('statechange', () => {
      if (nuevo.state === 'installed' && reg.waiting === nuevo) mostrarAviso(nuevo);
    });
  });
}

/** Sprites y retratos (assets/pmd) que la página cargó antes de que el SW la controlara: se le pasan para que
 *  los guarde, o sin conexión faltarían (p. ej. el retrato del guía elegido en el primer arranque). */
function pasarAssetsCargados() {
  const sw = navigator.serviceWorker.controller;
  if (!sw || !performance.getEntriesByType) return;
  const base = new URL('./', location.href).href;
  const urls = [...new Set(performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(base) && u.slice(base.length).startsWith('assets/pmd/')))];
  if (urls.length) sw.postMessage({ tipo: 'guardar-pmd', urls });
}

async function registrar() {
  if (!('serviceWorker' in navigator)) return;
  if (TEST && !FORZAR_SW) return;
  habiaControl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!recargando) { pasarAssetsCargados(); return; }
    recargando = false;
    location.reload();
  });
  try {
    registro = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    vigilarEspera(registro);
    // Sesiones cortas en el móvil: buscar versión nueva al volver a la app (como mucho cada 30 min).
    let ultima = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima > 30 * 60_000) {
        ultima = Date.now();
        registro.update().catch(() => {});
      }
    });
  } catch (e) { console.warn('[pwa] sin service worker:', e && e.message); }
}

// Tras el primer pintado, para no competir con el arranque del juego.
const arrancar = () => { registrar(); persistir(); };
if (EN_NAVEGADOR) {
  if (document.readyState === 'complete') setTimeout(arrancar, 0);
  else addEventListener('load', () => setTimeout(arrancar, 0), { once: true });
}

// Acceso para depurar y para las pruebas.
if (EN_NAVEGADOR) window.__pwa = { estado, instalar, alCambiar, get registro() { return registro; } };
