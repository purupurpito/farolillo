// sprites.js — dueño: GRÁFICOS.
// Lee assets/manifest.json (SPEC §3.6), carga cada PNG a demanda y dibuja frames
// de PMDCollab con pixel-art nítido (sin suavizado, coordenadas enteras).
//
// Convenciones:
//  - Direcciones: 0 abajo, 2 derecha, 6 izquierda (el resto cae en la más cercana de esas).
//    Si falta la 6 se dibuja la 2 en espejo (y al revés). Una animación de una sola fila
//    (p. ej. Sleep) usa esa fila para cualquier dirección.
//  - Duraciones `d` en ticks de 1/60 s.
//  - Anclaje (§10): el centro del frame se dibuja sobre el punto de suelo (x, y) + AJUSTE_Y;
//    la sombra es una elipse centrada en (x, y).

/** Ajuste vertical fino del sprite respecto al punto de suelo (px de sprite). */
export const AJUSTE_Y = -4;
const RADIO_SOMBRA = [5, 8, 12];
const ANIMS_RESPALDO = {
  Attack: ['Idle'], Sleep: ['Idle'], Hop: ['Idle'], Faint: ['Hurt', 'Idle'],
  Hurt: ['Idle'], Walk: ['Idle'], Idle: ['Walk'],
};

let base = './assets/';
let manifest = null;
let creditos = null;
const imgs = new Map();          // clave -> { img, ok, error, promesa }
const siluetas = new Map();      // clave -> canvas negro
const oyentes = new Set();       // se llaman cuando termina de cargar una imagen

/**
 * Lee el manifest y los créditos. `opts.manifest` / `opts.creditos` permiten inyectarlos (pruebas).
 * Se puede llamar más de una vez (cambia la base).
 */
export async function iniciar(baseAssets = './assets/', opts = {}) {
  base = baseAssets.endsWith('/') ? baseAssets : baseAssets + '/';
  imgs.clear(); siluetas.clear();
  manifest = opts.manifest || await leerJson(base + 'manifest.json');
  if (!manifest || !manifest.esp) throw new Error('No se pudo leer el manifest de sprites.');
  creditos = opts.creditos !== undefined ? opts.creditos : await leerJson(base + 'creditos.json').catch(() => null);
}

async function leerJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo cargar ' + url);
  return r.json();
}

/** Manifest cargado (solo lectura). */
export function manifestCargado() { return manifest; }

/** Lista de especies del manifest. */
export function especies() { return manifest ? Object.keys(manifest.esp) : []; }

function entrada(sp, vr) {
  const e = manifest && manifest.esp[sp];
  if (!e) return null;
  if (vr && e.vario) return { a: e.vario.a, p: e.vario.p, ss: e.ss, vr: true };
  return { a: e.a, p: e.p, ss: e.ss, vr: false };
}

export function tieneAnim(sp, anim, vr = false) {
  const e = entrada(sp, vr);
  return !!(e && e.a[anim]);
}

/** Animaciones disponibles de una especie, en orden fijo. */
export function animaciones(sp, vr = false) {
  const e = entrada(sp, vr);
  if (!e) return [];
  const orden = ['Idle', 'Walk', 'Attack', 'Hurt', 'Sleep', 'Hop', 'Faint'];
  const ks = Object.keys(e.a);
  return orden.filter(k => ks.includes(k)).concat(ks.filter(k => !orden.includes(k)));
}

/** Attack→Idle; Sleep→Idle; Hop→Idle; Faint→Hurt→Idle. Devuelve null si la especie no existe. */
export function animConRespaldo(sp, deseada, vr = false) {
  const e = entrada(sp, vr);
  if (!e) return null;
  if (e.a[deseada]) return deseada;
  for (const r of (ANIMS_RESPALDO[deseada] || ['Idle'])) if (e.a[r]) return r;
  return e.a.Idle ? 'Idle' : Object.keys(e.a)[0] || null;
}

function urlAnim(sp, anim, vr) { return `${base}pmd/${sp}/${vr ? 'v/' : ''}${anim}.png`; }

