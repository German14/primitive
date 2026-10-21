// Proxy mínimo hacia football-data.org (añade tu token y CORS). No depende de Angular.
//   $env:FOOTBALL_DATA_TOKEN="tu_token"; npm run fd-proxy   ->  http://localhost:3001/api/fd/...
import http from 'node:http';

const PORT = process.env.PORT || 3001;
const TARGET = process.env.TARGET || 'https://api.football-data.org/v4';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';
if (!TOKEN) console.warn('AVISO: FOOTBALL_DATA_TOKEN no está definido; la API responderá con error de permisos.');

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const m = req.url.match(/^\/api\/fd(\/.*)?$/);
  if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"usa /api/fd/..."}'); }
  try {
    const r = await fetch(TARGET + (m[1] ?? ''), { headers: { 'X-Auth-Token': TOKEN } });
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(await r.arrayBuffer()));
    console.log(r.status, req.url);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No se pudo contactar con football-data.org', detail: String(e) }));
  }
}).listen(PORT, () => console.log(`Proxy en http://localhost:${PORT}/api/fd  ->  ${TARGET}`));