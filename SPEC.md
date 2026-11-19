# Farolillo: especificación final de implementación

> Versión de la especificación: 1.0 (18-nov-2026). Base: diseño C («Farolillo», MVP y alcance), que puntuaron mejor los dos jueces. Lleva injertos de A (apego) y de B (estrategia ligera), y corrige los riesgos que señalaron los jueces.
> Este documento es **autosuficiente**: varios agentes deben poder implementar en paralelo leyendo solo esto. Si algo no está aquí, se decide a favor de lo más simple y se apunta en `notes/pendiente.md`.
> Todos los números viven en `js/core/formulas.js` (objeto `K`). Son puntos de partida y los fija el simulador (§15.3).
> Las decisiones por defecto que el autor podría cambiar están en `DECISIONES.md`.

---

## 0. Reglas que mandan

1. **Uso privado y sin ánimo de lucro.** el autor y unos pocos amigos. Sin anuncios, pagos ni donaciones, nunca.
2. **Ni «pokemon» ni «pokémon»** en el nombre del repo, la descripción, los topics ni el id del proyecto Firebase. `<meta name="robots" content="noindex,nofollow">` y `robots.txt` con `Disallow: /`.
3. **Publicación:** GitHub Pages con URL discreta, repo público `purupurpito/farolillo` (decidido el 19-nov-2026).
4. **Móvil primero.** El diseño principal es 360x640 en vertical. Tiene que funcionar en 640x360 y 568x320 en horizontal. Se prueba en los tres tamaños antes de cada entrega.
5. **Web estática sin build para jugar.** HTML, CSS y JS vanilla con módulos ES. Node solo se usa en `tools/` (assets, datos, simulador) y en `test/`.
6. **Textos en castellano.** El código (identificadores) puede ir en castellano o inglés, pero de forma coherente dentro de cada módulo. Esta especificación usa castellano.
7. **Mecánicas propias.** Se usan los personajes y sus sprites, pero no se copia la estructura de ningún juego concreto.
8. **Ninguna derrota quita nada.** Un equipo que cae vuelve con lo ganado.
9. **El alcance está cerrado** (§19). Lo que no esté en un hito va a «después de 1.0».

---

## 1. Identidad

| | |
|---|---|
| Nombre provisional | **Farolillo** (subtítulo: «La cala del faro») |
| Repo | `purupurpito/farolillo` |
| URL | `https://purupurpito.github.io/farolillo/` (sin enlazarla desde ningún sitio) |
| Proyecto Firebase | Nuevo, id neutro tipo `farolillo-cala-XXXX` (único global, se elige al crearlo) |
| Clave de guardado | `farolillo.save` |

### 1.1 Fantasía

En un archipiélago donde solo viven Pokémon hay un faro viejo en una cala. Tú eres su farero, que es tu Pokémon inicial y hace de avatar. La luz del faro guía a los equipos que salen en barca hacia las **islas de mazmorras cambiantes**. Vuelven con monedas, bayas, objetos, historias y **nuevos vecinos** que se quedan a vivir en la cala. Cada vecino es un individuo con apodo, fecha y lugar de llegada y un pequeño diario.

Tono amable, nunca dramático: un equipo derrotado «vuelve rescatado con chichones».

### 1.2 Resumen del juego en 6 líneas

- Formas equipos de 3 (Líder + 2 con rol) y los mandas a una isla con una postura.
- La expedición se **resuelve entera al enviarla** con un PRNG con semilla. El progreso offline es exacto y gratis.
- Al volver, el informe trae monedas, EXP, objetos y reclutas. Los momentos especiales (raro, evolución, variocolor) paran la pantalla.
- Con monedas mejoras 5 edificios del faro. Con bayas subes niveles. Con objetos evolucionas.
- Cada semana cambia el clima de cada isla y hay una Mazmorra Misterio igual para todos.
- Con amigos (v0.3): liga privada con tabla, visitar su cala e intercambiar Pokémon.

---

## 2. Bucle de núcleo

### 2.1 Sesión (60-120 s)

```
abrir -> «Mientras estabas fuera…» (informe, se salta con un toque)
      -> [Recoger todo]  1 toque: expediciones terminadas + huerto + visitante caducado
      -> cola de momentos especiales (cada uno espera un toque)
      -> avisos (máx. 3): «2 pueden subir de nivel · Mejora disponible · Misión lista»
      -> 1-2 decisiones: ¿evoluciono? ¿qué mejoro? ¿a qué isla y con qué postura?
      -> [Repetir] por equipo o [Enviar a todos] (sugerencia)   1 toque
      -> si sobra tiempo: tocar vecinos, atender al visitante, mirar la Bitácora o la Liga
```

`Recoger todo` y `Enviar a todos` deben cubrir **todo** lo recurrente, para que una sesión de 60 s no deje la sensación de tareas pendientes. Lo opcional (tocar vecinos, visitante) nunca genera aviso rojo salvo el visitante a menos de 2 h de irse.

### 2.2 Día

- **Mañana:** recoger la patrulla nocturna, misiones diarias (se renuevan a las 06:00), expediciones cortas.
- **Ratos sueltos:** expediciones de 5 a 40 min, subir niveles, mejorar, abrir una isla nueva cada 1 o 2 días.
- **Noche:** patrullas de 4 u 8 h (bonus nocturno).

### 2.3 Ritmo objetivo (lo valida el simulador con 4-5 sesiones al día)

| Hito | Objetivo (mediana) |
|---|---|
| Primera expedición enviada | < 30 s desde la primera apertura |
| Primera vuelta (tutorial) | ≈ 1 min, recluta garantizado |
| Primer raro | ≈ 30 min (guion: 3.ª expedición) |
| Segundo equipo (Muelle 1) | día 1 |
| Primera evolución | ≈ 1 h |
| Isla 4 | ≈ 4 h |
| Isla 6 | días 2-3 |
| Isla 8 vencida | días 6-10 |
| 25 % de la Bitácora | semana 1 |
| Primer variocolor | semanas 2-4 (vigilar p90 ≤ 6 semanas) |
| Dominio 3 en las 8 islas | semanas 3-5 |

Alarma: cualquier tramo de más de 24 h sin hito. Política «perezosa» (solo Repetir) ≥ 60 % del ritmo de la voraz.

---

## 3. Datos y tipos (contratos compartidos)

Todos los módulos usan estos formatos. **Nadie cambia un contrato sin actualizar esta sección.**

### 3.1 Tipos

Ids en minúsculas sin tilde: `normal fuego agua planta electrico hielo lucha veneno tierra volador psiquico bicho roca fantasma dragon siniestro acero hada`. Nombres visibles desde `type_names.csv` (`local_language_id=7`). Se usan los tipos actuales de PokeAPI (con Hada).

### 3.2 `data/especies.json` (lo genera `tools/build-data.mjs`)

```json
{ "v": 1, "sha": "<sha SpriteCollab>", "especies": {
  "0025": { "n": "Pikachu", "g": "Pokémon Ratón", "gen": 1,
            "t": ["electrico"], "s": [35,55,40,50,50,90], "tot": 320,
            "cr": 190, "rar": "C", "fam": "0172", "pre": "0172",
            "evo": [ { "a": "0026", "c": "piedra", "it": "piedra_trueno" } ],
            "exc": null, "vario": true, "leg": false } } }
```

- `rar`: `C` común, `PC` poco común, `R` raro, `L` legendario (§6.7).
- `evo[].c`: `nivel` (`lv`), `piedra` (`it`), `amistad` (`momento`: `dia`|`noche`|undefined), `intercambio`, `objeto` (`it`). Tras aplicar `tools/evo-overrides.json` no queda ningún otro.
- `fam`: dex4 de la especie base de la familia (para cadenas y familias completas).
- `exc`: `norte|este|sur|oeste|null` (§6.8).
- `vario`: `true` solo si **toda la familia** tiene sprite variocolor válido (§13.3). Es un valor de familia.

### 3.3 `data/islas.json`

```json
[ { "id": 1, "clave": "prado", "n": "Prado Brote", "tipos": ["normal","bicho","planta"],
    "F": 8, "tBase": 30, "jefe": "0015", "fondo": "#7fbf5a",
    "especies": ["0010","0013","0016","0019","0161","0043","0265","0396","0399"],
    "evolTardias": true, "objetos": ["piedra_hoja","baya_grande"],
    "leg": [], "dominioRaro": "0133" } ]
```

`especies` lista las bases de cada familia que aparecen. Las formas evolucionadas de esas familias aparecen en el 40 % final de pisos (`evolTardias`), con la etapa 2 solo desde la isla 4 y la etapa 3 solo en islas ≥ 6.

### 3.4 `data/tipos.json`

`{ "ids": [...18], "nombres": {"fuego": "Fuego", ...}, "ef": {"fuego": {"planta": 2, "agua": 0.5, ...}} }` con los factores crudos de `type_efficacy.csv` (2, 0.5, 0; el 1 se omite). El suavizado lo hace `formulas.js`.

### 3.5 `data/textos.json`

Plantillas del diario, frases de vecinos, eventos de expedición y tutorial. Formato `{ "diario": {"llega": "Se unió en el piso {f} de {isla}.", ...}, "frases": {"feliz": [...], ...}, "eventos": {...}, "guia": {...} }`. Variables entre llaves.

### 3.6 `assets/manifest.json` (lo genera `tools/build-assets.mjs`)

```json
{ "v": 1, "sha": "1a294bec85e309d023c0b074617462c6c6b44a31",
  "esp": { "0025": {
    "ss": 1,
    "a": { "Idle":   { "fw": 40, "fh": 56, "d": [40,2,3,3,3,2], "r": [0,2,6] },
           "Walk":   { "fw": 32, "fh": 40, "d": [8,10,8,10],    "r": [0,2,6] },
           "Attack": { "fw": 80, "fh": 80, "d": [...], "r": [0,2,6], "hit": 3 },
           "Sleep":  { "fw": 32, "fh": 40, "d": [30,35],         "r": [0] },
           "Hurt":   { "fw": 48, "fh": 64, "d": [2,8],           "r": [0,2,6] },
           "Hop":    { ... } },
    "p": ["Normal","Happy","Pain","Joyous"],
    "vario": { "a": { ... mismas claves ... }, "p": ["Normal","Happy"] } } } }
```

- Rutas de archivo derivadas, sin guardarlas: `assets/pmd/<dex4>/<Anim>.png`, `assets/pmd/<dex4>/p/<Emocion>.png`, y la variante en `assets/pmd/<dex4>/v/...` y `assets/pmd/<dex4>/v/p/...`.
- `r` = filas originales conservadas, en el orden en que quedan en la PNG recortada. La fila de la PNG recortada para una dirección es `r.indexOf(dir)`. Dirección 0 abajo, 2 derecha, 6 izquierda. Si falta la 6, se dibuja la 2 en espejo.
- `d` en ticks de 1/60 s. `ss` = ShadowSize (0, 1, 2).
- `CopyOf` ya resuelto en el build: cada clave apunta a una PNG que existe.

### 3.7 `assets/creditos.json`

```json
{ "artistas": { "<id>": { "n": "Emmuffin", "url": "https://twitter.com/Ernmuffin" } },
  "esp": { "0025": { "sprite": [ {"a":"<id>","lic":"CC_BY-NC_4"} ], "retrato": [...],
                     "vSprite": [...], "vRetrato": [...] } } }
```

`a` = id del artista (el id de Discord si no hay nombre, o `CHUNSOFT`). `lic` ∈ `CC_BY-NC_4 | PMDCollab_1 | PMDCollab_2 | Unspecified`.

### 3.8 Pokémon individual (dentro del guardado)

```js
{ id: "m_8f2k3q",        // aleatorio de 6 chars [a-z0-9], o "tr-<tid>" si llegó por intercambio
  sp: "0025",            // dex4
  vr: false,             // variocolor
  ap: "Chispa",          // apodo (≤ 12), "" = nombre de especie
  nv: 14, xp: 340,
  est: 2,                // estrellas 0-5
  car: 42,               // cariño 0-100
  ot: "local" | "<uid>", otn: "el autor",   // entrenador original
  f: 1731900000000,      // fecha de llegada (ms)
  de: "prado:7",         // isla:piso de llegada, "tutorial", "visita", "intercambio:<nombre>"
  dia: [ [t, "llega", {i:"prado", f:7}], ... ],   // diario, máx. 8 entradas
  fav: false, noEvo: false,  // favorito, «quiere seguir así»
  toq: 0 }               // día (número de día local) del último toque
```

