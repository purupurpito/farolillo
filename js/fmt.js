// Formatos de números, horas y tiempos (§9.1). Dueño: UI.

const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dec = (n) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',').replace(',0', '');

/** 950 · 3.210 · 12,4K · 3,4M · 5,6MM */
export function num(n) {
  n = Number(n) || 0;
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 10_000) return s + miles(a);
  if (a < 1e6) return s + dec(a / 1e3) + 'K';
  if (a < 1e9) return s + dec(a / 1e6) + 'M';
  return s + dec(a / 1e9) + 'MM';
}

/** Corto para la barra en móvil: 950 · 3,2K · 31,6K · 1,5M · 2,1MM (siempre ≤ 5 caracteres más el signo). */
export function corto(n) {
  n = Number(n) || 0;
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 1000) return s + Math.round(a);
  // Sin «999,95K» → «1000K»: si al redondear llega a 1000, sube de unidad.
  const unidades = [[1e3, 'K'], [1e6, 'M'], [1e9, 'MM']];
  for (let i = 0; i < unidades.length; i++) {
    const [u, l] = unidades[i];
    const v = Math.round(a / u * 10) / 10;
    if (v < 1000 || i === unidades.length - 1) return s + dec(v) + l;
  }
  return s + miles(a);
}

/** Entero con puntos de miles, sin abreviar: 31.600 (para title y lectores de pantalla). */
export function entero(n) {
  n = Number(n) || 0;
  return (n < 0 ? '-' : '') + miles(Math.abs(n));
}

/** Número con decimales cortos: 1,2 */
export function d1(n) { return dec(Number(n) || 0); }

/** Porcentaje entero: 71 % */
export function pct(p) { return Math.round((Number(p) || 0) * 100) + ' %'; }

const dos = (n) => String(n).padStart(2, '0');

/** «14:32» en hora local. */
export function hora(ms) { const d = new Date(ms); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; }

/** «18-nov» */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(ms) { const d = new Date(ms); return `${d.getDate()}-${MESES[d.getMonth()]}`; }

/** Duración: «45 s», «12 min», «1 h 20 min», «2 d 3 h». */
export function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 48) return mm ? `${h} h ${mm} min` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}

/** Cuenta atrás compacta: «0:45», «12:05», «1:02:03». */
export function cuenta(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${dos(m)}:${dos(x)}` : `${m}:${dos(x)}`;
}

/** «hace 2 h», «hace un momento». */
export function hace(ms, ahora = Date.now()) {
  const d = ahora - ms;
  if (d < 60_000) return 'hace un momento';
  return 'hace ' + dur(d);
}

/** Plantilla «Hola {n}» con un objeto de variables. */
export function plantilla(txt, vars = {}) {
  return String(txt || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

/** «1 baya», «3 bayas», «1.200 bayas» (número con formato + singular o plural). */
export function plural(n, uno, varios) {
  const v = Number(n) || 0;
  return `${num(v)} ${Math.abs(v) === 1 ? uno : varios}`;
}
