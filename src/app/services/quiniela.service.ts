import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, concat, forkJoin, map, of, switchMap } from 'rxjs';
import { FixturesApi, TeamHistoryApi, TeamCardStatsApi, RefereeHistoryApi, WeatherApi, FactorsApi } from './contracts';
import { Prediction } from '../models/models';
import { predict } from '../prediction/model';

@Injectable({ providedIn: 'root' })
export class QuinielaService {
  private fixtures = inject(FixturesApi);
  private teams = inject(TeamHistoryApi);
  private cards = inject(TeamCardStatsApi);
  private refs = inject(RefereeHistoryApi);
  private weather = inject(WeatherApi);
  private factors = inject(FactorsApi);

  /** Predicciones de la jornada (14 partidos + pleno al 15) de la fecha indicada (YYYY-MM-DD). */
  predictions(date: string, jornada?: number, temporada?: number): Observable<Prediction[]> {
    return this.fixtures.getJornada(date, jornada, temporada).pipe(
      switchMap((list:any[]) => {
        if (!list.length) return of([] as Prediction[]);
        const predictions = list.slice(0, 15).map((f, i) => {
          const fx = { ...f, position: f.position ?? i + 1 };
          return forkJoin({
            hh: this.teams.get(fx.homeId, fx.home, fx.league), ah: this.teams.get(fx.awayId, fx.away, fx.league), ref: this.refs.get(fx.referee),
            w: this.weather.get(fx.city, fx.kickoff),
            fh: this.factors.get(fx.homeId), fa: this.factors.get(fx.awayId)
          }).pipe(switchMap(d => {
            const prediction = predict(fx, d.hh, d.ah, d.ref, d.w, d.fh, d.fa);
            if (!fx.league.startsWith('Quiniela') && fx.league !== 'LaLiga') return of(prediction);
            return concat(
              of(prediction),
              forkJoin({
                homeCards: this.cards.get(fx.home, fx.kickoff, fx.league),
                awayCards: this.cards.get(fx.away, fx.kickoff, fx.league)
              }).pipe(map(cards => predict(fx, d.hh, d.ah, d.ref, d.w, d.fh, d.fa, cards.homeCards, cards.awayCards)))
            );
          }));
        });
        return combineLatest(predictions);
      })
    );
  }
}