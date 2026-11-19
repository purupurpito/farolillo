// Verificación final de la versión móvil: partida completa con TOQUES (tap) en perfiles reales de Playwright
// (iPhone SE, iPhone 15 con WebKit; Pixel 7 con Chromium; y sus horizontales). Guarda capturas en
// test/ui/out/movil/. Comprueba en cada pantalla: sin scroll horizontal, sin botones < 44 px, sin texto
// cortado fuera de la ventana, botón principal visible y alcanzable (no tapado por las pestañas), y ningún
// error de consola. Además: modo avión (sin ?test, SW + setOffline + recarga) en iPhone SE y Pixel 7.
//
// Uso:  node test/ui/final-movil.mjs [--url http://localhost:8080/] [--solo "iPhone SE"]

import { existsSync } from 'node:fs';
import { readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, 'out', 'movil');
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
  throw new Error('No encuentro Playwright.');
}
const pw = await cargarPlaywright();
const { devices } = pw;
const PERFILES = [
  { id: 'se', nombre: 'iPhone SE', motor: 'webkit', disp: devices['iPhone SE'] },
  { id: 'i15', nombre: 'iPhone 15', motor: 'webkit', disp: devices['iPhone 15'] },
  { id: 'px7', nombre: 'Pixel 7', motor: 'chromium', disp: devices['Pixel 7'] },
  { id: 'se-h', nombre: 'iPhone SE horizontal', motor: 'webkit', disp: devices['iPhone SE landscape'] },
  { id: 'i15-h', nombre: 'iPhone 15 horizontal', motor: 'webkit', disp: devices['iPhone 15 landscape'] },
  { id: 'px7-h', nombre: 'Pixel 7 horizontal', motor: 'chromium', disp: devices['Pixel 7 landscape'] },
].filter((p) => !SOLO || p.nombre === SOLO);

