export function money(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  return '$ ' + Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—';
  return Number(n).toLocaleString('es-VE');
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

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-VE', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
