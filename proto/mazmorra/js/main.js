// main.js — pantallas (inicio, juego, resultado), mandos táctiles y HUD del prototipo A.

import * as S from '../../../js/gfx/sprites.js';
import * as J from './juego.js';
import { crearVista } from './vista.js';
import { COLORES, CLASE_TXT } from './movs.js';
import { urlIcono } from './iconos.js';
import { semillaNueva } from './rng.js';
import { dirDe } from './mapa.js';

const BASE = '../../';
const qs = new URLSearchParams(location.search);
const RAPIDO = qs.has('rapido');
const $ = (id) => document.getElementById(id);

let datos = null;
let P = null;               // partida en curso (o la de vista previa en el inicio)
let vista = null;
let liderElegido = null;
let pantalla = 'inicio';
let pendiente = null;       // acción pulsada mientras se animaba el turno anterior
let dirMantenida = null;    // dirección que el dedo (o la tecla) mantiene
let bloqueoAndar = false;   // tras avistar un enemigo o pisar la escalera, hay que volver a deslizar
let pasosGesto = 0;
let tutorial = 0;
let tIni = 0;
let modo = 'deslizar';
let auto = false;           // «Explorar»: el líder anda solo hasta que pase algo
let pasosAuto = 0;
try { if (localStorage.getItem('mazmorra.modo') === 'cruceta') modo = 'cruceta'; } catch { /* sin almacenamiento */ }

// Récords y vitrina de guardianes (solo en este navegador: es una comodidad, no un guardado de verdad).
const CLAVE_REG = 'mazmorra.registro';
function leerRegistro() {
  try { const r = JSON.parse(localStorage.getItem(CLAVE_REG) || 'null'); if (r && r.lideres) return r; } catch { /* nada */ }
  return { lideres: {}, guardianes: [] };
}
function guardarRegistro(r) { try { localStorage.setItem(CLAVE_REG, JSON.stringify(r)); } catch { /* nada */ } }

/**
 * Acciones de botón al levantar el dedo dentro del botón (más fiable que «click» en un juego: tras un
 * pellizco, algunos navegadores se comían el click). El click queda para teclado y lectores de pantalla.
 */
function pulsar(el, fn) {
  let id = null, ultimo = -1e9;
  el.addEventListener('pointerdown', (ev) => { id = ev.pointerId; });
  el.addEventListener('pointerup', (ev) => {
    if (ev.pointerId !== id) return;
    id = null;
    if (el.disabled) return;
    const r = el.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
    ultimo = performance.now();
    fn(ev);
  });
  el.addEventListener('pointercancel', () => { id = null; });
  el.addEventListener('click', (ev) => { if (performance.now() - ultimo < 700) return; fn(ev); });
}

// iOS: sin zoom por gesto ni doble toque.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => { if (e.target.closest('#juego')) e.preventDefault(); });

// ------------------------------------------------------------------------------------ arranque
async function arrancar() {
  try {
    await S.iniciar(BASE + 'assets/');
    const [esp, tipos] = await Promise.all([
      fetch(BASE + 'data/especies.json').then(r => r.json()),
      fetch(BASE + 'data/tipos.json').then(r => r.json()),
    ]);
    datos = { especies: esp.especies, ef: tipos.ef, nombresTipo: tipos.nombres, enManifest: new Set(S.especies()) };
    pintarInicio();
    $('estadoCarga').textContent = 'Tus 2 compañeros salen al azar. Puedes cambiarlos antes de entrar.';
    pintarVitrina();
  } catch (err) {
    console.error(err);
    $('estadoCarga').textContent = 'No se pudieron cargar los datos. Recarga la página.';
  }
}

const nombreTipo = (t) => (datos && datos.nombresTipo[t]) || t;
const chip = (t) => `<span class="chip" style="--c:${COLORES[t] || '#aaa'}">${nombreTipo(t)}</span>`;

