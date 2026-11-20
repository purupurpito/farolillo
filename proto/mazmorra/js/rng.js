// rng.js — generador con semilla (mulberry32). Todo lo aleatorio de la partida sale de aquí.

export function crearRng(semilla) {
  let a = (semilla >>> 0) || 1;
  const r = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.ent = (min, max) => min + Math.floor(r() * (max - min + 1));   // entero en [min, max]
  r.elegir = (lista) => lista[Math.floor(r() * lista.length)];
  r.barajar = (lista) => {
    for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
    return lista;
  };
  return r;
}

export function semillaNueva() { return (Math.random() * 0xFFFFFFFF) >>> 0; }