/** Cada imagen se pide una sola vez. Devuelve el registro { img, ok, error, promesa }. */
function pedir(url) {
  let r = imgs.get(url);
  if (r) return r;
  r = { img: null, ok: false, error: false, promesa: null };
  imgs.set(url, r);
  if (typeof Image === 'undefined') { r.error = true; r.promesa = Promise.resolve(r); return r; }
  const img = new Image();
  r.img = img;
  r.promesa = new Promise(res => {
    img.onload = () => { r.ok = true; res(r); avisar(url); };
    img.onerror = () => { r.error = true; res(r); avisar(url); };
  });
  img.decoding = 'async';
  img.src = url;
  return r;
}

function avisar(url) { for (const fn of oyentes) { try { fn(url); } catch (e) { console.error(e); } } }

/** Suscribirse a «ha terminado de cargar una imagen» (para redibujar). Devuelve la baja. */
export function alCargar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

export async function precargar(sp, anims = ['Idle'], vr = false) {
  const e = entrada(sp, vr);
  if (!e) return;
  const ps = [];
  for (const a of anims) {
    const real = animConRespaldo(sp, a, e.vr);
    if (real) ps.push(pedir(urlAnim(sp, real, e.vr)).promesa);
  }
  await Promise.all(ps);
}

/** ¿Están ya cargadas (o fallidas) todas esas animaciones? */
export function listo(sp, anims = ['Idle'], vr = false) {
  const e = entrada(sp, vr);
  if (!e) return true;
  return anims.every(a => {
    const real = animConRespaldo(sp, a, e.vr);
    const r = real && imgs.get(urlAnim(sp, real, e.vr));
    return !real || (r && (r.ok || r.error));
  });
}

/** Índice de frame y tiempo restante del frame para un instante (ms) en bucle. */
export function frameEn(info, tMs, bucle = true) {
  const d = info.d;
  let total = 0;
  for (const x of d) total += x;
  let tick = Math.floor(tMs * 60 / 1000);
  if (bucle) tick = ((tick % total) + total) % total;
  else if (tick >= total) return d.length - 1;
  for (let i = 0; i < d.length; i++) { if (tick < d[i]) return i; tick -= d[i]; }
  return d.length - 1;
}

/** Índice del frame que se vería en tMs (con respaldo de animación); -1 si no existe. */
export function indiceFrame(sp, anim, vr, tMs, bucle = true) {
  const e = entrada(sp, vr);
  const real = e && animConRespaldo(sp, anim, e.vr);
  if (!real) return -1;
  return frameEn(e.a[real], tMs, bucle);
}

export function hitFrame(sp, anim, vr = false) {
  const e = entrada(sp, vr);
  const a = e && e.a[anim];
  return a && a.hit != null ? a.hit : null;
}

/** ms de un ciclo. */
export function duracionAnim(sp, anim, vr = false) {
  const e = entrada(sp, vr);
  const real = e && animConRespaldo(sp, anim, e.vr);
  if (!real) return 0;
  return e.a[real].d.reduce((s, x) => s + x, 0) * 1000 / 60;
}

/** ms desde el inicio del ciclo hasta el frame de golpe (o la mitad si no hay). */
export function msHasta(sp, anim, vr = false) {
  const e = entrada(sp, vr);
  const real = e && animConRespaldo(sp, anim, e.vr);
  if (!real) return 0;
  const a = e.a[real];
  const hit = a.hit != null ? a.hit : Math.floor(a.d.length / 2);
  let s = 0;
  for (let i = 0; i < hit && i < a.d.length; i++) s += a.d[i];
  return s * 1000 / 60;
}

/** Fila de la PNG recortada y si hay que espejar, para una dirección pedida. */
function filaDir(info, dir) {
  const r = info.r;
  if (r.length === 1) return { fila: 0, espejo: false };
  let d = dir;
  if (d === 1 || d === 3) d = 2; else if (d === 5 || d === 7) d = 6; else if (d === 4) d = 0;
  let i = r.indexOf(d);
  if (i >= 0) return { fila: i, espejo: false };
  if (d === 6 && (i = r.indexOf(2)) >= 0) return { fila: i, espejo: true };
  if (d === 2 && (i = r.indexOf(6)) >= 0) return { fila: i, espejo: true };
  i = r.indexOf(0);
  return { fila: i >= 0 ? i : 0, espejo: false };
}

