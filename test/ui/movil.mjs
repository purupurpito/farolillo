// Prueba de la versión móvil (lote layout). Perfiles de Playwright con isMobile/hasTouch:
//   iPhone SE (320x568, WebKit), iPhone 15 (WebKit), Pixel 7 y Galaxy S9+ (Chromium, 320 de ancho),
//   iPhone SE horizontal (568x320, WebKit) y 640x360 (Chromium).
// Recorre cala → recoger → formar → selector → ficha → ajustes y comprueba:
//   · atrás del sistema (page.goBack) cierra el modal o la capa de arriba y la URL sigue siendo la del juego;
//   · Escape y el gesto del borde izquierdo (?gesto=1, solo Chromium) también cierran la capa;
//   · #toast no pisa ningún .btn.prim / .btn.ok tras Recoger o Enviar;
//   · texto ≥ 13 px (≥ 14 en vertical salvo pestañas, hitos y celdas de la bitácora); input, select y textarea ≥ 16 px;
//   · .recurso sin desbordarse y sin pisar su icono con cifras largas (31,6K / 1.582 / 825);
//   · sin scroll horizontal; contraste de .btn.prim y .btn.ok ≥ 4,5:1 de día y de noche;
//   · con --sa-b: 34px, ningún botón final de capa, Formar o Ajustes cae en los últimos 34 px;
//   · en vertical, la tira de equipos de la cala avanzada se ve sin hacer scroll;
//   · los momentos se pasan tocando en cualquier sitio y «Saltar (n)» sale con más de uno en cola;
//   · ningún error de consola.
// Guarda capturas en test/ui/out/movil-*.png.
//
// Uso:  npx -y serve -l 8080 .   y   node test/ui/movil.mjs [--url http://localhost:8080/] [--solo "iPhone SE"]
// Navegadores: npx playwright install chromium webkit

