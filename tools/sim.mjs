#!/usr/bin/env node
// Simulador de ritmo (§15.3). Dueño: NÚCLEO.
// node tools/sim.mjs --dias 30 --sesiones 5 --semillas 50 --politica voraz|perezosa|ambas [--datos dir] [--json]
//
// Juega partidas completas con js/core (sim, recruit, evolve, formulas) y los datos reales de data/
// (o los del fixture de pruebas si aún no existen). La economía del jugador (cobrar, subir niveles,
// huerto) se modela aquí con las fórmulas de K para no depender de game.js.
// Sale con código ≠ 0 si incumple los objetivos duros: sin mesetas > 24 h en p50,
// isla 8 vencida antes del día 12 en p50 y ritmo perezosa/voraz ≥ 0,6.
//
// Políticas:
//   voraz     recoge, mejora edificios (Muelle primero, luego lo más barato), evoluciona todo,
//             reparte bayas entre los que salen, envía con Sugerir a la isla más honda con
//             pJefe ≥ 0,6 (si no, patrulla en la anterior); patrullas del tamaño del hueco
//             hasta la siguiente sesión (8 h de noche). La primera hora mira cada 5 min.
//   perezosa  solo «Recoger todo» y «Enviar a todos» (la sugerencia): sin mejoras, sin
//             evolucionar, sin bayas.
//   repetir   como perezosa pero repitiendo el último plan de cada equipo (no avanza de isla).
// Opciones de análisis: --sin-evo, --sin-mejoras, --mejoras muelle,linterna, --sin-igualar,
//   --sin-primera-hora, --k '{"EXP_G":1.5}' (sustituye constantes de K solo en esta ejecución),
//   --candidatos 3 --n 24 (coste de Sugerir dentro del simulador).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);
const F = await imp('js/core/formulas.js');
const R = await imp('js/core/rng.js');
const SIM = await imp('js/core/sim.js');
const REC = await imp('js/core/recruit.js');
const EVO = await imp('js/core/evolve.js');
const { K } = F;

// ---------------------------------------------------------------------------
// Argumentos y datos
// ---------------------------------------------------------------------------

function args(argv) {
  const o = { dias: 30, sesiones: 5, semillas: 50, politica: 'ambas', datos: null, json: false, cand: 3, n: 24 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--dias') { o.dias = +v; i++; } else if (a === '--sesiones') { o.sesiones = +v; i++; } else if (a === '--semillas') { o.semillas = +v; i++; } else if (a === '--politica') { o.politica = v; i++; } else if (a === '--datos') { o.datos = v; i++; } else if (a === '--candidatos') { o.cand = +v; i++; } else if (a === '--n') { o.n = +v; i++; } else if (a === '--json') o.json = true;
    else if (a === '--sin-primera-hora') o.primeraHora = false;
    else if (a === '--sin-evo') o.evo = false;
    else if (a === '--sin-mejoras') o.mejoras = false;
    else if (a === '--mejoras') { o.mejoras = v.split(','); i++; }
    else if (a === '--sin-igualar') o.igualar = false;
    else if (a === '--fin-dia') { o.finDia = +v; i++; }
    else if (a === '--perezosa-evo') o.perezosaEvo = true;
    else if (a === '--k') { o.k = JSON.parse(v); i++; }
    else if (a === '--ayuda' || a === '-h') { console.log('node tools/sim.mjs --dias 30 --sesiones 5 --semillas 50 --politica voraz|perezosa|ambas [--datos dir] [--json]'); process.exit(0); }
  }
  return o;
}

