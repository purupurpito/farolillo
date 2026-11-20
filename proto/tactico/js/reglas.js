// reglas.js — Prototipo B. Reglas del combate en cuadrícula (sin gráficos): movimiento, alcance,
// daño con eficacia de tipos, flanqueo, empuje e IA.

import { eficacia, crearUnidad, especieAleatoria } from './datos.js';

export const COLS = 6;
export const FILAS = 7;
export const BONO_FLANQUEO = 1.25;
export const STAB = 1.2;
export const FACTOR_DANIO = 0.26;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const clave = (c, r) => c + ',' + r;
export const dentro = (c, r) => c >= 0 && r >= 0 && c < COLS && r < FILAS;
export const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);

export function vivos(campo, bando) { return campo.unidades.filter((u) => u.ps > 0 && (!bando || u.bando === bando)); }
export function unidadEn(campo, c, r) { return campo.unidades.find((u) => u.ps > 0 && u.c === c && u.r === r) || null; }
export const esRoca = (campo, c, r) => campo.rocas.has(clave(c, r));

/**
 * Casillas alcanzables por `u` (BFS en cruz). Se atraviesan aliados, no rivales; las rocas solo si vuela.
 * Devuelve Map clave → { c, r, d, previo } (incluye su propia casilla con d = 0).
 */
export function alcanzables(campo, u, desde = u, movMax = u.mov) {
  const res = new Map();
  const ini = { c: desde.c, r: desde.r, d: 0, previo: null };
  const cola = [ini];
  const vistos = new Map([[clave(desde.c, desde.r), ini]]);
  while (cola.length) {
    const n = cola.shift();
    const ocupante = unidadEn(campo, n.c, n.r);
    const libre = !esRoca(campo, n.c, n.r) && (!ocupante || ocupante === u);
    if (libre) res.set(clave(n.c, n.r), n);
    if (n.d >= movMax) continue;
    for (const [dc, dr] of DIRS) {
      const c = n.c + dc, r = n.r + dr;
      if (!dentro(c, r) || vistos.has(clave(c, r))) continue;
      if (esRoca(campo, c, r) && !u.vuela) continue;
      const o = unidadEn(campo, c, r);
      if (o && o.bando !== u.bando) continue;
      const m = { c, r, d: n.d + 1, previo: n };
      vistos.set(clave(c, r), m);
      cola.push(m);
    }
  }
  return res;
}

/** Ruta (lista de casillas, sin la de salida) hasta un nodo de alcanzables(). */
export function ruta(nodo) {
  const r = [];
  for (let n = nodo; n && n.previo; n = n.previo) r.unshift({ c: n.c, r: n.r });
  return r;
}

/** Casillas que se pueden tocar como objetivo de un movimiento desde `pos`. */
export function casillasRango(campo, m, pos) {
  const res = [];
  if (m.forma === 'linea') {
    for (const [dc, dr] of DIRS) {
      for (let i = 1; i <= m.max; i++) {
        const c = pos.c + dc * i, r = pos.r + dr * i;
        if (!dentro(c, r) || esRoca(campo, c, r)) break;
        res.push({ c, r });
      }
    }
    return res;
  }
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
    const d = Math.abs(c - pos.c) + Math.abs(r - pos.r);
    if (d >= m.min && d <= m.max) res.push({ c, r });
  }
  return res;
}

/** Casillas afectadas al apuntar a (c, r). */
export function areaDe(campo, m, pos, c, r) {
  if (m.forma === 'linea') {
    const dc = Math.sign(c - pos.c), dr = Math.sign(r - pos.r);
    if ((dc !== 0) === (dr !== 0)) return [];
    const res = [];
    for (let i = 1; i <= m.max; i++) {
      const x = pos.c + dc * i, y = pos.r + dr * i;
      if (!dentro(x, y) || esRoca(campo, x, y)) break;
      res.push({ c: x, r: y });
    }
    return res;
  }
  if (m.forma === 'cruz') {
    return [[0, 0], ...DIRS].map(([dc, dr]) => ({ c: c + dc, r: r + dr })).filter((p) => dentro(p.c, p.r));
  }
  return [{ c, r }];
}

