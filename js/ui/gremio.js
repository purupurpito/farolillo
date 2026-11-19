// Gremio (§9.2.8): sub-pestañas Pokémon (lista, orden, filtros, Igualar) y Faro (5 edificios con Mejorar). Dueño: UI.
import { h, poner, boton, retrato, estrellas, icon, toast } from './componentes.js';
import { tasaHuerto } from '../core/formulas.js';

const ORDENES = [['nv', 'Nivel'], ['car', 'Cariño'], ['poder', 'Poder'], ['llegada', 'Llegada']];
const FILTROS = [['todos', 'Todos'], ['libres', 'En la cala'], ['fuera', 'De expedición'], ['evo', 'Pueden evolucionar'], ['fav', 'Favoritos']];

export function montar(raiz, app, params, _ctl) {
  const { game, fmt, eco } = app;
  const pant = h('div.pantalla');
  raiz.append(pant);
  let sub = params.sub === 'faro' ? 'faro' : 'pokemon';
  let orden = 'nv', filtro = 'todos';

  function cabecera() {
    return h('div.seg', { style: { marginBottom: '8px' } },
      h('button', { type: 'button', 'aria-pressed': String(sub === 'pokemon'), on: { click: () => { sub = 'pokemon'; firma = ''; actualizar(); } } }, `Pokémon (${app.save.pokemon.length})`),
      h('button', { type: 'button', 'aria-pressed': String(sub === 'faro'), on: { click: () => { sub = 'faro'; firma = ''; actualizar(); } } }, 'Faro'));
  }

  function puedeEvo(m, ctx) {
    if (m.noEvo) return false;
    try { return game.opcionesEvolucion(app.save, m.id, ctx).some((o) => o.posible); } catch { return false; }
  }

  function pokemon() {
    const s = app.save, ctx = app.ctx();
    const ocup = game.ocupados(s), res = game.reservados(s);
    let l = s.pokemon.map((m) => ({ m, poder: game.poderDe(s, m.id, ctx), evo: puedeEvo(m, ctx), fuera: ocup.has(m.id) }));
    if (filtro === 'libres') l = l.filter((x) => !x.fuera);
    if (filtro === 'fuera') l = l.filter((x) => x.fuera);
    if (filtro === 'evo') l = l.filter((x) => x.evo);
    if (filtro === 'fav') l = l.filter((x) => x.m.fav);
    const cmp = { nv: (a, b) => b.m.nv - a.m.nv || b.m.xp - a.m.xp, car: (a, b) => b.m.car - a.m.car, poder: (a, b) => b.poder - a.poder, llegada: (a, b) => b.m.f - a.m.f }[orden];
    l.sort((a, b) => (b.m.fav - a.m.fav) || cmp(a, b));
    return [
      h('div.filtros',
        h('select', { class: 'sel', 'aria-label': 'Ordenar', on: { change: (e) => { orden = e.target.value; firma = ''; actualizar(); } } },
          ORDENES.map(([v, t]) => h('option', { value: v, selected: orden === v }, 'Orden: ' + t))),
        h('select', { class: 'sel', 'aria-label': 'Filtrar', on: { change: (e) => { filtro = e.target.value; firma = ''; actualizar(); } } },
          FILTROS.map(([v, t]) => h('option', { value: v, selected: filtro === v }, t))),
        boton('Igualar', () => {
          const r = game.igualar(s, ctx);
          if (r.gastadas) { app.guardar(true); toast(`Igualar: ${fmt.plural(r.gastadas, "baya", "bayas")}, ${r.subidos} nivel${r.subidos === 1 ? '' : 'es'}.`); }
          else toast('No hay bayas suficientes para subir a nadie.');
        }, { titulo: 'Reparte bayas entre los 6 de menor nivel' })),
      h('div.peq.suave', { style: { margin: '-2px 0 6px' } }, `${fmt.plural(s.bayas, "baya", "bayas")} · tope de nivel ${game.tope(s)}`),
      h('div.lista-mon', l.length ? l.map(({ m, poder, evo, fuera }) => h('button.fila-mon', { type: 'button', on: { click: () => app.router.abrir('ficha', { uid: m.id }) } },
        retrato(m.sp, { vr: m.vr }),
        h('div', { style: { minWidth: 0 } },
          h('div.trunca', h('b', app.nombre(m)), m.ap ? h('span.peq.suave', ' ' + app.especie(m.sp).n) : null,
            m.vr ? [' ', icon('vario', 'ico-i', 'variocolor')] : null, res.has(m.id) ? [' ', icon('intercambio', 'ico-i', 'en intercambio')] : null,
            evo ? [' ', icon('evolucion', 'ico-i', 'puede evolucionar')] : null, m.fav ? h('span', { title: 'Favorito' }, ' ☆') : null),
          h('div.peq', `Nv${m.nv} `, estrellas(m.est), ` ♥${m.car}`, fuera ? h('span.suave', ' · de expedición') : null)),
        h('div.lado.num', `P ${Math.round(poder)}`))) : h('p.suave', 'Nadie con ese filtro.')),
    ];
  }

  function efecto(id, nivel) {
    const s = app.save;
    const j = game.jefesVencidos(s);
    switch (id) {
      case 'huerto': return `${fmt.num(Math.round(tasaHuerto(nivel, j)))} bayas/h`;
      case 'despensa': return `Guarda hasta ${8 + nivel} h fuera`;
      case 'muelle': return `${1 + nivel} equipo${nivel ? 's' : ''}`;
      case 'linterna': return `+${3 * nivel} % de poder`;
      case 'taberna': return `−${2 * nivel} % de duración`;
      default: return '';
    }
  }

  function faro() {
    const s = app.save, ctx = app.ctx();
    const pend = eco.pendienteHuerto(s, ctx.ahora);
    return [
      h('div.peq.suave', { style: { marginBottom: '6px' } }, `Huerto: ${fmt.num(pend)} ${pend === 1 ? "baya esperando" : "bayas esperando"} (se recogen con «Recoger todo») · tope ${eco.topeHoras(s)} h fuera`),
      eco.EDIFICIOS.map((id) => {
        const inf = eco.infoEdificio(s, id);
        return h('div.panel.edificio',
          h('div', h('b', inf.n), h('span.peq', ` Nv ${inf.nivel}`),
            h('div.peq', 'Ahora: ' + efecto(id, inf.nivel) + (inf.alTope ? '' : ` → ${efecto(id, inf.nivel + 1)}`))),
          inf.alTope ? h('span.chip', 'Al tope')
            : boton([h('span', 'Mejorar'), h('span.sub', `${fmt.num(inf.coste)} mon`)], () => {
              if (game.mejorar(s, id, app.ctx())) { app.guardar(true); app.audio.sonar('recoger'); toast(`${inf.n} sube a nivel ${inf.nivel + 1}.`); }
              else toast('No te llegan las monedas.', { error: true });
            }, { tipo: inf.asequible ? 'prim' : '', deshabilitado: !inf.asequible, extra: 'col' }));
      }),
      h('p.peq.suave', 'Misiones diarias: llegan en la próxima versión.'),
    ];
  }

  let firma = '';
  function actualizar() {
    const s = app.save;
    const f = sub + '|' + s.monedas + '|' + s.bayas + '|' + JSON.stringify(s.base) + '|' + s.pokemon.map((m) => m.id + m.sp + m.nv + m.car + m.est + (m.fav ? 1 : 0) + m.ap + (m.noEvo ? 1 : 0)).join(',') + '|' + s.equipos.map((e) => (e.exp ? e.exp.fin : 0)).join(',');
    if (f === firma) return;
    firma = f;
    const v = document.getElementById('vista');
    const y = v.scrollTop;
    poner(pant, cabecera(), sub === 'pokemon' ? pokemon() : faro());
    v.scrollTop = y;
  }
  actualizar();
  return { actualizar, desmontar() {}, sub(x) { sub = x === 'faro' ? 'faro' : 'pokemon'; firma = ''; actualizar(); } };
}

