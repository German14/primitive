import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { QuinielaService } from './services/quiniela.service';

@Component({
  selector: 'app-root',
  imports: [DatePipe, DecimalPipe, PercentPipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  preds = toSignal(inject(QuinielaService).predictions(), { initialValue: null });
}
