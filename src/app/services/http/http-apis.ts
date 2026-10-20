import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from '../contracts';
import { Fixture, TeamHistory, RefereeHistory, Weather, Factors } from '../../models/models';
import { environment as env } from '../../../environments/environment';

const h = (o: Record<string, string>) => new HttpHeaders(o);

// En cada servicio: 1) pon la URL en environment.ts  2) adapta el map() al JSON de tu API.

@Injectable() export class HttpFixturesApi extends FixturesApi {
  private http = inject(HttpClient);
  getWeekend(): Observable<Fixture[]> {
    return this.http.get<any>(env.api.fixtures.url, { headers: h(env.api.fixtures.headers) })
      .pipe(map((r:any) => r as Fixture[])); // TODO: mapear tu respuesta a Fixture[]
  }
}
@Injectable() export class HttpTeamHistoryApi extends TeamHistoryApi {
  private http = inject(HttpClient);
  get(teamId: number): Observable<TeamHistory> {
    return this.http.get<any>(env.api.teamHistory.url.replace('{teamId}', `${teamId}`), { headers: h(env.api.teamHistory.headers) })
      .pipe(map((r:any) => ({ teamId, matches: (r.matches ?? []).map((m: any) => ({
        // TODO: adaptar campos
        goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, home: m.home })) })));
  }
}
@Injectable() export class HttpRefereeHistoryApi extends RefereeHistoryApi {
  private http = inject(HttpClient);
  get(refereeId: number): Observable<RefereeHistory> {
    return this.http.get<any>(env.api.refereeHistory.url.replace('{refereeId}', `${refereeId}`), { headers: h(env.api.refereeHistory.headers) })
      .pipe(map((r:any) => ({ refereeId, matches: r.matches, avgYellow: r.avgYellow, avgRed: r.avgRed,
        penaltiesPerMatch: r.penaltiesPerMatch, homeWinPct: r.homeWinPct }))); // TODO: adaptar
  }
}
// Open-Meteo ya está listo: https://open-meteo.com/en/docs (gratis, sin clave)
@Injectable() export class HttpWeatherApi extends WeatherApi {
  private http = inject(HttpClient);
  get(lat: number, lon: number, iso: string): Observable<Weather> {
    const day = iso.slice(0, 10), hour = new Date(iso).getHours();
    const url = `${env.api.weather.url}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m&start_date=${day}&end_date=${day}`;
    return this.http.get<any>(url).pipe(map((r:any) => ({
      tempC: r.hourly.temperature_2m[hour], rainMm: r.hourly.precipitation[hour], windKmh: r.hourly.wind_speed_10m[hour] })));
  }
}
// Sin API pública: mientras no tengas una, devuelve neutro.
@Injectable() export class HttpFactorsApi extends FactorsApi {
  get(_teamId: number): Observable<Factors> { return of({ corruption: 0, economic: 0 }); }
}
