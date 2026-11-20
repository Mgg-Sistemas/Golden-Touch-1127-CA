/* ============================================================
   Golden Touch · Compras y Tesorería · Plazo y Vencimiento de Crédito
   (19/11/2026)

   Gestiona las condiciones específicas de una cuenta a crédito (OC u OS):
   - Días en los que vence el crédito + fecha de vencimiento.
   - Si la compra primero se recibe y luego se paga (`primero_recibe`).
   - Cálculo de días restantes y alertas automáticas para Compras y Tesorería
     cuando faltan 2 días o 1 día para el vencimiento (o vence hoy / está vencida).

   Persistencia compatible sin requerir migración bloqueante:
   - En `ofertas_proveedor`: se guarda dentro de `ficha.credito` (JSONB).
   - En `ordenes`: se guarda dentro de `historial` (evento `plazo_credito` o
     campo `credito_plazo` al crear/editar la OC, JSONB).
   ============================================================ */

import type { EventoHistorial, FichaOferta, Orden } from '@/shared/lib/types';

export type ModoPlazoCredito = 'dias' | 'recibe_primero';

export interface PlazoCreditoConfig {
  modo: ModoPlazoCredito;
  /** Cantidad de días de crédito otorgados por el proveedor (ej. 7, 15, 30). */
  dias?: number | null;
  /** Fecha de vencimiento exacta en formato YYYY-MM-DD. */
  fecha_vencimiento?: string | null;
  /** true si primero se recibe la mercancía/servicio y luego se paga. */
  primero_recibe?: boolean;
}

export type NivelAlertaCredito = 'vencido' | 'hoy' | 'por_vencer' | 'en_plazo' | 'sin_fecha';

export interface EvaluacionCredito {
  plazo: PlazoCreditoConfig | null;
  esCredito: boolean;
  saldoPendiente: number;
  /** Fecha efectiva de vencimiento YYYY-MM-DD (si aplica). */
  fechaVencimiento: string | null;
  /** Días desde `hoy` hasta `fechaVencimiento` (2 = faltan 2 días, 1 = mañana, 0 = hoy, <0 = vencido). */
  diasRestantes: number | null;
  primeroRecibe: boolean;
  yaRecibida: boolean;
  nivel: NivelAlertaCredito;
  /** true cuando tiene saldo > 0 y está a 2 días, 1 día, vence hoy o ya venció. */
  disparaAlerta: boolean;
  /** Texto resumido legible para tarjetas, detalle, Tesorería, PDF y WhatsApp. */
  etiquetaCorta: string;
  /** Texto de alerta puntual cuando `disparaAlerta === true`. */
  mensajeAlerta: string | null;
}

