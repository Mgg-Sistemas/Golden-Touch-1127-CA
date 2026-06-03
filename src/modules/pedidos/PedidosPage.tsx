import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, money, num, relTime } from '@/shared/lib/format';
import { useSession } from '@/modules/auth/authStore';
import type {
  EstadoOrden,
  EventoHistorial,
  ItemOrden,
  Orden,
  Producto,
  Proveedor,
  Usuario,
} from '@/shared/lib/types';
import {
  aprobarOrden,
  aprobarOcsEnLote,
  cancelarOrden,
  crearOrden,
  desistirProveedor,
  finalizarPedido,
  getCurrentUsuario,
  getHistoricoPreciosPorSku,
  listOrdenes,
  listProductosActivos,
  listProveedoresActivos,
  listProveedores,
  nextCodigo,
  recibirOrden,
  urlAdjuntoOc,
  type PrecioHistorico,
} from './pedidos.repository';
import { listOfertasByOrden } from './ofertas.repository';
import { crearEvaluacion } from './evaluaciones.repository';
import { createProducto } from '@/modules/inventario/inventario.repository';
import { listAlmacenes } from '@/modules/inventario/almacenes.repository';
import type { Almacen } from '@/shared/lib/types';
import { OfertasComparativa } from './OfertasComparativa';
import { AgregarOfertaModal } from './AgregarOfertaModal';
import { descargarTrazabilidadPdf } from './trazabilidadPdf';
import { enviarTrazabilidadAMultiples } from './enviarTrazabilidad';
import { descargarOrdenCompraPdf } from './ordenCompraPdf';
import { CompraDirectaView } from './CompraDirectaView';
import { OcPorLoteView } from './OcPorLoteView';

/* ============================================================
   MGG · Pedidos / Órdenes · Página principal
   Mantiene la lógica de negocio del demo (estados, historial,
   reglas de aprobación) sobre datos persistidos en Supabase.
   ============================================================ */

const VIEW_KEY = 'mgg.view.pedidos';
const SCOPE_KEY = 'mgg.scope.pedidos';
type ViewMode = 'kanban' | 'lista';
type Scope = 'pedidos' | 'oc' | 'compra_directa' | 'oc_lote';

// Clasificación del pedido (checklist al crear la orden).
const CLASIFICACION_PEDIDO = ['Producción', 'Bienes', 'Servicios'] as const;

// Columnas del kanban según el "scope" (Pedidos vs Órdenes de Compra).
const KANBAN_COLS_PEDIDOS: { key: EstadoOrden; label: string }[] = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'aprobada', label: 'Aprobada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'cancelada', label: 'Cancelada' },
];

