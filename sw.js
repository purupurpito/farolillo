// Service worker de Farolillo: armazón sin conexión y caché de sprites a demanda. Dueño: PWA.
// La lista PRECACHE, VERSION y REVISION las reescribe tools/generar-sw.mjs (no editar a mano esos bloques).
//   - Navegación: red primero (con tope de espera), si no hay red → index.html de la caché.
//   - js, css, json: stale-while-revalidate (sirve lo guardado y lo refresca en segundo plano).
//   - assets/pmd/**: cache-first en una caché aparte, a demanda (nunca en el precache), con tope de entradas.
//   - Solo GET y mismo origen. skipWaiting solo cuando la página lo pide con postMessage({ tipo: 'saltar' }).

// <generado:version>
const VERSION = '0.1.0';
const REVISION = '1e9f209339';
// </generado:version>

// <generado:precache>
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/manifest.json',
  'assets/creditos.json',
  'css/app.css',
  'js/audio.js',
  'js/config.js',
  'js/core/bus.js',
  'js/core/economy.js',
  'js/core/events.js',
  'js/core/evolve.js',
  'js/core/formulas.js',
  'js/core/game.js',
  'js/core/missions.js',
  'js/core/prever-async.js',
  'js/core/recruit.js',
  'js/core/rng.js',
  'js/core/sim.js',
  'js/core/state.js',
  'js/core/worker-prev.js',
  'js/data.js',
  'js/fmt.js',
  'js/gfx/fx.js',
  'js/gfx/scene-cala.js',
  'js/gfx/scene-combate.js',
  'js/gfx/scene-ficha.js',
  'js/gfx/sprites.js',
  'js/gfx/tiles.js',
  'js/main.js',
  'js/pwa.js',
  'js/ui/ajustes.js',
  'js/ui/bitacora.js',
  'js/ui/cala.js',
  'js/ui/componentes.js',
  'js/ui/creditos.js',
  'js/ui/dialogo.js',
  'js/ui/encurso.js',
  'js/ui/expediciones.js',
  'js/ui/ficha.js',
  'js/ui/formar.js',
  'js/ui/gremio.js',
  'js/ui/informe.js',
  'js/ui/inicio.js',
  'js/ui/instalar.js',
  'js/ui/llena.js',
  'js/ui/momento.js',
  'js/ui/router.js',
  'js/ui/selector.js',
  'data/especies.json',
  'data/islas.json',
  'data/textos.json',
  'data/tipos.json',
  'assets/ui/barca.svg',
  'assets/ui/baya.svg',
  'assets/ui/cala.svg',
  'assets/ui/corazon.svg',
  'assets/ui/estrella.svg',
  'assets/ui/evolucion.svg',
  'assets/ui/faro.svg',
  'assets/ui/gremio.svg',
  'assets/ui/intercambio.svg',
  'assets/ui/libro.svg',
  'assets/ui/menu.svg',
  'assets/ui/moneda.svg',
  'assets/ui/objeto.svg',
  'assets/ui/vario.svg',
  'assets/ui/icons/apple-touch-icon-180.png',
  'assets/ui/icons/icon-192.png',
  'assets/ui/icons/icon-512.png',
  'assets/ui/icons/icon-maskable-512.png',
];
// </generado:precache>

const PREFIJO = 'farolillo-';
const CACHE = `${PREFIJO}armazon-${VERSION}-${REVISION}`;
const CACHE_PMD = `${PREFIJO}pmd-v1`; // sobrevive a las versiones: los sprites no cambian de ruta
const TOPE_PMD = 1500;                // ~4200 archivos en total; una partida usa una fracción
const ESPERA_RED_MS = 3500;           // navegación: si la red tarda más, se abre la copia guardada
const IMPRESCINDIBLES = ['./', 'index.html', 'js/main.js'];

const BASE = new URL('./', self.location).href;
const enScope = (url) => url.href.startsWith(BASE);
const ruta = (url) => url.href.slice(BASE.length).split(/[?#]/)[0];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const fallos = [];
    await Promise.all(PRECACHE.map(async (p) => {
      try {
        const r = await fetch(new Request(p, { cache: 'reload' }));
        if (!r.ok) throw new Error(r.status);
        await c.put(p, r);
      } catch (err) { fallos.push(p); }
    }));
    // Sin lo imprescindible no hay modo sin conexión: mejor no instalar y reintentar en la próxima visita.
    const graves = fallos.filter((p) => IMPRESCINDIBLES.includes(p));
    if (graves.length) throw new Error('Precache incompleto: ' + graves.join(', '));
    if (fallos.length) console.warn('[sw] sin precache:', fallos.join(', '));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith(PREFIJO) && k !== CACHE && k !== CACHE_PMD) await caches.delete(k);
    }
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch { /* nada */ } }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.tipo === 'saltar') self.skipWaiting();
  else if (d.tipo === 'version' && e.source) e.source.postMessage({ tipo: 'version', version: VERSION, revision: REVISION });
  else if (d.tipo === 'guardar-pmd' && Array.isArray(d.urls)) e.waitUntil(guardarPmd(d.urls));
});

