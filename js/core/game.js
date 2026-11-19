// Acciones sobre el guardado: la API que usa la UI (§15.2). Orquesta el núcleo. Sin DOM. Dueño: ESTADO.
// Todas mutan `save` y devuelven datos para la UI. Lista completa y eventos del bus en notes/estado.md.
// Errores de validación: se lanza Error con mensaje en castellano listo para enseñar.

import * as bus from './bus.js';
import { mulberry32, hashSeed } from './rng.js';
import { K, expSig, topeNivel, poderMon, multTipo, poderEquipo } from './formulas.js';
import * as sim from './sim.js';
import * as recruit from './recruit.js';
import * as evolve from './evolve.js';
import {
  nuevoGuardado, anotarDiario, reanclarReloj, equipoVacio, islaVacia, crearMon,
  MAX_POKEMON, AVISO_POKEMON, MAX_DIARIO_EXP, MAX_PENDIENTES_LLENO,
} from './state.js';
import * as eco from './economy.js';
import * as ev from './events.js';
import * as mis from './missions.js';

const H = 3600_000;
export const ROLES = ['expl', 'reco', 'apoyo'];
export const POSTURAS = ['prudente', 'equilibrada', 'audaz'];
export const HORAS_PATRULLA = [1, 4, 8];
/** Nombres visibles de objetos (de evolve.js). */
export { OBJETOS, nombreObjeto } from './evolve.js';

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

/**
 * Ctx = { datos, ahora, semana, clima, evento, noche, momento, tiposMisterio, rng? }.
 * clima: { "1": id, ..., "8": id, misterio: id } (ids de events.CLIMAS).
 */
export function crearCtx(datos, ahora = Date.now(), extra = {}) {
  const semana = ev.semanaDe(ahora);
  return {
    datos, ahora, semana,
    clima: ev.climasDeLaSemana(semana),
    evento: ev.eventoSemana(semana, datos),
    noche: ev.esNoche(ahora),
    momento: ev.momentoDia(ahora),
    tiposMisterio: ev.tiposMisterio(semana),
    ...extra,
  };
}

