#!/usr/bin/env node
// Plantillas de LaLiga desde la API de football-data.org (plan gratuito, solo Primera).
// laliga.com carga las plantillas con JavaScript, por eso no se obtienen con un scraper simple.
//   $env:FOOTBALL_DATA_TOKEN="tu_token"; npm run data:squads
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const BASE = process.env.TARGET ?? 'https://api.football-data.org/v4';
const OUT = process.argv[2] ?? 'public/data/plantillas.json';
if (!TOKEN) { console.error('Falta FOOTBALL_DATA_TOKEN'); process.exit(1); }

const res = await fetch(`${BASE}/competitions/PD/teams`, { headers: { 'X-Auth-Token': TOKEN } });
if (!res.ok) { console.error(`football-data.org respondió ${res.status}: ${await res.text()}`); process.exit(1); }
const { teams = [] } = await res.json();
const data = {
  source: 'football-data.org', fetchedAt: new Date().toISOString(),
  teams: teams.map(t => ({
    id: t.id, name: t.name, shortName: t.shortName, tla: t.tla,
    squad: (t.squad ?? []).map(p => ({ id: p.id, name: p.name, position: p.position ?? null, nationality: p.nationality ?? null, dateOfBirth: p.dateOfBirth ?? null }))
  }))
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 1));
const empty = data.teams.filter(t => !t.squad.length).length;
console.log(`${data.teams.length} equipos guardados en ${OUT}` + (empty ? ` (${empty} sin plantilla: puede que tu plan no la incluya)` : ''));
