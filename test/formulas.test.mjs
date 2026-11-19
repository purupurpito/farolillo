import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  K, poderMon, multTipo, poderEquipo, dificultad, dificultadMisterio, probPiso, tramos, tramosHasta,
  tPiso, velEquipo, botinPiso, expSig, topeNivel, costeEdificio, tasaHuerto, nivelSalvaje, nvOri,
  climaDe, climaTipo, pAcepta, segundosEfectivos, topeOfflineHoras, mMisterio, composicion,
} from '../js/core/formulas.js';
import { cargarFixture } from './fixtures/nucleo/helpers.mjs';

const datos = cargarFixture();
const ef = datos.tipos.ef;
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('D0 de la spec (forma 50 × 1,66^(m−1)) y D0 ajustado conservando la isla 1', () => {
  assert.deepEqual(K.D0_SPEC, [50, 83, 138, 229, 380, 630, 1046, 1737]);
  assert.equal(K.D0[0], 50);
  assert.equal(K.D0.length, 8);
  for (let i = 1; i < 8; i++) assert.ok(K.D0[i] > K.D0[i - 1]);
});

test('dificultad: rampa 1,8, jefe ×1,25, dominio ×1,6^k, Misterio fija', () => {
  const isla = { id: 1, F: 8 };
  cerca(dificultad(isla, 1, 0, 1), 50);
  cerca(dificultad(isla, 8, 0, 1), 50 * 1.8 * 1.25);
  cerca(dificultad(isla, 8, 2, 1), 50 * 1.8 * 1.25 * 1.6 * 1.6);
  cerca(dificultad(isla, 4.5, 0, 1), 50 * Math.sqrt(1.8));
  cerca(dificultadMisterio(1), 60);
  cerca(dificultadMisterio(21), 60 * Math.pow(1.045, 20));
});

test('expSig: valores de ejemplo de §5', () => {
  assert.equal(expSig(1), 21);
  assert.equal(expSig(5), 184);
  assert.equal(expSig(10), 529);
  assert.equal(expSig(20), 1618);
  assert.equal(expSig(50), 7610); // la spec dice 7.608 por redondeo; manda la fórmula
  assert.equal(topeNivel(0), 20);
  assert.equal(topeNivel(3), 50);
  assert.equal(topeNivel(8), 100);
});

test('costes de edificios, Huerto y producción offline (§7)', () => {
  assert.equal(costeEdificio('huerto', 0), 80);
  // Los costes salen de K.EDIFICIOS (los fija el simulador; §7.1 da la forma base × g^n).
  const E = K.EDIFICIOS;
  assert.equal(costeEdificio('huerto', 1), Math.round(E.huerto.base * E.huerto.g));
  assert.equal(costeEdificio('huerto', 25), null);
  assert.equal(costeEdificio('despensa', 0), 300);
  assert.equal(costeEdificio('despensa', 16), null);
  assert.equal(costeEdificio('muelle', 0), E.muelle.costes[0]);
  assert.equal(costeEdificio('muelle', 1), E.muelle.costes[1]);
  assert.equal(costeEdificio('muelle', 2), E.muelle.costes[2]);
  assert.equal(costeEdificio('muelle', 3), null);
  assert.equal(costeEdificio('linterna', 0), E.linterna.base);
  assert.equal(costeEdificio('linterna', 30), null);
  assert.equal(costeEdificio('taberna', 0), E.taberna.base);
  assert.equal(costeEdificio('taberna', 15), null);
  assert.equal(costeEdificio('nada', 0), null);
  cerca(tasaHuerto(1, 0), K.HUERTO_BASE);
  cerca(tasaHuerto(2, 1), K.HUERTO_BASE * 2 * K.HUERTO_G);
  assert.equal(topeOfflineHoras(0), 8);
  assert.equal(topeOfflineHoras(16), 24);
  assert.equal(segundosEfectivos(3600), 3600);
  assert.equal(segundosEfectivos(7200 + 4000), 7200 + 3000);
  assert.equal(segundosEfectivos(-5), 0);
});