/** ¿Hay otro del bando del atacante pegado al objetivo? (flanqueo) */
export function flanqueado(campo, atacante, pos, objetivo) {
  return campo.unidades.some((o) => o.ps > 0 && o !== atacante && o.bando === atacante.bando &&
    Math.abs(o.c - objetivo.c) + Math.abs(o.r - objetivo.r) === 1) ||
    false;
}

/** Daño de un golpe (determinista: lo que se previsualiza es lo que pasa). */
export function calcularDanio(campo, at, m, pos, obj, mods = {}) {
  const ef = eficacia(m.tipo, obj.tipos);
  const stab = at.tipos.includes(m.tipo) ? STAB : 1;
  const fl = flanqueado(campo, at, pos, obj);
  const pot = m.pot + (m.id === 'area' ? (mods[at.bando]?.potArea || 0) : 0);
  const base = pot * (at.atk / obj.def) * FACTOR_DANIO;
  const k = ef * stab * (fl ? BONO_FLANQUEO : 1) * (mods[at.bando]?.danio || 1) * (mods[obj.bando]?.recibido || 1);
  const danio = ef === 0 ? 0 : Math.max(1, Math.round(base * k));
  return { danio, ef, fl, stab: stab > 1 };
}

/**
 * Resultado previsto de usar `m` desde `pos` apuntando a (c, r): golpes a rivales, empuje y choque.
 * Devuelve null si no es un objetivo válido (no alcanza a nadie).
 */
export function prever(campo, at, m, pos, c, r, mods = {}) {
  const enRango = casillasRango(campo, m, pos).some((p) => p.c === c && p.r === r);
  if (!enRango) return null;
  const area = areaDe(campo, m, pos, c, r);
  const golpes = [];
  for (const p of area) {
    const o = unidadEn(campo, p.c, p.r);
    if (!o || o === at || o.bando === at.bando) continue;
    const g = calcularDanio(campo, at, m, pos, o, mods);
    g.u = o;
    if (m.empuja) {
      const dc = Math.sign(o.c - pos.c), dr = Math.sign(o.r - pos.r);
      const nc = o.c + dc, nr = o.r + dr;
      const bloqueado = !dentro(nc, nr) || esRoca(campo, nc, nr) || (unidadEn(campo, nc, nr) && unidadEn(campo, nc, nr) !== at);
      if (bloqueado) { g.choque = Math.max(4, Math.round(o.psMax * 0.12)); g.danio += g.ef === 0 ? 0 : g.choque; }
      else g.empuje = { c: nc, r: nr };
    }
    g.ko = g.danio >= o.ps;
    golpes.push(g);
  }
  if (!golpes.length) return null;
  return { m, area, golpes, c, r };
}

/** Todas las opciones de ataque de `u` desde `pos` (una por casilla objetivo útil). */
export function opcionesDesde(campo, u, pos, mods) {
  const res = [];
  // Para calcular flanqueo/alcance con la unidad ya movida, se coloca temporalmente.
  const oc = u.c, or = u.r;
  u.c = pos.c; u.r = pos.r;
  for (const m of u.movs) {
    if (m.rec > 0) continue;
    const vistas = new Set();
    for (const p of casillasRango(campo, m, pos)) {
      const pr = prever(campo, u, m, pos, p.c, p.r, mods);
      if (!pr) continue;
      const firma = m.id + '|' + pr.area.map((a) => clave(a.c, a.r)).join(';');
      if (vistas.has(firma)) continue;
      vistas.add(firma);
      res.push(pr);
    }
  }
  u.c = oc; u.r = or;
  return res;
}

function valorar(pr) {
  let v = 0;
  for (const g of pr.golpes) {
    v += Math.min(g.danio, g.u.ps);
    if (g.ko) v += 35 + (g.u.jefe ? 30 : 0);
    if (g.ef > 1) v += 4;
  }
  // El área tiene recarga: que no la gaste en un golpe flojo.
  if (pr.m.id === 'area' && pr.golpes.length === 1 && !pr.golpes[0].ko) v -= 6;
  return v;
}

