import type { Fixture, TeamHistory, TeamCardStats, TeamSeasonStats, RefereeHistory, Weather, Factors, Prediction, Sign, Absence, PastMatch } from '../models/models';
import { calibrateProbabilities, poissonOutcomeProbabilities } from './probability.mjs';

// Pesos ajustables. corruption/economic multiplican el valor manual (-1..1) de cada equipo.
export const WEIGHTS = {
  homeAdvantage: 1.06, refereeHome: 0.25, rainGoals: 0.03, windGoals: 0.004,
  corruption: 0.10, economic: 0.12,
  historicalStrength: 0.15,
  creativeStrength: 0.2,
  // Bajas: un jugador clave (weight 1) ausente baja ~12% el ataque propio y sube ~8% el del rival; un apercibido pesa 15%
  absenceOwn: 0.12, absenceOpp: 0.08, warnedFactor: 0.15
};

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1.2;

export function normalizeHistory(matches: PastMatch[], limit = 8): PastMatch[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('El límite del historial debe ser un entero positivo.');
  return matches.filter(match => Number.isFinite(match.goalsFor) && match.goalsFor >= 0
    && Number.isFinite(match.goalsAgainst) && match.goalsAgainst >= 0)
    .slice(0, limit);
}

export function estimateExpectedGoals(
  homeHistory: PastMatch[],
  awayHistory: PastMatch[],
  homeSeason: TeamSeasonStats | null,
  awaySeason: TeamSeasonStats | null
): { home: number; away: number } {
  let home = homeHistory.length && awayHistory.length
    ? (avg(homeHistory.map(match => match.goalsFor)) + avg(awayHistory.map(match => match.goalsAgainst))) / 2 * WEIGHTS.homeAdvantage
    : (homeSeason?.leagueGoalsPerTeamMatch ?? awaySeason?.leagueGoalsPerTeamMatch ?? 1.3) * WEIGHTS.homeAdvantage;
  let away = homeHistory.length && awayHistory.length
    ? (avg(awayHistory.map(match => match.goalsFor)) + avg(homeHistory.map(match => match.goalsAgainst))) / 2
    : (homeSeason?.leagueGoalsPerTeamMatch ?? awaySeason?.leagueGoalsPerTeamMatch ?? 1.3);
  if (homeSeason?.attackFactor != null) home *= homeSeason.attackFactor;
  if (awaySeason?.attackFactor != null) away *= awaySeason.attackFactor;
  if (homeSeason?.creativeFactor != null) home *= Math.pow(homeSeason.creativeFactor, WEIGHTS.creativeStrength);
  if (awaySeason?.creativeFactor != null) away *= Math.pow(awaySeason.creativeFactor, WEIGHTS.creativeStrength);
  if (awaySeason?.defenseFactor != null) home /= awaySeason.defenseFactor;
  if (homeSeason?.defenseFactor != null) away /= homeSeason.defenseFactor;
  if (homeSeason?.historicalAttackFactor != null) {
    home *= Math.pow(homeSeason.historicalAttackFactor, WEIGHTS.historicalStrength);
  }
  if (awaySeason?.historicalDefenseFactor != null) {
    home /= Math.pow(awaySeason.historicalDefenseFactor, WEIGHTS.historicalStrength);
  }
  if (awaySeason?.historicalAttackFactor != null) {
    away *= Math.pow(awaySeason.historicalAttackFactor, WEIGHTS.historicalStrength);
  }
  if (homeSeason?.historicalDefenseFactor != null) {
    away /= Math.pow(homeSeason.historicalDefenseFactor, WEIGHTS.historicalStrength);
  }
  return {
    home: Math.max(0.05, Math.min(5, Number.isFinite(home) ? home : 1.3)),
    away: Math.max(0.05, Math.min(5, Number.isFinite(away) ? away : 1.3))
  };
}

export function calculateProbabilities(homeGoals: number, awayGoals: number) {
  return calibrateProbabilities(poissonOutcomeProbabilities(homeGoals, awayGoals));
}

