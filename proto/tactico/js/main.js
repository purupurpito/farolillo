// main.js — Prototipo B «Farolillo táctico»: pantallas (inicio, mapa, combate, premio, resultado)
// y control del combate por turnos de bando.

import * as S from '../../../js/gfx/sprites.js';
import {
  RAIZ, INICIALES, ESP, cargarDatos, crearUnidad, especieAleatoria, rngDe, COLOR_TIPO, nombreTipo, eficacia,
  COMPI_MIN, COMPI_MAX, REVIVE, CURA_VICTORIA, subirNivel,
} from './datos.js';
import {
  COLS, FILAS, clave, vivos, unidadEn, alcanzables, ruta, casillasRango, prever, opcionesDesde, mejorJugada,
  generarRocas, dist, montarEnemigos, amenaza, amenazaTotal, mejorAcercamiento,
} from './reglas.js';
import { crearTablero, VEL } from './tablero.js';

const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const ISLAS = ['prado', 'bosque', 'arroyo', 'cueva', 'volcan', 'cumbre'];
const ICONO = { elite: 'estrella.svg', descanso: 'corazon.svg', cofre: 'objeto.svg' };
const NOMBRE_NODO = { combate: 'Combate', elite: 'Élite', descanso: 'Descanso', cofre: 'Cofre', jefe: 'Jefe' };

const G = {
  lider: INICIALES[1],
  compis: [],
  run: null,
  pantalla: 'cargando',
  tutorialVisto: leerLS('tactico.tuto') === '1',
};
let C = null;   // combate en curso

function leerLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
/** Récord entre partidas (solo en este navegador): piso más alto, victorias y farolillos acumulados. */
function leerRecord() {
  try { return { piso: 0, victorias: 0, partidas: 0, faroles: 0, ...JSON.parse(leerLS('tactico.record') || '{}') }; } catch { return { piso: 0, victorias: 0, partidas: 0, faroles: 0 }; }
}
function ponerLS(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const retrato = (sp, emo = 'Normal') => S.urlRetrato(sp, emo);
const chip = (t) => `<span class="chip" style="--c:${COLOR_TIPO[t] || '#888'}">${esc(nombreTipo(t))}</span>`;
const rngUI = rngDe(Date.now() & 0xffffffff);

function elegirCompis() {
  const a = especieAleatoria(rngUI, COMPI_MIN, COMPI_MAX, { excluir: [G.lider] });
  const b = especieAleatoria(rngUI, COMPI_MIN, COMPI_MAX, { excluir: [G.lider, a] });
  G.compis = [a, b];
}

// ---------------------------------------------------------------- inicio
function recordTexto() {
  const r = leerRecord();
  if (!r.partidas) return 'Prototipo B · combate por turnos';
  return `Récord: piso ${r.piso}/6 · ${r.victorias} ${r.victorias === 1 ? 'victoria' : 'victorias'} · ${r.faroles} farolillos`;
}

function pantallaInicio() {
  G.pantalla = 'inicio';
  if (!G.compis.length) elegirCompis();
  app.innerHTML = `
  <div class="pant inicio">
    <header class="cab"><h1>Farolillo <small>táctico</small></h1><p class="sub">${recordTexto()}</p></header>
    <section class="bloque b-lider">
      <h2>Elige a tu líder</h2>
      <div class="lideres">
        ${INICIALES.map((sp) => `
          <button class="lider ${sp === G.lider ? 'sel' : ''}" data-sp="${sp}" aria-pressed="${sp === G.lider}">
            <img src="${retrato(sp)}" alt="" width="40" height="40"><span>${esc(ESP[sp].n)}</span>
          </button>`).join('')}
      </div>
    </section>
    <section class="bloque compis">
      <h2>Te acompañan</h2>
      <div class="fila-compis">
        ${G.compis.map((sp) => `<div class="compi"><img src="${retrato(sp)}" alt="" width="40" height="40">
          <div><b>${esc(ESP[sp].n)}</b><div>${ESP[sp].t.map(chip).join('')}</div></div></div>`).join('')}
        <button class="btn sec" id="otros">Otros</button>
      </div>
    </section>
    <section class="bloque como">
      <h2>Cómo se juega</h2>
      <ol>
        <li>Avanza por el mapa de combate en combate hasta el <b>jefe</b>. Cada victoria sube de nivel al equipo.</li>
        <li>Toca a uno de los tuyos y una casilla <b class="azul">azul</b> para moverlo, o toca directamente a un rival para ir a por él.</li>
        <li>Mira el daño previsto y confirma. Lo <b class="rojo">rayado en rojo</b> es donde te pueden pegar. Aprovecha tipos, empujones contra rocas y el <b>flanqueo</b>.</li>
      </ol>
    </section>
    <div class="pie"><button class="btn prim grande" id="empezar">Empezar</button></div>
  </div>`;
  app.querySelectorAll('.lider').forEach((b) => b.addEventListener('click', () => {
    G.lider = b.dataset.sp;
    if (G.compis.includes(G.lider)) elegirCompis();
    pantallaInicio();
  }));
  app.querySelector('#otros').addEventListener('click', () => { elegirCompis(); pantallaInicio(); });
  app.querySelector('#empezar').addEventListener('click', empezarRun);
}

// ---------------------------------------------------------------- partida
function empezarRun() {
  const semilla = q.has('semilla') ? Number(q.get('semilla')) : (Math.random() * 2 ** 32) >>> 0;
  const rng = rngDe(semilla);
  const equipo = [G.lider, ...G.compis].map((sp) => crearUnidad(sp, 'jugador'));
  G.run = {
    semilla, rng, equipo,
    mods: { jugador: { danio: 1, recibido: 1, potArea: 0 }, rival: { danio: 0.85, recibido: 1, potArea: 0 } },
    mapa: generarMapa(rng),
    pos: null,
    mejoras: [],
    stats: { t0: performance.now(), combates: 0, kos: 0, hecho: 0, recibido: 0, por: {}, porCombate: {}, turnos: 0, piso: 0, faroles: 0 },
  };
  pantallaMapa();
}

function generarMapa(rng) {
  // Cada fila tiene siempre un combate. Cofre solo en la fila 2 y descanso solo en la 5: en cualquier camino hay
  // como mucho un cofre y un descanso, nunca seguidos, y al menos 4 combates (contando el jefe).
  const filasTipos = [
    ['combate', 'combate'],
    rng() < 0.5 ? ['combate', 'cofre'] : ['combate', 'cofre', 'combate'],
    rng() < 0.5 ? ['combate', 'elite'] : ['combate', 'elite', 'combate'],
    rng() < 0.5 ? ['combate', 'elite'] : ['elite', 'combate', 'combate'],
    rng() < 0.5 ? ['combate', 'descanso'] : ['combate', 'descanso', 'elite'],
  ];
  const filas = filasTipos.map((tipos, f) => {
    const t = tipos.slice().sort(() => rng() - 0.5);
    return t.map((tipo, i) => ({ f, i, x: (i + 0.5) / t.length, tipo, sig: [] }));
  });
  const jefeSp = especieAleatoria(rng, 480, 600);
  filas.push([{ f: 5, i: 0, x: 0.5, tipo: 'jefe', sig: [], sp: jefeSp }]);
  for (let f = 0; f < 5; f++) {
    const sig = filas[f + 1];
    for (const n of filas[f]) {
      n.sig = sig.filter((m) => Math.abs(m.x - n.x) <= 0.51).map((m) => m.i);
      if (!n.sig.length) n.sig = [sig.reduce((a, b) => (Math.abs(b.x - n.x) < Math.abs(a.x - n.x) ? b : a)).i];
    }
    for (const m of sig) {
      if (!filas[f].some((n) => n.sig.includes(m.i))) {
        const n = filas[f].reduce((a, b) => (Math.abs(b.x - m.x) < Math.abs(a.x - m.x) ? b : a));
        n.sig.push(m.i);
      }
    }
  }
  return filas;
}

function disponibles() {
  const { mapa, pos } = G.run;
  if (!pos) return mapa[0].map((n) => n);
  const n = mapa[pos.f][pos.i];
  return (mapa[pos.f + 1] || []).filter((m) => n.sig.includes(m.i));
}

function equipoMini() {
  return `<div class="mini-equipo">${G.run.equipo.map((u) => `
    <div class="mini ${u.ps <= 0 ? 'ko' : ''}"><img src="${retrato(u.sp)}" alt="" width="40" height="40"><em class="nv">Nv ${u.nv}</em>
      <div class="mini-ps"><i style="width:${Math.round(100 * Math.max(0, u.ps) / u.psMax)}%"></i></div>
      <small>${Math.max(0, u.ps)}/${u.psMax}</small></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- mapa
function pantallaMapa() {
  G.pantalla = 'mapa';
  const { mapa, pos } = G.run;
  const disp = new Set(disponibles().map((n) => n.f + ':' + n.i));
  const filasArriba = [...mapa].reverse();
  const N = mapa.length;
  // En vertical el camino sube (jefe arriba); en horizontal va de izquierda a derecha (jefe a la derecha).
  const horiz = matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  const yDe = (f) => 100 - ((f + 0.5) / N) * 100;
  const pos2 = (n) => (horiz ? { l: 100 - yDe(n.f), t: n.x * 100 } : { l: n.x * 100, t: yDe(n.f) });
  let lineas = '';
  for (const fila of mapa) for (const n of fila) for (const j of n.sig) {
    const m = mapa[n.f + 1][j];
    const hecho = pos && G.run.ruta?.some((r) => r.f === n.f && r.i === n.i) && G.run.ruta.some((r) => r.f === m.f && r.i === m.i);
    const a = pos2(n), b = pos2(m);
    lineas += `<line x1="${a.l}" y1="${a.t}" x2="${b.l}" y2="${b.t}" class="${hecho ? 'hecha' : ''}"/>`;
  }
  const nodoHtml = (n) => {
    const k = n.f + ':' + n.i;
    const hecho = G.run.ruta?.some((r) => r.f === n.f && r.i === n.i);
    const actual = pos && pos.f === n.f && pos.i === n.i;
    const icono = n.tipo === 'jefe' ? `<img src="${retrato(n.sp)}" alt="" class="ico-jefe">`
      : n.tipo === 'combate' ? `<svg viewBox="0 0 16 16" class="ico" shape-rendering="crispEdges"><path fill="#14213d" d="M2 2h3v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v2h-2v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1V9H8V8H7V7H6V6H5V5H4V4H3V3H2z"/><path fill="#14213d" d="M14 2v3h-1v1h-1v1h-1v1h-1v1H9V8h1V7h1V6h1V5h1V4h1V3h1zM2 12h2v-1h1v-1h1v1h1v1H6v1H5v1H4v1H2z"/><path fill="#14213d" d="M12 10h1v1h1v1h-1v1h-1v1h-1v-1h-1v-1h1v-1h1z"/></svg>`
      : `<img src="${RAIZ}assets/ui/${ICONO[n.tipo]}" alt="" class="ico">`;
    return `<button class="nodo t-${n.tipo} ${disp.has(k) ? 'disp' : ''} ${hecho ? 'hecho' : ''} ${actual ? 'actual' : ''}"
      style="left:${pos2(n).l}%;top:${pos2(n).t}%" data-f="${n.f}" data-i="${n.i}" ${disp.has(k) ? '' : 'disabled'}
      aria-label="${NOMBRE_NODO[n.tipo]}${disp.has(k) ? '' : ' (no disponible)'}">
      ${icono}<span>${NOMBRE_NODO[n.tipo]}</span></button>`;
  };
  app.innerHTML = `
  <div class="pant mapa">
    <header class="ayuda"><p id="ayuda">Toca un círculo que brille para avanzar. Al final espera el jefe${mapa[5][0].sp ? ': <b>' + esc(ESP[mapa[5][0].sp].n) + '</b>' : ''}.</p></header>
    <div class="mapa-cuerpo">
      ${equipoMini()}
      <div class="mapa-caja">
        <div class="mapa-lienzo">
          <svg class="lineas" viewBox="0 0 100 100" preserveAspectRatio="none">${lineas}</svg>
          ${filasArriba.flat().map(nodoHtml).join('')}
        </div>
      </div>
    </div>
  </div>`;
  app.querySelectorAll('.nodo.disp').forEach((b) => b.addEventListener('click', () => {
    const n = mapa[+b.dataset.f][+b.dataset.i];
    G.run.pos = { f: n.f, i: n.i };
    (G.run.ruta ||= []).push({ f: n.f, i: n.i });
    entrarNodo(n);
  }));
}

function entrarNodo(n) {
  if (n.tipo === 'descanso') return pantallaDescanso();
  if (n.tipo === 'cofre') return pantallaPremio('Cofre', 'Algo pequeño pero útil (los combates dan más). Elige uno:', 'cofre', 1, pantallaMapa);
  empezarCombate(n);
}

// ---------------------------------------------------------------- mejoras
// De equipo (las da el combate o la élite).
const MEJORAS = [
  { id: 'vigor', n: 'Vigor', d: '+12 PS máx. a todo el equipo (y los cura).', apl: (r) => r.equipo.forEach((u) => { u.psMax += 12; if (u.ps > 0) u.ps += 12; }) },
  { id: 'fuerza', n: 'Garra afilada', d: '+12 % de daño de todo el equipo.', apl: (r) => { r.mods.jugador.danio *= 1.12; } },
  { id: 'coraza', n: 'Coraza', d: '−12 % de daño recibido.', apl: (r) => { r.mods.jugador.recibido *= 0.88; } },
  { id: 'baya', n: 'Bayas', d: 'Cura un 60 % de PS a todo el equipo.', apl: (r) => r.equipo.forEach((u) => { if (u.ps > 0) u.ps = Math.min(u.psMax, u.ps + Math.round(u.psMax * 0.6)); }) },
  { id: 'area', n: 'Concentración', d: '+10 de potencia a los ataques de área.', apl: (r) => { r.mods.jugador.potArea += 10; } },
];
// Del cofre: más flojas que las del combate.
const OBJETOS = [
  { id: 'baya-p', n: 'Baya pequeña', d: 'Cura un 30 % de PS a todo el equipo.', apl: (r) => r.equipo.forEach((u) => { if (u.ps > 0) u.ps = Math.min(u.psMax, u.ps + Math.round(u.psMax * 0.3)); }) },
  { id: 'piedra', n: 'Piedra dura', d: '+5 PS máx. a todo el equipo.', apl: (r) => r.equipo.forEach((u) => { u.psMax += 5; if (u.ps > 0) u.ps += 5; }) },
  { id: 'amuleto', n: 'Amuleto', d: '+5 % de daño de todo el equipo.', apl: (r) => { r.mods.jugador.danio *= 1.05; } },
  { id: 'caramelo', n: 'Caramelo', d: 'El más débil del equipo sube 1 nivel.', apl: (r) => subirNivel([...r.equipo].sort((a, b) => a.nv - b.nv || a.psMax - b.psMax)[0]) },
];

/** Mejoras de un personaje concreto (las que hacen que cada partida sea distinta). */
function mejorasDe(u) {
  const [, pri, area] = u.movs;
  const l = [];
  if (!u.hecho?.tecnica) l.push({ n: `${pri.n} +15`, d: `Potencia de ${pri.n} ${pri.pot} → ${pri.pot + 15}.`, apl: () => { pri.pot += 15; marcar(u, 'tecnica'); } });
  if (!u.hecho?.alcance) l.push({ n: `${pri.n} llega más lejos`, d: `Alcance ${pri.max} → ${pri.max + 1} casillas.`, apl: () => { pri.max += 1; pri.desc = `A distancia (hasta ${pri.max}).`; marcar(u, 'alcance'); } });
  if (!pri.drena) l.push({ n: 'Drenaje', d: `${pri.n} le cura la mitad del daño que hace.`, apl: () => { pri.drena = true; pri.desc += ' Drena.'; } });
  if (area.recMax > 1) l.push({ n: `${area.n} sin recarga`, d: 'Su ataque de área se puede usar todos los turnos.', apl: () => { area.recMax = 1; area.desc = area.desc.replace(' Un turno sí y otro no.', ''); } });
  if (!u.hecho?.paso) l.push({ n: 'Paso ágil', d: `Movimiento ${u.mov} → ${u.mov + 1}.`, apl: () => { u.mov += 1; marcar(u, 'paso'); } });
  l.push({ n: 'Entrenamiento', d: 'Sube 2 niveles (+10 % de ataque, defensa y PS).', apl: () => { subirNivel(u); subirNivel(u); } });
  return l.map((m) => ({ ...m, sp: u.sp, quien: u.n }));
}
function marcar(u, k) { (u.hecho ||= {})[k] = true; }

/** Ofertas: el cofre da 2 objetos; el combate, 2 mejoras de personaje (de dos distintos) y 1 de equipo. */
function ofertas(r, clase) {
  const tomar = (lista) => lista.splice(Math.floor(r.rng() * lista.length), 1)[0];
  if (clase === 'cofre') { const pool = OBJETOS.slice(); return [tomar(pool), tomar(pool)]; }
  const vivos = r.equipo.filter((u) => u.ps > 0);
  const quienes = (vivos.length ? vivos : r.equipo).slice().sort(() => r.rng() - 0.5).slice(0, 2);
  const res = quienes.map((u) => tomar(mejorasDe(u)));
  res.push(tomar(MEJORAS.slice()));
  return res;
}

/** `subidas`: texto opcional con las subidas de nivel que se acaban de ganar. */
function pantallaPremio(titulo, texto, clase, veces, despues, subidas = '') {
  G.pantalla = 'premio';
  const r = G.run;
  const ops = ofertas(r, clase);
  app.innerHTML = `
  <div class="pant premio">
    <header class="ayuda"><p id="ayuda">${esc(texto)}</p></header>
    ${equipoMini()}
    <h2 class="titulo-premio">${esc(titulo)}</h2>
    ${subidas ? `<p class="subidas">${subidas}</p>` : ''}
    <div class="mejoras">${ops.map((m, i) => `<button class="mejora ${m.sp ? 'pers' : ''}" data-i="${i}">
      ${m.sp ? `<img src="${retrato(m.sp)}" alt="" width="40" height="40">` : ''}
      <div><b>${m.quien ? esc(m.quien) + ': ' : ''}${esc(m.n)}</b><span>${esc(m.d)}</span></div></button>`).join('')}</div>
  </div>`;
  app.querySelectorAll('.mejora').forEach((b) => b.addEventListener('click', () => {
    const m = ops[+b.dataset.i];
    m.apl(r); r.mejoras.push(m.id || m.n);
    if (veces > 1) pantallaPremio(titulo, 'Te toca otra más:', clase, veces - 1, despues);
    else despues();
  }));
}

function pantallaDescanso() {
  G.pantalla = 'descanso';
  const curas = G.run.equipo.map((u) => {
    const antes = Math.max(0, u.ps);
    u.ps = Math.min(u.psMax, Math.max(antes, 1) + Math.round(u.psMax * 0.5));
    return u.ps - antes;
  });
  app.innerHTML = `
  <div class="pant premio">
    <header class="ayuda"><p id="ayuda">Un rato junto al farolillo. El equipo recupera la mitad de sus PS.</p></header>
    ${equipoMini()}
    <h2 class="titulo-premio">Descanso</h2>
    <ul class="curas">${G.run.equipo.map((u, i) => `<li><b>${esc(u.n)}</b> +${curas[i]} PS</li>`).join('')}</ul>
    <div class="pie"><button class="btn prim grande" id="seguir">Seguir</button></div>
  </div>`;
  app.querySelector('#seguir').addEventListener('click', pantallaMapa);
}

// ---------------------------------------------------------------- combate
async function empezarCombate(nodo) {
  G.pantalla = 'combate';
  const r = G.run;
  const rng = r.rng;
  const enemigos = montarEnemigos(nodo, rng);
  const salida = [{ c: 2, r: 6 }, { c: 1, r: 5 }, { c: 4, r: 6 }];
  r.equipo.forEach((u, i) => {
    u.c = salida[i].c; u.r = salida[i].r; u.dir = i === 2 ? 6 : 2;
    u.movido = false; u.actuado = false; u.origen = null;
    for (const m of u.movs) m.rec = 0;
  });
  r.stats.porCombate = {};
  const campo = {
    unidades: [...r.equipo.filter((u) => u.ps > 0), ...enemigos],
    rocas: generarRocas(rng, 3 + Math.floor(rng() * 3)),
  };
  const etapa = `${NOMBRE_NODO[nodo.tipo]} · ${nodo.f + 1}/6`;
  app.innerHTML = `
  <div class="pant combate">
    <header class="ayuda"><span class="etapa">${esc(etapa)}</span><p id="ayuda">Cargando…</p></header>
    <main class="zona"><div class="caja-tablero"></div><div class="banner" id="banner"></div></main>
    <section class="panel">
      <div class="ficha" id="ficha"></div>
      <div class="movs" id="movs"></div>
      <div class="acciones">
        <button class="btn sec" id="deshacer">Deshacer</button>
        <button class="btn sec" id="esperar">Esperar</button>
        <button class="btn prim" id="principal">Fin de turno</button>
      </div>
    </section>
  </div>`;
  const tablero = crearTablero(app.querySelector('.caja-tablero'), { alTocarCelda: (c, rr, uHit) => tocarCelda(c, rr, uHit) });
  C = {
    nodo, campo, tablero, modo: 'cargando', sel: null, movIdx: -1, previa: null, ocupado: true,
    turno: 1, inspect: null, isla: ISLAS[nodo.f] || 'prado', verPeligro: false, finArmado: 0, bloqueo: 0, aviso: '',
  };
  app.querySelector('#deshacer').addEventListener('click', deshacer);
  app.querySelector('#esperar').addEventListener('click', esperarUnidad);
  app.querySelector('#principal').addEventListener('click', botonPrincipal);
  pintarPanel();
  const anims = ['Idle', 'Walk', 'Attack', 'Hurt', 'Faint'];
  await Promise.race([
    Promise.all(campo.unidades.map((u) => S.precargar(u.sp, anims))),
    new Promise((res) => setTimeout(res, 5000)),
  ]);
  if (C?.campo !== campo) return;
  tablero.cargar(campo, C.isla);
  C.ocupado = false;
  empezarTurnoJugador(true);
  if (!G.tutorialVisto && !q.has('sintuto')) mostrarTutorial();
}

// Mini tutorial arriba (no tapa a tus unidades); cada paso avanza al hacer lo que pide.
const PASOS_TUTO = [
  { t: '1 · Mover', p: 'Toca a uno de los tuyos y luego una casilla azul, o toca a un rival para ir a por él.', hasta: 'movido' },
  { t: '2 · Atacar', p: 'Elige un ataque abajo: el número rojo es el daño. Toca otra vez el objetivo o «Confirmar».', hasta: 'actuado' },
  { t: '3 · Cuidado', p: 'Lo rayado en rojo es donde te pegan en su turno. Cuando los tres hayan actuado, juega el rival.', hasta: null },
];
function mostrarTutorial() {
  G.tuto = { i: 0 };
  pintarTutorial();
}
function pintarTutorial() {
  document.querySelector('.tuto')?.remove();
  if (!G.tuto || !C) return;
  const paso = PASOS_TUTO[G.tuto.i];
  const el = document.createElement('div');
  el.className = 'tuto';
  el.innerHTML = `<div class="tuto-caja" role="dialog" aria-label="Cómo se juega"><div><b>${paso.t}</b><p>${paso.p}</p></div>
    <button class="btn ${paso.hasta ? 'sec' : 'prim'}" id="tuto-ok">${paso.hasta ? 'Saltar' : '¡A jugar!'}</button></div>`;
  el.querySelector('#tuto-ok').addEventListener('click', cerrarTutorial);
  app.querySelector('.pant').append(el);
}
function cerrarTutorial() {
  document.querySelector('.tuto')?.remove();
  G.tuto = null; G.tutorialVisto = true; ponerLS('tactico.tuto', '1');
}
function pasoTutorial(evento) {
  if (!G.tuto || PASOS_TUTO[G.tuto.i].hasta !== evento) return;
  G.tuto.i++;
  pintarTutorial();
}

function ayuda(html) { const el = document.getElementById('ayuda'); if (el) el.innerHTML = html; }
function banner(texto, clase = '') {
  const el = document.getElementById('banner');
  if (!el) return;
  el.textContent = texto;
  el.className = 'banner ver ' + clase;
  el.style.animationDuration = (1200 / VEL) + 'ms';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'banner'; }, 1200 / VEL);
}

