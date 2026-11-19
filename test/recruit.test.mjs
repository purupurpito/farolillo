import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K } from '../js/core/formulas.js';
import { mulberry32 } from '../js/core/rng.js';
import {
  tablaEncuentros, tirarEncuentro, trasEncuentro, pVario, pVarioBase, aplicarRecluta, etapas, anotarDiario,
} from '../js/core/recruit.js';
import { cargarFixture, save, mon, mediodia } from './fixtures/nucleo/helpers.mjs';

const datos = cargarFixture();
const ctx = { datos, ahora: mediodia(), clima: {}, marea: false };
const snap = { roles: ['lider', 'reco', 'reco'], liderNv: 10, cadenas: {} };
const isla = (id) => datos.islaPorId[id];
const peso = (lista, sp) => (lista.find((x) => x[0] === sp) || [])[1];
const todas = (t) => [...t.C, ...t.PC, ...t.R, ...t.L];

function tirar(n, arg, semilla = 1) {
  const rng = mulberry32(semilla);
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = tirarEncuentro(rng, { snapshot: snap, postura: 'equilibrada', piedad: 0, huellas: {}, ctx, multEnc: 1000, ...arg });
    if (e) out.push(e);
  }
  return out;
}

test('etapas y familias del fixture', () => {
  const et = etapas(datos.especies);
  assert.equal(et['0010'].etapa, 1);
  assert.equal(et['0011'].etapa, 2);
  assert.equal(et['0012'].etapa, 3);
  assert.deepEqual(et['0044'].hijos.sort(), ['0045', '0182']);
});

test('tabla: pesos de faro, exclusivas de otro faro solo tras Dominio 2', () => {
  const t5n = tablaEncuentros(isla(5), save({ faro: 'norte' }), ctx);
  assert.equal(peso(t5n.C, '0037'), K.PESO_FARO_GEN); // Vulpix gen 1 con faro Norte ×3
  assert.equal(peso(t5n.C, '0058'), 1); // Growlithe, exclusiva de Norte: ×1
  assert.equal(peso(t5n.C, '0228'), undefined); // Houndour (Este) sin Dominio 2
  assert.equal(peso(t5n.C, '0322'), 1); // Numel gen 3
  const t5d = tablaEncuentros(isla(5), save({ faro: 'norte', islas: { 5: { dominio: 2 } } }), ctx);
  assert.equal(peso(t5d.C, '0228'), K.PESO_OTRO_FARO);
  const t5e = tablaEncuentros(isla(5), save({ faro: 'este' }), ctx);
  assert.equal(peso(t5e.C, '0228'), 1);
  assert.equal(peso(t5e.C, '0058'), undefined);
  assert.equal(peso(t5e.C, '0037'), 1);
});

test('tabla: sec con pesoSec, extra con su peso, evoluciones tardías por isla', () => {
  const t1 = tablaEncuentros(isla(1), save(), ctx);
  assert.equal(peso(t1.C, '0048'), 0.5 * 3); // secundaria (gen 1, faro Norte)
  assert.equal(peso(t1.R, '0004'), 0.3 * 3);
  assert.equal(peso(t1.R, '0152'), 1); // gen 2
  // Islas 1-3: sin formas evolucionadas.
  assert.ok(!todas(t1).some(([sp]) => etapas(datos.especies)[sp].etapa > 1));
  // Isla 4: etapa 2 en el 40 % final, sin etapa 3.
  const t4 = tablaEncuentros(isla(4), save(), ctx);
  const haunter = todas(t4).find((x) => x[0] === '0093');
  assert.equal(haunter[2], Math.ceil(0.6 * 20));
  assert.ok(!todas(t4).some(([sp]) => sp === '0094'));
  // Isla 6: etapa 3 presente; legendarios en L con desde = F.
  const t6 = tablaEncuentros(isla(6), save(), ctx);
  assert.ok(todas(t6).some(([sp]) => sp === '0365'));
  assert.deepEqual(t6.L.map((x) => x[2]), [30, 30]);
  // Sin extra: añade iniciales con peso bajo.
  const sinExtra = { ...isla(2) };
  const t2 = tablaEncuentros(sinExtra, save(), ctx);
  assert.ok(peso(t2.R, '0007') > 0);
});

