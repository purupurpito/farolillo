// Formar equipo (§9.2.5): isla, 3 huecos con rol, modo, postura, previsión (debounce 150 ms), Sugerir y ENVIAR. Dueño: UI.
import { h, poner, boton, retrato, estrellas, simbolo, chipTipo, barra, toast, intentar } from './componentes.js';
import { composicion } from '../core/formulas.js';
// Previsión y Sugerir en un Worker (mismos resultados que game.prever / game.sugerir; si no hay Worker, síncrono).
import { preverAsync, sugerirAsync } from '../core/prever-async.js';

const ROLES = [['expl', 'Expl.', 'Explorador: su velocidad cuenta doble y más pisos secretos'],
  ['reco', 'Reco.', 'Recolector: más objetos y más encuentros'],
  ['apoyo', 'Apoyo', 'Apoyo: +1 PV y nunca baja de un 15 % de éxito']];
const POSTURAS = [['prudente', 'Prudente'], ['equilibrada', 'Equilibrada'], ['audaz', 'Audaz']];
const CLIMAS = { despejado: 'Despejado', niebla: 'Niebla', calor: 'Calor', tormenta: 'Tormenta', luna: 'Luna llena' };

/** Plan listo para game.js: quita huecos vacíos y alinea roles. */
export function planLimpio(plan) {
  const pares = plan.equipo.map((u, i) => [u, plan.roles[i]]).filter(([u]) => u);
  return { ...plan, equipo: pares.map((p) => p[0]), roles: pares.map((p, i) => (i === 0 ? 'lider' : p[1] || 'expl')) };
}

