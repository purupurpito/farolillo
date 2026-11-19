# Notas de GRÁFICOS (js/gfx/*)

## API (v0.1)

### `js/gfx/sprites.js`
Lo de §15.2, y además:
- `iniciar(base = './assets/', { manifest?, creditos? })`: se pueden inyectar el manifest y los créditos (pruebas).
- `dibujar(ctx, { sp, vr, anim, dir, tMs, x, y, escala = 1, silueta, espejo, sombra = true, frame?, bucle = true, alfa? }) → bool`.
  Pinta la sombra aunque la imagen no haya cargado; devuelve false y la pide. (x, y) = punto de suelo.
- Extras: `especies()`, `animaciones(sp, vr)`, `medidas(sp, anim, vr)`, `indiceFrame(sp, anim, vr, tMs, bucle)`,
  `msHasta(sp, anim, vr)` (ms hasta el frame de golpe), `listo(sp, anims, vr)`, `alCargar(fn) → baja`,
  `imagenRetrato(sp, emocion, vr)` (Image ya cargada o null), `creditosDe(sp, vr) → { sprite: [{id,n,url,lic}], retrato }`
  (para la ficha, §14), `prepararCanvas(canvas, escalaCss)`, `reducirAnim()`, `motorEscena(...)`, `relojDe(opciones)`,
  `AJUSTE_Y` (= −4), `FPS_FRAMES` (= 15).
- `reducirAnim()` mira `prefers-reduced-motion` y `document.documentElement.dataset.reducirAnim === '1'`:
  **UI** debe poner ese atributo cuando el ajuste «Reducir animaciones» esté activo.

### Escenas (`scene-cala.js`, `scene-combate.js`, `scene-ficha.js`)
Forma de §15.2: `crear(canvas, opciones) → { actualizar(estado), iniciar(), parar(), destruir(), alTocar(fn), render(t) }`.
- `render(t)` lo llama el bucle único de `main.js` (15 Hz, ver «Bucle»). Solo repinta si cambia algo (firma de frames y
  posiciones). No hace nada sin `iniciar()`, tras `parar()`, con `document.hidden` o con el canvas fuera de pantalla
  (IntersectionObserver). `escena.visible` dice si se está pintando.
- `montar(canvas, opts)` = `crear` + `iniciar` (atajo que pedía el encargo; devuelve la misma Escena).
- `opciones`: `estado` (inicial), `reloj()` (reloj de pared falso para pruebas), `escala` (fuerza ×2/×3),
  `autoBucle: true` (rAF propio, solo para páginas sueltas; en el juego NO, que el bucle es de main.js).
- Tamaño: el canvas se dimensiona solo (ResizeObserver); el búfer mide el MUNDO en px de sprite (ver «Modelo de búfer»).
  UI solo le da ancho/alto por CSS. Mantener pulsado no abre el menú de imagen (contextmenu con preventDefault).

**Cala** — estado `{ vecinos: [{uid, sp, vr, dormido?, fav?}], visitante: {sp, vr?}|null, farolillos, dorados, soloLectura }`.
- `alTocar` recibe `{tipo:'vecino', uid, sp, soloLectura}`, `{tipo:'visitante', sp, soloLectura}` o `{tipo:'faro'}`.
- La reacción visual (Hop o salto de 4 px + globo con retrato Happy) la hace la escena sola al tocar. Para la frase:
  `escena.reaccionar(uid, { frase, emocion })` con lo que devuelva `game.tocarVecino`.
- `escena.centrarEn(uid | 'muelle' | 'faro')`, `escena.posiciones()` (px CSS, para pruebas).
- Duermen de 23:00 a 07:00 (hora local del `reloj`) y a ratos (siestas cortas). `dormido: true` en un vecino lo fuerza.
- Velo azul de 22:00 a 07:00 con el haz del faro (mínimo; el día/noche completo es de v0.2).
- Mundo: 2 pantallas de ancho en vertical y 1,3 en horizontal (orientación de la ventana); arrastre horizontal
  con el dedo (`touch-action: pan-y`, así el scroll vertical de la página sigue funcionando).