/** Fecha actual YYYY-MM-DD en zona horaria de Venezuela (America/Caracas). */
export function hoyCreditoVE(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Extrae YYYY-MM-DD de una fecha ISO o YYYY-MM-DD. */
export function soloDiaIso(val?: string | null): string | null {
  const s = (val ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Suma `dias` calendario a una fecha YYYY-MM-DD de forma determinista (UTC). */
export function sumarDiasCredito(baseYmd: string, dias: number): string {
  const [y, m, d] = baseYmd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return baseYmd.slice(0, 10);
  const dt = new Date(Date.UTC(y, m - 1, d + Math.round(dias)));
  return dt.toISOString().slice(0, 10);
}

/** Diferencia exacta en días calendario (`hasta - desde`). */
export function diasEntreFechas(desdeYmd: string, hastaYmd: string): number {
  const [y1, m1, d1] = desdeYmd.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = hastaYmd.slice(0, 10).split('-').map(Number);
  const utc1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const utc2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.round((utc2 - utc1) / 86_400_000);
}

/** Formato DD/MM/AAAA a partir de YYYY-MM-DD. */
export function fmtFechaCredito(ymd?: string | null): string {
  const clean = soloDiaIso(ymd);
  if (!clean) return '—';
  const [y, m, d] = clean.split('-');
  return y && m && d ? `${d}/${m}/${y}` : clean;
}

/** Normaliza un objeto de configuración de plazo de crédito. */
export function normalizarPlazoCredito(raw?: Partial<PlazoCreditoConfig> | null): PlazoCreditoConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const modo: ModoPlazoCredito = raw.modo === 'recibe_primero' ? 'recibe_primero' : 'dias';
  const diasNum = raw.dias != null && Number(raw.dias) > 0 ? Math.round(Number(raw.dias)) : null;
  const fecha = soloDiaIso(raw.fecha_vencimiento);
  const primeroRecibe = modo === 'recibe_primero' ? true : Boolean(raw.primero_recibe);
  if (modo === 'dias' && !diasNum && !fecha && !primeroRecibe) return null;
  return {
    modo,
    dias: diasNum,
    fecha_vencimiento: fecha,
    primero_recibe: primeroRecibe,
  };
}

/** Lee la configuración de crédito guardada en la ficha de una oferta. */
export function leerPlazoCreditoOferta(ficha?: FichaOferta | null): PlazoCreditoConfig | null {
  if (!ficha) return null;
  return normalizarPlazoCredito(ficha.credito ?? null);
}

/** Mezcla la configuración de crédito dentro de `FichaOferta` sin perder otros campos. */
export function inyectarPlazoCreditoEnFicha(
  fichaBase: FichaOferta | null | undefined,
  plazo: PlazoCreditoConfig | null | undefined,
): FichaOferta | null {
  const norm = normalizarPlazoCredito(plazo);
  const base: FichaOferta = fichaBase ? { ...fichaBase } : {};
  if (norm) {
    base.credito = norm;
  } else {
    delete base.credito;
  }
  const keys = Object.keys(base).filter((k) => (base as Record<string, unknown>)[k] != null);
  return keys.length > 0 ? base : null;
}

/** Extrae el último `credito_plazo` registrado en el historial de la orden. */
export function leerPlazoCreditoOrden(
  orden: Pick<Orden, 'historial'> | null | undefined,
): PlazoCreditoConfig | null {
  const hist = orden?.historial;
  if (!Array.isArray(hist) || hist.length === 0) return null;
  for (let i = hist.length - 1; i >= 0; i--) {
    const ev = hist[i] as EventoHistorial & { credito_plazo?: Partial<PlazoCreditoConfig> | null };
    if (ev && ev.credito_plazo !== undefined) {
      return normalizarPlazoCredito(ev.credito_plazo);
    }
  }
  return null;
}

/** Evalúa el estado de vencimiento, recepción y alertas de una orden a crédito. */
export function evaluarCreditoOrden(
  orden: Pick<
    Orden,
    | 'estado'
    | 'condiciones_pago'
    | 'total'
    | 'abonado_total'
    | 'historial'
    | 'oc_aprobada_en'
    | 'oc_creada_en'
    | 'created_at'
    | 'recibida_en'
  >,
  hoyYmd: string = hoyCreditoVE(),
): EvaluacionCredito {
  const esCredito = orden.estado === 'cuenta_abierta' || orden.condiciones_pago === 'credito';
  const total = Math.max(0, Number(orden.total) || 0);
  const abonado = Math.max(0, Number(orden.abonado_total) || 0);
  const saldoPendiente = Math.max(0, Math.round((total - abonado) * 100) / 100);
  const plazo = leerPlazoCreditoOrden(orden);
  const primeroRecibe = Boolean(plazo?.primero_recibe || plazo?.modo === 'recibe_primero');
  const yaRecibida = Boolean(orden.recibida_en);

  let fechaVencimiento: string | null = plazo?.fecha_vencimiento ?? null;
  if (!fechaVencimiento && plazo?.dias && plazo.dias > 0) {
    if (primeroRecibe) {
      const fRec = soloDiaIso(orden.recibida_en);
      if (fRec) fechaVencimiento = sumarDiasCredito(fRec, plazo.dias);
    } else {
      const fAncla = soloDiaIso(orden.oc_aprobada_en || orden.oc_creada_en || orden.created_at);
      if (fAncla) fechaVencimiento = sumarDiasCredito(fAncla, plazo.dias);
    }
  }

  const diasRestantes = fechaVencimiento ? diasEntreFechas(hoyYmd, fechaVencimiento) : null;

  let nivel: NivelAlertaCredito = 'sin_fecha';
  if (diasRestantes !== null) {
    if (diasRestantes < 0) nivel = 'vencido';
    else if (diasRestantes === 0) nivel = 'hoy';
    else if (diasRestantes <= 2) nivel = 'por_vencer';
    else nivel = 'en_plazo';
  }

  // Dispara alerta activa en Compras y Tesorería cuando la cuenta está abierta con saldo > 0
  // y está a 2 días, 1 día, vence hoy o ya venció.
  const cuentaActivaConDeuda = orden.estado === 'cuenta_abierta' && saldoPendiente > 0.009;
  const disparaAlerta = cuentaActivaConDeuda && diasRestantes !== null && diasRestantes <= 2;

  const partes: string[] = [];
  if (primeroRecibe) {
    partes.push(
      yaRecibida
        ? `Primero recibe y luego paga (recibida ${fmtFechaCredito(orden.recibida_en)})`
        : 'Primero se recibe y luego se paga (pendiente recepción)',
    );
  }
  if (plazo?.dias && plazo.dias > 0 && !fechaVencimiento) {
    partes.push(`${plazo.dias} día(s) tras recibir`);
  } else if (fechaVencimiento && diasRestantes !== null) {
    const diasBase = plazo?.dias && plazo.dias > 0 ? `${plazo.dias}d · ` : '';
    if (diasRestantes < 0) {
      partes.push(`${diasBase}Vencido hace ${Math.abs(diasRestantes)} día(s) (${fmtFechaCredito(fechaVencimiento)})`);
    } else if (diasRestantes === 0) {
      partes.push(`${diasBase}Vence HOY (${fmtFechaCredito(fechaVencimiento)})`);
    } else if (diasRestantes === 1) {
      partes.push(`${diasBase}Vence mañana · 1 día (${fmtFechaCredito(fechaVencimiento)})`);
    } else if (diasRestantes === 2) {
      partes.push(`${diasBase}Vence en 2 días (${fmtFechaCredito(fechaVencimiento)})`);
    } else {
      partes.push(`${diasBase}Vence en ${diasRestantes} días (${fmtFechaCredito(fechaVencimiento)})`);
    }
  }

  const etiquetaCorta = partes.join(' · ') || (esCredito ? 'Crédito (sin plazo indicado)' : '—');

  let mensajeAlerta: string | null = null;
  if (disparaAlerta && fechaVencimiento && diasRestantes !== null) {
    if (diasRestantes < 0) {
      mensajeAlerta = `Crédito VENCIDO hace ${Math.abs(diasRestantes)} día(s) (venció el ${fmtFechaCredito(fechaVencimiento)})`;
    } else if (diasRestantes === 0) {
      mensajeAlerta = `Crédito vence HOY (${fmtFechaCredito(fechaVencimiento)})`;
    } else if (diasRestantes === 1) {
      mensajeAlerta = `Falta 1 día para el vencimiento (${fmtFechaCredito(fechaVencimiento)})`;
    } else {
      mensajeAlerta = `Faltan 2 días para el vencimiento (${fmtFechaCredito(fechaVencimiento)})`;
    }
  }

  return {
    plazo,
    esCredito,
    saldoPendiente,
    fechaVencimiento,
    diasRestantes,
    primeroRecibe,
    yaRecibida,
    nivel,
    disparaAlerta,
    etiquetaCorta,
    mensajeAlerta,
  };
}

/** Filtra y ordena por urgencia las órdenes a crédito que requieren alerta en Compras y Tesorería. */
export function listarAlertasCreditosPorVencer<T extends Orden>(
  ordenes: T[],
  hoyYmd: string = hoyCreditoVE(),
): Array<{ orden: T; evalCredito: EvaluacionCredito }> {
  const out: Array<{ orden: T; evalCredito: EvaluacionCredito }> = [];
  for (const o of ordenes) {
    if (o.estado !== 'cuenta_abierta') continue;
    if ((o as { eliminado_en?: unknown }).eliminado_en) continue;
    const ev = evaluarCreditoOrden(o, hoyYmd);
    if (ev.disparaAlerta) {
      out.push({ orden: o, evalCredito: ev });
    }
  }
  return out.sort((a, b) => (a.evalCredito.diasRestantes ?? 999) - (b.evalCredito.diasRestantes ?? 999));
}
