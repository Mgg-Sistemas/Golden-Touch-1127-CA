/* ============================================================
   Golden Touch · Cocina · Control de distribución (pantalla)

   La hoja «Control de consumo de pollo», pero para TODO el mercado.

   La hoja traía una pestaña por cocina y una sola columna de producto (el
   pollo). Acá el mercado son ~70 productos, así que se lee en dos niveles:

     1. EL MERCADO ENTERO, ordenado por urgencia: lo que hay que comprar
        primero arriba. Es la pregunta que se hace todos los días.
     2. LA HOJA DEL PRODUCTO, idéntica a la original: las cuatro tarjetas
        (stock, consumo, merma y ratio, lote EOQ), los parámetros del EOQ, el
        registro del día y la tabla diaria.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { norm } from '@/shared/lib/texto';
import { mensajeError } from '@/shared/lib/errores';
import { date as fmtDate } from '@/shared/lib/format';
import {
  ESTADO_STOCK_BADGE, ESTADO_STOCK_LABEL, diasEntre, filtrarDistribucion, subtituloFiltro,
  type FiltroDistribucion,
} from './controlDistribucion';
import {
  cargarControl, guardarConteo, guardarParametroProducto, guardarParametrosGenerales,
  ordenarPorUrgencia, type Control, type ControlProducto, type ParametrosGenerales,
} from './controlDistribucion.repository';
import { descargarControlDistribucionPdf } from './controlDistribucionPdf';

/** Días que muestra la hoja original. Se mantiene como arranque. */
const DIAS_VISTA = 12;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const num = (v: number, dec = 2) =>
  Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export function ControlDistribucionModal({ onClose }: { onClose: () => void }) {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('cocina', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [desde, setDesde] = useState(() => haceDias(DIAS_VISTA - 1));
  const [hasta, setHasta] = useState(hoyISO);
  const [control, setControl] = useState<Control | null>(null);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [fEstado, setFEstado] = useState<FiltroDistribucion>('todos');
  const [selId, setSelId] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setControl(await cargarControl(desde, hasta));
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cargar el control'), 'error');
    }
  }, [desde, hasta]);

  useEffect(() => {
    setLoading(true);
    void recargar().finally(() => setLoading(false));
  }, [recargar]);

  // Lo que mueve el control: las comidas, el kardex y los conteos de otros usuarios.
  useRealtime(['cocina_movimientos', 'movimientos', 'cocina_conteos', 'cocina_eoq'], () => { void recargar(); });

  // Lo que se ve es lo que sale en el PDF: primero el recorte, después la búsqueda.
  const productos = useMemo(() => {
    const todos = filtrarDistribucion(ordenarPorUrgencia(control?.productos ?? []), fEstado);
    const q = norm(buscar.trim());
    if (!q) return todos;
    return todos.filter((p) => norm(`${p.nombre} ${p.sku}`).includes(q));
  }, [control, buscar, fEstado]);

  const sel = useMemo(
    () => control?.productos.find((p) => p.producto_id === selId) ?? null,
    [control, selId],
  );

  const resumen = useMemo(() => {
    const ps = control?.productos ?? [];
    return {
      total: ps.length,
      reordenar: ps.filter((p) => p.estado === 'reordenar').length,
      alerta: ps.filter((p) => p.estado === 'alerta').length,
      comensales: [...(control?.comensalesPorDia.values() ?? [])].reduce((a, b) => a + b, 0),
    };
  }, [control]);

  return (
    <Modal
      title={sel ? `📋 ${sel.nombre}` : '📊 Control de distribución (mercado)'}
      size="xl"
      onClose={onClose}
      footer={
        <>
          {sel && <button className="btn btn-ghost" onClick={() => setSelId(null)}>← Volver al mercado</button>}
          <button
            className="btn btn-ghost"
            disabled={!control || !productos.length}
            onClick={() => {
              if (!control) return;
              descargarControlDistribucionPdf(control, sel ?? null, {
                productos,
                subtitulo: subtituloFiltro(fEstado, buscar),
                sufijoArchivo: fEstado === 'todos' ? '' : fEstado,
              }).catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'));
            }}
            title={sel || (fEstado === 'todos' && !buscar.trim())
              ? undefined
              : `Solo los ${productos.length} productos que se están viendo`}
          >↓ PDF</button>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </>
      }
    >
      <p className="hint muted" style={{ marginTop: 0 }}>
        El mismo control de la hoja de consumo, producto por producto: <strong>inventario inicial, entradas,
        consumo, inventario teórico, conteo físico, merma, comensales y ratio</strong>, más el <strong>lote
        óptimo de compra (EOQ)</strong> y el <strong>punto de reorden</strong>. Todo sale del inventario y de
        las comidas ya registradas; lo único que se carga a mano es el <strong>conteo físico</strong>, y es opcional.
      </p>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '.75rem' }}>
        <label style={{ display: 'grid', gap: '.2rem' }}>
          <span className="muted" style={{ fontSize: '.78rem' }}>Desde</span>
          <input className="input" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: '.2rem' }}>
          <span className="muted" style={{ fontSize: '.78rem' }}>Hasta</span>
          <input className="input" type="date" value={hasta} min={desde} max={hoyISO()} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {!sel && (
          <label style={{ display: 'grid', gap: '.2rem', flex: '1 1 220px' }}>
            <span className="muted" style={{ fontSize: '.78rem' }}>Buscar producto</span>
            <input className="input" placeholder="Nombre o código" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </label>
        )}
        {!sel && (
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted" style={{ fontSize: '.78rem' }}>Estado</span>
            <select className="input" value={fEstado} onChange={(e) => setFEstado(e.target.value as FiltroDistribucion)}
              title="Dejar solo esos productos: la lista y el PDF salen con eso">
              <option value="todos">Todos</option>
              <option value="reordenar">🚨 Reordenar</option>
              <option value="alerta">⚠️ En alerta</option>
              <option value="normal">✅ Normal</option>
              <option value="con-consumo">Con consumo</option>
              <option value="con-merma">Con merma</option>
            </select>
          </label>
        )}
        <span className="muted" style={{ fontSize: '.8rem', paddingBottom: '.55rem' }}>
          {diasEntre(desde, hasta).length} días · {resumen.comensales} comensales
        </span>
      </div>

      {loading && <p className="muted">Cargando…</p>}

      {!loading && !sel && (
        <VistaMercado
          productos={productos}
          resumen={resumen}
          generales={control?.generales ?? null}
          canWrite={canWrite}
          actor={actor}
          onSel={setSelId}
          onGuardadoGenerales={() => { void recargar(); }}
        />
      )}

      {!loading && sel && (
        <HojaProducto
          p={sel}
          canWrite={canWrite}
          actor={actor}
          actorName={actorName}
          onCambio={() => { void recargar(); }}
        />
      )}
    </Modal>
  );
}

