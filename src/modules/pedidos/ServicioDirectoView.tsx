import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect, SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { notify } from '@/shared/lib/notify';
import { dateTime, money, num, dosDecimales, montoMoneda } from '@/shared/lib/format';
import type { Caja, CajaSaldo, CuentaCaja, Proveedor, OrigenProveedor } from '@/shared/lib/types';
import { listCajasActivas } from '@/modules/salidas/cajas.repository';
import { list as listProveedores, insert as crearProveedor } from '@/modules/proveedores/proveedores.repository';
import { listEquipos, type MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';
import { listProductos } from '@/modules/inventario/inventario.repository';
import type { Producto } from '@/shared/lib/types';
import { CATEGORIAS_SERVICIO, listServiciosActivos, addServicioCatalogo, esRecargaGas, TIPOS_RECARGA, CATEGORIA_ELECTRODOMESTICOS, ELECTRODOMESTICOS, esElectrodomestico, type ServicioCatalogo } from './servicios.repository';
import { TIPOS_MANTENIMIENTO } from '@/modules/maquinaria/maquinariaMant.repository';
import { PREFIJOS_RIF, partirRif } from '@/shared/lib/rif';
import { saldosDeCaja, listSaldos, round2 } from '@/modules/tesoreria/cajaSaldos.repository';
import { getTasaHoy, getTasasMercado, type TasasMercado } from '@/modules/tesoreria/tasas.repository';
import { listCategoriasGasto, soloCategorias, subcategoriasDe, type CategoriaGasto } from '@/modules/tesoreria/categoriasGasto.repository';
import {
  crearServicioDirecto, enviarServicioAPagar, pagarServicioDirecto, eliminarServicioDirecto, listServiciosDirectos,
  reabrirServicioDirecto, editarServicioDirectoEnProceso,
  urlAdjuntoServicio, type ServicioDirecto, type ServicioDirectoItem, type LineaServicio, type PagoLeg,
} from './serviciosDirectos.repository';
import { descargarServicioDirectoPdf } from './servicioDirectoPdf';
import { FacturasDirectas } from './FacturasDirectas';
import { agregarAdjuntoDirecto } from './adjuntosDirectos.repository';
import { listActivosPedido, addCatalogoPedido } from './pedidoCatalogos.repository';
import { PagoExternoFields, PAGO_EXTERNO_VACIO, pagoExternoDesdeRow, pagoExternoAInput, type PagoExternoState } from './PagoExternoFields';

type Vista = 'kanban' | 'lista';

const COLS: { key: ServicioDirecto['estado']; label: string }[] = [
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'por_pagar', label: 'Por pagar' },
  { key: 'finalizada', label: 'Finalizada' },
];
const ESTADO_LABEL: Record<string, string> = { en_proceso: '⏳ En proceso', por_pagar: '🧾 Por pagar', finalizada: '🏁 Finalizada' };

