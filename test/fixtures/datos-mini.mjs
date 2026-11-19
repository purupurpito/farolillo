// Datos mínimos con el formato de §3 para probar ESTADO sin depender del pipeline de DATOS.
import { prepararDatos } from '../../js/data.js';

const E = {};
function esp(dex, n, t, s, rar, gen, fam, pre = null, evo = [], extra = {}) {
  E[dex] = { n, g: '', gen, t, s, tot: s.reduce((a, b) => a + b, 0), cr: 45, rar, fam, pre, evo, exc: null, vario: true, leg: false, ...extra };
}
// Guías e iniciales
esp('0001', 'Bulbasaur', ['planta', 'veneno'], [45, 49, 49, 65, 65, 45], 'R', 1, '0001', null, [{ a: '0002', c: 'nivel', lv: 16 }]);
esp('0002', 'Ivysaur', ['planta', 'veneno'], [60, 62, 63, 80, 80, 60], 'R', 1, '0001', '0001', []);
esp('0004', 'Charmander', ['fuego'], [39, 52, 43, 60, 50, 65], 'R', 1, '0004', null, [{ a: '0005', c: 'nivel', lv: 16 }]);
esp('0005', 'Charmeleon', ['fuego'], [58, 64, 58, 80, 65, 80], 'R', 1, '0004', '0004', []);
esp('0007', 'Squirtle', ['agua'], [44, 48, 65, 50, 64, 43], 'R', 1, '0007', null, []);
esp('0152', 'Chikorita', ['planta'], [45, 49, 65, 49, 65, 45], 'R', 2, '0152', null, []);
esp('0155', 'Cyndaquil', ['fuego'], [39, 52, 43, 60, 50, 65], 'R', 2, '0155', null, []);
esp('0158', 'Totodile', ['agua'], [50, 65, 64, 44, 48, 43], 'R', 2, '0158', null, []);
// Isla 1
esp('0010', 'Caterpie', ['bicho'], [45, 30, 35, 20, 20, 45], 'C', 1, '0010', null, [{ a: '0011', c: 'nivel', lv: 7 }]);
esp('0011', 'Metapod', ['bicho'], [50, 20, 55, 25, 25, 30], 'C', 1, '0010', '0010', []);
esp('0016', 'Pidgey', ['normal', 'volador'], [40, 45, 40, 35, 35, 56], 'C', 1, '0016', null, []);
esp('0019', 'Rattata', ['normal'], [30, 56, 35, 25, 35, 72], 'C', 1, '0019', null, []);
esp('0043', 'Oddish', ['planta', 'veneno'], [45, 50, 55, 75, 65, 30], 'C', 1, '0043', null, [{ a: '0044', c: 'nivel', lv: 21 }]);
esp('0044', 'Gloom', ['planta', 'veneno'], [60, 65, 70, 85, 75, 40], 'C', 1, '0043', '0043', [{ a: '0045', c: 'piedra', it: 'piedra_hoja' }]);
esp('0045', 'Vileplume', ['planta', 'veneno'], [75, 80, 85, 110, 90, 50], 'C', 1, '0043', '0044', []);
esp('0161', 'Sentret', ['normal'], [35, 46, 34, 35, 45, 20], 'C', 2, '0161', null, []);
esp('0015', 'Beedrill', ['bicho', 'veneno'], [65, 90, 40, 45, 80, 75], 'C', 1, '0010', null, []);
esp('0133', 'Eevee', ['normal'], [55, 55, 50, 45, 65, 55], 'R', 1, '0133', null, [{ a: '0134', c: 'piedra', it: 'piedra_agua' }]);
esp('0134', 'Vaporeon', ['agua'], [130, 65, 60, 110, 95, 65], 'R', 1, '0133', '0133', []);
esp('0399', 'Bidoof', ['normal'], [59, 45, 40, 35, 40, 31], 'C', 4, '0399', null, []);
esp('0013', 'Weedle', ['bicho', 'veneno'], [40, 35, 30, 20, 20, 50], 'PC', 1, '0013', null, []);
// Isla 2
esp('0054', 'Psyduck', ['agua'], [50, 52, 48, 65, 50, 55], 'C', 1, '0054', null, []);
esp('0055', 'Golduck', ['agua'], [80, 82, 78, 95, 80, 85], 'C', 1, '0054', '0054', []);
esp('0118', 'Goldeen', ['agua'], [45, 67, 60, 35, 50, 63], 'C', 1, '0118', null, []);
esp('0183', 'Marill', ['agua', 'hada'], [70, 20, 50, 20, 50, 40], 'PC', 2, '0183', null, []);
esp('0278', 'Wingull', ['agua', 'volador'], [40, 30, 30, 55, 30, 85], 'C', 3, '0278', null, []);
// Isla 3
esp('0041', 'Zubat', ['veneno', 'volador'], [40, 45, 35, 30, 40, 55], 'C', 1, '0041', null, []);
esp('0074', 'Geodude', ['roca', 'tierra'], [40, 80, 100, 30, 30, 20], 'C', 1, '0074', null, []);
esp('0050', 'Diglett', ['tierra'], [10, 55, 25, 35, 45, 95], 'C', 1, '0050', null, []);
esp('0208', 'Steelix', ['acero', 'tierra'], [75, 85, 200, 55, 65, 30], 'PC', 2, '0095', null, []);
esp('0304', 'Aron', ['acero', 'roca'], [50, 70, 100, 40, 40, 30], 'PC', 3, '0304', null, [], { exc: 'sur' });
// Islas 4-8 (lo justo)
esp('0092', 'Gastly', ['fantasma', 'veneno'], [30, 35, 30, 100, 35, 80], 'PC', 1, '0092', null, []);
esp('0094', 'Gengar', ['fantasma', 'veneno'], [60, 65, 60, 130, 75, 110], 'PC', 1, '0092', null, []);
esp('0198', 'Murkrow', ['siniestro', 'volador'], [60, 85, 42, 85, 42, 91], 'PC', 2, '0198', null, [], { exc: 'este' });
esp('0355', 'Duskull', ['fantasma'], [20, 40, 90, 30, 90, 25], 'PC', 3, '0355', null, [], { exc: 'sur' });
esp('0037', 'Vulpix', ['fuego'], [38, 41, 40, 50, 65, 65], 'PC', 1, '0037', null, []);
esp('0126', 'Magmar', ['fuego'], [65, 95, 57, 100, 85, 93], 'PC', 1, '0240', null, []);
esp('0228', 'Houndour', ['siniestro', 'fuego'], [45, 60, 30, 80, 50, 65], 'PC', 2, '0228', null, [], { exc: 'este' });
esp('0220', 'Swinub', ['hielo', 'tierra'], [50, 50, 40, 30, 30, 50], 'C', 2, '0220', null, []);
esp('0361', 'Snorunt', ['hielo'], [50, 50, 50, 50, 50, 50], 'PC', 3, '0361', null, []);
esp('0365', 'Walrein', ['hielo', 'agua'], [110, 80, 90, 95, 90, 65], 'PC', 3, '0363', null, []);
esp('0081', 'Magnemite', ['electrico', 'acero'], [25, 35, 70, 95, 55, 45], 'C', 1, '0081', null, []);
esp('0374', 'Beldum', ['acero', 'psiquico'], [40, 55, 80, 35, 60, 30], 'R', 3, '0374', null, []);
esp('0376', 'Metagross', ['acero', 'psiquico'], [80, 135, 130, 95, 90, 70], 'R', 3, '0374', null, []);
esp('0147', 'Dratini', ['dragon'], [41, 64, 45, 50, 50, 50], 'R', 1, '0147', null, []);
esp('0175', 'Togepi', ['hada'], [35, 20, 65, 40, 65, 20], 'PC', 2, '0175', null, []);
esp('0373', 'Salamence', ['dragon', 'volador'], [95, 135, 80, 110, 80, 100], 'R', 3, '0371', null, []);
esp('0144', 'Articuno', ['hielo', 'volador'], [90, 85, 100, 95, 125, 85], 'L', 1, '0144', null, [], { leg: true, vario: false });

