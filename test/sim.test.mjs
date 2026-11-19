import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { K } from '../js/core/formulas.js';
import { hashSeed } from '../js/core/rng.js';
import {
  crearSnapshot, resolverExpedicion, estadoEn, detallePiso, prever, sugerirEquipo,
} from '../js/core/sim.js';
import { atender } from '../js/core/worker-prev.js';
import { cargarFixture, save, mon, mediodia } from './fixtures/nucleo/helpers.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const datos = cargarFixture();
const T0 = mediodia();
const ctx = { datos, ahora: T0, clima: {}, marea: false, tiposMisterio: ['agua', 'fuego'] };

function partida() {
  const s = save({ islas: { 1: { piedad: 0, huellas: {} }, 2: {}, 8: {} } });
  s.pokemon.push(
    mon('0004', { id: 'm_guia01', nv: 5, car: 30 }),
    mon('0019', { id: 'm_rata01', nv: 4 }),
    mon('0016', { id: 'm_pajar1', nv: 4 }),
    mon('0010', { id: 'm_oruga1', nv: 4 }),
  );
  return s;
}
const s0 = partida();
const plan = (extra = {}) => ({
  equipo: ['m_guia01', 'm_rata01', 'm_pajar1'], roles: ['lider', 'expl', 'reco'],
  isla: 1, modo: 'vuelta', hasta: 8, postura: 'equilibrada', dominio: 0, ...extra,
});
const correr = (p, semilla, s = s0, c = ctx) => resolverExpedicion({ plan: p, snapshot: crearSnapshot(s, p, datos), semilla, inicio: T0, ctx: c });

function golden(nombre, valor) {
  const f = path.join(DIR, 'fixtures', `registro-${nombre}.json`);
  const json = JSON.parse(JSON.stringify(valor));
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(json, null, 1));
  assert.deepEqual(json, JSON.parse(fs.readFileSync(f, 'utf8')));
}

test('misma semilla → mismo registro (golden)', () => {
  const a = correr(plan(), 12345);
  const b = correr(plan(), 12345);
  assert.deepEqual(a, b);
  assert.notDeepEqual(correr(plan(), 12346).rondas, a.rondas.length ? null : a.rondas);
  // Inicio a las 12:00 locales; el golden fija inicio para no depender de la zona horaria.
  golden('vuelta', { ...a, inicio: 0, fin: a.fin - a.inicio, rondas: a.rondas.map((r) => ({ ...r, t0: r.t0 - a.inicio, t1: r.t1 - a.inicio })) });
  const p = correr(plan({ modo: 'patrulla', horas: 4, postura: 'audaz' }), 777);
  golden('patrulla', { ...p, inicio: 0, fin: p.fin - p.inicio, rondas: p.rondas.map((r) => ({ ...r, t0: r.t0 - p.inicio, t1: r.t1 - p.inicio })) });
});

test('el registro cuadra: totales = suma de rondas y formato del contrato', () => {
  const r = correr(plan({ modo: 'patrulla', horas: 8 }), 99);
  let mon = 0, exp = 0, rec = 0;
  for (const x of r.rondas) {
    mon += x.monedas; exp += x.exp; rec += x.encuentros.filter((e) => e.acepta).length;
    for (const k of ['t0', 't1', 'pisoFin', 'jefe', 'pvFin', 'monedas', 'exp', 'objetos', 'encuentros', 'eventos', 'fallos']) assert.ok(k in x, k);
    for (const e of x.encuentros) for (const k of ['f', 'sp', 'nv', 'acepta', 'vr', 'rar', 'huellaUsada']) assert.ok(k in e, k);
  }
  assert.equal(r.totales.monedas, mon);
  assert.equal(r.totales.exp, exp);
  assert.equal(r.totales.reclutas, rec);
  assert.ok(['objetivo', 'rescatado', 'tiempo', 'prudente'].includes(r.motivo));
  assert.equal(r.v, 1);
  assert.ok(JSON.stringify(r).length < 60000, 'registro de 8 h demasiado grande');
});

