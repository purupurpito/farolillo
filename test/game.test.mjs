import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/core/game.js';
import * as bus from '../js/core/bus.js';
import { crearAlmacen, guardar, cargar, exportar, importar } from '../js/core/state.js';
import { expSig, topeNivel, tasaHuerto, K } from '../js/core/formulas.js';
import { datosMini } from './fixtures/datos-mini.mjs';

const datos = datosMini();
const MIN = 60_000, H = 3600_000;
// Martes 17-nov-2026 a las 11:00 locales (de día: sin marea ni patrulla nocturna).
const T0 = new Date(2026, 10, 17, 11, 0, 0).getTime();
const ctxEn = (t, extra) => game.crearCtx(datos, t, extra);

function partida(t = T0) {
  return game.iniciarPartida({ guia: '0004', faro: 'norte', nombre: 'Ana' }, ctxEn(t));
}

test('crearCtx: semana, clima de las 8 islas y la Misterio', () => {
  const c = ctxEn(T0);
  assert.equal(c.semana, 202647);
  for (let i = 1; i <= 8; i++) assert.ok(['despejado', 'niebla', 'calor', 'tormenta', 'luna'].includes(c.clima[i]));
  assert.ok(c.clima.misterio);
  assert.equal(c.tiposMisterio.length, 2);
  assert.notEqual(c.tiposMisterio[0], c.tiposMisterio[1]);
  assert.equal(c.evento, null);
  assert.equal(c.noche, false);
});

test('primer arranque: el tutorial sale solo, dura 1 min y trae un recluta garantizado', () => {
  const { save, fin } = partida();
  assert.equal(fin - T0, 3 * 20_000);
  assert.equal(save.tutorial.paso, 1);
  assert.equal(save.tutorial.enviadas, 0, 'el tutorial no cuenta para el guion');
  assert.equal(game.estadoEquipo(save, 0, ctxEn(T0 + 30_000)).estado, 'fuera');
  assert.equal(game.metaSiguiente(save, ctxEn(T0)).destino.pantalla, 'cala');
  const t1 = ctxEn(fin);
  assert.equal(game.avisos(save, t1)[0].tipo, 'vuelta');
  assert.equal(game.tick(save, t1).titulo, '(1) ¡Equipo de vuelta!');
  const inf = game.recogerTodo(save, t1);
  assert.equal(inf.equipos.length, 1);
  const e = inf.equipos[0];
  assert.equal(e.reclutas.filter((r) => r.acepta).length, 1);
  assert.equal(save.pokemon.length, 2);
  const rec = save.pokemon[1];
  assert.equal(rec.nv, 4);
  assert.equal(rec.de, 'tutorial');
  assert.equal(datos.especies[rec.sp].rar, 'C');
  assert.ok(inf.momentos.some((m) => m.tipo === 'recluta' && m.sp === rec.sp));
  assert.equal(save.tutorial.paso, 2);
  assert.ok(save.monedas > 0);
  assert.equal(save.pokemon[0].car, 31);
  assert.equal(save.stats.exps, 1);
  assert.equal(save.diarioExp.length, 1);
  assert.equal(game.metaSiguiente(save, t1).texto, 'Meta: Jefe de Prado Brote (p.8)');
  // El último plan del tutorial queda como una vuelta completa a la isla 1
  assert.equal(save.equipos[0].ultimoPlan.hasta, 8);
  assert.equal(save.equipos[0].ultimoPlan.tutorial, undefined);
});

