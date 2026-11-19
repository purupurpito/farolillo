// Ficha de Pokémon (§9.2.9): visor de animaciones, datos, bayas, evolución, apodo, diario y créditos del sprite. Dueño: UI.
import { h, poner, boton, retrato, estrellas, chipTipo, barra, toast, intentar } from './componentes.js';
import * as Ficha from '../gfx/scene-ficha.js';
import * as S from '../gfx/sprites.js';
import { expSig } from '../core/formulas.js';

const STATS = ['PS', 'At', 'De', 'AE', 'DE', 'Ve'];
/** Nombres visibles de las animaciones de PMDCollab (con el original como respaldo). */
const ANIMS = { Idle: 'Quieto', Walk: 'Andar', Attack: 'Ataque', Hurt: 'Daño', Sleep: 'Dormir', Hop: 'Salto', Faint: 'Debilitado' };
export const nombreAnim = (a) => ANIMS[a] || a || ANIMS.Idle;
const LIC = { 'CC_BY-NC_4': 'CC BY-NC 4.0', PMDCollab_1: 'PMDCollab 1', PMDCollab_2: 'PMDCollab 2', Unspecified: 'sin licencia indicada' };

/** Texto de una entrada del diario (§6.9) con las plantillas de textos.json. */
export function textoDiario(app, [, tipo, d = {}]) {
  const T = app.textos().diario || {};
  const f = app.fmt.plantilla;
  const isla = (i) => app.nombreIsla(/^\d+$/.test(String(i)) ? Number(i) : i);
  switch (tipo) {
    case 'llega':
      if (d.i === 'faro') return T.llegaFaro || 'Encendió el faro contigo.';
      if (d.i === 'tutorial') return T.llegaTutorial || 'Se unió en tu primera expedición.';
      if (d.i === 'visita') return T.llegaVisita || 'Vino de visita y se quedó.';
      return d.f ? f(T.llega || 'Se unió en {isla} p.{f}.', { isla: isla(d.i), f: d.f }) : f(T.llegaSinPiso || 'Llegó desde {isla}.', { isla: isla(d.i) });
    case 'jefe': return f(T.jefe || 'Venció a su primer jefe en {isla}.', { isla: isla(d.i) });
    case 'evo': return f(T.evo || 'Evolucionó de {de} a {a}.', { de: app.especie(d.de).n, a: app.especie(d.a).n });
    case 'intercambio': return f(T.intercambio || 'Llegó por un intercambio con {otn}.', { otn: d.otn || d.n || 'un amigo' });
    default: return T[tipo] || tipo;
  }
}

