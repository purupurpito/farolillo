// Rendimiento en móvil (lote «rendimiento»). Dueño: GRÁFICOS.
// Con Playwright + CDP en el perfil Pixel 7 y la CPU ×4 (como un Android de gama media):
//   1. Cala quieta 10 s con 40 vecinos: % del hilo principal (TaskDuration de CDP) < 15 %,
//      callbacks de rAF por segundo (≈15 como mucho) y bytes de búfer de todos los canvas (< 0,5 MB).
//   2. En curso 5 s: callbacks de rAF por segundo.
//   3. Cala con caché vacía: peticiones de PNG de sprites (≤ ~80).
//   4. Formar equipo y «Sugerir»: tareas largas (> 50 ms) del hilo principal.
//   5. preverAsync / sugerirAsync (worker) dan lo mismo que game.prever / game.sugerir.
// Las cifras se guardan en test/ui/out/rendimiento.json.
//
// Uso:  npx -y serve -l 8080 .   y   node test/ui/rendimiento.mjs [--url http://localhost:8080/] [--cpu 4] [--sin-limites]

import { existsSync } from 'node:fs';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, 'out');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = arg('--url', process.env.URL || 'http://localhost:8080/');
const CPU = Number(arg('--cpu', '4'));
const SIN_LIMITES = args.includes('--sin-limites');
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
  throw new Error('No encuentro Playwright (npx playwright install chromium).');
}

// Cuenta callbacks de rAF y tareas largas desde el arranque de la página.
function instrumentar() {
  const orig = window.requestAnimationFrame.bind(window);
  window.__raf = 0;
  window.requestAnimationFrame = (f) => orig((t) => { window.__raf++; f(t); });
  window.__largas = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__largas.push({ t: e.startTime, d: e.duration }); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* sin longtask */ }
}

