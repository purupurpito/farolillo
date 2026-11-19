#!/usr/bin/env node
// Farolillo — datos de especies, tipos e islas a partir de PokeAPI (SPEC §13.2). Dueño: DATOS.
// Uso: node tools/build-data.mjs [--sin-red]   (después de build-assets, que deja tools/.cache/vario.json)
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  RAIZ, CACHE, SPRITE_SHA, POKEAPI_SHA, obtenerCSV, familias, dex4, leerJSON, escribirJSON, volcarFaltas,
} from './comun.mjs';
import { validarDatos, TIPOS } from './check.mjs';

const TIPO_EN = {
  normal: 'normal', fire: 'fuego', water: 'agua', grass: 'planta', electric: 'electrico', ice: 'hielo',
  fighting: 'lucha', poison: 'veneno', ground: 'tierra', flying: 'volador', psychic: 'psiquico', bug: 'bicho',
  rock: 'roca', ghost: 'fantasma', dragon: 'dragon', dark: 'siniestro', steel: 'acero', fairy: 'hada',
};
const OBJETO_EN = {
  'fire-stone': 'piedra_fuego', 'water-stone': 'piedra_agua', 'thunder-stone': 'piedra_trueno',
  'leaf-stone': 'piedra_hoja', 'moon-stone': 'piedra_lunar', 'sun-stone': 'piedra_solar',
  'shiny-stone': 'piedra_dia', 'dusk-stone': 'piedra_ocaso', 'dawn-stone': 'piedra_alba',
  'ice-stone': 'piedra_hielo', 'razor-claw': 'garra_afilada',
};
const EXCLUSIVAS = {
  norte: ['0058', '0027', '0077', '0086'],
  este: ['0228', '0200', '0198', '0215'],
  sur: ['0304', '0353', '0355', '0333'],
  oeste: ['0403', '0418', '0425', '0459'],
};
// Familias forzadas a R (SPEC §6.5: Eevee, Dratini, Larvitar, Bagon, Beldum, Gible; Pikachu por §13.1).
const FAM_RARAS = ['0133', '0147', '0246', '0371', '0374', '0443', '0172'];
const ES = '7', EN = '9';
const PESO_EXTRA = 0.3, PESO_EXTRA_TIPO = 1;

