# ESTADO: notas, API para la UI y pendientes

Dueño: ESTADO. Archivos: `js/core/{state,game,economy,events,missions,bus}.js`, `js/data.js`,
`test/{state,economy,game}.test.mjs`, `test/fixtures/{datos-mini.mjs,save-v0.json,save-v1.json}`.
Pruebas: `node --test test/state.test.mjs test/economy.test.mjs test/game.test.mjs` (42 en verde, incluida una con los datos reales de `data/`).

## Cómo arranca la UI (resumen)

```js
import { cargarDatos } from './data.js';
import * as state from './core/state.js';
import * as game from './core/game.js';
import * as bus from './core/bus.js';

const datos = await cargarDatos('./');
const almacen = state.crearAlmacen({ localStorage, indexedDB, storage: navigator.storage });
let save = await state.cargar(almacen);            // null = primer arranque
const ctx = () => game.crearCtx(datos, Date.now());
if (!save) {
  // pantalla inicio: elegir guía y faro, y entonces:
  ({ save } = game.iniciarPartida({ guia, faro, nombre }, ctx()));
  state.persistir(almacen);                          // navigator.storage.persist()
  state.guardar(almacen, save, { inmediato: true });
}
bus.on('save:cambio', () => state.guardar(almacen, save));             // debounce 1 s
document.addEventListener('visibilitychange', () => { if (document.hidden) state.guardar(almacen, save, { inmediato: true }); });
setInterval(() => { const r = game.tick(save, ctx()); document.title = r.titulo; }, 30_000);
```

Tras una operación compuesta (`recogerTodo`, `recogerEquipo`, `evolucionar`, `usarObjeto`, `mejorar`, `enviar*`)
la UI debe llamar a `state.guardar(almacen, save, { inmediato: true })` (§12.2: una sola escritura).
`app.guardar()` de §15.2 puede ser exactamente eso.

## Ctx

`game.crearCtx(datos, ahora, extra?)` → `{ datos, ahora, semana, clima, evento, noche, momento, tiposMisterio, ...extra }`.
- `clima`: `{ "1": id, …, "8": id, misterio: id }` con id ∈ `despejado|niebla|calor|tormenta|luna` (nombres visibles en `events.CLIMAS[id].n`).
- `evento`: siempre `null` en v0.1. `noche`: marea (22-07). `momento`: `'dia'|'noche'` (07-19).
- Crear uno nuevo en cada acción (lleva `ahora`). `extra.rng` fuerza un PRNG (pruebas); `extra.visitantes = true` enciende visitantes (v0.2).

## API de `js/core/game.js`

Todas mutan `save` (si es acción) y nunca tocan el DOM. Errores de validación: `throw new Error('mensaje en castellano')`, listo para enseñar en un aviso.

### Arranque y ciclo
| Función | Devuelve | Notas |
|---|---|---|
| `crearCtx(datos, ahora, extra?)` | Ctx | |
| `iniciarPartida({ guia, faro, nombre }, ctx)` | `{ save, fin }` | Crea la partida y lanza sola la expedición del tutorial (3 pisos × 20 s, recluta C garantizado nv 4). |
| `tick(save, ctx)` | `{ avisos, cambios, deVuelta, huerto, titulo }` | Al abrir y cada 30 s. Reloj hacia atrás, días jugados. **No recoge nada**. `titulo` = «(2) ¡Equipo de vuelta!» o «Farolillo». `huerto` = bayas pendientes. |
| `avisos(save, ctx)` | `Aviso[]` (máx. 3) | `{ tipo, n, texto, destino }`; tipo ∈ `vuelta, evolucion, mejora, nivel, mision, visitante, lleno` en ese orden; destino ∈ `cala, expediciones, gremio, gremio:faro`. |
| `metaSiguiente(save, ctx)` | `{ texto, destino: { pantalla, isla? } }` | `texto` ya trae «Meta: …». pantalla ∈ `cala, formar`. |

