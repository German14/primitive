// Pon useMock=false y rellena las URLs/claves cuando tengas tus APIs.
export const environment = {
  useMock: true,
  api: {
    fixtures: { url: 'https://api.example.com/quiniela/jornada', headers: {} as Record<string, string> },
    teamHistory: { url: 'https://api.example.com/teams/{teamId}/matches', headers: { 'X-Auth-Token': 'TU_CLAVE' } as Record<string, string> },
    refereeHistory: { url: 'https://api.example.com/referees/{refereeId}/stats', headers: { 'X-Auth-Token': 'TU_CLAVE' } as Record<string, string> },
    // Open-Meteo no necesita clave
    weather: { url: 'https://api.open-meteo.com/v1/forecast', headers: {} as Record<string, string> }
  }
};