export function cargarDatos(dir) {
  const elegir = () => {
    if (dir) return path.resolve(dir);
    const real = path.join(RAIZ, 'data');
    if (['especies', 'islas', 'tipos'].every((n) => fs.existsSync(path.join(real, `${n}.json`)))) return real;
    return path.join(RAIZ, 'test', 'fixtures', 'nucleo');
  };
  const d = elegir();
  const leer = (n) => JSON.parse(fs.readFileSync(path.join(d, `${n}.json`), 'utf8'));
  const esp = leer('especies');
  const islas = leer('islas').sort((a, b) => a.id - b.id);
  const islaPorId = {};
  for (const i of islas) islaPorId[i.id] = i;
  return { dir: d, datos: { especies: esp.especies || esp, islas, islaPorId, tipos: leer('tipos'), textos: {} } };
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

const GUIAS = ['0001', '0004', '0007', '0152', '0155', '0158', '0252', '0255', '0258'];
const FAROS = ['norte', 'este', 'sur', 'oeste'];
const HORA = 3600000;

function nuevoSave(seed, t0, datos) {
  const rng = R.mulberry32(R.hashSeed('save', seed));
  const guia = GUIAS.filter((g) => datos.especies[g])[seed % GUIAS.length] || Object.keys(datos.especies)[0];
  const s = {
    saveVersion: 1, creado: t0, ultimaVez: t0, idDispositivo: 'sim' + seed, nombre: 'Sim', guia, faro: FAROS[seed % 4],
    monedas: 0, bayas: 0, objetos: {}, caramelos: {},
    base: { huerto: 0, despensa: 0, muelle: 0, linterna: 0, taberna: 0, ultimaRecogida: t0 },
    pokemon: [], equipos: [{ miembros: [], roles: [], ultimoPlan: null, exp: null }],
    islas: {}, misterio: { wk: 0, record: 0 }, bitacora: { visto: {}, tenido: {} }, album: {}, cadenas: {},
    visitante: null, diarioExp: [], informesSinEspecial: 0, tutorial: { paso: 0, enviadas: 0 },
    stats: { exps: 0, jefes: 0, mejorP: 0 }, ajustes: { duplicados: 'fusionar' },
  };
  for (let i = 1; i <= 8; i++) s.islas[i] = { pisoMax: 0, jefe: false, dominio: 0, piedad: 0, huellas: {} };
  s.pokemon.push({ id: 'm_' + R.idAleatorio(rng), sp: guia, vr: false, ap: '', nv: 5, xp: 0, est: 0, car: 30, ot: 'local', otn: '', f: t0, de: 'faro', dia: [], fav: false, noEvo: false, toq: 0 });
  s.bitacora.visto[guia] = s.bitacora.tenido[guia] = t0;
  return s;
}

function crearCtx(datos, ahora) {
  const sem = R.isoSemana(ahora).id;
  const clima = {};
  for (let i = 1; i <= 8; i++) clima[i] = K.CLIMAS[R.hashSeed(sem, i) % K.CLIMAS.length];
  clima.misterio = K.CLIMAS[R.hashSeed(sem, 'misterio') % K.CLIMAS.length];
  return { datos, ahora, semana: sem, clima, evento: null };
}

function darExp(mon, exp, tope) {
  if (mon.nv >= tope) {
    mon.xp = Math.min(mon.xp + exp, F.expSig(mon.nv)); // se acumula hasta 1 nivel
    return 0;
  }
  let subidos = 0;
  mon.xp += exp;
  while (mon.nv < tope && mon.xp >= F.expSig(mon.nv)) {
    mon.xp -= F.expSig(mon.nv);
    mon.nv++;
    subidos++;
  }
  if (mon.nv >= tope) mon.xp = Math.min(mon.xp, F.expSig(mon.nv));
  return subidos;
}

function islaMaxAbierta(s) {
  let m = 1;
  for (let i = 1; i <= 8; i++) if (s.islas[i].jefe) m = Math.min(8, i + 1);
  return m;
}

// ---------------------------------------------------------------------------
// Jugador
// ---------------------------------------------------------------------------

export class Partida {
  constructor(seed, opts, datos, politica) {
    this.seed = seed;
    this.o = opts;
    this.datos = datos;
    this.pol = politica;
    this.t0 = new Date(2026, 10, 16, 8, 0, 0).getTime(); // lunes 08:00
    this.s = nuevoSave(seed, this.t0, datos);
    this.hitos = {};
    this.eventos = [];
    this.totalEspecies = Object.keys(datos.especies).length;
    this.nSemilla = 0;
  }

  hito(nombre, t) {
    if (this.hitos[nombre] == null) {
      this.hitos[nombre] = t;
      this.eventos.push([t, nombre]);
    }
  }

  porId(id) { return this.s.pokemon.find((p) => p.id === id); }

  ctx(t) { return crearCtx(this.datos, t); }

  enviar(idx, plan, t) {
    const s = this.s;
    const snapshot = SIM.crearSnapshot(s, plan, this.datos);
    const semilla = R.hashSeed('exp', this.seed, this.nSemilla++);
    const registro = SIM.resolverExpedicion({ plan, snapshot, semilla, inicio: t, ctx: this.ctx(t) });
    const eq = s.equipos[idx];
    eq.miembros = [...plan.equipo];
    eq.roles = [...plan.roles];
    eq.ultimoPlan = plan;
    eq.exp = { plan, inicio: t, fin: registro.fin, semilla, registro };
    if (!plan.tutorial) s.tutorial.enviadas++;
  }

  recoger(t) {
    const s = this.s;
    for (const eq of s.equipos) {
      if (!eq.exp || eq.exp.fin > t) continue;
      const { plan, registro } = eq.exp;
      eq.exp = null;
      const ctx = this.ctx(registro.fin);
      s.monedas += registro.totales.monedas;
      for (const [k, v] of Object.entries(registro.totales.objetos)) s.objetos[k] = (s.objetos[k] || 0) + v;
      const miembros = plan.equipo.map((u) => this.porId(u)).filter(Boolean);
      const media = miembros.reduce((a, m) => a + m.nv, 0) / Math.max(1, miembros.length);
      const tope = F.topeNivel(F.jefesVencidos(s));
      let car = 1;
      for (const r of registro.rondas) for (const e of r.eventos) if (e.tipo === 'perdido') car += K.PERDIDO_CARINO;
      for (const m of miembros) {
        const mult = m.nv <= media - K.ALCANZAR_DIF ? K.ALCANZAR_MULT : 1;
        darExp(m, Math.round(registro.totales.exp * mult), tope);
        m.car = Math.min(K.CARINO_MAX, m.car + car);
      }
      let especial = false;
      if (plan.isla !== 'misterio' && !plan.tutorial) {
        const isl = s.islas[plan.isla];
        for (const r of registro.rondas) {
          isl.pisoMax = Math.max(isl.pisoMax, r.pisoFin);
          if (r.jefe && !isl.jefe) {
            isl.jefe = true;
            especial = true;
            this.hito(`jefe${plan.isla}`, registro.fin);
          }
        }
        isl.piedad = registro.estadoRecluta.piedad;
        isl.huellas = registro.estadoRecluta.huellas;
      }
      for (const r of registro.rondas) {
        if (r.eventos.length) especial = true;
        for (const enc of r.encuentros) {
          const res = REC.aplicarRecluta(s, enc, ctx);
          if (!enc.acepta) continue;
          if (enc.rar === 'R' || enc.rar === 'L') { especial = true; this.hito('primerRaro', registro.fin); }
          if (enc.vr) this.hito('vario', registro.fin);
          if (res.tipo === 'lleno') this.hito('lleno', registro.fin);
        }
      }
      s.informesSinEspecial = especial ? 0 : s.informesSinEspecial + 1;
      s.stats.exps++;
      const tenidas = Object.keys(s.bitacora.tenido).length / this.totalEspecies;
      for (const q of [10, 25, 50]) if (tenidas * 100 >= q) this.hito(`bit${q}`, registro.fin);
    }
    if (F.jefesVencidos(s) >= 3) this.hito('isla4', this.hitos.jefe3);
    if (F.jefesVencidos(s) >= 5) this.hito('isla6', this.hitos.jefe5);
    if (s.islas[8].jefe) this.hito('isla8v', this.hitos.jefe8);
  }

  huerto(t) {
    const s = this.s;
    const dtS = Math.max(0, Math.min(t - s.base.ultimaRecogida, F.topeOfflineHoras(s.base.despensa) * HORA) / 1000);
    s.bayas += F.tasaHuerto(s.base.huerto, F.jefesVencidos(s)) * F.segundosEfectivos(dtS) / 3600;
    s.base.ultimaRecogida = t;
  }

  mejorar(t) {
    const s = this.s;
    for (let vueltas = 0; vueltas < 200; vueltas++) {
      const ops = (Array.isArray(this.o.mejoras) ? this.o.mejoras : ['muelle', 'linterna', 'huerto', 'taberna', 'despensa'])
        .map((id) => ({ id, c: F.costeEdificio(id, s.base[id]) }))
        .filter((o) => o.c != null && o.c <= s.monedas);
      if (!ops.length) return;
      const muelle = ops.find((o) => o.id === 'muelle');
      const o = muelle || ops.sort((a, b) => a.c - b.c)[0];
      s.monedas -= o.c;
      s.base[o.id]++;
      if (o.id === 'muelle') {
        s.equipos.push({ miembros: [], roles: [], ultimoPlan: null, exp: null });
        this.hito(`muelle${s.base.muelle}`, t);
      }
    }
  }

  ocupados() { return SIM.ocupados(this.s); }

  /** Reparte las bayas entre los mejores (los que salen de expedición), de menor a mayor nivel. */
  igualar() {
    const s = this.s;
    const tope = F.topeNivel(F.jefesVencidos(s));
    const n = 3 * s.equipos.length;
    const mejores = [...s.pokemon]
      .sort((a, b) => F.poderMon(b, this.datos.especies[b.sp]) - F.poderMon(a, this.datos.especies[a.sp]))
      .slice(0, n)
      .filter((m) => m.nv < tope);
    for (let guard = 0; guard < 2000 && s.bayas >= 1 && mejores.length; guard++) {
      mejores.sort((a, b) => a.nv - b.nv);
      const m = mejores[0];
      const falta = Math.max(1, F.expSig(m.nv) - m.xp);
      const dar = Math.min(Math.floor(s.bayas), falta);
      if (dar <= 0) break;
      s.bayas -= dar;
      darExp(m, dar, tope);
      if (m.nv >= tope) mejores.shift();
    }
    // Bayas grandes: cariño a los mejores.
    while ((s.objetos.baya_grande || 0) > 0 && mejores.length) {
      const m = mejores.find((x) => x.car < K.CARINO_MAX) || null;
      if (!m) break;
      s.objetos.baya_grande--;
      m.car = Math.min(K.CARINO_MAX, m.car + K.CARINO_BAYA_GRANDE);
    }
  }

  evolucionar(t) {
    const s = this.s;
    const ocup = this.ocupados();
    for (const m of s.pokemon) {
      if (ocup.has(m.id) || m.noEvo) continue;
      const ops = EVO.opcionesEvolucion(m, s, this.datos, t).filter((o) => o.posible);
      if (!ops.length) continue;
      ops.sort((a, b) => (this.datos.especies[b.a].tot || 0) - (this.datos.especies[a.a].tot || 0));
      EVO.aplicarEvolucion(s, m.id, ops[0].a, this.datos, t);
      this.hito('primeraEvo', t);
    }
  }

  horasPatrulla(t, siguiente) {
    const gap = (siguiente - t) / HORA;
    return gap >= 8 ? 8 : gap >= 4 ? 4 : 1;
  }

  enviarLibres(t, siguiente) {
    const s = this.s;
    const ctx = this.ctx(t);
    for (let idx = 0; idx < s.equipos.length; idx++) {
      const eq = s.equipos[idx];
      if (eq.exp) continue;
      if (this.pol === 'repetir' && eq.ultimoPlan) {
        const libres = this.ocupados();
        if (eq.ultimoPlan.equipo.every((u) => this.porId(u) && !libres.has(u))) {
          const { tutorial, ...plan } = eq.ultimoPlan;
          this.enviar(idx, plan, t);
          continue;
        }
      }
      const opc = { n: this.o.n, candidatos: this.o.cand, semilla: R.hashSeed('sug', this.seed, t, idx) };
      const m = islaMaxAbierta(s);
      const horas = this.horasPatrulla(t, siguiente);
      let plan = null;
      const sg = SIM.sugerirEquipo(s, m, opc, ctx);
      if (!sg.equipo.length) return;
      if (!s.islas[m].jefe && (sg.prob >= 0.6 || m === 1)) {
        plan = { equipo: sg.equipo, roles: sg.roles, isla: m, modo: 'vuelta', hasta: this.datos.islaPorId[m].F, postura: 'equilibrada', dominio: 0 };
      } else {
        const destino = s.islas[m].jefe ? m : m - 1;
        const sg2 = destino === m ? sg : SIM.sugerirEquipo(s, destino, opc, ctx);
        const corta = siguiente - t < HORA; // jugando seguido: vueltas, no patrullas
        plan = corta
          ? { equipo: sg2.equipo, roles: sg2.roles, isla: destino, modo: 'vuelta', hasta: this.datos.islaPorId[destino].F, postura: 'equilibrada', dominio: 0 }
          : { equipo: sg2.equipo, roles: sg2.roles, isla: destino, modo: 'patrulla', horas, postura: 'equilibrada', dominio: 0 };
      }
      this.enviar(idx, plan, t);
    }
  }

  sesion(t, siguiente) {
    this.recoger(t);
    this.huerto(t);
    if (this.pol === 'voraz') {
      if (this.o.mejoras !== false) this.mejorar(t);
      if (this.o.evo !== false) this.evolucionar(t);
      if (this.o.igualar !== false) this.igualar();
    } else if (this.o.perezosaEvo && this.pol === 'perezosa') {
      this.evolucionar(t); // análisis: el aviso «Puede evolucionar» como un toque más
    }
    this.enviarLibres(t, siguiente);
  }

  jugar() {
    const { dias, sesiones } = this.o;
    const horas = sesiones <= 1 ? [12] : Array.from({ length: sesiones }, (_, i) => 8 + (i * ((this.o.finDia ?? 24) - 8)) / (sesiones - 1));
    const tiempos = [];
    // Primera hora jugando seguido (§2.3: primer raro ≈ 30 min, primera evolución ≈ 1 h): mira cada 5 min.
    const activa = this.o.primeraHora === false ? 0 : 60;
    for (let m = 1; m <= activa; m += 5) tiempos.push(this.t0 + m * 60000 + 1000);
    for (let d = 0; d < dias; d++) {
      for (const h of horas) {
        const t = this.t0 + d * 24 * HORA + (h - 8) * HORA;
        if (t > this.t0 + activa * 60000 + 1000) tiempos.push(t);
      }
    }
    // Primera apertura: tutorial, recoger al minuto y seguir.
    const guia = this.s.pokemon[0].id;
    this.enviar(0, { equipo: [guia], roles: ['lider'], isla: 1, tutorial: true, modo: 'vuelta' }, this.t0);
    this.s.tutorial.paso = 1;
    this.recoger(this.t0 + 60000);
    for (let i = 0; i < tiempos.length; i++) {
      const t = tiempos[i];
      this.sesion(t, tiempos[i + 1] ?? t + 24 * HORA);
    }
    this.fin = this.t0 + dias * 24 * HORA;
    return this;
  }
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

const HITOS = [
  ['primerRaro', 'Primer raro', 0.5],
  ['muelle1', 'Segundo equipo (Muelle 1)', 24],
  ['primeraEvo', 'Primera evolución', 1],
  ['isla4', 'Isla 4', 4],
  ['isla6', 'Isla 6', 60],
  ['isla8v', 'Isla 8 vencida', 192],
  ['bit25', '25 % de la Bitácora', 168],
  ['vario', 'Primer variocolor', 504],
];

function pct(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))];
}

