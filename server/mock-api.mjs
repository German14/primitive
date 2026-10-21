// API de fútbol de ejemplo que cumple docs/API-CONTRACT.md. Sirve para probar la app sin tu API real.
//   npm run mock-api   ->  http://localhost:3000
import http from 'node:http';

const PORT = process.env.PORT || 3000;
const names = ['Real Madrid','Barcelona','Atlético','Sevilla','Betis','Valencia','Athletic','Real Sociedad','Villarreal','Girona','Osasuna','Celta','Getafe','Mallorca','Rayo','Alavés','Espanyol','Levante','Elche','Oviedo'];
const refs = ['Gil Manzano','Munuera Montero','Sánchez Martínez','Hernández Hernández','Martínez Munuera','Soto Grado','Cuadra Fernández'];
const pairs = [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],[1,3],[0,2],[5,7],[9,11],[4,6]];

function quiniela(date) {
  const day0 = Date.parse(`${date}T12:00:00Z`);
  return {
    jornada: `Jornada ${date}`, date,
    matches: pairs.map(([h, a], i) => ({
      id: 1000 + i, position: i + 1,
      home: { id: h + 1, name: names[h] }, away: { id: a + 1, name: names[a] },
      kickoff: new Date(day0 + (i < 8 ? i * 1.5 : 24 + (i - 8) * 1.5) * 3600_000).toISOString(),
      referee: refs[i % refs.length], city: names[h], stadium: `Estadio ${names[h]}`, league: 'LaLiga'
    }))
  };
}
function history(teamId, limit) {
  let s = (teamId + 1) * 9301;
  const rnd = () => (s = (s * 49297 + 233280) % 233280) / 233280;
  const strength = 0.7 + (((teamId - 1) * 7) % 10) / 10;
  return { teamId, matches: Array.from({ length: limit }, (_, i) => ({
    date: new Date(Date.now() - (i + 1) * 7 * 86400_000).toISOString().slice(0, 10), home: i % 2 === 0,
    goalsFor: Math.round(rnd() * 2 * strength + (i % 2 === 0 ? 0.4 : 0)), goalsAgainst: Math.round(rnd() * 2.2 / strength) })) };
}
function refStats(name) {
  const k = name.length;
  return { referee: name, matches: 100 + k * 5, avgYellow: 4 + (k % 3) * 0.6, avgRed: 0.15 + (k % 4) * 0.05,
    penaltiesPerMatch: 0.25 + (k % 3) * 0.08, homeWinPct: 0.42 + (k % 5) * 0.03 };
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  let m;
  if (url.pathname === '/health') return send(200, { ok: true });
  if (url.pathname === '/quiniela') {
    const date = url.searchParams.get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return send(400, { error: 'date=YYYY-MM-DD requerido' });
    return send(200, quiniela(date));
  }
  if ((m = url.pathname.match(/^\/teams\/(\d+)\/history$/)))
    return send(200, history(Number(m[1]), Math.min(Number(url.searchParams.get('limit')) || 10, 38)));
  if ((m = url.pathname.match(/^\/referees\/([^/]+)\/stats$/))) return send(200, refStats(decodeURIComponent(m[1])));
  send(404, { error: 'no encontrado' });
}).listen(PORT, () => console.log(`API de ejemplo en http://localhost:${PORT}`));