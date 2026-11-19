// Guardado local (§12): esquema, migraciones, almacén inyectable, export/import. Sin DOM. Dueño: ESTADO.

import { idAleatorio, mulberry32 } from './rng.js';

export const SAVE_VERSION = 1;
export const CLAVE = 'farolillo.save';
/** Copia en bruto de una partida que no se pudo cargar (para no perderla nunca). */
export const CLAVE_ROTO = 'farolillo.save.roto';
/** Marca de la última escritura (sesión:contador): detecta otra pestaña que ha guardado después. */
export const CLAVE_REV = 'farolillo.save.rev';
export const MAX_POKEMON = 400;
export const AVISO_POKEMON = 380;
export const MAX_DIARIO = 8;
export const MAX_DIARIO_EXP = 30;
export const AVISO_BYTES = 1.5 * 1024 * 1024;
const PROTEGIDAS = new Set(['llega', 'evo', 'vario', 'intercambio']);
const IDB_NOMBRE = 'farolillo', IDB_STORE = 'saves', IDB_CLAVE = 'main';
const DEBOUNCE_MS = 1000;
/** Si IndexedDB no responde en este tiempo al arrancar, se carga solo desde localStorage. */
export const IDB_TIMEOUT_MS = 1500;
export const MAX_PENDIENTES_LLENO = 10;
export const MAX_MOMENTOS_PENDIENTES = 20;

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

export function islaVacia() {
  return { pisoMax: 0, jefe: false, dominio: 0, dominioJefe: [false, false, false], piedad: 0, huellas: {}, huevo: false };
}

export function equipoVacio() {
  return { miembros: [], roles: [], ultimoPlan: null, exp: null };
}

function rngPor(rng, ahora) {
  return rng || mulberry32((ahora ^ 0x9e3779b9) >>> 0);
}

/** Crea un Mon (§3.8) con valores por defecto. */
export function crearMon({ sp, nv = 1, vr = false, de = '', ahora = 0, rng, ap = '', car = 0, est = 0, ot = 'local', otn = '', id }) {
  return {
    id: id || 'm_' + idAleatorio(rng, 6),
    sp, vr: !!vr, ap, nv, xp: 0, est, car,
    ot, otn, f: ahora, de, dia: [], fav: false, noEvo: false, toq: 0,
  };
}

/** Partida nueva con el guía (nivel 5, cariño 30) como único vecino y en el equipo 1. */
export function nuevoGuardado({ guia = '0004', faro = 'norte', nombre = '', ahora = Date.now(), rng } = {}) {
  const r = rngPor(rng, ahora);
  const g = crearMon({ sp: guia, nv: 5, car: 30, de: 'faro', ahora, rng: r, otn: nombre });
  anotarDiario(g, ahora, 'llega', { i: 'faro' });
  const save = base();
  Object.assign(save, {
    creado: ahora, ultimaVez: ahora, idDispositivo: idAleatorio(r, 10),
    nombre, guia, faro,
  });
  save.base.ultimaRecogida = ahora;
  save.base.ultimaVisita = ahora;
  save.pokemon.push(g);
  save.equipos[0].miembros = [g.id];
  save.equipos[0].roles = ['lider'];
  save.islas['1'] = islaVacia();
  save.bitacora.visto[guia] = ahora;
  save.bitacora.tenido[guia] = ahora;
  return save;
}

/** Guardado base con todos los campos de §12.1 (sin guía). */
function base() {
  return {
    saveVersion: SAVE_VERSION, creado: 0, ultimaVez: 0, idDispositivo: '',
    nombre: '', guia: '0004', faro: 'norte',
    monedas: 0, bayas: 0, objetos: {}, caramelos: {},
    base: { huerto: 0, despensa: 0, muelle: 0, linterna: 0, taberna: 0, ultimaRecogida: 0, restoBayas: 0, ultimaVisita: 0 },
    pokemon: [],
    equipos: [equipoVacio()],
    islas: {},
    misterio: { wk: 0, record: 0 },
    bitacora: { visto: {}, tenido: {} }, album: {}, cadenas: {},
    visitante: null,
    diarioExp: [],
    informesSinEspecial: 0, tutorial: { paso: 0, enviadas: 0 },
    misiones: { dia: 0, lista: [], semanal: null, cambios: 0, pendientes: [] }, diasJugados: [],
    stats: { exps: 0, jefes: 0, mejorP: 0 },
    trade: { applied: {}, reserved: {}, pending: {}, leagues: [] },
    ajustes: { duplicados: 'fusionar', sonido: 0.6, reducirAnim: false },
    // Reclutas que llegaron con la cala llena y esperan «Liberar a otro / Dejarlo ir» (§3.8).
    pendientesLleno: [],
    // Recompensas de hito ya dadas (§6.10): { cordon50: t }.
    hitos: {},
    // Momentos especiales aún sin ver (sobreviven a recargar la página con el informe abierto).
    momentosPendientes: [],
  };
}

