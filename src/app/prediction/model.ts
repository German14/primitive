import { Fixture, TeamHistory, RefereeHistory, Weather, Factors, Prediction, Sign } from '../models/models';

// Pesos ajustables. corruption/economic multiplican el valor manual (-1..1) de cada equipo.
export const WEIGHTS = { homeAdvantage: 1.12, refereeHome: 0.25, rainGoals: 0.03, windGoals: 0.004, corruption: 0.10, economic: 0.12 };

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1.2;
const fact = (n: number): number => n <= 1 ? 1 : n * fact(n - 1);
const pois = (k: number, l: number) => Math.exp(-l) * Math.pow(l, k) / fact(k);

export function predict(f: Fixture, hh: TeamHistory, ah: TeamHistory, ref: RefereeHistory, w: Weather,
                        fh: Factors, fa: Factors): Prediction {
  const notes: string[] = [];
  const last = (t: TeamHistory) => t.matches.slice(0, 8);
  // Ataque/defensa recientes
  let xgH = (avg(last(hh).map(m => m.goalsFor)) + avg(last(ah).map(m => m.goalsAgainst))) / 2 * WEIGHTS.homeAdvantage;
  let xgA = (avg(last(ah).map(m => m.goalsFor)) + avg(last(hh).map(m => m.goalsAgainst))) / 2;

  // Árbitro: tendencia a favorecer al local respecto a la media (~0.45)
  const refBias = (ref.homeWinPct - 0.45) * WEIGHTS.refereeHome * 4 + (ref.penaltiesPerMatch - 0.3) * 0.1;
  xgH *= 1 + refBias; if (Math.abs(refBias) > 0.03) notes.push(`Árbitro ${f.referee ?? '?'}: ${refBias > 0 ? 'favorece' : 'perjudica'} al local`);

  // Clima: lluvia y viento bajan los goles
  const wf = Math.max(0.7, 1 - w.rainMm * WEIGHTS.rainGoals - Math.max(0, w.windKmh - 20) * WEIGHTS.windGoals);
  xgH *= wf; xgA *= wf; if (wf < 0.95) notes.push(`Clima adverso (${w.rainMm.toFixed(1)} mm, ${Math.round(w.windKmh)} km/h)`);

  // Factores manuales
  const adj = (x: Factors) => 1 + x.corruption * WEIGHTS.corruption + x.economic * WEIGHTS.economic;
  xgH *= adj(fh); xgA *= adj(fa);
  if (fh.corruption || fh.economic || fa.corruption || fa.economic) notes.push('Factores manuales aplicados');

  let p1 = 0, pX = 0, p2 = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const p = pois(i, xgH) * pois(j, xgA);
    if (i > j) p1 += p; else if (i === j) pX += p; else p2 += p;
  }
  const t = p1 + pX + p2; p1 /= t; pX /= t; p2 /= t;
  const sign: Sign = p1 >= pX && p1 >= p2 ? '1' : p2 >= pX ? '2' : 'X';
  return { fixture: f, p1, pX, p2, sign, xgHome: xgH, xgAway: xgA, weather: w, notes };
}
