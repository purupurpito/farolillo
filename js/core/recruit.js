// Encuentros, aceptación, piedad, huellas y variocolor (§6). Sin DOM. Dueño: NÚCLEO.

import { K, contarRol, climaDe, nivelSalvaje, pAcepta, topeNivel, jefesVencidos } from './formulas.js';
import { elegirPonderado, hashSeed, mulberry32, idAleatorio } from './rng.js';

const PROTEGIDAS = new Set(['llega', 'evo', 'vario', 'intercambio']);
const MAX_DIARIO = 8;

/** Añade una entrada al diario de un Mon (máx. 8; cae la no protegida más antigua). */
export function anotarDiario(mon, t, tipo, datos = {}) {
  if (!Array.isArray(mon.dia)) mon.dia = [];
  mon.dia.push([t, tipo, datos]);
  while (mon.dia.length > MAX_DIARIO) {
    const i = mon.dia.findIndex((e) => !PROTEGIDAS.has(e[1]));
    mon.dia.splice(i >= 0 ? i : 0, 1);
  }
}

// ---------------------------------------------------------------------------
// Familias y etapas
// ---------------------------------------------------------------------------

const cacheEtapas = new WeakMap();

/** Mapa dex4 → { etapa (1 base, 2, 3), fam, hijos: [dex4] } a partir de especies. */
export function etapas(especies) {
  let c = cacheEtapas.get(especies);
  if (c) return c;
  c = {};
  const etapaDe = (sp, prof = 0) => {
    const e = especies[sp];
    if (!e || !e.pre || !especies[e.pre] || prof > 4) return 1;
    return 1 + etapaDe(e.pre, prof + 1);
  };
  for (const sp of Object.keys(especies)) {
    const e = especies[sp];
    c[sp] = {
      etapa: etapaDe(sp),
      fam: e.fam || sp,
      hijos: (e.evo || []).map((x) => x.a).filter((a) => especies[a]),
    };
  }
  cacheEtapas.set(especies, c);
  return c;
}

/** Familia (dex4 de la base) de una especie. */
export function familia(especies, sp) {
  return (especies[sp] && especies[sp].fam) || sp;
}

// ---------------------------------------------------------------------------
// Tabla de encuentros
// ---------------------------------------------------------------------------

/** ¿Hora de marea? (22:00-07:00 locales) */
export function esMarea(ms) {
  const h = new Date(ms).getHours();
  return h >= K.MAREA_DESDE || h < K.MAREA_HASTA;
}

/**
 * Bases de una isla con su peso: `especies` (peso 1, o [sp, peso] / {sp, p}),
 * `sec` (apariciones secundarias, peso `pesoSec`, 0,5 por defecto) y `extra` ({sp: peso}:
 * iniciales, Pikachu y Eevee, que los datos ya traen ponderados).
 */
function entradasIsla(isla) {
  const out = [];
  for (const x of isla.especies || []) {
    if (typeof x === 'string') out.push([x, 1]);
    else if (Array.isArray(x)) out.push([x[0], x[1] ?? 1]);
    else if (x && x.sp) out.push([x.sp, x.p ?? x.peso ?? 1]);
  }
  for (const sp of isla.sec || []) out.push([sp, isla.pesoSec ?? 0.5]);
  for (const [sp, w] of Object.entries(isla.extra || {})) out.push([sp, w]);
  return out;
}

/** Isla virtual de la Mazmorra Misterio para tablas y resolución. */
export function islaMisterio(ctx) {
  return {
    id: 'misterio', clave: 'misterio', n: 'Mazmorra Misterio',
    tipos: (ctx && ctx.tiposMisterio) || ['normal', 'volador'],
    F: K.MISTERIO_PISOS_MAX, tBase: K.MISTERIO_TBASE, especies: null, leg: [], objetos: null,
  };
}

/**
 * Tabla de encuentros de una isla: { C, PC, R, L }, cada una [[sp, peso, desdePiso], ...].
 * Lee de save solo faro e islas[id].dominio. ctx: { datos, ahora, marea?, evento? }.
 */