/** Distancia de camino (ignorando unidades) entre casillas, para acercarse. */
function mapaDistancias(campo, objetivos, vuela) {
  const d = new Map();
  const cola = [];
  for (const o of objetivos) { d.set(clave(o.c, o.r), 0); cola.push(o); }
  while (cola.length) {
    const n = cola.shift();
    const k0 = d.get(clave(n.c, n.r));
    for (const [dc, dr] of DIRS) {
      const c = n.c + dc, r = n.r + dr;
      if (!dentro(c, r) || d.has(clave(c, r)) || (esRoca(campo, c, r) && !vuela)) continue;
      d.set(clave(c, r), k0 + 1);
      cola.push({ c, r });
    }
  }
  return d;
}

/**
 * Mejor jugada para `u`: { destino: {c,r,nodo}, accion: prever()|null }.
 * La usa la IA rival y el «consejo» de las pruebas automáticas.
 */
export function mejorJugada(campo, u, mods = {}, rng = Math.random) {
  const alc = u.movido ? new Map([[clave(u.c, u.r), { c: u.c, r: u.r, d: 0, previo: null }]]) : alcanzables(campo, u);
  const rivales = vivos(campo).filter((o) => o.bando !== u.bando);
  if (!rivales.length) return { destino: alc.get(clave(u.c, u.r)), accion: null };
  const dmap = mapaDistancias(campo, rivales, u.vuela);
  let mejor = null, mejorV = -Infinity;
  for (const nodo of alc.values()) {
    const ops = u.actuado ? [] : opcionesDesde(campo, u, nodo, mods);
    // Posición: un poco mejor no quedarse pegado a varios rivales si eres frágil.
    const pegados = rivales.filter((o) => Math.abs(o.c - nodo.c) + Math.abs(o.r - nodo.r) === 1).length;
    const riesgo = pegados * (u.ps < u.psMax * 0.4 ? 3 : 1);
    for (const pr of ops) {
      const v = valorar(pr) - riesgo - nodo.d * 0.1 + rng() * 2;
      if (v > mejorV) { mejorV = v; mejor = { destino: nodo, accion: pr }; }
    }
  }
  if (mejor && mejorV > 2) return mejor;
  // Sin ataque útil: acercarse al rival más cercano (el más débil si empatan).
  let mejorN = null, mejorD = Infinity;
  for (const nodo of alc.values()) {
    const d = dmap.get(clave(nodo.c, nodo.r));
    const v = (d == null ? 99 : d) + rng() * 0.5;
    if (v < mejorD) { mejorD = v; mejorN = nodo; }
  }
  return { destino: mejorN || alc.get(clave(u.c, u.r)), accion: null };
}

/** Coloca rocas al azar dejando libres las filas de salida y el campo conectado. */
export function generarRocas(rng, n) {
  for (let intento = 0; intento < 50; intento++) {
    const rocas = new Set();
    while (rocas.size < n) {
      const c = Math.floor(rng() * COLS), r = 2 + Math.floor(rng() * (FILAS - 4));
      rocas.add(clave(c, r));
    }
    // Conectividad: desde la fila de abajo se llega a la de arriba.
    const vistos = new Set([clave(0, FILAS - 1)]);
    const cola = [{ c: 0, r: FILAS - 1 }];
    while (cola.length) {
      const p = cola.shift();
      for (const [dc, dr] of DIRS) {
        const c = p.c + dc, r = p.r + dr;
        if (!dentro(c, r) || rocas.has(clave(c, r)) || vistos.has(clave(c, r))) continue;
        vistos.add(clave(c, r)); cola.push({ c, r });
      }
    }
    if (vistos.size === COLS * FILAS - rocas.size) return rocas;
  }
  return new Set();
}