const islas = [
  { id: 1, clave: 'prado', n: 'Prado Brote', tipos: ['normal', 'bicho', 'planta'], F: 8, tBase: 30, jefe: '0015', fondo: '#7fbf5a', especies: ['0010', '0016', '0019', '0043', '0161', '0399', '0013'], evolTardias: true, objetos: ['piedra_hoja', 'baya_grande'], leg: [], dominioRaro: '0133' },
  { id: 2, clave: 'arroyo', n: 'Arroyo Cantarín', tipos: ['agua', 'volador'], F: 12, tBase: 42, jefe: '0055', fondo: '#5fa3d6', especies: ['0054', '0118', '0183', '0278', '0016'], evolTardias: true, objetos: ['piedra_agua', 'baya_grande'], leg: [], dominioRaro: '0183' },
  { id: 3, clave: 'cueva', n: 'Cueva Eco', tipos: ['roca', 'tierra', 'veneno'], F: 16, tBase: 54, jefe: '0208', fondo: '#8a7a66', especies: ['0041', '0074', '0050', '0304', '0043'], evolTardias: true, objetos: ['piedra_lunar', 'baya_grande'], leg: [], dominioRaro: '0304' },
  { id: 4, clave: 'bosque', n: 'Bosque Umbrío', tipos: ['fantasma', 'siniestro', 'bicho'], F: 20, tBase: 66, jefe: '0094', fondo: '#3f4f3a', especies: ['0092', '0198', '0355', '0010'], evolTardias: true, objetos: ['piedra_ocaso', 'baya_grande'], leg: [], dominioRaro: '0355' },
  { id: 5, clave: 'volcan', n: 'Volcán Brasa', tipos: ['fuego', 'lucha'], F: 25, tBase: 78, jefe: '0126', fondo: '#b5543a', especies: ['0037', '0228', '0004'], evolTardias: true, objetos: ['piedra_fuego', 'baya_grande'], leg: [], dominioRaro: '0228' },
  { id: 6, clave: 'pico', n: 'Pico Escarcha', tipos: ['hielo', 'volador'], F: 30, tBase: 90, jefe: '0365', fondo: '#cfe3ef', especies: ['0220', '0361', '0016'], evolTardias: true, objetos: ['piedra_hielo', 'garra_afilada', 'baya_grande'], leg: ['0144'], dominioRaro: '0361' },
  { id: 7, clave: 'ruinas', n: 'Ruinas Tormenta', tipos: ['electrico', 'acero', 'psiquico'], F: 40, tBase: 102, jefe: '0376', fondo: '#7d7a9c', especies: ['0081', '0374', '0074'], evolTardias: true, objetos: ['piedra_trueno', 'baya_grande'], leg: [], dominioRaro: '0374' },
  { id: 8, clave: 'cumbre', n: 'Cumbre Nébula', tipos: ['dragon', 'hada'], F: 50, tBase: 114, jefe: '0373', fondo: '#c9a3d9', especies: ['0147', '0175', '0183'], evolTardias: true, objetos: ['piedra_solar', 'piedra_dia', 'baya_grande'], leg: [], dominioRaro: '0147' },
];

