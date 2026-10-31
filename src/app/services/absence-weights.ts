import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { Absence, AbsenceReason } from '../models/models';
import { DataStore } from './data-store';
import { findTeam, teamTokenKey } from '../util/team-names';

interface StatRow { player: string; teamSlug: string | null; value: number | null; }
interface StatFile { rows: StatRow[]; }
interface Club { division: string; slug: string; name: string; }
interface ClubsFile { clubs: Club[]; }
interface AbsencesFile { teams: Record<string, Absence[]>; }

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
const significant = (s: string) => normalize(s).split(' ').filter(t => t.length > 1);
const isAbsenceReason = (reason: unknown): reason is AbsenceReason =>
  reason === 'lesion' || reason === 'sancion' || reason === 'apercibido';

/** "Mbappé" coincide con "Kylian Mbappé": los términos del nombre más corto están en el más largo (se ignoran las iniciales). */
export function samePlayer(a: string, b: string): boolean {
  const ta = significant(a), tb = significant(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every(t => long.includes(t));
}

/** Importancia (0..1) estimada desde goles y asistencias ponderadas. */
export function weightFromShare(share: number): number { return Math.min(1, 0.15 + 2.5 * share); }

@Injectable({ providedIn: 'root' })
export class AbsenceWeights {
  private store = inject(DataStore);
  private absences$ = this.store.get<AbsencesFile>('bajas.json').pipe(
    map(file => {
      if (!file?.teams || typeof file.teams !== 'object' || Array.isArray(file.teams)) {
        console.warn('[bajas] public/data/bajas.json no existe o no contiene un objeto "teams" válido');
        return {};
      }
      return file.teams;
    }),
    shareReplay(1)
  );

  get(teamName: string): Observable<Absence[]> {
    return this.absences$.pipe(map(teams => {
      const teamKey = teamTokenKey(teamName);
      const entry = Object.entries(teams).find(([name]) => teamTokenKey(name) === teamKey);
      if (!entry) return [];
      if (!Array.isArray(entry[1])) {
        console.warn('[bajas] la lista de jugadores no es válida para', entry[0]);
        return [];
      }
      return entry[1].flatMap((absence): Absence[] => {
        if (!absence || typeof absence.player !== 'string' || !absence.player.trim() || !isAbsenceReason(absence.reason)) {
          console.warn('[bajas] registro inválido para', entry[0], absence);
          return [];
        }
        return [{
          ...absence,
          player: absence.player.trim(),
          weight: typeof absence.weight === 'number' && Number.isFinite(absence.weight)
            ? Math.max(0, Math.min(1, absence.weight)) : undefined
        }];
      });
    }));
  }

  /** Rellena pesos usando los rankings JSON de la misma división; los jugadores no listados reciben el peso base. */
  enrich(teamName: string, absences: Absence[]): Observable<Absence[]> {
    if (!absences.some(a => a.weight == null)) return of(absences);
    return forkJoin([
      this.store.get<ClubsFile>('clubs.json'),
    ]).pipe(switchMap(([clubs]) => {
      const club = clubs ? findTeam(clubs.clubs, teamName) : undefined;
      if (!club) return of(absences.map(a => ({ ...a, weight: a.weight ?? weightFromShare(0) })));
      const division = club.division === 'easports' ? 'primera'
        : club.division === 'hypermotion' ? 'segunda' : null;
      if (!division) return of(absences.map(a => ({ ...a, weight: a.weight ?? weightFromShare(0) })));
      return forkJoin([
        this.store.get<StatFile>(`stats/${division}/goleadores.json`),
        this.store.get<StatFile>(`stats/${division}/asistencias.json`)
      ]).pipe(map(stats => {
        const [goals, assists] = stats.map(file =>
          (file?.rows ?? []).filter(row => row.teamSlug === club.slug && row.value != null)
        );
        const contribution = (player: string) =>
          goals.filter(row => samePlayer(row.player, player)).reduce((sum, row) => sum + (row.value ?? 0), 0)
          + 0.4 * assists.filter(row => samePlayer(row.player, player)).reduce((sum, row) => sum + (row.value ?? 0), 0);
        const teamContribution = goals.reduce((sum, row) => sum + (row.value ?? 0), 0)
          + 0.4 * assists.reduce((sum, row) => sum + (row.value ?? 0), 0);
        return absences.map(a => {
          if (a.weight != null) return a;
          const mine = contribution(a.player);
          return { ...a, weight: teamContribution ? weightFromShare(mine / teamContribution) : weightFromShare(0) };
        });
      }));
    }));
  }
}
