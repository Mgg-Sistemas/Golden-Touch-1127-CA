import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { notify } from '@/shared/lib/notify';
import { dateTime, money, num, dosDecimales } from '@/shared/lib/format';
import { descargarCompraDirectaPdf } from './compraDirectaPdf';
import type { Caja, Producto, CajaSaldo, CuentaCaja, Proveedor, OrigenProveedor } from '@/shared/lib/types';
import { getCategorias, getUnidades, listProductos, addCategoria, addUnidad } from '@/modules/inventario/inventario.repository';
import { getNombresAlmacenes } from '@/modules/inventario/almacenes.repository';
import { listCajasActivas } from '@/modules/salidas/cajas.repository';
import { list as listProveedores, insert as crearProveedor } from '@/modules/proveedores/proveedores.repository';
import { PREFIJOS_RIF, partirRif } from '@/shared/lib/rif';
import { saldosDeCaja, listSaldos, round2 } from '@/modules/tesoreria/cajaSaldos.repository';
import { getTasaHoy, getTasasMercado, type TasasMercado } from '@/modules/tesoreria/tasas.repository';
import { listCategoriasGasto, soloCategorias, subcategoriasDe, type CategoriaGasto } from '@/modules/tesoreria/categoriasGasto.repository';
import {
  crearCompraDirecta, enviarCompraAPagar, pagarCompraDirecta,
  eliminarCompraDirecta, listComprasDirectas, reabrirCompraDirecta, editarCompraDirectaEnProceso,
  urlAdjuntoCompra, type CompraDirecta, type CompraDirectaItem, type LineaCompra, type PagoLeg,
} from './compras.repository';
import { agregarAdjuntoDirecto } from './adjuntosDirectos.repository';
import { FacturasDirectas } from './FacturasDirectas';

type Vista = 'kanban' | 'lista';

const COLS: { key: CompraDirecta['estado']; label: string }[] = [
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'por_pagar', label: 'Por pagar' },
  { key: 'finalizada', label: 'Finalizada' },
];
const ESTADO_LABEL: Record<string, string> = { en_proceso: '⏳ En proceso', por_pagar: '🧾 Por pagar', finalizada: '🏁 Finalizada' };

