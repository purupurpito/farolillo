// Capturas de la UI en 360x640, 640x360 y 568x320 (§16). Recorre primer arranque, cala, informe, momento,
// expediciones, formar equipo, selector, en curso, bitácora, gremio, ficha, ajustes y créditos.
// Comprueba: sin scroll horizontal, botones ≥ 44 px y sin errores de consola. Guarda PNG en test/ui/out/.
// Contextos con isMobile/hasTouch, en Chromium y en WebKit (las de WebKit llevan el prefijo «webkit-»).
//
// Uso:  npx -y serve -l 8080 .   (en otra terminal)
//       node test/ui/capturas.mjs [--url http://localhost:8080/] [--solo 360x640]
// Playwright: se importa 'playwright'; si no está instalado en el proyecto, se busca en la caché de npx
// (o en la carpeta que diga PLAYWRIGHT_DIR). Navegador: npx playwright install chromium.

import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, 'out');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = arg('--url', process.env.URL || 'http://localhost:8080/');
const SOLO = arg('--solo', null);
const TAMANOS = [[360, 640], [640, 360], [568, 320]].filter(([w, h]) => !SOLO || SOLO === `${w}x${h}`);
// Motores: Chromium (Android) y WebKit (Safari de iPhone). --motor chromium|webkit para uno solo.
const MOTORES = ['chromium', 'webkit'].filter((m) => !arg('--motor', null) || arg('--motor', null) === m);