async function main() {
  const lista = await leerJSON(join(RAIZ, 'tools', 'species-list.json'));
  const overrides = await leerJSON(join(RAIZ, 'tools', 'evo-overrides.json'));
  const islasBase = await leerJSON(join(RAIZ, 'tools', 'islas-base.json'));
  const todas = lista.todas.map(dex4);
  const enLista = new Set(todas);
  const errores = [];

  const [sp, nombres, stats, ptipos, tiposCSV, tnombres, efic, evol, items] = await Promise.all([
    'pokemon_species', 'pokemon_species_names', 'pokemon_stats', 'pokemon_types', 'types', 'type_names',
    'type_efficacy', 'pokemon_evolution', 'items',
  ].map(obtenerCSV));
  await volcarFaltas();

  // ---------- tipos ----------
  const tipoId = {};
  for (const r of tiposCSV) if (TIPO_EN[r.identifier]) tipoId[r.id] = TIPO_EN[r.identifier];
  const nombresTipo = {};
  for (const r of tnombres) if (r.local_language_id === ES && tipoId[r.type_id]) nombresTipo[tipoId[r.type_id]] = r.name;
  const ef = Object.fromEntries(TIPOS.map((t) => [t, {}]));
  for (const r of efic) {
    const a = tipoId[r.damage_type_id], d = tipoId[r.target_type_id];
    if (!a || !d) continue;
    const f = +r.damage_factor / 100;
    if (f !== 1) ef[a][d] = f;
  }
  const tipos = { ids: TIPOS, nombres: Object.fromEntries(TIPOS.map((t) => [t, nombresTipo[t]])), ef };

  // ---------- especies ----------
  const spPorId = new Map(sp.map((r) => [dex4(r.id), r]));
  const fam = familias(sp);
  const nombre = {}, nombreEn = {};
  for (const r of nombres) {
    const d = dex4(r.pokemon_species_id);
    if (!enLista.has(d)) continue;
    if (r.local_language_id === ES) nombre[d] = r;
    if (r.local_language_id === EN) nombreEn[d] = r;
  }
  const st = {};
  for (const r of stats) {
    const d = dex4(r.pokemon_id);
    if (!enLista.has(d) || +r.pokemon_id > 10000) continue;
    (st[d] ||= [0, 0, 0, 0, 0, 0])[+r.stat_id - 1] = +r.base_stat;
  }
  const tp = {};
  for (const r of ptipos) {
    const d = dex4(r.pokemon_id);
    if (!enLista.has(d) || +r.pokemon_id > 10000) continue;
    (tp[d] ||= []).push([+r.slot, tipoId[r.type_id]]);
  }
  const itemId = Object.fromEntries(items.map((r) => [r.id, r.identifier]));

  // Evoluciones: fila por defecto, sin formas regionales, versión más antigua.
  const filasEvo = {};
  for (const r of evol) {
    const d = dex4(r.evolved_species_id);
    if (r.is_default !== '1' || r.evolved_pokemon_form_id || r.region_id) continue;
    if (r.required_pokemon_form_id && +r.required_pokemon_form_id > 10000) continue;
    (filasEvo[d] ||= []).push(r);
  }
  const TRIG = { 1: 'level-up', 2: 'trade', 3: 'use-item' };
  function condicion(d) {
    if (overrides[d]) return { ...overrides[d] };
    const filas = (filasEvo[d] || []).sort((a, b) => +a.version_group_id - +b.version_group_id);
    const r = filas[0];
    if (!r) return { error: 'sin fila de evolución' };
    const trig = TRIG[r.evolution_trigger_id];
    const otras = r.location_id || r.known_move_id || r.known_move_type_id || r.held_item_id || r.gender_id ||
      r.party_species_id || r.minimum_affection || r.condition_expression;
    if (otras) return { error: `regla especial sin override (${JSON.stringify(r)})` };
    if (trig === 'trade') return { c: 'intercambio' };
    if (trig === 'use-item') {
      const it = OBJETO_EN[itemId[r.trigger_item_id]];
      if (!it) return { error: `objeto ${itemId[r.trigger_item_id]} sin equivalente` };
      return { c: it.startsWith('piedra_') ? 'piedra' : 'objeto', it };
    }
    if (trig === 'level-up') {
      if (r.minimum_happiness) {
        const c = { c: 'amistad' };
        if (r.time_of_day === 'day') c.momento = 'dia';
        else if (r.time_of_day === 'night') c.momento = 'noche';
        return c;
      }
      if (r.time_of_day) return { error: 'nivel con hora sin override' };
      if (r.minimum_level) return { c: 'nivel', lv: +r.minimum_level };
    }
    return { error: `disparador ${r.evolution_trigger_id} no soportado` };
  }

  const raizLista = (d) => dex4(fam.raiz(+d));
  const especies = {};
  const descartesEvo = [];
  for (const d of todas) {
    const r = spPorId.get(d);
    if (!r) { errores.push(`${d}: no está en pokemon_species.csv`); continue; }
    const nom = nombre[d] || nombreEn[d];
    if (!nombre[d]) errores.push(`${d}: sin nombre en castellano`);
    const s = st[d];
    if (!s || s.some((x) => !x)) errores.push(`${d}: stats incompletos`);
    const t = (tp[d] || []).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const famId = raizLista(d);
    const pre = r.evolves_from_species_id ? dex4(r.evolves_from_species_id) : null;
    const cr = +r.capture_rate;
    const leg = r.is_legendary === '1' || r.is_mythical === '1';
    let rar = leg ? 'L' : cr < 45 ? 'R' : cr < 120 ? 'PC' : 'C';
    const inicial = lista.iniciales.includes(famId);
    if (!leg && (inicial || FAM_RARAS.includes(famId))) rar = 'R';
    let exc = null;
    for (const [faro, bases] of Object.entries(EXCLUSIVAS)) if (bases.includes(famId)) exc = faro;
    especies[d] = {
      n: nom?.name || d, g: nombre[d]?.genus || '', gen: +r.generation_id,
      t, s, tot: s ? s.reduce((a, b) => a + b, 0) : 0, cr, rar, fam: famId, pre, evo: [],
      exc, vario: false, leg,
    };
  }
  // evo[] en la preevolución
  for (const r of sp) {
    if (!r.evolves_from_species_id) continue;
    const a = dex4(r.id), de = dex4(r.evolves_from_species_id);
    if (!especies[de]) continue;
    if (!enLista.has(a)) {
      if (+r.generation_id <= 4) errores.push(`familia incompleta: ${de} evoluciona a ${a} (G${r.generation_id}), que no está en la lista`);
      else descartesEvo.push(`${de}→${a} (G${r.generation_id})`);
      continue;
    }
    const c = condicion(a);
    if (c.error) { errores.push(`evolución ${de}→${a}: ${c.error}`); continue; }
    especies[de].evo.push({ a, ...c });
  }
  for (const e of Object.values(especies)) e.evo.sort((x, y) => x.a.localeCompare(y.a));
  for (const [d, e] of Object.entries(especies)) {
    if (e.pre && !enLista.has(e.pre)) errores.push(`familia incompleta: ${d} viene de ${e.pre}, que no está en la lista`);
  }
  for (const k of Object.keys(overrides)) if (!k.startsWith('_') && !especies[k]?.pre) errores.push(`override ${k}: no es una evolución de la lista`);

  // vario por familia (informe de build-assets)
  const rutaVario = join(CACHE, 'vario.json');
  if (!existsSync(rutaVario)) errores.push('falta tools/.cache/vario.json: ejecuta antes node tools/build-assets.mjs');
  else {
    const vario = await leerJSON(rutaVario);
    const porFam = {};
    for (const [d, e] of Object.entries(especies)) (porFam[e.fam] ||= []).push(d);
    for (const miembros of Object.values(porFam)) {
      const ok = miembros.every((d) => vario[d] === true);
      for (const d of miembros) especies[d].vario = ok;
    }
  }

  // ---------- islas ----------
  const tiposBase = (b) => especies[b]?.t || [];
  const principal = {};
  for (const [clave, bases] of Object.entries(lista.islas)) for (const b of bases) principal[b] = clave;
  const extras = [...lista.iniciales, ...lista.especiales];
  const islas = islasBase.map((ib) => {
    const especiesIsla = lista.islas[ib.clave];
    if (!especiesIsla) errores.push(`isla ${ib.clave}: sin especies en species-list.json`);
    const sec = Object.keys(principal)
      .filter((b) => principal[b] !== ib.clave && tiposBase(b).some((t) => ib.tipos.includes(t)))
      .sort();
    const extra = {};
    for (const b of extras) extra[b] = tiposBase(b).some((t) => ib.tipos.includes(t)) ? PESO_EXTRA_TIPO : PESO_EXTRA;
    const out = { ...ib, especies: especiesIsla || [], sec, pesoSec: 0.5, extra };
    if (ib.id >= 5) out.objetosJefe = { piedra_alba: 0.10, cordon_amistad: 0.03 };
    return out;
  });

  const salida = {
    v: 1, sha: SPRITE_SHA, pokeapi: POKEAPI_SHA,
    especies: Object.fromEntries(Object.entries(especies).sort(([a], [b]) => a.localeCompare(b))),
  };
  if (!errores.length) errores.push(...validarDatos({ especies: salida, islas, tipos }));
  if (errores.length) {
    console.error(`build-data FALLA (${errores.length}):\n  ` + errores.join('\n  '));
    process.exit(1);
  }
  await escribirJSON(join(RAIZ, 'data', 'especies.json'), salida);
  await escribirJSON(join(RAIZ, 'data', 'tipos.json'), tipos);
  await escribirJSON(join(RAIZ, 'data', 'islas.json'), islas);

  const cuenta = (k) => Object.values(especies).reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
  console.log(`Especies: ${Object.keys(especies).length} · rareza ${JSON.stringify(cuenta('rar'))} · vario ${Object.values(especies).filter((e) => e.vario).length}`);
  console.log(`Evoluciones a G5+ omitidas: ${descartesEvo.join(', ') || 'ninguna'}`);
  for (const i of islas) console.log(`  ${i.id} ${i.clave}: ${i.especies.length} bases, ${i.sec.length} secundarias`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
