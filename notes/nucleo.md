# Notas de NÚCLEO (v0.1)

Archivos: `js/core/rng.js`, `formulas.js`, `sim.js`, `worker-prev.js`, `recruit.js`, `evolve.js`, `tools/sim.mjs`,
`test/{rng,formulas,sim,recruit,evolve}.test.mjs`, `test/fixtures/nucleo/*`, `test/fixtures/registro-*.json`.

Pruebas: `node --test test/*.test.mjs` (en Node 24, `node --test test/` falla porque toma la carpeta como módulo).
Goldens: `UPDATE_GOLDEN=1 node --test test/sim.test.mjs` los regenera (solo si cambia la resolución a propósito).

## Desviaciones de la spec

1. **D0 ajustado** (§4.4 lo permite): `K.D0 = [50, 120, 212, 327, 470, 650, 845, 1075]` en lugar de
   `50 × 1,66^(m−1)` (que queda en `K.D0_SPEC`). Con la forma de la spec, el equipo de referencia daba
   p(jefe) ≈ 1 en las islas 2-3 y ≈ 0 en la 8: el poder crece mucho más despacio que 1,66 por isla.
   La spec no dice qué `tot` tiene el equipo de referencia; lo fijo en `K.TOT_REF = [200, 250, 300, 340, 380, 420, 450, 480]`
   (tres tipos distintos y neutros, sin bono de monotipo). Con eso p(jefe) ≈ 0,61 en la isla 1 y ≈ 0,50 en las demás.
   D0[0] = 50 se conserva para que siga valiendo la calibración 1 (P 138 → 0,99 / 0,68).
2. **expSig(50) = 7.610**, no 7.608: la fórmula `round(6 × L^1.8 + 15 × L)` da 7.610 (la spec redondeó a mano). Manda la fórmula.
3. **Tramos de F = 12**: salen 7 tiradas (6 + jefe), no «entre 8 y 11». Se respeta la fórmula `ceil((F−1)/10)`.
4. **Misterio**: F = 99 (tabla de §4.1); al superar el 99 vuelve con motivo `objetivo`.
5. **Reintentos de jefe**: máximo 2 (3 intentos). Si falla el tercero sin llegar a 0 PV vuelve con motivo `rescatado`.
6. **Encuentros de la Misterio**: especies base (no L) de los dos tipos de la semana de todos los datos;
   etapa 2 desde el piso 30 y etapa 3 desde el 60 (`K.MISTERIO_ETAPA2/3`). La spec no lo decía.
7. **Evoluciones salvajes**: lectura literal de §3.3: etapa 2 solo en islas ≥ 4 y etapa 3 en islas ≥ 6, siempre en el
   40 % final de pisos. En las islas 1-3 no salen formas evolucionadas aunque tengan `evolTardias: true`.

## Decisiones (lo que la spec no fijaba)

- **hashSeed**: FNV-1a sobre las unidades UTF-16 de `partes.join('|')`; las unidades > 255 se mezclan en dos bytes.
- **Clima**: `ctx.clima` puede ser id, objeto de efectos, mapa `{ "1": id, misterio: id }` o función. Los efectos
  están duplicados en `K.CLIMA` (mismos que `events.js`). Niebla: el Explorador pesa 3 en `vel` (el extra se duplica)
  y su cuota de cofre también. Ningún clima toca D (climaD = 1).
- **Cofre de piso secreto**: «+5 % por Explorador» = +5 puntos de cuota del cofre cuando sale un evento (20 % → 25 %).
- **Kecleon**: precio = 2 × monedas del piso (baya grande) o 6 × (resto); compra si cuesta ≤ 20 % de lo ganado hasta ahí.
- **Evento menor forzado** (3 informes sin especial): en el primer piso superado, entre kecleon, cofre y perdido.
- **Fallo de tramo**: el botín al 50 % incluye la probabilidad de objeto al 50 %. Prudente/audaz también escalan `pObjeto`.
- **Botín**: se redondea por piso. La EXP del registro es por miembro y **sin** multiplicadores de §5 (alcanzar al
  grupo ×2, intercambio ×1,5): los aplica quien cobra (game.js).
