export function normalizeProbabilities(probabilities) {
  const values = [probabilities.home, probabilities.draw, probabilities.away];
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Las probabilidades deben ser números finitos no negativos.');
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error('La suma de probabilidades debe ser mayor que cero.');
  return { home: values[0] / total, draw: values[1] / total, away: values[2] / total };
}

export function calibrateProbabilities(model, baseline = null, baselineWeight = 0) {
  if (!Number.isFinite(baselineWeight) || baselineWeight < 0 || baselineWeight > 1) {
    throw new Error('El peso de calibración debe estar entre cero y uno.');
  }
  const normalizedModel = normalizeProbabilities(model);
  if (baselineWeight === 0 || baseline == null) return normalizedModel;
  const normalizedBaseline = normalizeProbabilities(baseline);
  return normalizeProbabilities({
    home: normalizedModel.home * (1 - baselineWeight) + normalizedBaseline.home * baselineWeight,
    draw: normalizedModel.draw * (1 - baselineWeight) + normalizedBaseline.draw * baselineWeight,
    away: normalizedModel.away * (1 - baselineWeight) + normalizedBaseline.away * baselineWeight
  });
}

export function poissonOutcomeProbabilities(homeGoals, awayGoals, maxGoals = 12) {
  if (![homeGoals, awayGoals].every(value => Number.isFinite(value) && value >= 0)
    || !Number.isInteger(maxGoals) || maxGoals < 1) {
    throw new Error('Goles esperados y límite de la distribución no válidos.');
  }
  const poisson = lambda => {
    const values = [Math.exp(-lambda)];
    for (let goals = 1; goals <= maxGoals; goals++) {
      values.push(values[goals - 1] * lambda / goals);
    }
    return values;
  };
  const home = poisson(homeGoals);
  const away = poisson(awayGoals);
  let homeWin = 0, draw = 0, awayWin = 0;
  for (let homeScore = 0; homeScore <= maxGoals; homeScore++) {
    for (let awayScore = 0; awayScore <= maxGoals; awayScore++) {
      const probability = home[homeScore] * away[awayScore];
      if (homeScore > awayScore) homeWin += probability;
      else if (homeScore === awayScore) draw += probability;
      else awayWin += probability;
    }
  }
  return normalizeProbabilities({ home: homeWin, draw, away: awayWin });
}
