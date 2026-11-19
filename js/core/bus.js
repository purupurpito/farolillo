// Bus de eventos internos (sin DOM). Dueño: ESTADO.
// Eventos: save:cambio, informe, momento, aviso, exp:enviada (ver notes/estado.md).

const oyentes = new Map();

export function on(evento, fn) {
  if (!oyentes.has(evento)) oyentes.set(evento, new Set());
  oyentes.get(evento).add(fn);
  return () => off(evento, fn);
}

export function off(evento, fn) {
  const s = oyentes.get(evento);
  if (!s) return;
  if (fn) s.delete(fn); else s.clear();
}

export function emit(evento, datos) {
  const s = oyentes.get(evento);
  if (!s) return;
  for (const fn of [...s]) {
    try { fn(datos); } catch (e) {
      // Un oyente roto no debe romper la acción del juego.
      if (typeof console !== 'undefined') console.error('[bus]', evento, e);
    }
  }
}

/** Quita todos los oyentes (útil en pruebas). */
export function limpiar() { oyentes.clear(); }
