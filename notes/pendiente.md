# Pendiente para cerrar v0.1 (§19 «Hecho cuando»)

Estado a 18-nov-2026 (integración). Pruebas: `node --test "test/*.test.mjs"` 107/107 (en Node 24 `node --test test/`
con la carpeta falla porque la toma como módulo; `node --test` sin argumentos también recorre test/ui y da 110/110
con el servidor en marcha). `node tools/check.mjs` OK (222 especies).

| Criterio | Estado | Cómo se comprueba |
|---|---|---|
| Se envía, se cierra la pestaña, se vuelve y el informe cuadra | **Cumplido** | `node test/ui/flujo.mjs` (3 tamaños): cierra la página, abre otra con `?reloj=` adelantado, sale «Mientras estabas fuera…» y las monedas cobradas = las del registro de la expedición. |
| Simulador: sin mesetas > 24 h en p50 | **Cumplido** (voraz 19,8 h) | `notes/simulador.md` |
| Simulador: perezosa ≥ 60 % de la voraz | **No cumplido** (0,52) | Necesita decisión de diseño de el autor (ver `notes/simulador.md`: «Evolucionar a todos» da ~0,84). |
| Las 222 especies se animan en la ficha en los 3 tamaños | **Cumplido** | `test/ui/flujo.mjs` monta `scene-ficha` con el tamaño de canvas de la ficha en cada pantalla (336x200, 274x210, 241x170) y comprueba que cambian los frames de Walk/Idle de las 222; además abre 5 fichas reales. |
| Créditos completos | **Cumplido** | `check.mjs` (sprite + retrato con autor para las 222), pantalla Créditos (115 artistas), `NOTICE.md`. |
| el autor lo juega 2-3 días en su móvil en local | **Pendiente** | Prueba manual: `npx -y serve -l 8080 .` y abrir `http://<IP de casa>:8080/` en el móvil. |

## Qué falta (por orden)

1. **Decisión de el autor sobre el ritmo de la perezosa** (único objetivo duro sin cumplir). Opciones en `notes/simulador.md`.
2. **Prueba en el móvil 2-3 días.** Ojo: sin PWA (v0.2) y en iOS el almacenamiento puede borrarse; exportar de vez en cuando.
3. Ritmo fuera de objetivo aunque no sea duro: la voraz vence la isla 8 en ~3 días (objetivo 6-10) y el primer variocolor
   sale a los ~4 días (objetivo 2-4 semanas).
4. ~~Cala: con 30 vecinos o más se amontonan en diagonal (GRÁFICOS).~~ Hecho el 18-nov: la causa era el reparto
   inicial (0,618 + 0,382 = 1 ⇒ antidiagonal); ahora secuencia R2.
5. NÚCLEO: `recruit.anotarDiario` duplica `state.anotarDiario` (hoy iguales).
6. ESTADO: con el Huerto a nivel 0 no entra ninguna baya (correcto según §7.1, pero conviene un aviso en el tutorial).

## Hecho en la integración

- K ajustados con el simulador (tabla en `notes/simulador.md`); goldens regenerados; pruebas leen costes de `K`.
- `game.planSugerido` («Enviar a todos»): patrulla 4 h de día / 8 h de noche salvo para abrir isla o en la primera hora.
- `tools/sim.mjs`: sesiones 08-24 h cada 4 h (`--fin-dia`), opción `--perezosa-evo`.
- `test/ui/flujo.mjs` nuevo (flujo real + 222 especies en la ficha).
- UI: «1 baya esperando» (plural) en Gremio › Faro; la etiqueta «100%» de la Bitácora ya no se sale de la barra.
- `.gitignore`: `tools/node_modules/`, `tools/.cache/` (62 MB) y `test/ui/out/` (las capturas se regeneran).
