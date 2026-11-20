// juego.js — reglas de la mazmorra por turnos. Sin DOM: se puede simular en Node.
// Cada acción del jugador = un turno: líder → compañeros (IA) → enemigos (IA).
// jugar(P, acción) cambia el estado al instante y devuelve la lista de eventos que la vista anima.

import { W, H, DIRS, generarPiso, libre, puedePasar, distancias } from './mapa.js';
import { crearRng } from './rng.js';
import { movimientosDe, ALCANCE_RAYO, NOMBRES } from './movs.js';

export const PISOS = 3;
export const INICIALES = ['0001', '0004', '0007', '0152', '0155', '0158', '0252', '0255', '0258'];
export const OBJETOS = {
  baya: { nombre: 'Baya Aranja', cura: 40, txt: 'Cura 40 PV al más herido del equipo.' },
  semilla: { nombre: 'Semilla Aturdidora', turnos: 4, radio: 3, txt: 'Aturde 4 turnos a los enemigos cercanos.' },
};
const K_DANO = 0.2;
const BOLSA_MAX = 5;          // con 9 se acumulaban bayas y el final no tenía tensión
const ALERTA = 6;             // a esta distancia los enemigos te ven y vienen a por ti
const EXP_NIVEL = 3;
const TEMAS = ['prado', 'cueva', 'volcan'];

// ---------------------------------------------------------------------------------------- creación

/**
 * datos = { especies (de especies.json), ef (tabla de tipos.json), nombresTipo, enManifest: Set }
 */
export function crearPartida({ semilla, lider, datos }) {
  const rng = crearRng(semilla);
  const P = {
    semilla, rng, datos, piso: 0, ents: [], items: [], bolsa: { baya: 2, semilla: 1 },
    turno: 0, turnoPiso: 0, exp: 0, nid: 1, fin: null, ev: [], m: null,
    visible: new Uint8Array(W * H), descubierto: new Uint8Array(W * H),
    jefeVisto: false, enEscalera: false, peligro: [],
    stats: { derrotados: 0, danoHecho: 0, danoRecibido: 0, objetos: 0, tIni: Date.now() },
  };
  const pool = especiesValidas(datos).filter(k => !datos.especies[k].leg && k !== lider);
  const acompanantes = rng.barajar(pool.slice()).slice(0, 2);
  const L = crearEnt(P, lider, 'eq', { lider: true });
  P.ents.push(L);
  ajustarLider(P, L);
  for (const sp of acompanantes) P.ents.push(crearEnt(P, sp, 'eq'));
  nuevoPiso(P);
  return P;
}

/**
 * Compensa la tabla de tipos: un líder de agua pega ×2 a muchos enemigos de la mazmorra y uno de planta
 * recibe ×2 de muchos. Se mira la ventaja media frente a los enemigos posibles y se ajustan ataque y defensa.
 */
function ajustarLider(P, L) {
  const esp = P.datos.especies;
  const pool = especiesValidas(P.datos).filter(k => !esp[k].leg && esp[k].tot <= 455);
  let suma = 0;
  for (const k of pool) {
    const t = esp[k].t;
    const doy = Math.max(...L.tipos.map(a => eficacia(P, a, t)));
    const recibo = Math.max(...t.map(a => eficacia(P, a, L.tipos)));
    suma += Math.log2(Math.max(0.25, doy) / Math.max(0.25, recibo));
  }
  const ventaja = suma / Math.max(1, pool.length);          // ~ -0.3 (planta) … +0.3 (agua)
  const f = Math.pow(2, -ventaja * 0.4);
  L.atk *= f; L.def *= f;
  L.ventaja = ventaja;
}

function especiesValidas(datos) {
  return Object.keys(datos.especies).filter(k => !datos.enManifest || datos.enManifest.has(k));
}

function crearEnt(P, sp, bando, o = {}) {
  const e = P.datos.especies[sp];
  const s = e.s;
  const base = { atk: (s[1] + s[3]) / 2, def: (s[2] + s[4]) / 2 };
  let hpMax, atk, def;
  if (bando === 'eq' && o.lider) {
    // Líder: las diferencias de stats se suavizan (la velocidad no cuenta en una mazmorra por turnos y
    // castigaba a Treecko y a los de fuego). Todos rondan lo mismo; el tipo sigue importando.
    const media = (s[1] + s[2] + s[3] + s[4] + s[5] * 0.6) / 4.6;
    atk = 0.2 * base.atk + 0.8 * media + 1; def = 0.2 * base.def + 0.8 * media + 1;
    hpMax = 56;
  } else if (bando === 'eq') {
    hpMax = Math.floor(s[0] * 0.5) + 25; atk = base.atk; def = base.def;
  } else {
    const p = o.piso || 1;
    hpMax = Math.floor(s[0] * 0.3) + 7 + p * 5;
    atk = base.atk * (0.80 + 0.05 * p); def = base.def * (0.85 + 0.05 * p);
    if (o.jefe) { hpMax = Math.round(hpMax * 3); def *= 1.1; }
  }
  return {
    id: P.nid++, sp, nombre: e.n, tipos: e.t.slice(), bando, lider: !!o.lider, jefe: !!o.jefe,
    x: 0, y: 0, dir: 0, hp: hpMax, hpMax, atk, def, nivel: o.jefe ? 12 : 5,
    movs: movimientosDe(e.t), aturdido: 0, vivo: true, alerta: false, rumbo: null, carga: false, enfriar: 0,
  };
}