async function cargarPlaywright() {
  try { return await import('playwright'); } catch { /* sigue */ }
  const dirs = [];
  if (process.env.PLAYWRIGHT_DIR) dirs.push(process.env.PLAYWRIGHT_DIR);
  const npx = join(process.env.LOCALAPPDATA || join(homedir(), '.npm'), 'npm-cache', '_npx');
  const npx2 = join(homedir(), '.npm', '_npx');
  for (const base of [npx, npx2]) {
    if (!existsSync(base)) continue;
    for (const d of await readdir(base)) dirs.push(join(base, d, 'node_modules', 'playwright'));
  }
  for (const d of dirs) {
    const idx = join(d, 'index.mjs');
    if (existsSync(idx)) return import(pathToFileURL(idx).href);
  }
  throw new Error('No encuentro Playwright. Instálalo con «npx playwright install chromium» o pon PLAYWRIGHT_DIR.');
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function comprobar(page, nombre, fallos) {
  const r = await page.evaluate(() => {
    const out = { scroll: document.documentElement.scrollWidth - window.innerWidth, chicos: [] };
    const sel = 'button, select, [role="button"], input[type="checkbox"], input[type="range"], a.btn';
    for (const el of document.querySelectorAll(sel)) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      let b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (el.matches('input[type="checkbox"]')) { const l = el.closest('label'); if (l) b = l.getBoundingClientRect(); }
      // Fuera de la ventana (carrusel desplazado, contenido por debajo): se mide igual.
      if (b.height < 43.5 || b.width < 43.5) out.chicos.push(`${el.tagName.toLowerCase()}«${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}» ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    // Contenedores con desbordamiento horizontal (salvo los que se desplazan a propósito).
    out.desborda = [];
    for (const el of document.querySelectorAll('#vista, .capa-cuerpo, .modal')) {
      if (el.scrollWidth - el.clientWidth > 1) out.desborda.push(el.id || el.className);
    }
    return out;
  });
  if (r.scroll > 0) fallos.push(`${nombre}: scroll horizontal de ${r.scroll} px`);
  if (r.desborda.length) fallos.push(`${nombre}: desborda en ${r.desborda.join(', ')}`);
  if (r.chicos.length) fallos.push(`${nombre}: botones < 44 px: ${[...new Set(r.chicos)].slice(0, 6).join('; ')}`);
}

async function recorrer(browser, [w, h], motor = 'chromium') {
  const etiqueta = motor === 'chromium' ? `${w}x${h}` : `${motor}-${w}x${h}`;
  // Perfil de móvil de verdad (isMobile: viewport meta, toques, UA móvil).
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const page = await ctx.newPage();
  const errores = [];
  const fallos = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errores.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errores.push(`HTTP ${r.status()}: ${r.url()}`); });
  const capturas = [];
  let n = 0;
  const foto = async (nombre, pausa = 500) => {
    await espera(pausa);
    const f = join(OUT, `${etiqueta}-${String(++n).padStart(2, '0')}-${nombre}.png`);
    await page.screenshot({ path: f });
    capturas.push(f);
    await comprobar(page, `${etiqueta} ${nombre}`, fallos);
  };
  const clic = async (selector, opciones = {}) => { await page.locator(selector).first().click(opciones); };
  const texto = (t) => page.getByRole('button', { name: t, exact: typeof t === 'string' }).first();

  await page.goto(`${URL_BASE}?test=1&nuevo=1&reloj=2026-11-18T10:00:00`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await foto('inicio', 900);
  await texto('Empezar').click();
  await foto('guias', 1200);
  await clic('.guia[data-sp="0004"]');
  await texto('Seguir').click();
  await clic('.faro-btn[data-faro="norte"]');
  await page.fill('.inicio input.txt', 'Farero');
  await foto('faros', 300);
  await texto('Encender el faro').click();
  await foto('cala-tutorial', 1200);

  // Vuelve la expedición del tutorial
  await page.evaluate(() => window.__farolillo.avanzar(70_000));
  await foto('cala-vuelta', 600);
  await page.getByRole('button', { name: /Recoger todo/ }).first().click();
  await foto('informe', 600);
  await texto('Seguir').click();
  if (await page.locator('[data-modal="momento"]').count()) {
    await foto('momento', 1800);
    await page.locator('[data-modal="momento"] .btn.prim').click();
  }
  // Primera expedición de verdad desde Formar
  await page.locator('#tabs .tab[data-tab="expediciones"]').click();
  await foto('expediciones', 400);
  await page.getByRole('button', { name: /Formar equipo/ }).first().click();
  await foto('formar', 900);
  await page.locator('.hueco .miembro').first().click();
  await foto('selector', 1200);
  await page.locator('[data-modal="selector"] .btn').last().click();
  await texto('ENVIAR').click();
  await espera(300);

  // Partida avanzada (rondas simuladas sin pantallas) para ver contenido
  await page.evaluate(() => window.__farolillo.jugar(14, 3 * 3600_000));
  await page.locator('#tabs .tab[data-tab="cala"]').click();
  await foto('cala-avanzada', 1500);
  // Toque a un vecino: globo con frase
  const pos = await page.evaluate(() => {
    const c = document.querySelector('.lienzo-cala').getBoundingClientRect();
    return { x: c.left + c.width * 0.3, y: c.top + c.height * 0.7 };
  });
  await page.mouse.click(pos.x, pos.y);
  await page.locator('#tabs .tab[data-tab="expediciones"]').click();
  await foto('expediciones-avanzada', 500);
  // Enviar a todos y abrir una en curso
  const enviar = page.getByRole('button', { name: /Enviar a todos/ }).first();
  if (await enviar.isEnabled()) await enviar.click();
  await espera(300);
  await page.evaluate(() => window.__farolillo.avanzar(20_000));
  const ver = texto('Ver');
  if (await ver.count()) { await ver.click(); await foto('encurso', 1500); await page.locator('.capa .volver').click(); }
  // Formar con previsión de una isla más honda
  await page.evaluate(() => { const f = window.__farolillo; const s = f.app.save; const i = s.equipos.findIndex((e) => !e.exp); if (i < 0) { f.avanzar(9 * 3600_000); f.app.recogerAhora(); } });
  await espera(400);
  for (let i = 0; i < 30 && await page.locator('[data-modal="momento"]').count(); i++) {
    await page.locator('[data-modal="momento"] .btn.prim').first().click();
    await espera(150);
  }
  const formar = page.getByRole('button', { name: /Formar equipo/ }).first();
  if (await formar.count()) { await formar.click(); await foto('formar-avanzado', 1000); await page.locator('.capa .volver').click(); }

  await page.locator('#tabs .tab[data-tab="bitacora"]').click();
  await foto('bitacora', 1200);
  await texto('Diario de expediciones').click();
  await foto('bitacora-diario', 400);

  await page.locator('#tabs .tab[data-tab="gremio"]').click();
  await foto('gremio', 900);
  await texto('Faro').click();
  await foto('gremio-faro', 300);
  await page.getByRole('button', { name: /^Pokémon/ }).click();
  await page.locator('.fila-mon').first().click();
  await foto('ficha', 1200);
  await page.locator('.capa-cuerpo').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await foto('ficha-diario', 400);
  await page.locator('.capa .volver').click();

  // Evolución desde la ficha: panel de opciones y momento especial
  await page.locator('select[aria-label="Filtrar"]').selectOption('evo');
  if (await page.locator('.fila-mon').count()) {
    await page.locator('.fila-mon').first().click();
    await texto('Evolucionar ⬆').click();
    await foto('ficha-evolucion', 600);
    await page.locator('.capa .btn.ok:not([disabled])', { hasText: 'Evolucionar' }).last().click();
    await foto('momento-evolucion', 1600);
    for (let i = 0; i < 30 && await page.locator('[data-modal="momento"]').count(); i++) {
      await page.locator('[data-modal="momento"] .btn.prim').first().click();
      await espera(150);
    }
    await page.locator('.capa .volver').click();
  }

  await page.locator('#b-menu').click();
  await texto('Exportar').click();
  await foto('ajustes', 400);
  await texto('Créditos y licencias').click();
  await foto('creditos', 900);
  await page.locator('.capa .volver').last().click();
  await page.locator('.capa .volver').last().click();

  // Cerrar y volver más tarde: el informe «Mientras estabas fuera…» debe cuadrar.
  const enviados = await page.evaluate(() => { const f = window.__farolillo; const n = f.app.game.enviarTodos(f.app.save, f.app.ctx()); f.app.guardar(true); return { n, ahora: f.ahora() }; });
  await page.goto(`${URL_BASE}?test=1&reloj=${enviados.ahora + 10 * 3600_000}`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await foto('mientras-fuera', 900);
  const hayInforme = await page.locator('[data-modal="informe"]').count();
  if (!hayInforme) fallos.push(`${etiqueta}: al volver no salió «Mientras estabas fuera…»`);
  else {
    await texto('RECOGER TODO').click();
    await foto('informe-recogido', 500);
  }

  await ctx.close();
  return { etiqueta, capturas, errores: [...new Set(errores)], fallos };
}

const pw = await cargarPlaywright();
await mkdir(OUT, { recursive: true });
const res = [];
for (const motor of MOTORES) {
  let browser;
  try { browser = await pw[motor].launch(); } catch (e) { console.log(`(sin ${motor}: npx playwright install ${motor})`); continue; }
  for (const t of TAMANOS) {
    try { res.push(await recorrer(browser, t, motor)); } catch (e) { res.push({ etiqueta: motor + ' ' + t.join('x'), capturas: [], errores: [String(e.stack || e)], fallos: ['el recorrido se detuvo'] }); }
  }
  await browser.close();
}
let mal = 0;
for (const r of res) {
  console.log(`\n== ${r.etiqueta}: ${r.capturas.length} capturas`);
  for (const e of r.errores) { console.log('  ERROR consola:', e); mal++; }
  for (const f of r.fallos) { console.log('  FALLO:', f); mal++; }
}
console.log(mal ? `\n${mal} problemas.` : '\nOK: sin scroll horizontal, botones ≥ 44 px y sin errores de consola.');
process.exit(mal ? 1 : 0);