function montoCaja(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

export function CompraDirectaView({ actor, actorName }: { actor: string; actorName?: string | null }) {
  const [compras, setCompras] = useState<CompraDirecta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('kanban');
  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState<CompraDirecta | null>(null);
  const [montar, setMontar] = useState<CompraDirecta | null>(null);
  const [eliminar, setEliminar] = useState<CompraDirecta | null>(null);
  const [reabrir, setReabrir] = useState<CompraDirecta | null>(null);
  const [reabriendo, setReabriendo] = useState(false);
  const [ver, setVer] = useState<CompraDirecta | null>(null);

  const reload = useCallback(async () => {
    const [cs, pds, alms, cats, unis, cjs, provs] = await Promise.all([
      listComprasDirectas(), listProductos(), getNombresAlmacenes(), getCategorias(), getUnidades(), listCajasActivas(), listProveedores(),
    ]);
    setCompras(cs); setProductos(pds); setAlmacenes(alms); setCategorias(cats); setUnidades(unis); setCajas(cjs); setProveedores(provs);
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().catch(() => { /* RLS/red */ }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  // Realtime multiusuario: las compras directas se reflejan al instante. PERO no se
  // recarga mientras hay un modal abierto (crear/editar/montar/pagar…): un refresh a
  // mitad de carga borraba los materiales que se estaban cargando.
  const modalAbiertoRef = useRef(false);
  modalAbiertoRef.current = crear || !!editar || !!montar || !!ver || !!reabrir || !!eliminar;
  useRealtime(['compras_directas', 'productos', 'proveedores'], () => { if (!modalAbiertoRef.current) void reload(); });

  const porEstado = useMemo(() => {
    const m: Record<string, CompraDirecta[]> = { en_proceso: [], por_pagar: [], finalizada: [] };
    compras.forEach((c) => { (m[c.estado] ??= []).push(c); });
    return m;
  }, [compras]);

  async function handlePdf(c: CompraDirecta) {
    try { await descargarCompraDirectaPdf(c); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  async function confirmarEliminar() {
    const c = eliminar;
    if (!c) return;
    try {
      await eliminarCompraDirecta(c);
      notify('Compra directa eliminada', 'success', { link: '#/app/pedidos' });
      setEliminar(null);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar la compra directa', 'error'); }
  }

  async function confirmarReabrir() {
    const c = reabrir;
    if (!c) return;
    setReabriendo(true);
    try {
      await reabrirCompraDirecta(c, actor, actorName);
      notify(`Compra ${c.codigo ?? ''} reabierta · se devolvió el dinero y se revirtió el inventario`, 'success', { link: '#/app/pedidos' });
      setReabrir(null); setVer(null);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo reabrir la compra', 'error'); }
    finally { setReabriendo(false); }
  }

  return (
    <div>
      <div className="filterbar" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-primary" onClick={() => setCrear(true)}>+ Nueva compra directa</button>
        <div className="view-toggle" role="tablist" aria-label="Modo de vista">
          <button className={vista === 'kanban' ? 'active' : ''} onClick={() => setVista('kanban')}>▦ Kanban</button>
          <button className={vista === 'lista' ? 'active' : ''} onClick={() => setVista('lista')}>☰ Lista</button>
        </div>
      </div>

      {loading ? (
        <EmptyState message="Cargando compras directas..." icon="◔" />
      ) : !compras.length ? (
        <EmptyState message="Sin compras directas. Creá la primera con “+ Nueva compra directa”." icon="🛒" />
      ) : vista === 'kanban' ? (
        <div className="kanban">
          {COLS.map((col) => (
            <div key={col.key} className="kanban-col">
              <div className="kanban-col-head"><strong>{col.label}</strong><span className="badge">{porEstado[col.key]?.length ?? 0}</span></div>
              <div className="kanban-col-body">
                {(porEstado[col.key] ?? []).map((c) => (
                  <CompraCard key={c.id} compra={c}
                    onMontar={() => setMontar(c)} onPdf={() => handlePdf(c)} onEliminar={() => setEliminar(c)} onVer={() => setVer(c)} />
                ))}
                {!(porEstado[col.key] ?? []).length && <div className="muted" style={{ padding: '.5rem' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Código</th><th>Material(es)</th><th>Proveedor</th><th>Almacén</th><th>Cant.</th><th>Estado</th><th>Gasto</th><th>Generó</th><th>Creada</th><th>Comprada</th><th></th></tr></thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setVer(c)} title="Ver detalle">
                  <td className="mono">{c.codigo ?? '—'}</td>
                  <td>{c.producto_nombre}{c.items.length > 1 ? <span className="muted"> · {c.items.length} ítems</span> : (c.producto_sku ? <span className="muted"> · {c.producto_sku}</span> : null)}</td>
                  <td>{c.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td>{c.almacen}</td>
                  <td className="mono">{num(c.cantidad)}</td>
                  <td>{ESTADO_LABEL[c.estado] ?? c.estado}</td>
                  <td className="mono">{c.gasto != null ? money(c.gasto) : '—'}</td>
                  <td>{c.actor_name || c.actor || '—'}</td>
                  <td className="muted">{dateTime(c.created_at)}</td>
                  <td className="muted">{c.finalizada_at ? dateTime(c.finalizada_at) : '—'}</td>
                  <td className="actions" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setVer(c)} title="Ver detalle">👁 Ver</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => handlePdf(c)} title="Ver/descargar detalle en PDF">↓ PDF</button>
                    {c.estado === 'en_proceso' && <button className="btn btn-sm btn-primary" onClick={() => setMontar(c)}>Cargar factura y montos</button>}
                    {c.estado === 'por_pagar' && <span className="badge" title="El pago se realiza desde Tesorería">🧾 DIRECTO · por pagar</span>}
                    {c.estado === 'en_proceso' && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setEliminar(c)} title="Eliminar compra directa">🗑 Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(crear || editar) && (
        <CrearCompraModal productos={productos} almacenes={almacenes} categorias={categorias} unidades={unidades} proveedores={proveedores}
          editCompra={editar} actor={actor} actorName={actorName}
          onClose={() => { setCrear(false); setEditar(null); }} onSaved={async () => { setCrear(false); setEditar(null); await reload(); }} />
      )}

      {montar && (
        <FinalizarCompraModal modo="montar" compra={montar} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setMontar(null)} onSaved={async () => { setMontar(null); await reload(); }} />
      )}

      {ver && (
        <CompraDetalleModal compra={ver} actor={actor} onClose={() => setVer(null)} onPdf={() => handlePdf(ver)}
          onReabrir={() => setReabrir(ver)} onEditar={() => { setEditar(ver); setVer(null); }}
          onMontar={() => { setMontar(ver); setVer(null); }} />
      )}

      {eliminar && (
        <ConfirmDialog
          title="Eliminar compra directa"
          message={`¿Eliminar la compra directa "${eliminar.items.length > 1 ? `${eliminar.items.length} materiales` : eliminar.producto_nombre}"? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setEliminar(null)}
        />
      )}

      {reabrir && (
        <ConfirmDialog
          title="Reabrir compra directa"
          message={`¿Reabrir ${reabrir.codigo ?? 'la compra'}? Se devolverá ${reabrir.gasto != null ? money(reabrir.gasto) : 'el dinero'} a la caja y se revertirá la entrada al inventario. Quedará En proceso para editarla.`}
          confirmText={reabriendo ? 'Reabriendo…' : 'Reabrir'}
          onConfirm={confirmarReabrir}
          onCancel={() => setReabrir(null)}
        />
      )}
    </div>
  );
}

function CompraCard({ compra, onMontar, onPdf, onEliminar, onVer }: {
  compra: CompraDirecta; onMontar: () => void; onPdf: () => void; onEliminar: () => void; onVer: () => void;
}) {
  return (
    <div className="card row-selectable" style={{ margin: 0, cursor: 'pointer' }} onClick={onVer} title="Ver detalle">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
        <strong>{compra.producto_nombre}</strong>
        <span className="badge">{num(compra.cantidad)}</span>
      </div>
      {compra.codigo && <div className="mono" style={{ fontSize: '.74rem', color: 'var(--brand, #ff8a00)', marginTop: '.15rem' }}>{compra.codigo}</div>}
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>→ {compra.almacen}</div>
      {compra.proveedor_nombre && <div className="muted" style={{ fontSize: '.74rem', marginTop: '.15rem' }}>🏷 {compra.proveedor_nombre}</div>}
      {compra.items.length > 1 && (
        <ul className="muted" style={{ fontSize: '.72rem', margin: '.35rem 0 0', paddingLeft: '1rem' }}>
          {compra.items.map((it, i) => <li key={i}>{it.producto_nombre} · {num(it.cantidad)}</li>)}
        </ul>
      )}
      <div className="muted" style={{ fontSize: '.72rem', marginTop: '.4rem', lineHeight: 1.5 }}>
        <div>Generó: <strong style={{ color: 'var(--text)' }}>{compra.actor_name || compra.actor || '—'}</strong></div>
        <div>Creada: {dateTime(compra.created_at)}</div>
        {compra.estado === 'finalizada' && <div>Comprada: {compra.finalizada_at ? dateTime(compra.finalizada_at) : '—'}</div>}
      </div>
      {(compra.estado === 'finalizada' || compra.estado === 'por_pagar') && (
        <div style={{ fontSize: '.8rem', marginTop: '.4rem' }} onClick={(e) => e.stopPropagation()}>
          <div>{compra.estado === 'finalizada' ? 'Gasto' : 'A pagar'}: <strong className="mono">{compra.gasto != null ? money(compra.gasto) : '—'}</strong></div>
          <div className="muted"><AdjuntoLink compra={compra} /></div>
        </div>
      )}
      {compra.estado === 'por_pagar' && (
        <div style={{ marginTop: '.4rem' }} onClick={(e) => e.stopPropagation()}>
          <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#1a1a1a' }}>DIRECTO</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-ghost" onClick={onVer} title="Ver detalle">👁 Ver</button>
        <button className="btn btn-sm btn-ghost" onClick={onPdf} title="Ver/descargar detalle en PDF">↓ PDF</button>
        {compra.estado === 'en_proceso' && <button className="btn btn-sm btn-primary" onClick={onMontar}>Cargar factura y montos</button>}
        {compra.estado === 'por_pagar' && <button className="btn btn-sm btn-ghost" onClick={onMontar} title="Editar factura, montos y nota (antes de que Tesorería pague)">✏ Editar</button>}
        {compra.estado === 'en_proceso' && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={onEliminar} title="Eliminar compra directa">🗑 Eliminar</button>}
      </div>
    </div>
  );
}

function AdjuntoLink({ compra }: { compra: CompraDirecta }) {
  if (!compra.adjunto_path) return <span className="muted">—</span>;
  async function abrir() {
    try { previewArchivo(await urlAdjuntoCompra(compra.adjunto_path as string), compra.adjunto_nombre || ((compra.adjunto_path as string).split('/').pop() ?? 'adjunto')); }
    catch { toast('No se pudo abrir el adjunto', 'error'); }
  }
  return <button className="btn btn-sm btn-ghost" onClick={abrir} title={compra.adjunto_nombre ?? 'Adjunto'}>📎 PDF</button>;
}

/* ───────── Modal: detalle de la compra directa ───────── */

function CompraDetalleModal({ compra, actor, onClose, onPdf, onReabrir, onEditar, onMontar }: {
  compra: CompraDirecta; actor: string; onClose: () => void; onPdf: () => void; onReabrir: () => void; onEditar: () => void; onMontar: () => void;
}) {
  const total = compra.gasto != null ? Number(compra.gasto) : null;
  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      {compra.estado === 'en_proceso' && <button className="btn btn-ghost" onClick={onEditar} title="Editar materiales / proveedor">✏ Editar</button>}
      {compra.estado === 'por_pagar' && <button className="btn btn-ghost" onClick={onMontar} title="Editar factura, montos y nota (antes de que Tesorería pague)">✏ Editar</button>}
      {compra.estado === 'finalizada' && <button className="btn btn-ghost" style={{ color: 'var(--warning)' }} onClick={onReabrir} title="Reabrir para editar (revierte caja e inventario)">↺ Reabrir</button>}
      <button className="btn btn-primary" onClick={onPdf}>↓ PDF</button>
    </>
  );
  const fila = (k: string, v: ReactNode) => (
    <div className="detail-row"><div className="k">{k}</div><div className="v">{v}</div></div>
  );
  return (
    <Modal title={`🛒 Compra Directa ${compra.codigo ?? ''}`} size="lg" onClose={onClose} footer={footer}>
      {fila('Código', <span className="mono">{compra.codigo ?? '—'}</span>)}
      {fila('Estado', compra.estado === 'finalizada'
        ? (compra.afecta_inventario === false
            ? '🏁 Finalizada (pagada · no ingresa a inventario)'
            : compra.recepcion_pendiente
              ? '🏁 Pagada · pendiente de recepción en inventario'
              : '🏁 Finalizada (pagada · recibida en inventario)')
        : compra.estado === 'por_pagar' ? '🧾 Por pagar (DIRECTO · espera Tesorería)' : '⏳ En proceso')}
      {fila('Proveedor', compra.proveedor_nombre || '—')}
      {fila('Almacén destino', (compra.recepcion_almacen || compra.almacen) || '—')}
      {compra.estado === 'finalizada' && compra.afecta_inventario !== false && fila('Recepción',
        compra.recepcion_pendiente
          ? <span style={{ color: 'var(--warning)' }}>⏳ Pendiente · el almacenista le da entrada en Inventario → Recepciones</span>
          : <span>📦 Recibida en {compra.recepcion_almacen || compra.almacen}{compra.recepcionada_por_name ? ` · ${compra.recepcionada_por_name}` : ''}{compra.recepcionada_at ? ` · ${dateTime(compra.recepcionada_at)}` : ''}</span>)}
      {fila('Generó (analista)', compra.actor_name || compra.actor || '—')}
      {fila('Creada', dateTime(compra.created_at))}
      {compra.estado === 'finalizada' && fila('Pagada', compra.pagada_at ? dateTime(compra.pagada_at) : (compra.finalizada_at ? dateTime(compra.finalizada_at) : '—'))}
      {compra.estado === 'finalizada' && (compra.pagada_por_name || compra.pagada_por) && fila('Pagó (Tesorería)', compra.pagada_por_name || compra.pagada_por)}
      {compra.estado === 'finalizada' && compra.gasto_categoria && fila('Categoría de gasto', `${compra.gasto_categoria}${compra.gasto_subcategoria ? ` · ${compra.gasto_subcategoria}` : ''}`)}
      {fila('Moneda', compra.moneda === 'Bs' ? 'Bs' : '$ (USD)')}
      {(Number(compra.descuento) || 0) > 0 && fila('Descuento', <span>{Number(compra.descuento).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {compra.moneda === 'Bs' ? 'Bs' : '$'}{(Number(compra.descuento_pct) || 0) > 0 ? ` (${Number(compra.descuento_pct).toLocaleString('es-VE', { maximumFractionDigits: 2 })}%)` : ''} <span className="muted" style={{ fontSize: '.75rem' }}>(restado del total)</span></span>)}
      {(Number(compra.iva) || 0) > 0 && fila('IVA (16%)', <span>{Number(compra.iva).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs <span className="muted" style={{ fontSize: '.75rem' }}>(incluido en el total)</span></span>)}
      {(Number(compra.retencion_pct) || 0) > 0 && fila('Retención', <span>{compra.retencion_tipo || 'IVA'} · {Number(compra.retencion_pct).toLocaleString('es-VE', { maximumFractionDigits: 2 })}% = {Number(compra.retencion_monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {compra.moneda === 'Bs' ? 'Bs' : '$'} <span className="muted" style={{ fontSize: '.75rem' }}>(en módulo Retenciones)</span></span>)}
      {fila(compra.estado === 'finalizada' ? 'Gasto total' : 'Total a pagar', total != null ? money(total) : '—')}
      {compra.estado === 'finalizada' && (Number(compra.comision_bancaria) || 0) > 0 && fila('Comisión bancaria', <span>{money(Number(compra.comision_bancaria))} <span className="muted" style={{ fontSize: '.75rem' }}>(gasto aparte · no suma a la factura)</span></span>)}
      {compra.nota && fila('Nota', <span style={{ whiteSpace: 'pre-wrap' }}>{compra.nota}</span>)}
      {compra.adjunto_path && fila('Comprobante', <AdjuntoLink compra={compra} />)}

      <div className="table-wrap" style={{ marginTop: '.6rem' }}>
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr>
            <th>Material</th>
            <th style={{ textAlign: 'right' }}>Cant.</th>
            <th style={{ textAlign: 'right' }}>Costo unit.</th>
            <th style={{ textAlign: 'right' }}>Precio</th>
          </tr></thead>
          <tbody>
            {compra.items.map((it, i) => {
              const cant = Number(it.cantidad) || 0;
              const g = it.gasto != null ? Number(it.gasto) : null;
              const cu = g != null && cant > 0 ? g / cant : null;
              return (
                <tr key={i}>
                  <td>{it.producto_nombre}{it.producto_sku ? <span className="muted"> · {it.producto_sku}</span> : null}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(cant)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{cu != null ? money(cu) : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{g != null ? money(g) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {total != null && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>TOTAL</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <FacturasDirectas modulo="compra" refId={compra.id} actor={actor} />
    </Modal>
  );
}

/* ───────── Modal: nueva compra (varios materiales) ───────── */

interface LineaUI { id: number; modo: 'existente' | 'nuevo'; productoId: string; nombre: string; categoria: string; unidad: string; cantidad: string }

function CrearCompraModal({ productos, almacenes, categorias, unidades, proveedores, editCompra, actor, actorName, onClose, onSaved }: {
  productos: Producto[]; almacenes: string[]; categorias: string[]; unidades: string[]; proveedores: Proveedor[];
  editCompra?: CompraDirecta | null; actor: string; actorName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const esEdicion = !!editCompra;
  const alms = almacenes.length ? almacenes : ['General'];
  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const provActivos = useMemo(() => proveedores.filter((p) => p.estado === 'activo'), [proveedores]);
  // Categorías y medidas editables: se pueden dar de alta nuevas en el momento (igual que en inventario).
  const [cats, setCats] = useState<string[]>(categorias);
  const [nuevaCat, setNuevaCat] = useState<Record<number, string>>({});
  const [unis, setUnis] = useState<string[]>(unidades);
  const [nuevaUni, setNuevaUni] = useState<Record<number, string>>({});
  const nuevaLinea = (id: number): LineaUI => ({
    id, modo: activos.length ? 'existente' : 'nuevo', productoId: activos[0]?.id ?? '',
    nombre: '', categoria: cats[0] ?? '', unidad: activos[0]?.unidad || unis[0] || 'und', cantidad: '1',
  });
  // Al editar: precarga los renglones existentes de la compra (todos materiales del inventario).
  const lineasIniciales = (): LineaUI[] => {
    if (!editCompra || !editCompra.items.length) return [nuevaLinea(1)];
    return editCompra.items.map((it, i) => {
      const p = productos.find((x) => x.id === it.producto_id) ?? null;
      return { id: i + 1, modo: 'existente' as const, productoId: it.producto_id, nombre: '', categoria: cats[0] ?? '', unidad: p?.unidad || unis[0] || 'und', cantidad: String(it.cantidad) };
    });
  };
  const [lineas, setLineas] = useState<LineaUI[]>(lineasIniciales);
  const [almacen, setAlmacen] = useState(editCompra?.almacen || alms[0]);
  // Nota NO controlada (defaultValue + ref): un refresh de realtime no debe pisar
  // lo que se está tecleando (bug «borra palabras»). El valor se lee en el submit.
  const notaRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Proveedor (opcional): se elige del directorio o se da de alta en el momento.
  const [proveedorId, setProveedorId] = useState(editCompra?.proveedor_id ?? '');
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [provRazon, setProvRazon] = useState('');
  const [provRif, setProvRif] = useState('J-');
  const [provTelefono, setProvTelefono] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provOrigen, setProvOrigen] = useState<OrigenProveedor>('nacional');
  const rifPartes = partirRif(provRif);

  function set(id: number, patch: Partial<LineaUI>) { setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))); }
  // Id garantizado único (max + 1): evita colisiones de key que podrían fusionar/perder renglones.
  function add() { setLineas((ls) => [...ls, nuevaLinea(ls.reduce((m, l) => Math.max(m, l.id), 0) + 1)]); }
  function quitar(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  // Alta de categoría en línea (se guarda en el catálogo de inventario y queda seleccionada en el renglón).
  async function handleAddCategoria(lineId: number) {
    const clean = (nuevaCat[lineId] ?? '').trim();
    if (!clean) { toast('Escribe un nombre para la categoría', 'error'); return; }
    const existente = cats.find((c) => c.toLowerCase() === clean.toLowerCase());
    if (existente) {
      set(lineId, { categoria: existente });
      setNuevaCat((m) => ({ ...m, [lineId]: '' }));
      toast(`La categoría "${existente}" ya existe — seleccionada`, 'info');
      return;
    }
    try {
      const added = await addCategoria(clean);
      if (!added) return;
      setCats((prev) => (prev.some((c) => c.toLowerCase() === added.toLowerCase()) ? prev : [...prev, added].sort((a, b) => a.localeCompare(b, 'es'))));
      set(lineId, { categoria: added });
      setNuevaCat((m) => ({ ...m, [lineId]: '' }));
      toast(`Categoría "${added}" añadida`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo añadir la categoría', 'error'); }
  }

  // Alta de medida/unidad en línea (se guarda en el catálogo de inventario y queda seleccionada en el renglón).
  async function handleAddUnidad(lineId: number) {
    const clean = (nuevaUni[lineId] ?? '').trim();
    if (!clean) { toast('Escribe una medida', 'error'); return; }
    const existente = unis.find((u) => u.toLowerCase() === clean.toLowerCase());
    if (existente) {
      set(lineId, { unidad: existente });
      setNuevaUni((m) => ({ ...m, [lineId]: '' }));
      toast(`La medida "${existente}" ya existe — seleccionada`, 'info');
      return;
    }
    try {
      const added = await addUnidad(clean);
      if (!added) return;
      setUnis((prev) => (prev.some((u) => u.toLowerCase() === added.toLowerCase()) ? prev : [...prev, added].sort((a, b) => a.localeCompare(b, 'es'))));
      set(lineId, { unidad: added });
      setNuevaUni((m) => ({ ...m, [lineId]: '' }));
      toast(`Medida "${added}" añadida`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo añadir la medida', 'error'); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const payload: LineaCompra[] = [];
    for (const l of lineas) {
      const cant = Number(l.cantidad) || 0;
      if (cant <= 0) { setError('Cada material debe tener cantidad mayor que 0.'); return; }
      if (l.modo === 'existente') {
        if (!l.productoId) { setError('Elegí el material en cada renglón.'); return; }
        payload.push({ modo: 'existente', productoId: l.productoId, cantidad: cant, unidad: l.unidad });
      } else {
        if (!l.nombre.trim()) { setError('Indicá el nombre del material nuevo.'); return; }
        payload.push({ modo: 'nuevo', nombre: l.nombre, categoria: l.categoria, unidad: l.unidad, cantidad: cant });
      }
    }
    // Validación del proveedor nuevo (si se eligió darlo de alta ahora).
    if (nuevoProveedor) {
      if (!provRazon.trim() || !rifPartes.numero) { setError('Razón social y RIF (con número) son obligatorios para el nuevo proveedor.'); return; }
      const emailClean = provEmail.trim();
      if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) { setError('El correo del proveedor no tiene un formato válido.'); return; }
    }
    const nota = notaRef.current?.value ?? '';
    setSaving(true);
    try {
      // Resolver proveedor: existente del directorio o alta en línea (se guarda en `proveedores`).
      let proveedorIdFinal: string | null = null;
      let proveedorNombreFinal: string | null = null;
      if (nuevoProveedor) {
        const creado = await crearProveedor({
          razon_social: provRazon.trim().toUpperCase(),
          rif: `${rifPartes.letra}-${rifPartes.numero}`,
          contacto: null,
          telefono: provTelefono.trim() || null,
          email: provEmail.trim() || null,
          direccion: null,
          categorias: [],
          origen: provOrigen,
          estado: 'activo',
        });
        proveedorIdFinal = creado.id;
        proveedorNombreFinal = creado.razon_social;
        notify(`Proveedor "${creado.razon_social}" registrado`, 'success', { link: '#/app/proveedores' });
      } else if (proveedorId) {
        proveedorIdFinal = proveedorId;
        proveedorNombreFinal = provActivos.find((p) => p.id === proveedorId)?.razon_social ?? null;
      }
      if (esEdicion && editCompra) {
        const edit = await editarCompraDirectaEnProceso({ compra: editCompra, lineas: payload, almacen, proveedorId: proveedorIdFinal, proveedorNombre: proveedorNombreFinal, nota, actor, actorName }, productos);
        notify(`Compra directa ${edit.codigo ?? ''} actualizada · ${payload.length} material(es)`, 'success', { link: '#/app/pedidos' });
      } else {
        const creada = await crearCompraDirecta({ lineas: payload, almacen, proveedorId: proveedorIdFinal, proveedorNombre: proveedorNombreFinal, nota, actor, actorName }, productos);
        notify(`Compra directa ${creada.codigo ?? ''} creada · ${payload.length} material(es)`, 'success', { link: '#/app/pedidos' });
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear la compra directa.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cd-form" className="btn btn-primary" disabled={saving}>{saving ? (esEdicion ? 'Guardando…' : 'Creando…') : (esEdicion ? 'Guardar cambios' : 'Crear compra directa')}</button>
    </>
  );

  return (
    <Modal title={esEdicion ? `Editar compra directa ${editCompra?.codigo ?? ''}` : 'Nueva compra directa'} size="lg" onClose={onClose} footer={footer}>
      <form id="cd-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-row">
          <label>Almacén destino</label>
          <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} style={{ maxWidth: 280 }}>
            {alms.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Proveedor (opcional): buscador del directorio + alta en línea. */}
        <div className="form-row">
          <label>Proveedor <span className="muted">(opcional)</span></label>
          {!nuevoProveedor ? (
            <>
              <SearchSelect value={proveedorId} onChange={setProveedorId} style={{ maxWidth: 360 }}
                placeholder={provActivos.length ? '🔍 Buscar proveedor…' : '— sin proveedores —'}
                options={provActivos.map((p) => ({ value: p.id, label: `${p.razon_social}${p.rif ? ` · ${p.rif}` : ''}` }))} />
              <small className="muted">
                {proveedorId
                  ? <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .3rem' }} onClick={() => setProveedorId('')}>✕ Quitar proveedor</button>
                  : <>¿No está? <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .3rem' }} onClick={() => setNuevoProveedor(true)}>＋ Agregar proveedor nuevo</button> (se guarda en el directorio)</>}
              </small>
            </>
          ) : (
            <div className="card" style={{ background: 'var(--bg-2)', padding: '.85rem', marginTop: '.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                <strong style={{ fontSize: '.88rem' }}>Nuevo proveedor</strong>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNuevoProveedor(false)} title="Elegir uno existente">↩ Elegir existente</button>
              </div>
              <div className="form-grid">
                <div className="form-row">
                  <label>Razón social *</label>
                  <input className="input" name="prov-razon" defaultValue={provRazon} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setProvRazon(e.target.value); }} placeholder="Nombre del proveedor" />
                </div>
                <div className="form-row">
                  <label>RIF *</label>
                  <div style={{ display: 'flex', gap: '.4rem' }}>
                    <select className="select" value={rifPartes.letra} onChange={(e) => setProvRif(`${e.target.value}-${rifPartes.numero}`)}
                      style={{ width: 'auto', flex: '0 0 auto' }} aria-label="Tipo de RIF">
                      {PREFIJOS_RIF.map((p) => <option key={p.letra} value={p.letra}>{p.letra} · {p.desc}</option>)}
                    </select>
                    <input className="input mono" name="prov-rif-num" defaultValue={rifPartes.numero}
                      onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); e.target.value = v; setProvRif(`${rifPartes.letra}-${v}`); }}
                      placeholder="40778442" inputMode="numeric" style={{ flex: 1 }} />
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-row">
                  <label>Teléfono</label>
                  <input className="input" name="prov-telefono" inputMode="numeric" defaultValue={provTelefono}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 15); e.target.value = v; setProvTelefono(v); }} maxLength={15} placeholder="Solo dígitos" />
                </div>
                <div className="form-row">
                  <label>Email</label>
                  <input className="input" type="email" name="prov-email" defaultValue={provEmail} onChange={(e) => setProvEmail(e.target.value)} placeholder="correo@dominio.com" />
                </div>
                <div className="form-row">
                  <label>Origen</label>
                  <select className="select" value={provOrigen} onChange={(e) => setProvOrigen(e.target.value as OrigenProveedor)}>
                    <option value="nacional">Nacional</option>
                    <option value="internacional">Internacional</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {lineas.map((l, idx) => (
          <div key={l.id} className="card" style={{ margin: '0 0 .6rem', padding: '.7rem .85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <div className="view-toggle" role="tablist" style={{ margin: 0 }}>
                <button type="button" className={l.modo === 'existente' ? 'active' : ''} onClick={() => set(l.id, { modo: 'existente' })}>📦 Inventario</button>
                <button type="button" className={l.modo === 'nuevo' ? 'active' : ''} onClick={() => set(l.id, { modo: 'nuevo' })}>＋ Nuevo</button>
              </div>
              {lineas.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitar(l.id)} title="Quitar material">✕</button>}
            </div>

            {l.modo === 'existente' ? (
              <div className="form-grid">
                <div className="form-row">
                  <label>Material #{idx + 1}</label>
                  <SearchSelect value={l.productoId} onChange={(v) => { const p = activos.find((x) => x.id === v); set(l.id, { productoId: v, unidad: p?.unidad || l.unidad }); }} disabled={!activos.length}
                    placeholder={activos.length ? '🔍 Buscar material…' : '— sin materiales —'}
                    options={activos.map((p) => ({ value: p.id, label: `${p.nombre} · ${p.sku}` }))} />
                </div>
                <div className="form-row">
                  <label>Unidad / medida</label>
                  <select className="select" value={l.unidad} onChange={(e) => set(l.id, { unidad: e.target.value })} disabled={!l.productoId}>{unis.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                  <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
                    <input className="input" style={{ flex: 1 }} placeholder="Nueva medida…" value={nuevaUni[l.id] ?? ''}
                      onChange={(e) => setNuevaUni((m) => ({ ...m, [l.id]: e.target.value.toUpperCase() }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUnidad(l.id); } }} maxLength={20} disabled={!l.productoId} />
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleAddUnidad(l.id)} disabled={!l.productoId}>+ Añadir</button>
                  </div>
                  <small className="muted">Si cambia, se actualiza la medida del producto en inventario.</small>
                </div>
                <div className="form-row">
                  <label>Cantidad</label>
                  <input className="input mono" name={`linea-cant-${l.id}`} type="number" min={1} step="any" value={l.cantidad} onChange={(e) => set(l.id, { cantidad: e.target.value })} required />
                </div>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label>Descripción del material nuevo</label>
                  <input className="input" name={`linea-nombre-${l.id}`} defaultValue={l.nombre} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); set(l.id, { nombre: e.target.value }); }} placeholder="Nombre / descripción" />
                  <small className="muted">Se da de alta en el inventario (stock 0, sin precio). SKU automático.</small>
                </div>
                <div className="form-grid">
                  <div className="form-row"><label>Categoría</label>
                    <select className="select" value={l.categoria} onChange={(e) => set(l.id, { categoria: e.target.value })}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
                      <input className="input" style={{ flex: 1 }} placeholder="Nueva categoría…" value={nuevaCat[l.id] ?? ''}
                        onChange={(e) => setNuevaCat((m) => ({ ...m, [l.id]: e.target.value.toUpperCase() }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategoria(l.id); } }} maxLength={40} />
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleAddCategoria(l.id)}>+ Añadir</button>
                    </div></div>
                  <div className="form-row"><label>Unidad / medida</label>
                    <select className="select" value={l.unidad} onChange={(e) => set(l.id, { unidad: e.target.value })}>{unis.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                    <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
                      <input className="input" style={{ flex: 1 }} placeholder="Nueva medida…" value={nuevaUni[l.id] ?? ''}
                        onChange={(e) => setNuevaUni((m) => ({ ...m, [l.id]: e.target.value.toUpperCase() }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUnidad(l.id); } }} maxLength={20} />
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleAddUnidad(l.id)}>+ Añadir</button>
                    </div></div>
                  <div className="form-row"><label>Cantidad</label>
                    <input className="input mono" name={`linea-cant-nuevo-${l.id}`} type="number" min={1} step="any" value={l.cantidad} onChange={(e) => set(l.id, { cantidad: e.target.value })} required /></div>
                </div>
              </>
            )}
          </div>
        ))}

        <button type="button" className="btn btn-sm btn-ghost" onClick={add}>＋ Agregar material</button>

        <div className="form-row" style={{ marginTop: '.75rem' }}>
          <label>Nota / observación <span className="muted">(opcional)</span></label>
          <textarea className="input" rows={2} ref={notaRef} defaultValue={editCompra?.nota ?? ''}
            placeholder="Detalle u observación de esta compra (se muestra en el detalle y el PDF)…" />
        </div>

        <p className="muted" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>En este método no se cargan precios. El gasto por material y la caja se indican al finalizar.</p>
      </form>
    </Modal>
  );
}

/* ───────── Modal: finalizar (gasto por material + caja) ───────── */

export function FinalizarCompraModal({ modo, compra, cajas, actor, actorName, onClose, onSaved }: {
  modo: 'montar' | 'pagar'; compra: CompraDirecta; cajas: Caja[]; actor: string; actorName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const esPago = modo === 'pagar';
  // Si los materiales ENTRAN al inventario al pagar. Se desmarca cuando ya se cargaron
  // a mano (para no duplicar el stock). Por defecto, sí entran.
  const [afectaInventario, setAfectaInventario] = useState(compra.afecta_inventario !== false);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [gastos, setGastos] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    compra.items.forEach((it, i) => { if (it.gasto != null) m[i] = String(it.gasto); });
    return m;
  });
  const [files, setFiles] = useState<File[]>([]);
  // Categoría / subcategoría de gasto (Tesorería): etiqueta el movimiento del egreso.
  const [catsGasto, setCatsGasto] = useState<CategoriaGasto[]>([]);
  const [catId, setCatId] = useState('');
  const [subId, setSubId] = useState('');
  // Comisión bancaria (opcional): egreso extra de la caja, NO suma a la factura.
  const [comision, setComision] = useState('');
  // Moneda de la compra (Bs/$) e IVA (solo suma al total cuando es Bs).
  const [monedaCompra, setMonedaCompra] = useState<'USD' | 'Bs'>(compra.moneda === 'Bs' ? 'Bs' : 'USD');
  const [iva, setIva] = useState(compra.iva ? String(compra.iva) : '');
  // Descuento en % y en monto (se sincronizan entre sí y con el total).
  const [descuentoPct, setDescuentoPct] = useState(compra.descuento_pct ? String(compra.descuento_pct) : '');
  const [descuentoMonto, setDescuentoMonto] = useState(compra.descuento ? String(compra.descuento) : '');
  // Retención (se vincula al módulo Retenciones al pagar).
  const [retTipo, setRetTipo] = useState<'IVA' | 'ISLR' | 'MUNICIPAL'>((compra.retencion_tipo as 'IVA' | 'ISLR' | 'MUNICIPAL') || 'IVA');
  const [retPct, setRetPct] = useState(compra.retencion_pct ? String(compra.retencion_pct) : '');
  // Nota / observación (p. ej. datos de quién cobra). Editable al montar; visible al pagar.
  const notaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { listCategoriasGasto().then(setCatsGasto).catch(() => setCatsGasto([])); }, []);
  const catNombre = catsGasto.find((c) => c.id === catId)?.nombre ?? null;
  const subNombre = catsGasto.find((c) => c.id === subId)?.nombre ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';

  const subtotal = useMemo(
    () => Math.round(compra.items.reduce((a, _it, i) => a + (Number(gastos[i]) || 0), 0) * 100) / 100,
    [gastos, compra.items],
  );
  // Descuento (resta) e IVA (solo suma en Bs). Total = subtotal − descuento + IVA.
  const descuentoNum = Math.min(subtotal, Math.max(0, Math.round((Number(descuentoMonto) || 0) * 100) / 100));
  const ivaNum = monedaCompra === 'Bs' ? Math.max(0, Math.round((Number(iva) || 0) * 100) / 100) : 0;
  const total = Math.round((subtotal - descuentoNum + ivaNum) * 100) / 100;
  // Sincroniza los dos campos de descuento (% ↔ monto) usando el subtotal.
  function onDescPct(v: string) {
    setDescuentoPct(v);
    const p = Number(v) || 0;
    setDescuentoMonto(p > 0 && subtotal > 0 ? String(Math.round(subtotal * p) / 100) : '');
  }
  function onDescMonto(v: string) {
    setDescuentoMonto(v);
    const m = Number(v) || 0;
    setDescuentoPct(m > 0 && subtotal > 0 ? String(Math.round((m / subtotal) * 10000) / 100) : '');
  }
  // Ajustar el TOTAL a mano: se sincroniza restando/quitando descuento (total = subtotal − desc + IVA).
  function onTotal(v: string) {
    const t = Number(v) || 0;
    const desc = Math.max(0, Math.round((subtotal + ivaNum - t) * 100) / 100);
    setDescuentoMonto(desc > 0 ? String(desc) : '');
    setDescuentoPct(desc > 0 && subtotal > 0 ? String(Math.round((desc / subtotal) * 10000) / 100) : '');
  }

  // Saldos multimoneda de la caja elegida (para pagar repartiendo por cuenta/moneda).
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  // Billetera de TODAS las cajas (para mostrar el saldo real en el selector; cajas.saldo suele estar en 0).
  const [saldosTodas, setSaldosTodas] = useState<CajaSaldo[]>([]);
  useEffect(() => { listSaldos().then(setSaldosTodas).catch(() => setSaldosTodas([])); }, []);
  // Saldo a mostrar de una caja: su billetera (en la moneda de la caja), o cajas.saldo si no tiene billetera.
  const saldoMostrar = (c: Caja): number => {
    const rows = saldosTodas.filter((s) => s.caja_id === c.id);
    if (!rows.length) return Number(c.saldo) || 0;
    const enMoneda = rows.filter((r) => r.moneda === c.moneda).reduce((a, r) => a + Number(r.saldo), 0);
    return enMoneda || rows.reduce((a, r) => a + Number(r.saldo), 0);
  };
  const [legMontos, setLegMontos] = useState<Record<string, string>>({});
  const [tasa, setTasa] = useState<number>(0);
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); return; }
    saldosDeCaja(cajaId).then((rows) => setSaldosCaja(rows.filter((r) => Number(r.saldo) > 0))).catch(() => setSaldosCaja([]));
    setLegMontos({});
  }, [cajaId]);
  useEffect(() => { getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* sin tasa */ }); }, []);
  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);

  // Caja con varias monedas (Multimoneda) → se paga repartiendo por cuenta.
  const esMultimoneda = saldosCaja.length >= 2;
  // Conversión entre monedas con la tasa BCV editable (y COP de mercado).
  function legUsd(monedaLeg: string, n: number): number {
    if (!n || n <= 0) return 0;
    if (monedaLeg === 'USD' || monedaLeg === 'USDT') return round2(n);
    if (monedaLeg === 'Bs') return tasa > 0 ? round2(n / tasa) : 0;
    if (monedaLeg === 'COP') return mercado?.copUsd ? round2(n / mercado.copUsd) : 0;
    return round2(n);
  }
  function desdeUsd(monedaLeg: string, usd: number): number {
    if (!usd || usd <= 0) return 0;
    if (monedaLeg === 'USD' || monedaLeg === 'USDT') return round2(usd);
    if (monedaLeg === 'Bs') return round2(usd * tasa);
    if (monedaLeg === 'COP') return mercado?.copUsd ? round2(usd * mercado.copUsd) : 0;
    return round2(usd);
  }
  // Convierte el total (en la MONEDA DE LA COMPRA) a la moneda de una billetera.
  const convertir = (n: number, from: string, to: string): number => (from === to ? round2(n) : desdeUsd(to, legUsd(from, n)));
  // Total objetivo en USD: la compra puede estar en $ o Bs (monedaCompra); si la caja
  // es de otra moneda se paga el equivalente con la tasa editable.
  const totalUsdObjetivo = legUsd(monedaCompra, total);
  const sumUsdMulti = round2(saldosCaja.reduce((a, s) => a + legUsd(s.moneda, Number(legMontos[s.id]) || 0), 0));
  const cubreTotalMulti = sumUsdMulti >= totalUsdObjetivo - 0.01;
  // No se puede pagar más que el total de la compra.
  const excedeTotalMulti = esMultimoneda && sumUsdMulti > totalUsdObjetivo + 0.01;
  const cuentaLabel = (c: string) => c === 'general' ? '' : c === 'juridica' ? ' · Jurídica' : ' · Personal';

  // Equivalentes del total de la COMPRA (en su moneda) a USD y a Bs con la tasa editable.
  const totalUsd = totalUsdObjetivo;
  const totalBs = convertir(total, monedaCompra, 'Bs');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (total <= 0) { setError('Indicá cuánto se gastó en cada material.'); return; }
    if (files.some((f) => f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/'))) { setError('Los adjuntos deben ser PDF o imagen.'); return; }

    // MODO MONTAR (analista): carga factura + montos y deja "Por pagar" (no toca caja ni inventario).
    if (!esPago) {
      const items: CompraDirectaItem[] = compra.items.map((it, i) => ({ ...it, gasto: Number(gastos[i]) || 0 }));
      setSaving(true);
      try {
        for (const f of files) await agregarAdjuntoDirecto('compra', compra.id, f, actor);
        await enviarCompraAPagar({ compra, items, afectaInventario, moneda: monedaCompra, iva: ivaNum, descuento: descuentoNum, descuentoPct: Number(descuentoPct) || 0, retencionTipo: retTipo, retencionBase: subtotal, retencionPct: Number(retPct) || 0, nota: notaRef.current?.value ?? '', actor, actorName });
        notify(`Compra ${compra.codigo ?? ''} enviada a pagar · ${montoCaja(total, 'USD')} · Tesorería`, 'success', { link: '#/app/tesoreria' });
        onSaved();
      } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo enviar a pagar.'); setSaving(false); }
      return;
    }

    // MODO PAGAR (Tesorería): egreso + inventario + finaliza.
    if (!cajaId) { setError('Elegí la caja de la que sale el dinero.'); return; }
    if (catsGasto.length && (!catId || !subId)) { setError('Elegí la categoría y la subcategoría de gasto.'); return; }
    let legs: PagoLeg[] | undefined;
    if (esMultimoneda) {
      legs = saldosCaja
        .map((s) => ({ cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: Number(legMontos[s.id]) || 0 }))
        .filter((l) => l.monto > 0);
      if (!legs.length) { setError('Indicá cuánto pagar en al menos una moneda.'); return; }
      if (excedeTotalMulti) { setError(`No podés pagar más que el total de la compra. Cargado ${montoCaja(sumUsdMulti, 'USD')}, total ${montoCaja(totalUsdObjetivo, 'USD')} (te pasaste por ${montoCaja(round2(sumUsdMulti - totalUsdObjetivo), 'USD')}).`); return; }
      if (!cubreTotalMulti) { setError(`Lo cargado (${montoCaja(sumUsdMulti, 'USD')}) no cubre el total (${montoCaja(totalUsdObjetivo, 'USD')}).`); return; }
    } else if (saldosCaja.length === 1) {
      // Caja de UNA sola moneda con billetera: el dinero vive en caja_saldos (no en cajas.saldo),
      // así que el egreso sale de la billetera real. Si la compra está en OTRA moneda que la
      // billetera (ej. compra en $ y billetera en Bs), se descuenta el EQUIVALENTE con la tasa.
      const s = saldosCaja[0];
      if (monedaCompra !== s.moneda && !(tasa > 0)) { setError('Indicá la tasa (Bs por $) para convertir el total a la moneda de la billetera.'); return; }
      const montoLeg = convertir(total, monedaCompra, s.moneda);
      if (montoLeg > Number(s.saldo) + 0.01) { setError(`Saldo insuficiente en la billetera (${montoCaja(Number(s.saldo), s.moneda)}). Requiere ${montoCaja(montoLeg, s.moneda)}.`); return; }
      legs = [{ cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: montoLeg }];
    }
    setSaving(true);
    try {
      await pagarCompraDirecta({ compra, cajaId, legs, actor, actorName, gastoCategoria: catNombre, gastoSubcategoria: subNombre, comision: Number(comision) || 0 });
      const resumenPago = esMultimoneda ? `multipago ${montoCaja(sumUsdMulti, 'USD')}` : montoCaja(total, monedaCompra);
      notify(`Compra pagada y finalizada · ${resumenPago} desde ${caja?.nombre ?? ''}`, 'success', { link: '#/app/inventario' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar la compra.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      {esPago ? (
        <button type="submit" form="cd-fin-form" className="btn btn-primary" disabled={saving || excedeTotalMulti}>{saving ? 'Pagando…' : excedeTotalMulti ? 'Excede el total' : `💳 Pagar · ${montoCaja(total, monedaCompra)}`}</button>
      ) : (
        <button type="submit" form="cd-fin-form" className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : '🧾 Enviar a pagar'}</button>
      )}
    </>
  );

  return (
    <Modal title={esPago ? `💳 Pagar compra ${compra.codigo ?? ''}` : 'Cargar factura y montos'} size="lg" onClose={onClose} footer={footer}>
      <form id="cd-fin-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Nota de la compra: al PAGAR se muestra resaltada (suele traer los datos de
            quién cobra); a Tesorería le sirve para saber a quién/ cómo pagar. */}
        {esPago && compra.nota?.trim() && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.25rem' }}>📝 Nota de la compra</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{compra.nota}</div>
          </div>
        )}

        {esPago && (
        <div className="form-row">
          <label>Caja (de dónde sale el dinero)</label>
          <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length} style={{ maxWidth: 320 }}
            placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
            options={cajas.map((c) => ({ value: c.id, label: `${c.nombre} · ${montoCaja(saldoMostrar(c), c.moneda)}` }))} />
          <small className="muted">El gasto total se descuenta de esta caja (egreso en Tesorería / registro de movimientos).{esMultimoneda ? ' Es Multimoneda: repartí el pago por moneda abajo.' : ''}</small>
        </div>
        )}

        {/* Categoría / subcategoría de gasto: etiqueta el movimiento en Tesorería,
            igual que el registro de gasto manual. Así el egreso se refleja por
            categoría y subcategoría en los reportes de Tesorería. */}
        {esPago && catsGasto.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="form-row">
              <label>Categoría de gasto</label>
              <SearchSelect value={catId} onChange={(v) => { setCatId(v); setSubId(''); }}
                placeholder="🔍 Categoría…" emptyText="Sin categorías"
                options={soloCategorias(catsGasto).map((c) => ({ value: c.id, label: c.nombre }))} />
            </div>
            <div className="form-row">
              <label>Subcategoría</label>
              <SearchSelect value={subId} onChange={setSubId} disabled={!catId}
                placeholder={catId ? '🔍 Subcategoría…' : '— elegí primero la categoría —'} emptyText="Sin subcategorías"
                options={(catId ? subcategoriasDe(catsGasto, catId) : []).map((c) => ({ value: c.id, label: c.nombre }))} />
            </div>
          </div>
        )}

        {esPago && (
          <div className="form-row">
            <label>Comisión bancaria <span className="muted">(opcional)</span></label>
            <input className="input mono" type="number" min={0} step="any" value={comision}
              onChange={(e) => setComision(e.target.value)} placeholder="0,00" style={{ maxWidth: 200 }} />
            <small className="muted">Se descuenta de la caja como gasto aparte. NO suma al total de la factura ni al costo de los materiales.</small>
          </div>
        )}

        {/* 👛 Billetera de la caja elegida: muestra el/los saldo(s) disponibles. */}
        {esPago && caja && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>👛 Billetera · {caja.nombre}</div>
            {saldosCaja.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {saldosCaja.map((s) => (
                  <span key={s.id} className="badge" style={{ fontSize: '.82rem', padding: '.3rem .55rem' }}>
                    {s.moneda}{cuentaLabel(s.cuenta)}: <strong className="mono">{montoCaja(Number(s.saldo), s.moneda)}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <div>Disponible: <strong className="mono">{montoCaja(Number(caja.saldo), caja.moneda)}</strong></div>
            )}
          </div>
        )}

        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead><tr><th>Material</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ width: 160 }}>Gasto</th><th style={{ textAlign: 'right' }}>Costo unit.</th></tr></thead>
            <tbody>
              {compra.items.map((it, i) => {
                const g = Number(gastos[i]) || 0;
                const cu = it.cantidad > 0 && g > 0 ? g / it.cantidad : 0;
                return (
                  <tr key={i}>
                    <td>{it.producto_nombre}{it.producto_sku ? <span className="muted"> · {it.producto_sku}</span> : null}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(it.cantidad)}</td>
                    <td><input className="input mono" name={`gasto-${i}`} type="number" min={0} step="any" disabled={esPago} defaultValue={gastos[i] ?? ''} onChange={(e) => { e.target.value = dosDecimales(e.target.value); setGastos((m) => ({ ...m, [i]: e.target.value })); }} placeholder="0,00" /></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{montoCaja(cu, moneda)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ margin: '.5rem 0' }}>
          {esPago
            ? <>Total a descontar: <strong className="mono">{montoCaja(total, moneda)}</strong> → entra a inventario en <strong>{compra.almacen}</strong></>
            : <>Total a pagar: <strong className="mono">{money(total)}</strong> · queda <strong>Por pagar</strong>; Tesorería lo abona y entra a inventario en <strong>{compra.almacen}</strong></>}
        </div>

        {/* Conversión del total a Bs con la tasa BCV (editable) — para cualquier caja. */}
        {esPago && cajaId && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>Total en USD</div>
              <strong className="mono" style={{ fontSize: '1.05rem' }}>{tasa > 0 || moneda !== 'Bs' ? montoCaja(totalUsd, 'USD') : '—'}</strong>
            </div>
            <div className="muted" style={{ fontSize: '1.1rem' }}>⇄</div>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>Equivale en Bs (BCV)</div>
              <strong className="mono" style={{ fontSize: '1.05rem' }}>{tasa > 0 || moneda === 'Bs' ? montoCaja(totalBs, 'Bs') : '—'}</strong>
            </div>
            <div className="form-row" style={{ marginLeft: 'auto', minWidth: 150, margin: 0 }}>
              <label style={{ fontSize: '.72rem' }}>Tasa BCV (Bs por $)</label>
              <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
                onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" />
            </div>
          </div>
        )}

        {/* Multipago por cuenta: repartí el total entre las monedas de la caja Multimoneda. */}
        {esPago && esMultimoneda && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Pago por moneda · ¿cuánto sale de cada una?</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.84rem' }}>
                <thead><tr><th>Moneda</th><th style={{ textAlign: 'right' }}>Disponible</th><th style={{ textAlign: 'right' }}>A pagar (en su moneda)</th><th style={{ textAlign: 'right' }}>Equiv. USD</th></tr></thead>
                <tbody>
                  {saldosCaja.map((s) => {
                    const n = Number(legMontos[s.id]) || 0;
                    const excede = n > Number(s.saldo);
                    return (
                      <tr key={s.id}>
                        <td><span className="badge">{s.moneda}</span>{cuentaLabel(s.cuenta)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{montoCaja(Number(s.saldo), s.moneda)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input className="input mono" name={`leg-${s.id}`} type="number" min={0} max={Number(s.saldo)} step="any"
                            defaultValue={legMontos[s.id] ?? ''} placeholder="0,00"
                            onChange={(e) => { e.target.value = dosDecimales(e.target.value); setLegMontos((m) => ({ ...m, [s.id]: e.target.value })); }}
                            style={{ width: 130, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>{n > 0 ? montoCaja(legUsd(s.moneda, n), 'USD') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Cubierto / Total</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: excedeTotalMulti ? 'var(--danger)' : cubreTotalMulti ? 'var(--success)' : 'var(--warning)' }}>
                      {montoCaja(sumUsdMulti, 'USD')} / {montoCaja(total, 'USD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
              {excedeTotalMulti
                ? <span style={{ color: 'var(--danger)' }}>⚠ Te pasaste por <strong>{montoCaja(round2(sumUsdMulti - total), 'USD')}</strong>. No podés pagar más que el total de la compra ({montoCaja(total, 'USD')}).</span>
                : cubreTotalMulti
                ? <>✓ Cubre exactamente el total. Cada moneda se descuenta de su saldo real con la tasa del día.</>
                : <>Faltan <strong>{montoCaja(round2(total - sumUsdMulti), 'USD')}</strong>. Bs↔$ usa la tasa BCV de arriba.</>}
            </small>
          </div>
        )}

        {!esPago && (
          <div className="form-row">
            <label>Moneda de la compra</label>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="select" style={{ maxWidth: 150 }} value={monedaCompra} onChange={(e) => setMonedaCompra(e.target.value === 'Bs' ? 'Bs' : 'USD')}>
                <option value="USD">$ (USD)</option>
                <option value="Bs">Bs</option>
              </select>
              {monedaCompra === 'Bs' && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                  <span className="muted">IVA (16%):</span>
                  <input className="input mono" type="number" min={0} step="any" value={iva} onChange={(e) => setIva(e.target.value)} placeholder="0,00" style={{ width: 130, textAlign: 'right' }} />
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.5rem' }}>
              <span className="muted">Descuento:</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                <input className="input mono" type="number" min={0} step="any" value={descuentoPct} onChange={(e) => onDescPct(e.target.value)} placeholder="0" style={{ width: 90, textAlign: 'right' }} /> %
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                <input className="input mono" type="number" min={0} step="any" value={descuentoMonto} onChange={(e) => onDescMonto(e.target.value)} placeholder="0,00" style={{ width: 130, textAlign: 'right' }} /> {monedaCompra === 'Bs' ? 'Bs' : '$'}
              </label>
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.5rem' }}>
              <span className="muted">Total ajustable:</span>
              <input className="input mono" type="number" min={0} step="any" value={total || ''} onChange={(e) => onTotal(e.target.value)} style={{ width: 150, textAlign: 'right', fontWeight: 700 }} /> {monedaCompra === 'Bs' ? 'Bs' : '$'}
              <span className="muted" style={{ fontSize: '.72rem' }}>ajustá el total y el descuento se sincroniza.</span>
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.5rem' }}>
              <span className="muted">Tasa BCV (Bs/$):</span>
              <input className="input mono" type="number" min={0} step="any" value={tasa || ''} onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" style={{ width: 120, textAlign: 'right' }} />
              <span className="muted" style={{ fontSize: '.8rem' }}>
                {tasa > 0
                  ? <>Equivale a <strong className="mono">{monedaCompra === 'Bs' ? montoCaja(totalUsd, 'USD') : montoCaja(totalBs, 'Bs')}</strong></>
                  : 'cargá la tasa (modificable)'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.5rem' }}>
              <span className="muted">Retención:</span>
              <select className="select" style={{ maxWidth: 140 }} value={retTipo} onChange={(e) => setRetTipo(e.target.value as 'IVA' | 'ISLR' | 'MUNICIPAL')}>
                <option value="IVA">IVA</option>
                <option value="ISLR">ISLR</option>
                <option value="MUNICIPAL">Municipal</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                <input className="input mono" type="number" min={0} step="any" value={retPct} onChange={(e) => setRetPct(e.target.value)} placeholder="0" style={{ width: 90, textAlign: 'right' }} /> %
              </label>
              <span className="muted" style={{ fontSize: '.78rem' }}>
                {(Number(retPct) || 0) > 0 ? <>= <strong className="mono">{montoCaja(Math.round(subtotal * (Number(retPct) || 0)) / 100, monedaCompra)}</strong> · se registra en Retenciones al pagar</> : 'opcional · se vincula al módulo Retenciones al pagar'}
              </span>
            </div>
            <small className="muted">
              Subtotal {montoCaja(subtotal, monedaCompra)}{descuentoNum > 0 ? ` − Desc. ${montoCaja(descuentoNum, monedaCompra)}` : ''}{monedaCompra === 'Bs' && ivaNum > 0 ? ` + IVA ${montoCaja(ivaNum, 'Bs')}` : ''} = <strong>Total {montoCaja(total, monedaCompra)}</strong>{monedaCompra === 'Bs' ? ' · el IVA suma al total solo en Bs.' : '.'}
            </small>
          </div>
        )}

        {!esPago && (
          <div className="form-row">
            <label>Nota / observación <span className="muted">(opcional · se muestra en Tesorería al pagar)</span></label>
            <textarea className="input" rows={2} ref={notaRef} defaultValue={compra.nota ?? ''}
              placeholder="Ej.: pagar a Juan Pérez · Pago Móvil 0414… / cuenta 0102…" />
            <small className="muted">Suele llevar los datos de a quién y cómo pagar; Tesorería lo verá al abonar.</small>
          </div>
        )}

        {!esPago && (
          <div className="form-row">
            <label>Adjuntar facturas · PDF o imagen <span className="muted">(podés elegir varias)</span></label>
            <input className="input" type="file" accept="application/pdf,image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <small className="muted">{files.length} archivo(s): {files.map((f) => f.name).join(', ')}</small>}
            <small className="muted">Podés sumar más facturas después desde el detalle.</small>
          </div>
        )}

        {/* Ingreso al inventario: por defecto sí; se desmarca cuando los materiales ya
            se cargaron a mano (para que el pago no duplique el stock). */}
        {!esPago && (
          <div className="form-row">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={afectaInventario} onChange={(e) => setAfectaInventario(e.target.checked)} />
              Ingresar estos materiales al inventario cuando Tesorería pague
            </label>
            <small className="muted">
              {afectaInventario
                ? 'Al pagar, cada material entra al inventario (stock + costo PMP).'
                : '⚠ No entrarán al inventario al pagar (marcalo así si ya los cargaste a mano, para no duplicar el stock).'}
            </small>
          </div>
        )}
        {esPago && compra.afecta_inventario === false && (
          <div className="card" style={{ borderColor: 'var(--warning, #f59e0b)', margin: '.5rem 0' }}>
            <small>⚠ Esta compra está marcada <strong>«no ingresa al inventario»</strong> (los materiales ya se cargaron a mano). Al pagar solo sale el dinero de la caja; <strong>no se mueve el stock</strong>.</small>
          </div>
        )}
      </form>
    </Modal>
  );
}
