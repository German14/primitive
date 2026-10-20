import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap, of } from 'rxjs';
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

  predictions(): Observable<any[]> {
    return this.fixtures.getWeekend().pipe(
      switchMap((list: any) => {
        if (!list || list.length === 0) {
          return of([]);
        }
        
        const requests = list.map((f: any) =>
          forkJoin({
            hh: this.teams.get(f.homeId), 
            ah: this.teams.get(f.awayId), 
            ref: this.refs.get(f.referee),
            w: this.weather.get(f.city, f.kickoff), 
            fh: this.factors.get(f.homeId), 
            fa: this.factors.get(f.awayId)
          }).pipe(
            map((d: any) => predict(f, d.hh, d.ah, d.ref, d.w, d.fh, d.fa))
          )
        );

        return forkJoin(requests);
      })
    ) as Observable<any[]>; // <-- Forzar el tipo aquí evita que TypeScript reclame por 'unknown'
  }
}