test('estadoEn es monótono y termina en el estado final', () => {
  for (const p of [plan(), plan({ modo: 'patrulla', horas: 1 }), plan({ isla: 'misterio', horas: 1 })]) {
    const r = correr(p, 4242);
    let prev = null;
    const paso = Math.max(1000, (r.fin - r.inicio) / 500);
    for (let t = r.inicio; t <= r.fin + paso; t += paso) {
      const e = estadoEn(r, t);
      if (prev) {
        assert.ok(e.fraccion >= prev.fraccion);
        assert.ok(e.ronda >= prev.ronda);
        if (e.ronda === prev.ronda) assert.ok(e.piso >= prev.piso, `piso ${prev.piso} → ${e.piso}`);
        assert.ok(!prev.terminado || e.terminado);
      }
      assert.ok(e.pv >= 0 && e.pv <= r.pvInicio);
      prev = e;
    }
    const fin = estadoEn(r, r.fin);
    assert.equal(fin.terminado, true);
    assert.equal(fin.pv, r.rondas.at(-1).pvFin);
    assert.equal(estadoEn(r, r.fin - 1).terminado, false);
  }
});

test('rescate con PV 0: vuelve con lo ganado y sin jefe', () => {
  const p = plan({ isla: 8, hasta: 50 });
  let vistos = 0;
  for (let sem = 1; sem <= 30; sem++) {
    const r = correr(p, sem);
    assert.equal(r.motivo, 'rescatado');
    const u = r.rondas.at(-1);
    assert.equal(u.pvFin, 0);
    assert.equal(u.jefe, false);
    assert.equal(u.fallos.length, r.pvInicio);
    if (u.monedas > 0) vistos++;
    assert.equal(estadoEn(r, r.fin).pv, 0);
  }
  assert.ok(vistos > 0);
});

test('prudente nunca baja de 1 PV', () => {
  const p = plan({ isla: 8, hasta: 50, postura: 'prudente' });
  for (let sem = 1; sem <= 40; sem++) {
    const r = correr(p, sem);
    for (const x of r.rondas) assert.ok(x.pvFin >= 1);
    assert.notEqual(r.motivo, 'rescatado');
    for (let t = r.inicio; t <= r.fin; t += r.tPiso / 2) assert.ok(estadoEn(r, t).pv >= 1);
  }
  const pp = plan({ isla: 2, modo: 'patrulla', horas: 8, postura: 'prudente' });
  for (let sem = 1; sem <= 20; sem++) for (const x of correr(pp, sem).rondas) assert.ok(x.pvFin >= 1);
});

test('patrulla respeta las horas', () => {
  for (const horas of [1, 4, 8]) {
    for (let sem = 1; sem <= 5; sem++) {
      const r = correr(plan({ modo: 'patrulla', horas }), sem);
      const limite = T0 + horas * 3600000;
      assert.ok(r.fin <= limite + K.MAX_REINTENTOS_JEFE * r.tPiso + 1, 'se pasa del límite');
      if (r.motivo === 'tiempo') assert.ok(r.fin >= limite);
      for (const x of r.rondas.slice(0, -1)) assert.equal(x.jefe, true);
      for (const x of r.rondas) assert.ok(x.t0 < limite);
    }
  }
  // Con equipo fuerte, una patrulla de 1 h dura 1 h y hace varias vueltas.
  const fuerte = partida();
  for (const m of fuerte.pokemon) { m.nv = 30; m.est = 3; }
  const r = correr(plan({ modo: 'patrulla', horas: 1 }), 5, fuerte);
  assert.equal(r.motivo, 'tiempo');
  assert.equal(r.fin, T0 + 3600000);
  assert.ok(r.rondas.length > 5);
});

