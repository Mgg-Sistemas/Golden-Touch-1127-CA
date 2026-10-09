/* ============================================================
   Golden Touch · Combustible · cadena de un medidor continuo
   Regla pura (sin Supabase) del re-encadenado del contador del
   surtidor y del horómetro: orden físico por la lectura FINAL y cada
   inicial cuelga del final anterior. Desde el 09/10/2026 la cadena
   del horómetro admite ANCLAS: las lecturas registradas en Maquinaria,
   que dan el inicial al surtido siguiente pero nunca se escriben.
   ============================================================ */
import { horaOrden } from './horaMovimiento';

export interface FilaMedidor {
  id: string;
  fecha: string | null;
  hora: string | null;
  created_at: string | null;
  ini: number | null;
  fin: number | null;
  /** Lectura registrada en Maquinaria (09/10/2026): entra a la cadena para que el surtido
   *  siguiente arranque de ella, pero no es un movimiento y NUNCA se escribe. */
  ancla?: boolean;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Qué movimientos hay que corregir para que la cadena quede continua. El medidor es
 * ABSOLUTO: la lectura FINAL de cada fila es el dato físico y no se toca; se re-encadena el
 * INICIAL (cada fila cuelga del final de la anterior; la primera conserva su inicial). Las
 * anclas solo aportan su lectura como final previo. Devuelve los cambios a escribir.
 */
export function planCadenaMedidor(rows: FilaMedidor[]): { id: string; ini: number; fin: number }[] {
  const usables = rows
    .filter((r) => r.ini != null && r.fin != null)
    .slice()
    .sort((a, b) => {
      // Orden físico = lectura final ascendente (el medidor solo crece). Fecha/hora/created_at
      // SOLO desempatan lecturas iguales; nunca mandan por encima del medidor, para que una
      // hora sin AM/PM no descoloque la cadena ni genere «lt usados» negativos.
      const vf = num(a.fin) - num(b.fin);
      if (vf !== 0) return vf;
      const f = (a.fecha ?? '').localeCompare(b.fecha ?? '');
      if (f !== 0) return f;
      const h = horaOrden(a.hora) - horaOrden(b.hora);
      if (h !== 0) return h;
      const c = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      if (c !== 0) return c;
      // Igual que el libro mayor: sin este último desempate, dos lecturas idénticas
      // se encadenaban en un orden distinto en cada carga.
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  const cambios: { id: string; ini: number; fin: number }[] = [];
  let prevFin: number | null = null;
  for (const r of usables) {
    if (r.ancla) { prevFin = round(num(r.fin), 2); continue; }   // lectura de Maquinaria: solo da el inicial
    const fin = round(num(r.fin), 2);                           // dato físico: se conserva
    const ini = prevFin == null ? round(num(r.ini), 2) : round(prevFin, 2);
    if (ini !== round(num(r.ini), 2)) cambios.push({ id: r.id, ini, fin });
    prevFin = fin;
  }
  return cambios;
}
