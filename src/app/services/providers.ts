import { Provider, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { TeamCardStats } from '../models/models';
import { environment } from '../../environments/environment';
import { FixturesApi, TeamHistoryApi, TeamCardStatsApi, RefereeHistoryApi, WeatherApi, FactorsApi, AbsencesApi } from './contracts';
import * as A from './http/absences-apis';
import * as M from './mock/mock-apis';
import * as H from './http/http-apis';
import * as R from './http/rest-apis';
import * as Q from './http/quiniela-api';

/** Sin estadísticas de tarjetas: no llama a ninguna API. */
@Injectable() class NoTeamCardStatsApi extends TeamCardStatsApi {
  get(): Observable<TeamCardStats | null> { return of(null); }
}

const src = environment.dataSource;
const absencesApi = environment.absences.source === 'rest' ? A.RestAbsencesApi
  : environment.absences.source === 'none' ? A.NoAbsencesApi : A.ManualAbsencesApi;
const by = (mock: any, rest: any, fd: any) => src === 'mock' ? mock : src === 'rest' ? rest : fd;

export const providers: Provider[] = [
  { provide: FixturesApi, useClass: src === 'quiniela' ? Q.QuinielaFixturesApi : by(M.MockFixturesApi, R.RestFixturesApi, H.HttpFixturesApi) },
  { provide: TeamHistoryApi, useClass: src === 'quiniela' ? Q.QuinielaTeamHistoryApi : by(M.MockTeamHistoryApi, R.RestTeamHistoryApi, H.HttpTeamHistoryApi) },
  { provide: TeamCardStatsApi, useClass: src === 'mock' ? M.MockTeamCardStatsApi : environment.cardStats.enabled ? H.HttpTeamCardStatsApi : NoTeamCardStatsApi },
  { provide: RefereeHistoryApi, useClass: by(M.MockRefereeHistoryApi, R.RestRefereeHistoryApi, H.HttpRefereeHistoryApi) },
  { provide: WeatherApi, useClass: src === 'mock' ? M.MockWeatherApi : H.HttpWeatherApi },   // Open-Meteo
  { provide: AbsencesApi, useClass: absencesApi },
  { provide: FactorsApi, useClass: src === 'mock' ? M.MockFactorsApi : H.HttpFactorsApi }
];