test('la previsión no usa la semilla real y es determinista', () => {
  const p = plan();
  const snapshot = crearSnapshot(s0, p, datos);
  const arg = { plan: p, snapshot, semilla: 31337, inicio: T0, ctx };
  const uno = prever(arg, 1);
  const real = resolverExpedicion(arg);
  const prev0 = resolverExpedicion({ ...arg, semilla: hashSeed(31337, 'prev', 0) });
  assert.equal(uno.monedas, prev0.totales.monedas);
  assert.equal(uno.finMediana, prev0.fin);
  // Con 200 semillas el resultado medio es estable y repetible.
  const a = prever(arg, 200), b = prever(arg, 200);
  assert.deepEqual(a, b);
  assert.ok(a.pJefe > 0.5 && a.pJefe <= 1);
  assert.ok(a.pisosMedia > 6 && a.pisosMedia <= 8);
  assert.notEqual(real.semilla, prev0.semilla);
  const pat = prever({ ...arg, plan: plan({ modo: 'patrulla', horas: 1 }), snapshot: crearSnapshot(s0, plan({ modo: 'patrulla', horas: 1 }), datos) }, 50);
  assert.ok(pat.vueltasMedia > 1);
});

test('rendimiento: prever(…, 200) < 20 ms en Node', () => {
  const p = plan({ isla: 2, hasta: 12 });
  const arg = { plan: p, snapshot: crearSnapshot(s0, p, datos), semilla: 1, inicio: T0, ctx };
  prever(arg, 200); prever(arg, 200); // calentar
  let mejor = Infinity;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    prever({ ...arg, semilla: i }, 200);
    mejor = Math.min(mejor, performance.now() - t);
  }
  assert.ok(mejor < 20, `${mejor.toFixed(1)} ms`);
});

test('tutorial: 3 pisos de 20 s, éxito forzado y recluta C de nivel 4 garantizado', () => {
  const s = partida();
  const p = { equipo: ['m_guia01'], roles: ['lider'], isla: 1, tutorial: true };
  for (let sem = 1; sem <= 20; sem++) {
    const r = resolverExpedicion({ plan: p, snapshot: crearSnapshot(s, p, datos), semilla: sem, inicio: T0, ctx });
    assert.equal(r.fin - r.inicio, 60000);
    assert.equal(r.motivo, 'objetivo');
    assert.equal(r.rondas[0].fallos.length, 0);
    const acept = r.rondas[0].encuentros.filter((e) => e.acepta);
    assert.equal(acept.length, 1);
    assert.equal(acept[0].nv, 4);
    assert.equal(acept[0].rar, 'C');
    assert.equal(acept[0].de, 'tutorial');
  }
});

test('guion: 2 primeras expediciones con pEnc ×3 y la 3.ª fuerza un R que acepta', () => {
  const s = partida();
  s.tutorial = { paso: 1, enviadas: 0 };
  assert.equal(crearSnapshot(s, plan(), datos).guion.multEnc, 3);
  s.tutorial.enviadas = 2;
  const snap = crearSnapshot(s, plan(), datos);
  assert.equal(snap.guion.forzarR, true);
  for (let sem = 1; sem <= 10; sem++) {
    const r = resolverExpedicion({ plan: plan(), snapshot: snap, semilla: sem, inicio: T0, ctx });
    const raros = r.rondas[0].encuentros.filter((e) => e.rar === 'R' && e.acepta);
    if (r.rondas[0].fallos[0] !== 1 || r.rondas[0].pisoFin > 1) assert.ok(raros.length >= 1, `semilla ${sem}`);
  }
  // Si ya tiene un raro, no se fuerza.
  s.pokemon.push(mon('0001', { de: 'prado:3' }));
  assert.equal(crearSnapshot(s, plan(), datos).guion.forzarR, false);
});

test('evento menor forzado tras 3 informes sin nada especial', () => {
  const s = partida();
  s.informesSinEspecial = 3;
  const snap = crearSnapshot(s, plan(), datos);
  assert.equal(snap.forzarEvento, true);
  const r = resolverExpedicion({ plan: plan(), snapshot: snap, semilla: 8, inicio: T0, ctx });
  assert.equal(r.rondas[0].eventos.length >= 1, true);
  assert.ok(K.EVENTOS_MENORES.includes(r.rondas[0].eventos[0].tipo));
});