function rngDe(save, ctx, ...partes) {
  return ctx.rng || mulberry32(hashSeed(save.idDispositivo, ctx.ahora, ...partes));
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function buscarMon(save, uid) { return save.pokemon.find((m) => m.id === uid) || null; }

export function nombreMon(mon, datos) {
  return (mon && (mon.ap || datos?.especies?.[mon.sp]?.n)) || '';
}

/** uids que están ahora de expedición. */
export function ocupados(save) {
  const s = new Set();
  for (const e of save.equipos) if (e.exp) for (const u of e.exp.plan.equipo) s.add(u);
  return s;
}

/** uids reservados para un intercambio (v0.3). */
export function reservados(save) { return new Set(Object.keys(save.trade?.reserved || {})); }

/** ¿Puede salir de expedición? */
export function estaLibre(save, uid) { return !ocupados(save).has(uid) && !reservados(save).has(uid); }

/** Lista de uids libres. */
export function libres(save) {
  const o = ocupados(save), r = reservados(save);
  return save.pokemon.filter((m) => !o.has(m.id) && !r.has(m.id)).map((m) => m.id);
}

export function jefesVencidos(save) { return eco.jefesVencidos(save); }
export function tope(save) { return topeNivel(eco.jefesVencidos(save)); }

export function islaDesbloqueada(save, isla) {
  if (isla === 'misterio') return !!save.islas['3']?.jefe;
  return !!save.islas[isla];
}

/** Objeto isla (§3.3) o uno sintético para la Misterio. */
export function islaObj(isla, ctx) {
  if (isla === 'misterio') {
    return { id: 'misterio', clave: 'misterio', n: 'Mazmorra Misterio', tipos: ctx.tiposMisterio || ev.tiposMisterio(ctx.semana),
      F: 99, tBase: K.MISTERIO_TBASE, jefe: null, fondo: '#2b2140', especies: [], objetos: ['baya_grande'], leg: [] };
  }
  return ctx.datos.islaPorId[isla] || null;
}

/** Islas para el carrusel: [{ id, n, desbloqueada, pisoMax, jefe, F, clima }]. */
export function listaIslas(save, ctx) {
  const out = ctx.datos.islas.map((i) => ({
    id: i.id, n: i.n, tipos: i.tipos, F: i.F, desbloqueada: !!save.islas[i.id],
    pisoMax: save.islas[i.id]?.pisoMax || 0, jefe: !!save.islas[i.id]?.jefe,
    piedad: save.islas[i.id]?.piedad || 0, huellas: save.islas[i.id]?.huellas || {},
    clima: ctx.clima[i.id], dominio: save.islas[i.id]?.dominio || 0,
  }));
  out.push({ id: 'misterio', n: 'Mazmorra Misterio', tipos: ctx.tiposMisterio, F: 99,
    desbloqueada: islaDesbloqueada(save, 'misterio'), pisoMax: misterioRecord(save, ctx), jefe: false,
    piedad: 0, huellas: {}, clima: ctx.clima.misterio, dominio: 0 });
  return out;
}

function misterioRecord(save, ctx) { return save.misterio.wk === ctx.semana ? save.misterio.record : 0; }

/** Poder individual (sin tipos ni clima). */
export function poderDe(save, uid, ctx) {
  const m = buscarMon(save, uid);
  return m ? poderMon(m, ctx.datos.especies[m.sp]) : 0;
}

/** Ventaja de tipo de un Pokémon en una isla: { mult, simbolo: '▲'|'='|'▼' }. */
export function ventaja(save, uid, isla, ctx) {
  const m = buscarMon(save, uid);
  const io = islaObj(isla, ctx);
  if (!m || !io) return { mult: 1, simbolo: '=' };
  const t = multTipo(ctx.datos.especies[m.sp]?.t || [], io.tipos, ctx.datos.tipos.ef);
  const ct = ev.climaTipo(ctx.clima[isla], ctx.datos.especies[m.sp]?.t || []);
  const mult = t.mult * ct;
  return { mult, simbolo: mult >= 1.1 ? '▲' : mult <= 0.9 ? '▼' : '=' };
}

/** Estado de un equipo para la UI. estado: 'bloqueado' | 'libre' | 'fuera' | 'vuelta'. */
export function estadoEquipo(save, idx, ctx) {
  const e = save.equipos[idx];
  if (!e) return { idx, estado: 'bloqueado', muelle: idx };
  if (!e.exp) return { idx, estado: 'libre', miembros: e.miembros, roles: e.roles, ultimoPlan: e.ultimoPlan };
  const x = e.exp;
  const vuelta = ctx.ahora >= x.fin;
  let progreso = null;
  try { progreso = sim.estadoEn(x.registro, ctx.ahora); } catch { progreso = null; }
  return {
    idx, estado: vuelta ? 'vuelta' : 'fuera', miembros: x.plan.equipo, roles: x.plan.roles,
    isla: x.plan.isla, plan: x.plan, inicio: x.inicio, fin: x.fin, progreso,
    reclutas: vuelta ? contarReclutas(x.registro) : null,
  };
}

function contarReclutas(reg) {
  let n = 0;
  for (const r of reg.rondas || []) for (const e of r.encuentros || []) if (e.acepta) n++;
  return n;
}

/** Equipos que han vuelto y esperan a que se recojan. */
export function equiposDeVuelta(save, ctx) {
  return save.equipos.map((e, i) => (e.exp && ctx.ahora >= e.exp.fin ? i : -1)).filter((i) => i >= 0);
}

// ---------------------------------------------------------------------------
// Primer arranque y tutorial
// ---------------------------------------------------------------------------

/**
 * Crea la partida y lanza sola la expedición del tutorial con el guía de Líder (§9.2.12).
 * Devuelve { save, fin }.
 */
export function iniciarPartida({ guia, faro, nombre = '' }, ctx) {
  const rng = ctx.rng || mulberry32(hashSeed('nuevo', ctx.ahora, guia, faro, nombre));
  const save = nuevoGuardado({ guia, faro, nombre, ahora: ctx.ahora, rng });
  persistirDiaJugado(save, ctx);
  const g = save.pokemon[0];
  const plan = { equipo: [g.id], roles: ['lider'], isla: 1, modo: 'vuelta', hasta: K.TUTORIAL_PISOS,
    postura: 'equilibrada', dominio: 0, tutorial: true };
  const { fin } = enviar(save, 0, plan, ctx);
  return { save, fin };
}

// ---------------------------------------------------------------------------
// Planes y envío
// ---------------------------------------------------------------------------

/** Plan completo con valores por defecto (no valida). */
export function normalizarPlan(save, plan, ctx) {
  const io = islaObj(plan.isla, ctx);
  const equipo = (plan.equipo || []).filter(Boolean).slice(0, 3);
  const roles = equipo.map((_, i) => (i === 0 ? 'lider' : ROLES.includes(plan.roles?.[i]) ? plan.roles[i] : 'expl'));
  const misterio = plan.isla === 'misterio';
  const modo = misterio ? 'patrulla' : plan.modo === 'patrulla' ? 'patrulla' : 'vuelta';
  const F = io ? io.F : 1;
  const out = {
    equipo, roles, isla: plan.isla, modo,
    hasta: Math.max(1, Math.min(F, Math.round(plan.hasta || F))),
    horas: HORAS_PATRULLA.includes(plan.horas) ? plan.horas : 1,
    postura: POSTURAS.includes(plan.postura) ? plan.postura : 'equilibrada',
    dominio: misterio ? 0 : Math.max(0, Math.min(save.islas[plan.isla]?.dominio || 0, plan.dominio | 0)),
  };
  if (plan.tutorial) out.tutorial = true;
  return out;
}

/** Lanza Error si el plan no se puede enviar. */
export function validarPlan(save, idx, plan, ctx) {
  const e = save.equipos[idx];
  if (!e) throw new Error('Ese equipo aún no existe: mejora el Muelle.');
  if (e.exp) throw new Error('Ese equipo ya está de expedición.');
  if (!islaObj(plan.isla, ctx)) throw new Error('Esa isla no existe.');
  if (!islaDesbloqueada(save, plan.isla)) throw new Error('Esa isla aún está cerrada.');
  if (!plan.equipo.length) throw new Error('El equipo necesita un Líder.');
  if (new Set(plan.equipo).size !== plan.equipo.length) throw new Error('Un Pokémon no puede ir dos veces.');
  const o = ocupados(save), r = reservados(save);
  for (const u of plan.equipo) {
    const m = buscarMon(save, u);
    if (!m) throw new Error('Ese Pokémon ya no está en la cala.');
    if (o.has(u)) throw new Error(`${nombreMon(m, ctx.datos)} ya está de expedición.`);
    if (r.has(u)) throw new Error(`${nombreMon(m, ctx.datos)} está reservado para un intercambio.`);
  }
}

/** Semilla de la expedición que se enviaría ahora con ese equipo. */
export function semillaEnvio(save, idx, ctx) {
  return hashSeed(save.idDispositivo, 'exp', idx, ctx.ahora, save.tutorial.enviadas | 0);
}

/** Envía un equipo. Devuelve { fin }. Lanza Error si no se puede. */
export function enviar(save, idxEquipo, planIn, ctx) {
  const plan = normalizarPlan(save, planIn, ctx);
  validarPlan(save, idxEquipo, plan, ctx);
  // El guion de la primera hora (§6.6) lo congela sim.crearSnapshot a partir de save.tutorial.enviadas
  // (envíos sin contar el tutorial) y save.informesSinEspecial.
  const snapshot = sim.crearSnapshot(save, plan, ctx.datos);
  const semilla = semillaEnvio(save, idxEquipo, ctx);
  const registro = sim.resolverExpedicion({ plan, snapshot, semilla, inicio: ctx.ahora, ctx });
  const eq = save.equipos[idxEquipo];
  eq.exp = { plan, inicio: ctx.ahora, fin: registro.fin, semilla, snapshot, registro };
  eq.miembros = [...plan.equipo];
  eq.roles = [...plan.roles];
  const ultimo = { ...plan };
  if (ultimo.tutorial) { delete ultimo.tutorial; ultimo.hasta = islaObj(plan.isla, ctx).F; }
  eq.ultimoPlan = ultimo;
  if (plan.tutorial) { if (save.tutorial.paso < 1) save.tutorial.paso = 1; }
  else save.tutorial.enviadas = (save.tutorial.enviadas | 0) + 1;
  if (plan.postura === 'audaz') mis.progreso(save, 'audaz', {});
  if (plan.modo === 'patrulla' && ev.esPatrullaNocturna(ctx.ahora, plan.horas)) mis.progreso(save, 'patrullaNoche', {});
  save.ultimaVez = Math.max(save.ultimaVez, ctx.ahora);
  bus.emit('exp:enviada', { idx: idxEquipo, plan, fin: registro.fin });
  bus.emit('save:cambio', { motivo: 'enviar' });
  return { fin: registro.fin };
}

/** Repite el último plan del equipo (sin los que ya no estén o estén ocupados). null si no se puede. */
export function repetir(save, idxEquipo, ctx) {
  const eq = save.equipos[idxEquipo];
  if (!eq || eq.exp || !eq.ultimoPlan) return null;
  const plan = { ...eq.ultimoPlan };
  const o = ocupados(save), r = reservados(save);
  const pares = plan.equipo.map((u, i) => [u, plan.roles[i]]).filter(([u]) => buscarMon(save, u) && !o.has(u) && !r.has(u));
  if (!pares.length || pares[0][0] !== plan.equipo[0]) return null; // sin su Líder no se repite
  plan.equipo = pares.map((p) => p[0]);
  plan.roles = pares.map((p, i) => (i === 0 ? 'lider' : p[1]));
  if (!islaDesbloqueada(save, plan.isla)) return null;
  try { return enviar(save, idxEquipo, plan, ctx); } catch { return null; }
}

/** Previsión (§4.8) para la pantalla Formar equipo. */
export function prever(save, idxEquipo, planIn, ctx, n = 200) {
  const plan = normalizarPlan(save, planIn, ctx);
  if (!plan.equipo.length) return null;
  const snapshot = sim.crearSnapshot(save, plan, ctx.datos);
  return sim.prever({ plan, snapshot, semilla: semillaEnvio(save, idxEquipo, ctx), inicio: ctx.ahora, ctx }, n);
}

/** Sugerir equipo para una isla (§4.8). opciones: { excluir: uid[], modo, horas, postura, hasta }. */
export function sugerir(save, isla, opciones = {}, ctx) {
  const excl = new Set([...(opciones.excluir || []), ...ocupados(save), ...reservados(save)]);
  return sim.sugerirEquipo(save, isla, { ...opciones, excluir: [...excl] }, ctx);
}

/**
 * «Enviar a todos con la sugerencia» (§9.2.4): cada equipo libre sale con Sugerir en la isla más honda con
 * p(jefe) >= 0,6 (si ninguna llega, la de mejor p entre las 3 más hondas); de noche, patrulla de 8 h.
 * Si no hay sugerencia posible, repite su último plan. Devuelve cuántos ha enviado.
 */
export function enviarTodos(save, ctx) {
  let n = 0;
  for (let i = 0; i < save.equipos.length; i++) {
    if (save.equipos[i].exp) continue;
    const plan = planSugerido(save, i, ctx);
    let ok = false;
    if (plan) { try { enviar(save, i, plan, ctx); ok = true; } catch { ok = false; } }
    if (!ok && repetir(save, i, ctx)) ok = true;
    if (ok) n++;
  }
  return n;
}

/** Plan sugerido para un equipo libre (o null si no hay nadie libre). */
export function planSugerido(save, idx, ctx) {
  if (!libres(save).length) return null;
  const abiertas = ctx.datos.islas.filter((i) => save.islas[i.id]).map((i) => i.id).reverse();
  let mejor = null;
  for (const isla of abiertas.slice(0, 3)) {
    let s;
    try { s = sugerir(save, isla, { modo: 'vuelta' }, ctx); } catch { s = null; }
    if (!s || !s.equipo?.length) continue;
    if (!mejor || s.prob > mejor.prob) mejor = { ...s, isla };
    if (s.prob >= 0.6) { mejor = { ...s, isla }; break; }
  }
  if (!mejor) return null;
  // Igual que la política perezosa del simulador (notes/simulador.md): vuelta para abrir isla
  // (jefe sin vencer y p ≥ 0,6) o durante la primera hora; si no, patrulla de 8 h de noche y 4 h de día,
  // para que «Enviar a todos» cubra el hueco hasta la siguiente sesión.
  const noche = ev.esNoche(ctx.ahora);
  const abrir = !save.islas[mejor.isla]?.jefe && mejor.prob >= 0.6;
  const primeraHora = ctx.ahora - (save.creado || 0) < 3600000;
  if (abrir || primeraHora) {
    return { equipo: mejor.equipo, roles: mejor.roles, isla: mejor.isla, modo: 'vuelta', postura: 'equilibrada', dominio: 0 };
  }
  return { equipo: mejor.equipo, roles: mejor.roles, isla: mejor.isla, modo: 'patrulla',
    horas: noche ? 8 : 4, postura: 'equilibrada', dominio: 0 };
}

// ---------------------------------------------------------------------------
// Recoger
// ---------------------------------------------------------------------------

/** Da EXP respetando el tope (§5): lo sobrante se acumula hasta 1 nivel y el resto se pierde. */
export function ganarExp(mon, exp, topeNv) {
  const antes = mon.nv;
  mon.xp = (mon.xp || 0) + Math.max(0, Math.round(exp));
  const t = Math.min(K.TOPE_MAX, topeNv);
  while (mon.nv < t && mon.xp >= expSig(mon.nv)) { mon.xp -= expSig(mon.nv); mon.nv++; }
  if (mon.nv >= t) mon.xp = Math.min(mon.xp, mon.nv >= K.TOPE_MAX ? 0 : expSig(mon.nv));
  return mon.nv - antes;
}

/** EXP que falta para llegar al tope de nivel (0 si ya está). */
export function expHastaTope(mon, topeNv) {
  const t = Math.min(K.TOPE_MAX, topeNv);
  if (mon.nv >= t) return 0;
  let falta = expSig(mon.nv) - (mon.xp || 0);
  for (let l = mon.nv + 1; l < t; l++) falta += expSig(l);
  return Math.max(0, falta);
}

function multExp(save, mon, mediaNv) {
  let m = 1;
  if (mediaNv != null && mediaNv - mon.nv >= K.ALCANZAR_DIF) m *= K.ALCANZAR_MULT;
  if (mon.ot && mon.ot !== 'local' && mon.ot !== save.uid) m *= K.INTERCAMBIO_EXP;
  return m;
}

function subirCarino(save, mon, n, ahora) {
  const antes = mon.car;
  mon.car = Math.min(K.CARINO_MAX, mon.car + n);
  if (antes < K.CARINO_AMISTAD && mon.car >= K.CARINO_AMISTAD) anotarDiario(mon, ahora, 'car80', {});
}

/** Recoge un equipo de vuelta. Informe con un solo equipo (y cala vacía). */
export function recogerEquipo(save, idx, ctx) {
  const inf = { equipos: [], cala: { bayas: 0, visitante: null, caducado: null }, momentos: [], misiones: [] };
  const r = aplicarExpedicion(save, idx, ctx, inf.momentos);
  if (r) inf.equipos.push(r);
  if (r) {
    save.ultimaVez = Math.max(save.ultimaVez, ctx.ahora);
    emitirInforme(inf);
  }
  return inf;
}

/** Recoger todo (§2.1): equipos de vuelta + huerto + visitante caducado, en una sola operación. */
export function recogerTodo(save, ctx) {
  reanclarReloj(save, ctx.ahora);
  const inf = { equipos: [], cala: { bayas: 0, visitante: null, caducado: null }, momentos: [], misiones: [] };
  for (const i of equiposDeVuelta(save, ctx)) {
    const r = aplicarExpedicion(save, i, ctx, inf.momentos);
    if (r) inf.equipos.push(r);
  }
  const p = eco.producir(save, ctx.ahora, ctx);
  inf.cala.bayas = p.bayas;
  inf.cala.caducado = p.caducado;
  inf.cala.visitante = save.visitante ? { ...save.visitante } : null;
  if (p.bayas) mis.progreso(save, 'bayas', { n: p.bayas });
  save.ultimaVez = Math.max(save.ultimaVez, ctx.ahora);
  emitirInforme(inf);
  return inf;
}

function emitirInforme(inf) {
  bus.emit('informe', inf);
  for (const m of inf.momentos) bus.emit('momento', m);
  bus.emit('save:cambio', { motivo: 'recoger' });
}

function aplicarExpedicion(save, idx, ctx, momentos) {
  const eq = save.equipos[idx];
  if (!eq || !eq.exp || ctx.ahora < eq.exp.fin) return null;
  const { plan, registro } = eq.exp;
  const datos = ctx.datos;
  const io = islaObj(plan.isla, ctx) || { n: String(plan.isla), F: 0 };
  const ahora = ctx.ahora;
  const tot = registro.totales || {};
  const t = registro.fin;

  // Monedas y objetos
  save.monedas += Math.round(tot.monedas || 0);
  for (const [o, n] of Object.entries(tot.objetos || {})) save.objetos[o] = (save.objetos[o] || 0) + n;
  if (tot.monedas) mis.progreso(save, 'monedas', { n: tot.monedas });

  // Progreso de isla
  let pisoFin = 0, jefe = false;
  for (const r of registro.rondas || []) { pisoFin = Math.max(pisoFin, r.pisoFin || 0); if (r.jefe) jefe = true; }
  let primerJefe = false;
  if (plan.isla === 'misterio') {
    // El récord cuenta para la semana en que se envió (con sus tipos y su clima), no para la de la recogida.
    const wk = ev.semanaDe(eq.exp.inicio);
    if (wk > (save.misterio.wk || 0)) save.misterio = { wk, record: 0 };
    if (wk === save.misterio.wk) save.misterio.record = Math.max(save.misterio.record, pisoFin);
    mis.progreso(save, 'misterio', { piso: pisoFin });
  } else {
    const st = save.islas[plan.isla] || (save.islas[plan.isla] = islaVacia());
    st.pisoMax = Math.max(st.pisoMax, pisoFin);
    if (jefe && !st.jefe) {
      st.jefe = true;
      primerJefe = true;
      save.stats.jefes = eco.jefesVencidos(save);
      const sig = datos.islaPorId[plan.isla + 1];
      if (sig && !save.islas[sig.id]) save.islas[sig.id] = islaVacia();
      momentos.push({ tipo: 'jefe', sp: io.jefe, emocion: 'Joyous',
        texto: `¡Habéis vencido al jefe de ${io.n}!` + (sig ? ` Se abre ${sig.n}.` : ''),
        isla: plan.isla, abre: sig ? sig.id : null, misterio: plan.isla === 3 });
    }
    if (jefe) mis.progreso(save, 'jefe', { isla: plan.isla });
  }
  const topeNv = tope(save);

  // EXP y cariño de los miembros (los que sigan en la cala)
  const miembros = plan.equipo.map((u) => buscarMon(save, u)).filter(Boolean);
  const media = miembros.length ? miembros.reduce((s, m) => s + m.nv, 0) / miembros.length : null;
  let perdidos = 0, manantiales = 0, eventos = [];
  for (const r of registro.rondas || []) for (const e of r.eventos || []) {
    eventos.push(e);
    if (e.tipo === 'perdido') perdidos++;
    if (e.tipo === 'manantial') manantiales++;
  }
  const nivelesSubidos = [];
  for (const m of miembros) {
    const de = m.nv;
    const subidos = ganarExp(m, (tot.exp || 0) * multExp(save, m, media), topeNv);
    if (subidos) { nivelesSubidos.push({ uid: m.id, sp: m.sp, de, a: m.nv }); mis.progreso(save, 'nivel', { n: subidos }); }
    subirCarino(save, m, K.CARINO_EXP + perdidos * K.PERDIDO_CARINO, ahora);
    if (jefe && !m.dia.some((d) => d[1] === 'jefe')) anotarDiario(m, t, 'jefe', { i: io.clave || plan.isla });
  }

  // Encuentros: Bitácora, piedad, huellas y reclutas
  const reclutas = [];
  let raro = false;
  for (const r of registro.rondas || []) {
    for (const enc of r.encuentros || []) {
      if (!save.bitacora.visto[enc.sp]) save.bitacora.visto[enc.sp] = ahora;
      if (enc.rar === 'R' || enc.rar === 'L') raro = true;
      // Piedad y huellas (§6.2): se aplica cada encuentro sobre el estado actual de la isla, no se copia el estado final
      // del registro. Así, con varios equipos en la misma isla, ni la piedad va hacia atrás ni se pierden huellas.
      if (plan.isla !== 'misterio') recruit.trasEncuentro(enc, save.islas[plan.isla]);
      if (!enc.acepta) { reclutas.push({ sp: enc.sp, acepta: false, rar: enc.rar, nv: enc.nv }); continue; }
      const nuevaEsp = !save.bitacora.tenido[enc.sp];
      const encRec = { ...enc, isla: plan.isla, islaClave: io.clave || String(plan.isla), t };
      let res;
      try { res = recruit.aplicarRecluta(save, encRec, ctx); } catch (e) { res = { tipo: 'error', error: e.message }; }
      const nombre = datos.especies[enc.sp]?.n || enc.sp;
      reclutas.push({ sp: enc.sp, acepta: true, rar: enc.rar, nv: enc.nv, vr: !!enc.vr, uid: res.uid || null, tipo: res.tipo, nueva: nuevaEsp });
      mis.progreso(save, 'recluta', { sp: enc.sp });
      if (res.tipo === 'estrella' || res.tipo === 'caramelo') mis.progreso(save, 'fusion', {});
      const especial = res.especial ?? (nuevaEsp || enc.rar === 'R' || enc.rar === 'L' || enc.vr);
      if (res.tipo === 'lleno') {
        // No ha entrado: queda pendiente de «Liberar a otro / Dejarlo ir» (§3.8). Sin momento de «se une».
        dejarPendienteLleno(save, encRec);
        continue;
      }
      if (especial && res.tipo !== 'error') {
        momentos.push({ tipo: enc.vr ? 'variocolor' : 'recluta', uid: res.uid || null, sp: enc.sp, vr: !!enc.vr,
          emocion: enc.vr ? 'Joyous' : 'Happy',
          texto: enc.vr ? `¡${nombre} variocolor se une a la cala!` : nuevaEsp ? `¡${nombre} se une a la cala!` : `¡${nombre} quiere unirse!`,
          rar: enc.rar, nueva: nuevaEsp });
      }
    }
  }

  revisarHitos(save, ctx, momentos);

  // Estadísticas, informes sin especial, diario de expediciones
  save.stats.exps++;
  const pEq = registro.P ?? eq.exp.snapshot?.P ?? 0;
  save.stats.mejorP = Math.max(save.stats.mejorP || 0, Math.round(pEq));
  const especialInf = eventos.length > 0 || raro || jefe;
  save.informesSinEspecial = especialInf ? 0 : (save.informesSinEspecial | 0) + 1;
  if (plan.tutorial && save.tutorial.paso < 2) save.tutorial.paso = 2;
  mis.progreso(save, 'expedicion', { isla: plan.isla });
  const resumen = {
    t, idx, isla: plan.isla, modo: plan.modo, postura: plan.postura, pisoFin, jefe, motivo: registro.motivo,
    monedas: Math.round(tot.monedas || 0), exp: Math.round(tot.exp || 0),
    objetos: Object.values(tot.objetos || {}).reduce((a, b) => a + b, 0),
    reclutas: reclutas.filter((r) => r.acepta).length, equipo: plan.equipo.map((u) => buscarMon(save, u)?.sp || null),
  };
  save.diarioExp.unshift(resumen);
  if (save.diarioExp.length > MAX_DIARIO_EXP) save.diarioExp.length = MAX_DIARIO_EXP;

  eq.exp = null;
  // Los que ya no estén se quitan del equipo
  const keep = eq.miembros.map((u, i) => [u, eq.roles[i]]).filter(([u]) => buscarMon(save, u));
  eq.miembros = keep.map((x) => x[0]);
  eq.roles = keep.map((x, i) => (i === 0 ? 'lider' : x[1]));

  // Al subir el tope, los que tenían EXP acumulada suben ya
  if (primerJefe) for (const m of save.pokemon) ganarExp(m, 0, topeNv);

  return { idx, isla: plan.isla, islaN: io.n, registro, plan, pisoFin, jefe, primerJefe, motivo: registro.motivo,
    monedas: Math.round(tot.monedas || 0), exp: Math.round(tot.exp || 0), objetos: { ...(tot.objetos || {}) },
    eventos, nivelesSubidos, reclutas, manantiales };
}

function famDe(sp, datos) { return datos.especies[sp]?.fam || sp; }

// ---------------------------------------------------------------------------
// Cala llena (§3.8): reclutas pendientes de «Liberar a otro / Dejarlo ir»
// ---------------------------------------------------------------------------

function dejarPendienteLleno(save, enc) {
  const p = { sp: enc.sp, nv: enc.nv, vr: !!enc.vr, rar: enc.rar, f: enc.f, de: enc.de, isla: enc.isla, islaClave: enc.islaClave, t: enc.t };
  save.pendientesLleno = save.pendientesLleno || [];
  save.pendientesLleno.push(p);
  // Tope: se cae el más antiguo que no sea variocolor (un variocolor nunca se tira sin preguntar).
  while (save.pendientesLleno.length > MAX_PENDIENTES_LLENO) {
    const i = save.pendientesLleno.findIndex((x) => !x.vr);
    if (i < 0) break;
    save.pendientesLleno.splice(i, 1);
  }
}

/** Reclutas que esperan sitio: [{ sp, nv, vr, rar, ... }]. */
export function pendientesLleno(save) { return save.pendientesLleno || []; }

/**
 * Deja entrar al pendiente i (tiene que haber sitio: antes se libera a otro desde la ficha).
 * Devuelve el resultado de recruit.aplicarRecluta y emite el momento de «se une». Lanza Error si sigue llena.
 */
export function admitirPendiente(save, i, ctx) {
  const p = pendientesLleno(save)[i];
  if (!p) throw new Error('Ese Pokémon ya no está esperando.');
  if (save.pokemon.length >= MAX_POKEMON) throw new Error('La cala sigue llena: libera a alguien desde su ficha.');
  const nueva = !save.bitacora.tenido[p.sp];
  const res = recruit.aplicarRecluta(save, { ...p, acepta: true }, ctx);
  if (res.tipo === 'lleno') throw new Error('La cala sigue llena: libera a alguien desde su ficha.');
  save.pendientesLleno.splice(i, 1);
  mis.progreso(save, 'recluta', { sp: p.sp });
  const nombre = ctx.datos.especies[p.sp]?.n || p.sp;
  bus.emit('momento', { tipo: p.vr ? 'variocolor' : 'recluta', uid: res.uid || null, sp: p.sp, vr: !!p.vr,
    emocion: p.vr ? 'Joyous' : 'Happy', rar: p.rar, nueva,
    texto: p.vr ? `¡${nombre} variocolor se une a la cala!` : `¡${nombre} se une a la cala!` });
  revisarHitos(save, ctx);
  bus.emit('save:cambio', { motivo: 'pendiente' });
  return res;
}

/** «Dejarlo ir»: el pendiente i se va (no da nada). */
export function descartarPendiente(save, i) {
  const l = pendientesLleno(save);
  if (!l[i]) return false;
  l.splice(i, 1);
  bus.emit('save:cambio', { motivo: 'pendiente' });
  return true;
}

// ---------------------------------------------------------------------------
// Hitos de la Bitácora (§6.10): 1 Cordón Amistad al llegar al 50 % de la lista
// ---------------------------------------------------------------------------

/** Fracción de especies de la lista que se han tenido alguna vez. */
export function fraccionBitacora(save, datos) {
  const todas = Object.keys(datos.especies);
  if (!todas.length) return 0;
  return todas.filter((sp) => save.bitacora.tenido[sp]).length / todas.length;
}

/**
 * Da las recompensas de hito pendientes (una sola vez cada una, marcadas en save.hitos).
 * Con `momentos` los añade ahí (informe); si no, los emite. Devuelve los momentos nuevos.
 */
export function revisarHitos(save, ctx, momentos = null) {
  save.hitos = save.hitos || {};
  const nuevos = [];
  if (!save.hitos.cordon50 && fraccionBitacora(save, ctx.datos) >= 0.5) {
    save.hitos.cordon50 = ctx.ahora;
    save.objetos.cordon_amistad = (save.objetos.cordon_amistad | 0) + 1;
    nuevos.push({ tipo: 'hito', sp: save.guia, emocion: 'Joyous', hito: 50,
      texto: '¡La Bitácora llega al 50 %! Recibes un Cordón Amistad.' });
  }
  for (const m of nuevos) { if (momentos) momentos.push(m); else bus.emit('momento', m); }
  return nuevos;
}

// ---------------------------------------------------------------------------
// Pokémon: bayas, cariño, evolución, objetos
// ---------------------------------------------------------------------------

function mediaEquipoDe(save, mon) {
  const eq = save.equipos.find((e) => e.miembros.includes(mon.id));
  let lista;
  if (eq && eq.miembros.length > 1) lista = eq.miembros.map((u) => buscarMon(save, u)).filter(Boolean);
  else lista = [...save.pokemon].sort((a, b) => b.nv - a.nv).slice(0, 3);
  return lista.length ? lista.reduce((s, m) => s + m.nv, 0) / lista.length : null;
}

/**
 * Da bayas (1 baya = 1 EXP, con los multiplicadores de alcanzar al grupo e intercambio).
 * cantidad: número o 'siguiente' (hasta el siguiente nivel). Nunca gasta bayas que se fueran a perder.
 * Devuelve { nv, xp, gastadas, subidos, alTope }.
 */
export function darBayas(save, uid, cantidad, ctx) {
  const m = buscarMon(save, uid);
  if (!m) throw new Error('Ese Pokémon ya no está en la cala.');
  const topeNv = tope(save);
  const mult = multExp(save, m, mediaEquipoDe(save, m));
  let quiere;
  if (cantidad === 'siguiente') quiere = Math.ceil(Math.max(0, expSig(m.nv) - m.xp) / mult);
  else quiere = Math.max(0, Math.floor(Number(cantidad) || 0));
  // Con bayas no se acumula EXP por encima del tope: nunca se gastan bayas que se fueran a perder.
  const maxUtil = Math.ceil(expHastaTope(m, topeNv) / mult);
  const gastadas = Math.min(quiere, save.bayas, maxUtil);
  const subidos = gastadas > 0 ? ganarExp(m, gastadas * mult, topeNv) : 0;
  save.bayas -= gastadas;
  if (gastadas) { mis.progreso(save, 'bayas', { n: gastadas }); bus.emit('save:cambio', { motivo: 'bayas' }); }
  if (subidos) mis.progreso(save, 'nivel', { n: subidos });
  return { nv: m.nv, xp: m.xp, gastadas, subidos, alTope: m.nv >= topeNv };
}

/** Reparte bayas entre los 6 de menor nivel (subiendo siempre al más bajo). Devuelve { gastadas, subidos }. */
export function igualar(save, ctx) {
  const topeNv = tope(save);
  const seis = [...save.pokemon].filter((m) => m.nv < topeNv).sort((a, b) => a.nv - b.nv || a.xp - b.xp).slice(0, 6);
  let gastadas = 0, subidos = 0;
  for (let guard = 0; guard < 2000 && save.bayas > 0; guard++) {
    const m = seis.filter((x) => x.nv < topeNv).sort((a, b) => a.nv - b.nv || b.xp - a.xp)[0];
    if (!m) break;
    const r = darBayas(save, m.id, 'siguiente', ctx);
    gastadas += r.gastadas;
    subidos += r.subidos;
    if (!r.subidos) break; // no llega para el siguiente nivel
  }
  return { gastadas, subidos };
}

/** Mejora un edificio. true si se pudo. El Muelle añade un equipo. */
export function mejorar(save, edificio, ctx) {
  if (!eco.EDIFICIOS.includes(edificio)) return false;
  const info = eco.infoEdificio(save, edificio);
  if (info.alTope || save.monedas < info.coste) return false;
  // El huerto y la despensa cambian la producción: se recoge antes a la tasa/tope de antes.
  if (edificio === 'huerto' || edificio === 'despensa') eco.producir(save, ctx.ahora, { ...ctx, visitantes: false });
  save.monedas -= info.coste;
  save.base[edificio] = info.nivel + 1;
  if (edificio === 'muelle') while (save.equipos.length < Math.min(4, 1 + save.base.muelle)) save.equipos.push(equipoVacio());
  bus.emit('save:cambio', { motivo: 'mejorar' });
  return true;
}

/** Tocar un vecino en la cala: frase y +1 cariño una vez al día. Devuelve { frase, cariño, subio }. */
export function tocarVecino(save, uid, ctx) {
  const m = buscarMon(save, uid);
  if (!m) return { frase: '', cariño: 0, subio: false };
  const hoy = ev.diaLocal(ctx.ahora);
  let subio = false;
  if (m.toq !== hoy) {
    m.toq = hoy;
    subirCarino(save, m, K.CARINO_TOQUE, ctx.ahora);
    subio = true;
    mis.progreso(save, 'toque', {});
    bus.emit('save:cambio', { motivo: 'toque' });
  }
  return { frase: fraseVecino(save, m, ctx), cariño: m.car, subio };
}

/** Frase según cariño: textos.frases.{timido <30, normal <60, feliz <80, amigo >=80}, con respaldo. */
export function fraseVecino(save, m, ctx) {
  const fr = ctx.datos.textos?.frases || {};
  const cubo = m.car >= 80 ? 'amigo' : m.car >= 60 ? 'feliz' : m.car >= 30 ? 'normal' : 'timido';
  const orden = [cubo, 'feliz', 'normal', 'amigo', 'timido'];
  const lista = orden.map((k) => fr[k]).find((l) => Array.isArray(l) && l.length);
  if (!lista) return '';
  const rng = mulberry32(hashSeed(m.id, ev.diaLocal(ctx.ahora), m.car));
  const f = lista[Math.floor(rng() * lista.length)];
  return String(f).replaceAll('{n}', save.nombre || 'farero').replaceAll('{yo}', nombreMon(m, ctx.datos));
}

/** Atender al visitante (§7.3, v0.2). Devuelve el Mon o null si no hay o no llegan las bayas. */
export function atenderVisitante(save, ctx) {
  const v = save.visitante;
  if (!v || v.vence <= ctx.ahora) return null;
  const coste = eco.costeVisitante(save, v);
  if (save.bayas < coste || save.pokemon.length >= MAX_POKEMON) return null;
  save.bayas -= coste;
  const rng = rngDe(save, ctx, 'visita');
  const m = crearMon({ sp: v.sp, nv: Math.min(eco.nivelVisitante(save), tope(save)), de: 'visita', ahora: ctx.ahora, rng, otn: save.nombre });
  anotarDiario(m, ctx.ahora, 'llega', { i: 'visita' });
  save.pokemon.push(m);
  const fam = famDe(v.sp, ctx.datos);
  save.cadenas[fam] = (save.cadenas[fam] | 0) + 1;
  save.bitacora.visto[v.sp] = save.bitacora.visto[v.sp] || ctx.ahora;
  save.bitacora.tenido[v.sp] = save.bitacora.tenido[v.sp] || ctx.ahora;
  save.visitante = null;
  mis.progreso(save, 'visitante', {});
  revisarHitos(save, ctx);
  bus.emit('save:cambio', { motivo: 'visitante' });
  return m;
}

/** Opciones de evolución de un Pokémon (de evolve.js). */
export function opcionesEvolucion(save, uid, ctx) {
  const m = buscarMon(save, uid);
  if (!m) return [];
  return evolve.opcionesEvolucion(m, save, ctx.datos, ctx.ahora);
}

/** Evoluciona (nunca automático). Lanza Error si no es posible. Devuelve el Mon y emite 'momento'. */
export function evolucionar(save, uid, destino, ctx) {
  const m = buscarMon(save, uid);
  if (!m) throw new Error('Ese Pokémon ya no está en la cala.');
  if (ocupados(save).has(uid)) throw new Error('Está de expedición: espera a que vuelva.');
  const op = evolve.opcionesEvolucion(m, save, ctx.datos, ctx.ahora).find((o) => o.a === destino);
  if (!op) throw new Error('No puede evolucionar a esa especie.');
  if (!op.posible) throw new Error(op.falta || 'Aún no puede evolucionar.');
  const antes = m.sp, nombreAntes = nombreMon(m, ctx.datos);
  const mon = evolve.aplicarEvolucion(save, uid, destino, ctx.datos, ctx.ahora, 'normal');
  if (!save.bitacora.visto[destino]) save.bitacora.visto[destino] = ctx.ahora;
  if (!save.bitacora.tenido[destino]) save.bitacora.tenido[destino] = ctx.ahora;
  mis.progreso(save, 'evolucion', {});
  const momento = { tipo: 'evolucion', uid, sp: destino, spAntes: antes, vr: !!mon.vr, emocion: 'Joyous',
    texto: `¡${nombreAntes} se ha convertido en ${ctx.datos.especies[destino]?.n || destino}!` };
  bus.emit('momento', momento);
  revisarHitos(save, ctx);
  bus.emit('save:cambio', { motivo: 'evolucion' });
  return mon;
}

/**
 * Usa un objeto con un Pokémon. baya_grande: +3 cariño. Piedras, garra y cordón: evolucionan
 * (destino opcional si hay varias ramas). Devuelve { ok, efecto, mon, texto }.
 */
export function usarObjeto(save, uid, objeto, ctx, destino) {
  const m = buscarMon(save, uid);
  if (!m) throw new Error('Ese Pokémon ya no está en la cala.');
  if ((save.objetos[objeto] | 0) <= 0) throw new Error('No te quedan de ese objeto.');
  if (objeto === 'baya_grande') {
    if (m.car >= K.CARINO_MAX) throw new Error('Ya te tiene todo el cariño posible.');
    save.objetos[objeto]--;
    subirCarino(save, m, K.CARINO_BAYA_GRANDE, ctx.ahora);
    mis.progreso(save, 'objeto', { objeto });
    bus.emit('save:cambio', { motivo: 'objeto' });
    return { ok: true, efecto: 'carino', mon: m, texto: `${nombreMon(m, ctx.datos)} está encantado (+${K.CARINO_BAYA_GRANDE} cariño).` };
  }
  const ops = evolve.opcionesEvolucion(m, save, ctx.datos, ctx.ahora)
    .filter((o) => o.it === objeto || (objeto === 'cordon_amistad' && o.c === 'intercambio'));
  const op = destino ? ops.find((o) => o.a === destino) : ops.find((o) => o.posible) || ops[0];
  if (!op) throw new Error('Ese objeto no le hace nada.');
  const antes = save.objetos[objeto] | 0;
  const mon = evolucionar(save, uid, op.a, ctx);
  // Si evolve.js no gastó el objeto, se gasta aquí.
  if ((save.objetos[objeto] | 0) === antes) save.objetos[objeto] = antes - 1;
  mis.progreso(save, 'objeto', { objeto });
  return { ok: true, efecto: 'evolucion', mon, texto: '' };
}

/** ¿Haría algo un caramelo con esa elección? ('carino': cariño < máximo; 'bayas': le falta EXP para el tope). */
export function efectoCaramelo(save, mon, eleccion) {
  if (!mon) return false;
  if (eleccion === 'carino') return (mon.car || 0) < K.CARINO_MAX;
  return expHastaTope(mon, tope(save)) > 0;
}

/** Usa un caramelo de la especie: eleccion 'carino' (+20) o 'bayas' (500 EXP). */
export function usarCaramelo(save, uid, eleccion, ctx) {
  const m = buscarMon(save, uid);
  if (!m) throw new Error('Ese Pokémon ya no está en la cala.');
  const clave = save.caramelos[m.sp] ? m.sp : famDe(m.sp, ctx.datos);
  if ((save.caramelos[clave] | 0) <= 0) throw new Error('No tienes caramelos de esta especie.');
  // Igual que las bayas: nunca se gasta un caramelo que no haría nada.
  if (!efectoCaramelo(save, m, eleccion)) {
    throw new Error(eleccion === 'carino' ? 'Ya te tiene todo el cariño posible.' : 'Ya está al tope de nivel: el caramelo se perdería.');
  }
  save.caramelos[clave]--;
  if (eleccion === 'carino') subirCarino(save, m, K.CARAMELO_CARINO, ctx.ahora);
  else ganarExp(m, K.CARAMELO_BAYAS * multExp(save, m, null), tope(save));
  bus.emit('save:cambio', { motivo: 'caramelo' });
  return { nv: m.nv, xp: m.xp, car: m.car };
}

export function ponerApodo(save, uid, apodo) {
  const m = buscarMon(save, uid);
  if (!m) return false;
  m.ap = String(apodo || '').replace(/[<>]/g, '').trim().slice(0, 12);
  bus.emit('save:cambio', { motivo: 'apodo' });
  return true;
}

export function alternarFavorito(save, uid) {
  const m = buscarMon(save, uid);
  if (!m) return false;
  m.fav = !m.fav;
  bus.emit('save:cambio', { motivo: 'favorito' });
  return m.fav;
}

/** «Quiere seguir así»: silencia el aviso de evolución. */
export function alternarNoEvo(save, uid) {
  const m = buscarMon(save, uid);
  if (!m) return false;
  m.noEvo = !m.noEvo;
  bus.emit('save:cambio', { motivo: 'noEvo' });
  return m.noEvo;
}

/** Liberar (solo desde la ficha, con confirmación en la UI). No da recursos. Lanza Error si no se puede. */
export function liberar(save, uid) {
  const m = buscarMon(save, uid);
  if (!m) return false;
  if (m.de === 'faro') throw new Error('Tu guía es el farero: no puede irse.');
  if (ocupados(save).has(uid)) throw new Error('Está de expedición.');
  if (reservados(save).has(uid)) throw new Error('Está reservado para un intercambio.');
  save.pokemon = save.pokemon.filter((x) => x.id !== uid);
  for (const e of save.equipos) {
    const i = e.miembros.indexOf(uid);
    if (i >= 0) {
      e.miembros.splice(i, 1);
      e.roles.splice(i, 1);
      if (e.roles.length) e.roles[0] = 'lider';
    }
    if (e.ultimoPlan) {
      const j = e.ultimoPlan.equipo.indexOf(uid);
      if (j === 0) e.ultimoPlan = null;
      else if (j > 0) { e.ultimoPlan.equipo.splice(j, 1); e.ultimoPlan.roles.splice(j, 1); }
    }
  }
  bus.emit('save:cambio', { motivo: 'liberar' });
  return true;
}

/** Ajustes: duplicados ('fusionar'|'preguntar'), sonido (0-1), reducirAnim (bool). nombre aparte. */
export function cambiarAjuste(save, clave, valor) {
  if (clave === 'nombre') save.nombre = String(valor || '').replace(/[@<>]/g, '').trim().slice(0, 16);
  else if (clave in save.ajustes) save.ajustes[clave] = valor;
  else return false;
  bus.emit('save:cambio', { motivo: 'ajuste' });
  return true;
}

// ---------------------------------------------------------------------------
// Misiones (v0.2: stubs)
// ---------------------------------------------------------------------------

export function cambiarMision(_save, _idx, _ctx) { /* v0.2 */ }
export function cobrarMision(_save, _idx, _ctx) { return null; }

// ---------------------------------------------------------------------------
// Tick, avisos y meta
// ---------------------------------------------------------------------------

function persistirDiaJugado(save, ctx) {
  const hoy = ev.diaLocal(ctx.ahora);
  if (save.diasJugados[save.diasJugados.length - 1] !== hoy && !save.diasJugados.includes(hoy)) {
    save.diasJugados.push(hoy);
    return true;
  }
  return false;
}

/**
 * Llamar al abrir y cada ~30 s. Reloj hacia atrás, días jugados, visitante caducado.
 * No recoge nada. Devuelve { avisos, cambios, deVuelta, huerto, titulo }.
 */
export function tick(save, ctx) {
  let cambios = reanclarReloj(save, ctx.ahora);
  // Reloj que estuvo adelantado: el visitante no puede quedarse más de lo que dura una visita
  // y no cuentan los días «jugados» en el futuro.
  const maxVence = ctx.ahora + K.VISITA_H * H;
  if (save.visitante && save.visitante.vence > maxVence) { save.visitante.vence = maxVence; cambios = true; }
  const hoy = ev.diaLocal(ctx.ahora);
  if (save.diasJugados.some((d) => d > hoy)) { save.diasJugados = save.diasJugados.filter((d) => d <= hoy); cambios = true; }
  if (persistirDiaJugado(save, ctx)) cambios = true;
  if (revisarHitos(save, ctx).length) cambios = true;
  if (save.visitante && save.visitante.vence <= ctx.ahora) { save.visitante = null; cambios = true; }
  if (ctx.ahora > save.ultimaVez) save.ultimaVez = ctx.ahora;
  const lista = avisos(save, ctx);
  const deVuelta = equiposDeVuelta(save, ctx).length;
  const titulo = deVuelta ? `(${deVuelta}) ¡Equipo de vuelta!` : 'Farolillo';
  if (cambios) bus.emit('save:cambio', { motivo: 'tick' });
  bus.emit('aviso', lista);
  return { avisos: lista, cambios, deVuelta, huerto: eco.pendienteHuerto(save, ctx.ahora), titulo };
}

/**
 * Avisos (máx. 3), en orden: equipo de vuelta > evolución posible > mejora asequible > subir de nivel >
 * misión cobrable > visitante a < 2 h > cala casi llena.
 * Aviso = { tipo, n, texto, destino } con destino = pestaña ('cala'|'expediciones'|'gremio'|'gremio:faro').
 */
export function avisos(save, ctx) {
  const out = [];
  const v = equiposDeVuelta(save, ctx).length;
  if (v) out.push({ tipo: 'vuelta', n: v, texto: v === 1 ? '¡Un equipo ha vuelto!' : `¡${v} equipos han vuelto!`, destino: 'cala' });
  const o = ocupados(save);
  let evo = 0;
  for (const m of save.pokemon) {
    if (m.noEvo || o.has(m.id)) continue;
    try { if (evolve.opcionesEvolucion(m, save, ctx.datos, ctx.ahora).some((x) => x.posible)) evo++; } catch { /* datos incompletos */ }
  }
  if (evo) out.push({ tipo: 'evolucion', n: evo, texto: evo === 1 ? '1 puede evolucionar' : `${evo} pueden evolucionar`, destino: 'gremio' });
  const mej = eco.EDIFICIOS.filter((b) => eco.infoEdificio(save, b).asequible).length;
  if (mej) out.push({ tipo: 'mejora', n: mej, texto: 'Mejora disponible', destino: 'gremio:faro' });
  const topeNv = tope(save);
  const enEquipo = new Set(save.equipos.flatMap((e) => e.miembros));
  let niv = 0;
  for (const m of save.pokemon) {
    if (!enEquipo.has(m.id) || m.nv >= topeNv) continue;
    const mult = multExp(save, m, mediaEquipoDe(save, m));
    if (save.bayas >= Math.ceil((expSig(m.nv) - m.xp) / mult)) niv++;
  }
  if (niv) out.push({ tipo: 'nivel', n: niv, texto: niv === 1 ? '1 puede subir de nivel' : `${niv} pueden subir de nivel`, destino: 'gremio' });
  const mc = mis.cobrables(save).length;
  if (mc) out.push({ tipo: 'mision', n: mc, texto: 'Misión lista', destino: 'gremio' });
  if (save.visitante && save.visitante.vence - ctx.ahora < 2 * H && save.visitante.vence > ctx.ahora) {
    out.push({ tipo: 'visitante', n: 1, texto: 'El visitante se va pronto', destino: 'cala' });
  }
  if (save.pokemon.length >= AVISO_POKEMON) out.push({ tipo: 'lleno', n: save.pokemon.length, texto: `La cala está casi llena (${save.pokemon.length}/${MAX_POKEMON})`, destino: 'gremio' });
  return out.slice(0, 3);
}

/** Siguiente hito: { texto, destino: { pantalla, isla? } }. */
export function metaSiguiente(save, ctx) {
  if (save.tutorial.paso < 2) {
    return { texto: 'Espera a que vuelva tu primera expedición', destino: { pantalla: 'cala' } };
  }
  for (const i of ctx.datos.islas) {
    if (save.islas[i.id] && !save.islas[i.id].jefe) {
      return { texto: `Meta: Jefe de ${i.n} (p.${i.F})`, destino: { pantalla: 'formar', isla: i.id } };
    }
  }
  return { texto: `Meta: Mazmorra Misterio, récord p.${misterioRecord(save, ctx)}`, destino: { pantalla: 'formar', isla: 'misterio' } };
}

/** Datos del Muelle para la UI: equipos 1-4 con su estado. */
export function equipos(save, ctx) {
  return [0, 1, 2, 3].map((i) => estadoEquipo(save, i, ctx));
}

export { poderEquipo, MAX_POKEMON };