**Combate** — estado `{ registro, snapshot, ahora?, isla?: {clave, fondo, F}, equipo?: [{sp, vr}] }`.
- Usa `sim.estadoEn` / `sim.detallePiso` (importa `../core/sim.js` a demanda; `opciones.sim` para inyectarlo).
  Si falta sim, una aproximación propia con el registro.
- Pasarle `isla` (la entrada de `islas.json`) para el patrón de baldosas y el color; si no, usa Prado.
- `ahora` es opcional: si viene, la escena avanza desde ahí con el reloj de la página; si no, `Date.now()`.
- Cada piso: andar (suelo que avanza) y, al final del piso, el encuentro (entrada ~1,1 s + golpes + salida ~0,9 s).
  Los golpes de `detallePiso` no traen daño (solo `fuerte`): el número es decorativo y determinista (×2 si fuerte).
  Si `detallePiso.enemigo` es null o no tiene sprite (p. ej. aún no está en el manifest), se elige uno del manifest.

**Ficha** — estado `{ sp, vr, anim, dir?, silueta? }`. `escena.animaciones()`, `escena.cambiarAnim(±1) → nombre`,
`escena.girar()`, `escena.estado()`. Tocar gira la dirección (abajo → derecha → izquierda) y avisa `{tipo:'ficha', dir, anim}`.
Escala estable por especie (la mayor ≤ ×3 que deja ver su frame más grande).

### `fx.js`
`destello(canvas)` (CSS, no pinta), `secuenciaEvolucion(canvas, spA, spB, vr) → Promise` (~4 s; 2,2 s con menos movimiento),
`revelarVario(canvas, sp) → Promise` (~2,5 s), `capturaCompartir(canvas, texto) → Promise<Blob>`, `chispas(...)`.
Las secuencias usan un rAF propio mientras duran: dales un canvas que no tenga una escena montada.

### `tiles.js`
`baldosa(clave, fondo, variante)`, `patron(ctx, clave, fondo)`, `rellenar(ctx, clave, fondo, x, y, w, h, ox, oy)`,
`tono(hex, k)`, `FONDOS`, `TAM`. Claves: las de `islas.json` (`prado` … `cumbre`), `misterio`, y `arena`, `mar`, `madera`, `roca`.

## Desviaciones respecto al encargo

- El encargo decía `dibujar(ctx, especie, anim, dir, t, x, y, opts{vario, escala, sombra})` y escenas
  `montar(canvas, opts) → {actualizar, destruir}`. Mando la firma de §15.2 (objeto de opciones; `crear` con la Escena completa)
  y dejo `montar` como atajo.
- Escala ×3 si el canvas mide ≥ 240 px de alto, ×2 si no (§10). En la cala en horizontal (≈ 250-280 px de alto) los evolucionados
  grandes se ven apretados; si molesta, `opciones.escala = 2` lo arregla sin tocar nada más.

## Decisiones

- Anclaje: centro del frame en (x, y + AJUSTE_Y·escala) con AJUSTE_Y = −4; sombra en (x, y). Revisado a ojo con las 20 primeras especies.
- Direcciones distintas de 0/2/6 caen en la más cercana (1,3→2; 5,7→6; 4→0).
- Sombra con la alfa del sprite y a media alfa en siluetas.
- Página de prueba `tools/gfx-demo.html`: usa `assets/` si existe y si no `test/fixtures/gfx/` (o `?assets=`). Si hay `data/` y `core/`,
  la expedición sale de `sim.resolverExpedicion` de verdad.
- `test/fixtures/gfx/`: 3 especies sin recortar (8 filas, `r = [0..7]`), bajadas de raw.githubusercontent.com en el SHA fijado (366 KB).
- `test/gfx.test.mjs`: funciones puras de sprites.js y que cada PNG del manifest real mida `fw × frames` por `fh × filas`.