function pendientes() { return vivos(C.campo, 'jugador').filter((u) => !u.actuado); }
const celdas = (set) => [...set].map((k) => { const [c, r] = k.split(',').map(Number); return { c, r }; });
/** En el turno 1 los rivales están en guardia: no se mueven (solo atacan si ya te tienen a tiro). */
const enGuardia = () => C.turno === 1;

function puedeDeshacer(u) {
  if (!u || !u.movido || u.actuado || !u.origen) return false;
  if (u.origen.c === u.c && u.origen.r === u.r) return false;
  const o = unidadEn(C.campo, u.origen.c, u.origen.r);
  return !o || o === u;
}

function resaltarActual() {
  const t = C.tablero;
  const rival = C.modo === 'rival';
  const base = { turnoJugador: !rival, pendientes: rival ? [] : pendientes().map((u) => u.uid) };
  let amen = [];
  if (!rival && C.modo !== 'fin') {
    if (C.inspect && C.inspect.bando === 'rival' && C.inspect.ps > 0) amen = celdas(amenaza(C.campo, C.inspect, enGuardia()));
    else if (C.verPeligro && C.modo === 'libre') amen = celdas(amenazaTotal(C.campo, 'jugador', enGuardia()));
  }
  const marcaInspect = C.inspect ? { c: C.inspect.c, r: C.inspect.r } : null;
  if (!C.sel || C.modo === 'libre' || rival) {
    t.resaltar({ ...base, amenaza: amen, sel: marcaInspect });
    t.ponerEtiquetas([]);
    return;
  }
  const sel = { c: C.sel.c, r: C.sel.r };
  if (C.modo === 'mover') {
    const alc = [...alcanzables(C.campo, C.sel).values()].map((n) => ({ c: n.c, r: n.r }));
    const pel = amenazaTotal(C.campo, 'jugador', enGuardia());
    t.resaltar({ ...base, sel, amenaza: amen, alcance: alc, alerta: alc.filter((p) => pel.has(clave(p.c, p.r))) });
    t.ponerEtiquetas([]);
  } else if (C.modo === 'accion') {
    t.resaltar({ ...base, sel });
    t.ponerEtiquetas([]);
  } else {
    const m = C.sel.movs[C.movIdx];
    const rango = casillasRango(C.campo, m, C.sel);
    t.resaltar({ ...base, sel, rango, area: C.previa ? C.previa.area : [] });
    t.ponerEtiquetas(C.previa ? C.previa.golpes.map((g) => ({
      c: g.u.c, r: g.u.r, texto: g.ef === 0 ? 'Inmune' : (g.ko ? 'KO ' : '−') + (g.ko ? '' : g.danio),
      clase: g.ko ? 'ko' : g.ef > 1 ? 'muy' : g.ef < 1 ? 'poco' : '',
    })) : []);
  }
}