function poolEnemigos(P, piso) {
  const rangos = [[0, 330], [290, 420], [330, 455]];
  const [a, b] = rangos[piso - 1];
  const esp = P.datos.especies;
  const equipo = new Set(P.ents.filter(e => e.bando === 'eq').map(e => e.sp));
  const lista = especiesValidas(P.datos).filter(k => !esp[k].leg && esp[k].tot >= a && esp[k].tot <= b && !equipo.has(k));
  if (piso !== 1) return lista;
  // Piso 1: sin enemigos que le hagan ×2 al líder (los de fuego morían ahí sin entender por qué).
  const L = P.ents.find(e => e.lider);
  const suave = L ? lista.filter(k => esp[k].t.every(t => eficacia(P, t, L.tipos) <= 1)) : lista;
  return suave.length >= 8 ? suave : lista;
}

function nuevoPiso(P) {
  const rng = P.rng;
  P.piso++;
  P.turnoPiso = 0;
  P.enEscalera = false;
  P.peligro = [];
  const ultimo = P.piso === PISOS;
  const m = generarPiso(rng, ultimo);
  m.tema = TEMAS[P.piso - 1];
  P.m = m;
  P.visible.fill(0); P.descubierto.fill(0);
  P.items = [];
  // Equipo: los debilitados vuelven con la mitad de PV; todos recuperan PP.
  const eq = P.ents.filter(e => e.bando === 'eq');
  P.ents = eq;
  for (const e of eq) {
    if (!e.vivo) { e.vivo = true; e.hp = Math.ceil(e.hpMax / 2); }
    e.aturdido = 0;
    for (const mv of e.movs) mv.pp = mv.ppMax;
  }
  const L = lider(P);
  L.x = m.inicio.x; L.y = m.inicio.y; L.dir = 0;
  for (const e of eq) if (!e.lider) { const c = casillaLibreCerca(P, L.x, L.y); e.x = c.x; e.y = c.y; e.dir = 0; }
  // Enemigos en salas que no son la de inicio.
  const pool = poolEnemigos(P, P.piso);
  const n = 5 + Math.min(P.piso, 2) + rng.ent(0, 1);
  for (let i = 0; i < n; i++) {
    const c = casillaAleatoria(P, (s) => s !== m.inicioSala && s !== m.jefeSala);
    if (!c) break;
    const en = crearEnt(P, rng.elegir(pool), 'en', { piso: P.piso });
    en.x = c.x; en.y = c.y; en.dir = rng.elegir([0, 2, 6]);
    P.ents.push(en);
  }
  if (ultimo) {
    const esp = P.datos.especies;
    const jefes = especiesValidas(P.datos).filter(k => !esp[k].leg && esp[k].tot >= 480 && esp[k].tot <= 600 && !esp[k].evo.length);
    const j = crearEnt(P, rng.elegir(jefes), 'en', { piso: P.piso, jefe: true });
    j.x = m.jefePos.x; j.y = m.jefePos.y;
    P.ents.push(j);
    // Una escolta en la sala del jefe.
    for (let i = 0; i < 1; i++) {
      const c = casillaLibreCerca(P, j.x, j.y, 2);
      const en = crearEnt(P, rng.elegir(pool), 'en', { piso: P.piso });
      en.x = c.x; en.y = c.y;
      P.ents.push(en);
    }
  }
  // Objetos: menos en los pisos 2-3 para que el final tenga tensión.
  const nObj = (P.piso === 1 ? 3 : 2) + rng.ent(0, 1);
  for (let i = 0; i < nObj; i++) {
    const c = casillaAleatoria(P, () => true, true);
    if (c) P.items.push({ id: P.nid++, clave: rng() < 0.55 ? 'baya' : 'semilla', x: c.x, y: c.y });
  }
  actualizarVision(P);
}

function ocupada(P, x, y) { return P.ents.some(e => e.vivo && e.x === x && e.y === y); }

function casillaAleatoria(P, filtroSala, sinObjeto = false) {
  const m = P.m;
  for (let k = 0; k < 400; k++) {
    const s = P.rng.elegir(m.salas);
    if (!filtroSala(s.id)) continue;
    const x = P.rng.ent(s.x, s.x + s.w - 1), y = P.rng.ent(s.y, s.y + s.h - 1);
    if (ocupada(P, x, y)) continue;
    if (m.escalera && m.escalera.x === x && m.escalera.y === y) continue;
    if (sinObjeto && P.items.some(it => it.x === x && it.y === y)) continue;
    return { x, y };
  }
  return null;
}

