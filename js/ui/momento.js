// Momento especial sencillo (§9.2.3): fondo oscuro, sprite ×3 (Walk hacia la cámara y Hop), retrato con emoción,
// una línea de texto y botones. Se pasa con el botón principal o tocando en cualquier sitio (tras 600 ms, para no saltarlo
// sin verlo). Con más en cola (params.restantes > 0) enseña «1/n» y «Saltar (n)», que cierra con 'saltar' (main.js quita
// los que quedan salvo los variocolor). Atrás del sistema = botón principal. Dueño: UI.
import { h, boton, retrato, toast } from './componentes.js';
import * as Ficha from '../gfx/scene-ficha.js';
import * as S from '../gfx/sprites.js';
import { capturaCompartir } from '../gfx/fx.js';

export function montar(raiz, app, params, ctl) {
  const m = params.momento;
  const mon = m.uid ? app.game.buscarMon(app.save, m.uid) : null;
  const vr = !!(m.vr || (mon && mon.vr));
  const lienzo = h('canvas', { 'aria-label': app.especie(m.sp).n });
  const ret = retrato(m.sp, { vr, emo: m.emocion || 'Happy', clase: 'g' });
  raiz.append(h('div.escena', lienzo, ret), h('p', { role: 'status' }, m.texto || ''));
  // Hop e Idle precargados desde el principio: el cambio a Hop a los 1400 ms no deja el visor vacío.
  S.precargar(m.sp, ['Walk', 'Hop', 'Idle'], vr);
  const escena = ctl.escena(Ficha.crear(lienzo, { fondo: '#0b1224', estado: { sp: m.sp, vr, anim: 'Walk', dir: 0 } }));
  const tempos = [];
  const red = S.reducirAnim();
  if (!red) {
    tempos.push(setTimeout(() => escena.actualizar({ anim: 'Hop' }), 1400));
    tempos.push(setTimeout(() => escena.actualizar({ anim: 'Idle' }), 1400 + Math.max(600, S.duracionAnim(m.sp, S.animConRespaldo(m.sp, 'Hop', vr), vr) * 2)));
  } else escena.actualizar({ anim: 'Idle' });

  const botones = h('div.botones');
  const principal = m.tipo === 'jefe' ? '¡Adelante!' : m.tipo === 'evolucion' || m.tipo === 'hito' ? '¡Genial!' : '¡Bienvenido!';
  botones.append(boton(principal, () => ctl.cerrar(true), { tipo: 'prim' }));
  if (mon && (m.tipo === 'recluta' || m.tipo === 'variocolor' || m.tipo === 'evolucion')) {
    botones.append(boton('Poner apodo', async () => {
      const t = await app.router.pedirTexto(`Apodo para ${app.especie(mon.sp).n} (máx. 12)`, { valor: mon.ap || '' });
      if (t != null) { app.game.ponerApodo(app.save, mon.id, t); toast(t ? `Ahora se llama ${t}.` : 'Sin apodo.'); }
    }));
  }
  if (m.tipo === 'variocolor') {
    botones.append(boton('Compartir', async () => {
      try {
        const txt = `${app.especie(m.sp).n} variocolor · ${app.save.nombre || 'Farolillo'} · ${app.fmt.fecha(app.ahora())}`;
        const blob = await capturaCompartir(lienzo, txt);
        const file = new File([blob], 'farolillo-variocolor.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Farolillo' });
        else {
          const a = h('a', { href: URL.createObjectURL(blob), download: file.name });
          document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        }
      } catch (e) { if (e && e.name !== 'AbortError') toast('No se pudo compartir.', { error: true }); }
    }));
  }
  // Con tres botones el principal va a todo lo ancho encima (si no, «¡Bienvenido!» no cabía en su tercio).
  if (botones.children.length >= 3) botones.classList.add('tres');
  raiz.append(botones);

  // Toque en cualquier parte (panel o fondo) = siguiente. Los botones secundarios paran la propagación (boton()).
  const BLOQUEO_MS = 600;
  const t0 = performance.now();
  const listo = () => performance.now() - t0 >= BLOQUEO_MS;
  const restantes = Math.max(0, Number(params.restantes) || 0);
  if (restantes > 0) {
    raiz.append(h('div.momento-cab',
      h('span.contador', { 'aria-label': `Momento 1 de ${restantes + 1}` }, `1/${restantes + 1}`),
      boton(`Saltar (${restantes})`, () => ctl.cerrar('saltar'), { extra: 'saltar', titulo: 'Pasar los que quedan (los variocolor se ven igual)' })));
  }
  raiz.append(h('p.pista', 'Toca para seguir'));
  const fondo = raiz.parentElement || raiz;
  const alTocar = (e) => {
    if (!listo()) return;
    if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
    ctl.cerrar(true);
  };
  fondo.addEventListener('click', alTocar);
  app.audio.sonar('recluta');
  return {
    desmontar() { for (const t of tempos) clearTimeout(t); fondo.removeEventListener('click', alTocar); },
    /** Atrás del sistema: como el botón principal (si acaba de salir, se queda). */
    atras() { if (!listo()) return false; ctl.cerrar(true); return true; },
  };
}