### Expediciones
| Función | Devuelve | Notas |
|---|---|---|
| `equipos(save, ctx)` | 4 × `estadoEquipo` | Para la pantalla Expediciones (E1-E4). |
| `estadoEquipo(save, idx, ctx)` | `{ idx, estado, … }` | estado ∈ `bloqueado` (falta Muelle), `libre` (`miembros, roles, ultimoPlan`), `fuera`/`vuelta` (`miembros, roles, isla, plan, inicio, fin, progreso = sim.estadoEn(...)`, y `reclutas` (nº) si `vuelta`). |
| `equiposDeVuelta(save, ctx)` | `idx[]` | |
| `listaIslas(save, ctx)` | 9 islas (8 + `misterio`) | `{ id, n, tipos, F, desbloqueada, pisoMax, jefe, piedad, huellas, clima, dominio }`. Para el carrusel y la barra de piedad (`piedad`/40). |
| `islaObj(isla, ctx)` | isla §3.3 o la Misterio sintética | |
| `normalizarPlan(save, plan, ctx)` | Plan completo | Rellena roles (`expl` por defecto), `hasta` (F), `horas` (1/4/8), postura, dominio; Misterio siempre `patrulla`. |
| `validarPlan(save, idx, plan, ctx)` | — / throw | |
| `prever(save, idx, plan, ctx, n = 200)` | `Prevision` de sim | `{ pJefe, pisosMedia, vueltasMedia, monedas, exp, reclutas, finMediana }`. La UI pone el debounce de 150 ms. Para el «+12 %» del selector usar `n = 40`. |
| `sugerir(save, isla, opciones, ctx)` | `{ equipo, roles, prob }` | Ya excluye ocupados y reservados. `opciones`: `{ excluir, modo, horas, postura, hasta }`. |
| `planSugerido(save, idx, ctx)` | Plan o null | Lo que usaría «Enviar a todos». |
| `enviar(save, idx, plan, ctx)` | `{ fin }` | Plan §4.2 (se normaliza). Guarda `ultimoPlan`. |
| `repetir(save, idx, ctx)` | `{ fin }` o null | null si el equipo está fuera, sin último plan o sin su Líder. Quita del plan a los que falten u ocupados. |
| `enviarTodos(save, ctx)` | nº enviados | «Enviar a todos con la sugerencia»: isla más honda con p(jefe) ≥ 0,6 (o la mejor de las 3 más hondas); de noche patrulla de 8 h; si no hay sugerencia, repite. |
| `recogerTodo(save, ctx)` | `Informe` | Equipos de vuelta + huerto + visitante caducado. Emite `informe`, un `momento` por cada momento y `save:cambio`. |
| `recogerEquipo(save, idx, ctx)` | `Informe` | Solo ese equipo (sin huerto). |
| `semillaEnvio(save, idx, ctx)` | número | |

`Informe = { equipos: [InfEquipo], cala: { bayas, visitante, caducado }, momentos: Momento[], misiones: [] }`

`InfEquipo = { idx, isla, islaN, registro, plan, pisoFin, jefe, primerJefe, motivo, monedas, exp, objetos: {id: n}, eventos: [{f, tipo, datos}], nivelesSubidos: [{uid, sp, de, a}], reclutas: [{sp, acepta, rar, nv, vr?, uid?, tipo?, nueva?}], manantiales }`
- `motivo` ∈ `objetivo | rescatado | tiempo | prudente` (de sim). «Rescatados en p.9» = `motivo === 'rescatado'` y `pisoFin`.
- `exp` es por miembro (antes de multiplicadores). `reclutas` incluye los que no aceptaron (`acepta: false` → «X se ha fijado en tu equipo»). `tipo` ∈ `nuevo|individuo|estrella|caramelo|lleno`.
- `eventos[].tipo` ∈ `kecleon|cofre|casa|perdido|manantial` (datos de sim: `kecleon {it, precio}`, `cofre {it, monedas}`, `casa {gana}`, `perdido {car, monedas}`, `manantial {pv}`).

`Momento = { tipo, uid?, sp, vr?, emocion, texto, … }`
- `recluta` (`rar`, `nueva`), `variocolor`, `jefe` (`isla`, `abre`: id de la isla nueva o null, `misterio`: true si abre la Misterio), `evolucion` (`spAntes`).
- `emocion`: `Happy` (recluta), `Joyous` (variocolor, evolución, jefe). `texto` listo para enseñar.