function textoEficacia(ef) {
  if (ef === 0) return 'no le afecta';
  if (ef >= 2) return '¡muy eficaz!';
  if (ef < 1) return 'poco eficaz';
  return '';
}

function actualizarAyuda() {
  const m = C.modo;
  if (m === 'rival') return ayuda('Turno rival…');
  if (m === 'fin' || m === 'cargando') return;
  if (C.aviso) { const a = C.aviso; C.aviso = ''; return ayuda(a); }
  const rivalInsp = C.inspect && C.inspect.bando === 'rival';
  if (m === 'libre') {
    if (rivalInsp) return ayuda(`<b>${esc(C.inspect.n)}</b> (rival). Lo <b class="rojo">rayado</b> es donde puede atacarte${enGuardia() ? ' este turno: aún no se mueve' : ' en su turno'}.`);
    if (C.verPeligro) return ayuda('Lo <b class="rojo">rayado</b> es donde te pueden pegar los rivales en su turno.');
    if (enGuardia()) return ayuda('<b>Turno 1.</b> Los rivales aún no se mueven. Toca a uno de los tuyos.');
    return ayuda(`<b>Turno ${C.turno}.</b> Toca a uno de los tuyos (o su retrato abajo).`);
  }
  if (m === 'mover') {
    if (rivalInsp) return ayuda(`<b>${esc(C.inspect.n)}</b> no está a tu alcance este turno. Lo <b class="rojo">rayado</b> es donde ataca él.`);
    return ayuda('Toca una casilla <b class="azul">azul</b>, o un rival para ir a por él. <b class="rojo">!</b> = ahí te pueden pegar.');
  }
  if (m === 'accion') return ayuda(`Elige un ataque de <b>${esc(C.sel.n)}</b> abajo, o «Esperar».`);
  if (m === 'objetivo') return ayuda('Nadie a tiro con ese ataque. Prueba otro, o «Esperar».');
  if (m === 'confirmar' && C.previa) {
    const p = C.previa;
    const partes = p.golpes.map((g) => {
      const extra = [textoEficacia(g.ef), g.fl ? 'flanqueo' : '', g.choque ? `choque +${g.choque}` : '', g.empuje ? 'empuja' : '']
        .filter(Boolean).join(', ');
      return `${esc(g.u.n)} <b>${g.ef === 0 ? 0 : g.danio}</b>${g.ko ? ' KO' : ''}${extra ? ' (' + extra + ')' : ''}`;
    });
    return ayuda(`${esc(p.m.n)}: ${partes.join(' · ')}. <small>Toca otra vez o «Confirmar».</small>`);
  }
}

