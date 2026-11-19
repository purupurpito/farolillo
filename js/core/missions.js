// Misiones diarias y semanal (§8.1). Llegan en v0.2: en v0.1 son stubs sin efecto. Dueño: ESTADO.

/** Renueva misiones a las 06:00 (v0.2). v0.1: no hace nada. */
export function renovar(_save, _ahora, _rng) { return false; }

/**
 * Notifica una acción (expedicion|recluta|nivel|toque|jefe|evolucion|patrullaNoche|objeto|
 * visitante|audaz|monedas|bayas|ventaja|fusion|misterio). v0.1: no hace nada.
 */
export function progreso(_save, _accion, _datos) { return []; }

/** Misiones listas para cobrar (v0.2). v0.1: ninguna. */
export function cobrables(_save) { return []; }