export function tablaEncuentros(isla, save, ctx) {
  const datos = ctx.datos;
  const esp = datos.especies;
  const et = etapas(esp);
  const faro = (save && save.faro) || 'norte';
  const gen = K.FARO_GEN[faro];
  const mist = isla.id === 'misterio';
  const m = mist ? 0 : isla.id;
  const F = mist ? K.MISTERIO_PISOS_MAX : isla.F;
  const dominio = (save && save.islas && save.islas[isla.id] && save.islas[isla.id].dominio) || 0;
  const marea = ctx.marea ?? (ctx.ahora != null ? esMarea(ctx.ahora) : false);
  const ev = ctx.evento || null;
  const tiposIsla = isla.tipos || [];

  // Bases con su peso.
  const bases = new Map();
  if (mist) {
    for (const sp of Object.keys(esp)) {
      const e = esp[sp];
      if (et[sp].etapa !== 1 || e.leg || e.rar === 'L') continue;
      if ((e.t || []).some((t) => tiposIsla.includes(t))) bases.set(sp, 1);
    }
  } else {
    for (const [sp, w] of entradasIsla(isla)) if (esp[sp] && !bases.has(sp)) bases.set(sp, w);
  }
  // Iniciales, Pikachu y Eevee: R con peso bajo en todas las islas (si los datos no traen `extra`).
  for (const sp of (isla.extra ? [] : K.INICIALES)) {
    if (!esp[sp] || bases.has(sp)) continue;
    const comparte = (esp[sp].t || []).some((t) => tiposIsla.includes(t));
    bases.set(sp, K.PESO_INICIALES * (comparte ? K.PESO_INICIALES_TIPO : 1));
  }

  const tabla = { C: [], PC: [], R: [], L: [] };
  const vistos = new Set();
  const desdeEtapa = (etapa) => {
    if (etapa <= 1) return 1;
    if (mist) return etapa === 2 ? K.MISTERIO_ETAPA2 : K.MISTERIO_ETAPA3;
    if (isla.evolTardias === false) return null;
    if (etapa === 2 && m < K.ETAPA2_ISLA) return null;
    if (etapa >= 3 && m < K.ETAPA3_ISLA) return null;
    return Math.max(1, Math.ceil(K.EVOL_TARDIAS * F));
  };
  const pesoFaro = (e) => {
    if (e.exc && e.exc !== faro) return dominio >= K.OTRO_FARO_DOMINIO ? K.PESO_OTRO_FARO : 0;
    if (e.exc === faro) return 1;
    return e.gen === gen ? K.PESO_FARO_GEN : 1;
  };
  const meter = (sp, w, desde) => {
    if (vistos.has(sp) || desde == null) return;
    const e = esp[sp];
    if (!e || e.rar === 'L' || e.leg) return;
    let peso = w * pesoFaro(e);
    if (marea && (e.t || []).some((t) => t === 'fantasma' || t === 'siniestro')) peso *= K.PESO_MAREA;
    if (ev && ev.tipo === 'tipo' && (e.t || []).includes(ev.t)) peso *= K.PESO_EVENTO_TIPO;
    if (ev && ev.tipo === 'visita' && ev.sp === sp) peso *= K.PESO_EVENTO_VISITA;
    if (!(peso > 0)) return;
    vistos.add(sp);
    (tabla[e.rar] || tabla.C).push([sp, peso, desde]);
  };
  const recorrer = (sp, w, prof) => {
    if (prof > 3) return;
    meter(sp, w, desdeEtapa(et[sp] ? et[sp].etapa : 1));
    for (const h of (et[sp] ? et[sp].hijos : [])) recorrer(h, w, prof + 1);
  };
  for (const [sp, w] of bases) recorrer(sp, w, 0);

  // Legendarios: solo en el piso del jefe de islas ≥ 6.
  if (!mist && m >= K.L_ISLA_MIN) {
    for (const sp of isla.leg || []) if (esp[sp]) tabla.L.push([sp, 1, F]);
  }
  return tabla;
}

// ---------------------------------------------------------------------------
// Variocolor
// ---------------------------------------------------------------------------

/** pVario a partir del nº de reclutas de la familia (sin mirar `vario`). */
export function pVarioBase(reclutasFamilia, evento = 1, lazo = 1) {
  const cadena = Math.min(K.CADENA_MAX, 1 + K.CADENA_K * (reclutasFamilia || 0));
  return K.VARIO_BASE * cadena * evento * lazo;
}

function eventoVario(ctx, islaId) {
  const ev = ctx && ctx.evento;
  if (ev && ev.tipo === 'brillos' && (islaId == null || String(ev.isla) === String(islaId))) return K.VARIO_EVENTO;
  return 1;
}

