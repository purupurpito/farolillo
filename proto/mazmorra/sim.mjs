// sim.mjs — simula partidas con el bot (juego.sugerir) para medir el equilibrio por líder.
// Uso: node proto/mazmorra/sim.mjs [partidas por líder=150]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './js/juego.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (p) => JSON.parse(readFileSync(join(RAIZ, p), 'utf8'));
const esp = leer('data/especies.json'), tipos = leer('data/tipos.json'), man = leer('assets/manifest.json');
const datos = { especies: esp.especies, ef: tipos.ef, nombresTipo: tipos.nombres, enManifest: new Set(Object.keys(man.esp)) };
const N = Number(process.argv[2] || 150);
let total = 0;
for (const sp of J.INICIALES) {
  let gan = 0, turnos = 0, andar = 0, comb = 0, bayasFin = 0, muertesP1 = 0, peligro = 0;
  for (let i = 0; i < N; i++) {
    const P = J.crearPartida({ semilla: 1000 + i * 7919, lider: sp, datos });
    let k = 0;
    while (!P.fin && k++ < 3000) {
      const a = J.sugerir(P);
      if (a.tipo === 'andar') andar++; else if (a.tipo === 'mov') comb++;
      J.jugar(P, a);
      if (P.ev.some(e => e.t === 'carga')) peligro++;
    }
    if (P.fin && P.fin.victoria) gan++; else if (P.piso === 1) muertesP1++;
    turnos += P.turno; bayasFin += P.bolsa.baya;
  }
  total += gan;
  console.log(`${datos.especies[sp].n.padEnd(11)} victorias ${(gan / N * 100).toFixed(0).padStart(3)} %  muere en piso 1: ${muertesP1}  turnos ${(turnos / N).toFixed(0)}  andar ${(andar / (andar + comb) * 100).toFixed(0)} %  combate/partida ${(comb / N).toFixed(0)}  bayas al final ${(bayasFin / N).toFixed(1)}  cargas del jefe ${(peligro / N).toFixed(1)}`);
}
console.log(`media ${(total / N / J.INICIALES.length * 100).toFixed(0)} %`);
