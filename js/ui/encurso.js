// Expedición en curso (§9.2.6): desfile en canvas, PV, piso, P / D / p y «Vuelven ≈ HH:MM» con «Recordármelo» (.ics).
// Los reclutas y objetos no se enseñan hasta el informe. Dueño: UI.
import { h, poner, boton, corazones, barra, vibrar } from './componentes.js';
import * as Combate from '../gfx/scene-combate.js';
import { dificultad, dificultadMisterio, probPiso, K } from '../core/formulas.js';

export function montar(raiz, app, params, ctl) {
  const { game, fmt } = app;
  const idx = params.idx;
  ctl.titulo(`Expedición · E${idx + 1}`);
  const pant = h('div.pantalla.encurso');
  const lienzo = h('canvas.lienzo-combate', { 'aria-label': 'El equipo avanzando por la mazmorra' });
  const info = h('div.panel.col', { style: { gap: '4px' } });
  const acciones = h('div.botones');
  pant.append(lienzo, h('div.col', info, acciones));
  raiz.append(pant);

  const exp = app.save.equipos[idx]?.exp;
  if (!exp) { poner(info, 'Este equipo no está de expedición.'); return { desmontar() {} }; }
  const io = game.islaObj(exp.plan.isla, app.ctx());
  const escena = ctl.escena(Combate.crear(lienzo, { reloj: app.ahora }));
  escena.actualizar({
    registro: exp.registro, snapshot: exp.snapshot,
    isla: { clave: io.clave, fondo: io.fondo, F: io.F },
    equipo: exp.snapshot.miembros.map((m) => ({ sp: m.sp, vr: m.vr })),
  });

  let hecho = null;
  function latido() {
    const e = app.save.equipos[idx]?.exp;
    if (!e) { poner(info, 'El equipo ya está en la cala.'); poner(acciones, boton('Volver', () => ctl.cerrar())); return; }
    const est = game.estadoEquipo(app.save, idx, app.ctx());
    const p = est.progreso || { piso: 1, pv: e.registro.pvInicio, fraccion: 0 };
    const reg = e.registro;
    const mist = e.plan.isla === 'misterio';
    const D = mist ? dificultadMisterio(p.piso, 1) : dificultad(io, p.piso, e.plan.dominio || 0, 1);
    const apoyo = (e.plan.roles || []).includes('apoyo');
    const P = reg.P ?? 0;
    const pr = probPiso(P, D, apoyo ? K.P_MIN_APOYO : K.P_MIN);
    const F = e.plan.modo === 'patrulla' ? (mist ? '∞' : io.F) : e.plan.hasta;
    const nombres = e.snapshot.miembros.map((m) => m.ap || m.n).join(' · ');
    poner(info,
      h('div.fila', h('b.crece.trunca', `${io.n}`), corazones(p.pv, reg.pvInicio)),
      h('div.peq.trunca', nombres),
      h('div', `Piso ${p.piso}/${F}${e.plan.modo === 'patrulla' ? ` · vuelta ${(p.ronda | 0) + 1}` : ''}`),
      barra(p.fraccion),
      h('div.peq.num', `P ${fmt.num(P)} · D ${fmt.num(D)} · p ${fmt.pct(pr)}`),
      h('div', h('b', `Vuelven ≈ ${fmt.hora(e.fin)}`), h('span.peq.suave', ` · faltan ${fmt.cuenta(e.fin - app.ahora())}`)));
    const vuelta = app.ahora() >= e.fin;
    if (hecho !== vuelta) {
      hecho = vuelta;
      poner(acciones,
        vuelta ? boton('Recoger', async () => { vibrar([15, 40, 15]); ctl.cerrar(); await app.recoger(idx); }, { tipo: 'ok' })
          : boton('Recordármelo', () => descargarIcs(e.fin, io.n, idx)),
        boton('Volver', () => ctl.cerrar()));
    }
  }
  latido();
  return { latido, actualizar: latido, desmontar() {} };
}

function descargarIcs(fin, isla, idx) {
  const f = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Farolillo//ES', 'BEGIN:VEVENT',
    `UID:farolillo-${fin}-${idx}`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(fin)}`, `DTEND:${f(fin + 5 * 60000)}`,
    `SUMMARY:Farolillo: vuelve el equipo E${idx + 1} de ${isla}`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY',
    'DESCRIPTION:Equipo de vuelta', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'farolillo-vuelta.ics';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
