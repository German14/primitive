import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, of, catchError, shareReplay, switchMap } from 'rxjs';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from '../contracts';
import { Fixture, TeamHistory, RefereeHistory, Weather, Factors } from '../../models/models';
import { environment as env } from '../../../environments/environment';
import { FootballClient, readCache, writeCache } from './football-client';
import { MADRID, ymd, weekendWindow } from '../../util/dates';

const cfg = env.footballData;


/** "Avenida X 1 28036 Madrid" o "28036 Madrid" -> "Madrid". Sirve para geocodificar el clima. */
function cityFromAddress(address: string | null | undefined, fallback: string): string {
  if (!address) return fallback;
  const m = address.match(/\b\d{5}\s+([^,\d]+)/) ?? address.match(/([^,\d]+?)\s+\d{5}\b/);
  return (m?.[1] ?? fallback).trim();
}

/** Partidos terminados de LaLiga (temporada actual): 1 llamada, compartida por todos los equipos. */
@Injectable({ providedIn: 'root' })
export class SeasonData {
  private api = inject(FootballClient);
  readonly finished$: Observable<any[]> = this.api
    .get(`/competitions/${cfg.competition}/matches`, { status: 'FINISHED' })
    .pipe(map(r => r.matches as any[]), shareReplay(1));
}

@Injectable() export class HttpFixturesApi extends FixturesApi {
  private api = inject(FootballClient);
   getJornada(date: string): Observable<Fixture[]> {
    const { from, to } = weekendWindow(date);
    const dayAfter = ymd(new Date(new Date(to + 'T12:00:00').getTime() + 86_400_000));
    return forkJoin({
      matches: this.api.get(`/competitions/${cfg.competition}/matches`, { dateFrom: from, dateTo: dayAfter }),
      teams: this.api.get(`/competitions/${cfg.competition}/teams`)
    }).pipe(map(({ matches, teams }) => {
      const byId = new Map<number, any>((teams.teams as any[]).map(t => [t.id, t]));
      return (matches.matches as any[])
        .filter(m => ymd(new Date(m.utcDate)) <= to)
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
        .slice(0, cfg.totalMatches)
        .map((m): Fixture => {
          const home = byId.get(m.homeTeam.id);
          const name = m.homeTeam.shortName ?? m.homeTeam.name;
          return {
            id: m.id, home: name, away: m.awayTeam.shortName ?? m.awayTeam.name,
            homeId: m.homeTeam.id, awayId: m.awayTeam.id,
            referee: null,                       // por ahora árbitro neutro
            kickoff: m.utcDate, city: cityFromAddress(home?.address, name),
            stadium: home?.venue ?? '', league: 'LaLiga'
          };
        });
    }));
  }
}

@Injectable() export class HttpTeamHistoryApi extends TeamHistoryApi {
  private season = inject(SeasonData);
  get(teamId: number): Observable<TeamHistory> {
    return this.season.finished$.pipe(map(all => ({
      teamId,
      matches: all.filter(m => m.homeTeam.id === teamId || m.awayTeam.id === teamId)
        .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
        .slice(0, cfg.historyMatches)
        .map(m => {
          const home = m.homeTeam.id === teamId;
          const ft = m.score.fullTime;
          return { home, goalsFor: (home ? ft.home : ft.away) ?? 0, goalsAgainst: (home ? ft.away : ft.home) ?? 0 };
        })
    })));
  }
}

/** Árbitro neutro (sin efecto en la predicción) hasta que haya una fuente gratuita fiable. */
@Injectable() export class HttpRefereeHistoryApi extends RefereeHistoryApi {
  get(referee: string | null): Observable<RefereeHistory> {
    return of({ referee, matches: 0, avgYellow: 4.5, avgRed: 0.2, penaltiesPerMatch: 0.3, homeWinPct: 0.45 });
  }
}

/**
 * Open-Meteo (gratis, sin clave). Elige el endpoint según la fecha del partido:
 *  - hasta 16 días en el futuro (y unos pocos días atrás): /v1/forecast
 *  - fechas pasadas (más de 5 días): archive-api (reanálisis)
 *  - más allá de 16 días: sin previsión (null). NUNCA se inventan valores.
 */
@Injectable() export class HttpWeatherApi extends WeatherApi {
  private http = inject(HttpClient);

  private geocode(city: string): Observable<{ latitude: number; longitude: number; name: string } | null> {
    const candidates = [...new Set([city, city.replace(/\(.*\)/, '').trim(), city.split(/[-,/]/)[0].trim()])].filter(Boolean);
    const tryNext = (i: number): Observable<any> => i >= candidates.length ? of(null) :
      this.http.get<any>('https://geocoding-api.open-meteo.com/v1/search', { params: { name: candidates[i].trim(), count: 1, language: 'es', countryCode: 'ES' } })
        .pipe(switchMap(g => g.results?.[0] ? of(g.results[0]) : tryNext(i + 1)));
    return tryNext(0);
  }

  get(city: string, iso: string): Observable<any | null> {
    const d = new Date(iso);
    const day = ymd(d);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: MADRID, hour: '2-digit', hourCycle: 'h23' }).format(d));
    const daysAhead = (d.getTime() - Date.now()) / 86_400_000;
    if (daysAhead > 15) return of(null);
    const archive = daysAhead < -5;
    const key = `wx2:${city}:${iso}`;
    console.log(city)
    const hit = readCache<Weather>(key, 3 * 3600_000);
    if (hit) return of(hit);
    let cityReal:string;
    if (city.split('s/n ').length === 1) {
      cityReal = city.split('s/n ')[0]
    } else {
      cityReal = city.split('s/n ')[1]
    }
    return this.geocode(cityReal).pipe(
      switchMap(p => {
        if (!p) { console.warn('[clima] ciudad no encontrada:', city); return of(null); }
        const url = archive ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
        return this.http.get<any>(url, { params: {
          latitude: p.latitude, longitude: p.longitude, hourly: 'temperature_2m,precipitation,wind_speed_10m',
          start_date: day, end_date: day, timezone: MADRID } }).pipe(map(r => {
          const h = r.hourly;
          const w: any = { tempC: h.temperature_2m[hour], rainMm: h.precipitation[hour], windKmh: h.wind_speed_10m[hour],
            source: archive ? 'archive' : 'forecast', place: p.name };
          if ([w.tempC, w.rainMm, w.windKmh].some(v => v == null)) return null;
          writeCache(key, w); return w;
        }));
      }),
      catchError(err => { console.warn('[clima] Open-Meteo falló para', city, err); return of(null); })
    );
  }
}

/** Corrupción / economía: solo lo que pongas en environment.manualFactors. */
@Injectable() export class HttpFactorsApi extends FactorsApi {
  get(teamId: number): Observable<Factors> { return of(env.manualFactors[teamId] ?? { corruption: 0, economic: 0 }); }
}