// Pruebas de regresión de los arreglos de la revisión del 18-nov-2026 (cala llena, piedad, Misterio, caramelos,
// hitos de la Bitácora y guardado). Lógica pura: sin DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/core/game.js';
import * as bus from '../js/core/bus.js';
import * as sim from '../js/core/sim.js';
import * as ev from '../js/core/events.js';
import {
  crearAlmacen, cargar, guardar, memoriaStorage, nuevoGuardado, reanclarReloj,
  CLAVE, CLAVE_ROTO, MAX_POKEMON,
} from '../js/core/state.js';
import { K, tramoMisterio } from '../js/core/formulas.js';
import { mulberry32 } from '../js/core/rng.js';
import { datosMini } from './fixtures/datos-mini.mjs';

const datos = datosMini();
const H = 3600_000, D = 24 * H;
const T0 = new Date(2026, 10, 17, 11, 0, 0).getTime();   // martes, de día
const ctxEn = (t, extra) => game.crearCtx(datos, t, extra);

function partida(t = T0) {
  const { save, fin } = game.iniciarPartida({ guia: '0004', faro: 'norte', nombre: 'Ana' }, ctxEn(t));
  game.recogerTodo(save, ctxEn(fin));
  return { save, t: fin };
}

/** Expedición falsa ya terminada con los encuentros dados (para probar la recogida sin depender del azar). */
function expFalsa(save, idx, encuentros, t, isla = 1) {
  const g = save.pokemon[0];
  save.equipos[idx].exp = {
    plan: { equipo: [g.id], roles: ['lider'], isla, modo: 'vuelta', hasta: 3, postura: 'equilibrada' },
    inicio: t - H, fin: t, semilla: 1, snapshot: { P: 10 },
    registro: { inicio: t - H, fin: t, motivo: 'objetivo', totales: { monedas: 0, exp: 0, objetos: {} },
      rondas: [{ t0: t - H, t1: t, pisoFin: 3, jefe: false, encuentros, eventos: [], fallos: [] }] },
  };
}

// ---------------------------------------------------------------------------- Mazmorra Misterio

test('Misterio: el último tramo se recorta al piso 99 y nunca se juega el 100', () => {
  assert.deepEqual(tramoMisterio(19), { desde: 96, hasta: 99, jefe: false });
  assert.equal(tramoMisterio(20).desde, 101);
  const { save, t } = partida();
  save.islas['3'] = { ...save.islas['1'], jefe: true };
  for (const m of save.pokemon) { m.nv = K.TOPE_MAX; m.est = 5; m.car = 100; }
  const r = game.enviar(save, 0, { equipo: save.pokemon.map((m) => m.id), roles: ['lider', 'apoyo'], isla: 'misterio', horas: 8 }, ctxEn(t));
  const reg = save.equipos[0].exp.registro;
  for (const ro of reg.rondas) assert.ok(ro.pisoFin <= 99, `pisoFin ${ro.pisoFin}`);
  assert.ok(sim.estadoEn(reg, r.fin - 1).piso <= 99);
  game.recogerTodo(save, ctxEn(r.fin));
  assert.ok(save.misterio.record <= 99);
});

test('Misterio: el récord cuenta para la semana del envío, no para la de la recogida', () => {
  const { save } = partida();
  save.islas['3'] = { ...save.islas['1'], jefe: true };
  const domingo = new Date(2026, 10, 22, 22, 0, 0).getTime();
  const wkEnvio = ev.semanaDe(domingo);
  const r = game.enviar(save, 0, { equipo: [save.pokemon[0].id], isla: 'misterio', horas: 8 }, ctxEn(domingo));
  const lunes = Math.max(r.fin, domingo + 10 * H);
  assert.notEqual(ev.semanaDe(lunes), wkEnvio, 'la recogida cae en la semana siguiente');
  game.recogerTodo(save, ctxEn(lunes));
  assert.equal(save.misterio.wk, wkEnvio);
  // Una partida de una semana ya pasada no pisa el récord de la semana nueva.
  save.misterio = { wk: ev.semanaDe(lunes), record: 7 };
  const r2 = game.enviar(save, 0, { equipo: [save.pokemon[0].id], isla: 'misterio', horas: 1 }, ctxEn(domingo - 2 * H));
  game.recogerTodo(save, ctxEn(r2.fin + 3 * D));
  assert.deepEqual(save.misterio, { wk: ev.semanaDe(lunes), record: 7 });
});

