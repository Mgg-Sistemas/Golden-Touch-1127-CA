/* ============================================================
   Golden Touch · Libro Fiscal · Asignar Retención a Orden de Compra

   Permite enlazar retenciones emitidas «fuera del sistema» o «sin asociar»
   (docKind === 'manual' o sin orden_id) a una Orden de Compra existente.

   Al asociar:
   1. Actualiza `orden_id`, `doc_kind = 'oc'` y `doc_id` en `retenciones`.
   2. Actualiza `retencion_documentos` para sincronizar el documento fiscal.
   3. Marca la orden en `ordenes` como retención finalizada.
   4. Enlaza en `retencion_documento_origenes` para mantener la auditoría.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { supabase } from '@/shared/lib/supabase';
import { cubrirOrigen } from './documentosOrigen.repository';

export interface AsignarOrdenModalProps {
  retencionId: string;
  documentoId?: string | null;
  comprobanteNro?: string | null;
  facturaNro?: string | null;
  proveedorNombre?: string | null;
  proveedorRif?: string | null;
  proveedorId?: string | null;
  montoRetenido?: number | null;
  moneda?: string;
  onAsignada: (ordenId: string, ocCodigo: string) => void;
  onClose: () => void;
}

interface OrdenCandidata {
  id: string;
  codigo: string;
  ocCodigo: string | null;
  proveedorNombre?: string | null;
  proveedorRif?: string | null;
  total: number;
  totalMoneda: string;
  estado: string;
  createdAt: string;
  notas?: string | null;
}

export function AsignarOrdenModal({
  retencionId,
  documentoId,
  comprobanteNro,
  facturaNro,
  proveedorNombre,
  proveedorRif,
  proveedorId,
  montoRetenido,
  moneda = 'Bs',
  onAsignada,
  onClose,
}: AsignarOrdenModalProps) {
  const [cargando, setCargando] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenCandidata[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarOrdenes = useCallback(async () => {
    setCargando(true);
    try {
      let q = supabase
        .from('ordenes')
        .select('id, oc_codigo, codigo, total, total_moneda, estado, created_at, notas, proveedor_id')
        .gte('created_at', '2026-09-01T00:00:00Z')
        .order('created_at', { ascending: false })
        .limit(100);

      if (proveedorId) {
        q = q.eq('proveedor_id', proveedorId);
      }

      const { data, error } = await q;
      if (error) throw error;

      const items: OrdenCandidata[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        codigo: String(r.codigo || ''),
        ocCodigo: r.oc_codigo ? String(r.oc_codigo) : null,
        total: Number(r.total) || 0,
        totalMoneda: r.total_moneda === 'Bs' ? 'Bs' : 'USD',
        estado: String(r.estado || ''),
        createdAt: String(r.created_at || '').slice(0, 10),
        notas: r.notas ? String(r.notas) : null,
      }));

      setOrdenes(items);
    } catch (e) {
      console.error('Error al cargar órdenes:', e);
      toast('No se pudieron leer las órdenes de compra disponibles', 'error');
    } finally {
      setCargando(false);
    }
  }, [proveedorId]);

  useEffect(() => {
    void cargarOrdenes();
  }, [cargarOrdenes]);

  const ordenesFiltradas = useMemo(() => {
    if (!busqueda.trim()) return ordenes;
    const q = busqueda.trim().toLowerCase();
    return ordenes.filter((o) => {
      const oc = (o.ocCodigo ?? '').toLowerCase();
      const cod = o.codigo.toLowerCase();
      const notas = (o.notas ?? '').toLowerCase();
      return oc.includes(q) || cod.includes(q) || notas.includes(q);
    });
  }, [ordenes, busqueda]);

  const ordenSeleccionada = useMemo(
    () => ordenes.find((o) => o.id === ordenSeleccionadaId) ?? null,
    [ordenes, ordenSeleccionadaId],
  );

  const handleConfirmarAsignacion = async () => {
    if (!ordenSeleccionada) return;
    setGuardando(true);
    try {
      const codigoVisible = ordenSeleccionada.ocCodigo || ordenSeleccionada.codigo;

      // 1. Actualizar retenciones por retencionId y/o por documentoId
      const updateRet: Record<string, unknown> = {
        orden_id: ordenSeleccionada.id,
        doc_kind: 'oc',
        doc_id: ordenSeleccionada.id,
      };

      if (documentoId) {
        await supabase
          .from('retenciones')
          .update(updateRet)
          .eq('documento_id', documentoId);

        await supabase
          .from('retencion_documentos')
          .update({
            orden_id: ordenSeleccionada.id,
            doc_id: ordenSeleccionada.id,
            doc_kind: 'oc',
          })
          .eq('id', documentoId);

        // Enlazar en puente P03
        try {
          await cubrirOrigen(documentoId, { tipo: 'oc', id: ordenSeleccionada.id });
        } catch {
          // Si ya estaba enlazada, continuar sin error
        }
      } else {
        await supabase
          .from('retenciones')
          .update(updateRet)
          .eq('id', retencionId);
      }

      // 2. Marcar en la orden que la retención quedó asociada / finalizada
      await supabase
        .from('ordenes')
        .update({
          retencion_finalizada: true,
          retencion_finalizada_en: new Date().toISOString(),
        })
        .eq('id', ordenSeleccionada.id);

      toast(`✅ Retención asociada exitosamente a la orden ${codigoVisible}`, 'success');
      onAsignada(ordenSeleccionada.id, codigoVisible);
      onClose();
    } catch (e) {
      console.error('Error al asociar retención a orden:', e);
      toast(e instanceof Error ? e.message : 'No se pudo asociar la orden de compra', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      title="🔗 Asignar Retención a Orden de Compra"
      onClose={onClose}
      size="lg"
    >
      <div style={{ display: 'grid', gap: '.85rem' }}>
        {/* Banner descriptivo del documento actual */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1.5px solid rgba(245, 158, 11, 0.35)',
            padding: '.85rem 1rem',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#fbbf24', marginBottom: '.3rem' }}>
            Retención sin Orden de Compra asociada
          </div>
          <div style={{ fontSize: '.82rem', color: '#cbd5e1', lineHeight: 1.45 }}>
            Esta retención fue emitida de manera manual o externa sin orden vinculada. Selecciona la Orden de Compra correspondiente para enlazar los libros contables, compras y conciliación.
          </div>
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '.6rem',
              paddingTop: '.5rem',
              borderTop: '1px solid rgba(245, 158, 11, 0.2)',
              fontSize: '.78rem',
              flexWrap: 'wrap',
            }}
          >
            {comprobanteNro && <div>Comp: <strong className="mono">{comprobanteNro}</strong></div>}
            {facturaNro && <div>Factura: <strong className="mono">{facturaNro}</strong></div>}
            {proveedorNombre && (
              <div>
                Proveedor: <strong>{proveedorNombre}</strong>
                {proveedorRif && <span className="muted"> ({proveedorRif})</span>}
              </div>
            )}
            {montoRetenido != null && (
              <div>Retenido: <strong className="mono" style={{ color: '#22c55e' }}>{moneda} {montoRetenido.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong></div>
            )}
          </div>
        </div>

        {/* Buscador de Órdenes */}
        <div>
          <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.3rem' }}>
            Buscar Orden de Compra
          </label>
          <input
            className="input"
            style={{ width: '100%' }}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código de OC (ej. OC-2026-0183) o notas…"
            autoFocus
          />
        </div>

        {/* Lista de Órdenes Candidatas */}
        <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
          {cargando ? (
            <p className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>Cargando órdenes disponibles…</p>
          ) : ordenesFiltradas.length === 0 ? (
            <p className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
              No se encontraron órdenes de compra {busqueda ? 'con ese código' : 'para este proveedor'}.
            </p>
          ) : (
            <div style={{ display: 'grid' }}>
              {ordenesFiltradas.map((o) => {
                const seleccionada = o.id === ordenSeleccionadaId;
                const codigo = o.ocCodigo || o.codigo;
                return (
                  <div
                    key={o.id}
                    onClick={() => setOrdenSeleccionadaId(o.id)}
                    style={{
                      padding: '.65rem .85rem',
                      cursor: 'pointer',
                      background: seleccionada ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                      borderLeft: seleccionada ? '4px solid var(--primary, #f59e0b)' : '4px solid transparent',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '.6rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.86rem', color: '#f8fafc' }} className="mono">
                        {codigo}
                      </div>
                      <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '2px' }}>
                        Fecha: {o.createdAt} · Estado: <span style={{ textTransform: 'capitalize' }}>{o.estado}</span>
                        {o.notas && <span> · {o.notas.slice(0, 45)}…</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '.86rem', color: '#22c55e' }} className="mono">
                        {o.totalMoneda} {o.total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </div>
                      {seleccionada && (
                        <span style={{ fontSize: '.72rem', color: 'var(--primary, #f59e0b)', fontWeight: 700 }}>
                          ✓ Seleccionada
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.4rem' }}>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmarAsignacion}
            disabled={!ordenSeleccionadaId || guardando}
          >
            {guardando ? 'Asignando orden…' : 'Confirmar y Asignar OC'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