test('flujo completo: tutorial -> recoger -> enviar 3 -> avanzar 4 h -> recoger todo', () => {
  const { save, fin } = partida();
  let t = fin;
  game.recogerTodo(save, ctxEn(t));
  // 1.ª: repetir con el guía y el recluta
  const plan = { equipo: save.pokemon.map((m) => m.id), roles: ['lider', 'reco'], isla: 1, modo: 'vuelta', postura: 'equilibrada' };
  const r1 = game.enviar(save, 0, plan, ctxEn(t));
  assert.ok(r1.fin > t);
  assert.equal(save.tutorial.enviadas, 1);
  assert.throws(() => game.enviar(save, 0, plan, ctxEn(t)), /ya está de expedición/);
  t = r1.fin;
  game.recogerTodo(save, ctxEn(t));
  // Muelle 1 -> 2 equipos
  save.monedas += K.EDIFICIOS.muelle.costes[0];
  assert.equal(game.mejorar(save, 'muelle', ctxEn(t)), true);
  assert.equal(save.equipos.length, 2);
  // 2.ª y 3.ª: enviar a todos (repite el equipo 0; el 1 usa la sugerencia con quien quede libre)
  const enviados = game.enviarTodos(save, ctxEn(t));
  assert.ok(enviados >= 1);
  assert.ok(save.equipos[0].exp);
  assert.equal(game.enviarTodos(save, ctxEn(t)), 0, 'nadie libre ni equipos libres');
  const exps = save.stats.exps;
  const monedas = save.monedas;
  t += 4 * H;
  const inf = game.recogerTodo(save, ctxEn(t));
  assert.equal(inf.equipos.length, enviados);
  assert.equal(save.stats.exps, exps + enviados);
  assert.ok(save.monedas > monedas);
  assert.ok(save.equipos.every((e) => !e.exp));
  assert.equal(game.equiposDeVuelta(save, ctxEn(t)).length, 0);
  // Huerto a nivel 0: sin bayas
  assert.equal(inf.cala.bayas, 0);
});

test('determinismo: misma partida y mismos tiempos -> mismo guardado', () => {
  const a = partida().save, b = partida().save;
  for (const s of [a, b]) {
    let t = T0 + MIN;
    game.recogerTodo(s, ctxEn(t));
    game.repetir(s, 0, ctxEn(t));
    t += 2 * H;
    game.recogerTodo(s, ctxEn(t));
  }
  assert.deepEqual(a, b);
});

test('se envía, se cierra la pestaña, se vuelve y el informe cuadra', async () => {
  const { save, fin } = partida();
  game.recogerTodo(save, ctxEn(fin));
  const r = game.repetir(save, 0, ctxEn(fin));
  assert.ok(r);
  const alm = crearAlmacen({});
  guardar(alm, save, { inmediato: true });
  const vuelta = await cargar(alm);
  const copia = importar(exportar(save));
  const t = r.fin + 5 * H;
  const i1 = game.recogerTodo(save, ctxEn(t));
  const i2 = game.recogerTodo(vuelta, ctxEn(t));
  const i3 = game.recogerTodo(copia, ctxEn(t));
  assert.deepEqual(i2, i1);
  assert.deepEqual(i3, i1);
  assert.deepEqual(vuelta, save);
});

test('reloj hacia atrás: no rompe ni da producción negativa', () => {
  const { save } = partida();
  save.base.huerto = 3;
  const t = T0 - 3 * H;
  const r = game.tick(save, ctxEn(t));
  assert.equal(r.huerto, 0);
  assert.equal(save.base.ultimaRecogida, t);
  const inf = game.recogerTodo(save, ctxEn(t));
  assert.equal(inf.cala.bayas, 0);
  assert.equal(inf.equipos.length, 0, 'el tutorial aún no ha vuelto');
});

test('bayas: 1 baya = 1 EXP, hasta el siguiente nivel, y nunca por encima del tope', () => {
  const { save } = partida();
  const g = save.pokemon[0];
  save.bayas = 100000;
  const nec = expSig(g.nv) - g.xp;
  const r = game.darBayas(save, g.id, 'siguiente', ctxEn(T0));
  assert.equal(r.gastadas, nec);
  assert.equal(r.nv, 6);
  assert.equal(r.xp, 0);
  const r2 = game.darBayas(save, g.id, 100000, ctxEn(T0));
  assert.equal(r2.nv, topeNivel(0));
  assert.equal(r2.alTope, true);
  const antes = save.bayas;
  assert.equal(game.darBayas(save, g.id, 100, ctxEn(T0)).gastadas, 0, 'al tope no gasta');
  assert.equal(save.bayas, antes);
});

