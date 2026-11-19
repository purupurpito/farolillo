// Pantalla Expediciones (§9.2.4): equipos E1-E4 con su estado y «Enviar a todos» (con la sugerencia). Dueño: UI.
import { h, poner, boton, barra, retrato, corazones, toast, vibrar, enviarTodos } from './componentes.js';

export function montar(raiz, app, _p, _ctl) {
  const { game, fmt } = app;
  const pant = h('div.pantalla');
  const cab = h('div.exp-cab');
  const lista = h('div.exp-lista');
  const pie = h('div', { style: { marginTop: '10px' } });
  pant.append(cab, lista, pie);
  raiz.append(pant);
  let firma = '';
  let refs = [];

  function tarjeta(e) {
    const s = app.save;
    const idTxt = h('b.num', 'E' + (e.idx + 1));
    if (e.estado === 'bloqueado') {
      const info = app.eco.infoEdificio(s, 'muelle');
      const nivelNec = e.idx;
      return h('div.panel.tarjeta-eq.bloqueado',
        h('div.cab', idTxt, h('span.crece', 'Bloqueado · Muelle ' + nivelNec),
          (s.base.muelle | 0) === nivelNec - 1 && info.coste != null ? h('span.peq.num', fmt.num(info.coste) + ' mon') : null));
    }
    const mini = h('div.mini-retratos', (e.miembros || []).map((u) => {
      const m = game.buscarMon(s, u);
      return m ? retrato(m.sp, { vr: m.vr }) : null;
    }));
    const nombres = (e.miembros || []).map((u) => app.nombre(game.buscarMon(s, u))).filter(Boolean).join(' · ');
    if (e.estado === 'fuera') {
      const lin = h('div.peq');
      const bar = h('div');
      const pie = h('div.fila');
      const io = game.islaObj(e.isla, app.ctx());
      refs.push(() => {
        const est = game.estadoEquipo(app.save, e.idx, app.ctx());
        const p = est.progreso || { piso: 1, pv: 0, fraccion: 0 };
        const F = e.plan.modo === 'patrulla' ? '∞' : (e.plan.hasta || io?.F);
        poner(lin, `${app.nombreIsla(e.isla)} · piso ${p.piso}/${F}  `, corazones(p.pv, app.save.equipos[e.idx]?.exp?.registro?.pvInicio || 3));
        poner(bar, barra(p.fraccion));
        pie.firstChild && (pie.firstChild.textContent = `≈${fmt.hora(e.fin)} · faltan ${fmt.cuenta(e.fin - app.ahora())}`);
      });
      pie.append(h('span.crece.peq.num', ''), boton('Ver', () => app.router.abrir('encurso', { idx: e.idx })));
      return h('div.panel.tarjeta-eq', h('div.cab', idTxt, mini, h('span.crece.trunca.peq', nombres)), lin, bar, pie);
    }
    if (e.estado === 'vuelta') {
      return h('div.panel.tarjeta-eq',
        h('div.cab', idTxt, mini, h('span.crece', h('span.vuelta', '¡De vuelta!'), e.reclutas ? ` ${e.reclutas} recluta${e.reclutas > 1 ? 's' : ''}` : '')),
        h('div.botones', boton('Recoger', () => { vibrar([15, 40, 15]); app.recoger(e.idx); }, { tipo: 'ok' })));
    }
    const up = e.ultimoPlan;
    return h('div.panel.tarjeta-eq',
      h('div.cab', idTxt, mini, h('span.crece.trunca.peq', nombres || 'Sin miembros')),
      up ? h('div.peq.suave', `Último: ${app.nombreIsla(up.isla)} · ${up.modo === 'patrulla' ? 'patrulla ' + up.horas + ' h' : 'hasta p.' + up.hasta} · ${up.postura}`) : null,
      h('div.botones',
        boton('Formar equipo', () => app.router.abrir('formar', { idx: e.idx }), { tipo: up ? '' : 'prim' }),
        up ? boton('Repetir ↻', () => {
          const r = game.repetir(app.save, e.idx, app.ctx());
          if (r) { app.guardar(true); toast(`Vuelven a las ${fmt.hora(r.fin)}`); app.refrescar(); } else toast('No se puede repetir: falta el Líder o está ocupado.', { error: true });
        }, { tipo: 'prim' }) : null));
  }

  function actualizar() {
    const s = app.save, ctx = app.ctx();
    const eqs = game.equipos(s, ctx);
    const activos = eqs.filter((e) => e.estado !== 'bloqueado');
    const f = eqs.map((e) => e.estado + (e.fin || '') + (e.ultimoPlan ? JSON.stringify(e.ultimoPlan) : '') + (e.miembros || []).join('')).join('|') + s.base.muelle + s.monedas;
    poner(cab, h('h2', `Expediciones (${activos.filter((e) => e.estado !== 'libre').length}/${activos.length})`),
      h('span.chip', { title: 'Clima de la semana en la isla más honda' }, 'Clima: ' + climaTexto(app)));
    if (f !== firma) {
      firma = f;
      refs = [];
      // Solo se enseña el primer equipo bloqueado (el siguiente Muelle).
      const vis = [];
      let bloq = false;
      for (const e of eqs) { if (e.estado === 'bloqueado') { if (bloq) continue; bloq = true; } vis.push(e); }
      poner(lista, vis.map(tarjeta));
      const libres = activos.some((e) => e.estado === 'libre');
      poner(pie, boton('Enviar a todos', () => enviarTodos(app), { tipo: 'prim', ancho: true, deshabilitado: !libres || s.tutorial.paso < 2 }));
    }
    for (const r of refs) r();
  }
  actualizar();
  return { actualizar, latido() { for (const r of refs) r(); }, desmontar() {} };
}

function climaTexto(app) {
  const s = app.save, ctx = app.ctx();
  let m = 1;
  for (const i of app.datos.islas) if (s.islas[i.id]) m = i.id;
  const c = ctx.clima[m];
  const nombres = { despejado: 'Despejado', niebla: 'Niebla', calor: 'Calor', tormenta: 'Tormenta', luna: 'Luna llena' };
  return `${nombres[c] || c} en ${app.nombreIsla(m).split(' ')[0]}`;
}
