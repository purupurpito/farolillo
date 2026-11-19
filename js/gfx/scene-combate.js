// scene-combate.js — dueño: GRÁFICOS. Expedición en curso (SPEC §9.2.6).
//
// crear(canvas, opciones) → Escena { actualizar, iniciar, parar, destruir, alTocar, render }
// estado = { registro, snapshot, ahora, isla?: {clave, fondo, F}, equipo?: [{sp, vr}] }
//   - El equipo desfila con Walk (fila «derecha») sobre las baldosas de la isla.
//   - En cada piso entra el enemigo con Walk (fila «izquierda» o espejo), se cruzan
//     Attack con el número de daño en el frame `hit` y Hurt en quien recibe.
//   - Corazones de PV arriba a la izquierda y barra de pisos abajo.
// Todo sale de sim.estadoEn y sim.detallePiso (deterministas): la escena no tira nada.
// Si `ahora` no viene en el estado, usa el reloj de pared (opciones.reloj o Date.now).
// opciones.sim = { estadoEn, detallePiso } para inyectarlo; si no, importa ../core/sim.js
// y, mientras tanto o si falla, usa una aproximación propia a partir del registro.

import * as S from './sprites.js';
import { rellenar, FONDOS } from './tiles.js';

const VEL_SUELO = 24;            // px de sprite por segundo al andar
const ENTRADA = 1100;            // ms que tarda el enemigo en llegar
const PAUSA_GOLPE = 250;         // ms entre golpes
const SALIDA = 900;              // ms de cierre del encuentro
const DUR_HURT = 450;
const ANTES_ENCUENTRO = 4000;    // ms antes del encuentro en que se piden Attack y Hurt
// Contorno de 2 px del texto de la capa DOM (como el strokeText de antes; text-shadow va en todos los navegadores).
const CONTORNO = '#14213d 2px 0 0, #14213d -2px 0 0, #14213d 0 2px 0, #14213d 0 -2px 0, #14213d 1.4px 1.4px 0, #14213d -1.4px 1.4px 0, #14213d 1.4px -1.4px 0, #14213d -1.4px -1.4px 0';

