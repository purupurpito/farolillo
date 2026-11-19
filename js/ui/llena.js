// Cala llena (§3.8): un recluta quería unirse con 400 en la cala. «Liberar a otro» (elige a quién y se abre su
// ficha, donde se libera con confirmación) o «Dejarlo ir». Se cierra con { liberar: uid } | 'ir' | null. Dueño: UI.
import { h, poner, boton, retrato } from './componentes.js';

export function montar(raiz, app, params, ctl) {
  const { game } = app;
  const s = app.save;
  const p = game.pendientesLleno(s)[params.indice || 0];
  if (!p) { setTimeout(() => ctl.cerrar(null), 0); return { desmontar() {} }; }
  const nombre = app.especie(p.sp).n + (p.vr ? ' variocolor' : '');
  const quedan = game.pendientesLleno(s).length;

  function aviso() {
    poner(raiz,
      h('h2', 'La cala está llena'),
      h('div.fila', retrato(p.sp, { vr: p.vr, emo: 'Happy' }),
        h('p.crece', { style: { margin: 0 } }, `${nombre} (Nv${p.nv}) quiere unirse, pero ya hay ${s.pokemon.length}/${game.MAX_POKEMON} en la cala.`)),
      quedan > 1 ? h('p.peq.suave', `Hay ${quedan} esperando sitio.`) : null,
      h('div.botones.pie',
        boton('Liberar a otro', elegir, { tipo: 'prim' }),
        boton('Dejarlo ir', async () => {
          const ok = await app.router.confirmar(`¿Dejar ir a ${nombre}? No volverá.`, { si: 'Dejarlo ir', peligro: !!p.vr });
          if (ok) ctl.cerrar('ir');
        })));
  }

  function elegir() {
    const ocup = game.ocupados(s), reserv = game.reservados(s);
    const lista = s.pokemon
      .filter((m) => m.de !== 'faro' && !ocup.has(m.id) && !reserv.has(m.id))
      .sort((a, b) => (a.fav - b.fav) || (a.vr - b.vr) || ((a.est || 0) - (b.est || 0)) || (a.nv - b.nv));
    poner(raiz,
      h('div.modal-cab', h('h2.crece', '¿A quién liberas?'), boton('Volver', aviso)),
      h('p.peq.suave', 'Se abre su ficha: allí se libera (con confirmación). Liberar no da nada a cambio.'),
      h('div.rejilla', lista.map((m) => h('button.celda', { type: 'button', on: { click: () => ctl.cerrar({ liberar: m.id }) } },
        retrato(m.sp, { vr: m.vr }),
        h('span.trunca', { style: { maxWidth: '100%' } }, app.nombre(m)),
        h('span.peq', `Nv${m.nv}${m.fav ? ' ★' : ''}`)))));
    raiz.scrollTop = 0;
  }

  // Atrás del sistema: desde la lista vuelve al aviso; en el aviso no decide nada (dejarlo ir no tiene vuelta atrás).
  aviso();
  return {
    desmontar() {},
    atras() { if (raiz.querySelector('.rejilla')) aviso(); return false; },
  };
}
