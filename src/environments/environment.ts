export const environment = {
  useMock: false,
  apiFootball: {
    // Las peticiones pasan por el proxy (proxy.conf.js) que añade tu clave. La clave NO va en el navegador.
    baseUrl: '/api/football',
    leagues: [140],          // 140 = LaLiga, 141 = Segunda
    season: 2023,                 // temporada 2026-27
    totalMatches: 14,             // partidos de la quiniela
    historyMatches: 10,           // últimos partidos por equipo
    refereeSampleMatches: 20,     // partidos recientes por árbitro para tarjetas/penaltis
    minGapMs: 6500,               // plan gratis: 10 peticiones/min. Con plan de pago pon 0
    cacheHours: 6,
    // Opcional: fuerza los partidos exactos de la quiniela (ids de fixture de API-Football)
    fixtureIds: [] as number[]
  },
  // Corrupción / economía: valores -1..1 por teamId de API-Football. Manual, sin fuente pública fiable.
  manualFactors: {} as Record<number, { corruption: number; economic: number }>
};
