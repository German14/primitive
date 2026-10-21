import { Provider } from '@angular/core';
import { environment } from '../../environments/environment';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from './contracts';
import * as M from './mock/mock-apis';
import * as H from './http/http-apis';
import * as R from './http/rest-apis';

const src = environment.dataSource;
const by = (mock: any, rest: any, fd: any) => src === 'mock' ? mock : src === 'rest' ? rest : fd;

export const providers: Provider[] = [
  { provide: FixturesApi, useClass: by(M.MockFixturesApi, R.RestFixturesApi, H.HttpFixturesApi) },
  { provide: TeamHistoryApi, useClass: by(M.MockTeamHistoryApi, R.RestTeamHistoryApi, H.HttpTeamHistoryApi) },
  { provide: RefereeHistoryApi, useClass: by(M.MockRefereeHistoryApi, R.RestRefereeHistoryApi, H.HttpRefereeHistoryApi) },
  { provide: WeatherApi, useClass: src === 'mock' ? M.MockWeatherApi : H.HttpWeatherApi },   // Open-Meteo
  { provide: FactorsApi, useClass: src === 'mock' ? M.MockFactorsApi : H.HttpFactorsApi }
];