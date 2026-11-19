import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opcionesEvolucion, aplicarEvolucion, momentoDe } from '../js/core/evolve.js';
import { cargarFixture, save, mon, mediodia } from './fixtures/nucleo/helpers.mjs';

const datos = cargarFixture();
const dia = mediodia();
const noche = new Date(2026, 10, 18, 22, 0, 0).getTime();

test('nivel: posible al alcanzar minimum_level; nunca automática', () => {
  const m = mon('0004', { nv: 15 });
  const s = save({ pokemon: [m] });
  let [o] = opcionesEvolucion(m, s, datos, dia);
  assert.equal(o.a, '0005');
  assert.equal(o.posible, false);
  assert.equal(o.falta, 'Nivel 16');
  m.nv = 16;
  [o] = opcionesEvolucion(m, s, datos, dia);
  assert.equal(o.posible, true);
  assert.equal(m.sp, '0004');
  const r = aplicarEvolucion(s, m.id, '0005', datos, dia);
  assert.equal(r.sp, '0005');
});

test('piedra: gasta la piedra o 10 caramelos', () => {
  const m = mon('0025', { nv: 10 });
  const s = save({ pokemon: [m], objetos: { piedra_trueno: 1 }, caramelos: {} });
  assert.equal(opcionesEvolucion(m, s, datos, dia)[0].posible, true);
  aplicarEvolucion(s, m.id, '0026', datos, dia);
  assert.equal(s.objetos.piedra_trueno, 0);
  const m2 = mon('0037');
  const s2 = save({ pokemon: [m2], objetos: {}, caramelos: { '0037': 9 } });
  const o = opcionesEvolucion(m2, s2, datos, dia)[0];
  assert.equal(o.posible, false);
  assert.match(o.falta, /Piedra Fuego/);
  assert.throws(() => aplicarEvolucion(s2, m2.id, '0038', datos, dia), /Aún no puede evolucionar/);
  s2.caramelos['0037'] = 10;
  aplicarEvolucion(s2, m2.id, '0038', datos, dia);
  assert.equal(s2.caramelos['0037'], 0);
  assert.equal(m2.sp, '0038');
});

test('objeto: garra_afilada (los caramelos no sirven)', () => {
  const m = mon('0215');
  const s = save({ pokemon: [m], objetos: {}, caramelos: { '0215': 50 } });
  assert.equal(opcionesEvolucion(m, s, datos, dia)[0].posible, false);
  s.objetos.garra_afilada = 2;
  aplicarEvolucion(s, m.id, '0461', datos, dia);
  assert.equal(s.objetos.garra_afilada, 1);
});

test('amistad: cariño ≥ 80 y momento del día', () => {
  assert.equal(momentoDe(dia), 'dia');
  assert.equal(momentoDe(noche), 'noche');
  const m = mon('0133', { car: 79 });
  const s = save({ pokemon: [m] });
  const espeon = () => opcionesEvolucion(m, s, datos, dia).find((o) => o.a === '0196');
  assert.equal(espeon().posible, false);
  assert.equal(espeon().falta, 'Cariño 80');
  m.car = 80;
  assert.equal(espeon().posible, true);
  const umbreonDia = opcionesEvolucion(m, s, datos, dia).find((o) => o.a === '0197');
  assert.equal(umbreonDia.posible, false);
  assert.match(umbreonDia.falta, /noche/);
  assert.equal(opcionesEvolucion(m, s, datos, noche).find((o) => o.a === '0197').posible, true);
  const z = mon('0042', { car: 80 });
  assert.equal(opcionesEvolucion(z, save({ pokemon: [z] }), datos, noche)[0].posible, true);
});

test('ramificadas: Eevee ofrece 7 opciones y Gloom 2', () => {
  const e = mon('0133');
  assert.equal(opcionesEvolucion(e, save({ pokemon: [e] }), datos, dia).length, 7);
  const g = mon('0044');
  assert.deepEqual(opcionesEvolucion(g, save({ pokemon: [g] }), datos, dia).map((o) => o.a).sort(), ['0045', '0182']);
  assert.deepEqual(opcionesEvolucion(mon('0003'), save(), datos, dia), []);
});

test('intercambio: al llegar por intercambio o con Cordón Amistad en solitario', () => {
  const m = mon('0093');
  const s = save({ pokemon: [m], objetos: {} });
  const o = opcionesEvolucion(m, s, datos, dia)[0];
  assert.equal(o.posible, false);
  assert.match(o.falta, /Intercambio o Cordón Amistad/);
  assert.equal(opcionesEvolucion(m, s, datos, dia, 'intercambio')[0].posible, true);
  aplicarEvolucion(s, m.id, '0094', datos, dia, 'intercambio');
  assert.equal(m.sp, '0094');
  const m2 = mon('0075');
  const s2 = save({ pokemon: [m2], objetos: { cordon_amistad: 1 } });
  aplicarEvolucion(s2, m2.id, '0076', datos, dia);
  assert.equal(s2.objetos.cordon_amistad, 0);
});

test('conserva apodo, nivel, estrellas, cariño, diario y variocolor; anota «evo» y la Bitácora', () => {
  const m = mon('0010', { ap: 'Bichito', nv: 7, est: 3, car: 55, vr: true, dia: [[1, 'llega', { i: 'prado', f: 2 }]] });
  const s = save({ pokemon: [m] });
  aplicarEvolucion(s, m.id, '0011', datos, 5000);
  assert.deepEqual(
    { sp: m.sp, ap: m.ap, nv: m.nv, est: m.est, car: m.car, vr: m.vr },
    { sp: '0011', ap: 'Bichito', nv: 7, est: 3, car: 55, vr: true },
  );
  assert.deepEqual(m.dia[0], [1, 'llega', { i: 'prado', f: 2 }]);
  assert.deepEqual(m.dia[1], [5000, 'evo', { de: '0010', a: '0011' }]);
  assert.equal(s.bitacora.tenido['0011'], 5000);
});

test('errores en castellano', () => {
  const m = mon('0010', { nv: 7 });
  const s = save({ pokemon: [m] });
  assert.throws(() => aplicarEvolucion(s, 'nadie', '0011', datos, dia), /No encuentro/);
  assert.throws(() => aplicarEvolucion(s, m.id, '0012', datos, dia), /No puede evolucionar en esa especie/);
});