function silueta(url, img) {
  let c = siluetas.get(url);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  siluetas.set(url, c);
  return c;
}

/** Medidas del frame (en px de sprite) de una animación, o null. */
export function medidas(sp, anim, vr = false) {
  const e = entrada(sp, vr);
  const real = e && animConRespaldo(sp, anim, e.vr);
  if (!real) return null;
  const a = e.a[real];
  return { fw: a.fw, fh: a.fh, ss: e.ss, frames: a.d.length };
}

/**
 * Dibuja un frame. Devuelve true si dibujó el sprite (false si aún no ha cargado: lo pide).
 * Opciones:
 *  sp, vr, anim, dir (0|2|6), tMs (tiempo de la animación), x, y (punto de suelo en px del ctx),
 *  escala (entera; por defecto 1), silueta (negro), espejo (fuerza espejo extra),
 *  sombra (true por defecto), frame (fuerza un índice), bucle (true), alfa (1).
 */
export function dibujar(ctx, o) {
  const e = entrada(o.sp, o.vr);
  if (!e) return false;
  const anim = animConRespaldo(o.sp, o.anim || 'Idle', e.vr);
  if (!anim) return false;
  const info = e.a[anim];
  const esc = Math.max(1, Math.round(o.escala || 1));
  const x = Math.round(o.x), y = Math.round(o.y);
  if (o.sombra !== false) {
    const rx = RADIO_SOMBRA[e.ss != null ? e.ss : 1] * esc;
    ctx.save();
    ctx.globalAlpha = (o.alfa != null ? o.alfa : 1) * (o.silueta ? 0.5 : 1);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, Math.max(1, Math.round(rx * 0.45)), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const url = urlAnim(o.sp, anim, e.vr);
  const reg = pedir(url);
  if (!reg.ok) {
    // Mientras llega la PNG pedida (Hop al tocar, cambio de animación…) se pinta Idle si ya está: el sprite
    // nunca desaparece dejando solo la sombra.
    if (anim !== 'Idle' && e.a.Idle) {
      const ri = imgs.get(urlAnim(o.sp, 'Idle', e.vr));
      if (ri && ri.ok) return dibujar(ctx, { ...o, anim: 'Idle', sombra: false });
    }
    return false;
  }
  const f = o.frame != null ? Math.min(o.frame, info.d.length - 1) : frameEn(info, o.tMs || 0, o.bucle !== false);
  const { fila, espejo } = filaDir(info, o.dir || 0);
  const mirar = espejo !== !!o.espejo;
  const src = o.silueta ? silueta(url, reg.img) : reg.img;
  const w = info.fw * esc, h = info.fh * esc;
  const cx = x, cy = y + AJUSTE_Y * esc;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (o.alfa != null) ctx.globalAlpha = o.alfa;
  if (mirar) {
    ctx.translate(cx, 0); ctx.scale(-1, 1);
    ctx.drawImage(src, f * info.fw, fila * info.fh, info.fw, info.fh, Math.round(-w / 2), Math.round(cy - h / 2), w, h);
  } else {
    ctx.drawImage(src, f * info.fw, fila * info.fh, info.fw, info.fh, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  }
  ctx.restore();
  return true;
}

/** URL del retrato con respaldo: emoción pedida → Normal (de la misma variante) → normal. */
export function urlRetrato(sp, emocion = 'Normal', vr = false) {
  const m = manifest && manifest.esp[sp];
  if (!m) return '';
  if (vr && m.vario && m.vario.p && m.vario.p.length) {
    const p = m.vario.p;
    if (p.includes(emocion)) return `${base}pmd/${sp}/v/p/${emocion}.png`;
    if (p.includes('Normal')) return `${base}pmd/${sp}/v/p/Normal.png`;
  }
  const p = m.p || [];
  const emo = p.includes(emocion) ? emocion : 'Normal';
  return `${base}pmd/${sp}/p/${emo}.png`;
}

/** URL de lo que hace falta de una especie para jugar sin conexión: retrato Normal y las animaciones de las escenas. */
export function urlsEsenciales(sp, vr = false) {
  const e = entrada(sp, vr);
  if (!e) return [];
  const urls = [urlRetrato(sp, 'Normal', e.vr)];
  for (const a of ['Idle', 'Walk', 'Hop', 'Sleep', 'Attack', 'Hurt']) {
    const real = animConRespaldo(sp, a, e.vr);
    if (real) urls.push(urlAnim(sp, real, e.vr));
  }
  return [...new Set(urls.filter(Boolean))].map((u) => new URL(u, location.href).href);
}

/** Imagen de retrato (cacheada) para dibujar en canvas; null si aún no ha cargado. */
export function imagenRetrato(sp, emocion = 'Normal', vr = false) {
  const url = urlRetrato(sp, emocion, vr);
  if (!url) return null;
  const r = pedir(url);
  return r.ok ? r.img : null;
}

/**
 * Créditos de una especie (§3.7, §14): { sprite: [{n, url, lic}], retrato: [...] }
 * para la variante pedida. Vacío si no hay creditos.json.
 */
export function creditosDe(sp, vr = false) {
  const c = creditos && creditos.esp && creditos.esp[sp];
  const res = { sprite: [], retrato: [] };
  if (!c) return res;
  const art = (creditos.artistas) || {};
  const map = l => (l || []).map(x => ({ id: x.a, n: (art[x.a] && art[x.a].n) || x.a, url: (art[x.a] && art[x.a].url) || '', lic: x.lic }));
  res.sprite = map(vr && c.vSprite && c.vSprite.length ? c.vSprite : c.sprite);
  res.retrato = map(vr && c.vRetrato && c.vRetrato.length ? c.vRetrato : c.retrato);
  return res;
}

/**
 * Prepara un canvas para pixel-art. El búfer mide lo que mide el MUNDO en px de sprite (no la pantalla):
 * S = escala entera en px de dispositivo por px de sprite (`escalaCss` 2 o 3 según §10, × devicePixelRatio,
 * redondeada) y búfer ≈ (CSS × DPR) / S. El navegador lo amplía al tamaño CSS con `image-rendering: pixelated`
 * (que se pone aquí en el style del canvas; `crisp-edges` de respaldo). Se pinta con setTransform(1): un px
 * del contexto es un px de sprite. Así el búfer pesa S² veces menos (≈ 50 KB en vez de 3,3 MB en DPR 3) y
 * cada frame mueve S² veces menos píxeles.
 * Devuelve { S, w, h, dpr, cssW, cssH, k, ctx }: w y h = mundo visible en px de sprite (= búfer),
 * k = px CSS por px de sprite (para convertir toques y colocar la capa de texto).
 */
export function prepararCanvas(canvas, escalaCss, pxDispositivo = null) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  // Se mide la caja de contenido (sin borde ni relleno): el búfer se estira sobre ella.
  const caja = cajaContenido(canvas);
  const cssW = Math.max(1, caja.w), cssH = Math.max(1, caja.h);
  const e = escalaCss || (cssH >= 240 ? 3 : 2);
  const S = Math.max(1, Math.round(e * dpr));
  // Con ResizeObserver «device-pixel-content-box» se usa el tamaño exacto en px de dispositivo, salvo que no
  // cuadre con CSS × DPR (algunos emuladores lo dan en px CSS): entonces se calcula.
  const cuadra = (v, css) => v && Math.abs(v - css * dpr) <= Math.max(2, dpr * 2);
  const pw = Math.max(1, cuadra(pxDispositivo && pxDispositivo.w, cssW) ? pxDispositivo.w : Math.round(cssW * dpr));
  const ph = Math.max(1, cuadra(pxDispositivo && pxDispositivo.h, cssH) ? pxDispositivo.h : Math.round(cssH * dpr));
  // Redondeo al más cercano: el factor real (pw / w) queda a menos de medio px de sprite de S en toda la
  // anchura; con pixelated eso es, como mucho, una columna de 1 px de dispositivo más cada ~2·w px.
  const w = Math.max(1, Math.round(pw / S)), h = Math.max(1, Math.round(ph / S));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ponerPixelado(canvas);
  canvas._pxS = S;   // px de dispositivo por px de búfer: para que Compartir amplíe la imagen (fx.capturaCompartir)
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return { S, w, h, dpr, cssW, cssH, k: cssW / w, ctx };
}

/** image-rendering inline (app.css también lo pone a los canvas, pero el escalado depende de esto). */
function ponerPixelado(canvas) {
  const st = canvas.style;
  if (!st || canvas._pixelado) return;
  canvas._pixelado = true;
  st.imageRendering = 'crisp-edges';           // Firefox antiguo
  st.imageRendering = 'pixelated';             // Chrome, Safari, Firefox (si no lo entiende, se queda el anterior)
}

/**
 * Capa DOM encima del canvas para lo que tiene que verse nítido a px CSS (globo de la cala, números y texto del
 * combate). Es un <div class="capa-escena"> hermano del canvas, en absoluto y sin eventos, que se coloca sobre la
 * caja de contenido del canvas midiendo los dos rectángulos (vale con cualquier contenedor posicionado).
 * Se crea solo cuando hace falta (la cala sin globos no tiene capa) y se quita al destruir la escena.
 */
export function capaDom(canvas) {
  let el = null;
  const capa = {
    get el() {
      if (!el) {
        el = document.createElement('div');
        el.className = 'capa-escena';
        el.setAttribute('aria-hidden', 'true');
        Object.assign(el.style, {
          position: 'absolute', left: '0px', top: '0px', width: '0px', height: '0px', margin: '0', padding: '0',
          pointerEvents: 'none', overflow: 'hidden', zIndex: '1', contain: 'layout style',
        });
        canvas.after(el);
      }
      return el;
    },
    get existe() { return !!el; },
    /** Recoloca la capa sobre el canvas. Barato: dos getBoundingClientRect, solo mientras tiene contenido. */
    sincronizar() {
      if (!el) return;
      if (!canvas.isConnected) { el.remove(); return; }
      if (el.previousSibling !== canvas) canvas.after(el);
      const rc = canvas.getBoundingClientRect();
      if (!rc.width || !rc.height) { el.style.display = 'none'; return; }
      if (el.style.display === 'none') el.style.display = '';
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (el._w !== cw) { el.style.width = cw + 'px'; el._w = cw; }
      if (el._h !== ch) { el.style.height = ch + 'px'; el._h = ch; }
      const ro = el.getBoundingClientRect();
      const dx = rc.left + canvas.clientLeft - ro.left, dy = rc.top + canvas.clientTop - ro.top;
      if (Math.abs(dx) > 0.25 || Math.abs(dy) > 0.25) {
        el._x = (el._x || 0) + dx; el._y = (el._y || 0) + dy;
        el.style.left = el._x + 'px'; el.style.top = el._y + 'px';
      }
    },
    quitar() { if (el) el.remove(); el = null; },
  };
  return capa;
}

/** Caja de contenido de un elemento en px CSS (sin borde ni relleno), con decimales. */
export function cajaContenido(el) {
  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
  let w = rect.width || el.clientWidth || el.width || 0;
  let h = rect.height || el.clientHeight || el.height || 0;
  if (typeof getComputedStyle !== 'undefined' && rect.width) {
    const cs = getComputedStyle(el);
    const n = (v) => parseFloat(v) || 0;
    w -= n(cs.borderLeftWidth) + n(cs.borderRightWidth) + n(cs.paddingLeft) + n(cs.paddingRight);
    h -= n(cs.borderTopWidth) + n(cs.borderBottomWidth) + n(cs.paddingTop) + n(cs.paddingBottom);
  }
  return { w, h };
}

/** true si el usuario pide menos movimiento (sistema o `document.documentElement.dataset.reducirAnim`). */
export function reducirAnim() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reducirAnim === '1') return true;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Motor común de escenas (lo usan scene-cala, scene-combate y scene-ficha).
// El bucle de verdad es uno solo en main.js, que llama a escena.render(t). Para
// páginas sueltas (demo) se puede pasar `opciones.autoBucle = true`.

