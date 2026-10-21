/* ============================================================
   Golden Touch · Retenciones · Régimen de la empresa por impuesto (R1)

   Si la empresa es agente de retención o de percepción de un impuesto, y si
   es contribuyente especial (de la empresa, sin impuesto), con vigencia desde
   una fecha. El Régimen escribe SOLO aquí: mientras conviva con el JSON de
   Parámetros, la base copia el valor vigente hoy a ese JSON. El trigger del
   régimen lee la condición a la fecha de cada retención.
   Depende del paquete R1; no se monta en pantalla hasta que BD lo confirme.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { ClaveImpuesto } from './entes.repository';
import { errorRetencion } from './erroresRetencion';

const T_CONDICIONES = 'retencion_agente_condiciones';

export type CondicionAgente = 'agente_retencion' | 'agente_percepcion' | 'contribuyente_especial';

export const CONDICIONES: { key: CondicionAgente; label: string; porImpuesto: boolean }[] = [
  { key: 'agente_retencion', label: 'Agente de retención', porImpuesto: true },
  { key: 'agente_percepcion', label: 'Agente de percepción', porImpuesto: true },
  { key: 'contribuyente_especial', label: 'Contribuyente especial', porImpuesto: false },
];

export interface CondicionRegistrada {
  id: string;
  impuestoClave: ClaveImpuesto | null;
  condicion: CondicionAgente;
  valor: boolean;
  desde: string;
  hasta: string | null;
  motivo: string;
  fuente: string | null;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

const texto = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v));
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function aCondicion(r: Record<string, unknown>): CondicionRegistrada {
  return {
    id: String(r.id), impuestoClave: texto(r.impuesto_clave) as ClaveImpuesto | null,
    condicion: r.condicion as CondicionAgente, valor: r.valor === true,
    desde: String(r.desde ?? ''), hasta: texto(r.hasta), motivo: String(r.motivo ?? ''), fuente: texto(r.fuente),
    actualizadoEn: texto(r.actualizado_en), actualizadoPor: texto(r.actualizado_por),
  };
}

/** El valor vigente en una fecha, de una lista (igual que retencion_agente_condicion, sin la vuelta al JSON). */
export function condicionVigente(xs: CondicionRegistrada[], impuesto: ClaveImpuesto | null, condicion: CondicionAgente, fecha: string): CondicionRegistrada | null {
  return xs.filter((c) => c.impuestoClave === impuesto && c.condicion === condicion
    && c.desde <= fecha && (!c.hasta || c.hasta >= fecha))
    .sort((a, b) => b.desde.localeCompare(a.desde))[0] ?? null;
}

/** El historial completo, el más nuevo primero. */
export async function listCondiciones(): Promise<CondicionRegistrada[]> {
  const { data, error } = await supabase.from(T_CONDICIONES).select('*').order('desde', { ascending: false });
  if (error) throw errorRetencion(error, 'No se pudo leer el régimen de la empresa.');
  return (data ?? []).map((r) => aCondicion(r as Record<string, unknown>));
}

/** Lo que dice la base para un impuesto, una condición y una fecha (con la vuelta al JSON mientras convivan). */
export async function consultarCondicion(impuesto: ClaveImpuesto | null, condicion: CondicionAgente, fecha: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('retencion_agente_condicion', { p_impuesto: impuesto, p_condicion: condicion, p_fecha: fecha });
  if (error) throw errorRetencion(error, 'No se pudo consultar el régimen de la empresa.');
  return data === true;
}

export interface CondicionNueva {
  /** null solo para «contribuyente especial», que es de la empresa. */
  impuestoClave: ClaveImpuesto | null;
  condicion: CondicionAgente;
  valor: boolean;
  desde: string;
  hasta?: string | null;
  motivo: string;
  /** Providencia o acto que designa. */
  fuente?: string | null;
}

export function faltaEnCondicion(c: CondicionNueva): string | null {
  if (!CONDICIONES.some((x) => x.key === c.condicion)) return 'La condición es agente de retención, agente de percepción o contribuyente especial.';
  const porImpuesto = c.condicion !== 'contribuyente_especial';
  if (porImpuesto && !c.impuestoClave) return 'Indica el impuesto de esa condición.';
  if (!porImpuesto && c.impuestoClave) return 'Contribuyente especial es de la empresa, no de un impuesto.';
  if (!FECHA.test(c.desde)) return 'Indica desde qué fecha vale.';
  if (c.hasta && (!FECHA.test(c.hasta) || c.hasta < c.desde)) return 'La fecha «hasta» no puede ser anterior a «desde».';
  if (!c.motivo.trim()) return 'Indica el motivo: queda en el historial del régimen.';
  return null;
}

/** Registra un cambio del régimen desde una fecha. No se edita lo anterior: queda en el historial. */
export async function registrarCondicion(c: CondicionNueva): Promise<string> {
  const falta = faltaEnCondicion(c);
  if (falta) throw new Error(falta);
  const { data, error } = await supabase.from(T_CONDICIONES).insert({
    impuesto_clave: c.condicion === 'contribuyente_especial' ? null : c.impuestoClave,
    condicion: c.condicion, valor: c.valor, desde: c.desde, hasta: c.hasta || null,
    motivo: c.motivo.trim(), fuente: c.fuente?.trim() || null,
  }).select('id');
  if (error) {
    throw errorRetencion(error, 'No se pudo guardar el régimen.', {
      unico: 'Ya hay un cambio de esa condición que empieza en esa fecha: elige otra fecha.',
      regla: 'Revisa el régimen: «especial» va sin impuesto; agente de retención o de percepción, con su impuesto.',
    });
  }
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (!id) throw new Error('No se guardó el régimen: sin permiso de escritura en Retenciones.');
  return id;
}