Límite duro: **400 individuos**. Al llegar a 380 se avisa; con 400 los duplicados siempre se fusionan y los nuevos se ofrecen «Liberar a otro / Dejarlo ir» (liberar solo en la ficha, con confirmación; no da recursos).

---

## 4. Islas, expediciones y resolución

### 4.1 Islas

| m | Isla | Tipos | F | tBase | Jefe (visual) | Legendarios (jefe, 0,5 %) | Raro de Dominio 3 |
|---|---|---|---|---|---|---|---|
| 1 | Prado Brote | normal, bicho, planta | 8 | 30 s | Beedrill 0015 | — | Eevee 0133 |
| 2 | Arroyo Cantarín | agua, volador | 12 | 42 s | Golduck 0055 | — | Marill 0183 |
| 3 | Cueva Eco | roca, tierra, veneno | 16 | 54 s | Steelix 0208 | — | Aron 0304 |
| 4 | Bosque Umbrío | fantasma, siniestro, bicho | 20 | 66 s | Gengar 0094 | — | Duskull 0355 |
| 5 | Volcán Brasa | fuego, lucha | 25 | 78 s | Magmar 0126 | — | Houndour 0228 |
| 6 | Pico Escarcha | hielo, volador | 30 | 90 s | Walrein 0365 | Articuno 0144, Suicune 0245 | Snorunt 0361 |
| 7 | Ruinas Tormenta | electrico, acero, psiquico | 40 | 102 s | Metagross 0376 | Zapdos 0145, Raikou 0243, Mewtwo 0150 | Beldum 0374 |
| 8 | Cumbre Nébula | dragon, hada | 50 | 114 s | Salamence 0373 | Moltres 0146, Entei 0244, Latias 0380, Latios 0381 | Dratini 0147 |
| ★ | Mazmorra Misterio | 2 tipos por semana | 99 | 60 s | — | — | — |

Una isla se desbloquea al vencer al jefe de la anterior. La Misterio se desbloquea al vencer al jefe de la isla 3.

### 4.2 Plan de expedición (lo que se decide al enviar)

```js
plan = { equipo: [uid, uid, uid],         // 1 a 3; hueco 0 = Líder
         roles: ["lider", "expl"|"reco"|"apoyo", "expl"|"reco"|"apoyo"],
         isla: 1..8 | "misterio",
         modo: "vuelta" | "patrulla",
         hasta: F | número de piso,         // modo vuelta
         horas: 1 | 4 | 8,                  // modo patrulla
         postura: "prudente" | "equilibrada" | "audaz",
         dominio: 0..3 }
```

Roles de los huecos 1 y 2: dos roles pueden repetirse. **Explorador:** su Vel cuenta doble en `vel`, +5 % de piso secreto. **Recolector:** +25 % de objetos, +0,04 de encuentro. **Apoyo:** +1 PV, `pMin` 0,15.

### 4.3 Duración

```
vel      = 1 + 0.003 × mediaPonderada(Vel base)     // peso 2 para Exploradores, 1 el resto
tPiso(m) = tBase_m / vel × (1 − 0.02 × nivelTaberna) × climaT × (postura audaz ? 0.9 : 1)
vuelta   = tPiso × hasta
patrulla = horas × 3600 s (se repiten vueltas completas hasta agotar el tiempo)
```

- Tutorial: 3 pisos de 20 s fijos, P forzada para éxito, recluta garantizado (§6.6).
- Al enviar se muestra «Vuelven a las HH:MM» (fin nominal). Si caen, vuelven antes. Los reintentos de jefe (§4.4) pueden añadir como mucho 2 `tPiso`; la hora mostrada es «≈ HH:MM».

### 4.4 Resolución por tramos (corrige el desgaste de PV en islas largas)

Los pisos `1..F−1` se agrupan en **tramos** de tamaño `s = ceil((F−1)/10)`; el jefe (piso F) es un tramo propio. Así todas las islas tienen entre 8 y 11 tiradas.

```
D(m, f)   = D0_m × 1.8^((f−1)/(F_m−1)) × (f == F_m ? 1.25 : 1) × 1.6^dominio × climaD
D0_m      = 50 × 1.66^(m−1)                         → 50, 83, 138, 229, 380, 630, 1046, 1737
p         = clamp(0.5 + 0.9 × ln(P / D), pMin, 0.99) // pMin 0.05; 0.15 con Apoyo
PV inicio = 3 + nApoyos − (audaz ? 1 : 0), mínimo 1
```

Para cada tramo, en orden, con `rng = mulberry32(hashSeed(semilla, ronda, indiceTramo))`:

- Se tira una vez con la `D` del **último piso** del tramo.
- **Éxito:** cada piso del tramo da su botín completo y tira encuentro (§6.1) y evento (§4.7).
- **Fallo en tramo normal:** −1 PV, el tramo da el 50 % del botín y sin encuentros, y se sigue.
- **Fallo en el jefe:** −1 PV y se reintenta el jefe (cada intento cuesta un `tPiso` más).
- **PV = 0:** el equipo vuelve «rescatado» en ese instante, con lo ganado (el tramo en curso ya contó su 50 %). El jefe no queda vencido.
- **Prudente:** vuelve cuando quedaría con 1 PV tras un fallo (no arriesga el último), y el botín de todo es ×0,85.
- **Audaz:** botín ×1,3, encuentros ×1,15, peso de raros ×1,5.

Patrulla: tras cada vuelta completa con jefe vencido se recupera 1 PV (hasta el inicial) y empieza otra vuelta, hasta agotar `horas`. La última vuelta que no cabe entera se recorta: se hacen los tramos que quepan y no se tira jefe.

Mazmorra Misterio: `D(f) = 60 × 1.045^(f−1) × climaD` **igual para todos** (sin dependencia del progreso, para que el ranking compare lo mismo). Tramos de 5 pisos, sin jefe. Récord = último piso superado. Modo único «hasta caer o hasta X horas» (1, 4 u 8 h).

Comprobaciones de calibración (las verifica `test/formulas.test.mjs`):
- Equipo inicial (P ≈ 138) en la isla 1: p ≈ 0,99 en el piso 1 y ≈ 0,68 contra el jefe.
- Con el nivel orientativo `nvOri(m) = 5 + 8 × (m−1)` y 1 estrella, cariño 30, Linterna `3m`, tipos neutros: `p(jefe) ∈ [0,35; 0,65]` en cada isla. Si no se cumple, se ajusta `D0` o el poder, no se cambia la forma de las curvas.

### 4.5 Poder

```
poder_i  = tot/10 × (1 + 0.1 × (nv−1)) × (1 + 0.2 × est) × (1 + 0.003 × car)
mult_i   = ofensa_i × defensa_i × climaTipo_i
rol_i    = 1.2 si Líder, 1 si no
P        = Σ (poder_i × mult_i × rol_i) × (1 + 0.03 × nivelLinterna) × bonoComposicion × climaP
```

- **Ofensa:** mejor factor de los tipos del miembro contra los tipos de la isla, suavizado: 2→1,3; 1→1; 0,5→0,8; 0→0,6 (nunca 0).
- **Defensa:** factor medio de los tipos de la isla contra el miembro (producto por doble tipo): ≥ 2 → 0,85; ≤ 0,5 → 1,1; resto 1.
- **Composición:** monotipo (los 3 comparten un tipo) +10 % de poder; tres tipos primarios distintos +10 % de botín.
- El equipo se **congela al enviar** (snapshot de poder y de datos de cada miembro).

### 4.6 Botín por piso superado

```
monedas(m,f) = 8  × 1.9^(m−1)  × (1 + 0.1 f)      // jefe ×4
exp(m,f)     = 15 × 1.75^(m−1) × (1 + 0.05 f)     // a cada miembro; jefe ×3
pObjeto      = (0.20 + 0.01 f) × 1.25^nRecolectores   → tabla de la isla
dominio k    → monedas y exp ×1.5^k
patrulla nocturna (inicio entre 22:00 y 03:00 y horas ≥ 4) → monedas y exp ×1.2
```

Para la Misterio, `m` efectivo = 3 + floor(f/20) en las fórmulas de botín.

Objetos por isla: Prado `piedra_hoja`; Arroyo `piedra_agua`; Cueva `piedra_lunar`; Bosque `piedra_ocaso`; Volcán `piedra_fuego`; Pico `piedra_hielo`, `garra_afilada`; Ruinas `piedra_trueno`; Cumbre `piedra_solar`, `piedra_dia`. Jefes de islas ≥ 5: 10 % de `piedra_alba`. Jefes de islas ≥ 5: 3 % de `cordon_amistad`. Todas las islas: `baya_grande` (+3 cariño) como objeto común (60 % de la tabla).

### 4.7 Eventos dentro de la expedición

Tirada por piso superado: 4 %. Si en 3 informes seguidos no salió nada especial (ni evento, ni raro, ni jefe), el siguiente fuerza un evento menor.

| Evento | Efecto |
|---|---|
| Tienda Kecleon | Compra automática de 1 objeto de la tabla de la isla si cuesta ≤ 20 % de las monedas ganadas en esa expedición |
| Cofre de piso secreto | Objeto garantizado + monedas ×3 de ese piso (prob. extra +5 % por Explorador) |
| Casa de monstruos | Tirada extra con D ×1,3: si gana, botín ×2 de ese piso; si pierde, nada (sin PV) |
| Pokémon perdido | +5 cariño a los tres + monedas ×2 de ese piso |
| Manantial | +1 PV (hasta el inicial) |

Cada evento tiene 2-3 textos con retrato (Surprised, Happy, Worried) en `textos.json`.

### 4.8 Previsión (injerto de B)

En «Formar equipo», `prever(plan, n=200)` ejecuta la resolución con 200 semillas `hashSeed(semillaReal, "prev", i)` (nunca la real, para no destripar) y muestra:

```
Vencer al jefe: 71 %     Pisos esperados: 14,2
Monedas ≈ 2,3K   EXP ≈ 640/miembro   Reclutas ≈ 1,2   Vuelven ≈ 14:32
```

Se recalcula con debounce de 150 ms. Para la patrulla muestra «Vueltas ≈ 9,4» en lugar de «Vencer al jefe».

**Sugerir equipo:** Líder = mayor `poder × mult` libre. Para los otros 2 huecos: se preseleccionan los 8 mejores por `poder × mult` y se prueba cada uno en cada rol con `prever(plan, 40)`; gana el que más sube la probabilidad de jefe (o vueltas). Presupuesto < 60 ms; si se pasa en un móvil lento, se mueve a un Web Worker (`js/core/worker-prev.js`).

### 4.9 Clima semanal y marea (injerto de B)

Semilla `semana = año × 100 + semanaISO` (lunes 00:00 local). Cada isla recibe un clima con `hashSeed(semana, isla) % 5`:

| Clima | Efecto |
|---|---|
| Despejado | Nada |
| Niebla | El efecto del Explorador se duplica; sin Explorador, P ×0,9 |
| Calor | Miembros fuego ×1,2; hielo y planta ×0,9 |
| Tormenta | Miembros electrico y agua ×1,15; `climaT` 1,1 |
| Luna llena | Miembros fantasma y siniestro ×1,2; peso de raros ×1,5 |

(Un miembro con dos tipos afectados toma el mayor bonus y el menor malus.)

**Marea:** de 22:00 a 07:00 locales (según la hora de envío), las especies fantasma y siniestro tienen peso ×2 en encuentros. Las evoluciones «de día» o «de noche» miran la hora local real al evolucionar.

---

## 5. Niveles, bayas y cariño

```
expSig(L) = round(6 × L^1.8 + 15 × L)     // L1 21 · L5 184 · L10 529 · L20 1.618 · L50 7.608
tope de nivel = min(100, 20 + 10 × jefesVencidos)   // jefes de isla distintos vencidos (0-8)
```

- El tope impide que las bayas trivialicen el juego: la EXP sobrante se acumula hasta 1 nivel y se pierde el resto (se avisa «Al tope: vence al siguiente jefe»).
- **Alcanzar al grupo:** un miembro 5 o más niveles por debajo de la media del equipo gana EXP ×2 (expediciones y bayas).
- **Recibido por intercambio:** EXP ×1,5 de por vida (`ot` distinto de mi uid y distinto de "local").
- **Bayas = EXP embotellada:** 1 baya = 1 EXP. «Dar bayas» desde la ficha con ×1, ×10, ×100 o «hasta el siguiente nivel». Botón «Igualar» en Gremio reparte bayas entre los 6 de menor nivel.
- **Cariño (0-100):** +1 por expedición, +1 al tocarlo en la cala (una vez al día), +3 por baya grande, +5 por evento «Pokémon perdido». No baja nunca. Da hasta ×1,3 de poder y desbloquea las evoluciones por amistad (≥ 80).