/** La página pasa los assets/pmd que cargó antes de estar controlada; se guardan los que falten (de la caché HTTP). */
async function guardarPmd(urls) {
  const c = await caches.open(CACHE_PMD);
  const cola = [];
  for (const u of urls.slice(0, 600)) {
    try {
      const url = new URL(u, BASE);
      if (url.origin === self.location.origin && ruta(url).startsWith('assets/pmd/')) cola.push(url.href);
    } catch { /* URL rara: se ignora */ }
  }
  const uno = async (href) => {
    try {
      if (await c.match(href, { ignoreSearch: true })) return;
      const res = await fetch(href);
      if (guardable(res)) await c.put(href, res);
    } catch { /* sin red: otra vez será */ }
  };
  // Unas pocas a la vez para no competir con lo que pide la página.
  await Promise.all(Array.from({ length: 4 }, async () => { while (cola.length) await uno(cola.shift()); }));
  if (!recortando) recortando = recortar(c).finally(() => { recortando = null; });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !enScope(url)) return;
  if (req.headers.has('range')) return; // sin respuestas parciales en caché
  const r = ruta(url);
  if (r === 'sw.js') return;

  if (req.mode === 'navigate') { e.respondWith(navegar(e, r)); return; }
  if (r.startsWith('assets/pmd/')) { e.respondWith(primeroCache(req)); return; }
  e.respondWith(rancioYRevalidar(e, req));
});

const guardable = (res) => res && res.ok && res.type === 'basic' && res.status === 200;

/** Navegación: red primero con tope; la portada fresca se guarda como index.html. Sin red → index.html. */
async function navegar(e, r) {
  const c = await caches.open(CACHE);
  const red = (async () => {
    const pre = e.preloadResponse ? await e.preloadResponse.catch(() => null) : null;
    const res = pre || await fetch(e.request);
    if (guardable(res) && (r === '' || r === 'index.html')) {
      const copia = res.clone();
      e.waitUntil(Promise.all([c.put('index.html', copia.clone()), c.put('./', copia)]).catch(() => {}));
    }
    return res;
  })();
  const plazo = new Promise((ok) => setTimeout(() => ok(null), ESPERA_RED_MS));
  let res = null;
  try { res = await Promise.race([red, plazo]); } catch { res = null; }
  if (res && (res.ok || !(await c.match('index.html')))) return res;
  const guardado = await c.match('index.html') || await c.match('./');
  if (guardado) { e.waitUntil(red.catch(() => {})); return guardado; }
  // Ni red ni copia (primer arranque sin conexión): esperar a la red aunque tarde.
  return red.catch(() => new Response('<!doctype html><meta charset="utf-8"><title>Farolillo</title><p style="font:16px sans-serif;padding:24px">Sin conexión. Abre Farolillo una vez con conexión para poder jugar sin ella.</p>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }));
}

/** js, css, json y demás armazón: responde con lo guardado y lo refresca para la próxima vez. */
async function rancioYRevalidar(e, req) {
  const c = await caches.open(CACHE);
  const guardado = await c.match(req) || await c.match(req, { ignoreSearch: true });
  const red = fetch(req, { cache: 'no-cache' }).then(async (res) => {
    if (guardable(res)) await c.put(req, res.clone());
    return res;
  });
  if (guardado) { e.waitUntil(red.catch(() => {})); return guardado; }
  return red.catch(sinRed);
}

/** Sprites y retratos: caché primero, a demanda, con tope de entradas (se recortan las más antiguas). */
let recortando = null;
async function primeroCache(req) {
  const c = await caches.open(CACHE_PMD);
  const guardado = await c.match(req, { ignoreSearch: true });
  if (guardado) return guardado;
  let res;
  // Sin red y sin copia: respuesta 504 en vez de rechazar respondWith (que en WebKit da «Load failed» en consola);
  // la imagen falla igual y la interfaz pone su respaldo.
  try { res = await fetch(req); } catch { return sinRed(); }
  if (guardable(res)) {
    await c.put(req, res.clone()).catch(() => {});
    if (!recortando) recortando = recortar(c).finally(() => { recortando = null; });
  }
  return res;
}

const sinRed = () => new Response('', { status: 504, statusText: 'Sin conexion', headers: { 'content-type': 'text/plain' } });

async function recortar(c) {
  const claves = await c.keys();
  const sobran = claves.length - TOPE_PMD;
  for (let i = 0; i < sobran; i++) await c.delete(claves[i]);
}
