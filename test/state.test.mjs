import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../js/core/rng.js';
import {
  SAVE_VERSION, CLAVE, nuevoGuardado, migrar, crearAlmacen, cargar, guardar, exportar, importar,
  fusionarTrasImportar, anotarDiario, reanclarReloj, memoriaStorage, crearMon,
} from '../js/core/state.js';

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T0 = Date.UTC(2026, 10, 18, 10, 0, 0);

test('nuevoGuardado tiene el esquema §12.1 y el guía en el equipo 1', () => {
  const s = nuevoGuardado({ guia: '0004', faro: 'este', nombre: 'Ana', ahora: T0, rng: mulberry32(1) });
  assert.equal(s.saveVersion, SAVE_VERSION);
  assert.equal(s.pokemon.length, 1);
  const g = s.pokemon[0];
  assert.match(g.id, /^m_[a-z0-9]{6}$/);
  assert.equal(g.sp, '0004');
  assert.equal(g.nv, 5);
  assert.deepEqual(s.equipos[0].miembros, [g.id]);
  assert.deepEqual(s.equipos[0].roles, ['lider']);
  assert.ok(s.islas['1']);
  assert.equal(s.base.ultimaRecogida, T0);
  assert.equal(s.bitacora.tenido['0004'], T0);
  assert.equal(s.idDispositivo.length, 10);
  for (const k of ['monedas', 'bayas', 'objetos', 'caramelos', 'misterio', 'album', 'cadenas', 'visitante', 'diarioExp',
    'informesSinEspecial', 'tutorial', 'misiones', 'diasJugados', 'stats', 'trade', 'ajustes']) {
    assert.ok(k in s, k);
  }
  // mismo rng -> mismo guardado
  const s2 = nuevoGuardado({ guia: '0004', faro: 'este', nombre: 'Ana', ahora: T0, rng: mulberry32(1) });
  assert.deepEqual(s, s2);
});

test('nuevo -> guardar -> cargar (memoria, inmediato)', async () => {
  const a = crearAlmacen({});
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(2) });
  const r = guardar(a, s, { inmediato: true });
  assert.ok(r.bytes > 100);
  assert.equal(r.grande, false);
  const c = await cargar(a);
  assert.deepEqual(c, s);
});

test('guardar sin inmediato agrupa con debounce de 1 s', async () => {
  const timers = [];
  const a = crearAlmacen({ setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} });
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(3) });
  guardar(a, s);
  s.monedas = 10;
  guardar(a, s);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1000);
  assert.equal(a.ls.getItem(CLAVE), null);
  timers[0].fn();
  assert.equal(JSON.parse(a.ls.getItem(CLAVE)).monedas, 10);
  assert.equal(a.escrituras, 1);
});

test('cargar elige la copia más reciente entre localStorage e IndexedDB', async () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(4) });
  const viejo = { ...s, ultimaVez: T0, monedas: 1 };
  const nuevo = { ...s, ultimaVez: T0 + 5000, monedas: 2 };
  // IndexedDB falso mínimo
  const fakeIDB = fakeIndexedDB({ main: JSON.stringify(nuevo) });
  const ls = memoriaStorage();
  ls.setItem(CLAVE, JSON.stringify(viejo));
  const a = crearAlmacen({ localStorage: ls, indexedDB: fakeIDB });
  assert.equal((await cargar(a)).monedas, 2);
  // localStorage dañado -> usa IDB
  ls.setItem(CLAVE, '{roto');
  assert.equal((await cargar(a)).monedas, 2);
  // y guardar escribe en las dos
  guardar(a, { ...nuevo, ultimaVez: T0 + 9000, monedas: 3 }, { inmediato: true });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(JSON.parse(fakeIDB._datos.main).monedas, 3);
});

test('cargar sin partida devuelve null', async () => {
  assert.equal(await cargar(crearAlmacen({})), null);
});

test('export/import ida y vuelta, con tildes y espacios pegados', () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(5), nombre: 'Ñandú «faro»' });
  s.pokemon[0].ap = 'Chispa ☆';
  const txt = exportar(s);
  assert.match(txt, /^FAR1\.[A-Za-z0-9+/=]+\.[0-9a-f]{8}$/);
  const roto = txt.slice(0, 30) + '\n  ' + txt.slice(30);
  assert.deepEqual(importar(roto), s);
});

