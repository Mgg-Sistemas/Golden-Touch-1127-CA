import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num } from '@/shared/lib/format';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { MovimientosAcopioView } from './MovimientosAcopioView';
import { CategoriasGastosModal } from './CategoriasGastosModal';
import { listProductos } from '@/modules/inventario/inventario.repository';
import { getNombresAlmacenes } from '@/modules/inventario/almacenes.repository';
import type { CajaMovimiento, CajaResumen, Producto, RecepcionAcopio } from '@/shared/lib/types';
import {
  createRecepcion,
  updateRecepcion,
  cerrarRecepcion,
  anularRecepcion,
  deleteRecepcion,
  type RecepcionInput,
  type LoteInput,
} from './acopio.repository';
import { listCajaMovimientos, resumirCaja, listCajas } from './caja.repository';
import { DineroPorEntrar } from './DineroPorEntrar';
import { listEntrantesPorConfirmar } from '@/modules/tesoreria/transferenciasInter.repository';
import { descargarRecepcionPdf } from './acopioPdf';
import type { CajaCierre, TransferenciaInter } from '@/shared/lib/types';

const ESTADO_LABEL: Record<string, string> = {
  abierta: '● Abierta', cerrada: '✔ Cerrada', anulada: '✖ Anulada',
};
/** Filas por defecto en una recepción nueva (la plantilla original trae 25). */
const FILAS_DEFAULT = 25;

export function AcopioPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('acopio', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [cajaMovs, setCajaMovs] = useState<CajaMovimiento[]>([]);
  const [cajas, setCajas] = useState<CajaCierre[]>([]);
  const [entrantes, setEntrantes] = useState<TransferenciaInter[]>([]);
  const [editar, setEditar] = useState<RecepcionAcopio | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [movAcopio, setMovAcopio] = useState(false);
  const [categorias, setCategorias] = useState(false);
  const [saldoCasiterita, setSaldoCasiterita] = useState(0);
  const [tasaMaterial, setTasaMaterial] = useState(0);
  const onResumenAcopio = useCallback((r: { saldoKg: number; tasa: number }) => { setSaldoCasiterita(r.saldoKg); setTasaMaterial(r.tasa); }, []);

  const reload = useCallback(async () => {
    const [ps, alms, cms, cjs, ent] = await Promise.all([
      listProductos(), getNombresAlmacenes(), listCajaMovimientos(), listCajas(),
      listEntrantesPorConfirmar().catch(() => []),
    ]);
    setProductos(ps);
    setAlmacenes(alms);
    setCajaMovs(cms);
    setCajas(cjs);
    setEntrantes(ent);
  }, []);

  useEffect(() => {
    let cancel = false;
    reload().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); });
    return () => { cancel = true; };
  }, [reload]);
  useRealtime(['acopio_recepciones', 'acopio_recepcion_lotes', 'acopio_caja_movimientos', 'acopio_clasificaciones', 'acopio_cajas', 'acopio_costo_clases', 'acopio_cuadres', 'acopio_cuadre_movimientos', 'transferencias_inter', 'cajas', 'productos', 'existencias'], reload);

  // La tasa de la vista inicial es la del cierre/caja ACTUALMENTE ABIERTO.
  const cajaActual = useMemo(() => cajas.find((c) => c.estado === 'abierta') ?? cajas[0] ?? null, [cajas]);
  const movsActual = useMemo(() => (cajaActual ? cajaMovs.filter((m) => m.caja_id === cajaActual.id) : cajaMovs), [cajaMovs, cajaActual]);
  const caja: CajaResumen = useMemo(() => resumirCaja(movsActual), [movsActual]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>📦 Centro de Acopio PERAMANAL</h1>
          <p className="muted">Control de recepción de mineral por centro de acopio. Al cerrar una recepción, el mineral recibido suma stock al inventario.</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setCategorias(true)}>🏷 Categorías</button>
          {canWrite && <button className="btn btn-primary" onClick={() => setMovAcopio(true)}>+ Agregar Movimiento</button>}
        </div>
      </div>

      {/* Dinero que llega desde el otro sistema (puente inter-sistema) */}
      <DineroPorEntrar entrantes={entrantes} cajas={cajas} actor={actor} actorName={actorName} onReload={reload} />

      {/* Tarjeta protagonista: TASA ACTUAL DEL MATERIAL (varía con los gastos) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ borderColor: 'var(--primary)', background: 'linear-gradient(135deg, var(--surface-2), var(--surface))' }}>
          <div className="card-title"><span>💲 Tasa actual del material</span></div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-3)' }} className="mono">{money(tasaMaterial)}<span style={{ fontSize: '.9rem', fontWeight: 500 }}> /Kg</span></div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>(Facturado + Gastos + Nóminas) ÷ Kg cerrados</div>
        </div>
        <div className="card"><div className="card-title"><span>Saldo de caja</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700 }} className="mono">{money(caja.saldoUsd)}</div></div>
        <div className="card"><div className="card-title"><span>Saldo en Kg</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: saldoCasiterita < 0 ? 'var(--danger)' : undefined }} className="mono">{num(saldoCasiterita)} Kg</div><div className="muted" style={{ fontSize: '.72rem' }}>saldo de casiterita (acumulado)</div></div>
        <div className="card"><div className="card-title"><span>Gastos GT</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--danger)' }} className="mono">{money(caja.gastos)}</div></div>
        <div className="card"><div className="card-title"><span>Nóminas GT</span></div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--danger)' }} className="mono">{money(caja.nominas)}</div></div>
      </div>

      {/* Lista de movimientos del centro de acopio (contratos cerrados se reflejan aquí) */}
      <MovimientosAcopioView onResumen={onResumenAcopio} />

      {categorias && <CategoriasGastosModal canWrite={canWrite} onClose={() => setCategorias(false)} />}

      {movAcopio && (
        <Modal title="Agregar movimiento" size="md" onClose={() => setMovAcopio(false)}
          footer={<button className="btn btn-ghost" onClick={() => setMovAcopio(false)}>Cerrar</button>}>
          <p className="muted" style={{ margin: 0 }}>Pendiente de configurar.</p>
        </Modal>
      )}

      {(nuevo || editar) && (
        <RecepcionModal
          recepcion={editar}
          productos={productos}
          almacenes={almacenes}
          canWrite={canWrite}
          actor={actor}
          actorName={actorName}
          onClose={() => { setNuevo(false); setEditar(null); }}
          onSaved={async () => { setNuevo(false); setEditar(null); await reload(); }}
        />
      )}
    </div>
  );
}

