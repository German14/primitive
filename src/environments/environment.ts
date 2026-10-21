
export const environment = {
  // 'rest'         -> tu API de fútbol (solo cambia api.baseUrl). Formato: docs/API-CONTRACT.md
  // 'footballData' -> football-data.org gratis, solo LaLiga (usa proxy.conf.js + FOOTBALL_DATA_TOKEN)
  // 'mock'         -> datos de ejemplo dentro de la app, sin red
  dataSource: 'footballData',

  api: {
    baseUrl: '/api/fd',          // <- AQUÍ pones la URL de tu API
    headers: {} as Record<string, string>,      // p. ej. { 'Authorization': 'Bearer ...' }
    historyLimit: 10
  },

  footballData: {
    baseUrl: 'http://localhost:3001/api/fd',
  token: 'e7ec4bda4d1d4d68ac775e55a35863aa',
  competition: 'PD',
  totalMatches: 15,
  historyMatches: 10,
  minGapMs: 6500,
  cacheHours: 6
  },

  // Corrupción / economía: -1..1 por id de equipo. Manual, sin fuente pública fiable.
  manualFactors: {} as Record<number, { corruption: number; economic: number }>
};