
export const environment = {
  // 'rest'         -> tu API de fútbol (solo cambia api.baseUrl). Formato: docs/API-CONTRACT.md
  // 'footballData' -> football-data.org gratis, solo LaLiga (usa proxy.conf.js + FOOTBALL_DATA_TOKEN)
  // 'quiniela'     -> boleto oficial de La Quiniela (API de Eduardo Losilla)
  // 'mock'         -> datos de ejemplo dentro de la app, sin red
  dataSource: 'quiniela',

  api: {
    baseUrl: '/api/fd',          // <- AQUÍ pones la URL de tu API
    headers: {} as Record<string, string>,      // p. ej. { 'Authorization': 'Bearer ...' }
    historyLimit: 10
  },

  footballData: {
    baseUrl: '/api/fd',
    competition: 'PD',
    totalMatches: 15,
    historyMatches: 10,
    minGapMs: 6500,
    cacheHours: 6
  },

  quiniela: {
    baseUrl: 'https://api.eduardolosilla.es/escrutinios',
    jornada: 16,
    temporada: 2027
  },

  // Corrupción / economía: -1..1 por id de equipo. Manual, sin fuente pública fiable.
  manualFactors: {} as Record<number, { corruption: number; economic: number }>
};