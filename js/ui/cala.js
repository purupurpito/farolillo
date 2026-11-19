// Pantalla Cala (inicio, §9.2.1): meta, canvas de la cala, equipos, Recoger todo / Enviar a todos. Dueño: UI.
import { h, poner, boton, barra, retrato, toast, vibrar, enviarTodos } from './componentes.js';
import * as Cala from '../gfx/scene-cala.js';

const MAX_VECINOS = 40;

/** Burbuja del guía con una frase de tutorial (descartable). */
export function burbujaGuia(app, clave, texto) {
  if (!texto || (app.ui.burbujas && app.ui.burbujas[clave])) return null;
  // En pantallas bajas el texto se corta a 2 líneas: tocarlo lo despliega entero.
  const p = h('p', { on: { click: () => p.classList.toggle('abierta') } }, texto);
  const b = h('div.burbuja', { 'data-burbuja': clave },
    retrato(app.save.guia, { emo: 'Happy' }),
    p,
    h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Cerrar consejo', on: { click: () => {
      app.ui.burbujas = { ...(app.ui.burbujas || {}), [clave]: 1 };
      app.guardarUI();
      b.remove();
    } } }, '✕'));
  return b;
}

/** Consejo del guía según el momento del tutorial. */
export function consejo(app) {
  const g = app.textos().guia || {};
  const s = app.save, ctx = app.ctx();
  const dv = app.game.equiposDeVuelta(s, ctx).length;
  if (s.tutorial.paso < 2) return dv ? ['tutVuelta', g.tutorialVuelta] : ['tutFuera', g.tutorialFuera];
  if ((s.tutorial.enviadas | 0) === 0) return ['formar', g.formar];
  if ((s.tutorial.enviadas | 0) >= 2 && s.bayas >= 50) return ['bayas', g.bayas];
  if (s.monedas >= 80) return ['mejora', g.mejora];
  return [null, null];
}

