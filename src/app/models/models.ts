export interface Fixture {
  id: number; home: string; away: string; homeId: number; awayId: number;
  refereeId: number; referee: string; kickoff: string; // ISO
  lat: number; lon: number; stadium: string;
}
export interface PastMatch { goalsFor: number; goalsAgainst: number; home: boolean; }
export interface TeamHistory { teamId: number; matches: PastMatch[]; }
export interface RefereeHistory {
  refereeId: number; matches: number;
  avgYellow: number; avgRed: number; penaltiesPerMatch: number;
  homeWinPct: number; // 0..1
}
export interface Weather { rainMm: number; windKmh: number; tempC: number; }
export interface Factors { corruption: number; economic: number; } // -1 (perjudica) .. +1 (favorece)
export type Sign = '1' | 'X' | '2';
export interface Prediction {
  fixture: Fixture; p1: number; pX: number; p2: number; sign: Sign;
  xgHome: number; xgAway: number; weather: Weather; notes: string[];
}
