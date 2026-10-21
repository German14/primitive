import { Fixture, TeamHistory, TeamCardStats, RefereeHistory, Weather, Factors, Prediction, Sign } from '../models/models';

// Pesos ajustables. corruption/economic multiplican el valor manual (-1..1) de cada equipo.
export const WEIGHTS = {
  homeAdvantage: 1.12, refereeHome: 0.25, rainGoals: 0.03, windGoals: 0.004,
  corruption: 0.10, economic: 0.12, yellowCardRedRisk: 0.01,
  redCardGoalReduction: 0.65, redCardOpponentBoost: 1.25
};

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1.2;
const fact = (n: number): number => n <= 1 ? 1 : n * fact(n - 1);
const pois = (k: number, l: number) => Math.exp(-l) * Math.pow(l, k) / fact(k);

export function predict(f: Fixture, hh: TeamHistory, ah: TeamHistory, ref: RefereeHistory, w: Weather | null,
                        fh: Factors, fa: Factors, homeCards: TeamCardStats | null = null,
                        awayCards: TeamCardStats | null = null): Prediction {
  const notes: string[] = [];
  const homeHistory = hh.matches.length ? hh.matches : homeCards?.history ?? [];
  const awayHistory = ah.matches.length ? ah.matches : awayCards?.history ?? [];
  const last = (matches: TeamHistory['matches']) => matches.slice(0, 8);
  if (!homeHistory.length || !awayHistory.length) {
    notes.push('Sin historial de goles suficiente: no se genera pronóstico para evitar asignar un signo arbitrario');
    const cardAverage = (value: number | null, digits: number) => value == null ? 's/d' : value.toFixed(digits);
    if (homeCards) notes.push(`${f.home}: ${cardAverage(homeCards.avgYellow, 1)} amarillas y ${cardAverage(homeCards.avgRed, 2)} rojas por partido (temporada)`);
    if (awayCards) notes.push(`${f.away}: ${cardAverage(awayCards.avgYellow, 1)} amarillas y ${cardAverage(awayCards.avgRed, 2)} rojas por partido (temporada)`);
    if (homeCards?.players?.length) notes.push(`${f.home} jugadores con más tarjetas: ${homeCards.players.slice(0, 3).map(player => `${player.name} (${player.yellow}A/${player.red}R)`).join(', ')}`);
    if (awayCards?.players?.length) notes.push(`${f.away} jugadores con más tarjetas: ${awayCards.players.slice(0, 3).map(player => `${player.name} (${player.yellow}A/${player.red}R)`).join(', ')}`);
    if (!homeCards || !awayCards) notes.push('Tarjetas no disponibles para uno o ambos equipos');
    if (homeCards && homeCards.avgYellow == null && homeCards.avgRed == null
      || awayCards && awayCards.avgYellow == null && awayCards.avgRed == null) {
      notes.push('Historial individual de tarjetas incompleto');
    }
    if (f.league.startsWith('Quiniela')) notes.push('Historial de partidos no disponible en las fuentes consultadas');
    return {
      fixture: f, p1: 1 / 3, pX: 1 / 3, p2: 1 / 3, sign: null,
      xgHome: null, xgAway: null, pleno: { home: '—', away: '—' }, weather: w, notes
    };
  }
  if (f.league.startsWith('Quiniela')) notes.push('Árbitro no disponible para esta fuente');
  // Ataque/defensa recientes
  let xgH = (avg(last(homeHistory).map(m => m.goalsFor)) + avg(last(awayHistory).map(m => m.goalsAgainst))) / 2 * WEIGHTS.homeAdvantage;
  let xgA = (avg(last(awayHistory).map(m => m.goalsFor)) + avg(last(homeHistory).map(m => m.goalsAgainst))) / 2;

  // Árbitro: tendencia a favorecer al local respecto a la media (~0.45)
  const refBias = (ref.homeWinPct - 0.45) * WEIGHTS.refereeHome * 4 + (ref.penaltiesPerMatch - 0.3) * 0.1;
  xgH *= 1 + refBias; if (Math.abs(refBias) > 0.03) notes.push(`Árbitro ${f.referee ?? '?'}: ${refBias > 0 ? 'favorece' : 'perjudica'} al local`);

  // Clima: lluvia, viento y calor bajan los goles. Sin previsión -> no se toca nada y se avisa.
  if (w) {
    const wf = Math.max(0.7, 1 - Math.min(w.rainMm, 5) * WEIGHTS.rainGoals - Math.max(0, w.windKmh - 15) * WEIGHTS.windGoals
      - Math.max(0, w.tempC - 30) * 0.005);
    xgH *= wf; xgA *= wf;
    if (wf < 0.98) notes.push(`Clima (${w.rainMm.toFixed(1)} mm, ${Math.round(w.windKmh)} km/h, ${Math.round(w.tempC)}°): goles ${Math.round((1 - wf) * 100)}% menos`);
  } else notes.push('Sin previsión de clima para esa fecha');

  // Factores manuales
  const adj = (x: Factors) => 1 + x.corruption * WEIGHTS.corruption + x.economic * WEIGHTS.economic;
  xgH *= adj(fh); xgA *= adj(fa);
  if (fh.corruption || fh.economic || fa.corruption || fa.economic) notes.push('Factores manuales aplicados');

  const outcome = (homeGoals: number, awayGoals: number) => {
    let p1 = 0, pX = 0, p2 = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const p = pois(i, homeGoals) * pois(j, awayGoals);
      if (i > j) p1 += p; else if (i === j) pX += p; else p2 += p;
    }
    const total = p1 + pX + p2;
    return { p1: p1 / total, pX: pX / total, p2: p2 / total };
  };
  const redRisk = (cards: TeamCardStats | null) => cards && (cards.avgRed != null || cards.avgYellow != null)
    ? Math.max(0, Math.min(0.25, (cards.avgRed ?? 0) + Math.max(0, (cards.avgYellow ?? 2.3) - 2.3) * WEIGHTS.yellowCardRedRisk))
    : 0;
  const redH = redRisk(homeCards), redA = redRisk(awayCards);
  const scenarios = [
    { probability: (1 - redH) * (1 - redA), homeGoals: xgH, awayGoals: xgA },
    { probability: redH * (1 - redA), homeGoals: xgH * WEIGHTS.redCardGoalReduction, awayGoals: xgA * WEIGHTS.redCardOpponentBoost },
    { probability: (1 - redH) * redA, homeGoals: xgH * WEIGHTS.redCardOpponentBoost, awayGoals: xgA * WEIGHTS.redCardGoalReduction },
    { probability: redH * redA, homeGoals: xgH * WEIGHTS.redCardGoalReduction, awayGoals: xgA * WEIGHTS.redCardGoalReduction }
  ];
  let p1 = 0, pX = 0, p2 = 0;
  for (const scenario of scenarios) {
    const p = outcome(scenario.homeGoals, scenario.awayGoals);
    p1 += scenario.probability * p.p1;
    pX += scenario.probability * p.pX;
    p2 += scenario.probability * p.p2;
  }
  const sign: Sign = p1 >= pX && p1 >= p2 ? '1' : p2 >= pX ? '2' : 'X';
   const cat = (l: number) => {
    const p = [pois(0, l), pois(1, l), pois(2, l)]; p.push(1 - p[0] - p[1] - p[2]);
    return ['0', '1', '2', 'M'][p.indexOf(Math.max(...p))];
  };
  const cardAverage = (value: number | null, digits: number) => value == null ? 's/d' : value.toFixed(digits);
  if (homeCards) notes.push(`${f.home}: ${cardAverage(homeCards.avgYellow, 1)} amarillas y ${cardAverage(homeCards.avgRed, 2)} rojas por partido (temporada)`);
  if (awayCards) notes.push(`${f.away}: ${cardAverage(awayCards.avgYellow, 1)} amarillas y ${cardAverage(awayCards.avgRed, 2)} rojas por partido (temporada)`);
  if (homeCards?.players?.length) notes.push(`${f.home} jugadores con más tarjetas: ${homeCards.players.slice(0, 3).map(player => `${player.name} (${player.yellow}A/${player.red}R)`).join(', ')}`);
  if (awayCards?.players?.length) notes.push(`${f.away} jugadores con más tarjetas: ${awayCards.players.slice(0, 3).map(player => `${player.name} (${player.yellow}A/${player.red}R)`).join(', ')}`);
  if (!homeCards || !awayCards) notes.push('Tarjetas no disponibles para uno o ambos equipos');
  if (homeCards && homeCards.avgYellow == null && homeCards.avgRed == null
    || awayCards && awayCards.avgYellow == null && awayCards.avgRed == null) {
    notes.push('Historial individual de tarjetas incompleto');
  }
  if ((homeCards || awayCards) && (!homeCards || !awayCards)) notes.push('Datos de tarjetas incompletos; no se aplicó el ajuste de tarjetas del equipo sin datos');
  return { fixture: f, p1, pX, p2, sign, xgHome: xgH, xgAway: xgA, pleno: { home: cat(xgH), away: cat(xgA) }, weather: w, notes };
}