/* ============================================================
   Golden Touch · Control de Maquinaria · Seguimiento de una compra (12/10/2026)

   «Ver compra» abre esta ventana: el camino de la solicitud de pedido en
   Pedidos (solicitada → aprobada → orden de compra → pagada → recibida) con
   sus fechas, qué falta ahora, las piezas y las fotos de la orden de
   servicio. Es de solo lectura y NO necesita permiso de Pedidos: quien
   trabaja en Maquinaria ve en qué va su compra sin entrar a Compras.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '@/shared/ui/Modal';
import { supabase } from '@/shared/lib/supabase';
import { useRealtime } from '@/shared/lib/useRealtime';
import { num as fmtNum, date as fmtDate, statusBadge } from '@/shared/lib/format';
import { columnaCompra, type ColumnaCompra } from './flota';
import { FotosOrden } from './FotosOrdenServicio';

interface CompraSeguimiento {
  codigo: string; oc_codigo: string | null; estado: string; tipo: string | null;
  created_at: string; aprobada_en: string | null; oc_creada_en: string | null; oc_aprobada_en: string | null;
  pagada_en: string | null; recibida_en: string | null; finalizada_en: string | null; rechazada_en: string | null;
  solicitante: string | null; proveedor_id: string | null;
  items: Array<{ nombre?: string; cantidad?: number; unidad?: string; equipo_id?: string | null }> | null;
}

/** Los pasos que ve el mecánico, en el orden en que pasan. */
const PASOS: { id: ColumnaCompra | 'sigue'; label: string; fecha: (c: CompraSeguimiento) => string | null }[] = [
  { id: 'solicitada', label: 'Solicitud enviada a Compras', fecha: (c) => c.created_at },
  { id: 'aprobada', label: 'Aprobada por Compras', fecha: (c) => c.aprobada_en },
  { id: 'ordenada', label: 'Orden de compra al proveedor', fecha: (c) => c.oc_aprobada_en ?? c.oc_creada_en },
  { id: 'pagada', label: 'Pagada', fecha: (c) => c.pagada_en },
  { id: 'recibida', label: 'Recibida en el almacén', fecha: (c) => c.recibida_en ?? c.finalizada_en },
  { id: 'sigue', label: 'La orden de servicio sigue', fecha: () => null },
];

const QUE_PASA: Record<ColumnaCompra, string> = {
  solicitada: 'Compras tiene la solicitud y la está revisando para aprobarla.',
  aprobada: 'Compras está cotizando con los proveedores para hacer la orden de compra.',
  ordenada: 'Ya hay orden de compra con el proveedor. Falta pagarla o que llegue la mercancía.',
  pagada: 'Ya se pagó. Falta que llegue y se reciba en el almacén.',
  recibida: 'Los repuestos llegaron: la orden de servicio ya puede seguir.',
  finalizada: 'Los repuestos llegaron: la orden de servicio ya puede seguir.',
  cancelada: 'Esta compra se canceló en Pedidos. Habla con Compras o pide la compra de nuevo desde la orden.',
};

function pasoActual(col: ColumnaCompra): number {
  switch (col) {
    case 'solicitada': return 1;
    case 'aprobada': return 2;
    case 'ordenada': return 3;
    case 'pagada': return 4;
    default: return 5; // recibida / finalizada
  }
}

/** Cómo terminó (o se desvió) una compra que el tablero agrupa en la columna «cancelada». */
export interface DesenlaceCompra {
  /** Etiqueta en español del estado REAL de Pedidos (no «Cancelada» para todo). */
  label: string;
  icono: string;
  /** true = la compra no sigue (la orden de servicio quedó anulada); false = Compras la retoma. */
  terminal: boolean;
  /** Qué pasa ahora, en palabras del mecánico. */
  texto: string;
}

/**
 * El tablero junta cancelada, rechazada, desistida y reasignada en una sola columna; aquí se
 * distingue cada una. Devuelve null si la compra sigue su curso normal.
 */
export function desenlaceCompra(estado: string | null | undefined): DesenlaceCompra | null {
  if (columnaCompra(estado) !== 'cancelada') return null;
  switch (estado) {
    case 'cancelada':
      return { label: 'Cancelada', icono: '⛔', terminal: true, texto: 'Esta compra se canceló en Pedidos. La orden de servicio quedó anulada; si los repuestos siguen haciendo falta, abre una orden nueva.' };
    case 'rechazada':
      return { label: 'Rechazada', icono: '⛔', terminal: true, texto: 'Compras rechazó la solicitud. La orden de servicio quedó anulada; si los repuestos siguen haciendo falta, habla con Compras o abre una orden nueva.' };
    case 'desistida_proveedor':
      return { label: 'Proveedor desistió', icono: '🔁', terminal: false, texto: 'El proveedor no cumplió: Compras vuelve a cotizar con otros proveedores. La orden de servicio sigue esperando los repuestos.' };
    case 'reasignada':
      return { label: 'Reasignada', icono: '🔁', terminal: false, texto: 'Esta compra volvió a su solicitud madre para reelegir proveedor. El avance sigue desde la solicitud de pedido.' };
    default:
      return { label: statusBadge(estado).label, icono: '⛔', terminal: true, texto: 'Esta compra no sigue en Pedidos. Habla con Compras o pide la compra de nuevo desde la orden.' };
  }
}