/* ───────── Nivel 1: el mercado entero ───────── */

function VistaMercado({ productos, resumen, generales, canWrite, actor, onSel, onGuardadoGenerales }: {
  productos: ControlProducto[];
  resumen: { total: number; reordenar: number; alerta: number; comensales: number };
  generales: ParametrosGenerales | null;
  canWrite: boolean;
  actor: string;
  onSel: (id: string) => void;
  onGuardadoGenerales: () => void;
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem', marginBottom: '.9rem' }}>
        <Tarjeta titulo="🛒 Productos del mercado" valor={String(resumen.total)} />
        <Tarjeta titulo="🚨 Hay que reordenar" valor={String(resumen.reordenar)} tono={resumen.reordenar ? 'danger' : undefined} />
        <Tarjeta titulo="⚠️ En alerta" valor={String(resumen.alerta)} tono={resumen.alerta ? 'warning' : undefined} />
        <Tarjeta titulo="🍽 Comensales del período" valor={String(resumen.comensales)} />
      </div>

      {generales && <ParametrosGeneralesCard generales={generales} canWrite={canWrite} actor={actor} onGuardado={onGuardadoGenerales} />}

      {!productos.length && <EmptyState message="No hay productos de mercado para este período" />}

      {!!productos.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>Consumo</th>
                <th style={{ textAlign: 'right' }}>Prom./día</th>
                <th style={{ textAlign: 'right' }}>Ratio</th>
                <th style={{ textAlign: 'right' }}>Merma</th>
                <th style={{ textAlign: 'right' }}>Reorden</th>
                <th style={{ textAlign: 'right' }}>Lote EOQ</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Hoja</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.producto_id}>
                  <td>
                    <strong>{p.nombre}</strong>
                    <div className="muted" style={{ fontSize: '.72rem' }}>{p.sku}{p.unidad ? ` · ${p.unidad}` : ''}</div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(p.stockActual)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(p.totales.consumo)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(p.totales.promedioDiario)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(p.totales.ratioPromedio, 3)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: p.totales.merma < 0 ? 'var(--danger)' : undefined }}>
                    {num(p.totales.merma)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{p.puntoReorden || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{p.lote || '—'}</td>
                  <td><span className={ESTADO_STOCK_BADGE[p.estado]}>{ESTADO_STOCK_LABEL[p.estado]}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => onSel(p.producto_id)}>📋 Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
        <strong>Reorden</strong> = con ese stock hay que volver a pedir (demanda diaria × días de entrega).
        <strong> Lote EOQ</strong> = cuántas unidades conviene pedir de una vez. Un guion significa que el producto
        todavía no tiene consumo registrado en el período: sin consumo no hay demanda que estimar, y un lote inventado
        sería peor que ninguno.
      </small>
    </>
  );
}

