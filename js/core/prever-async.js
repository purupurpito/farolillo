// Previsión y «Sugerir» fuera del hilo principal (§4.8). Dueño: NÚCLEO (lote rendimiento).
//   preverAsync(save, idx, plan, ctx, n = 200) → Promise<igual que game.prever>
//   sugerirAsync(save, isla, opciones, ctx)    → Promise<igual que game.sugerir>
// Usa un Worker de módulo (js/core/worker-prev.js) que corre game.prever / game.sugerir con los mismos datos y las
// mismas semillas: los resultados son idénticos a los síncronos. Los Datos se le mandan una sola vez.
// Si no hay Worker, si no arranca (Safari antiguo sin workers de módulo, CSP…), si el mensaje no se puede clonar
// (p. ej. un ctx con funciones) o si tarda demasiado en responder la primera vez, se hace en el hilo principal.
// Las promesas fallan con el mismo Error (mensaje en castellano) que lanzaría la versión síncrona.

import * as game from './game.js';

const ESPERA_ARRANQUE = 4000;   // ms: si el worker no contesta a 'datos' en este tiempo, se usa la vía síncrona

let worker = null;
let estado = 'sin';            // 'sin' | 'arrancando' | 'listo' | 'roto'
let datosEnviados = null;      // objeto Datos que tiene el worker
let sig = 1;
const pendientes = new Map();  // id -> { res, rej, sync }
let motivoRoto = '';

/** Para pruebas y diagnóstico: { estado, motivo }. */
export function estadoWorker() { return { estado, motivo: motivoRoto }; }

/** Fuerza la vía síncrona (pruebas) o la vuelve a permitir. */
export function usarWorker(si = true) {
  if (!si) romper('desactivado');
  else if (estado === 'roto') { estado = 'sin'; motivoRoto = ''; }
}

function romper(motivo) {
  estado = 'roto';
  motivoRoto = String(motivo || '');
  if (worker) { try { worker.terminate(); } catch { /* nada */ } }
  worker = null;
  datosEnviados = null;
  // Lo que estaba en vuelo se resuelve en el hilo principal.
  for (const [id, p] of pendientes) { pendientes.delete(id); correrSync(p.sync, p.res, p.rej); }
}

function correrSync(fn, res, rej) {
  try { res(fn()); } catch (e) { rej(e); }
}

function arrancar() {
  if (estado !== 'sin') return;
  if (typeof Worker === 'undefined') { romper('sin Worker'); return; }
  try {
    worker = new Worker(new URL('./worker-prev.js', import.meta.url), { type: 'module' });
  } catch (e) { romper(e && e.message); return; }
  estado = 'arrancando';
  worker.onmessage = (ev) => {
    const m = ev.data || {};
    const p = pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) { p.res(m.res); return; }
    if (m.sinDatos) { datosEnviados = null; correrSync(p.sync, p.res, p.rej); return; }
    p.rej(new Error(m.error || 'Error en la previsión.'));
  };
  worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); romper((e && e.message) || 'error del worker'); };
  worker.onmessageerror = () => romper('mensaje no clonable');
}

/** Manda un mensaje; si algo falla, `sync()` da el resultado en el hilo principal. */
function pedir(msg, sync) {
  arrancar();
  if (estado === 'roto' || !worker) return new Promise((res, rej) => correrSync(sync, res, rej));
  return new Promise((res, rej) => {
    const datos = msg.ctx && msg.ctx.datos;
    // Los Datos viajan una vez; después el ctx va sin ellos (el worker pone los suyos).
    if (datos && datos !== datosEnviados) {
      const idD = sig++;
      const pD = {
        res: () => { if (estado === 'arrancando') estado = 'listo'; },
        rej: () => {}, sync: () => true,
        timer: estado === 'arrancando' ? setTimeout(() => { if (estado === 'arrancando') romper('el worker no responde'); }, ESPERA_ARRANQUE) : 0,
      };
      pendientes.set(idD, pD);
      try { worker.postMessage({ id: idD, tipo: 'datos', datos }); } catch (e) { pendientes.delete(idD); clearTimeout(pD.timer); romper(e && e.message); correrSync(sync, res, rej); return; }
      datosEnviados = datos;
    }
    const id = sig++;
    const ctx = msg.ctx && msg.ctx.datos ? { ...msg.ctx, datos: undefined } : msg.ctx;
    if (ctx) delete ctx.datos;
    pendientes.set(id, { res, rej, sync });
    try {
      worker.postMessage({ ...msg, id, ctx });
    } catch (e) {
      // DataCloneError (ctx con funciones, save con algo raro…): esta vez en el hilo principal; el worker sigue.
      pendientes.delete(id);
      correrSync(sync, res, rej);
    }
  });
}

/** Igual que game.prever(save, idx, plan, ctx, n), en el worker. */
export function preverAsync(save, idx, plan, ctx, n = 200) {
  return pedir({ tipo: 'preverJuego', save, idx, plan, ctx, n }, () => game.prever(save, idx, plan, ctx, n));
}

/** Igual que game.sugerir(save, isla, opciones, ctx), en el worker. */
export function sugerirAsync(save, isla, opciones = {}, ctx) {
  return pedir({ tipo: 'sugerirJuego', save, isla, opciones, ctx }, () => game.sugerir(save, isla, opciones, ctx));
}
