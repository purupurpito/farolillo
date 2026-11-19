// Flujo real en el navegador (hito v0.1, «Hecho cuando»). Dueño: integración.
//   1. Primer arranque → tutorial → recoger.
//   2. Formar equipo → previsión → ENVIAR (se apunta el registro que decidió la resolución).
//   3. Se CIERRA la pestaña, se abre otra con el reloj adelantado (?reloj=) y sale «Mientras estabas fuera…».
//   4. RECOGER TODO: las monedas y la EXP cobradas cuadran con el registro de la expedición.
//   5. Ficha: varias especies se animan en el visor real; y las 222 especies del manifest se animan
//      en el visor de la ficha (scene-ficha) con el tamaño de canvas que da cada pantalla.
// En 360x640, 640x360 y 568x320. Sin errores de consola.
//
// Uso:  npx -y serve -l 8080 .   y   node test/ui/flujo.mjs [--url http://localhost:8080/] [--solo 360x640]

import { existsSync } from 'node:fs';
import { readdir, mkdir } from 'node:fs/promises';
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

async function cerrarMomentos(page) {
  for (let i = 0; i < 40 && await page.locator('[data-modal="momento"]').count(); i++) {
    await page.locator('[data-modal="momento"] .btn.prim').first().click();
    await espera(120);
  }
}

