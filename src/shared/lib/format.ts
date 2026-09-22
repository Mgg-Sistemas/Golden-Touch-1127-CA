export function money(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  return '$ ' + Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formatea un monto en SU moneda: 'Bs' muestra "Bs …"; cualquier otra (o vacío) "$ …". */
export function montoMoneda(n: number | null | undefined, moneda: string | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  const v = Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
}

/**
 * Redondea un monto en $ hacia arriba al siguiente múltiplo de 5, pensado para el
 * pago en efectivo (billetes físicos). Ej.: 233,33 → 235 · 231 → 235 · 236 → 240.
 * Devuelve 0 para valores no positivos.
 */
export function redondearArriba5(n: number | null | undefined): number {
  const x = Number(n) || 0;
  if (x <= 0) return 0;
  return Math.ceil((x - 1e-9) / 5) * 5;
}

export function num(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  return Number(n).toLocaleString('es-VE', { maximumFractionDigits: 2 });
}

/**
 * Limita el texto de un input de dinero a 2 decimales (sin redondear el tecleo):
 * deja solo dígitos, un separador decimal y como máximo 2 cifras después.
 * Pensado para usarse en onChange de los campos de ingreso de dinero.
 */
export function dosDecimales(valor: string): string {
  if (valor == null) return '';
  let v = String(valor).replace(/[^\d.,]/g, '');         // solo números y separadores
  v = v.replace(/,/g, '.');                               // unificar a punto
  const i = v.indexOf('.');
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return v;
}

const TZ = 'America/Caracas';

/**
 * Arma la fecha como DD-MM-AAAA a partir de sus partes ya calculadas en la zona
 * horaria que corresponda. Se construye a mano y no con `toLocaleDateString`
 * porque ese método devuelve lo que el navegador crea que es el formato local:
 * en una máquina en inglés salía "Mar 12, 2024", y en español "12 mar 2024".
 * Acá la fecha se escribe siempre igual, se use la máquina que se use.
 */
function partesFecha(d: Date, tz: string, conHora: boolean): string | null {
  if (isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat('es-VE', {
    timeZone: tz,
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit', hour12: false } as const : {}),
  });
  const p: Record<string, string> = {};
  for (const parte of f.formatToParts(d)) p[parte.type] = parte.value;
  const fecha = `${p.day}-${p.month}-${p.year}`;
  return conHora ? `${fecha} ${p.hour}:${p.minute}` : fecha;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Una fecha SIN hora (YYYY-MM-DD) representa un día calendario: no debe correrse
  // por zona horaria (si no, 2026-04-15 se mostraría como 14 en Venezuela). Para
  // esos casos se interpreta en UTC y así coincide con el día real (el del Excel).
  const soloFecha = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return partesFecha(new Date(iso), soloFecha ? 'UTC' : TZ, false) ?? '—';
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return partesFecha(new Date(iso), TZ, true) ?? '—';
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'hace segundos';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return date(iso);
}

const STATUS_MAP: Record<string, { className: string; label: string }> = {
  pendiente:           { className: 'warning', label: 'Pendiente' },
  aprobada:            { className: 'success', label: 'Aprobada' },
  oc_creada:           { className: 'warning', label: 'Pendiente por aprobación (Gerente General)' },
  confirmada_metodo:   { className: 'warning', label: 'Confirmada (indicar método de pago)' },
  oc_aprobada:         { className: 'info', label: 'Confirmada pagar' },
  cuenta_abierta:      { className: 'warning', label: 'Crédito · cuenta abierta' },
  por_recibir:         { className: 'primary', label: 'Pendiente por recepción' },
  oc_emitida:          { className: 'primary', label: 'OC emitida' },
  rechazada:           { className: 'danger',  label: 'Rechazada' },
  cancelada:           { className: 'danger',  label: 'Cancelada' },
  recibida:            { className: 'info',    label: 'Recibida' },
  finalizada:          { className: 'success', label: 'Finalizada' },
  desistida_proveedor: { className: 'warning', label: 'Proveedor desistió' },
  reasignada:          { className: 'info',    label: 'Reasignada' },
  pagada:              { className: 'success', label: 'Pagada' },
  anulada:             { className: 'danger',  label: 'Anulada' },
  activo:              { className: 'success', label: 'Activo' },
  inactivo:            { className: 'danger',  label: 'Inactivo' },
};

export function statusBadge(estado: string | null | undefined) {
  return STATUS_MAP[estado ?? ''] ?? { className: '', label: estado ?? '—' };
}