function fichaHtml(u) {
  if (!u) {
    return `<div class="ficha-vacia"><span>Toca a uno de los tuyos, o a un rival para ver su alcance.</span>
      <button class="btn sec peligro ${C.verPeligro ? 'on' : ''}" id="peligro" aria-pressed="${C.verPeligro}">${C.verPeligro ? 'Ocultar peligro' : 'Ver peligro'}</button></div>`;
  }
  const f = Math.max(0, u.ps) / u.psMax;
  return `<img src="${retrato(u.sp, u.ps < u.psMax * 0.3 ? 'Pain' : 'Normal')}" alt="" width="40" height="40" class="${u.bando}">
    <div class="ficha-txt"><div><b>${esc(u.n)}</b>${u.bando === 'jugador' ? ` <small>Nv ${u.nv}</small>` : ''}${u.jefe ? ' <em class="jefe">Jefe</em>' : u.elite ? ' <em class="jefe">Élite</em>' : ''} ${u.tipos.map(chip).join('')}</div>
    <div class="ps"><div class="barra"><i style="width:${Math.round(f * 100)}%;background:${f > 0.5 ? '#59d65a' : f > 0.25 ? '#f2c335' : '#ff4d3d'}"></i></div>
    <span>${Math.max(0, u.ps)}/${u.psMax} PS · Mov ${u.mov}${u.vuela ? ' (vuela)' : ''}</span></div></div>`;
}

function textoAlcance(m) {
  return m.forma === 'linea' ? 'línea de 3' : m.forma === 'cruz' ? `área a ${m.min}-${m.max}` : m.max === 1 ? 'pegado' : `a ${m.min}-${m.max}`;
}

function movHtml(u, m, i) {
  const pot = m.pot + (m.id === 'area' && u.bando === 'jugador' ? G.run.mods.jugador.potArea : 0);
  const extra = `${m.empuja ? '<em>empuja</em>' : ''}${m.drena ? '<em>drena</em>' : ''}${m.rec > 0 ? `<em class="rec">recarga ${m.rec}</em>` : ''}`;
  if (u.bando === 'rival') {
    // Del rival solo se informa: no son botones.
    return `<div class="mov info" style="--c:${COLOR_TIPO[m.tipo]}"><b>${esc(m.n)}</b><span>${esc(nombreTipo(m.tipo))} · ${pot} · ${textoAlcance(m)}</span>${extra}</div>`;
  }
  const sel = C.sel === u && C.movIdx === i;
  const puede = C.sel === u && !u.actuado && m.rec === 0 && ['accion', 'objetivo', 'confirmar'].includes(C.modo) && !C.ocupado;
  return `<button class="mov ${sel ? 'sel' : ''}" data-mov="${i}" style="--c:${COLOR_TIPO[m.tipo]}" ${puede ? '' : 'disabled'}>
    <b>${esc(m.n)}</b><span>${esc(nombreTipo(m.tipo))} · ${pot} · ${textoAlcance(m)}</span>${extra}</button>`;
}

/** Sin nadie elegido: retratos del equipo con PS (más fáciles de tocar que el sprite). */
function equipoHtml() {
  return vivos(C.campo, 'jugador').map((u) => {
    const f = Math.max(0, u.ps) / u.psMax;
    return `<button class="eq" data-uid="${u.uid}" ${u.actuado || C.modo !== 'libre' || C.ocupado ? 'disabled' : ''}>
      <img src="${retrato(u.sp, u.ps < u.psMax * 0.3 ? 'Pain' : 'Normal')}" alt="" width="32" height="32">
      <span class="eq-txt"><b>${esc(u.n)}</b><small>Nv ${u.nv}${u.actuado ? ' · hecho' : ''}</small>
      <span class="barra"><i style="width:${Math.round(f * 100)}%;background:${f > 0.5 ? '#59d65a' : f > 0.25 ? '#f2c335' : '#ff4d3d'}"></i></span></span></button>`;
  }).join('');
}

function pintarPanel() {
  if (!C) return;
  const u = C.sel || C.inspect;
  document.getElementById('ficha').innerHTML = fichaHtml(u);
  document.getElementById('peligro')?.addEventListener('click', () => { C.verPeligro = !C.verPeligro; pintarPanel(); });
  const movs = document.getElementById('movs');
  const jug = C.modo !== 'rival' && C.modo !== 'fin' && !C.ocupado && C.modo !== 'cargando';
  movs.classList.toggle('equipo', !u);
  if (u) {
    movs.innerHTML = u.movs.map((m, i) => movHtml(u, m, i)).join('');
    movs.querySelectorAll('button.mov').forEach((b) => b.addEventListener('click', () => elegirMov(+b.dataset.mov)));
  } else if (C.modo !== 'cargando') {
    movs.innerHTML = equipoHtml();
    movs.querySelectorAll('.eq').forEach((b) => b.addEventListener('click', () => {
      const x = vivos(C.campo, 'jugador').find((o) => o.uid === +b.dataset.uid);
      if (x && !x.actuado && C.modo === 'libre' && !C.ocupado) { C.finArmado = 0; seleccionar(x); }
    }));
  } else movs.innerHTML = '';
  const bD = document.getElementById('deshacer'), bE = document.getElementById('esperar'), bP = document.getElementById('principal');
  bD.disabled = !(jug && puedeDeshacer(C.sel));
  bE.disabled = !(jug && C.sel && !C.sel.actuado);
  const n = pendientes().length;
  bP.classList.remove('confirmar', 'armado');
  if (C.modo === 'confirmar') { bP.textContent = 'Confirmar'; bP.classList.add('confirmar'); }
  else if (C.finArmado) { bP.textContent = `¿Terminar? Quedan ${n}`; bP.classList.add('armado'); }
  else bP.textContent = 'Fin de turno';
  bP.disabled = !jug || (C.modo !== 'confirmar' && performance.now() < C.bloqueo);
  actualizarAyuda();
  resaltarActual();
}