function pintarInicio() {
  const cont = $('lideres');
  cont.innerHTML = '';
  const reg = leerRegistro();
  for (const sp of J.INICIALES) {
    const e = datos.especies[sp];
    const r = reg.lideres[sp];
    const b = document.createElement('button');
    b.className = 'lider';
    b.dataset.sp = sp;
    b.setAttribute('aria-pressed', String(sp === liderElegido));
    const marca = r && r.victorias ? `<i class="estrella" title="Ganada con ${e.n}">★</i>` : '';
    const rec = r && r.mejor ? `<span class="rec">${r.mejor} pts</span>` : '';
    b.innerHTML = `${marca}<img src="${S.urlRetrato(sp, 'Normal')}" alt=""><b>${e.n}</b><span class="tipos">${e.t.map(chip).join('')}</span>${rec}`;
    b.addEventListener('click', () => elegirLider(sp));
    cont.appendChild(b);
  }
}

function pintarVitrina() {
  const reg = leerRegistro();
  const v = $('vitrina');
  const ganadas = Object.values(reg.lideres).filter(r => r.victorias).length;
  if (!reg.guardianes.length && !ganadas) { v.hidden = true; return; }
  v.hidden = false;
  v.innerHTML = `<span>Guardianes vencidos <b>${reg.guardianes.length}</b> · líderes con ★ <b>${ganadas}/9</b></span>`
    + `<span class="caras">${reg.guardianes.slice(-8).map(sp => `<img src="${S.urlRetrato(sp, 'Normal')}" alt="${datos.especies[sp] ? datos.especies[sp].n : ''}">`).join('')}</span>`;
}

function elegirLider(sp) {
  liderElegido = sp;
  for (const b of document.querySelectorAll('.lider')) b.setAttribute('aria-pressed', String(b.dataset.sp === sp));
  previsualizar();
}

function previsualizar() {
  P = J.crearPartida({ semilla: semillaNueva(), lider: liderElegido, datos });
  const comp = J.equipo(P).filter(e => !e.lider);
  const a = $('acompanan');
  a.hidden = false;
  a.innerHTML = 'Te acompañan: ' + comp.map(e => `<span><img src="${S.urlRetrato(e.sp, 'Normal')}" alt=""> <b>${e.nombre}</b> ${e.tipos.map(chip).join(' ')}</span>`).join(' ');
  $('btnOtros').hidden = false;
  const b = $('btnEntrar');
  b.disabled = false;
  b.textContent = `Entrar con ${datos.especies[liderElegido].n}`;
  a.scrollIntoView({ block: 'nearest' });
  // Precarga en segundo plano lo del equipo.
  for (const e of J.equipo(P)) S.precargar(e.sp, ['Idle', 'Walk', 'Attack', 'Hurt', 'Faint']);
}

pulsar($('btnOtros'), previsualizar);
pulsar($('btnEntrar'), () => empezar());
pulsar($('btnOtra'), () => { previsualizar(); empezar(); });
pulsar($('btnCambiar'), () => { pintarInicio(); pintarVitrina(); mostrar('inicio'); });

function mostrar(cual) {
  pantalla = cual;
  for (const id of ['inicio', 'juego', 'resultado']) $(id).hidden = id !== cual;
}

// ------------------------------------------------------------------------------------ partida
async function empezar() {
  mostrar('juego');
  $('cargando').hidden = false;
  if (!vista) {
    vista = crearVista($('lienzo'), $('capa'), $('mini'), {
      rapido: RAPIDO,
      ganchos: {
        texto: alTexto,
        avistar: () => { if (dirMantenida != null) bloqueoAndar = true; if (auto) ponerAuto(false, '¡Enemigo a la vista!'); },
        escalera: () => { bloqueoAndar = true; if (auto) ponerAuto(false); verAviso(true); },
        coger: () => { if (dirMantenida != null) bloqueoAndar = true; },
        piso: (ev) => { cartel(`Piso ${ev.n}`, ev.n === J.PISOS ? 'El guardián espera al fondo' : 'Recuperáis los PP'); },
        jefe: (ev) => { const e = P.ents.find(x => x.id === ev.id); cartel('¡Guardián!', e ? e.nombre : ''); },
        fin: () => mostrarResultado(),
      },
    });
    vista.fijarZonaLibre(zonaLibre);
  }
  pendiente = null; dirMantenida = null; bloqueoAndar = false;
  tutorial = 0; tIni = performance.now();
  ponerAuto(false);
  $('log').innerHTML = '';
  verAviso(false);
  vista.ponerPartida(P);
  montarMovs();
  medirHud();
  hudFirma = '';
  // Espera a los sprites del equipo (máx. 4 s; si no, se juega con lo que haya).
  await Promise.race([
    Promise.all(J.equipo(P).map(e => S.precargar(e.sp, ['Idle', 'Walk', 'Attack', 'Hurt']))),
    new Promise(r => setTimeout(r, 4000)),
  ]);
  $('cargando').hidden = true;
  cartel('Piso 1', 'Busca la escalera');
  log('Piso 1. Explora y busca la escalera.', 'fuerte');
}

