import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, of, catchError, shareReplay, switchMap } from 'rxjs';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from '../contracts';
import { Fixture, TeamHistory, RefereeHistory, Weather, Factors } from '../../models/models';
import { environment as env } from '../../../environments/environment';
import { FootballClient, readCache, writeCache } from './football-client';

const cfg = env.apiFootball;
const MADRID = 'Europe/Madrid';
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: MADRID }).format(d);

/** Ventana del "fin de semana": del viernes al lunes más cercanos (o los que estén en curso). */
function weekendWindow(now = new Date()): { from: string; to: string } {
  const dow = now.getDay(); // 0=dom
  const toFri = dow === 0 ? -2 : dow === 6 ? -1 : (5 - dow + 7) % 7;
  const from = new Date(now); from.setDate(now.getDate() + Math.max(toFri, 0));
  const to = new Date(from); to.setDate(from.getDate() + (toFri < 0 ? 3 + toFri : 3));
  return { from: ymd(from), to: ymd(to) };
}

/** Partidos terminados de las ligas y temporadas configuradas. 4 llamadas, cacheadas y compartidas. */
@Injectable({ providedIn: 'root' })
export class SeasonData {
  private api = inject(FootballClient);
  readonly finished$: Observable<any[]> = forkJoin(
    cfg.leagues.flatMap(l => [cfg.season, cfg.season - 1].map(s =>
      this.api.get('/fixtures', { league: l, season: s, status: 'FT' }).pipe(catchError(() => of([] as any[])))))
  ).pipe(map(parts => parts.flat()), shareReplay(1));
}

@Injectable() export class HttpFixturesApi extends FixturesApi {
  private api = inject(FootballClient);
  getWeekend(): Observable<Fixture[]> {
    const toFixture = (r: any): Fixture => ({
      id: r.fixture.id, home: r.teams.home.name, away: r.teams.away.name,
      homeId: r.teams.home.id, awayId: r.teams.away.id,
      referee: (r.fixture.referee ?? '').split(',')[0].trim() || null,
      kickoff: r.fixture.date, city: r.fixture.venue?.city ?? r.teams.home.name,
      stadium: r.fixture.venue?.name ?? '', league: r.league.name
    });
    if (cfg.fixtureIds.length) {
      return this.api.get('/fixtures', { ids: cfg.fixtureIds.join('-') }).pipe(map(rs => rs.map(toFixture)));
    }
    const { from, to } = weekendWindow();
    return forkJoin(cfg.leagues.map(l =>
      this.api.get('/fixtures', { league: l, season: cfg.season, from, to, timezone: MADRID }))
    ).pipe(map(byLeague => {
      const all = byLeague.map(rs => rs.map(toFixture).sort((a, b) => a.kickoff.localeCompare(b.kickoff)));
      // Primero la liga principal (hasta 10), el resto se completa con las demás hasta totalMatches.
      const picked = [...all[0].slice(0, 10), ...all.slice(1).flat()].slice(0, cfg.totalMatches);
      return picked.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    }));
  }
}

@Injectable() export class HttpTeamHistoryApi extends TeamHistoryApi {
  private season = inject(SeasonData);
  get(teamId: number): Observable<TeamHistory> {
    return this.season.finished$.pipe(map(all => ({
      teamId,
      matches: all.filter(r => r.teams.home.id === teamId || r.teams.away.id === teamId)
        .sort((a, b) => b.fixture.date.localeCompare(a.fixture.date))
        .slice(0, cfg.historyMatches)
        .map(r => {
          const home = r.teams.home.id === teamId;
          return { home, goalsFor: (home ? r.goals.home : r.goals.away) ?? 0, goalsAgainst: (home ? r.goals.away : r.goals.home) ?? 0 };
        })
    })));
  }
}

const NEUTRAL_REF = { matches: 0, avgYellow: 4.5, avgRed: 0.2, penaltiesPerMatch: 0.3, homeWinPct: 0.45 };

