import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed, isoSemana, elegirPonderado, idAleatorio } from '../js/core/rng.js';

test('mulberry32 es determinista y da [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xa = Array.from({ length: 50 }, a), xb = Array.from({ length: 50 }, b), xc = Array.from({ length: 50 }, c);
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  for (const x of xa) assert.ok(x >= 0 && x < 1);
});

test('mulberry32: distribución básica uniforme', () => {
  const r = mulberry32(7);
  const cubos = new Array(10).fill(0);
  const N = 100000;
  let suma = 0;
  for (let i = 0; i < N; i++) { const x = r(); suma += x; cubos[Math.floor(x * 10)]++; }
  assert.ok(Math.abs(suma / N - 0.5) < 0.01);
  for (const c of cubos) assert.ok(Math.abs(c / N - 0.1) < 0.01, `cubo ${c}`);
});

test('hashSeed: FNV-1a de 32 bits sobre partes unidas con |', () => {
  assert.equal(hashSeed(''), 0x811c9dc5);
  assert.equal(hashSeed('a'), 0xe40c292c);
  assert.equal(hashSeed('foobar'), 0xbf9cf968);
  assert.equal(hashSeed(1, 'prev', 3), hashSeed('1|prev|3'));
  assert.notEqual(hashSeed(1, 2), hashSeed(12));
  const h = hashSeed(202647, 3);
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  assert.equal(hashSeed('ñ'), hashSeed('ñ'));
});

test('isoSemana en cambios de año (hora local)', () => {
  const s = (y, m, d) => isoSemana(new Date(y, m - 1, d, 12).getTime());
  assert.deepEqual(s(2026, 1, 1), { año: 2026, semana: 1, id: 202601 });
  assert.deepEqual(s(2027, 1, 1), { año: 2026, semana: 53, id: 202653 });
  assert.deepEqual(s(2024, 12, 30), { año: 2025, semana: 1, id: 202501 });
  assert.deepEqual(s(2021, 1, 3), { año: 2020, semana: 53, id: 202053 });
  assert.deepEqual(s(2026, 11, 18), { año: 2026, semana: 47, id: 202647 });
  // Lunes 00:00 local abre semana; domingo 23:59 es la anterior.
  assert.equal(isoSemana(new Date(2026, 10, 16, 0, 0).getTime()).semana, 47);
  assert.equal(isoSemana(new Date(2026, 10, 15, 23, 59).getTime()).semana, 46);
});

test('elegirPonderado respeta los pesos e ignora los nulos', () => {
  const r = mulberry32(1);
  const n = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 30000; i++) n[elegirPonderado(r, [['a', 1], ['b', 3], ['c', 0]])]++;
  assert.equal(n.c, 0);
  assert.ok(Math.abs(n.b / 30000 - 0.75) < 0.02);
  assert.equal(elegirPonderado(r, []), null);
  assert.equal(elegirPonderado(r, [['x', 0]]), null);
});

test('idAleatorio: n caracteres [a-z0-9], determinista con rng', () => {
  const id = idAleatorio(mulberry32(5));
  assert.match(id, /^[a-z0-9]{6}$/);
  assert.equal(id, idAleatorio(mulberry32(5)));
  assert.match(idAleatorio(undefined, 10), /^[a-z0-9]{10}$/);
});
