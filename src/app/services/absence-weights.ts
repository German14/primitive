import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { Absence } from '../models/models';
import { DataStore } from './data-store';
import { findTeam, teamTokenKey } from '../util/team-names';

interface StatRow { player: string; teamSlug: string | null; value: number | null; }
interface StatFile { rows: StatRow[]; }
interface ClubsFile { clubs: { slug: string; name: string }[]; }

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
const significant = (s: string) => normalize(s).split(' ').filter(t => t.length > 1);

/** "Mbappé" coincide con "Kylian Mbappé": los términos del nombre más corto están en el más largo (se ignoran las iniciales). */
export function samePlayer(a: string, b: string): boolean {
  const ta = significant(a), tb = significant(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every(t => long.includes(t));
}

/** Importancia (0..1) de un jugador = su parte de goles + asistencias del equipo. 0.15 base + 2.5 × cuota, máximo 1. */
export function weightFromShare(share: number): number { return Math.min(1, 0.15 + 2.5 * share); }

@Injectable({ providedIn: 'root' })
export class AbsenceWeights {
  private store = inject(DataStore);

  /** Rellena `weight` de las bajas que no lo traen, usando goleadores y asistentes (JSON de public/data). Si no hay datos, no cambia nada. */
  enrich(teamName: string, absences: Absence[]): Observable<Absence[]> {
    if (!absences.some(a => a.weight == null)) return of(absences);
    return forkJoin([
      this.store.get<ClubsFile>('clubs.json'),
      ...['primera', 'segunda'].flatMap(d => ['goleadores', 'asistencias'].map(s => this.store.get<StatFile>(`stats/${d}/${s}.json`)))
    ]).pipe(map(([clubs, ...stats]) => {
      const club = clubs ? findTeam(clubs.clubs, teamName) : undefined;
      if (!club) return absences;
      const rows = stats.flatMap(s => s?.rows ?? []).filter(r => r.teamSlug === club.slug && r.value != null);
      const total = rows.reduce((sum, r) => sum + (r.value as number), 0);
      if (!total) return absences;
      return absences.map(a => {
        if (a.weight != null) return a;
        const mine = rows.filter(r => samePlayer(r.player, a.player)).reduce((sum, r) => sum + (r.value as number), 0);
        return mine ? { ...a, weight: weightFromShare(mine / total) } : a;
      });
    }));
  }
}
