# Notas de UI (v0.1)

Dueño: UI. Archivos: `index.html`, `css/app.css`, `js/main.js`, `js/ui/*.js`, `js/fmt.js`, `js/audio.js`, `js/config.js`,
`data/textos.json`, `assets/ui/*.svg`, `NOTICE.md`, `README.md`, `robots.txt`, `test/ui/capturas.mjs`, `notes/ui.md`.

## Cómo está montado

- `js/main.js`: arranque (`cargarDatos` + `sprites.iniciar`), objeto `app`, reloj, guardado, tick (30 s), latido (1 s),
  bucle único de `requestAnimationFrame` (llama a `router.render(t)`, que solo anima las escenas de la capa de arriba)
  y cola de momentos especiales.
- `app = { save, datos, game, sprites, router, bus, fmt, eco, audio, ahora(), ctx(), guardar(inmediato), recoger(idx?),
  recogerAhora(idx?), enviarTodos(), nombre(mon), especie(sp), nombreIsla(id), textos(), ui, guardarUI(), refrescar() }`.
  Es la `app` de §15.2 con algunos añadidos.
- `js/ui/router.js`: pestañas (`cala`, `expediciones`, `bitacora`, `gremio`), capas a pantalla completa con cabecera «‹»
  (`formar`, `encurso`, `ficha`, `ajustes`, `creditos`) y modales con promesa (`informe`, `momento`, `selector`, `dialogo`).
  Cada pantalla exporta `montar(raiz, app, params, ctl) → { actualizar?, latido?, desmontar }`; `ctl.escena(e)` registra una
  escena de canvas en esa capa (se inicia, se anima solo si la capa está arriba y se destruye al desmontar).
  §15.2 decía `montar(raiz, app)`: añado `params` y `ctl` (la pantalla necesita saber qué equipo o Pokémon enseña).
- `save:cambio` → guardado con debounce de 1 s y refresco agrupado por rAF. Operaciones compuestas → `app.guardar(true)`.
  `visibilitychange` (oculta) y `pagehide` → escritura inmediata.
- Momentos: el bus los encola; se reproducen cuando no hay ningún modal abierto (tras cerrar el informe, o enseguida si
  vienen de una evolución en la ficha). Solo se cierran con un botón.
- Al abrir con equipos de vuelta sale «Mientras estabas fuera…» (resumen sacado de los registros, sin aplicar nada) con
  RECOGER TODO; al pulsarlo se aplica `recogerTodo` y el mismo modal pasa a enseñar el Informe real (niveles, fusiones…).
- Tema: noche (paneles `--mar-700`) de 22 a 07 h según el reloj del juego o con `prefers-color-scheme: dark` (no en `?test=1`).
  `data-reducir-anim="1"` en `<html>` cuando el ajuste está activo (lo leen `sprites.reducirAnim()` y las transiciones CSS).
- Preferencias de interfaz por navegador (burbujas del guía cerradas) en `localStorage['farolillo.ui']`, fuera del guardado.

## Pruebas (§16)

- `?test=1` (reloj fijo 18-nov-2026 10:00 si no hay `?reloj=`; sin IndexedDB), `?reloj=<ISO local | ms>`, `?nuevo=1` (con test: borra
  la partida). `window.__farolillo = { app, ahora, avanzar(ms), jugar(rondas, ms), listo }`. `jugar` mejora, iguala, evoluciona,
  envía a todos, avanza y recoge sin pantallas (solo para preparar capturas con contenido).
- `node test/ui/capturas.mjs [--solo 360x640] [--url …]`: 26 capturas por tamaño en `test/ui/out/` (primer arranque, cala,
  informe, momento, expediciones, formar, selector, cala avanzada, en curso, bitácora y su diario, gremio y faro, ficha y
  diario, evolución con su momento, ajustes, créditos, y «Mientras estabas fuera…» tras recargar 10 h después).
  Comprueba scroll horizontal, desbordes en `#vista/.capa-cuerpo/.modal`, botones/select/checkbox ≥ 44 px y errores de
  consola (incluidas respuestas HTTP ≥ 400). Estado al entregar: los 3 tamaños en verde.
- Playwright no es dependencia del proyecto: el script lo importa de la caché de `npx` si no está instalado (o de `PLAYWRIGHT_DIR`).

## Decisiones

- **Escala de la cala:** ×3 solo si el canvas mide ≥ 320 px de alto (si no, ×2). Con la regla de §10 (≥ 240 px) en 360x640 los
  evolucionados grandes llenaban la cala. Se pasa como `opciones.escala` (getter) a `scene-cala`.
