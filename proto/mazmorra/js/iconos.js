// iconos.js — iconos de objetos en pixel-art (12x12), dibujados por código.

const PAL = { k: '#1b1b1f', b: '#3f7fe0', c: '#8fc2ff', w: '#e8f3ff', g: '#3f9b3a', l: '#7fd36a', m: '#7a4e2a', n: '#b07a45', y: '#ffe066', o: '#d9a43a' };
const DIBUJOS = {
  baya: [
    '.....gg.....',
    '....gllg....',
    '.....kk.....',
    '...kkbbkk...',
    '..kbccbbbk..',
    '.kbcwcbbbbk.',
    '.kbccbbbbbk.',
    '.kbbbbbbbbk.',
    '.kbbbbbbbbk.',
    '..kbbbbbbk..',
    '...kkbbkk...',
    '.....kk.....',
  ],
  semilla: [
    '............',
    '.....kk.....',
    '....knnk....',
    '...knnnmk...',
    '..knnynmmk..',
    '..knyyymmk..',
    '..knnynmmk..',
    '..knnnmmmk..',
    '...knnmmk...',
    '....kmmk....',
    '.....kk.....',
    '............',
  ],
};

export function dibujarIcono(ctx, clave, x, y, esc = 1) {
  const d = DIBUJOS[clave];
  if (!d) return;
  for (let j = 0; j < 12; j++) {
    const fila = d[j];
    for (let i = 0; i < 12; i++) {
      const c = fila[i];
      if (c === '.') continue;
      ctx.fillStyle = PAL[c];
      ctx.fillRect(x + i * esc, y + j * esc, esc, esc);
    }
  }
}

const cacheUrl = {};
/** Icono como data URL (para botones), ampliado ×esc sin suavizado. */
export function urlIcono(clave, esc = 3) {
  const k = clave + esc;
  if (cacheUrl[k]) return cacheUrl[k];
  const c = document.createElement('canvas');
  c.width = c.height = 12 * esc;
  dibujarIcono(c.getContext('2d'), clave, 0, 0, esc);
  return (cacheUrl[k] = c.toDataURL());
}