export function SeguimientoCompraModal({ compraId, equipoId, ordenServicio, puedePedidos, onClose }: {
  compraId: string; equipoId?: string | null; ordenServicio?: { id: string; codigo: string } | null;
  puedePedidos: boolean; onClose: () => void;
}) {
  const [c, setC] = useState<CompraSeguimiento | null>(null);
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('ordenes')
      .select('codigo, oc_codigo, estado, tipo, created_at, aprobada_en, oc_creada_en, oc_aprobada_en, pagada_en, recibida_en, finalizada_en, rechazada_en, solicitante, proveedor_id, items')
      .eq('id', compraId).maybeSingle();
    if (e) { setError(e.message); return; }
    if (!data) { setError('La compra ya no existe en Pedidos.'); return; }
    const fila = data as CompraSeguimiento;
    setC(fila);
    if (fila.proveedor_id) {
      const { data: p } = await supabase.from('proveedores').select('razon_social').eq('id', fila.proveedor_id).maybeSingle();
      setProveedor((p?.razon_social as string | null) ?? null);
    } else setProveedor(null);
  }, [compraId]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['ordenes'], () => { void cargar(); });

  const col = c ? columnaCompra(c.estado) : null;
  // Rechazada / desistida / reasignada se muestran con su estado real, no todas como «cancelada».
  const fin = c ? desenlaceCompra(c.estado) : null;
  const cancelada = !!fin && fin.terminal;
  // Proveedor desistió / reasignada: la compra sigue, hay que volver a hacer la orden de compra.
  const actual = fin ? (fin.terminal ? -1 : pasoActual('aprobada')) : col ? pasoActual(col) : -1;
  const lineas = (c?.items ?? []).filter((i) => !equipoId || !i.equipo_id || i.equipo_id === equipoId);

  return (
    <Modal title={`🛒 Compra ${c ? (c.oc_codigo || c.codigo) : ''}`} size="md" onClose={onClose}
      footer={<>
        {puedePedidos && <Link className="btn btn-ghost" to="/app/pedidos" onClick={onClose}>Abrir en Pedidos</Link>}
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>}>
      <div className="flo" style={{ display: 'grid', gap: '.8rem' }}>
        {error && <div className="aviso danger sm"><span className="aviso-icono">⚠️</span><div>{error}</div></div>}
        {!c && !error && <p className="muted">Cargando…</p>}
        {c && col && (
          <>
            <div className={`aviso ${cancelada ? 'danger' : fin ? 'warning' : col === 'recibida' || col === 'finalizada' ? 'success' : 'info'}`}>
              <span className="aviso-icono">{fin ? fin.icono : col === 'recibida' || col === 'finalizada' ? '📦' : '⏳'}</span>
              <div><strong>¿En qué va?</strong> {fin ? <><strong>{fin.label}.</strong> {fin.texto}</> : QUE_PASA[col]}</div>
            </div>
            <div className="muted" style={{ fontSize: '.82rem' }}>
              Solicitud <strong>{c.codigo}</strong>{c.oc_codigo ? <> · Orden de compra <strong>{c.oc_codigo}</strong></> : null}
              {fin ? <> · Estado en Pedidos: <strong>{fin.label}</strong></> : null}
              {ordenServicio ? <> · de la <strong>{ordenServicio.codigo}</strong></> : null}
              {proveedor ? <> · Proveedor: <strong>{proveedor}</strong></> : null}
            </div>
            {!cancelada && (
              <ol className="flo-seguimiento" aria-label="Avance de la compra">
                {PASOS.map((p, i) => {
                  const f = p.fecha(c);
                  const hecho = i < actual;
                  return (
                    <li key={p.id} className={hecho ? 'done' : i === actual ? 'current' : ''} aria-current={i === actual ? 'step' : undefined}>
                      <span className="dot" aria-hidden>{hecho ? '✓' : i + 1}</span>
                      <span className="txt"><strong>{p.label}</strong>{f && hecho ? <small>{fmtDate(f)}</small> : i === actual ? <small>Ahora</small> : null}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {lineas.length > 0 && (
              <div>
                <strong style={{ fontSize: '.86rem' }}>Lo que se pidió</strong>
                <ul className="flo-parts">
                  {lineas.map((l, i) => <li key={i}><span>{l.nombre ?? '—'}</span><strong className="mono">{fmtNum(Number(l.cantidad) || 0)} {l.unidad ?? ''}</strong></li>)}
                </ul>
              </div>
            )}
            {ordenServicio && <FotosOrden ordenId={ordenServicio.id} canWrite={false} mostrarVacio={false} />}
          </>
        )}
      </div>
    </Modal>
  );
}
