import * as cheerio from 'cheerio';

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const toNumber = s => {
  const n = Number(clean(s).replace('%', '').replace(',', '.'));
  return clean(s) !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Páginas de estadísticas de LaLiga: dos tablas paralelas.
 *   tabla 1: "NOMBRE"  -> un enlace /jugador/{slug} por fila
 *   tabla 2: "EQUIPO | MÉTRICAS..." -> enlace /clubes/{slug}/... y números
 * Se unen por posición de fila. Devuelve { rows, pages, reason? }.
 */
export function parseStatsPage(html) {
  const $ = cheerio.load(html);
  let namesT, statsT;
  $('table').each((_, t) => {
    const first = clean($(t).find('th').first().text()).toUpperCase();
    if (first === 'NOMBRE' && !namesT) namesT = t;
    else if (first === 'EQUIPO' && !statsT) statsT = t;
  });
  const pages = Math.max(1, ...$('a[href*="/pagina/"]').map((_, a) => Number(($(a).attr('href').match(/\/pagina\/(\d+)/) ?? [])[1] ?? 1)).get());
  if (!namesT || !statsT) return { rows: [], pages, reason: 'no se encontraron las tablas NOMBRE y EQUIPO' };

  const dataRows = t => $(t).find('tr').filter((_, tr) => $(tr).find('td').length > 0).toArray();
  const names = dataRows(namesT), stats = dataRows(statsT);
  if (names.length !== stats.length) return { rows: [], pages, reason: `las tablas no coinciden (${names.length} nombres, ${stats.length} filas)` };
  const headers = $(statsT).find('th').map((_, th) => clean($(th).text()).toLowerCase()).get();

  const rows = names.map((tr, i) => {
    const a = $(tr).find('a').first();
    const sRow = $(stats[i]);
    const teamLink = sRow.find('a').first();
    const cells = sRow.find('td').map((_, td) => clean($(td).text())).get();
    const metrics = {};
    headers.slice(1).forEach((h, k) => { const n = toNumber(cells[k + 1]); if (h && n !== null) metrics[h] = n; });
    return {
      player: clean(a.text() || $(tr).text()),
      playerSlug: (a.attr('href')?.match(/\/jugador\/([^/?#]+)/) ?? [])[1] ?? null,
      teamCode: clean(teamLink.text() || cells[0]),
      teamSlug: (teamLink.attr('href')?.match(/\/clubes\/([^/?#]+)/) ?? [])[1] ?? null,
      value: Object.values(metrics)[0] ?? null,   // primera métrica (goles, asistencias, tarjetas...)
      metrics
    };
  });
  return { rows, pages };
}

/** Lista de clubes: enlaces /clubes/{slug}/plantilla con texto "Nombre Fundación 1898 Ver ficha del club". */
export function parseClubs(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const clubs = [];
  $('a[href*="/clubes/"][href$="/plantilla"]').each((_, a) => {
    const slug = ($(a).attr('href').match(/\/clubes\/([^/]+)\/plantilla/) ?? [])[1];
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    const text = clean($(a).text());
    const name = clean(text.split(/Fundaci[oó]n/i)[0]) || slug;
    const founded = Number((text.match(/Fundaci[oó]n\s+(\d{4})/i) ?? [])[1]) || null;
    clubs.push({ slug, name, founded });
  });
  return clubs;
}