function casillaLibreCerca(P, x, y, minR = 1) {
  for (let r = minR; r < 6; r++) {
    const opciones = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (libre(P.m, nx, ny) && !ocupada(P, nx, ny)) opciones.push({ x: nx, y: ny });
    }
    if (opciones.length) return P.rng.elegir(opciones);
  }
  return { x, y };
}

// ---------------------------------------------------------------------------------------- consultas

export function lider(P) { return P.ents.find(e => e.lider); }
export function equipo(P) { return P.ents.filter(e => e.bando === 'eq'); }
export function entEn(P, x, y) { return P.ents.find(e => e.vivo && e.x === x && e.y === y) || null; }
const hostil = (a, b) => a.bando !== b.bando;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const verCelda = (P, x, y) => P.visible[y * W + x] === 1;

export function eficacia(P, tipoAtq, tiposDef) {
  const fila = P.datos.ef[tipoAtq] || {};
  let f = 1;
  for (const t of tiposDef) f *= (fila[t] != null ? fila[t] : 1);
  return f;
}

/** Casillas de un rayo en la dirección d hasta pared o un rival (atraviesa a los del mismo bando). */
function trazarRayo(P, e, d) {
  let x = e.x, y = e.y;
  for (let k = 0; k < ALCANCE_RAYO; k++) {
    if (!puedePasar(P.m, x, y, d)) break;
    x += DIRS[d][0]; y += DIRS[d][1];
    const o = entEn(P, x, y);
    if (o && hostil(e, o)) return { ent: o, hasta: { x, y } };
  }
  return { ent: null, hasta: { x, y } };
}

/** Objetivos que tocaría el movimiento mv de e en la dirección d. */
function objetivosEn(P, e, mv, d) {
  if (mv.clase === 'area') {
    const r = [];
    for (let k = 0; k < 8; k++) { const o = entEn(P, e.x + DIRS[k][0], e.y + DIRS[k][1]); if (o && hostil(e, o)) r.push(o); }
    return { lista: r, hasta: null };
  }
  if (mv.clase === 'rayo') {
    const t = trazarRayo(P, e, d);
    return { lista: t.ent && hostil(e, t.ent) ? [t.ent] : [], hasta: t.hasta };
  }
  if (!puedePasar(P.m, e.x, e.y, d)) return { lista: [], hasta: null };
  const o = entEn(P, e.x + DIRS[d][0], e.y + DIRS[d][1]);
  return { lista: o && hostil(e, o) ? [o] : [], hasta: null };
}

/** Dirección en la que el movimiento acierta a alguien (primero la pedida), o null. */
export function apuntar(P, e, mv, dPref) {
  if (mv.clase === 'area') return objetivosEn(P, e, mv, dPref).lista.length ? dPref : null;
  const orden = [dPref, ...[0, 1, 2, 3, 4, 5, 6, 7].filter(k => k !== dPref)];
  for (const d of orden) {
    const t = objetivosEn(P, e, mv, d).lista[0];
    if (t && (e.bando !== 'eq' || verCelda(P, t.x, t.y))) return d;
  }
  return null;
}

/** Para los botones: a quién le daría el movimiento i del líder y con qué eficacia. */
export function previsionMov(P, i) {
  const L = lider(P), mv = L.movs[i];
  const d = apuntar(P, L, mv, L.dir);
  if (d == null) return null;
  const lista = objetivosEn(P, L, mv, d).lista;
  if (!lista.length) return null;
  return { ent: lista[0], ef: Math.max(...lista.map(o => eficacia(P, mv.tipo, o.tipos))), dir: d };
}

// ---------------------------------------------------------------------------------------- turno

/**
 * acc: {tipo:'andar', dir} | {tipo:'mov', i, dir?} | {tipo:'objeto', clave} | {tipo:'esperar'}
 *    | {tipo:'girar', dir} (no gasta turno) | {tipo:'bajar'}
 * Devuelve los eventos. Si la acción no vale (pared, sin objetivo…), puede devolver solo un texto.
 */
