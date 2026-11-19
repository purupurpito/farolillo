// Requisitos y aplicación de evoluciones (§6.8). Sin DOM. Dueño: NÚCLEO.

import { K } from './formulas.js';
import { anotarDiario } from './recruit.js';

/** Nombres visibles de los objetos del juego. */
export const OBJETOS = {
  piedra_hoja: 'Piedra Hoja', piedra_agua: 'Piedra Agua', piedra_lunar: 'Piedra Lunar',
  piedra_ocaso: 'Piedra Ocaso', piedra_fuego: 'Piedra Fuego', piedra_hielo: 'Piedra Hielo',
  piedra_trueno: 'Piedra Trueno', piedra_solar: 'Piedra Solar', piedra_dia: 'Piedra Día',
  piedra_alba: 'Piedra Alba', garra_afilada: 'Garra Afilada', cordon_amistad: 'Cordón Amistad',
  baya_grande: 'Baya Grande',
};

export function nombreObjeto(id) {
  return OBJETOS[id] || id;
}

/** 'dia' (07-19) o 'noche' (19-07) en hora local. */
export function momentoDe(ahora) {
  const h = new Date(ahora).getHours();
  return h >= K.DIA_DESDE && h < K.DIA_HASTA ? 'dia' : 'noche';
}

function cuenta(obj, id) {
  return (obj && obj[id]) || 0;
}

/** Evalúa una regla de evolución para un Mon. via: "normal" | "intercambio". */
function evaluar(regla, mon, save, ahora, via) {
  const o = { a: regla.a, c: regla.c };
  if (regla.it) o.it = regla.it;
  if (regla.momento) o.momento = regla.momento;
  switch (regla.c) {
    case 'nivel': {
      o.lv = regla.lv;
      o.posible = (mon.nv || 1) >= (regla.lv || 1);
      o.falta = o.posible ? '' : `Nivel ${regla.lv}`;
      break;
    }
    case 'piedra': {
      const tiene = cuenta(save.objetos, regla.it) > 0;
      const caramelos = cuenta(save.caramelos, mon.sp) >= K.CARAMELOS_PIEDRA;
      o.posible = tiene || caramelos;
      o.pago = tiene ? 'objeto' : caramelos ? 'caramelos' : null;
      o.falta = o.posible ? '' : `Necesita ${nombreObjeto(regla.it)} (o ${K.CARAMELOS_PIEDRA} caramelos)`;
      break;
    }
    case 'objeto': {
      const tiene = cuenta(save.objetos, regla.it) > 0;
      o.posible = tiene;
      o.pago = tiene ? 'objeto' : null;
      o.falta = tiene ? '' : `Necesita ${nombreObjeto(regla.it)}`;
      break;
    }
    case 'amistad': {
      const car = (mon.car || 0) >= K.CARINO_AMISTAD;
      const mom = !regla.momento || momentoDe(ahora) === regla.momento;
      o.posible = car && mom;
      o.falta = !car ? `Cariño ${K.CARINO_AMISTAD}` : !mom ? (regla.momento === 'dia' ? 'Solo de día (07-19 h)' : 'Solo de noche (19-07 h)') : '';
      break;
    }
    case 'intercambio': {
      if (via === 'intercambio') {
        o.posible = true;
        o.pago = null;
        o.falta = '';
      } else {
        const tiene = cuenta(save.objetos, 'cordon_amistad') > 0;
        o.posible = tiene;
        o.pago = tiene ? 'cordon' : null;
        o.falta = tiene ? '' : `Intercambio o ${nombreObjeto('cordon_amistad')}`;
      }
      break;
    }
    default:
      o.posible = false;
      o.falta = 'No disponible';
  }
  return o;
}

/**
 * Opciones de evolución de un Mon: [{ a, c, it?, lv?, momento?, posible, falta, pago? }].
 * Varias opciones = ramificada (la UI muestra la elección).
 */
export function opcionesEvolucion(mon, save, datos, ahora, via = 'normal') {
  const esp = datos.especies[mon.sp];
  if (!esp || !Array.isArray(esp.evo)) return [];
  return esp.evo
    .filter((r) => datos.especies[r.a])
    .map((r) => evaluar(r, mon, save, ahora, via));
}

/**
 * Evoluciona al Mon uid hacia destino. Gasta el objeto (o 10 caramelos si es piedra, o el
 * Cordón Amistad en las de intercambio en solitario). Conserva apodo, nivel, estrellas,
 * cariño, diario y variocolor; añade la entrada "evo". Lanza Error en castellano si no puede.
 */
export function aplicarEvolucion(save, uid, destino, datos, ahora, via = 'normal') {
  const mon = (save.pokemon || []).find((p) => p.id === uid);
  if (!mon) throw new Error('No encuentro a ese Pokémon.');
  const ops = opcionesEvolucion(mon, save, datos, ahora, via);
  const op = ops.find((o) => o.a === destino);
  if (!op) throw new Error('No puede evolucionar en esa especie.');
  if (!op.posible) throw new Error(`Aún no puede evolucionar: ${op.falta}.`);
  if (op.pago === 'objeto') save.objetos[op.it] -= 1;
  else if (op.pago === 'caramelos') save.caramelos[mon.sp] -= K.CARAMELOS_PIEDRA;
  else if (op.pago === 'cordon') save.objetos.cordon_amistad -= 1;
  const antes = mon.sp;
  mon.sp = destino;
  anotarDiario(mon, ahora, 'evo', { de: antes, a: destino });
  if (save.bitacora) {
    save.bitacora.visto = save.bitacora.visto || {};
    save.bitacora.tenido = save.bitacora.tenido || {};
    if (!save.bitacora.visto[destino]) save.bitacora.visto[destino] = ahora;
    if (!save.bitacora.tenido[destino]) save.bitacora.tenido[destino] = ahora;
  }
  return mon;
}
