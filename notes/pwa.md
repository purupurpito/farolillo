# PWA: instalar y jugar sin conexión

Dueño: lote PWA. Archivos: `manifest.webmanifest`, `sw.js`, `js/pwa.js`, `js/ui/instalar.js`,
`assets/ui/icons/*`, `tools/generar-sw.mjs`, `tools/iconos.mjs`, `test/ui/pwa.mjs` y el `<head>` de `index.html`.

## Decisiones

- **Rutas relativas en todo** (`./`, `sw.js` con scope `./`). Así funciona igual en la raíz y en una subcarpeta de GitHub Pages.
- **Manifest**: `id`, `start_url` y `scope` = `./`; `display: standalone`; `orientation: any`, porque la cala se juega en vertical y en horizontal; fondo y tema `#14213d`.
  La meta `theme-color` sigue en el HTML y la cambia `main.js` según el tema.
- **Iconos** (`node tools/iconos.mjs`): salen de `assets/ui/faro.svg` con escala entera, así que el pixel art queda nítido. Llevan un disco con halo para que se lea el contorno oscuro del faro.
  - `any`: cuadrado redondeado con las esquinas transparentes.
  - `maskable`: a sangre y con todo dentro del círculo del 80 %.
  - `apple-touch-icon` de 180: opaco y en RGB sin canal alfa (iOS pinta de negro lo transparente).
- **sw.js**:
  - El precache del armazón contiene index, css, todo `js/**`, `data/*.json`, los manifest, `assets/ui/*.svg` e iconos.
  - La navegación va por red primero, con un tope de 3,5 s, y si no, sirve `index.html` de la caché. En el móvil con poca cobertura abre enseguida.
  - js, css y json van en stale-while-revalidate. Los sprites `assets/pmd/**` van cache-first en `farolillo-pmd-v1`, a demanda (nunca en el precache: son unos 4200 archivos y 15 MB), con un tope de 1500 entradas que recorta primero las más antiguas.
  - Esa caché sobrevive a las versiones. `activate` borra las demás `farolillo-*`.
  - Solo atiende GET del mismo origen y sin `Range`.
- **Versión de la caché** = `VERSION` de `js/config.js` + `REVISION`, que es una huella sha1 del contenido del precache. Cualquier cambio publicado cambia los bytes de sw.js, el navegador lo detecta e instala la versión nueva en espera.
- **Actualizar**: `js/pwa.js` enseña abajo, encima de las pestañas, «Hay una versión nueva · Reabrir». Reabrir manda `{tipo:'saltar'}`, el SW hace `skipWaiting` y, en `controllerchange`, se recarga.
  Solo ocurre si `#modales` está vacío; si no, pide cerrar antes la ventana. El SW nunca se salta la espera por su cuenta. Al volver a la app (`visibilitychange`), se busca versión nueva como mucho cada 30 min.
- **persist()**: se reintenta en cada arranque si `persisted()` es false. Chrome lo concede con el uso o al instalar. El estado se ve en Ajustes («Guardado protegido»).
- **Instalar**: se captura `beforeinstallprompt` con `preventDefault`. `instalar.js` ofrece «Instalar Farolillo» en Android cuando hay prompt; el hueco se rellena solo si llega tarde.
  En iOS sale una tarjeta «Compartir → Añadir a pantalla de inicio» los primeros 7 días desde `app.save.creado`. «No volver a mostrar» guarda `app.ui.instalarNo`.
- **?test=1** no registra el SW (`?sw=1` lo fuerza). Un SW que ya estuviera registrado en ese origen seguiría controlando la página: en el navegador de desarrollo, borra el SW desde DevTools → Application si molesta.
- **modulepreload**: `tools/generar-sw.mjs` escribe en `index.html` el grafo estático de imports de `main.js` entre las marcas `<!-- <generado:modulepreload> -->`. Así se evita la cascada de peticiones en el móvil.

## Cómo actualizar la versión

1. Si es una versión con nombre, sube `VERSION` en `js/config.js`.
2. `node tools/generar-sw.mjs`: reescribe PRECACHE, VERSION y REVISION en sw.js, y los modulepreload de index.html. **Siempre antes de publicar**, y siempre que se creen o borren módulos.
   `node tools/generar-sw.mjs --comprobar` sale con 1 si algo está desfasado.
3. Si cambia el faro: `node tools/iconos.mjs`.

## Cómo probar sin conexión

- Automático: `npx -y serve -l 8080 .` y `node test/ui/pwa.mjs [--solo chromium|webkit]`.
  Prueba Pixel 7 (Chromium) e iPhone 15 (WebKit): hace el tutorial real, comprueba que el SW está registrado y controla, pone `setOffline(true)` y recarga hasta ver la cala.
  También valida manifest e iconos (tamaños, 200, sin alfa en el de Apple), que Chromium la dé por instalable (`Page.getInstallabilityErrors`), que con ?test=1 no haya SW, que PRECACHE ⊇ `js/**` y que `instalar.js` funcione solo.
  Captura en `test/ui/out/pwa-*-offline.png`.
- A mano en Chrome: abre la página, recarga una vez, ve a DevTools → Application → Service workers → «Offline» y recarga.
- En el móvil real: hace falta HTTPS (GitHub Pages) o `localhost` con reenvío de puertos (`chrome://inspect`).

## Pendiente o límites

- Con stale-while-revalidate, la primera carga tras publicar usa los módulos viejos (coherentes entre sí) y la siguiente ya los nuevos. El aviso «Reabrir» lo adelanta.
- Los sprites que no se han visto nunca con conexión no están sin conexión (fallan como imagen, sin romper la cala).
