import { Observable } from 'rxjs';
import { Fixture, TeamHistory, RefereeHistory, Weather, Factors } from '../models/models';

export abstract class FixturesApi { abstract getWeekend(): Observable<Fixture[]>; }
export abstract class TeamHistoryApi { abstract get(teamId: number): Observable<TeamHistory>; }
export abstract class RefereeHistoryApi { abstract get(referee: string | null): Observable<RefereeHistory>; }
export abstract class WeatherApi { abstract get(city: string, iso: string): Observable<Weather>; }
export abstract class FactorsApi { abstract get(teamId: number): Observable<Factors>; }
