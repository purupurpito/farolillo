// Prueba del prototipo A (mazmorra por turnos): juega partidas completas con los mandos de verdad
// (deslizar sobre el canvas, botones de movimiento, objetos, escalera y «Otra vez») y comprueba:
//   · ningún error de consola ni excepción de página;
//   · «Entrar» y «Otra vez» se ven sin hacer scroll (se tocan con touchscreen.tap, que no desplaza);
//   · «Explorar» anda solo y se para; sobre la escalera, «Esperar» pasa a «Bajar»;
//   · se llega a la pantalla de resultado y «Otra vez» empieza otra partida;
//   · sin scroll horizontal; botones de mando ≥ 44 px; el canvas ocupa la pantalla;
//   · escala entera (px de dispositivo por px de sprite) y ritmo de frames (rAF) durante el juego.
// Decide cada acción el mismo bot que usa la simulación (juego.sugerir), pero la ejecuta tocando la pantalla.
//
// Uso: servidor en :8080 (npx -y serve -l 8080 <raíz del repo>) y
//   node proto/mazmorra/prueba.mjs [--url http://localhost:8080/proto/mazmorra/] [--solo "Pixel 7"] [--capturas] [--lento]
// --capturas guarda PNG en proto/mazmorra/out/. --lento juega con las animaciones a velocidad normal.

import { existsSync } from 'node:fs';
import { readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, 'out');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = arg('--url', 'http://localhost:8080/proto/mazmorra/');
const SOLO = arg('--solo', null);
const CAPTURAS = args.includes('--capturas');
const LENTO = args.includes('--lento');
const MAX_ACCIONES = 1600;
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

const pw = await cargarPlaywright();
const { devices } = pw;
const sinNavegador = (d) => { const { defaultBrowserType, ...resto } = d; return resto; };
const PERFILES = [
  { nombre: 'Pixel 7', motor: 'chromium', disp: sinNavegador(devices['Pixel 7']) },
  { nombre: 'Pixel 7 h', motor: 'chromium', disp: sinNavegador(devices['Pixel 7 landscape']) },
  { nombre: 'iPhone SE', motor: 'chromium', disp: sinNavegador(devices['iPhone SE']) },
  { nombre: 'iPhone SE h', motor: 'webkit', disp: sinNavegador(devices['iPhone SE landscape']) },
  { nombre: 'iPhone 15', motor: 'webkit', disp: sinNavegador(devices['iPhone 15']) },
  { nombre: 'iPhone 15 h', motor: 'webkit', disp: sinNavegador(devices['iPhone 15 landscape']) },
  { nombre: '640x360', motor: 'chromium', disp: { ...sinNavegador(devices['Pixel 7']), viewport: { width: 640, height: 360 }, screen: { width: 640, height: 360 } } },
].filter((p) => !SOLO || p.nombre === SOLO);

/** Toca el centro de un elemento sin desplazar la página; falla si no está entero a la vista. */
async function tocarVisible(page, sel, fallos, que) {
  const r = await page.$eval(sel, (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, t: b.top, r: b.right, b: b.bottom, w: innerWidth, h: innerHeight }; });
  if (r.l < -1 || r.t < -1 || r.r > r.w + 1 || r.b > r.h + 1) fallos.push(`${que} no se ve sin scroll (${Math.round(r.t)}-${Math.round(r.b)} de ${r.h})`);
  await page.touchscreen.tap(Math.round(r.x), Math.round(Math.min(r.y, r.h - 2)));
}

if (CAPTURAS) await mkdir(OUT, { recursive: true });

