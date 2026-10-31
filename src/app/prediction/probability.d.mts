export interface OutcomeProbabilities {
  home: number;
  draw: number;
  away: number;
}

export function normalizeProbabilities(probabilities: OutcomeProbabilities): OutcomeProbabilities;
export function calibrateProbabilities(
  model: OutcomeProbabilities,
  baseline?: OutcomeProbabilities | null,
  baselineWeight?: number
): OutcomeProbabilities;
export function poissonOutcomeProbabilities(
  homeGoals: number,
  awayGoals: number,
  maxGoals?: number
): OutcomeProbabilities;
