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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useRealtime } from '@/shared/lib/useRealtime';
import { norm } from '@/shared/lib/texto';
import { mensajeError } from '@/shared/lib/errores';
import { date as fmtDate } from '@/shared/lib/format';
import {
  ESTADO_STOCK_BADGE, ESTADO_STOCK_LABEL, filtrarDistribucion, subtituloFiltro,
  type FiltroDistribucion,
} from './controlDistribucion';
import {
  cargarControl, ordenarPorUrgencia, type Control, type ControlProducto,
} from './controlDistribucion.repository';
import { descargarControlDistribucionPdf } from './controlDistribucionPdf';
import { DetalleMovimientosReporte } from './DetalleMovimientosReporte';
import { filtrarViveres, rangoValido } from './detalleDistribucion';

const num = (v: number, dec = 2) =>
  Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const hoyISO = () => new Date().toISOString().slice(0, 10);

export function DistribucionPanel({ inicioCiclo, saldoCiclo, onAbrirDetalle }: {
  /** Inicio del mercado abierto (ISO). La vista arranca en ese ciclo. */
  inicioCiclo: string;
  /**
   * El saldo inicial que el mercado dejó anotado al abrirse: el «principio» del
   * ciclo. Mientras el reporte arranque donde arrancó el ciclo, de aquí sale lo que
   * HABÍA, para que dé exactamente lo mismo que el panel y que el histórico del
   * cierre («había» = principio + entradas).
   */
  saldoCiclo?: { producto_id: string; cantidad: number }[] | null;
  /** Abre la pantalla completa (rango libre + registro del conteo físico). */
  onAbrirDetalle: () => void;
}) {
  // El rango arranca en el ciclo abierto, que es lo que se mira todos los días, y
  // se puede mover: el reporte sirve igual para un mes cerrado o para una semana.
  const delCiclo = useMemo(
    () => ({ desde: (inicioCiclo ?? '').slice(0, 10), hasta: hoyISO() }),
    [inicioCiclo],
  );
  const [rango, setRango] = useState(delCiclo);
  // Si se abre otro mercado, el rango vuelve al ciclo nuevo: dejarlo en el viejo
  // mostraría un reporte de otro ciclo sin avisar.
  const cicloVisto = useRef(delCiclo.desde);
  useEffect(() => {
    if (cicloVisto.current === delCiclo.desde) return;
    cicloVisto.current = delCiclo.desde;
    setRango(delCiclo);
  }, [delCiclo]);
  const { desde, hasta } = rangoValido(rango.desde, rango.hasta, delCiclo);
  const esDelCiclo = desde === delCiclo.desde && hasta === delCiclo.hasta;
  const [control, setControl] = useState<Control | null>(null);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [fEstado, setFEstado] = useState<FiltroDistribucion>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);

  // El saldo guardado solo vale si el reporte arranca donde arrancó el ciclo: en un
  // rango elegido a mano ese saldo es de otro día y hay que deducirlo del kardex.
  const aperturas = useMemo(() => {
    if (desde !== delCiclo.desde || !saldoCiclo?.length) return null;
    return new Map(saldoCiclo.map((s) => [s.producto_id, Number(s.cantidad) || 0]));
  }, [desde, delCiclo.desde, saldoCiclo]);

  const recargar = useCallback(async () => {
    try {
      // Con el saldo guardado, el kardex cuenta desde el instante del ciclo: lo de antes ya está en el saldo.
      setControl(await cargarControl(desde, hasta, { aperturas, desdeInstante: aperturas ? inicioCiclo : null }));
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cargar la distribución'), 'error');
    }
  }, [desde, hasta, aperturas, inicioCiclo]);

  useEffect(() => {
    setLoading(true);
    void recargar().finally(() => setLoading(false));
  }, [recargar]);

  useRealtime(['cocina_movimientos', 'movimientos', 'cocina_conteos', 'cocina_eoq'], () => { void recargar(); });

  // Lo que se ve es exactamente lo que sale en el PDF: primero el recorte, después
  // la búsqueda. El orden sigue siendo el de urgencia dentro de lo que quede.
  const productos = useMemo(() => {
    const todos = filtrarDistribucion(ordenarPorUrgencia(control?.productos ?? []), fEstado);
    const q = norm(buscar.trim());
    if (!q) return todos;
    return todos.filter((p) => norm(`${p.nombre} ${p.sku}`).includes(q));
  }, [control, buscar, fEstado]);

  // La ecuación del período para TODO el mercado: lo que había, lo que se consumió,
  // lo que sacó o corrigió Inventario, y lo que queda. Es el resumen que se pidió.
  const totales = useMemo(() => {
    const ps = control?.productos ?? [];
    const suma = (f: (p: ControlProducto) => number) =>
      Math.round(ps.reduce((a, p) => a + f(p), 0) * 100) / 100;
    return {
      viveres: ps.length,
      reordenar: ps.filter((p) => p.estado === 'reordenar').length,
      alerta: ps.filter((p) => p.estado === 'alerta').length,
      habia: suma((p) => p.totales.disponible),
      consumo: suma((p) => p.totales.consumo),
      salidas: suma((p) => p.totales.salidas),
      ajustes: suma((p) => p.totales.ajustes),
      queda: suma((p) => p.totales.invFinal),
      mermas: suma((p) => p.totales.merma),
      comensales: [...(control?.comensalesPorDia.values() ?? [])].reduce((a, b) => a + b, 0),
    };
  }, [control]);

  // El detalle sigue el recorte de arriba. Un conjunto vacío significa «todos», así
  // que sin recorte no se arma nada.
  const idsVisibles = useMemo(
    () => new Set(productos.length === (control?.productos.length ?? 0) ? [] : productos.map((p) => p.producto_id)),
    [productos, control],
  );

  /** Los totales de lo que se está viendo, para el pie de la tabla. */
  const totalesVista = useMemo(() => {
    const suma = (f: (p: ControlProducto) => number) =>
      Math.round(productos.reduce((a, p) => a + f(p), 0) * 100) / 100;
    return {
      habia: suma((p) => p.totales.disponible),
      consumo: suma((p) => p.totales.consumo),
      salidas: suma((p) => p.totales.salidas),
      ajustes: suma((p) => p.totales.ajustes),
      merma: suma((p) => p.totales.merma),
      queda: suma((p) => p.totales.invFinal),
    };
  }, [productos]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <div className="card-title" style={{ margin: 0 }}>
          Distribución del mercado{' '}
          <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            · lo que había, lo consumido, lo que sacó Inventario y lo que queda · toca un víver para su hoja
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
                // El papel lleva el mismo detalle que la pantalla: si arriba quedaron
                // los víveres con ajustes, el detalle es el de esos víveres.
                detalle: filtrarViveres(control.detalle, idsVisibles),
              }).catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'));
            }}
            title={fEstado === 'todos' && !buscar.trim()
              ? 'El resumen del mercado entero y el detalle de sus movimientos'
              : `Solo los ${productos.length} víveres que se están viendo, con su detalle`}>↓ PDF</button>
        </div>
      </div>

      {/* Las tarjetas son el filtro: tocar una deja abajo los víveres que la componen,
          y volver a tocarla muestra el mercado entero. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', marginBottom: '.7rem' }}>
        <Tira titulo="Víveres" valor={String(totales.viveres)} filtro="todos" activo={fEstado} onFiltrar={setFEstado}
          ayuda="Ver el mercado entero" />
        <Tira titulo="🚨 Reordenar" valor={String(totales.reordenar)} tono={totales.reordenar ? 'danger' : undefined}
          filtro="reordenar" activo={fEstado} onFiltrar={setFEstado} ayuda="Ver solo los víveres por reordenar" />
        <Tira titulo="⚠️ En alerta" valor={String(totales.alerta)} tono={totales.alerta ? 'warning' : undefined}
          filtro="alerta" activo={fEstado} onFiltrar={setFEstado} ayuda="Ver solo los víveres en alerta" />
        <Tira titulo="📦 Había" valor={num(totales.habia)}
          ayuda="Con lo que abrió el período más todo lo que entró después" />
        <Tira titulo="🍽 Consumido" valor={num(totales.consumo)}
          filtro="con-consumo" activo={fEstado} onFiltrar={setFEstado} ayuda="Ver de qué víveres sale ese consumo" />
        <Tira titulo="📤 Salidas inv." valor={num(totales.salidas)} tono={totales.salidas > 0 ? 'warning' : undefined}
          filtro="con-salidas" activo={fEstado} onFiltrar={setFEstado}
          ayuda="Lo que sacó Inventario sin ser una comida. Ver de qué víveres sale" />
        <Tira titulo="✏️ Ajustes" valor={num(totales.ajustes)} tono={totales.ajustes > 0 ? 'warning' : undefined}
          filtro="con-ajustes" activo={fEstado} onFiltrar={setFEstado}
          ayuda="Lo que Inventario corrigió a la baja. Ver de qué víveres sale" />
        <Tira titulo="✅ Queda" valor={num(totales.queda)}
          ayuda="Lo que queda al cierre del período" />
        <Tira titulo="Merma" valor={num(totales.mermas)} tono={totales.mermas < 0 ? 'danger' : undefined}
          filtro="con-merma" activo={fEstado} onFiltrar={setFEstado} ayuda="Ver qué víveres tienen merma" />
        <Tira titulo="🍽 Comensales" valor={String(totales.comensales)} />
      </div>

      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <span className="muted" style={{ fontSize: '.75rem' }}>Desde</span>
          <input className="input" type="date" style={{ maxWidth: 150 }} value={rango.desde}
            max={rango.hasta || undefined}
            onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <span className="muted" style={{ fontSize: '.75rem' }}>Hasta</span>
          <input className="input" type="date" style={{ maxWidth: 150 }} value={rango.hasta}
            min={rango.desde || undefined} max={hoyISO()}
            onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
        </label>
        {!esDelCiclo && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRango(delCiclo)}
            title="Volver al mercado abierto">↺ Al ciclo</button>
        )}
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar víver por nombre o código"
          value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select className="input" style={{ maxWidth: 210 }} value={fEstado}
          onChange={(e) => setFEstado(e.target.value as FiltroDistribucion)}
          title="Dejar solo esos víveres: la lista y el PDF salen con eso">
          <option value="todos">Todo el mercado</option>
          <option value="reordenar">🚨 Reordenar</option>
          <option value="alerta">⚠️ En alerta</option>
          <option value="normal">✅ Normal</option>
          <option value="con-consumo">Con consumo</option>
          <option value="con-salidas">Con salidas de inventario</option>
          <option value="con-ajustes">Con ajustes manuales</option>
          <option value="con-merma">Con merma</option>
        </select>
        <span className="muted" style={{ fontSize: '.78rem' }}>
          Del {fmtDate(desde)} al {fmtDate(hasta)} · {esDelCiclo ? 'el ciclo abierto' : 'rango elegido'}
          {fEstado !== 'todos' && ` · ${productos.length} de ${totales.viveres}`}
        </span>
      </div>

      {loading && <p className="muted">Cargando…</p>}
      {!loading && !productos.length && (
        <EmptyState message={fEstado === 'todos'
          ? 'No hay víveres con movimiento en este ciclo'
          : 'Ningún víver entra en ese recorte'} />
      )}

      {!loading && !!productos.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>Víver</th>
                <th style={{ textAlign: 'right' }} title="Saldo inicial + entradas del período">Había</th>
                <th style={{ textAlign: 'right' }} title="Lo que se fue en comidas registradas">Consumido</th>
                <th style={{ textAlign: 'right' }} title="Lo que sacó Inventario sin ser una comida">Salidas inv.</th>
                <th style={{ textAlign: 'right' }} title="Lo que Inventario corrigió a la baja">Ajustes</th>
                <th style={{ textAlign: 'right' }} title="Lo que queda al cierre del período">Queda</th>
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
            {/* El resumen de lo que se está viendo. Son unidades de víveres distintos, así
                que la suma sirve para cotejar contra el panel, no como una cantidad sola. */}
            <tfoot>
              <tr>
                <th style={{ textAlign: 'left' }}>
                  TOTAL{productos.length !== totales.viveres ? ` (${productos.length} víveres)` : ''}
                </th>
                <th className="mono" style={{ textAlign: 'right' }}>{num(totalesVista.habia)}</th>
                <th className="mono" style={{ textAlign: 'right' }}>{num(totalesVista.consumo)}</th>
                <th className="mono" style={{ textAlign: 'right' }}>{num(totalesVista.salidas)}</th>
                <th className="mono" style={{ textAlign: 'right' }}>{num(totalesVista.ajustes)}</th>
                <th className="mono" style={{ textAlign: 'right' }}>{num(totalesVista.queda)}</th>
                <th colSpan={3} className="mono" style={{ textAlign: 'right' }}>{num(totalesVista.merma)}</th>
                <th colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && !!control && (
        <DetalleMovimientosReporte filas={control.detalle} idsVisibles={idsVisibles}
          recorte={subtituloFiltro(fEstado, buscar) || undefined} />
      )}

      <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
        <strong>Había</strong> es el saldo con el que abrió el período más todo lo que entró después;
        de ahí sale lo <strong>consumido</strong> en comidas, las <strong>salidas</strong> que hizo Inventario
        (salida de material, salida manual) y los <strong>ajustes</strong> con los que Inventario corrigió el
        stock a la baja. Lo que sobra es lo que <strong>queda</strong>.
        <br />
        <strong>Reorden</strong> = con ese stock hay que volver a pedir (demanda diaria × días de entrega).
        <strong> Lote EOQ</strong> = cuántas unidades conviene pedir de una vez. Un guion significa que el víver
        todavía no tiene consumo en el ciclo: sin consumo no hay demanda que estimar.
      </small>
    </div>
  );
}

