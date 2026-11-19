// Pruebas de las partes puras de js/gfx/sprites.js (dueño: GRÁFICOS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../js/gfx/sprites.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const manifest = {
  v: 1, sha: 'x', esp: {
    '0025': {
      ss: 1,
      a: {
        Idle: { fw: 40, fh: 56, d: [40, 2, 3, 3, 3, 2], r: [0, 2, 6] },
        Walk: { fw: 32, fh: 40, d: [8, 10, 8, 10], r: [0, 2] },
        Attack: { fw: 80, fh: 80, d: [2, 4, 1, 1, 1, 2, 2, 2, 2, 4], r: [0, 2, 6], hit: 3 },
        Sleep: { fw: 32, fh: 40, d: [30, 35], r: [0] },
        Hurt: { fw: 48, fh: 64, d: [2, 8], r: [0, 2, 6] },
      },
      p: ['Normal', 'Happy'],
      vario: { a: { Idle: { fw: 40, fh: 56, d: [10], r: [0] } }, p: [] },
    },
  },
};
const creditos = {
  artistas: { a1: { n: 'Artista', url: 'https://ejemplo' } },
  esp: { '0025': { sprite: [{ a: 'a1', lic: 'CC_BY-NC_4' }], retrato: [{ a: 'CHUNSOFT', lic: 'Unspecified' }], vSprite: [], vRetrato: [] } },
};

test('iniciar con manifest inyectado', async () => {
  await S.iniciar('./assets/', { manifest, creditos });
  assert.deepEqual(S.especies(), ['0025']);
});

test('frameEn respeta las duraciones en ticks de 1/60 s', () => {
  const info = manifest.esp['0025'].a.Idle;      // total 53 ticks
  assert.equal(S.frameEn(info, 0), 0);
  assert.equal(S.frameEn(info, 39 * 1000 / 60), 0);
  assert.equal(S.frameEn(info, 40.5 * 1000 / 60), 1);
  assert.equal(S.frameEn(info, 53 * 1000 / 60), 0, 'vuelve a empezar');
  assert.equal(S.frameEn(info, 999999, false), 5, 'sin bucle se queda en el último');
});

test('animConRespaldo', () => {
  assert.equal(S.animConRespaldo('0025', 'Attack'), 'Attack');
  assert.equal(S.animConRespaldo('0025', 'Hop'), 'Idle');
  assert.equal(S.animConRespaldo('0025', 'Faint'), 'Hurt');
  assert.equal(S.animConRespaldo('0025', 'Attack', true), 'Idle', 'variocolor sin Attack');
  assert.equal(S.animConRespaldo('9999', 'Idle'), null);
});

test('hitFrame, duracionAnim y msHasta', () => {
  assert.equal(S.hitFrame('0025', 'Attack'), 3);
  assert.equal(S.hitFrame('0025', 'Idle'), null);
  assert.equal(Math.round(S.duracionAnim('0025', 'Attack')), Math.round(21 * 1000 / 60));
  assert.equal(Math.round(S.msHasta('0025', 'Attack')), Math.round(7 * 1000 / 60));
  assert.equal(S.indiceFrame('0025', 'Hop', false, 0), 0, 'con respaldo a Idle');
});

test('urlRetrato cae a Normal y a los retratos normales si la variante no tiene', () => {
  assert.equal(S.urlRetrato('0025', 'Happy'), './assets/pmd/0025/p/Happy.png');
  assert.equal(S.urlRetrato('0025', 'Joyous'), './assets/pmd/0025/p/Normal.png');
  assert.equal(S.urlRetrato('0025', 'Happy', true), './assets/pmd/0025/p/Happy.png');
  assert.equal(S.urlRetrato('9999', 'Happy'), '');
});

test('creditosDe resuelve nombres y cae a los de la forma normal', () => {
  const c = S.creditosDe('0025', true);
  assert.equal(c.sprite[0].n, 'Artista');
  assert.equal(c.retrato[0].n, 'CHUNSOFT');
});

