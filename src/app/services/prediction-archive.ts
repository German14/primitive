import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { Prediction } from '../models/models';

export interface ArchivedMatchPrediction {
  position: number;
  p1: number;
  pX: number;
  p2: number;
}

export interface ArchivedRoundPrediction {
  season: number;
  round: number;
  predictedAt: string;
  matches: ArchivedMatchPrediction[];
}

interface PredictionArchiveFile {
  version: 1;
  predictions: ArchivedRoundPrediction[];
}

@Injectable({ providedIn: 'root' })
export class PredictionArchive {
  private readonly storageKey = 'primitive:prediction-archive:v1';
  private document = inject(DOCUMENT);

  saveIfUpcoming(season: number, round: number, predictions: Prediction[], now = new Date()): 'saved' | 'exists' | 'skipped' {
    const matches = predictions.filter(prediction => (prediction.fixture.position ?? 0) <= 14);
    const positions = new Set(matches.map(prediction => prediction.fixture.position));
    if (matches.length !== 14 || positions.size !== 14
      || Array.from({ length: 14 }, (_, index) => index + 1).some(position => !positions.has(position))
      || matches.some(prediction =>
      prediction.p1 == null || prediction.pX == null || prediction.p2 == null
      || ![prediction.p1, prediction.pX, prediction.p2].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
      || Math.abs(prediction.p1 + prediction.pX + prediction.p2 - 1) > 0.001
      || !Number.isFinite(Date.parse(prediction.fixture.kickoff))
      || Date.parse(prediction.fixture.kickoff) <= now.getTime())) return 'skipped';

    const archive = this.read();
    if (archive.predictions.some(item => item.season === season && item.round === round)) return 'exists';
    const stored: ArchivedRoundPrediction = {
      season,
      round,
      predictedAt: now.toISOString(),
      matches: matches.map(prediction => {
        const { position } = prediction.fixture;
        const { p1, pX, p2 } = prediction;
        if (position == null || p1 == null || pX == null || p2 == null) {
          throw new Error('La jornada contiene probabilidades incompletas y no se puede archivar.');
        }
        return { position, p1, pX, p2 };
      })
    };
    this.write({ version: 1, predictions: [...archive.predictions, stored] });
    return 'saved';
  }

  exportJson(): string {
    return JSON.stringify(this.read(), null, 2);
  }

  count(): number {
    return this.read().predictions.length;
  }

  private read(): PredictionArchiveFile {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) throw new Error('El almacenamiento local del navegador no está disponible.');
    const content = storage.getItem(this.storageKey);
    if (!content) return { version: 1, predictions: [] };
    const archive: unknown = JSON.parse(content);
    if (!archive || typeof archive !== 'object'
      || (archive as PredictionArchiveFile).version !== 1
      || !Array.isArray((archive as PredictionArchiveFile).predictions)) {
      throw new Error('El archivo local de predicciones está dañado; no se ha sobrescrito.');
    }
    return archive as PredictionArchiveFile;
  }

  private write(archive: PredictionArchiveFile): void {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) throw new Error('El almacenamiento local del navegador no está disponible.');
    storage.setItem(this.storageKey, JSON.stringify(archive));
  }
}
