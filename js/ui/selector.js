// Selector de miembro (§9.2.5): cuadrícula de retratos con nivel, ▲/=/▼ y el cambio en la probabilidad de jefe
// calculado con prever(…, 40) poco a poco. Orden «Recomendado» por defecto; filtros Libres y Tipo. Dueño: UI.
import { h, poner, boton, retrato, simbolo, icon } from './componentes.js';
import { planLimpio } from './formar.js';

export function montar(raiz, app, p, ctl) {
  const { game, fmt } = app;
  const s = app.save;
  const ctx = app.ctx();
  const isla = p.plan.isla;
  const mist = isla === 'misterio';
  const ocup = game.ocupados(s);
  const reserv = game.reservados(s);
  let soloLibres = true, tipo = '', orden = 'rec';
  const deltas = new Map();
  let cancelado = false;

  const metrica = (pr) => (!pr ? 0 : mist ? pr.pisosMedia : p.plan.modo === 'patrulla' ? pr.vueltasMedia : pr.pJefe);
  const previsionCon = (uid) => {
    const pl = { ...p.planCompleto, equipo: [...p.planCompleto.equipo], roles: [...p.planCompleto.roles] };
    const otro = pl.equipo.indexOf(uid);
    if (otro >= 0 && otro !== p.slot) pl.equipo[otro] = pl.equipo[p.slot];
    pl.equipo[p.slot] = uid;
    const limpio = planLimpio(pl);
    try { return game.prever(s, p.idx, limpio, ctx, 40); } catch { return null; }
  };
  let base = 0;
  try { const lim = planLimpio(p.planCompleto); base = lim.equipo.length ? metrica(game.prever(s, p.idx, lim, ctx, 40)) : 0; } catch { base = 0; }

  const datos = s.pokemon.map((m) => {
    const v = game.ventaja(s, m.id, isla, ctx);
    return { m, v, valor: game.poderDe(s, m.id, ctx) * v.mult, ocupado: ocup.has(m.id), reservado: reserv.has(m.id) };
  });

  // Cabecera fija con ✕: con muchos Pokémon «Cancelar» quedaba 4 pantallas más abajo.
  const titulo = h('div.modal-cab',
    h('h2.crece', p.slot === 0 ? 'Elige al Líder' : `Elige el hueco ${p.slot + 1}`),
    h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Cancelar', on: { click: () => ctl.cerrar(null) } }, '✕'));
  const filtros = h('div.filtros');
  const rejilla = h('div.rejilla');
  // Hoja inferior: filtros y Cancelar al pie, al alcance del pulgar (CSS .hoja-pie, pegado abajo con .pie).
  raiz.append(titulo, rejilla, h('div.pie.hoja-pie', filtros, boton('Cancelar', () => ctl.cerrar(null), { ancho: true })));

  const tiposIds = app.datos.tipos.ids || Object.keys(app.datos.tipos.nombres);
  poner(filtros,
    h('label.chk', { style: { flex: 'none' } }, h('input', { type: 'checkbox', checked: true, on: { change: (e) => { soloLibres = e.target.checked; pintar(); } } }), 'Libres'),
    h('select', { class: 'sel', 'aria-label': 'Filtrar por tipo', on: { change: (e) => { tipo = e.target.value; pintar(); } } },
      h('option', { value: '' }, 'Todos los tipos'), tiposIds.map((t) => h('option', { value: t }, app.datos.tipos.nombres[t]))),
    h('select', { class: 'sel', 'aria-label': 'Ordenar', on: { change: (e) => { orden = e.target.value; pintar(); } } },
      h('option', { value: 'rec' }, 'Recomendado'), h('option', { value: 'nv' }, 'Nivel'), h('option', { value: 'poder' }, 'Poder')));

  const celdas = new Map();
  function celda(d) {
    const { m, v } = d;
    const enPlan = p.planCompleto.equipo.includes(m.id);
    const bloqueado = d.ocupado || d.reservado;
    const dl = h('span.peq', deltaTxt(m.id));
    const c = h('button', {
      class: 'celda' + (bloqueado ? ' atenuado' : ''), type: 'button', 'aria-pressed': String(p.planCompleto.equipo[p.slot] === m.id),
      disabled: bloqueado, title: d.reservado ? 'Reservado para un intercambio' : d.ocupado ? 'De expedición' : null,
      on: { click: () => ctl.cerrar(m.id) },
    },
    retrato(m.sp, { vr: m.vr }),
    h('span.trunca', { style: { maxWidth: '100%' } }, app.nombre(m)),
    h('span', `Nv${m.nv} `, simbolo(v.simbolo), d.reservado ? icon('intercambio') : null, enPlan && p.planCompleto.equipo[p.slot] !== m.id ? ' ⇆' : ''),
    dl);
    celdas.set(m.id, dl);
    return c;
  }

  function deltaTxt(uid) {
    if (!deltas.has(uid)) return '…';
    const d = deltas.get(uid);
    if (mist) return (d >= 0 ? '+' : '') + fmt.d1(d) + ' p.';
    if (p.plan.modo === 'patrulla') return (d >= 0 ? '+' : '') + fmt.d1(d) + ' v.';
    const pc = Math.round(d * 100);
    return (pc > 0 ? '+' : '') + pc + ' %';
  }

  function lista() {
    let l = datos.filter((d) => !soloLibres || (!d.ocupado && !d.reservado));
    if (tipo) l = l.filter((d) => app.especie(d.m.sp).t.includes(tipo));
    if (orden === 'nv') l.sort((a, b) => b.m.nv - a.m.nv || b.valor - a.valor);
    else if (orden === 'poder') l.sort((a, b) => b.valor - a.valor);
    else l.sort((a, b) => (deltas.get(b.m.id) ?? -9) - (deltas.get(a.m.id) ?? -9) || b.valor - a.valor);
    return l;
  }

  function pintar() {
    celdas.clear();
    const l = lista();
    poner(rejilla, l.length ? l.map(celda) : h('p.suave', 'Nadie cumple el filtro.'));
  }

  // Cálculo progresivo de deltas (los mejores primero), sin bloquear.
  const pendientes = datos.filter((d) => !d.ocupado && !d.reservado).sort((a, b) => b.valor - a.valor).map((d) => d.m.id);
  function trozo() {
    if (cancelado) return;
    const t = performance.now();
    while (pendientes.length && performance.now() - t < 24) {
      const uid = pendientes.shift();
      deltas.set(uid, metrica(previsionCon(uid)) - base);
      const el = celdas.get(uid);
      if (el) {
        el.textContent = deltaTxt(uid);
        el.className = 'peq ' + (deltas.get(uid) > 0.005 ? 'delta-up' : deltas.get(uid) < -0.005 ? 'delta-dn' : '');
      }
    }
    if (pendientes.length) setTimeout(trozo, 0);
    else if (orden === 'rec') pintar();
  }
  pintar();
  setTimeout(trozo, 30);
  return { desmontar() { cancelado = true; } };
}