function montoCaja(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

export function ServicioDirectoView({ actor, actorName }: { actor: string; actorName?: string | null }) {
  const [servicios, setServicios] = useState<ServicioDirecto[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('kanban');
  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState<ServicioDirecto | null>(null);
  const [finalizar, setFinalizar] = useState<ServicioDirecto | null>(null);
  const [eliminar, setEliminar] = useState<ServicioDirecto | null>(null);
  const [reabrir, setReabrir] = useState<ServicioDirecto | null>(null);
  const [reabriendo, setReabriendo] = useState(false);
  const [ver, setVer] = useState<ServicioDirecto | null>(null);

  const reload = useCallback(async () => {
    const [sd, cjs, provs, eqs] = await Promise.all([
      listServiciosDirectos(), listCajasActivas(), listProveedores(), listEquipos().catch(() => [] as MaquinariaEquipo[]),
    ]);
    setServicios(sd); setCajas(cjs); setProveedores(provs); setEquipos(eqs);
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().catch(() => { /* RLS/red */ }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  useRealtime(['servicios_directos', 'proveedores'], () => { void reload(); });

  const porEstado = useMemo(() => {
    const m: Record<string, ServicioDirecto[]> = { en_proceso: [], por_pagar: [], finalizada: [] };
    servicios.forEach((s) => { (m[s.estado] ??= []).push(s); });
    return m;
  }, [servicios]);

  async function handlePdf(s: ServicioDirecto) {
    try { await descargarServicioDirectoPdf(s); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  async function confirmarEliminar() {
    const s = eliminar;
    if (!s) return;
    try {
      await eliminarServicioDirecto(s);
      notify('Servicio directo eliminado', 'success', { link: '#/app/pedidos' });
      setEliminar(null);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar el servicio directo', 'error'); }
  }

  async function confirmarReabrir() {
    const s = reabrir;
    if (!s) return;
    setReabriendo(true);
    try {
      await reabrirServicioDirecto(s, actor, actorName);
      notify(`Servicio ${s.codigo ?? ''} reabierto · se devolvió el dinero a la caja`, 'success', { link: '#/app/pedidos' });
      setReabrir(null); setVer(null);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo reabrir el servicio', 'error'); }
    finally { setReabriendo(false); }
  }

  return (
    <div>
      <div className="filterbar" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-primary" onClick={() => setCrear(true)}>+ Nuevo servicio directo</button>
        <div className="view-toggle" role="tablist" aria-label="Modo de vista">
          <button className={vista === 'kanban' ? 'active' : ''} onClick={() => setVista('kanban')}>▦ Kanban</button>
          <button className={vista === 'lista' ? 'active' : ''} onClick={() => setVista('lista')}>☰ Lista</button>
        </div>
      </div>

      {loading ? (
        <EmptyState message="Cargando servicios directos..." icon="◔" />
      ) : !servicios.length ? (
        <EmptyState message="Sin servicios directos. Creá el primero con “+ Nuevo servicio directo”." icon="🔧" />
      ) : vista === 'kanban' ? (
        <div className="kanban">
          {COLS.map((col) => (
            <div key={col.key} className="kanban-col">
              <div className="kanban-col-head"><strong>{col.label}</strong><span className="badge">{porEstado[col.key]?.length ?? 0}</span></div>
              <div className="kanban-col-body">
                {(porEstado[col.key] ?? []).map((s) => (
                  <ServicioCard key={s.id} servicio={s} onFinalizar={() => setFinalizar(s)} onEliminar={() => setEliminar(s)} onPdf={() => handlePdf(s)} onVer={() => setVer(s)} />
                ))}
                {!(porEstado[col.key] ?? []).length && <div className="muted" style={{ padding: '.5rem' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Código</th><th>Servicio(s)</th><th>Proveedor</th><th>Equipo</th><th>Estado</th><th>Monto</th><th>Generó</th><th>Creado</th><th>Pagado</th><th></th></tr></thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setVer(s)} title="Ver detalle">
                  <td className="mono">{s.codigo ?? '—'}</td>
                  <td>{s.descripcion}{s.items.length > 1 ? <span className="muted"> · {s.items.length} ítems</span> : null}</td>
                  <td>{s.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td>{s.equipo_nombre || <span className="muted">—</span>}</td>
                  <td>{ESTADO_LABEL[s.estado] ?? s.estado}</td>
                  <td className="mono">{s.gasto != null ? montoMoneda(s.gasto, s.moneda) : '—'}</td>
                  <td>{s.actor_name || s.actor || '—'}</td>
                  <td className="muted">{dateTime(s.created_at)}</td>
                  <td className="muted">{s.finalizada_at ? dateTime(s.finalizada_at) : '—'}</td>
                  <td className="actions" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setVer(s)} title="Ver detalle">👁 Ver</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => handlePdf(s)} title="Ver/descargar detalle en PDF">↓ PDF</button>
                    {s.estado === 'en_proceso' && <button className="btn btn-sm btn-primary" onClick={() => setFinalizar(s)}>Cargar factura y monto</button>}
                    {s.estado === 'por_pagar' && <button className="btn btn-sm btn-ghost" onClick={() => setFinalizar(s)} title="Editar factura, montos, moneda y nota (antes de que Tesorería pague)">✏ Editar factura/monto</button>}
                    {s.estado === 'por_pagar' && <span className="badge" title="El pago se realiza desde Tesorería">🧾 DIRECTO · por pagar</span>}
                    {(s.estado === 'en_proceso' || s.estado === 'por_pagar') && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setEliminar(s)} title="Eliminar servicio directo">🗑 Eliminar</button>}
                    {s.estado === 'finalizada' && <AdjuntoLink servicio={s} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(crear || editar) && (
        <CrearServicioModal proveedores={proveedores} equipos={equipos} editServicio={editar}
          actor={actor} actorName={actorName} onClose={() => { setCrear(false); setEditar(null); }} onSaved={async () => { setCrear(false); setEditar(null); await reload(); }} />
      )}

      {finalizar && (
        <FinalizarServicioModal modo="montar" servicio={finalizar} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setFinalizar(null)} onSaved={async () => { setFinalizar(null); await reload(); }} />
      )}

      {ver && (
        <ServicioDetalleModal servicio={ver} actor={actor} onClose={() => setVer(null)} onPdf={() => handlePdf(ver)}
          onReabrir={() => setReabrir(ver)} onEditar={() => { setEditar(ver); setVer(null); }} onMontar={() => { setFinalizar(ver); setVer(null); }} onEliminar={() => { setEliminar(ver); setVer(null); }} />
      )}

      {eliminar && (
        <ConfirmDialog
          title="Eliminar servicio directo"
          message={`¿Eliminar el servicio directo "${eliminar.descripcion}"? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setEliminar(null)}
        />
      )}

      {reabrir && (
        <ConfirmDialog
          title="Reabrir servicio directo"
          message={`¿Reabrir ${reabrir.codigo ?? 'el servicio'}? Se devolverá ${reabrir.gasto != null ? money(reabrir.gasto) : 'el dinero'} a la caja. Quedará En proceso para editarlo.`}
          confirmText={reabriendo ? 'Reabriendo…' : 'Reabrir'}
          onConfirm={confirmarReabrir}
          onCancel={() => setReabrir(null)}
        />
      )}
    </div>
  );
}

function ServicioCard({ servicio, onFinalizar, onEliminar, onPdf, onVer }: {
  servicio: ServicioDirecto; onFinalizar: () => void; onEliminar: () => void; onPdf: () => void; onVer: () => void;
}) {
  return (
    <div className="card row-selectable" style={{ margin: 0, cursor: 'pointer' }} onClick={onVer} title="Ver detalle">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
        <strong>{servicio.descripcion}</strong>
        <span className="badge">🔧</span>
      </div>
      {servicio.codigo && <div className="mono" style={{ fontSize: '.74rem', color: 'var(--brand, #ff8a00)', marginTop: '.15rem' }}>{servicio.codigo}</div>}
      {servicio.equipo_nombre && <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>🚜 {servicio.equipo_nombre}</div>}
      {servicio.proveedor_nombre && <div className="muted" style={{ fontSize: '.74rem', marginTop: '.15rem' }}>🏷 {servicio.proveedor_nombre}</div>}
      {servicio.items.length > 1 && (
        <ul className="muted" style={{ fontSize: '.72rem', margin: '.35rem 0 0', paddingLeft: '1rem' }}>
          {servicio.items.map((it, i) => <li key={i}>{it.descripcion} · {num(it.cantidad)}{it.equipo_nombre ? ` · ${it.equipo_nombre}` : ''}{it.insumo_nombre ? ` · 📦 ${it.insumo_nombre}` : ''}{it.bombonas ? ` · ${num(it.bombonas)} bombona(s)` : ''}{it.kg_recarga ? ` · ${num(it.kg_recarga)} kg` : ''}</li>)}
        </ul>
      )}
      <div className="muted" style={{ fontSize: '.72rem', marginTop: '.4rem', lineHeight: 1.5 }}>
        <div>Generó: <strong style={{ color: 'var(--text)' }}>{servicio.actor_name || servicio.actor || '—'}</strong></div>
        <div>Creado: {dateTime(servicio.created_at)}</div>
        {servicio.estado === 'finalizada' && <div>Pagado: {servicio.finalizada_at ? dateTime(servicio.finalizada_at) : '—'}</div>}
      </div>
      {servicio.estado === 'finalizada' && (
        <div style={{ fontSize: '.8rem', marginTop: '.4rem' }} onClick={(e) => e.stopPropagation()}>
          <div>Monto: <strong className="mono">{servicio.gasto != null ? montoMoneda(servicio.gasto, servicio.moneda) : '—'}</strong></div>
          <div className="muted"><AdjuntoLink servicio={servicio} /></div>
        </div>
      )}
      {servicio.estado === 'por_pagar' && (
        <div style={{ marginTop: '.4rem' }} onClick={(e) => e.stopPropagation()}>
          <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#1a1a1a' }}>DIRECTO</span>
          <span className="muted mono" style={{ marginLeft: '.4rem' }}>A pagar: {servicio.gasto != null ? montoMoneda(servicio.gasto, servicio.moneda) : '—'}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-ghost" onClick={onVer} title="Ver detalle">👁 Ver</button>
        <button className="btn btn-sm btn-ghost" onClick={onPdf} title="Ver/descargar detalle en PDF">↓ PDF</button>
        {servicio.estado === 'en_proceso' && <button className="btn btn-sm btn-primary" onClick={onFinalizar}>Cargar factura y monto</button>}
        {servicio.estado === 'por_pagar' && <button className="btn btn-sm btn-ghost" onClick={onFinalizar} title="Editar factura, montos, moneda y nota (antes de que Tesorería pague)">✏ Editar factura/monto</button>}
        {(servicio.estado === 'en_proceso' || servicio.estado === 'por_pagar') && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={onEliminar} title="Eliminar servicio directo">🗑 Eliminar</button>}
      </div>
    </div>
  );
}

function AdjuntoLink({ servicio }: { servicio: ServicioDirecto }) {
  if (!servicio.adjunto_path) return <span className="muted">—</span>;
  async function abrir() {
    try { previewArchivo(await urlAdjuntoServicio(servicio.adjunto_path as string), servicio.adjunto_nombre || ((servicio.adjunto_path as string).split('/').pop() ?? 'adjunto')); }
    catch { toast('No se pudo abrir el adjunto', 'error'); }
  }
  return <button className="btn btn-sm btn-ghost" onClick={abrir} title={servicio.adjunto_nombre ?? 'Adjunto'}>📎 Factura</button>;
}

/* ───────── Modal: detalle del servicio directo ───────── */

function ServicioDetalleModal({ servicio, actor, onClose, onPdf, onReabrir, onEditar, onMontar, onEliminar }: {
  servicio: ServicioDirecto; actor: string; onClose: () => void; onPdf: () => void; onReabrir: () => void; onEditar: () => void; onMontar: () => void; onEliminar: () => void;
}) {
  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      {servicio.estado === 'en_proceso' && <button className="btn btn-ghost" onClick={onEditar} title="Editar servicios / proveedor">✏ Editar</button>}
      {servicio.estado === 'por_pagar' && <button className="btn btn-ghost" onClick={onMontar} title="Editar factura, montos, moneda y nota (antes de que Tesorería pague)">✏ Editar factura/monto</button>}
      {(servicio.estado === 'en_proceso' || servicio.estado === 'por_pagar') && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={onEliminar} title="Eliminar servicio directo">🗑 Eliminar</button>}
      {servicio.estado === 'finalizada' && <button className="btn btn-ghost" style={{ color: 'var(--warning)' }} onClick={onReabrir} title="Reabrir para editar (devuelve el dinero a la caja)">↺ Reabrir</button>}
      <button className="btn btn-primary" onClick={onPdf}>↓ PDF</button>
    </>
  );
  const fila = (k: string, v: ReactNode) => (
    <div className="detail-row"><div className="k">{k}</div><div className="v">{v}</div></div>
  );
  return (
    <Modal title={`🔧 Servicio Directo ${servicio.codigo ?? ''}`} size="lg" onClose={onClose} footer={footer}>
      {fila('Código', <span className="mono">{servicio.codigo ?? '—'}</span>)}
      {fila('Estado', servicio.estado === 'finalizada' ? '🏁 Finalizada (pagada)' : (ESTADO_LABEL[servicio.estado] ?? '⏳ En proceso'))}
      {fila('Proveedor', servicio.proveedor_nombre || '—')}
      {fila('Equipo', servicio.equipo_nombre || '—')}
      {(servicio.solicitante || servicio.unidad_solicitante) && fila('Solicitante', `${servicio.solicitante || '—'}${servicio.unidad_solicitante ? ` · ${servicio.unidad_solicitante}` : ''}`)}
      {fila('Generó', servicio.actor_name || servicio.actor || '—')}
      {fila('Creado', dateTime(servicio.created_at))}
      {servicio.estado === 'finalizada' && fila('Pagado', servicio.finalizada_at ? dateTime(servicio.finalizada_at) : '—')}
      {fila('Moneda', servicio.moneda === 'Bs' ? 'Bs' : '$ (USD)')}
      {(Number(servicio.tasa_conversion) || 0) > 0 && servicio.gasto != null && fila('Convertido a la tasa', <span>{num(servicio.tasa_conversion)} Bs/$ · equivale a <strong className="mono">{montoMoneda(servicio.moneda === 'Bs' ? Number(servicio.gasto) / Number(servicio.tasa_conversion) : Number(servicio.gasto) * Number(servicio.tasa_conversion), servicio.moneda === 'Bs' ? 'USD' : 'Bs')}</strong></span>)}
      {fila('Monto total', servicio.gasto != null ? montoMoneda(servicio.gasto, servicio.moneda) : '—')}
      {servicio.nota && fila('Nota / motivo', <span style={{ whiteSpace: 'pre-wrap' }}>{servicio.nota}</span>)}
      {servicio.pago_externo && fila('Pago a externo',
        <span style={{ color: 'var(--warning)' }}>
          💵 Pagó: <strong>{servicio.pago_externo_nombre || '—'}</strong>
          {servicio.pago_externo_cedula ? ` · ${servicio.pago_externo_cedula}` : ''}
          {servicio.pago_externo_telefono ? ` · 📞 ${servicio.pago_externo_telefono}` : ''}
          {servicio.pago_externo_nota ? ` · ${servicio.pago_externo_nota}` : ''}
          <span className="muted" style={{ fontSize: '.75rem' }}> (reintegrar)</span>
        </span>)}
      {servicio.adjunto_path && fila('Factura', <AdjuntoLink servicio={servicio} />)}

      <div className="table-wrap" style={{ marginTop: '.6rem' }}>
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr>
            <th>Servicio</th><th>Categoría</th><th>Equipo</th><th>Insumo</th>
            <th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Bombonas</th><th style={{ textAlign: 'right' }}>KG</th><th style={{ textAlign: 'right' }}>Monto</th>
          </tr></thead>
          <tbody>
            {servicio.items.map((it, i) => (
              <tr key={i}>
                <td>{it.descripcion}</td>
                <td>{it.categoria || <span className="muted">—</span>}</td>
                <td>{it.equipo_nombre || <span className="muted">—</span>}</td>
                <td>{it.insumo_nombre || <span className="muted">—</span>}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(it.cantidad)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{it.bombonas ? num(it.bombonas) : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{it.kg_recarga ? num(it.kg_recarga) : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{it.gasto != null ? montoMoneda(it.gasto, servicio.moneda) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FacturasDirectas modulo="servicio" refId={servicio.id} actor={actor} />
    </Modal>
  );
}

/* ───────── Modal: nuevo servicio (categoría + tipo + equipo por renglón) ───────── */

interface LineaUI { id: number; categoria: string; tipo: string; equipoId: string; electro: string; cantidad: string; bombonas: string; kg: string; insumoId: string; insumoNombre: string }

function CrearServicioModal({ proveedores, equipos, editServicio, actor, actorName, onClose, onSaved }: {
  proveedores: Proveedor[]; equipos: MaquinariaEquipo[]; editServicio?: ServicioDirecto | null;
  actor: string; actorName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const esEdicion = !!editServicio;
  const provActivos = useMemo(() => proveedores.filter((p) => p.estado === 'activo'), [proveedores]);
  const equiposActivos = useMemo(() => equipos.filter((e) => e.activo), [equipos]);
  const equipoOptions = useMemo(
    () => equiposActivos.map((e) => ({ value: e.id, label: e.placa ? `${e.equipo} · ${e.placa}` : e.equipo })),
    [equiposActivos],
  );

  // Catálogo de servicios (categorías + tipos reutilizables).
  const [catalogo, setCatalogo] = useState<ServicioCatalogo[]>([]);
  useEffect(() => { listServiciosActivos().then(setCatalogo).catch(() => setCatalogo([])); }, []);
  // Categorías sugeridas: las base + las que ya existen en el catálogo (creable).
  const categoriaOptions = useMemo(() => {
    const set = new Set<string>([...CATEGORIAS_SERVICIO, CATEGORIA_ELECTRODOMESTICOS]);
    for (const c of catalogo) if (c.categoria) set.add(c.categoria);
    return Array.from(set);
  }, [catalogo]);
  // Tipos de servicio para una categoría: tipos de mantenimiento + lo cargado en el catálogo.
  const tiposDe = (categoria: string): string[] => {
    // En recargas (gas/oxígeno/extintores) los tipos son GAS / OXÍGENO / EXTINTORES.
    const base = esRecargaGas(categoria) ? [...TIPOS_RECARGA] : TIPOS_MANTENIMIENTO.map((t) => `${t.icon} ${t.label}`);
    const vistos = new Set(base.map((t) => t.toLowerCase()));
    const delCatalogo = catalogo.filter((s) => !categoria || s.categoria === categoria).map((s) => s.nombre);
    return [...base, ...delCatalogo.filter((s) => !vistos.has(s.toLowerCase()))];
  };

  const nuevaLinea = (id: number): LineaUI => ({ id, categoria: '', tipo: '', equipoId: '', electro: '', cantidad: '1', bombonas: '', kg: '', insumoId: '', insumoNombre: '' });
  // Al editar: precarga los renglones existentes del servicio.
  const lineasIniciales = (): LineaUI[] => {
    if (!editServicio || !editServicio.items.length) return [nuevaLinea(1)];
    return editServicio.items.map((it, i) => ({
      id: i + 1, categoria: it.categoria ?? '', tipo: it.descripcion ?? '', equipoId: it.equipo_id ?? '',
      electro: esElectrodomestico(it.categoria) ? (it.equipo_nombre ?? '') : '',
      cantidad: String(it.cantidad ?? 1), bombonas: it.bombonas != null ? String(it.bombonas) : '', kg: it.kg_recarga != null ? String(it.kg_recarga) : '',
      insumoId: it.insumo_producto_id ?? '', insumoNombre: it.insumo_nombre ?? '',
    }));
  };
  // Productos del inventario para el buscador de insumo del mantenimiento.
  const [productos, setProductos] = useState<Producto[]>([]);
  useEffect(() => { listProductos().then(setProductos).catch(() => setProductos([])); }, []);
  const productoOptions = useMemo(
    () => productos.filter((p) => p.estado === 'activo').map((p) => ({ value: p.id, label: `${p.nombre} · ${p.sku}` })),
    [productos],
  );
  const [lineas, setLineas] = useState<LineaUI[]>(lineasIniciales);
  const [seq, setSeq] = useState((editServicio?.items.length ?? 1) + 1);
  const [solicitante, setSolicitante] = useState(editServicio?.solicitante ?? '');
  const [unidadSolicitante, setUnidadSolicitante] = useState(editServicio?.unidad_solicitante ?? '');
  // Nota / motivo libre (se muestra en el detalle y en el PDF).
  const [nota, setNota] = useState(editServicio?.nota ?? '');
  // Moneda del servicio (Bs o $). Editable; se puede cambiar al editar.
  const [moneda, setMoneda] = useState<'USD' | 'Bs'>(editServicio?.moneda === 'Bs' ? 'Bs' : 'USD');
  // Pago a externo: una persona externa pagó de su bolsillo y debe reintegrársele.
  const [pagoExterno, setPagoExterno] = useState<PagoExternoState>(() => pagoExternoDesdeRow(editServicio) ?? PAGO_EXTERNO_VACIO);
  // Catálogo de unidades solicitantes (mismo que el servicio/OP normal, sincronizado).
  const [unidadOpciones, setUnidadOpciones] = useState<string[]>([]);
  useEffect(() => { listActivosPedido('unidad_solicitante').then(setUnidadOpciones).catch(() => setUnidadOpciones([])); }, []);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Proveedor (opcional): directorio + alta en línea.
  const [proveedorId, setProveedorId] = useState(editServicio?.proveedor_id ?? '');
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [provRazon, setProvRazon] = useState('');
  const [provRif, setProvRif] = useState('J-');
  const [provTelefono, setProvTelefono] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provOrigen, setProvOrigen] = useState<OrigenProveedor>('nacional');
  const rifPartes = partirRif(provRif);

  function set(id: number, patch: Partial<LineaUI>) { setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))); }
  function add() { setLineas((ls) => [...ls, nuevaLinea(seq)]); setSeq((s) => s + 1); }
  function quitar(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const payload: LineaServicio[] = [];
    for (const l of lineas) {
      const cat = l.categoria.trim();
      const tipo = l.tipo.trim();
      const gas = esRecargaGas(cat, tipo);
      // En recargas la cantidad la dan las bombonas (no hay campo Cantidad).
      const cant = gas ? (Number(l.bombonas) || 0) : (Number(l.cantidad) || 0);
      if (!cat) { setError('Indicá la categoría de cada servicio.'); return; }
      if (!tipo) { setError('Indicá el tipo de servicio en cada renglón.'); return; }
      if (cant <= 0) { setError(gas ? 'Indicá la cantidad de bombonas.' : 'Cada servicio debe tener cantidad mayor que 0.'); return; }
      const esElectro = esElectrodomestico(cat);
      const eq = equiposActivos.find((x) => x.id === l.equipoId) ?? null;
      // Electrodomésticos: el "equipo" es el artículo elegido (sin id de maquinaria).
      const equipoId = esElectro ? null : (eq?.id ?? null);
      const equipoNombre = esElectro ? (l.electro.trim() || null) : (eq?.equipo ?? null);
      payload.push({
        categoria: cat, descripcion: tipo, equipoId, equipoNombre, cantidad: cant,
        bombonas: gas && l.bombonas ? Number(l.bombonas) : null,
        kg_recarga: gas && l.kg ? Number(l.kg) : null,
        insumoProductoId: !gas && l.insumoId ? l.insumoId : null,
        insumoNombre: !gas && l.insumoId ? l.insumoNombre : null,
      });
    }
    if (nuevoProveedor) {
      if (!provRazon.trim() || !rifPartes.numero) { setError('Razón social y RIF (con número) son obligatorios para el nuevo proveedor.'); return; }
      const emailClean = provEmail.trim();
      if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) { setError('El correo del proveedor no tiene un formato válido.'); return; }
    }
    setSaving(true);
    try {
      // Guarda en el catálogo los tipos nuevos (para reutilizarlos), igual que la Solicitud de Servicio.
      for (const l of payload) {
        const cat = (l.categoria ?? '').trim();
        const tipo = l.descripcion.trim();
        if (cat && tipo && !catalogo.some((s) => s.categoria === cat && s.nombre.toLowerCase() === tipo.toLowerCase())
          && !TIPOS_MANTENIMIENTO.some((t) => `${t.icon} ${t.label}`.toLowerCase() === tipo.toLowerCase())) {
          try { const nuevo = await addServicioCatalogo(cat, tipo, actor); setCatalogo((prev) => [...prev, nuevo]); } catch { /* ya existe */ }
        }
      }
      let proveedorIdFinal: string | null = null;
      let proveedorNombreFinal: string | null = null;
      if (nuevoProveedor) {
        const creado = await crearProveedor({
          razon_social: provRazon.trim().toUpperCase(),
          rif: `${rifPartes.letra}-${rifPartes.numero}`,
          contacto: null, telefono: provTelefono.trim() || null, email: provEmail.trim() || null,
          direccion: null, categorias: [], origen: provOrigen, estado: 'activo',
        });
        proveedorIdFinal = creado.id;
        proveedorNombreFinal = creado.razon_social;
        notify(`Proveedor "${creado.razon_social}" registrado`, 'success', { link: '#/app/proveedores' });
      } else if (proveedorId) {
        proveedorIdFinal = proveedorId;
        proveedorNombreFinal = provActivos.find((p) => p.id === proveedorId)?.razon_social ?? null;
      }
      if (files.some((f) => f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/'))) { setError('Los adjuntos deben ser PDF o imagen.'); setSaving(false); return; }
      // Sincroniza la unidad solicitante con el catálogo (igual que el servicio normal).
      const uniClean = unidadSolicitante.trim().toUpperCase();
      if (uniClean && !unidadOpciones.some((u) => u.toLowerCase() === uniClean.toLowerCase())) {
        await addCatalogoPedido('unidad_solicitante', uniClean).catch(() => {});
      }
      const pe = pagoExternoAInput(pagoExterno);
      if (esEdicion && editServicio) {
        const edit = await editarServicioDirectoEnProceso({ servicio: editServicio, lineas: payload, proveedorId: proveedorIdFinal, proveedorNombre: proveedorNombreFinal, solicitante, unidadSolicitante, nota, moneda, pagoExterno: pe, actor, actorName });
        for (const f of files) await agregarAdjuntoDirecto('servicio', edit.id, f, actor);
        notify(`Servicio directo ${edit.codigo ?? ''} actualizado · ${payload.length} servicio(s)`, 'success', { link: '#/app/pedidos' });
      } else {
        const creado = await crearServicioDirecto({
          lineas: payload, proveedorId: proveedorIdFinal, proveedorNombre: proveedorNombreFinal, solicitante, unidadSolicitante, nota, moneda, pagoExterno: pe, actor, actorName,
        });
        for (const f of files) await agregarAdjuntoDirecto('servicio', creado.id, f, actor);
        notify(`Servicio directo ${creado.codigo ?? ''} creado · ${payload.length} servicio(s)`, 'success', { link: '#/app/pedidos' });
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el servicio directo.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="sd-form" className="btn btn-primary" disabled={saving}>{saving ? (esEdicion ? 'Guardando…' : 'Creando…') : (esEdicion ? 'Guardar cambios' : 'Crear servicio directo')}</button>
    </>
  );

  return (
    <Modal title={esEdicion ? `Editar servicio directo ${editServicio?.codigo ?? ''}` : 'Nuevo servicio directo'} size="lg" onClose={onClose} footer={footer}>
      <form id="sd-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

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

        {/* Quién solicita y su unidad/área (editable). */}
        <div className="form-grid">
          <div className="form-row">
            <label>Solicitante <span className="muted">(quién lo solicitó)</span></label>
            <input className="input" value={solicitante} onChange={(e) => setSolicitante(e.target.value.toUpperCase())} placeholder="Nombre y apellido del solicitante" />
          </div>
          <div className="form-row">
            <label>Unidad solicitante</label>
            <SearchCreateSelect options={unidadOpciones} value={unidadSolicitante}
              onChange={(v) => setUnidadSolicitante(v.toUpperCase())} placeholder="Unidad / área…" />
          </div>
          <div className="form-row">
            <label>Moneda del servicio</label>
            <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value as 'USD' | 'Bs')}>
              <option value="USD">$ (USD)</option>
              <option value="Bs">Bs</option>
            </select>
            <small className="muted">Los montos se muestran en esta moneda. Podés cambiarla al editar.</small>
          </div>
        </div>

        <p className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 .6rem' }}>Categoría + tipo + equipo de maquinaria. Los montos se cargan al finalizar (con la factura).</p>

        {lineas.map((l, idx) => (
          <div key={l.id} className="card" style={{ margin: '0 0 .6rem', padding: '.7rem .85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <strong style={{ fontSize: '.85rem' }}>Servicio #{idx + 1}</strong>
              {lineas.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitar(l.id)} title="Quitar servicio">✕</button>}
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Categoría del servicio *</label>
                <SearchCreateSelect options={categoriaOptions} value={l.categoria} onChange={(v) => set(l.id, { categoria: v })}
                  placeholder="Buscá o escribí (mantenimiento de vehículos…)" emptyText="Escribí para crear una categoría" />
              </div>
              <div className="form-row">
                <label>Tipo de servicio</label>
                <SearchCreateSelect options={tiposDe(l.categoria)} value={l.tipo} onChange={(v) => set(l.id, { tipo: v })}
                  placeholder="Elegí el tipo (caucho, aceite, pintura…)" emptyText="Escribí para crear un tipo" />
              </div>
            </div>
            {/* En recargas (gas / oxígeno / extintores) NO se pide equipo ni cantidad:
                solo Cantidad de bombonas y KG. En el resto, equipo + cantidad. */}
            {!esRecargaGas(l.categoria, l.tipo) && (
              <div className="form-grid">
                {esElectrodomestico(l.categoria) ? (
                  <div className="form-row">
                    <label>Electrodoméstico *</label>
                    <SearchCreateSelect options={[...ELECTRODOMESTICOS]} value={l.electro} onChange={(v) => set(l.id, { electro: v })}
                      placeholder="Elegí (cocina, nevera, lavadora, microondas…)" emptyText="Escribí para agregar otro" />
                    <small className="muted">Artículo electrodoméstico al que se le hace el mantenimiento.</small>
                  </div>
                ) : (
                  <div className="form-row">
                    <label>Equipo (Control de Maquinaria)</label>
                    <SearchSelect value={l.equipoId} onChange={(v) => set(l.id, { equipoId: v })} options={equipoOptions}
                      placeholder={equipoOptions.length ? '🔍 Buscá el equipo / vehículo…' : '— sin equipos —'} emptyText="Sin equipos" />
                    <small className="muted">Vincula el servicio al equipo (aparece en Control de Mantenimiento).</small>
                  </div>
                )}
                <div className="form-row">
                  <label>Cantidad</label>
                  <input className="input mono" name={`linea-cant-${l.id}`} type="number" min={1} step="any" defaultValue={l.cantidad} onChange={(e) => set(l.id, { cantidad: e.target.value })} required />
                </div>
                <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                  <label>Insumo del inventario <span className="muted">(si el material está en stock, p. ej. el caucho)</span></label>
                  <SearchSelect value={l.insumoId}
                    onChange={(v) => set(l.id, { insumoId: v, insumoNombre: productos.find((p) => p.id === v)?.nombre ?? '' })}
                    options={productoOptions} placeholder={productoOptions.length ? '🔍 Buscar en inventario…' : '— sin productos —'} emptyText="Sin coincidencias" />
                  {l.insumoId && (
                    <small className="muted">
                      <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .3rem' }} onClick={() => set(l.id, { insumoId: '', insumoNombre: '' })}>✕ Quitar insumo</button>
                    </small>
                  )}
                </div>
              </div>
            )}
            {esRecargaGas(l.categoria, l.tipo) && (
              <div className="form-grid">
                <div className="form-row">
                  <label>Cantidad de bombonas</label>
                  <input className="input mono" name={`linea-bomb-${l.id}`} type="number" min={0} step="any" defaultValue={l.bombonas} onChange={(e) => set(l.id, { bombonas: e.target.value })} placeholder="Ej. 4" />
                </div>
                <div className="form-row">
                  <label>KG a recargar</label>
                  <input className="input mono" name={`linea-kg-${l.id}`} type="number" min={0} step="any" defaultValue={l.kg} onChange={(e) => set(l.id, { kg: e.target.value })} placeholder="Ej. 40" />
                  <small className="muted">⛽ Recarga de gas / oxígeno / extintores.</small>
                </div>
              </div>
            )}
          </div>
        ))}

        <button type="button" className="btn btn-sm btn-ghost" onClick={add}>＋ Agregar servicio</button>

        <div className="form-row" style={{ marginTop: '.75rem' }}>
          <label>Adjuntar imágenes o PDF <span className="muted">(podés elegir varios)</span></label>
          <input className="input" type="file" accept="application/pdf,image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {files.length > 0 && <small className="muted">{files.length} archivo(s): {files.map((f) => f.name).join(', ')}</small>}
          {esEdicion && editServicio && <small className="muted" style={{ display: 'block' }}>Los adjuntos se agregan a la lista del servicio (podés verlos/borrarlos en el detalle).</small>}
        </div>

        <div className="form-row" style={{ marginTop: '.75rem' }}>
          <label>Nota / motivo <span className="muted">(opcional)</span></label>
          <textarea className="input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="Motivo u observación de este servicio (se muestra en el detalle y el PDF)…" />
        </div>

        <PagoExternoFields value={pagoExterno} onChange={setPagoExterno} />

        <p className="muted" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>En este método no se cargan montos al crear. La factura, el monto y la caja se indican al finalizar.</p>
      </form>
    </Modal>
  );
}

/* ───────── Modal: finalizar (monto por servicio + caja + factura) ───────── */

export function FinalizarServicioModal({ modo, servicio, cajas, actor, actorName, onClose, onSaved }: {
  modo: 'montar' | 'pagar'; servicio: ServicioDirecto; cajas: Caja[]; actor: string; actorName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const esPago = modo === 'pagar';
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  // Moneda del servicio (Bs o $): el analista la fija/edita al montar; se muestra en los montos.
  const [monedaServicio, setMonedaServicio] = useState<'USD' | 'Bs'>(servicio.moneda === 'Bs' ? 'Bs' : 'USD');
  // Montos: en pagar ya vienen cargados (del montaje); al RE-montar un «por pagar» también
  // se precargan para poder corregirlos (no solo en pagar).
  const montosIniciales: Record<number, string> = {};
  servicio.items.forEach((it, i) => { if (it.gasto != null) montosIniciales[i] = String(it.gasto); });
  const [gastos, setGastos] = useState<Record<number, string>>(montosIniciales);
  // Conversor (modo montar): re-monta los inputs de monto con `convKey` y recuerda la tasa usada.
  const [convKey, setConvKey] = useState(0);
  const [tasaConversion, setTasaConversion] = useState<number | null>(servicio.tasa_conversion ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [catsGasto, setCatsGasto] = useState<CategoriaGasto[]>([]);
  const [catId, setCatId] = useState('');
  const [subId, setSubId] = useState('');
  useEffect(() => { listCategoriasGasto().then(setCatsGasto).catch(() => setCatsGasto([])); }, []);
  const catNombre = catsGasto.find((c) => c.id === catId)?.nombre ?? null;
  const subNombre = catsGasto.find((c) => c.id === subId)?.nombre ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';

  const total = useMemo(
    () => Math.round(servicio.items.reduce((a, _it, i) => a + (Number(gastos[i]) || 0), 0) * 100) / 100,
    [gastos, servicio.items],
  );

  // Conversor de moneda (modo montar): convierte todos los montos de $↔Bs a la tasa
  // (del día o la que escriba el usuario) y cambia la moneda del servicio. Guarda la tasa usada.
  function convertirMoneda() {
    const t = Number(tasa) || 0;
    if (t <= 0) { setError('Cargá la tasa (Bs por $) para convertir.'); return; }
    const destino: 'USD' | 'Bs' = monedaServicio === 'USD' ? 'Bs' : 'USD';
    const factor = destino === 'Bs' ? t : 1 / t;
    setGastos((m) => {
      const next: Record<number, string> = {};
      servicio.items.forEach((_it, i) => {
        const v = Number(m[i]) || 0;
        next[i] = v > 0 ? String(Math.round(v * factor * 100) / 100) : (m[i] ?? '');
      });
      return next;
    });
    setMonedaServicio(destino);
    setTasaConversion(t);
    setConvKey((k) => k + 1);
    setError(null);
  }

  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  const [saldosTodas, setSaldosTodas] = useState<CajaSaldo[]>([]);
  useEffect(() => { listSaldos().then(setSaldosTodas).catch(() => setSaldosTodas([])); }, []);
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

  const esMultimoneda = saldosCaja.length >= 2;
  function legUsd(monedaLeg: string, n: number): number {
    if (!n || n <= 0) return 0;
    if (monedaLeg === 'USD' || monedaLeg === 'USDT') return round2(n);
    if (monedaLeg === 'Bs') return tasa > 0 ? round2(n / tasa) : 0;
    if (monedaLeg === 'COP') return mercado?.copUsd ? round2(n / mercado.copUsd) : 0;
    return round2(n);
  }
  const sumUsdMulti = round2(saldosCaja.reduce((a, s) => a + legUsd(s.moneda, Number(legMontos[s.id]) || 0), 0));
  const cubreTotalMulti = sumUsdMulti >= total - 0.01;
  const excedeTotalMulti = esMultimoneda && sumUsdMulti > total + 0.01;
  const cuentaLabel = (c: string) => c === 'general' ? '' : c === 'juridica' ? ' · Jurídica' : ' · Personal';

  const totalUsd = moneda === 'Bs' ? (tasa > 0 ? round2(total / tasa) : 0) : total;
  const totalBs = moneda === 'Bs' ? total : (tasa > 0 ? round2(total * tasa) : 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (total <= 0) { setError('Indicá cuánto costó cada servicio.'); return; }
    if (files.some((f) => f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/'))) { setError('Los adjuntos deben ser PDF o imagen.'); return; }
    const items: ServicioDirectoItem[] = servicio.items.map((it, i) => ({ ...it, gasto: Number(gastos[i]) || 0 }));

    // MODO MONTAR (analista): carga factura + montos y lo deja "Por pagar" (no toca caja).
    if (!esPago) {
      setSaving(true);
      try {
        for (const f of files) await agregarAdjuntoDirecto('servicio', servicio.id, f, actor);
        await enviarServicioAPagar({ servicio, items, moneda: monedaServicio, tasaConversion, actor, actorName });
        notify(`Servicio ${servicio.codigo ?? ''} enviado a pagar · ${montoCaja(total, monedaServicio)} · Tesorería`, 'success', { link: '#/app/tesoreria' });
        onSaved();
      } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo enviar a pagar.'); setSaving(false); }
      return;
    }

    // MODO PAGAR (Tesorería): valida la caja y descuenta el dinero.
    if (!cajaId) { setError('Elegí la caja de la que sale el dinero.'); return; }
    if (catsGasto.length && (!catId || !subId)) { setError('Elegí la categoría y la subcategoría de gasto.'); return; }
    let legs: PagoLeg[] | undefined;
    if (esMultimoneda) {
      legs = saldosCaja
        .map((s) => ({ cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: Number(legMontos[s.id]) || 0 }))
        .filter((l) => l.monto > 0);
      if (!legs.length) { setError('Indicá cuánto pagar en al menos una moneda.'); return; }
      if (excedeTotalMulti) { setError(`No podés pagar más que el total del servicio. Cargado ${montoCaja(sumUsdMulti, 'USD')}, total ${montoCaja(total, 'USD')}.`); return; }
      if (!cubreTotalMulti) { setError(`Lo cargado (${montoCaja(sumUsdMulti, 'USD')}) no cubre el total (${montoCaja(total, 'USD')}).`); return; }
    } else if (saldosCaja.length === 1) {
      const s = saldosCaja[0];
      if (total > Number(s.saldo) + 0.01) { setError(`Saldo insuficiente en la billetera (${montoCaja(Number(s.saldo), s.moneda)}).`); return; }
      legs = [{ cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: total }];
    }
    setSaving(true);
    try {
      await pagarServicioDirecto({ servicio, cajaId, legs, actor, actorName, gastoCategoria: catNombre, gastoSubcategoria: subNombre });
      const resumenPago = esMultimoneda ? `multipago ${montoCaja(sumUsdMulti, 'USD')}` : montoCaja(total, moneda);
      notify(`Servicio pagado · ${resumenPago} desde ${caja?.nombre ?? ''}`, 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar el servicio.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      {esPago
        ? <button type="submit" form="sd-fin-form" className="btn btn-primary" disabled={saving || excedeTotalMulti}>{saving ? 'Pagando…' : excedeTotalMulti ? 'Excede el total' : `💳 Pagar · ${montoCaja(total, moneda)}`}</button>
        : <button type="submit" form="sd-fin-form" className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : '🧾 Enviar a pagar'}</button>}
    </>
  );

  return (
    <Modal title={esPago ? 'Pagar servicio' : 'Cargar factura y monto'} size="lg" onClose={onClose} footer={footer}>
      <form id="sd-fin-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {servicio.equipo_nombre && (
          <div className="card" style={{ marginBottom: '.75rem' }}>🚜 Servicio del equipo <strong>{servicio.equipo_nombre}</strong> — se reflejará en su historial de Control de Maquinaria.</div>
        )}

        {!esPago && (
          <div className="form-row">
            <label>Moneda del servicio</label>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="select" style={{ maxWidth: 150 }} value={monedaServicio} onChange={(e) => { setMonedaServicio(e.target.value as 'USD' | 'Bs'); setTasaConversion(null); }}>
                <option value="USD">$ (USD)</option>
                <option value="Bs">Bs</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                <span className="muted" style={{ fontSize: '.8rem' }}>Tasa BCV (Bs/$):</span>
                <input className="input mono" type="number" min={0} step="any" value={tasa || ''} onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" style={{ width: 120, textAlign: 'right' }} />
              </label>
              <button type="button" className="btn btn-sm btn-ghost" onClick={convertirMoneda} disabled={!(Number(tasa) > 0)}
                title={Number(tasa) > 0 ? `Convierte todos los montos a la tasa ${num(tasa)}` : 'Cargá la tasa para convertir'}>
                ⇄ Convertir a {monedaServicio === 'USD' ? 'Bs' : '$'}
              </button>
              {tasaConversion != null && tasaConversion > 0 && (
                <span className="muted" style={{ fontSize: '.72rem' }}>convertido a tasa <strong className="mono">{num(tasaConversion)}</strong></span>
              )}
            </div>
            <small className="muted">Los montos que cargues abajo son en esta moneda. El conversor los pasa de $ a Bs (o viceversa) a la tasa del día o la que escribas.</small>
          </div>
        )}

        {esPago && (
        <div className="form-row">
          <label>Caja (de dónde sale el dinero)</label>
          <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length} style={{ maxWidth: 320 }}
            placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
            options={cajas.map((c) => ({ value: c.id, label: `${c.nombre} · ${montoCaja(saldoMostrar(c), c.moneda)}` }))} />
          <small className="muted">El monto total se descuenta de esta caja (egreso en Tesorería / registro de movimientos).{esMultimoneda ? ' Es Multimoneda: repartí el pago por moneda abajo.' : ''}</small>
        </div>
        )}

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
            <thead><tr><th>Servicio</th><th>Equipo</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Bombonas</th><th style={{ textAlign: 'right' }}>KG</th><th style={{ width: 160 }}>Monto</th><th style={{ textAlign: 'right' }}>Costo unit.</th></tr></thead>
            <tbody>
              {servicio.items.map((it, i) => {
                const g = Number(gastos[i]) || 0;
                const cu = it.cantidad > 0 && g > 0 ? g / it.cantidad : 0;
                return (
                  <tr key={i}>
                    <td>{it.descripcion}{it.categoria ? <span className="muted"> · {it.categoria}</span> : null}</td>
                    <td>{it.equipo_nombre || <span className="muted">—</span>}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(it.cantidad)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{it.bombonas ? num(it.bombonas) : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{it.kg_recarga ? num(it.kg_recarga) : '—'}</td>
                    <td><input key={`g-${i}-${convKey}`} className="input mono" name={`gasto-${i}`} type="number" min={0} step="any" defaultValue={gastos[i] ?? ''} onChange={(e) => { e.target.value = dosDecimales(e.target.value); setGastos((m) => ({ ...m, [i]: e.target.value })); }} placeholder="0,00" /></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{montoCaja(cu, esPago ? moneda : monedaServicio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ margin: '.5rem 0' }}>{esPago ? 'Total a descontar' : 'Total del servicio'}: <strong className="mono">{montoCaja(total, esPago ? moneda : monedaServicio)}</strong></div>

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
          </div>
        )}

        <div className="form-row">
          <label>Adjuntar facturas / comprobantes · PDF o imagen (podés elegir varios)</label>
          <input className="input" type="file" accept="application/pdf,image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {files.length > 0 && <small className="muted">{files.length} archivo(s): {files.map((f) => f.name).join(', ')}</small>}
        </div>
      </form>
    </Modal>
  );
}
