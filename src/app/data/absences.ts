import { Absence } from '../models/models';

/**
 * BAJAS MANUALES. Edita este archivo cada jornada (p. ej. mirando la página de lesiones y sanciones de tu preferencia).
 * La clave es el nombre del equipo; da igual mayúsculas, acentos, "FC", "Real"...: 'Barcelona', 'FC Barcelona' y 'BARCELONA' valen.
 *
 *   reason: 'lesion' | 'sancion' | 'apercibido'
 *   weight: 0..1, importancia del jugador (1 = clave, 0.3 si no lo pones)
 *
 * Ejemplo (descomenta y cambia por datos reales):
 *   'Barcelona': [
 *     { player: 'Nombre Apellido', reason: 'sancion', weight: 0.8 },
 *     { player: 'Otro Jugador', reason: 'apercibido', weight: 0.5 }
 *   ],
 *
 * Si algún día usas una API: environment.absences.source = 'rest' y este archivo deja de usarse.
 */
export const MANUAL_ABSENCES: Record<string, Absence[]> = {
};
