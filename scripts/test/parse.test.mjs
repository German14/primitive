import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClubs, parseStatsPage } from '../lib/parse.mjs';
import { isAllowed, parseRobots } from '../lib/net.mjs';

// HTML de EJEMPLO con la misma forma que muestra la web (dos tablas: NOMBRE y EQUIPO | métricas).
// Ojo: es una reconstrucción mía, no una copia de la página real.
const statsHtml = `<html><body>
<table><thead><tr><th>NOMBRE</th></tr></thead><tbody>
 <tr><td><a href="/es-BR/jugador/raphinha">Raphinha</a></td></tr>
 <tr><td><a href="/es-BR/jugador/kylian-mbappe-lottin">Mbappé</a></td></tr>
 <tr><td><a href="/es-BR/jugador/lamine-yamal">Lamine Yamal</a></td></tr></tbody></table>
<table><thead><tr><th>EQUIPO</th><th>GAF</th><th>PJ</th><th>GPP</th></tr></thead><tbody>
 <tr><td><a href="/es-BR/clubes/fc-barcelona/estadisticas">BAR</a></td><td>13</td><td>9</td><td>1.44</td></tr>
 <tr><td><a href="/es-BR/clubes/real-madrid/estadisticas">RMA</a></td><td>11</td><td>10</td><td>1,10</td></tr>
 <tr><td><a href="/es-BR/clubes/fc-barcelona/estadisticas">BAR</a></td><td>8</td><td>10</td><td>0.80</td></tr></tbody></table>
<a href="/es-BR/estadisticas/laliga-easports/goleadores/pagina/2">2</a><a href="/es-BR/estadisticas/laliga-easports/goleadores/pagina/30">30</a>
</body></html>`;

test('estadísticas: une jugador, equipo y métricas por fila', () => {
  const { rows, pages } = parseStatsPage(statsHtml);
  assert.equal(pages, 30);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { player: 'Raphinha', playerSlug: 'raphinha', teamCode: 'BAR', teamSlug: 'fc-barcelona', value: 13, metrics: { gaf: 13, pj: 9, gpp: 1.44 } });
  assert.equal(rows[1].metrics.gpp, 1.1);              // coma decimal
  assert.equal(rows[1].playerSlug, 'kylian-mbappe-lottin');
});

test('estadísticas: avisa si falta una tabla o no cuadran las filas', () => {
  assert.match(parseStatsPage('<html><body><p>nada</p></body></html>').reason, /no se encontraron/);
  const roto = statsHtml.replace(/<tr><td><a href="\/es-BR\/clubes\/fc-barcelona\/estadisticas">BAR<\/a><\/td><td>8<\/td>.*?<\/tr>/, '');
  assert.match(parseStatsPage(roto).reason, /no coinciden/);
});

test('clubes: extrae slug, nombre y fundación', () => {
  const html = `<a href="https://www.laliga.com/clubes/athletic-club/plantilla">Athletic Club Fundación 1898 Ver ficha del club</a>
    <a href="https://www.laliga.com/clubes/rc-celta/plantilla">Celta Fundación 1923 Ver ficha del club</a>
    <a href="https://www.laliga.com/clubes/rc-celta/plantilla">Celta repetido</a><a href="/otra">x</a>`;
  assert.deepEqual(parseClubs(html), [{ slug: 'athletic-club', name: 'Athletic Club', founded: 1898 }, { slug: 'rc-celta', name: 'Celta', founded: 1923 }]);
});

test('robots.txt: respeta Disallow, Allow más específico y comodines', () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /privado\nAllow: /privado/publico\nDisallow: /*.json$\n# comentario`);
  assert.equal(isAllowed(rules, '/estadisticas/laliga-easports/goleadores'), true);
  assert.equal(isAllowed(rules, '/privado/cuenta'), false);
  assert.equal(isAllowed(rules, '/privado/publico/x'), true);
  assert.equal(isAllowed(rules, '/datos.json'), false);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), '/lo-que-sea'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /'), '/lo-que-sea'), false);
});
