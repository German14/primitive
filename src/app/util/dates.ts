export const MADRID = 'Europe/Madrid';
export const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: MADRID }).format(d);

/** Fecha (YYYY-MM-DD) de la próxima jornada: el sábado más cercano, o hoy si es sábado o domingo. */
export function nextJornadaDate(now = new Date()): string {
  const dow = now.getDay();
  const d = new Date(now);
  d.setDate(now.getDate() + (dow === 6 || dow === 0 ? 0 : 6 - dow));
  return ymd(d);
}

/** Ventana viernes-lunes que rodea a la fecha de la jornada. */
export function weekendWindow(date: string): { from: string; to: string } {
  const d = new Date(date + 'T12:00:00');
  const dow = d.getDay();
  const from = new Date(d); from.setDate(d.getDate() - (dow === 6 ? 1 : dow === 0 ? 2 : 0));
  const to = new Date(from); to.setDate(from.getDate() + 3);
  return { from: ymd(from), to: ymd(to) };
}