export function jugar(P, acc) {
  P.ev = [];
  if (P.fin) return P.ev;
  const L = lider(P);
  let gasta = false;
  if (acc.tipo === 'girar') {
    if (acc.dir !== L.dir) { L.dir = acc.dir; P.ev.push({ t: 'giro', id: L.id, dir: acc.dir }); }
    return P.ev;
  }
  if (acc.tipo === 'andar') gasta = andar(P, L, acc.dir, true);
  else if (acc.tipo === 'mov') gasta = usarMov(P, L, acc.i, acc.dir != null ? acc.dir : L.dir);
  else if (acc.tipo === 'objeto') gasta = usarObjeto(P, acc.clave);
  else if (acc.tipo === 'esperar') gasta = true;
  else if (acc.tipo === 'bajar') {
    const esc = P.m.escalera;
    if (esc && L.x === esc.x && L.y === esc.y) {
      nuevoPiso(P);
      P.ev.push({ t: 'piso', n: P.piso });
      P.ev.push({ t: 'texto', s: P.piso === PISOS ? `Piso ${P.piso}. Algo grande espera al fondo…` : `Piso ${P.piso}. Recuperáis los PP.` });
    }
    return P.ev;
  }
  if (gasta) finTurno(P);
  return P.ev;
}

function texto(P, s, extra = {}) { P.ev.push({ t: 'texto', s, ...extra }); }

function moverA(P, e, x, y, d) {
  P.ev.push({ t: 'mover', id: e.id, x0: e.x, y0: e.y, x1: x, y1: y, dir: d });
  e.x = x; e.y = y; e.dir = d;
}

/** Devuelve true si gasta turno. */
function andar(P, e, d, esJugador) {
  const [dx, dy] = DIRS[d];
  const tx = e.x + dx, ty = e.y + dy;
  if (puedePasar(P.m, e.x, e.y, d)) {
    const o = entEn(P, tx, ty);
    if (o && hostil(e, o)) return usarMov(P, e, 0, d);       // chocar con un enemigo = Placaje
    if (o && !(esJugador && e.lider)) return false;
    if (o) {   // el líder se cambia de sitio con un compañero
      const x0 = e.x, y0 = e.y;
      moverA(P, e, tx, ty, d);
      moverA(P, o, x0, y0, (d + 4) % 8);
    } else moverA(P, e, tx, ty, d);
    if (e.lider) alPisar(P, e);
    return true;
  }
  // Diagonal bloqueada por una esquina: se desliza por el lado libre (más cómodo con el dedo).
  if (dx && dy && esJugador) {
    for (const [ax, ay] of [[dx, 0], [0, dy]]) {
      const d2 = DIRS.findIndex(([a, b]) => a === ax && b === ay);
      if (puedePasar(P.m, e.x, e.y, d2) && !entEn(P, e.x + ax, e.y + ay)) {
        moverA(P, e, e.x + ax, e.y + ay, d2);
        alPisar(P, e);
        return true;
      }
    }
  }
  if (e.dir !== d) { e.dir = d; P.ev.push({ t: 'giro', id: e.id, dir: d }); }
  return false;
}

function alPisar(P, L) {
  const i = P.items.findIndex(it => it.x === L.x && it.y === L.y);
  if (i >= 0) {
    const it = P.items[i];
    P.items.splice(i, 1);
    P.bolsa[it.clave] = Math.min(BOLSA_MAX, (P.bolsa[it.clave] || 0) + 1);
    P.ev.push({ t: 'coger', itemId: it.id, clave: it.clave });
    texto(P, `Has cogido: ${OBJETOS[it.clave].nombre}.`);
  }
}

function usarMov(P, e, i, dPref) {
  const mv = e.movs[i];
  if (!mv || mv.pp <= 0) { if (e.lider) texto(P, 'No quedan PP para ese movimiento.', { aviso: true }); return false; }
  const d = apuntar(P, e, mv, dPref);
  if (d == null) {
    if (e.lider) texto(P, mv.clase === 'rayo' ? 'Nadie a tiro en línea recta.' : 'No hay nadie a tu lado.', { aviso: true });
    return false;
  }
  e.dir = d;
  if (Number.isFinite(mv.pp)) mv.pp--;
  const { lista, hasta } = objetivosEn(P, e, mv, d);
  const golpes = [];
  let mejorEf = null;
  for (const o of lista) {
    const ef = eficacia(P, mv.tipo, o.tipos);
    const stab = e.tipos.includes(mv.tipo) ? 1.25 : 1;
    const dano = ef === 0 ? 0 : Math.max(1, Math.round(mv.pow * e.atk / o.def * K_DANO * ef * stab * (0.85 + P.rng() * 0.15)));
    o.hp = Math.max(0, o.hp - dano);
    if (e.bando === 'eq') P.stats.danoHecho += dano; else P.stats.danoRecibido += dano;
    golpes.push({ id: o.id, dano, ef, hp: o.hp, ko: o.hp <= 0 });
    if (mejorEf == null || Math.abs(Math.log2(ef || 0.01)) > Math.abs(Math.log2(mejorEf || 0.01))) mejorEf = ef;
    if (o.aturdido && dano > 0) o.aturdido = Math.max(0, o.aturdido - 1);
  }
  P.ev.push({ t: 'ataque', id: e.id, dir: d, mov: { nombre: mv.nombre, tipo: mv.tipo, clase: mv.clase }, hasta, golpes, s: `${e.nombre} usa ${mv.nombre}.` });
  if (mejorEf != null) {
    const o = lista[0];
    if (mejorEf === 0) texto(P, `No afecta a ${o.nombre}…`, { flotar: 'No afecta', id: o.id });
    else if (mejorEf > 1) texto(P, '¡Es muy eficaz!', { flotar: '¡Muy eficaz!', id: o.id, fuerte: true });
    else if (mejorEf < 1) texto(P, 'No es muy eficaz…', { flotar: 'Poco eficaz', id: o.id });
  }
  for (const o of lista) if (o.hp <= 0 && o.vivo) debilitar(P, o);
  return true;
}