---

## 6. Reclutamiento, rareza y colección

### 6.1 Encuentro (por piso superado)

```
pEnc     = (0.06 + 0.04 × nRecolectores) × (audaz ? 1.15 : 1) × bonoEvento
rareza   = tirada con pesos C 70 · PC 23 · R 6.5 · L 0.5   (R ×1.5 con audaz o luna llena)
           L solo en el piso del jefe de islas ≥ 6; si sale L fuera de ahí, pasa a R
especie  = tirada ponderada dentro de la isla y la rareza (§6.8 para pesos de faro y marea)
nvSalv   = 4 + 6 × (m−1) + round(0.3 × f)          (Misterio: 4 + round(0.6 f))
pAcepta  = clamp(0.4 + 0.03 × (nvLíder − nvSalv) + huella, 0.1, 0.9)
```

### 6.2 Piedad visible

- **Huella:** si rechaza, «X se ha fijado en tu equipo»: +0,25 de `pAcepta` la próxima vez que salga esa especie en esa isla (acumulable hasta +0,75; se gasta al aceptar). Se ve en la ficha de la isla.
- **Piedad de raros:** contador por isla; tras 40 encuentros sin un R, el siguiente es R. Barrita en la ficha de la isla.

### 6.3 Llegada

- Entra al nivel `min(nvSalv, tope)`, con `de = "isla:piso"` y la entrada `llega` en el diario.
- Si la especie es nueva en la Bitácora o es R o L → **momento especial** (§9.3). Si no, tarjeta en el informe.
- **Duplicados:** por defecto se **fusionan** en el mejor individuo de esa especie (+1 estrella; coste 1, 2, 3, 4 y 5 duplicados para pasar a 1★…5★, total 15). Con 5★ cada duplicado da 1 **caramelo** de especie (+20 cariño o 500 bayas para esa especie, a elegir al usarlo). Un duplicado variocolor nunca se fusiona: llega como individuo. Ajuste «Duplicados: fusionar / preguntar».

### 6.4 Variocolor

```
pVario = (1/320) × cadena × evento × lazo
cadena = min(2, 1 + 0.02 × reclutasDeEstaFamilia)    // ×2 a los 50
evento = 2 en la isla de la «Noche de brillos» semanal
```

- Solo se tira si la especie tiene `vario: true`. Mejor caso 1/80.
- No se tira en visitantes ni en intercambios (lo recibido conserva su `vr`).
- Revelación: §9.3. Captura compartible con `navigator.share` (PNG del canvas con marco, nombre del jugador y fecha). Si `navigator.share` no admite archivos, se descarga el PNG.

### 6.5 Rareza de especie (en el build)

- `L`: `is_legendary || is_mythical`.
- `R`: `capture_rate < 45`, más forzadas: Eevee, Dratini, Larvitar, Bagon, Beldum, Gible, los 12 iniciales y sus líneas.
- `PC`: `capture_rate` de 45 a 119.
- `C`: `capture_rate ≥ 120`.

### 6.6 Guion de la primera hora

- Tutorial: 3 pisos de 20 s, éxito forzado, recluta garantizado = una especie C de la isla 1 de tu faro, nivel 4, acepta seguro.
- La 3.ª expedición fuerza un encuentro R que acepta (si el jugador no lo ha tenido ya).
- Isla 1 se abre con 4 vecinos en total: el guía y 3 reclutas tempranos (el tutorial da 1; las 2 primeras expediciones tienen `pEnc` ×3).

### 6.7 Faros de origen (exclusivas, con vía en solitario)

Al empezar se elige faro: **Norte** (gen 1), **Este** (gen 2), **Sur** (gen 3), **Oeste** (gen 4). Pesos en encuentros y visitantes:

- Especies de la generación de tu faro: ×3.
- Familias exclusivas de **tu** faro: ×1 (normales para ti).
- Familias exclusivas de **otro** faro: ×0,1, y solo tras Dominio 2 de su isla. Así un grupo de 2 o del mismo faro puede completar la Bitácora en solitario, aunque intercambiar es mucho más rápido.

| Faro | Familias exclusivas (base dex) |
|---|---|
| Norte | Growlithe 0058, Sandshrew 0027, Ponyta 0077, Seel 0086 |
| Este | Houndour 0228, Misdreavus 0200, Murkrow 0198, Sneasel 0215 |
| Sur | Aron 0304, Shuppet 0353, Duskull 0355, Swablu 0333 |
| Oeste | Shinx 0403, Buizel 0418, Drifloon 0425, Snover 0459 |

Los raros de Dominio 3 que sean exclusivos de otro faro (Aron, Duskull, Houndour) son la vía garantizada en solitario.

### 6.8 Evoluciones

- **Nivel:** `minimum_level`. El aviso «Puede evolucionar» aparece; **nunca es automática**. «Quiere seguir así» (`noEvo`) silencia el aviso para ese individuo.
- **Piedra / objeto:** se gasta el objeto. 10 caramelos sustituyen a cualquier piedra.
- **Amistad:** cariño ≥ 80 (+ `momento` día 07-19 h o noche 19-07 h si lo tiene).
- **Intercambio:** evoluciona **al llegar** por intercambio (con secuencia). En solitario, con `cordon_amistad`.
- **Ramificadas** (Eevee, Gloom, Poliwhirl, Kirlia, Snorunt, Wurmple): pantalla de elección con el sprite Idle de cada opción.
- **Variocolor:** como `vario` es de familia, la evolución conserva siempre el brillo.
- **Se conserva** apodo, nivel, estrellas, cariño, diario y `vr`. Entrada `evo` en el diario.
- Overrides (en `tools/evo-overrides.json`):

| Especie destino | Regla original | Regla en el juego |
|---|---|---|
| Leafeon 0470 | lugar | piedra_hoja |
| Glaceon 0471 | lugar | piedra_hielo |
| Espeon 0196 | amistad de día | amistad, `dia` |
| Umbreon 0197 | amistad de noche | amistad, `noche` |
| Magnezone 0462 | lugar | piedra_trueno |
| Mamoswine 0473 | movimiento | nivel 40 |
| Weavile 0461 | objeto de noche | objeto `garra_afilada` |
| Honchkrow 0430, Mismagius 0429 | Piedra Noche | piedra_ocaso |
| Togekiss 0468 | Piedra Día | piedra_dia |
| Gallade 0475, Froslass 0478 | Piedra Alba + sexo | piedra_alba (se elige como rama; sin sexo) |
| Steelix 0208, Politoed 0186, Electivire 0466, Magmortar 0467, Dusknoir 0477 | intercambio con objeto | intercambio (sin objeto) |
| Silcoon 0266 / Cascoon 0268 | aleatorio | ramificada a elegir, nivel 7 |

### 6.9 Diario (injerto de A)

- Máximo 8 entradas por individuo. Tipos: `llega`, `jefe` (primer jefe), `evo`, `vario`, `estrella5`, `car80`, `intercambio`, `temporada` (reservado). Formato `[t, tipo, datos]`; el texto se genera con `textos.json` al mostrarlo.
- Al llenarse se borra la entrada no protegida más antigua. Protegidas: `llega`, `evo`, `vario`, `intercambio`.

### 6.10 Bitácora

`bitacora.visto` (encontrado en expedición o recibido) y `bitacora.tenido` (alguna vez en la colección), por dex4. Hitos 10/25/50/75/100 % del total de la lista → decoraciones de la cala y 1 `cordon_amistad` en el 50 %. Álbum de animaciones (v0.2): cada animación vista en la ficha marca `album[dex4]` como bitmask.

---

## 7. Base: el faro, la cala y los visitantes

### 7.1 Edificios

| Edificio | Coste nivel n→n+1 (monedas) | Efecto | Tope |
|---|---|---|---|
| Huerto de bayas | 80 × 1.18^n | bayas/h = 15 × n × 1.75^jefesVencidos | 25 |
| Despensa | 300 × 1.3^n | tope offline 8 h + n h | 16 (24 h) |
| Muelle | 600 / 15.000 / 150.000 | +1 equipo (1→4) | 3 |
| Linterna | 150 × 1.15^n | +3 % de poder | 30 |
| Taberna Marea | 200 × 1.15^n | −2 % de duración | 15 (−30 %) |

`nivelCala = suma de niveles / 5` (se ve en la liga).

### 7.2 Producción offline

```
dt  = clamp(ahora − ultimaRecogida, 0, topeHoras × 3600 s)   // reloj hacia atrás → 0 y se reancla
eff = dt ≤ 7200 ? dt : 7200 + 0.75 × (dt − 7200)
bayas += tasa × eff / 3600
```

Las expediciones no tienen tope: el equipo terminado espera con su informe.

### 7.3 Visitantes (injerto de A)

- Hay **1 hueco** de visitante en la cala.
- Por cada 2 h de tiempo de cala (dentro del tope offline, mismo `dt`) se tira con `p = 0.35` si el hueco está libre.
- Especie: de las islas desbloqueadas, rareza C (80 %) o PC (20 %), con pesos de faro. Nunca exclusivas de otro faro ni L.
- **Se queda 12 h** (contador visible). Se une tocándolo y pagando `50 × 1.75^(islaMax−1) × (PC ? 3 : 1)` bayas. Sin tirada.
- Entra al nivel `nvOri(islaMax) − 3`, `de = "visita"`. Cuenta como recluta para cadenas, no tira variocolor.

### 7.4 La cala (escena)

- Canvas horizontal desplazable con el dedo (2 pantallas de ancho en vertical, 1,3 en horizontal).
- Vecinos libres (no en expedición): pasean con Walk e Idle; duermen con Sleep de 23:00 a 07:00 y a ratos. Respaldo: Sleep → Idle.
- **Máximo 12 animados** a la vez (los visibles, priorizando favoritos); el resto en su primer frame de Idle. Animación a ~15 fps respetando `d`. Todo para con `document.hidden`.
- Tocar un vecino: Hop (o Idle con salto de 4 px), globo con su retrato (Happy → Normal) y una frase de `textos.json` según cariño y diario. Cariño +1 una vez al día.
- El visitante aparece junto al muelle con un «!» encima.
- Farolillos encendidos en el faro: 1 por cada 10 especies tenidas; uno dorado por variocolor.

---

## 8. Misiones, eventos semanales y Dominio

### 8.1 Misiones (v0.2)

- 3 diarias + 1 semanal. Se renuevan a las 06:00 locales. Las no hechas se guardan hasta 2 días (máx. 9 diarias pendientes). 1 cambio gratis al día.
- Pool (15): completar 4 expediciones · reclutar 1 de tipo X · subir 3 niveles · tocar 5 vecinos · vencer un jefe · evolucionar a alguien · enviar una patrulla nocturna · usar 1 objeto · atender al visitante · enviar con postura audaz 2 veces · ganar N monedas · dar 500 bayas · completar una expedición con ventaja ▲▲▲ · fusionar un duplicado · llegar al piso 20 de la Misterio.
- Diarias: monedas y bayas = `0.5 ×` el botín de una vuelta a la isla máxima. Semanal: `cordon_amistad` o una piedra a elegir.
- Días jugados acumulados (no consecutivos): 7, 14, 30 → decoraciones.

### 8.2 Evento semanal (v0.2)

`hashSeed(semana) % 4`: **Semana de tipo X** (×2 encuentros de ese tipo) · **Visita especial** (una especie R concreta ×5) · **Festival de bayas** (Huerto ×2) · **Noche de brillos** (variocolor ×2 en una isla). Banner en Expediciones.

### 8.3 Dominio (v0.2)

Tras vencer al jefe de una isla se desbloquean Dominio 1, 2 y 3 (D ×1,6^k, botín ×1,5^k). Vencer al jefe en Dominio k da una estrella en la ficha de la isla. Dominio 2 activa las exclusivas de otro faro en esa isla. Dominio 3 da una vez el **Huevo de la isla**: recluta garantizado de su «Raro de Dominio 3» (§4.1), con variocolor ×2 en esa tirada.

### 8.4 Temporadas (prestigio) — después de 1.0