const ids = ['normal', 'fuego', 'agua', 'planta', 'electrico', 'hielo', 'lucha', 'veneno', 'tierra', 'volador', 'psiquico', 'bicho', 'roca', 'fantasma', 'dragon', 'siniestro', 'acero', 'hada'];
const nombres = Object.fromEntries(ids.map((t) => [t, t[0].toUpperCase() + t.slice(1)]));
const ef = {
  fuego: { planta: 2, hielo: 2, bicho: 2, acero: 2, agua: 0.5, fuego: 0.5, roca: 0.5, dragon: 0.5 },
  agua: { fuego: 2, tierra: 2, roca: 2, agua: 0.5, planta: 0.5, dragon: 0.5 },
  planta: { agua: 2, tierra: 2, roca: 2, fuego: 0.5, planta: 0.5, veneno: 0.5, volador: 0.5, bicho: 0.5, dragon: 0.5, acero: 0.5 },
  normal: { roca: 0.5, acero: 0.5, fantasma: 0 },
  electrico: { agua: 2, volador: 2, planta: 0.5, electrico: 0.5, dragon: 0.5, tierra: 0 },
};

export const textosMini = {
  diario: { llega: 'Se unió en el piso {f} de {isla}.' },
  frases: { normal: ['Hola, {n}.'], feliz: ['¡Qué bien se está en la cala!'] },
  eventos: {}, guia: {},
};

export function datosMini() {
  return prepararDatos({
    especies: { v: 1, sha: 'test', especies: JSON.parse(JSON.stringify(E)) },
    islas: JSON.parse(JSON.stringify(islas)),
    tipos: { ids, nombres, ef },
    textos: textosMini,
  });
}