test('dibujar sin imagen cargada pinta solo la sombra y devuelve false', () => {
  const llamadas = [];
  const ctx = new Proxy({}, { get: (_, k) => (k in _ ? _[k] : (...a) => llamadas.push(k)), set: (o, k, v) => { o[k] = v; return true; } });
  const r = S.dibujar(ctx, { sp: '0025', anim: 'Idle', x: 10, y: 10 });
  assert.equal(r, false);
  assert.ok(llamadas.includes('ellipse'));
  assert.ok(!llamadas.includes('drawImage'));
});

// Comprobación del manifest real (si DATOS ya lo ha generado): cada PNG mide fw×frames por fh×filas.
const real = path.join(raiz, 'assets', 'manifest.json');
test('manifest real: medidas de las PNG', { skip: !fs.existsSync(real) }, () => {
  const m = JSON.parse(fs.readFileSync(real, 'utf8'));
  let n = 0;
  const mal = [];
  for (const [sp, e] of Object.entries(m.esp)) {
    for (const [vr, bloque] of [['', e], ['v/', e.vario]]) {
      if (!bloque) continue;
      for (const [anim, a] of Object.entries(bloque.a)) {
        const f = path.join(raiz, 'assets', 'pmd', sp, vr + anim + '.png');
        if (!fs.existsSync(f)) { mal.push(`${sp} ${vr}${anim}: falta`); continue; }
        const b = fs.readFileSync(f);
        const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
        if (w !== a.fw * a.d.length || h !== a.fh * a.r.length) mal.push(`${sp} ${vr}${anim}: ${w}x${h} ≠ ${a.fw * a.d.length}x${a.fh * a.r.length}`);
        if (a.hit != null && (a.hit < 0 || a.hit >= a.d.length)) mal.push(`${sp} ${anim}: hit fuera`);
        n++;
      }
      for (const k of ['Idle', 'Walk', 'Attack', 'Sleep', 'Hurt']) if (!bloque.a[k]) mal.push(`${sp} ${vr}: falta ${k}`);
    }
  }
  assert.deepEqual(mal.slice(0, 20), []);
  assert.ok(n > 0);
});

// ---------------------------------------------------------------------------
// Búfer a px de sprite (lote rendimiento): el canvas mide lo que mide el mundo, no la pantalla.
function canvasFalso(cssW, cssH) {
  const llamadas = [];
  const ctx = { setTransform: (...a) => llamadas.push(a), imageSmoothingEnabled: true };
  return {
    width: 300, height: 150, style: {}, llamadas,
    getBoundingClientRect: () => ({ width: cssW, height: cssH }),
    getContext: () => ctx,
  };
}

test('prepararCanvas: búfer = mundo en px de sprite, transform 1 y pixelated inline', () => {
  const antes = globalThis.window;
  try {
    for (const [dpr, e, cssW, cssH, esc] of [[3, 3, 390, 300, 9], [2.625, 2, 412, 319, 5], [4.5, 2, 412, 200, 9], [1, 3, 360, 240, 3]]) {
      globalThis.window = { devicePixelRatio: dpr };
      const c = canvasFalso(cssW, cssH);
      const d = S.prepararCanvas(c, e);
      assert.equal(d.S, esc, `S con dpr ${dpr} ×${e}`);
      assert.equal(c.width, Math.round(Math.round(cssW * dpr) / esc));
      assert.equal(c.height, Math.round(Math.round(cssH * dpr) / esc));
      assert.equal(d.w, c.width); assert.equal(d.h, c.height);
      assert.ok(Math.abs(d.k * c.width - cssW) < 1e-9, 'k = px CSS por px de sprite');
      assert.deepEqual(c.llamadas.at(-1), [1, 0, 0, 1, 0, 0]);
      assert.equal(c.style.imageRendering, 'pixelated');
      assert.equal(c._pxS, esc);
      // En DPR 3 la cala entera cabe en < 0,5 MB (antes 1170×900×4 ≈ 4,2 MB).
      assert.ok(c.width * c.height * 4 < 0.5 * 1024 * 1024);
      // El factor real de ampliación queda a menos de 0,1 px de dispositivo por px de sprite de S.
      assert.ok(Math.abs(cssW * dpr / c.width - esc) < esc * 0.03, `factor ${cssW * dpr / c.width} ≈ ${esc}`);
    }
  } finally { globalThis.window = antes; }
});

