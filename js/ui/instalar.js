// Instalar en la pantalla de inicio: aviso en la cala y bloque de Ajustes. Dueño: PWA.
// La interfaz lo carga con import() dinámico (y .catch vacío): si falla, no pasa nada.
//   avisoInstalar(app) → Node | null   (null: ya instalada, descartada o sin nada que ofrecer)
//   bloqueAjustes(app) → Node
// Preferencia «No volver a mostrar»: app.ui.instalarNo = true (app.guardarUI()).

import { h, boton, toast } from './componentes.js';
import { estado, instalar, alCambiar } from '../pwa.js';

const DIAS_AVISO_IOS = 7;
// Icono «Compartir» de Safari (cuadro con flecha hacia arriba), en el color del texto.
const ICONO_COMPARTIR = '<svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V1.5M4.5 5 8 1.5 11.5 5M5 8H2.5v8.5h11V8H11"/></svg>';

function descartado(app) { return !!(app && app.ui && app.ui.instalarNo); }

function descartar(app, nodo) {
  if (app && app.ui) { app.ui.instalarNo = true; try { app.guardarUI && app.guardarUI(); } catch { /* nada */ } }
  nodo && nodo.remove();
}

/** Días desde que se creó la partida (0 sin partida). */
function diasDePartida(app) {
  const creado = app && app.save && Number(app.save.creado);
  if (!creado) return 0;
  const ahora = typeof app.ahora === 'function' ? app.ahora() : Date.now();
  return Math.max(0, (ahora - creado) / 86_400_000);
}

/** Se da de baja de alCambiar cuando el nodo sale del documento. */
function vigilar(nodo, fn) {
  const baja = alCambiar((st) => {
    if (nodo.isConnected === false && nodo.dataset.montado) { baja(); return; }
    if (nodo.isConnected) nodo.dataset.montado = '1';
    fn(st);
  });
  return baja;
}

const ESTILO_TARJETA = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: '14px' };

function tarjetaInstalarAndroid(app, cont) {
  cont.replaceChildren(
    h('span', { style: { flex: '1 1 12em' } }, 'Ponlo en tu pantalla de inicio: se abre al momento y funciona sin conexión.'),
    boton('Instalar Farolillo', async () => {
      const r = await instalar();
      if (r === 'accepted') { toast('¡Farolillo instalado!'); cont.remove(); }
    }, { tipo: 'prim' }),
    boton('No volver a mostrar', () => descartar(app, cont), { tipo: 'fino' }));
  cont.hidden = false;
}

/** Aviso discreto para la cala. */
export function avisoInstalar(app) {
  let st;
  try { st = estado(); } catch { return null; }
  if (st.standalone || descartado(app)) return null;

  const cont = h('div.panel.aviso-instalar', { role: 'note', style: ESTILO_TARJETA });

  if (st.ios) {
    if (diasDePartida(app) > DIAS_AVISO_IOS) return null;
    cont.append(
      h('span', { style: { flex: '1 1 12em' } },
        'Juega a pantalla completa y sin conexión: toca ', h('b', 'Compartir'), ' ',
        h('span', { 'aria-hidden': 'true', html: ICONO_COMPARTIR, style: { display: 'inline-block', verticalAlign: '-3px' } }), ' → ', h('b', 'Añadir a pantalla de inicio'), '.'),
      boton('No volver a mostrar', () => descartar(app, cont), { tipo: 'fino' }));
    return cont;
  }

  if (st.puedeInstalar) { tarjetaInstalarAndroid(app, cont); return cont; }

  // Android: Chrome puede ofrecer la instalación unos segundos después. Hueco oculto que se rellena solo.
  if (st.android) {
    cont.hidden = true;
    vigilar(cont, (s) => {
      if (s.standalone || descartado(app)) { cont.remove(); return; }
      if (s.puedeInstalar && cont.hidden) tarjetaInstalarAndroid(app, cont);
      else if (!s.puedeInstalar && !cont.hidden) cont.hidden = true;
    });
    return cont;
  }
  return null;
}

/** Bloque «En este móvil» para Ajustes: guardado protegido, instalar y recordatorio de exportar. */
export function bloqueAjustes(app) {
  const cont = h('div.panel.col.bloque-instalar');
  const pintar = (st) => {
    const prot = st.persistido === true ? 'sí' : st.persistido === false ? 'no' : 'no disponible';
    const hijos = [
      h('h3', 'En este móvil'),
      h('p.peq', { style: { margin: 0 } }, 'Guardado protegido: ', h('b', prot),
        st.persistido === true ? ' (el navegador no lo borrará para hacer sitio).'
          : ' (si falta espacio, el navegador podría borrar la partida; instalar la app ayuda).'),
      h('p.peq', { style: { margin: 0 } }, 'Instalada en la pantalla de inicio: ', h('b', st.standalone ? 'sí' : 'no')),
    ];
    if (!st.standalone && st.puedeInstalar) {
      hijos.push(boton('Instalar Farolillo', async () => {
        const r = await instalar();
        if (r === 'accepted') toast('¡Farolillo instalado!');
        pintar(estado());
      }, { tipo: 'prim', ancho: true }));
    } else if (!st.standalone && st.ios) {
      hijos.push(h('p.peq', { style: { margin: 0 } }, 'Para instalarla: ', h('b', 'Compartir'), ' → ', h('b', 'Añadir a pantalla de inicio'), '.'));
    }
    if (!st.standalone) {
      hijos.push(h('p.peq.suave', { style: { margin: 0 } }, 'Mientras no esté instalada, exporta una copia de la partida de vez en cuando.'));
    }
    cont.replaceChildren(...hijos);
  };
  let st;
  try { st = estado(); } catch { st = { standalone: false, ios: false, android: false, persistido: null, puedeInstalar: false }; }
  pintar(st);
  try { vigilar(cont, pintar); } catch { /* sin pwa.js */ }
  return cont;
}
