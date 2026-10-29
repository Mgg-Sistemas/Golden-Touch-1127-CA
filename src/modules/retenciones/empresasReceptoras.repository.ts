/* ============================================================
   Golden Touch · Retenciones · Empresas receptoras (Multi-Empresa)

   Las empresas que reciben las facturas del buzón y su ficha fiscal
   (RIF, domicilio, municipio, licencia, régimen de agente IVA/ISLR).

   Todo se lee y se guarda en la base (retencion_empresas_receptoras):
   no hay empresas de fábrica ni copia en el navegador. Si la base no
   guarda, se avisa con el motivo.
   ============================================================ */

import { supabase } from '@/shared/lib/supabase';
import { rifEmpresaParaGuardar } from '@/modules/libroFiscal/parametrosEmpresa';
import { errorRetencion } from '@/modules/libroFiscal/erroresRetencion';

const TABLA = 'retencion_empresas_receptoras';

export interface EmpresaReceptora {
  id: string;
  clave: string;
  nombre: string;
  nombreCorto?: string;
  rif: string;
  colorBadge: string;
  activo: boolean;
  orden: number;

  // Ficha fiscal completa (para Retención / Impuestos)
  email?: string;
  telefono?: string;
  direccionFiscal?: string;
  municipio?: string;
  estado?: string;
  licenciaMunicipal?: string;

  // Régimen fiscal y condición de agente
  esAgenteRetencionIva?: boolean;
  esContribuyenteEspecial?: boolean;
  retieneIslr?: boolean;
  retieneMunicipal?: boolean;
  pctIvaGeneral?: number;
  imprimirOriginalYCopia?: boolean;
}

export type EmpresaReceptoraInput = Omit<EmpresaReceptora, 'id' | 'clave' | 'orden'> & { id?: string; clave?: string; orden?: number };

const texto = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v));

function mapearFilaEmpresa(r: Record<string, unknown>, idx: number): EmpresaReceptora {
  return {
    id: String(r.id),
    clave: String(r.clave || r.id),
    nombre: String(r.nombre ?? ''),
    nombreCorto: texto(r.nombre_corto),
    rif: String(r.rif ?? ''),
    colorBadge: String(r.color_badge || '#64748b'),
    activo: r.activo !== false,
    orden: Number(r.orden ?? idx + 1),
    email: texto(r.email),
    telefono: texto(r.telefono),
    direccionFiscal: texto(r.direccion_fiscal),
    municipio: texto(r.municipio),
    estado: texto(r.estado),
    licenciaMunicipal: texto(r.licencia_municipal),
    esAgenteRetencionIva: r.es_agente_iva !== false,
    esContribuyenteEspecial: r.es_contribuyente_especial === true,
    retieneIslr: r.retiene_islr !== false,
    retieneMunicipal: r.retiene_municipal === true,
    pctIvaGeneral: r.pct_iva_general != null ? Number(r.pct_iva_general) : 75,
    imprimirOriginalYCopia: r.imprimir_original_y_copia !== false,
  };
}

/** Las empresas guardadas en la base, en su orden. Sin empresas, la lista viene vacía. */
export async function listEmpresasReceptoras(): Promise<EmpresaReceptora[]> {
  const { data, error } = await supabase
    .from(TABLA)
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw errorRetencion(error, 'No se pudieron leer las empresas.');
  return (data ?? []).map((r, idx) => mapearFilaEmpresa(r as Record<string, unknown>, idx));
}

/** La clave interna de la empresa, sacada de su nombre (no se muestra en pantalla). */
export function claveDeEmpresa(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

/** Qué falta o está mal en la ficha; null si se puede guardar. */
export function faltaEnEmpresa(empresa: EmpresaReceptoraInput): string | null {
  if (!empresa.nombre?.trim()) return 'Indica el nombre (razón social) de la empresa.';
  if (!String(empresa.rif ?? '').trim()) return 'Indica el RIF de la empresa.';
  if (empresa.nombre.trim().length > 200) return 'El nombre de la empresa va hasta 200 caracteres.';
  if ((empresa.nombreCorto?.trim().length ?? 0) > 60) return 'El nombre corto de la empresa va hasta 60 caracteres.';
  const rif = rifEmpresaParaGuardar(empresa.rif);
  if (rif.error) return rif.error;
  if (rif.rif.startsWith('C')) return 'El RIF de la empresa no puede empezar por C: letra J, G, V, E o P.';
  const pct = empresa.pctIvaGeneral ?? 75;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'El % de retención de IVA va de 0 a 100.';
  if (empresa.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empresa.email.trim())) return 'El correo de la empresa no es válido.';
  return null;
}

/**
 * Guarda una empresa nueva o los cambios de una existente.
 * Devuelve lo que quedó en la base.
 */
export async function guardarEmpresaReceptora(empresa: EmpresaReceptoraInput): Promise<EmpresaReceptora> {
  const falta = faltaEnEmpresa(empresa);
  if (falta) throw new Error(falta);
  const nombre = empresa.nombre.trim();

  const fila = {
    clave: empresa.clave || claveDeEmpresa(empresa.nombreCorto || nombre) || `empresa_${Date.now()}`,
    nombre,
    nombre_corto: empresa.nombreCorto?.trim() || null,
    rif: rifEmpresaParaGuardar(empresa.rif).rif,
    color_badge: empresa.colorBadge || '#2563eb',
    activo: empresa.activo !== false,
    orden: empresa.orden ?? 10,
    email: empresa.email?.trim() || null,
    telefono: empresa.telefono?.trim() || null,
    direccion_fiscal: empresa.direccionFiscal?.trim() || null,
    municipio: empresa.municipio?.trim() || null,
    estado: empresa.estado?.trim() || null,
    licencia_municipal: empresa.licenciaMunicipal?.trim() || null,
    es_agente_iva: empresa.esAgenteRetencionIva ?? true,
    es_contribuyente_especial: empresa.esContribuyenteEspecial ?? false,
    retiene_islr: empresa.retieneIslr ?? true,
    retiene_municipal: empresa.retieneMunicipal ?? false,
    pct_iva_general: empresa.pctIvaGeneral ?? 75,
    imprimir_original_y_copia: empresa.imprimirOriginalYCopia ?? true,
  };

  const textos = { unico: 'Ya hay una empresa con ese nombre corto: usa otro.' };
  // El autor y las fechas los pone la base.
  const { data, error } = empresa.id
    ? await supabase.from(TABLA).update(fila).eq('id', empresa.id).select('*')
    : await supabase.from(TABLA).insert({ id: crypto.randomUUID(), ...fila }).select('*');
  if (error) throw errorRetencion(error, 'No se pudo guardar la empresa.', textos);
  const guardada = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!guardada) throw new Error('No se guardó la empresa: sin permiso para modificarla, o ya no existe.');
  return mapearFilaEmpresa(guardada, 0);
}

/** Borra una empresa sin facturas (con escritura en Retenciones). Con facturas cargadas, la base no la deja borrar: se desactiva. */
export async function eliminarEmpresaReceptora(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLA).delete().eq('id', id).select('id');
  if (error?.code === '23503') throw new Error('No se puede borrar: tiene facturas cargadas. Desactívala para que no aparezca al cargar.');
  if (error) throw errorRetencion(error, 'No se pudo borrar la empresa.');
  if (!data?.length) throw new Error('No se borró la empresa: sin permiso para borrarla, o ya no existe.');
}