Si el simulador marca una meseta en la semana 3-4, se adelantan. Diseño reservado: reinicia monedas, edificios, niveles (estrellas y cariño se quedan) e islas; conserva toda la colección. Medallas = `floor(4 × sqrt(Σ jefes distintos vencidos × m + récord Misterio / 10))` − ya ganadas (no por pisos totales, para que no se farmee la isla 1). Antes de confirmar, previsión con el simulador del cliente.

---

## 9. Interfaz móvil

### 9.1 Navegación

- **Vertical (360x640 principal):** barra inferior de pestañas de 56 px: `Cala · Expediciones · Bitácora · Gremio` y `Amigos` desde v0.3. Arriba, barra de 44 px con monedas, bayas, objetos y botón `≡` (Ajustes, Créditos).
- **Horizontal (640x360, 568x320):** raíl lateral izquierdo de 56 px con las pestañas; contenido a dos columnas; acciones principales en la columna derecha.
- Botones táctiles ≥ 44 px (principales 48-56 px), en la mitad inferior en vertical.
- **Avisos:** puntito rojo en pestañas, máximo 3 a la vez, priorizados: equipo de vuelta > evolución posible > mejora asequible > misión cobrable > visitante a < 2 h.
- `env(safe-area-inset-*)` respetado. Sin scroll horizontal de página (salvo el canvas de la cala, que lo gestiona él).
- Números: `1,2K · 3,4M · 5,6MM` (`fmt.num`). Horas «14:32». Tiempos relativos «hace 2 h».
- Tutoriales de una frase con el retrato del guía, en una burbuja descartable.

### 9.2 Pantallas (vertical; en horizontal se indica la división)

**9.2.1 Cala (inicio)**
```
+------------------------------------+
| 12,4K mon  3.210 bay  2 obj    [≡] |
| Meta: Jefe de Cueva Eco (p.16)   > |   ← siguiente hito; toca = ir
+------------------------------------+
|  CANVAS: la cala (desplazable ⇆)   |
|  vecinos, faro con farolillos,     |
|  visitante «!» en el muelle        |
+------------------------------------+
| E1 Cueva Eco  [#######---] ≈14:32  |
| E2 ¡DE VUELTA!           [Recoger] |
+------------------------------------+
| [Recoger todo (2)] [Enviar a todos]|
+------------------------------------+
| Cala• | Exped. | Bitác. | Gremio   |
+------------------------------------+
```
Horizontal: canvas a la izquierda (60 %), equipos y botones a la derecha.

**9.2.2 Informe de regreso (modal)**
```
+------------------------------------+
|  Mientras estabas fuera…           |
|  [canvas: los 3 con Walk → Hop]    |
|  E2 · Arroyo · 12/12 ✔ jefe        |
|  +1.240 mon  +3 objetos            |
|  EXP: Charmander Nv9 → 11          |
|  ★ Marill quiere unirse (nuevo)    |
|  Evento: tienda Kecleon            |
|  E1 · Cueva · rescatados en p.9    |
|  Cala: +410 bayas · visitante      |
|  [   RECOGER TODO   ]  [Repetir ↻] |
+------------------------------------+
```
Tras «Recoger todo» se reproduce la cola de momentos especiales.

**9.2.3 Momento especial** (recluta nuevo/R/L, evolución, variocolor): fondo oscuro, sprite ×3 en el centro (Walk hacia la cámara y Hop), retrato con emoción (Happy/Surprised; Joyous en variocolor y evolución) a la izquierda, texto de una línea, botones `¡Bienvenido!` y `Poner apodo` (y `Compartir` en variocolor). Se cierra solo con toque, nunca con temporizador.

**9.2.4 Expediciones**
```
+------------------------------------+
| Expediciones (2/2)   Semana: Calor…|  ← evento semanal
| [E1] Pikachu·Oddish·Geodude        |
|  Cueva Eco · piso 9/16  ♥♥♡        |
|  [#########-------] ≈14:32  [Ver]  |
| [E2] ¡De vuelta! 3 reclutas        |
|  [Recoger]  [Repetir]              |
| [E3] bloqueado · Muelle 2          |
| [ Enviar a todos con la sugerencia ]|
+------------------------------------+
```

**9.2.5 Formar equipo**
```
+------------------------------------+
| < [Prado][Arroyo][CUEVA ECO] >     |  ← carrusel de islas
|  Roca/Tierra/Veneno · Clima: Calor |
|  Récord p.14/16 · Raro ▓▓▓░ 31/40  |
| LÍDER   [Pikachu Nv14 ★★  ▲]       |
| Expl. v [Zubat   Nv11     =]       |
| Apoyo v [Geodude Nv12 ★   ▼]       |
| Ventaja ▲=▼  Variado +10 %         |
| (Una vuelta)(Patrulla 1h·4h·8h)    |
| Hasta: [16 jefe]  Dominio: [0]     |
| Postura: (Prud)[Equil](Audaz)      |
| Vencer al jefe 71 % · Rec ≈1,2     |
| Mon ≈2,3K · EXP ≈640 · ≈14:32      |
| [Sugerir]        [ ENVIAR ]        |
+------------------------------------+
```
Al tocar un hueco: selector en cuadrícula de retratos (40 px a ×2), con nivel, ▲/=/▼ y «+12 %» (cambio en la probabilidad de jefe con `prever(…, 40)`), orden «Recomendado» por defecto; filtros Libres / Tipo. Los reservados para intercambio salen atenuados con ⇄. Horizontal: miembros y ruta a la izquierda, previsión y ENVIAR a la derecha.

**9.2.6 Expedición en curso (Ver)**: franja de canvas con el desfile Walk (fila 2), enemigos entrando con Walk (fila 6 o espejo), Attack con número de daño en `hit`, Hurt, corazones de PV, barra de pisos. Debajo: `P / D / p` del piso actual, «Vuelven ≈ 14:32» y botón «Recordármelo» (`.ics`). Los reclutas y objetos **no** se enseñan hasta el informe.

**9.2.7 Bitácora**: contador «47/222 (21 %)», filtros (Todos · Tenidos · Faltan · Tipo · Isla), cuadrícula de retratos Normal 40x40 a ×2 con `image-rendering: pixelated`; visto-no-tenido = silueta (filtro `brightness(0)` con opacidad 0,35); no visto = hueco con número. Pestaña «Diario de expediciones» con los últimos 30 informes resumidos. Barra de hitos.

**9.2.8 Gremio**: dos sub-pestañas. **Pokémon:** lista (retrato, apodo, especie, nivel, ★, ♥, iconos ✦ variocolor, ⇄ en intercambio, ⬆ puede evolucionar), orden por nivel / cariño / poder / llegada, filtros, botón «Igualar». **Faro:** los 5 edificios con nivel, efecto, coste y botón Mejorar; misiones (v0.2) arriba.

**9.2.9 Ficha de Pokémon**
```
+------------------------------------+
| < «Chispa» Pikachu  Nv14 ★★  ♥42 ☆ |
| [canvas: Idle ×3 · ◀ anim ▶]       |
| Eléctrico · Poder 118              |
| EXP [######----] 340/790           |
| PS35 At55 De40 AE50 DE50 Ve90       |
| [Dar bayas] [Evolucionar ⬆] [Apodo]|
| Diario                             |
| · 18-nov Se unió en Prado p.7      |
| · 19-nov Venció a su primer jefe   |
| Sprite: Autor X · Retrato: Autor Y |
| CC BY-NC 4.0 · adaptado (recortado)|
+------------------------------------+
```

**9.2.10 Ajustes**: nombre visible, avatar (uno de tus Pokémon), duplicados (fusionar/preguntar), sonido, reducir animaciones, exportar/importar partida (texto), cuenta y nube (v0.3), versión.

**9.2.11 Créditos**: §14.

**9.2.12 Primer arranque** (< 30 s hasta la primera expedición): título con la cala de noche y [Empezar] → elegir guía entre 6 (Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil, Totodile; Idle en cuadrícula 3x2) → elegir faro (4 botones con su texto de una línea) → el guía dice «Vamos a buscar compañeros» y la expedición del tutorial sale sola con el guía de Líder.

**9.2.13 Amigos (v0.3)**: §11.

### 9.3 Avisos sin push

Título de pestaña `«(2) ¡Equipo de vuelta!»` (comprobación cada 30 s), `navigator.setAppBadge(n)` al ocultar (PWA), «Recordármelo» descarga un `.ics` con la hora de vuelta, y la hora siempre visible al enviar.

---

## 10. Estilo visual

- **Pixel art nítido:** `imageSmoothingEnabled = false`, escala entera ×2 o ×3 según el alto disponible (×3 si el alto del canvas ≥ 240 px), `image-rendering: pixelated` en retratos.
- **Paleta (tokens en `:root`):** noche marina y luz de farol.
  - `--mar-900 #14213d` (fondo oscuro), `--mar-700 #1f3a5f`, `--mar-500 #3d6a8f`
  - `--arena-100 #f6efe0` (fondo claro de paneles), `--arena-300 #e3d3b0`
  - `--farol-400 #ffb547` (acento principal), `--farol-600 #e07a1f` (botón principal), `--brillo #fff3c4`
  - `--hoja #5fa35a` (éxito), `--coral #e05a4f` (aviso/rojo), `--texto #1b1b1f`, `--texto-claro #f6efe0`
  - Modo oscuro por defecto de noche local (22-07) además de `prefers-color-scheme`; los paneles pasan a `--mar-700` con texto claro.
- **Tipografía:** cuerpo `system-ui`; títulos y números grandes con **Pixelify Sans** (OFL) **autoalojada** en `assets/fonts/` (para el modo offline). Tamaño base 16 px, nunca < 13 px.
- **Paneles:** bordes de 2 px `--mar-900` con esquina recortada de 4 px (estilo pixel), sombra dura de 2 px. Botón principal `--farol-600` con texto claro.
- **Islas:** cada una tiene un color de suelo (`fondo` en `islas.json`) y un patrón de baldosas de 16 px propio generado por código (sin tilesets de PMD).
- **Iconos:** SVG propios en `assets/ui/` (moneda, baya, objeto, corazón, estrella, ⇄, ⬆, ✦). Sin emojis en el juego.
- **Sombras de sprite:** elipse `rgba(0,0,0,.3)` con radio `[5,8,12][ss] × escala`, `ry = rx × 0,45`, centrada en el punto de suelo; el sprite se ancla por el centro del frame, que se dibuja sobre ese punto (todas las animaciones de una especie quedan alineadas así). Si hace falta un ajuste fino, es una sola constante `AJUSTE_Y` en `sprites.js`.
- **Sonido (v0.2):** 6 efectos cortos generados con WebAudio (toque, recoger, recluta, raro, evolución, variocolor). Sin música en la 1.0. Volumen en Ajustes.
- **Accesibilidad:** `prefers-reduced-motion` y ajuste propio reducen destellos y parpadeos; contraste AA en textos.

---

## 11. Social (v0.3)

### 11.1 Principios

- **Se juega entero sin cuenta.** Lo social pide cuenta.
- Proyecto Firebase **nuevo**, plan Spark.
- **Firestore por REST, sin SDK** (como `netroom.js` de Make the Cut). Cuentas por REST (Identity Toolkit) con **usuario y contraseña** (correo ficticio `<usuario>@cuentas.farolillo.invalid`, avisando de que la contraseña no se recupera) y **Google** (SDK compat 10.12.5 de gstatic cargado solo al pulsar; `signInWithPopup` con `signInWithRedirect` de reserva; se saca uid y refresh token, se cierra el SDK y se sigue por REST). Sin cuentas anónimas.
- Referencia: un cliente REST de Firestore propio (enc/dec, `documents:commit`, `REQUEST_TIME`). Cambiar `FB = {key, project, authDomain, sdk}` y el prefijo de localStorage a `farolillo.`.
- **Nunca se guardan correos en Firestore.** De los demás solo viaja el nombre visible (2-16, sin `@` ni `<>`).
- Interruptor `SOCIAL` en `js/config.js`. Ante un 403 con `SOCIAL = true`: «La liga aún no está activada en el servidor».

### 11.2 Modelo de datos