function mesetaMax(p) {
  const fin = p.hitos.isla8v ?? p.fin;
  const ts = [p.t0, ...p.eventos.map((e) => e[0]).filter((t) => t <= fin)].sort((a, b) => a - b);
  if (p.hitos.isla8v == null) ts.push(p.fin);
  let max = 0;
  for (let i = 1; i < ts.length; i++) max = Math.max(max, ts[i] - ts[i - 1]);
  return max / HORA;
}

function resumir(partidas) {
  const out = {};
  for (const [id] of HITOS) {
    const hs = partidas.map((p) => (p.hitos[id] != null ? (p.hitos[id] - p.t0) / HORA : Infinity));
    const ok = hs.filter(Number.isFinite);
    out[id] = { p10: pct(hs, 0.1), p50: pct(hs, 0.5), p90: pct(hs, 0.9), alcanzado: ok.length / hs.length };
  }
  const mes = partidas.map(mesetaMax);
  out.meseta = { p50: pct(mes, 0.5), p90: pct(mes, 0.9) };
  out.final = {
    monedas: pct(partidas.map((p) => p.s.monedas), 0.5),
    pokemon: pct(partidas.map((p) => p.s.pokemon.length), 0.5),
    nvMax: pct(partidas.map((p) => Math.max(...p.s.pokemon.map((m) => m.nv))), 0.5),
    equipos: pct(partidas.map((p) => p.s.equipos.length), 0.5),
    jefes: pct(partidas.map((p) => F.jefesVencidos(p.s)), 0.5),
  };
  return out;
}

