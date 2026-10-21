import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { AbsencesApi } from '../contracts';
import { Absence, AbsenceReason } from '../../models/models';
import { MANUAL_ABSENCES } from '../../data/absences';
import { teamTokenKey } from '../../util/team-names';
import { environment as env } from '../../../environments/environment';

/** Traduce los textos típicos de cualquier API ("injured", "suspended", "yellow card"...) a nuestros 3 motivos. */
export function toReason(value: unknown): AbsenceReason {
  const v = String(value ?? '').toLowerCase();
  if (/susp|sanc|expuls|red card|roja|ban/.test(v)) return 'sancion';
  if (/warn|apercib|yellow|amarill|amonest|caution|booked/.test(v)) return 'apercibido';
  return 'lesion';
}

/** Acepta un array o { absences: [...] } / { injuries: [...] }; cada elemento con player|name y reason|type|status. */
export function parseAbsences(response: any): Absence[] {
  const list = Array.isArray(response) ? response : response?.absences ?? response?.injuries ?? response?.data ?? [];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: any): Absence[] => {
    const player = item?.player?.name ?? item?.player ?? item?.name;
    if (typeof player !== 'string' || !player.trim()) return [];
    const weight = Number(item.weight ?? item.importance);
    return [{
      player: player.trim(),
      reason: toReason(item.reason ?? item.type ?? item.status),
      weight: Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : undefined,
      until: item.until ?? item.returnDate ?? undefined
    }];
  });
}

/** Origen manual: src/app/data/absences.ts */
@Injectable() export class ManualAbsencesApi extends AbsencesApi {
  private index = new Map(Object.entries(MANUAL_ABSENCES).map(([team, absences]) => [teamTokenKey(team), absences]));
  get(teamName: string): Observable<Absence[]> { return of(this.index.get(teamTokenKey(teamName)) ?? []); }
}

/** Sin datos de bajas. */
@Injectable() export class NoAbsencesApi extends AbsencesApi {
  get(): Observable<Absence[]> { return of([]); }
}

/**
 * API de bajas (la tuya o una de pago). Solo cambia environment.absences.baseUrl.
 *   GET {baseUrl}/absences?team=Barcelona&teamId=123
 *   -> { "absences": [ { "player": "Nombre", "reason": "sancion", "weight": 0.8 } ] }
 * Si tu API devuelve otro formato, ajusta parseAbsences() arriba.
 */
@Injectable() export class RestAbsencesApi extends AbsencesApi {
  private http = inject(HttpClient);
  get(teamName: string, teamId: number): Observable<Absence[]> {
    const cfg = env.absences;
    return this.http.get<any>(`${cfg.baseUrl.replace(/\/+$/, '')}/absences`, {
      params: { team: teamName, teamId }, headers: new HttpHeaders(cfg.headers)
    }).pipe(
      map(parseAbsences),
      catchError(err => { console.warn('[bajas] no disponibles para', teamName, err?.status ?? err); return of([] as Absence[]); })
    );
  }
}
