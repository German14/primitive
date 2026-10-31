const aliases: Record<string, string> = {
  'at madrid': 'atletico madrid',
  'atleti': 'atletico madrid',
  'ath club': 'athletic club',
  'r sociedad': 'real sociedad',
  'r oviedo': 'real oviedo',
  'r madrid': 'real madrid',
  'rayo': 'rayo vallecano',
  'deportivo': 'deportivo',
  'leganes': 'leganes',
  'logrono f': 'd ux logroño',
  'badalona w f': 'fc badalona women',
  'deportivo f': 'deportivo abanca',
  'alaves f': 'deportivo alaves',
  'eibar f': 'sd eibar',
  'madrid cff f': 'madrid cff',
  'r madrid f': 'real madrid',
  'tenerife f': 'ud tenerife',
  'barcelona f': 'fc barcelona'
};

const cities: Record<string, string> = {
  'valencia': 'Valencia',
  'villarreal': 'Vila-real',
  'elche': 'Elche',
  'getafe': 'Getafe',
  'celta': 'Vigo',
  'betis': 'Sevilla',
  'levante': 'Valencia',
  'sevilla': 'Sevilla',
  'osasuna': 'Pamplona',
  'leganes': 'Leganés',
  'mallorca': 'Palma',
  'almeria': 'Almería',
  'sabadell': 'Sabadell',
  'tenerife': 'Santa Cruz de Tenerife',
  'barcelona': 'Barcelona',
  'oviedo': 'Oviedo',
  'at madrid': 'Madrid',
  'ath club': 'Bilbao',
  'r sociedad': 'San Sebastián',
  'r oviedo': 'Oviedo',
  'r madrid': 'Madrid',
  'rayo': 'Madrid',
  'deportivo': 'A Coruña',
  'logrono f': 'Logroño',
  'badalona w f': 'Badalona',
  'deportivo f': 'A Coruña',
  'alaves f': 'Vitoria-Gasteiz',
  'eibar f': 'Eibar',
  'madrid cff f': 'Madrid',
  'r madrid f': 'Madrid',
  'tenerife f': 'Santa Cruz de Tenerife',
  'barcelona f': 'Barcelona'
};

export function teamCity(name: string): string {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim();
  return cities[key] ?? name.replace(/\s*\(F\)$/i, '').trim();
}

export function normalizeTeamName(name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim();
  return aliases[normalized] ?? normalized;
}


// --- Emparejar el nombre de la quiniela ("ATH.CLUB") con el de football-data.org ("Athletic Club") ---
const STOP = new Set(['fc', 'cf', 'cd', 'ud', 'rcd', 'sd', 'ca', 'rc', 'club', 'de', 'del', 'la', 'futbol', 'balompie', 'sad', 'real']);

function tokenKey(name: string): string {
  return normalizeTeamName(name).split(' ').filter(t => t && !STOP.has(t)).sort().join(' ');
}

export interface TeamLike { name?: string; shortName?: string; tla?: string; }

/** Busca el equipo por nombre ignorando FC/CF/Real/Club..., primero igualdad exacta y luego coincidencia única parcial. */
export function findTeam<T extends TeamLike>(teams: T[], quinielaName: string): T | undefined {
  const target = tokenKey(quinielaName);
  if (!target) return undefined;
  const keys = (t: T) => [t.name, t.shortName].filter((n): n is string => !!n).map(tokenKey);
  const exact = teams.find(t => keys(t).includes(target));
  if (exact) return exact;
  const wanted = target.split(' ');
  const partial = teams.filter(t => keys(t).some(k => wanted.every(w => k.split(' ').includes(w))));
  return partial.length === 1 ? partial[0] : undefined;
}

/** Clave comparable de un equipo (ignora mayúsculas, acentos, FC/CF/Real/Club...). */
export const teamTokenKey = tokenKey;
