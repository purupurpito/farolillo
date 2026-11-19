import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/core/rng.js';
import { nuevoGuardado } from '../js/core/state.js';
import {
  producir, pendienteHuerto, topeHoras, tasaActual, nivelCala, tiraVisitante, costeVisitante,
  infoEdificio, jefesVencidos, tablaVisitante,
} from '../js/core/economy.js';
import { tasaHuerto, K } from '../js/core/formulas.js';
import { datosMini } from './fixtures/datos-mini.mjs';

const H = 3600_000;
const T0 = Date.UTC(2026, 10, 18, 10, 0, 0);
const datos = datosMini();
const nuevo = () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(11), faro: 'norte' });
  s.base.huerto = 2;
  return s;
};

test('huerto: 100 % las dos primeras horas', () => {
  const s = nuevo();
  const tasa = tasaHuerto(2, 0);
  assert.equal(tasaActual(s), tasa);
  assert.equal(pendienteHuerto(s, T0 + 1 * H), Math.floor(tasa));
  const r = producir(s, T0 + 2 * H, { datos });
  assert.equal(r.bayas, Math.floor(tasa * 2));
  assert.equal(s.bayas, r.bayas);
  assert.equal(s.base.ultimaRecogida, T0 + 2 * H);
});

test('huerto: 75 % tras 2 h', () => {
  const s = nuevo();
  const tasa = tasaHuerto(2, 0);
  const r = producir(s, T0 + 6 * H, { datos });
  assert.equal(r.bayas, Math.floor(tasa * (2 + 0.75 * 4)));
});

test('huerto: tope offline 8 h + Despensa', () => {
  const s = nuevo();
  const tasa = tasaHuerto(2, 0);
  assert.equal(topeHoras(s), 8);
  const r = producir(s, T0 + 30 * H, { datos });
  assert.equal(r.bayas, Math.floor(tasa * (2 + 0.75 * 6)));
  const s2 = nuevo();
  s2.base.despensa = 4;
  assert.equal(topeHoras(s2), 12);
  assert.equal(producir(s2, T0 + 30 * H, { datos }).bayas, Math.floor(tasa * (2 + 0.75 * 10)));
});

test('huerto: los restos fraccionarios no se pierden', () => {
  const s = nuevo();
  s.base.huerto = 1; // K.HUERTO_BASE/h
  let total = 0;
  for (let i = 1; i <= 60; i++) total += producir(s, T0 + i * 60_000, { datos }).bayas; // cada minuto
  assert.equal(total, Math.floor(tasaHuerto(1, 0)));
});

test('huerto: reloj hacia atrás da 0 y reancla', () => {
  const s = nuevo();
  const r = producir(s, T0 - 5 * H, { datos });
  assert.equal(r.bayas, 0);
  assert.equal(s.base.ultimaRecogida, T0 - 5 * H);
});

test('la tasa sube con los jefes vencidos', () => {
  const s = nuevo();
  s.islas['1'].jefe = true;
  s.islas['2'] = { ...s.islas['1'] };
  assert.equal(jefesVencidos(s), 2);
  assert.equal(tasaActual(s), tasaHuerto(2, 2));
});

test('visitante: apagado por defecto en v0.1', () => {
  const s = nuevo();
  const r = producir(s, T0 + 8 * H, { datos });
  assert.equal(r.visitas, 0);
  assert.equal(s.visitante, null);
});

test('visitante: se tira cada 2 h con hueco libre y caduca a las 12 h', () => {
  const s = nuevo();
  const r = producir(s, T0 + 8 * H, { datos, visitantes: true });
  // 4 tiradas con p=0.35: con esta semilla sale al menos uno o ninguno, pero nunca más de 1 a la vez
  assert.ok(r.visitas <= 1 || s.visitante, 'como mucho un visitante ocupando el hueco');
  // forzar uno con un rng que siempre acierta
  const s2 = nuevo();
  const v = tiraVisitante(s2, () => 0.01, { datos, ahora: T0 });
  assert.ok(v);
  assert.equal(v.vence - v.llega, 12 * H);
  assert.equal(tiraVisitante(s2, () => 0.01, { datos, ahora: T0 }), null, 'hueco ocupado');
  const e = datos.especies[v.sp];
  assert.ok(['C', 'PC'].includes(e.rar));
  assert.ok(!e.exc || e.exc === s2.faro);
  // caducidad
  const r2 = producir(s2, T0 + 13 * H, { datos });
  assert.equal(r2.caducado, v.sp);
  assert.equal(s2.visitante, null);
  // estadística: con muchas semillas, ~35 % por tirada
  let n = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const s3 = nuevo();
    if (tiraVisitante(s3, mulberry32(i + 1), { datos, ahora: T0 })) n++;
  }
  assert.ok(Math.abs(n / N - 0.35) < 0.04, `tasa ${n / N}`);
});

test('visitante: tabla sin L, R ni exclusivas de otro faro', () => {
  const s = nuevo();
  s.islas['3'] = { ...s.islas['1'] };
  const t = tablaVisitante(s, datos);
  const todas = [...t.C, ...t.PC].map((x) => x[0]);
  assert.ok(!todas.includes('0304'), 'Aron es exclusivo de sur');
  assert.ok(todas.includes('0010'));
  assert.ok(costeVisitante(s, { pc: true }) === 3 * costeVisitante(s, { pc: false }));
});

test('edificios: info y nivel de la cala', () => {
  const s = nuevo();
  s.monedas = 100;
  const h = infoEdificio(s, 'huerto');
  assert.equal(h.nivel, 2);
  assert.ok(h.coste > 0);
  assert.equal(infoEdificio(s, 'muelle').coste, K.EDIFICIOS.muelle.costes[0]);
  assert.equal(infoEdificio(s, 'muelle').asequible, false);
  s.base.linterna = 3;
  assert.equal(nivelCala(s), 1);
});
