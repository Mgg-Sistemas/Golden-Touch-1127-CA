import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, money, num } from '@/shared/lib/format';
import { descargarCompraDirectaPdf } from './compraDirectaPdf';
import type { Caja, Producto } from '@/shared/lib/types';
import { getCategorias, getUnidades, listProductos } from '@/modules/inventario/inventario.repository';
import { getNombresAlmacenes } from '@/modules/inventario/almacenes.repository';
import { listCajasActivas } from '@/modules/salidas/cajas.repository';
import {
  crearCompraDirecta, finalizarCompraDirecta, listComprasDirectas,
  urlAdjuntoCompra, type CompraDirecta, type CompraDirectaItem, type LineaCompra,
} from './compras.repository';

type Vista = 'kanban' | 'lista';

const COLS: { key: CompraDirecta['estado']; label: string }[] = [
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'finalizada', label: 'Finalizada' },
];
const ESTADO_LABEL: Record<string, string> = { en_proceso: '⏳ En proceso', finalizada: '🏁 Finalizada' };

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
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('kanban');
  const [crear, setCrear] = useState(false);
  const [finalizar, setFinalizar] = useState<CompraDirecta | null>(null);

  const reload = useCallback(async () => {
    const [cs, pds, alms, cats, unis, cjs] = await Promise.all([
      listComprasDirectas(), listProductos(), getNombresAlmacenes(), getCategorias(), getUnidades(), listCajasActivas(),
    ]);
    setCompras(cs); setProductos(pds); setAlmacenes(alms); setCategorias(cats); setUnidades(unis); setCajas(cjs);
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().catch(() => { /* RLS/red */ }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  const porEstado = useMemo(() => {
    const m: Record<string, CompraDirecta[]> = { en_proceso: [], finalizada: [] };
    compras.forEach((c) => { (m[c.estado] ??= []).push(c); });
    return m;
  }, [compras]);

  async function handlePdf(c: CompraDirecta) {
    try { await descargarCompraDirectaPdf(c); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
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
                    onFinalizar={() => setFinalizar(c)} onPdf={() => handlePdf(c)} />
                ))}
                {!(porEstado[col.key] ?? []).length && <div className="muted" style={{ padding: '.5rem' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Material(es)</th><th>Almacén</th><th>Cant.</th><th>Estado</th><th>Gasto</th><th>Generó</th><th>Creada</th><th>Comprada</th><th></th></tr></thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td>{c.producto_nombre}{c.items.length > 1 ? <span className="muted"> · {c.items.length} ítems</span> : (c.producto_sku ? <span className="muted"> · {c.producto_sku}</span> : null)}</td>
                  <td>{c.almacen}</td>
                  <td className="mono">{num(c.cantidad)}</td>
                  <td>{ESTADO_LABEL[c.estado] ?? c.estado}</td>
                  <td className="mono">{c.gasto != null ? money(c.gasto) : '—'}</td>
                  <td>{c.actor_name || c.actor || '—'}</td>
                  <td className="muted">{dateTime(c.created_at)}</td>
                  <td className="muted">{c.finalizada_at ? dateTime(c.finalizada_at) : '—'}</td>
                  <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => handlePdf(c)} title="Descargar detalle en PDF">↓ PDF</button>
                    {c.estado === 'en_proceso' && <button className="btn btn-sm btn-primary" onClick={() => setFinalizar(c)}>Cargar factura y precios</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crear && (
        <CrearCompraModal productos={productos} almacenes={almacenes} categorias={categorias} unidades={unidades}
          actor={actor} actorName={actorName} onClose={() => setCrear(false)} onSaved={async () => { setCrear(false); await reload(); }} />
      )}

      {finalizar && (
        <FinalizarCompraModal compra={finalizar} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setFinalizar(null)} onSaved={async () => { setFinalizar(null); await reload(); }} />
      )}
    </div>
  );
}

function CompraCard({ compra, onFinalizar, onPdf }: {
  compra: CompraDirecta; onFinalizar: () => void; onPdf: () => void;
}) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
        <strong>{compra.producto_nombre}</strong>
        <span className="badge">{num(compra.cantidad)}</span>
      </div>
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>→ {compra.almacen}</div>
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
      {compra.estado === 'finalizada' && (
        <div style={{ fontSize: '.8rem', marginTop: '.4rem' }}>
          <div>Gasto: <strong className="mono">{compra.gasto != null ? money(compra.gasto) : '—'}</strong></div>
          <div className="muted"><AdjuntoLink compra={compra} /></div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-ghost" onClick={onPdf} title="Descargar detalle en PDF">↓ PDF</button>
        {compra.estado === 'en_proceso' && <button className="btn btn-sm btn-primary" onClick={onFinalizar}>Cargar factura y precios</button>}
      </div>
    </div>
  );
}

function AdjuntoLink({ compra }: { compra: CompraDirecta }) {
  if (!compra.adjunto_path) return <span className="muted">—</span>;
  async function abrir() {
    try { window.open(await urlAdjuntoCompra(compra.adjunto_path as string), '_blank', 'noopener'); }
    catch { toast('No se pudo abrir el adjunto', 'error'); }
  }
  return <button className="btn btn-sm btn-ghost" onClick={abrir} title={compra.adjunto_nombre ?? 'Adjunto'}>📎 PDF</button>;
}

/* ───────── Modal: nueva compra (varios materiales) ───────── */

interface LineaUI { id: number; modo: 'existente' | 'nuevo'; productoId: string; nombre: string; categoria: string; unidad: string; cantidad: string }

function CrearCompraModal({ productos, almacenes, categorias, unidades, actor, actorName, onClose, onSaved }: {
  productos: Producto[]; almacenes: string[]; categorias: string[]; unidades: string[];
  actor: string; actorName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const alms = almacenes.length ? almacenes : ['General'];
  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const nuevaLinea = (id: number): LineaUI => ({
    id, modo: activos.length ? 'existente' : 'nuevo', productoId: activos[0]?.id ?? '',
    nombre: '', categoria: categorias[0] ?? '', unidad: unidades[0] ?? 'und', cantidad: '1',
  });
  const [lineas, setLineas] = useState<LineaUI[]>([nuevaLinea(1)]);
  const [almacen, setAlmacen] = useState(alms[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seq, setSeq] = useState(2);

  function set(id: number, patch: Partial<LineaUI>) { setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))); }
  function add() { setLineas((ls) => [...ls, nuevaLinea(seq)]); setSeq((s) => s + 1); }
  function quitar(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const payload: LineaCompra[] = [];
    for (const l of lineas) {
      const cant = Number(l.cantidad) || 0;
      if (cant <= 0) { setError('Cada material debe tener cantidad mayor que 0.'); return; }
      if (l.modo === 'existente') {
        if (!l.productoId) { setError('Elegí el material en cada renglón.'); return; }
        payload.push({ modo: 'existente', productoId: l.productoId, cantidad: cant });
      } else {
        if (!l.nombre.trim()) { setError('Indicá el nombre del material nuevo.'); return; }
        payload.push({ modo: 'nuevo', nombre: l.nombre, categoria: l.categoria, unidad: l.unidad, cantidad: cant });
      }
    }
    setSaving(true);
    try {
      await crearCompraDirecta({ lineas: payload, almacen, actor, actorName }, productos);
      notify(`Compra directa creada · ${payload.length} material(es)`, 'success', { link: '#/app/pedidos' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear la compra directa.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cd-form" className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear compra directa'}</button>
    </>
  );

  return (
    <Modal title="Nueva compra directa" size="lg" onClose={onClose} footer={footer}>
      <form id="cd-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-row">
          <label>Almacén destino</label>
          <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} style={{ maxWidth: 280 }}>
            {alms.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
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
                  <select className="select" value={l.productoId} onChange={(e) => set(l.id, { productoId: e.target.value })}>
                    {!activos.length && <option value="">— sin materiales —</option>}
                    {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.sku}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <label>Cantidad</label>
                  <input className="input mono" type="number" min={1} step="any" value={l.cantidad} onChange={(e) => set(l.id, { cantidad: e.target.value })} required />
                </div>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label>Descripción del material nuevo</label>
                  <input className="input" value={l.nombre} onChange={(e) => set(l.id, { nombre: e.target.value.toUpperCase() })} placeholder="Nombre / descripción" />
                  <small className="muted">Se da de alta en el inventario (stock 0, sin precio). SKU automático.</small>
                </div>
                <div className="form-grid">
                  <div className="form-row"><label>Categoría</label>
                    <select className="select" value={l.categoria} onChange={(e) => set(l.id, { categoria: e.target.value })}>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div className="form-row"><label>Unidad</label>
                    <select className="select" value={l.unidad} onChange={(e) => set(l.id, { unidad: e.target.value })}>{unidades.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
                  <div className="form-row"><label>Cantidad</label>
                    <input className="input mono" type="number" min={1} step="any" value={l.cantidad} onChange={(e) => set(l.id, { cantidad: e.target.value })} required /></div>
                </div>
              </>
            )}
          </div>
        ))}

        <button type="button" className="btn btn-sm btn-ghost" onClick={add}>＋ Agregar material</button>
        <p className="muted" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>En este método no se cargan precios. El gasto por material y la caja se indican al finalizar.</p>
      </form>
    </Modal>
  );
}

