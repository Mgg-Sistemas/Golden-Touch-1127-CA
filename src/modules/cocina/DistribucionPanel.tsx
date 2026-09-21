/* ============================================================
   Golden Touch · Cocina · Vista «📊 Distribución» del mercado

   Traído de MGG (MercadoPanel → DistribucionPanel, 21/09/2026): el control
   de distribución deja de ser una pantalla aparte y pasa a ser UNA VISTA MÁS
   del panel del mercado, al lado de Disponible / Movimientos / Ambos. Es el
   lugar correcto: se mira el mismo ciclo, con la misma ventana de fechas, sin
   cambiar de pantalla ni volver a elegir el período.

   El motor es el de GT (`controlDistribucion`), no el de MGG, por una razón
   concreta: MGG estima la demanda anual como «consumo ÷ días CON consumo × 365»,
   y eso multiplica el pedido de cualquier víver que se sirva de vez en cuando
   (un producto servido un solo día del ciclo daría 365 raciones al año). GT lo
   anualiza sobre los días del período; ver `demandaAnualEstimada`.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useRealtime } from '@/shared/lib/useRealtime';
import { norm } from '@/shared/lib/texto';
import { mensajeError } from '@/shared/lib/errores';
import { date as fmtDate } from '@/shared/lib/format';
import {
  ESTADO_STOCK_BADGE, ESTADO_STOCK_LABEL, filtrarPorEstado, subtituloFiltro, type FiltroEstado,
} from './controlDistribucion';
import {
  cargarControl, ordenarPorUrgencia, type Control, type ControlProducto,
} from './controlDistribucion.repository';
import { descargarControlDistribucionPdf } from './controlDistribucionPdf';

const num = (v: number, dec = 2) =>
  Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const hoyISO = () => new Date().toISOString().slice(0, 10);

export function DistribucionPanel({ inicioCiclo, onAbrirDetalle }: {
  /** Inicio del mercado abierto (ISO). La vista mira exactamente ese ciclo. */
  inicioCiclo: string;
  /** Abre la pantalla completa (rango libre + registro del conteo físico). */
  onAbrirDetalle: () => void;
}) {
  const desde = (inicioCiclo ?? '').slice(0, 10);
  const hasta = hoyISO();
  const [control, setControl] = useState<Control | null>(null);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [fEstado, setFEstado] = useState<FiltroEstado>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setControl(await cargarControl(desde, hasta));
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cargar la distribución'), 'error');
    }
  }, [desde, hasta]);

  useEffect(() => {
    setLoading(true);
    void recargar().finally(() => setLoading(false));
  }, [recargar]);

  useRealtime(['cocina_movimientos', 'movimientos', 'cocina_conteos', 'cocina_eoq'], () => { void recargar(); });

  // Lo que se ve es exactamente lo que sale en el PDF: primero el estado, después
  // la búsqueda. El orden sigue siendo el de urgencia dentro de lo que quede.
  const productos = useMemo(() => {
    const todos = filtrarPorEstado(ordenarPorUrgencia(control?.productos ?? []), fEstado);
    const q = norm(buscar.trim());
    if (!q) return todos;
    return todos.filter((p) => norm(`${p.nombre} ${p.sku}`).includes(q));
  }, [control, buscar, fEstado]);

  const totales = useMemo(() => {
    const ps = control?.productos ?? [];
    return {
      viveres: ps.length,
      reordenar: ps.filter((p) => p.estado === 'reordenar').length,
      alerta: ps.filter((p) => p.estado === 'alerta').length,
      consumo: Math.round(ps.reduce((a, p) => a + p.totales.consumo, 0) * 100) / 100,
      mermas: Math.round(ps.reduce((a, p) => a + p.totales.merma, 0) * 100) / 100,
      comensales: [...(control?.comensalesPorDia.values() ?? [])].reduce((a, b) => a + b, 0),
    };
  }, [control]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <div className="card-title" style={{ margin: 0 }}>
          Distribución del mercado{' '}
          <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            · registro diario por víver, lote óptimo de compra (EOQ) y punto de reorden · tocá un víver para su hoja
          </span>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-ghost" onClick={onAbrirDetalle}
            title="Elegir otro rango de fechas y registrar el conteo físico">🔍 Rango y conteo</button>
          <button className="btn btn-sm btn-ghost" disabled={!control || !productos.length}
            onClick={() => {
              if (!control) return;
              descargarControlDistribucionPdf(control, null, {
                productos,
                subtitulo: subtituloFiltro(fEstado, buscar),
                sufijoArchivo: fEstado === 'todos' ? '' : fEstado,
              }).catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'));
            }}
            title={fEstado === 'todos' && !buscar.trim()
              ? 'El mercado entero, lo que hay que comprar primero arriba'
              : `Solo los ${productos.length} víveres que se están viendo`}>↓ PDF</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', marginBottom: '.7rem' }}>
        <Tira titulo="Víveres" valor={String(totales.viveres)} />
        <Tira titulo="🚨 Reordenar" valor={String(totales.reordenar)} tono={totales.reordenar ? 'danger' : undefined} />
        <Tira titulo="⚠️ En alerta" valor={String(totales.alerta)} tono={totales.alerta ? 'warning' : undefined} />
        <Tira titulo="Consumo" valor={num(totales.consumo)} />
        <Tira titulo="Merma" valor={num(totales.mermas)} tono={totales.mermas < 0 ? 'danger' : undefined} />
        <Tira titulo="🍽 Comensales" valor={String(totales.comensales)} />
      </div>

      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar víver por nombre o código"
          value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select className="input" style={{ maxWidth: 200 }} value={fEstado}
          onChange={(e) => setFEstado(e.target.value as FiltroEstado)}
          title="Dejar solo los víveres en ese estado: la lista y el PDF salen con eso">
          <option value="todos">Todos los estados</option>
          <option value="reordenar">🚨 Reordenar</option>
          <option value="alerta">⚠️ En alerta</option>
          <option value="normal">✅ Normal</option>
        </select>
        <span className="muted" style={{ fontSize: '.78rem' }}>
          Del {fmtDate(desde)} al {fmtDate(hasta)}
          {fEstado !== 'todos' && ` · ${productos.length} de ${totales.viveres}`}
        </span>
      </div>

      {loading && <p className="muted">Cargando…</p>}
      {!loading && !productos.length && (
        <EmptyState message={fEstado === 'todos'
          ? 'No hay víveres con movimiento en este ciclo'
          : 'Ningún víver en ese estado'} />
      )}

      {!loading && !!productos.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>Víver</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>Consumo</th>
                <th style={{ textAlign: 'right' }}>Prom./día</th>
                <th style={{ textAlign: 'right' }}>Ratio</th>
                <th style={{ textAlign: 'right' }}>Merma</th>
                <th style={{ textAlign: 'right' }}>Reorden</th>
                <th style={{ textAlign: 'right' }}>Lote EOQ</th>
                <th style={{ textAlign: 'right' }}>Ciclo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <FilaViver key={p.producto_id} p={p}
                  abierto={abierto === p.producto_id}
                  onToggle={() => setAbierto((x) => (x === p.producto_id ? null : p.producto_id))} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
        <strong>Reorden</strong> = con ese stock hay que volver a pedir (demanda diaria × días de entrega).
        <strong> Lote EOQ</strong> = cuántas unidades conviene pedir de una vez. Un guion significa que el víver
        todavía no tiene consumo en el ciclo: sin consumo no hay demanda que estimar.
      </small>
    </div>
  );
}