function hacer(acc) {
  if (!P || P.fin || pantalla !== 'juego') return;
  if (auto && !acc.auto) ponerAuto(false);
  if (vista.ocupada()) { if (acc.tipo !== 'andar') pendiente = acc; return; }
  const ev = J.jugar(P, acc);
  const anduvo = ev.some(e => e.t === 'mover' && e.id === J.lider(P).id);
  if (acc.tipo === 'andar' && anduvo) { pasosGesto++; if (tutorial === 0) tutorial = 1; }
  if (ev.some(e => e.t === 'ataque' && e.id === J.lider(P).id) && tutorial < 2) tutorial = 2;
  if (acc.tipo === 'bajar' || ev.some(e => e.t === 'piso')) verAviso(false);
  if (auto) {
    const eqIds = new Set(J.equipo(P).map(e => e.id));
    if (!anduvo) ponerAuto(false);
    else if (ev.some(e => e.t === 'ataque' && e.golpes.some(g => eqIds.has(g.id)))) ponerAuto(false, '¡Os atacan!');
  }
  vista.reproducir(ev);
  hudFirma = '';
}

const MOTIVOS = {
  enemigo: 'Hay enemigos a la vista: lucha o apártate.',
  vida: 'Poca vida: come una baya o espera antes de seguir.',
  escalera: 'Has llegado a la escalera.',
  nada: 'No queda nada por explorar aquí.',
};
function ponerAuto(on, motivo) {
  auto = on; pasosAuto = 0;
  const b = $('btnExplorar');
  b.textContent = on ? 'Parar' : 'Explorar';
  b.classList.toggle('activo', on);
  if (!on && motivo && pantalla === 'juego') log(motivo, 'aviso');
  hudFirma = '';
}
function pasoAuto() {
  const r = J.explorarPaso(P, { desdeEscalera: pasosAuto === 0 && P.enEscalera });
  if (r.dir == null) { ponerAuto(false, MOTIVOS[r.parar]); return; }
  pasosAuto++;
  hacer({ tipo: 'andar', dir: r.dir, auto: true });
}

function verAviso(on) {
  $('escalera').hidden = !on;
  document.body.classList.toggle('aviso-escalera', on);
}

let nFrame = 0;
function bucle(now) {
  if (pantalla === 'juego' && vista && P) {
    vista.tick(now);
    if (!vista.ocupada() && !P.fin) {
      if (pendiente) { const a = pendiente; pendiente = null; hacer(a); }
      else if (dirMantenida != null && !bloqueoAndar) hacer({ tipo: 'andar', dir: dirMantenida });
      else if (auto) pasoAuto();
    }
    actualizarHud();
    if (++nFrame % 6 === 0) aclararPaneles();
  }
  requestAnimationFrame(bucle);
}

/** Si un enemigo queda debajo del minimapa o del registro, esos paneles se vuelven casi transparentes. */
function aclararPaneles() {
  const pts = [];
  for (const e of P.ents) {
    if (!e.vivo || e.bando !== 'en' || !J.verCelda(P, e.x, e.y)) continue;
    const p = vista.aPantalla(e.x, e.y);
    if (p) pts.push(p);
  }
  for (const id of ['mini', 'log']) {
    const el = $(id);
    const r = el.getBoundingClientRect();
    const tapa = r.height > 0 && pts.some(p => p.x > r.left - 14 && p.x < r.right + 14 && p.y > r.top - 22 && p.y < r.bottom + 14);
    if (el.classList.contains('tapa') !== tapa) el.classList.toggle('tapa', tapa);
  }
}
requestAnimationFrame(bucle);