async function revisarPantalla(page) {
  return page.evaluate(() => {
    const fallos = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) fallos.push(`scroll horizontal (${document.documentElement.scrollWidth} > ${innerWidth})`);
    const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    for (const b of document.querySelectorAll('#juego button, #juego .cruceta')) {
      if (!visible(b)) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) fallos.push(`botón pequeño «${(b.textContent || b.id).trim().slice(0, 20)}» ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
      if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1) fallos.push(`botón fuera de pantalla «${(b.textContent || b.id).trim().slice(0, 20)}»`);
    }
    const c = document.getElementById('lienzo').getBoundingClientRect();
    if (Math.abs(c.width - innerWidth) > 1 || Math.abs(c.height - innerHeight) > 1) fallos.push('el canvas no ocupa la pantalla');
    // escala entera: px de dispositivo por px del búfer
    const cv = document.getElementById('lienzo');
    const f = c.width * devicePixelRatio / cv.width;
    if (Math.abs(f - Math.round(f)) > 0.04 * Math.round(f)) fallos.push(`escala no entera: ${f.toFixed(3)}`);
    return { fallos, S: f, buf: `${cv.width}x${cv.height}` };
  });
}

async function fps(page, ms = 1500) {
  return page.evaluate((ms) => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = (t) => { n++; if (t - t0 < ms) requestAnimationFrame(f); else res(Math.round(n * 1000 / (t - t0))); };
    requestAnimationFrame(f);
  }), ms);
}

async function esperarLibre(page, max = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const ok = await page.evaluate(() => { const e = window.__mazmorra.estado(); return !e || e.fin || !e.ocupada; });
    if (ok) return;
    await espera(15);
  }
  throw new Error('la animación no termina');
}

/** Punto de la zona de juego libre (sin paneles), para empezar a deslizar. */
async function puntoLibre(page) {
  return page.evaluate(() => {
    const a = document.getElementById('arriba').getBoundingClientRect();
    const m = document.getElementById('mandos').getBoundingClientRect();
    const horiz = m.top <= 1;
    const x = horiz ? m.left / 2 : innerWidth / 2;
    const y = horiz ? (a.bottom + innerHeight) / 2 : (a.bottom + m.top) / 2;
    return { x: Math.round(x), y: Math.round(y) };
  });
}

const VEC = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
async function deslizar(page, p0, dir, largo = 50) {
  const [dx, dy] = VEC[dir];
  const n = Math.hypot(dx, dy);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p0.x + dx / n * largo * 0.5, p0.y + dy / n * largo * 0.5);
  await page.mouse.move(p0.x + dx / n * largo, p0.y + dy / n * largo);
  await espera(LENTO ? 40 : 20);
  await page.mouse.up();
}

async function capturar(page, perfil, nombre) {
  if (!CAPTURAS) return;
  await page.screenshot({ path: join(OUT, `${perfil.nombre.replace(/\s+/g, '-')}-${nombre}.png`) });
}

async function jugarPerfil(perfil) {
  const navegador = await pw[perfil.motor].launch();
  const ctx = await navegador.newContext({ ...perfil.disp });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => errores.push('excepción: ' + e.message));
  page.on('requestfailed', (r) => errores.push('petición fallida: ' + r.url()));
  const fallos = [];
  const res = { perfil: perfil.nombre, motor: perfil.motor };
  try {
    await page.goto(URL_BASE + (LENTO ? '' : '?rapido=1'));
    await page.waitForSelector('.lider');
    await capturar(page, perfil, '1-inicio');
    const nLideres = await page.$$eval('.lider', (l) => l.length);
    await tocarVisible(page, `.lider:nth-child(${1 + Math.floor(Math.random() * nLideres)})`, fallos, 'líder');
    await page.waitForSelector('#btnEntrar:not([disabled])');
    await capturar(page, perfil, '1b-elegido');
    await tocarVisible(page, '#btnOtros', fallos, '«Otros compañeros»');
    await tocarVisible(page, '#btnEntrar', fallos, '«Entrar»');
    await page.waitForSelector('#cargando', { state: 'hidden', timeout: 10000 });
    await espera(400);
    await capturar(page, perfil, '2-piso1');
    const r1 = await revisarPantalla(page);
    fallos.push(...r1.fallos);
    res.escala = `S=${r1.S.toFixed(2)} búfer ${r1.buf}`;

    const p0 = await puntoLibre(page);
    // Mandos de verdad: un deslizamiento en cada eje, la cruceta y vuelta a deslizar.
    for (const d of [2, 6, 0, 4]) { await deslizar(page, p0, d); await esperarLibre(page); }
    await page.tap('#btnModo');
    await page.waitForSelector('#cruceta', { state: 'visible' });
    await capturar(page, perfil, '3-cruceta');
    const rc = await page.$eval('#cruceta', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    await page.mouse.move(rc.x + rc.w * 0.35, rc.y); await page.mouse.down(); await espera(60); await page.mouse.up();
    await esperarLibre(page);
    fallos.push(...(await revisarPantalla(page)).fallos);
    await page.tap('#btnModo');
    await page.waitForSelector('#cruceta', { state: 'hidden' });

    // Mientras se anda, medir el ritmo de frames.
    res.fps = await fps(page);

    // «Explorar»: anda solo y se para (enemigo, escalera, nada…). Se toca otra vez para parar si sigue.
    const t0 = (await page.evaluate(() => window.__mazmorra.estado())).turno;
    await tocarVisible(page, '#btnExplorar', fallos, '«Explorar»');
    const hasta = Date.now() + 12000;
    let enMarcha = true;
    while (Date.now() < hasta) {
      const e = await page.evaluate(() => window.__mazmorra.estado());
      if (!e.auto && !e.ocupada) { enMarcha = false; break; }
      if (e.turno - t0 >= 25) break;
      await espera(50);
    }
    const t1 = (await page.evaluate(() => window.__mazmorra.estado())).turno;
    res.explorar = `${t1 - t0} pasos`;
    if (enMarcha) { await tocarVisible(page, '#btnExplorar', fallos, '«Parar»'); await esperarLibre(page); }
    const sigue = await page.evaluate(() => window.__mazmorra.estado().auto);
    if (sigue) fallos.push('«Parar» no detiene Explorar');
    if (t1 === t0 && !(await page.evaluate(() => /enemigo|escalera|explorar/i.test(document.getElementById('log').textContent))))
      fallos.push('«Explorar» no anduvo ni explicó por qué');
    await capturar(page, perfil, '3b-explorar');
    // Minimapa: por encima de los mandos y dentro de la pantalla.
    const mini = await page.evaluate(() => { const m = document.getElementById('mini'); const r = m.getBoundingClientRect(); return { z: getComputedStyle(m).zIndex, ok: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
    if (mini.z === 'auto' || !mini.ok) fallos.push('minimapa tapado o fuera de pantalla');

    let acciones = 0, ultimoPiso = 1, capturaCombate = false, capturaJefe = false, capturaCarga = false;
    while (acciones++ < MAX_ACCIONES) {
      await esperarLibre(page);
      const est = await page.evaluate(() => window.__mazmorra.estado());
      if (est.pantalla === 'resultado' || est.fin) break;
      if (est.piso !== ultimoPiso) {
        ultimoPiso = est.piso; await espera(500);
        await capturar(page, perfil, `4-piso${est.piso}`);
        fallos.push(...(await revisarPantalla(page)).fallos);
      }
      if (!capturaCarga && est.peligro) { capturaCarga = true; await capturar(page, perfil, '6b-carga'); }
      const acc = await page.evaluate(() => window.__mazmorra.sugerir());
      if (acc.tipo === 'andar') await deslizar(page, p0, acc.dir);
      else if (acc.tipo === 'mov') {
        // Tocar al enemigo adyacente (Placaje) o pulsar el botón del movimiento.
        if (acc.i === 0) {
          const L = est.lider;
          const pt = await page.evaluate(([x, y]) => window.__mazmorra.celdaAPantalla(x, y), [L.x + VEC[acc.dir][0], L.y + VEC[acc.dir][1]]);
          await page.mouse.click(pt.x, pt.y);
        } else await page.tap(`.mov[data-i="${acc.i}"]`);
        if (!capturaCombate) { capturaCombate = true; await espera(LENTO ? 250 : 90); await capturar(page, perfil, '5-combate'); }
      } else if (acc.tipo === 'objeto') await page.tap(acc.clave === 'baya' ? '#btnBaya' : '#btnSemilla');
      else if (acc.tipo === 'bajar') {
        if (await page.isVisible('#btnBajar')) {
          await capturar(page, perfil, `escalera-p${est.piso}`);
          // La 1ª vez: «Quedarme» y luego bajar con el botón fijo de los mandos (antes te quedabas atascado).
          if (est.piso === 1) {
            await tocarVisible(page, '#btnQuedar', fallos, '«Quedarme»');
            await espera(60);
            const txt = (await page.textContent('#btnEsperar')).trim();
            if (txt !== 'Bajar') fallos.push(`sobre la escalera el botón dice «${txt}» y no «Bajar»`);
            await capturar(page, perfil, 'escalera-bajar-fijo');
            await tocarVisible(page, '#btnEsperar', fallos, '«Bajar» de los mandos');
          } else await tocarVisible(page, '#btnBajar', fallos, '«Bajar»');
        } else if ((await page.textContent('#btnEsperar')).trim() === 'Bajar') await tocarVisible(page, '#btnEsperar', fallos, '«Bajar» de los mandos');
        else await page.evaluate(() => window.__mazmorra.hacer({ tipo: 'bajar' }));
      } else if (acc.tipo === 'esperar') {
        if (est.enEscalera) await page.evaluate(() => window.__mazmorra.hacer({ tipo: 'esperar' }));
        else await page.tap('#btnEsperar');
      }
      if (!capturaJefe && est.piso === 3) {
        const visto = await page.evaluate(() => !!document.querySelector('#log')?.textContent.includes('guardián'));
        if (visto) { capturaJefe = true; await espera(300); await capturar(page, perfil, '6-jefe'); }
      }
      // Que el turno se vea antes de la siguiente decisión.
      await espera(5);
    }
    res.acciones = acciones;
    await page.waitForSelector('#resultado', { state: 'visible', timeout: 15000 });
    await capturar(page, perfil, '7-resultado');
    res.resultado = await page.textContent('#resTitulo');
    res.turnos = await page.evaluate(() => window.__mazmorra.estado().turno);
    res.puntos = (await page.textContent('#resPuntos')).trim();
    // Otra vez (tiene que verse sin scroll, también en horizontal)
    await tocarVisible(page, '#btnOtra', fallos, '«Otra vez»');
    await page.waitForSelector('#juego', { state: 'visible' });
    await page.waitForSelector('#cargando', { state: 'hidden', timeout: 10000 });
    const est2 = await page.evaluate(() => window.__mazmorra.estado());
    if (est2.turno !== 0 || est2.piso !== 1 || est2.fin) fallos.push('«Otra vez» no empieza una partida nueva');
    for (let i = 0; i < 4; i++) { await deslizar(page, p0, (i * 2) % 8); await esperarLibre(page); }
    await capturar(page, perfil, '8-otra-vez');
  } catch (e) {
    fallos.push('fallo: ' + e.message.split('\n')[0]);
    await capturar(page, perfil, 'error').catch(() => {});
  }
  fallos.push(...errores);
  await navegador.close();
  return { ...res, fallos };
}

let mal = 0;
for (const p of PERFILES) {
  const r = await jugarPerfil(p);
  const ok = !r.fallos.length;
  if (!ok) mal++;
  console.log(`${ok ? 'OK ' : 'MAL'} ${r.perfil} (${r.motor}) · ${r.resultado || '-'} · ${r.puntos || ''} · turnos ${r.turnos ?? '-'} · acciones ${r.acciones ?? '-'} · explorar ${r.explorar || '-'} · ${r.escala || ''} · rAF ${r.fps ?? '-'}/s`);
  for (const f of [...new Set(r.fallos)]) console.log('    - ' + f);
}
process.exit(mal ? 1 : 0);