## Pendientes

- v0.2: día/noche completo en la cala, decoraciones, Hop/Faint en momentos, secuencias más elaboradas, sonido al tocar.
- Comprobar en móvil real la escala ×3 de la cala en horizontal.
- Si `sim.detallePiso` llega a dar daño (`dmg`), la escena ya lo usa.

## Modelo de búfer (lote rendimiento, nov-2026)

- `prepararCanvas(canvas, escalaCss)`: S = round(escalaCss × DPR) px de dispositivo por px de sprite (como antes) y
  **búfer = round(CSS × DPR / S)**, es decir, el mundo en px de sprite. Se pinta con `setTransform(1)` (1 px del contexto = 1 px de
  sprite) y el navegador lo amplía al tamaño CSS con `image-rendering: pixelated` (`crisp-edges` de respaldo), que la propia función
  pone en el style inline del canvas. Devuelve `{ S, w, h, dpr, cssW, cssH, k, ctx }`: w×h = búfer = mundo visible;
  **k = px CSS por px de sprite** (toques: px CSS ÷ k; capa de texto: px de sprite × k). `canvas._pxS = S` para Compartir.
- El factor real (CSS×DPR/búfer) queda a < 3 % de S: con pixelated, como mucho una columna de 1 px de dispositivo más de vez en cuando.
  Comprobado a ojo en iPhone SE (DPR 2, WebKit), Pixel 7 (2,625), iPhone 15 (3, WebKit) y Galaxy S9+ (4,5): nítido.
- **Capa DOM** (`capaDom(canvas)`, `motor.capa`): lo que antes se pintaba a px de dispositivo con setTransform(1,0,0,1,0,0) va en un
  `<div class="capa-escena" aria-hidden="true">` hermano del canvas, absoluto y sin eventos, colocado sobre la caja de contenido
  midiendo los dos rectángulos en cada repintado (vale con cualquier contenedor posicionado; sin contenido no existe). Contiene:
  - cala: `.globo-cala` (retrato a escala entera de px de dispositivo, ≈ 60 px CSS, y frase en 14 px del sistema);
  - combate: `.piso-combate` («p. 9/16», negrita 14 px) y los números de daño (16 px), con contorno por text-shadow.
  Los estilos van inline (app.css es del lote layout); si layout quiere retocarlos, tiene esas clases.
  Se eligió DOM y no un segundo canvas a DPR porque ese canvas volvería a pesar 1,7-3,4 MB.
- `fx.capturaCompartir` amplía el búfer con un factor entero (S, o el que lleve el ancho a ≥ 720 px) sin suavizado; la banda se
  escala con el ancho. Momento en Pixel 7: búfer 130×72 → imagen 1040×692; iPhone 15: 126×73 → 1134×783.
- fx.secuenciaEvolucion / revelarVario usan también setTransform(1).

## Bucle (main.js)

- 15 Hz: tras cada frame, setTimeout hasta (paso − 8 ms) y luego rAF. 8 fps sin toques en 20 s o con «Reducir animaciones».
  Un toque (pointerdown/keydown/wheel) lo devuelve a 15 al momento. `app.pedirFrame` y `router.hayEscenasActivas` siguen igual.
- Se para solo si ninguna escena de la capa de arriba ha querido frames (`S.consumirFrames()`: iniciada, visible según
  IntersectionObserver y con la pestaña visible). Una escena que vuelve a verse lo despierta (`S.alDespertar(pedirFrame)`).
  Los modales sin escena (informe, opacos) ya lo paraban vía router.
- El motor pinta si han pasado ≥ 66,7 − 20 ms desde el último paso (holgura para el jitter de vsync).
- pageshow (bfcache) usa el mismo manejador que visibilitychange→visible (`alVolver`). theme-color: #0a1328 de noche, #14213d de día.

## Precarga

