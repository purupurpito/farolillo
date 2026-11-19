// scene-ficha.js — dueño: GRÁFICOS. Visor de animaciones de la ficha (SPEC §9.2.9).
//
// crear(canvas, opciones) → Escena { actualizar, iniciar, parar, destruir, alTocar, render,
//                                    animaciones(), cambiarAnim(±1), girar() }
// estado = { sp, vr, anim, dir?, silueta? }
// Por defecto escala ×3 (como pide la maqueta); con poco alto baja a ×2.
// Tocar el canvas gira la dirección (abajo → derecha → izquierda) y avisa con
// { tipo: "ficha", dir, anim }. La UI pone los botones ◀ anim ▶ y llama a cambiarAnim.

import * as S from './sprites.js';
import { tono } from './tiles.js';

const DIRS = [0, 2, 6];

export function crear(canvas, opciones = {}) {
  let estado = { sp: null, vr: false, anim: 'Idle', dir: 0, silueta: false };
  let t0 = 0;

  const impl = {
    escalaCss() {
      const r = canvas.getBoundingClientRect();
      // Escala estable por especie: la mayor que deja ver el frame más alto de todas sus
      // animaciones (×3 como máximo, §10). Así no salta al cambiar de animación.
      let fh = 40, fw = 40;
      if (estado.sp) for (const a of S.animaciones(estado.sp, estado.vr)) {
        const m = S.medidas(estado.sp, a, estado.vr);
        if (m) { fh = Math.max(fh, m.fh * 0.8); fw = Math.max(fw, m.fw); }
      }
      for (const e of [3, 2]) if (r.height >= fh * e && r.width >= fw * e) return e;
      return 1;
    },
    medir() {},
    paso(t) {
      if (!estado.sp) return 'vacío';
      return S.indiceFrame(estado.sp, estado.anim, estado.vr, t - t0) + '|' + estado.dir + estado.anim;
    },
    pintar(ctx, dim, t) {
      const { w, h } = dim;
      ctx.fillStyle = opciones.fondo || '#1f3a5f';
      ctx.fillRect(0, 0, w + 1, h + 1);
      // Suelo con una retícula suave para ver el anclaje.
      const suelo = Math.round(h * 0.78);
      ctx.fillStyle = tono(opciones.fondo || '#1f3a5f', 0.08);
      ctx.fillRect(0, suelo, w + 1, h - suelo + 1);
      if (!estado.sp) return;
      S.dibujar(ctx, { sp: estado.sp, vr: estado.vr, anim: estado.anim, dir: estado.dir, tMs: t - t0, x: Math.round(w / 2), y: suelo, silueta: estado.silueta });
    },
    tocar() {
      girar();
      return { tipo: 'ficha', dir: estado.dir, anim: estado.anim };
    },
  };
  const motor = S.motorEscena(canvas, opciones, impl);
  const escena = motor.escena;

  function girar() {
    estado.dir = DIRS[(DIRS.indexOf(estado.dir) + 1) % DIRS.length];
    motor.marcarSucio();
  }

  escena.actualizar = function (nuevo = {}) {
    const antes = estado;
    estado = { ...estado, ...nuevo };
    if (estado.sp) {
      const real = S.animConRespaldo(estado.sp, estado.anim || 'Idle', estado.vr);
      estado.anim = real || 'Idle';
      if (antes.sp !== estado.sp || antes.vr !== estado.vr || antes.anim !== estado.anim) {
        t0 = performance.now();
        S.precargar(estado.sp, [estado.anim], estado.vr);
      }
      if (antes.sp !== estado.sp || antes.vr !== estado.vr) motor.remedir();   // la escala depende de la especie
    }
    motor.marcarSucio();
  };

  /** Animaciones que tiene la especie (en orden de visor). */
  escena.animaciones = () => (estado.sp ? S.animaciones(estado.sp, estado.vr) : []);

  /** Pasa a la animación siguiente (+1) o anterior (-1). Devuelve su nombre. */
  escena.cambiarAnim = function (paso = 1) {
    const l = escena.animaciones();
    if (!l.length) return null;
    const i = (l.indexOf(estado.anim) + paso + l.length) % l.length;
    escena.actualizar({ anim: l[i] });
    return l[i];
  };
  escena.girar = girar;
  escena.estado = () => ({ ...estado });

  if (opciones.estado) escena.actualizar(opciones.estado);
  return escena;
}

export function montar(canvas, opts = {}) { const e = crear(canvas, opts); e.iniciar(); return e; }