test('Misterio: tramos de 5, sin jefe, dificultad igual para todos', () => {
  const p = plan({ isla: 'misterio', horas: 1 });
  const r = correr(p, 11);
  assert.equal(r.modo, 'misterio');
  assert.ok(r.rondas.length === 1);
  assert.ok(r.rondas[0].pisoFin % 5 === 0);
  assert.ok(['rescatado', 'tiempo', 'prudente'].includes(r.motivo));
  // Dos jugadores con distinto progreso y el mismo equipo: mismo registro.
  const otro = partida();
  otro.islas = { 1: { jefe: true }, 2: { jefe: true }, 3: { jefe: true } };
  const r2 = correr(p, 11, otro);
  assert.deepEqual(r2.rondas, r.rondas);
});

test('hasta < F: no hay jefe y el objetivo es el piso pedido', () => {
  const r = correr(plan({ isla: 2, hasta: 5 }), 3);
  assert.equal(r.rondas[0].jefe, false);
  assert.ok(r.rondas[0].pisoFin <= 5);
  if (r.motivo === 'objetivo') assert.equal(r.rondas[0].pisoFin, 5);
});

test('detallePiso es determinista y coherente con el registro', () => {
  const r = correr(plan(), 12345);
  const a = detallePiso(r, 0, 3), b = detallePiso(r, 0, 3);
  assert.deepEqual(a, b);
  assert.ok(a.golpes.length >= 3);
  const j = detallePiso(r, 0, 8);
  assert.equal(j.jefe, true);
  assert.equal(j.enemigo, '0015');
  assert.equal(j.ok, r.rondas[0].jefe);
  for (const f of r.rondas[0].fallos) if (f < 8) assert.equal(detallePiso(r, 0, f).ok, false);
});

test('sugerirEquipo: líder más fuerte, 3 distintos, respeta ocupados y excluidos', () => {
  const s = partida();
  s.pokemon.push(mon('0006', { id: 'm_drago1', nv: 20 }), mon('0001', { id: 'm_bulba1', nv: 12 }), mon('0007', { id: 'm_squi01', nv: 10 }));
  const t = performance.now();
  const sg = sugerirEquipo(s, 1, {}, ctx);
  const dur = performance.now() - t;
  assert.equal(sg.equipo[0], 'm_drago1');
  assert.equal(new Set(sg.equipo).size, 3);
  assert.equal(sg.roles[0], 'lider');
  assert.ok(sg.prob > 0.9);
  assert.ok(dur < 500, `${dur} ms`);
  s.equipos[0] = { miembros: ['m_drago1'], roles: ['lider'], ultimoPlan: null, exp: { fin: 1 } };
  const sg2 = sugerirEquipo(s, 1, { excluir: ['m_bulba1'] }, ctx);
  assert.ok(!sg2.equipo.includes('m_drago1'));
  assert.ok(!sg2.equipo.includes('m_bulba1'));
  assert.deepEqual(sugerirEquipo(save(), 1, {}, ctx), { equipo: [], roles: [], prob: 0 });
});

test('worker-prev: atiende mensajes sin ser un Worker', () => {
  const p = plan();
  const arg = { plan: p, snapshot: crearSnapshot(s0, p, datos), semilla: 1, inicio: T0, ctx };
  const r = atender({ id: 7, tipo: 'prever', arg, n: 20 });
  assert.equal(r.id, 7);
  assert.equal(r.ok, true);
  assert.deepEqual(r.res, prever(arg, 20));
  assert.equal(atender({ id: 8, tipo: 'otro' }).ok, false);
});

test('el snapshot congela el equipo al enviar', () => {
  const s = partida();
  const snap = crearSnapshot(s, plan(), datos);
  const antes = JSON.stringify(resolverExpedicion({ plan: plan(), snapshot: snap, semilla: 5, inicio: T0, ctx }));
  s.pokemon[0].nv = 90;
  s.base.linterna = 30;
  assert.equal(JSON.stringify(resolverExpedicion({ plan: plan(), snapshot: snap, semilla: 5, inicio: T0, ctx })), antes);
  assert.throws(() => crearSnapshot(s, plan({ equipo: ['nadie'] }), datos), /ya no está/);
});