/** Rivales de un nodo del mapa (fila f): cuántos, de qué fuerza y dónde salen. */
export function montarEnemigos(n, rng) {
  const f = n.f;
  const mult = 0.85 + 0.08 * f;
  const lista = [];
  if (n.tipo === 'jefe') {
    const jefe = crearUnidad(n.sp, 'rival', mult, { psMult: 1.8, atkMult: 1.0, jefe: true });
    lista.push(jefe);
    for (let i = 0; i < 2; i++) lista.push(crearUnidad(especieAleatoria(rng, 260, 380), 'rival', mult * 0.85));
  } else {
    const cuantos = f === 0 || n.tipo === 'elite' ? 2 : 3;
    const tope = f < 2 ? 380 : 440;
    for (let i = 0; i < cuantos; i++) lista.push(crearUnidad(especieAleatoria(rng, 240, tope), 'rival', mult));
    if (n.tipo === 'elite') {
      lista[0] = crearUnidad(especieAleatoria(rng, 430, 540), 'rival', mult, { psMult: 1.4, atkMult: 1.1, elite: true });
    }
  }
  // Casillas de salida arriba (filas 0-1), sin repetir.
  const libres = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < COLS; c++) libres.push({ c, r });
  for (const u of lista) {
    const p = libres.splice(Math.floor(rng() * libres.length), 1)[0];
    u.c = p.c; u.r = p.r; u.dir = 0;
  }
  return lista;
}


/**
 * Casillas que el rival `e` puede atacar en su próximo turno (moverse + alcance de sus ataques listos).
 * `quieto`: no se moverá (turno 1, en guardia). Devuelve un Set de claves.
 */
export function amenaza(campo, e, quieto = false) {
  const res = new Set();
  const nodos = quieto ? [{ c: e.c, r: e.r }] : [...alcanzables(campo, e).values()];
  const movs = e.movs.filter((m) => m.rec <= 1);   // la recarga baja 1 al empezar su turno
  for (const n of nodos) {
    for (const m of movs) {
      for (const p of casillasRango(campo, m, n)) {
        res.add(clave(p.c, p.r));
        if (m.forma === 'cruz') for (const [dc, dr] of DIRS) if (dentro(p.c + dc, p.r + dr)) res.add(clave(p.c + dc, p.r + dr));
      }
    }
  }
  return res;
}

/** Unión de la amenaza de todos los rivales vivos (de cara al bando `bando`). */
export function amenazaTotal(campo, bando = 'jugador', quieto = false) {
  const res = new Set();
  for (const e of vivos(campo).filter((o) => o.bando !== bando)) for (const k of amenaza(campo, e, quieto)) res.add(k);
  return res;
}

/**
 * Mejor casilla alcanzable por `u` desde la que algún ataque listo le da a `obj`.
 * Devuelve { nodo, pr, i } o null. Prefiere más daño, luego KO, luego menos pasos y casilla menos expuesta.
 */
export function mejorAcercamiento(campo, u, obj, mods = {}, peligro = null) {
  let mejor = null, mejorV = -Infinity;
  const oc = u.c, or = u.r;
  for (const nodo of alcanzables(campo, u).values()) {
    u.c = nodo.c; u.r = nodo.r;
    u.movs.forEach((m, i) => {
      if (m.rec > 0) return;
      for (const p of casillasRango(campo, m, nodo)) {
        const pr = prever(campo, u, m, nodo, p.c, p.r, mods);
        if (!pr) continue;
        const g = pr.golpes.find((x) => x.u === obj);
        if (!g) continue;
        const v = pr.golpes.reduce((s, x) => s + Math.min(x.danio, x.u.ps) + (x.ko ? 30 : 0), 0) - nodo.d * 0.3 -
          (peligro && peligro.has(clave(nodo.c, nodo.r)) ? 4 : 0) - (m.id === 'area' && pr.golpes.length === 1 ? 5 : 0);
        if (v > mejorV) { mejorV = v; mejor = { nodo, pr, i }; }
      }
    });
  }
  u.c = oc; u.r = or;
  return mejor;
}