function Tira({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'danger' | 'warning' }) {
  const color = tono === 'danger' ? 'var(--danger)' : tono === 'warning' ? 'var(--warning, #b8860b)' : undefined;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '.5rem', padding: '.4rem .6rem' }}>
      <div className="muted" style={{ fontSize: '.72rem' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{valor}</div>
    </div>
  );
}

function FilaViver({ p, abierto, onToggle }: { p: ControlProducto; abierto: boolean; onToggle: () => void }) {
  const unidad = p.unidad ?? '';
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }} title="Ver el registro diario de este víver">
        <td>
          <strong>{abierto ? '▾' : '▸'} {p.nombre}</strong>
          <div className="muted" style={{ fontSize: '.72rem' }}>{p.sku}{unidad ? ` · ${unidad}` : ''}</div>
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
        <td className="mono" style={{ textAlign: 'right' }}>{p.cicloDias ? `${p.cicloDias} d` : '—'}</td>
        <td><span className={ESTADO_STOCK_BADGE[p.estado]}>{ESTADO_STOCK_LABEL[p.estado].split(' (')[0]}</span></td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={10} style={{ background: 'var(--bg-soft, rgba(127,127,127,.06))' }}>
            <div style={{ padding: '.4rem .2rem' }}>
              <div className="muted" style={{ fontSize: '.76rem', marginBottom: '.4rem' }}>
                Demanda anual (D): <strong>{num(p.demandaAnual)}</strong>{' '}
                {p.demandaEstimada ? '(estimada del consumo del período)' : '(fijada a mano)'} ·
                {' '}${num(p.costoOrden)} por orden · ${num(p.costoAlmacenar)} unidad/año ·
                {' '}entrega {p.leadTimeDias} días · {num(p.ordenesPorAno)} órdenes/año
              </div>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: '.78rem' }}>
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
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
