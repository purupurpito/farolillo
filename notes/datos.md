# Notas de DATOS (pipeline §13, créditos §14)

## Cómo se regenera

```
cd tools && npm install          # solo pngjs (lo pide §13.3)
node tools/build-assets.mjs      # --solo [lista] para medir; --sin-red usa solo la caché
node tools/build-data.mjs
node tools/check.mjs
```

La caché vive en `tools/.cache/` (sin versionar): `tracker.json`, `credit_names.txt`, `sc/**` (SpriteCollab), `pokeapi/*.csv`,
`vario.json`, `faltan.json` (404 conocidos) e `informe-assets.json` (último informe).

## Versiones fijadas

- SpriteCollab `1a294bec85e309d023c0b074617462c6c6b44a31` (el de la spec).
- PokeAPI `e98f2ad82fc61c46036689ecb10c3aa89d562d6b` (master del 18-nov-2026), en `tools/comun.mjs` como `POKEAPI_SHA`.

## Medida con 20 especies (--solo, muestra por defecto)

0,32 MB de base + 0,23 MB de variocolor = 0,55 MB → media 16,2 KB/especie (base) y 14,1 KB (variocolor).
Proyección a 222: 6,1 MB. Muy por debajo del presupuesto (§13.3: 45 KB/especie de alarma; ~120 MB de tope del encargo),
así que **no se recorta nada**: se conservan Hop y Faint donde existen (salvo los que pesan > 25 KB o son CopyOf).

Por qué sale tan pequeño: el recorte a 3 filas y el reempaquetado a PNG indexado (paleta de 1/2/4/8 bits, zlib 9)
que hace `codificarPNG` en `tools/comun.mjs`. No hace falta oxipng.

## Ejecución completa (222 especies, 18-nov-2026)

- `assets/pmd/`: 4.187 archivos, 5,69 MB (3,25 MB base + 2,44 MB variocolor). Media 15 KB/especie base, 12,7 KB variocolor.
  `manifest.json` 175 KB y `creditos.json` 127 KB (115 artistas). `data/`: 90 KB.
- Las 222 pasan la validación del tracker; ninguna descartada. Las 222 tienen algún extra (Hop y/o Faint) ≤ 25 KB.
- Rareza: C 72 · PC 74 · R 67 · L 9. `vario: true` en 196 especies.
- 10 familias **sin variocolor** (algún miembro sin sprite variocolor completo en el SHA fijado): Growlithe (0058),
  Dratini (0147; ojo, es el raro de Dominio 3 de Cumbre), Sentret (0161-0162), Pichu (falla Raichu 0026),
  Murkrow (falla Honchkrow 0430), Sneasel (0215), Snorunt (0361), Turtwig (falla 0388), Chimchar (falla 0392),
  Starly (0396). Pichu/Pikachu, Snorunt y Dratini en concreto quizá el autor quiera revisarlos con un SHA más nuevo.
- `node tools/check.mjs` → OK.

## Decisiones (lo más simple cuando la spec no lo fija)

- **Archivo extra `tools/comun.mjs`** (dueño DATOS): descargas con caché/reintentos/concurrencia 6, CSV, familias
  y codificador PNG. Lo usan los tres scripts.
- **Origen de descargas:** los PNG por jsDelivr (con respaldo a raw); `AnimData.xml` y `credits.txt` por
  raw.githubusercontent.com, porque jsDelivr devuelve 403 en los `.xml`.
- **build-assets lee `pokemon_species.csv`** para saber las familias y decidir `vario` por familia antes de bajar;
  así no se descargan variocolores de familias que no lo tendrán. `vario.json` ya sale por familia.
- **Retrato `Worried`** también se baja (lo usan los eventos de §4.7); la lista de §13.3 no lo traía.
- **Extras CopyOf** (Hop/Faint que son copia de otra animación) no se copian: el respaldo de `animConRespaldo` los cubre.
  En las 5 básicas el CopyOf se resuelve duplicando la PNG con el nombre de la clave (las rutas son derivadas).
- **Variocolor sin retratos propios:** `manifest.esp[d].vario.p` puede venir vacío; GRÁFICOS debe caer a los
  retratos normales (`urlRetrato` con respaldo).
- **Rareza R forzada por familia completa** para iniciales, Eevee, Dratini, Larvitar, Bagon, Beldum, Gible, **Pichu/Pikachu/Raichu**
  (§13.1 dice que Pikachu sale como R) **y Larvitar/Pupitar/Tyranitar** (§6.5; cr 45, la regla cr < 45 no los cubre).
- **`exc`** se aplica a toda la familia de cada base exclusiva de §6.7.
- **Evoluciones:** fila `is_default=1` de PokeAPI, sin formas regionales, la de `version_group_id` más bajo; los
  overrides de §6.8 sustituyen todas las filas de su destino. Se omiten evoluciones a G5+: Eevee→Sylveon,
  Sneasel→Sneasler, Wooper→Clodsire.
- **Ítems:** shiny-stone→`piedra_dia`, dusk-stone→`piedra_ocaso`, dawn-stone→`piedra_alba`, razor-claw→`garra_afilada` (`c: "objeto"`).
- **especies.json** añade `pokeapi` (SHA) en la cabecera y `cr` (capture_rate) en cada especie, como el ejemplo de §3.2.

## Campos añadidos a `data/islas.json` (aditivos, no rompen §3.3)

- `sec`: bases de otras islas con algún tipo (de la base) en común con esta isla. Peso en `pesoSec` (0,5, §13.1).
  No incluye iniciales, especiales ni legendarios. Sí puede incluir exclusivas de faro (NÚCLEO aplica sus pesos).
- `extra`: `{ base: peso }` para iniciales, Pichu y Eevee (§13.1: R en todas las islas con peso 0,3, y 1 en las
  islas que comparten tipo con la base).
- `objetosJefe` (islas ≥ 5): `{ piedra_alba: 0.10, cordon_amistad: 0.03 }` (§4.6). Informativo; si NÚCLEO lo
  tiene en `K`, manda `K`.
- `fondo` elegido por DATOS (Prado el de la spec; el resto, colores de suelo propios).
- La Mazmorra Misterio no está en `islas.json` (no tiene especies fijas; sus tipos los da `events.js`).

## Créditos (`assets/creditos.json`)

- Filas `CUR` de cada `credits.txt` (sprite, retrato y sus variantes 0000/0001), sin repetir artista+licencia.
- Artistas: id = id de Discord sin `<@!…>` (o `CHUNSOFT`); `n` = nombre de `credit_names.txt` o el id si no hay;
  `url` solo si el contacto es un enlace http(s).
- Bloque `fuente` con los textos de licencia (CC BY-NC 4.0, URL, adaptación, aviso CHUNSOFT, PokéAPI) y una
  descripción de cada valor de `lic`, para que UI redacte `NOTICE.md` y la pantalla Créditos.

## Pendientes / para otros

- UI: redactar `NOTICE.md` con `creditos.json.fuente` + lista de artistas.
- GRÁFICOS: `vario.p` puede estar vacío (ver arriba). Las animaciones de una sola fila llevan `r: [0]`.