async function primerArranque(page) {
  const boton = (t) => page.getByRole('button', { name: t, exact: true }).first();
  await page.goto(`${URL_BASE}?test=1&nuevo=1&reloj=2026-11-18T10:00:00`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await boton('Empezar').click();
  await page.locator('.guia[data-sp="0007"]').first().click();
  await boton('Seguir').click();
  await page.locator('.faro-btn[data-faro="sur"]').first().click();
  await boton('Encender el faro').click();
  await page.waitForFunction(() => window.__farolillo.app.save && window.__farolillo.app.save.equipos[0].exp);
  await page.evaluate(() => window.__farolillo.avanzar(70_000));
  await page.getByRole('button', { name: /Recoger todo/ }).first().click();
  await boton('Seguir').click();
  for (let i = 0; i < 40 && await page.locator('[data-modal="momento"]').count(); i++) {
    await page.locator('[data-modal="momento"] .btn.prim').first().click();
    await espera(120);
  }
  // Hasta 40 vecinos (máximo de la cala) con especies distintas del manifest.
  await page.evaluate(async () => {
    const f = window.__farolillo;
    const st = await import('./js/core/state.js');
    const s = f.app.save;
    const sp = f.app.sprites.especies().filter((e) => f.app.datos.especies[e]);
    for (let i = 0; s.pokemon.length < 41 && i < sp.length; i++) {
      if (s.pokemon.some((m) => m.sp === sp[i * 3 % sp.length])) continue;
      s.pokemon.push(st.crearMon({ sp: sp[i * 3 % sp.length], nv: 5 + (i % 20), car: i, ahora: f.ahora(), id: 'm_perf' + i }));
    }
    f.app.guardar(true);
    f.app.refrescar();
  });
}

async function hiloPrincipal(cdp, page, ms) {
  const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const r0 = await page.evaluate(() => window.__raf);
  const a = await met();
  const t0 = Date.now();
  await espera(ms);
  const b = await met();
  const dt = (Date.now() - t0) / 1000;
  const r1 = await page.evaluate(() => window.__raf);
  return {
    hiloPct: Math.round((b.TaskDuration - a.TaskDuration) / dt * 1000) / 10,
    scriptPct: Math.round((b.ScriptDuration - a.ScriptDuration) / dt * 1000) / 10,
    rafPorSeg: Math.round((r1 - r0) / dt * 10) / 10,
  };
}

/** rAF por segundo sin límite de CPU (tras un toque, para que el bucle no esté en reposo a 8 fps). */
async function ritmoReal(page, ms, tocar = true) {
  if (tocar) await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')));
  await espera(300);
  const r0 = await page.evaluate(() => window.__raf);
  const t0 = Date.now();
  await espera(ms);
  return Math.round((await page.evaluate(() => window.__raf) - r0) / ((Date.now() - t0) / 1000) * 10) / 10;
}

const bytesCanvas = (page) => page.evaluate(() => [...document.querySelectorAll('canvas')]
  .reduce((s, c) => s + c.width * c.height * 4, 0));

const pw = await cargarPlaywright();
await mkdir(OUT, { recursive: true });
const browser = await pw.chromium.launch();
const disp = pw.devices['Pixel 7'];
const res = { dispositivo: 'Pixel 7', cpu: CPU, fecha: new Date().toISOString() };
const fallos = [];
const errores = [];

const ctx = await browser.newContext({ ...disp, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.addInitScript(instrumentar);
const page = await ctx.newPage();
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
await primerArranque(page);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');

// 1. Cala quieta
await page.locator('#tabs .tab[data-tab="cala"]').click();
await espera(2500);
res.vecinos = await page.evaluate(() => window.__farolillo.app.save.pokemon.length);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
res.cala = await hiloPrincipal(cdp, page, 10_000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
// OJO: con la CPU limitada por CDP, setTimeout se retrasa 2-5× aunque el hilo esté libre (artefacto de la
// emulación: en una página vacía setTimeout(55) tarda 120-300 ms con ×4). Así que el bucle de 15 Hz da menos frames
// con ×4 de los que daría en un móvil real. Se mide el ritmo real sin límite y se extrapola el % del hilo a ese ritmo.
res.cala.rafReal = await ritmoReal(page, 3000);
res.cala.hiloPct15 = Math.round(res.cala.hiloPct * Math.max(1, res.cala.rafReal / Math.max(0.1, res.cala.rafPorSeg)) * 10) / 10;
await page.evaluate(() => { window.__farolillo.app.save.ajustes.reducirAnim = true; window.__farolillo.app.aplicarTema(); });
res.cala.rafReducir = await ritmoReal(page, 3000, false);
await page.evaluate(() => { window.__farolillo.app.save.ajustes.reducirAnim = false; window.__farolillo.app.aplicarTema(); });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
res.cala.bufferBytes = await bytesCanvas(page);
res.cala.canvas = await page.evaluate(() => { const c = document.querySelector('.lienzo-cala'); const r = c.getBoundingClientRect(); return `${c.width}x${c.height} (css ${Math.round(r.width)}x${Math.round(r.height)}, dpr ${devicePixelRatio})`; });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

// 2. En curso
await page.evaluate(() => { const f = window.__farolillo; f.app.game.enviarTodos(f.app.save, f.app.ctx()); f.app.guardar(true); f.app.refrescar(); });
await page.evaluate(() => { const s = window.__farolillo.app.save; const i = s.equipos.findIndex((e) => e.exp); window.__farolillo.app.router.abrir('encurso', { idx: i }); });
await espera(1500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
res.encurso = await hiloPrincipal(cdp, page, 5000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
res.encurso.rafReal = await ritmoReal(page, 3000);
res.encurso.bufferBytes = await bytesCanvas(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.evaluate(() => window.__farolillo.app.router.cerrar());

// 4. Formar y Sugerir (con un equipo libre)
await page.evaluate(() => {
  const f = window.__farolillo; const s = f.app.save;
  for (const e of s.equipos) if (e.exp) { e.exp = null; }
  f.app.guardar(true); f.app.refrescar();
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await page.evaluate(() => { window.__largas.length = 0; window.__farolillo.app.router.abrir('formar', { idx: 0 }); });
await espera(3000);
res.formarAbrir = await page.evaluate(() => ({ largas: window.__largas.map((x) => Math.round(x.d)) }));
await page.evaluate(() => { window.__largas.length = 0; });
await page.getByRole('button', { name: 'Sugerir', exact: true }).first().click();
await espera(3000);
res.sugerir = await page.evaluate(() => ({ largas: window.__largas.map((x) => Math.round(x.d)) }));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
res.sugerir.max = Math.max(0, ...res.sugerir.largas);
res.formarAbrir.max = Math.max(0, ...res.formarAbrir.largas);

// 5. Igualdad worker ↔ síncrono
res.igualdad = await page.evaluate(async () => {
  let mod;
  try { mod = await import('./js/core/prever-async.js'); } catch { return { omitida: 'no hay js/core/prever-async.js' }; }
  const f = window.__farolillo; const s = f.app.save; const g = f.app.game;
  const ctx = f.app.ctx();
  const libres = g.libres(s);
  const islas = g.listaIslas(s, ctx).filter((i) => i.desbloqueada).map((i) => i.id);
  const mal = [];
  let n = 0;
  for (const isla of islas) {
    for (const op of [{ modo: 'vuelta' }, { modo: 'patrulla', horas: 4, postura: 'audaz' }]) {
      const a = JSON.stringify(g.sugerir(s, isla, op, ctx));
      const b = JSON.stringify(await mod.sugerirAsync(s, isla, op, ctx));
      n++; if (a !== b) mal.push(`sugerir ${isla} ${op.modo}`);
      const plan = { isla, equipo: libres.slice(n % 3, n % 3 + 3), roles: ['lider', 'reco', 'apoyo'], modo: op.modo, horas: op.horas || 1, postura: op.postura || 'equilibrada', hasta: null, dominio: 0 };
      const pa = JSON.stringify(g.prever(s, 0, plan, ctx, 200));
      const pb = JSON.stringify(await mod.preverAsync(s, 0, plan, ctx, 200));
      n++; if (pa !== pb) mal.push(`prever ${isla} ${op.modo}`);
    }
  }
  return { comparaciones: n, mal, worker: mod.estadoWorker ? mod.estadoWorker() : null };
});

// 3. Peticiones de PNG con la caché vacía (contexto nuevo con la misma partida)
const estadoGuardado = await ctx.storageState();
await ctx.close();
const ctx2 = await browser.newContext({ ...disp, locale: 'es-ES', timezoneId: 'Europe/Madrid', storageState: estadoGuardado });
const p2 = await ctx2.newPage();
let pngs = 0;
const pngLista = [];
p2.on('request', (r) => { if (/\/assets\/pmd\/.*\.png/.test(r.url())) { pngs++; pngLista.push(r.url().replace(/.*\/assets\/pmd\//, '')); } });
await p2.goto(`${URL_BASE}?test=1&reloj=2026-11-18T10:00:00`);
await p2.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
await espera(4000);
res.pngCala = pngs;
res.pngPorAnim = pngLista.reduce((o, u) => { const k = u.replace(/^\d+\/(v\/)?/, ''); o[k] = (o[k] || 0) + 1; return o; }, {});
await ctx2.close();
await browser.close();

console.log(JSON.stringify(res, null, 1));
await writeFile(join(OUT, 'rendimiento.json'), JSON.stringify(res, null, 1));

if (!SIN_LIMITES) {
  if (res.cala.hiloPct15 >= 15) fallos.push(`cala quieta: hilo principal ${res.cala.hiloPct15} % a 15 fps (≥ 15 %)`);
  if (res.cala.bufferBytes >= 0.5 * 1024 * 1024) fallos.push(`cala: búfer de canvas ${res.cala.bufferBytes} B (≥ 0,5 MB)`);
  if (res.cala.rafReal > 17) fallos.push(`cala: ${res.cala.rafReal} rAF/s (> 15)`);
  if (res.cala.rafReducir > 9.5) fallos.push(`cala con reducir animaciones: ${res.cala.rafReducir} rAF/s (> 8)`);
  if (res.encurso.rafReal > 17) fallos.push(`en curso: ${res.encurso.rafReal} rAF/s (> 15)`);
  if (res.pngCala > 90) fallos.push(`cala con caché vacía: ${res.pngCala} PNG (> ~80)`);
  if (res.sugerir.max > 50) fallos.push(`Sugerir: tarea larga de ${res.sugerir.max} ms`);
  if (res.igualdad.mal && res.igualdad.mal.length) fallos.push(`worker ≠ síncrono: ${res.igualdad.mal.join(', ')}`);
  if (res.igualdad.omitida) fallos.push('igualdad: ' + res.igualdad.omitida);
}
for (const e of [...new Set(errores)]) console.log('  ERROR consola:', e);
for (const f of fallos) console.log('  FALLO:', f);
const mal = fallos.length + new Set(errores).size;
console.log(mal ? `\n${mal} problemas.` : '\nOK: rendimiento dentro de los límites.');
process.exit(mal ? 1 : 0);