test('igualar reparte entre los de menor nivel', () => {
  const { save, fin } = partida();
  game.recogerTodo(save, ctxEn(fin));
  save.bayas = 500;
  const bajo = save.pokemon.find((m) => m.nv === 4);
  const r = game.igualar(save, ctxEn(fin));
  assert.ok(r.subidos >= 1);
  assert.ok(bajo.nv >= 5);
  assert.ok(save.bayas < 500);
});

test('mejorar: falla sin monedas y el huerto produce', () => {
  const { save } = partida();
  assert.equal(game.mejorar(save, 'huerto', ctxEn(T0)), false);
  save.monedas = 1000;
  assert.equal(game.mejorar(save, 'huerto', ctxEn(T0)), true);
  assert.equal(save.base.huerto, 1);
  assert.equal(save.monedas, 920);
  assert.equal(game.mejorar(save, 'castillo', ctxEn(T0)), false);
  const inf = game.recogerTodo(save, ctxEn(T0 + 2 * H));
  assert.equal(inf.cala.bayas, Math.floor(tasaHuerto(1, 0) * 2));
});

test('tocar vecino: +1 cariño una vez al día', () => {
  const { save } = partida();
  const g = save.pokemon[0];
  const r1 = game.tocarVecino(save, g.id, ctxEn(T0));
  assert.equal(r1.subio, true);
  assert.equal(r1.cariño, 31);
  assert.equal(typeof r1.frase, 'string');
  assert.equal(game.tocarVecino(save, g.id, ctxEn(T0 + H)).subio, false);
  assert.equal(game.tocarVecino(save, g.id, ctxEn(T0 + 24 * H)).subio, true);
  assert.equal(g.car, 32);
});

test('evolución por nivel, momento por el bus y aviso', () => {
  const { save, fin } = partida();
  game.recogerTodo(save, ctxEn(fin));
  const g = save.pokemon[0];
  assert.throws(() => game.evolucionar(save, g.id, '0005', ctxEn(fin)), /Nivel 16/);
  save.bayas = 100000;
  game.darBayas(save, g.id, 100000, ctxEn(fin));
  assert.ok(g.nv >= 16);
  assert.ok(game.avisos(save, ctxEn(fin)).some((a) => a.tipo === 'evolucion'));
  const momentos = [];
  const quitar = bus.on('momento', (m) => momentos.push(m));
  const mon = game.evolucionar(save, g.id, '0005', ctxEn(fin));
  quitar();
  assert.equal(mon.sp, '0005');
  assert.equal(mon.id, g.id);
  assert.equal(momentos[0].tipo, 'evolucion');
  assert.equal(momentos[0].spAntes, '0004');
  assert.ok(save.bitacora.tenido['0005']);
  assert.ok(mon.dia.some((d) => d[1] === 'evo'));
});

test('objetos: baya grande da cariño y una piedra evoluciona gastándose', () => {
  const { save, fin } = partida();
  game.recogerTodo(save, ctxEn(fin));
  const g = save.pokemon[0];
  save.objetos.baya_grande = 0;
  assert.throws(() => game.usarObjeto(save, g.id, 'baya_grande', ctxEn(fin)), /No te quedan/);
  save.objetos.baya_grande = 1;
  const r = game.usarObjeto(save, g.id, 'baya_grande', ctxEn(fin));
  assert.equal(r.efecto, 'carino');
  assert.equal(g.car, 34);
  assert.equal(save.objetos.baya_grande, 0);
  // Gloom + piedra hoja
  save.pokemon.push({ ...save.pokemon[1], id: 'm_gloom1', sp: '0044' });
  save.objetos.piedra_hoja = 1;
  const r2 = game.usarObjeto(save, 'm_gloom1', 'piedra_hoja', ctxEn(fin));
  assert.equal(r2.mon.sp, '0045');
  assert.equal(save.objetos.piedra_hoja, 0);
  assert.throws(() => game.usarObjeto(save, g.id, 'piedra_hoja', ctxEn(fin)), /No te quedan/);
});