/** Rellena campos que falten (no pisa los existentes). */
function completar(save) {
  const def = base();
  for (const k of Object.keys(def)) {
    if (save[k] === undefined) save[k] = def[k];
    else if (isPlainObject(def[k]) && isPlainObject(save[k]) && !['objetos', 'caramelos', 'islas', 'album', 'cadenas'].includes(k)) {
      for (const k2 of Object.keys(def[k])) if (save[k][k2] === undefined) save[k][k2] = def[k][k2];
    }
  }
  if (!Array.isArray(save.pokemon)) save.pokemon = [];
  if (!Array.isArray(save.pendientesLleno)) save.pendientesLleno = [];
  if (!Array.isArray(save.momentosPendientes)) save.momentosPendientes = [];
  if (!Array.isArray(save.equipos) || !save.equipos.length) save.equipos = [equipoVacio()];
  for (const e of save.equipos) {
    if (!Array.isArray(e.miembros)) e.miembros = [];
    if (!Array.isArray(e.roles)) e.roles = [];
    if (e.ultimoPlan === undefined) e.ultimoPlan = null;
    if (e.exp === undefined) e.exp = null;
  }
  // Un equipo por nivel de Muelle (1..4).
  const n = Math.min(4, 1 + (save.base.muelle | 0));
  while (save.equipos.length < n) save.equipos.push(equipoVacio());
  for (const [id, isla] of Object.entries(save.islas)) save.islas[id] = { ...islaVacia(), ...isla };
  if (!save.islas['1']) save.islas['1'] = islaVacia();
  for (const m of save.pokemon) {
    if (!Array.isArray(m.dia)) m.dia = [];
    for (const [k, v] of Object.entries({ vr: false, ap: '', nv: 1, xp: 0, est: 0, car: 0, ot: 'local', otn: '', f: 0, de: '', fav: false, noEvo: false, toq: 0 })) {
      if (m[k] === undefined) m[k] = v;
    }
  }
  return save;
}

function isPlainObject(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }

// ---------------------------------------------------------------------------
// Migraciones: migraciones[n](save) lleva de la versión n a la n+1.
// La 0 adopta guardados sin saveVersion (prototipos) al esquema 1.
// ---------------------------------------------------------------------------

export const migraciones = {
  0: (s) => {
    const out = { ...s };
    // Prototipo: "pokemons" en lugar de "pokemon" y edificios sueltos.
    if (!out.pokemon && Array.isArray(out.pokemons)) out.pokemon = out.pokemons;
    delete out.pokemons;
    if (!out.base) out.base = {};
    for (const b of ['huerto', 'despensa', 'muelle', 'linterna', 'taberna']) {
      if (typeof out[b] === 'number' && out.base[b] === undefined) { out.base[b] = out[b]; delete out[b]; }
    }
    out.saveVersion = 1;
    return out;
  },
};

/** Valida, migra hasta SAVE_VERSION y completa campos. Lanza Error en castellano. */
export function migrar(raw) {
  if (!isPlainObject(raw)) throw new Error('La partida no tiene un formato válido.');
  let s = JSON.parse(JSON.stringify(raw));
  let v = Number.isInteger(s.saveVersion) ? s.saveVersion : 0;
  if (v > SAVE_VERSION) throw new Error('Esta partida es de una versión más nueva del juego. Actualiza Farolillo.');
  while (v < SAVE_VERSION) {
    const m = migraciones[v];
    if (!m) throw new Error(`No sé convertir partidas de la versión ${v}.`);
    s = m(s);
    v = s.saveVersion = v + 1;
  }
  return completar(s);
}