// ------------------------------------------------------------------------------------ mensajes
function log(s, clase = '') {
  const cont = $('log');
  const p = document.createElement('p');
  p.textContent = s;
  if (clase) p.className = clase;
  cont.appendChild(p);
  const max = innerHeight > innerWidth ? 2 : 3;
  while (cont.children.length > max) cont.firstChild.remove();
  [...cont.children].forEach((x, i, arr) => x.classList.toggle('viejo', i < arr.length - 1));
  // Los mensajes se desvanecen solos: no se quedan tapando la mazmorra.
  setTimeout(() => p.classList.add('fuera'), 4200);
}
function alTexto(ev) {
  if (ev.ataque) return log(ev.s, ev.bando === 'en' ? 'malo' : '');
  log(ev.s, ev.aviso ? 'aviso' : ev.bueno ? 'bueno' : ev.fuerte ? 'fuerte' : '');
}
let cartelTimer = 0;
function cartel(txt, sub = '') {
  const c = $('cartel');
  c.hidden = true; void c.offsetWidth;
  c.innerHTML = `${txt}${sub ? `<small>${sub}</small>` : ''}`;
  c.hidden = false;
  clearTimeout(cartelTimer);
  cartelTimer = setTimeout(() => { c.hidden = true; }, 1700);
}

// ------------------------------------------------------------------------------------ HUD
let hudFirma = '';
const AYUDAS = {
  deslizar: ['Desliza para andar: corto = 1 paso, mantén = seguir. «Explorar» anda solo', 'Toca a un enemigo a tu lado o usa un movimiento de abajo', 'Busca la escalera (azul en el minimapa) · piso 3: el guardián'],
  cruceta: ['Cruceta: toque = 1 paso, mantén = seguir. «Explorar» anda solo', 'Toca a un enemigo a tu lado o usa un movimiento de abajo', 'Busca la escalera (azul en el minimapa) · piso 3: el guardián'],
};

function montarMovs() {
  const cont = $('movs');
  cont.innerHTML = '';
  J.lider(P).movs.forEach((mv, i) => {
    const b = document.createElement('button');
    b.className = 'mov';
    b.dataset.i = i;
    b.style.setProperty('--c', COLORES[mv.tipo] || '#aaa');
    b.innerHTML = `<span class="nom">${mv.nombre}</span><span class="meta"><span class="tipo">${nombreTipo(mv.tipo)}</span><span class="clase">${CLASE_TXT[mv.clase]}</span><em class="ef" hidden></em><b class="pp"></b></span>`;
    pulsar(b, () => hacer({ tipo: 'mov', i }));
    cont.appendChild(b);
  });
  $('btnBaya').querySelector('img').src = urlIcono('baya');
  $('btnSemilla').querySelector('img').src = urlIcono('semilla');
}