test('tramos de F = 8, 12, 16, 50 y recorte con «hasta»', () => {
  const t8 = tramos(8);
  assert.equal(t8.length, 8);
  assert.deepEqual(t8[0], { desde: 1, hasta: 1, jefe: false });
  assert.deepEqual(t8[7], { desde: 8, hasta: 8, jefe: true });
  const t12 = tramos(12);
  assert.deepEqual(t12.map((t) => [t.desde, t.hasta]), [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 11], [12, 12]]);
  assert.equal(tramos(16).length, 9);
  const t50 = tramos(50);
  assert.equal(t50.length, 11);
  assert.deepEqual(t50[9], { desde: 46, hasta: 49, jefe: false });
  assert.ok(t50[10].jefe);
  const h = tramosHasta(50, 23);
  assert.deepEqual(h[h.length - 1], { desde: 21, hasta: 23, jefe: false });
  assert.ok(h.every((t) => !t.jefe));
  assert.equal(tramosHasta(50, 50).length, 11);
  for (const F of [8, 12, 16, 20, 25, 30, 40, 50]) {
    const ts = tramos(F);
    assert.equal(ts[ts.length - 1].hasta, F);
    for (let i = 1; i < ts.length; i++) assert.equal(ts[i].desde, ts[i - 1].hasta + 1);
  }
});

test('probPiso: clamp y pMin', () => {
  cerca(probPiso(100, 100), 0.5);
  assert.equal(probPiso(1000, 10), 0.99);
  assert.equal(probPiso(1, 1000), 0.05);
  assert.equal(probPiso(1, 1000, 0.15), 0.15);
  assert.equal(probPiso(0, 10), 0.05);
});

test('calibración 1: equipo inicial P ≈ 138 en la isla 1', () => {
  const isla = { id: 1, F: 8 };
  const p1 = probPiso(138, dificultad(isla, 1, 0, 1));
  const pj = probPiso(138, dificultad(isla, 8, 0, 1));
  assert.ok(p1 >= 0.98, `piso 1: ${p1}`);
  assert.ok(Math.abs(pj - 0.68) < 0.01, `jefe: ${pj}`);
});

test('calibración 2: equipo de referencia con nvOri, 1★, cariño 30, Linterna 3m → p(jefe) ∈ [0,35; 0,65]', () => {
  for (let m = 1; m <= 8; m++) {
    const isla = datos.islaPorId[m];
    const poder = poderMon({ nv: nvOri(m), est: 1, car: 30 }, { tot: K.TOT_REF[m - 1] });
    // Tres tipos distintos y neutros contra una isla sin tipos (sin bono de monotipo).
    const snapshot = { miembros: ['normal', 'fuego', 'agua'].map((t) => ({ poder, tipos: [t] })), roles: ['lider', 'expl', 'reco'], linterna: 3 * m };
    const { P } = poderEquipo(snapshot, { id: m, tipos: [] }, { datos });
    const pj = probPiso(P, dificultad(isla, isla.F, 0, 1));
    assert.ok(pj >= 0.35 && pj <= 0.65, `isla ${m}: p(jefe) = ${pj.toFixed(3)}`);
  }
});

test('poderMon: tot/10 × nivel × estrellas × cariño', () => {
  cerca(poderMon({ nv: 1, est: 0, car: 0 }, { tot: 300 }), 30);
  cerca(poderMon({ nv: 11, est: 2, car: 100 }, { tot: 300 }), 30 * 2 * 1.4 * 1.3);
});

test('multTipo: ofensa suavizada y defensa media', () => {
  assert.equal(multTipo(['fuego'], ['planta'], ef).ofensa, 1.3);
  assert.equal(multTipo(['agua'], ['fuego'], ef).defensa, 1.1);
  assert.equal(multTipo(['planta', 'veneno'], ['fuego'], ef).defensa, 0.85);
  assert.equal(multTipo(['normal'], ['fantasma'], ef).ofensa, 0.6);
  assert.equal(multTipo(['normal'], ['roca'], ef).ofensa, 0.8);
  assert.equal(multTipo(['normal'], ['normal'], ef).mult, 1);
  // Mejor factor entre todos los pares: eléctrico contra agua/volador.
  assert.equal(multTipo(['electrico'], ['agua', 'volador'], ef).ofensa, 1.3);
  const m = multTipo(['fuego'], ['agua'], ef);
  cerca(m.mult, m.ofensa * m.defensa);
});

test('clima: efectos por tipo (mayor bonus × menor malus) y lectura del ctx', () => {
  const calor = climaDe({ clima: { 1: 'calor' } }, 1);
  cerca(climaTipo(calor, ['fuego']), 1.2);
  cerca(climaTipo(calor, ['fuego', 'hielo']), 1.08);
  cerca(climaTipo(calor, ['planta', 'hielo']), 0.9);
  assert.equal(climaTipo(calor, ['agua']), 1);
  assert.equal(climaDe({ clima: 'tormenta' }, 3).climaT, 1.1);
  assert.equal(climaDe({ clima: (i) => (i === 2 ? 'luna' : 'despejado') }, 2).raros, 1.5);
  assert.equal(climaDe({}, 1).climaT, 1);
  assert.deepEqual(K.CLIMAS, ['despejado', 'niebla', 'calor', 'tormenta', 'luna']);
});