- **Guion de la primera hora**: `crearSnapshot` lee `save.tutorial.enviadas` (envíos sin contar el tutorial;
  si falta, `stats.exps`). 0 y 1 → pEnc ×3; 2 → un R forzado que acepta en el primer piso superado, si no hay
  ya un R/L en la colección **sin contar el guía** (`de === 'faro'`, que es un inicial y por tanto R).
- **Tutorial**: `plan.tutorial = true` → isla 1, 3 pisos de 20 s, sin fallos, recluta C de la isla 1 con los pesos
  del faro, nivel 4, acepta seguro en el piso 3.
- **Piedad y huellas** viajan en el snapshot y el registro devuelve el estado final en `registro.estadoRecluta`
  (`{ piedad, huellas }`); game.js lo copia a `save.islas[i]`. Huellas en unidades de 0,25 (0-3); se borran al aceptar.
  La piedad se reinicia con R o L.
- **Campos añadidos** (compatibles) al Registro: `isla, F, hasta, modo, postura, P, n, pisos, estadoRecluta,
  jefeSp, pool`; a cada ronda `pv0`; a cada encuentro `de` (`"prado:7"`, `"tutorial"`, `"misterio:12"`).
  `estadoEn` calcula piso y PV a partir de `t0`, `tPiso`, `fallos` y los manantiales, sin guardar pasos.
- **Patrulla**: vuelve a la hora nominal (`fin = inicio + horas`) con motivo `tiempo`; un reintento de jefe puede
  pasarse hasta 2 `tPiso`.
- **sugerirEquipo** puntúa siempre con una vuelta hasta el jefe (también para patrullas: las vueltas dependen de eso)
  y usa la misma semilla para todos los candidatos. Opciones nuevas: `candidatos` (8), `n` (40), `semilla`,
  `disponibles`, `excluir`. En Node tarda ~10-30 ms; `worker-prev.js` exporta `atender(msg)` y escucha mensajes
  solo dentro de un Worker.
- **Tabla de encuentros**: entradas `[sp, peso, desdePiso]`. Lee `especies` (peso 1 o `[sp, peso]`), `sec` (peso
  `pesoSec`) y `extra` (`{sp: peso}`) de `islas.json`. Si una isla no trae `extra`, añade iniciales, Pikachu y Eevee
  con 0,3 (×3 si comparten tipo). Exclusiva del propio faro ×1 (aunque sea de su generación).
- **aplicarRecluta**: devuelve también `tipo: "lleno"` (400 individuos y especie nueva) y `"rechazo"` (no aceptó:
  solo marca `visto`). El progreso hacia la siguiente estrella va en `mon.dup` (campo nuevo del Mon, opcional).
  Caramelos por especie (`save.caramelos[sp]`). Ajuste `preguntar`: el duplicado llega como individuo.
  El id del nuevo Mon es determinista (hash de especie, piso, hora y tamaño de la colección).
- **evolve**: `opcionesEvolucion(mon, save, datos, ahora, via = "normal")` acepta `via` (quinto argumento,
  opcional) para mostrar las de intercambio como posibles al llegar por intercambio. Cada opción trae `pago`
  (`objeto | caramelos | cordon | null`). Exporta `OBJETOS` (nombres visibles) y `nombreObjeto`.

## Simulador (`tools/sim.mjs`)

Modelo propio de la economía del jugador (no usa game.js): cobra el registro, EXP con tope y «alcanzar al grupo»,
cariño, huerto offline con Despensa, edificios con `costeEdificio`, reclutas con `aplicarRecluta`, evoluciones con
`evolve`. Política perezosa = «Recoger todo» + «Enviar a todos» (sugerencia), sin mejoras, sin evolucionar y sin
bayas; la literal «solo Repetir» está como `--politica repetir` (no avanza de isla). La primera hora juega seguido
(cada 5 min), luego 5 sesiones al día entre las 08:00 y las 23:00.