// ---------------------------------------------------------------------------
// Utilidades del guardado
// ---------------------------------------------------------------------------

/** Añade una entrada al diario (máx. 8; al llenarse cae la no protegida más antigua). */
export function anotarDiario(mon, t, tipo, datos = {}) {
  if (!Array.isArray(mon.dia)) mon.dia = [];
  mon.dia.push([t, tipo, datos]);
  while (mon.dia.length > MAX_DIARIO) {
    const i = mon.dia.findIndex((e) => !PROTEGIDAS.has(e[1]));
    mon.dia.splice(i >= 0 ? i : 0, 1);
  }
}

/** Reloj hacia atrás (§12.2): si ahora < ultimaVez se cuentan 0 s y se reancla. Devuelve true si reancló. */
export function reanclarReloj(save, ahora) {
  let r = false;
  if (ahora < save.ultimaVez) { save.ultimaVez = ahora; r = true; }
  if (ahora < save.base.ultimaRecogida) { save.base.ultimaRecogida = ahora; r = true; }
  if (ahora < (save.base.ultimaVisita || 0)) { save.base.ultimaVisita = ahora; r = true; }
  // Expediciones enviadas con el reloj adelantado: se desplazan para que empiecen ahora (si no, el equipo
  // quedaría bloqueado hasta esa fecha futura al poner bien la hora).
  for (const e of save.equipos || []) {
    const x = e && e.exp;
    if (!x || !(x.inicio > ahora)) continue;
    desplazarExpedicion(x, ahora - x.inicio);
    r = true;
  }
  return r;
}

/** Desplaza en d ms todos los instantes de una expedición (exp y su registro). */
export function desplazarExpedicion(x, d) {
  x.inicio += d;
  x.fin += d;
  const reg = x.registro;
  if (!reg) return;
  if (Number.isFinite(reg.inicio)) reg.inicio += d;
  if (Number.isFinite(reg.fin)) reg.fin += d;
  for (const ro of reg.rondas || []) {
    if (Number.isFinite(ro.t0)) ro.t0 += d;
    if (Number.isFinite(ro.t1)) ro.t1 += d;
  }
}

// ---------------------------------------------------------------------------
// Almacén inyectable: localStorage (+ IndexedDB en navegador) o memoria
// ---------------------------------------------------------------------------

/** Almacenamiento tipo localStorage en memoria (Node y pruebas). */
export function memoriaStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _mapa: m,
  };
}

/**
 * crearAlmacen({ localStorage, indexedDB, storage, setTimeout, clearTimeout })
 * Sin localStorage usa memoria. indexedDB es opcional. storage = navigator.storage (para persist()).
 */
export function crearAlmacen({ localStorage, indexedDB, storage, setTimeout: st, clearTimeout: ct, sinLocalStorage = false } = {}) {
  const ls = localStorage || memoriaStorage();
  const almacen = {
    ls, idb: indexedDB || null, storage: storage || null,
    st: st || globalThis.setTimeout, ct: ct || globalThis.clearTimeout,
    timer: null, pendiente: null, ultimoError: null, ultimosBytes: 0,
    escrituras: 0,
    // sinLocalStorage: el navegador no deja usar localStorage (se juega en memoria). Sin IndexedDB, nada persiste.
    sinLS: !!sinLocalStorage, volatil: !!sinLocalStorage && !indexedDB,
    // rev: marca leída al cargar (undefined = aún no se ha cargado: no se comprueba).
    // bloqueado: otra pestaña guardó después; esta ya no escribe.
    rev: undefined, sesion: Math.random().toString(36).slice(2, 10), bloqueado: false,
    // roto: { error, texto } si alguna copia existe pero no se pudo leer o convertir.
    roto: null,
  };
  almacen.flush = () => flush(almacen);
  return almacen;
}