function Tarjeta({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'danger' | 'warning' }) {
  const color = tono === 'danger' ? 'var(--danger)' : tono === 'warning' ? 'var(--warning, #b8860b)' : undefined;
  return (
    <div className="card" style={{ padding: '.6rem .8rem' }}>
      <div className="muted" style={{ fontSize: '.75rem' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700, color }}>{valor}</div>
    </div>
  );
}

function ParametrosGeneralesCard({ generales, canWrite, actor, onGuardado }: {
  generales: ParametrosGenerales; canWrite: boolean; actor: string; onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [s, setS] = useState(String(generales.costoOrden));
  const [h, setH] = useState(String(generales.costoAlmacenar));
  const [l, setL] = useState(String(generales.leadTimeDias));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setS(String(generales.costoOrden)); setH(String(generales.costoAlmacenar)); setL(String(generales.leadTimeDias));
  }, [generales]);

  const guardar = async () => {
    setSaving(true);
    try {
      await guardarParametrosGenerales({
        costoOrden: Number(s.replace(',', '.')),
        costoAlmacenar: Number(h.replace(',', '.')),
        leadTimeDias: Number(l),
      }, actor);
      toast('Parámetros del EOQ actualizados', 'success');
      setAbierto(false);
      onGuardado();
    } catch (e) {
      toast(mensajeError(e, 'No se pudieron guardar los parámetros'), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom: '.9rem', padding: '.6rem .8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="muted" style={{ fontSize: '.82rem' }}>
          ⚙️ Parámetros del EOQ (para todo el mercado):
          {' '}<strong>${num(generales.costoOrden)}</strong> por orden ·
          {' '}<strong>${num(generales.costoAlmacenar)}</strong> por unidad/año ·
          {' '}entrega en <strong>{generales.leadTimeDias}</strong> días
        </div>
        {canWrite && (
          <button className="btn btn-sm btn-ghost" onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Cancelar' : '✏ Cambiar'}
          </button>
        )}
      </div>
      {abierto && canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '.6rem' }}>
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted" style={{ fontSize: '.75rem' }}>Costo por orden ($)</span>
            <input className="input" inputMode="decimal" value={s} onChange={(e) => setS(e.target.value)} style={{ width: 120 }} />
          </label>
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted" style={{ fontSize: '.75rem' }}>Almacenar ($/unidad·año)</span>
            <input className="input" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} style={{ width: 150 }} />
          </label>
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted" style={{ fontSize: '.75rem' }}>Entrega (días)</span>
            <input className="input" type="number" min={0} value={l} onChange={(e) => setL(e.target.value)} style={{ width: 110 }} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void guardar()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── Nivel 2: la hoja de un producto ───────── */

function HojaProducto({ p, canWrite, actor, actorName, onCambio }: {
  p: ControlProducto; canWrite: boolean; actor: string; actorName: string | null; onCambio: () => void;
}) {
  const unidad = p.unidad ?? 'UND';
  const ultimo = p.dias.length ? p.dias[p.dias.length - 1] : null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.6rem', marginBottom: '.9rem' }}>
        <div className="card" style={{ padding: '.6rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.75rem' }}>📦 STOCK ACTUAL</div>
          <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700 }}>{num(p.stockActual)} {unidad}</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Pto. reorden: {p.puntoReorden || '—'} {unidad}</div>
          <div style={{ marginTop: '.3rem' }}><span className={ESTADO_STOCK_BADGE[p.estado]}>{ESTADO_STOCK_LABEL[p.estado]}</span></div>
        </div>
        <div className="card" style={{ padding: '.6rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.75rem' }}>🍽 CONSUMO TOTAL</div>
          <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700 }}>{num(p.totales.consumo)} {unidad}</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Prom: {num(p.totales.promedioDiario)} {unidad}/día</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Días con consumo: {p.totales.diasConConsumo} / {p.dias.length}</div>
        </div>
        <div className="card" style={{ padding: '.6rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.75rem' }}>📉 MERMA Y RATIO</div>
          <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700, color: p.totales.merma < 0 ? 'var(--danger)' : undefined }}>
            {num(p.totales.merma)} {unidad}
          </div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Ratio prom: {num(p.totales.ratioPromedio, 3)} {unidad}/com.</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Comensales: {p.totales.comensales}</div>
        </div>
        <div className="card" style={{ padding: '.6rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.75rem' }}>🎯 LOTE EOQ</div>
          <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700 }}>{p.lote || '—'} {p.lote ? unidad : ''}</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Ciclo: {p.cicloDias || '—'} días</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Frecuencia: {num(p.ordenesPorAno)} órd./año</div>
        </div>
      </div>

      <ParametrosProductoCard p={p} canWrite={canWrite} actor={actor} actorName={actorName} onGuardado={onCambio} />

      {canWrite && <RegistroDiario p={p} actor={actor} actorName={actorName} onGuardado={onCambio} />}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th style={{ textAlign: 'right' }}>Inv. inicial</th>
              <th style={{ textAlign: 'right' }}>Entradas</th>
              <th style={{ textAlign: 'right' }}>Consumo</th>
              <th style={{ textAlign: 'right' }}>Otras salidas</th>
              <th style={{ textAlign: 'right' }}>Inv. teórico</th>
              <th style={{ textAlign: 'right' }}>Inv. físico</th>
              <th style={{ textAlign: 'right' }}>Merma</th>
              <th style={{ textAlign: 'right' }}>Comensales</th>
              <th style={{ textAlign: 'right' }}>Ratio</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {p.dias.map((d) => (
              <tr key={d.fecha}>
                <td>{fmtDate(d.fecha)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(d.invInicial)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.entradas ? num(d.entradas) : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.consumo ? num(d.consumo) : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.otrasSalidas ? num(d.otrasSalidas) : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(d.invTeorico)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.invFisico == null ? '—' : num(d.invFisico)}</td>
                <td className="mono" style={{ textAlign: 'right', color: (d.diferencia ?? 0) < 0 ? 'var(--danger)' : undefined }}>
                  {d.diferencia == null ? '—' : num(d.diferencia)}
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.comensales || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{d.comensales ? num(d.ratio, 3) : '—'}</td>
                <td><span className={ESTADO_STOCK_BADGE[d.estado]}>{ESTADO_STOCK_LABEL[d.estado].split(' (')[0]}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>TOTAL</td>
              <td></td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(p.totales.entradas)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(p.totales.consumo)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(p.totales.otrasSalidas)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{ultimo ? num(ultimo.invTeorico) : '—'}</td>
              <td></td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(p.totales.merma)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{p.totales.comensales}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(p.totales.ratioGlobal, 3)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
        <strong>Consumo</strong> es lo que se fue en comidas registradas; <strong>otras salidas</strong> es lo que
        bajó el inventario sin ser una comida (salida manual, ajuste, traslado) y por eso va en su propia columna.
        La <strong>merma</strong> es el conteo físico menos el teórico: aparece solo los días que se contó, y el día
        siguiente <strong>abre con lo contado</strong>, para que el error no se arrastre.
      </small>
    </>
  );
}

function ParametrosProductoCard({ p, canWrite, actor, actorName, onGuardado }: {
  p: ControlProducto; canWrite: boolean; actor: string; actorName: string | null; onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setD(p.demandaEstimada ? '' : String(p.demandaAnual)); setAbierto(false); }, [p]);

  const guardar = async () => {
    setSaving(true);
    try {
      const limpio = d.trim().replace(',', '.');
      await guardarParametroProducto({
        producto_id: p.producto_id,
        costo_orden: null, costo_almacenar: null, lead_time_dias: null,
        demanda_anual: limpio ? Number(limpio) : null,
      }, actor, actorName);
      toast(limpio ? 'Demanda anual fijada' : 'Vuelve a estimarse del consumo real', 'success');
      setAbierto(false);
      onGuardado();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo guardar'), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom: '.8rem', padding: '.6rem .8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="muted" style={{ fontSize: '.82rem' }}>
          Demanda anual (D): <strong>{num(p.demandaAnual)}</strong>{' '}
          {p.demandaEstimada
            ? <em>estimada: lo consumido en el período llevado a un año</em>
            : <em>fijada a mano</em>}
          {' · '}${num(p.costoOrden)} por orden · ${num(p.costoAlmacenar)} unidad/año · entrega {p.leadTimeDias} días
        </div>
        {canWrite && (
          <button className="btn btn-sm btn-ghost" onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Cancelar' : '✏ Fijar demanda'}
          </button>
        )}
      </div>
      {abierto && canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '.6rem' }}>
          <label style={{ display: 'grid', gap: '.2rem' }}>
            <span className="muted" style={{ fontSize: '.75rem' }}>Demanda anual (vacío = estimarla)</span>
            <input className="input" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} style={{ width: 170 }} placeholder="Estimada" />
          </label>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void guardar()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

function RegistroDiario({ p, actor, actorName, onGuardado }: {
  p: ControlProducto; actor: string; actorName: string | null; onGuardado: () => void;
}) {
  const [fecha, setFecha] = useState(hoyISO);
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);

  const filaDelDia = p.dias.find((x) => x.fecha === fecha) ?? null;
  const teorico = filaDelDia?.invTeorico ?? null;
  const contado = cantidad.trim() === '' ? null : Number(cantidad.replace(',', '.'));
  const mermaPrevia = contado != null && Number.isFinite(contado) && teorico != null
    ? Math.round((contado - teorico) * 100) / 100
    : null;

  const guardar = async () => {
    setSaving(true);
    try {
      await guardarConteo({
        productoId: p.producto_id, fecha,
        cantidad: Number(cantidad.replace(',', '.')),
        nota, actor, actorName,
      });
      toast('Conteo registrado', 'success');
      setCantidad(''); setNota('');
      onGuardado();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo registrar el conteo'), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom: '.9rem', padding: '.6rem .8rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div className="card-title" style={{ marginBottom: '.4rem' }}><span>📋 Registro diario · conteo físico</span></div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: '.2rem' }}>
          <span className="muted" style={{ fontSize: '.75rem' }}>Fecha</span>
          <input className="input" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: '.2rem' }}>
          <span className="muted" style={{ fontSize: '.75rem' }}>Inv. físico real ({p.unidad ?? 'UND'})</span>
          <input className="input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: 150 }} />
        </label>
        <label style={{ display: 'grid', gap: '.2rem', flex: '1 1 200px' }}>
          <span className="muted" style={{ fontSize: '.75rem' }}>Nota (opcional)</span>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué explica la diferencia" />
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={saving || cantidad.trim() === '' || !Number.isFinite(Number(cantidad.replace(',', '.')))}
          onClick={() => void guardar()}
        >{saving ? 'Guardando…' : 'Registrar conteo'}</button>
      </div>
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.4rem' }}>
        {teorico == null
          ? 'Ese día está fuera del período mostrado; ampliá el rango para ver la cuenta.'
          : <>Inventario teórico de ese día: <strong>{num(teorico)}</strong>.{' '}
            {mermaPrevia == null
              ? 'Al escribir el conteo se muestra la diferencia.'
              : <>Diferencia: <strong style={{ color: mermaPrevia < 0 ? 'var(--danger)' : undefined }}>{num(mermaPrevia)}</strong>{mermaPrevia < 0 ? ' (falta)' : mermaPrevia > 0 ? ' (sobra)' : ' (cuadra)'}.</>}
          </>}
        {filaDelDia?.invFisico != null && <> Ya hay un conteo de <strong>{num(filaDelDia.invFisico)}</strong> ese día: registrar otro lo corrige.</>}
      </div>
    </div>
  );
}
