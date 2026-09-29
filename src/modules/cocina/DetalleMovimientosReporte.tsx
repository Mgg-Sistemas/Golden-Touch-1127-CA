/* ============================================================
   Golden Touch · Cocina · El detalle del reporte de distribución

   La mitad de abajo del reporte: los movimientos que forman cada número del
   resumen, uno por renglón, con fecha, comprobante, motivo y quién lo hizo.

   Arranca cerrado a propósito. El resumen es lo que se mira todos los días; el
   detalle es para cuando un número no cuadra y hay que ver de dónde salió, y
   abrirlo siempre dejaría cientos de renglones entre el resumen y la tabla de
   víveres.
   ============================================================ */
import { useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { dateTime as fmtDateTime } from '@/shared/lib/format';
import { CLASE_LABEL, type MovimientoDetalle } from './controlDistribucion.repository';
import {
  buscarDetalle, CLASES, filtrarClase, filtrarViveres, totalesDetalle, type FiltroClase,
} from './detalleDistribucion';

const num = (v: number, dec = 2) =>
  Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Cuántos renglones se pintan de entrada. El resto, detrás de un botón. */
const TOPE = 60;

/** El color de cada cajón, el mismo del resumen de arriba. */
const CLASE_BADGE: Record<string, string> = {
  entrada: 'badge success',
  consumo: 'badge',
  salida: 'badge warning',
  ajuste: 'badge warning',
};

export function DetalleMovimientosReporte({ filas, idsVisibles, recorte }: {
  /** Todos los movimientos del período. */
  filas: MovimientoDetalle[];
  /** Los víveres que se están viendo arriba. Vacío = todos. */
  idsVisibles: Set<string>;
  /** Qué recorte hay puesto arriba, para decirlo en el título. */
  recorte?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clase, setClase] = useState<FiltroClase>('todas');
  const [buscar, setBuscar] = useState('');
  const [todo, setTodo] = useState(false);

  // El detalle sigue el recorte de arriba: si la tabla quedó en los víveres con
  // ajustes, el detalle no puede seguir mostrando el mercado entero.
  const visibles = useMemo(() => filtrarViveres(filas, idsVisibles), [filas, idsVisibles]);
  const filtradas = useMemo(
    () => buscarDetalle(filtrarClase(visibles, clase), buscar),
    [visibles, clase, buscar],
  );
  const totales = useMemo(() => totalesDetalle(visibles), [visibles]);
  const mostradas = todo ? filtradas : filtradas.slice(0, TOPE);
  const restantes = filtradas.length - mostradas.length;

  return (
    <div className="card" style={{ marginTop: '.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          title="Los movimientos que forman cada número del resumen">
          {abierto ? '▾' : '▸'} Detalle de movimientos ({visibles.length})
        </button>
        <span className="muted" style={{ fontSize: '.78rem' }}>
          Entradas {num(totales.entradas)} · Consumo {num(totales.consumo)} ·
          {' '}Salidas {num(totales.salidas)} · Ajustes {num(totales.ajustes)}
          {recorte ? ` · ${recorte}` : ''}
        </span>
      </div>

      {abierto && (
        <>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '.6rem 0 .5rem' }}>
            <input className="input" style={{ maxWidth: 280 }}
              placeholder="Buscar por víver, comprobante, motivo o responsable"
              value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            <select className="input" style={{ maxWidth: 200 }} value={clase}
              onChange={(e) => setClase(e.target.value as FiltroClase)}
              title="Dejar solo los movimientos de ese tipo">
              <option value="todas">Todos los movimientos</option>
              {CLASES.map((c) => <option key={c} value={c}>{CLASE_LABEL[c]}</option>)}
            </select>
            {(clase !== 'todas' || buscar.trim()) && (
              <span className="muted" style={{ fontSize: '.78rem' }}>
                {filtradas.length} de {visibles.length}
              </span>
            )}
          </div>

          {!filtradas.length && <EmptyState message="Ningún movimiento entra en ese recorte" />}

          {!!filtradas.length && (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Víver</th>
                    <th>Movimiento</th>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th>Origen</th>
                    <th>Comprobante</th>
                    <th>Motivo</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {mostradas.map((f) => (
                    <tr key={f.id}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(f.fecha)}</td>
                      <td>
                        {f.nombre}
                        <div className="muted" style={{ fontSize: '.72rem' }}>
                          {f.sku}{f.unidad ? ` · ${f.unidad}` : ''}
                        </div>
                      </td>
                      <td><span className={CLASE_BADGE[f.clase] ?? 'badge'}>{CLASE_LABEL[f.clase]}</span></td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {f.clase === 'entrada' ? '+' : '−'}{num(f.cantidad)}
                      </td>
                      <td>{f.origen}</td>
                      <td className="mono">{f.comprobante ?? '—'}</td>
                      <td>{f.motivo ?? '—'}</td>
                      <td>{f.responsable ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {restantes > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }}
              onClick={() => setTodo(true)}>
              Ver los {restantes} movimientos restantes
            </button>
          )}

          <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
            Es el mismo kardex que Inventario, recortado a los víveres y al rango del reporte.
            <strong> Consumo de cocina</strong> son las comidas registradas (un reverso aparece en «+»),
            <strong> salida de inventario</strong> es material que salió sin ser una comida y
            <strong> ajuste manual</strong> es una corrección hecha sobre el stock.
          </small>
        </>
      )}
    </div>
  );
}