export const FPS_FRAMES = 15;
const PASO_MS = 1000 / FPS_FRAMES;
// Holgura del paso: el bucle de main.js despierta ~cada 66 ms con algo de jitter de vsync; si llega un poco antes
// del paso siguiente, se pinta igual (si no, se saltaría un frame y quedaría a 7,5 fps). Con un rAF a 60 Hz
// (autoBucle, solo páginas sueltas) pinta cada 3 frames.
const HOLGURA_MS = 20;

// Bucle de main.js: render() marca que alguna escena visible quiere frames; si en una vuelta ninguna lo marca
// (oculta, fuera de pantalla, parada), main.js deja de pedir frames. Una escena que vuelve a verse lo despierta.
let quiereFrames = false;
let despertador = null;
/** Devuelve si alguna escena pidió frames desde la última llamada (y lo pone a false). Para main.js. */
export function consumirFrames() { const q = quiereFrames; quiereFrames = false; return q; }
/** main.js registra aquí su pedirFrame: se llama cuando una escena vuelve a ser visible. */
export function alDespertar(fn) { despertador = fn; }
function despertar() { if (despertador) { try { despertador(); } catch (e) { console.error(e); } } }

/**
 * impl = {
 *   medir(dim)                 // tras cada cambio de tamaño
 *   paso(t, dt) -> firma       // avanza la lógica; si la firma no cambia, no se redibuja
 *   pintar(ctx, dim, t)        // dibuja (ctx con setTransform(1): 1 px = 1 px de sprite = 1 px del búfer)
 *   tocar?(x, y, ev)           // toque en coordenadas de pantalla en px de sprite
 *   arrastrar?(dx)             // desplazamiento horizontal en px de sprite (positivo = dedo a la derecha)
 *   escalaCss?()               // 2 o 3; por defecto según alto (§10)
 * }
 * El texto que deba verse nítido va en la capa DOM: motor.capa (ver capaDom), en px CSS = px de sprite × dim.k.
 */