function debilitar(P, o) {
  o.vivo = false;
  P.ev.push({ t: 'ko', id: o.id });
  if (o.bando === 'en') {
    P.stats.derrotados++;
    texto(P, `${o.nombre} se ha debilitado.`);
    if (o.jefe) { P.fin = { victoria: true }; P.ev.push({ t: 'fin', victoria: true }); return; }
    P.exp++;
    if (P.exp % EXP_NIVEL === 0) {
      for (const e of equipo(P)) {
        e.nivel++; e.hpMax += 4; if (e.vivo) e.hp = Math.min(e.hpMax, e.hp + 8);
        e.atk *= 1.06; e.def *= 1.05;
      }
      P.ev.push({ t: 'nivel', ids: equipo(P).filter(e => e.vivo).map(e => e.id) });
      texto(P, `¡El equipo sube al nivel ${lider(P).nivel}!`, { bueno: true });
    }
  } else if (o.lider) {
    texto(P, `${o.nombre} se ha debilitado…`);
    P.fin = { victoria: false }; P.ev.push({ t: 'fin', victoria: false });
  } else texto(P, `${o.nombre} se ha debilitado. Volverá en el siguiente piso.`);
}

function usarObjeto(P, clave) {
  if (!P.bolsa[clave]) { texto(P, `No te quedan: ${OBJETOS[clave].nombre}.`, { aviso: true }); return false; }
  if (clave === 'baya') {
    const vivos = equipo(P).filter(e => e.vivo && e.hp < e.hpMax).sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax);
    if (!vivos.length) { texto(P, 'Nadie necesita curarse.', { aviso: true }); return false; }
    const o = vivos[0];
    const c = Math.min(OBJETOS.baya.cura, o.hpMax - o.hp);
    o.hp += c;
    P.bolsa.baya--; P.stats.objetos++;
    P.ev.push({ t: 'cura', id: o.id, cant: c, hp: o.hp });
    texto(P, `${o.nombre} come una Baya Aranja y recupera ${c} PV.`, { bueno: true });
    return true;
  }
  if (clave === 'semilla') {
    const L = lider(P);
    const lista = P.ents.filter(e => e.vivo && e.bando === 'en' && !e.aturdido && cheb(e, L) <= OBJETOS.semilla.radio && verCelda(P, e.x, e.y));
    if (!lista.length) { texto(P, 'No hay enemigos cerca (sin aturdir).', { aviso: true }); return false; }
    for (const e of lista) {
      e.aturdido = OBJETOS.semilla.turnos;
      if (e.carga) { e.carga = false; P.peligro = []; P.ev.push({ t: 'peligro', casillas: P.peligro.slice() }); texto(P, `¡${e.nombre} pierde la concentración!`, { bueno: true }); }
    }
    P.bolsa.semilla--; P.stats.objetos++;
    P.ev.push({ t: 'aturdir', ids: lista.map(e => e.id), origen: { x: L.x, y: L.y } });
    texto(P, lista.length === 1 ? `¡${lista[0].nombre} se queda aturdido!` : `¡${lista.length} enemigos se quedan aturdidos!`, { bueno: true });
    return true;
  }
  return false;
}

