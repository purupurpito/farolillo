// Genera los iconos PNG de la PWA a partir de assets/ui/faro.svg (pixel art 16x16) con Playwright.
//   assets/ui/icons/icon-192.png, icon-512.png            (purpose any: cuadrado redondeado, esquinas transparentes)
//   assets/ui/icons/icon-maskable-512.png                 (purpose maskable: a sangre, todo dentro del 80 % central)
//   assets/ui/icons/apple-touch-icon-180.png              (cuadrado sin transparencia; iOS redondea solo)
// Uso: node tools/iconos.mjs
// Dueño: PWA.

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import pngjs from 'pngjs';
const { PNG } = pngjs;

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(RAIZ, 'assets', 'ui', 'icons');

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

// tipo: 'any' (redondeado, esquinas transparentes) | 'maskable' (a sangre) | 'apple' (a sangre, opaco)
const ICONOS = [
  { archivo: 'icon-192.png', lado: 192, tipo: 'any' },
  { archivo: 'icon-512.png', lado: 512, tipo: 'any' },
  { archivo: 'icon-maskable-512.png', lado: 512, tipo: 'maskable' },
  { archivo: 'apple-touch-icon-180.png', lado: 180, tipo: 'apple' },
];

function pintar(svgUrl, iconos) {
  const cargar = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
  return cargar(svgUrl).then((img) => iconos.map(({ lado, tipo }) => {
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const g = c.getContext('2d');
    const FONDO = '#14213d';
    if (tipo === 'any') {
      const r = lado * 0.22;
      g.beginPath();
      g.roundRect(0, 0, lado, lado, r);
      g.fillStyle = FONDO; g.fill();
      g.clip();
    } else { g.fillStyle = FONDO; g.fillRect(0, 0, lado, lado); }
    // Zona segura: maskable dentro del círculo de radio 40 % (margen del 20 %); el resto, algo más grande.
    const zona = tipo === 'maskable' ? 0.8 : 0.92;
    const cx = lado / 2, cy = lado / 2;
    // Halo cálido del farol y disco algo más claro para que el contorno oscuro del faro se lea.
    const rDisco = lado * zona * 0.47;
    const grad = g.createRadialGradient(cx, cy - lado * 0.12, 0, cx, cy, rDisco);
    grad.addColorStop(0, '#ffe7a8'); grad.addColorStop(0.35, '#f2b45c'); grad.addColorStop(0.7, '#3d5a8f'); grad.addColorStop(1, '#2a4170');
    g.beginPath(); g.arc(cx, cy, rDisco, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
    // Faro: 16x16 con el dibujo entre y=1 y y=15 → escala entera para que el pixel art quede nítido.
    const escala = Math.max(1, Math.floor((rDisco * 1.5) / 14));
    const ancho = 16 * escala;
    const x = Math.round(cx - ancho / 2), y = Math.round(cy - ancho / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x, y, ancho, ancho);
    return c.toDataURL('image/png');
  }));
}

const pw = await cargarPlaywright();
const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const svg = await readFile(join(RAIZ, 'assets', 'ui', 'faro.svg'), 'utf8');
  // El SVG a tamaño grande para que el navegador lo rasterice sin suavizado.
  const svgGrande = svg.replace('<svg ', '<svg width="512" height="512" ');
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svgGrande).toString('base64');
  const datos = await page.evaluate(`(${pintar})(${JSON.stringify(url)}, ${JSON.stringify(ICONOS)})`);
  await mkdir(OUT, { recursive: true });
  for (let i = 0; i < ICONOS.length; i++) {
    let buf = Buffer.from(datos[i].split(',')[1], 'base64');
    // Los opacos (maskable y apple-touch-icon) se guardan sin canal alfa: iOS pinta de negro lo transparente.
    if (ICONOS[i].tipo !== 'any') buf = PNG.sync.write(PNG.sync.read(buf), { colorType: 2, inputHasAlpha: true });
    await writeFile(join(OUT, ICONOS[i].archivo), buf);
    console.log('escrito', ICONOS[i].archivo, ICONOS[i].lado + 'px');
  }
} finally { await browser.close(); }
