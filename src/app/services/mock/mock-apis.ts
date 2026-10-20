import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from '../contracts';
import { Fixture, TeamHistory, RefereeHistory, Weather, Factors } from '../../models/models';
import { MOCK_FIXTURES, mockMatches } from './mock-data';

@Injectable() export class MockFixturesApi extends FixturesApi {
  getWeekend(): Observable<Fixture[]> { return of(MOCK_FIXTURES).pipe(delay(200)); }
}
@Injectable() export class MockTeamHistoryApi extends TeamHistoryApi {
  get(teamId: number): Observable<TeamHistory> { return of({ teamId, matches: mockMatches(teamId) }); }
}
@Injectable() export class MockRefereeHistoryApi extends RefereeHistoryApi {
  get(name: string | null): Observable<RefereeHistory> {
    const refereeId = (name ?? 'x').length;
    return of({ referee: name, matches: 120 + refereeId * 10, avgYellow: 4 + (refereeId % 3) * 0.6,
      avgRed: 0.15 + (refereeId % 4) * 0.05, penaltiesPerMatch: 0.25 + (refereeId % 3) * 0.08,
      homeWinPct: 0.42 + (refereeId % 5) * 0.03 });
  }
}
@Injectable() export class MockWeatherApi extends WeatherApi {
  get(city: string): Observable<Weather> {
    const k = city.length;
    return of({ rainMm: (k % 4) * 1.5, windKmh: 8 + (k % 5) * 6, tempC: 12 + (k % 8), source: 'mock' as const });
  }
}
// Corrupción / economía: valores MANUALES. No hay fuente pública fiable; edítalos aquí o conecta tu propia API.
@Injectable() export class MockFactorsApi extends FactorsApi {
  private manual: Record<number, Factors> = { 1: { corruption: 0, economic: 0.3 }, 3: { corruption: -0.2, economic: -0.4 } };
  get(teamId: number): Observable<Factors> { return of(this.manual[teamId] ?? { corruption: 0, economic: 0 }); }
}