function seleccionar(u) {
  C.sel = u; C.inspect = null; C.movIdx = -1; C.previa = null;
  if (!u.movido) { u.origen = { c: u.c, r: u.r }; C.modo = 'mover'; }
  else C.modo = 'accion';
  pintarPanel();
}

function deseleccionar() {
  C.sel = null; C.movIdx = -1; C.previa = null; C.modo = 'libre';
  pintarPanel();
}

/** ¿La casilla tocada sirve por sí misma (destino o objetivo)? Entonces manda la baldosa sobre el sprite. */
function casillaUtil(c, r) {
  if (C.modo === 'mover') return alcanzables(C.campo, C.sel).has(clave(c, r));
  if (C.movIdx >= 0 && (C.modo === 'objetivo' || C.modo === 'confirmar')) return !!prever(C.campo, C.sel, C.sel.movs[C.movIdx], C.sel, c, r, G.run.mods);
  return false;
}

async function tocarCelda(c, r, uHit = null) {
  if (!C || C.ocupado || C.modo === 'rival' || C.modo === 'fin' || C.modo === 'cargando') return;
  C.finArmado = 0;
  let u = unidadEn(C.campo, c, r);
  // Tocar el cuerpo de un sprite (que asoma en la casilla de arriba) cuenta como tocar a esa unidad.
  if (!u && uHit && uHit.ps > 0 && !casillaUtil(c, r)) { u = uHit; c = u.c; r = u.r; }
  const propio = u && u.bando === 'jugador' && !u.actuado;
  if (C.modo === 'libre') {
    if (propio) return seleccionar(u);
    C.inspect = u && u.bando === 'rival' ? u : null;
    if (u && u.bando === 'jugador') C.aviso = `<b>${esc(u.n)}</b> ya ha actuado este turno.`;
    return pintarPanel();
  }
  if (C.modo === 'mover') {
    const alc = alcanzables(C.campo, C.sel);
    const nodo = alc.get(clave(c, r));
    if (nodo) {
      C.ocupado = true; C.inspect = null; pintarPanel();
      await C.tablero.andar(C.sel, ruta(nodo));
      C.sel.movido = true; C.ocupado = false; C.modo = 'accion';
      pasoTutorial('movido');
      return pintarPanel();
    }
    if (propio && u !== C.sel) return seleccionar(u);
    if (u && u.bando === 'rival') return irAPor(u);
    return deseleccionar();
  }
  // accion / objetivo / confirmar
  if (C.movIdx >= 0 && (C.modo === 'objetivo' || C.modo === 'confirmar')) {
    const m = C.sel.movs[C.movIdx];
    const pr = prever(C.campo, C.sel, m, C.sel, c, r, G.run.mods);
    if (pr) {
      const misma = C.previa && C.previa.c === c && C.previa.r === r ||
        (C.previa && pr.area.length === C.previa.area.length && pr.area.every((a, i) => a.c === C.previa.area[i].c && a.r === C.previa.area[i].r));
      if (C.modo === 'confirmar' && misma) return ejecutar();
      C.previa = pr; C.modo = 'confirmar';
      return pintarPanel();
    }
  }
  if (propio && u !== C.sel) return seleccionar(u);
  // Tocar a un rival sin ataque elegido (o fuera del alcance del elegido): se busca un ataque que llegue.
  if (u && u.bando === 'rival' && !C.sel.actuado) {
    for (const i of [1, 0, 2]) {
      const m = C.sel.movs[i];
      if (m.rec > 0) continue;
      const pr = prever(C.campo, C.sel, m, C.sel, c, r, G.run.mods);
      if (pr) { C.movIdx = i; C.previa = pr; C.modo = 'confirmar'; return pintarPanel(); }
    }
    C.aviso = `Desde aquí no le llega ningún ataque a <b>${esc(u.n)}</b>. Elige otro objetivo o «Esperar».`;
    return pintarPanel();
  }
}

/** Con alguien elegido sin mover, tocar a un rival: ir a la mejor casilla desde la que le llega un ataque. */
async function irAPor(obj) {
  const j = mejorAcercamiento(C.campo, C.sel, obj, G.run.mods, amenazaTotal(C.campo, 'jugador', enGuardia()));
  if (!j) { C.inspect = obj; return pintarPanel(); }   // no llega: se marca su alcance sin perder la selección
  C.ocupado = true; C.inspect = null; pintarPanel();
  await C.tablero.andar(C.sel, ruta(j.nodo));
  C.sel.movido = true; C.ocupado = false;
  const m = C.sel.movs[j.i];
  const pr = prever(C.campo, C.sel, m, C.sel, j.pr.c, j.pr.r, G.run.mods);
  if (pr) { C.movIdx = j.i; C.previa = pr; C.modo = 'confirmar'; } else C.modo = 'accion';
  pasoTutorial('movido');
  pintarPanel();
}

function elegirMov(i) {
  if (!C.sel || C.ocupado) return;
  C.finArmado = 0;
  const u = C.sel;
  const m = u.movs[i];
  if (m.rec > 0 || u.actuado) return;
  C.movIdx = i;
  // Preselecciona el mejor objetivo para ese ataque.
  const ops = opcionesDesde(C.campo, u, { c: u.c, r: u.r }, G.run.mods).filter((p) => p.m === m);
  if (ops.length) {
    ops.sort((a, b) => b.golpes.reduce((s, g) => s + g.danio + (g.ko ? 40 : 0), 0) - a.golpes.reduce((s, g) => s + g.danio + (g.ko ? 40 : 0), 0));
    C.previa = ops[0]; C.modo = 'confirmar';
  } else { C.previa = null; C.modo = 'objetivo'; }
  pintarPanel();
}

function deshacer() {
  if (!C.sel || C.ocupado || !puedeDeshacer(C.sel)) return;
  const u = C.sel;
  u.c = u.origen.c; u.r = u.origen.r; u.vx = u.c; u.vy = u.r;
  u.movido = false; C.modo = 'mover'; C.movIdx = -1; C.previa = null; C.finArmado = 0;
  pintarPanel();
}

function esperarUnidad() {
  if (!C.sel || C.ocupado) return;
  C.sel.movido = true; C.sel.actuado = true;
  despuesDeActuar();
}

function botonPrincipal() {
  if (!C || C.ocupado) return;
  if (C.modo === 'confirmar') return ejecutar();
  if (performance.now() < C.bloqueo) return;
  const n = pendientes().length;
  // Si quedan unidades sin actuar, el primer toque solo pregunta (un toque de más no regala el turno).
  if (n && !C.finArmado) {
    C.finArmado = performance.now();
    pintarPanel();
    const marca = C.finArmado;
    setTimeout(() => { if (C && C.finArmado === marca) { C.finArmado = 0; pintarPanel(); } }, 3000);
    return;
  }
  C.finArmado = 0;
  finTurno();
}

