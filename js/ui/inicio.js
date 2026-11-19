// Primer arranque (§9.2.12): título → elegir guía (6) → elegir faro → sale la expedición del tutorial. Dueño: UI.
import { h, poner, boton } from './componentes.js';
import * as Cala from '../gfx/scene-cala.js';
import * as Ficha from '../gfx/scene-ficha.js';

const GUIAS = ['0001', '0004', '0007', '0152', '0155', '0158'];
const FAROS = [['norte', 'Norte'], ['este', 'Este'], ['sur', 'Sur'], ['oeste', 'Oeste']];

export function montar(raiz, app, _p, ctl) {
  const cont = h('div.inicio');
  raiz.append(cont);
  let guia = null, faro = null;
  let escenas = [];
  const arriba = () => { raiz.scrollTop = 0; };
  const limpiarEscenas = () => { for (const e of escenas) { try { e.destruir(); } catch { /* nada */ } } escenas = []; };
  const registrar = (e) => { ctl.escena(e); escenas.push(e); return e; };

  // Reloj de la cala del título: siempre de noche.
  const noche = () => { const d = new Date(app.ahora()); d.setHours(23, 20, 0, 0); return d.getTime() + (Date.now() % 60000); };

  function titulo() {
    limpiarEscenas();
    arriba();
    const lienzo = h('canvas.lienzo-cala', { 'aria-label': 'La cala del faro de noche' });
    poner(cont,
      h('h1', 'Farolillo'),
      h('p.subt', 'La cala del faro'),
      lienzo,
      h('p', { style: { textAlign: 'center', margin: '0' } }, 'Un faro viejo, una cala tranquila y barcas que salen hacia islas cambiantes. ¿Lo encendemos?'),
      boton('Empezar', paso2, { tipo: 'prim', ancho: true }),
    );
    registrar(Cala.crear(lienzo, { reloj: noche, estado: { vecinos: [], farolillos: 3, dorados: 0, visitante: null, soloLectura: true } }));
  }

  function paso2() {
    limpiarEscenas();
    arriba();
    const botones = GUIAS.map((sp) => {
      const c = h('canvas');
      const b = h('button.guia', { type: 'button', 'aria-pressed': String(guia === sp), 'data-sp': sp, on: { click: () => { guia = sp; for (const x of botones) x.setAttribute('aria-pressed', String(x.dataset.sp === sp)); seguir.disabled = false; } } },
        c, h('span', app.especie(sp).n));
      registrar(Ficha.crear(c, { estado: { sp, anim: 'Idle', dir: 0 }, fondo: '#1f3a5f', escala: 2 }));
      return b;
    });
    const seguir = boton('Seguir', paso3, { tipo: 'prim', ancho: true, deshabilitado: !guia });
    poner(cont,
      h('h2', { style: { color: 'var(--farol-400)', textAlign: 'center' } }, 'Elige a tu guía'),
      h('p.subt', 'Será el farero: tu compañero de siempre.'),
      h('div.guias', botones),
      seguir,
    );
  }

  function paso3() {
    limpiarEscenas();
    arriba();
    const txt = app.textos().faros || {};
    const nombre = h('input.txt', { type: 'text', maxlength: 16, placeholder: 'Tu nombre (opcional)', 'aria-label': 'Tu nombre', autocomplete: 'off' });
    const botones = FAROS.map(([id, n]) => h('button.faro-btn', {
      type: 'button', 'aria-pressed': String(faro === id), 'data-faro': id,
      on: { click: () => { faro = id; for (const x of botones) x.setAttribute('aria-pressed', String(x.dataset.faro === id)); encender.disabled = false; } },
    }, h('b', 'Faro ' + n), h('span', (txt[id] || '').replace(/^[^:]*:\s*/, ''))));
    const encender = boton('Encender el faro', () => {
      encender.disabled = true;
      app.crearPartida({ guia, faro, nombre: nombre.value.trim() });
    }, { tipo: 'prim', ancho: true, deshabilitado: !faro });
    poner(cont,
      h('h2', { style: { color: 'var(--farol-400)', textAlign: 'center' } }, '¿Qué faro es el tuyo?'),
      h('p.subt', 'Cambia qué Pokémon encuentras más a menudo.'),
      h('div.faros', botones),
      nombre,
      h('div.botones', boton('‹ Guía', paso2), encender),
    );
  }

  titulo();
  return { desmontar() { limpiarEscenas(); } };
}
