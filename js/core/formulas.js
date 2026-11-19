// Constantes K y fórmulas puras (§4-§7). Sin DOM. Dueño: NÚCLEO.
// Todos los números del juego viven aquí. Son puntos de partida; los ajusta tools/sim.mjs.

const dexD0 = (m) => 50 * Math.pow(1.66, m - 1);

export const K = {
  // --- Poder (§4.5) ---
  PODER_NV: 0.1,            // × (1 + 0.1 × (nv − 1))
  PODER_EST: 0.2,           // × (1 + 0.2 × est)
  PODER_CAR: 0.003,         // × (1 + 0.003 × car)  (cariño 100 → ×1,3)
  ROL_LIDER: 1.2,
  LINTERNA: 0.03,           // +3 % por nivel de Linterna
  BONO_MONOTIPO: 1.1,       // +10 % de poder si los 3 comparten un tipo
  BONO_TRIPLE: 1.1,         // +10 % de botín con 3 tipos primarios distintos
  OFENSA: { 2: 1.3, 1: 1, 0.5: 0.8, 0: 0.6 },
  DEFENSA_DEBIL: 0.85,      // factor medio ≥ 2
  DEFENSA_FUERTE: 1.1,      // factor medio ≤ 0,5

  // --- Duración (§4.3) ---
  VEL_K: 0.003,             // vel = 1 + 0.003 × media ponderada de Vel base
  PESO_EXPLORADOR: 2,       // su Vel cuenta doble
  PESO_EXPLORADOR_NIEBLA: 3, // con Niebla el efecto extra se duplica
  TABERNA: 0.02,            // −2 % por nivel
  AUDAZ_T: 0.9,
  TUTORIAL_PISOS: 3,
  TUTORIAL_T: 20000,        // ms por piso
  MAX_REINTENTOS_JEFE: 2,   // cada reintento cuesta un tPiso

  // --- Dificultad (§4.4) ---
  // D0 por isla (1..8). La forma de la spec es 50 × 1,66^(m−1); se ajusta para que el
  // equipo de referencia (nvOri, 1★, cariño 30, Linterna 3m, TOT_REF) quede con
  // p(jefe) ∈ [0,35; 0,65] (ver notes/nucleo.md). D0[0] = 50 se mantiene (calibración 1).
  D0_SPEC: [1, 2, 3, 4, 5, 6, 7, 8].map((m) => Math.round(dexD0(m))),
  D0: [50, 120, 212, 327, 470, 650, 845, 1075],
  TOT_REF: [200, 250, 300, 340, 380, 420, 450, 480],  // tot medio del equipo de referencia
  RAMPA: 1.8,               // D × 1.8^((f−1)/(F−1))
  JEFE_D: 1.25,
  DOMINIO_D: 1.6,
  MISTERIO_D0: 60,
  MISTERIO_G: 1.045,
  MISTERIO_TRAMO: 5,
  MISTERIO_TBASE: 60,       // s
  MISTERIO_PISOS_MAX: 99,   // F de la Misterio (§4.1)
  P_A: 0.5,
  P_B: 0.9,                 // p = clamp(0.5 + 0.9 × ln(P/D), pMin, 0.99)
  P_MIN: 0.05,
  P_MIN_APOYO: 0.15,
  P_MAX: 0.99,
  PV_BASE: 5,               // spec: 3. Simulador (integración v0.1): con 3 las patrullas caían en la 1.ª hora
  CASA_D: 1.3,              // evento Casa de monstruos

  // --- Posturas ---
  PRUDENTE_BOTIN: 0.85,
  AUDAZ_BOTIN: 1.3,
  AUDAZ_ENC: 1.15,
  AUDAZ_RAROS: 1.5,

  // --- Botín (§4.6) ---
  MON_BASE: 8, MON_G: 1.3,  // spec 1.9 (ver notes/simulador.md)
  MON_F: 0.1, MON_JEFE: 4,
  EXP_BASE: 30, EXP_G: 1.35, // spec 15 / 1.75
  EXP_F: 0.05, EXP_JEFE: 3,
  OBJ_BASE: 0.2, OBJ_F: 0.01, OBJ_RECO: 1.25,
  DOMINIO_BOTIN: 1.5,
  NOCHE_BOTIN: 1.2,         // patrulla nocturna
  NOCHE_DESDE: 22, NOCHE_HASTA: 3, NOCHE_HORAS_MIN: 4,
  FALLO_BOTIN: 0.5,
  OBJ_BAYA_GRANDE: 0.6,     // baya_grande = 60 % de la tabla de la isla
  JEFE_ALBA: 0.10,          // jefes de islas ≥ 5
  JEFE_CORDON: 0.03,
  JEFE_OBJ_ISLA_MIN: 5,
  OBJETOS_ISLA: {
    1: ['piedra_hoja'], 2: ['piedra_agua'], 3: ['piedra_lunar'], 4: ['piedra_ocaso'],
    5: ['piedra_fuego'], 6: ['piedra_hielo', 'garra_afilada'], 7: ['piedra_trueno'],
    8: ['piedra_solar', 'piedra_dia'],
  },

  // --- Eventos (§4.7) ---
  P_EVENTO: 0.04,
  INFORMES_SIN_ESPECIAL: 3,
  EVENTOS: ['kecleon', 'cofre', 'casa', 'perdido', 'manantial'],
  EVENTOS_MENORES: ['kecleon', 'cofre', 'perdido'],
  COFRE_EXPLORADOR: 0.05,   // +5 puntos de cuota del cofre por Explorador cuando sale evento
  COFRE_MONEDAS: 3,
  PERDIDO_MONEDAS: 2,
  PERDIDO_CARINO: 5,
  CASA_BOTIN: 2,
  KECLEON_TOPE: 0.2,        // compra si cuesta ≤ 20 % de las monedas ganadas
  KECLEON_PRECIO: { baya_grande: 2, otro: 6 },  // × monedas del piso

  // --- Encuentros (§6.1-§6.4) ---
  ENC_BASE: 0.06, ENC_RECO: 0.04,
  ENC_GUION: 3,             // las 2 primeras expediciones
  PESOS_RAREZA: { C: 70, PC: 23, R: 6.5, L: 0.5 },
  L_ISLA_MIN: 6,
  NV_SALV_BASE: 4, NV_SALV_M: 4, // spec M = 6
  NV_SALV_F: 0.3, NV_SALV_MIST_F: 0.6,
  ACEPTA_BASE: 0.4, ACEPTA_NV: 0.03, ACEPTA_MIN: 0.1, ACEPTA_MAX: 0.9,
  HUELLA: 0.25, HUELLA_MAX_UNIDADES: 3,  // +0,25 por unidad, hasta +0,75
  PIEDAD: 40,
  VARIO_BASE: 1 / 320, CADENA_K: 0.02, CADENA_MAX: 2, VARIO_EVENTO: 2,
  FARO_GEN: { norte: 1, este: 2, sur: 3, oeste: 4 },
  PESO_FARO_GEN: 3,
  PESO_OTRO_FARO: 0.1,
  OTRO_FARO_DOMINIO: 2,
  PESO_MAREA: 2,
  MAREA_DESDE: 22, MAREA_HASTA: 7,
  PESO_INICIALES: 0.3, PESO_INICIALES_TIPO: 3, // ×3 en la isla de su tipo
  INICIALES: ['0001', '0004', '0007', '0152', '0155', '0158', '0252', '0255', '0258', '0387', '0390', '0393', '0172', '0133'],
  EVOL_TARDIAS: 0.6,        // las evoluciones salen en el 40 % final de pisos
  ETAPA2_ISLA: 4, ETAPA3_ISLA: 6,
  MISTERIO_ETAPA2: 30, MISTERIO_ETAPA3: 60,
  PESO_EVENTO_TIPO: 2, PESO_EVENTO_VISITA: 5,

  // --- Niveles (§5) ---
  EXPSIG_A: 6, EXPSIG_E: 1.8, EXPSIG_B: 15,
  TOPE_BASE: 20, TOPE_JEFE: 10, TOPE_MAX: 100,
  ALCANZAR_DIF: 5, ALCANZAR_MULT: 2,
  INTERCAMBIO_EXP: 1.5,
  CARINO_EXP: 1, CARINO_TOQUE: 1, CARINO_BAYA_GRANDE: 3, CARINO_MAX: 100,
  CARINO_AMISTAD: 80,
  DIA_DESDE: 7, DIA_HASTA: 19,

  // --- Colección (§6.3) ---
  COSTE_ESTRELLA: [1, 2, 3, 4, 5],  // duplicados para pasar a 1★…5★
  CARAMELOS_PIEDRA: 10,
  CARAMELO_CARINO: 20, CARAMELO_BAYAS: 500,
  MAX_POKEMON: 400, AVISO_POKEMON: 380,

  // --- Edificios (§7.1) ---
  EDIFICIOS: {
    // Ajustados con tools/sim.mjs (notes/simulador.md). Spec: huerto g 1.18; muelle 600/15.000/150.000;
    // linterna 150 × 1.15^n; taberna 200 × 1.15^n.
    huerto: { base: 80, g: 1.3, tope: 25 },
    despensa: { base: 300, g: 1.3, tope: 16 },
    muelle: { costes: [6000, 100000, 1000000], tope: 3 },
    linterna: { base: 10000, g: 1.35, tope: 30 },
    taberna: { base: 2000, g: 1.32, tope: 15 },
  },
  HUERTO_BASE: 3, HUERTO_G: 1.4, // spec 15 / 1.75
  DESPENSA_H0: 8,           // tope offline 8 h + n h
  OFFLINE_ENTERO: 7200,     // s al 100 %
  OFFLINE_RESTO: 0.75,

  // --- Visitantes (§7.3, v0.2) ---
  VISITA_CADA: 7200, VISITA_P: 0.35, VISITA_H: 12, VISITA_PC: 0.2,
  VISITA_COSTE: 50, VISITA_G: 1.75, VISITA_PC_MULT: 3,

  // --- Clima (§4.9). Mismo orden y efectos que events.js ---
  CLIMAS: ['despejado', 'niebla', 'calor', 'tormenta', 'luna'],
  CLIMA: {
    despejado: { tipos: {}, climaT: 1, climaD: 1, raros: 1 },
    niebla: { tipos: {}, climaT: 1, climaD: 1, raros: 1, exploradorDoble: true, sinExplorador: 0.9 },
    calor: { tipos: { fuego: 1.2, hielo: 0.9, planta: 0.9 }, climaT: 1, climaD: 1, raros: 1 },
    tormenta: { tipos: { electrico: 1.15, agua: 1.15 }, climaT: 1.1, climaD: 1, raros: 1 },
    luna: { tipos: { fantasma: 1.2, siniestro: 1.2 }, climaT: 1, climaD: 1, raros: 1.5 },
  },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------
// Clima
// ---------------------------------------------------------------------------

/**
 * Efectos del clima de una isla según ctx.clima, que puede ser un id, un objeto de efectos,
 * un mapa { "1": id, misterio: id } o una función (islaId) → id.
 */
export function climaDe(ctx, islaId) {
  let c = ctx && ctx.clima;
  if (typeof c === 'function') c = c(islaId);
  else if (c && typeof c === 'object' && !c.tipos) c = c[islaId] ?? c[String(islaId)];
  if (c && typeof c === 'object' && c.tipos) {
    return { ...K.CLIMA.despejado, ...c, raros: c.raros ?? c.pesoRaros ?? 1 };
  }
  return K.CLIMA[c] || K.CLIMA.despejado;
}

/** Multiplicador de clima de un miembro: mayor bonus × menor malus (§4.9). */
export function climaTipo(clima, tiposMon) {
  const ef = (clima && clima.tipos) || {};
  let bonus = 1, malus = null;
  for (const t of tiposMon || []) {
    const f = ef[t];
    if (f == null) continue;
    if (f > 1) bonus = Math.max(bonus, f);
    else if (f < 1) malus = malus == null ? f : Math.max(malus, f);
  }
  return bonus * (malus ?? 1);
}

// ---------------------------------------------------------------------------
// Poder (§4.5)
// ---------------------------------------------------------------------------

/** Poder individual de un Mon con los datos de su especie. */
export function poderMon(mon, esp) {
  const tot = esp ? esp.tot : 0;
  return (tot / 10)
    * (1 + K.PODER_NV * ((mon.nv || 1) - 1))
    * (1 + K.PODER_EST * (mon.est || 0))
    * (1 + K.PODER_CAR * (mon.car || 0));
}

function factor(tablaEf, atk, def) {
  const fila = tablaEf && tablaEf[atk];
  const f = fila ? fila[def] : undefined;
  return f == null ? 1 : f;
}

function suavizarOfensa(f) {
  if (f >= 2) return K.OFENSA[2];
  if (f >= 1) return K.OFENSA[1];
  if (f > 0) return K.OFENSA[0.5];
  return K.OFENSA[0];
}

/** Ofensa, defensa y su producto para unos tipos contra los tipos de la isla. */
export function multTipo(tiposMon, tiposIsla, tablaEf) {
  if (!tiposIsla || !tiposIsla.length || !tiposMon || !tiposMon.length) {
    return { ofensa: 1, defensa: 1, mult: 1 };
  }
  let mejor = -1;
  for (const a of tiposMon) for (const d of tiposIsla) mejor = Math.max(mejor, factor(tablaEf, a, d));
  const ofensa = suavizarOfensa(mejor);
  let suma = 0;
  for (const a of tiposIsla) {
    let p = 1;
    for (const d of tiposMon) p *= factor(tablaEf, a, d);
    suma += p;
  }
  const media = suma / tiposIsla.length;
  const defensa = media >= 2 ? K.DEFENSA_DEBIL : media <= 0.5 ? K.DEFENSA_FUERTE : 1;
  return { ofensa, defensa, mult: ofensa * defensa };
}

/** Composición del equipo: monotipo (+poder) y tres primarios distintos (+botín). */
export function composicion(miembros) {
  if (!miembros || miembros.length < 3) return { mono: false, triple: false };
  const [a, b, c] = miembros.map((m) => m.tipos || []);
  const mono = a.some((t) => b.includes(t) && c.includes(t));
  const prim = new Set([a[0], b[0], c[0]]);
  return { mono, triple: prim.size === 3 && !prim.has(undefined) };
}

/** Número de miembros con un rol. */
export function contarRol(roles, rol) {
  let n = 0;
  for (let i = 1; i < (roles || []).length; i++) if (roles[i] === rol) n++;
  return n;
}

/**
 * Poder del equipo contra una isla.
 * snapshot: { miembros: [{ poder, tipos }], roles, linterna }. isla: { id, tipos }.
 * ctx: { datos: { tipos: { ef } }, clima }.
 */
export function poderEquipo(snapshot, isla, ctx) {
  const ef = ctx && ctx.datos && ctx.datos.tipos ? ctx.datos.tipos.ef : null;
  const clima = climaDe(ctx, isla.id);
  const roles = snapshot.roles || [];
  const porMiembro = [];
  let suma = 0;
  snapshot.miembros.forEach((m, i) => {
    const t = multTipo(m.tipos, isla.tipos, ef);
    const ct = climaTipo(clima, m.tipos);
    const rol = i === 0 ? K.ROL_LIDER : 1;
    const valor = m.poder * t.mult * ct * rol;
    suma += valor;
    porMiembro.push({ poder: m.poder, ofensa: t.ofensa, defensa: t.defensa, clima: ct, mult: t.mult * ct, rol, valor });
  });
  const comp = composicion(snapshot.miembros);
  let climaP = 1;
  if (clima.exploradorDoble && contarRol(roles, 'expl') === 0) climaP = clima.sinExplorador ?? 1;
  const P = suma * (1 + K.LINTERNA * (snapshot.linterna || 0)) * (comp.mono ? K.BONO_MONOTIPO : 1) * climaP;
  return { P, porMiembro, composicion: comp };
}

// ---------------------------------------------------------------------------
// Dificultad y probabilidad (§4.4)
// ---------------------------------------------------------------------------

/** D de un piso de una isla (isla: { id, F }). */
export function dificultad(isla, piso, dominio = 0, climaD = 1) {
  const m = isla.id;
  const F = isla.F;
  const d0 = K.D0[m - 1] ?? dexD0(m);
  const rampa = F > 1 ? Math.pow(K.RAMPA, (piso - 1) / (F - 1)) : 1;
  return d0 * rampa * (piso === F ? K.JEFE_D : 1) * Math.pow(K.DOMINIO_D, dominio || 0) * (climaD || 1);
}

/** D de un piso de la Mazmorra Misterio (igual para todos). */
export function dificultadMisterio(piso, climaD = 1) {
  return K.MISTERIO_D0 * Math.pow(K.MISTERIO_G, piso - 1) * (climaD || 1);
}

/** Probabilidad de superar un tramo. */
export function probPiso(P, D, pMin = K.P_MIN) {
  if (!(P > 0)) return pMin;
  return clamp(K.P_A + K.P_B * Math.log(P / D), pMin, K.P_MAX);
}

/** Tramos de una isla de F pisos: 1..F−1 en grupos de ceil((F−1)/10) y el jefe aparte. */
export function tramos(F) {
  const out = [];
  if (F <= 1) return [{ desde: 1, hasta: 1, jefe: true }];
  const s = Math.ceil((F - 1) / 10);
  for (let d = 1; d <= F - 1; d += s) out.push({ desde: d, hasta: Math.min(F - 1, d + s - 1), jefe: false });
  out.push({ desde: F, hasta: F, jefe: true });
  return out;
}

/** Tramos hasta el piso `hasta` (si hasta < F no hay jefe y el último tramo se recorta). */
export function tramosHasta(F, hasta) {
  const h = clamp(Math.round(hasta || F), 1, F);
  if (h >= F) return tramos(F);
  const out = [];
  for (const t of tramos(F)) {
    if (t.jefe || t.desde > h) break;
    out.push({ desde: t.desde, hasta: Math.min(t.hasta, h), jefe: false });
  }
  return out;
}

/** Tramos de la Misterio desde un piso (de 5 en 5, sin jefe). */
export function tramoMisterio(idx) {
  const desde = idx * K.MISTERIO_TRAMO + 1;
  // El último tramo se recorta al piso máximo (F = 99): nunca se juega el piso 100.
  return { desde, hasta: Math.min(desde + K.MISTERIO_TRAMO - 1, K.MISTERIO_PISOS_MAX), jefe: false };
}

// ---------------------------------------------------------------------------
// Duración (§4.3)
// ---------------------------------------------------------------------------

/** Velocidad del equipo. pesoExpl: 2 normal, 3 con Niebla. */
export function velEquipo(snapshot, roles, pesoExpl = K.PESO_EXPLORADOR) {
  const r = roles || snapshot.roles || [];
  let suma = 0, pesos = 0;
  snapshot.miembros.forEach((m, i) => {
    const w = i > 0 && r[i] === 'expl' ? pesoExpl : 1;
    suma += (m.vel || 0) * w;
    pesos += w;
  });
  return 1 + K.VEL_K * (pesos ? suma / pesos : 0);
}

/** Duración de un piso en ms. isla: { tBase (s) }. */
export function tPiso(isla, vel, nivelTaberna = 0, climaT = 1, postura = 'equilibrada') {
  return (isla.tBase * 1000) / (vel || 1)
    * (1 - K.TABERNA * (nivelTaberna || 0))
    * (climaT || 1)
    * (postura === 'audaz' ? K.AUDAZ_T : 1);
}

// ---------------------------------------------------------------------------
// Botín (§4.6)
// ---------------------------------------------------------------------------

/**
 * Botín de un piso superado. opts: { jefe, dominio, nocturna, postura, nReco, triple }.
 * Devuelve valores sin redondear (el que suma redondea).
 */
export function botinPiso(m, f, opts = {}) {
  const { jefe = false, dominio = 0, nocturna = false, postura = 'equilibrada', nReco = 0, triple = false } = opts;
  let mult = Math.pow(K.DOMINIO_BOTIN, dominio || 0);
  if (nocturna) mult *= K.NOCHE_BOTIN;
  if (postura === 'prudente') mult *= K.PRUDENTE_BOTIN;
  else if (postura === 'audaz') mult *= K.AUDAZ_BOTIN;
  if (triple) mult *= K.BONO_TRIPLE;
  const monedas = K.MON_BASE * Math.pow(K.MON_G, m - 1) * (1 + K.MON_F * f) * (jefe ? K.MON_JEFE : 1) * mult;
  const exp = K.EXP_BASE * Math.pow(K.EXP_G, m - 1) * (1 + K.EXP_F * f) * (jefe ? K.EXP_JEFE : 1) * mult;
  let pObjeto = (K.OBJ_BASE + K.OBJ_F * f) * Math.pow(K.OBJ_RECO, nReco || 0);
  if (postura === 'prudente') pObjeto *= K.PRUDENTE_BOTIN;
  else if (postura === 'audaz') pObjeto *= K.AUDAZ_BOTIN;
  return { monedas, exp, pObjeto: Math.min(1, pObjeto) };
}

/** m efectivo de la Misterio para las fórmulas de botín. */
export function mMisterio(f) {
  return 3 + Math.floor(f / 20);
}

/** ¿Es patrulla nocturna? (inicio entre 22:00 y 03:00 locales y horas ≥ 4) */
export function esPatrullaNocturna(inicioMs, horas) {
  const h = new Date(inicioMs).getHours();
  return (h >= K.NOCHE_DESDE || h < K.NOCHE_HASTA) && horas >= K.NOCHE_HORAS_MIN;
}

// ---------------------------------------------------------------------------
// Niveles (§5), edificios (§7.1), salvajes (§6.1)
// ---------------------------------------------------------------------------

/** EXP para pasar del nivel L al L+1. */
export function expSig(nivel) {
  return Math.round(K.EXPSIG_A * Math.pow(nivel, K.EXPSIG_E) + K.EXPSIG_B * nivel);
}

/** Tope de nivel según jefes de isla distintos vencidos (0-8). */
export function topeNivel(jefesVencidos) {
  return Math.min(K.TOPE_MAX, K.TOPE_BASE + K.TOPE_JEFE * (jefesVencidos || 0));
}

/** Coste del nivel n → n+1 de un edificio; null si está al tope. */
export function costeEdificio(id, nivel) {
  const e = K.EDIFICIOS[id];
  if (!e) return null;
  const n = nivel || 0;
  if (n >= e.tope) return null;
  if (e.costes) return e.costes[n];
  return Math.round(e.base * Math.pow(e.g, n));
}

/** Bayas por hora del Huerto. */
export function tasaHuerto(nivel, jefesVencidos) {
  return K.HUERTO_BASE * (nivel || 0) * Math.pow(K.HUERTO_G, jefesVencidos || 0);
}

/** Tope offline del Huerto en horas (Despensa). */
export function topeOfflineHoras(nivelDespensa) {
  return K.DESPENSA_H0 + (nivelDespensa || 0);
}

/** Segundos efectivos de producción offline: 100 % las 2 primeras horas, 75 % el resto. */
export function segundosEfectivos(dtS) {
  const dt = Math.max(0, dtS);
  return dt <= K.OFFLINE_ENTERO ? dt : K.OFFLINE_ENTERO + K.OFFLINE_RESTO * (dt - K.OFFLINE_ENTERO);
}

/** Nivel de un salvaje en el piso f de la isla m. */
export function nivelSalvaje(m, f) {
  if (m === 'misterio') return K.NV_SALV_BASE + Math.round(K.NV_SALV_MIST_F * f);
  return K.NV_SALV_BASE + K.NV_SALV_M * (m - 1) + Math.round(K.NV_SALV_F * f);
}

/** Nivel orientativo de la isla m. */
export function nvOri(m) {
  return 5 + 8 * (m - 1);
}

/** Probabilidad de que un salvaje acepte unirse. huella en unidades (0-3). */
export function pAcepta(nvLider, nvSalv, huella = 0) {
  return clamp(K.ACEPTA_BASE + K.ACEPTA_NV * (nvLider - nvSalv) + K.HUELLA * (huella || 0), K.ACEPTA_MIN, K.ACEPTA_MAX);
}

/** Jefes de isla distintos vencidos en un guardado. */
export function jefesVencidos(save) {
  let n = 0;
  for (let i = 1; i <= 8; i++) if (save && save.islas && save.islas[i] && save.islas[i].jefe) n++;
  return n;
}

/** Coste en bayas de atender a un visitante (v0.2). */
export function costeVisitante(islaMax, esPC) {
  return Math.round(K.VISITA_COSTE * Math.pow(K.VISITA_G, islaMax - 1) * (esPC ? K.VISITA_PC_MULT : 1));
}