export function montar(raiz, app, _p, ctl) {
  const { game, fmt } = app;
  const pant = h('div.pantalla.cala');
  const huecoBurbuja = h('div.hueco-burbuja');
  const meta = h('button.meta', { type: 'button' });
  const lienzo = h('canvas.lienzo-cala', { 'aria-label': 'La cala: arrastra para moverte y toca a un vecino' });
  const avisos = h('div.avisos');
  const equipos = h('div.panel');
  const acciones = h('div.acciones-cala');
  // Tira con el estado de cada equipo, pegada encima de los botones: en pantallas bajas E1 quedaba tapado por el pie.
  const tira = h('div.tira-eq', { 'aria-live': 'off' });
  const huecoInstalar = h('div.hueco-instalar');
  pant.append(
    meta,
    // La burbuja va con el lienzo: en vertical queda debajo; en horizontal, superpuesta a su parte baja.
    h('div.col-izq', lienzo, huecoBurbuja),
    h('div.col-der.col', avisos, equipos, huecoInstalar, h('div.pie-cala', tira, acciones)),
  );
  raiz.append(pant);

  // Escala ×3 solo con mucho alto: con ×3 en ~240 px los evolucionados grandes no caben (ver notes/graficos.md).
  const escena = ctl.escena(Cala.crear(lienzo, { reloj: app.ahora, get escala() { return lienzo.clientHeight >= 320 ? 3 : 2; } }));
  escena.alTocar((info) => {
    if (info.tipo === 'vecino') {
      const r = game.tocarVecino(app.save, info.uid, app.ctx());
      escena.reaccionar(info.uid, { frase: r.frase, emocion: 'Happy' });
      app.audio.sonar('toque');
      if (r.subio) toast(`${app.nombre(game.buscarMon(app.save, info.uid))}: ♥ ${r.cariño}`);
    } else if (info.tipo === 'faro') {
      app.router.irTab('gremio', { sub: 'faro' });
    }
  });

  let firmaVec = '', firmaEq = '';
  let refsEq = [];

  function pintarVecinos() {
    const s = app.save;
    const o = game.ocupados(s);
    const lista = s.pokemon.filter((m) => !o.has(m.id))
      .sort((a, b) => (b.fav - a.fav) || (b.car - a.car)).slice(0, MAX_VECINOS);
    const tenidos = Object.keys(s.bitacora.tenido).length;
    const dorados = s.pokemon.filter((m) => m.vr).length;
    const f = lista.map((m) => m.id + m.sp + (m.vr ? 1 : 0) + (m.fav ? 1 : 0)).join(',') + '|' + tenidos + '|' + dorados;
    if (f === firmaVec) return;
    firmaVec = f;
    escena.actualizar({
      vecinos: lista.map((m) => ({ uid: m.id, sp: m.sp, vr: !!m.vr, fav: !!m.fav })),
      farolillos: Math.floor(tenidos / 10), dorados, visitante: null, soloLectura: false,
    });
  }

  function pintarEquipos() {
    const ctx = app.ctx();
    const lista = game.equipos(app.save, ctx).filter((e) => e.estado !== 'bloqueado');
    const f = lista.map((e) => e.estado + (e.isla || '') + (e.fin || '') + (e.ultimoPlan ? 1 : 0) + (e.miembros || []).join('')).join('|');
    if (f !== firmaEq) {
      firmaEq = f;
      refsEq = [];
      poner(equipos, lista.map((e) => filaEquipo(e)));
    }
    for (const r of refsEq) r();
    pintarTira(lista);
  }

  let firmaTira = '';
  function pintarTira(lista) {
    // Solo hace falta cuando hay más de un equipo (con uno, su fila ya está a la vista sobre los botones).
    const partes = lista.length < 2 ? [] : lista.map((e) => {
      const id = 'E' + (e.idx + 1);
      if (e.estado === 'fuera') return [id, '≈' + fmt.hora(e.fin), ''];
      if (e.estado === 'vuelta') return [id, '¡de vuelta!', 'vuelta'];
      return [id, 'libre', 'suave'];
    });
    const f = partes.map((p) => p.join(':')).join('|');
    if (f === firmaTira) return;
    firmaTira = f;
    poner(tira, partes.map(([id, txt, cls]) => h('span.t-eq', h('b', id), h('span', { class: cls || null }, txt))));
  }

  function filaEquipo(e) {
    const id = h('span.eq-id', 'E' + (e.idx + 1));
    if (e.estado === 'fuera') {
      const bar = h('div');
      const hora = h('span.peq.num');
      const txt = h('div.trunca.peq');
      refsEq.push(() => {
        const est = game.estadoEquipo(app.save, e.idx, app.ctx());
        poner(bar, barra(est.progreso ? est.progreso.fraccion : 0));
        const p = est.progreso;
        const io = game.islaObj(e.isla, app.ctx());
        txt.textContent = `${app.nombreIsla(e.isla)} · p.${p ? p.piso : 1}/${e.plan.modo === 'patrulla' ? '∞' : (e.plan.hasta || io?.F)}`;
        hora.textContent = '≈' + fmt.hora(e.fin);
      });
      return h('div.equipo-fila', { role: 'button', tabindex: 0, style: { cursor: 'pointer' }, on: { click: () => app.router.abrir('encurso', { idx: e.idx }) } },
        id, h('div.col', { style: { gap: '4px' } }, txt, bar), hora);
    }
    if (e.estado === 'vuelta') {
      return h('div.equipo-fila', id,
        h('div.trunca', h('span.vuelta', '¡DE VUELTA!'), e.reclutas ? h('span.peq', ` ${e.reclutas} recluta${e.reclutas > 1 ? 's' : ''}`) : null),
        boton('Recoger', () => { vibrar([15, 40, 15]); app.recoger(e.idx); }, { tipo: 'ok' }));
    }
    // libre
    const nombres = (e.miembros || []).map((u) => app.nombre(game.buscarMon(app.save, u))).filter(Boolean);
    return h('div.equipo-fila', id,
      h('div.trunca.peq', nombres.length ? 'En la cala: ' + nombres.join(' · ') : 'Equipo libre'),
      // Tras el tutorial el consejo dice «Elige isla y equipo… pulsa ENVIAR»: se ofrece Formar, no Repetir.
      e.ultimoPlan && (app.save.tutorial.enviadas | 0) > 0
        ? boton('Repetir ↻', () => { const r = game.repetir(app.save, e.idx, app.ctx()); if (r) { app.guardar(true); toast(`Vuelven a las ${fmt.hora(r.fin)}`); } else app.router.abrir('formar', { idx: e.idx }); })
        : boton('Formar', () => app.router.abrir('formar', { idx: e.idx }), { tipo: 'prim' }));
  }

  function pintarResto() {
    const s = app.save, ctx = app.ctx();
    const m = game.metaSiguiente(s, ctx);
    // La flecha solo si tocar lleva a otra pantalla (en el tutorial la meta es la propia cala).
    const vaAOtra = m.destino.pantalla !== 'cala';
    poner(meta, h('span.crece.trunca', m.texto), vaAOtra ? h('span', { 'aria-hidden': 'true' }, '›') : null);
    meta.classList.toggle('sin-destino', !vaAOtra);
    meta.onclick = () => {
      if (m.destino.pantalla === 'formar') {
        const libre = s.equipos.findIndex((e) => !e.exp);
        if (libre >= 0) app.router.abrir('formar', { idx: libre, isla: m.destino.isla });
        else app.router.irTab('expediciones');
      }
    };
    const av = (app.avisos || []).filter((a) => a.tipo !== 'vuelta');
    poner(avisos, av.map((a) => h('button.aviso', { type: 'button', on: { click: () => {
      const [t, sub] = String(a.destino).split(':');
      app.router.irTab(t, { sub });
    } } }, a.texto)));
    poner(huecoInstalar, avisoInstalar());
    const [clave, texto] = consejo(app);
    poner(huecoBurbuja, clave ? burbujaGuia(app, clave, texto) : null);
    const dv = game.equiposDeVuelta(s, ctx).length;
    const huerto = app.eco.pendienteHuerto(s, ctx.ahora);
    const libres = s.equipos.some((e) => !e.exp);
    poner(acciones,
      boton(dv ? `Recoger todo (${dv})` : 'Recoger todo', () => { vibrar([15, 40, 15]); app.recoger(); }, { tipo: dv ? 'ok' : '', deshabilitado: !dv && huerto < 1, titulo: huerto ? `Huerto: ${fmt.plural(huerto, "baya", "bayas")}` : null }),
      boton('Enviar a todos', () => enviarTodos(app), { tipo: 'prim', deshabilitado: !libres || s.tutorial.paso < 2 }));
  }

  // Aviso de instalación (lote PWA, js/ui/instalar.js): solo fuera del tutorial, en su hueco bajo los equipos (el pie con
  // los botones es sticky y no se mueve; en horizontal queda al final de la columna). Si el módulo no existe, nada.
  let nodoInstalar = null, pedidoInstalar = false;
  function avisoInstalar() {
    if (app.save.tutorial.paso < 2) return null;
    if (!pedidoInstalar) {
      pedidoInstalar = true;
      import('./instalar.js')
        .then((m) => { nodoInstalar = (m && typeof m.avisoInstalar === 'function' && m.avisoInstalar(app)) || null; if (nodoInstalar) pintarResto(); })
        .catch(() => {});
    }
    // Descartado («No volver a mostrar» marca app.ui.instalarNo y quita el nodo): no se vuelve a poner. Si está oculto
    // (Android aún sin el aviso de Chrome) se deja puesto: él solo se enseña cuando toque.
    if (!(nodoInstalar instanceof Node) || (app.ui && app.ui.instalarNo)) return null;
    return nodoInstalar;
  }

  function actualizar() { pintarVecinos(); pintarEquipos(); pintarResto(); }
  actualizar();
  return {
    actualizar,
    latido() { pintarEquipos(); },
    desmontar() {},
  };
}