- **Guías del primer arranque:** `scene-ficha` con `escala: 2` (con su escala automática salían a ×1 en celdas de 88 px).
- **Siluetas de la Bitácora:** los retratos tienen fondo opaco, así que `brightness(0)` daba un cuadrado negro. Uso el primer
  frame de Idle con `silueta: true` en un canvas de 40x40.
- **Formar equipo:** si hay huecos vacíos y gente libre (p. ej. tras el tutorial) se rellena con «Sugerir». En vertical la
  previsión y ENVIAR quedan fijas abajo (sticky). «Hasta el piso» es un select; Dominio no sale (v0.2).
- **Selector:** «+12 %» = cambio en p(jefe) con `prever(…, 40)` (en patrulla, vueltas; en la Misterio, pisos). Se calcula a trozos
  de 24 ms empezando por los más fuertes; al terminar, el orden «Recomendado» se reordena una vez.
- **En curso:** `P / D / p` del piso actual con `formulas.dificultad`/`probPiso` sin clima D (todos los climas tienen climaD = 1).
  «Recordármelo» descarga un `.ics` (§9.3; estaba en v0.2 pero es barato).
- **Momento de variocolor:** botón Compartir con `fx.capturaCompartir` + `navigator.share` (o descarga del PNG).
- **Avisos:** chips en la cala (sin «equipo de vuelta», que ya se ve en la lista) y puntito rojo en la pestaña de destino.
- **Créditos:** artistas ordenados alfabéticamente con el número de especies que firma cada uno; ids sin nombre tal cual.
- **Tipografía:** sin Pixelify Sans en v0.1 (los títulos usan una monoespaciada del sistema). Llega en v0.2 autoalojada.
- **Iconos:** SVG propios de 16x16 en `assets/ui/` (moneda, baya, objeto, corazón, estrella, ⇄, ⬆, ✦, menú, faro y las 4 pestañas).
  Algunos símbolos de texto (★ ♥ ▲ ▼ ✕ ‹ ↻) se usan como glifos tipográficos, no como emoji.

## Avisos a otros dueños (sin tocar sus archivos)

- **ESTADO (`state.js`):** `crearAlmacen` guarda `globalThis.setTimeout` y luego lo llama como `almacen.st(...)`; en el navegador eso
  lanza «Illegal invocation» y el guardado con debounce fallaba. Lo evito pasando `setTimeout: window.setTimeout.bind(window)` (y
  `clearTimeout`) desde `main.js`. Arreglo propuesto: `st: st || ((f, ms) => setTimeout(f, ms))`.
- **ESTADO:** con el huerto a nivel 0 no entran bayas hasta mejorarlo; la burbuja del guía de las bayas solo sale si hay ≥ 50.
- ~~**GRÁFICOS:** en la cala con muchos vecinos (≥ 30) se amontonan en diagonal.~~ Arreglado (reparto R2).

## Versión móvil (lote layout, 18-nov)

- **Atrás del sistema** (router.js): cada capa o modal abierto tiene su entrada `history.state = { farolillo: n }` (n = capas + modales).
  `popstate` cierra lo de arriba (modal antes que capa); cerrar con «‹», «✕» o Cancelar consume la entrada con `history.go(-k)` y la
  bandera `enVuelo` evita cerrar dos veces (con red de seguridad de 800 ms). El historial se iguala en un microtask (irTab cierra varias
  capas de golpe). Una pantalla puede exportar `atras()`: true = ya se cerró, false = se queda (se vuelve a meter la entrada).
  Momento → como «¡Bienvenido!» (no en los primeros 600 ms); informe pendiente → RECOGER TODO y se queda con el informe; informe → Seguir;
  cala llena → vuelve al aviso, nunca «Dejarlo ir»; diálogo → Cancelar. Escape en escritorio. Gesto desde el borde izquierdo (<24 px,
  >60 px) solo en standalone o con `?gesto=1` (en Safari normal ese gesto ya es el atrás del navegador). La URL no cambia nunca.
- **Toasts**: arriba, bajo la barra; máx. 2 y 2 s. `recolocarToast()` prueba otros sitios (`pos-abajo`, `pos-der`, `pos-centro`) si pisa
  un .btn.prim/.btn.ok (mide al aparecer, en el siguiente frame, a 150 y a 600 ms).