test('liberar: el guía no se va; un recluta sí y sale de los equipos', () => {
  const { save, fin } = partida();
  game.recogerTodo(save, ctxEn(fin));
  const [g, rec] = save.pokemon;
  assert.throws(() => game.liberar(save, g.id), /farero/);
  save.equipos[0].miembros = [g.id, rec.id];
  save.equipos[0].roles = ['lider', 'expl'];
  assert.equal(game.liberar(save, rec.id), true);
  assert.equal(save.pokemon.length, 1);
  assert.deepEqual(save.equipos[0].miembros, [g.id]);
});

test('validación de planes en castellano', () => {
  const { save, fin } = partida();
  const c = ctxEn(fin);
  game.recogerTodo(save, c);
  const g = save.pokemon[0];
  assert.throws(() => game.enviar(save, 1, { equipo: [g.id], isla: 1 }, c), /Muelle/);
  assert.throws(() => game.enviar(save, 0, { equipo: [g.id], isla: 2 }, c), /cerrada/);
  assert.throws(() => game.enviar(save, 0, { equipo: [g.id], isla: 'misterio' }, c), /cerrada/);
  assert.throws(() => game.enviar(save, 0, { equipo: [], isla: 1 }, c), /Líder/);
  assert.throws(() => game.enviar(save, 0, { equipo: ['m_nadie'], isla: 1 }, c), /ya no está/);
  // plan normalizado: roles por defecto, hasta acotado, misterio siempre patrulla
  const p = game.normalizarPlan(save, { equipo: [g.id, 'x'], isla: 1, hasta: 99, horas: 3 }, c);
  assert.deepEqual(p.roles, ['lider', 'expl']);
  assert.equal(p.hasta, 8);
  assert.equal(p.horas, 1);
  assert.equal(game.normalizarPlan(save, { equipo: [g.id], isla: 'misterio' }, c).modo, 'patrulla');
});

test('previsión y sugerir para la pantalla Formar equipo', () => {
  const { save, fin } = partida();
  const c = ctxEn(fin);
  game.recogerTodo(save, c);
  const pr = game.prever(save, 0, { equipo: save.pokemon.map((m) => m.id), isla: 1 }, c, 50);
  assert.ok(pr.pJefe >= 0 && pr.pJefe <= 1);
  assert.ok(pr.finMediana > fin);
  const s = game.sugerir(save, 1, {}, c);
  assert.equal(s.equipo.length, 2);
  assert.equal(s.roles[0], 'lider');
  const v = game.ventaja(save, save.pokemon[0].id, 1, c);
  assert.ok(['▲', '=', '▼'].includes(v.simbolo));
  assert.equal(game.listaIslas(save, c).length, 9);
});

test('vencer al jefe abre la isla siguiente, sube el tope y da momento', () => {
  const { save, fin } = partida();
  let c = ctxEn(fin);
  game.recogerTodo(save, c);
  // Un equipo muy fuerte para asegurar el jefe
  for (const m of save.pokemon) { m.nv = 20; m.est = 5; m.car = 100; }
  const r = game.enviar(save, 0, { equipo: save.pokemon.map((m) => m.id), roles: ['lider', 'apoyo'], isla: 1 }, c);
  c = ctxEn(r.fin);
  const inf = game.recogerTodo(save, c);
  assert.equal(inf.equipos[0].jefe, true);
  assert.equal(inf.equipos[0].primerJefe, true);
  assert.ok(save.islas['1'].jefe);
  assert.ok(save.islas['2'], 'se abre Arroyo');
  assert.equal(game.tope(save), 30);
  assert.ok(inf.momentos.some((m) => m.tipo === 'jefe'));
  assert.equal(game.metaSiguiente(save, c).destino.isla, 2);
  assert.ok(save.pokemon[0].dia.some((d) => d[1] === 'jefe'));
});

