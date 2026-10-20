import { Provider } from '@angular/core';
import { environment } from '../../environments/environment';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from './contracts';
import * as M from './mock/mock-apis';
import * as H from './http/http-apis';

const pick = (mock: any, http: any) => environment.useMock ? mock : http;
export const providers: Provider[] = [
  { provide: FixturesApi, useClass: pick(M.MockFixturesApi, H.HttpFixturesApi) },
  { provide: TeamHistoryApi, useClass: pick(M.MockTeamHistoryApi, H.HttpTeamHistoryApi) },
  { provide: RefereeHistoryApi, useClass: pick(M.MockRefereeHistoryApi, H.HttpRefereeHistoryApi) },
  { provide: WeatherApi, useClass: pick(M.MockWeatherApi, H.HttpWeatherApi) },
  { provide: FactorsApi, useClass: pick(M.MockFactorsApi, H.HttpFactorsApi) }
];