/**
 * Una tarjeta del resumen. Con `filtro` se vuelve un botón: al tocarla, la lista
 * de abajo se queda con los víveres que forman ese número, y al tocarla de nuevo
 * (o al tocar «Víveres») se vuelve al mercado entero.
 */
function Tira({ titulo, valor, tono, filtro, activo, onFiltrar, ayuda }: {
  titulo: string;
  valor: string;
  tono?: 'danger' | 'warning';
  filtro?: FiltroDistribucion;
  activo?: FiltroDistribucion;
  onFiltrar?: (f: FiltroDistribucion) => void;
  ayuda?: string;
}) {
  const clicable = !!filtro && !!onFiltrar;
  const marcada = clicable && activo === filtro;
  const clase = `tira${tono ? ` ${tono}` : ''}${marcada ? ' marcada' : ''}`;
  const cuerpo = (
    <>
      <div className="tira-titulo">{titulo}</div>
      <div className="tira-valor mono">{valor}</div>
    </>
  );
  if (!clicable) return <div className={clase}>{cuerpo}</div>;
  return (
    <button type="button" className={clase} aria-pressed={marcada} title={ayuda}
      onClick={() => onFiltrar(marcada && filtro !== 'todos' ? 'todos' : filtro)}>
      {cuerpo}
    </button>
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
        <td className="mono" style={{ textAlign: 'right' }}>{num(p.totales.disponible)}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{num(p.totales.consumo)}</td>
        <td className="mono" style={{ textAlign: 'right', color: p.totales.salidas > 0 ? 'var(--warning)' : undefined }}>
          {p.totales.salidas ? num(p.totales.salidas) : '—'}
        </td>
        <td className="mono" style={{ textAlign: 'right', color: p.totales.ajustes > 0 ? 'var(--warning)' : undefined }}>
          {p.totales.ajustes ? num(p.totales.ajustes) : '—'}
        </td>
        <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}
          title={Math.abs(p.totales.invFinal - p.stockActual) > 0.01
            ? `El inventario tiene ${num(p.stockActual)}: el cierre viene de un conteo físico`
            : 'Es el stock del inventario'}>
          {num(p.totales.invFinal)}
        </td>
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
          <td colSpan={13} style={{ background: 'var(--bg-soft, rgba(127,127,127,.06))' }}>
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
                      <th style={{ textAlign: 'right' }}>Había</th>
                      <th style={{ textAlign: 'right' }}>Consumo</th>
                      <th style={{ textAlign: 'right' }}>Salidas inv.</th>
                      <th style={{ textAlign: 'right' }}>Ajustes</th>
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
                        <td className="mono" style={{ textAlign: 'right' }}>{num(d.disponible)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{d.consumo ? num(d.consumo) : '—'}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{d.salidas ? num(d.salidas) : '—'}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{d.ajustes ? num(d.ajustes) : '—'}</td>
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