```
users/{uid}/saves/{key}        key ∈ main | settings
  { data: string JSON ≤ 400000, updatedAt: number (ms), v: int }

leagues/{code}                 code = 10 chars de 23456789ABCDEFGHJKMNPQRSTUVWXYZ
  { name 2-24, owner: uid, locked: bool, created: timestamp }

leagues/{code}/members/{uid}
  { name 2-16, avatar ≤ 24 ("0025" o "0025v"),
    stats: { lvl, dex, deep, wk, power, exps, shiny, badge },   // enteros salvo badge (≤ 24)
    shop: string JSON ≤ 6000,    // escaparate ≤ 12: [{id, sp, vr, nv, est, ap}]
    cala: string JSON ≤ 2000,    // 9 vecinos para «visitar la cala»: [{sp, vr, ap}]
    joined: timestamp, seen: timestamp }

trades/{tid}                   tid = 20 alfanuméricos generado por quien propone
  { v, lg, from, to, fname, tname,
    give: string JSON ≤ 3000, gid: string ≤ 40,
    ask: string ≤ 40 | '', back: string JSON ≤ 3000 | '', bid: string ≤ 40 | '',
    state: 'offered' | 'accepted' | 'declined',
    created, acted: timestamp, doneF: bool, doneT: bool }
```

`stats.dex` = especies tenidas, `deep` = récord Misterio de la semana `wk` (= `año×100+semanaISO`), `power` = mejor P de equipo, `lvl` = `nivelCala`, `exps` = expediciones completadas, `shiny` = nº de variocolores. La tabla de la Misterio solo cuenta miembros con `wk` igual a la semana actual.

`give`/`back` = el individuo completo (§3.8) con el diario recortado a 8, `ot`/`otn`. Al recibirlo se **sanea**: especie en mi `especies.json` (si no: «Actualiza el juego» y no se aplica todavía), `nv` 1-100 y ≤ mi tope + 10, `est` 0-5, `car` a la **mitad** («tiene que conocerte»), claves desconocidas fuera, `vr` solo si la especie tiene `vario`, id `tr-<tid>`, entrada `intercambio` en el diario, y evolución por intercambio si le toca (con secuencia).

### 11.3 Reglas de Firestore (`firebase/firestore.rules`)

```
rules_version = '2';
// Farolillo: guardado en la nube, ligas privadas (tabla de progreso) e intercambios.
// Sin correos en ningún documento: de los demás solo se ve el nombre visible.
// created, acted, joined y seen los pone el servidor con REQUEST_TIME en documents:commit;
// las reglas exigen campo == request.time.
// Desplegar (desde firebase/): npx -y firebase-tools@13 deploy --only firestore:rules --project <id>
service cloud.firestore {
  match /databases/{database}/documents {
    function signed() { return request.auth != null; }
    function me() { return request.auth.uid; }
    function owner(uid) { return signed() && me() == uid; }
    function nameOk(n) { return n is string && n.size() >= 2 && n.size() <= 16; }
    function codeOk(c) { return c is string && c.matches('[2-9A-HJKMNP-Z]{10}'); }
    function idOk(s) { return s is string && s.size() >= 1 && s.size() <= 40; }
    function monOk(s) { return s is string && s.size() >= 10 && s.size() <= 3000; }
    function lgPath(lg) { return /databases/$(database)/documents/leagues/$(lg); }
    function member(lg, uid) { return exists(/databases/$(database)/documents/leagues/$(lg)/members/$(uid)); }

    // ---- Guardado en la nube: solo el dueño ----
    match /users/{uid}/saves/{key} {
      allow get, list, delete: if owner(uid);
      allow create, update: if owner(uid)
        && key in ['main', 'settings']
        && request.resource.data.keys().hasOnly(['data', 'updatedAt', 'v'])
        && request.resource.data.data is string && request.resource.data.data.size() <= 400000
        && request.resource.data.updatedAt is number
        && (!('v' in request.resource.data) || request.resource.data.v is int);
    }

    // ---- Ligas privadas: el id ES el código; sin list ----
    match /leagues/{lg} {
      allow get: if signed() && codeOk(lg);
      allow list: if false;
      allow create: if signed() && codeOk(lg)
        && request.resource.data.keys().hasOnly(['name', 'owner', 'locked', 'created'])
        && request.resource.data.keys().hasAll(['name', 'owner', 'locked', 'created'])
        && request.resource.data.name is string && request.resource.data.name.size() >= 2 && request.resource.data.name.size() <= 24
        && request.resource.data.owner == me()
        && request.resource.data.locked == false
        && request.resource.data.created == request.time;
      allow update: if signed() && resource.data.owner == me()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'locked'])
        && request.resource.data.name is string && request.resource.data.name.size() >= 2 && request.resource.data.name.size() <= 24
        && request.resource.data.locked is bool;
      allow delete: if signed() && resource.data.owner == me();

      match /members/{uid} {
        function statsOk(s) {
          return s is map && s.keys().hasOnly(['lvl', 'dex', 'deep', 'wk', 'power', 'exps', 'shiny', 'badge'])
            && s.get('lvl', 0) is int && s.get('dex', 0) is int && s.get('deep', 0) is int
            && s.get('wk', 0) is int && s.get('power', 0) is int && s.get('exps', 0) is int
            && s.get('shiny', 0) is int
            && s.get('badge', '') is string && s.get('badge', '').size() <= 24;
        }
        function memberOk(d) {
          return d.keys().hasOnly(['name', 'avatar', 'stats', 'shop', 'cala', 'joined', 'seen'])
            && d.keys().hasAll(['name', 'avatar', 'stats', 'shop', 'cala', 'joined', 'seen'])
            && nameOk(d.name) && d.avatar is string && d.avatar.size() <= 24
            && statsOk(d.stats) && d.shop is string && d.shop.size() <= 6000
            && d.cala is string && d.cala.size() <= 2000
            && d.seen == request.time;
        }
        allow get, list: if signed() && member(lg, me());
        allow create: if owner(uid)
          && existsAfter(lgPath(lg)) && getAfter(lgPath(lg)).data.locked == false
          && memberOk(request.resource.data) && request.resource.data.joined == request.time;
        allow update: if owner(uid)
          && memberOk(request.resource.data) && request.resource.data.joined == resource.data.joined;
        allow delete: if owner(uid) || (signed() && get(lgPath(lg)).data.owner == me());
      }
    }

    // ---- Intercambios (buzón idempotente) ----
    // offered --(B acepta)--> accepted --(cada uno aplica y marca doneF/doneT)--> borrable a los 30 días
    // offered --(B rechaza)--> declined --> lo borra cualquiera
    // offered --(A cancela)--> borrado (solo mientras 'offered')
    // offered sin respuesta 14 días --> caducado: no se acepta; cualquiera lo borra
    match /trades/{tid} {
      function r() { return resource.data; }
      function d() { return request.resource.data; }
      function party() { return signed() && (me() == resource.data.from || me() == resource.data.to); }
      function fresh() { return resource.data.created > request.time - duration.value(14, 'd'); }
      function only(keys) { return request.resource.data.diff(resource.data).affectedKeys().hasOnly(keys); }

      allow get: if signed() && (resource == null || me() == resource.data.from || me() == resource.data.to);
      allow list: if signed() && request.query.limit <= 100
        && (resource.data.from == me() || resource.data.to == me());

      allow create: if signed() && tid.matches('[A-Za-z0-9]{20}')
        && d().keys().hasOnly(['v', 'lg', 'from', 'to', 'fname', 'tname', 'give', 'gid', 'ask', 'back', 'bid', 'state', 'created', 'acted', 'doneF', 'doneT'])
        && d().keys().hasAll(['v', 'lg', 'from', 'to', 'fname', 'tname', 'give', 'gid', 'ask', 'back', 'bid', 'state', 'created', 'acted', 'doneF', 'doneT'])
        && d().v is int
        && d().from == me() && d().to is string && d().to != me() && d().to.size() <= 128
        && codeOk(d().lg) && member(d().lg, me()) && member(d().lg, d().to)
        && nameOk(d().fname) && nameOk(d().tname)
        && monOk(d().give) && idOk(d().gid)
        && (d().ask == '' || idOk(d().ask))
        && d().back == '' && d().bid == ''
        && d().state == 'offered' && d().created == request.time && d().acted == request.time
        && d().doneF == false && d().doneT == false;

      allow update: if party() && (
        (me() == r().to && r().state == 'offered' && fresh()
          && only(['state', 'back', 'bid', 'acted'])
          && d().state == 'accepted' && monOk(d().back) && idOk(d().bid)
          && (r().ask == '' || d().bid == r().ask) && d().acted == request.time)
        || (me() == r().to && r().state == 'offered'
          && only(['state', 'acted']) && d().state == 'declined' && d().acted == request.time)
        || (me() == r().from && r().state == 'accepted'
          && only(['doneF', 'acted']) && d().doneF == true && d().acted == request.time)
        || (me() == r().to && r().state == 'accepted'
          && only(['doneT', 'acted']) && d().doneT == true && d().acted == request.time));

      allow delete: if party() && (
        (me() == r().from && r().state == 'offered')
        || r().state == 'declined'
        || (r().state == 'offered' && !fresh())
        || (r().state == 'accepted' && r().doneF == true && r().doneT == true
            && r().acted < request.time - duration.value(30, 'd')));
    }
  }
}
```

`firebase/firestore.indexes.json`: `{ "indexes": [], "fieldOverrides": [] }`. `firebase/firebase.json`: `{ "firestore": { "database": "(default)", "location": "eur3", "rules": "firestore.rules", "indexes": "firestore.indexes.json" } }`.

No se controla a propósito (las trampas no preocupan): que el Pokémon de `give` exista de verdad, su nivel real ni el número de miembros (para eso está `locked`).

### 11.4 Flujos

**Crear liga:** código de 10 chars en cliente → un solo `documents:commit` con `leagues/{code}` (`currentDocument.exists=false`, `created` por `REQUEST_TIME`) y `members/{uid}` (`joined`, `seen`). Si el código existía, reintentar con otro. Enlace `https://purupurpito.github.io/farolillo/#liga=<code>`.

**Entrar:** `GET leagues/{code}` (404 «Esa liga no existe»; `locked` «Está cerrada») → crear o actualizar mi miembro.

**Publicar mis datos:** como mucho cada 10 min mientras juego, al ocultar la pestaña y tras un momento especial, y solo si cambió algo. **Tabla:** `GET …/members?pageSize=50` al abrir Amigos y con ⟳; se ordena en cliente. Pestañas: Bitácora (`dex`), Misterio de la semana (`deep` con `wk` actual), Variocolores (`shiny`), Cala (`lvl`). Nada de tiempo jugado. Tocar a alguien → su escaparate y «Visitar su cala» (canvas de la cala en solo lectura con sus 9 vecinos `cala`, renderizados con mis assets).

**Intercambio** (A propone a B):

1. *Proponer (A):* elige un Pokémon suyo X libre y, opcionalmente, uno del escaparate de B (`ask`). En **una sola escritura local**: genera `tid`, `trade.reserved[X.id] = tid`, `trade.pending[tid] = {rol:'A', fase:'creando'}`. `commit` crea `trades/{tid}` con `currentDocument.exists=false`. Si no hay respuesta: `GET trades/{tid}`: existe y `from == yo` → éxito; 404 → reintentar el **mismo** `tid`, o cancelar y liberar X. Nunca un `tid` nuevo para el mismo intento.
2. *Aceptar (B):* ve la oferta (`runQuery to == yo`). Si `ask == ''` elige Y libre. Una escritura local: `reserved[Y.id] = tid`. `GET trades/{tid}` (lee `updateTime`, comprueba `offered`). `commit` con `update {state:'accepted', back, bid}`, `updateMask`, `acted` por `REQUEST_TIME` y `currentDocument.updateTime = leído`. Si confirma → aplicar. Si falla (precondición, 403 o 404) → releer: si `accepted` con `bid == Y.id`, aplicar; si no, liberar Y y avisar «A ya no ofrece ese intercambio».
3. *Aplicar (los dos, siempre igual):* si `trade.applied[tid]` existe → solo marcar `doneX` si falta. Si no, **en una única escritura local**: quitar el mío (`gid` para A, `bid` para B), añadir el recibido saneado con id `tr-<tid>` (si ya existe un individuo con ese id, no se añade), `applied[tid] = ahora`, borrar `reserved`. Después subir la nube (si hay sincronización) y **después** escribir `doneF`/`doneT`. Animación «¡Ha llegado X!» (Walk cruzándose).
4. *Reconciliación* al arrancar, al volver a la pestaña y cada 60 s con la pantalla de intercambios abierta: dos `runQuery` (`from == yo`, `to == yo`, límite 100). `accepted` sin `applied` → aplicar; con `applied` y sin mi `done` → marcar; `doneF && doneT` y > 30 días → borrar; `declined` (soy A) → liberar X, avisar y borrar; `offered` caducado → liberar y borrar. Reservas locales cuyo `tid` da 404 o no está `accepted` para mí → liberar (si soy B y sigue `offered`, solo mi reserva de aceptación). `applied` con > 60 días y documento inexistente → podar.

