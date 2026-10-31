#!/usr/bin/env node
// Descarga estadísticas y clubes de laliga.com y los guarda como JSON en public/data/ (uso personal, no comercial).
//   node scripts/scrape-laliga.mjs                      # todo (1ª y 2ª), 6 páginas por tabla
//   node scripts/scrape-laliga.mjs --only=stats --division=easports --pages=3
//   node scripts/scrape-laliga.mjs --parse-file=pagina.html   # prueba el análisis con un HTML guardado
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/net.mjs';
import { parseClubs, parseStatsPage } from './lib/parse.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const OUT = args.out ?? 'public/data';
const BASE = (args.base ?? 'https://www.laliga.com').replace(/\/+$/, '');   // --base solo sirve para pruebas locales
const DIVISIONS = { easports: { site: 'laliga-easports', dir: 'primera' }, hypermotion: { site: 'laliga-hypermotion', dir: 'segunda' } };
const STATS = ['goleadores', 'asistencias', 'tarjetas-amarillas', 'tarjetas-rojas'];

if (args['parse-file']) {
  const result = parseStatsPage(await readFile(args['parse-file'], 'utf8'));
  console.log(result.reason ?? `${result.rows.length} filas, ${result.pages} páginas`);
  console.table(result.rows.slice(0, 15).map(r => ({ jugador: r.player, equipo: r.teamSlug, valor: r.value })));
  process.exit(result.rows.length ? 0 : 1);
}

const client = createClient({ delayMs: Number(args.delay ?? 2000) });
const maxPages = Number(args.pages ?? 6);
const divisions = args.division && args.division !== 'all' ? [args.division] : Object.keys(DIVISIONS);
const only = args.only;
const save = async (rel, data) => {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 1));
  console.log('  ->', file);
};
const problems = [];

if (!only || only === 'clubs') {
  const all = [];
  for (const key of divisions) {
    const { site } = DIVISIONS[key];
    const url = `${BASE}/${site}/clubes`;
    console.log('Clubes', url);
    try {
      const html = await client.get(url);
      const clubs = parseClubs(html);
      if (!clubs.length) { problems.push(`${url}: sin clubes (HTML guardado en ${await client.saveRaw('clubes-' + key, html)})`); continue; }
      all.push(...clubs.map(c => ({ division: key, ...c })));
    } catch (e) { problems.push(`${url}: ${e.message}`); }
  }
  if (all.length) await save('clubs.json', { source: 'laliga.com', fetchedAt: new Date().toISOString(), clubs: all });
}

if (!only || only === 'stats') {
  for (const key of divisions) {
    const { site, dir } = DIVISIONS[key];
    for (const stat of STATS) {
      const rows = [];
      let pages = 1;
      for (let n = 1; n <= Math.min(pages, maxPages); n++) {
        const url = `${BASE}/estadisticas/${site}/${stat}${n > 1 ? `/pagina/${n}` : ''}`;
        console.log('Estadística', url);
        try {
          const html = await client.get(url);
          const result = parseStatsPage(html);
          if (result.reason) { problems.push(`${url}: ${result.reason} (HTML guardado en ${await client.saveRaw(`${key}-${stat}-${n}`, html)})`); break; }
          rows.push(...result.rows);
          pages = result.pages;
        } catch (e) { problems.push(`${url}: ${e.message}`); break; }
      }
      if (rows.length) await save(`stats/${dir}/${stat}.json`, { source: 'laliga.com', division: dir, stat, fetchedAt: new Date().toISOString(), rows });
    }
  }
}

console.log(problems.length ? `\nTerminado con ${problems.length} problema(s):\n- ${problems.join('\n- ')}` : '\nTerminado sin problemas.');
process.exit(problems.length ? 1 : 0);