/** Probabilidad de variocolor de una especie para este guardado (0 si su familia no tiene). */
export function pVario(sp, save, ctx) {
  const esp = ctx.datos.especies[sp];
  if (!esp || !esp.vario) return 0;
  const fam = esp.fam || sp;
  const n = (save && save.cadenas && save.cadenas[fam]) || 0;
  return pVarioBase(n, eventoVario(ctx, ctx.islaId), (ctx && ctx.lazo) || 1);
}

// ---------------------------------------------------------------------------
// Tirada de encuentro
// ---------------------------------------------------------------------------

const ORDEN_RESPALDO = { L: ['L', 'R', 'PC', 'C'], R: ['R', 'PC', 'C'], PC: ['PC', 'C', 'R'], C: ['C', 'PC', 'R'] };

function filtrar(lista, piso) {
  const out = [];
  for (const x of lista || []) if (piso >= (x[2] || 1)) out.push(x);
  return out;
}

/**
 * Tira un encuentro en un piso superado. Devuelve Encuentro o null.
 * arg: { isla, piso, F, snapshot, postura, tabla, piedad, huellas, ctx,
 *        multEnc?, forzar? ('R'|'C'), aceptaSeguro?, nvFijo? }
 * snapshot: { roles, liderNv, cadenas }.
 * Encuentro = { f, sp, nv, acepta, vr, rar, huellaUsada, de? }
 */
export function tirarEncuentro(rng, arg) {
  const { isla, piso, F, snapshot, postura, tabla, piedad = 0, huellas = {}, ctx } = arg;
  const nReco = contarRol(snapshot.roles, 'reco');
  const forzar = arg.forzar || null;
  if (!forzar) {
    const pEnc = (K.ENC_BASE + K.ENC_RECO * nReco)
      * (postura === 'audaz' ? K.AUDAZ_ENC : 1)
      * ((ctx && ctx.bonoEncuentro) || 1)
      * (arg.multEnc || 1);
    if (rng() >= pEnc) return null;
  }
  const mist = isla.id === 'misterio';
  const m = mist ? 'misterio' : isla.id;
  const esJefe = !mist && piso === F;
  let rar = forzar;
  if (!rar && piedad >= K.PIEDAD) rar = 'R';
  if (!rar) {
    const clima = climaDe(ctx, isla.id);
    const pr = K.PESOS_RAREZA;
    const multR = (postura === 'audaz' ? K.AUDAZ_RAROS : 1) * (clima.raros || 1);
    rar = elegirPonderado(rng, [['C', pr.C], ['PC', pr.PC], ['R', pr.R * multR], ['L', pr.L]]);
    if (rar === 'L' && !(esJefe && isla.id >= K.L_ISLA_MIN)) rar = 'R';
  }
  let sp = null;
  for (const r of ORDEN_RESPALDO[rar]) {
    const lista = filtrar(tabla[r], piso);
    if (lista.length) { sp = elegirPonderado(rng, lista); rar = r; break; }
  }
  if (!sp) return null;
  const nv = arg.nvFijo || nivelSalvaje(m, piso);
  const huella = Math.min(K.HUELLA_MAX_UNIDADES, huellas[sp] || 0);
  const acepta = arg.aceptaSeguro || forzar === 'R' ? true : rng() < pAcepta(snapshot.liderNv || 1, nv, huella);
  const esp = ctx.datos.especies[sp];
  let vr = false;
  if (esp && esp.vario) {
    const n = (snapshot.cadenas && snapshot.cadenas[esp.fam || sp]) || 0;
    vr = rng() < pVarioBase(n, eventoVario(ctx, isla.id), (ctx && ctx.lazo) || 1);
  }
  return { f: piso, sp, nv, acepta, vr, rar, huellaUsada: huella };
}

/** Actualiza piedad y huellas tras un encuentro (las mismas reglas que aplica game.js). */
export function trasEncuentro(enc, estado) {
  if (enc.rar === 'R' || enc.rar === 'L') estado.piedad = 0;
  else estado.piedad = (estado.piedad || 0) + 1;
  if (enc.acepta) {
    if (estado.huellas[enc.sp]) delete estado.huellas[enc.sp];
  } else {
    estado.huellas[enc.sp] = Math.min(K.HUELLA_MAX_UNIDADES, (estado.huellas[enc.sp] || 0) + 1);
  }
  return estado;
}

// ---------------------------------------------------------------------------
// Aplicar un recluta al guardado
// ---------------------------------------------------------------------------

