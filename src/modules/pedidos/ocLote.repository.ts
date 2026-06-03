/* ============================================================
   MGG · Compras · "OC por lote" (checklist de aprobación)
   Relación de Órdenes de Compra CREADAS (oferta elegida, sin
   confirmar). Se imprime/envía por correo para aprobación final y
   se aprueban EN LOTE (oc_creada → oc_aprobada). Luego pasan a
   Tesorería para el pago. Todo solo por botón.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Orden } from '@/shared/lib/types';

export interface OcLoteRow {
  orden: Orden;
  proveedorNombre: string;
  descripcion: string;
  pagado: boolean;
}

/** Resumen legible de los ítems de la orden (para la columna Descripción). */
function describir(o: Orden): string {
  if (o.notas && o.notas.trim()) return o.notas.trim();
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return '—';
  return items.map((it) => `${it.nombre}${it.cantidad ? ` (${it.cantidad})` : ''}`).join(', ');
}

/**
 * Lista las OC en estado `oc_creada` (pendientes por confirmar) para el checklist.
 * Con `incluirConfirmadas` también trae las ya confirmadas (oc_aprobada/pagada…).
 */
export async function listOcPorLote(incluirConfirmadas = false): Promise<OcLoteRow[]> {
  const estados = incluirConfirmadas
    ? ['oc_creada', 'oc_aprobada', 'pagada', 'recibida', 'finalizada']
    : ['oc_creada'];
  const [{ data: ordenesData, error: oErr }, { data: provData, error: pErr }] = await Promise.all([
    supabase.from('ordenes').select('*').in('estado', estados).order('oc_creada_en', { ascending: false }),
    supabase.from('proveedores').select('id, razon_social'),
  ]);
  if (oErr) throw oErr;
  if (pErr) throw pErr;

  const provMap = new Map<string, string>();
  (provData ?? []).forEach((p: { id: string; razon_social?: string | null }) =>
    provMap.set(p.id, p.razon_social || ''));

  return (ordenesData ?? []).map((row) => {
    const orden = row as Orden;
    return {
      orden,
      proveedorNombre: (orden.proveedor_id && provMap.get(orden.proveedor_id)) || '—',
      descripcion: describir(orden),
      pagado: orden.estado !== 'oc_creada', // ya confirmada/pagada
    };
  });
}

/** Próximo código de checklist GT-MTZ-BS-NNN-AAAA (correlativo en config). */
export async function nextCodigoChecklist(): Promise<string> {
  const year = new Date().getFullYear();
  const { data } = await supabase.from('config').select('value').eq('key', 'compras.checklist_seq').maybeSingle();
  const prev = Number((data?.value as { n?: number } | undefined)?.n) || 0;
  const n = prev + 1;
  await supabase.from('config').upsert(
    { key: 'compras.checklist_seq', value: { n }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  return `GT-MTZ-BS-${String(n).padStart(3, '0')}-${year}`;
}
