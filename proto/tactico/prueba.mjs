// prueba.mjs — juega una partida completa del Prototipo B tocando la pantalla como un jugador
// (las jugadas las sugiere la misma IA que usa el rival, vía window.__tactico.consejo()) y comprueba
// que no hay errores de consola ni de página, ni dos unidades en la misma casilla.
//
// Uso (con el servidor en :8080 sirviendo la raíz de pmd-idle):
//   node proto/tactico/prueba.mjs [--dispositivo "Pixel 7"] [--navegador chromium|webkit]
//        [--url http://localhost:8080/proto/tactico/] [--capturas carpeta] [--lento] [--semilla N]
// Sale con código 1 si hay errores o la partida no llega a la pantalla de resultado.

import { existsSync } from 'node:fs';
import { readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = arg('--url', 'http://localhost:8080/proto/tactico/');
const DISPOSITIVO = arg('--dispositivo', 'Pixel 7');
const NAVEGADOR = arg('--navegador', 'chromium');
const CAPTURAS = arg('--capturas', null);
const LENTO = args.includes('--lento');
const SEMILLA = arg('--semilla', null);
const LIMITE_MS = LENTO ? 15 * 60_000 : 6 * 60_000;

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

const pw = await cargarPlaywright();
const disp = pw.devices[DISPOSITIVO];
if (!disp) throw new Error('Dispositivo desconocido: ' + DISPOSITIVO);
const browser = await pw[NAVEGADOR].launch();
const context = await browser.newContext({ ...disp });
const page = await context.newPage();
const errores = [];
page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
page.on('pageerror', (e) => errores.push('página: ' + e.message));
page.on('requestfailed', (r) => errores.push('petición: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

if (CAPTURAS) await mkdir(CAPTURAS, { recursive: true });
let nCap = 0;
const capturar = async (nombre) => {
  if (!CAPTURAS) return;
  const ruta = join(CAPTURAS, `${String(++nCap).padStart(3, '0')}-${nombre}.png`);
  for (let i = 0; i < 3; i++) {
    try { await page.screenshot({ path: ruta }); return; } catch { await page.waitForTimeout(250); }
  }
  console.warn('No se pudo capturar ' + ruta);
};

const qs = new URLSearchParams();
if (!LENTO) qs.set('rapido', '1');
qs.set('sintuto', '1');
if (SEMILLA) qs.set('semilla', SEMILLA);
await page.goto(URL_BASE + '?' + qs);
await page.waitForSelector('.lider');
await capturar('inicio');
await page.locator('.lider').nth(Math.floor(Math.random() * 9)).click();
await page.click('#empezar');

const T = () => page.evaluate(() => {
  const t = window.__tactico;
  return { pantalla: t.pantalla, modo: t.modo, ocupado: t.ocupado };
});
const tocar = async (celda) => {
  const p = await page.evaluate(({ c, r }) => window.__tactico.centroCelda(c, r), celda);
  if (disp.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
};
const esperarLibre = () => page.waitForFunction(() => {
  const t = window.__tactico;
  return t.pantalla !== 'combate' || (!t.ocupado && (t.modo === 'libre' || t.modo === 'fin'));
}, null, { timeout: 60_000 });

const t0 = Date.now();
let jugadas = 0, combates = 0, ultimaPantalla = '';
while (Date.now() - t0 < LIMITE_MS) {
  const e = await T();
  if (e.pantalla !== ultimaPantalla) {
    if (e.pantalla === 'combate') combates++;
    await capturar(e.pantalla); ultimaPantalla = e.pantalla;
  }
  if (e.pantalla === 'resultado') break;
  if (e.pantalla === 'mapa') {
    // Prefiere descansar si hay descanso; si no, el primero que brille.
    const desc = page.locator('.nodo.disp.t-descanso');
    await ((await desc.count()) ? desc.first() : page.locator('.nodo.disp').first()).click({ force: true });
    continue;
  }
  if (e.pantalla === 'premio') { await page.locator('.mejora').first().click(); continue; }
  if (e.pantalla === 'descanso') { await page.click('#seguir'); continue; }
  if (e.pantalla !== 'combate') { await page.waitForTimeout(100); continue; }
  if (e.modo === 'cargando' || e.modo === 'fin' || e.ocupado || e.modo === 'rival') { await page.waitForTimeout(80); continue; }
  if (e.modo !== 'libre') { await page.waitForTimeout(80); continue; }
  if (await page.locator('.tuto').count()) { await page.click('#tuto-ok'); continue; }
  const k = await page.evaluate(() => window.__tactico.consejo());
  if (!k) { await page.waitForTimeout(80); continue; }
  await tocar(k.u);
  await page.waitForFunction(() => window.__tactico.modo === 'mover');
  if (jugadas === 0 || jugadas === 3) await capturar('mover');
  await tocar(k.destino);
  await page.waitForFunction(() => window.__tactico.modo === 'accion' && !window.__tactico.ocupado);
  if (k.mov >= 0) {
    await page.click(`.mov[data-mov="${k.mov}"]`);
    await tocar(k.objetivo);
    const d = await T();
    if (d.modo === 'confirmar' && !d.ocupado) {
      if (jugadas === 0 || jugadas === 3) await capturar('confirmar');
      await page.click('#principal', { force: true });
    }
  } else {
    await page.click('#esperar');
  }
  jugadas++;
  await esperarLibre();
  // Nunca dos unidades en la misma casilla.
  const solape = await page.evaluate(() => {
    const r = window.__tactico.resumen();
    if (!r) return null;
    const pos = [...r.jugador, ...r.rival].map((u) => u[2] + ',' + u[3]);
    return new Set(pos).size !== pos.length ? pos.join(' ') : null;
  });
  if (solape) errores.push('unidades superpuestas: ' + solape);
}
const final = await T();
const texto = final.pantalla === 'resultado' ? await page.locator('.resultado h1').innerText() : null;
await capturar('final');
if (final.pantalla === 'resultado') {
  await page.click('#otra');
  await page.waitForSelector('.lider');
}
await browser.close();

const ok = final.pantalla === 'resultado' && !errores.length;
console.log(JSON.stringify({
  ok, dispositivo: DISPOSITIVO, navegador: NAVEGADOR, resultado: texto, segundos: Math.round((Date.now() - t0) / 1000),
  combatesEmpezados: combates, errores,
}, null, 1));
process.exit(ok ? 0 : 1);