function abrirIDB(idb) {
  return new Promise((res, rej) => {
    let req;
    try { req = idb.open(IDB_NOMBRE, 1); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/** Promesa que falla si p no se resuelve en ms (indexedDB.open puede no responder nunca: Safari 14). */
function conTiempo(p, ms, st) {
  return new Promise((res, rej) => {
    const t = st(() => rej(new Error('IndexedDB no responde')), ms);
    if (t && typeof t.unref === 'function') t.unref();
    p.then(res, rej);
  });
}

async function leerIDB(idb) {
  const db = await abrirIDB(idb);
  try {
    return await new Promise((res, rej) => {
      const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_CLAVE);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => rej(r.error);
    });
  } finally { db.close(); }
}

async function escribirIDB(idb, texto) {
  const db = await abrirIDB(idb);
  try {
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(texto, IDB_CLAVE);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } finally { db.close(); }
}

/** Distingue «no hay texto» (null) de «hay texto pero no se puede cargar» ({ error, texto }). Si va bien: { save }. */
export function parsear(texto) {
  if (!texto) return null;
  try { return { save: migrar(JSON.parse(texto)) }; } catch (e) { return { error: (e && e.message) || String(e), texto: String(texto) }; }
}

/**
 * Carga la copia más reciente (por ultimaVez) entre localStorage e IndexedDB. null si no hay partida buena.
 * Si una copia existe pero no se puede convertir, su texto se guarda aparte (CLAVE_ROTO) y queda en almacen.roto.
 * Con null y almacen.roto puesto, la UI no debe ofrecer partida nueva sin avisar: se perdería la partida.
 */
export async function cargar(almacen) {
  let local = null, idb = null;
  almacen.roto = null;
  try { local = parsear(almacen.ls.getItem(CLAVE)); } catch { local = null; }
  try { almacen.rev = almacen.ls.getItem(CLAVE_REV); } catch { almacen.rev = null; }
  if (almacen.idb) {
    try { idb = parsear(await conTiempo(leerIDB(almacen.idb), IDB_TIMEOUT_MS, almacen.st)); } catch { idb = null; }
  }
  for (const c of [local, idb]) {
    if (!c || !c.error || almacen.roto) continue;
    almacen.roto = { error: c.error, texto: c.texto };
    try { if (almacen.ls.getItem(CLAVE_ROTO) !== c.texto) almacen.ls.setItem(CLAVE_ROTO, c.texto); } catch { /* sin sitio */ }
  }
  const a = local && local.save, b = idb && idb.save;
  if (a && b) return (b.ultimaVez > a.ultimaVez) ? b : a;
  return a || b || null;
}

/** ¿Ha guardado otra pestaña después de que esta cargara (o guardara por última vez)? */
export function hayEscrituraAjena(almacen) {
  if (almacen.rev === undefined) return false;
  let actual = null;
  try { actual = almacen.ls.getItem(CLAVE_REV); } catch { return false; }
  return actual !== almacen.rev;
}

function escribir(almacen, save) {
  // Otra pestaña guardó después: esta tiene el estado viejo y no debe pisarlo.
  if (almacen.bloqueado || hayEscrituraAjena(almacen)) {
    almacen.bloqueado = true;
    return { bytes: 0, grande: false, error: null, conflicto: true };
  }
  const texto = JSON.stringify(save);
  almacen.ultimosBytes = texto.length;
  try {
    almacen.ls.setItem(CLAVE, texto);
    almacen.ultimoError = null;
    const rev = `${almacen.sesion}:${almacen.escrituras + 1}`;
    almacen.ls.setItem(CLAVE_REV, rev);
    almacen.rev = rev;
  } catch (e) {
    almacen.ultimoError = e;
  }
  almacen.escrituras++;
  if (almacen.idb) {
    escribirIDB(almacen.idb, texto).catch((e) => {
      almacen.ultimoError = almacen.ultimoError || e;
      if (almacen.sinLS) almacen.volatil = true;   // ni localStorage ni IndexedDB: nada persiste
    });
  }
  const error = almacen.volatil ? (almacen.ultimoError || new Error('Este navegador no deja guardar.')) : almacen.ultimoError;
  return { bytes: texto.length, grande: texto.length > AVISO_BYTES, error, volatil: almacen.volatil };
}

/** Deja de escribir (otra pestaña manda) o, con false, vuelve a escribir tras recargar el estado ajeno. */
export function bloquear(almacen, si = true) { almacen.bloqueado = !!si; if (si) { almacen.pendiente = null; } }

function flush(almacen) {
  if (almacen.timer) { almacen.ct(almacen.timer); almacen.timer = null; }
  if (almacen.pendiente) {
    const s = almacen.pendiente;
    almacen.pendiente = null;
    return escribir(almacen, s);
  }
  return null;
}

/**
 * Guarda el save. Con inmediato escribe ya (operaciones compuestas, pestaña oculta);
 * si no, agrupa los cambios con un debounce de 1 s. Devuelve { bytes, grande, error } al escribir.
 */
export function guardar(almacen, save, { inmediato = false } = {}) {
  almacen.pendiente = save;
  if (inmediato) return flush(almacen);
  if (!almacen.timer) {
    almacen.timer = almacen.st(() => { almacen.timer = null; flush(almacen); }, DEBOUNCE_MS);
    if (almacen.timer && typeof almacen.timer.unref === 'function') almacen.timer.unref();
  }
  return null;
}

/** navigator.storage.persist() si se inyectó storage (primer arranque). */
export async function persistir(almacen) {
  try { return almacen.storage?.persist ? await almacen.storage.persist() : false; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Exportar / importar: "FAR1." + base64(utf8(JSON)) + "." + fnv1a32hex(utf8(JSON))
// ---------------------------------------------------------------------------

function utf8(str) { return new TextEncoder().encode(str); }

export function fnv1a32hex(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function deb64(txt) {
  const s = atob(txt);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function exportar(save) {
  const json = JSON.stringify(save);
  const bytes = utf8(json);
  return `FAR1.${b64(bytes)}.${fnv1a32hex(bytes)}`;
}

/** Valida checksum y migra. Lanza Error con mensaje en castellano. */
export function importar(texto) {
  const limpio = String(texto || '').replace(/\s+/g, '');
  if (!limpio) throw new Error('Pega el texto de la partida exportada.');
  const partes = limpio.split('.');
  if (partes.length !== 3 || partes[0] !== 'FAR1') throw new Error('Ese texto no es una partida de Farolillo.');
  let bytes;
  try { bytes = deb64(partes[1]); } catch { throw new Error('El texto está dañado: no se puede leer.'); }
  if (fnv1a32hex(bytes) !== partes[2].toLowerCase()) {
    throw new Error('El texto está dañado o incompleto (la comprobación no cuadra).');
  }
  let raw;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('El texto está dañado: no es una partida válida.'); }
  return migrar(raw);
}

/**
 * Deduplicación tras importar (§11.4): une trade.applied, quita los individuos dados en intercambios
 * aplicados y deduplica ids repetidos (tr-<tid> y cualquier otro). Mantiene el idDispositivo actual.
 * Devuelve la partida entrante ya saneada.
 */
export function fusionarTrasImportar(actual, entrante) {
  const s = entrante;
  if (actual?.trade?.applied) {
    s.trade.applied = { ...actual.trade.applied, ...s.trade.applied };
  }
  const dados = new Set();
  for (const a of Object.values(s.trade.applied)) {
    if (a && typeof a === 'object' && a.dado) dados.add(a.dado);
  }
  const vistos = new Set();
  s.pokemon = s.pokemon.filter((m) => {
    if (dados.has(m.id) || vistos.has(m.id)) return false;
    vistos.add(m.id);
    return true;
  });
  // Quitar referencias a individuos que ya no están (equipos libres; los que estén de expedición se conservan
  // en el snapshot y simplemente no recibirán EXP).
  for (const e of s.equipos) {
    if (!e.exp) {
      const keep = e.miembros.map((u, i) => [u, e.roles[i]]).filter(([u]) => vistos.has(u));
      e.miembros = keep.map((x) => x[0]);
      e.roles = keep.map((x, i) => (i === 0 ? 'lider' : x[1]));
    }
  }
  for (const id of Object.keys(s.trade.reserved || {})) if (!vistos.has(id)) delete s.trade.reserved[id];
  if (actual?.idDispositivo) s.idDispositivo = actual.idDispositivo;
  return s;
}
