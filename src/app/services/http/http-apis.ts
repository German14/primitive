import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, of, catchError, shareReplay, switchMap, defer, from, firstValueFrom, throwError } from 'rxjs';
import { FixturesApi, TeamHistoryApi, TeamCardStatsApi, RefereeHistoryApi, WeatherApi, FactorsApi } from '../contracts';
import { Fixture, TeamHistory, TeamCardStats, PlayerCardHistory, RefereeHistory, Weather, Factors } from '../../models/models';
import { environment as env } from '../../../environments/environment';
import { FootballClient, readCache, writeCache } from './football-client';
import { MADRID, ymd, weekendWindow } from '../../util/dates';
import { normalizeTeamName } from '../../util/team-names';

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

@Injectable() export class HttpTeamCardStatsApi extends TeamCardStatsApi {
  private http = inject(HttpClient);
  private pending = new Map<string, Observable<TeamCardStats | null>>();
  private teamsBySeason = new Map<string, Observable<Map<string, number>>>();
  private requestQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private blockedUntil = 0;
  private readonly minRequestGapMs = 6500;

  get(teamName: string, kickoff: string, division = 'LaLiga'): Observable<TeamCardStats | null> {
    const matchDate = new Date(kickoff);
    if (!teamName || Number.isNaN(matchDate.getTime())) return of(null);
    if (matchDate.getTime() < Date.now()) {
      console.warn('[tarjetas] no se usan estadísticas de temporada para un partido pasado:', teamName, kickoff);
      return of(null);
    }
    const league = this.leagueFor(division);
    if (!league) return of(null);
    const season = matchDate.getUTCMonth() >= 6 ? matchDate.getUTCFullYear() : matchDate.getUTCFullYear() - 1;
    const key = `${league}:${season}:${teamName}`;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const cached = readCache<TeamCardStats>(`apifootball:cards:${key}`, 24 * 3600_000);
    if (cached) return of(cached);

    const request = this.getTeams(league, season).pipe(
      switchMap(teams => {
        const teamId = this.findTeamId(teams, teamName);
        const resolvedTeam = teamId
          ? of(teamId)
          : this.searchTeamId(teamName, league, season);
        return resolvedTeam.pipe(switchMap(id => {
          if (!id) {
            console.warn(`[tarjetas] API-Football no identifica ${teamName} en la división ${division}`);
            return of(null);
          }
          return forkJoin({
            players: this.getPlayerPages(id, league, season),
            history: this.getTeamHistory(id, league, season)
          }).pipe(map(({ players, history }) => {
            const played = Math.max(0, ...players.map(player => player.appearances));
            const yellow = players.reduce((sum, player) => sum + player.yellow, 0);
            const red = players.reduce((sum, player) => sum + player.red, 0);
            if (!played || !players.length) {
              console.warn('[tarjetas] estadísticas incompletas para:', teamName);
              if (!history.length) return null;
            }
            const result = {
              matches: played,
              avgYellow: played ? yellow / played : null,
              avgRed: played ? red / played : null,
              players: players.filter(player => player.yellow > 0 || player.red > 0)
                .sort((a, b) => (b.red * 2 + b.yellow) - (a.red * 2 + a.yellow)),
              history
            };
            writeCache(`apifootball:cards:${key}`, result);
            return result;
          }));
        }));
      }),
      catchError(err => {
        this.pending.delete(key);
        console.warn('[tarjetas] API-Football no disponible para', teamName, err?.status ?? err);
        return of(null);
      }),
      shareReplay(1)
    );
    this.pending.set(key, request);
    return request;
  }

  private leagueFor(division: string): number | null {
    if (division === 'LaLiga' || division === 'Quiniela división 1') return 140;
    if (division === 'Quiniela división 2') return 141;
    if (division === 'Quiniela división 10') return 142;
    return null;
  }

  private getTeams(league: number, season: number): Observable<Map<string, number>> {
    const key = `${league}:${season}`;
    const existing = this.teamsBySeason.get(key);
    if (existing) return existing;
    const cacheKey = `apifootball:teams:${key}`;
    const cached = readCache<Record<string, number>>(cacheKey, 7 * 24 * 3600_000);
    if (cached) return of(new Map(Object.entries(cached).map(([name, id]) => [name, Number(id)])));

    const request = this.apiRequest<any>('/api/football/teams', { params: { league, season } }).pipe(
      map(response => {
        const teams = new Map<string, number>();
        for (const item of response?.response ?? []) {
          const id = Number(item?.team?.id);
          const name = item?.team?.name;
          if (Number.isFinite(id) && typeof name === 'string') teams.set(normalizeTeamName(name), id);
        }
        if (teams.size) writeCache(cacheKey, Object.fromEntries(teams));
        return teams;
      }),
      catchError(err => {
        this.teamsBySeason.delete(key);
        return throwError(() => err);
      }),
      shareReplay(1)
    );
    this.teamsBySeason.set(key, request);
    return request;
  }

