// movs.js — 4 movimientos por Pokémon según su tipo (mecánica propia y sencilla).
//  golpe: la casilla de delante.  rayo: en línea recta hasta 5 casillas (le da al primero que encuentre).
//  area: a todos los enemigos que tengas alrededor.

export const NOMBRES = {
  normal: ['Golpe Cuerpo', 'Rapidez', 'Vozarrón'],
  fuego: ['Puño Fuego', 'Ascuas', 'Llamarada'],
  agua: ['Acua Cola', 'Pistola Agua', 'Surf'],
  planta: ['Látigo Cepa', 'Hoja Afilada', 'Danza Pétalo'],
  electrico: ['Puño Trueno', 'Impactrueno', 'Chispazo'],
  hielo: ['Puño Hielo', 'Rayo Hielo', 'Ventisca'],
  lucha: ['Golpe Kárate', 'Onda Certera', 'Tajo Cruzado'],
  veneno: ['Puya Nociva', 'Bomba Lodo', 'Onda Tóxica'],
  tierra: ['Excavar', 'Bofetón Lodo', 'Terremoto'],
  volador: ['Picotazo', 'Tajo Aéreo', 'Vendaval'],
  psiquico: ['Cabezazo Zen', 'Confusión', 'Psíquico'],
  bicho: ['Picadura', 'Zumbido', 'Tijera X'],
  roca: ['Golpe Roca', 'Lanzarrocas', 'Avalancha'],
  fantasma: ['Lengüetazo', 'Bola Sombra', 'Infortunio'],
  dragon: ['Garra Dragón', 'Dragoaliento', 'Enfado'],
  siniestro: ['Mordisco', 'Pulso Umbrío', 'Alarido'],
  acero: ['Garra Metal', 'Foco Resplandor', 'Cabeza Hierro'],
  hada: ['Carantoña', 'Viento Feérico', 'Brillo Mágico'],
};

export const COLORES = {
  normal: '#a8a77a', fuego: '#ee8130', agua: '#6390f0', planta: '#7ac74c', electrico: '#f7d02c', hielo: '#96d9d6',
  lucha: '#c22e28', veneno: '#a33ea1', tierra: '#e2bf65', volador: '#a98ff3', psiquico: '#f95587', bicho: '#a6b91a',
  roca: '#b6a136', fantasma: '#735797', dragon: '#6f35fc', siniestro: '#705746', acero: '#b7b7ce', hada: '#d685ad',
};

export const ALCANCE_RAYO = 5;

export function movimientosDe(tipos) {
  const [t0, t1] = tipos;
  const n0 = NOMBRES[t0] || NOMBRES.normal;
  const movs = [
    { nombre: 'Placaje', tipo: 'normal', clase: 'golpe', pow: 35, pp: Infinity, ppMax: Infinity },
    { nombre: n0[0], tipo: t0, clase: 'golpe', pow: 55, pp: 15, ppMax: 15 },
    { nombre: n0[1], tipo: t0, clase: 'rayo', pow: 45, pp: 10, ppMax: 10 },
  ];
  if (t1 && NOMBRES[t1]) movs.push({ nombre: NOMBRES[t1][0], tipo: t1, clase: 'golpe', pow: 55, pp: 12, ppMax: 12 });
  else movs.push({ nombre: n0[2], tipo: t0, clase: 'area', pow: 40, pp: 8, ppMax: 8 });
  if (t0 === 'normal') movs[1].nombre = n0[0];
  return movs;
}

export const CLASE_TXT = { golpe: 'delante', rayo: 'a distancia', area: 'alrededor' };