function hashNum(...partes) {
  let h = 2166136261;
  const s = partes.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --------------------------------------------------------- respaldo sin sim.js
function estadoAprox(reg, t) {
  const rs = reg.rondas || [];
  if (!rs.length) return { ronda: 0, piso: 1, tramo: 0, pv: reg.pvInicio || 3, terminado: t >= reg.fin, fraccion: 0 };
  let i = rs.findIndex(r => t < r.t1);
  const terminado = t >= reg.fin || i < 0;
  if (i < 0) i = rs.length - 1;
  const r = rs[i];
  const tp = reg.tPiso || Math.max(1, (r.t1 - r.t0) / Math.max(1, r.pisoFin));
  let piso = terminado ? r.pisoFin : Math.min(Math.max(1, r.pisoFin), 1 + Math.floor((Math.max(t, r.t0) - r.t0) / tp));
  const fallos = (r.fallos || []).filter(f => f < piso || (terminado && f <= piso)).length;
  const pv0 = reg.pvInicio || 3;
  const pv = terminado ? (r.pvFin != null ? r.pvFin : Math.max(0, pv0 - fallos)) : Math.max(0, pv0 - fallos);
  const fr = reg.fin > reg.inicio ? Math.min(1, Math.max(0, (t - reg.inicio) / (reg.fin - reg.inicio))) : 1;
  return { ronda: i, piso, tramo: 0, pv, terminado, fraccion: fr };
}

function detalleAprox(reg, ronda, piso, especies) {
  const r = (reg.rondas || [])[ronda] || {};
  const h = hashNum(reg.semilla || 0, ronda, piso);
  const lista = especies.length ? especies : ['0019'];
  const ok = !(r.fallos || []).includes(piso);
  const n = 2 + (h % 3);
  const golpes = [];
  for (let k = 0; k < n; k++) golpes.push({ de: k % 2 === 0 ? 'equipo' : 'enemigo', i: (h >> (k * 2)) % 3, dmg: 3 + ((h >> (k * 3)) % 17) });
  if (!ok) golpes.push({ de: 'enemigo', i: 0, dmg: 9 + (h % 9) });
  return { enemigo: lista[h % lista.length], golpes, ok };
}

/** Normaliza un golpe del registro a { equipo: bool, i, dmg }. */
function normGolpe(g, k, semilla = 0) {
  if (typeof g === 'number') return { equipo: k % 2 === 0, i: k % 3, dmg: g };
  if (!g || typeof g !== 'object') return { equipo: k % 2 === 0, i: k % 3, dmg: 0 };
  const de = g.de ?? g.atacante ?? g.quien ?? g.lado;
  const equipo = de === 'enemigo' || de === 'e' || de === -1 || de === 'rival' ? false
    : de === undefined ? k % 2 === 0 : true;
  const i = typeof de === 'number' && de >= 0 ? de : (g.idx ?? g.i ?? g.miembro ?? g.a ?? (k % 3));
  // sim.detallePiso no da daño (solo `fuerte`): el número es decorativo y determinista.
  let dmg = g.dmg ?? g.daño ?? g.dano ?? g.d ?? g.n;
  if (dmg == null) dmg = (4 + (hashNum(semilla, k, i) % 9)) * (g.fuerte ? 2 : 1);
  return { equipo, i: Math.abs(i | 0), dmg: Math.round(+dmg || 0), fuerte: !!g.fuerte };
}

function miembrosDe(estado) {
  if (Array.isArray(estado.equipo) && estado.equipo.length) return estado.equipo;
  const s = estado.snapshot || {};
  const l = s.miembros || s.equipo || s.mons || (Array.isArray(s) ? s : []);
  return l.map(m => ({ sp: m.sp || m.esp || m.especie, vr: !!(m.vr || m.vario) })).filter(m => m.sp);
}

export function crear(canvas, opciones = {}) {
  const reloj = S.relojDe(opciones);
  let estado = { registro: null, snapshot: null, ahora: null };
  let sim = opciones.sim || null;
  if (!sim) {
    import('../core/sim.js').then(m => { if (m.estadoEn && m.detallePiso) { sim = m; motor.marcarSucio(); } }).catch(() => { /* sin sim: aproximación */ });
  }
  let equipo = [];
  const cacheDetalle = new Map();
  let vista = null;   // lo calculado en paso() para pintar()
  const dom = { barra: null, numeros: [] };   // elementos de la capa DOM (texto nítido)

  function estadoEn(reg, t) {
    if (sim) { try { const e = sim.estadoEn(reg, t); if (e) return e; } catch (e) { console.warn('estadoEn', e); } }
    return estadoAprox(reg, t);
  }
  function detalle(reg, ronda, piso) {
    const k = ronda + ':' + piso;
    let d = cacheDetalle.get(k);
    if (d) return d;
    if (sim) { try { d = sim.detallePiso(reg, ronda, piso); } catch (e) { console.warn('detallePiso', e); } }
    if (!d) d = detalleAprox(reg, ronda, piso, S.especies());
    let enemigo = d.enemigo;
    if (!enemigo || !S.tieneAnim(enemigo, 'Idle')) {           // sin pool o especie sin sprite
      const l = S.especies();
      enemigo = l.length ? l[hashNum(reg.semilla || 0, ronda, piso) % l.length] : null;
    }
    const sem = hashNum(reg.semilla || 0, ronda, piso);
    d = { enemigo, ok: d.ok !== false, jefe: !!d.jefe, golpes: (d.golpes || []).map((g, k) => normGolpe(g, k, sem)) };
    cacheDetalle.set(k, d);
    // Al empezar el piso, solo lo que se ve al entrar (Walk e Idle); Attack y Hurt a ANTES_ENCUENTRO del choque.
    if (enemigo) S.precargar(enemigo, ['Walk', 'Idle']);
    return d;
  }

  function datosIsla() {
    const i = estado.isla || {};
    const s = estado.snapshot || {};
    const clave = i.clave || (s.isla && s.isla.clave) || s.claveIsla || 'prado';
    const fondo = i.fondo || (s.isla && s.isla.fondo) || FONDOS[clave];
    const reg = estado.registro;
    let F = i.F || (s.isla && s.isla.F) || s.F || (reg && reg.F);
    if (!F && reg && reg.rondas) F = Math.max(1, ...reg.rondas.map(r => r.pisoFin || 1));
    return { clave, fondo, F: F || 1 };
  }

  /** Construye la escena de este instante (posiciones, animaciones, números). */
  function calcular(t, dim) {
    const reg = estado.registro;
    const ahora = estado.ahora != null ? estado.ahora + (t - tRef) : reloj();
    const isla = datosIsla();
    const W = dim.w, H = dim.h;
    const sueloY = H - 10;
    const xLider = Math.round(Math.max(W * 0.42, 60));
    const v = { isla, actores: [], numeros: [], scroll: 0, pv: 0, pv0: 3, piso: 1, F: isla.F, terminado: true, jefe: false, sueloY };
    if (!reg || !equipo.length) return v;
    const e = estadoEn(reg, ahora);
    v.pv = e.pv; v.pv0 = reg.pvInicio || 3; v.piso = e.piso; v.terminado = !!e.terminado;
    const ronda = (reg.rondas || [])[e.ronda] || { t0: reg.inicio, t1: reg.fin };
    const tp = Math.max(1000, reg.tPiso || 30000);
    const tEnRonda = Math.max(0, ahora - (ronda.t0 ?? reg.inicio));
    const tf = v.terminado ? tp : tEnRonda - (e.piso - 1) * tp;
    const fase = Math.max(0, Math.min(tp, tf));
    const det = detalle(reg, e.ronda, e.piso);
    v.jefe = det.jefe || (!!ronda.jefe && e.piso >= isla.F);
    const durAtk = i => S.duracionAnim(i.sp, 'Attack', i.vr) || 600;
    const enem = { sp: det.enemigo, vr: false };
    const golpes = det.golpes;
    let encDur = ENTRADA + SALIDA;
    for (const g of golpes) encDur += durAtk(g.equipo ? equipo[g.i % equipo.length] : enem) + PAUSA_GOLPE;
    encDur = Math.min(encDur, tp * 0.8);
    const andar = tp - encDur;
    const andado = Math.min(fase, andar);
    v.scroll = ((e.ronda * 1000 + e.piso - 1) * andar + andado) * VEL_SUELO / 1000;
    const caminando = !v.terminado && fase < andar;
    // Precarga prudente: Attack/Hurt de todos poco antes del encuentro (S.dibujar pinta Idle si aún no han llegado).
    if (!v.terminado && fase >= andar - ANTES_ENCUENTRO && !det.atkPedido) {
      det.atkPedido = true;
      for (const m of equipo) S.precargar(m.sp, ['Attack', 'Hurt'], m.vr);
      if (det.enemigo) S.precargar(det.enemigo, ['Attack', 'Hurt']);
    }

    // Equipo: líder delante, los otros dos detrás y un poco escalonados.
    const sep = Math.max(14, Math.min(24, Math.round(W * 0.13)));
    const pos = [[xLider, sueloY - 5], [xLider - sep, sueloY - 9], [xLider - sep * 2, sueloY - 2]];
    const base = equipo.map((m, i) => ({ ...m, x: pos[i][0], y: pos[i][1], anim: caminando ? 'Walk' : 'Idle', dir: v.terminado ? 0 : 2, t0: 0, alfa: 1 }));
    let rival = null;

    if (!v.terminado && fase >= andar) {
      const ee = fase - andar;                        // tiempo dentro del encuentro
      const xFin = Math.round(W * 0.72);
      const entra = Math.min(1, ee / ENTRADA);
      rival = { ...enem, x: Math.round(W + 24 - (W + 24 - xFin) * entra), y: sueloY - 4, anim: entra < 1 ? 'Walk' : 'Idle', dir: 6, t0: 0, alfa: 1 };
      let cursor = ENTRADA;
      for (const g of golpes) {
        const atac = g.equipo ? base[g.i % base.length] : rival;
        const obj = g.equipo ? rival : base[0];
        const d = durAtk(atac);
        if (ee >= cursor && ee < cursor + d + PAUSA_GOLPE) {
          const tg = ee - cursor;
          if (tg < d) { atac.anim = 'Attack'; atac.t0 = andar + cursor; }
          const hitMs = S.msHasta(atac.sp, 'Attack', atac.vr);
          if (tg >= hitMs) {
            if (tg - hitMs < DUR_HURT) { obj.anim = 'Hurt'; obj.t0 = andar + cursor + hitMs; }
            const vida = tg - hitMs;
            if (vida < 900 && g.dmg) v.numeros.push({ x: obj.x, y: obj.y - 30 - Math.floor(vida / 60), n: g.dmg, equipo: !g.equipo, alfa: 1 - vida / 900 });
          }
        }
        cursor += d + PAUSA_GOLPE;
      }
      if (ee >= cursor) {
        const s = Math.min(1, (ee - cursor) / SALIDA);
        if (det.ok) { rival.anim = 'Hurt'; rival.t0 = andar + cursor; rival.alfa = 1 - s; }
        else { base[0].anim = 'Hurt'; base[0].t0 = andar + cursor; rival.anim = 'Idle'; }
      }
    }
    v.actores = rival ? [...base, rival] : base;
    v.tFase = fase;
    return v;
  }

  let tRef = 0;
  const impl = {
    escalaCss() { const r = canvas.getBoundingClientRect(); return r.height >= 240 ? 3 : 2; },
    medir() {},
    paso(t) {
      const dim = motor.dim();
      vista = calcular(t, dim);
      let firma = `${Math.round(vista.scroll)}|${vista.pv}|${vista.piso}|${vista.terminado}`;
      for (const a of vista.actores) {
        const f = S.indiceFrame(a.sp, a.anim, a.vr, a.anim === 'Walk' || a.anim === 'Idle' ? t : vista.tFase - a.t0, a.anim === 'Walk' || a.anim === 'Idle');
        firma += `|${a.x},${a.anim[0]}${f}${Math.round(a.alfa * 8)}`;
      }
      for (const n of vista.numeros) firma += `|n${n.y}`;
      return firma;
    },
    pintar(ctx, dim, t) { pintar(ctx, dim, t); },
    tocar() { return { tipo: 'combate' }; },
  };
  const motor = S.motorEscena(canvas, opciones, impl);
  const escena = motor.escena;

  function pintar(ctx, dim, t) {
    const v = vista || calcular(t, dim);
    const { w: W, h: H } = dim;
    // Fondo: suelo de la isla en toda la franja, con una banda superior más oscura (pared).
    rellenar(ctx, v.isla.clave, v.isla.fondo, 0, 0, W + 1, H + 1, v.scroll, 0);
    ctx.fillStyle = 'rgba(20,33,61,.35)'; ctx.fillRect(0, 0, W + 1, Math.round(H * 0.28));
    ctx.fillStyle = 'rgba(20,33,61,.55)'; ctx.fillRect(0, Math.round(H * 0.28), W + 1, 1);
    const orden = [...v.actores].sort((a, b) => a.y - b.y);
    for (const a of orden) {
      const libre = a.anim === 'Walk' || a.anim === 'Idle';
      S.dibujar(ctx, { sp: a.sp, vr: a.vr, anim: a.anim, dir: a.dir, tMs: libre ? t : v.tFase - a.t0, bucle: libre, x: a.x, y: a.y, alfa: a.alfa });
    }
    pintarCorazones(ctx, v);
    pintarBarra(ctx, dim, v);
    pintarNumeros(ctx, dim, v);
  }

  function corazon(ctx, x, y, lleno) {
    const c = lleno ? '#e05a4f' : 'rgba(20,33,61,.6)';
    ctx.fillStyle = '#14213d';
    ctx.fillRect(x, y + 1, 7, 3); ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 4, y, 2, 1); ctx.fillRect(x + 1, y + 4, 5, 1); ctx.fillRect(x + 2, y + 5, 3, 1); ctx.fillRect(x + 3, y + 6, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(x + 1, y + 1, 2, 3); ctx.fillRect(x + 4, y + 1, 2, 3); ctx.fillRect(x + 3, y + 2, 1, 3); ctx.fillRect(x + 2, y + 4, 3, 1);
    if (lleno) { ctx.fillStyle = '#fff3c4'; ctx.fillRect(x + 1, y + 1, 1, 1); }
  }
  function pintarCorazones(ctx, v) {
    for (let i = 0; i < Math.max(v.pv0, v.pv); i++) corazon(ctx, 3 + i * 8, 3, i < v.pv);
  }

  function pintarBarra(ctx, dim, v) {
    const { w: W, h: H } = dim;
    const x = 3, y = H - 5, w = W - 6;
    ctx.fillStyle = '#14213d'; ctx.fillRect(x, y, w, 3);
    const pr = v.F > 0 ? Math.min(1, v.piso / v.F) : 0;
    ctx.fillStyle = '#ffb547'; ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * pr)), 1);
    // Marca del jefe al final.
    ctx.fillStyle = '#e05a4f'; ctx.fillRect(x + w - 2, y - 1, 2, 5);
    // Texto «p. 9/16» en la capa DOM (nítido a cualquier DPR; el búfer está a px de sprite).
    const txt = v.terminado ? `p. ${v.piso}/${v.F} · fin` : `p. ${v.piso}/${v.F}${v.jefe ? ' · jefe' : ''}`;
    if (!dom.barra) {
      dom.barra = document.createElement('span');
      dom.barra.className = 'piso-combate';
      Object.assign(dom.barra.style, {
        position: 'absolute', right: '4px', top: '3px', font: 'bold 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: '#f6efe0', textShadow: CONTORNO, whiteSpace: 'nowrap',
      });
    }
    if (dom.barra.parentNode !== motor.capa.el) motor.capa.el.append(dom.barra);
    if (dom.barra.textContent !== txt) dom.barra.textContent = txt;
  }

  // Números de daño: spans reutilizados en la capa DOM, colocados con transform (px CSS = px de sprite × k).
  function pintarNumeros(ctx, dim, v) {
    const k = dim.k;
    const capa = v.numeros.length || dom.numeros.length ? motor.capa.el : null;
    v.numeros.forEach((n, i) => {
      let s = dom.numeros[i];
      if (!s) {
        s = document.createElement('span');
        Object.assign(s.style, {
          position: 'absolute', left: '0px', top: '0px', font: 'bold 16px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          textShadow: CONTORNO, whiteSpace: 'nowrap', willChange: 'transform, opacity',
        });
        dom.numeros.push(s);
      }
      if (s.parentNode !== capa) capa.append(s);
      const t = String(n.n);
      if (s.textContent !== t) s.textContent = t;
      s.style.color = n.equipo ? '#e05a4f' : '#fff3c4';
      s.style.opacity = String(Math.max(0, Math.min(1, n.alfa)));
      // Centrado en (x, y) como el texto del canvas de antes.
      s.style.transform = `translate(${Math.round(n.x * k)}px, ${Math.round(n.y * k)}px) translate(-50%, -50%)`;
    });
    for (let i = v.numeros.length; i < dom.numeros.length; i++) if (dom.numeros[i].parentNode) dom.numeros[i].remove();
  }

  escena.actualizar = function (nuevo = {}) {
    const regCambia = nuevo.registro && nuevo.registro !== estado.registro;
    estado = { ...estado, ...nuevo };
    if (regCambia) cacheDetalle.clear();
    if ('ahora' in nuevo) tRef = performance.now();
    equipo = miembrosDe(estado);
    for (const m of equipo) S.precargar(m.sp, ['Walk', 'Idle'], m.vr);
    motor.marcarSucio();
  };

  if (opciones.estado) escena.actualizar(opciones.estado);
  return escena;
}

export function montar(canvas, opts = {}) { const e = crear(canvas, opts); e.iniciar(); return e; }