  private searchTeamId(teamName: string, league: number, season: number): Observable<number | null> {
    const cacheKey = `apifootball:team-search:${league}:${season}:${normalizeTeamName(teamName)}`;
    const cached = readCache<number>(cacheKey, 7 * 24 * 3600_000);
    if (cached) return of(cached);
    return this.apiRequest<any>('/api/football/teams', { params: { search: normalizeTeamName(teamName) } }).pipe(
      map(response => {
        const target = normalizeTeamName(teamName);
        const candidates = (response?.response ?? []).map((item: any) => {
          const name = normalizeTeamName(item?.team?.name ?? '');
          const score = name === target ? 3 : name.endsWith(` ${target}`) ? 2
            : name.startsWith(`${target} `) ? 1 : name.includes(target) ? 1 : 0;
          return { id: Number(item?.team?.id), score };
        }).filter((candidate: { id: number; score: number }) => Number.isFinite(candidate.id) && candidate.score > 0)
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
        const id = candidates.length && candidates[0].score !== candidates[1]?.score ? candidates[0].id : null;
        if (id) writeCache(cacheKey, id);
        return id;
      })
    );
  }

  private getPlayerPages(team: number, league: number, season: number, page = 1, previous: PlayerCardHistory[] = []): Observable<PlayerCardHistory[]> {
    return this.apiRequest<any>('/api/football/players', { params: { team, league, season, page } }).pipe(
      switchMap(response => {
        const players = (response?.response ?? []).map((item: any): PlayerCardHistory | null => {
          const player = item?.player;
          const stats = item?.statistics?.[0];
          if (!player?.name || !stats) return null;
          return {
            name: player.name,
            appearances: Number(stats.games?.appearences) || 0,
            yellow: Number(stats.cards?.yellow) || 0,
            red: Number(stats.cards?.red) || 0
          };
        }).filter((player: PlayerCardHistory | null): player is PlayerCardHistory => player !== null);
        const accumulated = [...previous, ...players];
        const totalPages = Number(response?.paging?.total) || 1;
        return page < totalPages
          ? this.getPlayerPages(team, league, season, page + 1, accumulated)
          : of(accumulated);
      })
    );
  }

  private getTeamHistory(team: number, league: number, season: number): Observable<TeamHistory['matches']> {
    return this.apiRequest<any>('/api/football/fixtures', { params: { team, league, season, last: 10 } }).pipe(
      map(response => (response?.response ?? []).flatMap((match: any) => {
        const status = match?.fixture?.status?.short;
        const homeId = Number(match?.teams?.home?.id);
        const awayId = Number(match?.teams?.away?.id);
        const homeGoals = match?.goals?.home;
        const awayGoals = match?.goals?.away;
        if (!['FT', 'AET', 'PEN'].includes(status) || !Number.isFinite(homeId) || !Number.isFinite(awayId)
          || typeof homeGoals !== 'number' || typeof awayGoals !== 'number') return [];
        const isHome = homeId === team;
        return [{
          home: isHome,
          goalsFor: isHome ? homeGoals : awayGoals,
          goalsAgainst: isHome ? awayGoals : homeGoals
        }];
      }))
    );
  }

  private findTeamId(teams: Map<string, number>, teamName: string): number | null {
    const target = normalizeTeamName(teamName);
    const matches = [...teams.entries()]
      .map(([name, id]) => {
        const canonical = normalizeTeamName(name);
        return { id, score: canonical === target ? 3 : canonical.endsWith(` ${target}`) ? 2 : canonical.startsWith(`${target} `) ? 1 : 0 };
      })
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score);
    return matches.length && matches[0].score !== matches[1]?.score ? matches[0].id : null;
  }

  private apiRequest<T>(url: string, options: { params: Record<string, string | number> }): Observable<T> {
    return defer(() => {
      const result = this.requestQueue.then(async () => {
        if (this.blockedUntil > Date.now()) throw new Error('API-Football ha limitado temporalmente las peticiones');
        const delay = Math.max(0, this.nextRequestAt - Date.now());
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (this.blockedUntil > Date.now()) throw new Error('API-Football ha limitado temporalmente las peticiones');
        try {
          const response = await firstValueFrom(this.http.get<T>(url, options));
          this.nextRequestAt = Date.now() + this.minRequestGapMs;
          return response;
        } catch (err: any) {
          this.nextRequestAt = Date.now() + this.minRequestGapMs;
          if (err?.status === 429) {
            const retryAfter = Number(err.headers?.get('Retry-After'));
            this.blockedUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000);
          }
          throw err;
        }
      });
      this.requestQueue = result.then(() => undefined, () => undefined);
      return from(result);
    });
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
    const hit = readCache<Weather>(key, 3 * 3600_000);
    if (hit) return of(hit);
    return this.geocode(city).pipe(
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