**Defensa contra duplicados fuera del protocolo** (importar un texto viejo, restaurar la nube o `.prev`, dos dispositivos): al importar o al elegir partida de la nube, (a) se fusiona `trade.applied` de la partida actual y la elegida (unión), (b) se eliminan los individuos cuyo `id` aparezca como `gid`/`bid` dados en un intercambio `applied` (requiere guardar en `applied[tid] = {t, dado: <id>}`), y (c) se deduplican ids `tr-<tid>`. Se asume el resto (amigos de confianza).

**Casos de fallo que deben pasar** (`tools/tradetest.mjs`): crear y reintentar con el mismo `tid` (una sola oferta); aplicar dos veces (un solo Pokémon); carrera cancelar/aceptar (nadie pierde nada); aceptar en dos dispositivos (una aceptación); respuesta perdida tras aceptar (se aplica una vez en la reconciliación); fallo al subir `doneT` (no se aplica dos veces); aceptar caducado → 403; `bid ≠ ask` → 403; borrar `accepted` sin doble `done` → 403; leer miembros sin ser miembro → 403; quien acepta modifica `give` → 403.

### 11.5 Guardado en la nube

`users/{uid}/saves/main` con el JSON del guardado en texto. Subida con debounce de 30 s y al ocultar. Al entrar con cuenta o al arrancar: si la nube es más reciente que lo local y distinta → «¿Qué partida te quedas?» con resumen de las dos (especies, isla máxima, fecha) y copia `.prev` en localStorage de la descartada.

### 11.6 Crear el proyecto Firebase (v0.3, con la sesión ya guardada de firebase-tools)

Nunca copiar a notas el correo que muestra `login:list`.

```bash
cd firebase
npx -y firebase-tools@13 login:list
npx -y firebase-tools@13 projects:create farolillo-cala-XXXX --display-name "Farolillo"
npx -y firebase-tools@13 apps:create WEB "farolillo-web" --project farolillo-cala-XXXX
npx -y firebase-tools@13 apps:sdkconfig WEB <appId> --project farolillo-cala-XXXX   # apiKey, authDomain → js/config.js
npx -y firebase-tools@13 firestore:databases:create "(default)" --location eur3 --project farolillo-cala-XXXX
npx -y firebase-tools@13 deploy --only firestore --project farolillo-cala-XXXX
```

En la consola (lo hace el autor): Authentication → Comenzar → activar Correo/contraseña y Google (nombre público «Farolillo», sin «Pokémon») → Authorized domains: `purupurpito.github.io` → (opcional) restringir la API key por referer a `https://purupurpito.github.io/*`, `http://localhost:*/*` y `https://<id>.firebaseapp.com/*`. Si `firestore:databases:create` falla, se crea la base en la consola (eur3, modo producción) y se repite el despliegue.

**Orden:** desplegar reglas → esperar unos minutos → publicar el cliente con `SOCIAL = true`.

**Consumo** con 8 amigos: < 2 % de la cuota Spark. Sin listeners.

---

## 12. Guardado local

### 12.1 Esquema (versión 1)

```js
save = {
  saveVersion: 1, creado, ultimaVez, idDispositivo,   // idDispositivo aleatorio por navegador
  nombre: "", guia: "0004", faro: "norte",
  monedas: 0, bayas: 0, objetos: { piedra_hoja: 0, ... }, caramelos: { "0025": 0 },
  base: { huerto: 0, despensa: 0, muelle: 0, linterna: 0, taberna: 0, ultimaRecogida },
  pokemon: [ Mon, ... ],                                // §3.8, máx. 400
  equipos: [ { miembros: [uid,uid,uid], roles: [...], ultimoPlan: plan|null,
               exp: { plan, inicio, fin, semilla, snapshot, registro } | null } ],   // 1-4
  islas: { "1": { pisoMax: 0, jefe: false, dominio: 0, dominioJefe: [false,false,false],
                  piedad: 0, huellas: { "0043": 1 }, huevo: false } },
  misterio: { wk: 0, record: 0 },
  bitacora: { visto: {}, tenido: {} }, album: {}, cadenas: { "0019": 3 },
  visitante: { sp, llega, vence } | null,
  diarioExp: [ resumenInforme, ... ],                   // últimos 30
  informesSinEspecial: 0, tutorial: { paso: 0 },
  misiones: { dia, lista: [], semanal, cambios, pendientes: [] }, diasJugados: [],
  stats: { exps: 0, jefes: 0, mejorP: 0 },
  trade: { applied: {}, reserved: {}, pending: {}, leagues: [] },
  ajustes: { duplicados: "fusionar", sonido: 0.6, reducirAnim: false }
}
```

### 12.2 Reglas

- `localStorage['farolillo.save']` en **una sola escritura** por operación compuesta (recoger, evolucionar, aplicar intercambio). Debounce de 1 s para cambios menores y escritura inmediata en `visibilitychange` → hidden.
- Copia en IndexedDB (`farolillo` / store `saves`, clave `main`) tras cada escritura. Al cargar se usa la más reciente por `ultimaVez`.
- `navigator.storage.persist()` en el primer arranque.
- `saveVersion` + `migraciones[n](save) → save` desde el día 1. Cada migración tiene su test con un guardado de ejemplo en `test/fixtures/`.
- **Exportar:** `"FAR1." + base64(utf8(JSON)) + "." + fnv1a32hex(json)`. Importar valida el checksum y pasa por migraciones y por la deduplicación del §11.4.
- Tamaño esperado < 300 KB (400 individuos × ~400 B + registros). Si `JSON.stringify` supera 1,5 MB se avisa.
- **Aviso iOS:** banner discreto los primeros 7 días si no está instalada como PWA: «Instala Farolillo o exporta tu partida: Safari puede borrarla si no la abres en una semana». Exportar llega en v0.1.
- Reloj: si `ahora < ultimaVez`, se cuentan 0 s y se reancla `ultimaVez`.

---

## 13. Pipeline de assets y datos

### 13.1 `tools/species-list.json` (lista inicial: 222 especies, G1-G4)

Familias completas. Formato `{ "islas": { "prado": ["0010",...] }, "iniciales": [...], "especiales": [...], "legendarios": [...] }` (solo bases; el build añade las evoluciones de la familia que estén en la lista total de abajo). Lista total (dex):

- **Iniciales (36):** 0001-0009, 0152-0160, 0252-0260, 0387-0395.
- **Especiales (11):** Pikachu 0172 0025 0026 · Eevee 0133 0134 0135 0136 0196 0197 0470 0471.
- **Prado (27):** 0010 0011 0012 · 0013 0014 0015 · 0016 0017 0018 · 0019 0020 · 0161 0162 · 0043 0044 0045 0182 · 0265 0266 0267 0268 0269 · 0396 0397 0398 · 0399 0400.
- **Arroyo (22):** 0054 0055 · 0060 0061 0062 0186 · 0118 0119 · 0129 0130 · 0298 0183 0184 · 0194 0195 · 0270 0271 0272 · 0278 0279 · 0418 0419.
- **Cueva (20):** 0041 0042 0169 · 0074 0075 0076 · 0050 0051 · 0095 0208 · 0027 0028 · 0066 0067 0068 · 0304 0305 0306 · 0436 0437.
- **Bosque (18):** 0092 0093 0094 · 0200 0429 · 0198 0430 · 0163 0164 · 0048 0049 · 0353 0354 · 0355 0356 0477 · 0425 0426.
- **Volcán (19):** 0037 0038 · 0058 0059 · 0077 0078 · 0240 0126 0467 · 0218 0219 · 0228 0229 · 0322 0323 · 0296 0297 · 0307 0308.
- **Pico (17):** 0086 0087 · 0220 0221 0473 · 0215 0461 · 0238 0124 · 0361 0362 0478 · 0363 0364 0365 · 0459 0460.
- **Ruinas (23):** 0081 0082 0462 · 0100 0101 · 0239 0125 0466 · 0063 0064 0065 · 0280 0281 0282 0475 · 0309 0310 · 0403 0404 0405 · 0374 0375 0376.
- **Cumbre (20):** 0147 0148 0149 · 0173 0035 0036 · 0175 0176 0468 · 0246 0247 0248 · 0333 0334 · 0371 0372 0373 · 0443 0444 0445.
- **Legendarios (9):** 0144 0145 0146 0150 0243 0244 0245 0380 0381.

Iniciales, Pikachu y Eevee aparecen como R en todas las islas con peso bajo (0,3), con más peso en la isla de su tipo. Las especies con tipos de varias islas pueden repetirse en tablas (las listas de arriba solo fijan su isla principal; `build-data` añade apariciones secundarias en islas con un tipo en común, peso 0,5).

### 13.2 `tools/build-data.mjs`

1. Descarga (o lee de `tools/.cache/`) los CSV de PokeAPI de un commit fijado (`POKEAPI_SHA` en el script): `pokemon_species`, `pokemon_species_names`, `pokemon_stats`, `pokemon_types`, `types`, `type_names`, `type_efficacy`, `pokemon_evolution`.
2. Filtra a la lista, calcula `tot`, `rar` (§6.5), `fam`, `pre`, `evo` (aplicando `tools/evo-overrides.json`), `exc` (§6.7), nombres y género en castellano (`local_language_id = 7`; si falta el género, cadena vacía).
3. Lee `vario` del informe de `build-assets` (`tools/.cache/vario.json`) y lo aplica por familia.
4. Escribe `data/especies.json`, `data/tipos.json` y `data/islas.json` (a partir de `tools/islas-base.json` + especies).
5. Valida: familias completas, ≥ 8 especies por tipo en total, cada isla ≥ 15 especies, ninguna evolución apunta fuera de la lista. Sale con código ≠ 0 si falla.

### 13.3 `tools/build-assets.mjs`

1. `SHA = "1a294bec85e309d023c0b074617462c6c6b44a31"`. Descarga `tracker.json` y `credit_names.txt` de `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/<SHA>/...` a `tools/.cache/` (no se versiona; `.gitignore`).
2. Para cada especie de la lista valida contra el tracker: `sprite_complete ≥ 1`; **presencia de la clave** (no el booleano, que significa «bloqueado») de Idle, Walk, Attack, Sleep y Hurt en `sprite_files`; `portrait_files.Normal`. Variocolor: nodo `subgroups["0000"].subgroups["0001"]` con `sprite_complete ≥ 1` y las 5 claves. Si una especie falla lo básico, error.
3. Descarga desde `https://cdn.jsdelivr.net/gh/PMDCollab/SpriteCollab@<SHA>/` (concurrencia 6, reintentos 3): `sprite/<dex4>/AnimData.xml`, las PNG `-Anim.png` de Idle, Walk, Attack, Sleep, Hurt y, si existen, Hop y Faint (descartar un extra si pesa > 25 KB tras recortar). Resuelve `CopyOf`. Retratos `portrait/<dex4>/{Normal,Happy,Pain,Joyous,Surprised}.png` si existen. `credits.txt` de sprite y de retrato. Lo mismo para la variante en `sprite/<dex4>/0000/0001/` y `portrait/<dex4>/0000/0001/` (retratos Normal y Happy).
4. Recorta con `pngjs` las filas **0, 2 y 6** (las de una sola fila se dejan). No copia Shadow ni Offsets. Si `oxipng` está en el PATH, optimiza.
5. Escribe `assets/pmd/...`, `assets/manifest.json` (§3.6), `assets/creditos.json` (§3.7: filas `CUR` de cada credits.txt, traducidas con `credit_names.txt`, id si no hay nombre, contacto si existe) y `tools/.cache/vario.json` (`{dex4: bool}`).
6. Informe final: tamaño total, especies con extras, familias sin variocolor.
7. Opciones: `--solo 0001,0004,0025` (para medir con 20 especies en v0.1), `--sin-red` (usa la caché).
8. **Presupuesto:** ≈ 30 KB por especie (3 filas, 5 animaciones) + ≈ 8 KB de retratos → ≈ 8,5 MB para 222, más ≈ 4 MB de variocolor. Si con 20 especies la media sale > 45 KB, se avisa a el autor antes de bajar la lista entera.

Dependencias de Node solo en `tools/package.json`: `pngjs`. Nada más.

### 13.4 Orden de ejecución