### Resultado con los números de la spec (data/ real, 30 días)

`node tools/sim.mjs --dias 30 --semillas 20` (136 s), p50:

| Hito | Voraz | Perezosa | Objetivo |
|---|---|---|---|
| Primer raro | 15 min | 15 min | ≈ 30 min |
| Muelle 1 | 3,8 h | nunca | día 1 |
| Primera evolución | 26 min | nunca | ≈ 1 h |
| Isla 4 | 7,7 h | 24 h | ≈ 4 h |
| Isla 6 | 24 h | 3,2 d | días 2-3 |
| Isla 8 vencida | 40 h | 8,2 d | días 6-10 |
| 25 % Bitácora | 2,3 d | 8,5 d | semana 1 |
| Primer variocolor | 3,4 d | 13 d | semanas 2-4 |
| Meseta máx. | 11,5 h | 2,7 d | < 24 h |

Ritmo perezosa/voraz 0,28 → código de salida 1. En corto: la voraz va **mucho más deprisa** que §2.3 (isla 8 vencida en
~1,5-2 días, objetivo 6-10) y la perezosa va a ~9 días, así que el **ritmo perezosa/voraz sale ≈ 0,2-0,3** (objetivo ≥ 0,6)
y el simulador sale con código 1.

Diagnóstico (ablaciones con `--sin-mejoras`, `--mejoras x`, `--sin-evo`, `--k`):
- La voraz está limitada por las sesiones, no por el poder: cada sesión vence una isla.
- Los edificios se maximizan en ~2 días: con `MON_G = 1,9` una vuelta a la isla 8 da ~125.000 monedas y la Linterna 30
  cuesta 8.600. La Linterna sola (+90 % de poder) explica casi todo (sin mejoras: isla 8 a ~5 días).
- Los reclutas llegan al nivel de su isla (`nvSalv`) y en las islas ≥ 6 ya evolucionados (tot ~500), y las ventajas de
  tipo, el cariño y las evoluciones dan ×1,4-2 que el equipo de referencia de la calibración no tiene.
- La perezosa no evoluciona ni mejora nada (1 equipo): la distancia es estructural. Con «solo Repetir» es imposible
  llegar a 0,6 sin rebajar mucho el valor de evolucionar y mejorar.

Prueba que más acercó la voraz al objetivo (no aplicada, porque el encargo era usar los números de la spec):
`--k '{"MON_G":1.45,"EXP_G":1.4,"HUERTO_G":1.4,"NV_SALV_M":4,"EDIFICIOS":{"huerto":{"base":80,"g":1.3,"tope":25},
"despensa":{"base":300,"g":1.3,"tope":16},"muelle":{"costes":[600,15000,150000],"tope":3},
"linterna":{"base":2000,"g":1.26,"tope":30},"taberna":{"base":2000,"g":1.32,"tope":15}}}'`
→ voraz: isla 6 ≈ 2 d, isla 8 vencida ≈ 4,2 d, meseta p50 ≈ 24 h; perezosa: isla 8 > 11 d; ritmo ≈ 0,27.

## Pendiente (para decidir con el autor)

- Qué significa «ritmo» de la perezosa y si puede evolucionar/mejorar algo (con «solo Repetir», 0,6 no es alcanzable).
- Rebajar la economía de monedas (`MON_G`) y encarecer Linterna/Taberna, o atar el D de las islas 5-8 a un equipo de
  referencia evolucionado (TOT_REF más alto) para que la voraz quede limitada por el poder y no por las sesiones.
- Segunda pasada del simulador cuando estén misiones y eventos (v0.2).

## Integración (18-nov)

K ajustados por el integrador con el simulador: ver `notes/simulador.md` (PV_BASE 5, MON_G 1,3, EXP 30/1,35,
NV_SALV_M 4, huerto 3/1,4, edificios más caros). Sesiones del simulador 08-24 h; opción `--perezosa-evo`.
El ritmo perezosa/voraz queda en 0,52: falta la decisión de diseño sobre evolucionar con un toque.