test('tabla: marea ×2 para fantasma y siniestro', () => {
  const dia = tablaEncuentros(isla(4), save(), { ...ctx, marea: false });
  const noche = tablaEncuentros(isla(4), save(), { ...ctx, marea: true });
  assert.equal(peso(noche.C, '0092'), 2 * peso(dia.C, '0092'));
  assert.equal(peso(noche.C, '0048'), peso(dia.C, '0048'));
});

test('piedad: con 40 encuentros sin R, el siguiente es R', () => {
  const tabla = tablaEncuentros(isla(2), save(), ctx);
  const encs = tirar(200, { isla: isla(2), piso: 3, F: 12, tabla, piedad: K.PIEDAD });
  assert.ok(encs.length > 0);
  assert.ok(encs.every((e) => e.rar === 'R'));
  const est = { piedad: 39, huellas: {} };
  trasEncuentro({ sp: '0054', rar: 'C', acepta: true }, est);
  assert.equal(est.piedad, 40);
  trasEncuentro({ sp: '0007', rar: 'R', acepta: true }, est);
  assert.equal(est.piedad, 0);
});

test('huellas: suben la aceptación, se acumulan hasta 3 y se gastan al aceptar', () => {
  const tabla = { C: [['0054', 1, 1]], PC: [], R: [], L: [] };
  const base = tirar(4000, { isla: isla(2), piso: 3, F: 12, tabla });
  const con = tirar(4000, { isla: isla(2), piso: 3, F: 12, tabla, huellas: { '0054': 2 } });
  const tasa = (l) => l.filter((e) => e.acepta).length / l.length;
  assert.ok(tasa(con) > tasa(base) + 0.35, `${tasa(base)} → ${tasa(con)}`);
  assert.equal(con[0].huellaUsada, 2);
  const est = { piedad: 0, huellas: {} };
  for (let i = 0; i < 5; i++) trasEncuentro({ sp: 'x', rar: 'C', acepta: false }, est);
  assert.equal(est.huellas.x, 3);
  trasEncuentro({ sp: 'x', rar: 'C', acepta: true }, est);
  assert.equal(est.huellas.x, undefined);
});

test('legendarios solo en el piso del jefe de islas ≥ 6', () => {
  const t6 = tablaEncuentros(isla(6), save(), ctx);
  const piso = tirar(30000, { isla: isla(6), piso: 29, F: 30, tabla: t6 });
  assert.ok(!piso.some((e) => e.rar === 'L'));
  const jefe = tirar(30000, { isla: isla(6), piso: 30, F: 30, tabla: t6 });
  const L = jefe.filter((e) => e.rar === 'L');
  assert.ok(L.length > 50, `L = ${L.length}`);
  assert.ok(L.every((e) => ['0144', '0245'].includes(e.sp)));
  const t5 = tablaEncuentros(isla(5), save(), ctx);
  assert.ok(!tirar(30000, { isla: isla(5), piso: 25, F: 25, tabla: t5 }).some((e) => e.rar === 'L'));
});

test('variocolor: nunca en familias vario:false; cadena hasta ×2', () => {
  const s = save({ cadenas: { '0041': 999, '0074': 999 } });
  assert.equal(pVario('0041', s, ctx), 0);
  assert.equal(pVario('0042', s, ctx), 0);
  assert.equal(pVario('0074', s, ctx), 2 / 320);
  assert.equal(pVario('0050', save(), ctx), 1 / 320);
  assert.equal(pVarioBase(25), (1 / 320) * 1.5);
  assert.equal(pVario('0050', save(), { ...ctx, evento: { tipo: 'brillos', isla: 3 }, islaId: 3 }), 2 / 320);
  const tabla = { C: [['0041', 1, 1], ['0074', 1, 1]], PC: [], R: [], L: [] };
  const encs = tirar(60000, { isla: isla(3), piso: 3, F: 16, tabla, snapshot: { ...snap, cadenas: s.cadenas } });
  assert.ok(!encs.some((e) => e.vr && e.sp === '0041'));
  const vg = encs.filter((e) => e.vr && e.sp === '0074').length;
  assert.ok(vg > 140 && vg < 240, `vario Geodude ${vg}`); // ≈ 30.000 × 1/160
});