export function motorEscena(canvas, opciones = {}, impl) {
  let activo = false, destruido = false, raf = 0;
  let ultimoT = -Infinity, ultimaFirma = null, sucio = true, tAnterior = 0;
  let dim = null;
  let visible = true;   // IntersectionObserver: fuera de pantalla no se pinta (ni se piden frames)
  const fnsTocar = new Set();
  const capa = capaDom(canvas);

  let pxDisp = null;   // tamaño exacto en px de dispositivo (ResizeObserver device-pixel-content-box)
  function medir() {
    dim = prepararCanvas(canvas, opciones.escala || (impl.escalaCss && impl.escalaCss()), pxDisp);
    impl.medir && impl.medir(dim);
    sucio = true;
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entradas) => {
    if (destruido) return;
    const en = entradas && entradas[entradas.length - 1];
    const dp = en && en.devicePixelContentBoxSize && en.devicePixelContentBoxSize[0];
    pxDisp = dp ? { w: Math.round(dp.inlineSize), h: Math.round(dp.blockSize) } : null;
    medir();
  }) : null;
  if (ro) {
    // device-pixel-content-box también avisa cuando solo cambia el devicePixelRatio (zoom, otro monitor).
    try { ro.observe(canvas, { box: 'device-pixel-content-box' }); } catch { ro.observe(canvas); }
  }
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => {
    if (destruido) return;
    const v = es[es.length - 1].isIntersecting;
    if (v && !visible) { visible = true; sucio = true; tAnterior = 0; if (activo) despertar(); } else visible = v;
  }) : null;
  if (io) io.observe(canvas);
  // Respaldo para navegadores sin device-pixel-content-box: escuchar el cambio de resolución.
  let mqDpr = null;
  const alCambiarDpr = () => { if (destruido) return; pxDisp = null; medir(); vigilarDpr(); };
  function vigilarDpr() {
    if (mqDpr) mqDpr.removeEventListener?.('change', alCambiarDpr);
    mqDpr = null;
    if (typeof matchMedia === 'undefined' || typeof window === 'undefined') return;
    try { mqDpr = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); mqDpr.addEventListener('change', alCambiarDpr, { once: true }); } catch { mqDpr = null; }
  }
  vigilarDpr();
  const bajaCarga = alCargar(() => { sucio = true; });

  function render(t = performance.now()) {
    if (!activo || destruido || !visible) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    quiereFrames = true;
    if (!dim) medir();
    if (!sucio && t - ultimoT < PASO_MS - HOLGURA_MS) return;
    const dt = tAnterior ? Math.min(250, t - tAnterior) : 0;
    tAnterior = t;
    ultimoT = t;
    const firma = impl.paso(t, dt);
    if (!sucio && firma !== undefined && firma === ultimaFirma) return;
    ultimaFirma = firma; sucio = false;
    const ctx = dim.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    impl.pintar(ctx, dim, t);
    if (capa.existe) capa.sincronizar();
  }

  function bucle(t) { if (!activo || destruido) return; render(t); raf = requestAnimationFrame(bucle); }

  // Toques: distingue toque de arrastre (umbral 8 px CSS). px CSS → px de sprite: ÷ dim.k.
  let abajo = null;
  const aSprite = v => v / (dim ? dim.k : 1);
  function pd(ev) {
    abajo = { x: ev.clientX, y: ev.clientY, ux: ev.clientX, t: performance.now(), arr: false, id: ev.pointerId };
    if (impl.arrastrar && canvas.setPointerCapture) { try { canvas.setPointerCapture(ev.pointerId); } catch { /* nada */ } }
  }
  function pm(ev) {
    if (!abajo || ev.pointerId !== abajo.id) return;
    if (!abajo.arr && Math.abs(ev.clientX - abajo.x) > 8) abajo.arr = true;
    if (abajo.arr && impl.arrastrar) {
      const dx = aSprite(ev.clientX - abajo.ux);
      abajo.ux = ev.clientX;
      if (dx) { impl.arrastrar(dx); sucio = true; }
      ev.preventDefault();
    }
  }
  function pu(ev) {
    if (!abajo || ev.pointerId !== abajo.id) return;
    const a = abajo; abajo = null;
    if (a.arr || Math.abs(ev.clientY - a.y) > 8 || performance.now() - a.t > 600) return;
    if (!dim) medir();
    const r = canvas.getBoundingClientRect();
    // El origen del búfer es la caja de contenido: se resta también el borde (clientLeft/clientTop).
    const x = aSprite(ev.clientX - r.left - (canvas.clientLeft || 0)), y = aSprite(ev.clientY - r.top - (canvas.clientTop || 0));
    const info = impl.tocar ? impl.tocar(x, y, ev) : null;
    sucio = true;
    if (info) for (const fn of fnsTocar) { try { fn(info); } catch (e) { console.error(e); } }
  }
  function pc() { abajo = null; }
  // Mantener pulsado un canvas abre el menú «Guardar imagen» en Android/iOS: fuera.
  function menu(ev) { ev.preventDefault(); }
  canvas.addEventListener('pointerdown', pd);
  canvas.addEventListener('pointermove', pm, { passive: false });
  canvas.addEventListener('pointerup', pu);
  canvas.addEventListener('pointercancel', pc);
  canvas.addEventListener('contextmenu', menu);
  if (impl.arrastrar) canvas.style.touchAction = 'pan-y';

  const vis = () => { if (!document.hidden) { sucio = true; tAnterior = 0; } };
  typeof document !== 'undefined' && document.addEventListener('visibilitychange', vis);

  const escena = {
    render,
    iniciar() {
      if (destruido || activo) return;
      activo = true; sucio = true; tAnterior = 0;
      if (opciones.autoBucle && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(bucle);
    },
    parar() { activo = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    destruir() {
      escena.parar(); destruido = true;
      ro && ro.disconnect(); io && io.disconnect(); bajaCarga();
      if (mqDpr) mqDpr.removeEventListener?.('change', alCambiarDpr);
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointerup', pu);
      canvas.removeEventListener('pointercancel', pc);
      canvas.removeEventListener('contextmenu', menu);
      typeof document !== 'undefined' && document.removeEventListener('visibilitychange', vis);
      capa.quitar();
      fnsTocar.clear();
    },
    alTocar(fn) { fnsTocar.add(fn); return () => fnsTocar.delete(fn); },
    get activa() { return activo; },
    get destruida() { return destruido; },
    /** ¿Se está pintando? (iniciada, en pantalla y con la pestaña visible). */
    get visible() { return activo && !destruido && visible && !(typeof document !== 'undefined' && document.hidden); },
  };
  return {
    escena,
    capa,
    marcarSucio() { sucio = true; },
    dim: () => { if (!dim) medir(); return dim; },
    remedir: medir,
  };
}

/** Reloj de pared de una escena: `opciones.reloj()` si existe (pruebas), si no Date.now(). */
export function relojDe(opciones) { return typeof opciones.reloj === 'function' ? opciones.reloj : () => Date.now(); }