function finTurno(P) {
  turnoAliados(P);
  if (!P.fin) turnoEnemigos(P);
  P.turno++; P.turnoPiso++;
  if (P.fin) return;
  // Al andar se recupera algo de vida (1 PV cada 2 turnos).
  if (P.turno % 2 === 0) for (const e of equipo(P)) if (e.vivo && e.hp < e.hpMax) e.hp++;
  // Refuerzos de vez en cuando, lejos y fuera de la vista.
  const vivos = P.ents.filter(e => e.vivo && e.bando === 'en').length;
  if (P.turnoPiso % 30 === 0 && vivos < 9) {
    const L = lider(P);
    for (let k = 0; k < 30; k++) {
      const c = casillaAleatoria(P, () => true);
      if (c && !verCelda(P, c.x, c.y) && Math.max(Math.abs(c.x - L.x), Math.abs(c.y - L.y)) > 8) {
        const en = crearEnt(P, P.rng.elegir(poolEnemigos(P, P.piso)), 'en', { piso: P.piso });
        en.x = c.x; en.y = c.y; P.ents.push(en); break;
      }
    }
  }
  const antes = new Set(P.ents.filter(e => e.vivo && e.bando === 'en' && verCelda(P, e.x, e.y)).map(e => e.id));
  actualizarVision(P);
  const nuevos = P.ents.filter(e => e.vivo && e.bando === 'en' && verCelda(P, e.x, e.y) && !antes.has(e.id));
  if (nuevos.length) P.ev.push({ t: 'avistar', ids: nuevos.map(e => e.id) });
  const jefe = P.ents.find(e => e.jefe && e.vivo);
  if (jefe && !P.jefeVisto && verCelda(P, jefe.x, jefe.y)) {
    P.jefeVisto = true; jefe.alerta = true; jefe.enfriar = 3;   // unos turnos de margen antes de cargar
    P.ev.push({ t: 'jefe', id: jefe.id });
    texto(P, `¡${jefe.nombre}, el guardián del fondo, te cierra el paso!`, { fuerte: true });
  }
  const L = lider(P), esc = P.m.escalera;
  const sobre = !!(esc && L.x === esc.x && L.y === esc.y);
  if (sobre && !P.enEscalera) P.ev.push({ t: 'escalera' });
  P.enEscalera = sobre;
}

/** Mejor movimiento con objetivo para la IA: {i, d, valor} o null. */
function mejorMov(P, e, soloCerca = false) {
  let mejor = null;
  e.movs.forEach((mv, i) => {
    if (mv.pp <= 0 || (soloCerca && mv.clase === 'rayo')) return;
    const d = apuntar(P, e, mv, e.dir);
    if (d == null) return;
    const lista = objetivosEn(P, e, mv, d).lista;
    const stab = e.tipos.includes(mv.tipo) ? 1.25 : 1;
    let valor = 0;
    for (const o of lista) valor += mv.pow * stab * eficacia(P, mv.tipo, o.tipos);
    if (Number.isFinite(mv.pp)) valor *= 0.97;   // guarda un poco los PP
    if (!mejor || valor > mejor.valor) mejor = { i, d, valor };
  });
  return mejor && mejor.valor > 0 ? mejor : null;
}

function pasoHacia(P, e, dist) {
  let mejor = null, md = dist[e.y * W + e.x];
  if (md < 0) md = 9999;
  for (let d = 0; d < 8; d++) {
    if (!puedePasar(P.m, e.x, e.y, d)) continue;
    const x = e.x + DIRS[d][0], y = e.y + DIRS[d][1];
    const v = dist[y * W + x];
    if (v < 0 || v >= md || ocupada(P, x, y)) continue;
    md = v; mejor = d;
  }
  if (mejor == null) return false;
  moverA(P, e, e.x + DIRS[mejor][0], e.y + DIRS[mejor][1], mejor);
  return true;
}

function turnoAliados(P) {
  const L = lider(P);
  const distL = distancias(P.m.celdas, [L]);
  const enemigosVistos = P.ents.filter(e => e.vivo && e.bando === 'en' && verCelda(P, e.x, e.y));
  for (const a of equipo(P)) {
    if (a.lider || !a.vivo || P.fin) continue;
    if (enPeligro(P, a.x, a.y) && apartarse(P, a)) continue;
    const cerca = mejorMov(P, a, true);
    if (cerca) { usarMov(P, a, cerca.i, cerca.d); continue; }
    const lejos = mejorMov(P, a);
    if (lejos && P.rng() < 0.7) { usarMov(P, a, lejos.i, lejos.d); continue; }
    // ¿Algún enemigo cerca del líder? A por él. Si no, seguir al líder.
    const obj = enemigosVistos.filter(o => o.vivo && cheb(o, L) <= 4 && cheb(o, a) <= 6);
    if (obj.length && distL[a.y * W + a.x] <= 4) {
      if (pasoHacia(P, a, distancias(P.m.celdas, obj))) continue;
    }
    if (distL[a.y * W + a.x] > 1) pasoHacia(P, a, distL);
  }
}

function turnoEnemigos(P) {
  const eq = equipo(P).filter(e => e.vivo);
  let distEq = null;
  for (const e of P.ents) {
    if (e.bando !== 'en' || !e.vivo || P.fin) continue;
    if (e.aturdido > 0) { e.aturdido--; continue; }
    const cerca = eq.filter(o => o.vivo).reduce((m, o) => Math.min(m, cheb(o, e)), 99);
    if (e.jefe) { if (P.jefeVisto) e.alerta = true; }
    else if (cerca <= ALERTA) e.alerta = true;
    else if (cerca > 12) e.alerta = false;
    if (!e.alerta) { vagar(P, e); continue; }
    if (e.jefe && turnoJefe(P, e, eq, cerca)) continue;
    const golpe = mejorMov(P, e, true);
    if (golpe) {
      // Algo de variedad: a veces el golpe flojo.
      if (golpe.i !== 0 && P.rng() < 0.3 && apuntar(P, e, e.movs[0], golpe.d) != null) usarMov(P, e, 0, golpe.d);
      else usarMov(P, e, golpe.i, golpe.d);
      continue;
    }
    const rayo = mejorMov(P, e);
    if (rayo && P.rng() < 0.45) { usarMov(P, e, rayo.i, rayo.d); continue; }
    if (!distEq) distEq = distancias(P.m.celdas, eq.filter(o => o.vivo));
    if (!pasoHacia(P, e, distEq)) vagar(P, e, 0.3);
  }
}

