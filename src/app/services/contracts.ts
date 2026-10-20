import { Observable } from 'rxjs';
import { Fixture, TeamHistory, RefereeHistory, Weather, Factors } from '../models/models';

// Cada contrato tiene una versión Mock y otra Http. Para tus APIs solo tocas services/http/*.
export abstract class FixturesApi { abstract getWeekend(): Observable<Fixture[]>; }
export abstract class TeamHistoryApi { abstract get(teamId: number): Observable<TeamHistory>; }
export abstract class RefereeHistoryApi { abstract get(refereeId: number): Observable<RefereeHistory>; }
export abstract class WeatherApi { abstract get(lat: number, lon: number, iso: string): Observable<Weather>; }
export abstract class FactorsApi { abstract get(teamId: number): Observable<Factors>; }