async function recorrer(browser, [w, h]) {
  const etiqueta = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const errores = [];
  const fallos = [];
  const info = {};
  const vigilar = (page) => {
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) errores.push(`HTTP ${r.status()}: ${r.url()}`); });
  };
  let page = await ctx.newPage();
  vigilar(page);
  const boton = (t) => page.getByRole('button', { name: t, exact: typeof t === 'string' }).first();

  // 1. Primer arranque
  const tAbrir = Date.now();
  await page.goto(`${URL_BASE}?test=1&nuevo=1&reloj=2026-11-18T10:00:00`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await boton('Empezar').click();
  await page.locator('.guia[data-sp="0007"]').first().click();
  await boton('Seguir').click();
  await page.locator('.faro-btn[data-faro="sur"]').first().click();
  await boton('Encender el faro').click();
  await page.waitForFunction(() => window.__farolillo.app.save && window.__farolillo.app.save.equipos[0].exp);
  info.primeraExpedicionMs = Date.now() - tAbrir;
  await page.evaluate(() => window.__farolillo.avanzar(70_000));
  await page.getByRole('button', { name: /Recoger todo/ }).first().click();
  await boton('Seguir').click();
  await cerrarMomentos(page);

  // 2. Formar y enviar con previsión
  await page.locator('#tabs .tab[data-tab="expediciones"]').click();
  await page.getByRole('button', { name: /Formar equipo/ }).first().click();
  await espera(900); // previsión con debounce de 150 ms
  info.prevision = (await page.locator('.prevision, [class*="prev"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  await boton('ENVIAR').click();
  await espera(300);
  const enviado = await page.evaluate(() => {
    const f = window.__farolillo;
    const s = f.app.save;
    const i = s.equipos.findIndex((e) => e.exp && !e.exp.plan?.tutorial);
    const e = s.equipos[i];
    const reg = e.exp.registro || null;
    const prev = f.app.game.prever(s, i, e.exp.plan, f.app.ctx(), 200);
    return {
      idx: i, fin: e.exp.fin, ahora: f.ahora(), monedas: s.monedas,
      nv: e.exp.plan.equipo.map((u) => { const m = s.pokemon.find((p) => p.id === u); return { u, nv: m.nv, xp: m.xp }; }),
      totales: reg ? reg.totales : null, motivo: reg ? reg.motivo : null,
      prev: prev ? { pJefe: prev.pJefe ?? prev.prob ?? null, monedas: prev.monedas ?? null } : null,
      tieneRegistro: !!reg,
    };
  });
  info.enviado = enviado;
  if (!(enviado.fin > enviado.ahora)) fallos.push('la expedición no tiene hora de vuelta futura');
  await page.evaluate(() => window.__farolillo.app.guardar(true));

  // 3. Cerrar la pestaña y volver con el reloj adelantado
  await page.close();
  page = await ctx.newPage();
  vigilar(page);
  await page.goto(`${URL_BASE}?test=1&reloj=${enviado.fin + 5 * 60_000}`);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  // Con la máquina cargada (otras pruebas a la vez) el informe puede tardar más de 700 ms: se espera hasta 8 s.
  await page.locator('[data-modal="informe"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  if (!await page.locator('[data-modal="informe"]').count()) fallos.push('al volver no salió «Mientras estabas fuera…»');
  else {
    await page.screenshot({ path: join(OUT, `flujo-${etiqueta}-1-mientras-fuera.png`) });
    await page.getByRole('button', { name: 'RECOGER TODO', exact: true }).first().click();
    await espera(500);
    await page.screenshot({ path: join(OUT, `flujo-${etiqueta}-2-informe.png`) });
    const texto = await page.locator('[data-modal="informe"]').first().innerText().catch(() => '');
    const despues = await page.evaluate(() => ({ monedas: window.__farolillo.app.save.monedas, bayas: window.__farolillo.app.save.bayas }));
    info.cobrado = despues.monedas - enviado.monedas;
    if (enviado.totales) {
      // El huerto puede sumar bayas pero no monedas: las monedas cobradas = las del registro.
      if (info.cobrado !== enviado.totales.monedas) fallos.push(`monedas cobradas ${info.cobrado} ≠ registro ${enviado.totales.monedas}`);
      const fmt = (n) => n.toLocaleString('es-ES');
      if (!texto.includes(String(enviado.totales.monedas)) && !texto.includes(fmt(enviado.totales.monedas))) fallos.push(`el informe no muestra las ${enviado.totales.monedas} monedas del registro`);
    }
    info.informe = texto.replace(/\s+/g, ' ').slice(0, 220);
    await page.locator('[data-modal="informe"] .btn').first().click().catch(() => {});
    await cerrarMomentos(page);
  }

  // 4. Varias especies en el visor real de la ficha
  await page.evaluate(() => window.__farolillo.jugar(10, 3 * 3600_000));
  await cerrarMomentos(page);
  await page.locator('#tabs .tab[data-tab="gremio"]').click();
  await espera(500);
  const filas = await page.locator('.fila-mon').count();
  const vistas = [];
  for (let i = 0; i < Math.min(5, filas); i++) {
    await page.locator('.fila-mon').nth(i).click();
    // Que el visor tenga lienzo antes de medir (bajo carga tardaba más de 700 ms).
    await page.locator('canvas.lienzo-ficha').first().waitFor({ timeout: 8000 }).catch(() => {});
    await espera(700);
    const firma = () => page.evaluate(() => {
      const c = document.querySelector('canvas.lienzo-ficha');
      if (!c || !c.width) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let hsh = 0;
      for (let k = 0; k < d.length; k += 16) hsh = (hsh * 31 + d[k] + d[k + 1] * 3 + d[k + 2] * 7) >>> 0;
      return hsh;
    });
    const a = await firma();
    let cambia = false;
    for (let k = 0; k < 30 && !cambia; k++) { await espera(150); cambia = (await firma()) !== a; }
    const sp = await page.evaluate(() => document.querySelector('.capa h2, .capa .titulo, .capa-cab')?.textContent?.trim() || '');
    vistas.push({ sp, cambia });
    if (i === 0) await page.screenshot({ path: join(OUT, `flujo-${etiqueta}-3-ficha.png`) });
    await page.locator('.capa .volver').last().click();
    await espera(200);
  }
  info.fichas = vistas;
  if (vistas.length < 3) fallos.push(`solo ${vistas.length} fichas abiertas`);
  for (const v of vistas) if (!v.cambia) fallos.push(`la ficha de «${v.sp}» no se anima`);

  // 5. Las 222 especies en el visor de la ficha, con el tamaño de canvas de esta pantalla
  await page.locator('.fila-mon').first().click();
  await espera(500);
  const r222 = await page.evaluate(async () => {
    const real = document.querySelector('canvas.lienzo-ficha').getBoundingClientRect();
    const Ficha = await import('./js/gfx/scene-ficha.js');
    const S = window.__farolillo.app.sprites;
    const c = document.createElement('canvas');
    c.style.cssText = `position:fixed;left:0;top:0;width:${real.width}px;height:${real.height}px;z-index:9999`;
    document.body.appendChild(c);
    let reloj = 0;
    const esc = Ficha.crear(c, { reloj: () => reloj });
    esc.iniciar();
    const firma = () => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let k = 0; k < d.length; k += 8) h = (h * 31 + d[k] + d[k + 1] * 3 + d[k + 2] * 7 + d[k + 3] * 11) >>> 0; return h; };
    const mal = [];
    const sp = S.especies();
    for (const e of sp) {
      const anims = S.animaciones(e);
      await S.precargar(e, anims);
      let ok = false;
      for (const anim of ['Walk', 'Idle']) {
        if (!anims.includes(anim)) continue;
        esc.actualizar({ sp: e, vr: false, anim, dir: 0 });
        const vistos = new Set();
        for (let t = 0; t < 2000 && vistos.size < 2; t += 67) { reloj = t; esc.render(1e6 + t); vistos.add(firma()); }
        if (vistos.size >= 2) { ok = true; break; }
      }
      if (!ok) mal.push(e);
    }
    esc.destruir();
    c.remove();
    return { total: sp.length, mal, canvas: `${Math.round(real.width)}x${Math.round(real.height)}` };
  });
  info.especies = r222;
  if (r222.total < 222) fallos.push(`el manifest solo tiene ${r222.total} especies`);
  if (r222.mal.length) fallos.push(`no se animan en la ficha: ${r222.mal.slice(0, 12).join(', ')}${r222.mal.length > 12 ? '…' : ''}`);

  await ctx.close();
  return { etiqueta, errores: [...new Set(errores)], fallos, info };
}

const pw = await cargarPlaywright();
await mkdir(OUT, { recursive: true });
const browser = await pw.chromium.launch();
let mal = 0;
const resumen = [];
for (const t of TAMANOS) {
  let r;
  try { r = await recorrer(browser, t); } catch (e) { r = { etiqueta: t.join('x'), errores: [String(e.stack || e)], fallos: ['el flujo se detuvo'], info: {} }; }
  console.log(`\n== ${r.etiqueta}`);
  console.log(JSON.stringify(r.info, null, 1));
  for (const e of r.errores) { console.log('  ERROR consola:', e); resumen.push(`[${r.etiqueta}] consola: ${e.split('\n')[0]}`); mal++; }
  for (const f of r.fallos) { console.log('  FALLO:', f); resumen.push(`[${r.etiqueta}] ${f}`); mal++; }
}
await browser.close();
// Repetidos al final en corto: si la salida (JSON largo) se trunca, se sigue viendo qué falló.
if (resumen.length) console.log('\nProblemas:\n- ' + resumen.join('\n- '));
console.log(mal ? `\n${mal} problemas.` : '\nOK: el informe cuadra con el registro, las fichas se animan y no hay errores de consola.');
process.exit(mal ? 1 : 0);