// ---------------------------------------------------------------------------- Caramelos

test('caramelo: no se gasta si no haría nada (cariño al máximo o al tope de nivel)', () => {
  const { save, t } = partida();
  const m = save.pokemon[1];
  save.caramelos[m.sp] = 2;
  m.car = K.CARINO_MAX;
  assert.equal(game.efectoCaramelo(save, m, 'carino'), false);
  assert.throws(() => game.usarCaramelo(save, m.id, 'carino', ctxEn(t)), /cariño/);
  assert.equal(save.caramelos[m.sp], 2);
  m.nv = game.tope(save);
  m.xp = 0;
  assert.equal(game.efectoCaramelo(save, m, 'bayas'), false);
  assert.throws(() => game.usarCaramelo(save, m.id, 'bayas', ctxEn(t)), /tope/);
  assert.equal(save.caramelos[m.sp], 2);
  m.nv = 2;
  assert.equal(game.efectoCaramelo(save, m, 'bayas'), true);
  game.usarCaramelo(save, m.id, 'bayas', ctxEn(t));
  assert.equal(save.caramelos[m.sp], 1);
});

// ---------------------------------------------------------------------------- Cala llena

test('cala llena: el variocolor no se pierde ni dice «se une»; queda pendiente de Liberar a otro / Dejarlo ir', () => {
  const { save, t } = partida();
  while (save.pokemon.length < MAX_POKEMON) save.pokemon.push({ ...save.pokemon[1], id: 'm_x' + save.pokemon.length, dia: [] });
  const cadenas = { ...save.cadenas };
  const enc = { f: 3, sp: '0016', nv: 3, acepta: true, vr: true, rar: 'C', de: 'prado:3' };
  expFalsa(save, 0, [enc], t);
  const inf = game.recogerTodo(save, ctxEn(t));
  assert.equal(save.pokemon.length, MAX_POKEMON);
  assert.ok(!inf.momentos.some((m) => m.tipo === 'variocolor' || m.tipo === 'recluta'), 'sin momento de «se une»');
  assert.equal(inf.equipos[0].reclutas[0].tipo, 'lleno');
  assert.deepEqual(save.cadenas, cadenas, 'la cadena no suma si no entra');
  assert.equal(game.pendientesLleno(save).length, 1);
  assert.equal(game.pendientesLleno(save)[0].vr, true);
  assert.throws(() => game.admitirPendiente(save, 0, ctxEn(t)), /llena/);
  // «Liberar a otro» (desde la ficha) y entra con su momento.
  const momentos = [];
  const off = bus.on('momento', (m) => momentos.push(m));
  try {
    game.liberar(save, save.pokemon.at(-1).id);
    const res = game.admitirPendiente(save, 0, ctxEn(t));
    assert.equal(save.pokemon.length, MAX_POKEMON);
    assert.ok(game.buscarMon(save, res.uid).vr);
    assert.equal(game.pendientesLleno(save).length, 0);
    assert.ok(momentos.some((m) => m.tipo === 'variocolor' && m.uid === res.uid));
  } finally { if (typeof off === 'function') off(); }
  // «Dejarlo ir».
  expFalsa(save, 0, [{ ...enc, vr: false, sp: '0019' }], t + H);
  game.recogerTodo(save, ctxEn(t + H));
  assert.equal(game.pendientesLleno(save).length, 1);
  assert.equal(game.descartarPendiente(save, 0), true);
  assert.equal(game.pendientesLleno(save).length, 0);
});