@Injectable() export class HttpRefereeHistoryApi extends RefereeHistoryApi {
  private season = inject(SeasonData);
  private api = inject(FootballClient);
  private memo = new Map<string, Observable<RefereeHistory>>();

  get(referee: string | null): Observable<RefereeHistory> {
    if (!referee) return of({ referee, ...NEUTRAL_REF });
    if (!this.memo.has(referee)) this.memo.set(referee, this.load(referee).pipe(shareReplay(1)));
    return this.memo.get(referee)!;
  }

  private load(name: string): Observable<RefereeHistory> {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    return this.season.finished$.pipe(switchMap(all => {
      const mine = all.filter(r => r.fixture.referee && norm(r.fixture.referee).startsWith(norm(name)))
        .sort((a, b) => b.fixture.date.localeCompare(a.fixture.date));
      const n = mine.length;
      const homeWins = mine.filter(r => r.teams.home.winner === true).length;
      // Suavizado hacia la media (0.45) con 10 partidos "virtuales" para árbitros con pocos datos.
      const homeWinPct = (homeWins + 0.45 * 10) / (n + 10);
      const ids = mine.slice(0, cfg.refereeSampleMatches).map(r => r.fixture.id);
      if (!ids.length) return of({ referee: name, ...NEUTRAL_REF, homeWinPct });
      return this.api.get('/fixtures', { ids: ids.join('-') }).pipe(
        map(rs => {
          let y = 0, red = 0, pen = 0;
          for (const r of rs) for (const e of r.events ?? []) {
            if (e.type === 'Card') e.detail === 'Yellow Card' ? y++ : red++;
            else if (e.type === 'Goal' && e.detail === 'Penalty') pen++;
            else if (e.type === 'Var' && /Penalty/i.test(e.detail ?? '')) pen++;
          }
          const k = Math.max(rs.length, 1);
          return { referee: name, matches: n, avgYellow: y / k, avgRed: red / k, penaltiesPerMatch: pen / k, homeWinPct };
        }),
        catchError(() => of({ referee: name, matches: n, ...{ avgYellow: 4.5, avgRed: 0.2, penaltiesPerMatch: 0.3 }, homeWinPct }))
      );
    }));
  }
}

/** Open-Meteo: geocodificación por ciudad + previsión horaria. Gratis, sin clave. */
@Injectable() export class HttpWeatherApi extends WeatherApi {
  private http = inject(HttpClient);
  get(city: string, iso: string): Observable<Weather> {
    const d = new Date(iso);
    const day = ymd(d);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: MADRID, hour: '2-digit', hourCycle: 'h23' }).format(d));
    const key = `wx:${city}:${iso}`;
    const hit = readCache<Weather>(key, 3 * 3600_000);
    if (hit) return of(hit);
    const neutral: Weather = { rainMm: 0, windKmh: 10, tempC: 15 };
    return this.http.get<any>('https://geocoding-api.open-meteo.com/v1/search', { params: { name: city, count: 1, language: 'es', countryCode: 'ES' } }).pipe(
      switchMap(g => {
        const p = g.results?.[0]; if (!p) return of(neutral);
        return this.http.get<any>('https://api.open-meteo.com/v1/forecast', { params: {
          latitude: p.latitude, longitude: p.longitude, hourly: 'temperature_2m,precipitation,wind_speed_10m',
          start_date: day, end_date: day, timezone: MADRID } }).pipe(map(r => {
          const w: Weather = { tempC: r.hourly.temperature_2m[hour], rainMm: r.hourly.precipitation[hour], windKmh: r.hourly.wind_speed_10m[hour] };
          writeCache(key, w); return w;
        }));
      }),
      catchError(() => of(neutral))
    );
  }
}

/** Corrupción / economía: solo lo que pongas en environment.manualFactors. */
@Injectable() export class HttpFactorsApi extends FactorsApi {
  get(teamId: number): Observable<Factors> { return of(env.manualFactors[teamId] ?? { corruption: 0, economic: 0 }); }
}
