// Sonidos cortos con WebAudio (sin archivos): un «clic» para tocar y un efecto propio para recoger, enviar y recluta.
// Volumen 0 = silencio. El contexto se crea con el primer sonido (siempre tras un toque, como pide iOS). Dueño: UI.
let ac = null;
let volumen = 0.6;

export function ponerVolumen(v) { volumen = Math.max(0, Math.min(1, Number(v) || 0)); }

// Cada efecto: lista de notas [frecuencia Hz, inicio s, duración s, onda, frecuencia final (glissando) opcional].
const EFECTOS = {
  toque: [[660, 0, 0.07, 'square']],
  // Recoger: arpegio que sube (monedas a la bolsa).
  recoger: [[784, 0, 0.07, 'square'], [988, 0.06, 0.07, 'square'], [1319, 0.12, 0.12, 'square']],
  // Enviar: barrido que baja y se aleja (la barca sale del muelle).
  enviar: [[523, 0, 0.16, 'triangle', 330], [392, 0.1, 0.18, 'triangle', 262]],
  // Recluta: fanfarria corta de tres notas.
  recluta: [[659, 0, 0.09, 'square'], [784, 0.09, 0.09, 'square'], [1047, 0.18, 0.2, 'square']],
};

/** Pita un efecto corto. tipo: 'toque' | 'recoger' | 'enviar' | 'recluta'. */
export function sonar(tipo = 'toque') {
  if (!volumen) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended' && ac.resume) ac.resume().catch(() => {});
    const t0 = ac.currentTime + 0.005;
    for (const [f, ini, dur, onda, fin] of EFECTOS[tipo] || EFECTOS.toque) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = onda;
      o.frequency.setValueAtTime(f, t0 + ini);
      if (fin) o.frequency.exponentialRampToValueAtTime(fin, t0 + ini + dur);
      g.gain.setValueAtTime(0.0001, t0 + ini);
      g.gain.exponentialRampToValueAtTime((onda === 'triangle' ? 0.09 : 0.04) * volumen, t0 + ini + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + dur);
      o.connect(g).connect(ac.destination);
      o.start(t0 + ini);
      o.stop(t0 + ini + dur + 0.02);
    }
  } catch { /* sin audio */ }
}