- **Contraste**: .btn.prim con fondo `--prim` #f0902f y texto oscuro (7,1:1); .btn.ok `--hoja-700` (6,4:1); .btn.peligro #b8392f (5,7:1);
  deshabilitados sin opacity (panel + tinta suave, borde discontinuo). Estrellas en `--farol-800`.
- **Barra a 320 px**: la regla de los huecos es `.formar .hueco`; `.recurso` flex:none con cifras tabulares; gap 10 px (8 a <360).
- **Texto**: mínimo 14 px (13 en pestañas, también en el raíl, hitos y celdas de la bitácora); campos a 16 px (iOS no hace zoom).
- **Safe areas**: #app a 100dvh (100svh y 100% de respaldo); `.capa-cuerpo > .pantalla` con 16 px + `--sa-b`; pie de Formar con 4 px + `--sa-b`;
  en horizontal #vista con `--sa-b`/`--sa-r`. overscroll-behavior: contain en #vista, .capa-cuerpo y .modal.
- **Toques nativos**: touch-action manipulation; sin selección ni menú de mantener pulsado (salvo campos y créditos); :active y :focus-visible comunes.
- **Cala**: tira «E1 ≈10:01 · E2 ¡de vuelta!» en el pie sticky (con 2+ equipos; oculta en horizontal, donde la lista ya se ve); burbuja
  bajo el lienzo (en horizontal superpuesta a su parte baja, 2 líneas; tocar el texto lo despliega); avisos en una fila con scroll; con
  alto <640 el lienzo a 30 vh (mín. 150). Aviso de instalación (instalar.js) en su propio hueco bajo los equipos, fuera del tutorial:
  dentro de la fila de avisos estiraba todos los avisos a 300 px en WebKit.
- **Momentos**: un toque en cualquier sitio pasa al siguiente tras 600 ms; con `params.restantes > 0` sale «1/n» y «Saltar (n−1)» → `'saltar'`.
- **Informe**: «Recoger y enviar» (recogerAhora + enviarTodos) en «Mientras estabas fuera…»; eventos plegados en «n eventos ▸».
- **Ajustes**: Exportar comparte (navigator.share con un .txt, el formato FAR1 no es JSON, o con texto) en táctil y fuera de `?test=1`; si
  no, copia; el texto solo tras «Ver», 3 líneas. «Vibrar al tocar» en `app.ui.vibrar`. Bloque PWA con `import('./instalar.js')`.
- **Háptica y sonido**: `vibrar()` en componentes (10 ms en botones y pestañas, [15,40,15] al recoger; respeta el ajuste y «reducir
  animaciones»). audio.js: efectos distintos para toque, recoger, enviar (lo suena la UI con `componentes.enviarTodos(app)`) y recluta.
- **Selector**: hoja inferior en vertical, con desplegables, «Libres» y Cancelar al pie. **Expediciones**: chip de clima bajo el título,
  «Enviar a todos» y 2 columnas en horizontal. **Ficha**: enlaces de créditos con 44 px de alto.
- **Pruebas**: `node test/ui/movil.mjs [--solo "iPhone SE"]` (6 perfiles: iPhone SE, iPhone 15 y SE horizontal en WebKit; Pixel 7, Galaxy S9+
  y 640x360 en Chromium). `capturas.mjs` usa isMobile y corre en Chromium y WebKit (capturas con prefijo `webkit-`; `--motor` para uno).

## Pendientes (v0.2 o cuando toque)

- Selector a 320 px: los desplegables recortan «Todos los tipos» / «Recomendado» (se leen, pero cortados).
- «Recoger y enviar» parte en 2 líneas a 360 px (cabe, pero se podría acortar).
- La tira de equipos no se puede tocar (podría abrir «En curso»).
- La entrada de historial de un modal que sale solo (informe al abrir, momentos) se crea sin gesto del usuario: Chrome puede saltársela con
  su botón atrás si no se ha tocado la página desde entonces.
- `setAppBadge` (la PWA la lleva el lote pwa: notes/pwa.md).
- Pixelify Sans autoalojada en `assets/fonts/` y pase de estilo completo (esquinas recortadas de 4 px).
- Ajustes: avatar (uno de tus Pokémon), cuenta y nube (v0.3).
- Informe con canvas (los 3 con Walk → Hop) en lugar de los retratos; secuencias de evolución y variocolor de `fx.js`.
- Visitante en la cala, misiones en Gremio, evento semanal en Expediciones, Dominio en Formar.
- Elegir rama al evolucionar ya funciona (lista de opciones con retrato); falta el Idle animado de cada opción (§6.8).