function actualizarHud() {
  const L = J.lider(P);
  const ocup = vista.ocupada();
  const eq = J.equipo(P);
  const firma = [P.piso, P.bolsa.baya, P.bolsa.semilla, ocup, tutorial, modo, P.enEscalera, P.turno, P.peligro.length,
    ...eq.map(e => `${e.id}:${vista.vhp(e.id)}/${e.hpMax}:${e.vivo}:${e.nivel}`), ...L.movs.map(m => m.pp), L.dir].join('|');
  if (firma === hudFirma) return;
  hudFirma = firma;
  $('piso').textContent = `Piso ${P.piso}/${J.PISOS}`;
  $('ayuda').textContent = P.peligro.length ? '¡Sal de las casillas rojas antes de que golpee! (o atúrdelo con una semilla)'
    : P.enEscalera ? 'Estás en la escalera: «Bajar» abajo a la derecha'
    : tutorial >= 2 && P.piso === J.PISOS
      ? 'Vence al guardián (punto rosa del minimapa). Cuando cargue, apártate'
      : AYUDAS[modo][Math.min(2, tutorial)];
  // equipo
  const contEq = $('equipo');
  if (contEq.children.length !== eq.length) {
    contEq.innerHTML = eq.map(() => '<div class="miembro"><div class="nom"><b></b><span></span></div><div class="barra"><i></i></div></div>').join('');
  }
  eq.forEach((e, i) => {
    const el = contEq.children[i];
    const hp = Math.max(0, Math.round(vista.vhp(e.id)));
    const f = hp / e.hpMax;
    el.className = 'miembro' + (e.lider ? ' es-lider' : '') + (!e.vivo && hp <= 0 ? ' ko' : f < 0.25 ? ' critico' : f < 0.5 ? ' bajo' : '');
    el.querySelector('b').textContent = e.nombre;
    el.querySelector('.nom span').textContent = `${hp}/${e.hpMax}`;
    el.querySelector('.barra i').style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
  });
  // movimientos
  const botones = $('movs').children;
  L.movs.forEach((mv, i) => {
    const b = botones[i];
    if (!b) return;
    b.querySelector('.pp').textContent = Number.isFinite(mv.pp) ? `${mv.pp}/${mv.ppMax}` : '∞';
    b.disabled = mv.pp <= 0;
    const ef = b.querySelector('.ef');
    const prev = !ocup && !P.fin ? J.previsionMov(P, i) : null;
    if (prev && mv.pp > 0) {
      ef.hidden = false;
      const x = prev.ef;
      ef.className = 'ef ' + (x === 0 ? 'x0' : x > 1 ? 'x2' : x < 1 ? 'x05' : 'x1');
      ef.textContent = x === 0 ? '×0' : x >= 4 ? '×4' : x > 1 ? '×2' : x <= 0.25 ? '×¼' : x < 1 ? '×½' : '×1';
    } else ef.hidden = true;
  });
  $('btnBaya').querySelector('b').textContent = P.bolsa.baya;
  $('btnSemilla').querySelector('b').textContent = P.bolsa.semilla;
  $('btnBaya').disabled = !P.bolsa.baya;
  $('btnSemilla').disabled = !P.bolsa.semilla;
  $('btnModo').textContent = modo === 'deslizar' ? 'Cruceta' : 'Deslizar';
  $('cruceta').hidden = modo !== 'cruceta';
  document.body.classList.toggle('con-cruceta', modo === 'cruceta');
  // Sobre la escalera, «Esperar» pasa a ser «Bajar»: así nunca te quedas atascado tras «Quedarme».
  const be = $('btnEsperar');
  be.textContent = P.enEscalera ? 'Bajar' : 'Esperar';
  be.classList.toggle('prim', P.enEscalera); be.classList.toggle('sec', !P.enEscalera);
  if (!P.enEscalera) verAviso(false);
}

/** Zona de pantalla que no tapan los paneles (px CSS respecto al canvas): ahí se centra la cámara. */
let zona = { x: 0, y: 0, w: 360, h: 400 };
function medirHud() {
  const c = $('lienzo').getBoundingClientRect();
  const a = $('arriba').getBoundingClientRect();
  const m = $('mandos').getBoundingClientRect();
  const horizontal = m.left > c.left + 10 && m.top <= c.top + 1;
  document.documentElement.style.setProperty('--alto-arriba', Math.round(a.height) + 'px');
  document.documentElement.style.setProperty('--alto-mandos', horizontal ? '0px' : Math.round(m.height) + 'px');
  // El registro (abajo) se resta para que el líder quede en el centro de lo que de verdad se ve.
  if (horizontal) zona = { x: 0, y: a.bottom - c.top, w: m.left - c.left, h: c.bottom - a.bottom - 24 };
  else zona = { x: 0, y: a.bottom - c.top, w: c.width, h: m.top - a.bottom - 30 };
}
function zonaLibre() { return zona; }
const roHud = new ResizeObserver(() => { if (pantalla === 'juego') medirHud(); });
roHud.observe($('arriba')); roHud.observe($('mandos')); roHud.observe(document.documentElement);
addEventListener('orientationchange', () => setTimeout(medirHud, 250));

