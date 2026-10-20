import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { catchError, of } from 'rxjs';
import { QuinielaService } from './services/quiniela.service';
import { Prediction } from './models/models';

@Component({
  selector: 'app-root',
  imports: [DatePipe, DecimalPipe, PercentPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  error = signal<string | null>(null);
  preds = toSignal(inject(QuinielaService).predictions().pipe(
    catchError(e => { this.error.set(String(e?.message ?? e)); return of([] as Prediction[]); })
  ), { initialValue: null });
}