async function ejecutar() {
  if (!C.previa || C.ocupado) return;
  const u = C.sel, pr = C.previa;
  C.ocupado = true; C.previa = null; C.modo = 'accion'; C.finArmado = 0;
  C.tablero.ponerEtiquetas([]);
  C.tablero.resaltar({ turnoJugador: true, area: pr.area, pendientes: [] });
  pintarPanelBloqueado();
  ayuda(`<b>${esc(u.n)}</b> usa ${esc(pr.m.n)}.`);
  await resolverAccion(u, pr);
  u.movido = true; u.actuado = true;
  C.ocupado = false;
  if (await comprobarFin()) return;
  despuesDeActuar();
}

function pintarPanelBloqueado() {
  app.querySelectorAll('.panel button').forEach((b) => { b.disabled = true; });
}

function despuesDeActuar() {
  C.sel = null; C.movIdx = -1; C.previa = null; C.modo = 'libre'; C.inspect = null;
  // «Fin de turno» queda apagado un momento: un toque repetido en el mismo sitio no termina el turno.
  C.bloqueo = performance.now() + 450;
  setTimeout(() => { if (C && C.modo === 'libre' && !C.ocupado) pintarPanel(); }, 470);
  pasoTutorial('actuado');
  pintarPanel();
  if (!pendientes().length) {
    C.ocupado = true;
    setTimeout(() => { if (C) { C.ocupado = false; finTurno(); } }, 380 / VEL);
  }
}

/** Animación y efectos de un ataque (vale para los dos bandos). */
async function resolverAccion(u, pr) {
  const t = C.tablero;
  const st = G.run.stats;
  const m = pr.m;
  await t.atacar(u, pr.c, pr.r);
  const lejos = dist(u, pr) > 1 || m.forma !== 'uno';
  if (lejos) await t.proyectil(u, { c: pr.c, r: pr.r }, m.tipo);
  if (m.recMax) m.rec = m.recMax;
  const heridas = [];
  let total = 0;
  for (const g of pr.golpes) {
    const o = g.u;
    const antes = o.ps;
    o.ps = Math.max(0, o.ps - g.danio);
    const hecho = antes - o.ps;
    total += hecho;
    if (u.bando === 'jugador') {
      st.hecho += hecho; st.por[u.uid] = (st.por[u.uid] || 0) + hecho; st.porCombate[u.uid] = (st.porCombate[u.uid] || 0) + hecho;
    } else st.recibido += hecho;
    t.flotante(o.c, o.r, g.ef === 0 ? 'Inmune' : '−' + g.danio, g.ef > 1 ? 'muy' : g.ef === 0 ? 'nulo' : g.ef < 1 ? 'poco' : '');
    if (g.ef > 1) setTimeout(() => t.flotante(o.c, o.r - 0.6, '¡Muy eficaz!', 'nota'), 120 / VEL);
    else if (g.ef > 0 && g.ef < 1) setTimeout(() => t.flotante(o.c, o.r - 0.6, 'Poco eficaz', 'nota gris'), 120 / VEL);
    if (g.choque) setTimeout(() => t.flotante(o.c, o.r - 0.6, '¡Choque!', 'nota'), 240 / VEL);
    if (g.fl && u.bando === 'jugador') setTimeout(() => t.flotante(o.c, o.r - 1.1, 'Flanqueo', 'nota azul'), 360 / VEL);
    heridas.push(t.herir(o, antes));
  }
  if (m.drena && total > 0 && u.ps > 0) {
    const cura = Math.min(u.psMax - u.ps, Math.round(total * 0.5));
    if (cura > 0) { u.ps += cura; u.psVis = u.ps; t.flotante(u.c, u.r, '+' + cura, 'cura'); }
  }
  await Promise.all(heridas);
  for (const g of pr.golpes) {
    if (g.empuje && g.u.ps > 0 && !unidadEn(C.campo, g.empuje.c, g.empuje.r)) await t.deslizar(g.u, g.empuje.c, g.empuje.r);
  }
  const caidos = pr.golpes.filter((g) => g.u.ps <= 0).map((g) => g.u);
  if (caidos.length) {
    for (const o of caidos) { t.flotante(o.c, o.r, 'KO', 'ko'); if (o.bando === 'rival') st.kos++; }
    await Promise.all(caidos.map((o) => t.desaparecer(o)));
  }
  await t.esperar(120);
}

async function comprobarFin() {
  if (!vivos(C.campo, 'rival').length) {
    C.modo = 'fin'; C.ocupado = true; pintarPanelBloqueado();
    ayuda('<b>¡Victoria!</b>');
    banner('¡Victoria!', 'gana');
    await C.tablero.esperar(1100);
    terminarCombate(true);
    return true;
  }
  if (!vivos(C.campo, 'jugador').length) {
    C.modo = 'fin'; C.ocupado = true; pintarPanelBloqueado();
    ayuda('Tu equipo ha caído…');
    banner('Derrota', 'pierde');
    await C.tablero.esperar(1100);
    terminarCombate(false);
    return true;
  }
  return false;
}

function terminarCombate(gana) {
  const r = G.run;
  const nodo = C.nodo;
  C.tablero.destruir();
  C = null;
  document.querySelector('.tuto')?.remove();
  if (!gana) return pantallaResultado(false);
  r.stats.combates++;
  r.stats.piso = nodo.f + 1;
  r.stats.faroles += nodo.tipo === 'jefe' ? 5 : nodo.tipo === 'elite' ? 2 : 1;
  // Tras ganar: los debilitados se levantan y el resto recupera algo.
  for (const u of r.equipo) u.ps = u.ps <= 0 ? Math.round(u.psMax * REVIVE) : Math.min(u.psMax, u.ps + Math.round(u.psMax * CURA_VICTORIA));
  // Todos suben un nivel; el que más daño ha hecho en este combate, uno más.
  const pc = r.stats.porCombate;
  const mvp = [...r.equipo].sort((a, b) => (pc[b.uid] || 0) - (pc[a.uid] || 0))[0];
  r.equipo.forEach((u) => subirNivel(u));
  const extra = mvp && pc[mvp.uid] > 0 && subirNivel(mvp);
  const subidas = `Todos suben de nivel.${extra ? ` <b>${esc(mvp.n)}</b> ha sido el mejor: +1 extra (Nv ${mvp.nv}).` : ''}`;
  if (nodo.tipo === 'jefe') return pantallaResultado(true);
  if (nodo.tipo === 'elite') return pantallaPremio('Botín de élite', 'Has vencido a una élite: eliges dos mejoras.', 'combate', 2, pantallaMapa, subidas);
  pantallaPremio('¡Combate ganado!', 'Elige una mejora.', 'combate', 1, pantallaMapa, subidas);
}

function empezarTurnoJugador(primero = false) {
  for (const u of vivos(C.campo, 'jugador')) {
    u.movido = false; u.actuado = false; u.origen = null;
    if (!primero) for (const m of u.movs) m.rec = Math.max(0, m.rec - 1);
  }
  C.modo = 'libre'; C.sel = null; C.inspect = null; C.finArmado = 0;
  banner(primero ? '¡A combatir!' : 'Tu turno', 'tuyo');
  pintarPanel();
}

