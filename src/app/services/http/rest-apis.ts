import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi } from '../contracts';
import { Fixture, TeamHistory, RefereeHistory } from '../../models/models';
import { environment as env } from '../../../environments/environment';

/**
 * Adaptador para una API de fútbol propia. Solo hay que cambiar environment.api.baseUrl.
 * El formato de las respuestas está en docs/API-CONTRACT.md
 */
const base = () => env.api.baseUrl.replace(/\/+$/, '');
const hdr = () => new HttpHeaders(env.api.headers);

const NEUTRAL_REF = { matches: 0, avgYellow: 4.5, avgRed: 0.2, penaltiesPerMatch: 0.3, homeWinPct: 0.45 };

function toFixture(m: any, i: number): Fixture {
  const need = <T>(v: T | null | undefined, field: string): T => {
    if (v == null) throw new Error(`La API devolvió el partido ${i + 1} sin "${field}" (ver docs/API-CONTRACT.md)`);
    return v;
  };
  const home = need(m.home?.name, 'home.name');
  return {
    id: need(m.id, 'id'), position: m.position ?? i + 1,
    home, away: need(m.away?.name, 'away.name'),
    homeId: need(m.home?.id, 'home.id'), awayId: need(m.away?.id, 'away.id'),
    kickoff: need(m.kickoff, 'kickoff'), referee: m.referee ?? null,
    city: m.city ?? home, stadium: m.stadium ?? '', league: m.league ?? ''
  };
}

@Injectable() export class RestFixturesApi extends FixturesApi {
  private http = inject(HttpClient);
  getJornada(date: string): Observable<Fixture[]> {
    return this.http.get<any>(`${base()}/quiniela`, { params: { date }, headers: hdr() }).pipe(
      map(r => {
        const list = Array.isArray(r) ? r : r?.matches;
        if (!Array.isArray(list)) throw new Error('GET /quiniela debe devolver { "matches": [...] } (ver docs/API-CONTRACT.md)');
        return list.map(toFixture).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      })
    );
  }
}

@Injectable() export class RestTeamHistoryApi extends TeamHistoryApi {
  private http = inject(HttpClient);
  get(teamId: number): Observable<TeamHistory> {
    return this.http.get<any>(`${base()}/teams/${teamId}/history`, { params: { limit: env.api.historyLimit }, headers: hdr() }).pipe(
      map(r => ({ teamId, matches: (r?.matches ?? []).map((m: any) => ({
        home: !!m.home, goalsFor: Number(m.goalsFor) || 0, goalsAgainst: Number(m.goalsAgainst) || 0 })) })),
      catchError(err => { console.warn('[api] historial no disponible para el equipo', teamId, err.status ?? err); return of({ teamId, matches: [] }); })
    );
  }
}

@Injectable() export class RestRefereeHistoryApi extends RefereeHistoryApi {
  private http = inject(HttpClient);
  get(referee: string | null): Observable<RefereeHistory> {
    const neutral: RefereeHistory = { referee, ...NEUTRAL_REF };
    if (!referee) return of(neutral);
    return this.http.get<any>(`${base()}/referees/${encodeURIComponent(referee)}/stats`, { headers: hdr() }).pipe(
      map(r => ({ referee, matches: r.matches ?? 0, avgYellow: r.avgYellow ?? NEUTRAL_REF.avgYellow, avgRed: r.avgRed ?? NEUTRAL_REF.avgRed,
        penaltiesPerMatch: r.penaltiesPerMatch ?? NEUTRAL_REF.penaltiesPerMatch, homeWinPct: r.homeWinPct ?? NEUTRAL_REF.homeWinPct })),
      catchError(() => of(neutral)) // 404 u otro error: árbitro neutro
    );
  }
}