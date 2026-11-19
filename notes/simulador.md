# Simulador: ajuste de K para v0.1 (integración, 18-nov-2026)

Orden: `node tools/sim.mjs --dias 30 --sesiones 5 --semillas 50` (ambas políticas, datos reales de `data/`, ~6 min).

## Resultado final (50 semillas, 30 días)

| Hito | Voraz p50 (p10-p90) | Perezosa p50 (p10-p90) | Objetivo §2.3 |
|---|---|---|---|
| Primer raro | 15 min (10-15 min) | 15 min | ≈ 30 min |
| Muelle 1 | 16 h (12-36 h) | nunca (no mejora) | día 1 |
| Primera evolución | 4,0 h (11 min-8 h) | nunca (no evoluciona) | ≈ 1 h |
| Isla 4 | 8,2 h (4,2-12,2 h) | 12,2 h (8,2-24,2 h) | ≈ 4 h |
| Isla 6 | 28,5 h (24-36 h) | 2,4 d (40 h-3 d) | días 2-3 |
| Isla 8 vencida | 3,0 d (2,2-3,5 d) | 6,6 d (5,1-18,1 d; 98 %) | días 6-10 |
| 25 % Bitácora | 2,7 d | 6,0 d | semana 1 |
| Primer variocolor | 4,3 d (p90 6,2 d) | 9,5 d (p90 16,3 d) | semanas 2-4 (p90 ≤ 6 sem.) |
| Meseta más larga | p50 19,8 h · p90 24,2 h | p50 47 h · p90 10,2 d | < 24 h |

Ritmo perezosa/voraz = **0,52** → el simulador sale con código 1.

Objetivos duros (§15.3):
- Sin mesetas > 24 h en p50 (voraz): **cumple** (19,8 h).
- Isla 8 vencida antes del día 12 en p50: **cumple** (3,0 d voraz; 6,6 d perezosa).
- Perezosa/voraz ≥ 0,6: **no cumple** (0,52).

Antes del ajuste (números de la spec, 20 semillas): voraz isla 8 en 40 h, perezosa 8,2 d, ritmo 0,28.

## Cambios en K (`js/core/formulas.js`, cada uno comentado con el valor de la spec)

| Constante | Spec | Ahora | Por qué |
|---|---|---|---|
| `PV_BASE` | 3 | 5 | Con 3 PV las patrullas del equipo más débil caían a la primera hora y el resto del hueco se perdía (la perezosa perdía ~70 % del tiempo). |
| `MON_G` | 1,9 | 1,3 | Las monedas de las islas hondas compraban todos los edificios en ~2 días (120 M monedas al final). |
| `EXP_BASE` / `EXP_G` | 15 / 1,75 | 30 / 1,35 | Más EXP al principio (la perezosa sube con expediciones), mucha menos en las islas hondas. |
| `NV_SALV_M` | 6 | 4 | Los reclutas llegaban ya al nivel de la isla. |
| `HUERTO_BASE` / `HUERTO_G` | 15 / 1,75 | 3 / 1,4 | Las bayas eran ventaja solo de la voraz. |
| Huerto `g` | 1,18 | 1,3 | |
| Muelle | 600 / 15.000 / 150.000 | 6.000 / 100.000 / 1.000.000 | El 2.º equipo llega a las 16 h, no a las 4 h. |
| Linterna | 150 × 1,15^n | 10.000 × 1,35^n | Se mantiene +3 %/nivel (lo usa la calibración 2 de §4.4); solo se encarece. |
| Taberna | 200 × 1,15^n | 2.000 × 1,32^n | |

`D0`, `P_A`, `P_B` y las curvas no cambian: las calibraciones 1 y 2 de `formulas.test.mjs` siguen pasando.
Goldens regenerados (`UPDATE_GOLDEN=1 node --test test/sim.test.mjs`) porque cambian PV, botín y nivel de salvajes.
Las pruebas que tenían costes y tasas de la spec escritos a mano ahora los leen de `K`.

## Cambios en el modelo del simulador y en el juego

1. **Horario de sesiones:** 08, 12, 16, 20 y 24 h (antes 08-23 h, cada 3,75 h). Con 3,75 h la única patrulla que cabía era
   la de 1 h; ahora caben 4 h de día y 8 h de noche. Opción `--fin-dia 23` recupera el horario anterior.
2. **«Enviar a todos» en el juego** (`game.planSugerido`) hace lo mismo que la perezosa: vuelta si abre isla (jefe sin vencer
   y p ≥ 0,6) o durante la primera hora; si no, patrulla de 4 h de día y 8 h de noche. Antes enviaba una vuelta de
   minutos de día y el equipo se quedaba parado hasta la siguiente sesión.
3. Opción de análisis `--perezosa-evo`: la perezosa acepta el aviso «Puede evolucionar» (un toque por sesión).

## Por qué no llega a 0,6 solo con K (lo tiene que decidir el autor)

Ablaciones (10-12 semillas, 16-20 días):
- **Ninguna constante sola mueve el ritmo por encima de ~0,55.** Se probaron D0 más altos (la perezosa se atasca: sin
  evolucionar no gana poder y la isla 8 pasa a > 16 días), tope de nivel, poder por estrella, poder por nivel, encuentros,
  etapas evolucionadas salvajes antes (`ETAPA2_ISLA`/`ETAPA3_ISLA`), Muelle aún más caro y Linterna 1 %.
- La voraz va limitada por las sesiones (vence una isla por sesión), no por el poder: por eso queda en 3 días y no en 6-10.
- **La palanca decisiva es evolucionar.** Con `--perezosa-evo` y estos mismos K el ritmo sube a ~0,84 (10 semillas),
  y la meseta de la perezosa baja de ~47 h a ~28 h. Con 20 semillas y 30 días: ritmo **0,87**, perezosa isla 8 en 4,1 d, 25 % de la Bitácora en 3,3 d, meseta p50 28 h; cumple los objetivos duros.
- Conseguir 0,6 sin evolucionar exige un juego trivialmente rápido (`PODER_NV` 0,2: isla 8 en 33 h), y no se ha aplicado.

Propuestas (no aplicadas, para el autor):
1. Que «Recoger todo» incluya un botón «Evolucionar a todos» (un toque, sigue sin ser automático, respeta `noEvo`), o que
   la perezosa del simulador acepte ese aviso. Es la opción que cumple el 0,6 con margen.
2. Redefinir el ritmo de la perezosa sin la Bitácora (que depende sobre todo de tener 4 equipos).
3. Rehacer la curva para que la voraz tarde 6-10 días (D0 de 5-8 más altos) junto con 1: sin 1, la perezosa se atasca.

Otros avisos del simulador (no son duros):
- Primer variocolor demasiado pronto en la voraz (4,3 d; objetivo 2-4 semanas): con 4 equipos llega a 400 Pokémon.
- Primera evolución p50 4 h (objetivo ≈ 1 h): con `EXP_G` más bajo tardan más en llegar al nivel.