`node tools/build-assets.mjs && node tools/build-data.mjs && node tools/check.mjs`. Lo generado (`assets/`, `data/`) se versiona.

---

## 14. Créditos y licencia

- **Pantalla Créditos** (desde `≡`, siempre accesible, generada desde `creditos.json`):
  - «Sprites y retratos: PMD Sprite Repository / PMDCollab (https://sprites.pmdcollab.org/), licencia CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/). Adaptados: recortados a 3 direcciones y reempaquetados.»
  - Lista de artistas agrupada (nombre con enlace de contacto si lo hay; id si no hay nombre).
  - «Los sprites marcados CHUNSOFT proceden de los juegos originales de Pokémon Mystery Dungeon (Spike Chunsoft) y no están bajo licencia CC.»
  - Aviso de PokeAPI: «Datos: PokéAPI (BSD-3-Clause), © 2013–2023 Paul Hallett and PokéAPI contributors».
  - «Pokémon y los nombres de los personajes son marcas de Nintendo / Creatures Inc. / GAME FREAK inc. Proyecto de fans privado y sin ánimo de lucro: sin anuncios, pagos ni donaciones.»
  - Fuente Pixelify Sans (OFL).
- **En cada ficha:** autor del sprite y del retrato de esa especie y variante, con su licencia.
- `NOTICE.md` en la raíz con lo mismo.

---

## 15. Arquitectura de archivos y propiedad

### 15.1 Árbol y dueño

Cada archivo tiene **un único dueño** (agente). Otros agentes solo lo leen o lo importan por su interfaz. Cambios en la interfaz de otro se piden, no se hacen.

| Ruta | Dueño | Qué hace |
|---|---|---|
| `tools/build-assets.mjs`, `tools/build-data.mjs`, `tools/check.mjs`, `tools/species-list.json`, `tools/islas-base.json`, `tools/evo-overrides.json`, `tools/package.json` | **DATOS** | Pipeline (§13) |
| `data/*.json`, `assets/manifest.json`, `assets/creditos.json`, `assets/pmd/**` | **DATOS** (generados) | — |
| `data/textos.json` | **UI** | Plantillas y textos |
| `js/core/rng.js` | **NÚCLEO** | PRNG y semillas |
| `js/core/formulas.js` | **NÚCLEO** | Constantes `K` y fórmulas puras |
| `js/core/sim.js`, `js/core/worker-prev.js` | **NÚCLEO** | Resolución, previsión, sugerir |
| `js/core/recruit.js` | **NÚCLEO** | Encuentros, aceptación, piedad, variocolor |
| `js/core/evolve.js` | **NÚCLEO** | Requisitos y aplicación de evoluciones |
| `js/core/state.js` | **ESTADO** | Guardado, migraciones, export/import, IndexedDB |
| `js/core/game.js` | **ESTADO** | Acciones sobre el guardado (orquesta núcleo) |
| `js/core/economy.js` | **ESTADO** | Edificios, huerto offline, visitantes |
| `js/core/missions.js`, `js/core/events.js` | **ESTADO** | Misiones; clima, evento semanal, marea |
| `js/core/bus.js` | **ESTADO** | Eventos internos `on/emit` |
| `js/data.js` | **ESTADO** | Carga y cachea `data/*.json` |
| `js/gfx/sprites.js` | **GRÁFICOS** | Manifest, carga perezosa, `dibujar` |
| `js/gfx/scene-cala.js`, `scene-combate.js`, `scene-ficha.js`, `fx.js`, `tiles.js` | **GRÁFICOS** | Escenas canvas y efectos |
| `js/main.js`, `js/ui/*.js`, `css/app.css`, `index.html`, `assets/ui/*`, `assets/fonts/*` | **UI** | Shell, router, pantallas |
| `js/fmt.js`, `js/audio.js` | **UI** | Formatos y sonidos |
| `sw.js`, `manifest.webmanifest`, `robots.txt` | **UI** | PWA |
| `js/config.js` | **UI** (SOCIAL y FB los rellena SOCIAL) | Interruptores |
| `js/net/fsrest.js`, `account.js`, `league.js`, `trade.js` | **SOCIAL** | Capa Firebase |
| `firebase/*`, `tools/tradetest.mjs` | **SOCIAL** | Reglas y pruebas |
| `tools/sim.mjs` | **NÚCLEO** | Simulador de ritmo |
| `test/*.test.mjs`, `test/fixtures/*` | dueño del módulo probado | Pruebas |
| `NOTICE.md`, `README.md`, `notes/*` | **UI** | Documentación |

Regla: los módulos de `js/core/` y `js/net/` (salvo `account.js`, que carga el SDK de Google a demanda) **no tocan el DOM** ni `window` y se importan desde Node. `state.js` recibe el almacenamiento por inyección.

### 15.2 Interfaces (firmas)

Tipos abreviados: `Save` (§12.1), `Mon` (§3.8), `Plan` (§4.2), `Datos = {especies, islas, tipos, textos}`, `Ctx = {datos, ahora, semana, clima, evento}`.

**`js/core/rng.js`**
```js
export function mulberry32(seed: number): () => number          // [0,1)
export function hashSeed(...partes: (string|number)[]): number  // uint32 (FNV-1a sobre partes unidas con '|')
export function isoSemana(fechaMs: number): { año, semana, id }  // id = año*100+semana, hora local
export function elegirPonderado(rng, items: [valor, peso][]): valor
export function idAleatorio(rng?, n = 6): string
```

**`js/core/formulas.js`**
```js
export const K = { ... todas las constantes de §4-§7 ... }
export function poderMon(mon: Mon, esp): number
export function multTipo(tiposMon: string[], tiposIsla: string[], tablaEf): { ofensa, defensa, mult }
export function poderEquipo(snapshot, isla, ctx): { P, porMiembro: [...], composicion }
export function dificultad(isla, piso: number, dominio: number, climaD: number): number
export function dificultadMisterio(piso: number, climaD: number): number
export function probPiso(P: number, D: number, pMin: number): number
export function tramos(F: number): { desde, hasta, jefe: boolean }[]
export function tPiso(isla, vel: number, nivelTaberna: number, climaT: number, postura): number  // ms
export function velEquipo(snapshot, roles): number
export function botinPiso(m: number, f: number, opts): { monedas, exp, pObjeto }
export function expSig(nivel: number): number
export function topeNivel(jefesVencidos: number): number
export function costeEdificio(id: string, nivel: number): number | null   // null = al tope
export function tasaHuerto(nivel: number, jefesVencidos: number): number   // bayas/h
export function nivelSalvaje(m: number, f: number): number
export function nvOri(m: number): number
```

**`js/core/sim.js`**
```js
export function crearSnapshot(save: Save, plan: Plan, datos): Snapshot   // congela poderes, tipos, nombres, nivel líder
export function resolverExpedicion(arg: { plan, snapshot, semilla, inicio, ctx }): Registro
export function estadoEn(registro: Registro, tMs: number): { ronda, piso, tramo, pv, terminado: boolean, fraccion }
export function detallePiso(registro, ronda, piso): { enemigo: dex4, golpes: [...], ok }  // para la escena, determinista
export function prever(arg: { plan, snapshot, semilla, inicio, ctx }, n = 200): Prevision
export function sugerirEquipo(save, isla, opciones, ctx): { equipo, roles, prob }
```
```js
Registro = { v: 1, semilla, inicio, fin, tPiso, pvInicio,
  rondas: [ { t0, t1, pisoFin, jefe: bool, pvFin, monedas, exp, objetos: {id: n},
              encuentros: [ { f, sp, nv, acepta, vr, rar, huellaUsada } ],
              eventos: [ { f, tipo, datos } ], fallos: [ f, ... ] } ],
  motivo: "objetivo" | "rescatado" | "tiempo" | "prudente",
  totales: { monedas, exp, objetos, reclutas: n } }
Prevision = { pJefe, pisosMedia, vueltasMedia, monedas, exp, reclutas, finMediana }
```
Encuentros: `resolverExpedicion` tira el encuentro, la aceptación y el variocolor (usando `recruit.js`), así el informe ya está fijado al enviar.

**`js/core/recruit.js`**
```js
export function tablaEncuentros(isla, save, ctx): { C: [[sp,peso]], PC, R, L }
export function tirarEncuentro(rng, arg: { isla, piso, F, snapshot, postura, tabla, piedad, huellas, ctx }): Encuentro | null
export function pVario(sp, save, ctx): number
export function aplicarRecluta(save, enc: Encuentro, ctx): { tipo: "nuevo"|"estrella"|"caramelo"|"individuo", uid, especial: bool }
```

**`js/core/evolve.js`**
```js
export function opcionesEvolucion(mon, save, datos, ahora): [ { a: dex4, c, it?, posible: bool, falta: string } ]
export function aplicarEvolucion(save, uid, destino, datos, ahora, via = "normal"|"intercambio"): Mon
```

**`js/core/state.js`**
```js
export const SAVE_VERSION = 1
export function nuevoGuardado({ guia, faro, nombre, ahora, rng }): Save
export function migrar(raw: object): Save
export function crearAlmacen({ localStorage, indexedDB }): Almacen   // inyectable; en Node, memoria
export async function cargar(almacen): Save | null
export function guardar(almacen, save, { inmediato = false }): void
export function exportar(save): string
export function importar(texto: string): Save                       // lanza Error con mensaje en castellano
export function fusionarTrasImportar(actual: Save, entrante: Save): Save   // §11.4 dedupe
```

**`js/core/game.js`** (todas mutan `save` y devuelven datos para la UI; nunca tocan DOM)
```js
export function tick(save, ctx): { avisos: Aviso[], cambios: bool }       // producción, visitantes, títulos
export function enviar(save, idxEquipo, plan, ctx): { fin }
export function repetir(save, idxEquipo, ctx): { fin } | null
export function enviarTodos(save, ctx): number
export function recogerTodo(save, ctx): Informe        // aplica botín, EXP, reclutas, eventos, misiones; arma momentos
export function recogerEquipo(save, idx, ctx): Informe
export function darBayas(save, uid, cantidad, ctx): { nv, xp }
export function igualar(save, ctx): void
export function mejorar(save, edificio, ctx): boolean
export function tocarVecino(save, uid, ctx): { frase, cariño }
export function atenderVisitante(save, ctx): Mon | null
export function evolucionar(save, uid, destino, ctx): Mon
export function usarObjeto(save, uid, objeto, ctx): ...
export function cambiarMision(save, idx, ctx): void
export function cobrarMision(save, idx, ctx): Recompensa
export function avisos(save, ctx): Aviso[]             // máx. 3, priorizados
export function metaSiguiente(save, ctx): { texto, destino }
Informe = { equipos: [ { idx, isla, registro, nivelesSubidos: [...], reclutas: [...] } ],
            cala: { bayas, visitante }, momentos: Momento[], misiones: [...] }
Momento = { tipo: "recluta"|"evolucion"|"variocolor"|"jefe", uid?, sp, emocion, texto }
```

**`js/core/economy.js`**: `producir(save, ahora, ctx) → { bayas, visitas }`, `tiraVisitante(save, rng, ctx)`, `nivelCala(save)`.

**`js/core/events.js`**: `climaSemana(semanaId, islaId) → clima`, `eventoSemana(semanaId, datos) → evento`, `esNoche(ahoraMs) → bool`, `tiposMisterio(semanaId) → [t1, t2]`.

**`js/core/missions.js`**: `renovar(save, ahora, rng)`, `progreso(save, accion, datos)` (llamado desde `game.js` con acciones `expedicion|recluta|nivel|toque|jefe|evolucion|patrullaNoche|objeto|visitante|audaz|monedas|bayas|ventaja|fusion|misterio`).

**`js/core/bus.js`**: `on(evento, fn)`, `off`, `emit(evento, datos)`. Eventos: `save:cambio`, `informe`, `momento`, `aviso`, `exp:enviada`.

**`js/data.js`**: `cargarDatos(base = './') → Promise<Datos>`; en Node, `cargarDatosNode(dir)`.

**`js/gfx/sprites.js`**
```js
export async function iniciar(base = './assets/'): void               // lee manifest y créditos
export function tieneAnim(sp, anim, vr = false): boolean
export function animConRespaldo(sp, deseada, vr): string               // Attack→Idle; Sleep→Idle; Hop→Idle; Faint→Hurt→Idle
export async function precargar(sp, anims: string[], vr = false): void
export function dibujar(ctx2d, { sp, vr, anim, dir, tMs, x, y, escala, silueta = false, espejo = false }): void   // sombra incluida; si la imagen no ha cargado, no dibuja y la pide
export function urlRetrato(sp, emocion, vr = false): string             // con respaldo a Normal
export function hitFrame(sp, anim, vr): number | null
export function duracionAnim(sp, anim, vr): number                      // ms de un ciclo
```

**Escenas** (`js/gfx/scene-*.js`), todas con la misma forma:
```js
export function crear(canvas, opciones): Escena
Escena = { actualizar(estado), iniciar(), parar(), destruir(), alTocar(fn) }
// scene-cala: estado = { vecinos: [{uid, sp, vr, dormido}], visitante, farolillos, dorados, soloLectura }
// scene-combate: estado = { registro, snapshot, ahora }  (usa sim.estadoEn y sim.detallePiso)
// scene-ficha: estado = { sp, vr, anim }
```
`fx.js`: `destello(canvas)`, `secuenciaEvolucion(canvas, spA, spB, vr) → Promise`, `revelarVario(canvas, sp) → Promise`, `capturaCompartir(canvas, texto) → Promise<Blob>`.

Bucle de animación: uno solo en `main.js` (`requestAnimationFrame`), que llama a `escena.render(t)` de las escenas visibles; para con `document.hidden`.

**UI** (`js/ui/*.js`): cada pantalla exporta `montar(raiz, app) → { actualizar(), desmontar() }`. `app = { save, datos, ctx(), acciones: game.*, sprites, router, guardar() }`. Pantallas: `cala.js`, `expediciones.js`, `formar.js`, `selector.js`, `encurso.js`, `informe.js`, `momento.js`, `bitacora.js`, `gremio.js`, `ficha.js`, `ajustes.js`, `creditos.js`, `inicio.js` (primer arranque), `amigos.js`, `intercambio.js`. `router.js` gestiona pestañas, modales y `#liga=`. `componentes.js`: botón, barra, retrato, tarjeta, aviso.

**`js/net/fsrest.js`**: `crearCliente({ project, key, fetch, getToken })` → `{ get(path), commit(writes), runQuery(q), list(path, pageSize) }`; `enc(obj)`, `dec(doc)` (con `timestampValue`, `mapValue`, `integerValue`).
**`js/net/account.js`**: `entrarPassword(u, p)`, `registrar(u, p)`, `entrarGoogle()`, `salir()`, `token() → Promise<string>`, `uid()`, `sincronizar(save) / bajar()`.
**`js/net/league.js`**: `crearLiga(cli, uid, nombreLiga, miembro)`, `entrar(cli, uid, code, miembro)`, `salir`, `tabla(cli, code)`, `publicar(cli, code, uid, miembro)`, `datosMiembro(save, datos) → miembro`.
**`js/net/trade.js`**: `proponer`, `aceptar`, `rechazar`, `cancelar`, `aplicar`, `reconciliar`, `sanearMon(json, datos, miUid, tope) → Mon | {error}`. Reciben `{ cli, uid, save, guardar, datos }`.

### 15.3 Simulador (`tools/sim.mjs`)

`node tools/sim.mjs --dias 30 --sesiones 5 --semillas 50 --politica voraz|perezosa`. Importa `core/*` con datos reales. Política voraz: en cada sesión recoge, mejora lo más barato que dé poder o equipos, iguala con bayas, envía con Sugerir a la isla más honda con `pJefe ≥ 0,6` (si no, patrulla en la anterior), de noche patrulla de 8 h, atiende visitantes, evoluciona todo lo posible. Perezosa: solo «Recoger todo» y «Repetir» (y los mismos envíos iniciales). Salida: tabla de hitos (§2.3) con p10/p50/p90, mesetas > 24 h, mediana y p90 del primer variocolor, y ratio perezosa/voraz. Sale con código ≠ 0 si incumple los objetivos marcados como duros (sin mesetas > 24 h en p50; isla 8 antes del día 12 en p50; ratio ≥ 0,6).

---

## 16. Plan de pruebas

- **Unitarias (Node, `node --test test/`)** sin dependencias:
  - `rng.test.mjs`: determinismo, distribución básica, `isoSemana` en cambios de año.
  - `formulas.test.mjs`: valores de ejemplo de §4-§7 (D0, expSig, costes), calibración (§4.4) para las 8 islas, tramos de F = 8, 12, 50.
  - `sim.test.mjs`: misma semilla → mismo registro (golden en `test/fixtures/registro-*.json`); `estadoEn` monótono; rescate con PV 0; prudente nunca baja de 1 PV; patrulla respeta las horas; previsión no usa la semilla real; rendimiento: `prever(…, 200)` < 20 ms en Node.
  - `recruit.test.mjs`: piedad a los 40, huellas, L solo en jefe de isla ≥ 6, sin vario en especies `vario:false`, pesos de faro.
  - `evolve.test.mjs`: cada `c`, ramificadas, conserva campos, intercambio.
  - `state.test.mjs`: nuevo → guardar → cargar; export/import ida y vuelta; checksum malo → error; migraciones con fixtures; reloj hacia atrás; deduplicación tras importar.
  - `economy.test.mjs`: tope offline, 75 % tras 2 h, visitante cada 2 h y caducidad.
  - `game.test.mjs`: flujo completo con almacén en memoria y reloj falso: primer arranque → tutorial → recoger → enviar 3 → avanzar 4 h → recoger todo.
  - `trade.test.mjs`: con `fetch` simulado, aplicar dos veces, saneado, reconciliación.
- **Reglas:** `tools/tradetest.mjs` contra el emulador (`npx -y firebase-tools@13 emulators:start --only firestore,auth`, necesita Java) con los casos del §11.4.
- **Datos:** `tools/check.mjs` (§13.2 paso 5) y que cada PNG del manifest existe y mide `fw × frames` por `fh × filas`.
- **UI (Playwright si está disponible; si no, Claude in Chrome):** `test/ui/capturas.mjs` abre `http://localhost:8080/?test=1` (semilla y reloj fijos con `?reloj=`), recorre primer arranque, cala, formar equipo, informe, ficha, bitácora y gremio en **360x640, 640x360 y 568x320**, guarda capturas en `test/ui/out/` y comprueba: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), botones ≥ 44 px, sin errores de consola. el autor mira las capturas antes de cada entrega.
- **Prueba manual en móvil** de el autor al final de cada hito.