test('probabilidad de encuentro: base, recolectores, audaz', () => {
  const tabla = tablaEncuentros(isla(1), save(), ctx);
  const n = 40000;
  const contar = (roles, postura) => {
    const rng = mulberry32(3);
    let c = 0;
    for (let i = 0; i < n; i++) if (tirarEncuentro(rng, { isla: isla(1), piso: 2, F: 8, tabla, snapshot: { ...snap, roles }, postura, ctx })) c++;
    return c / n;
  };
  assert.ok(Math.abs(contar(['lider', 'expl', 'apoyo'], 'equilibrada') - 0.06) < 0.006);
  assert.ok(Math.abs(contar(['lider', 'reco', 'reco'], 'equilibrada') - 0.14) < 0.01);
  assert.ok(Math.abs(contar(['lider', 'expl', 'apoyo'], 'audaz') - 0.069) < 0.006);
});

test('aplicarRecluta: nuevo, estrellas 1-2-3-4-5, caramelo, variocolor, lleno y rechazo', () => {
  const c = { datos, ahora: 1000 };
  const s = save({ islas: { 1: { jefe: false } } });
  const enc = { f: 4, sp: '0019', nv: 30, acepta: true, vr: false, rar: 'C', de: 'prado:4' };
  const r1 = aplicarRecluta(s, enc, c);
  assert.equal(r1.tipo, 'nuevo');
  assert.equal(r1.especial, true);
  const m = s.pokemon[0];
  assert.equal(m.nv, 20); // tope sin jefes
  assert.equal(m.de, 'prado:4');
  assert.deepEqual(m.dia[0], [1000, 'llega', { i: 'prado', f: 4 }]);
  assert.equal(s.bitacora.tenido['0019'], 1000);
  assert.equal(s.cadenas['0019'], 1);
  // Duplicados: 1, 2, 3, 4 y 5 para 1★…5★ (15 en total).
  let n = 0;
  while (m.est < 5) { const r = aplicarRecluta(s, enc, c); assert.equal(r.tipo, 'estrella'); assert.equal(r.especial, false); n++; }
  assert.equal(n, 15);
  assert.equal(s.pokemon.length, 1);
  assert.equal(m.dia.at(-1)[1], 'estrella5');
  assert.equal(aplicarRecluta(s, enc, c).tipo, 'caramelo');
  assert.equal(s.caramelos['0019'], 1);
  // Variocolor: llega como individuo.
  const rv = aplicarRecluta(s, { ...enc, vr: true }, c);
  assert.equal(rv.tipo, 'individuo');
  assert.equal(rv.especial, true);
  assert.equal(s.pokemon.length, 2);
  assert.ok(s.pokemon[1].vr && s.pokemon[1].dia.some((d) => d[1] === 'vario'));
  // Rechazo: solo visto.
  const rr = aplicarRecluta(s, { ...enc, sp: '0016', acepta: false }, c);
  assert.equal(rr.tipo, 'rechazo');
  assert.ok(s.bitacora.visto['0016'] && !s.bitacora.tenido['0016']);
  // Lleno: nuevas especies no entran; duplicados se fusionan.
  const llena = save();
  for (let i = 0; i < K.MAX_POKEMON; i++) llena.pokemon.push(mon('0010'));
  assert.equal(aplicarRecluta(llena, { ...enc, sp: '0016' }, c).tipo, 'lleno');
  assert.equal(aplicarRecluta(llena, { ...enc, sp: '0010' }, c).tipo, 'estrella');
  assert.equal(llena.pokemon.length, K.MAX_POKEMON);
  // Raro: especial aunque ya se tenga.
  const s2 = save();
  aplicarRecluta(s2, { ...enc, sp: '0001', rar: 'R' }, c);
  assert.equal(aplicarRecluta(s2, { ...enc, sp: '0001', rar: 'R' }, c).especial, true);
  // Ajuste «preguntar»: el duplicado llega como individuo.
  const s3 = save({ ajustes: { duplicados: 'preguntar' } });
  aplicarRecluta(s3, enc, c);
  assert.equal(aplicarRecluta(s3, enc, c).tipo, 'individuo');
});

test('diario: máximo 8, cae la no protegida más antigua', () => {
  const m = mon('0019');
  anotarDiario(m, 1, 'llega', {});
  for (let i = 0; i < 10; i++) anotarDiario(m, 2 + i, 'jefe', {});
  anotarDiario(m, 50, 'evo', {});
  assert.equal(m.dia.length, 8);
  assert.equal(m.dia[0][1], 'llega');
  assert.equal(m.dia.at(-1)[1], 'evo');
});
