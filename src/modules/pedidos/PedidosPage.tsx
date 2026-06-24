import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, money, num, relTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listAlertasMercadoPendientes, marcarAlertaAtendida, type AlertaMercado } from '@/modules/cocina/alertasMercado.repository';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type {
  EstadoOrden,
  EventoHistorial,
  ItemOrden,
  Orden,
  PagoMetodo,
  Producto,
  Proveedor,
  Usuario,
} from '@/shared/lib/types';
import {
  aprobarOrden,
  aprobarOcsEnLote,
  actualizarComprarItems,
  actualizarOrdenEditable,
  cancelarOrden,
  crearOrden,
  getUltimaCompraMercado,
  FINALIDAD_MERCADO,
  subirImagenOrden,
  getImagenOrdenSignedUrl,
  eliminarImagenOrden,
  desistirProveedor,
  finalizarPedido,
  getCurrentUsuario,
  getHistoricoPreciosPorSku,
  listOrdenes,
  listProductosActivos,
  listProveedoresActivos,
  listProveedores,
  nextCodigo,
  recibirOrdenParcial,
  enviarCreditoARecepcion,
  listAbonos,
  urlAdjuntoOc,
  adjuntarFacturaRecepcion,
  indicarMetodoPago,
  cambiarProveedorOrden,
  METODOS_PAGO,
  labelMetodoPago,
  type PrecioHistorico,
} from './pedidos.repository';
import { listOfertasByOrden, labelCondicionPago } from './ofertas.repository';
import { listCajasActivas } from '@/modules/salidas/cajas.repository';
import type { AbonoCredito, Caja } from '@/shared/lib/types';
import { listDatosPago, requiereDatos, type DatosPago } from './datosPago.repository';
import { DatosPagoFields, validarDatosPago } from '@/shared/ui/DatosPagoFields';
import { crearEvaluacion } from './evaluaciones.repository';
import { createProducto, updateProducto, getUnidades, findBySku } from '@/modules/inventario/inventario.repository';
import { listAlmacenes, getNombresAlmacenes, nombreCortoAlmacen } from '@/modules/inventario/almacenes.repository';
import { listUsuarios } from '@/modules/usuarios/usuarios.repository';
import type { Almacen } from '@/shared/lib/types';
import type { OfertaProveedor } from '@/shared/lib/types';
import { OfertasComparativa } from './OfertasComparativa';
import { AgregarOfertaModal } from './AgregarOfertaModal';
import { ChatOrden } from './ChatOrden';
import { noLeidosPorOrden } from './ordenChat.repository';
import { descargarTrazabilidadPdf } from './trazabilidadPdf';
import { enviarTrazabilidadAMultiples } from './enviarTrazabilidad';
import { descargarOrdenCompraPdf } from './ordenCompraPdf';
import { CompraDirectaView } from './CompraDirectaView';
import { OcPorLoteView } from './OcPorLoteView';
import { CategoriasModal } from './CategoriasModal';
import { CrearServicioModal } from './CrearServicioModal';
import { listActivosPedido, addCatalogoPedido } from './pedidoCatalogos.repository';

/* ============================================================
   Golden Touch · Pedidos / Órdenes · Página principal
   Mantiene la lógica de negocio del demo (estados, historial,
   reglas de aprobación) sobre datos persistidos en Supabase.
   ============================================================ */

const VIEW_KEY = 'mgg.view.pedidos';
const SCOPE_KEY = 'mgg.scope.pedidos';
type ViewMode = 'kanban' | 'lista';
type Scope = 'pedidos' | 'oc' | 'compra_directa' | 'oc_lote';

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
  { key: 'cuenta_abierta', label: 'Crédito / cuentas abiertas' },        // a crédito → abonos hasta saldar
  { key: 'confirmada_metodo', label: 'Confirmada (indicar método de pago)' }, // gerente confirmó → falta método
  { key: 'oc_aprobada', label: 'Confirmada pagar' },                     // método indicado → Tesorería
  { key: 'por_recibir', label: 'Pendiente por recepción' },             // contra entrega / crédito saldado
  { key: 'pagada', label: 'Pagada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'desistida_proveedor', label: 'Proveedor desistió' },
  { key: 'cancelada', label: 'Cancelada' },
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
      confirmada_metodo: 'OC confirmada · indicar método de pago',
      confirmada_por_recibir: 'OC confirmada · pendiente por recepción',
      confirmada_cuenta_abierta: 'OC confirmada · crédito (cuenta abierta)',
      metodo_pago: 'Método de pago indicado · enviada a pagar',
      oc_aprobada: 'Confirmada pagar',
      abono: 'Abono registrado (crédito)',
      credito_saldado: 'Crédito saldado · pendiente por recepción',
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
      confirmada_metodo: 'info',
      confirmada_por_recibir: 'info',
      confirmada_cuenta_abierta: 'warn',
      metodo_pago: 'ok',
      oc_aprobada: 'ok',
      abono: 'info',
      credito_saldado: 'ok',
      pagada: 'ok',
      recibida: 'ok',
      finalizada: 'ok',
    } as Record<string, string>
  )[ev] ?? '';
}

type ModalKind =
  | { kind: 'none' }
  | { kind: 'detail'; ordenId: string }
  | { kind: 'create'; mercado?: boolean }
  | { kind: 'create_servicio' }
  | { kind: 'approve'; orden: Orden }
  | { kind: 'confirm-oc'; orden: Orden }
  | { kind: 'metodo-pago'; orden: Orden }
  | { kind: 'cancel'; orden: Orden }
  | { kind: 'desistir'; orden: Orden }
  | { kind: 'receive'; orden: Orden }
  | { kind: 'abono'; orden: Orden }
  | { kind: 'finalizar'; orden: Orden }
  | { kind: 'price-history'; sku: string; nombre: string }
  | { kind: 'edit-orden'; orden: Orden }
  | { kind: 'add-offer'; orden: Orden }
  | { kind: 'edit-offer'; orden: Orden; oferta: OfertaProveedor };

