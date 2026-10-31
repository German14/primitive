import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

/** Lee los JSON de public/data. Si el archivo no existe (o el servidor devuelve HTML), devuelve null: la app sigue funcionando. */
@Injectable({ providedIn: 'root' })
export class DataStore {
  private http = inject(HttpClient);
  private cache = new Map<string, Observable<unknown>>();

  get<T>(file: string): Observable<T | null> {
    if (!this.cache.has(file)) {
      this.cache.set(file, this.http.get(`${environment.data.baseUrl}/${file}`, { responseType: 'text' }).pipe(
        map(text => { try { return JSON.parse(text) as T; } catch { return null; } }),
        catchError(() => of(null)),
        shareReplay(1)
      ));
    }
    return this.cache.get(file) as Observable<T | null>;
  }
}