const KANBAN_COLS_OC: { key: EstadoOrden; label: string }[] = [
  { key: 'aprobada', label: 'Pendiente (cargar ofertas)' },              // OP aprobada → cargar cotizaciones
  { key: 'oc_creada', label: 'Pendiente por aprobación (Gerente General)' }, // oferta elegida → espera aprobación
  { key: 'oc_aprobada', label: 'Confirmada (por pagar)' },               // aprobada en lote → Tesorería
  { key: 'pagada', label: 'Pagada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'desistida_proveedor', label: 'Proveedor desistió' },
];

// Etiqueta y clase visual de cada evento del historial (igual al demo).
function eventLabel(ev: string): string {
  return (
    {
      creada: 'Orden creada',
      aprobada: 'Aprobada',
      rechazada: 'Rechazada',
      cancelada: 'Cancelada por la empresa',
      desistida_proveedor: 'Proveedor desistió',
      proveedor_cambiado: 'Cambio de proveedor',
      oc_creada: 'OC creada (oferta elegida)',
      oc_aprobada: 'OC confirmada',
      pagada: 'Pago registrado (Tesorería)',
      recibida: 'Recepción confirmada',
      finalizada: 'Pedido finalizado',
    } as Record<string, string>
  )[ev] ?? ev;
}
function eventClass(ev: string): string {
  return (
    {
      aprobada: 'ok',
      rechazada: 'err',
      cancelada: 'err',
      desistida_proveedor: 'warn',
      proveedor_cambiado: 'info',
      oc_creada: 'info',
      oc_aprobada: 'ok',
      pagada: 'ok',
      recibida: 'ok',
      finalizada: 'ok',
    } as Record<string, string>
  )[ev] ?? '';
}

type ModalKind =
  | { kind: 'none' }
  | { kind: 'detail'; ordenId: string }
  | { kind: 'create' }
  | { kind: 'approve'; orden: Orden }
  | { kind: 'confirm-oc'; orden: Orden }
  | { kind: 'cancel'; orden: Orden }
  | { kind: 'desistir'; orden: Orden }
  | { kind: 'receive'; orden: Orden }
  | { kind: 'finalizar'; orden: Orden }
  | { kind: 'price-history'; sku: string; nombre: string }
  | { kind: 'add-offer'; orden: Orden };

export function PedidosPage() {
  const { user } = useSession();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedoresAll, setProveedoresAll] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterText, setFilterText] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoOrden | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null;
    return saved === 'lista' ? 'lista' : 'kanban';
  });
  // Al entrar al módulo siempre arrancamos en "Órdenes de Pedido" (vista por defecto).
  const [scope, setScope] = useState<Scope>('pedidos');

  const [modal, setModal] = useState<ModalKind>({ kind: 'none' });
  const [offersReloadKey, setOffersReloadKey] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [os, pvs, pvsAll, pds] = await Promise.all([
        listOrdenes(),
        listProveedoresActivos(),
        listProveedores(),
        listProductosActivos(),
      ]);
      setOrdenes(os);
      setProveedores(pvs);
      setProveedoresAll(pvsAll);
      setProductos(pds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [u] = await Promise.all([getCurrentUsuario()]);
      if (cancelled) return;
      setUsuario(u);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, user?.id]);

  // Abrir el detalle de una orden desde el buscador global (?detalle=ID).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('detalle');
    if (!id || !ordenes.length) return;
    if (ordenes.some((o) => o.id === id)) {
      setModal({ kind: 'detail', ordenId: id });
      const next = new URLSearchParams(searchParams);
      next.delete('detalle');
      setSearchParams(next, { replace: true });
    }
  }, [ordenes, searchParams, setSearchParams]);

  const proveedorMap = useMemo(
    () => new Map(proveedoresAll.map((p) => [p.id, p])),
    [proveedoresAll]
  );

  const isAdmin = usuario?.role === 'admin';
  // Analista y admin manejan compras (cargar ofertas, emitir OC, recibir mercancía).
  // El "aprobar" final (aceptar la oferta ganadora) sigue siendo solo del jefe/admin.
  const canManageProcurement = isAdmin || usuario?.role === 'analista';
  // El obrero solo crea solicitudes de pedido y las finaliza: sin acceso a Órdenes de Compra.
  const isObrero = usuario?.role === 'obrero';

  // Si el obrero quedara con scope 'oc' (estado viejo), lo forzamos a 'pedidos'.
  useEffect(() => {
    if (isObrero && scope !== 'pedidos') setScope('pedidos');
  }, [isObrero, scope]);

  // El admin arranca directo en Órdenes de Compra (una sola vez, al cargar su perfil).
  const scopeDefaulted = useRef(false);
  useEffect(() => {
    if (!usuario || scopeDefaulted.current) return;
    scopeDefaulted.current = true;
    if (usuario.role === 'admin') setScope('oc');
  }, [usuario]);

  const filteredOrdenes = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (viewMode === 'lista' && filterEstado && o.estado !== filterEstado) return false;
      if (q) {
        const prov = o.proveedor_id ? proveedorMap.get(o.proveedor_id) : undefined;
        const haystack = [
          o.codigo,
          prov?.razon_social,
          o.solicitante,
          o.solicitante_email,
          o.notas,
        ]
          .map((v) => (v ?? '').toString().toLowerCase())
          .join(' | ');
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [ordenes, filterText, filterEstado, viewMode, proveedorMap]);

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      /* localStorage no disponible */
    }
  }

  function switchScope(next: Scope) {
    setScope(next);
    try {
      localStorage.setItem(SCOPE_KEY, next);
    } catch {
      /* localStorage no disponible */
    }
  }

  const kanbanCols = scope === 'oc' ? KANBAN_COLS_OC : KANBAN_COLS_PEDIDOS;

  const currentDetail =
    modal.kind === 'detail' ? ordenes.find((o) => o.id === modal.ordenId) ?? null : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{scope === 'oc' ? 'Órdenes de Compra' : scope === 'compra_directa' ? 'Compra Directa' : scope === 'oc_lote' ? 'OC por lote' : 'Órdenes'}</h1>
          <p className="muted">
            {scope === 'oc'
              ? 'Seguimiento del ciclo de compras: emisión de OC, recepción y finalización del pedido.'
              : scope === 'oc_lote'
                ? 'Checklist de órdenes de compra pendientes por confirmar. Aprobá en lote, imprimí o enviá por correo.'
              : scope === 'compra_directa'
                ? 'Compras sin proveedor. En proceso → Finalizada: al finalizar, el material entra al inventario.'
                : isAdmin
                  ? 'Solicitudes de pedido generadas por analistas. Aprobá la mejor oferta antes de emitir la OC.'
                  : 'Crea solicitudes de pedido. El administrador aprueba antes de emitir la orden de compra.'}
          </p>
        </div>
        <div className="actions">
          <Link to="/app/pedidos/historico" className="btn btn-ghost" title="Ver histórico filtrable de órdenes">
            ⌕ Histórico
          </Link>
          {scope !== 'compra_directa' && scope !== 'oc_lote' && (
            <button
              className="btn btn-primary"
              onClick={() => setModal({ kind: 'create' })}
            >
              + Nueva orden
            </button>
          )}
        </div>
      </div>

      {/* El obrero no ve la pestaña de Órdenes de Compra: solo trabaja pedidos. */}
      {!isObrero && (
        <div
          className="view-toggle"
          role="tablist"
          aria-label="Tipo de vista"
          style={{ marginBottom: '1rem', marginLeft: 0 }}
        >
          <button
            className={scope === 'pedidos' ? 'active' : ''}
            onClick={() => switchScope('pedidos')}
            title="Ver órdenes de pedido"
          >
            ✉ Órdenes de Pedido
          </button>
          <button
            className={scope === 'oc' ? 'active' : ''}
            onClick={() => switchScope('oc')}
            title="Ver órdenes de compra"
          >
            🧾 Órdenes de Compra
          </button>
          <button
            className={scope === 'oc_lote' ? 'active' : ''}
            onClick={() => switchScope('oc_lote')}
            title="Checklist de compras pendientes por pagar"
          >
            📋 OC por lote
          </button>
          <button
            className={scope === 'compra_directa' ? 'active' : ''}
            onClick={() => switchScope('compra_directa')}
            title="Compras sin proveedor"
          >
            🛒 Compra Directa
          </button>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {scope === 'oc_lote' ? (
        <OcPorLoteView />
      ) : scope === 'compra_directa' ? (
        <CompraDirectaView
          actor={usuario?.email ?? user?.email ?? 'sistema'}
          actorName={usuario?.nombre ?? null}
        />
      ) : (
      <>
      <div className="filterbar">
        <input
          className="search"
          placeholder="Buscar por código, proveedor, solicitante…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value as EstadoOrden | '')}
          disabled={viewMode === 'kanban'}
          title={viewMode === 'kanban' ? 'Filtro deshabilitado en vista Kanban' : ''}
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas (OP)</option>
          <option value="oc_creada">OC creada</option>
          <option value="oc_aprobada">OC confirmada</option>
          <option value="pagada">Pagadas</option>
          <option value="desistida_proveedor">Proveedor desistió</option>
          <option value="recibida">Recibidas</option>
          <option value="finalizada">Finalizadas</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <div className="view-toggle" role="tablist" aria-label="Modo de vista">
          <button
            className={viewMode === 'kanban' ? 'active' : ''}
            onClick={() => switchView('kanban')}
            title="Vista Kanban"
          >
            ▦ Kanban
          </button>
          <button
            className={viewMode === 'lista' ? 'active' : ''}
            onClick={() => switchView('lista')}
            title="Vista Lista"
          >
            ☰ Lista
          </button>
        </div>
      </div>

      {loading ? (
        <EmptyState message="Cargando órdenes..." icon="◔" />
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          ordenes={filteredOrdenes}
          proveedorMap={proveedorMap}
          cols={kanbanCols}
          onOpen={(id) => setModal({ kind: 'detail', ordenId: id })}
        />
      ) : (
        <OrdenesTable
          ordenes={filteredOrdenes}
          proveedorMap={proveedorMap}
          isAdmin={isAdmin}
          onView={(id) => setModal({ kind: 'detail', ordenId: id })}
          onApprove={(o) => setModal({ kind: 'approve', orden: o })}
        />
      )}
      </>
      )}

      {/* Modal: detalle */}
      {modal.kind === 'detail' && currentDetail && (
        <OrdenDetailModal
          orden={currentDetail}
          proveedor={currentDetail.proveedor_id ? proveedorMap.get(currentDetail.proveedor_id) ?? null : null}
          proveedorMap={proveedorMap}
          isAdmin={isAdmin}
          canManageProcurement={canManageProcurement}
          enOc={scope === 'oc'}
          actorEmail={user?.email ?? ''}
          offersReloadKey={offersReloadKey}
          onAddOffer={() => setModal({ kind: 'add-offer', orden: currentDetail })}
          onAcceptedOffer={async () => {
            await refresh();
            setOffersReloadKey((k) => k + 1);
          }}
          onClose={() => setModal({ kind: 'none' })}
          onApprove={() => setModal({ kind: 'approve', orden: currentDetail })}
          onConfirmOc={() => setModal({ kind: 'confirm-oc', orden: currentDetail })}
          onCancel={() => setModal({ kind: 'cancel', orden: currentDetail })}
          onDesistir={() => setModal({ kind: 'desistir', orden: currentDetail })}
          onReceive={() => setModal({ kind: 'receive', orden: currentDetail })}
          onFinalizar={() => setModal({ kind: 'finalizar', orden: currentDetail })}
          usuarioRole={usuario?.role ?? null}
          onSeePriceHistory={(sku, nombre) =>
            setModal({ kind: 'price-history', sku, nombre })
          }
        />
      )}

      {/* Modal: crear */}
      {modal.kind === 'create' && (
        <CrearOrdenModal
          productos={productos}
          usuario={usuario}
          authEmail={user?.email ?? ''}
          onClose={() => setModal({ kind: 'none' })}
          onCreated={async () => {
            setModal({ kind: 'none' });
            await refresh();
          }}
        />
      )}

      {/* Modal: agregar oferta */}
      {modal.kind === 'add-offer' && (
        <AddOfferGate
          orden={modal.orden}
          proveedores={proveedores}
          registradoPorEmail={user?.email ?? ''}
          onClose={() => setModal({ kind: 'detail', ordenId: modal.orden.id })}
          onCreated={() => {
            setOffersReloadKey((k) => k + 1);
            setModal({ kind: 'detail', ordenId: modal.orden.id });
          }}
        />
      )}

      {/* Modal: aprobar */}
      {modal.kind === 'approve' && (
        <ConfirmDialog
          title="Aprobar orden"
          message={`Aprobar ${modal.orden.codigo} por ${money(modal.orden.total)}.`}
          confirmText="Aprobar"
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={async () => {
            try {
              await aprobarOrden(modal.orden, usuario?.email ?? user?.email ?? 'sistema');
              notify(`Orden aprobada: ${modal.orden.codigo}`, 'success', { link: '#/app/pedidos' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al aprobar', 'error');
            }
          }}
        />
      )}

      {/* Modal: cancelar */}
      {modal.kind === 'cancel' && (
        <MotivoModal
          title={`Cancelar ${modal.orden.codigo}`}
          confirmText="Cancelar orden"
          danger
          intro="Cancelar la orden. Útil cuando el cliente solicita cancelar o la empresa desiste del proyecto."
          label="Motivo"
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async (motivo) => {
            try {
              await cancelarOrden(modal.orden, usuario?.email ?? user?.email ?? 'sistema', motivo);
              notify(`Orden cancelada: ${modal.orden.codigo}`, 'warning', { link: '#/app/pedidos' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al cancelar', 'error');
            }
          }}
        />
      )}

      {/* Modal: desistir proveedor */}
      {modal.kind === 'desistir' && (
        <MotivoModal
          title={`Desistimiento · ${modal.orden.codigo}`}
          confirmText="Registrar desistimiento"
          danger
          intro="Registra que el proveedor no cumplió. La orden quedará abierta para reasignar a otro proveedor."
          label="¿Por qué no cumplió?"
          placeholder="No respondió, no entregó a tiempo, retiró la propuesta…"
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async (motivo) => {
            try {
              await desistirProveedor(
                modal.orden,
                usuario?.email ?? user?.email ?? 'sistema',
                motivo
              );
              notify(`Proveedor desistió en ${modal.orden.codigo} · abierta para reasignar`, 'warning', { link: '#/app/pedidos' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error', 'error');
            }
          }}
        />
      )}

      {/* Modal: confirmar OC individual (Gerente General) · elige almacén destino */}
      {modal.kind === 'confirm-oc' && (
        <ConfirmarOcModal
          orden={modal.orden}
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async (almacenDestino) => {
            try {
              await aprobarOcsEnLote([modal.orden], usuario?.email ?? user?.email ?? 'sistema', almacenDestino);
              notify(`OC confirmada: ${modal.orden.oc_codigo ?? modal.orden.codigo} · destino ${almacenDestino} · pasa a Tesorería`, 'success', { link: '#/app/tesoreria' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al confirmar', 'error');
            }
          }}
        />
      )}

      {/* Modal: recibir */}
      {modal.kind === 'receive' && (
        <ConfirmDialog
          title="Marcar como recibida"
          message={`Confirmar la recepción de ${modal.orden.codigo}. El stock se incrementará en el almacén.`}
          confirmText="Confirmar recepción"
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={async () => {
            try {
              await recibirOrden(
                modal.orden,
                usuario?.email ?? user?.email ?? 'sistema',
                usuario?.nombre ?? null
              );
              notify(`Mercancía recibida · ${modal.orden.codigo} · stock actualizado`, 'success', { link: '#/app/inventario' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al recibir', 'error');
            }
          }}
        />
      )}

      {/* Modal: finalizar pedido + evaluación de recepción (calidad/puntualidad/comentario) */}
      {modal.kind === 'finalizar' && (
        <FinalizarPedidoModal
          orden={modal.orden}
          rolEvaluador={usuario?.role === 'obrero' ? 'almacenista' : 'jefe'}
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async ({ calidad, puntualidadDias, comentario }) => {
            const actor = usuario?.email ?? user?.email ?? 'sistema';
            // Registrar la evaluación (queda en la trazabilidad PDF y en el correo).
            if (modal.orden.proveedor_id) {
              await crearEvaluacion({
                orden_id: modal.orden.id,
                proveedor_id: modal.orden.proveedor_id,
                calidad,
                puntualidad_dias: puntualidadDias,
                comentario: comentario || null,
                evaluado_por_email: actor,
                evaluado_por_rol: usuario?.role === 'obrero' ? 'almacenista' : 'jefe',
              });
            }
            await finalizarPedido(modal.orden, actor);
            notify(`Pedido finalizado · ${modal.orden.codigo}`, 'success', { link: '#/app/pedidos' });
            setModal({ kind: 'none' });
            await refresh();
          }}
        />
      )}

      {/* Modal: histórico de precios (FASE 1) */}
      {modal.kind === 'price-history' && (
        <HistoricoPreciosModal
          sku={modal.sku}
          nombre={modal.nombre}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Gate: carga ofertas existentes y abre AgregarOfertaModal
   ───────────────────────────────────────────── */
function AddOfferGate({
  orden,
  proveedores,
  registradoPorEmail,
  onClose,
  onCreated,
}: {
  orden: Orden;
  proveedores: Proveedor[];
  registradoPorEmail: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [ya, setYa] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOfertasByOrden(orden.id)
      .then((rows) => { if (!cancelled) setYa(new Set(rows.map((r) => r.proveedor_id))); })
      .catch(() => { if (!cancelled) setYa(new Set()); });
    return () => { cancelled = true; };
  }, [orden.id]);

  if (!ya) return null;
  return (
    <AgregarOfertaModal
      orden={orden}
      proveedores={proveedores}
      proveedoresYaOfertados={ya}
      registradoPorEmail={registradoPorEmail}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

/* ─────────────────────────────────────────────
   Modal: confirmar OC eligiendo el almacén destino de la mercancía
   ───────────────────────────────────────────── */
function ConfirmarOcModal({
  orden,
  onClose,
  onConfirm,
}: {
  orden: Orden;
  onClose: () => void;
  onConfirm: (almacenDestino: string) => Promise<void> | void;
}) {
  const [almacenes, setAlmacenes] = useState<Almacen[] | null>(null);
  const [destino, setDestino] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAlmacenes()
      .then((rows) => {
        if (cancelled) return;
        setAlmacenes(rows);
        const activos = rows.filter((a) => a.estado !== 'inactivo');
        setDestino((activos[0] ?? rows[0])?.nombre ?? 'General');
      })
      .catch(() => { if (!cancelled) { setAlmacenes([]); setDestino('General'); } });
    return () => { cancelled = true; };
  }, []);

  const lista = (almacenes ?? []).filter((a) => a.estado !== 'inactivo');

  async function handleConfirm() {
    if (!destino) { toast('Elegí el almacén destino', 'error'); return; }
    setSaving(true);
    try { await onConfirm(destino); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title={`Confirmar OC ${orden.oc_codigo ?? orden.codigo}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-success" onClick={handleConfirm} disabled={saving || !destino}>
            {saving ? 'Confirmando…' : 'Confirmar OC'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Al confirmar, la OC pasa a <strong>"Confirmada (por pagar)"</strong> y queda disponible en Tesorería para el pago.
        Indicá <strong>a qué almacén se dirige la mercancía</strong>: ahí entrará el stock al recibirla.
      </p>

      <div className="form-row">
        <label>Almacén destino *</label>
        {almacenes === null ? (
          <div className="muted">Cargando almacenes…</div>
        ) : (
          <select className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
            {!lista.length && <option value="General">General</option>}
            {lista.map((a) => (
              <option key={a.id} value={a.nombre}>
                {a.nombre}{a.ubicacion ? ` · ${a.ubicacion}` : ''}
              </option>
            ))}
          </select>
        )}
        <small className="muted">Se desglosan los almacenes existentes del módulo de inventario.</small>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Modal: finalizar pedido + evaluación de recepción
   ───────────────────────────────────────────── */
function FinalizarPedidoModal({
  orden,
  rolEvaluador,
  onClose,
  onConfirm,
}: {
  orden: Orden;
  rolEvaluador: 'almacenista' | 'jefe';
  onClose: () => void;
  onConfirm: (data: { calidad: number; puntualidadDias: number; comentario: string }) => Promise<void>;
}) {
  const [calidad, setCalidad] = useState(5);
  const [puntualidad, setPuntualidad] = useState<'en_fecha' | 'adelantado' | 'atrasado'>('en_fecha');
  const [dias, setDias] = useState('1');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const CALIDAD_LABEL: Record<number, string> = {
    5: '5 · Excelente', 4: '4 · Buena', 3: '3 · Aceptable', 2: '2 · Deficiente', 1: '1 · Muy mala',
  };

  async function handle() {
    setError(null);
    const d = Math.max(0, Math.floor(Number(dias) || 0));
    const puntualidadDias = puntualidad === 'en_fecha' ? 0 : puntualidad === 'adelantado' ? d : -d;
    setSaving(true);
    try {
      await onConfirm({ calidad, puntualidadDias, comentario: comentario.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo finalizar');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Finalizar pedido · ${orden.codigo}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handle} disabled={saving}>
            {saving ? 'Finalizando…' : 'Finalizar'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Confirmá que recibiste todo correctamente y evaluá la recepción
        {orden.proveedor_id ? ' del proveedor' : ''}. Esta evaluación queda en la
        <strong> trazabilidad PDF</strong> y en el correo.
      </p>

      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      <div className="form-row">
        <label>Calidad a evaluar *</label>
        <select className="select" value={calidad} onChange={(e) => setCalidad(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{CALIDAD_LABEL[n]}</option>)}
        </select>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Puntualidad *</label>
          <select className="select" value={puntualidad} onChange={(e) => setPuntualidad(e.target.value as typeof puntualidad)}>
            <option value="en_fecha">En la fecha prometida</option>
            <option value="adelantado">Adelantado</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>
        {puntualidad !== 'en_fecha' && (
          <div className="form-row">
            <label>Días {puntualidad === 'adelantado' ? 'de adelanto' : 'de atraso'}</label>
            <input className="input mono" type="number" min={0} step={1} value={dias} onChange={(e) => setDias(e.target.value)} />
          </div>
        )}
      </div>

      <div className="form-row">
        <label>Comentario adicional (opcional)</label>
        <textarea className="input" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)}
          placeholder="Observaciones de la recepción…" />
      </div>
      <small className="muted">Evaluador: {rolEvaluador === 'jefe' ? 'Jefe / analista' : 'Almacenista'}.</small>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Sub-componente: tabla (vista Lista)
   ───────────────────────────────────────────── */
interface OrdenesTableProps {
  ordenes: Orden[];
  proveedorMap: Map<string, Proveedor>;
  isAdmin: boolean;
  onView: (id: string) => void;
  onApprove: (o: Orden) => void;
}
function OrdenesTable({ ordenes, proveedorMap, isAdmin, onView, onApprove }: OrdenesTableProps) {
  if (!ordenes.length) {
    return (
      <div className="card">
        <EmptyState message="Sin órdenes que coincidan." icon="✉" />
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Proveedor</th>
            <th>Solicitante</th>
            <th style={{ textAlign: 'right' }}>Ítems</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ordenes.map((o) => {
            const prov = o.proveedor_id ? proveedorMap.get(o.proveedor_id) : undefined;
            const canApprove = isAdmin && o.estado === 'pendiente';
            const cambios = (o.historial ?? []).filter((h) => h.evento === 'proveedor_cambiado').length;
            return (
              <tr key={o.id}>
                <td className="mono">{o.codigo}</td>
                <td>
                  <div>{prov?.razon_social ?? '—'}</div>
                  {cambios > 0 && (
                    <div className="muted" style={{ fontSize: '.72rem' }}>
                      ↻ {cambios} cambio(s) de proveedor
                    </div>
                  )}
                </td>
                <td>
                  <div>{o.solicitante ?? '—'}</div>
                  <div className="muted" style={{ fontSize: '.75rem' }}>{o.solicitante_email}</div>
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{o.items.length}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(o.total)}</td>
                <td><StatusBadge estado={o.estado} /></td>
                <td className="muted" style={{ fontSize: '.82rem' }}>{dateTime(o.created_at)}</td>
                <td className="actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => onView(o.id)}>Ver</button>
                  {canApprove && (
                    <button className="btn btn-sm btn-success" onClick={() => onApprove(o)}>Aprobar</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-componente: Kanban
   ───────────────────────────────────────────── */
interface KanbanBoardProps {
  ordenes: Orden[];
  proveedorMap: Map<string, Proveedor>;
  cols: { key: EstadoOrden; label: string }[];
  onOpen: (id: string) => void;
}
function KanbanBoard({ ordenes, proveedorMap, cols, onOpen }: KanbanBoardProps) {
  const byState = useMemo(() => {
    const map = new Map<EstadoOrden, Orden[]>();
    cols.forEach((c) => map.set(c.key, []));
    ordenes.forEach((o) => {
      const list = map.get(o.estado);
      if (list) list.push(o);
    });
    return map;
  }, [ordenes, cols]);

  return (
    <div className="kanban">
      {cols.map((col) => {
        const items = byState.get(col.key) ?? [];
        return (
          <div className="kanban-col" data-state={col.key} key={col.key}>
            <div className="kanban-col-head">
              <span className="title">{col.label}</span>
              <span className="count">{items.length}</span>
            </div>
            <div className="kanban-col-body">
              {items.length === 0 ? (
                <div className="kanban-empty">Sin órdenes</div>
              ) : (
                items.map((o) => (
                  <KanbanCard
                    key={o.id}
                    orden={o}
                    proveedor={o.proveedor_id ? proveedorMap.get(o.proveedor_id) ?? null : null}
                    onOpen={() => onOpen(o.id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const KanbanCard = memo(function KanbanCard({
  orden,
  proveedor,
  onOpen,
}: {
  orden: Orden;
  proveedor: Proveedor | null;
  onOpen: () => void;
}) {
  const changes = (orden.historial ?? []).filter((h) => h.evento === 'proveedor_cambiado').length;
  return (
    <div
      className="kanban-card"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      <div className="code">{orden.codigo}</div>
      <div className="prov">
        {proveedor?.razon_social
          ?? (orden.solicitante ? `Solicita: ${orden.solicitante}` : 'Sin proveedor asignado')}
      </div>
      <div className="meta">
        <span>{orden.items.length} ítem{orden.items.length !== 1 ? 's' : ''}</span>
        {changes > 0 && (
          <span className="badge warning" style={{ fontSize: '.65rem', padding: '.05rem .35rem' }}>
            ↻ {changes}
          </span>
        )}
      </div>
      <div className="meta" style={{ fontSize: '.72rem', marginTop: '.15rem' }} title="Solicitante y fecha de creación">
        <span>👤 {orden.solicitante ?? orden.solicitante_email ?? '—'}</span>
        <span className="muted">· {dateTime(orden.created_at)}</span>
      </div>
      <div className="foot">
        <span className="total">{money(orden.total)}</span>
        <span className="when" title={dateTime(orden.created_at)}>{relTime(orden.created_at)}</span>
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────
   Modal: Detalle de la orden + historial
   ───────────────────────────────────────────── */
interface OrdenDetailModalProps {
  orden: Orden;
  proveedor: Proveedor | null;
  proveedorMap: Map<string, Proveedor>;
  isAdmin: boolean;
  canManageProcurement: boolean;
  /** true cuando se abre desde la pestaña Órdenes de Compra (allí se gestionan ofertas/proveedor). */
  enOc: boolean;
  actorEmail: string;
  onClose: () => void;
  onApprove: () => void;
  onConfirmOc: () => void;
  onCancel: () => void;
  onDesistir: () => void;
  onReceive: () => void;
  onFinalizar: () => void;
  onSeePriceHistory: (sku: string, nombre: string) => void;
  onAddOffer: () => void;
  onAcceptedOffer: () => void;
  offersReloadKey: number;
  usuarioRole: string | null;
}
function OrdenDetailModal({
  orden: o,
  proveedor,
  proveedorMap,
  isAdmin,
  canManageProcurement,
  enOc,
  actorEmail,
  onClose,
  onApprove,
  onConfirmOc,
  onCancel,
  onDesistir,
  onReceive,
  onFinalizar,
  onSeePriceHistory,
  onAddOffer,
  onAcceptedOffer,
  offersReloadKey,
  usuarioRole,
}: OrdenDetailModalProps) {
  const isPendiente = o.estado === 'pendiente';
  // La OP la aprueba quien gestiona compras (admin o analista); al aprobarla pasa a
  // Órdenes de Compra. La elección de la oferta ganadora sí queda solo para el jefe/admin.
  const canApprove = canManageProcurement && isPendiente;  // Aprobar Orden de Pedido
  const isOcCreada = o.estado === 'oc_creada';      // oferta elegida, sin confirmar
  const isOcAprobada = o.estado === 'oc_aprobada';  // confirmada en lote → Tesorería
  const isPagada = o.estado === 'pagada';
  const isOcEmitida = o.estado === 'oc_emitida';    // legado
  const isRecibida = o.estado === 'recibida';
  const canCancel = ['pendiente', 'aprobada'].includes(o.estado);

  const puedeTrazabilidad = ['recibida', 'finalizada'].includes(o.estado);
  const isFinalizada = o.estado === 'finalizada';
  // Las ofertas (añadir proveedor) se gestionan SOLO desde la pestaña Órdenes de Compra.
  const mostrarOfertas = enOc && ['aprobada', 'desistida_proveedor', 'oc_creada', 'oc_aprobada', 'pagada'].includes(o.estado);

  const canFinalizarOrden = isRecibida && (isAdmin || usuarioRole === 'analista');
  const canCerrarSolicitudObrero = isRecibida && usuarioRole === 'obrero';

  const [enviarOpen, setEnviarOpen] = useState(false);

  async function handleDownloadPdf() {
    try {
      await descargarTrazabilidadPdf(o.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error');
    }
  }
  function handleOcPdf() {
    descargarOrdenCompraPdf(o.id).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar', 'error'));
  }
  async function handleComprobante() {
    if (!o.factura_path) return;
    try {
      const url = await urlAdjuntoOc(o.factura_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir el comprobante', 'error');
    }
  }

  const buttons = (
    <>
      {/* Etapa OP: solo Aprobar / Rechazar Orden de Pedido + PDF de la OP. */}
      {isPendiente && (
        <button className="btn btn-ghost" onClick={handleDownloadPdf} title="Descargar la Orden de Pedido en PDF">
          ↓ PDF de la OP
        </button>
      )}
      {puedeTrazabilidad && (
        <button className="btn btn-ghost" onClick={handleDownloadPdf} title="Descargar trazabilidad en PDF">
          ↓ Trazabilidad PDF
        </button>
      )}
      {isFinalizada && (
        <button
          className="btn btn-ghost"
          onClick={() => setEnviarOpen(true)}
          title="Enviar la trazabilidad por correo"
        >
          📧 Enviar por correo
        </button>
      )}
      {canCancel && (
        <button className="btn btn-danger" onClick={onCancel}>Cancelar orden</button>
      )}
      {/* Etapa OC: oferta ya elegida (sin confirmar). Se confirma individual o en lote (checklist). */}
      {isOcCreada && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={onDesistir} title="Proveedor no cumplió">⚠ Proveedor desistió</button>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
        </>
      )}
      {isOcCreada && isAdmin && (
        <button className="btn btn-success" onClick={onConfirmOc} title="Aprobar esta OC de forma puntual (sin pasar por el lote)">
          ✔ Aprobar OC
        </button>
      )}
      {/* OC confirmada: el pago se hace en Tesorería → Órdenes pendientes por pagar. */}
      {isOcAprobada && (
        <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
      )}
      {/* Comprobante de pago cargado en Tesorería (disponible desde que la OC está pagada). */}
      {o.factura_path && (
        <button className="btn btn-ghost" onClick={handleComprobante} title={o.factura_nombre ?? 'Comprobante de pago'}>
          ↓ Comprobante de pago
        </button>
      )}
      {/* OC pagada: ya se puede recibir la mercancía. */}
      {isPagada && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
          <button className="btn btn-primary" onClick={onReceive}>Marcar recibida</button>
        </>
      )}
      {isOcEmitida && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={onDesistir} title="Proveedor no cumplió">⚠ Proveedor desistió</button>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Volver a descargar el PDF de la OC">↓ OC PDF</button>
          <button className="btn btn-primary" onClick={onReceive}>Marcar recibida</button>
        </>
      )}
      {canFinalizarOrden && (
        <button className="btn btn-primary" onClick={onFinalizar} title="Marcar la orden como finalizada">
          ✓ Finalizar orden
        </button>
      )}
      {canCerrarSolicitudObrero && (
        <button className="btn btn-primary" onClick={onFinalizar} title="Confirmar recepción y cerrar tu solicitud">
          ✓ Cerrar solicitud
        </button>
      )}
      {canApprove && (
        <button className="btn btn-success" onClick={onApprove} title="Aprobar la Orden de Pedido">
          Aprobar Orden de Pedido
        </button>
      )}
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
    </>
  );

  return (
    <>
    <Modal title={`Orden ${o.codigo}`} size="lg" onClose={onClose} footer={buttons}>
      <div className="detail-row">
        <div className="k">Código</div>
        <div className="v mono">{o.codigo}</div>
      </div>
      <div className="detail-row">
        <div className="k">Estado</div>
        <div className="v"><StatusBadge estado={o.estado} /></div>
      </div>
      <div className="detail-row">
        <div className="k">Proveedor actual</div>
        <div className="v">
          {proveedor?.razon_social ?? '—'}{' '}
          <span className="muted mono">{proveedor?.rif ?? ''}</span>
        </div>
      </div>
      <div className="detail-row">
        <div className="k">Solicitante</div>
        <div className="v">
          {o.solicitante ?? '—'} <span className="muted">({o.solicitante_email})</span>
        </div>
      </div>
      <div className="detail-row">
        <div className="k">Creada</div>
        <div className="v">{dateTime(o.created_at)}</div>
      </div>
      {o.aprobada_en && (
        <div className="detail-row">
          <div className="k">Aprobada</div>
          <div className="v">
            {dateTime(o.aprobada_en)} <span className="muted">por {o.aprobada_por ?? '—'}</span>
          </div>
        </div>
      )}
      {o.rechazada_en && (
        <div className="detail-row">
          <div className="k">Rechazada</div>
          <div className="v">{dateTime(o.rechazada_en)} · {o.motivo_rechazo ?? ''}</div>
        </div>
      )}
      {o.oc_codigo && (
        <div className="detail-row">
          <div className="k">Código OC</div>
          <div className="v mono">{o.oc_codigo}</div>
        </div>
      )}
      {o.oc_creada_en && (
        <div className="detail-row">
          <div className="k">OC creada</div>
          <div className="v">{dateTime(o.oc_creada_en)} <span className="muted">por {o.oc_creada_por ?? '—'}</span></div>
        </div>
      )}
      {o.oc_aprobada_en && (
        <div className="detail-row">
          <div className="k">OC confirmada</div>
          <div className="v">{dateTime(o.oc_aprobada_en)} <span className="muted">por {o.oc_aprobada_por ?? '—'}</span></div>
        </div>
      )}
      {o.pagada_en && (
        <div className="detail-row">
          <div className="k">Pagada</div>
          <div className="v">{dateTime(o.pagada_en)} <span className="muted">por {o.pagada_por ?? '—'}</span></div>
        </div>
      )}
      {o.notas && (
        <div className="detail-row">
          <div className="k">Notas</div>
          <div className="v">{o.notas}</div>
        </div>
      )}

      {mostrarOfertas && (
        <OfertasComparativa
          orden={o}
          proveedorMap={proveedorMap}
          canDecidir={canManageProcurement}
          canCrearOferta={canManageProcurement}
          actorEmail={actorEmail}
          reloadKey={offersReloadKey}
          onAccepted={onAcceptedOffer}
          onAddOferta={onAddOffer}
        />
      )}

      <h4 style={{ marginTop: '1rem' }}>Ítems</h4>
      <table className="items-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th className="num">Cantidad</th>
            <th className="num">Precio</th>
            <th className="num">Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((it, idx) => (
            <tr key={`${it.sku}-${idx}`}>
              <td className="mono">{it.sku}</td>
              <td>{it.nombre}</td>
              <td className="num">{num(it.cantidad)}</td>
              <td className="num">{money(it.precio)}</td>
              <td className="num">{money(it.cantidad * it.precio)}</td>
              <td>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => onSeePriceHistory(it.sku, it.nombre)}
                  title="Comparativa histórica de precios"
                >
                  ⌁ histórico
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="num">TOTAL</td>
            <td className="num">{money(o.total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <h4 style={{ marginTop: '1.25rem' }}>Historial</h4>
      <Timeline historial={o.historial ?? []} proveedorMap={proveedorMap} />
    </Modal>
    {enviarOpen && (
      <EnviarPorCorreoModal
        ordenId={o.id}
        ordenCodigo={o.codigo}
        defaultEmail={actorEmail}
        onClose={() => setEnviarOpen(false)}
      />
    )}
    </>
  );
}

function EnviarPorCorreoModal({
  ordenId,
  ordenCodigo,
  defaultEmail,
  onClose,
}: {
  ordenId: string;
  ordenCodigo: string;
  defaultEmail: string;
  onClose: () => void;
}) {
  const [incluirPropio, setIncluirPropio] = useState(true);
  const [extra, setExtra] = useState('');
  const [enviando, setEnviando] = useState(false);

  const propio = defaultEmail.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleEnviar() {
    const lista: string[] = [];
    if (incluirPropio && propio) lista.push(propio);
    const extraClean = extra.trim().toLowerCase();
    if (extraClean) {
      if (!emailRx.test(extraClean)) {
        toast('El correo adicional no es válido', 'error');
        return;
      }
      lista.push(extraClean);
    }
    if (!lista.length) {
      toast('Marcá al menos un destinatario', 'error');
      return;
    }
    setEnviando(true);
    try {
      const { enviados, fallidos } = await enviarTrazabilidadAMultiples(ordenId, lista);
      if (fallidos.length) {
        const detalle = fallidos.map((f) => `${f.email} (${f.motivo})`).join(' · ');
        notify(`Enviado a ${enviados.join(', ')}. Falló: ${detalle}`, 'warning', { link: '#/app/pedidos' });
      } else {
        notify(`Trazabilidad enviada a ${enviados.join(', ')}`, 'success', { link: '#/app/pedidos' });
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Enviar trazabilidad · ${ordenCodigo}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>
            {enviando ? 'Enviando…' : '📧 Enviar'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Se enviará el PDF de trazabilidad de la orden a los destinatarios seleccionados.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '.6rem',
          padding: '.7rem .85rem',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: incluirPropio ? 'rgba(255,138,0,0.06)' : 'transparent',
          cursor: propio ? 'pointer' : 'not-allowed',
          marginBottom: '.6rem',
        }}
      >
        <input
          type="checkbox"
          checked={incluirPropio}
          disabled={!propio}
          onChange={(e) => setIncluirPropio(e.target.checked)}
        />
        <div>
          <div style={{ fontWeight: 600 }}>Tu correo</div>
          <div className="mono" style={{ fontSize: '.82rem' }}>{propio || '—'}</div>
        </div>
      </label>

      <div className="form-row" style={{ marginTop: '.4rem' }}>
        <label>Correo adicional (opcional)</label>
        <input
          className="input"
          type="email"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="otro@correo.com"
          maxLength={120}
        />
        <small className="muted">Podés mandarlo a un segundo destinatario al mismo tiempo.</small>
      </div>
    </Modal>
  );
}

function Timeline({
  historial,
  proveedorMap,
}: {
  historial: EventoHistorial[];
  proveedorMap: Map<string, Proveedor>;
}) {
  if (!historial.length) return <p className="muted">Sin eventos registrados.</p>;
  // Mostrar en orden cronológico inverso (más reciente arriba).
  const items = [...historial].reverse();
  return (
    <div className="timeline">
      {items.map((h, i) => {
        const ext = h as EventoHistorial & {
          proveedorAnteriorId?: string;
          proveedorNuevoId?: string;
        };
        const anterior = ext.proveedorAnteriorId ? proveedorMap.get(ext.proveedorAnteriorId) : null;
        const nuevo = ext.proveedorNuevoId ? proveedorMap.get(ext.proveedorNuevoId) : null;
        let extra = '';
        if (h.motivo) extra = ` · ${h.motivo}`;
        if (anterior && nuevo) {
          extra = ` · de ${anterior.razon_social} → ${nuevo.razon_social}${
            h.motivo ? ' · ' + h.motivo : ''
          }`;
        }
        return (
          <div className="tl-item" key={`${h.at}-${i}`}>
            <div className={`tl-dot ${eventClass(h.evento)}`}></div>
            <div className="tl-body">
              <div className="tl-title">
                {eventLabel(h.evento)}
                {extra}
              </div>
              {h.documentos && h.documentos.length > 0 && (
                <div className="tl-meta" style={{ marginTop: '.15rem' }}>
                  📄 Documentos: {h.documentos.join(' · ')}
                </div>
              )}
              <div className="tl-meta">{dateTime(h.at)} · {h.actor}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Modal: Crear orden
   ───────────────────────────────────────────── */
interface CrearOrdenModalProps {
  productos: Producto[];
  usuario: Usuario | null;
  authEmail: string;
  onClose: () => void;
  onCreated: () => void;
}
function CrearOrdenModal({
  productos,
  usuario,
  authEmail,
  onClose,
  onCreated,
}: CrearOrdenModalProps) {
  const [items, setItems] = useState<ItemOrden[]>([]);
  const [notas, setNotas] = useState('');
  const [clasificacion, setClasificacion] = useState<Set<string>>(new Set());
  function toggleClasif(c: string) {
    setClasificacion((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }
  // Productos del inventario + los nuevos creados al vuelo en este modal.
  const [extraProductos, setExtraProductos] = useState<Producto[]>([]);
  const allProductos = useMemo(() => [...productos, ...extraProductos], [productos, extraProductos]);
  const [prodSelectId, setProdSelectId] = useState<string>(productos[0]?.id ?? '');
  const [codigo, setCodigo] = useState<string>('…');
  const [submitting, setSubmitting] = useState(false);

  // Alta rápida de un producto que aún no existe en inventario (datos mínimos;
  // el resto se completa luego desde el módulo de inventario).
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCategoria, setNuevoCategoria] = useState('GENERAL');
  const [nuevoUnidad, setNuevoUnidad] = useState('und');
  const [creandoNuevo, setCreandoNuevo] = useState(false);

  async function crearProductoNuevo() {
    const nombre = nuevoNombre.trim().toUpperCase();
    if (!nombre) { toast('Escribí el nombre del producto', 'error'); return; }
    setCreandoNuevo(true);
    try {
      const base = nombre.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'PROD';
      const sufijo = Math.floor(performance.now() % 100000).toString(36).toUpperCase();
      const creado = await createProducto({
        sku: `NEW-${base}-${sufijo}`,
        nombre,
        categoria: nuevoCategoria.trim().toUpperCase() || 'GENERAL',
        unidad: nuevoUnidad.trim() || 'und',
        stock: 0,
        stock_min: 0,
        precio: 0,
        almacen: 'General',
        estado: 'activo',
      });
      setExtraProductos((prev) => [...prev, creado]);
      setProdSelectId(creado.id);
      // Agregar de una vez a la solicitud.
      setItems((prev) => prev.some((i) => i.productoId === creado.id)
        ? prev
        : [...prev, { productoId: creado.id, sku: creado.sku, nombre: creado.nombre, cantidad: 1, precio: 0 }]);
      toast(`Producto "${creado.nombre}" creado en inventario · completá el resto luego`, 'success');
      setNuevoNombre('');
      setNuevoOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el producto', 'error');
    } finally {
      setCreandoNuevo(false);
    }
  }

  // Solicitante y CI vienen de la ficha del usuario en la BD (módulo Usuarios).
  const solicitanteNombre = usuario?.nombre ?? authEmail;
  const solicitanteCi = usuario?.ci ?? '';

  useEffect(() => {
    nextCodigo().then(setCodigo).catch(() => setCodigo('OP-?'));
  }, []);

  function addItem() {
    const p = allProductos.find((x) => x.id === prodSelectId);
    if (!p) return;
    setItems((prev) => {
      const ex = prev.find((i) => i.productoId === p.id);
      if (ex) {
        return prev.map((i) =>
          i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      // Precio inicia en 0; el precio real lo fija la oferta del proveedor.
      return [
        ...prev,
        { productoId: p.id, sku: p.sku, nombre: p.nombre, cantidad: 1, precio: 0 },
      ];
    });
  }

  function updateItem(idx: number, patch: Partial<ItemOrden>) {
    setItems((prev) => prev.map((i, k) => (k === idx ? { ...i, ...patch } : i)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, k) => k !== idx));
  }

  async function handleSubmit() {
    if (!items.length) {
      toast('Añade al menos un producto', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const email = usuario?.email ?? authEmail;
      const saved = await crearOrden({
        // proveedor_id se asigna luego por el admin durante el flujo de sourcing.
        proveedor_id: null,
        items,
        notas: notas.trim() || null,
        clasificacion: CLASIFICACION_PEDIDO.filter((c) => clasificacion.has(c)),
        solicitante_email: email,
        solicitante: usuario?.nombre ?? null,
        ci_solicitante: usuario?.ci ?? null,
      });
      notify(`Nueva orden de pedido ${saved.codigo} enviada para aprobación`, 'success', { link: '#/app/pedidos', destino: 'admin' });
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al crear', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Nueva orden de pedido"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Crear solicitud'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-row">
          <label>Solicitante</label>
          <input className="input" value={solicitanteNombre} disabled />
        </div>
        <div className="form-row">
          <label>Código</label>
          <input className="input mono" value={codigo} disabled />
        </div>
      </div>

      <div className="form-row">
        <label>CI</label>
        <input
          className="input mono"
          value={solicitanteCi || ''}
          placeholder={solicitanteCi ? '' : 'No registrada en tu ficha de usuario'}
          disabled
        />
      </div>

      <div className="form-row">
        <label>Productos solicitados</label>
        <div className="line-picker head" style={{ gridTemplateColumns: '2fr 90px 40px' }}>
          <div>Producto</div>
          <div>Cantidad</div>
          <div></div>
        </div>
        <div>
          {items.map((it, idx) => (
            <div className="line-picker" key={`${it.sku}-${idx}`} style={{ gridTemplateColumns: '2fr 90px 40px' }}>
              <div>
                <div>{it.nombre}</div>
                <div className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</div>
              </div>
              <input
                className="input mono"
                type="number"
                min={1}
                step={1}
                value={it.cantidad}
                onChange={(e) =>
                  updateItem(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })
                }
              />
              <button
                type="button"
                className="rm"
                title="Quitar"
                onClick={() => removeItem(idx)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem' }}>
          <select
            className="select"
            style={{ flex: 1 }}
            value={prodSelectId}
            onChange={(e) => setProdSelectId(e.target.value)}
          >
            {allProductos.map((p) => (
              <option value={p.id} key={p.id}>
                {p.sku} · {p.nombre}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={addItem}>+ Añadir</button>
        </div>

        <div style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNuevoOpen((v) => !v)}>
            {nuevoOpen ? '× Cerrar' : '+ Producto nuevo (no existe en inventario)'}
          </button>
          {nuevoOpen && (
            <div className="card" style={{ padding: '.65rem', marginTop: '.4rem', display: 'grid', gap: '.5rem' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>
                Datos mínimos. Se crea en inventario y lo completás luego (stock, precio, almacén…).
              </div>
              <input
                className="input"
                placeholder="Nombre del producto *"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value.toUpperCase())}
              />
              <div className="form-grid">
                <input className="input" placeholder="Categoría" value={nuevoCategoria} onChange={(e) => setNuevoCategoria(e.target.value)} />
                <input className="input" placeholder="Unidad" value={nuevoUnidad} onChange={(e) => setNuevoUnidad(e.target.value)} />
              </div>
              <div>
                <button type="button" className="btn btn-sm btn-primary" onClick={crearProductoNuevo} disabled={creandoNuevo}>
                  {creandoNuevo ? 'Creando…' : 'Crear y añadir a la solicitud'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="form-row">
        <label>Clasificación del pedido</label>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {CLASIFICACION_PEDIDO.map((c) => {
            const checked = clasificacion.has(c);
            return (
              <label
                key={c}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.45rem',
                  padding: '.45rem .7rem', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: checked ? 'rgba(255,138,0,0.08)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleClasif(c)} />
                <span style={{ fontWeight: 600 }}>{c}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="form-row">
        <label>Notas / justificación</label>
        <textarea
          className="textarea"
          placeholder="Motivo de la solicitud, frente de trabajo, urgencia…"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>

      <p className="muted" style={{ fontSize: '.78rem', marginTop: '.75rem' }}>
        El precio lo fijará el proveedor al cargar su oferta. La solicitud queda sin monto hasta entonces.
      </p>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Modal: Captura de motivo (rechazo / cancelación / desistimiento)
   ───────────────────────────────────────────── */
interface MotivoModalProps {
  title: string;
  confirmText: string;
  label: string;
  intro?: string;
  placeholder?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void | Promise<void>;
}
function MotivoModal({
  title,
  confirmText,
  label,
  intro,
  placeholder,
  danger,
  onClose,
  onConfirm,
}: MotivoModalProps) {
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={submitting || !motivo.trim()}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm(motivo.trim());
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      {intro && <p className="muted">{intro}</p>}
      <div className="form-row">
        <label>{label}</label>
        <textarea
          className="textarea"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={placeholder}
          required
        />
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Modal: Comparativa histórica de precios por SKU (FASE 1)
   ───────────────────────────────────────────── */
interface HistoricoPreciosModalProps {
  sku: string;
  nombre: string;
  onClose: () => void;
}
function HistoricoPreciosModal({ sku, nombre, onClose }: HistoricoPreciosModalProps) {
  const [rows, setRows] = useState<PrecioHistorico[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHistoricoPreciosPorSku(sku)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error');
      });
    return () => {
      cancelled = true;
    };
  }, [sku]);

  // Agrupar por proveedor y calcular min/promedio/max.
  const resumen = useMemo(() => {
    if (!rows) return [];
    const grupos = new Map<string, { nombre: string; precios: number[] }>();
    rows.forEach((r) => {
      const g = grupos.get(r.proveedor_id) ?? { nombre: r.proveedor_nombre, precios: [] };
      g.precios.push(r.precio);
      grupos.set(r.proveedor_id, g);
    });
    return Array.from(grupos.entries()).map(([id, g]) => {
      const min = Math.min(...g.precios);
      const max = Math.max(...g.precios);
      const avg = g.precios.reduce((a, b) => a + b, 0) / g.precios.length;
      return { id, nombre: g.nombre, min, max, avg, n: g.precios.length };
    });
  }, [rows]);

  return (
    <Modal
      title={`Histórico de precios · ${sku}`}
      size="lg"
      onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      <p className="muted">{nombre}</p>
      {err && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <strong>Error:</strong> {err}
        </div>
      )}
      {!rows && !err && <EmptyState message="Cargando…" icon="◔" />}
      {rows && rows.length === 0 && (
        <EmptyState message="No hay órdenes anteriores con este SKU." icon="◇" />
      )}
      {rows && rows.length > 0 && (
        <>
          <h4 style={{ marginTop: '1rem' }}>Resumen por proveedor</h4>
          <table className="items-table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="num">Mín</th>
                <th className="num">Promedio</th>
                <th className="num">Máx</th>
                <th className="num">Compras</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.id}>
                  <td>{r.nombre}</td>
                  <td className="num">{money(r.min)}</td>
                  <td className="num">{money(r.avg)}</td>
                  <td className="num">{money(r.max)}</td>
                  <td className="num">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ marginTop: '1.25rem' }}>Detalle</h4>
          <table className="items-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Orden</th>
                <th>Proveedor</th>
                <th>Estado</th>
                <th className="num">Cantidad</th>
                <th className="num">Precio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.codigo_orden}-${i}`}>
                  <td className="muted" style={{ fontSize: '.82rem' }}>{dateTime(r.fecha)}</td>
                  <td className="mono">{r.codigo_orden}</td>
                  <td>{r.proveedor_nombre}</td>
                  <td><StatusBadge estado={r.estado_orden} /></td>
                  <td className="num">{num(r.cantidad)}</td>
                  <td className="num">{money(r.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