export function montar(raiz, app, params, ctl) {
  const { game, fmt } = app;
  const s = app.save;
  let idx = params.idx;
  if (idx == null || !s.equipos[idx] || s.equipos[idx].exp) idx = s.equipos.findIndex((e) => !e.exp);
  if (idx < 0) {
    ctl.titulo('Formar equipo');
    raiz.append(h('div.pantalla', h('p', 'Todos los equipos están de expedición.'), boton('Volver', () => ctl.cerrar())));
    return { desmontar() {} };
  }
  ctl.titulo(`Formar equipo · E${idx + 1}`);
  const eq = s.equipos[idx];
  const up = eq.ultimoPlan;
  const ctx0 = app.ctx();
  const islas = game.listaIslas(s, ctx0);
  const abiertas = islas.filter((i) => i.desbloqueada);
  const libre = (u) => u && game.buscarMon(s, u) && game.estaLibre(s, u);

  let islaIni = params.isla ?? up?.isla;
  if (!abiertas.some((i) => i.id === islaIni)) {
    const sinJefe = abiertas.find((i) => i.id !== 'misterio' && !i.jefe);
    islaIni = sinJefe ? sinJefe.id : abiertas.filter((i) => i.id !== 'misterio').pop().id;
  }
  const base = up && up.equipo.some(libre) ? up : { equipo: eq.miembros, roles: eq.roles };
  const plan = {
    isla: islaIni,
    equipo: [0, 1, 2].map((i) => (libre(base.equipo[i]) ? base.equipo[i] : null)),
    roles: [0, 1, 2].map((i) => (i === 0 ? 'lider' : base.roles?.[i] || 'expl')),
    modo: up?.modo || 'vuelta', hasta: up?.hasta || null, horas: up?.horas || 1,
    postura: up?.postura || 'equilibrada', dominio: 0,
  };
  // El Líder no puede quedar vacío si hay otro: se sube.
  compactar();
  ajustarIsla();
  // Huecos vacíos con gente libre (p. ej. tras el tutorial): se rellena con la sugerencia (en el worker, al montar).
  const posibles = Math.min(3, game.libres(s).length);
  const sugerirAlMontar = !plan.equipo[0] || plan.equipo.filter(Boolean).length < posibles;

  const pant = h('div.pantalla.formar');
  const izq = h('div.f-izq.col');
  const der = h('div.f-der.col');
  const carrusel = h('div.carrusel', { role: 'tablist', 'aria-label': 'Islas' });
  const infoIsla = h('div.panel');
  const huecos = h('div.panel.col', { style: { gap: '6px' } });
  const ruta = h('div.panel.col', { style: { gap: '6px' } });
  const prev = h('div.panel.prevision', { 'aria-live': 'polite' });
  const botones = h('div.botones');
  izq.append(carrusel, infoIsla, huecos, ruta);
  der.append(prev, botones);
  pant.append(izq, der);
  raiz.append(pant);

  function compactar() {
    const pares = plan.equipo.map((u, i) => [u, plan.roles[i]]).filter(([u]) => u);
    while (pares.length < 3) pares.push([null, 'expl']);
    plan.equipo = pares.map((p) => p[0]);
    plan.roles = pares.map((p, i) => (i === 0 ? 'lider' : p[1] === 'lider' ? 'expl' : p[1] || 'expl'));
  }

  function islaActual() { return game.islaObj(plan.isla, app.ctx()); }
  function ajustarIsla() {
    const io = islaActual();
    if (plan.isla === 'misterio') plan.modo = 'patrulla';
    if (!plan.hasta || plan.hasta > io.F) plan.hasta = io.F;
  }

  /** Firma del plan: si cambia mientras el worker calcula, la respuesta se descarta (es de un plan viejo). */
  const firmaPlan = () => JSON.stringify([plan.isla, plan.equipo, plan.roles, plan.modo, plan.horas, plan.postura, plan.hasta, idx]);

  // «Sugerir» sin congelar: el botón pasa a «Sugiriendo…» (deshabilitado, aria-busy) hasta que llega la respuesta.
  let sugiriendo = false;
  let vivo = true;
  async function sugerir(silencioso = false) {
    if (sugiriendo) return;
    sugiriendo = true;
    const antes = firmaPlan();
    pintarBotones();
    let r = null;
    try {
      r = await sugerirAsync(s, plan.isla, { modo: plan.modo, horas: plan.horas, postura: plan.postura, hasta: plan.hasta }, app.ctx());
    } catch (e) {
      if (vivo) toast(e.message || String(e), { error: true });
      console.warn(e);
    } finally { sugiriendo = false; }
    if (!vivo) return;
    // El jugador ha tocado el plan mientras tanto: manda lo suyo.
    if (firmaPlan() !== antes) { pintarBotones(); return; }
    if (!r || !r.equipo.length) { if (!silencioso) toast('No hay nadie libre.', { error: true }); pintarBotones(); return; }
    plan.equipo = [0, 1, 2].map((i) => r.equipo[i] || null);
    plan.roles = [0, 1, 2].map((i) => (i === 0 ? 'lider' : r.roles[i] || 'expl'));
    todo();
  }

  function pintarCarrusel() {
    const vis = [];
    let cerrada = false;
    for (const i of islas) {
      if (i.desbloqueada) vis.push(i);
      else if (!cerrada && i.id !== 'misterio') { vis.push(i); cerrada = true; }
    }
    poner(carrusel, vis.map((i) => {
      const b = h('button', {
        class: 'btn', type: 'button', role: 'tab', 'aria-pressed': String(i.id === plan.isla), disabled: !i.desbloqueada,
        title: i.desbloqueada ? null : 'Vence al jefe de la isla anterior',
        on: { click: () => { plan.isla = i.id; plan.hasta = null; ajustarIsla(); todo(); } },
      }, i.desbloqueada ? i.n : `${i.n} (cerrada)`);
      return b;
    }));
    // Centrar la isla elegida solo al montar o al cambiar de isla, y solo en horizontal: scrollIntoView movía
    // también la capa en vertical y cada toque (postura, modo, rol…) devolvía la pantalla arriba del todo.
    if (islaCentrada !== plan.isla) {
      islaCentrada = plan.isla;
      const sel = carrusel.querySelector('[aria-pressed="true"]');
      if (sel) {
        const cr = carrusel.getBoundingClientRect(), sr = sel.getBoundingClientRect();
        carrusel.scrollLeft += (sr.left - cr.left) - (cr.width - sr.width) / 2;
      }
    }
  }
  let islaCentrada = null;

  /** Huellas de la isla (§6.5): especies que se fijaron en el equipo y ahora aceptan mejor (+25/50/75 %). */
  function pintarHuellas(li) {
    const hs = Object.entries(li.huellas || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!hs.length) return null;
    return h('div.huellas', h('span.peq', 'Huellas:'),
      hs.map(([sp, n]) => h('span.huella', { title: `${app.especie(sp).n}: +${n * 25} % de que acepte` },
        retrato(sp, {}), h('span.peq.num', `+${n * 25} %`))));
  }

  function pintarIsla() {
    const io = islaActual();
    const li = islas.find((i) => i.id === plan.isla) || {};
    const tiposN = app.datos.tipos.nombres;
    poner(infoIsla,
      h('div.fila.envuelve', io.tipos.map((t) => chipTipo(t, tiposN)), h('span.peq', '· Clima: ' + (CLIMAS[li.clima] || li.clima || '—'))),
      plan.isla === 'misterio'
        ? h('div.peq', `Récord de la semana: p.${li.pisoMax || 0} · Dificultad igual para todos`)
        // Envuelve: a 320 px «Raro, barra, n/40» no caben tras el récord y el número quedaba encima de la barra.
        : h('div.fila.envuelve.peq', { style: { marginTop: '4px', rowGap: '4px' } },
          h('span', `Récord p.${li.pisoMax || 0}/${io.F}${li.jefe ? ' · jefe ✔' : ''}`),
          h('span.fila', { style: { flex: '1 0 auto', gap: '8px' } },
            h('span', '· Raro'),
            h('span', { style: { width: '72px', flex: 'none' } }, barra((li.piedad || 0) / 40, { titulo: 'Piedad de raros' })),
            h('span.num', `${li.piedad || 0}/40`))),
      plan.isla === 'misterio' ? null : pintarHuellas(li));
  }

  function etiquetaMon(u) {
    const m = game.buscarMon(s, u);
    if (!m) return null;
    const v = game.ventaja(s, u, plan.isla, app.ctx());
    return [retrato(m.sp, { vr: m.vr }),
      h('span.crece.nm', { style: { minWidth: 0 } }, h('b.trunca', app.nombre(m)), h('small', `Nv${m.nv} `, estrellas(m.est))),
      simbolo(v.simbolo)];
  }

  async function elegir(slot) {
    const uid = await app.router.modal('selector', { idx, slot, plan: planLimpio(plan), planCompleto: { ...plan, equipo: [...plan.equipo], roles: [...plan.roles] }, cerrarFuera: true });
    if (!uid) return;
    const otro = plan.equipo.indexOf(uid);
    if (otro >= 0 && otro !== slot) plan.equipo[otro] = plan.equipo[slot];
    plan.equipo[slot] = uid;
    compactar();
    todo();
  }

  function pintarHuecos() {
    const filas = [0, 1, 2].map((i) => {
      const u = plan.equipo[i];
      const rol = i === 0
        ? h('span.rol', 'LÍDER')
        : h('select', { class: 'sel', 'aria-label': `Rol del hueco ${i + 1}`, disabled: !u, on: { change: (e) => { plan.roles[i] = e.target.value; todo(); } } },
          ROLES.map(([v, t, tit]) => h('option', { value: v, selected: plan.roles[i] === v, title: tit }, t)));
      const btn = u
        ? h('button.miembro', { type: 'button', on: { click: () => elegir(i) } }, etiquetaMon(u))
        : h('button.miembro.vacio', { type: 'button', disabled: i > 0 && !plan.equipo[i - 1], on: { click: () => elegir(i) } }, '+ Elegir');
      const quitar = i > 0 && u
        ? h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Quitar del equipo', on: { click: () => { plan.equipo[i] = null; compactar(); todo(); } } }, '✕')
        : h('span', { style: { width: '44px' } });
      return h('div.hueco', rol, btn, quitar);
    });
    const miembros = plan.equipo.filter(Boolean).map((u) => game.buscarMon(s, u));
    const tipos = miembros.map((m) => ({ tipos: app.especie(m.sp).t }));
    const comp = composicion(tipos);
    const syms = plan.equipo.filter(Boolean).map((u) => game.ventaja(s, u, plan.isla, app.ctx()).simbolo);
    poner(huecos, filas,
      h('div.fila.peq.envuelve', h('span', 'Ventaja '), syms.map((x) => simbolo(x)),
        comp.mono ? h('span.chip', 'Monotipo +10 % poder') : null,
        comp.triple ? h('span.chip', 'Variado +10 % botín') : null));
  }

  function pintarRuta() {
    const io = islaActual();
    const mist = plan.isla === 'misterio';
    const modo = h('div.seg', { role: 'group', 'aria-label': 'Modo: una vuelta o patrulla de 1, 4 u 8 horas' },
      mist ? null : h('button', { type: 'button', 'aria-pressed': String(plan.modo === 'vuelta'), on: { click: () => { plan.modo = 'vuelta'; todo(); } } }, 'Una vuelta'),
      [1, 4, 8].map((hh) => h('button', { type: 'button', title: `Patrulla de ${hh} h`, 'aria-pressed': String(plan.modo === 'patrulla' && plan.horas === hh), on: { click: () => { plan.modo = 'patrulla'; plan.horas = hh; todo(); } } }, hh + ' h')));
    const hasta = plan.modo === 'vuelta' && !mist
      ? h('label.fila.peq', 'Hasta el piso ',
        h('select', { class: 'sel', 'aria-label': 'Hasta el piso', on: { change: (e) => { plan.hasta = Number(e.target.value); todo(); } } },
          Array.from({ length: io.F }, (_, k) => io.F - k).map((f) => h('option', { value: f, selected: plan.hasta === f }, f === io.F ? `${f} (jefe)` : String(f)))))
      : h('div.peq.suave', mist ? 'La Misterio se recorre hasta caer o hasta que se acabe el tiempo.' : 'Repiten vueltas completas hasta que se acabe el tiempo.');
    const postura = h('div.seg', { role: 'group', 'aria-label': 'Postura' },
      POSTURAS.map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(plan.postura === v), on: { click: () => { plan.postura = v; todo(); } } }, t)));
    poner(ruta, h('div.peq', mist ? 'Duración' : 'Una vuelta o patrulla'), modo, hasta, h('div.peq', 'Postura'), postura);
  }

  // Previsión (debounce 150 ms) en el worker. Mientras calcula se deja la anterior con la clase «calculando»
  // (y aria-busy) para que no parpadee; la primera vez, «Calculando…». Las respuestas de planes viejos se tiran.
  let tPrev = 0;
  let pedidoPrev = 0;
  function pintarPrevision() {
    if (!prev.childNodes.length) poner(prev, h('div.suave.peq', 'Calculando…'));
    prev.classList.add('calculando');
    prev.setAttribute('aria-busy', 'true');
    clearTimeout(tPrev);
    const yo = ++pedidoPrev;
    tPrev = setTimeout(async () => {
      const pl = planLimpio(plan);
      const listo = () => { prev.classList.remove('calculando'); prev.removeAttribute('aria-busy'); };
      if (!pl.equipo.length) { listo(); poner(prev, h('p', 'Elige al menos un Líder.')); return; }
      let pr = null;
      try { pr = await preverAsync(s, idx, pl, app.ctx(), 200); } catch (e) {
        if (vivo && yo === pedidoPrev) { listo(); poner(prev, h('p', e.message)); }
        return;
      }
      if (!vivo || yo !== pedidoPrev) return;   // llegó tarde: ya se pidió otra
      listo();
      if (!pr) return;
      const io = islaActual();
      const mist = plan.isla === 'misterio';
      const prim = mist
        ? h('div', 'Pisos esperados: ', h('span.grande', fmt.d1(pr.pisosMedia)))
        : plan.modo === 'patrulla'
          ? h('div', 'Vueltas ≈ ', h('span.grande', fmt.d1(pr.vueltasMedia)))
          : plan.hasta === io.F
            ? h('div', 'Vencer al jefe: ', h('span.grande', fmt.pct(pr.pJefe)))
            : h('div', `Llegar al p.${plan.hasta}`);
      poner(prev,
        h('div.fila.envuelve', prim, h('span.peq', `Pisos ≈ ${fmt.d1(pr.pisosMedia)} · Rec ≈ ${fmt.d1(pr.reclutas)}`)),
        h('div', `Mon ≈ ${fmt.num(pr.monedas)} · EXP ≈ ${fmt.num(pr.exp)}/miembro`),
        h('div', h('b', `Vuelven ≈ ${fmt.hora(pr.finMediana)}`), h('span.peq.suave', ` (${fmt.dur(pr.finMediana - app.ahora())})`)));
    }, 150);
  }

  function enviar() {
    const pl = planLimpio(plan);
    const r = intentar(() => game.enviar(s, idx, pl, app.ctx()));
    if (!r) return;
    app.guardar(true);
    app.audio.sonar('recoger');
    toast(`¡En marcha! Vuelven a las ${fmt.hora(r.fin)}`);
    ctl.cerrar();
    app.refrescar();
  }

  function pintarBotones() {
    const sug = boton(sugiriendo ? 'Sugiriendo…' : 'Sugerir', () => sugerir(), { deshabilitado: sugiriendo });
    if (sugiriendo) sug.setAttribute('aria-busy', 'true');
    poner(botones, sug, boton('ENVIAR', enviar, { tipo: 'prim', deshabilitado: !plan.equipo[0] || sugiriendo }));
  }

  function todo() {
    pintarCarrusel();
    pintarIsla();
    pintarHuecos();
    pintarRuta();
    pintarBotones();
    pintarPrevision();
  }
  todo();
  if (sugerirAlMontar) sugerir(true);
  return { desmontar() { vivo = false; clearTimeout(tPrev); } };
}