- Cala: Idle de todos al entrar; Walk solo de los que se animan (≤ 12, los únicos que pasean); Sleep de los cercanos
  (cámara ± 1 pantalla) al llegar la noche, con `dormido` o al empezar una siesta; Hop al tocar. Mientras llega una PNG,
  `dibujar` pinta Idle (nunca queda solo la sombra). Desviación: el encargo decía Walk para camX ± 1 pantalla; en vertical eso es el
  mundo entero (40 Walk), y solo los animados pasean.
- Combate: Walk+Idle del equipo y del enemigo del piso; Attack+Hurt de todos 4 s antes del encuentro.

## Cifras (test/ui/rendimiento.mjs, Pixel 7, CPU ×4, 41 vecinos)

| | antes | después |
|---|---|---|
| Cala quieta, hilo principal | 37,9 % | 3,3 % medido (≈ 10 % extrapolado a 15 fps, ver nota) |
| rAF por segundo (cala / en curso) | 60 / 60 | ≈ 16 / 16 (8 con reducir animaciones) |
| Búfer de canvas en la cala | 3,33 MB (1008×826) | 133 KB (202×165) |
| Búfer con En curso encima (cala + combate) | 4,87 MB | 196 KB |
| PNG al abrir la cala con caché vacía | 160 (40 × Idle, Walk, Sleep, Hop) | 53 (40 Idle, 12 Walk, 1 Sleep) |
| Tarea más larga al tocar «Sugerir» | 96 ms | ninguna > 50 ms |
| Tarea más larga al abrir Formar | 54-56 ms | 0-54 ms (montar el DOM de la pantalla; la previsión ya no) |

Nota: con la CPU limitada por CDP, `setTimeout` se retrasa 2-5× aunque el hilo esté libre (en una página vacía, setTimeout(55)
tarda 120-300 ms con ×4). El bucle da entonces ~6 frames/s en vez de 15, así que el % del hilo se extrapola al ritmo real (medido sin
límite: ≈ 16/s en headless, donde el rAF responde al instante; en un móvil el rAF espera al vsync y queda en ≈ 15).

## Cómo medir

- `node test/ui/rendimiento.mjs [--cpu 4] [--sin-limites]` (servidor en :8080). Guarda test/ui/out/rendimiento.json.
  Mide con CDP (Performance.getMetrics → TaskDuration), cuenta rAF envolviendo requestAnimationFrame, tareas largas con
  PerformanceObserver('longtask'), bytes de búfer de todos los canvas, PNG pedidas en un contexto nuevo con la misma partida, y
  la igualdad worker ↔ síncrono (preverAsync/sugerirAsync contra game.prever/game.sugerir).
- test/gfx.test.mjs: prepararCanvas (búfer, k, transform, pixelated) en DPR 1, 2,625, 3 y 4,5; fmt.corto; y que worker-prev
  (con los Datos enviados una vez y el ctx sin datos) da lo mismo que game.prever/game.sugerir.

## Worker de previsión (js/core/prever-async.js)

- `preverAsync(save, idx, plan, ctx, n)` y `sugerirAsync(save, isla, opciones, ctx)` → Promise con lo mismo que game.prever/sugerir
  (el worker importa game.js: mismas funciones, mismas semillas). Datos enviados una vez; el ctx viaja sin ellos. Si no hay Worker,
  no arranca en 4 s, da error o el mensaje no se puede clonar → vía síncrona. `estadoWorker()`, `usarWorker(false)` para pruebas.
- Formar: «Sugerir» pasa a «Sugiriendo…» (deshabilitado, aria-busy) y ENVIAR espera; la previsión deja la anterior con la clase
  **`.prevision.calculando`** (y aria-busy) mientras calcula: clase nueva para que layout la atenúe si quiere. Las respuestas de un
  plan que ya cambió se descartan. La sugerencia al montar (huecos vacíos) también va por el worker.
- selector.js (lote layout) sigue con game.prever(…, 40) síncrono por candidato; podría usar preverAsync.