test('checksum malo -> error en castellano', () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(6) });
  const txt = exportar(s);
  const partes = txt.split('.');
  const malo = `${partes[0]}.${partes[1]}.${partes[2] === '00000000' ? '11111111' : '00000000'}`;
  assert.throws(() => importar(malo), /comprobación no cuadra/);
  assert.throws(() => importar('hola'), /no es una partida de Farolillo/);
  assert.throws(() => importar(''), /Pega el texto/);
});

test('migración 0 -> 1 con fixture de prototipo', () => {
  const s = migrar(fixture('save-v0.json'));
  assert.equal(s.saveVersion, 1);
  assert.equal(s.pokemon.length, 2);
  assert.equal(s.pokemon[1].car, 0);
  assert.deepEqual(s.pokemon[1].dia, []);
  assert.equal(s.base.huerto, 2);
  assert.equal(s.base.linterna, 1);
  assert.equal(s.huerto, undefined);
  assert.equal(s.islas['1'].pisoMax, 3);
  assert.equal(s.islas['1'].jefe, false);
  assert.equal(s.equipos[0].exp, null);
  assert.equal(s.trade.applied && typeof s.trade.applied, 'object');
});

test('migrar v1 completa campos y respeta lo existente; versión futura falla', () => {
  const raw = fixture('save-v1.json');
  const s = migrar(raw);
  assert.equal(s.equipos.length, 2);
  assert.equal(s.monedas, 5000);
  assert.equal(s.base.restoBayas, 0);
  assert.throws(() => migrar({ ...raw, saveVersion: 99 }), /versión más nueva/);
  assert.throws(() => migrar(null), /formato válido/);
});

test('reloj hacia atrás reancla y no da tiempo negativo', () => {
  const s = nuevoGuardado({ ahora: T0, rng: mulberry32(7) });
  assert.equal(reanclarReloj(s, T0 + 1000), false);
  assert.equal(reanclarReloj(s, T0 - 3600_000), true);
  assert.equal(s.ultimaVez, T0 - 3600_000);
  assert.equal(s.base.ultimaRecogida, T0 - 3600_000);
});

test('diario: máximo 8 y conserva las protegidas', () => {
  const m = crearMon({ sp: '0010', rng: mulberry32(8) });
  anotarDiario(m, 1, 'llega', {});
  for (let i = 0; i < 10; i++) anotarDiario(m, 10 + i, i === 3 ? 'evo' : 'jefe', {});
  assert.equal(m.dia.length, 8);
  assert.ok(m.dia.some((e) => e[1] === 'llega'));
  assert.ok(m.dia.some((e) => e[1] === 'evo'));
  assert.equal(m.dia[m.dia.length - 1][0], 19);
});

test('deduplicación tras importar (§11.4)', () => {
  const actual = migrar(fixture('save-v1.json'));
  actual.idDispositivo = 'dispActual';
  actual.trade.applied = { OTRO: { t: 5, dado: 'm_aaaaaa' } };
  const entrante = migrar(fixture('save-v1.json'));
  entrante.pokemon.push({ ...entrante.pokemon[1] }); // tr-XYZ duplicado
  entrante.pokemon.push(crearMon({ sp: '0019', id: 'm_given1' }));
  const s = fusionarTrasImportar(actual, entrante);
  assert.deepEqual(Object.keys(s.trade.applied).sort(), ['OTRO', 'XYZ']);
  const ids = s.pokemon.map((m) => m.id);
  assert.ok(!ids.includes('m_aaaaaa'), 'dado en un intercambio de la partida actual');
  assert.ok(!ids.includes('m_given1'), 'dado en un intercambio de la partida entrante');
  assert.equal(ids.filter((i) => i === 'tr-XYZ').length, 1);
  assert.deepEqual(s.equipos[0].miembros, []);
  assert.equal(s.idDispositivo, 'dispActual');
});

// --- IndexedDB falso (lo justo para state.js) ---
function fakeIndexedDB(inicial = {}) {
  const datos = { ...inicial };
  const req = (fn) => {
    const r = {};
    setTimeout(() => { try { r.result = fn(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } }, 0);
    return r;
  };
  const db = {
    close() {},
    transaction() {
      const tx = {
        objectStore: () => ({
          get: (k) => req(() => datos[k]),
          put: (v, k) => { datos[k] = v; setTimeout(() => tx.oncomplete?.(), 0); },
        }),
      };
      return tx;
    },
  };
  return {
    _datos: datos,
    open() {
      const r = {};
      setTimeout(() => { r.result = db; r.onsuccess?.(); }, 0);
      return r;
    },
  };
}
