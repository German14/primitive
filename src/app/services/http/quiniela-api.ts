import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';
import { environment as env } from '../../../environments/environment';
import { Fixture, TeamHistory } from '../../models/models';
import { FixturesApi, TeamHistoryApi } from '../contracts';
import { normalizeTeamName, teamCity } from '../../util/team-names';
import { FootballClient } from './football-client';
import { SeasonData } from './http-apis';

interface QuinielaMatch {
  num: number;
  local: string;
  visitante: string;
  division: number;
  dia: string;
  hora: string;
  id_besoccer?: number | null;
}

interface QuinielaResponse {
  temporada: number;
  jornada: string | number;
  fecha_jornada: number;
  partidos: QuinielaMatch[];
}

const MADRID = 'Europe/Madrid';

function teamKey(name: string): number {
  let hash = 2166136261;
  for (const char of name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) || 1;
}

function madridDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MADRID }).format(new Date(timestamp * 1000));
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function matchDate(baseDate: string, day: string): string {
  const weekdays: Record<string, number> = {
    DOM: 0, DOMINGO: 0, LUN: 1, LUNES: 1, MAR: 2, MARTES: 2,
    MIE: 3, MIÉ: 3, MIERCOLES: 3, JUE: 4, JUEVES: 4,
    VIE: 5, VIERNES: 5, SAB: 6, SÁB: 6, SABADO: 6, SÁBADO: 6
  };
  const target = weekdays[day.trim().toUpperCase()];
  if (target == null) throw new Error(`Día de partido no reconocido por la API de quiniela: ${day}`);
  let offset = (target - weekday(baseDate) + 7) % 7;
  if (offset > 3) offset -= 7;
  const date = new Date(`${baseDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function madridDateTimeToIso(date: string, time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    throw new Error(`Hora de partido no válida en la API de quiniela: ${time}`);
  }
  const [year, month, day] = date.split('-').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(localAsUtc));
  const part = (type: string) => Number(parts.find(value => value.type === type)?.value);
  const representedAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  return new Date(localAsUtc - (representedAsUtc - localAsUtc)).toISOString();
}

@Injectable()
export class QuinielaFixturesApi extends FixturesApi {
  private http = inject(HttpClient);

  getJornada(_date: string, jornada = env.quiniela.jornada, temporada = env.quiniela.temporada): Observable<Fixture[]> {
    return this.http.get<QuinielaResponse>(env.quiniela.baseUrl, {
      params: { num_jornada: jornada, num_temporada: temporada }
    }).pipe(map(response => {
      if (!Array.isArray(response?.partidos) || response.partidos.length !== 15) {
        throw new Error(`La API de La Quiniela debe devolver 15 partidos; devolvió ${response?.partidos?.length ?? 0}.`);
      }
      if (Number(response.temporada) !== temporada || Number(response.jornada) !== jornada) {
        throw new Error(`La API devolvió una jornada distinta a la solicitada (${temporada}, jornada ${jornada}).`);
      }
      const positions = new Set(response.partidos.map(match => match.num));
      if (positions.size !== 15 || Array.from({ length: 15 }, (_, index) => index + 1).some(position => !positions.has(position))) {
        throw new Error('La API de La Quiniela no devolvió posiciones únicas del 1 al 15.');
      }
      if (!Number.isFinite(response.fecha_jornada) || response.fecha_jornada <= 0) {
        throw new Error('La API de La Quiniela no devolvió una fecha válida para la jornada.');
      }
      const baseDate = madridDate(response.fecha_jornada);
      return [...response.partidos]
        .sort((a, b) => a.num - b.num)
        .map((match): Fixture => {
          if (!match.local?.trim() || !match.visitante?.trim() || !Number.isInteger(match.num) || match.num < 1 || match.num > 15) {
            throw new Error(`El partido ${match.num} de la API de quiniela no tiene número o equipos válidos.`);
          }
          const date = matchDate(baseDate, match.dia);
          return {
            id: match.id_besoccer ?? match.num,
            position: match.num,
            home: match.local,
            away: match.visitante,
            homeId: teamKey(match.local),
            awayId: teamKey(match.visitante),
            referee: null,
            kickoff: madridDateTimeToIso(date, match.hora),
            city: teamCity(match.local),
            stadium: '',
            league: `Quiniela división ${match.division}`
          };
        });
    }));
  }
}

@Injectable()
export class QuinielaTeamHistoryApi extends TeamHistoryApi {
  private football = inject(FootballClient);
  private season = inject(SeasonData);
  private teamDirectory$ = this.football.get('/competitions/PD/teams')
    .pipe(map(response => response?.teams ?? []), shareReplay(1));

  get(teamId: number, teamName = '', league = ''): Observable<TeamHistory> {
    if (league !== 'Quiniela división 1') return of({ teamId, matches: [] });
    return forkJoin({ teams: this.teamDirectory$, matches: this.season.finished$ }).pipe(map(({ teams, matches }) => {
      const name = normalizeTeamName(teamName);
      const team = teams.find((item: any) => normalizeTeamName(item?.shortName ?? item?.name ?? '') === name);
      if (!team?.id) {
        console.warn('[historial] equipo de la quiniela no identificado en football-data.org:', teamName);
        return { teamId, matches: [] };
      }
      return {
        teamId,
        matches: matches.filter((match: any) => match.homeTeam.id === team.id || match.awayTeam.id === team.id)
          .sort((a: any, b: any) => b.utcDate.localeCompare(a.utcDate))
          .slice(0, 10)
          .map((match: any) => {
            const home = match.homeTeam.id === team.id;
            const score = match.score.fullTime;
            return {
              home,
              goalsFor: (home ? score.home : score.away) ?? 0,
              goalsAgainst: (home ? score.away : score.home) ?? 0
            };
          })
      };
    }), catchError(err => {
      console.warn('[historial] no se pudo cargar football-data.org para', teamName, err?.status ?? err);
      return of({ teamId, matches: [] });
    }));
  }
}