const fmtH = (h) => (h == null || !Number.isFinite(h) ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

function imprimir(nombre, r) {
  console.log(`\n== Política ${nombre} ==`);
  console.log('Hito'.padEnd(30) + 'p10'.padStart(10) + 'p50'.padStart(10) + 'p90'.padStart(10) + 'objetivo'.padStart(11) + '  logrado');
  for (const [id, txt, obj] of HITOS) {
    const x = r[id];
    console.log(txt.padEnd(30) + fmtH(x.p10).padStart(10) + fmtH(x.p50).padStart(10) + fmtH(x.p90).padStart(10) + fmtH(obj).padStart(11) + `  ${Math.round(x.alcanzado * 100)} %`);
  }
  console.log(`Meseta más larga: p50 ${fmtH(r.meseta.p50)} · p90 ${fmtH(r.meseta.p90)}`);
  const f = r.final;
  console.log(`Al final (p50): ${f.jefes} jefes, ${f.equipos} equipos, ${f.pokemon} Pokémon, nivel máx. ${f.nvMax}, ${Math.round(f.monedas)} monedas`);
}

function ritmo(v, p) {
  // Media de t50(voraz)/t50(perezosa) en los hitos de progreso alcanzados por la voraz
  // (sin el Muelle: la perezosa no mejora edificios por definición).
  const ids = ['isla4', 'isla6', 'isla8v', 'bit25'];
  const rs = [];
  for (const id of ids) {
    const a = v[id].p50, b = p[id].p50;
    if (a == null || !Number.isFinite(a)) continue;
    rs.push(Number.isFinite(b) ? Math.min(1, a / b) : 0);
  }
  return rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0;
}

export function simular(opts) {
  if (opts.k) Object.assign(K, opts.k); // pruebas de ajuste: --k '{"EXP_G":1.5}'
  const { datos } = cargarDatos(opts.datos);
  const pols = opts.politica === 'ambas' ? ['voraz', 'perezosa'] : [opts.politica];
  const res = {};
  for (const pol of pols) {
    const partidas = [];
    for (let seed = 0; seed < opts.semillas; seed++) partidas.push(new Partida(seed, opts, datos, pol === 'perezosa' ? 'perezosa' : pol).jugar());
    res[pol] = resumir(partidas);
  }
  return res;
}

async function main() {
  const o = args(process.argv.slice(2));
  const { dir } = cargarDatos(o.datos);
  const t = Date.now();
  const res = simular(o);
  const fallos = [];
  if (res.voraz) {
    if (res.voraz.meseta.p50 > 24) fallos.push(`meseta p50 de ${fmtH(res.voraz.meseta.p50)} (> 24 h)`);
    if (!(res.voraz.isla8v.p50 < 12 * 24)) fallos.push(`isla 8 vencida en p50 ${fmtH(res.voraz.isla8v.p50)} (≥ día 12)`);
  }
  let r = null;
  if (res.voraz && res.perezosa) {
    r = ritmo(res.voraz, res.perezosa);
    if (r < 0.6) fallos.push(`ritmo perezosa/voraz ${r.toFixed(2)} (< 0,6)`);
  }
  if (o.json) {
    console.log(JSON.stringify({ datos: dir, opciones: o, res, ritmo: r, fallos }, null, 1));
  } else {
    console.log(`Datos: ${path.relative(RAIZ, dir)} · ${o.dias} días · ${o.sesiones} sesiones/día · ${o.semillas} semillas · ${((Date.now() - t) / 1000).toFixed(1)} s`);
    for (const [k, v] of Object.entries(res)) imprimir(k, v);
    if (r != null) console.log(`\nRitmo perezosa/voraz: ${r.toFixed(2)} (objetivo ≥ 0,6)`);
    console.log(fallos.length ? `\nINCUMPLE: ${fallos.join(' · ')}` : '\nCumple los objetivos duros.');
  }
  process.exitCode = fallos.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
