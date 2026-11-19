# Farolillo · La cala del faro

Juego idle de expediciones para el móvil: formas equipos de 3, los mandas a islas de mazmorras cambiantes y vuelven
con monedas, bayas, objetos y nuevos vecinos para la cala. Uso privado (el autor y unos pocos amigos), sin ánimo de lucro.
La especificación completa está en `SPEC.md`; las decisiones por defecto, en `DECISIONES.md`.


## Jugar en local

```bash
npx -y serve -l 8080 .
# y abrir http://localhost:8080/ (en el móvil: http://<IP-del-PC>:8080/ en la misma red)
```

Web estática sin build: HTML, CSS y JS con módulos ES. La partida se guarda en el navegador
(`localStorage` + IndexedDB). En Ajustes se puede exportar e importar como texto.

### Parámetros para pruebas (SPEC §16)

- `?test=1`: reloj fijo (18-nov-2026 10:00 si no hay `?reloj=`), sin IndexedDB, y `window.__farolillo` con
  `avanzar(ms)` y `jugar(rondas, ms)` para saltar tiempo.
- `?reloj=2026-11-18T22:30` (hora local) o milisegundos: instante de partida del reloj del juego.
- `?test=1&nuevo=1`: borra la partida guardada al arrancar.

## Pruebas

```bash
node --test "test/*.test.mjs"          # unitarias (en Node 24 hay que pasar el patrón)
npx -y serve -l 8080 .                 # en otra terminal
node test/ui/capturas.mjs              # capturas en 360x640, 640x360 y 568x320 → test/ui/out/
node tools/sim.mjs --dias 30 --semillas 20 --politica voraz   # simulador de ritmo
```

`capturas.mjs` usa Playwright: si no está instalado en el proyecto lo busca en la caché de `npx`
(`npx playwright install chromium` instala el navegador).

## Datos y assets

`node tools/build-assets.mjs && node tools/build-data.mjs && node tools/check.mjs` (dependencias solo en `tools/`).

## Estructura

- `index.html`, `css/app.css`, `js/main.js`, `js/ui/*`: interfaz (pantallas, router, componentes).
- `js/core/*`: reglas del juego sin DOM (resolución, reclutamiento, guardado…).
- `js/gfx/*`: sprites y escenas en canvas.
- `data/`, `assets/`: datos y sprites generados por `tools/`.
- `notes/*.md`: decisiones y pendientes de cada módulo.

Créditos y licencias: `NOTICE.md`.