// ------------------------------------------------------------------------------------ botones
pulsar($('btnBaya'), () => hacer({ tipo: 'objeto', clave: 'baya' }));
pulsar($('btnSemilla'), () => hacer({ tipo: 'objeto', clave: 'semilla' }));
pulsar($('btnEsperar'), () => hacer({ tipo: P && P.enEscalera ? 'bajar' : 'esperar' }));
pulsar($('btnBajar'), () => hacer({ tipo: 'bajar' }));
pulsar($('btnQuedar'), () => verAviso(false));
pulsar($('btnExplorar'), () => {
  if (!P || P.fin) return;
  if (auto) { ponerAuto(false); return; }
  if (P.ents.some(e => e.vivo && e.bando === 'en' && J.verCelda(P, e.x, e.y))) { log(MOTIVOS.enemigo, 'aviso'); return; }
  verAviso(false);
  ponerAuto(true);
});
pulsar($('btnModo'), () => {
  modo = modo === 'deslizar' ? 'cruceta' : 'deslizar';
  try { localStorage.setItem('mazmorra.modo', modo); } catch { /* nada */ }
  dirMantenida = null;
  hudFirma = '';
  log(modo === 'cruceta' ? 'Modo cruceta: mantén la cruceta para andar.' : 'Modo deslizar: desliza y mantén en cualquier sitio.', 'aviso');
});

// ------------------------------------------------------------------------------------ deslizar / tocar
const SECTOR_A_DIR = [2, 1, 0, 7, 6, 5, 4, 3];   // 0° = derecha, en sentido horario (y hacia abajo)
function dirDeVector(dx, dy) {
  const s = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTOR_A_DIR[((s % 8) + 8) % 8];
}

let gesto = null;
const lienzo = $('lienzo');
const joy = $('joy');
lienzo.addEventListener('pointerdown', (ev) => {
  if (gesto) return;
  if (auto) ponerAuto(false);
  gesto = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: performance.now(), movido: false, dir: null };
  pasosGesto = 0;
  try { lienzo.setPointerCapture(ev.pointerId); } catch { /* nada */ }
  if (modo === 'deslizar') {
    joy.style.left = ev.clientX + 'px'; joy.style.top = ev.clientY + 'px';
    joy.firstElementChild.style.transform = '';
  }
});
lienzo.addEventListener('pointermove', (ev) => {
  if (!gesto || ev.pointerId !== gesto.id || modo !== 'deslizar') return;
  let dx = ev.clientX - gesto.x0, dy = ev.clientY - gesto.y0;
  let d = Math.hypot(dx, dy);
  if (d > 56) {   // joystick flotante: el centro sigue al dedo si se aleja mucho
    gesto.x0 = ev.clientX - dx / d * 56; gesto.y0 = ev.clientY - dy / d * 56;
    dx = ev.clientX - gesto.x0; dy = ev.clientY - gesto.y0; d = 56;
    joy.style.left = gesto.x0 + 'px'; joy.style.top = gesto.y0 + 'px';
  }
  if (d > 18) {
    if (!gesto.movido) { gesto.movido = true; joy.classList.add('on'); }
    const dir = dirDeVector(dx, dy);
    if (dir !== dirMantenida) { dirMantenida = dir; bloqueoAndar = false; }
    gesto.dir = dir;
  }
  if (gesto.movido) joy.firstElementChild.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
});
function finGesto(ev, cancelado) {
  if (!gesto || ev.pointerId !== gesto.id) return;
  const g = gesto; gesto = null;
  joy.classList.remove('on');
  dirMantenida = null; bloqueoAndar = false;
  if (cancelado) return;
  if (g.movido) {
    // Un deslizamiento rápido mientras se animaba el turno anterior: que cuente como un paso.
    if (!pasosGesto && g.dir != null) pendienteAndar(g.dir);
    return;
  }
  if (performance.now() - g.t0 < 450) tocar(ev.clientX, ev.clientY);
}
lienzo.addEventListener('pointerup', (ev) => finGesto(ev, false));
lienzo.addEventListener('pointercancel', (ev) => finGesto(ev, true));

function pendienteAndar(dir) {
  if (vista.ocupada()) pendiente = { tipo: 'andar', dir };
  else hacer({ tipo: 'andar', dir });
}

function tocar(cx, cy) {
  if (!P || P.fin) return;
  const r = lienzo.getBoundingClientRect();
  const c = vista.celdaEn(cx - r.left, cy - r.top);
  if (!c) return;
  const L = J.lider(P);
  const dx = c.x - L.x, dy = c.y - L.y;
  if (!dx && !dy) return;
  const dir = dirDe(dx, dy);
  const o = J.entEn(P, c.x, c.y);
  if (Math.max(Math.abs(dx), Math.abs(dy)) === 1 && o && o.bando === 'en' && J.verCelda(P, c.x, c.y)) {
    hacer({ tipo: 'mov', i: 0, dir });
  } else if (!vista.ocupada()) hacer({ tipo: 'girar', dir });
}

