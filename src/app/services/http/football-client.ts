import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, tap } from 'rxjs';
import { environment as env } from '../../../environments/environment';

export function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key); if (!raw) return null;
    const { t, v } = JSON.parse(raw); return Date.now() - t < ttlMs ? v as T : null;
  } catch { return null; }
}
export function writeCache(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* cuota llena */ }
}

@Injectable({ providedIn: 'root' })
export class FootballClient {
  private http = inject(HttpClient);
  private next = 0;

  private wait(): Promise<void> {
    const now = Date.now(), at = Math.max(now, this.next);
    this.next = at + env.footballData.minGapMs;
    return new Promise(r => setTimeout(r, at - now));
  }

  /** GET a football-data.org. Cacheado y espaciado para respetar 10 peticiones/min. */
  get(path: string, params: Record<string, string | number> = {}): Observable<any> {
    const key = 'fd:' + path + JSON.stringify(params);
    const hit = readCache<any>(key, env.footballData.cacheHours * 3600_000);
    if (hit) return of(hit);
    return new Observable<any>(sub => {
      this.wait().then(() => this.http.get(env.footballData.baseUrl + path, { params, responseType: 'text' }).pipe(
        map(txt => {
          if (txt.trimStart().startsWith('<'))
            throw new Error('Recibí HTML en vez de JSON: el proxy no está activo. Reinicia con FOOTBALL_DATA_TOKEN=... npm start.');
          const r = JSON.parse(txt);
          if (r.errorCode || (r.message && !r.matches && !r.teams))
            throw new Error('football-data.org: ' + (r.message ?? JSON.stringify(r)));
          return r;
        }),
        tap(v => writeCache(key, v))
      ).subscribe(sub));
    });
  }
}