// PWA en móvil: instalable y sin conexión. Dueño: PWA.
//   Pixel 7 (Chromium) e iPhone 15 (WebKit), sin ?test y con ?reloj=:
//   1. Primer arranque real (tutorial) → partida guardada y cala.
//   2. serviceWorker.ready → getRegistrations() > 0; recargar → la página queda controlada.
//   1b. Primera visita: tras ~9 s no aparece «Hay una versión nueva» (en WebKit salía en falso y tapaba Empezar).
//   3. setOffline(true) + reload → abre y enseña la cala (.lienzo-cala) sin errores; Expediciones, Gremio y
//      Bitácora sin imágenes rotas (retratos del equipo guardados aunque solo se viera la cala con conexión).
//   4. manifest.webmanifest válido, iconos 192/512/maskable y apple-touch-icon con 200 y su tamaño.
//      En Chromium, además, Page.getInstallabilityErrors vacío (instalable).
//   5. Con ?test=1 no se registra ningún SW.
//   6. La lista PRECACHE de sw.js contiene todos los js/** del disco; index.html tiene los modulepreload al día.
//   7. import('js/ui/instalar.js') funciona solo y sus funciones devuelven Node/null sin partida.
// Uso:  npx -y serve -l 8080 .   y   node test/ui/pwa.mjs [--url http://localhost:8080/] [--solo chromium|webkit]

