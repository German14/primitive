import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { AbsenceWeights } from './absence-weights';
import { TeamSeasonData } from './team-season-data';
import { FixturesApi } from './contracts';
import { Fixture, Factors, Prediction, RefereeHistory, TeamHistory } from '../models/models';
import { predict } from '../prediction/model';

@Injectable({ providedIn: 'root' })
export class QuinielaService {
  private fixtures = inject(FixturesApi);
  private seasonData = inject(TeamSeasonData);
  private absences = inject(AbsenceWeights);
  private readonly neutralFactors: Factors = { corruption: 0, economic: 0 };
  private readonly neutralReferee: RefereeHistory = {
    referee: null, matches: 0, avgYellow: 0, avgRed: 0, penaltiesPerMatch: 0.3, homeWinPct: 0.45
  };

  /** Predicciones de la jornada (14 partidos + pleno al 15) de la fecha indicada (YYYY-MM-DD). */
  predictions(date: string, jornada?: number, temporada?: number): Observable<Prediction[]> {
    return this.fixtures.getJornada(date, jornada, temporada).pipe(
      switchMap((list: Fixture[]) => {
        if (!list.length) return of([] as Prediction[]);
        const predictions = list.slice(0, 15).map((f, i) => {
          const fx = { ...f, position: f.position ?? i + 1 };
          return forkJoin({
            homeSeason: this.seasonData.get(fx.home, fx.league),
            awaySeason: this.seasonData.get(fx.away, fx.league),
            homeAbsences: this.absences.get(fx.home).pipe(switchMap(absences => this.absences.enrich(fx.home, absences))),
            awayAbsences: this.absences.get(fx.away).pipe(switchMap(absences => this.absences.enrich(fx.away, absences)))
          }).pipe(map(({ homeSeason, awaySeason, homeAbsences, awayAbsences }) => {
            const homeHistory: TeamHistory = { teamId: fx.homeId, matches: [] };
            const awayHistory: TeamHistory = { teamId: fx.awayId, matches: [] };
            return predict(
              fx, homeHistory, awayHistory, this.neutralReferee, null,
              this.neutralFactors, this.neutralFactors,
              null, null, homeAbsences, awayAbsences, homeSeason, awaySeason
            );
          }));
        });
        return forkJoin(predictions);
      })
    );
  }
}