### Pokémon
| Función | Devuelve | Notas |
|---|---|---|
| `buscarMon(save, uid)`, `nombreMon(mon, datos)` | | apodo o nombre de especie |
| `libres(save)`, `ocupados(save)`, `reservados(save)`, `estaLibre(save, uid)` | | |
| `poderDe(save, uid, ctx)` | número | poder individual (§4.5, sin tipos) |
| `ventaja(save, uid, isla, ctx)` | `{ mult, simbolo }` | símbolo `▲` (≥ 1,1), `=`, `▼` (≤ 0,9); incluye clima |
| `tope(save)`, `jefesVencidos(save)` | | tope de nivel |
| `darBayas(save, uid, cantidad, ctx)` | `{ nv, xp, gastadas, subidos, alTope }` | cantidad: número o `'siguiente'`. Nunca gasta bayas que se perderían por el tope. |
| `igualar(save, ctx)` | `{ gastadas, subidos }` | 6 de menor nivel |
| `tocarVecino(save, uid, ctx)` | `{ frase, cariño, subio }` | +1 cariño una vez al día |
| `opcionesEvolucion(save, uid, ctx)` | de evolve.js | `[{ a, c, it?, lv?, momento?, posible, falta, pago? }]`; varias = ramificada |
| `evolucionar(save, uid, destino, ctx)` | Mon | throw si no puede; emite `momento` (tipo `evolucion`) |
| `usarObjeto(save, uid, objeto, ctx, destino?)` | `{ ok, efecto, mon, texto }` | `baya_grande` → +3 cariño (`efecto: 'carino'`); piedras/garra/cordón → evoluciona (`efecto: 'evolucion'`) |
| `usarCaramelo(save, uid, 'carino' \| 'bayas', ctx)` | `{ nv, xp, car }` | |
| `ponerApodo(save, uid, apodo)` | bool | ≤ 12, sin `<>` |
| `alternarFavorito(save, uid)`, `alternarNoEvo(save, uid)` | nuevo valor | |
| `liberar(save, uid)` | true / throw | el guía (`de: 'faro'`) no se puede liberar; la UI pide confirmación |

### Faro, cala y ajustes
| Función | Devuelve | Notas |
|---|---|---|
| `mejorar(save, edificio, ctx)` | bool | `huerto|despensa|muelle|linterna|taberna`. Muelle añade equipo. Antes de subir huerto o despensa recoge el huerto. |
| `economy.infoEdificio(save, id)` | `{ id, n, nivel, coste, alTope, asequible }` | para la sub-pestaña Faro |
| `economy.tasaActual(save)`, `economy.topeHoras(save)`, `economy.pendienteHuerto(save, ahora)`, `economy.huertoLleno(save, ahora)`, `economy.nivelCala(save)` | | |
| `atenderVisitante(save, ctx)` | Mon o null | v0.2 (los visitantes no salen en v0.1) |
| `cambiarAjuste(save, clave, valor)` | bool | `nombre` (≤ 16, sin `@<>`), `duplicados` (`fusionar|preguntar`), `sonido` (0-1), `reducirAnim` |
| `cambiarMision`, `cobrarMision` | — / null | v0.2 |
| `OBJETOS`, `nombreObjeto(id)` | | nombres visibles (reexportados de evolve.js) |

### Guardado (`js/core/state.js`)
`crearAlmacen`, `cargar`, `guardar(almacen, save, { inmediato })` → `{ bytes, grande, error }` al escribir (`grande` si > 1,5 MB: avisar),
`exportar(save)` → texto `FAR1.…`, `importar(texto)` → Save (throw con mensaje en castellano), `fusionarTrasImportar(actual, entrante)` (usar siempre tras importar: `save = fusionarTrasImportar(save, importar(txt))`), `persistir(almacen)`.

## Eventos del bus (`js/core/bus.js`: `on(evento, fn) → off`, `off`, `emit`)

| Evento | Datos | Cuándo |
|---|---|---|
| `save:cambio` | `{ motivo }` | Tras cualquier acción que cambia el guardado (enviar, recoger, bayas, mejorar, toque, evolución, objeto, apodo, ajuste, liberar, tick con cambios). La UI guarda con debounce. |
| `informe` | `Informe` | `recogerTodo` y `recogerEquipo` (con algo recogido). |
| `momento` | `Momento` | Uno por momento del informe (en orden) y al evolucionar. La UI los encola; se cierran con toque. |
| `aviso` | `Aviso[]` | Cada `tick`, con la lista actual (máx. 3). |
| `exp:enviada` | `{ idx, plan, fin }` | Al enviar (también el tutorial y «Enviar a todos»). |

## Textos que lee ESTADO de `data/textos.json` (dueño UI)

- `frases.timido` (cariño < 30), `frases.normal` (< 60), `frases.feliz` (< 80), `frases.amigo` (≥ 80): arrays de frases para `tocarVecino`. Variables: `{n}` = nombre del farero, `{yo}` = nombre del vecino. Si falta un cubo se usa otro; si no hay ninguno, frase vacía.

## Decisiones (y desviaciones de la especificación)

