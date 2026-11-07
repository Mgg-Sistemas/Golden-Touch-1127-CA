/* ============================================================
   Golden Touch · Administración · Honorarios (lógica pura)
   Saldo, estado derivado y estado de cuenta por profesional.
   Monedas POR MONEDA NATIVA: USD y Bs se suman por separado, nunca
   se reconvierten (igual criterio que el reporte de Tesorería).
   ============================================================ */
import type { EnvioTesoreria, EstadoGestion, Gestion } from './admin.repository';
import type { Moneda } from './administracionCalculo';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Envíos PAGADOS de una gestión concreta. */
export function enviosPagadosDeGestion(gestionId: string, envios: EnvioTesoreria[]): EnvioTesoreria[] {
  return envios.filter((e) => e.gestionId === gestionId && e.estado === 'pagado');
}

/** Saldo = costoTotal − Σ(envíos PAGADOS de esa gestión). Nunca negativo. */
export function saldoGestion(gestion: Gestion, envios: EnvioTesoreria[]): number {
  const pagado = enviosPagadosDeGestion(gestion.id, envios).reduce((a, e) => a + (Number(e.monto) || 0), 0);
  return r2(Math.max(0, (Number(gestion.costoTotal) || 0) - pagado));
}

/** Estado mostrado: 'anulada' manda; si saldo 0 → 'saldada'; si hay pago parcial → 'parcial'; si no → 'abierta'. */
export function estadoGestion(gestion: Gestion, envios: EnvioTesoreria[]): EstadoGestion {
  if (gestion.estado === 'anulada') return 'anulada';
  const pagados = enviosPagadosDeGestion(gestion.id, envios);
  const saldo = saldoGestion(gestion, envios);
  if (saldo <= 0 && (Number(gestion.costoTotal) || 0) > 0) return 'saldada';
  if (pagados.length > 0) return 'parcial';
  return 'abierta';
}

/** Un envío solo se puede reversar si aún NO se ha pagado. */
export function puedeReversarEnvio(envio: EnvioTesoreria): boolean {
  return envio.estado === 'enviado';
}

/** Nota que Tesorería ve para reconocer envíos del MISMO honorario (parciales = N cuentas). */
export function notaAgrupacion(profesionalNombre: string, concepto: string, empresaClave: string): string {
  return `Honorario · ${profesionalNombre} · ${concepto} · ${empresaClave}`;
}

export interface LineaEstadoCuenta {
  gestion: Gestion;
  enviado: number; // Σ envíos enviado + pagado (lo comprometido)
  pagado: number;  // Σ envíos pagado
  saldo: number;
  estado: EstadoGestion;
}
export interface SubtotalMoneda {
  moneda: Moneda;
  costo: number;
  enviado: number;
  pagado: number;
  saldo: number;
}
export interface EstadoCuentaProfesional {
  lineas: LineaEstadoCuenta[];
  porMoneda: SubtotalMoneda[];
}

/** Estado de cuenta de un profesional: una línea por gestión + subtotales POR MONEDA (sin reconvertir).
 *  Las gestiones anuladas aparecen como línea pero no cuentan en costo/saldo de los subtotales. */
export function estadoCuentaProfesional(
  profesionalId: string,
  gestiones: Gestion[],
  envios: EnvioTesoreria[],
): EstadoCuentaProfesional {
  const propias = gestiones.filter((g) => g.profesionalId === profesionalId);

  const lineas: LineaEstadoCuenta[] = propias.map((gestion) => {
    const deEsta = envios.filter((e) => e.gestionId === gestion.id);
    const enviado = r2(deEsta.filter((e) => e.estado === 'enviado' || e.estado === 'pagado').reduce((a, e) => a + (Number(e.monto) || 0), 0));
    const pagado = r2(deEsta.filter((e) => e.estado === 'pagado').reduce((a, e) => a + (Number(e.monto) || 0), 0));
    return { gestion, enviado, pagado, saldo: saldoGestion(gestion, envios), estado: estadoGestion(gestion, envios) };
  });

  const porMonedaMap = new Map<Moneda, SubtotalMoneda>();
  for (const l of lineas) {
    if (l.gestion.estado === 'anulada') continue; // anuladas no suman al subtotal
    const m = l.gestion.moneda;
    const sub = porMonedaMap.get(m) ?? { moneda: m, costo: 0, enviado: 0, pagado: 0, saldo: 0 };
    sub.costo = r2(sub.costo + (Number(l.gestion.costoTotal) || 0));
    sub.enviado = r2(sub.enviado + l.enviado);
    sub.pagado = r2(sub.pagado + l.pagado);
    sub.saldo = r2(sub.saldo + l.saldo);
    porMonedaMap.set(m, sub);
  }

  return { lineas, porMoneda: Array.from(porMonedaMap.values()).sort((a, b) => a.moneda.localeCompare(b.moneda)) };
}