export function predict(f: Fixture, hh: TeamHistory, ah: TeamHistory, ref: RefereeHistory, w: Weather | null,
                        fh: Factors, fa: Factors, homeCards: TeamCardStats | null = null,
                        awayCards: TeamCardStats | null = null,
                        homeAbs: Absence[] = [], awayAbs: Absence[] = [],
                        homeSeason: TeamSeasonStats | null = null, awaySeason: TeamSeasonStats | null = null): Prediction {
  const notes: string[] = [];
  const homeHistory = normalizeHistory(hh.matches.length ? hh.matches : homeCards?.history ?? []);
  const awayHistory = normalizeHistory(ah.matches.length ? ah.matches : awayCards?.history ?? []);
  const seasonNote = (name: string, stats: TeamSeasonStats | null) => {
    if (!stats) return `${name}: sin estadísticas de temporada disponibles`;
    const leaders = [
      stats.leaders.goals[0] ? `máx. goles ${stats.leaders.goals[0]}` : '',
      stats.leaders.assists[0] ? `máx. asistencias ${stats.leaders.assists[0]}` : '',
      stats.leaders.yellowCards[0] ? `más amarillas ${stats.leaders.yellowCards[0]}` : '',
      stats.leaders.redCards[0] ? `más rojas ${stats.leaders.redCards[0]}` : ''
    ].filter(Boolean);
    const metric = (value: number | null | undefined) => value == null ? 's/d' : value.toFixed(2);
    const rankingNote = leaders.length ? '; ranking individual: ' + leaders.join(', ') : '';
    const cardsNote = '; por partido ' + metric(stats.yellowCardsPerMatch) + ' amarillas y ' + metric(stats.redCardsPerMatch) + ' rojas';
    return name + ' (' + stats.division + '): ataque ' + metric(stats.attackFactor) + ', creación ' + metric(stats.creativeFactor) + ', defensa ' + metric(stats.defenseFactor) + '; históricos ataque ' + metric(stats.historicalAttackFactor) + '/defensa ' + metric(stats.historicalDefenseFactor) + '; por partido ' + metric(stats.goalsPerMatch) + ' goles, ' + metric(stats.assistsPerMatch) + ' asistencias y ' + metric(stats.goalsConcededPerMatch) + ' recibidos; ' + metric(stats.pointsPerMatch) + ' puntos/partido' + cardsNote + rankingNote;
  };
  if ((!homeHistory.length || !awayHistory.length)
    && homeSeason?.attackFactor == null && awaySeason?.attackFactor == null) {
    notes.push('Sin historial de marcadores ni estadísticas de temporada suficientes; no se genera un signo arbitrario');
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
    return {
      fixture: f, p1: null, pX: null, p2: null, sign: null,
      xgHome: null, xgAway: null, pleno: { home: '—', away: '—' }, weather: w, notes
    };
  }
  if (!homeHistory.length || !awayHistory.length) {
    notes.push('Sin marcadores históricos completos; se usa la media de goles de la competición ajustada con los líderes estadísticos disponibles');
  }
  if (f.league.startsWith('Quiniela')) notes.push('Árbitro no disponible para esta fuente');
  // Ataque/defensa recientes
  const expectedGoals = estimateExpectedGoals(homeHistory, awayHistory, homeSeason, awaySeason);
  let xgH = expectedGoals.home;
  let xgA = expectedGoals.away;

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

  // Bajas (lesiones, sanciones, apercibidos)
  const impact = (abs: Absence[]) => Math.min(2, abs.reduce((s, a) => {
    const availability = a.availability == null ? 0 : Math.max(0, Math.min(100, a.availability)) / 100;
    return s + (a.weight ?? 0.3) * (1 - availability) * (a.reason === 'apercibido' ? WEIGHTS.warnedFactor : 1);
  }, 0));
  const impH = impact(homeAbs), impA = impact(awayAbs);
  xgH *= (1 - WEIGHTS.absenceOwn * impH) * (1 + WEIGHTS.absenceOpp * impA);
  xgA *= (1 - WEIGHTS.absenceOwn * impA) * (1 + WEIGHTS.absenceOpp * impH);
  const label = { lesion: 'lesión', sancion: 'sanción', apercibido: 'apercibido' } as const;
  const absenceLabel = (a: Absence) => `${a.player} (${label[a.reason]}${a.details ? `: ${a.details}` : ''}${a.availability != null ? `, ${a.availability}% disponible` : ''})`;
  if (homeAbs.length) notes.push(`Bajas ${f.home}: ${homeAbs.map(absenceLabel).join(', ')}`);
  if (awayAbs.length) notes.push(`Bajas ${f.away}: ${awayAbs.map(absenceLabel).join(', ')}`);
  if (!homeAbs.length && !awayAbs.length) notes.push('Sin bajas registradas en public/data/bajas.json; el archivo no confirma que los equipos estén libres de bajas');
  else {
    if (!homeAbs.length) notes.push(`${f.home}: sin bajas registradas en public/data/bajas.json`);
    if (!awayAbs.length) notes.push(`${f.away}: sin bajas registradas en public/data/bajas.json`);
  }

  const probabilities = calculateProbabilities(xgH, xgA);
  const p1 = probabilities.home, pX = probabilities.draw, p2 = probabilities.away;
  const sign: Sign = p1 >= pX && p1 >= p2 ? '1' : p2 >= pX ? '2' : 'X';
  const cat = (l: number) => {
    const p = [0, 1, 2].map(goals => Math.exp(-l) * Math.pow(l, goals) / [1, 1, 2][goals]);
    p.push(Math.max(0, 1 - p[0] - p[1] - p[2]));
    return ['0', '1', '2', 'M'][p.indexOf(Math.max(...p))];
  };
  const cardAverage = (value: number | null, digits: number) => value == null ? 's/d' : value.toFixed(digits);
  if (homeCards) notes.push(`${f.home}: ${cardAverage(homeCards.avgYellow, 1)} amarillas y ${cardAverage(homeCards.avgRed, 2)} rojas por partido (temporada)`);
  if (awayCards) notes.push(`${f.away}: ${cardAverage(awayCards.avgYellow, 1)} amarillas y ${cardAverage(awayCards.avgRed, 2)} rojas por partido (temporada)`);
  if (homeSeason?.yellowCardsPerMatch != null || homeSeason?.redCardsPerMatch != null) {
    notes.push(`${f.home}: ${cardAverage(homeSeason.yellowCardsPerMatch, 2)} amarillas y ${cardAverage(homeSeason.redCardsPerMatch, 2)} rojas por partido (estadística de temporada)`);
  }
  if (awaySeason?.yellowCardsPerMatch != null || awaySeason?.redCardsPerMatch != null) {
    notes.push(`${f.away}: ${cardAverage(awaySeason.yellowCardsPerMatch, 2)} amarillas y ${cardAverage(awaySeason.redCardsPerMatch, 2)} rojas por partido (estadística de temporada)`);
  }
  notes.push('No se ajustan las probabilidades por tarjetas ni se fuerza el empate: esos efectos quedan pendientes de validación retrospectiva');
  if (homeCards?.players?.length) notes.push(`${f.home} jugadores con más tarjetas: ${homeCards.players.slice(0, 3).map(player => `${player.name} (${player.yellow}A/${player.red}R)`).join(', ')}`);
  if (awayCards?.players?.length) notes.push(`${f.away} jugadores con más tarjetas: ${awayCards.players.slice(0, 3).map(player => `${player.name} (${player.yellow}A/${player.red}R)`).join(', ')}`);
  if (homeSeason) notes.push(seasonNote(f.home, homeSeason));
  if (awaySeason) notes.push(seasonNote(f.away, awaySeason));
  const hasHomeSeasonCards = homeSeason?.yellowCards != null || homeSeason?.redCards != null;
  const hasAwaySeasonCards = awaySeason?.yellowCards != null || awaySeason?.redCards != null;
  if ((!homeCards && !hasHomeSeasonCards) || (!awayCards && !hasAwaySeasonCards)) {
    notes.push('Tarjetas no disponibles para uno o ambos equipos');
  }
  if (homeCards && homeCards.avgYellow == null && homeCards.avgRed == null
    || awayCards && awayCards.avgYellow == null && awayCards.avgRed == null) {
    notes.push('Historial individual de tarjetas incompleto');
  }
  if ((homeCards || awayCards) && (!homeCards || !awayCards)) notes.push('Datos de tarjetas incompletos; no se aplicó el ajuste de tarjetas del equipo sin datos');
  return { fixture: f, p1, pX, p2, sign, xgHome: xgH, xgAway: xgA, pleno: { home: cat(xgH), away: cat(xgA) }, weather: w, notes };
}