// ---------------------------------------------------------------------------------------- jefe
// El guardián avisa: un turno marca en rojo las casillas de su alrededor y al siguiente golpea fuerte ahí.
// Decisión para el jugador: apartarse (sus compañeros también lo hacen) o aturdirlo con una Semilla.
export const enPeligro = (P, x, y) => P.peligro.some(c => c.x === x && c.y === y);

function turnoJefe(P, j, eq, cerca) {
  if (j.enfriar > 0) j.enfriar--;
  if (j.carga) {
    j.carga = false; j.enfriar = 3;
    const tipo = j.tipos[0];
    const mv = { nombre: (NOMBRES[tipo] || NOMBRES.normal)[2], tipo, clase: 'area', pow: 95 };
    const lista = eq.filter(o => o.vivo && enPeligro(P, o.x, o.y));
    const golpes = [];
    for (const o of lista) {
      const ef = eficacia(P, tipo, o.tipos);
      const dano = ef === 0 ? 0 : Math.max(1, Math.round(mv.pow * j.atk / o.def * K_DANO * Math.max(1, ef) * 1.25 * (0.9 + P.rng() * 0.1)));
      o.hp = Math.max(0, o.hp - dano);
      P.stats.danoRecibido += dano;
      golpes.push({ id: o.id, dano, ef, hp: o.hp, ko: o.hp <= 0 });
    }
    P.ev.push({ t: 'ataque', id: j.id, dir: j.dir, mov: mv, hasta: null, golpes, s: `${j.nombre} usa ${mv.nombre}.` });
    P.peligro = [];
    P.ev.push({ t: 'peligro', casillas: P.peligro.slice() });
    if (!lista.length) { P.stats.esquivas = (P.stats.esquivas || 0) + 1; texto(P, '¡Lo habéis esquivado!', { bueno: true }); }
    for (const o of lista) if (o.hp <= 0 && o.vivo) debilitar(P, o);
    return true;
  }
  if (cerca <= 2 && j.enfriar <= 0 && P.rng() < 0.7) {
    j.carga = true;
    P.peligro = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (libre(P.m, j.x + dx, j.y + dy)) P.peligro.push({ x: j.x + dx, y: j.y + dy });
    }
    P.ev.push({ t: 'carga', id: j.id });
    P.ev.push({ t: 'peligro', casillas: P.peligro.slice() });
    texto(P, `¡${j.nombre} está cargando! Sal de las casillas rojas.`, { fuerte: true });
    return true;
  }
  return false;
}

/** Un paso a una casilla vecina libre y sin peligro. */
function apartarse(P, e) {
  let mejor = null;
  for (let d = 0; d < 8; d++) {
    if (!puedePasar(P.m, e.x, e.y, d)) continue;
    const x = e.x + DIRS[d][0], y = e.y + DIRS[d][1];
    if (ocupada(P, x, y) || enPeligro(P, x, y)) continue;
    if (mejor == null || d % 2 === 0) mejor = d;
  }
  if (mejor == null) return false;
  moverA(P, e, e.x + DIRS[mejor][0], e.y + DIRS[mejor][1], mejor);
  return true;
}

function vagar(P, e, prob = 0.6) {
  if (P.rng() > prob) return;
  const ds = [e.dir, e.dir, ...[0, 1, 2, 3, 4, 5, 6, 7]];
  for (let k = 0; k < 4; k++) {
    const d = k === 0 ? e.dir : P.rng.elegir(ds);
    if (puedePasar(P.m, e.x, e.y, d) && !ocupada(P, e.x + DIRS[d][0], e.y + DIRS[d][1])) {
      moverA(P, e, e.x + DIRS[d][0], e.y + DIRS[d][1], d);
      return;
    }
  }
}

export function actualizarVision(P) {
  const m = P.m, L = lider(P);
  P.visible.fill(0);
  const s = m.sala[L.y * W + L.x];
  const marcar = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) P.visible[y * W + x] = 1;
  };
  if (s >= 0) { const r = m.salas[s]; marcar(r.x - 1, r.y - 1, r.x + r.w, r.y + r.h); }
  marcar(L.x - 2, L.y - 2, L.x + 2, L.y + 2);
  for (let i = 0; i < W * H; i++) if (P.visible[i]) P.descubierto[i] = 1;
}

// ---------------------------------------------------------------------------------------- bot (pruebas)