// ------------------------------------------------------------------------------------ cruceta
const cruceta = $('cruceta');
let gestoCruceta = null;
function dirCruceta(ev) {
  const r = cruceta.getBoundingClientRect();
  const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.18) return null;
  return dirDeVector(dx, dy);
}
cruceta.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (auto) ponerAuto(false);
  gestoCruceta = { id: ev.pointerId, t0: performance.now() };
  pasosGesto = 0;
  try { cruceta.setPointerCapture(ev.pointerId); } catch { /* nada */ }
  const d = dirCruceta(ev);
  gestoCruceta.dir = d;
  dirMantenida = d; bloqueoAndar = false;
  cruceta.classList.add('activa');
});
cruceta.addEventListener('pointermove', (ev) => {
  if (!gestoCruceta || ev.pointerId !== gestoCruceta.id) return;
  const d = dirCruceta(ev);
  if (d !== dirMantenida) { dirMantenida = d; bloqueoAndar = false; }
  if (d != null) gestoCruceta.dir = d;
});
function finCruceta(ev) {
  if (!gestoCruceta || ev.pointerId !== gestoCruceta.id) return;
  const g = gestoCruceta; gestoCruceta = null;
  cruceta.classList.remove('activa');
  dirMantenida = null; bloqueoAndar = false;
  if (ev.type === 'pointercancel') return;
  if (g.dir == null) { if (performance.now() - g.t0 < 450) hacer({ tipo: 'esperar' }); }
  else if (!pasosGesto) pendienteAndar(g.dir);
}
cruceta.addEventListener('pointerup', finCruceta);
cruceta.addEventListener('pointercancel', finCruceta);

// ------------------------------------------------------------------------------------ teclado (escritorio)
const TECLAS = {
  ArrowDown: 0, ArrowRight: 2, ArrowUp: 4, ArrowLeft: 6, s: 0, d: 2, w: 4, a: 6, x: 0,
  c: 1, e: 3, q: 5, z: 7,
};
const NUMPAD = { Numpad2: 0, Numpad3: 1, Numpad6: 2, Numpad9: 3, Numpad8: 4, Numpad7: 5, Numpad4: 6, Numpad1: 7 };
const teclasAbajo = new Set();
function dirTeclas() {
  let dx = 0, dy = 0;
  for (const k of teclasAbajo) {
    const d = NUMPAD[k] != null ? NUMPAD[k] : TECLAS[k];
    if (d == null) continue;
    const v = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]][d];
    dx += v[0]; dy += v[1];
  }
  if (!dx && !dy) return null;
  return dirDe(dx, dy);
}
addEventListener('keydown', (ev) => {
  if (pantalla !== 'juego') return;
  const k = ev.code.startsWith('Numpad') ? ev.code : ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (['1', '2', '3', '4'].includes(k) && !ev.code.startsWith('Numpad')) { hacer({ tipo: 'mov', i: Number(k) - 1 }); return; }
  if (k === 'b') return hacer({ tipo: 'objeto', clave: 'baya' });
  if (k === 'n') return hacer({ tipo: 'objeto', clave: 'semilla' });
  if (k === '.' || k === 'Numpad5') return hacer({ tipo: 'esperar' });
  if (k === 'x' && ev.shiftKey) return $('btnExplorar').click();
  if (k === 'Enter' && P && P.enEscalera) return hacer({ tipo: 'bajar' });
  if (k in TECLAS || k in NUMPAD) {
    ev.preventDefault();
    if (ev.repeat) return;
    teclasAbajo.add(k);
    const d = dirTeclas();
    if (d !== dirMantenida) { dirMantenida = d; bloqueoAndar = false; }
    if (d != null && !vista.ocupada()) hacer({ tipo: 'andar', dir: d });
  }
});
addEventListener('keyup', (ev) => {
  const k = ev.code.startsWith('Numpad') ? ev.code : ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  teclasAbajo.delete(k);
  if (!gesto && !gestoCruceta) dirMantenida = dirTeclas();
});