test('bus: informe, save:cambio y exp:enviada', () => {
  const ev = [];
  const offs = ['informe', 'save:cambio', 'exp:enviada'].map((n) => bus.on(n, () => ev.push(n)));
  const { save, fin } = partida();
  game.recogerTodo(save, ctxEn(fin));
  offs.forEach((f) => f());
  assert.ok(ev.includes('exp:enviada'));
  assert.ok(ev.includes('informe'));
  assert.ok(ev.includes('save:cambio'));
});

test('avisos: como mucho 3 y en orden de prioridad', () => {
  const { save, fin } = partida();
  save.monedas = 1e9;
  save.bayas = 1e9;
  const a = game.avisos(save, ctxEn(fin));
  assert.ok(a.length <= 3);
  assert.equal(a[0].tipo, 'vuelta');
  assert.equal(a[1].tipo, 'mejora');
});

test('events: clima estable por semana, marea y tipos de la Misterio', async () => {
  const ev = await import('../js/core/events.js');
  assert.equal(ev.climaSemana(202647, 3), ev.climaSemana(202647, 3));
  const cuenta = {};
  for (let w = 0; w < 400; w++) for (let i = 1; i <= 8; i++) {
    const c = ev.climaSemana(202600 + w, i);
    cuenta[c] = (cuenta[c] || 0) + 1;
  }
  assert.equal(Object.keys(cuenta).length, 5);
  for (const n of Object.values(cuenta)) assert.ok(n > 400 && n < 900);
  assert.equal(ev.esNoche(new Date(2026, 10, 17, 23, 0).getTime()), true);
  assert.equal(ev.esNoche(new Date(2026, 10, 17, 6, 59).getTime()), true);
  assert.equal(ev.esNoche(new Date(2026, 10, 17, 7, 0).getTime()), false);
  assert.equal(ev.momentoDia(new Date(2026, 10, 17, 19, 0).getTime()), 'noche');
  assert.equal(ev.climaTipo('calor', ['fuego', 'planta']), 1.2 * 0.9);
  assert.equal(ev.climaTipo('calor', ['hielo', 'planta']), 0.9);
  assert.equal(ev.climaTipo('despejado', ['fuego']), 1);
  const [a, b] = ev.tiposMisterio(202647);
  assert.ok(ev.TIPOS.includes(a) && ev.TIPOS.includes(b) && a !== b);
  assert.equal(ev.esPatrullaNocturna(new Date(2026, 10, 17, 23, 0).getTime(), 4), true);
  assert.equal(ev.esPatrullaNocturna(new Date(2026, 10, 17, 23, 0).getTime(), 1), false);
});

test('con los datos reales de data/ (si existen): 10 rondas de enviar a todos y recoger', async (t) => {
  const { existsSync } = await import('node:fs');
  const dir = new URL('../data/', import.meta.url);
  if (!existsSync(new URL('especies.json', dir))) { t.skip('aún no hay data/'); return; }
  const { cargarDatosNode } = await import('../js/data.js');
  const { fileURLToPath } = await import('node:url');
  const reales = await cargarDatosNode(fileURLToPath(dir));
  const c = (x) => game.crearCtx(reales, x);
  let ahora = T0;
  const { save, fin } = game.iniciarPartida({ guia: '0152', faro: 'este', nombre: 'F' }, c(ahora));
  ahora = fin;
  game.recogerTodo(save, c(ahora));
  assert.equal(save.pokemon.length, 2);
  for (let k = 0; k < 10; k++) {
    assert.ok(game.enviarTodos(save, c(ahora)) >= 1);
    ahora = Math.max(...save.equipos.filter((e) => e.exp).map((e) => e.exp.fin));
    const inf = game.recogerTodo(save, c(ahora));
    assert.ok(inf.equipos.length >= 1);
    game.mejorar(save, 'huerto', c(ahora));
    game.igualar(save, c(ahora));
  }
  assert.ok(save.stats.exps >= 11);
  assert.ok(save.pokemon.length >= 2);
});
