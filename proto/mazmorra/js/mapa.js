// mapa.js — piso de casillas: salas en una rejilla 3x3 unidas por pasillos en L.
// celdas: 0 pared, 1 suelo. sala: índice de sala o -1 (pasillo / pared).

export const W = 36, H = 28;   // pisos compactos: menos paseo, más encuentros
const COLS = 3, FILAS = 3;

/** Las 8 direcciones (0 abajo, 1 abajo-dcha, 2 dcha, 3 arriba-dcha, 4 arriba, 5 arriba-izq, 6 izq, 7 abajo-izq). */
export const DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
export function dirDe(dx, dy) {
  const sx = Math.sign(dx), sy = Math.sign(dy);
  return DIRS.findIndex(([a, b]) => a === sx && b === sy);
}

export function generarPiso(rng, ultimo) {
  const celdas = new Uint8Array(W * H);
  const sala = new Int16Array(W * H).fill(-1);
  const cw = Math.floor((W - 2) / COLS), ch = Math.floor((H - 2) / FILAS);
  const nodos = [];   // uno por celda de la rejilla: sala o cruce
  const salas = [];
  // Qué celdas llevan sala: al menos 6 de 9.
  const conSala = rng.barajar([...Array(9).keys()]).slice(0, rng.ent(6, 8));
  for (let gy = 0; gy < FILAS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const g = gy * COLS + gx;
      const ox = 1 + gx * cw, oy = 1 + gy * ch;
      if (conSala.includes(g)) {
        const w = rng.ent(4, cw - 4), h = rng.ent(4, ch - 3);
        const x = ox + rng.ent(1, cw - w - 2), y = oy + rng.ent(1, ch - h - 2);
        const id = salas.length;
        salas.push({ x, y, w, h, id });
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { celdas[j * W + i] = 1; sala[j * W + i] = id; }
        nodos.push({ g, gx, gy, sala: id, x: x + (w >> 1), y: y + (h >> 1) });
      } else {
        const x = ox + rng.ent(2, cw - 3), y = oy + rng.ent(2, ch - 3);
        celdas[y * W + x] = 1;
        nodos.push({ g, gx, gy, sala: -1, x, y });
      }
    }
  }
  // Árbol aleatorio sobre la rejilla (DFS) + 2 uniones extra para que haya vueltas.
  const vec = (n) => nodos.filter(m => Math.abs(m.gx - n.gx) + Math.abs(m.gy - n.gy) === 1);
  const vistos = new Set([0]);
  const pila = [nodos[0]];
  const uniones = [];
  while (pila.length) {
    const n = pila[pila.length - 1];
    const libres = vec(n).filter(m => !vistos.has(m.g));
    if (!libres.length) { pila.pop(); continue; }
    const m = rng.elegir(libres);
    vistos.add(m.g); uniones.push([n, m]); pila.push(m);
  }
  for (let k = 0; k < 2; k++) {
    const n = rng.elegir(nodos), m = rng.elegir(vec(n));
    if (m && !uniones.some(([a, b]) => (a === n && b === m) || (a === m && b === n))) uniones.push([n, m]);
  }
  const puntoEn = (n) => {
    if (n.sala < 0) return { x: n.x, y: n.y };
    const s = salas[n.sala];
    return { x: rng.ent(s.x + 1, s.x + s.w - 2), y: rng.ent(s.y + 1, s.y + s.h - 2) };
  };
  const cavar = (x, y) => { celdas[y * W + x] = 1; };
  for (const [a, b] of uniones) {
    const p = puntoEn(a), q = puntoEn(b);
    if (rng() < 0.5) {
      for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++) cavar(x, p.y);
      for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) cavar(q.x, y);
    } else {
      for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) cavar(p.x, y);
      for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++) cavar(x, q.y);
    }
  }
  // Distancias por pasos desde la sala de inicio para colocar la escalera / el jefe lejos.
  const inicioSala = rng.elegir(salas);
  const dist = distancias(celdas, [{ x: inicioSala.x + (inicioSala.w >> 1), y: inicioSala.y + (inicioSala.h >> 1) }]);
  const lejanas = salas.filter(s => s !== inicioSala)
    .map(s => ({ s, d: dist[(s.y + (s.h >> 1)) * W + s.x + (s.w >> 1)] }))
    .sort((a, b) => b.d - a.d);
  const destino = (ultimo ? lejanas[0] : rng.elegir(lejanas.slice(0, 2))).s;
  const centro = (s) => ({ x: s.x + (s.w >> 1), y: s.y + (s.h >> 1) });
  const inicio = { x: rng.ent(inicioSala.x + 1, inicioSala.x + inicioSala.w - 2), y: rng.ent(inicioSala.y + 1, inicioSala.y + inicioSala.h - 2) };
  return {
    W, H, celdas, sala, salas,
    inicio, inicioSala: inicioSala.id,
    escalera: ultimo ? null : { x: rng.ent(destino.x, destino.x + destino.w - 1), y: rng.ent(destino.y, destino.y + destino.h - 1) },
    jefeSala: ultimo ? destino.id : -1,
    jefePos: ultimo ? centro(destino) : null,
  };
}

export function libre(m, x, y) { return x >= 0 && y >= 0 && x < W && y < H && m.celdas[y * W + x] === 1; }

/** ¿Se puede ir de (x,y) en la dirección d? En diagonal no se cortan esquinas de pared. */
export function puedePasar(m, x, y, d) {
  const [dx, dy] = DIRS[d];
  if (!libre(m, x + dx, y + dy)) return false;
  if (dx && dy && (!libre(m, x + dx, y) || !libre(m, x, y + dy))) return false;
  return true;
}

/** Mapa de distancias (pasos en 8 direcciones, sin cortar esquinas) desde varios orígenes. */
export function distancias(celdas, origenes, bloqueo = null) {
  const m = { celdas };
  const d = new Int16Array(W * H).fill(-1);
  const cola = new Int32Array(W * H);
  let ini = 0, fin = 0;
  for (const o of origenes) { const i = o.y * W + o.x; if (d[i] < 0) { d[i] = 0; cola[fin++] = i; } }
  while (ini < fin) {
    const i = cola[ini++];
    const x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      if (!puedePasar(m, x, y, k)) continue;
      const j = (y + DIRS[k][1]) * W + x + DIRS[k][0];
      if (d[j] >= 0 || (bloqueo && bloqueo[j])) continue;
      d[j] = d[i] + 1; cola[fin++] = j;
    }
  }
  return d;
}
