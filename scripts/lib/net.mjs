// Cliente HTTP educado para uso PERSONAL: identifica el programa, espacia las peticiones,
// reintenta con pausa y RESPETA robots.txt (si una ruta está prohibida, no se descarga).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const UA = 'primitive-personal/1.0 (uso personal, no comercial)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Reglas de robots.txt aplicables a nuestro agente (o a "*"). */
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line || !line.includes(':')) continue;
    const i = line.indexOf(':');
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ type: key, path: val });
  }
  const mine = groups.find(g => g.agents.some(a => a !== '*' && UA.toLowerCase().includes(a)));
  return (mine ?? groups.find(g => g.agents.includes('*')))?.rules ?? [];
}

const toRegExp = p => {
  const end = p.endsWith('$');
  const body = (end ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\*]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp('^' + body + (end ? '$' : ''));
};

/** Gana la regla más específica (más larga); en empate, Allow. */
export function isAllowed(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue; // "Disallow:" vacío = todo permitido
    if (toRegExp(r.path).test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow'))) best = r;
  }
  return !best || best.type === 'allow';
}

export function createClient({ delayMs = 2000, rawDir = 'scripts/.raw' } = {}) {
  let last = 0;
  const robotsByOrigin = new Map();

  async function rulesFor(origin) {
    if (!robotsByOrigin.has(origin)) {
      try {
        const res = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': UA } });
        robotsByOrigin.set(origin, res.ok ? parseRobots(await res.text()) : []);
      } catch { robotsByOrigin.set(origin, []); }
    }
    return robotsByOrigin.get(origin);
  }

  async function get(url) {
    const u = new URL(url);
    if (!isAllowed(await rulesFor(u.origin), u.pathname)) throw new Error(`robots.txt de ${u.origin} no permite ${u.pathname}: se omite`);
    const wait = Math.max(0, last + delayMs - Date.now());
    if (wait) await sleep(wait);
    last = Date.now();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * attempt); continue; }
      throw new Error(`HTTP ${res.status} en ${url}`);
    }
    throw new Error(`Demasiados reintentos en ${url}`);
  }

  /** Guarda el HTML crudo para poder depurar si el análisis no encuentra datos. */
  async function saveRaw(name, html) {
    await mkdir(rawDir, { recursive: true });
    const file = path.join(rawDir, name.replace(/[^\w.-]+/g, '_') + '.html');
    await writeFile(file, html);
    return file;
  }
  return { get, saveRaw };
}