---

## 17. Rendimiento

- Máximo 12 sprites animados por escena; ~15 fps de actualización de frames (el rAF puede ir a 60 pero solo redibuja si cambia un frame).
- Carga perezosa por especie; la Bitácora solo pide retratos Normal. `sw.js`: precache del shell, `data/` y retratos Normal (~0,3 MB a cachear al instalar); cache-first para el resto de `assets/` al pedirlos. Versión de caché ligada a `js/version.js`.
- Previsión con debounce de 150 ms; Sugerir < 60 ms o Web Worker.
- Ningún cálculo en segundo plano: todo se resuelve al volver.

---

## 18. Riesgos y cómo se resuelven aquí

| Riesgo | Resolución en esta especificación |
|---|---|
| Legal | noindex, robots, sin «pokemon», sin lucro, créditos, retirada inmediata si hay queja; Firebase separado |
| Pages exige repo público | Ver `DECISIONES.md` §2 (alternativa: repo privado + Cloudflare Pages) |
| Desgaste de PV en islas largas | Resolución por tramos (§4.4) |
| Curvas exponenciales vs poder lineal | Rampa normalizada por isla de C + test de calibración por isla |
| Bayas sin tope | Huerto con tope 25 y tasa ligada a jefes; tope de nivel por jefes (§5, §7.1) |
| Medallas farmeables | Fórmula por jefes y récord (§8.4) |
| Misterio no comparable | Dificultad fija igual para todos (§4.4) |
| Exclusivas imposibles en grupos pequeños | Peso 0,1 tras Dominio 2 y huevos de Dominio 3 (§6.7) |
| Variocolor bloqueando evoluciones | `vario` por familia (§3.2) |
| Duplicados fuera del protocolo | Deduplicación al importar (§11.4) |
| Guardado grande | 400 individuos, diario de 8 (§3.8) |
| Assets más grandes de lo previsto | Medir con 20 especies primero (§13.3) |
| Pérdida en iOS | Exportar en v0.1, aviso, PWA en v0.2, nube en v0.3 |
| Sobrecarga de la sesión corta | Recoger todo / Enviar a todos cubren lo recurrente; 3 avisos máx. |
| Variocolor demasiado raro | 1/320 base; el simulador vigila p90 |
| Alcance | §19 cerrado |

---

## 19. Hitos

Estimación en sesiones de trabajo (2-4 h). el autor abre cada sprint; dentro, los flujos largos están bien. **Antes de empezar cada hito, mirar la memoria y las ramas**.

### v0.1 — Jugable offline (≈ 9-11 sesiones)

Contenido:
- Repo local, `tools/` completos; primero 20 especies para medir y luego las 222. Manifest, créditos, `data/`.
- `core/` completo salvo misiones y eventos semanales: rng, formulas, sim (tramos, posturas, patrulla, previsión, sugerir), recruit (rareza, huellas, piedad, faros, variocolor), evolve (todas las vías salvo intercambio real), state (migraciones, export/import, IndexedDB), game, economy (edificios, huerto offline; sin visitantes).
- Clima semanal y marea (`events.js` mínimo).
- Islas 1-8 y Misterio local (sin ranking).
- UI: primer arranque, Cala (canvas básico: vecinos Walk/Idle/Sleep, tocar), Expediciones, Formar equipo con previsión y selector, En curso (Walk/Attack/Hurt), Informe, momento especial sencillo (sin secuencias elaboradas), Bitácora, Gremio, Ficha (con diario y créditos), Ajustes (exportar/importar), Créditos.
- Simulador con las dos políticas y ajuste de números.
- Pruebas unitarias y capturas en los 3 tamaños.

Hecho cuando: se envía, se cierra la pestaña, se vuelve y el informe cuadra; el simulador no da mesetas > 24 h en p50 y la perezosa ≥ 60 %; las 222 especies se animan en la ficha en los 3 tamaños; créditos completos; el autor lo juega 2-3 días en su móvil en local.

### v0.2 — Pulido y arte (≈ 6-8 sesiones)

Contenido:
- Momentos especiales completos: secuencia de evolución (~4 s, siluetas que parpadean, «¡X se ha convertido en Y!»), revelación variocolor con destello y Compartir, elección de rama con Idle de cada opción.
- Visitantes de la cala; farolillos y dorados; día/noche en la cala; decoraciones por hitos.
- Misiones diarias y semanal, evento semanal, Dominio 1-3 y Huevos, días jugados.
- Álbum de animaciones; Hop y Faint donde existan; patrones de baldosas por isla.
- PWA (`sw.js`, manifest, instalación), título de pestaña, `setAppBadge`, `.ics`, aviso iOS.
- Sonidos WebAudio, reducir animaciones, tipografía Pixelify, pase de estilo completo (§10).
- Segunda pasada del simulador (30 días, 50 semillas) y pase de fallos en 360x640, 640x360 y 568x320.

Hecho cuando: ningún informe vacío en 3 días de prueba; una semana de juego de el autor sin fallos; funciona en modo avión; capturas revisadas.

### v0.3 — Social (≈ 5-7 sesiones)

Hosting decidido: GitHub Pages.

Contenido:
- Proyecto Firebase nuevo, reglas (§11.3) desplegadas y probadas con el emulador **antes** que el cliente.
- `fsrest.js`, `account.js` (contraseña + Google), guardado en la nube con elección de partida.
- Liga: crear, entrar por enlace `#liga=`, tabla con 4 pestañas, ranking Misterio semanal, visitar la cala de un amigo.
- Intercambio: escaparate, proponer, aceptar, rechazar, cancelar, reconciliación, evolución al llegar, deduplicación al importar.
- Publicación en Pages (o la alternativa decidida) con `noindex` y `robots.txt`; interruptor `SOCIAL = true`.

Hecho cuando: todos los casos de `tradetest.mjs` pasan contra el emulador; 2 cuentas reales en 2 móviles ven la misma tabla e intercambian 10 veces sin incidencias; se comparte el enlace de la liga.

### Después de 1.0 (no se implementa sin que el autor lo pida)

Temporadas (prestigio, §8.4), rescates entre amigos, combos ocultos de tipos, rasgos y energía, especies de G5 en adelante (hay 964 utilizables), formas alternativas, Web Push con FCM (plan Blaze), música.