// ------------------------------------------------------------------------------------ resultado
function mostrarResultado() {
  const v = P.fin && P.fin.victoria;
  const L = J.lider(P);
  const seg = Math.round((performance.now() - tIni) / 1000);
  $('resTitulo').textContent = v ? '¡Victoria!' : 'Fin de la expedición';
  const jefe = P.ents.find(e => e.jefe);
  $('resTexto').textContent = v
    ? `${L.nombre} y su equipo han vencido a ${jefe ? jefe.nombre : 'el guardián'} en el piso ${P.piso}.`
    : `${L.nombre} se ha debilitado en el piso ${P.piso}. ¡A la próxima!`;
  $('resRetrato').innerHTML = J.equipo(P).map(e => `<img src="${S.urlRetrato(e.sp, v ? 'Happy' : (e.lider ? 'Pain' : 'Worried'))}" alt="${e.nombre}">`).join('');
  const filas = [
    ['Tiempo', `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`],
    ['Turnos', P.turno],
    ['Piso alcanzado', `${P.piso}/${J.PISOS}`],
    ['Enemigos derrotados', P.stats.derrotados],
    ['Daño hecho / recibido', `${P.stats.danoHecho} / ${P.stats.danoRecibido}`],
    ['Objetos usados', P.stats.objetos],
    ['Nivel del equipo', L.nivel],
  ];
  $('resDatos').innerHTML = filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  // Puntos, récord por líder y vitrina de guardianes: algo que llevarse y que mejorar en la siguiente.
  const esquivas = P.stats.esquivas || 0;
  const puntos = 100 * (P.piso - 1) + 20 * P.stats.derrotados + 40 * esquivas + (v ? 500 + Math.max(0, 400 - P.turno) : 0);
  const reg = leerRegistro();
  const r = reg.lideres[L.sp] || (reg.lideres[L.sp] = { mejor: 0, victorias: 0 });
  const record = puntos > r.mejor;
  const anterior = r.mejor;
  if (record) r.mejor = puntos;
  const primeraEstrella = v && !r.victorias;
  if (v) r.victorias++;
  let premio = '';
  if (v && jefe) {
    const nuevo = !reg.guardianes.includes(jefe.sp);
    if (nuevo) reg.guardianes.push(jefe.sp);
    premio = nuevo ? `${jefe.nombre} entra en tu vitrina de guardianes (${reg.guardianes.length}).` : `${jefe.nombre} ya estaba en tu vitrina.`;
    if (primeraEstrella) premio += ` ¡Primera ★ con ${L.nombre}!`;
  } else if (!v) {
    premio = P.piso < J.PISOS ? 'Consejo: «Explorar» te ahorra pasos y las Bayas se comen antes de que sea tarde.' : 'Consejo: cuando el guardián carga, apártate de las casillas rojas o atúrdelo con una Semilla.';
  }
  guardarRegistro(reg);
  $('resPuntos').innerHTML = `<b>${puntos}</b> puntos` + (record ? (anterior ? ` · <span class="nuevo">¡nuevo récord!</span> (antes ${anterior})` : ' · <span class="nuevo">¡primer récord!</span>') : ` · récord con ${L.nombre}: ${r.mejor}`);
  $('resPremio').hidden = !premio;
  $('resPremio').textContent = premio;
  $('btnOtra').textContent = `Otra vez con ${L.nombre}`;
  mostrar('resultado');
}

// ------------------------------------------------------------------------------------ pruebas
// Gancho para prueba.mjs: estado, el bot y una forma de esperar a que acabe la animación.
window.__mazmorra = {
  estado: () => P && {
    pantalla, piso: P.piso, turno: P.turno, fin: P.fin, ocupada: vista ? vista.ocupada() : false,
    lider: (() => { const L = J.lider(P); return { x: L.x, y: L.y, hp: L.hp, hpMax: L.hpMax, nombre: L.nombre }; })(),
    enEscalera: P.enEscalera, escala: vista && vista.escala(), auto, peligro: P.peligro.length,
  },
  sugerir: () => J.sugerir(P),
  hacer,
  pantallaACelda: (x, y) => vista && vista.celdaEn(x, y),
  celdaAPantalla: (cx, cy) => vista && vista.aPantalla(cx, cy),
};

arrancar();