/** Acción razonable para el líder (lo usan la prueba automática y la simulación). */
export function sugerir(P) {
  const L = lider(P);
  if (enPeligro(P, L.x, L.y)) {
    const j = P.ents.find(e => e.jefe && e.vivo);
    if (j && !j.aturdido && P.bolsa.semilla && cheb(j, L) <= OBJETOS.semilla.radio && P.rng() < 0.3) return { tipo: 'objeto', clave: 'semilla' };
    const d = dirSegura(P, L);
    if (d != null) return { tipo: 'andar', dir: d };
  }
  if (L.hp / L.hpMax < 0.4 && P.bolsa.baya) return { tipo: 'objeto', clave: 'baya' };
  const adyacentes = P.ents.filter(e => e.vivo && e.bando === 'en' && cheb(e, L) === 1);
  if (adyacentes.filter(e => !e.aturdido).length >= 2 && P.bolsa.semilla && L.hp / L.hpMax < 0.6) return { tipo: 'objeto', clave: 'semilla' };
  const m = mejorMov(P, L);
  if (m) return { tipo: 'mov', i: m.i, dir: m.d };
  const esc = P.m.escalera;
  if (esc && L.x === esc.x && L.y === esc.y && (P.turnoPiso > 60 || !frontera(P).length)) return { tipo: 'bajar' };
  // Destino: enemigo visto, objeto conocido, jefe, escalera (si ya toca) o lo inexplorado.
  const vistos = P.ents.filter(e => e.vivo && e.bando === 'en' && verCelda(P, e.x, e.y));
  const objs = P.items.filter(it => P.descubierto[it.y * W + it.x]);
  const front = frontera(P);
  let metas;
  if (vistos.length) metas = vistos;
  else if (objs.length) metas = objs;
  else if (esc && P.descubierto[esc.y * W + esc.x] && (P.turnoPiso > 60 || !front.length)) metas = [esc];
  else if (front.length) metas = front;
  else if (esc) metas = [esc];
  else metas = P.ents.filter(e => e.vivo && e.jefe);
  if (!metas.length) return { tipo: 'esperar' };
  const mejor = pasoHaciaMetas(P, L, metas);
  return mejor == null ? { tipo: 'esperar' } : { tipo: 'andar', dir: mejor };
}

function dirSegura(P, L) {
  for (let d = 0; d < 8; d++) {
    if (!puedePasar(P.m, L.x, L.y, d)) continue;
    const x = L.x + DIRS[d][0], y = L.y + DIRS[d][1];
    if (entEn(P, x, y)) continue;
    if (!enPeligro(P, x, y)) return d;
  }
  return null;
}

function pasoHaciaMetas(P, L, metas) {
  const dist = distancias(P.m.celdas, metas);
  let mejor = null, md = dist[L.y * W + L.x];
  if (md < 0) md = 9999;
  for (let d = 0; d < 8; d++) {
    if (!puedePasar(P.m, L.x, L.y, d)) continue;
    const x = L.x + DIRS[d][0], y = L.y + DIRS[d][1];
    const v = dist[y * W + x];
    const o = entEn(P, x, y);
    if (v < 0 || v >= md || (o && o.bando === 'en')) continue;
    md = v; mejor = d;
  }
  return mejor;
}

/**
 * «Explorar»: el paseo automático (lo idle como ayuda). Un paso hacia objetos vistos, lo inexplorado o la
 * escalera; se para al ver enemigos, al llegar a la escalera o con poca vida.
 * Devuelve { dir } o { parar: 'enemigo' | 'escalera' | 'vida' | 'nada' }.
 */
export function explorarPaso(P, o = {}) {
  const L = lider(P);
  if (P.ents.some(e => e.vivo && e.bando === 'en' && verCelda(P, e.x, e.y))) return { parar: 'enemigo' };
  if (L.hp / L.hpMax < 0.3) return { parar: 'vida' };
  const esc = P.m.escalera;
  if (!o.desdeEscalera && esc && L.x === esc.x && L.y === esc.y) return { parar: 'escalera' };
  const objs = P.items.filter(it => P.descubierto[it.y * W + it.x]);
  const front = frontera(P);
  let metas = objs.length ? objs : front.length ? front : [];
  if (!metas.length && esc && P.descubierto[esc.y * W + esc.x]) metas = [esc];
  if (!metas.length) { const j = P.ents.find(e => e.vivo && e.jefe); if (j) metas = [j]; }
  if (!metas.length) return { parar: 'nada' };
  const d = pasoHaciaMetas(P, L, metas);
  return d == null ? { parar: 'nada' } : { dir: d };
}

function frontera(P) {
  const r = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!P.descubierto[i] || P.m.celdas[i] !== 1) continue;
    if (!P.descubierto[i - 1] || !P.descubierto[i + 1] || !P.descubierto[i - W] || !P.descubierto[i + W]) r.push({ x, y });
  }
  return r;
}
