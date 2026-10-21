import { Observable } from 'rxjs';
import { Fixture, TeamHistory, TeamCardStats, RefereeHistory, Weather, Factors } from '../models/models';

export abstract class FixturesApi {
  abstract getJornada(date: string, jornada?: number, temporada?: number): Observable<Fixture[]>;
}
export abstract class TeamHistoryApi {
  abstract get(teamId: number, teamName?: string, league?: string): Observable<TeamHistory>;
}
export abstract class TeamCardStatsApi {
  abstract get(teamName: string, kickoff: string, league?: string): Observable<TeamCardStats | null>;
}
export abstract class RefereeHistoryApi { abstract get(referee: string | null): Observable<RefereeHistory>; }
export abstract class WeatherApi { abstract get(city: string, iso: string): Observable<Weather | null>; }
export abstract class FactorsApi { abstract get(teamId: number): Observable<Factors>; }