export function montar(raiz, app, params, ctl) {
  const { game, fmt } = app;
  const uid = params.uid;
  const pant = h('div.pantalla.ficha');
  const izq = h('div.fi-izq.col');
  const der = h('div.fi-der.col');
  const lienzo = h('canvas.lienzo-ficha', { 'aria-label': 'Animación: toca para girar' });
  const nomAnim = h('span.crece', { style: { textAlign: 'center' } }, nombreAnim('Idle'));
  const fav = h('button', { class: 'btn-icono', type: 'button', 'aria-label': 'Favorito', style: { fontSize: '22px' } }, '☆');
  ctl.cabecera.append(fav);
  izq.append(lienzo, h('div.fila',
    boton('◀', () => { nomAnim.textContent = nombreAnim(escena.cambiarAnim(-1)); }, { titulo: 'Animación anterior' }),
    nomAnim,
    boton('▶', () => { nomAnim.textContent = nombreAnim(escena.cambiarAnim(1)); }, { titulo: 'Animación siguiente' })));
  pant.append(izq, der);
  raiz.append(pant);
  const escena = ctl.escena(Ficha.crear(lienzo, {}));
  let panelExtra = null; // 'bayas' | 'evo' | 'caramelo'
  let spMostrado = null;

  fav.addEventListener('click', () => { game.alternarFavorito(app.save, uid); });

  function pintar() {
    const s = app.save, ctx = app.ctx();
    const m = game.buscarMon(s, uid);
    if (!m) { ctl.cerrar(); return; }
    const e = app.especie(m.sp);
    ctl.titulo(m.ap ? `«${m.ap}» ${e.n}` : e.n);
    fav.textContent = m.fav ? '★' : '☆';
    fav.setAttribute('aria-pressed', String(!!m.fav));
    if (spMostrado !== m.sp + m.vr) {
      spMostrado = m.sp + m.vr;
      escena.actualizar({ sp: m.sp, vr: m.vr, anim: 'Idle', dir: 0 });
      nomAnim.textContent = nombreAnim('Idle');
    }
    const topeNv = game.tope(s);
    const sig = expSig(m.nv);
    const ops = game.opcionesEvolucion(s, uid, ctx);
    const fuera = game.ocupados(s).has(uid);
    const caramelos = (s.caramelos[m.sp] | 0) || (s.caramelos[e.fam] | 0);
    const bayaG = s.objetos.baya_grande | 0;
    const cred = S.creditosDe(m.sp, m.vr);
    const fuente = (l) => l.map((c, i) => [i ? ', ' : '', c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.n) : c.n]);
    const lics = [...new Set([...cred.sprite, ...cred.retrato].map((c) => LIC[c.lic] || c.lic))];
    const chun = [...cred.sprite, ...cred.retrato].some((c) => c.id === 'CHUNSOFT');

    poner(der,
      h('div.fila.envuelve', h('b.num', `Nv${m.nv}`), estrellas(m.est), h('span', `♥${m.car}`), m.vr ? h('span.chip', 'Variocolor') : null,
        fuera ? h('span.chip', 'De expedición') : null),
      h('div.fila.envuelve', e.t.map((t) => chipTipo(t, app.datos.tipos.nombres)), h('span', `· Poder ${Math.round(game.poderDe(s, uid, ctx))}`), e.g ? h('span.peq.suave', '· ' + e.g) : null),
      h('div', h('div.fila.peq', h('span.crece', 'EXP'), h('span.num', m.nv >= topeNv ? 'Al tope' : `${fmt.num(m.xp)}/${fmt.num(sig)}`)),
        barra(m.nv >= topeNv ? 1 : m.xp / sig, { verde: m.nv >= topeNv }),
        m.nv >= topeNv ? h('div.peq.suave', `Al tope (Nv${topeNv}): vence al siguiente jefe.`) : null),
      h('div.stats', STATS.map((n, i) => h('div', h('b', e.s[i] ?? '—'), n))),
      h('div.botones',
        boton('Bayas', () => { panelExtra = panelExtra === 'bayas' ? null : 'bayas'; pintar(); }, { deshabilitado: m.nv >= topeNv }),
        ops.length ? boton('Evolucionar ⬆', () => { panelExtra = panelExtra === 'evo' ? null : 'evo'; pintar(); }, { tipo: ops.some((o) => o.posible) ? 'ok' : '', extra: 'doble' }) : null,
        boton('Apodo', async () => {
          const t = await app.router.pedirTexto(`Apodo para ${e.n} (máx. 12)`, { valor: m.ap || '' });
          if (t != null) game.ponerApodo(s, uid, t);
        })),
      panelExtra === 'bayas' ? panelBayas(m) : null,
      panelExtra === 'evo' ? panelEvo(m, ops, fuera) : null,
      panelExtra === 'caramelo' ? panelCaramelo(m) : null,
      h('div.botones',
        bayaG ? boton(`Baya grande (${bayaG})`, () => { const r = intentar(() => game.usarObjeto(s, uid, 'baya_grande', app.ctx())); if (r) { app.guardar(true); toast(r.texto); } }, { titulo: '+3 de cariño' }) : null,
        caramelos ? boton(`Caramelo (${caramelos})`, () => { panelExtra = panelExtra === 'caramelo' ? null : 'caramelo'; pintar(); }) : null,
        ops.length ? boton(m.noEvo ? 'Quiere seguir así ✔' : 'Seguir así', () => game.alternarNoEvo(s, uid), { titulo: 'Silencia el aviso de evolución' }) : null),
      h('div.panel.plano',
        h('h3', 'Diario'),
        h('div.peq.suave', `Llegó el ${fmt.fecha(m.f)}${m.otn ? ' · entrenador: ' + m.otn : ''}`),
        h('ul.limpia.diario', (m.dia || []).slice().reverse().map((d) => h('li', h('span.suave', `${fmt.fecha(d[0])} · `), textoDiario(app, d))))),
      h('div.creditos-ficha.suave',
        h('div', 'Sprite: ', cred.sprite.length ? fuente(cred.sprite) : '—', ' · Retrato: ', cred.retrato.length ? fuente(cred.retrato) : '—'),
        h('div', `${lics.join(' / ')} · adaptado (recortado a 3 direcciones)`),
        chun ? h('div', 'CHUNSOFT: sprite original de los juegos, sin licencia CC.') : null),
      m.de === 'faro' ? null : h('div', { style: { marginTop: '8px' } }, boton('Liberar', async () => {
        const ok = await app.router.confirmar(`¿Liberar a ${app.nombre(m)}? Se irá de la cala para siempre y no da nada a cambio.`, { si: 'Liberar', peligro: true });
        if (!ok) return;
        if (intentar(() => game.liberar(s, uid))) { app.guardar(true); toast(`${app.nombre(m)} se ha ido a vivir a otra isla.`); ctl.cerrar(); }
      }, { tipo: 'peligro', ancho: true, deshabilitado: fuera })),
    );
  }

  function panelBayas(m) {
    const s = app.save;
    const dar = (n) => {
      const r = intentar(() => game.darBayas(s, m.id, n, app.ctx()));
      if (!r) return;
      if (!r.gastadas) toast(s.bayas ? 'Ya está al tope de nivel.' : 'No te quedan bayas.', { error: true });
      else { app.guardar(true); toast(r.subidos ? `¡Sube a Nv${r.nv}! (${fmt.plural(r.gastadas, "baya", "bayas")})` : `+${fmt.num(r.gastadas)} EXP`); }
    };
    return h('div.panel.plano.col', { style: { gap: '6px' } },
      h('div.peq', `Tienes ${fmt.plural(s.bayas, "baya", "bayas")} (1 baya = 1 EXP)`),
      h('div.botones', boton('×1', () => dar(1)), boton('×10', () => dar(10)), boton('×100', () => dar(100)),
        boton('Nivel +1', () => dar('siguiente'), { tipo: 'prim' })));
  }

  function panelEvo(m, ops, fuera) {
    return h('div.panel.plano.col', { style: { gap: '6px' } },
      ops.length > 1 ? h('div.peq', 'Elige en qué quiere convertirse:') : null,
      ops.map((o) => h('div.fila',
        retrato(o.a, { vr: m.vr }),
        h('div.crece', h('b', app.especie(o.a).n), h('div.peq.suave', o.posible ? (o.pago === 'caramelos' ? 'Gasta 10 caramelos' : o.it ? `Gasta ${app.game.nombreObjeto(o.it)}` : o.pago === 'cordon' ? 'Gasta un Cordón Amistad' : 'Lista para evolucionar') : o.falta)),
        boton('Evolucionar', () => {
          const r = intentar(() => app.game.evolucionar(app.save, m.id, o.a, app.ctx()));
          if (r) { panelExtra = null; app.guardar(true); }
        }, { tipo: 'ok', deshabilitado: !o.posible || fuera }))));
  }

  function panelCaramelo(m) {
    const usar = (el) => { const r = intentar(() => app.game.usarCaramelo(app.save, m.id, el, app.ctx())); if (r) { app.guardar(true); toast(el === 'carino' ? `♥ ${r.car}` : `Nv${r.nv}`); } };
    const g = app.game, s = app.save;
    return h('div.panel.plano', h('div.botones',
      boton('+20 cariño', () => usar('carino'), { deshabilitado: !g.efectoCaramelo(s, m, 'carino'), titulo: g.efectoCaramelo(s, m, 'carino') ? null : 'Ya tiene todo el cariño' }),
      boton('500 EXP', () => usar('bayas'), { deshabilitado: !g.efectoCaramelo(s, m, 'bayas'), titulo: g.efectoCaramelo(s, m, 'bayas') ? null : 'Ya está al tope de nivel' })));
  }

  pintar();
  return { actualizar: pintar, desmontar() {} };
}