test('cala llena: la lista de pendientes tiene tope pero nunca tira un variocolor', () => {
  const { save, t } = partida();
  while (save.pokemon.length < MAX_POKEMON) save.pokemon.push({ ...save.pokemon[1], id: 'm_x' + save.pokemon.length, dia: [] });
  const encs = [{ f: 1, sp: '0016', nv: 3, acepta: true, vr: true, rar: 'C' }];
  for (let i = 0; i < 15; i++) encs.push({ f: 2, sp: '0019', nv: 3, acepta: true, vr: false, rar: 'C' });
  save.pokemon = save.pokemon.filter((m) => m.sp !== '0019');
  while (save.pokemon.length < MAX_POKEMON) save.pokemon.push({ ...save.pokemon[1], id: 'm_y' + save.pokemon.length, dia: [] });
  expFalsa(save, 0, encs, t);
  game.recogerTodo(save, ctxEn(t));
  const l = game.pendientesLleno(save);
  assert.ok(l.length <= 10);
  assert.equal(l.filter((p) => p.vr).length, 1);
});

// ---------------------------------------------------------------------------- Piedad con varios equipos

test('piedad: dos equipos a la misma isla no duplican el raro garantizado ni la dejan ir hacia atrás', () => {
  const { save, t } = partida();
  save.base.muelle = 1;
  save.equipos.push({ miembros: [], roles: [], ultimoPlan: null, exp: null });
  save.islas['1'].piedad = K.PIEDAD - 1;
  const [a, b] = save.pokemon;
  game.enviar(save, 0, { equipo: [a.id], isla: 1, modo: 'patrulla', horas: 4 }, ctxEn(t));
  game.enviar(save, 1, { equipo: [b.id], isla: 1, modo: 'patrulla', horas: 4 }, ctxEn(t + 1000));
  const xa = save.equipos[0].exp, xb = save.equipos[1].exp;
  assert.equal(xa.snapshot.piedad, K.PIEDAD - 1);
  // El segundo parte de lo que dejará el primero, no de la misma piedad 39.
  assert.equal(xb.snapshot.piedad, xa.registro.estadoRecluta.piedad);
  assert.deepEqual(xb.snapshot.huellas, xa.registro.estadoRecluta.huellas);
  const raros = (x) => x.registro.rondas.flatMap((r) => r.encuentros).filter((e) => e.rar === 'R' || e.rar === 'L').length;
  const encA = xa.registro.rondas.flatMap((r) => r.encuentros).length;
  if (encA > 0) assert.ok(raros(xa) >= 1, 'el primero se lleva el garantizado');
  game.recogerTodo(save, ctxEn(Math.max(xa.fin, xb.fin)));
  // Recogidos en orden, la isla queda con el estado de la cadena completa.
  assert.equal(save.islas['1'].piedad, xb.registro.estadoRecluta.piedad);
  assert.deepEqual(save.islas['1'].huellas, xb.registro.estadoRecluta.huellas);
});

// ---------------------------------------------------------------------------- Hitos de la Bitácora

test('Bitácora: al llegar al 50 % se da 1 Cordón Amistad, una sola vez', () => {
  const { save, t } = partida();
  const todas = Object.keys(datos.especies);
  const antes = save.objetos.cordon_amistad | 0;
  for (const sp of todas.slice(0, Math.ceil(todas.length / 2))) save.bitacora.tenido[sp] = t;
  const momentos = [];
  const off = bus.on('momento', (m) => momentos.push(m));
  try {
    game.tick(save, ctxEn(t));
    game.tick(save, ctxEn(t + 1000));
  } finally { if (typeof off === 'function') off(); }
  assert.equal(save.objetos.cordon_amistad, antes + 1);
  assert.ok(save.hitos.cordon50);
  assert.equal(momentos.filter((m) => m.tipo === 'hito').length, 1);
});

// ---------------------------------------------------------------------------- Reloj adelantado