/* ───────── Modal: finalizar (gasto por material + caja) ───────── */

function FinalizarCompraModal({ compra, cajas, actor, actorName, onClose, onSaved }: {
  compra: CompraDirecta; cajas: Caja[]; actor: string; actorName?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [gastos, setGastos] = useState<Record<number, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';

  const total = useMemo(
    () => Math.round(compra.items.reduce((a, _it, i) => a + (Number(gastos[i]) || 0), 0) * 100) / 100,
    [gastos, compra.items],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja de la que sale el dinero.'); return; }
    if (total <= 0) { setError('Indicá cuánto se gastó en cada material.'); return; }
    if (file && file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/')) { setError('El adjunto debe ser un PDF o una imagen.'); return; }
    const items: CompraDirectaItem[] = compra.items.map((it, i) => ({ ...it, gasto: Number(gastos[i]) || 0 }));
    setSaving(true);
    try {
      await finalizarCompraDirecta({ compra, items, cajaId, file, actor, actorName });
      notify(`Compra finalizada · ${montoCaja(total, moneda)} desde ${caja?.nombre ?? ''}`, 'success', { link: '#/app/inventario' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo finalizar la compra.'); setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cd-fin-form" className="btn btn-primary" disabled={saving}>{saving ? 'Finalizando…' : `Finalizar · ${montoCaja(total, moneda)}`}</button>
    </>
  );

  return (
    <Modal title="Cargar factura y precios" size="lg" onClose={onClose} footer={footer}>
      <form id="cd-fin-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-row">
          <label>Caja (de dónde sale el dinero)</label>
          <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)} required style={{ maxWidth: 320 }}>
            {!cajas.length && <option value="">— sin cajas —</option>}
            {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {montoCaja(c.saldo, c.moneda)}</option>)}
          </select>
          <small className="muted">El gasto total se descuenta de esta caja (egreso en Tesorería / registro de movimientos).</small>
        </div>

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
                    <td><input className="input mono" type="number" min={0} step="0.01" value={gastos[i] ?? ''} onChange={(e) => setGastos((m) => ({ ...m, [i]: e.target.value }))} placeholder="0,00" /></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{montoCaja(cu, moneda)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ margin: '.5rem 0' }}>Total a descontar: <strong className="mono">{montoCaja(total, moneda)}</strong> → entra a inventario en <strong>{compra.almacen}</strong></div>

        <div className="form-row">
          <label>Adjuntar comprobante de la compra · PDF o imagen (opcional)</label>
          <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <small className="muted">{file.name}</small>}
        </div>
      </form>
    </Modal>
  );
}
