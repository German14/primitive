import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { FixturesApi, TeamHistoryApi, RefereeHistoryApi, WeatherApi, FactorsApi } from './contracts';
import { Prediction } from '../models/models';
import { predict } from '../prediction/model';

@Injectable({ providedIn: 'root' })
export class QuinielaService {
  private fixtures = inject(FixturesApi);
  private teams = inject(TeamHistoryApi);
  private refs = inject(RefereeHistoryApi);
  private weather = inject(WeatherApi);
  private factors = inject(FactorsApi);

  /** Predicciones de la jornada (14 partidos + pleno al 15) de la fecha indicada (YYYY-MM-DD). */
  predictions(date: string): Observable<Prediction[]> {
    return this.fixtures.getJornada(date).pipe(
      switchMap((list:any[]) => {
        if (!list.length) return of([] as Prediction[]);
        return forkJoin(list.slice(0, 15).map((f, i) => {
          const fx = { ...f, position: f.position ?? i + 1 };
          return forkJoin({
            hh: this.teams.get(fx.homeId), ah: this.teams.get(fx.awayId), ref: this.refs.get(fx.referee),
            w: this.weather.get(fx.city, fx.kickoff), fh: this.factors.get(fx.homeId), fa: this.factors.get(fx.awayId)
          }).pipe(map(d => predict(fx, d.hh, d.ah, d.ref, d.w, d.fh, d.fa)));
        }));
      })
    );
  }
}