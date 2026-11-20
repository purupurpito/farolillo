// datos.js — Prototipo B (combate táctico). Especies, tipos, movimientos y creación de unidades.
// Lee data/especies.json y data/tipos.json del juego (solo lectura).

export const RAIZ = '../../';
export const INICIALES = ['0001', '0004', '0007', '0152', '0155', '0158', '0252', '0255', '0258'];

export let ESP = {};
export let TIPOS = { ids: [], nombres: {}, ef: {} };

/** Para pruebas en Node: inyectar los JSON ya leídos. */
export function ponerDatos(especies, tipos) { ESP = especies; TIPOS = tipos; }

export async function cargarDatos() {
  const [e, t] = await Promise.all([
    fetch(RAIZ + 'data/especies.json').then((r) => r.json()),
    fetch(RAIZ + 'data/tipos.json').then((r) => r.json()),
  ]);
  ESP = e.especies;
  TIPOS = t;
}

/** Colores de tipo (para chips, proyectiles y botones). */
export const COLOR_TIPO = {
  normal: '#a8a77a', fuego: '#ee8130', agua: '#6390f0', planta: '#7ac74c', electrico: '#e5c531',
  hielo: '#96d9d6', lucha: '#c22e28', veneno: '#a33ea1', tierra: '#d9b75b', volador: '#a98ff3',
  psiquico: '#f95587', bicho: '#a6b91a', roca: '#b6a136', fantasma: '#735797', dragon: '#6f35fc',
  siniestro: '#705746', acero: '#b7b7ce', hada: '#d685ad',
};

export const nombreTipo = (t) => TIPOS.nombres[t] || t;

/** Multiplicador de eficacia de un ataque de tipo `t` contra unos tipos defensores. */
export function eficacia(t, defensores) {
  const fila = TIPOS.ef[t] || {};
  let m = 1;
  for (const d of defensores) m *= fila[d] != null ? fila[d] : 1;
  return m;
}

// Movimiento de tipo (ataque principal): alcance [mín, máx] en casillas (distancia en cruz).
const PRINCIPAL = {
  normal: ['Rapidez', 40, 1, 3], fuego: ['Ascuas', 40, 1, 3], agua: ['Pistola Agua', 40, 1, 3],
  planta: ['Hoja Afilada', 40, 1, 3], electrico: ['Impactrueno', 40, 1, 3], hielo: ['Canto Helado', 40, 1, 3],
  lucha: ['Golpe Karate', 55, 1, 1], veneno: ['Ácido', 40, 1, 3], tierra: ['Bofetón Lodo', 45, 1, 2],
  volador: ['Tornado', 40, 1, 3], psiquico: ['Confusión', 40, 1, 3], bicho: ['Picadura', 55, 1, 1],
  roca: ['Lanzarrocas', 45, 1, 2], fantasma: ['Lengüetazo', 55, 1, 1], dragon: ['Furia Dragón', 40, 1, 3],
  siniestro: ['Mordisco', 55, 1, 1], acero: ['Garra Metal', 55, 1, 1], hada: ['Viento Feérico', 40, 1, 3],
};
// Movimiento de área (segundo tipo, o el primero si solo tiene uno). 'linea' = 3 casillas en recto;
// 'cruz' = casilla elegida (a 1-2) y sus 4 vecinas. Recarga: se puede usar un turno sí y otro no.
const AREA = {
  normal: ['Vozarrón', 'cruz'], fuego: ['Lanzallamas', 'linea'], agua: ['Surf', 'linea'],
  planta: ['Hojas Navaja', 'cruz'], electrico: ['Rayo', 'linea'], hielo: ['Rayo Hielo', 'linea'],
  lucha: ['Onda Certera', 'cruz'], veneno: ['Bomba Lodo', 'cruz'], tierra: ['Terremoto', 'cruz'],
  volador: ['Aire Afilado', 'linea'], psiquico: ['Psicorrayo', 'linea'], bicho: ['Zumbido', 'cruz'],
  roca: ['Avalancha', 'cruz'], fantasma: ['Bola Sombra', 'cruz'], dragon: ['Dragoaliento', 'linea'],
  siniestro: ['Pulso Umbrío', 'cruz'], acero: ['Foco Resplandor', 'linea'], hada: ['Brillo Mágico', 'cruz'],
};

