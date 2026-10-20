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
    this.next = at + env.apiFootball.minGapMs;
    return new Promise(r => setTimeout(r, at - now));
  }

  /** GET a API-Football; devuelve el array `response`. Cacheado y espaciado para respetar la cuota. */
  get(path: string, params: Record<string, string | number> = {}): Observable<any[]> {
    const key = 'af:' + path + JSON.stringify(params);
    const hit = readCache<any[]>(key, env.apiFootball.cacheHours * 3600_000);
    if (hit) return of(hit);
    return new Observable<any[]>(sub => {
      this.wait().then(() => this.http.get<any>(env.apiFootball.baseUrl + path, { params }).pipe(
        map(r => {
          const e = r.errors;
          if (e && (Array.isArray(e) ? e.length : Object.keys(e).length)) throw new Error('API-Football: ' + JSON.stringify(e));
          return r.response as any[];
        }),
        tap(v => writeCache(key, v))
      ).subscribe(sub));
    });
  }
}
