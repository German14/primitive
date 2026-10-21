const aliases: Record<string, string> = {
  'at madrid': 'atletico madrid',
  'atleti': 'atletico madrid',
  'ath club': 'athletic club',
  'r sociedad': 'real sociedad',
  'r oviedo': 'real oviedo',
  'r madrid': 'real madrid',
  'rayo': 'rayo vallecano',
  'deportivo': 'deportivo la coruna',
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