function nuevoId(save, enc, ahora) {
  const usados = new Set(save.pokemon.map((p) => p.id));
  const rng = mulberry32(hashSeed('recluta', enc.sp, enc.f, ahora, save.pokemon.length));
  let id;
  do id = 'm_' + idAleatorio(rng, 6); while (usados.has(id));
  return id;
}

function deDe(enc) {
  if (enc.de) return enc.de;
  return `?:${enc.f}`;
}

function datosLlegada(de, f) {
  const [i, p] = String(de).split(':');
  return p != null ? { i, f: Number(p) || f } : { i };
}

/**
 * Aplica un encuentro aceptado: individuo nuevo, +estrella, caramelo o «lleno».
 * Marca visto/tenido y suma a la cadena de la familia. Muta save.
 * Devuelve { tipo: "nuevo"|"estrella"|"caramelo"|"individuo"|"lleno"|"rechazo", uid, especial, mon? }.
 */
export function aplicarRecluta(save, enc, ctx) {
  const ahora = (ctx && ctx.ahora) || Date.now();
  const esp = ctx.datos.especies;
  const e = esp[enc.sp] || {};
  save.bitacora = save.bitacora || { visto: {}, tenido: {} };
  if (!save.bitacora.visto[enc.sp]) save.bitacora.visto[enc.sp] = ahora;
  if (!enc.acepta) return { tipo: 'rechazo', uid: null, especial: false };

  const nuevaEnBitacora = !save.bitacora.tenido[enc.sp];
  const especial = nuevaEnBitacora || enc.rar === 'R' || enc.rar === 'L' || !!enc.vr;
  const fam = e.fam || enc.sp;
  save.cadenas = save.cadenas || {};
  // La cadena solo suma si el encuentro entra en la cala (individuo nuevo o fusión), no si se queda fuera por «lleno».
  const sumarCadena = () => { save.cadenas[fam] = (save.cadenas[fam] || 0) + 1; };

  const lleno = save.pokemon.length >= K.MAX_POKEMON;
  const fusionar = lleno || !save.ajustes || save.ajustes.duplicados !== 'preguntar';
  let mejor = null;
  if (!enc.vr) {
    for (const p of save.pokemon) {
      if (p.sp !== enc.sp) continue;
      if (!mejor || (p.est || 0) > (mejor.est || 0) || ((p.est || 0) === (mejor.est || 0) && p.nv > mejor.nv)) mejor = p;
    }
  }
  if (mejor && fusionar) {
    sumarCadena();
    save.bitacora.tenido[enc.sp] = save.bitacora.tenido[enc.sp] || ahora;
    if ((mejor.est || 0) >= 5) {
      save.caramelos = save.caramelos || {};
      save.caramelos[enc.sp] = (save.caramelos[enc.sp] || 0) + 1;
      return { tipo: 'caramelo', uid: mejor.id, especial };
    }
    mejor.dup = (mejor.dup || 0) + 1;
    const coste = K.COSTE_ESTRELLA[mejor.est || 0];
    if (mejor.dup >= coste) {
      mejor.est = (mejor.est || 0) + 1;
      mejor.dup = 0;
      if (mejor.est === 5) anotarDiario(mejor, ahora, 'estrella5', {});
    }
    return { tipo: 'estrella', uid: mejor.id, especial };
  }
  // Cala llena y sin con quién fusionarse (especie nueva o variocolor): no entra. game.js lo deja pendiente
  // para ofrecer «Liberar a otro / Dejarlo ir» (§3.8); nunca se descarta sin preguntar.
  if (lleno) return { tipo: 'lleno', uid: null, especial };

  sumarCadena();
  const de = deDe(enc);
  const mon = {
    id: nuevoId(save, enc, ahora), sp: enc.sp, vr: !!enc.vr, ap: '',
    nv: Math.max(1, Math.min(enc.nv || 1, topeNivel(jefesVencidos(save)))), xp: 0,
    est: 0, car: 0, ot: 'local', otn: save.nombre || '', f: ahora, de,
    dia: [], fav: false, noEvo: false, toq: 0,
  };
  anotarDiario(mon, ahora, 'llega', datosLlegada(de, enc.f));
  if (mon.vr) anotarDiario(mon, ahora, 'vario', {});
  save.pokemon.push(mon);
  save.bitacora.tenido[enc.sp] = save.bitacora.tenido[enc.sp] || ahora;
  const existia = save.pokemon.some((p) => p.sp === enc.sp && p !== mon);
  return { tipo: existia ? 'individuo' : 'nuevo', uid: mon.id, especial, mon };
}
