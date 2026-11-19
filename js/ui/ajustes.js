// Ajustes (§9.2.10): nombre, duplicados, sonido, reducir animaciones, exportar/importar partida, versión. Dueño: UI.
import { h, boton, toast, vibrar } from './componentes.js';
import * as state from '../core/state.js';

export function montar(raiz, app, _p, ctl) {
  ctl.titulo('Ajustes');
  const { game } = app;
  const pant = h('div.pantalla.col');
  raiz.append(pant);
  const s = () => app.save;

  const nombre = h('input.txt', { type: 'text', maxlength: 16, value: s().nombre || '', placeholder: 'Sin nombre', autocomplete: 'off', 'aria-label': 'Nombre visible' });
  nombre.addEventListener('change', () => { game.cambiarAjuste(s(), 'nombre', nombre.value); nombre.value = s().nombre; toast('Nombre guardado.'); });

  const dup = h('select', { class: 'sel', 'aria-label': 'Duplicados', on: { change: (e) => game.cambiarAjuste(s(), 'duplicados', e.target.value) } },
    h('option', { value: 'fusionar', selected: s().ajustes.duplicados === 'fusionar' }, 'Fusionar en estrellas'),
    h('option', { value: 'preguntar', selected: s().ajustes.duplicados === 'preguntar' }, 'Que lleguen como individuos'));

  const sonido = h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: s().ajustes.sonido ?? 0.6, 'aria-label': 'Volumen', style: { width: '100%', minHeight: '44px' } });
  sonido.addEventListener('change', () => { game.cambiarAjuste(s(), 'sonido', Number(sonido.value)); app.aplicarTema(); app.audio.sonar('toque'); });

  const reducir = h('input', { type: 'checkbox', checked: !!s().ajustes.reducirAnim });
  reducir.addEventListener('change', () => { game.cambiarAjuste(s(), 'reducirAnim', reducir.checked); app.aplicarTema(); });

  // Vibración (preferencia de este navegador, en app.ui como las burbujas). Solo si el navegador sabe vibrar (iOS no).
  const vibra = 'vibrate' in navigator
    ? h('label.chk', h('input', { type: 'checkbox', checked: app.ui.vibrar !== false, on: { change: (e) => {
      app.ui.vibrar = e.target.checked;
      app.guardarUI();
      if (e.target.checked) vibrar(15);
    } } }), 'Vibrar al tocar')
    : null;

  // La partida exportada no se enfoca (en móvil sacaba el teclado y el zoom): se comparte o se copia, y el texto
  // solo se ve tras «Ver», en 3 líneas.
  const salida = h('textarea.txt.corto', { readonly: true, rows: 3, hidden: true, 'aria-label': 'Partida exportada' });
  const entrada = h('textarea.txt.corto', { rows: 3, 'aria-label': 'Partida para importar', placeholder: 'Pega aquí el texto FAR1.… de una partida exportada.' });
  const verTexto = () => { salida.value = state.exportar(s()); salida.hidden = false; };
  const exportar = async () => {
    const txt = state.exportar(s());
    const nombreArchivo = `farolillo-${new Date(app.ahora()).toISOString().slice(0, 10)}.txt`;
    const tactil = matchMedia('(pointer: coarse)').matches;
    // Móvil: hoja de compartir del sistema (archivo si se puede; si no, el texto). En pruebas (?test=1) no se abre.
    if (tactil && !app.test && navigator.share) {
      try {
        const file = new File([txt], nombreArchivo, { type: 'text/plain' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Partida de Farolillo' });
        else await navigator.share({ title: 'Partida de Farolillo', text: txt });
        toast('Partida exportada.');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(txt);
      toast('Copiada al portapapeles. Guárdala en una nota o mándatela.');
    } catch {
      verTexto();
      toast('Copia el texto de abajo a mano.');
    }
  };

  // Bloque de instalación y sin conexión (lote PWA). Si js/ui/instalar.js no está, no sale nada.
  const huecoPwa = h('div');
  import('./instalar.js')
    .then((m) => { const n = m && typeof m.bloqueAjustes === 'function' ? m.bloqueAjustes(app) : null; if (n instanceof Node) huecoPwa.replaceWith(n); })
    .catch(() => {});

  pant.append(
    h('div.panel.col',
      h('h3', 'Jugador'),
      h('label.col', { style: { gap: '4px' } }, h('span.peq', 'Nombre visible (2-16, sin @ ni <>)'), nombre),
      h('label.col', { style: { gap: '4px' } }, h('span.peq', 'Duplicados de una especie'), dup)),
    h('div.panel.col',
      h('h3', 'Pantalla y sonido'),
      h('label.col', { style: { gap: '0' } }, h('span.peq', 'Volumen'), sonido),
      h('label.chk', reducir, 'Reducir animaciones y destellos'),
      vibra),
    huecoPwa,
    h('div.panel.col',
      h('h3', 'Copia de la partida'),
      h('p.peq', { style: { margin: 0 } }, 'Tu partida vive solo en este navegador. Exporta una copia de vez en cuando (Safari puede borrar los datos si no abres el juego en una semana).'),
      h('div.botones',
        boton('Exportar', exportar, { tipo: 'prim' }),
        boton('Ver', () => { if (salida.hidden) verTexto(); else salida.hidden = true; }, { titulo: 'Ver el texto de la partida' })),
      salida,
      entrada,
      boton('Importar partida', async () => {
        let nueva;
        try { nueva = state.importar(entrada.value); } catch (e) { toast(e.message, { error: true }); return; }
        const n = nueva.pokemon.length;
        const ok = await app.router.confirmar(`Esta partida tiene ${n} Pokémon. Sustituirá a la actual. ¿Seguro?`, { si: 'Importar', peligro: true });
        if (!ok) return;
        nueva = state.fusionarTrasImportar(s(), nueva);
        entrada.value = '';
        app.reemplazarPartida(nueva);
        toast('Partida importada.');
      }, { tipo: 'peligro', ancho: true })),
    h('div.panel.col',
      h('h3', 'Sobre el juego'),
      h('div.peq', `Farolillo ${app.version} · uso privado y sin ánimo de lucro.`),
      h('div.peq.suave', 'Cuenta, nube y liga con amigos llegarán en la v0.3.'),
      boton('Créditos y licencias', () => app.router.abrir('creditos'), { ancho: true })),
  );
  return { desmontar() {} };
}

