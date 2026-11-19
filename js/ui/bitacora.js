// Bitácora (§9.2.7): contador, hitos, filtros y cuadrícula de retratos; pestaña «Diario de expediciones». Dueño: UI.
import { h, poner, retrato, barra, toast, icon } from './componentes.js';
import * as S from '../gfx/sprites.js';

const CAJA = 40;   // px CSS de la casilla (css: .bit canvas)

/**
 * Silueta del primer frame de Idle (los retratos tienen fondo opaco y no sirven para siluetas).
 * El búfer mide 40 × devicePixelRatio (nítido a DPR 3) y la silueta se encaja por su caja opaca: las especies
 * grandes (Gyarados, Moltres…) se reducen en vez de salir cortadas; las pequeñas van a 1 px CSS por px de sprite.
 */
function silueta(sp) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const lado = Math.max(1, Math.round(CAJA * dpr));
  const c = h('canvas', { width: lado, height: lado, 'aria-hidden': 'true' });
  const pintar = () => {
    const m = S.medidas(sp, 'Idle');
    if (!m) return;
    // 1) El frame entero a escala 1 en un lienzo aparte.
    const tmp = document.createElement('canvas');
    tmp.width = m.fw; tmp.height = m.fh;
    const t = tmp.getContext('2d');
    t.imageSmoothingEnabled = false;
    if (!S.dibujar(t, { sp, anim: 'Idle', dir: 0, tMs: 0, x: m.fw / 2, y: m.fh / 2 - S.AJUSTE_Y, escala: 1, silueta: true, sombra: false, frame: 0 })) return;
    // 2) Caja opaca.
    const px = t.getImageData(0, 0, m.fw, m.fh).data;
    let x0 = m.fw, y0 = m.fh, x1 = -1, y1 = -1;
    for (let y = 0; y < m.fh; y++) for (let x = 0; x < m.fw; x++) {
      if (px[(y * m.fw + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // 3) Encajar: como mucho 1 px CSS por px de sprite (escala entera si cabe), y reducida si no cabe.
    const margen = Math.round(2 * dpr);
    const cabe = Math.min((lado - margen * 2) / bw, (lado - margen * 2) / bh);
    let s = Math.min(dpr, cabe);
    if (s >= 1) s = Math.floor(s);
    const w = Math.round(bw * s), hh = Math.round(bh * s);
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.imageSmoothingEnabled = s < 1;
    x.clearRect(0, 0, lado, lado);
    x.globalAlpha = 0.45;
    x.drawImage(tmp, x0, y0, bw, bh, Math.round((lado - w) / 2), lado - margen - hh, w, hh);
  };
  S.precargar(sp, ['Idle']).then(pintar).catch(() => {});
  return c;
}

const HITOS = [10, 25, 50, 75, 100];

export function montar(raiz, app, params, _ctl) {
  const { fmt } = app;
  const pant = h('div.pantalla');
  raiz.append(pant);
  let sub = params.sub === 'diario' ? 'diario' : 'coleccion';
  let filtro = 'todos', tipo = '', isla = '';
  const todas = Object.keys(app.datos.especies).sort();

  const famIsla = (id) => {
    const i = app.datos.islaPorId[id];
    if (!i) return new Set();
    return new Set(i.especies.map((sp) => app.especie(sp).fam || sp));
  };

  function cabecera() {
    return h('div.seg', { role: 'tablist', style: { marginBottom: '8px' } },
      h('button', { type: 'button', 'aria-pressed': String(sub === 'coleccion'), on: { click: () => { sub = 'coleccion'; pintar(); } } }, 'Colección'),
      h('button', { type: 'button', 'aria-pressed': String(sub === 'diario'), on: { click: () => { sub = 'diario'; pintar(); } } }, 'Diario de expediciones'));
  }

  function coleccion() {
    const s = app.save;
    const ten = s.bitacora.tenido, vis = s.bitacora.visto;
    const nTen = todas.filter((sp) => ten[sp]).length;
    const frac = nTen / todas.length;
    const conVr = new Set(s.pokemon.filter((m) => m.vr).map((m) => m.sp));
    let lista = todas;
    if (filtro === 'tenidos') lista = lista.filter((sp) => ten[sp]);
    if (filtro === 'faltan') lista = lista.filter((sp) => !ten[sp]);
    if (tipo) lista = lista.filter((sp) => app.especie(sp).t.includes(tipo));
    if (isla) { const f = famIsla(Number(isla)); lista = lista.filter((sp) => f.has(app.especie(sp).fam || sp)); }
    const tiposIds = app.datos.tipos.ids || Object.keys(app.datos.tipos.nombres);
    return [
      h('div.fila', h('h2.crece', `${nTen}/${todas.length} (${Math.round(frac * 100)} %)`), h('span.peq.suave', `${todas.filter((sp) => vis[sp]).length} vistos`)),
      h('div.hitos', barra(frac), HITOS.map((p) => h('i', { class: 'marca' + (frac * 100 >= p ? ' ok' : ''), style: { left: p + '%' } }, h('span', p + '%')))),
      h('div.filtros',
        h('div.seg', { style: { flex: '1 1 100%' } }, [['todos', 'Todos'], ['tenidos', 'Tenidos'], ['faltan', 'Faltan']].map(([v, t]) =>
          h('button', { type: 'button', 'aria-pressed': String(filtro === v), on: { click: () => { filtro = v; pintar(); } } }, t))),
        h('select', { class: 'sel', 'aria-label': 'Tipo', on: { change: (e) => { tipo = e.target.value; pintar(); } } },
          h('option', { value: '' }, 'Tipo: todos'), tiposIds.map((t) => h('option', { value: t, selected: tipo === t }, app.datos.tipos.nombres[t]))),
        h('select', { class: 'sel', 'aria-label': 'Isla', on: { change: (e) => { isla = e.target.value; pintar(); } } },
          h('option', { value: '' }, 'Isla: todas'), app.datos.islas.map((i) => h('option', { value: i.id, selected: String(i.id) === isla }, i.n)))),
      h('div.bit-rejilla', lista.map((sp) => {
        const n = app.especie(sp).n;
        if (ten[sp]) {
          return h('button.bit', { type: 'button', title: n, 'aria-label': n, on: { click: () => abrirEspecie(sp) } },
            retrato(sp, { vr: conVr.has(sp), clase: '' }), conVr.has(sp) ? icon('vario', 'vr') : null);
        }
        if (vis[sp]) return h('button.bit', { type: 'button', title: n, 'aria-label': `${n} (visto)`, on: { click: () => toast(`${n}: lo has visto, pero aún no vive en la cala.`) } }, silueta(sp));
        return h('div.bit.no-visto', { 'aria-label': `Nº ${Number(sp)} sin ver` }, String(Number(sp)));
      })),
      lista.length ? null : h('p.suave', 'Ninguna especie con ese filtro.'),
    ];
  }

  function abrirEspecie(sp) {
    const mons = app.save.pokemon.filter((m) => m.sp === sp).sort((a, b) => b.nv - a.nv);
    if (mons.length) app.router.abrir('ficha', { uid: mons[0].id });
    else toast(`${app.especie(sp).n}: vivió en la cala (ha evolucionado o se fue).`);
  }

  function diario() {
    const l = app.save.diarioExp || [];
    if (!l.length) return h('p.suave', 'Aún no hay expediciones terminadas.');
    return h('ul.limpia.diario-exp', l.map((r) => h('li.fila',
      h('div.mini-retratos', (r.equipo || []).filter(Boolean).map((sp) => retrato(sp))),
      h('div.crece',
        h('div', h('b', `${app.nombreIsla(r.isla)}`), ` · ${r.motivo === 'rescatado' ? 'rescatados en p.' + r.pisoFin : 'p.' + r.pisoFin}${r.jefe ? ' ✔ jefe' : ''}`),
        h('div.peq.suave', `${fmt.fecha(r.t)} ${fmt.hora(r.t)} · E${(r.idx | 0) + 1} · +${fmt.num(r.monedas)} mon · ${r.objetos} obj · ${r.reclutas} recluta${r.reclutas === 1 ? '' : 's'}`)))));
  }

  function pintar() {
    const y = document.getElementById('vista').scrollTop;
    poner(pant, cabecera(), sub === 'coleccion' ? coleccion() : diario());
    document.getElementById('vista').scrollTop = y;
  }
  let firma = '';
  function actualizar() {
    const s = app.save;
    const f = Object.keys(s.bitacora.tenido).length + '|' + Object.keys(s.bitacora.visto).length + '|' + (s.diarioExp || []).length + '|' + (s.diarioExp?.[0]?.t || 0);
    if (f === firma) return;
    firma = f;
    pintar();
  }
  actualizar();
  return { actualizar, desmontar() {}, sub(x) { sub = x === 'diario' ? 'diario' : 'coleccion'; pintar(); } };
}