1. **Guía:** entra con nivel 5, cariño 30, `de: "faro"` y diario `llega {i: "faro"}` (§3.8 no tenía valor para el guía). No se puede liberar.
2. **Campos añadidos al guardado** (los rellena `migrar`, sin subir `saveVersion`): `base.restoBayas` (fracción de baya pendiente, para no perder producción con recogidas frecuentes), `base.ultimaVisita` (ancla de las tiradas de visitante), `tutorial.enviadas` (envíos sin contar el tutorial; lo lee `sim.crearSnapshot` para el guion de §6.6). recruit.js añade `mon.dup` (duplicados acumulados hacia la siguiente estrella).
3. **Migración 0→1:** adopta guardados sin `saveVersion` (prototipo: `pokemons`, edificios sueltos). Fixtures en `test/fixtures/save-v0.json` y `save-v1.json`.
4. **Exportar:** el checksum fnv1a32 es sobre los bytes UTF-8 del JSON. Importar ignora espacios y saltos de línea pegados.
5. **El huerto no se recoge en `tick`**, solo en «Recoger todo» (§2.1) y antes de mejorar huerto/despensa. Así el tope offline y el 75 % tras 2 h tienen sentido.
6. **Bayas al tope:** con bayas no se acumula EXP por encima del tope (no se gastan); la EXP de expediciones sí acumula hasta 1 nivel (§5).
7. **Alcanzar al grupo con bayas:** la media es la del equipo donde está el Pokémon; si no está en ninguno, la de los 3 de más nivel.
8. **Piedad y huellas:** al enviar, el snapshot parte del estado de la isla o, si ya hay equipos de expedición en ella, del `registro.estadoRecluta` del último que salió (`sim.estadoReclutaVigente`): dos equipos enviados a la vez no comparten el mismo R garantizado. Al recoger se aplica `recruit.trasEncuentro` a cada encuentro del registro sobre la isla (no se copia el estado final), así la piedad no va hacia atrás ni se pierden huellas de otros equipos.
9. **Cala llena (§3.8):** un recluta que no entra (`tipo: 'lleno'`) no suma cadena ni da momento de «se une»: va a `save.pendientesLleno` (máx. 10; nunca se tira un variocolor). La UI ofrece «Liberar a otro» (abre la ficha) / «Dejarlo ir»; `game.admitirPendiente` / `game.descartarPendiente`.
10. **Momentos sin ver:** `save.momentosPendientes` (máx. 20). main.js quita cada uno al cerrarlo y reproduce los que queden al arrancar.
11. **Hitos de la Bitácora (§6.10):** `game.revisarHitos` da 1 `cordon_amistad` al llegar al 50 % (una vez, `save.hitos.cordon50`); se mira al recoger, evolucionar, atender visitante, admitir pendiente y en `tick`.
12. **Misterio:** el récord semanal cuenta para la semana de `exp.inicio` (no la de la recogida) y el último tramo se recorta al piso 99.
13. **Guardado:** `parsear` distingue «sin texto» de «no se puede convertir»; en ese caso el texto va a `farolillo.save.roto` y `cargar` deja `almacen.roto` (la UI no ofrece partida nueva sin confirmar). `farolillo.save.rev` (sesión:contador) detecta otra pestaña que guardó después: la vieja se bloquea. Sin localStorage ni IDB, `almacen.volatil` y aviso fijo. IDB tiene 1,5 s para responder al cargar. `reanclarReloj` desplaza expediciones con inicio futuro (reloj adelantado al enviar); `tick` acota `visitante.vence` y quita días jugados futuros.
14. **«Enviar a todos»** usa la sugerencia (§9.2.4), no repetir; «Repetir» es por equipo.
15. **Avisos:** añadido `nivel` («N pueden subir de nivel», §2.1) tras `mejora`, y `lleno` (≥ 380) al final.
16. **Visitantes:** implementados en economy.js (`tiraVisitante`, `producir` con `ctx.visitantes`) pero apagados en v0.1.
17. **events.js:** `eventoSemana` devuelve null en v0.1. Extra: `CLIMAS` (con nombre visible), `efectosClima`, `climasDeLaSemana`, `climaTipo`, `momentoDia`, `esPatrullaNocturna`, `diaLocal`, `semanaDe`, `TIPOS`.
18. **data.js:** `datos.especies` es el mapa (se desenvuelve `especies.json`), y se añaden `datos.islaPorId` y `datos.meta = { v, sha }`. `textos.json` es opcional (si falta, `{}`).

## Pendientes / avisos a otros dueños

- **NÚCLEO (`sim.js`, `tieneRaro`)**: el guion «la 3.ª expedición fuerza un R» no salta nunca, porque `tieneRaro` cuenta al guía y los 6 guías son R (iniciales forzados a R en §6.5). Propuesta: ignorar los individuos con `de === 'faro'` (o mirar solo reclutas). No lo toco.
- **NÚCLEO**: `recruit.anotarDiario` duplica `state.anotarDiario` (mismas reglas). Da igual mientras sean iguales.
- **UI**: llamar a `fusionarTrasImportar` al importar; enseñar `guardar(...).grande`; el aviso de iOS (§12.2) es de la UI.
- v0.2: misiones (`missions.js` es un stub), evento semanal, Dominio, visitantes encendidos.
