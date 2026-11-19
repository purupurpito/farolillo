// Web Worker para la previsión y «Sugerir equipo» en móviles lentos (§4.8). Dueño: NÚCLEO (lote rendimiento).
// Uso (módulo): new Worker('js/core/worker-prev.js', { type: 'module' }) — lo hace js/core/prever-async.js.
//   postMessage({ id, tipo: 'datos', datos })                         ← una vez: el worker guarda los Datos
//   postMessage({ id, tipo: 'datos', base })                          ← o los carga él por fetch (base + 'data/…')
//   postMessage({ id, tipo: 'preverJuego', save, idx, plan, ctx, n }) = game.prever(save, idx, plan, ctx, n)
//   postMessage({ id, tipo: 'sugerirJuego', save, isla, opciones, ctx }) = game.sugerir(save, isla, opciones, ctx)
//   postMessage({ id, tipo: 'prever', arg: { plan, snapshot, semilla, inicio, ctx }, n })   (sim.prever)
//   postMessage({ id, tipo: 'sugerir', save, isla, opciones, ctx })                         (sim.sugerirEquipo)
//   ← { id, ok: true, res } o { id, ok: false, error, sinDatos? }
// ctx debe ser clonable: { ahora, semana, clima, evento, noche, momento, tiposMisterio, … }. Si no trae `datos`,
// se usan los guardados con 'datos' (así no se clonan ~90 KB en cada mensaje). Mismas funciones y mismas semillas
// que en el hilo principal: los resultados son idénticos.
// Importarlo desde Node o desde la página no hace nada (atender() se puede probar directamente).

import { prever, sugerirEquipo } from './sim.js';
import * as game from './game.js';
import { prepararDatos, cargarDatos } from '../data.js';

let datosGuardados = null;

/** Para pruebas: fija o borra los Datos que usa el worker. */
export function ponerDatos(d) { datosGuardados = d || null; }

function conDatos(ctx) {
  if (!ctx) return ctx;
  if (ctx.datos) return ctx;
  if (!datosGuardados) { const e = new Error('El worker aún no tiene los datos.'); e.sinDatos = true; throw e; }
  return { ...ctx, datos: datosGuardados };
}

export async function atenderAsync(msg) {
  if (msg && msg.tipo === 'datos') {
    const { id } = msg;
    try {
      if (msg.datos) datosGuardados = msg.datos.islaPorId ? msg.datos : prepararDatos(msg.datos);
      else datosGuardados = await cargarDatos(msg.base || new URL('../../', import.meta.url).href);
      return { id, ok: true, res: true };
    } catch (e) {
      return { id, ok: false, error: String((e && e.message) || e), sinDatos: true };
    }
  }
  return atender(msg);
}

export function atender(msg) {
  const { id, tipo } = msg || {};
  try {
    if (tipo === 'preverJuego') return { id, ok: true, res: game.prever(msg.save, msg.idx, msg.plan, conDatos(msg.ctx), msg.n ?? 200) };
    if (tipo === 'sugerirJuego') return { id, ok: true, res: game.sugerir(msg.save, msg.isla, msg.opciones || {}, conDatos(msg.ctx)) };
    if (tipo === 'prever') {
      const arg = msg.arg && msg.arg.ctx && !msg.arg.ctx.datos ? { ...msg.arg, ctx: conDatos(msg.arg.ctx) } : msg.arg;
      return { id, ok: true, res: prever(arg, msg.n ?? 200) };
    }
    if (tipo === 'sugerir') return { id, ok: true, res: sugerirEquipo(msg.save, msg.isla, msg.opciones || {}, conDatos(msg.ctx)) };
    return { id, ok: false, error: `Tipo de mensaje desconocido: ${tipo}` };
  } catch (e) {
    return { id, ok: false, error: String((e && e.message) || e), sinDatos: !!(e && e.sinDatos) };
  }
}

const g = typeof globalThis !== 'undefined' ? globalThis : null;
const esWorker = g && typeof g.WorkerGlobalScope !== 'undefined' && g instanceof g.WorkerGlobalScope;
if (esWorker) {
  g.onmessage = async (ev) => g.postMessage(await atenderAsync(ev.data));
}