async function revisar(page, donde) {
  return page.evaluate((donde) => {
    const f = [];
    if (document.documentElement.scrollWidth > innerWidth + 0.5) f.push(`${donde}: scroll horizontal ${document.documentElement.scrollWidth - innerWidth}px`);
    const arriba = [...document.querySelectorAll('#modales > .modal-fondo')].pop() || [...document.querySelectorAll('#capas > .capa')].pop() || document.getElementById('app') || document.body;
    const vis = (el) => { const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const chicos = [];
    for (const el of arriba.querySelectorAll('button, select, a.btn, [role="button"]')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) chicos.push(`«${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}» ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (chicos.length) f.push(`${donde}: botones <44px: ${[...new Set(chicos)].slice(0, 5).join('; ')}`);
    // Texto cortado: elementos de texto hoja que se salen por la derecha/izquierda de la ventana
    const fuera = [];
    for (const el of arriba.querySelectorAll('h1,h2,h3,p,span,button,label,.btn,li,td,div')) {
      if (!vis(el) || el.children.length) continue;
      if (!el.textContent.trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1) {
        // ignora contenedores con scroll horizontal intencionado
        let p = el.parentElement, scroll = false;
        while (p && p !== document.body) { const st = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(st.overflowX) && p.scrollWidth > p.clientWidth) { scroll = true; break; } p = p.parentElement; }
        if (!scroll) fuera.push(`«${el.textContent.trim().slice(0, 20)}»`);
      }
    }
    if (fuera.length) f.push(`${donde}: texto fuera de la ventana: ${fuera.slice(0, 5).join(', ')}`);
    // Texto truncado sin ellipsis (overflow oculto que recorta)
    const corte = [];
    for (const el of arriba.querySelectorAll('button, .btn, h2, h3')) {
      if (!vis(el)) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).textOverflow !== 'ellipsis') corte.push(`«${el.textContent.trim().slice(0, 20)}» ${el.scrollWidth}>${el.clientWidth}`);
    }
    if (corte.length) f.push(`${donde}: texto recortado: ${corte.slice(0, 4).join(', ')}`);
    // Botones primarios: dentro de la ventana o alcanzables con scroll, y no tapados
    const tapados = [];
    for (const el of arriba.querySelectorAll('.btn.prim, .btn.ok')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight) continue;
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      if (top && !el.contains(top) && !top.closest('#toast') && !top.closest('.toast')) tapados.push(`«${el.textContent.trim().slice(0, 20)}» bajo ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 30)}`);
    }
    if (tapados.length) f.push(`${donde}: botón tapado: ${tapados.slice(0, 3).join('; ')}`);
    return f;
  }, donde);
}

async function cerrarMomentos(page) {
  for (let i = 0; i < 40 && await page.locator('[data-modal="momento"]').count(); i++) {
    await espera(650);
    const b = page.locator('[data-modal="momento"] .btn.prim').first();
    if (await b.count()) await b.tap().catch(() => {}); else await page.mouse.click(10, 10);
    await espera(200);
  }
}

async function partida(browser, p) {
  const ctx = await browser.newContext({ ...p.disp, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await ctx.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => o((t) => { window.__raf++; cb(t); }); });
  const page = await ctx.newPage();
  const errores = [], fallos = [], info = {};
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errores.push(`HTTP ${r.status()}: ${r.url()}`); });
  const vert = p.disp.viewport.height > p.disp.viewport.width;
  let n = 0;
  const foto = async (nombre, pausa = 500, guardar = true) => {
    await espera(pausa);
    if (guardar) await page.screenshot({ path: join(OUT, `${p.id}-${String(++n).padStart(2, '0')}-${nombre}.png`) });
    fallos.push(...await revisar(page, nombre));
  };
  const btn = (t) => page.getByRole('button', { name: t, exact: typeof t === 'string' }).first();

  await page.goto(`${URL_BASE}?test=1&nuevo=1&reloj=2026-11-18T10:00:00`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await foto('inicio', 900);
  await btn('Empezar').tap();
  await espera(800);
  await page.locator('.guia[data-sp="0001"]').first().tap();
  await btn('Seguir').tap();
  await page.locator('.faro-btn[data-faro="este"]').first().tap();
  await foto('faros', 300);
  await btn('Encender el faro').tap();
  await foto('cala-tutorial', 1200);
  await page.evaluate(() => window.__farolillo.avanzar(70_000));
  await foto('cala-vuelta', 600);
  await page.getByRole('button', { name: /Recoger todo/ }).first().tap();
  await foto('informe-1', 600);
  // Botón atrás del sistema cierra el informe y no sale del juego
  const url0 = page.url();
  await btn('Seguir').tap();
  await cerrarMomentos(page);
  // Primera expedición real
  await page.locator('#tabs .tab[data-tab="expediciones"]').tap();
  await foto('expediciones', 400);
  await page.getByRole('button', { name: /Formar equipo/ }).first().tap();
  await foto('formar', 1000);
  await page.locator('.hueco .miembro').first().tap();
  await foto('selector', 1200);
  await page.goBack().catch(() => {});
  await espera(500);
  if (await page.locator('[data-modal="selector"]').count()) fallos.push('atrás no cerró el selector');
  if (page.url() !== url0) fallos.push(`atrás cambió la URL: ${page.url()}`);
  await btn('ENVIAR').tap();
  await espera(400);
  // Vuelve: «Recoger y enviar» (bucle de 1-3 min)
  for (let ronda = 0; ronda < 3; ronda++) {
    await page.evaluate(() => window.__farolillo.avanzar(3 * 3600_000));
    await page.locator('#tabs .tab[data-tab="cala"]').tap();
    await espera(500);
    const rec = page.getByRole('button', { name: /Recoger todo/ }).first();
    if (await rec.count() && await rec.isEnabled()) await rec.tap(); else fallos.push(`ronda ${ronda}: Recoger todo deshabilitado tras volver`);
    await espera(500);
    if (ronda === 0) await foto('informe-2', 300);
    const ye = page.getByRole('button', { name: /Recoger y enviar/ }).first();
    if (await page.locator('[data-modal="informe"]').count()) {
      const rep = page.locator('[data-modal="informe"]').getByRole('button', { name: /Repetir/ }).first();
      if (await ye.count()) await ye.tap(); else if (await rep.count()) await rep.tap(); else await btn('Seguir').tap();
    }
    await espera(400);
    await cerrarMomentos(page);
    const llena = page.locator('[data-modal="llena"]');
    if (await llena.count()) { await page.goBack().catch(() => {}); await espera(400); }
  }
  // Mejora en el gremio con toques
  await page.locator('#tabs .tab[data-tab="gremio"]').tap();
  await espera(500);
  await btn('Faro').tap();
  const mej = page.getByRole('button', { name: /Mejorar/ }).first();
  if (await mej.count() && await mej.isEnabled()) await mej.tap();
  await foto('gremio-faro', 500);

  // Partida avanzada
  await page.evaluate(() => window.__farolillo.jugar(16, 3 * 3600_000));
  await page.locator('#tabs .tab[data-tab="cala"]').tap();
  await foto('cala-avanzada', 1500);
  if (vert) {
    const tira = await page.evaluate(() => { const t = document.querySelector('.tira-equipos, [class*="tira"]'); if (!t) return null; const r = t.getBoundingClientRect(); return { b: r.bottom, h: innerHeight }; });
    info.tira = tira;
  }
  await page.locator('#tabs .tab[data-tab="expediciones"]').tap();
  await espera(400);
  const todos = page.getByRole('button', { name: /Enviar a todos/ }).first();
  if (await todos.count() && await todos.isEnabled()) await todos.tap();
  await espera(300);
  await page.evaluate(() => window.__farolillo.avanzar(20_000));
  await foto('expediciones-avanzada', 400);
  const ver = btn('Ver');
  if (await ver.count()) {
    await ver.tap();
    await foto('encurso', 1800);
    await page.goBack().catch(() => {});
    await espera(500);
    if (await page.locator('#capas > .capa').count()) fallos.push('atrás no cerró En curso');
  } else fallos.push('no hay botón Ver para En curso');
  // Formar avanzado
  await page.evaluate(() => { const f = window.__farolillo; f.avanzar(9 * 3600_000); f.app.recogerAhora(); });
  await espera(500);
  await cerrarMomentos(page);
  if (await page.locator('[data-modal="informe"]').count()) await btn('Seguir').tap().catch(() => {});
  await cerrarMomentos(page);
  const formar = page.getByRole('button', { name: /Formar equipo/ }).first();
  if (await formar.count()) {
    await formar.tap();
    await foto('formar-avanzado', 1200);
    const sug = page.getByRole('button', { name: /Sugerir/ }).first();
    if (await sug.count()) { await sug.tap(); await espera(800); }
    await foto('formar-sugerido', 300, false);
    await page.goBack().catch(() => {});
    await espera(400);
  }
  // Ajustes
  await page.locator('#b-menu').tap();
  await foto('ajustes', 500);
  await page.goBack().catch(() => {});
  await espera(400);
  // Mientras estabas fuera
  const ahora = await page.evaluate(() => { const f = window.__farolillo; f.app.game.enviarTodos(f.app.save, f.app.ctx()); f.app.guardar(true); return f.ahora(); });
  await page.goto(`${URL_BASE}?test=1&reloj=${ahora + 8 * 3600_000}`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await foto('mientras-fuera', 1000);
  if (!await page.locator('[data-modal="informe"]').count()) fallos.push('no salió «Mientras estabas fuera…»');
  else {
    const ye = page.getByRole('button', { name: /Recoger y enviar/ }).first();
    await ye.tap();
    await espera(600);
    await foto('tras-recoger-enviar', 400);
    const enviados = await page.evaluate(() => window.__farolillo.app.save.equipos.filter((e) => !e.exp).length);
    if (enviados) fallos.push(`«Recoger y enviar» dejó ${enviados} equipos libres`);
    await btn('Seguir').tap();
    await espera(400);
    await cerrarMomentos(page);
  }
  // CPU en reposo: rAF por segundo en la cala quieta
  await page.locator('#tabs .tab[data-tab="cala"]').tap().catch(() => {});
  await espera(1500);
  info.rafPorSeg = await page.evaluate(() => new Promise((ok) => { const a = window.__raf; setTimeout(() => ok((window.__raf - a) / 3), 3000); }));
  if (info.rafPorSeg < 1) fallos.push('la cala no se anima en reposo');
  if (info.rafPorSeg > 20) fallos.push(`rAF en reposo ${info.rafPorSeg}/s`);
  await ctx.close();
  return { p: p.nombre, errores: [...new Set(errores)], fallos: [...new Set(fallos)], info };
}

async function avion(browser, p) {
  const ctx = await browser.newContext({ ...p.disp, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errores = [], fallos = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  await page.goto(`${URL_BASE}?reloj=2026-11-18T10:00:00`);
  const btn = (t) => page.getByRole('button', { name: t, exact: true }).first();
  await espera(9000);
  if (await page.locator('#aviso-version').count()) {
    fallos.push('primera visita: sale «Hay una versión nueva · Reabrir» sin haber versión anterior');
    await page.locator('#aviso-version button[aria-label="Ahora no"]').tap();
  }
  await btn('Empezar').tap({ timeout: 20000 });
  await page.locator('.guia[data-sp="0004"]').first().tap();
  await btn('Seguir').tap();
  await page.locator('.faro-btn[data-faro="norte"]').first().tap();
  await btn('Encender el faro').tap();
  await page.locator('.lienzo-cala').first().waitFor({ timeout: 20000 });
  const ok = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 20000))]));
  if (!ok) fallos.push('SW no listo');
  await page.reload();
  await page.locator('.lienzo-cala').first().waitFor({ timeout: 20000 });
  await espera(2000);
  const ctrl = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!ctrl) fallos.push('SW no controla tras recargar');
  await ctx.setOffline(true);
  await page.reload();
  try { await page.locator('.lienzo-cala').first().waitFor({ timeout: 15000 }); } catch { fallos.push('sin conexión no abre la cala'); }
  await espera(1500);
  await page.screenshot({ path: join(OUT, `${p.id}-avion.png`) });
  // navegar sin red: pestañas
  for (const t of ['expediciones', 'gremio', 'bitacora', 'cala']) { await page.locator(`#tabs .tab[data-tab="${t}"]`).tap().catch(() => fallos.push(`sin red: no va la pestaña ${t}`)); await espera(400); }
  const imgsRotas = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src).slice(0, 5));
  if (imgsRotas.length) fallos.push(`sin red, imágenes rotas: ${imgsRotas.join(', ')}`);
  await ctx.close();
  return { p: p.nombre + ' (avión)', errores: [...new Set(errores)], fallos, info: {} };
}

await mkdir(OUT, { recursive: true });
const res = [];
const nav = {};
for (const p of PERFILES) {
  nav[p.motor] ??= await pw[p.motor].launch();
  try { res.push(await partida(nav[p.motor], p)); } catch (e) { res.push({ p: p.nombre, errores: [String(e.stack || e).slice(0, 600)], fallos: ['la partida se detuvo'], info: {} }); }
}
for (const p of PERFILES.filter((x) => ['se', 'px7'].includes(x.id))) {
  try { res.push(await avion(nav[p.motor], p)); } catch (e) { res.push({ p: p.nombre + ' (avión)', errores: [String(e.stack || e).slice(0, 600)], fallos: ['avión se detuvo'], info: {} }); }
}
for (const b of Object.values(nav)) await b.close();
let mal = 0;
for (const r of res) {
  console.log(`\n== ${r.p} ${JSON.stringify(r.info)}`);
  for (const e of r.errores) { console.log('  ERROR:', e); mal++; }
  for (const f of r.fallos) { console.log('  FALLO:', f); mal++; }
}
console.log(mal ? `\n${mal} problemas.` : '\nOK: partida completa en móvil, sin conexión y sin errores.');
process.exit(mal ? 1 : 0);