export function PedidosPage() {
  const { user } = useSession();
  const { can } = usePermissions();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedoresAll, setProveedoresAll] = useState<Proveedor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
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
  const [categoriasOpen, setCategoriasOpen] = useState(false);
  const [offersReloadKey, setOffersReloadKey] = useState(0);
  // Mensajes de chat NO leídos por orden (chip 💬 N en tarjetas/filas).
  const [noLeidos, setNoLeidos] = useState<Map<string, number>>(new Map());
  // Alertas de Cocina: "hay que restablecer el mercado" (tarjeta para Compras).
  const [alertasMercado, setAlertasMercado] = useState<AlertaMercado[]>([]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [os, pvs, pvsAll, pds, usrs] = await Promise.all([
        listOrdenes(),
        listProveedoresActivos(),
        listProveedores(),
        listProductosActivos(),
        listUsuarios().catch(() => [] as Usuario[]),
      ]);
      setOrdenes(os);
      setProveedores(pvs);
      setProveedoresAll(pvsAll);
      setProductos(pds);
      setUsuarios(usrs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos');
    }
  }, []);

  // Realtime multiusuario: las órdenes/compras se reflejan al instante entre usuarios.
  useRealtime(['ordenes', 'productos'], () => { void refresh(); });

  // No leídos del chat por orden (para el chip 💬). Se recalcula al cambiar las
  // órdenes y en vivo cuando entra/se lee un mensaje.
  const refreshNoLeidos = useCallback(async () => {
    if (!user?.id || !user?.email || !ordenes.length) { setNoLeidos(new Map()); return; }
    try {
      const m = await noLeidosPorOrden(ordenes.map((o) => o.id), user.id, user.email);
      setNoLeidos(m);
    } catch { /* best-effort */ }
  }, [ordenes, user?.id, user?.email]);
  useEffect(() => { void refreshNoLeidos(); }, [refreshNoLeidos]);
  useRealtime(['orden_mensajes'], () => { void refreshNoLeidos(); });

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

  // Pre-filtrar por estado desde la URL (?estado=pendiente), p. ej. al venir de la
  // tarjeta "Órdenes pendientes" del Dashboard. Pasa a vista Lista y aplica el filtro.
  useEffect(() => {
    const estado = searchParams.get('estado');
    if (!estado) return;
    setScope('pedidos');
    setViewMode('lista');
    setFilterEstado(estado as EstadoOrden);
    const next = new URLSearchParams(searchParams);
    next.delete('estado');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Callback estable para abrir el detalle: evita re-renderizar todas las tarjetas
  // del kanban en cada render (KanbanCard está memoizado).
  const openDetail = useCallback((id: string) => setModal({ kind: 'detail', ordenId: id }), []);

  const proveedorMap = useMemo(
    () => new Map(proveedoresAll.map((p) => [p.id, p])),
    [proveedoresAll]
  );
  // email → "Nombre Apellido" para mostrar personas en vez del correo.
  const personaMap = useMemo(
    () => new Map(usuarios.map((u) => [u.email.toLowerCase(), `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.email])),
    [usuarios]
  );

  const isAdmin = usuario?.role === 'admin';
  // La matriz de permisos gobierna el acceso (no el rol hardcodeado): quien tiene
  // 'escritura' sobre Pedidos trabaja el módulo completo (crear solicitudes y
  // gestionar Compras: ofertas, emitir/confirmar OC, recibir). El "aprobar" final
  // de la OC sigue reservado al admin (regla de negocio).
  const canWrite = isAdmin || can('pedidos', 'escritura');
  const canManageProcurement = canWrite;
  // APROBAR la Solicitud de Pedido (pendiente → aprobada) la hace COMPRAS
  // (analista). La firma final de la OC (oc_creada → oc_aprobada) queda
  // reservada EXCLUSIVAMENTE al rol Administrador (regla de negocio, reforzada
  // además por un trigger en la base: trg_enforce_admin_aprueba_orden, que solo
  // gatea oc_aprobada_por).
  const puedeAprobarSolicitud = canManageProcurement; // SP: Compras (analista/admin)
  const puedeAprobarPedidos = isAdmin;                // OC: solo Administrador

  // Quien no gestiona compras solo trabaja Órdenes de Pedido: lo mantenemos en ese scope.
  useEffect(() => {
    if (!canManageProcurement && scope !== 'pedidos') setScope('pedidos');
  }, [canManageProcurement, scope]);

  // Alertas de Cocina (restablecer el mercado): solo le importan a Compras.
  const refreshAlertas = useCallback(async () => {
    if (!canManageProcurement) { setAlertasMercado([]); return; }
    try { setAlertasMercado(await listAlertasMercadoPendientes()); }
    catch { /* best-effort */ }
  }, [canManageProcurement]);
  useEffect(() => { void refreshAlertas(); }, [refreshAlertas]);
  useRealtime(['alertas_mercado'], () => { void refreshAlertas(); });

  async function atenderAlerta(id: string) {
    try { await marcarAlertaAtendida(id, user?.email ?? 'sistema'); await refreshAlertas(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo marcar', 'error'); }
  }

  // El admin arranca directo en Órdenes de Compra (una sola vez, al cargar su perfil).
  const scopeDefaulted = useRef(false);
  useEffect(() => {
    if (!usuario || scopeDefaulted.current) return;
    scopeDefaulted.current = true;
    // Si venimos con ?tab=… (p. ej. desde la tarjeta del Dashboard), respetarlo.
    if (searchParams.get('tab')) return;
    if (usuario.role === 'admin') setScope('oc');
  }, [usuario, searchParams]);

  // Abrir un tab directo desde la URL (?tab=oc_lote), p. ej. desde la tarjeta
  // "Órdenes pendientes" del Dashboard → "OC por lote".
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    scopeDefaulted.current = true; // que no lo pise el default del admin
    setScope(tab as Scope);
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  // Detalle abierto: se deriva por id para reflejar datos en vivo. Pero retenemos el
  // último detalle conocido (ref) para NO cerrar el modal si un refresh (realtime al
  // cambiar de pestaña) lo deja un instante fuera de la lista. El modal solo se cierra
  // cuando el usuario lo cierra (modal.kind deja de ser 'detail').
  const detailRef = useRef<Orden | null>(null);
  const detailEncontrado = modal.kind === 'detail' ? ordenes.find((o) => o.id === modal.ordenId) ?? null : null;
  if (modal.kind === 'detail') {
    if (detailEncontrado) detailRef.current = detailEncontrado;
  } else {
    detailRef.current = null;
  }
  const currentDetail = modal.kind === 'detail' ? (detailEncontrado ?? detailRef.current) : null;

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
                : canManageProcurement
                  ? 'Solicitudes de pedido generadas por analistas. Aprobá la mejor oferta antes de emitir la OC.'
                  : 'Crea solicitudes de pedido. El administrador aprueba antes de emitir la orden de compra.'}
          </p>
        </div>
        <div className="actions">
          <Link to="/app/pedidos/historico" className="btn btn-ghost" title="Ver histórico filtrable de órdenes">
            ⌕ Histórico
          </Link>
          {canWrite && scope === 'pedidos' && (
            <button className="btn btn-ghost" onClick={() => setCategoriasOpen(true)} title="Gestionar clasificaciones y unidades solicitantes">
              🗂 Categorías
            </button>
          )}
          {canWrite && scope === 'pedidos' && (
            <button
              className="btn btn-ghost"
              onClick={() => setModal({ kind: 'create_servicio' })}
              title="Solicitud de Servicio (recargas, mantenimientos…) → Control de Servicio"
            >
              🔧 Nuevo servicio
            </button>
          )}
          {canWrite && scope !== 'compra_directa' && scope !== 'oc_lote' && (
            <button
              className="btn btn-primary"
              onClick={() => setModal({ kind: 'create' })}
            >
              + Nueva orden
            </button>
          )}
        </div>
      </div>

      {/* Alerta de Cocina: hay que montar el mercado. Tarjeta para el analista. */}
      {canManageProcurement && alertasMercado.length > 0 && (
        <div style={{ display: 'grid', gap: '.5rem', marginBottom: '1rem' }}>
          {alertasMercado.map((a) => (
            <div key={a.id} className="card" style={{
              padding: '.8rem 1rem', borderLeft: '4px solid var(--brand, #ff8a00)',
              background: 'rgba(255,138,0,.08)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800 }}>🛒 Cocina solicita restablecer el mercado</div>
                <div className="muted" style={{ fontSize: '.82rem' }}>
                  {dateTime(a.creada_en)} · por {a.creada_por_nombre || a.creada_por || '—'}
                  {a.nota ? <> · <em>{a.nota}</em></> : null}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => setModal({ kind: 'create', mercado: true })} title="Crear la Solicitud de Pedido de MERCADO">
                🛒 Montar mercado
              </button>
              <button className="btn btn-ghost" onClick={() => void atenderAlerta(a.id)} title="Marcar como atendida (quitar la alerta)">
                ✓ Marcar atendida
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Solo quien gestiona compras ve las pestañas de OC / lote / compra directa. */}
      {canManageProcurement && (
        <div
          className="view-toggle"
          role="tablist"
          aria-label="Tipo de vista"
          style={{ marginBottom: '1rem', marginLeft: 0 }}
        >
          <button
            className={scope === 'pedidos' ? 'active' : ''}
            onClick={() => switchScope('pedidos')}
            title="Ver solicitudes de pedido"
          >
            ✉ Solicitud de Pedido
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
          onOpen={openDetail}
          noLeidos={noLeidos}
        />
      ) : (
        <OrdenesTable
          ordenes={filteredOrdenes}
          proveedorMap={proveedorMap}
          canApproveSolicitud={puedeAprobarSolicitud}
          onView={(id) => setModal({ kind: 'detail', ordenId: id })}
          onApprove={(o) => setModal({ kind: 'approve', orden: o })}
          noLeidos={noLeidos}
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
          personaMap={personaMap}
          isAdmin={puedeAprobarPedidos}
          canManageProcurement={canManageProcurement}
          enOc={scope === 'oc'}
          actorEmail={user?.email ?? ''}
          offersReloadKey={offersReloadKey}
          onAddOffer={() => setModal({ kind: 'add-offer', orden: currentDetail })}
          onEditarOferta={(of) => setModal({ kind: 'edit-offer', orden: currentDetail, oferta: of })}
          onEditarOrden={() => setModal({ kind: 'edit-orden', orden: currentDetail })}
          onAcceptedOffer={async () => {
            await refresh();
            setOffersReloadKey((k) => k + 1);
          }}
          onClose={() => setModal({ kind: 'none' })}
          onApprove={() => setModal({ kind: 'approve', orden: currentDetail })}
          onConfirmOc={() => setModal({ kind: 'confirm-oc', orden: currentDetail })}
          onEnviarPagar={() => setModal({ kind: 'metodo-pago', orden: currentDetail })}
          onCancel={() => setModal({ kind: 'cancel', orden: currentDetail })}
          onDesistir={() => setModal({ kind: 'desistir', orden: currentDetail })}
          onReceive={() => setModal({ kind: 'receive', orden: currentDetail })}
          onAbono={() => setModal({ kind: 'abono', orden: currentDetail })}
          onEnviarRecepcion={async () => {
            try {
              await enviarCreditoARecepcion(currentDetail, usuario?.email ?? user?.email ?? 'sistema');
              notify(`Crédito pagado · ${currentDetail.oc_codigo ?? currentDetail.codigo} → Pendiente por recepción`, 'success', { link: '#/app/pedidos' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar a recepción', 'error'); }
          }}
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
          mercadoInicial={modal.mercado}
          onClose={() => setModal({ kind: 'none' })}
          onCreated={async () => {
            setModal({ kind: 'none' });
            await refresh();
          }}
        />
      )}

      {/* Modal: crear Solicitud de Servicio (SS → CS) */}
      {modal.kind === 'create_servicio' && (
        <CrearServicioModal
          usuario={usuario}
          authEmail={user?.email ?? ''}
          onClose={() => setModal({ kind: 'none' })}
          onCreated={async () => {
            setModal({ kind: 'none' });
            await refresh();
          }}
        />
      )}

      {categoriasOpen && (
        <CategoriasModal canWrite={canWrite} onClose={() => setCategoriasOpen(false)} />
      )}

      {/* Modal: editar OC (etapa cargar ofertas) */}
      {modal.kind === 'edit-orden' && (
        <EditarOrdenModal
          orden={modal.orden}
          productos={productos}
          actorEmail={user?.email ?? ''}
          onClose={() => setModal({ kind: 'detail', ordenId: modal.orden.id })}
          onSaved={async () => { await refresh(); setModal({ kind: 'detail', ordenId: modal.orden.id }); }}
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

      {/* Modal: editar oferta (mismos campos que agregar, prellenados) */}
      {modal.kind === 'edit-offer' && (
        <AddOfferGate
          orden={modal.orden}
          proveedores={proveedores}
          registradoPorEmail={user?.email ?? ''}
          ofertaEditar={modal.oferta}
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
              notify(`OC confirmada: ${modal.orden.oc_codigo ?? modal.orden.codigo} · destino ${almacenDestino} · falta indicar el método de pago`, 'success', { link: '#/app/pedidos' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al confirmar', 'error');
            }
          }}
        />
      )}

      {/* Modal: indicar método de pago (multipago) → Enviar para Pagar */}
      {modal.kind === 'metodo-pago' && (
        <MetodoPagoModal
          orden={modal.orden}
          proveedores={proveedores}
          onClose={() => setModal({ kind: 'none' })}
          onSent={async (metodos, soporte, nuevoProveedorId) => {
            try {
              const actorMp = usuario?.email ?? user?.email ?? 'sistema';
              // Si se CAMBIÓ el proveedor: la OC vuelve a aprobación del Gerente General
              // (no se indica método ni se envía a pagar en este paso).
              if (nuevoProveedorId && nuevoProveedorId !== modal.orden.proveedor_id) {
                await cambiarProveedorOrden(modal.orden, nuevoProveedorId, actorMp);
                notify(`OC ${modal.orden.oc_codigo ?? modal.orden.codigo} · proveedor cambiado → vuelve a aprobación del Gerente General`, 'success', { link: '#/app/pedidos' });
                setModal({ kind: 'none' });
                await refresh();
                return;
              }
              await indicarMetodoPago(modal.orden, metodos, actorMp, soporte);
              const extra = soporte.comprobanteTipo === 'factura' ? ' · enviada también a Retenciones' : '';
              notify(`OC ${modal.orden.oc_codigo ?? modal.orden.codigo} enviada para pagar · disponible en Tesorería${extra}`, 'success', { link: '#/app/tesoreria' });
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al enviar para pagar', 'error');
            }
          }}
        />
      )}

      {/* Modal: recepción (parcial) — confirma cuánto entró por ítem */}
      {modal.kind === 'receive' && (
        <RecepcionParcialModal
          orden={modal.orden}
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async (recepciones, nota, almacenDestino) => {
            try {
              await recibirOrdenParcial(
                modal.orden,
                recepciones,
                nota,
                usuario?.email ?? user?.email ?? 'sistema',
                usuario?.nombre ?? null,
                almacenDestino,
              );
              const esContra = modal.orden.condiciones_pago === 'contra_entrega';
              notify(
                esContra
                  ? `Recepción confirmada · ${modal.orden.codigo} · indicá el método para pagar lo recibido`
                  : `Mercancía recibida · ${modal.orden.codigo} · stock actualizado`,
                'success', { link: esContra ? '#/app/pedidos' : '#/app/inventario' },
              );
              setModal({ kind: 'none' });
              await refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Error al recibir', 'error');
            }
          }}
        />
      )}

      {/* Modal: registrar abono / ver crédito (cuenta abierta) */}
      {modal.kind === 'abono' && (
        <AbonosModal
          orden={modal.orden}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}

      {/* Modal: finalizar pedido + evaluación de recepción (calidad/puntualidad/comentario) */}
      {modal.kind === 'finalizar' && (
        <FinalizarPedidoModal
          orden={modal.orden}
          rolEvaluador={usuario?.role === 'obrero' ? 'almacenista' : 'jefe'}
          onClose={() => setModal({ kind: 'none' })}
          onConfirm={async ({ calidad, puntualidadDias, comentario, factura }) => {
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
            // Factura del proveedor (si se cargó al finalizar).
            if (factura) await adjuntarFacturaRecepcion(modal.orden.id, factura);
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
  ofertaEditar,
  onClose,
  onCreated,
}: {
  orden: Orden;
  proveedores: Proveedor[];
  registradoPorEmail: string;
  ofertaEditar?: OfertaProveedor | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [ya, setYa] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOfertasByOrden(orden.id)
      .then((rows) => {
        if (cancelled) return;
        // Al editar, el proveedor de la propia oferta no cuenta como "ya ofertado".
        const ids = rows.map((r) => r.proveedor_id).filter((id) => id !== ofertaEditar?.proveedor_id);
        setYa(new Set(ids));
      })
      .catch(() => { if (!cancelled) setYa(new Set()); });
    return () => { cancelled = true; };
  }, [orden.id, ofertaEditar]);

  if (!ya) return null;
  return (
    <AgregarOfertaModal
      orden={orden}
      proveedores={proveedores}
      proveedoresYaOfertados={ya}
      registradoPorEmail={registradoPorEmail}
      ofertaEditar={ofertaEditar}
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
  const [saving, setSaving] = useState(false);

  // Regla: al aprobar la OC, la mercancía entra SIEMPRE al almacén General. No se
  // elige destino aquí (luego se puede trasladar desde Inventario si hace falta).
  async function handleConfirm() {
    setSaving(true);
    try { await onConfirm('General'); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title={`Confirmar OC ${orden.oc_codigo ?? orden.codigo}`}
      size="md"
      compact
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-success" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Confirmando…' : 'Confirmar OC'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Al confirmar, la OC pasa a <strong>"Confirmada (por pagar)"</strong> y queda disponible en Tesorería para el pago.
        La mercancía entrará al <strong>almacén General</strong> al recibirla.
      </p>
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
  onConfirm: (data: { calidad: number; puntualidadDias: number; comentario: string; factura: File | null }) => Promise<void>;
}) {
  const [calidad, setCalidad] = useState(5);
  const [factura, setFactura] = useState<File | null>(null);
  const [puntualidad, setPuntualidad] = useState<'por_fecha' | 'en_fecha' | 'adelantado' | 'atrasado'>('por_fecha');
  const [dias, setDias] = useState('1');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fecha prometida (de la oferta elegida) vs fecha de recibido → calcula los días.
  const hoyISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const [fechaPrometida, setFechaPrometida] = useState('');
  const [fechaRecibido, setFechaRecibido] = useState(hoyISO);
  useEffect(() => {
    listOfertasByOrden(orden.id)
      .then((ofs) => {
        // La oferta elegida es la que casó con el proveedor de la orden (aceptada).
        const elegida = ofs.find((o) => o.estado === 'aceptada' && o.proveedor_id === orden.proveedor_id)
          ?? ofs.find((o) => o.proveedor_id === orden.proveedor_id)
          ?? ofs.find((o) => o.fecha_entrega_prometida);
        if (elegida?.fecha_entrega_prometida) setFechaPrometida(elegida.fecha_entrega_prometida.slice(0, 10));
      })
      .catch(() => { /* sin oferta: el usuario coloca la fecha prometida a mano */ });
  }, [orden.id, orden.proveedor_id]);

  // Días (firmado): + adelantado (recibido antes de lo prometido), − atrasado.
  const diasPorFecha = (() => {
    if (!fechaPrometida || !fechaRecibido) return null;
    const p = new Date(`${fechaPrometida}T00:00:00`).getTime();
    const r = new Date(`${fechaRecibido}T00:00:00`).getTime();
    if (isNaN(p) || isNaN(r)) return null;
    return Math.round((p - r) / 86_400_000);
  })();

  const CALIDAD_LABEL: Record<number, string> = {
    5: '5 · Excelente', 4: '4 · Buena', 3: '3 · Aceptable', 2: '2 · Deficiente', 1: '1 · Muy mala',
  };

  async function handle() {
    setError(null);
    let puntualidadDias: number;
    if (puntualidad === 'por_fecha') {
      if (diasPorFecha == null) { setError('Indicá la fecha prometida y la de recibido.'); return; }
      puntualidadDias = diasPorFecha;
    } else {
      const d = Math.max(0, Math.floor(Number(dias) || 0));
      puntualidadDias = puntualidad === 'en_fecha' ? 0 : puntualidad === 'adelantado' ? d : -d;
    }
    if (factura && factura.type && factura.type !== 'application/pdf' && !factura.type.startsWith('image/')) {
      setError('La factura debe ser un PDF o una imagen.'); return;
    }
    setSaving(true);
    try {
      await onConfirm({ calidad, puntualidadDias, comentario: comentario.trim(), factura });
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
            <option value="por_fecha">Por fecha prometida</option>
            <option value="en_fecha">En la fecha prometida</option>
            <option value="adelantado">Adelantado</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>
        {(puntualidad === 'adelantado' || puntualidad === 'atrasado') && (
          <div className="form-row">
            <label>Días {puntualidad === 'adelantado' ? 'de adelanto' : 'de atraso'}</label>
            <input className="input mono" type="number" min={0} step={1} value={dias} onChange={(e) => setDias(e.target.value)} />
          </div>
        )}
      </div>

      {/* Por fecha prometida: fecha de la oferta vs. fecha de recibido → calcula los días */}
      {puntualidad === 'por_fecha' && (
        <>
          <div className="form-grid">
            <div className="form-row">
              <label>Fecha prometida (de la oferta)</label>
              <input className="input" type="date" value={fechaPrometida} onChange={(e) => setFechaPrometida(e.target.value)} />
              <small className="muted">{fechaPrometida ? 'Tomada de la oferta del proveedor; podés ajustarla.' : 'La oferta no tiene fecha prometida: colocala acá.'}</small>
            </div>
            <div className="form-row">
              <label>Fecha de recibido</label>
              <input className="input" type="date" value={fechaRecibido} onChange={(e) => setFechaRecibido(e.target.value)} />
              <small className="muted">Por defecto, hoy.</small>
            </div>
          </div>
          {diasPorFecha != null && (
            <div className="card" style={{ margin: '.1rem 0 .6rem' }}>
              {diasPorFecha === 0
                ? <>✓ Recibido <strong>en la fecha prometida</strong>.</>
                : diasPorFecha > 0
                  ? <>✓ Recibido <strong>{diasPorFecha} día(s) antes</strong> de lo prometido (adelantado).</>
                  : <>⚠ Recibido <strong>{Math.abs(diasPorFecha)} día(s) después</strong> de lo prometido (atrasado).</>}
            </div>
          )}
        </>
      )}

      <div className="form-row">
        <label>Comentario adicional (opcional)</label>
        <textarea className="input" rows={3} name="fin-comentario" defaultValue={comentario} onChange={(e) => setComentario(e.target.value)}
          placeholder="Observaciones de la recepción…" />
      </div>

      <div className="form-row">
        <label>Cargar factura</label>
        <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} />
        {factura && <small className="muted">📎 {factura.name}</small>}
      </div>
      <small className="muted">Evaluador: {rolEvaluador === 'jefe' ? 'Jefe / analista' : 'Almacenista'}.</small>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Modal: indicar método de pago (multipago) y enviar a pagar
   ───────────────────────────────────────────── */
/** Moneda implícita según el método de pago (ya no se elige a mano). */
function monedaPorMetodo(metodo: string): string {
  if (metodo === 'efectivo_bs' || metodo === 'transferencia' || metodo === 'pago_movil') return 'Bs';
  if (metodo === 'binance_usdt') return 'USDT';
  return 'USD'; // divisas_efectivo, zelle, otro
}

function MetodoPagoModal({
  orden,
  proveedores,
  onClose,
  onSent,
}: {
  orden: Orden;
  proveedores: Proveedor[];
  onClose: () => void;
  onSent: (metodos: PagoMetodo[], soporte: { comprobanteTipo: 'nota_entrega' | 'factura'; retencionModo: 'se_paga_despues' | 'completo_reembolso' | null; conIva: boolean }, nuevoProveedorId: string | null) => Promise<void> | void;
}) {
  // Al CAMBIAR el método (OC ya "Confirmada pagar") precargamos el/los método(s) ya
  // indicados; si es la primera vez, arranca con un método por defecto.
  const [legs, setLegs] = useState<PagoMetodo[]>(
    orden.metodo_pago && orden.metodo_pago.length
      ? orden.metodo_pago.map((m) => ({ ...m }))
      : [{ metodo: 'divisas_efectivo', moneda: monedaPorMetodo('divisas_efectivo'), monto: 0 }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cambio de proveedor (opcional): la OC sigue aprobada, solo se cambia el proveedor.
  const [proveedorSel, setProveedorSel] = useState<string>(orden.proveedor_id ?? '');
  const cambioProveedor = proveedorSel && proveedorSel !== orden.proveedor_id;
  // Datos de pago del proveedor ya guardados (para precargar por método).
  const [datosGuardados, setDatosGuardados] = useState<Record<string, DatosPago>>({});
  // Contra entrega: ya se recibió y verificó; se confirma la Nota de entrega antes de pagar.
  const esContraEntrega = orden.condiciones_pago === 'contra_entrega';
  const [notaEntrega, setNotaEntrega] = useState(false);
  // Soporte: Nota de entrega → directo a Tesorería. Factura → además pasa por Retenciones.
  const [comprobanteTipo, setComprobanteTipo] = useState<'nota_entrega' | 'factura'>(orden.comprobante_tipo ?? 'nota_entrega');
  const [retencionModo, setRetencionModo] = useState<'se_paga_despues' | 'completo_reembolso'>(orden.retencion_modo ?? 'se_paga_despues');
  // OC por factura: con IVA (suma 16% al total) o sin IVA (no agrega nada).
  const [conIva, setConIva] = useState(!!orden.iva_aplicado);
  const baseTotal = orden.condiciones_pago === 'contra_entrega' && orden.recibido_total != null ? orden.recibido_total : orden.total;
  const ivaMonto = Math.round(Number(baseTotal) * 0.16 * 100) / 100;

  useEffect(() => {
    const pid = proveedorSel || orden.proveedor_id;
    if (!pid) return;
    listDatosPago(pid).then(setDatosGuardados).catch(() => { /* sin datos previos */ });
  }, [proveedorSel, orden.proveedor_id]);

  function setLeg(i: number, patch: Partial<PagoMetodo>) {
    setLegs((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }
  // Al cambiar de método, precarga los datos guardados del proveedor para ese método.
  function cambiarMetodo(i: number, metodo: string) {
    setLeg(i, { metodo, moneda: monedaPorMetodo(metodo), datos: requiereDatos(metodo) ? (datosGuardados[metodo] ?? {}) : undefined });
  }
  function addLeg() { setLegs((ls) => [...ls, { metodo: 'transferencia', moneda: monedaPorMetodo('transferencia'), monto: 0, datos: datosGuardados['transferencia'] ?? {} }]); }
  function removeLeg(i: number) { setLegs((ls) => ls.filter((_, k) => k !== i)); }

  const validos = legs.filter((l) => l.metodo && l.moneda);
  // Multipago: Compras puede repartir el total por método/moneda (montos en $).
  // Con un solo método no hace falta (Tesorería paga el total).
  const esMultipago = validos.length > 1;
  const sumMontos = Math.round(validos.reduce((a, l) => a + (Number(l.monto) || 0), 0) * 100) / 100;
  const hayMontos = validos.some((l) => (Number(l.monto) || 0) > 0);
  const repartoOk = !esMultipago || !hayMontos || Math.abs(sumMontos - Number(baseTotal)) <= 0.01;

  async function handleSend() {
    setError(null);
    // Si se cambió el proveedor, la OC vuelve a aprobación del Gerente General: no
    // se exige método de pago (se indicará tras la nueva aprobación).
    if (cambioProveedor) {
      setSaving(true);
      try { await onSent([], { comprobanteTipo, retencionModo: null, conIva: false }, proveedorSel); }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el proveedor'); setSaving(false); }
      return;
    }
    if (!validos.length) { setError('Indicá al menos un método de pago.'); return; }
    // Multipago con reparto: si se cargó algún monto, todos deben sumar el total.
    if (esMultipago && hayMontos && !repartoOk) {
      setError(`El reparto por moneda ($${money(sumMontos)}) debe sumar el total de la OC ($${money(Number(baseTotal))}).`); return;
    }
    if (esContraEntrega && !notaEntrega) { setError('Confirmá la Nota de entrega (verificaste lo recibido) antes de enviar a pagar.'); return; }
    // Validar datos del proveedor en los métodos que los requieren.
    for (const l of validos) {
      if (requiereDatos(l.metodo)) {
        const err = validarDatosPago(l.metodo, l.datos ?? {});
        if (err) { setError(`${METODOS_PAGO.find((m) => m.value === l.metodo)?.label}: ${err}`); return; }
      }
    }
    setSaving(true);
    try { await onSent(validos, { comprobanteTipo, retencionModo: comprobanteTipo === 'factura' ? retencionModo : null, conIva: comprobanteTipo === 'factura' && conIva }, null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar'); setSaving(false); }
  }

  return (
    <Modal
      title={`Método de pago · OC ${orden.oc_codigo ?? orden.codigo}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSend} disabled={saving}>
            {saving ? 'Enviando…' : (cambioProveedor ? '🔁 Cambiar proveedor → a aprobación del Gerente' : '💳 Enviar para Pagar')}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Indicá <strong>con qué método(s)</strong> se va a pagar la OC ({orden.condiciones_pago === 'contra_entrega' && orden.recibido_total != null
          ? <>recibido <strong>{money(orden.recibido_total)}</strong></>
          : <>total <strong>{money(orden.total)}</strong></>}). Podés combinar
        varios (<strong>multipago</strong>) y repartir el total <strong>por moneda</strong> (cuánto en $ por cada uno); si lo dejás en 0, el <strong>monto lo define Tesorería</strong> al pagar. Al enviar pasa a <strong>Confirmada pagar</strong> y aparece en Tesorería.
      </p>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {/* Cambio de proveedor: la OC sigue aprobada, solo se cambia el proveedor. */}
      <div className="card" style={{ margin: '0 0 .75rem', padding: '.7rem .85rem' }}>
        <div className="card-title" style={{ marginBottom: '.45rem' }}>Proveedor</div>
        <SearchSelect
          value={proveedorSel}
          onChange={setProveedorSel}
          options={proveedores.map((p) => ({ value: p.id, label: `${p.razon_social}${p.rif ? ' · ' + p.rif : ''}` }))}
          placeholder="🔍 Buscar proveedor…"
          emptyText="Ningún proveedor coincide"
        />
        {cambioProveedor && (
          <div className="badge" style={{ marginTop: '.4rem', background: 'rgba(255,138,0,.15)', borderColor: 'var(--brand, #ff8a00)' }}>
            ⚠ Al cambiar el proveedor, la OC <strong>vuelve a aprobación del Gerente General</strong> (no se envía a pagar ahora). Ítems y total se mantienen.
          </div>
        )}
      </div>

      {/* Soporte: Nota de entrega (directo a Tesorería) vs Factura (pasa por Retenciones) */}
      <div className="card" style={{ margin: '0 0 .75rem', padding: '.7rem .85rem' }}>
        <div className="card-title" style={{ marginBottom: '.45rem' }}>Tipo de soporte</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.5rem' }}>
          <label className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', margin: 0, padding: '.55rem .7rem', cursor: 'pointer', borderColor: comprobanteTipo === 'nota_entrega' ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
            <input type="radio" name="comprobante" checked={comprobanteTipo === 'nota_entrega'} onChange={() => setComprobanteTipo('nota_entrega')} style={{ marginTop: '.2rem' }} />
            <span style={{ fontSize: '.86rem' }}><strong>Nota de entrega</strong></span>
          </label>
          <label className="card" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0, padding: '.55rem .7rem', cursor: 'pointer', borderColor: comprobanteTipo === 'factura' ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
            <input type="radio" name="comprobante" checked={comprobanteTipo === 'factura'} onChange={() => setComprobanteTipo('factura')} style={{ marginTop: '.2rem' }} />
            <span style={{ fontSize: '.86rem' }}><strong>Factura</strong></span>
          </label>
        </div>
        {comprobanteTipo === 'factura' && (
          <div style={{ marginTop: '.6rem', borderTop: '1px dashed var(--border)', paddingTop: '.6rem' }}>
            <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.4rem' }}>IVA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.5rem', marginBottom: '.6rem' }}>
              <label className="card" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0, padding: '.5rem .7rem', cursor: 'pointer', borderColor: !conIva ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
                <input type="radio" name="iva" checked={!conIva} onChange={() => setConIva(false)} />
                <span style={{ fontSize: '.86rem' }}><strong>Sin IVA</strong> · total {money(baseTotal)}</span>
              </label>
              <label className="card" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0, padding: '.5rem .7rem', cursor: 'pointer', borderColor: conIva ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
                <input type="radio" name="iva" checked={conIva} onChange={() => setConIva(true)} />
                <span style={{ fontSize: '.86rem' }}><strong>Con IVA (16%)</strong> · +{money(ivaMonto)} = {money(Number(baseTotal) + ivaMonto)}</span>
              </label>
            </div>
            <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.4rem' }}>Retención</div>
            <div style={{ display: 'grid', gap: '.35rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontSize: '.86rem' }}>
                <input type="radio" name="ret-modo" checked={retencionModo === 'se_paga_despues'} onChange={() => setRetencionModo('se_paga_despues')} />
                Se paga después
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontSize: '.86rem' }}>
                <input type="radio" name="ret-modo" checked={retencionModo === 'completo_reembolso'} onChange={() => setRetencionModo('completo_reembolso')} />
                Se paga completo y luego se reembolsa
              </label>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: '.6rem' }}>
        {legs.map((l, i) => (
          <div key={i} className="card" style={{ margin: 0, padding: '.7rem' }}>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-row" style={{ margin: 0, flex: '1 1 220px' }}>
                <label>Método</label>
                <select className="select" value={l.metodo} onChange={(e) => cambiarMetodo(i, e.target.value)}>
                  {METODOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {/* Multipago: cuánto del total ($) va por este método/moneda. */}
              {legs.length > 1 && (
                <div className="form-row" style={{ margin: 0, flex: '0 1 170px' }}>
                  <label>Monto ($) en {l.moneda}</label>
                  <input className="input mono" type="number" min={0} step="any"
                    value={l.monto ? String(l.monto) : ''} placeholder="0,00"
                    onChange={(e) => setLeg(i, { monto: Math.round((Number(e.target.value) || 0) * 100) / 100 })} />
                </div>
              )}
              {legs.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeLeg(i)}>✕ Quitar</button>}
            </div>
            {requiereDatos(l.metodo) && (
              <div style={{ marginTop: '.6rem', borderTop: '1px dashed var(--border)', paddingTop: '.6rem' }}>
                <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.4rem' }}>Datos del proveedor para pagarle (se guardan para próximas compras)</div>
                <DatosPagoFields metodo={l.metodo} value={l.datos ?? {}} onChange={(d) => setLeg(i, { datos: d })} />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={addLeg}>+ Agregar método (multipago)</button>
      {/* Reparto del total por moneda (multipago): cuánto se paga con cada método. */}
      {esMultipago && (
        <div className="card" style={{ margin: '.6rem 0 0', padding: '.55rem .8rem', borderColor: hayMontos ? (repartoOk ? 'var(--success)' : 'var(--danger)') : 'var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.86rem', gap: '.5rem', flexWrap: 'wrap' }}>
            <span className="muted">Reparto por moneda (opcional)</span>
            <strong className="mono" style={{ color: hayMontos ? (repartoOk ? 'var(--success)' : 'var(--danger)') : undefined }}>
              ${money(sumMontos)} / ${money(Number(baseTotal))}
            </strong>
          </div>
          <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
            {!hayMontos
              ? 'Dejá los montos en 0 y Tesorería define cuánto va por cada uno, o indicá acá cuánto pagar por cada método (en $).'
              : repartoOk
              ? '✓ El reparto suma el total. Tesorería verá cuánto pagar por cada moneda.'
              : <span style={{ color: 'var(--danger)' }}>⚠ Los montos deben sumar el total de la OC (${money(Number(baseTotal))}).</span>}
          </small>
        </div>
      )}
      {esContraEntrega && (
        <label className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', marginTop: '.6rem', padding: '.55rem .7rem', cursor: 'pointer', borderColor: notaEntrega ? 'var(--success)' : 'var(--warning)' }}>
          <input type="checkbox" checked={notaEntrega} onChange={(e) => setNotaEntrega(e.target.checked)} style={{ marginTop: '.2rem' }} />
          <span style={{ fontSize: '.86rem' }}>
            <strong>Confirmo que la mercancía se recibió y verificó contra lo solicitado. Recién entonces se paga (contra entrega).</strong>
          </span>
        </label>
      )}
      <small className="muted" style={{ display: 'block', marginTop: '.4rem' }}>
        Si el método es <strong>en efectivo</strong> (divisas o Bs), en Tesorería <strong>no se exigirá comprobante</strong>.
      </small>
    </Modal>
  );
}

/** Ordena los almacenes para un desplegable: cada almacén principal seguido de
 *  sus sub-almacenes, así el selector «une» principales y subalmacenes. */
function almacenesOrdenados(almacenes: Almacen[]): Almacen[] {
  const principales = almacenes.filter((a) => !a.parent_id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const hijosDe = (id: string) => almacenes.filter((a) => a.parent_id === id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const out: Almacen[] = [];
  for (const p of principales) { out.push(p); out.push(...hijosDe(p.id)); }
  // Subalmacenes huérfanos (padre no encontrado) al final, por si acaso.
  out.push(...almacenes.filter((a) => a.parent_id && !almacenes.some((x) => x.id === a.parent_id)));
  return out;
}

/* ─────────────────────────────────────────────
   Recepción parcial: confirma cuánto entró por ítem (≤ pedido) + nota
   ───────────────────────────────────────────── */
function RecepcionParcialModal({
  orden,
  onClose,
  onConfirm,
}: {
  orden: Orden;
  onClose: () => void;
  onConfirm: (recepciones: { sku: string; cantidad_recibida: number }[], nota: string | null, almacenDestino: string) => Promise<void> | void;
}) {
  const [recs, setRecs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    orden.items.forEach((it) => { m[it.sku] = String(it.cantidad); });
    return m;
  });
  const [nota, setNota] = useState('');
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacen, setAlmacen] = useState<string>(orden.almacen_destino ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAlmacenes().then((as) => {
      setAlmacenes(as);
      // Si la OC ya traía un destino, se respeta; si no, se preselecciona el primero.
      setAlmacen((prev) => prev || orden.almacen_destino || as[0]?.nombre || '');
    }).catch(() => setAlmacenes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRec(sku: string, cantPedida: number, v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n > cantPedida) { setRecs((r) => ({ ...r, [sku]: String(cantPedida) })); return; }
    setRecs((r) => ({ ...r, [sku]: v }));
  }

  const recibidoTotal = orden.items.reduce((a, it) => a + (Number(recs[it.sku]) || 0) * Number(it.precio), 0);
  const hayDiferencia = orden.items.some((it) => (Number(recs[it.sku]) || 0) < Number(it.cantidad));

  async function handleConfirm() {
    setError(null);
    const recepciones = orden.items.map((it) => ({ sku: it.sku, cantidad_recibida: Number(recs[it.sku]) || 0 }));
    if (recepciones.every((r) => r.cantidad_recibida <= 0)) { setError('Indicá al menos una cantidad recibida.'); return; }
    if (!almacen.trim()) { setError('Elegí el almacén destino al que entra la mercancía.'); return; }
    if (hayDiferencia && !nota.trim()) { setError('Recibiste menos de lo pedido: indicá una nota explicando la diferencia.'); return; }
    setSaving(true);
    try { await onConfirm(recepciones, nota.trim() || null, almacen.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar'); setSaving(false); }
  }

  return (
    <Modal
      title={`Confirmar recepción · ${orden.oc_codigo ?? orden.codigo}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Confirmando…' : '📦 Confirmar recepción'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Confirmá cuánto entró realmente al almacén por ítem. Solo lo recibido se suma al inventario.
        Si llegó menos de lo pedido, dejá una <strong>nota</strong>; la orden cierra sin saldo pendiente.
      </p>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>SKU</th><th>Producto</th><th style={{ textAlign: 'right' }}>Pedido</th><th style={{ textAlign: 'right' }}>Recibido</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>
            {orden.items.map((it) => {
              const rec = Number(recs[it.sku]) || 0;
              const falta = rec < Number(it.cantidad);
              return (
                <tr key={it.sku}>
                  <td className="mono">{it.sku}</td>
                  <td>{it.nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(it.cantidad)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input className="input mono" type="number" min={0} max={it.cantidad} step="any"
                      value={recs[it.sku]} onChange={(e) => setRec(it.sku, Number(it.cantidad), e.target.value)}
                      style={{ width: 90, textAlign: 'right', borderColor: falta ? 'var(--warning)' : undefined }} />
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(rec * Number(it.precio))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total recibido</td><td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(recibidoTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="form-row" style={{ marginTop: '.5rem' }}>
        <label>Almacén / sub-almacén destino *</label>
        <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} required>
          <option value="">— elegí el almacén —</option>
          {almacenesOrdenados(almacenes).map((a) => {
            const padre = a.parent_id ? almacenes.find((x) => x.id === a.parent_id) : null;
            const corto = nombreCortoAlmacen(a, almacenes);
            return (
              <option key={a.id} value={a.nombre}>
                {padre ? `   ↳ ${padre.nombre} › ${corto}` : a.nombre}
              </option>
            );
          })}
        </select>
        <small className="muted">Incluye almacenes y sub-almacenes. La mercancía entra a este almacén y queda en la trazabilidad final.</small>
      </div>

      <div className="form-row" style={{ marginTop: '.5rem' }}>
        <label>Nota de recepción {hayDiferencia && <span style={{ color: 'var(--warning)' }}>(obligatoria · llegó menos de lo pedido)</span>}</label>
        <textarea className="input" rows={2} name="recep-nota" defaultValue={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Diferencias, faltantes, observaciones de la recepción…" />
      </div>
      {orden.condiciones_pago === 'contra_entrega' && (
        <small className="muted" style={{ display: 'block' }}>
          Contra entrega: luego se indicará el método para pagar <strong>{money(recibidoTotal)}</strong> (lo recibido) en Tesorería.
        </small>
      )}
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Abonos de crédito: traza + nuevo abono (egreso real de caja)
   ───────────────────────────────────────────── */
function AbonosModal({
  orden,
  onClose,
}: {
  orden: Orden;
  onClose: () => void;
}) {
  const [abonos, setAbonos] = useState<AbonoCredito[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [ab, cj] = await Promise.all([
        listAbonos(orden.id),
        listCajasActivas().catch(() => [] as Caja[]),
      ]);
      setAbonos(ab); setCajas(cj);
    } finally { setLoading(false); }
  }, [orden.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const abonado = Number(orden.abonado_total) || abonos.reduce((a, b) => a + Number(b.monto), 0);
  const saldo = Math.round((Number(orden.total) - abonado) * 100) / 100;

  return (
    <Modal title={`Crédito · OC ${orden.oc_codigo ?? orden.codigo}`} size="lg" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
        <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
          <div className="muted" style={{ fontSize: '.7rem' }}>TOTAL</div>
          <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{money(orden.total)}</div>
        </div>
        <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
          <div className="muted" style={{ fontSize: '.7rem' }}>ABONADO</div>
          <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-3)' }}>{money(abonado)}</div>
        </div>
        <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
          <div className="muted" style={{ fontSize: '.7rem' }}>SALDO</div>
          <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: saldo > 0 ? 'var(--warning)' : 'var(--success)' }}>{money(saldo)}</div>
        </div>
      </div>

      {/* Los abonos se registran en Tesorería; acá es solo consulta. */}
      <div className="card" style={{ padding: '.65rem .8rem', marginBottom: '.75rem', borderColor: saldo <= 0 ? 'var(--success)' : 'var(--brand, #ff8a00)' }}>
        <small style={{ fontSize: '.84rem' }}>
          {saldo <= 0
            ? <>✅ <strong>Crédito pagado en su totalidad.</strong> Desde el detalle de la orden podés enviarla a <strong>Pendiente por recepción</strong> o finalizarla si ya llegó.</>
            : <>💳 Los <strong>abonos se registran en Tesorería</strong> → <strong>Cuentas por pagar (créditos)</strong>. Acá ves el historial.</>}
        </small>
      </div>

      {/* Traza de abonos */}
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Monto</th><th>Caja</th><th style={{ textAlign: 'right' }}>Saldo</th><th>Nota</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="muted">Cargando…</td></tr>
            ) : !abonos.length ? (
              <tr><td colSpan={5}><EmptyState message="Sin abonos todavía." icon="💵" /></td></tr>
            ) : abonos.map((b) => (
              <tr key={b.id}>
                <td className="muted" style={{ fontSize: '.78rem' }}>{dateTime(b.at)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(Number(b.monto))} {b.moneda}</td>
                <td>{cajas.find((c) => c.id === b.caja_id)?.nombre ?? '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{b.saldo_restante != null ? money(Number(b.saldo_restante)) : '—'}</td>
                <td className="muted" style={{ fontSize: '.78rem' }}>{b.nota || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Sub-componente: tabla (vista Lista)
   ───────────────────────────────────────────── */
interface OrdenesTableProps {
  ordenes: Orden[];
  proveedorMap: Map<string, Proveedor>;
  /** Aprobar la Solicitud de Pedido (pendiente → aprobada): Compras (analista/admin). */
  canApproveSolicitud: boolean;
  onView: (id: string) => void;
  onApprove: (o: Orden) => void;
  noLeidos?: Map<string, number>;
}
function OrdenesTable({ ordenes, proveedorMap, canApproveSolicitud, onView, onApprove, noLeidos }: OrdenesTableProps) {
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
            const canApprove = canApproveSolicitud && o.estado === 'pendiente';
            const cambios = (o.historial ?? []).filter((h) => h.evento === 'proveedor_cambiado').length;
            return (
              <tr key={o.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => onView(o.id)} title="Ver detalle">
                <td className="mono">
                  {o.codigo}
                  {o.tipo === 'servicio' && (
                    <span className="badge" style={{ marginLeft: '.4rem', background: '#0ea5e9', color: '#fff', fontSize: '.62rem', fontWeight: 700, padding: '.05rem .35rem' }} title="Solicitud / Control de Servicio">🔧</span>
                  )}
                  {!!noLeidos?.get(o.id) && (
                    <span className="badge" style={{ marginLeft: '.4rem', background: 'var(--brand, #ff8a00)', color: '#111', fontSize: '.62rem', fontWeight: 700, padding: '.05rem .35rem' }} title="Mensajes sin leer en la conversación">💬 {noLeidos.get(o.id)}</span>
                  )}
                </td>
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
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{o.items.length}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(o.total)}</td>
                <td><StatusBadge estado={o.estado} /></td>
                <td className="muted" style={{ fontSize: '.82rem' }}>{dateTime(o.created_at)}</td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>
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
  noLeidos?: Map<string, number>;
}
function KanbanBoard({ ordenes, proveedorMap, cols, onOpen, noLeidos }: KanbanBoardProps) {
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
                    onOpen={onOpen}
                    noLeidos={noLeidos?.get(o.id) ?? 0}
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
  noLeidos = 0,
}: {
  orden: Orden;
  proveedor: Proveedor | null;
  onOpen: (id: string) => void;
  noLeidos?: number;
}) {
  const changes = (orden.historial ?? []).filter((h) => h.evento === 'proveedor_cambiado').length;
  // Crédito pagado en su totalidad (cuenta abierta saldada) → tarjeta resaltada.
  const creditoPagado = orden.estado === 'cuenta_abierta' && (Number(orden.abonado_total) || 0) >= Number(orden.total) - 0.01;
  return (
    <div
      className="kanban-card"
      tabIndex={0}
      onClick={() => onOpen(orden.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(orden.id);
      }}
      style={
        orden.urgente
          ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 1px var(--danger)' }
          : creditoPagado
            ? { borderColor: 'var(--success)', boxShadow: '0 0 0 1px var(--success)' }
            : undefined
      }
    >
      <div className="code">
        {orden.codigo}
        {orden.tipo === 'servicio' && (
          <span className="badge" style={{ marginLeft: '.4rem', background: '#0ea5e9', color: '#fff', fontSize: '.6rem', padding: '.05rem .35rem', fontWeight: 700 }}>🔧 Servicio</span>
        )}
        {orden.urgente && (
          <span className="badge" style={{ marginLeft: '.4rem', background: 'var(--danger)', color: '#fff', fontSize: '.6rem', padding: '.05rem .35rem', fontWeight: 700 }}>🚨 URGENTE</span>
        )}
        {noLeidos > 0 && (
          <span className="badge" style={{ marginLeft: '.4rem', background: 'var(--brand, #ff8a00)', color: '#111', fontSize: '.6rem', padding: '.05rem .35rem', fontWeight: 700 }} title="Mensajes sin leer en la conversación">💬 {noLeidos}</span>
        )}
      </div>
      <div className="prov">
        {proveedor?.razon_social
          ?? (orden.solicitante ? `Solicita: ${orden.solicitante}` : 'Sin proveedor asignado')}
      </div>
      <div className="meta">
        <span>{orden.items.length} ítem{orden.items.length !== 1 ? 's' : ''}</span>
        {creditoPagado && (
          <span className="badge success" style={{ fontSize: '.62rem', padding: '.05rem .35rem' }}>
            ✓ Pagado · {orden.recibida_en ? 'finalizar' : 'a recepción'}
          </span>
        )}
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
  personaMap: Map<string, string>;
  isAdmin: boolean;
  canManageProcurement: boolean;
  /** true cuando se abre desde la pestaña Órdenes de Compra (allí se gestionan ofertas/proveedor). */
  enOc: boolean;
  actorEmail: string;
  onClose: () => void;
  onApprove: () => void;
  onConfirmOc: () => void;
  onEnviarPagar: () => void;
  onCancel: () => void;
  onDesistir: () => void;
  onReceive: () => void;
  onAbono: () => void;
  onEnviarRecepcion: () => void;
  onFinalizar: () => void;
  onSeePriceHistory: (sku: string, nombre: string) => void;
  onAddOffer: () => void;
  onEditarOferta: (o: OfertaProveedor) => void;
  onAcceptedOffer: () => void;
  onEditarOrden: () => void;
  offersReloadKey: number;
  usuarioRole: string | null;
}
function OrdenDetailModal({
  orden: o,
  proveedor,
  proveedorMap,
  personaMap,
  isAdmin,
  canManageProcurement,
  enOc,
  actorEmail,
  onClose,
  onApprove,
  onConfirmOc,
  onEnviarPagar,
  onCancel,
  onDesistir,
  onReceive,
  onAbono,
  onEnviarRecepcion,
  onFinalizar,
  onSeePriceHistory,
  onAddOffer,
  onEditarOferta,
  onAcceptedOffer,
  onEditarOrden,
  offersReloadKey,
  usuarioRole,
}: OrdenDetailModalProps) {
  const isPendiente = o.estado === 'pendiente';
  // Aprobar la Solicitud de Pedido la hace Compras (analista/admin). La firma de
  // la OC (✔ Aprobar OC, más abajo) sí queda reservada al Administrador (isAdmin).
  const canApprove = canManageProcurement && isPendiente;  // Aprobar Solicitud de Pedido (Compras)
  const isOcCreada = o.estado === 'oc_creada';      // oferta elegida, sin confirmar
  const isConfirmadaMetodo = o.estado === 'confirmada_metodo'; // gerente confirmó → falta método de pago
  const isOcAprobada = o.estado === 'oc_aprobada';  // método indicado → Tesorería
  const isPagada = o.estado === 'pagada';
  const isOcEmitida = o.estado === 'oc_emitida';    // legado
  const isRecibida = o.estado === 'recibida';
  const isPorRecibir = o.estado === 'por_recibir';      // contra entrega / crédito saldado
  const isCuentaAbierta = o.estado === 'cuenta_abierta'; // a crédito, abonos abiertos
  const esContraEntrega = o.condiciones_pago === 'contra_entrega';
  // Contra entrega: tras recibir falta indicar método para pagar lo recibido.
  const contraEntregaPorPagar = isRecibida && esContraEntrega && !(o.metodo_pago && o.metodo_pago.length);
  // Contra entrega: ya pagó (tras recibir) → se puede finalizar.
  const contraEntregaFinalizar = isPagada && esContraEntrega && !!o.recibida_en;
  const canCancel = ['pendiente', 'aprobada'].includes(o.estado);
  // Cancelar la OC ya aprobada por el gerente (o con proveedor desistido) antes de
  // pagarla. Pide motivo y queda registrado para el PDF.
  const canCancelOc =
    canManageProcurement &&
    ['oc_creada', 'confirmada_metodo', 'oc_aprobada', 'desistida_proveedor'].includes(o.estado);
  const isCancelada = o.estado === 'cancelada';
  // ¿La orden llegó a etapa de OC? (para ofrecer el PDF de la OC aun cancelada).
  const tuvoOc =
    !!o.oc_codigo ||
    (o.historial ?? []).some((h) =>
      ['oc_creada', 'confirmada_metodo', 'oc_aprobada', 'oferta_aceptada', 'oc_emitida'].includes(h.evento),
    );

  const puedeTrazabilidad = ['recibida', 'finalizada', 'pagada'].includes(o.estado);
  const isFinalizada = o.estado === 'finalizada';
  // Las ofertas (añadir proveedor) se gestionan SOLO desde la pestaña Órdenes de Compra.
  const mostrarOfertas = enOc && ['aprobada', 'desistida_proveedor', 'oc_creada', 'confirmada_metodo', 'oc_aprobada', 'pagada'].includes(o.estado);
  // Editar la orden: en cualquier etapa hasta indicar el método de pago. Si ya está
  // FIRMADA por el GG (confirmada_metodo), igual se puede modificar, pero al guardar
  // la OC VUELVE A APROBACIÓN del Gerente General. Tras enviarla a pagar, se congela.
  const puedeEditarOc = canManageProcurement
    && (['pendiente', 'aprobada', 'oc_creada', 'confirmada_metodo'] as string[]).includes(o.estado);

  // Crédito: ¿está totalmente pagado? (los abonos se hacen en Tesorería).
  const creditoSaldadoDet = isCuentaAbierta && (Number(o.abonado_total) || 0) >= Number(o.total) - 0.01;
  // Crédito saldado y ya recibido (entró antes de pagar) → se puede finalizar.
  const creditoFinalizable = creditoSaldadoDet && !!o.recibida_en;

  // Anticipado/contado/crédito finalizan desde 'recibida'. Contra entrega recibe
  // ANTES de pagar, así que NO finaliza en 'recibida' (debe pagar primero) sino en 'pagada'.
  const finalizableRecibida = isRecibida && !esContraEntrega;
  const canFinalizarOrden = (finalizableRecibida || contraEntregaFinalizar || creditoFinalizable) && canManageProcurement;
  const canCerrarSolicitudObrero = finalizableRecibida && usuarioRole === 'obrero';

  const [enviarOpen, setEnviarOpen] = useState(false);

  // Marca/desmarca un ítem como "a comprar" en la etapa OP (antes de tener precio).
  // Así una OP con 4 productos puede quedar con solo 2 aprobados para comprar.
  const [togglingSku, setTogglingSku] = useState<string | null>(null);
  async function toggleComprar(sku: string, comprar: boolean) {
    setTogglingSku(sku);
    try {
      await actualizarComprarItems(o, { [sku]: comprar }, actorEmail || 'sistema');
      await onAcceptedOffer(); // refresca la orden en el listado
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo actualizar el ítem', 'error');
    } finally {
      setTogglingSku(null);
    }
  }

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
  async function handleFacturaRecepcion() {
    if (!o.factura_recepcion_path) return;
    try {
      const url = await urlAdjuntoOc(o.factura_recepcion_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir la factura', 'error');
    }
  }

  const buttons = (
    <>
      {/* Etapa OP: solo Aprobar / Rechazar Orden de Pedido + PDF de la OP. */}
      {isPendiente && (
        <button className="btn btn-ghost" onClick={handleDownloadPdf} title="Descargar la Solicitud de Pedido en PDF">
          ↓ PDF de la SP
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
      {puedeEditarOc && (
        <button className="btn btn-ghost" onClick={onEditarOrden} title="Modificar ítems, cantidades, motivo y finalidad. Si la OC ya estaba firmada (pendiente por método de pago), al guardar vuelve a aprobación del Gerente General.">
          ✎ Editar orden
        </button>
      )}
      {canCancel && (
        <button className="btn btn-danger" onClick={onCancel}>Cancelar orden</button>
      )}
      {canCancelOc && (
        <button className="btn btn-danger" onClick={onCancel} title="Cancelar la OC (indicando el motivo, que aparecerá en el PDF)">
          ✖ Cancelar OC
        </button>
      )}
      {/* OC cancelada: el PDF queda disponible con el motivo de cancelación. */}
      {isCancelada && tuvoOc && (
        <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF (incluye el motivo de cancelación)">
          ↓ OC PDF
        </button>
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
      {/* Confirmada por el gerente: falta indicar el método de pago y enviar a pagar. */}
      {isConfirmadaMetodo && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
          <button className="btn btn-primary" onClick={onEnviarPagar} title="Indicar método de pago y enviar a Tesorería">
            💳 Indicar método de pago / Enviar para Pagar
          </button>
        </>
      )}
      {/* OC confirmada pagar: el pago se hace en Tesorería → Órdenes pendientes por pagar.
          Mientras no se haya pagado, Compras puede CAMBIAR el método de pago indicado. */}
      {isOcAprobada && (
        <>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
          {canManageProcurement && (
            <button className="btn btn-primary" onClick={onEnviarPagar} title="Cambiar el método de pago indicado (antes de que Tesorería pague)">
              💳 Cambiar método de pago
            </button>
          )}
        </>
      )}
      {/* Crédito · cuenta abierta. Los abonos se registran en TESORERÍA; acá el
          analista hace seguimiento y mueve la orden según corresponda. */}
      {isCuentaAbierta && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
          <button className="btn btn-ghost" onClick={onAbono} title="Ver la cuenta del crédito y el historial de abonos">
            📋 Ver crédito / historial
          </button>
          {/* La mercancía llegó antes de terminar de pagar. */}
          {!o.recibida_en && !creditoSaldadoDet && (
            <button className="btn btn-ghost" onClick={onReceive} title="La mercancía llegó: recibir en inventario aunque el crédito siga pendiente">
              📦 Recibir (crédito pendiente)
            </button>
          )}
          {/* Pagado en su totalidad y aún sin recibir → a Pendiente por recepción. */}
          {creditoSaldadoDet && !o.recibida_en && (
            <button className="btn btn-primary" onClick={onEnviarRecepcion} title="Crédito pagado: enviar a Pendiente por recepción">
              📦 Enviar a Pendiente por recepción
            </button>
          )}
        </>
      )}
      {/* Pendiente por recepción (contra entrega / crédito saldado): confirmar lo recibido. */}
      {isPorRecibir && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
          <button className="btn btn-primary" onClick={onReceive}>📦 Confirmar recepción</button>
        </>
      )}
      {/* Contra entrega ya recibida: indicar método para pagar SOLO lo recibido. */}
      {contraEntregaPorPagar && canManageProcurement && (
        <button className="btn btn-primary" onClick={onEnviarPagar} title="Indicar método de pago y enviar a Tesorería (paga lo recibido)">
          💳 Indicar método de pago (pagar lo recibido)
        </button>
      )}
      {/* Comprobante de pago cargado en Tesorería (disponible desde que la OC está pagada). */}
      {o.factura_path && (
        <button className="btn btn-ghost" onClick={handleComprobante} title={o.factura_nombre ?? 'Comprobante de pago'}>
          ↓ Comprobante de pago
        </button>
      )}
      {o.factura_recepcion_path && (
        <button className="btn btn-ghost" onClick={handleFacturaRecepcion} title={o.factura_recepcion_nombre ?? 'Factura del proveedor'}>
          🧾 Factura
        </button>
      )}
      {/* OC pagada y aún no recibida (anticipado/contado): ya se puede recibir.
          En contra entrega la recepción ocurrió ANTES del pago, así que no se repite. */}
      {isPagada && !o.recibida_en && canManageProcurement && (
        <>
          <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
          <button className="btn btn-primary" onClick={onReceive}>Marcar recibida</button>
        </>
      )}
      {/* Contra entrega pagada (ya recibida): solo queda el PDF; finaliza con el botón de abajo. */}
      {isPagada && o.recibida_en && canManageProcurement && (
        <button className="btn btn-ghost" onClick={handleOcPdf} title="Descargar la OC en PDF">↓ OC PDF</button>
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
        <button className="btn btn-success" onClick={onApprove} title="Aprobar la Solicitud de Pedido">
          Aprobar Solicitud de Pedido
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
        <div className="v">
          <StatusBadge estado={o.estado} />
          {o.tipo === 'servicio' && (
            <span className="badge" style={{ marginLeft: '.4rem', background: '#0ea5e9', color: '#fff', fontWeight: 700 }}>🔧 Servicio</span>
          )}
          {o.urgente && (
            <span className="badge" style={{ marginLeft: '.4rem', background: 'var(--danger)', color: '#fff', fontWeight: 700 }}>🚨 URGENTE</span>
          )}
          {isCuentaAbierta && o.recibida_en && (
            <span className="badge warning" style={{ marginLeft: '.4rem' }}>📦 Recibido · pendiente por pagar</span>
          )}
        </div>
      </div>
      <div className="detail-row">
        <div className="k">Proveedor actual</div>
        <div className="v">
          {proveedor?.razon_social ?? '—'}{' '}
          <span className="muted mono">{proveedor?.rif ?? ''}</span>
        </div>
      </div>
      {o.unidad_solicitante && (
        <div className="detail-row">
          <div className="k">Unidad solicitante</div>
          <div className="v">{o.unidad_solicitante}</div>
        </div>
      )}
      <div className="detail-row">
        <div className="k">Solicitante</div>
        <div className="v">
          {o.solicitante ?? persona(o.solicitante_email, personaMap)}
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
            {dateTime(o.aprobada_en)} <span className="muted">por {persona(o.aprobada_por, personaMap)}</span>
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
          <div className="v">{dateTime(o.oc_creada_en)} <span className="muted">por {persona(o.oc_creada_por, personaMap)}</span></div>
        </div>
      )}
      {o.oc_aprobada_en && (
        <div className="detail-row">
          <div className="k">OC confirmada</div>
          <div className="v">{dateTime(o.oc_aprobada_en)} <span className="muted">por {persona(o.oc_aprobada_por, personaMap)}</span></div>
        </div>
      )}
      {o.oc_codigo && (
        <div className="detail-row">
          <div className="k">Condición de pago</div>
          <div className="v">
            <span className="badge" style={{ background: 'var(--primary-2)', color: '#fff', fontWeight: 600 }}>
              {o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : 'Contado / anticipado'}
            </span>
          </div>
        </div>
      )}
      {o.metodo_pago && o.metodo_pago.length > 0 && (
        <div className="detail-row">
          <div className="k">Método de pago</div>
          <div className="v">
            {o.metodo_pago.map((m, i) => (
              <div key={i} className="mono" style={{ fontSize: '.86rem' }}>
                {labelMetodoPago(m.metodo)} · {m.monto > 0 ? `$${money(m.monto)} en ${m.moneda}` : m.moneda}
              </div>
            ))}
            {o.metodo_pago_en && <span className="muted" style={{ fontSize: '.74rem' }}>indicado {dateTime(o.metodo_pago_en)} por {persona(o.metodo_pago_por, personaMap)}</span>}
          </div>
        </div>
      )}
      {o.comprobante_tipo === 'factura' && (
        <div className="detail-row">
          <div className="k">IVA (factura)</div>
          <div className="v">
            {o.iva_aplicado
              ? <>Con IVA (16%) · <span className="mono">{money(Number(o.iva_monto ?? 0))}</span> <span className="muted">incluido en el total</span></>
              : <span className="muted">Sin IVA</span>}
          </div>
        </div>
      )}
      {o.abonado_total != null && o.abonado_total > 0 && (
        <div className="detail-row">
          <div className="k">Abonado (crédito)</div>
          <div className="v mono">{money(o.abonado_total)} <span className="muted">de {money(o.total)}</span></div>
        </div>
      )}
      {o.recibida_en && (
        <div className="detail-row">
          <div className="k">Recepción</div>
          <div className="v">
            {dateTime(o.recibida_en)} <span className="muted">por {persona(o.recibida_por, personaMap)}</span>
            {o.recibido_total != null && <div className="mono" style={{ fontSize: '.84rem' }}>Total recibido: {money(o.recibido_total)}{o.recibido_total < o.total && <span className="muted"> · de {money(o.total)}</span>}</div>}
          </div>
        </div>
      )}
      {o.almacen_destino && (
        <div className="detail-row">
          <div className="k">Almacén destino</div>
          <div className="v">📦 {o.almacen_destino}</div>
        </div>
      )}
      {o.nota_recepcion && (
        <div className="detail-row">
          <div className="k">Nota de recepción</div>
          <div className="v">{o.nota_recepcion}</div>
        </div>
      )}
      {o.pagada_en && (
        <div className="detail-row">
          <div className="k">Pagada</div>
          <div className="v">{dateTime(o.pagada_en)} <span className="muted">por {persona(o.pagada_por, personaMap)}</span></div>
        </div>
      )}
      {o.notas && (
        <div className="detail-row">
          <div className="k">Notas</div>
          <div className="v">{o.notas}</div>
        </div>
      )}
      {o.motivo && (
        <div className="detail-row">
          <div className="k">Motivo</div>
          <div className="v">{o.motivo}</div>
        </div>
      )}
      {o.finalidad && (
        <div className="detail-row">
          <div className="k">Finalidad</div>
          <div className="v">{o.finalidad}</div>
        </div>
      )}
      {o.imagen_path && (
        <div className="detail-row">
          <div className="k">Imagen</div>
          <div className="v"><OpImagenAdjunta path={o.imagen_path} /></div>
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
          onEditarOferta={onEditarOferta}
        />
      )}

      <h4 style={{ marginTop: '1rem' }}>Ítems</h4>
      {/* En etapa OP (sin oferta aceptada) no hay precio: se oculta Precio/Subtotal
          y se marca cuáles se compran. Con oferta aceptada (total>0) se muestra todo. */}
      {(() => {
        const conPrecio = Number(o.total) > 0;
        // En etapa OP (sin precio) quien gestiona compras puede marcar/desmarcar
        // qué ítems se aprueban para comprar.
        const puedeEditarComprar = !conPrecio && canManageProcurement;
        return (
      <table className="items-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th>Finalidad</th>
            <th className="num">Cantidad</th>
            {conPrecio ? (
              <>
                <th className="num">Precio</th>
                <th className="num">Subtotal</th>
              </>
            ) : (
              <th className="num">Comprar</th>
            )}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((it, idx) => (
            <tr key={`${it.sku}-${idx}`} style={{ opacity: !conPrecio && it.comprar === false ? 0.5 : 1 }}>
              <td className="mono">{it.sku}</td>
              <td>{it.nombre}</td>
              <td style={{ fontSize: '.84rem' }}>{it.finalidad?.trim() ? it.finalidad : <span className="muted">—</span>}</td>
              <td className="num">{num(it.cantidad)}{it.unidad ? ` ${it.unidad}` : ''}</td>
              {conPrecio ? (
                <>
                  <td className="num">{money(it.precio)}</td>
                  <td className="num">{money(it.cantidad * it.precio)}</td>
                </>
              ) : (
                <td className="num">
                  {puedeEditarComprar ? (
                    <input
                      type="checkbox"
                      checked={it.comprar !== false}
                      disabled={togglingSku === it.sku}
                      title={it.comprar === false ? 'Marcar para comprar' : 'Quitar de la compra'}
                      onChange={(e) => toggleComprar(it.sku, e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  ) : (
                    it.comprar === false ? '—' : '✓'
                  )}
                </td>
              )}
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
        {conPrecio && (
          <tfoot>
            <tr>
              <td colSpan={6} className="num">TOTAL</td>
              <td className="num">{money(o.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
        );
      })()}

      <div style={{ marginTop: '1.25rem' }}>
        <ChatOrden ordenId={o.id} ordenLabel={o.oc_codigo ?? o.codigo} autorNombre={persona(actorEmail, personaMap)} />
      </div>

      <h4 style={{ marginTop: '1.25rem' }}>Historial</h4>
      <Timeline historial={o.historial ?? []} proveedorMap={proveedorMap} personaMap={personaMap} />
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
          name="traza-correo-extra"
          defaultValue={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="otro@correo.com"
          maxLength={120}
        />
        <small className="muted">Podés mandarlo a un segundo destinatario al mismo tiempo.</small>
      </div>
    </Modal>
  );
}

/** Muestra el nombre de la persona a partir de su email; si no está, el propio email. */
function persona(email: string | null | undefined, map: Map<string, string>): string {
  if (!email) return '—';
  return map.get(email.toLowerCase()) ?? email;
}

function Timeline({
  historial,
  proveedorMap,
  personaMap,
}: {
  historial: EventoHistorial[];
  proveedorMap: Map<string, Proveedor>;
  personaMap: Map<string, string>;
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
              <div className="tl-meta">{dateTime(h.at)} · {persona(h.actor, personaMap)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Adjunto de una OP (imagen o PDF): resuelve el signed URL del bucket privado y lo muestra. */
function OpImagenAdjunta({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const esPdf = path.toLowerCase().endsWith('.pdf');
  useEffect(() => {
    let alive = true;
    getImagenOrdenSignedUrl(path).then((u) => { if (alive) setUrl(u); }).catch(() => { /* sin permiso / expirado */ });
    return () => { alive = false; };
  }, [path]);
  if (!url) return <span className="muted">Cargando adjunto…</span>;
  if (esPdf) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" title="Abrir PDF adjunto">
        📄 Ver PDF adjunto
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Ver imagen en grande">
      <img src={url} alt="Adjunto de la SP" style={{ maxWidth: 240, maxHeight: 240, borderRadius: 8, border: '1px solid var(--border)' }} />
    </a>
  );
}

/* ─────────────────────────────────────────────
   Modal: Crear orden
   ───────────────────────────────────────────── */
interface CrearOrdenModalProps {
  productos: Producto[];
  usuario: Usuario | null;
  authEmail: string;
  /** Si viene true, abre con MERCADO ya activado (desde la alerta de Cocina). */
  mercadoInicial?: boolean;
  onClose: () => void;
  onCreated: () => void;
}
function CrearOrdenModal({
  productos,
  usuario,
  authEmail,
  mercadoInicial,
  onClose,
  onCreated,
}: CrearOrdenModalProps) {
  const [items, setItems] = useState<ItemOrden[]>([]);
  // Texto crudo de cada cantidad (permite escribir decimales como 0,5 sin perder el punto).
  const [cantEdit, setCantEdit] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');
  // Lectura del DOM al guardar: el guardado toma SIEMPRE lo que está escrito en
  // pantalla (solicitante, finalidad y nota), aunque algún re-render del modal no
  // haya sincronizado el estado. Es la fuente de verdad al crear la orden.
  const formRef = useRef<HTMLDivElement>(null);
  // Productos del inventario + los nuevos creados al vuelo en este modal.
  const [extraProductos, setExtraProductos] = useState<Producto[]>([]);
  const allProductos = useMemo(() => [...productos, ...extraProductos], [productos, extraProductos]);
  // Opciones del buscador de productos memoizadas: si se recalculan inline en cada
  // render (al teclear en Solicitante/Finalidad), el SearchSelect se rehace y el
  // input pierde el foco a las pocas letras. Memoizado, el tecleo es fluido.
  const prodOptions = useMemo(
    () => allProductos.map((p) => ({ value: p.id, label: `${p.sku} · ${p.nombre}` })),
    [allProductos],
  );
  const [prodSelectId, setProdSelectId] = useState<string>(productos[0]?.id ?? '');
  const [codigo, setCodigo] = useState<string>('…');
  const [submitting, setSubmitting] = useState(false);
  // Prioridad: marca la OP como URGENTE. Se refleja en PDF y trazabilidad.
  const [urgente, setUrgente] = useState(false);
  // Imagen adjunta opcional (foto del repuesto/equipo solicitado).
  const [imagenFile, setImagenFile] = useState<File | null>(null);

  // MERCADO: pedido para restablecer el mercado (reposición de víveres). Al
  // activarlo trae la ÚLTIMA compra de mercado para re-seleccionar qué comprar,
  // y fija la finalidad general "PEDIDO PARA RESTABLECER EL MERCADO".
  const [mercado, setMercado] = useState(false);
  const [ultimaMercado, setUltimaMercado] = useState<Orden | null>(null);
  const [mercadoLoading, setMercadoLoading] = useState(false);
  const [mercadoSel, setMercadoSel] = useState<Set<string>>(new Set());
  const mercadoCargado = useRef(false);

  async function toggleMercado(on: boolean) {
    setMercado(on);
    if (on && !mercadoCargado.current) {
      mercadoCargado.current = true;
      setMercadoLoading(true);
      try {
        const u = await getUltimaCompraMercado();
        setUltimaMercado(u);
        setMercadoSel(new Set((u?.items ?? []).map((i) => i.sku))); // todos pre-marcados (por SKU)
      } catch { setUltimaMercado(null); }
      finally { setMercadoLoading(false); }
    }
  }
  // Si se abre desde la alerta de Cocina, activamos MERCADO de una vez.
  useEffect(() => { if (mercadoInicial) void toggleMercado(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function toggleMercadoSel(sku: string) {
    setMercadoSel((s) => { const n = new Set(s); if (n.has(sku)) n.delete(sku); else n.add(sku); return n; });
  }
  // Añade a la solicitud los productos marcados de la última compra (sin duplicar, por SKU).
  function agregarMercadoSeleccionados() {
    const elegidos = (ultimaMercado?.items ?? []).filter((i) => mercadoSel.has(i.sku));
    if (!elegidos.length) { toast('Seleccioná al menos un producto de la última compra', 'error'); return; }
    let añadidos = 0;
    setItems((prev) => {
      const next = [...prev];
      for (const it of elegidos) {
        if (next.some((x) => x.sku === it.sku)) continue;
        next.push({ productoId: it.productoId, sku: it.sku, nombre: it.nombre, cantidad: it.cantidad || 1, precio: 0, unidad: it.unidad, comprar: true, finalidad: FINALIDAD_MERCADO });
        añadidos++;
      }
      return next;
    });
    toast(añadidos ? `${añadidos} producto(s) añadidos desde la última compra` : 'Esos productos ya estaban en la solicitud', añadidos ? 'success' : 'info');
  }

  // Alta rápida de un producto que aún no existe en inventario (datos mínimos;
  // el resto se completa luego desde el módulo de inventario).
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCategoria, setNuevoCategoria] = useState('GENERAL');
  const [nuevoUnidad, setNuevoUnidad] = useState('und');
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  // Ref al input de nombre: tras crear, lo limpiamos y re-enfocamos SIN cerrar el
  // formulario, para poder cargar varios productos nuevos seguidos.
  const nuevoNombreRef = useRef<HTMLInputElement>(null);

  async function crearProductoNuevo() {
    const nombre = nuevoNombre.trim().toUpperCase();
    if (!nombre) { toast('Escribí el nombre del producto', 'error'); return; }
    setCreandoNuevo(true);
    try {
      const base = nombre.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'PROD';
      // SKU único a prueba de colisiones: nombres parecidos ("FILTRO…") truncan a
      // la misma base, así que el sufijo debe ser único. Genero uno con alta
      // entropía y verifico contra inventario; reintento si ya existe.
      let sku = '';
      for (let intento = 0; intento < 8; intento++) {
        const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
        const ts = Date.now().toString(36).slice(-4).toUpperCase();
        sku = `NEW-${base}-${ts}${rnd}`;
        if (!(await findBySku(sku))) break;
      }
      const creado = await createProducto({
        sku,
        nombre,
        // En MERCADO los productos nuevos entran SIEMPRE como VÍVERES (para que
        // queden disponibles en Cocina); fuera de MERCADO, la categoría elegida.
        categoria: mercado ? 'VÍVERES' : (nuevoCategoria.trim().toUpperCase() || 'GENERAL'),
        unidad: nuevoUnidad.trim() || 'und',
        stock: 0,
        stock_min: 0,
        precio: 0,
        almacen: nuevoAlmacen || 'General',
        estado: 'activo',
      });
      setExtraProductos((prev) => [...prev, creado]);
      setProdSelectId(creado.id);
      // Agregar de una vez a la solicitud.
      setItems((prev) => prev.some((i) => i.productoId === creado.id)
        ? prev
        : [...prev, { productoId: creado.id, sku: creado.sku, nombre: creado.nombre, cantidad: 1, precio: 0, unidad: creado.unidad, comprar: true }]);
      toast(`Producto "${creado.nombre}" creado y añadido · cargá otro o cerrá`, 'success');
      // Limpiamos el campo y mantenemos el formulario abierto para añadir más.
      setNuevoNombre('');
      if (nuevoNombreRef.current) { nuevoNombreRef.current.value = ''; nuevoNombreRef.current.focus(); }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el producto', 'error');
    } finally {
      setCreandoNuevo(false);
    }
  }

  // Solicitante (persona) y Unidad solicitante: por defecto los del usuario logueado,
  // pero EDITABLES — un analista puede registrar la solicitud a nombre de otra persona.
  const [solicitanteNombre, setSolicitanteNombre] = useState((usuario?.nombre ?? authEmail).toUpperCase());
  const [unidadSolicitante, setUnidadSolicitante] = useState((usuario?.departamento ?? '').toUpperCase());

  // Catálogos para el alta de producto nuevo (almacenes/subalmacenes + unidades del inventario).
  const [almacenesList, setAlmacenesList] = useState<string[]>([]);
  const [unidadesList, setUnidadesList] = useState<string[]>([]);
  const [nuevoAlmacen, setNuevoAlmacen] = useState('General');
  // Catálogo gestionable de la OP: unidades solicitantes.
  const [unidadOpciones, setUnidadOpciones] = useState<string[]>([]);
  // Alta de unidad nueva desde el propio formulario (campo «¿No está?» + botón Añadir).
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const [addingUnidad, setAddingUnidad] = useState(false);
  // Input no-controlado vía ref: el DOM conserva lo tecleado aunque el modal
  // re-renderice. Leemos el valor del DOM al añadir y lo limpiamos por ref (sin
  // `key` que remonte el campo, que cortaba el texto a la primera letra).
  const nuevaUnidadRef = useRef<HTMLInputElement>(null);

  // Carga (y recarga, en vivo) las opciones del catálogo de la OP.
  const cargarCatalogosOP = useCallback(async () => {
    const uns = await listActivosPedido('unidad_solicitante').catch(() => [] as string[]);
    setUnidadOpciones(uns);
  }, []);

  useEffect(() => {
    nextCodigo().then(setCodigo).catch(() => setCodigo('SP-?'));
    getNombresAlmacenes()
      .then((a) => { setAlmacenesList(a); setNuevoAlmacen((prev) => (a.includes(prev) ? prev : (a[0] ?? 'General'))); })
      .catch(() => setAlmacenesList(['General']));
    getUnidades().then((u) => { setUnidadesList(u); setNuevoUnidad((prev) => (u.includes(prev) ? prev : (u[0] ?? 'und'))); }).catch(() => setUnidadesList(['und']));
    void cargarCatalogosOP();
  }, [cargarCatalogosOP]);
  // En vivo: si se agregan/editan unidades o clasificaciones (acá o en el catálogo), se reflejan al instante.
  useRealtime(['pedido_catalogos'], () => { void cargarCatalogosOP(); });

  const limpiarNuevaUnidad = () => { setNuevaUnidad(''); if (nuevaUnidadRef.current) nuevaUnidadRef.current.value = ''; };

  // Agrega la unidad escrita al catálogo y la deja seleccionada (sin cerrar el formulario).
  async function agregarUnidadNueva() {
    // Fuente de verdad: el DOM (input no controlado), no el estado React.
    const v = (nuevaUnidadRef.current?.value ?? nuevaUnidad).trim().toUpperCase();
    if (!v) { toast('Escribí la unidad nueva', 'error'); return; }
    if (unidadOpciones.some((u) => u.toLowerCase() === v.toLowerCase())) {
      setUnidadSolicitante(v); limpiarNuevaUnidad();
      toast('Esa unidad ya existía; la seleccioné', 'info');
      return;
    }
    setAddingUnidad(true);
    try {
      await addCatalogoPedido('unidad_solicitante', v);
      await cargarCatalogosOP();
      setUnidadSolicitante(v);
      limpiarNuevaUnidad();
      toast('Unidad agregada al catálogo', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar la unidad', 'error');
    } finally {
      setAddingUnidad(false);
    }
  }

  function addItem() {
    const p = allProductos.find((x) => x.id === prodSelectId);
    if (!p) return;
    // El número manda tras (re)agregar: olvidamos el texto crudo de esa cantidad.
    setCantEdit((m) => { const n = { ...m }; delete n[p.id]; return n; });
    setItems((prev) => {
      const ex = prev.find((i) => i.productoId === p.id);
      if (ex) {
        return prev.map((i) =>
          i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      // Precio inicia en 0; el precio real lo fija la oferta del proveedor.
      // comprar=true por defecto: se puede desmarcar para no comprarlo.
      return [
        ...prev,
        { productoId: p.id, sku: p.sku, nombre: p.nombre, cantidad: 1, precio: 0, unidad: p.unidad, comprar: true },
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
    if (!items.some((i) => i.comprar !== false)) {
      toast('Marcá al menos un artículo a comprar', 'error');
      return;
    }
    // Fuente de verdad = lo que está escrito en pantalla AHORA (leído del DOM,
    // antes de cualquier re-render del submit). Cae al estado si no hay DOM.
    const root = formRef.current;
    const solDom = root?.querySelector('input[name="op-solicitante"]') as HTMLInputElement | null;
    const notaDom = root?.querySelector('textarea[name="op-nota"]') as HTMLTextAreaElement | null;
    const finDoms = root ? (Array.from(root.querySelectorAll('input[data-fin-idx]')) as HTMLInputElement[]) : [];
    const solicitanteFinal = ((solDom?.value ?? solicitanteNombre) || '').toUpperCase().trim();
    const notaFinal = ((notaDom?.value ?? notas) || '').trim();
    const itemsFinal = items.map((it, idx) => {
      const dom = finDoms.find((d) => d.dataset.finIdx === String(idx));
      const base = dom ? { ...it, finalidad: dom.value } : it;
      // En MERCADO, si no se escribió finalidad puntual, se hereda la general.
      if (mercado && !base.finalidad?.trim()) return { ...base, finalidad: FINALIDAD_MERCADO };
      return base;
    });
    setSubmitting(true);
    try {
      const email = usuario?.email ?? authEmail;
      // Si la unidad solicitante es nueva, la guardamos en el catálogo para reusarla.
      const unidad = unidadSolicitante.trim();
      if (unidad && !unidadOpciones.some((u) => u.toLowerCase() === unidad.toLowerCase())) {
        await addCatalogoPedido('unidad_solicitante', unidad).catch(() => { /* ya existe / sin permiso */ });
      }
      // Si se adjuntó una imagen, se sube primero y se guarda su path en la OP.
      const imagenPath = imagenFile ? await subirImagenOrden(imagenFile) : null;
      const saved = await crearOrden({
        // proveedor_id se asigna luego por el admin durante el flujo de sourcing.
        proveedor_id: null,
        items: itemsFinal,
        notas: notaFinal || null,
        motivo: null,
        finalidad: mercado ? FINALIDAD_MERCADO : null,
        clasificacion: [],
        urgente,
        imagen_path: imagenPath,
        // El email queda como el de la cuenta que registra (auditoría); el nombre y CI
        // pueden ser los de otra persona (solicitud a su nombre).
        solicitante_email: email,
        solicitante: solicitanteFinal || null,
        unidad_solicitante: unidadSolicitante.trim() || null,
        ci_solicitante: null,
      });
      notify(`Nueva solicitud de pedido ${saved.codigo} enviada para aprobación`, 'success', { link: '#/app/pedidos', destino: 'admin' });
      onCreated();
    } catch (e) {
      // Los errores de Supabase no son instancias de Error: igual traen `.message`.
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message || 'Error al crear';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Nueva solicitud de pedido"
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
      <div ref={formRef}>
      <div className="form-grid">
        <div className="form-row">
          <label>Unidad solicitante</label>
          {/* Desplegable de unidades del catálogo (en vivo). */}
          <SearchSelect value={unidadSolicitante} onChange={(v) => setUnidadSolicitante(v.toUpperCase())}
            options={unidadOpciones.map((u) => ({ value: u, label: u }))}
            placeholder="Departamento / unidad que solicita" />
          {/* Alta directa: si la unidad no está, se escribe y se agrega al catálogo de una vez. */}
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
            <input ref={nuevaUnidadRef} className="input" name="op-nueva-unidad" defaultValue=""
              onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevaUnidad(e.target.value); }}
              placeholder="¿No está? Escribí la unidad nueva…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarUnidadNueva(); } }} />
            <button type="button" className="btn btn-ghost" onClick={() => void agregarUnidadNueva()} disabled={addingUnidad}>
              {addingUnidad ? '…' : '+ Añadir'}
            </button>
          </div>
          <small className="muted">La unidad nueva queda guardada en el catálogo (Categorías → Unidad solicitante).</small>
        </div>
        <div className="form-row">
          <label>Código</label>
          <input className="input mono" value={codigo} disabled />
        </div>
      </div>

      <div className="form-row">
        <label>Solicitante</label>
        {/* NO controlado (sin `value`): el DOM conserva lo tecleado aunque el modal
            re-renderice; el estado se sincroniza para el guardado. Antes, con `value`
            controlado, un re-render pisaba el campo y cortaba el nombre a medias. */}
        <input
          className="input"
          name="op-solicitante"
          autoComplete="off"
          defaultValue={solicitanteNombre}
          onChange={(e) => setSolicitanteNombre(e.target.value.toUpperCase())}
          style={{ textTransform: 'uppercase' }}
          placeholder="Nombre de quien solicita"
        />
      </div>

      {/* Prioridad de la orden: URGENTE. Se refleja en el PDF y la trazabilidad. */}
      <label
        style={{
          display: 'flex', alignItems: 'center', gap: '.6rem', cursor: 'pointer',
          padding: '.7rem .9rem', borderRadius: 8, marginBottom: '1rem',
          border: `1px solid ${urgente ? 'var(--danger)' : 'var(--border)'}`,
          background: urgente ? 'rgba(220,53,69,.12)' : 'transparent',
        }}
      >
        <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
        <span style={{ fontWeight: 700, letterSpacing: '.02em', color: urgente ? 'var(--danger)' : 'inherit' }}>
          🚨 ORDEN: URGENTE
        </span>
        <span className="muted" style={{ fontSize: '.76rem' }}>Marca esta solicitud como prioritaria.</span>
      </label>

      {/* MERCADO: reposición de víveres. Trae la última compra para re-seleccionar
          qué comprar y fija la finalidad general automática. */}
      <label
        style={{
          display: 'flex', alignItems: 'center', gap: '.6rem', cursor: 'pointer',
          padding: '.7rem .9rem', borderRadius: 8, marginBottom: mercado ? '.6rem' : '1rem',
          border: `1px solid ${mercado ? 'var(--brand, #ff8a00)' : 'var(--border)'}`,
          background: mercado ? 'rgba(255,138,0,.12)' : 'transparent',
        }}
      >
        <input type="checkbox" checked={mercado} onChange={(e) => void toggleMercado(e.target.checked)} />
        <span style={{ fontWeight: 700, letterSpacing: '.02em', color: mercado ? 'var(--brand, #ff8a00)' : 'inherit' }}>
          🛒 MERCADO
        </span>
        <span className="muted" style={{ fontSize: '.76rem' }}>Pedido para restablecer el mercado: trae la última compra para re-seleccionar.</span>
      </label>

      {mercado && (
        <div className="card" style={{ padding: '.7rem', marginBottom: '1rem', display: 'grid', gap: '.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.4rem' }}>
            <strong style={{ fontSize: '.85rem' }}>
              Última compra de mercado
              {ultimaMercado && <span className="muted mono" style={{ fontWeight: 400 }}> · {ultimaMercado.codigo} · {dateTime(ultimaMercado.created_at)}</span>}
            </strong>
            <span className="badge" style={{ background: 'var(--brand,#ff8a00)', color: '#111', fontSize: '.66rem', fontWeight: 700 }}>
              Finalidad: {FINALIDAD_MERCADO}
            </span>
          </div>
          {mercadoLoading ? (
            <div className="muted" style={{ fontSize: '.82rem' }}>Cargando última compra…</div>
          ) : !ultimaMercado || !ultimaMercado.items?.length ? (
            <div className="muted" style={{ fontSize: '.82rem' }}>
              No hay una compra de mercado anterior. Agregá los productos abajo (buscador o «+ Producto nuevo»).
            </div>
          ) : (
            <>
              <div className="muted" style={{ fontSize: '.74rem' }}>Marcá lo que vas a volver a comprar y tocá «Añadir seleccionados».</div>
              <div style={{ maxHeight: 'min(32vh, 260px)', overflowY: 'auto', display: 'grid', gap: '.25rem' }}>
                {ultimaMercado.items.map((it) => {
                  const yaEsta = items.some((x) => x.sku === it.sku);
                  const sel = mercadoSel.has(it.sku);
                  return (
                    <label key={it.sku} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.3rem .4rem', borderRadius: 6, opacity: yaEsta ? 0.55 : 1 }}>
                      <input type="checkbox" checked={sel} disabled={yaEsta} onChange={() => toggleMercadoSel(it.sku)} />
                      <span style={{ flex: 1 }}>{it.nombre} <span className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</span></span>
                      <span className="muted mono" style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>{it.cantidad} {it.unidad}</span>
                      {yaEsta && <span className="badge" style={{ fontSize: '.6rem' }}>ya añadido</span>}
                    </label>
                  );
                })}
              </div>
              <div>
                <button type="button" className="btn btn-sm btn-primary" onClick={agregarMercadoSeleccionados}>
                  + Añadir seleccionados ({[...mercadoSel].filter((sku) => !items.some((x) => x.sku === sku)).length})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="form-row">
        <label>Productos solicitados</label>
        <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.3rem' }}>
          Marcá los artículos a comprar e indicá la finalidad de cada uno. Los desmarcados quedan en la solicitud pero no se cotizan.
        </div>
        <div className="line-picker head" style={{ gridTemplateColumns: '34px 2fr 130px 40px' }}>
          <div title="Comprar">✓</div>
          <div>Producto</div>
          <div>Cantidad</div>
          <div></div>
        </div>
        {/* Scroll propio: la lista puede tener muchos productos (sin tope) sin
            empujar el buscador «+ Añadir» fuera de la vista. */}
        <div style={{ maxHeight: 'min(42vh, 360px)', overflowY: 'auto', paddingRight: '.2rem' }}>
          {items.map((it, idx) => {
            const comprar = it.comprar !== false;
            return (
            <div key={`${it.sku}-${idx}`} style={{ opacity: comprar ? 1 : 0.5, marginBottom: '.4rem' }}>
            <div className="line-picker" style={{ gridTemplateColumns: '34px 2fr 130px 40px', marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={comprar}
                title={comprar ? 'Se comprará' : 'No se comprará'}
                onChange={(e) => updateItem(idx, { comprar: e.target.checked })}
                style={{ alignSelf: 'center' }}
              />
              <div>
                <div>{it.nombre}</div>
                <div className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</div>
              </div>
              {/* Cantidad + unidad de medida del producto (KG, L, und…). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  step="any"
                  style={{ flex: 1, minWidth: 0 }}
                  value={cantEdit[it.sku] ?? String(it.cantidad)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCantEdit((m) => ({ ...m, [it.sku]: raw }));
                    const n = Number(raw.replace(',', '.'));
                    if (raw !== '' && Number.isFinite(n) && n > 0) updateItem(idx, { cantidad: n });
                  }}
                  onBlur={() => {
                    const n = Number((cantEdit[it.sku] ?? String(it.cantidad)).replace(',', '.'));
                    const val = Number.isFinite(n) && n > 0 ? n : 1;
                    updateItem(idx, { cantidad: val });
                    setCantEdit((m) => ({ ...m, [it.sku]: String(val) }));
                  }}
                />
                {it.unidad && <span className="muted mono" style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>{it.unidad}</span>}
              </div>
              <button
                type="button"
                className="rm"
                title="Quitar"
                onClick={() => removeItem(idx)}
              >
                ✕
              </button>
            </div>
            {/* Finalidad de la compra de este producto en concreto (solo si se va a comprar). */}
            {comprar && (
              <div style={{ marginLeft: 34, display: 'grid', gap: '.3rem', marginTop: '.3rem' }}>
                <input
                  className="input"
                  style={{ width: '100%', fontSize: '.82rem' }}
                  placeholder="Finalidad de este producto (¿para qué se compra?)"
                  data-fin-idx={idx}
                  defaultValue={it.finalidad ?? ''}
                  onChange={(e) => updateItem(idx, { finalidad: e.target.value })}
                />
              </div>
            )}
            </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem' }}>
          <SearchSelect
            style={{ flex: 1 }}
            value={prodSelectId}
            onChange={setProdSelectId}
            options={prodOptions}
            placeholder="Buscar producto por nombre o SKU…"
            emptyText="Ningún producto coincide"
          />
          <button type="button" className="btn btn-ghost" onClick={addItem}>+ Añadir</button>
        </div>

        <div style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNuevoOpen((v) => !v)}>
            {nuevoOpen ? '× Cerrar' : '+ Producto nuevo (no existe en inventario)'}
          </button>
          {nuevoOpen && (
            <div className="card" style={{ padding: '.65rem', marginTop: '.4rem', display: 'grid', gap: '.5rem' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>
                Datos mínimos. Se crea en inventario y lo completás luego (stock, precio…).
              </div>
              <input
                ref={nuevoNombreRef}
                className="input"
                name="op-nuevo-nombre"
                placeholder="Nombre del producto *"
                defaultValue={nuevoNombre}
                onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevoNombre(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crearProductoNuevo(); } }}
              />
              <div className="form-grid">
                {mercado ? (
                  <input className="input" value="VÍVERES" disabled title="En MERCADO los productos nuevos entran como VÍVERES y quedan disponibles en Cocina" />
                ) : (
                  <input className="input" name="op-nuevo-categoria" placeholder="Categoría" defaultValue={nuevoCategoria} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevoCategoria(e.target.value); }} />
                )}
                <div className="form-row" style={{ margin: 0 }}>
                  <SearchSelect value={nuevoUnidad} onChange={setNuevoUnidad}
                    placeholder="🔍 Unidad…"
                    options={unidadesList.map((u) => ({ value: u, label: u }))} />
                </div>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label style={{ fontSize: '.74rem' }}>Almacén / sub-almacén destino</label>
                <SearchSelect value={nuevoAlmacen} onChange={setNuevoAlmacen}
                  placeholder="🔍 Buscar almacén…"
                  options={almacenesList.map((a) => ({ value: a, label: a }))} />
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
        <label>Nota <span className="muted">(opcional)</span></label>
        <textarea
          className="textarea"
          name="op-nota"
          placeholder="Nota o justificación de la solicitud (opcional)"
          defaultValue={notas}
          onChange={(e) => setNotas(e.target.value.toUpperCase())}
        />
      </div>

      <div className="form-row">
        <label>Imagen / PDF <span className="muted">(opcional)</span></label>
        <input
          className="input"
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setImagenFile(e.target.files?.[0] ?? null)}
        />
        {imagenFile && (
          <small className="muted">📎 {imagenFile.name} ({(imagenFile.size / 1024).toFixed(0)} KB)</small>
        )}
        <small className="muted">Podés adjuntar una foto o un PDF del repuesto/equipo solicitado (máx. 10 MB).</small>
      </div>

      <p className="muted" style={{ fontSize: '.78rem', marginTop: '.75rem' }}>
        El precio lo fijará el proveedor al cargar su oferta. La solicitud queda sin monto hasta entonces.
      </p>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   Modal: Editar OC (etapa «cargar ofertas», sin oferta con precio)
   Permite cambiar ítems (cantidad, comprar, agregar/quitar), motivo y finalidad.
   ───────────────────────────────────────────── */
function EditarOrdenModal({
  orden,
  productos,
  actorEmail,
  onClose,
  onSaved,
}: {
  orden: Orden;
  productos: Producto[];
  actorEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<ItemOrden[]>(() => orden.items.map((i) => ({ ...i })));
  const [cantEdit, setCantEdit] = useState<Record<string, string>>({});
  const [prodSelectId, setProdSelectId] = useState<string>(productos[0]?.id ?? '');
  // Datos de cabecera editables de la OP: solicitante, unidad, clasificación, urgencia y notas.
  const [solicitante, setSolicitante] = useState(orden.solicitante ?? '');
  const [ciSolicitante, setCiSolicitante] = useState(orden.ci_solicitante ?? '');
  const [unidadSol, setUnidadSol] = useState(orden.unidad_solicitante ?? '');
  const [clasifSel, setClasifSel] = useState<string[]>(orden.clasificacion ?? []);
  const [urgente, setUrgente] = useState(!!orden.urgente);
  const [notas, setNotas] = useState(orden.notas ?? '');
  // Adjunto (imagen o PDF) de la OP: el actual + uno nuevo para reemplazar + quitar.
  const imagenPathActual = orden.imagen_path ?? null;
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const [unidadOpciones, setUnidadOpciones] = useState<string[]>([]);
  const [clasifOpciones, setClasifOpciones] = useState<string[]>([]);
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const [addingUnidad, setAddingUnidad] = useState(false);
  useEffect(() => {
    void listActivosPedido('unidad_solicitante').then(setUnidadOpciones).catch(() => setUnidadOpciones([]));
    void listActivosPedido('clasificacion').then(setClasifOpciones).catch(() => setClasifOpciones([]));
  }, []);
  async function agregarUnidadNueva() {
    const v = nuevaUnidad.trim().toUpperCase();
    if (!v) { toast('Escribí la unidad nueva', 'error'); return; }
    if (unidadOpciones.some((u) => u.toLowerCase() === v.toLowerCase())) {
      setUnidadSol(v); setNuevaUnidad('');
      toast('Esa unidad ya existía; la seleccioné', 'info');
      return;
    }
    setAddingUnidad(true);
    try {
      await addCatalogoPedido('unidad_solicitante', v);
      setUnidadOpciones((prev) => [...prev, v].sort());
      setUnidadSol(v); setNuevaUnidad('');
      toast('Unidad agregada al catálogo', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar la unidad', 'error');
    } finally { setAddingUnidad(false); }
  }
  function toggleClasif(c: string) {
    setClasifSel((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }
  const [saving, setSaving] = useState(false);
  // Productos creados al vuelo en este modal (no existían en inventario).
  const [extraProductos, setExtraProductos] = useState<Producto[]>([]);
  const allProductos = useMemo(() => [...productos, ...extraProductos], [productos, extraProductos]);
  // Alta rápida de producto nuevo (no en inventario), igual que al crear la OP.
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCategoria, setNuevoCategoria] = useState('GENERAL');
  const [nuevoUnidad, setNuevoUnidad] = useState('und');
  const [nuevoAlmacen, setNuevoAlmacen] = useState('General');
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [unidadesList, setUnidadesList] = useState<string[]>([]);
  const [almacenesList, setAlmacenesList] = useState<string[]>([]);
  const nuevoNombreRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    getUnidades().then((u) => { setUnidadesList(u); setNuevoUnidad((p) => (u.includes(p) ? p : (u[0] ?? 'und'))); }).catch(() => setUnidadesList(['und']));
    getNombresAlmacenes().then((a) => { setAlmacenesList(a); setNuevoAlmacen((p) => (a.includes(p) ? p : (a[0] ?? 'General'))); }).catch(() => setAlmacenesList(['General']));
  }, []);
  // Opciones del selector de producto: se arman SOLO cuando cambia la lista.
  const prodOptions = useMemo(
    () => allProductos.map((p) => ({ value: p.id, label: `${p.sku} · ${p.nombre}` })),
    [allProductos],
  );

  function updateItem(idx: number, patch: Partial<ItemOrden>) {
    setItems((prev) => prev.map((i, k) => (k === idx ? { ...i, ...patch } : i)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, k) => k !== idx));
  }
  function addItem() {
    const p = allProductos.find((x) => x.id === prodSelectId);
    if (!p) return;
    setItems((prev) => prev.some((i) => i.productoId === p.id)
      ? prev.map((i) => (i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i))
      : [...prev, { productoId: p.id, sku: p.sku, nombre: p.nombre, cantidad: 1, precio: 0, unidad: p.unidad, comprar: true }]);
  }

  async function crearProductoNuevo() {
    const nombre = nuevoNombre.trim().toUpperCase();
    if (!nombre) { toast('Escribí el nombre del producto', 'error'); return; }
    setCreandoNuevo(true);
    try {
      const base = nombre.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'PROD';
      // SKU único a prueba de colisiones (igual que en la creación de la OP).
      let sku = '';
      for (let intento = 0; intento < 8; intento++) {
        const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
        const ts = Date.now().toString(36).slice(-4).toUpperCase();
        sku = `NEW-${base}-${ts}${rnd}`;
        if (!(await findBySku(sku))) break;
      }
      const creado = await createProducto({
        sku, nombre,
        categoria: nuevoCategoria.trim().toUpperCase() || 'GENERAL',
        unidad: nuevoUnidad.trim() || 'und',
        stock: 0, stock_min: 0, precio: 0,
        almacen: nuevoAlmacen || 'General',
        estado: 'activo',
      });
      setExtraProductos((prev) => [...prev, creado]);
      setProdSelectId(creado.id);
      setItems((prev) => prev.some((i) => i.productoId === creado.id)
        ? prev
        : [...prev, { productoId: creado.id, sku: creado.sku, nombre: creado.nombre, cantidad: 1, precio: 0, unidad: creado.unidad, comprar: true }]);
      toast(`Producto "${creado.nombre}" creado y añadido · cargá otro o cerrá`, 'success');
      setNuevoNombre('');
      if (nuevoNombreRef.current) { nuevoNombreRef.current.value = ''; nuevoNombreRef.current.focus(); }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el producto', 'error');
    } finally {
      setCreandoNuevo(false);
    }
  }

  async function guardar() {
    if (!items.length) { toast('La OC debe tener al menos un ítem.', 'error'); return; }
    if (!items.some((i) => i.comprar !== false)) { toast('Marcá al menos un ítem a comprar.', 'error'); return; }
    if (items.some((i) => !(i.nombre ?? '').trim())) { toast('El nombre del producto no puede quedar vacío.', 'error'); return; }
    setSaving(true);
    try {
      // Nombres normalizados (trim). Se sincronizan con el inventario abajo.
      const itemsFinal = items.map((i) => ({ ...i, nombre: (i.nombre ?? '').trim() }));
      // Adjunto: si hay archivo nuevo lo subimos; si se pidió quitar, va a null;
      // si no se tocó, queda undefined (sin cambios). Limpiamos el anterior luego.
      let imagenPatch: string | null | undefined = undefined;
      if (imagenFile) imagenPatch = await subirImagenOrden(imagenFile);
      else if (quitarImagen && imagenPathActual) imagenPatch = null;

      await actualizarOrdenEditable(orden, {
        items: itemsFinal,
        motivo: orden.motivo ?? null,
        finalidad: orden.finalidad ?? null,
        solicitante: solicitante.trim() || null,
        ci_solicitante: ciSolicitante.trim() || null,
        unidad_solicitante: unidadSol.trim().toUpperCase() || null,
        clasificacion: clasifSel,
        urgente,
        notas: notas.trim() || null,
        imagen_path: imagenPatch,
      }, actorEmail || 'sistema');

      // Si reemplazamos o quitamos, borramos el archivo anterior del bucket (best-effort).
      if (imagenPatch !== undefined && imagenPathActual && imagenPathActual !== imagenPatch) {
        await eliminarImagenOrden(imagenPathActual);
      }

      // Sincroniza con el inventario el nombre de los productos que cambiaron.
      const origPorPid = new Map(orden.items.map((i) => [i.productoId, i.nombre]));
      const cambiados = itemsFinal.filter((i) => i.productoId && i.nombre && i.nombre !== origPorPid.get(i.productoId));
      if (cambiados.length) {
        const res = await Promise.allSettled(cambiados.map((i) => updateProducto(i.productoId!, { nombre: i.nombre })));
        const fallos = res.filter((r) => r.status === 'rejected').length;
        if (fallos) toast(`OC actualizada, pero ${fallos} nombre(s) no se pudo sincronizar con inventario.`, 'error');
        else toast(`Nombre sincronizado con inventario (${cambiados.length}).`, 'success');
      }
      if (orden.estado === 'confirmada_metodo') {
        notify(`OC ${orden.codigo} modificada · vuelve a aprobación del Gerente General`, 'warning', { link: '#/app/pedidos' });
      } else {
        notify(`${orden.estado === 'pendiente' ? 'Solicitud de pedido' : 'OC'} ${orden.codigo} modificada`, 'success', { link: '#/app/pedidos' });
      }
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo modificar la OC', 'error'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    </>
  );

  const esOp = orden.estado === 'pendiente';
  return (
    <Modal title={`Editar ${esOp ? 'solicitud de pedido' : 'orden'} · ${orden.oc_codigo ?? orden.codigo}`} size="lg" onClose={onClose} footer={footer}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.8rem' }}>
        Modificá solicitante, unidad, ítems, clasificación y urgencia. {esOp
          ? 'Disponible mientras la solicitud de pedido esté pendiente (antes de aprobarla).'
          : 'Disponible hasta que el Gerente General apruebe la OC.'}
      </p>
      {Number(orden.total) > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning, #f59e0b)', marginBottom: '.6rem', fontSize: '.8rem' }}>
          ⚠ Esta orden ya tiene una oferta con precio elegida. Si cambiás los ítems o cantidades, deberás <strong>volver a evaluar la oferta</strong> para recalcular el monto.
        </div>
      )}

      {/* Cabecera editable de la OP: unidad, código (solo lectura), solicitante y cédula. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Unidad solicitante</label>
          <SearchSelect value={unidadSol} onChange={(v) => setUnidadSol(v.toUpperCase())}
            options={unidadOpciones.map((u) => ({ value: u, label: u }))}
            placeholder="Departamento / unidad que solicita" />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Código</label>
          <input className="input mono" value={orden.oc_codigo ?? orden.codigo} readOnly disabled />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', marginTop: '.35rem' }}>
        <input className="input" style={{ flex: 1 }} value={nuevaUnidad}
          onChange={(e) => setNuevaUnidad(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarUnidadNueva(); } }}
          placeholder="¿No está? Escribí la unidad nueva…" disabled={addingUnidad} />
        <button type="button" className="btn btn-ghost" onClick={() => void agregarUnidadNueva()} disabled={addingUnidad}>
          {addingUnidad ? '…' : '+ Añadir'}
        </button>
      </div>
      <small className="muted" style={{ display: 'block', marginBottom: '.6rem' }}>
        La unidad nueva queda guardada en el catálogo (Categorías → Unidad solicitante).
      </small>

      <div className="form-row">
        <label>Solicitante</label>
        <input className="input" value={solicitante} onChange={(e) => setSolicitante(e.target.value)}
          placeholder="Nombre de la persona que solicita" />
      </div>

      <div className="form-row">
        <label>Cédula del solicitante</label>
        <input className="input mono" value={ciSolicitante} onChange={(e) => setCiSolicitante(e.target.value)}
          placeholder="C.I. del solicitante (opcional)" />
      </div>

      <div className="form-row">
        <label>Productos solicitados</label>
        <small className="muted" style={{ marginBottom: '.35rem' }}>Marcá los artículos a comprar e indicá la finalidad de cada uno. Los desmarcados quedan en la solicitud pero no se cotizan.</small>
        <div className="line-picker head" style={{ gridTemplateColumns: '34px 2fr 130px 40px' }}>
          <div title="Comprar">✓</div><div>Producto</div><div>Cantidad</div><div></div>
        </div>
        {/* Scroll propio: muchos productos (sin tope) sin empujar el buscador «+ Añadir». */}
        <div style={{ maxHeight: 'min(42vh, 360px)', overflowY: 'auto', paddingRight: '.2rem' }}>
          {!items.length && <div className="muted" style={{ fontSize: '.84rem', padding: '.4rem 0' }}>Sin ítems. Añadí al menos uno.</div>}
          {items.map((it, idx) => {
            const comprar = it.comprar !== false;
            return (
              <div key={`${it.sku}-${idx}`} style={{ opacity: comprar ? 1 : 0.5, marginBottom: '.4rem' }}>
                <div className="line-picker" style={{ gridTemplateColumns: '34px 2fr 130px 40px', marginBottom: 0 }}>
                  <input type="checkbox" checked={comprar} title={comprar ? 'Se comprará' : 'No se comprará'}
                    onChange={(e) => updateItem(idx, { comprar: e.target.checked })} style={{ alignSelf: 'center' }} />
                  <div>
                    {/* Nombre editable: al guardar se sincroniza con el inventario. */}
                    <input className="input" style={{ width: '100%', fontSize: '.84rem' }}
                      value={it.nombre}
                      title="Editar nombre del producto (se actualiza también en el inventario)"
                      onChange={(e) => updateItem(idx, { nombre: e.target.value })} />
                    <div className="muted mono" style={{ fontSize: '.72rem', marginTop: '.15rem' }}>{it.sku}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                    <input className="input mono" type="number" min={0} step="any" style={{ flex: 1, minWidth: 0 }}
                      value={cantEdit[it.sku] ?? String(it.cantidad)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setCantEdit((m) => ({ ...m, [it.sku]: raw }));
                        const n = Number(raw.replace(',', '.'));
                        if (raw !== '' && Number.isFinite(n) && n > 0) updateItem(idx, { cantidad: n });
                      }}
                      onBlur={() => {
                        const n = Number((cantEdit[it.sku] ?? String(it.cantidad)).replace(',', '.'));
                        const val = Number.isFinite(n) && n > 0 ? n : 1;
                        updateItem(idx, { cantidad: val });
                        setCantEdit((m) => ({ ...m, [it.sku]: String(val) }));
                      }} />
                    {it.unidad && <span className="muted mono" style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>{it.unidad}</span>}
                  </div>
                  <button type="button" className="rm" title="Quitar" onClick={() => removeItem(idx)}>✕</button>
                </div>
                {comprar && (
                  <div style={{ marginLeft: 34, display: 'grid', gap: '.3rem', marginTop: '.3rem' }}>
                    <input className="input" style={{ width: '100%', fontSize: '.82rem' }}
                      placeholder="Finalidad de este producto (¿para qué se compra?)"
                      defaultValue={it.finalidad ?? ''} onChange={(e) => updateItem(idx, { finalidad: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem' }}>
          <SearchSelect style={{ flex: 1 }} value={prodSelectId} onChange={setProdSelectId}
            options={prodOptions}
            placeholder="Buscar producto por nombre o SKU…" emptyText="Ningún producto coincide" />
          <button type="button" className="btn btn-ghost" onClick={addItem}>+ Añadir</button>
        </div>

        <div style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNuevoOpen((v) => !v)}>
            {nuevoOpen ? '× Cerrar' : '+ Producto nuevo (no existe en inventario)'}
          </button>
          {nuevoOpen && (
            <div className="card" style={{ padding: '.65rem', marginTop: '.4rem', display: 'grid', gap: '.5rem' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>
                Datos mínimos. Se crea en inventario y lo completás luego (stock, precio…).
              </div>
              <input
                ref={nuevoNombreRef}
                className="input"
                name="op-edit-nuevo-nombre"
                placeholder="Nombre del producto *"
                defaultValue={nuevoNombre}
                onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevoNombre(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crearProductoNuevo(); } }}
              />
              <div className="form-grid">
                <input className="input" name="op-edit-nuevo-categoria" placeholder="Categoría" defaultValue={nuevoCategoria} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevoCategoria(e.target.value); }} />
                <div className="form-row" style={{ margin: 0 }}>
                  <SearchSelect value={nuevoUnidad} onChange={setNuevoUnidad}
                    placeholder="🔍 Unidad…" options={unidadesList.map((u) => ({ value: u, label: u }))} />
                </div>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <label style={{ fontSize: '.74rem' }}>Almacén / sub-almacén destino</label>
                <SearchSelect value={nuevoAlmacen} onChange={setNuevoAlmacen}
                  placeholder="🔍 Buscar almacén…" options={almacenesList.map((a) => ({ value: a, label: a }))} />
              </div>
              <div>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void crearProductoNuevo()} disabled={creandoNuevo}>
                  {creandoNuevo ? 'Creando…' : 'Crear y añadir a la solicitud'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clasificación y urgencia de la OP. */}
      <div className="form-row">
        <label>Clasificación</label>
        {clasifOpciones.length === 0 ? (
          <small className="muted">No hay clasificaciones en el catálogo.</small>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {clasifOpciones.map((c) => {
              const on = clasifSel.includes(c);
              return (
                <button type="button" key={c} className={`btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleClasif(c)}>
                  {on ? '✓ ' : ''}{c}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <label
        style={{
          display: 'flex', alignItems: 'center', gap: '.6rem', cursor: 'pointer',
          padding: '.7rem .9rem', borderRadius: 8, marginBottom: '.4rem',
          border: `1px solid ${urgente ? 'var(--danger)' : 'var(--border)'}`,
          background: urgente ? 'rgba(220,53,69,.12)' : 'transparent',
        }}
      >
        <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
        <span style={{ fontWeight: 700, letterSpacing: '.02em', color: urgente ? 'var(--danger)' : 'inherit' }}>🚨 ORDEN: URGENTE</span>
        <span className="muted" style={{ fontSize: '.76rem' }}>Marca la orden como prioritaria (se refleja en el PDF y en toda la trazabilidad).</span>
      </label>

      <div className="form-row">
        <label>Nota <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
        <textarea className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)}
          placeholder="Cualquier observación o aclaratoria sobre la solicitud (opcional)…" />
      </div>

      {/* Adjunto de la OP (imagen o PDF): ver el actual, reemplazarlo o quitarlo. */}
      <div className="form-row">
        <label>Imagen / PDF adjunto <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
        {imagenPathActual && !imagenFile && !quitarImagen && (
          <div style={{ marginBottom: '.4rem', display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <OpImagenAdjunta path={imagenPathActual} />
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setQuitarImagen(true)}>Quitar adjunto</button>
          </div>
        )}
        {quitarImagen && !imagenFile && (
          <div style={{ marginBottom: '.4rem', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <span className="muted" style={{ fontSize: '.82rem' }}>Se quitará el adjunto al guardar.</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQuitarImagen(false)}>Deshacer</button>
          </div>
        )}
        <input
          className="input"
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => { setImagenFile(e.target.files?.[0] ?? null); setQuitarImagen(false); }}
        />
        {imagenFile && (
          <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
            📎 {imagenFile.name} ({(imagenFile.size / 1024).toFixed(0)} KB){imagenPathActual ? ' · reemplazará al adjunto actual' : ''}
            {' '}<button type="button" className="btn btn-sm btn-ghost" onClick={() => setImagenFile(null)}>Cancelar</button>
          </small>
        )}
        <small className="muted" style={{ display: 'block', marginTop: '.2rem' }}>
          Imagen o PDF · máximo 10 MB. {imagenPathActual ? 'Subir uno nuevo reemplaza el actual.' : 'Sin adjunto por ahora.'}
        </small>
      </div>
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
          name="motivo"
          defaultValue={motivo}
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