/* ───────────── Editor / detalle (réplica del formato Excel) ───────────── */

interface FilaLote {
  nro_lote: string;
  cantidad_bolsas: string;
  peso_bolsa_kg: string;
  peso_neto_kg: string;
  precinto_inicio: string;
  peso_recepcionado_kg: string;
  precinto_final: string;
}

const filaVacia = (n: number): FilaLote => ({
  nro_lote: String(n), cantidad_bolsas: '', peso_bolsa_kg: '', peso_neto_kg: '',
  precinto_inicio: '', peso_recepcionado_kg: '', precinto_final: '',
});

const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Verf. = IF(precinto_inicio = precinto_final, "V", "F") del Excel. */
const verf = (f: FilaLote) => f.precinto_inicio.trim() === f.precinto_final.trim();

function RecepcionModal({ recepcion, productos, almacenes, canWrite, actor, actorName, onClose, onSaved }: {
  recepcion: RecepcionAcopio | null;
  productos: Producto[];
  almacenes: string[];
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNueva = !recepcion;
  const editable = canWrite && (esNueva || recepcion!.estado === 'abierta');

  const [fecha, setFecha] = useState(recepcion?.fecha ?? new Date().toISOString().slice(0, 10));
  const [centro, setCentro] = useState(recepcion?.centro_acopio ?? 'Peramanal');
  const [aliado, setAliado] = useState(recepcion?.aliado ?? '');
  const [productoId, setProductoId] = useState(recepcion?.producto_id ?? '');
  const [almacen, setAlmacen] = useState(recepcion?.almacen ?? almacenes[0] ?? '');
  const [entNombre, setEntNombre] = useState(recepcion?.entregado_nombre ?? '');
  const [entCi, setEntCi] = useState(recepcion?.entregado_ci ?? '');
  const [recNombre, setRecNombre] = useState(recepcion?.recibido_nombre ?? '');
  const [recCi, setRecCi] = useState(recepcion?.recibido_ci ?? '');
  const [obs, setObs] = useState(recepcion?.observaciones ?? '');
  const [filas, setFilas] = useState<FilaLote[]>(() => {
    const ls = recepcion?.lotes ?? [];
    if (!ls.length) return Array.from({ length: FILAS_DEFAULT }, (_, i) => filaVacia(i + 1));
    return ls.map((l) => ({
      nro_lote: l.nro_lote ?? '',
      cantidad_bolsas: l.cantidad_bolsas ? String(l.cantidad_bolsas) : '',
      peso_bolsa_kg: l.peso_bolsa_kg ? String(l.peso_bolsa_kg) : '',
      peso_neto_kg: l.peso_neto_kg ? String(l.peso_neto_kg) : '',
      precinto_inicio: l.precinto_inicio ?? '',
      peso_recepcionado_kg: l.peso_recepcionado_kg ? String(l.peso_recepcionado_kg) : '',
      precinto_final: l.precinto_final ?? '',
    }));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setFila(i: number, patch: Partial<FilaLote>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addFila() { setFilas((prev) => [...prev, filaVacia(prev.length + 1)]); }
  function delFila(i: number) { setFilas((prev) => prev.filter((_, idx) => idx !== i)); }

  const totales = useMemo(() => filas.reduce((a, f) => {
    const bruto = n(f.cantidad_bolsas) * n(f.peso_bolsa_kg);
    return {
      bolsas: a.bolsas + n(f.cantidad_bolsas), bruto: a.bruto + bruto,
      neto: a.neto + n(f.peso_neto_kg), recepcionado: a.recepcionado + n(f.peso_recepcionado_kg),
    };
  }, { bolsas: 0, bruto: 0, neto: 0, recepcionado: 0 }), [filas]);

  const cantidadStock = totales.recepcionado > 0 ? totales.recepcionado : totales.neto;
  const productoSel = productos.find((p) => p.id === productoId) ?? null;
  const unidad = productoSel?.unidad || 'Kg';

  function buildInput(): RecepcionInput {
    const lotes: LoteInput[] = filas.map((f) => ({
      nro_lote: f.nro_lote, cantidad_bolsas: n(f.cantidad_bolsas), peso_bolsa_kg: n(f.peso_bolsa_kg),
      peso_neto_kg: n(f.peso_neto_kg), precinto_inicio: f.precinto_inicio,
      peso_recepcionado_kg: n(f.peso_recepcionado_kg), precinto_final: f.precinto_final,
    }));
    return {
      fecha, centro_acopio: centro, aliado, producto_id: productoId || null, almacen,
      entregado_nombre: entNombre, entregado_ci: entCi, recibido_nombre: recNombre, recibido_ci: recCi,
      observaciones: obs, lotes,
    };
  }

  async function guardar() {
    setError(null);
    if (!fecha) { setError('Indicá la fecha.'); return; }
    setSaving(true);
    try {
      if (esNueva) {
        const r = await createRecepcion(buildInput(), actor, actorName);
        notify(`Recepción ${r.numero} creada (borrador)`, 'success', { link: '#/app/acopio' });
      } else {
        await updateRecepcion(recepcion!.id, buildInput());
        toast('Recepción actualizada', 'success');
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); setSaving(false); }
  }

  async function guardarYCerrar() {
    setError(null);
    if (!productoId) { setError('Elegí el producto (mineral) al que se suma el stock.'); return; }
    if (!almacen.trim()) { setError('Elegí el almacén destino del stock.'); return; }
    if (cantidadStock <= 0) { setError('El peso recibido debe ser mayor que 0.'); return; }
    setSaving(true);
    try {
      let id = recepcion?.id;
      if (esNueva) { id = (await createRecepcion(buildInput(), actor, actorName)).id; }
      else { await updateRecepcion(recepcion!.id, buildInput()); }
      const cerrada = await cerrarRecepcion(id!, actor, actorName);
      notify(`Recepción ${cerrada.numero} cerrada · +${num(cantidadStock)} ${unidad} a ${almacen}`, 'success', { link: '#/app/acopio' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cerrar.'); setSaving(false); }
  }

  async function anular() {
    if (!recepcion) return;
    if (!window.confirm(`¿Anular la recepción ${recepcion.numero}? Si estaba cerrada, se revierte el stock sumado.`)) return;
    setSaving(true);
    try {
      await anularRecepcion(recepcion.id, actor, actorName);
      notify(`Recepción ${recepcion.numero} anulada`, 'info', { link: '#/app/acopio' });
      onSaved();
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo anular', 'error'); setSaving(false); }
  }

  async function eliminar() {
    if (!recepcion) return;
    if (!window.confirm(`¿Eliminar el borrador ${recepcion.numero}? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try { await deleteRecepcion(recepcion.id); toast('Borrador eliminado', 'success'); onSaved(); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo eliminar', 'error'); setSaving(false); }
  }

  async function pdf() {
    try {
      const r: RecepcionAcopio = recepcion ? { ...recepcion } : {
        ...buildInput(), id: 'preview', numero: '(borrador)', estado: 'abierta', created_at: new Date().toISOString(),
        lotes: filas.map((f, i) => ({
          id: String(i), recepcion_id: 'preview', orden: i, nro_lote: f.nro_lote,
          cantidad_bolsas: n(f.cantidad_bolsas), peso_bolsa_kg: n(f.peso_bolsa_kg),
          peso_bruto_total: n(f.cantidad_bolsas) * n(f.peso_bolsa_kg), peso_neto_kg: n(f.peso_neto_kg),
          dif_bruto_neto: n(f.cantidad_bolsas) * n(f.peso_bolsa_kg) - n(f.peso_neto_kg),
          precinto_inicio: f.precinto_inicio, peso_recepcionado_kg: n(f.peso_recepcionado_kg),
          dif_neto_recepcionado: n(f.peso_neto_kg) - n(f.peso_recepcionado_kg),
          precinto_final: f.precinto_final, verificado: verf(f),
        })),
      } as RecepcionAcopio;
      await descargarRecepcionPdf(r);
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo generar el PDF', 'error'); }
  }

  const estado = recepcion?.estado ?? 'abierta';
  const titulo = esNueva ? 'Nueva recepción de mineral' : `Recepción ${recepcion!.numero} · ${ESTADO_LABEL[estado] ?? estado}`;
  const ro = !editable;
  // Estilos de "hoja" (réplica del Excel con el front del sistema).
  const thStyle: React.CSSProperties = { fontSize: '.68rem', lineHeight: 1.15, textAlign: 'center', verticalAlign: 'bottom', whiteSpace: 'pre-line', padding: '.35rem .3rem' };
  const calcCol: React.CSSProperties = { background: 'var(--surface-2)', textAlign: 'right', fontWeight: 600 };
  const cellNum = { width: 66 };

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
      <button type="button" className="btn btn-ghost" onClick={pdf} disabled={saving}>↓ PDF</button>
      {!esNueva && estado === 'abierta' && canWrite && (<button type="button" className="btn btn-danger" onClick={eliminar} disabled={saving}>Eliminar</button>)}
      {estado === 'cerrada' && canWrite && (<button type="button" className="btn btn-danger" onClick={anular} disabled={saving}>Anular (revierte stock)</button>)}
      {editable && (
        <>
          <button type="button" className="btn btn-ghost" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
          <button type="button" className="btn btn-primary" onClick={() => void guardarYCerrar()} disabled={saving}>{saving ? '…' : 'Cerrar y sumar stock'}</button>
        </>
      )}
    </>
  );

  return (
    <Modal title={titulo} size="xl" onClose={onClose} footer={footer}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {/* ── Hoja estilo Excel ── */}
      <div className="card" style={{ padding: '1rem' }}>
        <h3 style={{ textAlign: 'center', margin: '0 0 1rem', letterSpacing: '.02em', fontSize: '1rem' }}>
          CONTROL DE RECEPCIÓN DE MINERAL POR CENTRO DE ACOPIO
        </h3>

        {/* Encabezado: Fecha / Centro de Acopio / Aliado */}
        <div className="form-grid" style={{ gap: '.6rem 1rem' }}>
          <div className="form-row"><label>FECHA</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>CENTRO DE ACOPIO</label><input className="input" value={centro} onChange={(e) => setCentro(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>ALIADO</label><input className="input" value={aliado} onChange={(e) => setAliado(e.target.value)} placeholder="Nombre del aliado" disabled={ro} /></div>
        </div>

        {/* Vínculo de inventario (no está en el Excel; es lo que suma stock) */}
        <div className="form-grid" style={{ gap: '.6rem 1rem', marginTop: '.4rem', padding: '.5rem .6rem', border: '1px dashed var(--border-strong)', borderRadius: 8 }}>
          <div className="form-row">
            <label>📦 Producto (mineral) que suma stock al cerrar</label>
            <select className="select" value={productoId} onChange={(e) => setProductoId(e.target.value)} disabled={ro}>
              <option value="">— elegí el producto —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ''}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Almacén destino del stock</label>
            <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} disabled={ro}>
              {!almacenes.length && <option value="">— sin almacenes —</option>}
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Tabla de lotes — títulos idénticos al Excel */}
        <div className="table-wrap" style={{ marginTop: '.8rem' }}>
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th colSpan={7} style={{ textAlign: 'center', fontSize: '.72rem', background: 'var(--surface-3)' }}>DATOS DEL LOTE EN EL CENTRO DE ACOPIO</th>
                <th colSpan={4} style={{ textAlign: 'center', fontSize: '.72rem', background: 'var(--primary)', color: '#1c1f24' }}>RECEPCIÓN GOLDEN TOUCH 1127 C.A. · PUERTO ORDAZ</th>
              </tr>
              <tr>
                <th style={thStyle}>{'N° de Lote\nAsignado'}</th>
                <th style={thStyle}>{'Cantidad\nde Bolsas'}</th>
                <th style={thStyle}>{'Peso de Cada\nBolsa Kg'}</th>
                <th style={thStyle}>{'Peso Bruto\nTotal Kg 🧮'}</th>
                <th style={thStyle}>{'Peso Neto\n(Real Pesado Kg)'}</th>
                <th style={thStyle}>{'Diferencia Kg\n(Bruto − Neto) 🧮'}</th>
                <th style={thStyle}>{'Nro. precinto\n(inicio)'}</th>
                <th style={thStyle}>{'Peso Recepcionado\n(C.A. Pto. Ordaz)'}</th>
                <th style={thStyle}>{'Diferencia Kg\n(Neto − Recep.) 🧮'}</th>
                <th style={thStyle}>{'Nro. precinto\n(final)'}</th>
                <th style={thStyle}>{'Verf.\n🧮'}</th>
                {editable && <th style={{ width: 28 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const bruto = n(f.cantidad_bolsas) * n(f.peso_bolsa_kg);
                const dif1 = bruto - n(f.peso_neto_kg);
                const dif2 = n(f.peso_neto_kg) - n(f.peso_recepcionado_kg);
                const v = verf(f);
                const algo = f.cantidad_bolsas || f.peso_neto_kg || f.precinto_inicio || f.peso_recepcionado_kg;
                return (
                  <tr key={i}>
                    <td><input className="input" style={{ width: 52, textAlign: 'center' }} value={f.nro_lote} onChange={(e) => setFila(i, { nro_lote: e.target.value })} disabled={ro} /></td>
                    <td><input className="input mono" style={cellNum} type="number" min={0} step="any" value={f.cantidad_bolsas} onChange={(e) => setFila(i, { cantidad_bolsas: e.target.value })} disabled={ro} /></td>
                    <td><input className="input mono" style={cellNum} type="number" min={0} step="any" value={f.peso_bolsa_kg} onChange={(e) => setFila(i, { peso_bolsa_kg: e.target.value })} disabled={ro} /></td>
                    <td className="mono" style={{ ...calcCol, color: 'var(--primary-3)' }}>{num(bruto)}</td>
                    <td><input className="input mono" style={cellNum} type="number" min={0} step="any" value={f.peso_neto_kg} onChange={(e) => setFila(i, { peso_neto_kg: e.target.value })} disabled={ro} /></td>
                    <td className="mono" style={calcCol}>{num(dif1)}</td>
                    <td><input className="input" style={{ width: 80 }} value={f.precinto_inicio} onChange={(e) => setFila(i, { precinto_inicio: e.target.value })} disabled={ro} /></td>
                    <td><input className="input mono" style={cellNum} type="number" min={0} step="any" value={f.peso_recepcionado_kg} onChange={(e) => setFila(i, { peso_recepcionado_kg: e.target.value })} disabled={ro} /></td>
                    <td className="mono" style={calcCol}>{num(dif2)}</td>
                    <td><input className="input" style={{ width: 80 }} value={f.precinto_final} onChange={(e) => setFila(i, { precinto_final: e.target.value })} disabled={ro} /></td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: algo ? (v ? 'var(--success)' : 'var(--danger)') : 'var(--muted)' }}>{algo ? (v ? 'V' : 'F') : '—'}</td>
                    {editable && <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => delFila(i)} title="Quitar fila">✕</button></td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ textAlign: 'right' }}>TOTALES</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(totales.bolsas)}</td>
                <td></td>
                <td className="mono" style={{ ...calcCol, color: 'var(--primary-3)' }}>{num(totales.bruto)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(totales.neto)}</td>
                <td></td><td></td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(totales.recepcionado)}</td>
                <td></td><td></td><td></td>{editable && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
        {editable && <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={addFila}>+ Agregar lote</button>}

        {/* Firmas */}
        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title" style={{ justifyContent: 'center' }}><span>Conforme Entregado</span></div>
            <div className="form-row"><label>Nombres y Apellidos</label><input className="input" value={entNombre} onChange={(e) => setEntNombre(e.target.value)} disabled={ro} /></div>
            <div className="form-row"><label>N° C.I.</label><input className="input" value={entCi} onChange={(e) => setEntCi(e.target.value)} disabled={ro} /></div>
          </div>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title" style={{ justifyContent: 'center' }}><span>Conforme Recibido por Golden Touch 1127 C.A.</span></div>
            <div className="form-row"><label>Nombres y Apellidos</label><input className="input" value={recNombre} onChange={(e) => setRecNombre(e.target.value)} disabled={ro} /></div>
            <div className="form-row"><label>N° C.I.</label><input className="input" value={recCi} onChange={(e) => setRecCi(e.target.value)} disabled={ro} /></div>
          </div>
        </div>
        <div className="form-row" style={{ marginTop: '.6rem' }}>
          <label>Observaciones</label>
          <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={ro} />
        </div>
      </div>

      {estado === 'cerrada' && (
        <div className="card" style={{ borderColor: 'var(--primary)', marginTop: '.75rem', fontSize: '.85rem' }}>
          ✔ Recepción cerrada · sumó <strong className="mono">{num(recepcion?.mov_cantidad ?? 0)}</strong> al inventario ({recepcion?.mov_almacen}).
        </div>
      )}
      {editable && (
        <p className="muted" style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
          Al cerrar se sumarán <strong className="mono">{num(cantidadStock)} {unidad}</strong> al stock de <strong>{productoSel?.nombre ?? '(elegí producto)'}</strong> en <strong>{almacen || '(elegí almacén)'}</strong>
          {totales.recepcionado <= 0 && totales.neto > 0 && ' · se usa el peso neto porque no hay peso recepcionado.'}
        </p>
      )}
    </Modal>
  );
}
