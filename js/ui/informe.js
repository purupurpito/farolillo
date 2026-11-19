// Informe de regreso (§9.2.2). Dos modos: «pendiente» (al abrir: resumen sacado de los registros y botón Recoger todo)
// e «informe» (lo que devolvió game.recogerTodo/recogerEquipo, con niveles y reclutas ya aplicados). Dueño: UI.
import { h, poner, boton, retrato, toast, vibrar, enviarTodos } from './componentes.js';

export function montar(raiz, app, params, ctl) {
  const { game, fmt } = app;
  let inf = params.informe || null;

  function desdeRegistros() {
    const s = app.save, ctx = app.ctx();
    const equipos = game.equiposDeVuelta(s, ctx).map((i) => {
      const x = s.equipos[i].exp;
      const reg = x.registro;
      let pisoFin = 0, jefe = false;
      const reclutas = [], eventos = [];
      for (const r of reg.rondas || []) {
        pisoFin = Math.max(pisoFin, r.pisoFin || 0);
        if (r.jefe) jefe = true;
        for (const e of r.encuentros || []) reclutas.push({ sp: e.sp, acepta: e.acepta, rar: e.rar, vr: e.vr, nueva: e.acepta && !s.bitacora.tenido[e.sp] });
        for (const e of r.eventos || []) eventos.push(e);
      }
      return { idx: i, isla: x.plan.isla, islaN: app.nombreIsla(x.plan.isla), plan: x.plan, pisoFin, jefe, motivo: reg.motivo,
        monedas: Math.round(reg.totales?.monedas || 0), exp: Math.round(reg.totales?.exp || 0), objetos: { ...(reg.totales?.objetos || {}) },
        eventos, reclutas, nivelesSubidos: null, sps: x.snapshot.miembros.map((m) => [m.sp, m.vr]) };
    });
    return { equipos, cala: { bayas: app.eco.pendienteHuerto(s, ctx.ahora) }, pendiente: true };
  }

  function textoEvento(e) {
    const ev = app.textos().eventos || {};
    let clave = e.tipo;
    if (e.tipo === 'casa') clave = e.datos?.gana ? 'casaGana' : 'casaPierde';
    if (e.tipo === 'kecleon' && !e.datos?.it) clave = 'kecleonNada';
    const l = ev[clave] || [];
    const t = l.length ? l[(e.f | 0) % l.length] : `Evento en el piso ${e.f}`;
    return fmt.plantilla(t, { f: e.f, it: e.datos?.it ? game.nombreObjeto(e.datos.it) : '' });
  }

  function lineaRecluta(r) {
    const n = app.especie(r.sp).n + (r.vr ? ' variocolor' : '');
    if (!r.acepta) return h('li.suave', `${n} se ha fijado en tu equipo`);
    const marca = r.rar === 'R' || r.rar === 'L' || r.nueva || r.vr ? '★ ' : '';
    let txt;
    switch (r.tipo) {
      case 'estrella': txt = `${n}: duplicado fusionado (+1★)`; break;
      case 'caramelo': txt = `${n}: +1 caramelo`; break;
      case 'lleno': txt = `${n} quiere unirse, pero la cala está llena: espera a que decidas`; break;
      default: txt = `${n} se une${r.nueva ? ' (nuevo)' : ''}`;
    }
    return h('li', marca + txt);
  }

  function bloqueEquipo(e) {
    const io = game.islaObj(e.isla, app.ctx()) || { F: e.pisoFin };
    const F = e.plan?.modo === 'patrulla' ? null : (e.plan?.hasta || io.F);
    const motivos = app.textos().motivos || {};
    let estado;
    if (e.motivo === 'rescatado') estado = `rescatados en p.${e.pisoFin}`;
    else if (F) estado = `${e.pisoFin}/${F}${e.jefe ? ' ✔ jefe' : ''}`;
    else estado = `récord p.${e.pisoFin}${e.jefe ? ' ✔ jefe' : ''}`;
    const sps = e.sps || (e.plan?.equipo || []).map((u) => { const m = game.buscarMon(app.save, u); return m ? [m.sp, m.vr] : null; }).filter(Boolean);
    const obj = Object.entries(e.objetos || {}).filter(([, n]) => n > 0);
    return h('div.panel.plano', { style: { marginTop: '8px' } },
      h('div.fila', h('div.mini-retratos', sps.map(([sp, vr]) => retrato(sp, { vr }))),
        h('div.crece', h('b', `E${e.idx + 1} · ${e.islaN} · `), estado,
          h('div.peq.suave', motivos[e.motivo] || ''))),
      h('div', h('b.num', `+${fmt.num(e.monedas)} mon`), obj.length ? ` · ${obj.map(([id, n]) => `${n}× ${game.nombreObjeto(id)}`).join(', ')}` : ''),
      h('div.peq', `EXP +${fmt.num(e.exp)} por miembro`),
      e.nivelesSubidos && e.nivelesSubidos.length
        ? h('ul.limpia.peq', e.nivelesSubidos.map((n) => h('li', `${app.nombre(game.buscarMon(app.save, n.uid)) || app.especie(n.sp).n} Nv${n.de} → ${n.a}`)))
        : null,
      e.reclutas.length ? h('ul.limpia', e.reclutas.map(lineaRecluta)) : h('div.peq.suave', 'Sin reclutas esta vez.'),
      e.eventos.length ? lineaEventos(e.eventos) : null);
  }

  /** Eventos del equipo en una línea desplegable («5 eventos ▸»): con varios equipos el informe era muy largo. */
  function lineaEventos(lista) {
    const n = lista.length;
    return h('details.eventos',
      h('summary', h('span', n === 1 ? '1 evento' : `${n} eventos`), h('span.flecha', { 'aria-hidden': 'true' }, '▸')),
      h('ul.limpia.peq', lista.map((x) => h('li', textoEvento(x)))));
  }

  function pintar() {
    const d = inf || desdeRegistros();
    const pend = !inf;
    const botones = h('div.botones.pie');
    if (pend) {
      botones.append(boton('RECOGER TODO', recogerTodo, { tipo: 'ok' }));
      // Sesión de un minuto: recoger y volver a mandar a todos con un solo toque (mismas reglas que los dos botones).
      if (app.save.tutorial.paso >= 2) {
        botones.append(boton('Recoger y enviar', () => {
          vibrar([15, 40, 15]);
          inf = app.recogerAhora(null);
          enviarTodos(app);
          pintar();
        }, { tipo: 'prim' }));
      }
    } else {
      botones.append(boton('Seguir', () => ctl.cerrar(true), { tipo: 'ok' }));
      const libres = app.save.equipos.map((e, i) => (!e.exp ? i : -1)).filter((i) => i >= 0);
      if (d.equipos.length === 1 && libres.includes(d.equipos[0].idx) && app.save.equipos[d.equipos[0].idx].ultimoPlan) {
        const i = d.equipos[0].idx;
        botones.append(boton('Repetir ↻', () => {
          const r = game.repetir(app.save, i, app.ctx());
          if (r) { app.guardar(true); toast(`Vuelven a las ${fmt.hora(r.fin)}`); } else toast('No se puede repetir.', { error: true });
          ctl.cerrar(true);
        }));
      } else if (libres.length && app.save.tutorial.paso >= 2) {
        botones.append(boton('Enviar a todos', () => { enviarTodos(app); ctl.cerrar(true); }, { tipo: 'prim' }));
      }
    }
    poner(raiz,
      h('h2', pend ? 'Mientras estabas fuera…' : 'Informe'),
      d.equipos.map(bloqueEquipo),
      d.cala && d.cala.bayas ? h('div', { style: { marginTop: '8px' } }, `Cala: +${fmt.plural(d.cala.bayas, "baya", "bayas")} del huerto`) : null,
      botones);
  }
  function recogerTodo() {
    vibrar([15, 40, 15]);
    inf = app.recogerAhora(null);
    pintar();
  }

  pintar();
  return {
    desmontar() {},
    /** Atrás del sistema: en «Mientras estabas fuera…» recoge (su acción por defecto) y se queda con el informe;
     *  en el informe, «Seguir». */
    atras() {
      if (!inf) { recogerTodo(); return false; }
      ctl.cerrar(true);
      return true;
    },
  };
}
