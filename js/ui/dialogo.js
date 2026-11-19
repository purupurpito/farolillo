// Diálogo sencillo: confirmar o pedir un texto corto. Dueño: UI.
import { h, boton } from './componentes.js';

export function montar(raiz, app, p, ctl) {
  let input = null;
  if (p.campo) {
    input = h('input.txt', { type: 'text', value: p.valor || '', maxlength: p.max || 12, autocomplete: 'off', 'aria-label': p.texto });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctl.cerrar(input.value); });
  }
  raiz.append(
    h('p', { style: { marginTop: 0 } }, p.texto),
    input,
    input ? h('div.sep') : null,
    h('div.botones',
      boton(p.no || 'Cancelar', () => ctl.cerrar(p.campo ? null : false)),
      boton(p.si || 'Sí', () => ctl.cerrar(p.campo ? input.value : true), { tipo: p.peligro ? 'peligro' : 'prim' })),
  );
  if (input) setTimeout(() => { try { input.focus(); input.select(); } catch { /* nada */ } }, 30);
  return { desmontar() {} };
}
