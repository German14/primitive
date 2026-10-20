import { Fixture, PastMatch } from '../../models/models';

const names = ['Real Madrid','Barcelona','Atlético','Sevilla','Betis','Valencia','Athletic','Real Sociedad','Villarreal','Girona','Osasuna','Celta','Getafe','Mallorca','Rayo','Alavés','Espanyol','Levante','Elche','Oviedo'];
const ref = ['Gil Manzano','Munuera Montero','Sánchez Martínez','Hernández Hernández','Martínez Munuera','Soto Grado','Cuadra Fernández'];
const pairs: [number, number][] = [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],[1,3],[0,2],[5,7],[9,11]];
const sat = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7)); sat.setHours(18, 30, 0, 0);

export const MOCK_FIXTURES: Fixture[] = pairs.map(([h, a], i) => ({
  id: i + 1, home: names[h], away: names[a], homeId: h, awayId: a,
  refereeId: i % ref.length, referee: ref[i % ref.length],
  kickoff: new Date(sat.getTime() + i * 3 * 3600_000).toISOString(),
  lat: 40.4 + (i % 5) * 0.5, lon: -3.7 + (i % 4) * 0.6, stadium: `Estadio ${names[h]}`
}));

// Generador determinista: mismo equipo, mismo historial.
export function mockMatches(teamId: number): PastMatch[] {
  let s = (teamId + 1) * 9301;
  const rnd = () => (s = (s * 49297 + 233280) % 233280) / 233280;
  const strength = 0.7 + ((teamId * 7) % 10) / 10;
  return Array.from({ length: 10 }, (_, i) => ({
    home: i % 2 === 0,
    goalsFor: Math.round(rnd() * 2 * strength + (i % 2 === 0 ? 0.4 : 0)),
    goalsAgainst: Math.round(rnd() * 2.2 / strength)
  }));
}