test('fmt.corto para la barra: 31,6K, 1,5M y sin «1000K»', async () => {
  const fmt = await import('../js/fmt.js');
  assert.equal(fmt.corto(950), '950');
  assert.equal(fmt.corto(3210), '3,2K');
  assert.equal(fmt.corto(31600), '31,6K');
  assert.equal(fmt.corto(1_500_000), '1,5M');
  assert.equal(fmt.corto(999_960), '1M');
  assert.equal(fmt.corto(2_100_000_000), '2,1MM');
  assert.equal(fmt.corto(-12_000), '-12K');
  assert.equal(fmt.entero(31600), '31.600');
});

// ---------------------------------------------------------------------------
// Worker de previsión: lo que calcula (con los Datos guardados una vez y el ctx sin datos) es idéntico a
// game.prever / game.sugerir en el hilo principal (mismas funciones, mismas semillas).
test('worker-prev: preverJuego y sugerirJuego = game.prever y game.sugerir', async () => {
  const game = await import('../js/core/game.js');
  const W = await import('../js/core/worker-prev.js');
  const { cargarDatosNode } = await import('../js/data.js');
  const datos = await cargarDatosNode(path.join(raiz, 'data'));
  const t0 = new Date(2026, 10, 18, 10, 0, 0).getTime();
  const ctx = game.crearCtx(datos, t0);
  const { save } = game.iniciarPartida({ guia: '0007', faro: 'sur', nombre: 'P' }, ctx);
  const st = await import('../js/core/state.js');
  const sps = Object.keys(datos.especies).slice(0, 12);
  sps.forEach((sp, i) => save.pokemon.push(st.crearMon({ sp, nv: 5 + i * 2, id: 'm_t' + i, ahora: t0 })));
  save.equipos[0].exp = null;
  // Clonado como lo haría postMessage, y el ctx sin datos.
  const clon = (o) => structuredClone(o);
  const sinDatos = { ...ctx }; delete sinDatos.datos;
  assert.equal(W.atender({ id: 0, tipo: 'preverJuego', save: clon(save), idx: 0, plan: {}, ctx: clon(sinDatos) }).sinDatos, true);
  assert.equal((await W.atenderAsync({ id: 1, tipo: 'datos', datos: clon(datos) })).ok, true);
  const libres = game.libres(save);
  let n = 0;
  for (const isla of [1, 2]) {
    for (const op of [{ modo: 'vuelta' }, { modo: 'patrulla', horas: 4, postura: 'audaz' }]) {
      const a = game.sugerir(save, isla, op, ctx);
      const b = W.atender({ id: 2, tipo: 'sugerirJuego', save: clon(save), isla, opciones: op, ctx: clon(sinDatos) });
      assert.equal(b.ok, true, b.error);
      assert.deepEqual(b.res, a, `sugerir isla ${isla} ${op.modo}`);
      const plan = { isla, equipo: libres.slice(n, n + 3), roles: ['lider', 'reco', 'apoyo'], modo: op.modo, horas: op.horas || 1, postura: op.postura || 'equilibrada', hasta: null, dominio: 0 };
      const pa = game.prever(save, 0, plan, ctx, 120);
      const pb = W.atender({ id: 3, tipo: 'preverJuego', save: clon(save), idx: 0, plan, ctx: clon(sinDatos), n: 120 });
      assert.equal(pb.ok, true, pb.error);
      assert.deepEqual(pb.res, pa, `prever isla ${isla} ${op.modo}`);
      n++;
    }
  }
  W.ponerDatos(null);
});
