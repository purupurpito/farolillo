// Resolución de expediciones, previsión y sugerir equipo (§4). Sin DOM. Dueño: NÚCLEO.

import {
  K, climaDe, climaTipo, contarRol, poderMon, multTipo, poderEquipo, dificultad, dificultadMisterio,
  probPiso, tramos, tramosHasta, tramoMisterio, velEquipo, tPiso, botinPiso, mMisterio,
  esPatrullaNocturna, jefesVencidos,
} from './formulas.js';
import { mulberry32, hashSeed, elegirPonderado } from './rng.js';
import { tablaEncuentros, tirarEncuentro, trasEncuentro, islaMisterio, esMarea } from './recruit.js';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function islaDe(datos, id) {
  if (id === 'misterio') return null;
  if (datos.islaPorId && datos.islaPorId[id]) return datos.islaPorId[id];
  return (datos.islas || []).find((i) => String(i.id) === String(id)) || null;
}

function islaPlan(plan, ctx) {
  if (plan.isla === 'misterio') return islaMisterio(ctx);
  const i = islaDe(ctx.datos, plan.tutorial ? 1 : plan.isla);
  if (!i) throw new Error(`No existe la isla ${plan.isla}.`);
  return i;
}

// El guía (de = "faro") es un inicial (R) y no cuenta para el guion del primer raro.
function tieneRaro(save, especies) {
  for (const p of save.pokemon || []) {
    if (p.de === 'faro') continue;
    const r = especies[p.sp] && especies[p.sp].rar;
    if (r === 'R' || r === 'L') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Congela el equipo al enviar: poderes, tipos, nombres, nivel del líder y lo que la
 * resolución necesita del guardado (faro, dominio, piedad, huellas, cadenas, guion).
 */
export function crearSnapshot(save, plan, datos) {
  const esp = datos.especies;
  const porId = new Map((save.pokemon || []).map((p) => [p.id, p]));
  const miembros = [];
  for (const uid of plan.equipo || []) {
    const mon = porId.get(uid);
    if (!mon) throw new Error('Ese Pokémon ya no está en la cala.');
    const e = esp[mon.sp] || { tot: 0, t: ['normal'], s: [0, 0, 0, 0, 0, 0], n: mon.sp };
    miembros.push({
      uid, sp: mon.sp, n: e.n, ap: mon.ap || '', vr: !!mon.vr,
      nv: mon.nv, est: mon.est || 0, car: mon.car || 0,
      tipos: [...(e.t || [])], tot: e.tot, vel: (e.s && e.s[5]) || 0,
      poder: poderMon(mon, e),
    });
  }
  if (!miembros.length) throw new Error('El equipo está vacío.');
  const roles = ['lider', ...((plan.roles || []).slice(1, miembros.length))];
  while (roles.length < miembros.length) roles.push('expl');
  const islaId = plan.tutorial ? 1 : plan.isla;
  const isl = (save.islas && save.islas[islaId]) || {};
  const enviadas = (save.tutorial && save.tutorial.enviadas) ?? (save.stats && save.stats.exps) ?? 0;
  const tutorial = !!plan.tutorial;
  const rec = estadoReclutaVigente(save, islaId, isl);
  return {
    v: 1,
    isla: islaId,
    miembros,
    roles,
    liderNv: miembros[0].nv,
    linterna: (save.base && save.base.linterna) || 0,
    taberna: (save.base && save.base.taberna) || 0,
    faro: save.faro || 'norte',
    dominioIsla: isl.dominio || 0,
    jefes: jefesVencidos(save),
    nombre: save.nombre || '',
    piedad: rec.piedad || 0,
    huellas: { ...(rec.huellas || {}) },
    cadenas: { ...(save.cadenas || {}) },
    guion: {
      tutorial,
      multEnc: !tutorial && enviadas < 2 ? K.ENC_GUION : 1,
      forzarR: !tutorial && enviadas === 2 && !tieneRaro(save, esp),
    },
    forzarEvento: (save.informesSinEspecial || 0) >= K.INFORMES_SIN_ESPECIAL,
  };
}

/**
 * Piedad y huellas de las que parte un envío: las de la isla o, si hay equipos de expedición en ella, las que dejará
 * el último que salió (su registro ya las incluye). Así dos equipos enviados a la vez no comparten el mismo raro
 * garantizado. Al recoger, game.js aplica los encuentros de cada registro sobre la isla (no copia el estado).
 */
export function estadoReclutaVigente(save, islaId, isl = (save.islas && save.islas[islaId]) || {}) {
  let ultimo = null;
  for (const e of save.equipos || []) {
    const x = e && e.exp;
    if (!x || !x.plan || x.plan.isla !== islaId || x.plan.tutorial || !x.registro || !x.registro.estadoRecluta) continue;
    if (!ultimo || x.inicio >= ultimo.inicio) ultimo = x;
  }
  return ultimo ? ultimo.registro.estadoRecluta : { piedad: isl.piedad || 0, huellas: isl.huellas || {} };
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

function tablaObjetos(isla) {
  let lista = isla.objetos && isla.objetos.length ? isla.objetos : (K.OBJETOS_ISLA[isla.id] || []);
  if (isla.id === 'misterio') lista = Object.values(K.OBJETOS_ISLA).flat();
  const otros = lista.filter((o) => o !== 'baya_grande');
  const t = [['baya_grande', otros.length ? K.OBJ_BAYA_GRANDE : 1]];
  for (const o of otros) t.push([o, (1 - K.OBJ_BAYA_GRANDE) / otros.length]);
  return t;
}

function sumarObj(obj, id, n = 1) {
  obj[id] = (obj[id] || 0) + n;
}

/**
 * Resuelve una expedición entera. Determinista para (plan, snapshot, semilla, inicio, ctx).
 * ligero = true: no guarda encuentros ni eventos (para la previsión).
 */
/** Todo lo que no depende de la semilla (se calcula una vez por previsión). */
function preparar({ plan, snapshot, inicio, ctx }) {
  const tutorial = !!(plan.tutorial || (snapshot.guion && snapshot.guion.tutorial));
  const isla = islaPlan(tutorial ? { ...plan, isla: 1, tutorial: true } : plan, ctx);
  const mist = isla.id === 'misterio';
  const clima = climaDe(ctx, isla.id);
  const roles = snapshot.roles;
  const nExpl = contarRol(roles, 'expl');
  const nReco = contarRol(roles, 'reco');
  const nApoyo = contarRol(roles, 'apoyo');
  const postura = plan.postura || 'equilibrada';
  const audaz = postura === 'audaz';
  const vel = velEquipo(snapshot, roles, clima.exploradorDoble ? K.PESO_EXPLORADOR_NIEBLA : K.PESO_EXPLORADOR);
  const tP = tutorial ? K.TUTORIAL_T : Math.round(tPiso(isla, vel, snapshot.taberna, clima.climaT, postura));
  const ctxE = { ...ctx, marea: ctx.marea ?? esMarea(inicio) };
  const { P, composicion } = poderEquipo(snapshot, isla, ctxE);
  const patrulla = !tutorial && (mist || plan.modo === 'patrulla');
  const horas = plan.horas || 1;
  const F = tutorial ? K.TUTORIAL_PISOS : isla.F;
  const listaTramos = mist ? null
    : tutorial ? [1, 2, 3].map((f) => ({ desde: f, hasta: f, jefe: false }))
      : patrulla ? tramos(F) : tramosHasta(F, plan.hasta ?? F);
  const pCofre = 0.2 + K.COFRE_EXPLORADOR * nExpl * (clima.exploradorDoble ? 2 : 1);
  return {
    tutorial, isla, mist, clima, nExpl, nReco, nApoyo, postura, audaz,
    prudente: postura === 'prudente',
    tP, ctxE, P, composicion,
    pvInicio: Math.max(1, K.PV_BASE + nApoyo - (audaz ? 1 : 0)),
    pMin: nApoyo > 0 ? K.P_MIN_APOYO : K.P_MIN,
    dominio: mist || tutorial ? 0 : (plan.dominio || 0),
    climaD: clima.climaD || 1,
    patrulla, horas,
    limite: patrulla ? inicio + horas * 3600000 : Infinity,
    nocturna: patrulla && !mist && esPatrullaNocturna(inicio, horas),
    F, listaTramos,
    hasta: mist ? K.MISTERIO_PISOS_MAX : listaTramos[listaTramos.length - 1].hasta,
    objIsla: tablaObjetos(isla),
    pesosEvento: K.EVENTOS.map((e) => [e, e === 'cofre' ? pCofre : (1 - pCofre) / 4]),
    tabla: tablaEncuentros(isla, { faro: snapshot.faro, islas: { [isla.id]: { dominio: snapshot.dominioIsla || 0 } } }, ctxE),
  };
}

function resolver({ plan, snapshot, semilla, inicio, ctx }, ligero = false, prep = null) {
  const pr = prep || preparar({ plan, snapshot, inicio, ctx });
  const {
    tutorial, isla, mist, nReco, postura, prudente, tP, ctxE, P, composicion, pvInicio, pMin,
    dominio, climaD, patrulla, limite, nocturna, F, listaTramos, hasta, objIsla, pesosEvento, tabla,
  } = pr;
  const estRec = { piedad: snapshot.piedad || 0, huellas: { ...(snapshot.huellas || {}) } };
  const guion = snapshot.guion || {};
  let forzarR = !!guion.forzarR;
  let forzarEvento = !!snapshot.forzarEvento;
  let tutorialRecluta = tutorial;

  const rondas = [];
  const tot = { monedas: 0, exp: 0, objetos: {}, reclutas: 0 };
  let t = inicio;
  let pv = pvInicio;
  let motivo = null;
  let ronda = 0;
  let pisosSuperados = 0;

  while (!motivo) {
    const r = {
      t0: t, t1: t, pv0: pv, pisoFin: 0, jefe: false, pvFin: pv,
      monedas: 0, exp: 0, objetos: {}, encuentros: [], eventos: [], fallos: [],
    };
    rondas.push(r);
    let rec = 0;

    const botin = (rng, f, frac, jefe) => {
      const m = mist ? mMisterio(f) : isla.id;
      const b = botinPiso(m, f, { jefe, dominio, nocturna, postura, nReco, triple: composicion.triple });
      r.monedas += Math.round(b.monedas * frac);
      r.exp += Math.round(b.exp * frac);
      if (rng() < b.pObjeto * frac) sumarObj(r.objetos, elegirPonderado(rng, objIsla));
      if (jefe && !mist && isla.id >= K.JEFE_OBJ_ISLA_MIN) {
        if (rng() < K.JEFE_ALBA) sumarObj(r.objetos, 'piedra_alba');
        if (rng() < K.JEFE_CORDON) sumarObj(r.objetos, 'cordon_amistad');
      }
      return b;
    };

    const encuentro = (rng, f) => {
      let enc;
      if (tutorialRecluta && f === F) {
        enc = tirarEncuentro(rng, { isla, piso: 1, F, snapshot, postura, tabla, piedad: 0, huellas: {}, ctx: ctxE, forzar: 'C', aceptaSeguro: true, nvFijo: 4 });
        if (enc) { enc.f = f; tutorialRecluta = false; }
      } else if (tutorial) {
        return;
      } else if (forzarR) {
        enc = tirarEncuentro(rng, { isla, piso: f, F, snapshot, postura, tabla, piedad: estRec.piedad, huellas: estRec.huellas, ctx: ctxE, forzar: 'R', aceptaSeguro: true });
        forzarR = false;
      } else {
        enc = tirarEncuentro(rng, { isla, piso: f, F, snapshot, postura, tabla, piedad: estRec.piedad, huellas: estRec.huellas, ctx: ctxE, multEnc: guion.multEnc || 1 });
      }
      if (!enc) return;
      enc.de = tutorial ? 'tutorial' : `${isla.clave || isla.id}:${f}`;
      trasEncuentro(enc, estRec);
      if (enc.acepta) rec++;
      if (!ligero) r.encuentros.push(enc);
    };

    const evento = (rng, f, b, D) => {
      let tipo = null;
      if (forzarEvento) { tipo = K.EVENTOS_MENORES[Math.floor(rng() * K.EVENTOS_MENORES.length)]; forzarEvento = false; }
      else if (rng() < K.P_EVENTO) tipo = elegirPonderado(rng, pesosEvento);
      if (!tipo) return;
      const ev = { f, tipo, datos: {} };
      const monPiso = Math.round(b.monedas);
      if (tipo === 'kecleon') {
        const it = elegirPonderado(rng, objIsla);
        const precio = Math.round(monPiso * (it === 'baya_grande' ? K.KECLEON_PRECIO.baya_grande : K.KECLEON_PRECIO.otro));
        const ganadas = tot.monedas + r.monedas;
        if (precio <= K.KECLEON_TOPE * ganadas) {
          r.monedas -= precio;
          sumarObj(r.objetos, it);
          ev.datos = { it, precio };
        } else ev.datos = { it: null, precio };
      } else if (tipo === 'cofre') {
        const it = elegirPonderado(rng, objIsla);
        sumarObj(r.objetos, it);
        const extra = monPiso * (K.COFRE_MONEDAS - 1);
        r.monedas += extra;
        ev.datos = { it, monedas: extra };
      } else if (tipo === 'casa') {
        const gana = rng() < probPiso(P, D * K.CASA_D, pMin);
        if (gana) {
          r.monedas += Math.round(b.monedas * (K.CASA_BOTIN - 1));
          r.exp += Math.round(b.exp * (K.CASA_BOTIN - 1));
        }
        ev.datos = { gana };
      } else if (tipo === 'perdido') {
        const extra = monPiso * (K.PERDIDO_MONEDAS - 1);
        r.monedas += extra;
        ev.datos = { car: K.PERDIDO_CARINO, monedas: extra };
      } else if (tipo === 'manantial') {
        const antes = pv;
        pv = Math.min(pvInicio, pv + 1);
        ev.datos = { pv: pv - antes };
      }
      if (!ligero) r.eventos.push(ev);
    };

    const fallo = (f) => {
      pv--;
      r.fallos.push(f);
      if (pv <= 0) { motivo = 'rescatado'; return true; }
      if (prudente && pv <= 1) { motivo = 'prudente'; return true; }
      return false;
    };

    for (let idx = 0; ; idx++) {
      let tramo;
      if (mist) {
        tramo = tramoMisterio(idx);
        if (tramo.desde > K.MISTERIO_PISOS_MAX) { motivo = 'objetivo'; break; }
      } else {
        if (idx >= listaTramos.length) break;
        tramo = listaTramos[idx];
      }
      const nP = tramo.hasta - tramo.desde + 1;
      const rng = mulberry32(hashSeed(semilla, ronda, idx));
      const D = mist ? dificultadMisterio(tramo.hasta, climaD) : dificultad(isla, tramo.hasta, dominio, climaD);
      const p = tutorial ? 1 : probPiso(P, D, pMin);
      if (!tramo.jefe) {
        if (t + nP * tP > limite) { motivo = 'tiempo'; break; }
        const ok = rng() < p;
        t += nP * tP;
        for (let f = tramo.desde; f <= tramo.hasta; f++) {
          const Df = mist ? dificultadMisterio(f, climaD) : dificultad(isla, f, dominio, climaD);
          const b = botin(rng, f, ok ? 1 : K.FALLO_BOTIN, false);
          if (ok) { encuentro(rng, f); evento(rng, f, b, Df); pisosSuperados++; }
        }
        r.pisoFin = tramo.hasta;
        if (!ok && fallo(tramo.hasta)) break;
      } else {
        if (t + tP > limite) { motivo = 'tiempo'; break; }
        let intentos = 0;
        let acabado = false;
        while (true) {
          const ok = rng() < p;
          t += tP;
          intentos++;
          if (ok) {
            const b = botin(rng, F, 1, true);
            encuentro(rng, F);
            evento(rng, F, b, D);
            pisosSuperados++;
            r.jefe = true;
            r.pisoFin = F;
            break;
          }
          if (fallo(F)) { acabado = true; break; }
          if (intentos > K.MAX_REINTENTOS_JEFE) { motivo = 'rescatado'; acabado = true; break; }
        }
        if (acabado) break;
      }
    }

    r.t1 = t;
    r.pvFin = pv;
    tot.monedas += r.monedas;
    tot.exp += r.exp;
    for (const [k, v] of Object.entries(r.objetos)) sumarObj(tot.objetos, k, v);
    tot.reclutas += rec;
    if (ligero) r.nEnc = rec;

    if (motivo) break;
    if (patrulla && !mist && r.jefe) {
      pv = Math.min(pvInicio, pv + 1);
      ronda++;
      continue;
    }
    motivo = 'objetivo';
  }

  const fin = motivo === 'tiempo' ? Math.max(t, limite) : t;
  const registro = {
    v: 1, semilla, inicio, fin, tPiso: tP, pvInicio,
    isla: isla.id, F, hasta, modo: tutorial ? 'tutorial' : mist ? 'misterio' : (patrulla ? 'patrulla' : 'vuelta'),
    postura, P, n: snapshot.miembros.length,
    rondas,
    motivo,
    totales: tot,
    estadoRecluta: estRec,
    pisos: pisosSuperados,
  };
  if (!ligero) {
    registro.jefeSp = mist || tutorial ? null : (isla.jefe || null);
    registro.pool = poolVisual(tabla, isla);
  }
  return registro;
}

function poolVisual(tabla, isla) {
  const out = [];
  for (const r of ['C', 'PC']) for (const x of tabla[r] || []) if ((x[2] || 1) <= 1) out.push(x[0]);
  if (!out.length) for (const r of ['C', 'PC', 'R']) for (const x of tabla[r] || []) out.push(x[0]);
  return out.slice(0, 24);
}

/** Resuelve la expedición entera al enviarla (el informe queda fijado). */
export function resolverExpedicion(arg) {
  return resolver(arg, false);
}

// ---------------------------------------------------------------------------
// Estado en un instante (para «En curso» y la escena)
// ---------------------------------------------------------------------------

function tramoDe(registro, piso) {
  if (registro.modo === 'misterio') return Math.floor((piso - 1) / K.MISTERIO_TRAMO);
  if (registro.modo === 'tutorial') return piso - 1;
  const ts = tramos(registro.F);
  for (let i = 0; i < ts.length; i++) if (piso >= ts[i].desde && piso <= ts[i].hasta) return i;
  return ts.length - 1;
}

/** Cambios de PV de una ronda como [[t, delta], ...] ordenados por tiempo. */
function cambiosPv(registro, r) {
  const tP = registro.tPiso;
  const F = registro.F;
  const out = [];
  let fallosJefe = 0;
  for (const f of r.fallos) {
    if (f === F && registro.modo !== 'misterio' && registro.modo !== 'tutorial') {
      fallosJefe++;
      out.push([r.t0 + (F - 1 + fallosJefe) * tP, -1]);
    } else out.push([r.t0 + f * tP, -1]);
  }
  for (const ev of r.eventos || []) {
    if (!ev || ev.tipo !== 'manantial' || !ev.datos.pv) continue;
    const k = ev.f === F && registro.modo !== 'misterio' ? F + fallosJefe : ev.f;
    out.push([r.t0 + k * tP, ev.datos.pv]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/** Último piso pisado en una ronda (el jefe cuenta aunque no se venciera). */
function pisoAlcanzado(registro, r) {
  const jefeIntentado = registro.modo !== 'misterio' && registro.modo !== 'tutorial' && r.fallos.includes(registro.F);
  return Math.max(1, jefeIntentado ? registro.F : r.pisoFin);
}

/** Estado de la expedición en tMs: { ronda, piso, tramo, pv, terminado, fraccion }. */
export function estadoEn(registro, tMs) {
  const { inicio, fin, rondas } = registro;
  const total = Math.max(1, fin - inicio);
  const fraccion = Math.min(1, Math.max(0, (tMs - inicio) / total));
  const ult = rondas[rondas.length - 1];
  if (tMs >= fin) {
    const pa = pisoAlcanzado(registro, ult);
    return { ronda: rondas.length - 1, piso: pa, tramo: tramoDe(registro, pa), pv: ult.pvFin, terminado: true, fraccion: 1 };
  }
  let i = 0;
  while (i < rondas.length - 1 && tMs >= rondas[i].t1) i++;
  const r = rondas[i];
  if (tMs >= r.t1) {
    const pa = pisoAlcanzado(registro, r);
    return { ronda: i, piso: pa, tramo: tramoDe(registro, pa), pv: r.pvFin, terminado: false, fraccion };
  }
  const k = Math.max(0, Math.floor((Math.max(tMs, r.t0) - r.t0) / registro.tPiso));
  let piso = k + 1;
  piso = Math.min(piso, registro.modo === 'misterio' ? K.MISTERIO_PISOS_MAX : registro.F);
  let pv = r.pv0;
  for (const [tc, d] of cambiosPv(registro, r)) if (tc <= tMs) pv += d;
  return { ronda: i, piso, tramo: tramoDe(registro, piso), pv: Math.max(0, pv), terminado: false, fraccion };
}

/** Detalle visual determinista de un piso: enemigo, golpes y si salió bien. */
export function detallePiso(registro, ronda, piso) {
  const r = registro.rondas[ronda] || registro.rondas[registro.rondas.length - 1];
  const rng = mulberry32(hashSeed(registro.semilla, 'det', ronda, piso));
  const esJefe = registro.modo !== 'misterio' && registro.modo !== 'tutorial' && piso === registro.F && registro.F > 1;
  const pool = registro.pool && registro.pool.length ? registro.pool : [];
  const enemigo = esJefe && registro.jefeSp ? registro.jefeSp : (pool.length ? pool[Math.floor(rng() * pool.length)] : null);
  let ok;
  if (esJefe) ok = !!r.jefe;
  else {
    let hasta = piso;
    if (registro.modo === 'misterio') hasta = tramoMisterio(tramoDe(registro, piso)).hasta;
    else if (registro.modo !== 'tutorial') {
      const ts = tramos(registro.F);
      const t = ts[tramoDe(registro, piso)];
      hasta = t ? Math.min(t.hasta, registro.hasta || t.hasta) : piso;
    }
    ok = piso <= r.pisoFin && !r.fallos.includes(hasta);
  }
  const n = Math.max(1, registro.n || 3);
  const golpes = [];
  const nG = 3 + Math.floor(rng() * 3);
  for (let g = 0; g < nG; g++) {
    const delEquipo = g % 2 === 0 || rng() < 0.3;
    golpes.push({
      t: (g + 0.5) / nG,
      de: delEquipo ? 'equipo' : 'enemigo',
      idx: Math.floor(rng() * n),
      fuerte: rng() < 0.25,
    });
  }
  if (!ok) golpes.push({ t: 0.95, de: 'enemigo', idx: Math.floor(rng() * n), fuerte: true });
  return { enemigo, golpes, ok, jefe: esJefe };
}

// ---------------------------------------------------------------------------
// Previsión (§4.8)
// ---------------------------------------------------------------------------

/**
 * Previsión con n semillas hashSeed(semilla, "prev", i) (nunca la real).
 * Prevision = { pJefe, pisosMedia, vueltasMedia, monedas, exp, reclutas, finMediana }.
 */
export function prever(arg, n = 200) {
  let jefe = 0, pisos = 0, vueltas = 0, monedas = 0, exp = 0, reclutas = 0;
  const fines = new Array(n);
  const prep = preparar(arg);
  for (let i = 0; i < n; i++) {
    const reg = resolver({ ...arg, semilla: hashSeed(arg.semilla, 'prev', i) }, true, prep);
    let v = 0;
    for (const r of reg.rondas) if (r.jefe) v++;
    if (v > 0) jefe++;
    vueltas += v;
    pisos += reg.modo === 'vuelta' || reg.modo === 'tutorial' ? reg.rondas[0].pisoFin : reg.pisos;
    monedas += reg.totales.monedas;
    exp += reg.totales.exp;
    reclutas += reg.totales.reclutas;
    fines[i] = reg.fin;
  }
  fines.sort((a, b) => a - b);
  return {
    pJefe: jefe / n,
    pisosMedia: pisos / n,
    vueltasMedia: vueltas / n,
    monedas: monedas / n,
    exp: exp / n,
    reclutas: reclutas / n,
    finMediana: n ? fines[Math.floor((n - 1) / 2)] : arg.inicio,
  };
}

// ---------------------------------------------------------------------------
// Sugerir equipo (§4.8)
// ---------------------------------------------------------------------------

/** uids ocupados en una expedición en curso. */
export function ocupados(save) {
  const s = new Set();
  for (const e of save.equipos || []) if (e.exp) for (const u of e.miembros || []) s.add(u);
  return s;
}

/**
 * Sugerir equipo: Líder = mayor poder × mult libre; luego, para cada hueco, se prueban
 * los 8 mejores en cada rol con prever(plan, 40) y gana el que más sube pJefe.
 * opciones: { modo, hasta, horas, postura, dominio, disponibles?, excluir?, n? (40), candidatos? (8), semilla? }.
 * Devuelve { equipo, roles, prob }.
 */
export function sugerirEquipo(save, isla, opciones = {}, ctx) {
  const datos = ctx.datos;
  const esp = datos.especies;
  const islaObj = isla === 'misterio' ? islaMisterio(ctx) : islaDe(datos, isla);
  const clima = climaDe(ctx, islaObj.id);
  const ocup = ocupados(save);
  const excl = new Set(opciones.excluir || []);
  const disp = opciones.disponibles ? new Set(opciones.disponibles) : null;
  const ef = datos.tipos ? datos.tipos.ef : null;
  const cands = (save.pokemon || [])
    .filter((p) => !excl.has(p.id) && (disp ? disp.has(p.id) : !ocup.has(p.id)))
    .map((p) => {
      const e = esp[p.sp] || { t: [], tot: 0 };
      const v = poderMon(p, e) * multTipo(e.t, islaObj.tipos, ef).mult * climaTipo(clima, e.t);
      return { id: p.id, v };
    })
    .sort((a, b) => b.v - a.v);
  if (!cands.length) return { equipo: [], roles: [], prob: 0 };
  const n = opciones.n || 40;
  const semilla = opciones.semilla ?? hashSeed('sugerir', isla, save.idDispositivo || '');
  const inicio = ctx.ahora ?? Date.now();
  // Se puntúa siempre con una vuelta hasta el jefe (en patrulla, las vueltas dependen de ello).
  const base = {
    isla, modo: 'vuelta', hasta: isla === 'misterio' ? undefined : (opciones.modo === 'patrulla' ? undefined : opciones.hasta),
    horas: isla === 'misterio' ? Math.min(opciones.horas || 1, 1) : opciones.horas,
    postura: opciones.postura || 'equilibrada', dominio: opciones.dominio || 0,
  };
  const puntuar = (equipo, roles) => {
    const plan = { ...base, equipo, roles };
    const snapshot = crearSnapshot(save, plan, datos);
    const pr = prever({ plan, snapshot, semilla, inicio, ctx }, n);
    const principal = isla === 'misterio' ? pr.pisosMedia / 1000 : pr.pJefe;
    return { prob: pr.pJefe, score: principal * 1e6 + pr.pisosMedia * 1e3 + pr.monedas / 1e6 };
  };
  const equipo = [cands[0].id];
  const roles = ['lider'];
  const pool = cands.slice(1, 1 + (opciones.candidatos || 8)).map((c) => c.id);
  let prob = null;
  for (let hueco = 1; hueco <= 2 && pool.length; hueco++) {
    let mejor = null;
    for (const c of pool) {
      for (const rol of ['expl', 'reco', 'apoyo']) {
        const s = puntuar([...equipo, c], [...roles, rol]);
        if (!mejor || s.score > mejor.score) mejor = { ...s, c, rol };
      }
    }
    equipo.push(mejor.c);
    roles.push(mejor.rol);
    prob = mejor.prob;
    pool.splice(pool.indexOf(mejor.c), 1);
  }
  if (prob == null) prob = puntuar(equipo, roles).prob;
  return { equipo, roles, prob };
}
