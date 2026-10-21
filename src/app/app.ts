import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { QuinielaService } from './services/quiniela.service';
import { Prediction } from './models/models';
import { environment } from '../environments/environment';
import { nextJornadaDate } from './util/dates';

@Component({
  selector: 'app-root',
  imports: [DatePipe, DecimalPipe, PercentPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private svc = inject(QuinielaService);

  readonly source = environment.dataSource;
  readonly apiUrl = environment.dataSource === 'quiniela'
    ? environment.quiniela.baseUrl
    : environment.dataSource === 'rest' ? environment.footballData.baseUrl : '';
  jornada = signal(environment.quiniela.jornada);
  temporada = signal(environment.quiniela.temporada);
  date = signal(nextJornadaDate());
  preds = signal<Prediction[] | null>(null);
  error = signal<string | null>(null);
  loading = signal(false);

  /** Los 14 signos del boleto. */
  boleto = computed(() => (this.preds() ?? []).filter(p => (p.fixture.position ?? 0) <= 14));
  pleno15 = computed(() => (this.preds() ?? []).find(p => p.fixture.position === 15) ?? null);
  totals = computed(() => {
    console.log(this.preds())
    const t = { '1': 0, X: 0, '2': 0 };
    for (const p of this.boleto()) if (p.sign) t[p.sign]++;
    return t;
  });
  jornadaDate = computed(() => new Date(this.date() + 'T12:00:00'));

  constructor() { this.load(); }

  setDate(v: string) { if (v) { this.date.set(v); this.load(); } }
  setJornada(v: string) { const n = Number(v); if (Number.isInteger(n) && n > 0) { this.jornada.set(n); this.load(); } }
  setTemporada(v: string) { const n = Number(v); if (Number.isInteger(n) && n > 0) { this.temporada.set(n); this.load(); } }

  load() {
    this.loading.set(true); this.error.set(null); this.preds.set(null);
    this.svc.predictions(this.date(), this.jornada(), this.temporada()).subscribe({
      next: p => { this.preds.set(p); this.loading.set(false); },
      error: e => {
        this.error.set(e?.status === 0
          ? `No se pudo conectar con ${this.apiUrl || 'la API'} (¿está en marcha? ¿CORS?)`
          : String(e?.message ?? e));
        this.loading.set(false);
      }
    });
  }
}