test('poderEquipo: líder ×1,2, Linterna, monotipo y niebla sin Explorador', () => {
  const m = (t) => ({ poder: 100, tipos: [t] });
  const snap = { miembros: [m('normal'), m('fuego'), m('agua')], roles: ['lider', 'reco', 'apoyo'], linterna: 10 };
  const a = poderEquipo(snap, { id: 1, tipos: [] }, { datos });
  cerca(a.P, (120 + 100 + 100) * 1.3);
  assert.equal(a.composicion.triple, true);
  const mono = { ...snap, miembros: [m('agua'), m('agua'), m('agua')] };
  const b = poderEquipo(mono, { id: 1, tipos: [] }, { datos });
  cerca(b.P, 320 * 1.3 * 1.1);
  assert.equal(b.composicion.mono, true);
  const c = poderEquipo(snap, { id: 1, tipos: [] }, { datos, clima: 'niebla' });
  cerca(c.P, a.P * 0.9);
  const d = poderEquipo({ ...snap, roles: ['lider', 'expl', 'apoyo'] }, { id: 1, tipos: [] }, { datos, clima: 'niebla' });
  cerca(d.P, a.P);
  assert.deepEqual(composicion([{ tipos: ['a'] }]), { mono: false, triple: false });
});

test('duración: vel, Taberna, clima y audaz', () => {
  const isla = { tBase: 30 };
  assert.equal(tPiso(isla, 1, 0, 1, 'equilibrada'), 30000);
  cerca(tPiso(isla, 1, 0, 1, 'audaz'), 27000);
  cerca(tPiso(isla, 1, 15, 1, 'prudente'), 21000);
  cerca(tPiso(isla, 2, 0, 1.1, 'equilibrada'), 16500);
  const snap = { miembros: [{ vel: 100 }, { vel: 50 }, { vel: 50 }] };
  cerca(velEquipo(snap, ['lider', 'reco', 'reco']), 1 + 0.003 * 200 / 3);
  cerca(velEquipo(snap, ['lider', 'expl', 'reco']), 1 + 0.003 * 250 / 4);
  cerca(velEquipo(snap, ['lider', 'expl', 'reco'], 3), 1 + 0.003 * 300 / 5);
});

test('botín por piso (§4.6)', () => {
  const b = botinPiso(1, 1);
  cerca(b.monedas, K.MON_BASE * 1.1);
  cerca(b.exp, K.EXP_BASE * 1.05);
  cerca(b.pObjeto, 0.21);
  const j = botinPiso(1, 8, { jefe: true });
  cerca(j.monedas, K.MON_BASE * 1.8 * 4);
  cerca(j.exp, K.EXP_BASE * 1.4 * 3);
  const r = botinPiso(3, 10, { dominio: 1, nocturna: true, postura: 'audaz', nReco: 2, triple: true });
  cerca(r.monedas, K.MON_BASE * K.MON_G ** 2 * 2 * 1.5 * 1.2 * 1.3 * 1.1);
  cerca(r.pObjeto, Math.min(1, 0.3 * 1.25 * 1.25 * 1.3));
  cerca(botinPiso(1, 1, { postura: 'prudente' }).monedas, K.MON_BASE * 1.1 * 0.85);
  assert.equal(mMisterio(19), 3);
  assert.equal(mMisterio(40), 5);
});

test('salvajes, nivel orientativo y aceptación', () => {
  assert.equal(nivelSalvaje(1, 7), 6);
  assert.equal(nivelSalvaje(8, 50), K.NV_SALV_BASE + 7 * K.NV_SALV_M + 15);
  assert.equal(nivelSalvaje('misterio', 10), 10);
  assert.equal(nvOri(1), 5);
  assert.equal(nvOri(8), 61);
  cerca(pAcepta(10, 10, 0), 0.4);
  cerca(pAcepta(10, 10, 2), 0.9);
  assert.equal(pAcepta(1, 60, 0), 0.1);
  cerca(pAcepta(20, 10, 1), 0.9);
  cerca(pAcepta(15, 10, 1), 0.8);
});
