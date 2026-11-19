// Créditos (§14), generados desde assets/creditos.json. Dueño: UI.
import { h } from './componentes.js';

export function montar(raiz, app, _p, ctl) {
  ctl.titulo('Créditos');
  const pant = h('div.pantalla.col');
  raiz.append(pant, h('p.peq.suave', { style: { textAlign: 'center' } }, 'Cargando…'));
  fetch('assets/creditos.json').then((r) => r.json()).then((c) => {
    raiz.lastChild.remove();
    pintar(pant, c);
  }).catch(() => { raiz.lastChild.textContent = 'No se pudieron cargar los créditos.'; });
  return { desmontar() {} };
}

function enlace(url, txt) { return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, txt || url); }

function pintar(pant, c) {
  const f = c.fuente || {};
  // Cuántas especies firma cada artista (sprite o retrato, normal o variocolor).
  const cuenta = new Map();
  for (const e of Object.values(c.esp || {})) {
    const ids = new Set([...(e.sprite || []), ...(e.retrato || []), ...(e.vSprite || []), ...(e.vRetrato || [])].map((x) => x.a));
    for (const id of ids) cuenta.set(id, (cuenta.get(id) || 0) + 1);
  }
  const artistas = Object.entries(c.artistas || {}).map(([id, a]) => ({ id, n: a.n || id, url: a.url || '', k: cuenta.get(id) || 0 }));
  if (cuenta.has('CHUNSOFT') && !artistas.some((a) => a.id === 'CHUNSOFT')) artistas.push({ id: 'CHUNSOFT', n: 'CHUNSOFT', url: '', k: cuenta.get('CHUNSOFT') });
  artistas.sort((a, b) => a.n.localeCompare(b.n, 'es', { sensitivity: 'base' }));
  pant.append(
    h('div.panel.col',
      h('h3', 'Sprites y retratos'),
      h('p', { style: { margin: 0 } }, 'Sprites y retratos: PMD Sprite Repository / PMDCollab (', enlace(f.url || 'https://sprites.pmdcollab.org/'),
        '), licencia CC BY-NC 4.0 (', enlace(f.licenciaUrl || 'https://creativecommons.org/licenses/by-nc/4.0/'), '). Adaptados: recortados a 3 direcciones y reempaquetados.'),
      h('p.peq', { style: { margin: 0 } }, f.chunsoft || 'Los sprites marcados CHUNSOFT proceden de los juegos originales de Pokémon Mystery Dungeon (Spike Chunsoft) y no están bajo licencia CC.'),
      f.sha ? h('p.peq.suave', { style: { margin: 0 } }, `Versión de SpriteCollab: ${f.sha.slice(0, 10)}`) : null),
    h('div.panel.col',
      h('h3', `Artistas (${artistas.length})`),
      h('p.peq.suave', { style: { margin: 0 } }, 'Entre paréntesis, cuántas especies firma cada uno. Si no hay nombre, se muestra su id.'),
      h('ul.limpia.peq', artistas.map((a) => h('li', { style: { padding: '2px 0' } }, a.url ? enlace(a.url, a.n) : a.n, h('span.suave', ` (${a.k})`))))),
    h('div.panel.col',
      h('h3', 'Licencias de los sprites'),
      h('ul.limpia.peq', Object.entries(f.licencias || {}).map(([k, v]) => h('li', h('b', k), ': ', v)))),
    h('div.panel.col',
      h('h3', 'Datos y marcas'),
      h('p.peq', { style: { margin: 0 } }, f.pokeapi || 'Datos: PokéAPI (BSD-3-Clause), © 2013–2023 Paul Hallett and PokéAPI contributors'),
      h('p.peq', { style: { margin: 0 } }, 'Pokémon y los nombres de los personajes son marcas de Nintendo / Creatures Inc. / GAME FREAK inc. Proyecto de fans privado y sin ánimo de lucro: sin anuncios, pagos ni donaciones.'),
      h('p.peq.suave', { style: { margin: 0 } }, 'Iconos y baldosas: dibujados para Farolillo. Tipografía del sistema (la fuente Pixelify Sans, OFL, llegará en la v0.2).')),
  );
}