test('reloj adelantado al enviar: al corregir la hora el equipo no queda bloqueado', () => {
  const { save, t } = partida();
  const futuro = t + 30 * D;
  const r = game.enviar(save, 0, { equipo: [save.pokemon[0].id], isla: 1 }, ctxEn(futuro));
  const dur = r.fin - futuro;
  save.visitante = { sp: '0016', llega: futuro, vence: futuro + 12 * H, pc: 1 };
  game.tick(save, ctxEn(t));
  const x = save.equipos[0].exp;
  assert.equal(x.inicio, t);
  assert.equal(x.fin, t + dur);
  assert.equal(x.registro.inicio, t);
  assert.equal(x.registro.fin, t + dur);
  assert.ok(save.visitante.vence <= t + K.VISITA_H * H);
  assert.ok(save.diasJugados.every((d) => d <= ev.diaLocal(t)));
  assert.equal(game.equiposDeVuelta(save, ctxEn(t + dur)).length, 1);
  // Sin cambios si no hay nada en el futuro.
  assert.equal(reanclarReloj(save, t + dur), false);
});

// ---------------------------------------------------------------------------- Guardado

test('guardado: una partida que no se puede convertir no se trata como «no hay partida»', async () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(7) });
  for (const raro of [{ ...s, saveVersion: 2 }, { ...s, pokemon: [null] }]) {
    const ls = memoriaStorage();
    const texto = JSON.stringify(raro);
    ls.setItem(CLAVE, texto);
    const a = crearAlmacen({ localStorage: ls });
    assert.equal(await cargar(a), null);
    assert.ok(a.roto, 'se marca como rota');
    assert.ok(a.roto.error.length > 0);
    assert.equal(ls.getItem(CLAVE_ROTO), texto, 'el texto en bruto queda a salvo');
  }
  // Sin texto: null y sin «roto».
  const vacio = crearAlmacen({});
  assert.equal(await cargar(vacio), null);
  assert.equal(vacio.roto, null);
});

test('guardado: dos pestañas — la que tiene el estado viejo no pisa lo que guardó la otra', async () => {
  const ls = memoriaStorage();
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(8) });
  ls.setItem(CLAVE, JSON.stringify(s));
  const a = crearAlmacen({ localStorage: ls });
  const b = crearAlmacen({ localStorage: ls });
  const sa = await cargar(a);
  const sb = await cargar(b);
  sa.monedas = 500;
  assert.equal(guardar(a, sa, { inmediato: true }).conflicto, undefined);
  sb.monedas = 1;
  const r = guardar(b, sb, { inmediato: true });
  assert.equal(r.conflicto, true);
  assert.equal(b.bloqueado, true);
  assert.equal(JSON.parse(ls.getItem(CLAVE)).monedas, 500);
  // La pestaña buena sigue guardando.
  sa.monedas = 600;
  guardar(a, sa, { inmediato: true });
  assert.equal(JSON.parse(ls.getItem(CLAVE)).monedas, 600);
});

test('guardado: sin almacenamiento persistente, guardar devuelve error (para avisar)', () => {
  const a = crearAlmacen({ sinLocalStorage: true });
  assert.equal(a.volatil, true);
  const r = guardar(a, nuevoGuardado({ ahora: T0, rng: mulberry32(9) }), { inmediato: true });
  assert.ok(r.error);
  assert.equal(r.volatil, true);
});

test('guardado: si IndexedDB no responde, se carga desde localStorage sin colgarse', async () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(10) });
  const ls = memoriaStorage();
  ls.setItem(CLAVE, JSON.stringify(s));
  const colgado = { open: () => ({}) };   // nunca dispara onsuccess ni onerror
  const a = crearAlmacen({ localStorage: ls, indexedDB: colgado, setTimeout: (fn) => setTimeout(fn, 5), clearTimeout });
  const c = await cargar(a);
  assert.equal(c.idDispositivo, s.idDispositivo);
});