export const POT_AREA = 30;
/** PS de las unidades (más PS = combates más largos y con más margen para maniobrar). */
export const PS_MULT = 1.5;
/** Total de stats de los compañeros aleatorios (sin extremos: el equipo no depende tanto del azar). */
export const COMPI_MIN = 300;
export const COMPI_MAX = 400;
/** Tras ganar un combate: los debilitados se levantan con REVIVE y el resto recupera CURA_VICTORIA. */
export const REVIVE = 0.4;
export const CURA_VICTORIA = 0.35;
export const NV_MAX = 10;

/** Sube un nivel a la unidad: +5 % de ataque y defensa, +5 % de PS máx. (y los cura). */
export function subirNivel(u) {
  if (u.nv >= NV_MAX) return false;
  u.nv++;
  u.atk *= 1.05; u.def *= 1.05;
  const extra = Math.round(u.psMax * 0.05);
  u.psMax += extra;
  if (u.ps > 0) u.ps += extra;
  return true;
}
export const REC_AREA = 2;

/** Los 3 movimientos de una especie. */
export function movimientosDe(sp) {
  const t = ESP[sp].t;
  const p = PRINCIPAL[t[0]] || PRINCIPAL.normal;
  const ta = t[1] || t[0];
  const a = AREA[ta] || AREA.normal;
  return [
    { id: 'empuje', n: 'Placaje', tipo: 'normal', pot: 30, forma: 'uno', min: 1, max: 1, empuja: 1, recMax: 0, rec: 0,
      desc: 'Cuerpo a cuerpo. Empuja 1 casilla; si choca, daño extra.' },
    { id: 'principal', n: p[0], tipo: t[0], pot: p[1], forma: 'uno', min: p[2], max: p[3], recMax: 0, rec: 0,
      desc: p[3] > 1 ? `A distancia (hasta ${p[3]}).` : 'Cuerpo a cuerpo, fuerte.' },
    { id: 'area', n: a[0], tipo: ta, pot: POT_AREA, forma: a[1], min: 1, max: a[1] === 'linea' ? 3 : 2, recMax: REC_AREA, rec: 0,
      desc: a[1] === 'linea' ? '3 casillas en línea recta. Un turno sí y otro no.' : 'Casilla a 1-2 y sus 4 vecinas. Un turno sí y otro no.' },
  ];
}

let uidN = 0;
/**
 * Unidad de combate. `mult` escala PS, ataque y defensa (profundidad del mapa, élite, jefe).
 */
export function crearUnidad(sp, bando, mult = 1, extra = {}) {
  const e = ESP[sp];
  const s = e.s;
  const psMax = Math.round((s[0] * 0.55 + 32) * PS_MULT * mult * (extra.psMult || 1));
  return {
    uid: ++uidN, sp, bando, n: e.n, tipos: e.t.slice(),
    psMax, ps: psMax,
    atk: (Math.max(s[1], s[3]) * 0.7 + 25) * mult * (extra.atkMult || 1),
    def: ((s[2] + s[4]) / 2 * 0.7 + 25) * mult,
    mov: 3 + (s[5] >= 90 ? 1 : 0),
    vuela: e.t.includes('volador'),
    movs: movimientosDe(sp),
    jefe: !!extra.jefe, elite: !!extra.elite,
    nv: 1, xp: 0, origen: null,
    c: 0, r: 0, movido: false, actuado: false,
    // estado visual (lo usa tablero.js)
    vx: 0, vy: 0, anim: 'Idle', t0: 0, bucle: true, dir: 0, alfa: 1, destello: 0,
  };
}

/** Especie aleatoria con un total de stats en [min, max] (sin legendarios salvo `leg`). */
export function especieAleatoria(rng, min, max, { leg = false, excluir = [] } = {}) {
  let lista = Object.keys(ESP).filter((k) => {
    const e = ESP[k];
    return e.tot >= min && e.tot <= max && (leg || !e.leg) && !excluir.includes(k);
  });
  if (!lista.length) lista = Object.keys(ESP);
  return lista[Math.floor(rng() * lista.length)];
}

export function rngDe(semilla) {
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