import { existsSync } from 'node:fs';
import { readdir, mkdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const OUT = join(AQUI, 'out');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = arg('--url', process.env.URL || 'http://localhost:8080/');
const SOLO = arg('--solo', null);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function cargarPlaywright() {
  try { return await import('playwright'); } catch { /* sigue */ }
  const dirs = [];
  if (process.env.PLAYWRIGHT_DIR) dirs.push(process.env.PLAYWRIGHT_DIR);
  for (const base of [join(process.env.LOCALAPPDATA || join(homedir(), '.npm'), 'npm-cache', '_npx'), join(homedir(), '.npm', '_npx')]) {
    if (!existsSync(base)) continue;
    for (const d of await readdir(base)) dirs.push(join(base, d, 'node_modules', 'playwright'));
  }
  for (const d of dirs) if (existsSync(join(d, 'index.mjs'))) return import(pathToFileURL(join(d, 'index.mjs')).href);
  throw new Error('No encuentro Playwright (npx playwright install chromium webkit).');
}

async function listarJs(dir = 'js') {
  const out = [];
  for (const n of await readdir(join(RAIZ, dir))) {
    const rel = posix.join(dir, n);
    if ((await stat(join(RAIZ, rel))).isDirectory()) out.push(...await listarJs(rel));
    else if (n.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** Ancho y alto de un PNG (cabecera IHDR) y si tiene canal alfa. */
function infoPng(buf) {
  if (buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), alfa: buf[25] === 4 || buf[25] === 6 };
}

async function comprobarArchivos(fallos, info) {
  // PRECACHE ⊇ js/**
  const sw = await readFile(join(RAIZ, 'sw.js'), 'utf8');
  const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  const lista = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  const js = await listarJs();
  const faltan = js.filter((f) => !lista.includes(f));
  info.precache = lista.length;
  if (faltan.length) fallos.push(`PRECACHE de sw.js sin: ${faltan.join(', ')} (node tools/generar-sw.mjs)`);
  const sobran = lista.filter((f) => f !== './' && !existsSync(join(RAIZ, f)));
  if (sobran.length) fallos.push(`PRECACHE de sw.js con archivos que no existen: ${sobran.join(', ')}`);
  for (const p of ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'assets/manifest.json']) if (!lista.includes(p)) fallos.push(`PRECACHE sin ${p}`);
  if (lista.some((p) => p.startsWith('assets/pmd/'))) fallos.push('assets/pmd no debe ir en el precache');
  const cfg = (await readFile(join(RAIZ, 'js/config.js'), 'utf8')).match(/VERSION\s*=\s*'([^']+)'/);
  if (cfg && !sw.includes(`const VERSION = '${cfg[1]}'`)) fallos.push(`VERSION de sw.js distinta de js/config.js (${cfg[1]})`);
  // modulepreload: los imports directos de main.js deben estar
  const main = await readFile(join(RAIZ, 'js/main.js'), 'utf8');
  const index = await readFile(join(RAIZ, 'index.html'), 'utf8');
  const directos = [...main.matchAll(/^import\s+[^'"]*?from\s+['"]\.\/([^'"]+)['"]/gm)].map((x) => 'js/' + x[1]);
  const sinPre = directos.filter((d) => !index.includes(`<link rel="modulepreload" href="${d}">`));
  if (sinPre.length) fallos.push(`index.html sin modulepreload de: ${sinPre.join(', ')} (node tools/generar-sw.mjs)`);
  if (/maximum-scale|user-scalable\s*=\s*no/.test(index)) fallos.push('el viewport no debe bloquear el zoom');
  if (!/<script type="module" src="js\/pwa.js"><\/script>/.test(index)) fallos.push('index.html no carga js/pwa.js');
}

async function comprobarManifest(page, fallos, info, etiqueta) {
  const r = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content ?? null;
    const res = await fetch(link.href);
    const texto = await res.text();
    let man = null; try { man = JSON.parse(texto); } catch { /* inválido */ }
    const iconos = [];
    for (const i of (man && man.icons) || []) {
      const u = new URL(i.src, link.href).href;
      const rr = await fetch(u);
      iconos.push({ src: i.src, sizes: i.sizes, purpose: i.purpose, status: rr.status, tipo: rr.headers.get('content-type'), bytes: [...new Uint8Array((await rr.arrayBuffer()).slice(0, 32))] });
    }
    const ra = await fetch(apple.href);
    return {
      status: res.status, man, iconos,
      apple: { status: ra.status, bytes: [...new Uint8Array((await ra.arrayBuffer()).slice(0, 32))] },
      metas: { cap: meta('apple-mobile-web-app-capable'), mcap: meta('mobile-web-app-capable'), barra: meta('apple-mobile-web-app-status-bar-style'), titulo: meta('apple-mobile-web-app-title'), theme: meta('theme-color') },
    };
  });
  if (r.status !== 200) fallos.push(`[${etiqueta}] manifest HTTP ${r.status}`);
  const m = r.man;
  if (!m) { fallos.push(`[${etiqueta}] manifest no es JSON válido`); return; }
  const esperado = { name: 'Farolillo', short_name: 'Farolillo', start_url: './', scope: './', id: './', display: 'standalone', orientation: 'any', background_color: '#14213d', theme_color: '#14213d', lang: 'es' };
  for (const [k, v] of Object.entries(esperado)) if (m[k] !== v) fallos.push(`[${etiqueta}] manifest.${k} = ${m[k]} (esperado ${v})`);
  const tam = new Set();
  for (const i of r.iconos) {
    const png = infoPng(Buffer.from(i.bytes));
    if (i.status !== 200) fallos.push(`[${etiqueta}] icono ${i.src} HTTP ${i.status}`);
    else if (!png || `${png.w}x${png.h}` !== i.sizes) fallos.push(`[${etiqueta}] icono ${i.src} no mide ${i.sizes}`);
    else tam.add(`${i.sizes}/${i.purpose}`);
  }
  for (const t of ['192x192/any', '512x512/any', '512x512/maskable']) if (!tam.has(t)) fallos.push(`[${etiqueta}] falta icono ${t}`);
  const apple = infoPng(Buffer.from(r.apple.bytes));
  if (r.apple.status !== 200) fallos.push(`[${etiqueta}] apple-touch-icon HTTP ${r.apple.status}`);
  else if (!apple || apple.w !== 180 || apple.h !== 180) fallos.push(`[${etiqueta}] apple-touch-icon no mide 180x180`);
  else if (apple.alfa) fallos.push(`[${etiqueta}] apple-touch-icon con canal alfa (iOS pinta negro lo transparente)`);
  if (r.metas.cap !== 'yes' || r.metas.mcap !== 'yes') fallos.push(`[${etiqueta}] faltan metas *-web-app-capable`);
  if (r.metas.barra !== 'black-translucent' || r.metas.titulo !== 'Farolillo') fallos.push(`[${etiqueta}] metas de iOS incorrectas`);
  if (!r.metas.theme) fallos.push(`[${etiqueta}] falta meta theme-color`);
  info.manifest = `${r.iconos.length} iconos, apple ${apple ? apple.w + 'x' + apple.h : '?'}`;
}

async function primerArranque(page) {
  const boton = (t) => page.getByRole('button', { name: t, exact: true }).first();
  await boton('Empezar').click({ timeout: 20_000 });
  await page.locator('.guia[data-sp="0007"]').first().click();
  await boton('Seguir').click();
  await page.locator('.faro-btn[data-faro="sur"]').first().click();
  await boton('Encender el faro').click();
  await page.locator('.cala .lienzo-cala, .lienzo-cala').first().waitFor({ timeout: 20_000 });
  await espera(800);
}

async function probar(pw, nombre, dispositivo, fallos, resumen) {
  const etiqueta = `${nombre}`;
  const info = { dispositivo: nombre };
  const tipo = nombre === 'chromium' ? pw.chromium : pw.webkit;
  const browser = await tipo.launch();
  const ctx = await browser.newContext({ ...pw.devices[dispositivo], locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'allow' });
  const errores = [];
  const vigilar = (page, fase) => {
    page.on('console', (m) => { if (m.type() === 'error') errores.push(`[${fase}] ${m.text()}`); });
    page.on('pageerror', (e) => errores.push(`[${fase}] pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errores.push(`[${fase}] HTTP ${r.status()}: ${r.url()}`); });
  };
  const url = `${URL_BASE}?reloj=2026-11-18T10:00:00`;
  try {
    let page = await ctx.newPage();
    vigilar(page, 'online');
    await page.goto(url);
    // Primera instalación del SW: silenciosa (sin aviso de versión nueva) aunque clients.claim llegue antes.
    await espera(9000);
    const avisoFalso = await page.locator('#aviso-version').count();
    info.avisoPrimeraVisita = avisoFalso > 0;
    if (avisoFalso) {
      fallos.push(`[${etiqueta}] primera visita: sale «Hay una versión nueva» sin haber versión anterior`);
      await page.locator('#aviso-version button[aria-label="Ahora no"]').click();
    }
    await primerArranque(page);

    // SW registrado y activo
    const reg = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { soportado: false };
      const r = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((ok) => setTimeout(() => ok(false), 20_000))]);
      const regs = await navigator.serviceWorker.getRegistrations();
      return { soportado: true, listo: r, n: regs.length, scope: regs[0] && regs[0].scope };
    });
    info.sw = reg;
    if (!reg.soportado) { fallos.push(`[${etiqueta}] el navegador emulado no tiene serviceWorker`); return; }
    if (!reg.listo || !(reg.n > 0)) { fallos.push(`[${etiqueta}] no se registró el service worker`); return; }

    // Recargar para que controle y se llenen las cachés (sprites de la cala a demanda)
    await page.reload();
    await page.locator('.lienzo-cala').first().waitFor({ timeout: 20_000 });
    await espera(1500);
    const control = await page.evaluate(async () => ({
      controlada: !!navigator.serviceWorker.controller,
      caches: await Promise.all((await caches.keys()).map(async (k) => [k, (await (await caches.open(k)).keys()).length])),
      guardada: Object.keys(localStorage).filter((k) => k.startsWith('farolillo')),
      pwa: window.__pwa ? window.__pwa.estado() : null,
    }));
    info.control = control;
    if (!control.controlada) fallos.push(`[${etiqueta}] tras recargar, la página no está controlada por el SW`);

    await comprobarManifest(page, fallos, info, etiqueta);

    if (nombre === 'chromium') {
      const cdp = await ctx.newCDPSession(page);
      const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ error: e.message }));
      info.instalable = inst.installabilityErrors ? (inst.installabilityErrors.length ? inst.installabilityErrors.map((e) => e.errorId) : 'sí') : inst;
      if (inst.installabilityErrors && inst.installabilityErrors.length) fallos.push(`[${etiqueta}] Chromium no la considera instalable: ${inst.installabilityErrors.map((e) => e.errorId).join(', ')}`);
      const man = await cdp.send('Page.getAppManifest').catch(() => null);
      if (man && man.errors && man.errors.length) fallos.push(`[${etiqueta}] errores del manifest: ${man.errors.map((e) => e.message).join('; ')}`);
    }

    // instalar.js por su cuenta
    const inst = await page.evaluate(async () => {
      const m = await import('./js/ui/instalar.js');
      const app = { ui: {}, save: null, guardarUI() {}, ahora: () => Date.now() };
      const a = m.avisoInstalar(app);
      const b = m.bloqueAjustes(app);
      return { aviso: a === null ? 'null' : a instanceof Node ? 'Node:' + a.textContent.slice(0, 80) : typeof a, ajustes: b instanceof Node ? b.textContent.replace(/\s+/g, ' ').slice(0, 160) : typeof b };
    });
    info.instalarJs = inst;
    if (!(inst.aviso === 'null' || inst.aviso.startsWith('Node'))) fallos.push(`[${etiqueta}] avisoInstalar no devuelve Node/null`);
    if (inst.ajustes === 'undefined' || inst.ajustes === 'object') fallos.push(`[${etiqueta}] bloqueAjustes no devuelve Node`);

    // Sin conexión
    await page.close();
    const n0 = errores.length;
    page = await ctx.newPage();
    vigilar(page, 'offline');
    await page.goto(url);
    await page.locator('.lienzo-cala').first().waitFor({ timeout: 20_000 });
    await ctx.setOffline(true);
    await page.reload();
    const t0 = Date.now();
    let abierta = false;
    try { await page.locator('.cala .lienzo-cala, .lienzo-cala, .inicio').first().waitFor({ timeout: 20_000 }); abierta = true; } catch { /* sin pantalla */ }
    info.offlineMs = Date.now() - t0;
    await espera(1500);
    const estadoOff = await page.evaluate(() => ({
      online: navigator.onLine,
      cala: !!document.querySelector('.cala .lienzo-cala') || !!document.querySelector('.lienzo-cala'),
      inicio: !!document.querySelector('.inicio'),
      texto: (document.getElementById('vista')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
    }));
    info.offline = estadoOff;
    await mkdir(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, `pwa-${nombre}-offline.png`) });
    if (!abierta) fallos.push(`[${etiqueta}] sin conexión no abre (ni cala ni inicio)`);
    else if (!estadoOff.cala || estadoOff.inicio) fallos.push(`[${etiqueta}] sin conexión no muestra la cala de la partida guardada`);
    // Las demás pestañas sin conexión: ninguna imagen rota (retrato del guía incluido).
    const rotas = {};
    for (const t of ['expediciones', 'gremio', 'bitacora', 'cala']) {
      try {
        await page.locator(`#tabs .tab[data-tab="${t}"]`).tap({ timeout: 5000 });
        await espera(900);
        const n = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => (i.getAttribute('src') || '').split('assets/').pop()));
        if (n.length) rotas[t] = n;
      } catch (e) { rotas[t] = ['sin pestaña: ' + e.message.split('\n')[0]]; }
    }
    info.offlineRotas = rotas;
    if (Object.keys(rotas).length) fallos.push(`[${etiqueta}] sin conexión hay imágenes rotas: ${JSON.stringify(rotas)}`);
    const offErr = errores.slice(n0).filter((e) => e.startsWith('[offline]'));
    if (offErr.length) fallos.push(`[${etiqueta}] errores sin conexión: ${offErr.slice(0, 5).join(' | ')}`);
    await ctx.setOffline(false);

    // ?test=1: sin SW (contexto limpio)
    const ctx2 = await browser.newContext({ ...pw.devices[dispositivo], locale: 'es-ES' });
    const p2 = await ctx2.newPage();
    await p2.goto(`${URL_BASE}?test=1&nuevo=1`);
    await p2.waitForFunction(() => window.__farolillo && window.__farolillo.listo, null, { timeout: 20_000 });
    await espera(1500);
    const regsTest = await p2.evaluate(async () => ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
    info.swConTest = regsTest;
    if (regsTest) fallos.push(`[${etiqueta}] con ?test=1 se registró un SW`);
    await ctx2.close();

    const onErr = errores.filter((e) => e.startsWith('[online]'));
    if (onErr.length) fallos.push(`[${etiqueta}] errores con conexión: ${onErr.slice(0, 5).join(' | ')}`);
  } catch (e) {
    fallos.push(`[${etiqueta}] excepción: ${e.message.split('\n')[0]}`);
  } finally {
    resumen.push(info);
    await browser.close();
  }
}

const pw = await cargarPlaywright();
const fallos = [];
const resumen = [];
await comprobarArchivos(fallos, resumen[resumen.push({ archivos: true }) - 1]);
const casos = [['chromium', 'Pixel 7'], ['webkit', 'iPhone 15']].filter(([n]) => !SOLO || SOLO === n);
for (const [n, d] of casos) await probar(pw, n, d, fallos, resumen);
console.log(JSON.stringify(resumen, null, 2));
if (fallos.length) { console.log('\nFALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
console.log('\nPWA OK: instalable y sin conexión en ' + casos.map(([n, d]) => `${d} (${n})`).join(' y ') + '.');