import { existsSync } from 'node:fs';
import { readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

const pw = await cargarPlaywright();
const { devices } = pw;
const PERFILES = [
  { nombre: 'iPhone SE', motor: 'webkit', disp: devices['iPhone SE'] },
  { nombre: 'iPhone 15', motor: 'webkit', disp: devices['iPhone 15'] },
  { nombre: 'Pixel 7', motor: 'chromium', disp: devices['Pixel 7'] },
  { nombre: 'Galaxy S9+', motor: 'chromium', disp: devices['Galaxy S9+'] },
  { nombre: 'iPhone SE horizontal', motor: 'webkit', disp: devices['iPhone SE landscape'] },
  { nombre: '640x360', motor: 'chromium', disp: { ...devices['Pixel 7'], viewport: { width: 640, height: 360 }, screen: { width: 640, height: 360 }, deviceScaleFactor: 2 } },
].filter((p) => !SOLO || p.nombre === SOLO);

const INSTALAR_EXISTE = existsSync(join(RAIZ, 'js', 'ui', 'instalar.js'));

// ------------------------------------------------------------------ comprobaciones dentro de la página

/** Texto, campos, scroll, contraste y barra. Devuelve lista de fallos (texto). */
async function revisar(page, donde) {
  return page.evaluate((donde) => {
    const fallos = [];
    const vertical = innerHeight > innerWidth;
    const visible = (el) => {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    // Lo tapado por una capa o un modal no cuenta (solo se mira lo de arriba).
    const arriba = (() => {
      const m = [...document.querySelectorAll('#modales > .modal-fondo')].pop();
      if (m) return m;
      const c = [...document.querySelectorAll('#capas > .capa')].pop();
      return c || document.getElementById('app');
    })();
    // 1) Tamaño de texto
    const EXC_14 = '.tab, .hitos, .bit, .momento .contador';
    const chicos = new Set();
    const walker = document.createTreeWalker(arriba, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || !visible(el) || el.closest('.sr, option, script, style')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const min = vertical && !el.closest(EXC_14) ? 14 : 13;
      if (fs < min - 0.01) chicos.add(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}«${n.textContent.trim().slice(0, 18)}» ${fs}px`);
    }
    if (chicos.size) fallos.push(`${donde}: texto pequeño: ${[...chicos].slice(0, 5).join('; ')}`);
    // 2) Campos a 16 px (si no, iOS hace zoom al enfocarlos)
    for (const el of arriba.querySelectorAll('input:not([type=checkbox]):not([type=range]), select, textarea')) {
      if (!visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) fallos.push(`${donde}: ${el.tagName.toLowerCase()} «${el.getAttribute('aria-label') || ''}» a ${fs}px`);
    }
    // 2b) Avisos de la cala en una fila baja (un bloque grande dentro de la fila los estiraba en WebKit)
    for (const el of arriba.querySelectorAll('.aviso')) {
      if (visible(el) && el.getBoundingClientRect().height > 64) fallos.push(`${donde}: aviso «${el.textContent.trim().slice(0, 20)}» de ${Math.round(el.getBoundingClientRect().height)}px de alto`);
    }
    // 3) Scroll horizontal
    const sx = document.documentElement.scrollWidth - innerWidth;
    if (sx > 0) fallos.push(`${donde}: scroll horizontal de ${sx}px`);
    for (const el of document.querySelectorAll('#vista, .capa-cuerpo, .modal')) {
      if (el.scrollWidth - el.clientWidth > 1) fallos.push(`${donde}: desborda ${el.id || el.className}`);
    }
    // 4) Contraste de los botones de color
    const rgb = (s) => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : [0, 0, 0, 1]; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (const b of document.querySelectorAll('.btn.prim, .btn.ok, .btn:disabled')) {
      if (!visible(b)) continue;
      const st = getComputedStyle(b);
      const fondo = rgb(st.backgroundColor);
      if (fondo[3] === 0) continue;   // transparente: no aplica
      const r = ratio(rgb(st.color), fondo);
      if (r < 4.5) fallos.push(`${donde}: contraste ${r.toFixed(2)} en «${b.textContent.trim().slice(0, 20)}» (${st.color} sobre ${st.backgroundColor})`);
      if (Number(st.opacity) < 1) fallos.push(`${donde}: botón con opacity ${st.opacity}`);
    }
    return fallos;
  }, donde);
}

/** Solape (px²) entre #toast y los botones principales visibles. */
async function solapeToast(page) {
  return page.evaluate(() => {
    const t = document.getElementById('toast');
    if (!t || !t.children.length) return { hay: false, area: 0 };
    let area = 0;
    const que = [];
    for (const toastEl of t.children) {
      const a = toastEl.getBoundingClientRect();
      for (const b of document.querySelectorAll('.btn.prim, .btn.ok')) {
        const q = b.getBoundingClientRect();
        if (!q.width || !q.height) continue;
        const x = Math.min(a.right, q.right) - Math.max(a.left, q.left);
        const y = Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top);
        if (x > 0 && y > 0) { area += x * y; que.push(`«${toastEl.textContent.slice(0, 20)}» sobre «${b.textContent.trim().slice(0, 16)}»`); }
      }
    }
    return { hay: true, area, que, n: t.children.length };
  });
}

/** Con --sa-b: 34px, el último botón de la capa (desplazada al final) no cae en los últimos 34 px. */
async function margenSeguro(page, donde) {
  return page.evaluate(async (donde) => {
    document.documentElement.style.setProperty('--sa-b', '34px');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const capa = [...document.querySelectorAll('#capas > .capa')].pop();
    const cuerpo = capa && capa.querySelector('.capa-cuerpo');
    if (cuerpo) cuerpo.scrollTop = cuerpo.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const botones = [...(capa || document).querySelectorAll('.btn')].filter((b) => b.getBoundingClientRect().height > 0);
    let peor = null;
    for (const b of botones) {
      const r = b.getBoundingClientRect();
      if (r.top >= innerHeight) continue;   // fuera de la vista (más abajo): no es el final visible
      if (!peor || r.bottom > peor.r.bottom) peor = { r, t: b.textContent.trim().slice(0, 20) };
    }
    document.documentElement.style.removeProperty('--sa-b');
    if (!peor) return null;
    const limite = innerHeight - 34;
    return peor.r.bottom > limite + 0.5 ? `${donde}: «${peor.t}» acaba en ${Math.round(peor.r.bottom)} > ${limite} con --sa-b 34px` : null;
  }, donde);
}

// ------------------------------------------------------------------ recorrido

async function recorrer(browser, perfil) {
  const ctx = await browser.newContext({ ...perfil.disp, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const page = await ctx.newPage();
  const errores = [];
  const fallos = [];
  const info = {};
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errores.push(`HTTP ${r.status()}: ${r.url()}`); });
  const etiqueta = perfil.nombre.replace(/[^\w]+/g, '-');
  let n = 0;
  const foto = async (nombre, pausa = 300) => { await espera(pausa); await page.screenshot({ path: join(OUT, `movil-${etiqueta}-${String(++n).padStart(2, '0')}-${nombre}.png`) }); };
  const boton = (t) => page.getByRole('button', { name: t, exact: typeof t === 'string' }).first();
  const revisa = async (donde) => { fallos.push(...await revisar(page, `${perfil.nombre} ${donde}`)); };
  const url0 = `${URL_BASE}?test=1&nuevo=1&gesto=1&reloj=2026-11-18T10:00:00`;
  const urlJuego = () => page.url().split('#')[0];

  /** Atrás del sistema: comprueba que cierra `sel` (y no lo de debajo) y que la URL no cambia. */
  const atras = async (sel, donde, { quedaSel = null } = {}) => {
    const antes = urlJuego();
    const nAntes = await page.locator(sel).count();
    await page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => page.evaluate(() => history.back()));
    await espera(350);
    const nDespues = await page.locator(sel).count();
    if (nDespues >= nAntes) fallos.push(`${perfil.nombre} ${donde}: atrás no cerró ${sel} (${nAntes} → ${nDespues})`);
    if (urlJuego() !== antes) fallos.push(`${perfil.nombre} ${donde}: la URL cambió al ir atrás (${urlJuego()})`);
    if (quedaSel && !(await page.locator(quedaSel).count())) fallos.push(`${perfil.nombre} ${donde}: atrás cerró también ${quedaSel}`);
    if (!(await page.evaluate(() => !!window.__farolillo))) fallos.push(`${perfil.nombre} ${donde}: atrás salió de la página`);
  };

  /** Pasa los momentos tocando el fondo (no el botón) tras el bloqueo de 600 ms. */
  const pasarMomentos = async () => {
    for (let i = 0; i < 40 && await page.locator('[data-modal="momento"]').count(); i++) {
      await espera(650);
      await page.locator('[data-modal="momento"] .momento p').first().click({ force: true }).catch(() => {});
      await espera(120);
    }
  };

  await page.goto(url0);
  await page.waitForFunction(() => window.__farolillo && window.__farolillo.listo);
  await boton('Empezar').click();
  await page.locator('.guia[data-sp="0004"]').first().click();
  await boton('Seguir').click();
  await page.locator('.faro-btn[data-faro="norte"]').first().click();
  await boton('Encender el faro').click();
  await espera(500);
  await revisa('cala tutorial');

  // Recoger la expedición del tutorial → informe → atrás lo cierra («Seguir»)
  await page.evaluate(() => window.__farolillo.avanzar(70_000));
  await espera(200);
  await page.getByRole('button', { name: /Recoger todo/ }).first().click();
  await page.locator('[data-modal="informe"]').waitFor({ timeout: 3000 });
  await foto('informe');
  await revisa('informe');
  await atras('[data-modal="informe"]', 'informe');
  // Momento: se pasa tocando en cualquier parte (no el botón)
  if (await page.locator('[data-modal="momento"]').count()) {
    await foto('momento', 900);
    await revisa('momento');
    // Antes de 600 ms un toque no lo cierra (para no saltarlo sin verlo)…
    await espera(0);
    const t0 = await page.locator('[data-modal="momento"]').count();
    await pasarMomentos();
    if (await page.locator('[data-modal="momento"]').count()) fallos.push(`${perfil.nombre}: tocar el momento no lo cierra`);
    info.momentosTocados = t0;
  }

  // «Saltar (n)» con varios en cola: router.modal con restantes
  const salto = await page.evaluate(async () => {
    const f = window.__farolillo;
    const s = f.app.save;
    const sp = s.pokemon[0].sp;
    const p = f.app.router.modal('momento', { momento: { tipo: 'hito', sp, texto: 'Prueba de cola' }, restantes: 2 }, { oscuro: true });
    await new Promise((r) => setTimeout(r, 100));
    const cab = document.querySelector('[data-modal="momento"] .momento-cab');
    const txt = cab ? cab.textContent : '';
    const b = cab && [...cab.querySelectorAll('button')].find((x) => /Saltar/.test(x.textContent));
    if (b) b.click();
    const v = await Promise.race([p, new Promise((r) => setTimeout(() => r('sin-cerrar'), 1500))]);
    return { txt, v };
  });
  info.saltar = salto;
  if (!/1\/3/.test(salto.txt) || !/Saltar \(2\)/.test(salto.txt)) fallos.push(`${perfil.nombre}: no sale «1/3 · Saltar (2)» (${salto.txt})`);
  if (salto.v !== 'saltar') fallos.push(`${perfil.nombre}: «Saltar» devolvió ${salto.v}`);
  // Con un solo momento no hay «Saltar»; tocar antes de 600 ms no cierra y después sí.
  const toque = await page.evaluate(async () => {
    const f = window.__farolillo;
    const sp = f.app.save.pokemon[0].sp;
    let cerrado = null;
    f.app.router.modal('momento', { momento: { tipo: 'hito', sp, texto: 'Solo uno' }, restantes: 0 }, { oscuro: true }).then((v) => { cerrado = v; });
    await new Promise((r) => setTimeout(r, 60));
    const fondo = document.querySelector('[data-modal="momento"]');
    const saltar = !!fondo.querySelector('.momento-cab');
    fondo.click();
    await new Promise((r) => setTimeout(r, 60));
    const pronto = cerrado;
    await new Promise((r) => setTimeout(r, 650));
    document.querySelector('[data-modal="momento"] .escena').click();
    await new Promise((r) => setTimeout(r, 60));
    return { saltar, pronto, despues: cerrado };
  });
  info.toque = toque;
  if (toque.saltar) fallos.push(`${perfil.nombre}: «Saltar» sale con un solo momento`);
  if (toque.pronto !== null) fallos.push(`${perfil.nombre}: el momento se cerró con un toque antes de 600 ms`);
  if (toque.despues !== true) fallos.push(`${perfil.nombre}: tocar la escena no pasó el momento (${toque.despues})`);
  await pasarMomentos();

  // Enviar a todos: el toast no pisa botones principales
  const enviar = page.getByRole('button', { name: 'Enviar a todos' }).first();
  if (await enviar.isEnabled().catch(() => false)) {
    await enviar.click();
    for (const ms of [40, 250, 700]) {
      await espera(ms);
      const s = await solapeToast(page);
      if (s.area > 0) fallos.push(`${perfil.nombre}: tras Enviar el toast pisa ${s.que.join(', ')}`);
      if (s.n > 2) fallos.push(`${perfil.nombre}: ${s.n} toasts a la vez`);
    }
    await foto('toast-enviar', 0);
  } else fallos.push(`${perfil.nombre}: «Enviar a todos» deshabilitado tras el tutorial`);

  // Partida avanzada
  await page.evaluate(() => window.__farolillo.jugar(14, 3 * 3600_000));
  await pasarMomentos();
  await page.locator('#tabs .tab[data-tab="cala"]').click();
  await espera(300);
  // Equipos fuera y alguno de vuelta: la tira debe verse sin scroll (en vertical)
  await page.evaluate(() => { const f = window.__farolillo; f.app.game.enviarTodos(f.app.save, f.app.ctx()); f.app.guardar(true); f.avanzar(60_000); });
  await espera(400);
  const tira = await page.evaluate(() => {
    const v = document.getElementById('vista'); v.scrollTop = 0;
    const t = document.querySelector('.tira-eq');
    if (!t) return { existe: false };
    const r = t.getBoundingClientRect();
    const st = getComputedStyle(t);
    return { existe: true, texto: t.textContent, top: r.top, bottom: r.bottom, alto: innerHeight, oculta: st.display === 'none' };
  });
  info.tira = tira;
  const vertical = (perfil.disp.viewport.height > perfil.disp.viewport.width);
  if (vertical) {
    if (!tira.existe || tira.oculta || !tira.texto) fallos.push(`${perfil.nombre}: no hay tira de equipos en la cala`);
    else if (tira.bottom > tira.alto || tira.top < 0) fallos.push(`${perfil.nombre}: la tira de equipos no se ve sin scroll (${Math.round(tira.top)}-${Math.round(tira.bottom)} de ${tira.alto})`);
  }
  // Cifras largas en la barra: ni desbordan ni pisan su icono
  const barra = await page.evaluate(async () => {
    const vals = { 'r-monedas': '31,6K', 'r-bayas': '1.582', 'r-objetos': '825' };
    for (const [id, v] of Object.entries(vals)) document.getElementById(id).textContent = v;
    await new Promise((r) => requestAnimationFrame(r));
    const mal = [];
    let finAnterior = -1;
    for (const r of document.querySelectorAll('#barra .recurso')) {
      const img = r.querySelector('img').getBoundingClientRect();
      const num = r.querySelector('span').getBoundingClientRect();
      if (r.scrollWidth > r.clientWidth + 0.5) mal.push(`${r.title} desborda (${r.scrollWidth}>${r.clientWidth})`);
      if (num.left < img.right - 0.5) mal.push(`${r.title}: la cifra pisa el icono`);
      const rr = r.getBoundingClientRect();
      if (rr.left < finAnterior - 0.5) mal.push(`${r.title} pisa al anterior`);
      finAnterior = rr.right;
    }
    const menu = document.getElementById('b-menu').getBoundingClientRect();
    if (menu.left < finAnterior - 0.5) mal.push('el último recurso pisa el botón de menú');
    if (menu.right > innerWidth + 0.5) mal.push('el menú se sale de la pantalla');
    return mal;
  });
  for (const m of barra) fallos.push(`${perfil.nombre} barra: ${m}`);
  await foto('cala-avanzada', 500);
  await revisa('cala avanzada');
  // Recoger: toast o informe, sin pisar botones
  await page.evaluate(() => window.__farolillo.avanzar(9 * 3600_000));
  await espera(300);
  const recoger = page.getByRole('button', { name: /Recoger todo/ }).first();
  if (await recoger.isEnabled().catch(() => false)) {
    await recoger.click();
    for (const ms of [40, 300]) {
      await espera(ms);
      const s = await solapeToast(page);
      if (s.area > 0) fallos.push(`${perfil.nombre}: tras Recoger el toast pisa ${s.que.join(', ')}`);
    }
    if (await page.locator('[data-modal="informe"]').count()) {
      await foto('informe-avanzado', 200);
      await revisa('informe avanzado');
      // Eventos resumidos en una línea desplegable
      const det = await page.locator('[data-modal="informe"] details.eventos').count();
      info.eventosPlegados = det;
      await boton('Seguir').click();
    }
    await pasarMomentos();
  }

  // Formar → selector → atrás (cierra el selector, no Formar) → atrás (cierra Formar)
  await page.locator('#tabs .tab[data-tab="expediciones"]').click();
  await espera(300);
  await foto('expediciones', 200);
  await revisa('expediciones');
  const formar = page.getByRole('button', { name: /Formar equipo/ }).first();
  if (await formar.count()) {
    await formar.click();
    await page.locator('.capa[data-capa="formar"]').waitFor();
    await foto('formar', 900);
    await revisa('formar');
    const m = await margenSeguro(page, `${perfil.nombre} formar`);
    if (m) fallos.push(m);
    await page.locator('.formar .hueco .miembro').first().click();
    await page.locator('[data-modal="selector"]').waitFor();
    await foto('selector', 900);
    await revisa('selector');
    await atras('[data-modal="selector"]', 'selector', { quedaSel: '.capa[data-capa="formar"]' });
    await atras('.capa[data-capa="formar"]', 'formar');
  } else fallos.push(`${perfil.nombre}: no hay «Formar equipo»`);

  // Ficha (créditos con zona táctil ≥ 44 px) → Escape / gesto / atrás
  await page.locator('#tabs .tab[data-tab="gremio"]').click();
  await espera(400);
  await page.locator('.fila-mon').first().click();
  await page.locator('.capa[data-capa="ficha"]').waitFor();
  await foto('ficha', 900);
  await revisa('ficha');
  const cred = await page.evaluate(() => [...document.querySelectorAll('.creditos-ficha a')].map((a) => Math.round(a.getBoundingClientRect().height)));
  if (cred.some((x) => x < 44)) fallos.push(`${perfil.nombre}: enlaces de créditos de ${Math.min(...cred)} px de alto`);
  const m2 = await margenSeguro(page, `${perfil.nombre} ficha`);
  if (m2) fallos.push(m2);
  await atras('.capa[data-capa="ficha"]', 'ficha');
  // Escape (escritorio) cierra la capa
  await page.locator('.fila-mon').first().click();
  await page.locator('.capa[data-capa="ficha"]').waitFor();
  await page.keyboard.press('Escape');
  await espera(350);
  if (await page.locator('.capa[data-capa="ficha"]').count()) fallos.push(`${perfil.nombre}: Escape no cerró la ficha`);
  // Gesto desde el borde izquierdo (?gesto=1). WebKit no deja crear Touch a mano: solo en Chromium.
  if (perfil.motor === 'chromium') {
    await page.locator('.fila-mon').first().click();
    await page.locator('.capa[data-capa="ficha"]').waitFor();
    await page.evaluate(() => {
      const el = document.querySelector('.capa-cuerpo');
      const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(8)], changedTouches: [t(8)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(120)], bubbles: true }));
    });
    await espera(350);
    if (await page.locator('.capa[data-capa="ficha"]').count()) fallos.push(`${perfil.nombre}: el gesto del borde no cerró la ficha`);
  }
  // Tras tantas idas y vueltas el historial sigue cuadrando: sin capas, history.state en la base.
  await espera(300);
  const pila = await page.evaluate(() => ({ estado: history.state, capas: document.querySelectorAll('#capas > .capa').length, modales: document.querySelectorAll('#modales > .modal-fondo').length }));
  if (pila.capas || pila.modales || (pila.estado && pila.estado.farolillo)) fallos.push(`${perfil.nombre}: historial descuadrado ${JSON.stringify(pila)}`);

  // Ajustes: campos a 16 px, «Exportar» sin enfocar el textarea, último botón fuera del safe area
  await page.locator('#b-menu').click();
  await page.locator('.capa[data-capa="ajustes"]').waitFor();
  await boton('Exportar').click();
  await espera(300);
  const foco = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  if (foco === 'TEXTAREA') fallos.push(`${perfil.nombre}: Exportar enfoca el textarea`);
  await boton('Ver').click().catch(() => {});
  await foto('ajustes', 300);
  await revisa('ajustes');
  const m3 = await margenSeguro(page, `${perfil.nombre} ajustes`);
  if (m3) fallos.push(m3);
  await foto('ajustes-final', 100);
  // Créditos encima de Ajustes: atrás cierra solo Créditos
  await boton('Créditos y licencias').click();
  await page.locator('.capa[data-capa="creditos"]').waitFor();
  await atras('.capa[data-capa="creditos"]', 'créditos', { quedaSel: '.capa[data-capa="ajustes"]' });
  // irTab con dos capas abiertas deja la pila coherente
  await boton('Créditos y licencias').click();
  await page.locator('.capa[data-capa="creditos"]').waitFor();
  await page.evaluate(() => window.__farolillo.app.router.irTab('cala'));
  await espera(500);
  const pila2 = await page.evaluate(() => ({ estado: history.state, capas: document.querySelectorAll('#capas > .capa').length }));
  if (pila2.capas || (pila2.estado && pila2.estado.farolillo)) fallos.push(`${perfil.nombre}: irTab deja el historial descuadrado ${JSON.stringify(pila2)}`);

  // Noche: contraste de los botones de color
  await page.evaluate(() => { document.documentElement.dataset.tema = 'noche'; });
  await espera(100);
  await revisa('cala de noche');
  await foto('cala-noche', 200);

  await ctx.close();
  const filtrados = [...new Set(errores)].filter((e) => INSTALAR_EXISTE || !/instalar\.js/.test(e));
  return { nombre: perfil.nombre, errores: filtrados, fallos: [...new Set(fallos)], info };
}

await mkdir(OUT, { recursive: true });
const navegadores = {};
let mal = 0;
for (const p of PERFILES) {
  navegadores[p.motor] = navegadores[p.motor] || await pw[p.motor].launch();
  let r;
  try { r = await recorrer(navegadores[p.motor], p); } catch (e) { r = { nombre: p.nombre, errores: [String(e.stack || e)], fallos: ['el recorrido se detuvo'], info: {} }; }
  console.log(`\n== ${r.nombre} (${p.motor} ${p.disp.viewport.width}x${p.disp.viewport.height})`);
  console.log('  ' + JSON.stringify(r.info));
  for (const e of r.errores) { console.log('  ERROR consola:', e); mal++; }
  for (const f of r.fallos) { console.log('  FALLO:', f); mal++; }
}
for (const b of Object.values(navegadores)) await b.close();
console.log(mal ? `\n${mal} problemas.` : '\nOK: atrás, toasts, texto, campos, barra, contraste, safe area, tira de equipos y momentos en los 6 perfiles.');
process.exit(mal ? 1 : 0);
