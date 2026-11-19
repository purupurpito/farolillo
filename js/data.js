// Carga y cachea data/*.json. Dueño: ESTADO.
// Datos = { especies, islas, tipos, textos, meta, islaPorId }
//   especies: mapa dex4 -> especie (§3.2; se desenvuelve el campo "especies" del archivo)
//   islas:    array de §3.3 ordenado por id
//   tipos:    §3.4 tal cual
//   textos:   §3.5 (si falta el archivo, {} y la UI usa sus respaldos)
//   meta:     { v, sha } de especies.json
//   islaPorId: mapa id -> isla (1..8)

const ARCHIVOS = ['especies', 'islas', 'tipos', 'textos'];
let cache = null;

/** Normaliza los JSON crudos al formato Datos. Sirve también para pruebas. */
export function prepararDatos({ especies, islas, tipos, textos }) {
  const mapa = especies && especies.especies ? especies.especies : (especies || {});
  const lista = [...(islas || [])].sort((a, b) => a.id - b.id);
  const islaPorId = {};
  for (const i of lista) islaPorId[i.id] = i;
  return {
    especies: mapa,
    islas: lista,
    tipos: tipos || { ids: [], nombres: {}, ef: {} },
    textos: textos || {},
    meta: { v: especies?.v ?? 1, sha: especies?.sha ?? '' },
    islaPorId,
  };
}

/** Navegador: lee base + 'data/<archivo>.json'. Cachea el resultado. */
export async function cargarDatos(base = './', { fetch: f = globalThis.fetch } = {}) {
  if (cache) return cache;
  const leer = async (n, opcional) => {
    const r = await f(`${base}data/${n}.json`);
    if (!r.ok) {
      if (opcional) return null;
      throw new Error(`No se pudo cargar data/${n}.json (${r.status})`);
    }
    return r.json();
  };
  const [especies, islas, tipos, textos] = await Promise.all(
    ARCHIVOS.map((n) => leer(n, n === 'textos')),
  );
  cache = prepararDatos({ especies, islas, tipos, textos });
  return cache;
}

/** Node: lee <dir>/<archivo>.json (dir = carpeta data/). */
export async function cargarDatosNode(dir) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const leer = async (n, opcional) => {
    try {
      return JSON.parse(await fs.readFile(path.join(dir, `${n}.json`), 'utf8'));
    } catch (e) {
      if (opcional) return null;
      throw e;
    }
  };
  const [especies, islas, tipos, textos] = await Promise.all(
    ARCHIVOS.map((n) => leer(n, n === 'textos')),
  );
  return prepararDatos({ especies, islas, tipos, textos });
}

/** Olvida la caché (pruebas o recarga de datos). */
export function olvidarDatos() { cache = null; }