async function finTurno() {
  if (!C || C.ocupado || C.modo === 'rival') return;
  const guardia = enGuardia();
  C.modo = 'rival'; C.sel = null; C.inspect = null; C.ocupado = true; C.finArmado = 0;
  G.run.stats.turnos++;
  pintarPanel();
  pintarPanelBloqueado();
  banner('Turno rival', 'rival');
  await C.tablero.esperar(650);
  for (const e of vivos(C.campo, 'rival')) for (const m of e.movs) m.rec = Math.max(0, m.rec - 1);
  for (const e of vivos(C.campo, 'rival')) {
    if (!C || e.ps <= 0) continue;
    // Turno 1: en guardia (no se mueven; atacan solo si ya te tienen a tiro).
    e.movido = guardia; e.actuado = false;
    C.inspect = e; pintarFichaSola(e);
    ayuda(guardia ? `Turno rival: <b>${esc(e.n)}</b> vigila sin moverse…` : `Turno rival: <b>${esc(e.n)}</b>…`);
    const j = mejorJugada(C.campo, e, G.run.mods, G.run.rng);
    if (j.destino && (j.destino.c !== e.c || j.destino.r !== e.r)) await C.tablero.andar(e, ruta(j.destino));
    if (j.accion) {
      const pr = prever(C.campo, e, j.accion.m, { c: e.c, r: e.r }, j.accion.c, j.accion.r, G.run.mods);
      if (pr) {
        C.tablero.resaltar({ turnoJugador: false, area: pr.area, pendientes: [] });
        await C.tablero.esperar(260);
        await resolverAccion(e, pr);
        C.tablero.resaltar({ turnoJugador: false, pendientes: [] });
      }
    }
    if (await comprobarFin()) return;
    await C.tablero.esperar(160);
  }
  if (!C) return;
  C.turno++;
  C.ocupado = false;
  empezarTurnoJugador();
}

function pintarFichaSola(u) {
  const f = document.getElementById('ficha');
  if (f) f.innerHTML = fichaHtml(u);
  const movs = document.getElementById('movs');
  if (movs) { movs.classList.remove('equipo'); movs.innerHTML = u.movs.map((m, i) => movHtml(u, m, i)).join(''); }
}

// ---------------------------------------------------------------- resultado
function pantallaResultado(gana) {
  G.pantalla = 'resultado';
  const r = G.run;
  const st = r.stats;
  const min = Math.floor((performance.now() - st.t0) / 60000), seg = Math.floor((performance.now() - st.t0) / 1000) % 60;
  const mvp = [...r.equipo].sort((a, b) => (st.por[b.uid] || 0) - (st.por[a.uid] || 0))[0];
  // Récord entre partidas.
  const rec = leerRecord();
  const nuevoPiso = st.piso > rec.piso;
  rec.partidas++; rec.piso = Math.max(rec.piso, st.piso); rec.victorias += gana ? 1 : 0; rec.faroles += st.faroles;
  ponerLS('tactico.record', JSON.stringify(rec));
  app.innerHTML = `
  <div class="pant resultado ${gana ? 'gana' : 'pierde'}">
    <h1>${gana ? '¡Victoria!' : 'Derrota'}</h1>
    <p class="sub">${gana ? `Has vencido al jefe, ${esc(ESP[r.mapa[5][0].sp].n)}.` : 'Tu equipo no ha podido más. ¡La próxima!'}</p>
    <div class="retratos">${r.equipo.map((u) => `<figure><img src="${retrato(u.sp, gana ? 'Joyous' : 'Pain')}" alt="${esc(u.n)}" width="40" height="40"><figcaption>Nv ${u.nv}</figcaption></figure>`).join('')}</div>
    <p class="faroles">+${st.faroles} farolillos${nuevoPiso ? ' · <b>¡nuevo récord!</b>' : ''}<small>En el juego completo, lo ganado aquí iría a las expediciones.</small></p>
    <ul class="stats">
      <li><span>Pisos superados</span><b>${st.piso}/6</b></li>
      <li><span>Combates ganados</span><b>${st.combates}</b></li>
      <li><span>Rivales derrotados</span><b>${st.kos}</b></li>
      <li><span>Daño hecho / recibido</span><b>${st.hecho} / ${st.recibido}</b></li>
      <li><span>Turnos</span><b>${st.turnos}</b></li>
      <li><span>Tiempo</span><b>${min} min ${seg} s</b></li>
      <li><span>Mejor del equipo</span><b>${esc(mvp.n)} (${st.por[mvp.uid] || 0})</b></li>
    </ul>
    <div class="pie"><button class="btn prim grande" id="otra">Otra vez</button></div>
  </div>`;
  app.querySelector('#otra').addEventListener('click', () => { G.run = null; elegirCompis(); pantallaInicio(); });
}

// Al girar el móvil, el mapa se vuelve a dibujar en la otra orientación.
matchMedia('(orientation: landscape) and (max-height: 520px)').addEventListener('change', () => {
  if (G.pantalla === 'mapa') pantallaMapa();
});

// ---------------------------------------------------------------- arranque y ganchos de prueba
window.__tactico = {
  get pantalla() { return G.pantalla; },
  get modo() { return C ? C.modo : null; },
  get ocupado() { return C ? C.ocupado : null; },
  /** Jugada sugerida para el jugador (para las pruebas automáticas): casillas a tocar y ataque. */
  consejo() {
    if (!C || C.modo === 'rival' || C.ocupado) return null;
    const u = pendientes()[0];
    if (!u) return null;
    const j = mejorJugada(C.campo, u, G.run.mods);
    return {
      u: { c: u.c, r: u.r }, destino: { c: j.destino.c, r: j.destino.r },
      mov: j.accion ? u.movs.indexOf(j.accion.m) : -1,
      objetivo: j.accion ? { c: j.accion.c, r: j.accion.r } : null,
    };
  },
  centroCelda(c, r) { return C ? C.tablero.centroCelda(c, r) : null; },
  resumen() {
    return C ? {
      jugador: vivos(C.campo, 'jugador').map((u) => [u.n, u.ps, u.c, u.r]),
      rival: vivos(C.campo, 'rival').map((u) => [u.n, u.ps, u.c, u.r]),
      turno: C.turno,
    } : null;
  },
  eficacia,
  FILAS,
};

// ?fps=1: contador de fotogramas por segundo (para probarlo en un móvil real).
if (q.has('fps')) {
  const el = document.createElement('div');
  el.className = 'fps';
  document.body.append(el);
  let n = 0, t0 = performance.now(), peor = 0, ant = t0;
  const tic = (t) => {
    n++; peor = Math.max(peor, t - ant); ant = t;
    if (t - t0 >= 500) { el.textContent = `${Math.round(n * 1000 / (t - t0))} fps · peor ${Math.round(peor)} ms`; n = 0; t0 = t; peor = 0; }
    requestAnimationFrame(tic);
  };
  requestAnimationFrame(tic);
}

(async function arrancar() {
  try {
    await Promise.all([cargarDatos(), S.iniciar(RAIZ + 'assets/')]);
    for (const sp of INICIALES) S.precargar(sp, ['Idle']);
    pantallaInicio();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="error">No se pudo cargar el juego: ${esc(e.message)}</p>`;
  }
})();
