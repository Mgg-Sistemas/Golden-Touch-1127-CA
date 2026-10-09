/* ============================================================
   Golden Touch · Cocina · Entradas y salidas del inventario, en el ciclo

   Pedido del usuario (28/09/2026): que los movimientos de consumo y las
   salidas/ajustes de inventario coincidan con el módulo de alimentación.

   Las comidas ya tenían su tabla. Lo que entraba y salía del inventario solo
   aparecía como dos totales en el panel («+ Entradas» y «− Mermas / salidas»),
   sin una fila detrás: para cotejar había que irse a Inventario y sumar a mano.
   Esta tabla pone esas filas al lado de las comidas, y su pie repite los dos
   totales para que se vea a simple vista que dan lo mismo que el panel.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { dateTime, num } from '@/shared/lib/format';
import { EmptyState } from '@/shared/ui/EmptyState';
import { listMovInventarioCiclo, type Mercado } from './cocinaMercado.repository';
import type { Producto } from '@/shared/lib/types';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import {
  buscarInventario, filtrarTipoInventario, rotuloOrigen, tiposInventario, totalesInventario, type MovInventario,
} from './movInventario';

export function MovimientosInventario({ mercado, viveres, recargar }: {
  mercado: Mercado;
  viveres: Producto[];
  /** Cambia cuando la pantalla recarga: así la tabla se entera de un movimiento nuevo. */
  recargar: number;
}) {
  const [filas, setFilas] = useState<MovInventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    listMovInventarioCiclo(mercado, viveres)
      .then((rs) => { if (vivo) setFilas(rs); })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el kardex'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [mercado, viveres, recargar]);

  const [tipo, setTipo] = useState('');
  // Selector buscable con los tipos que hay en el ciclo (09/10/2026).
  const opcionesTipo = useMemo(
    () => [{ value: '', label: 'Todos los tipos' }, ...tiposInventario(filas).map((t) => ({ value: t, label: t }))],
    [filas],
  );
  const vistas = useMemo(() => buscarInventario(filtrarTipoInventario(filas, tipo), buscar), [filas, tipo, buscar]);
  // Los totales son SIEMPRE los del ciclo completo: son los que tienen que dar lo mismo
  // que el panel. Filtrar la búsqueda y mover el total haría dudar de la cuenta.
  const tot = useMemo(() => totalesInventario(filas), [filas]);
  const TOPE = 40;
  const muestra = verTodo ? vistas : vistas.slice(0, TOPE);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title">
        <span>📦 Entradas y salidas del inventario <span className="muted" style={{ fontWeight: 400 }}>· este ciclo, sin las comidas</span></span>
        <span className="muted" style={{ fontWeight: 400, fontSize: '.78rem' }}>
          Lo mismo que muestra Inventario para estos víveres
        </span>
      </div>

      {/* El pie del panel, arriba: los dos números que tienen que coincidir. */}
      <div className="coc-kpis" style={{ marginBottom: '.7rem' }}>
        <div className="card" style={{ padding: '.55rem .75rem' }}>
          <div className="coc-kpi-rotulo">+ Entradas</div>
          <div className="mono coc-kpi-valor" style={{ fontSize: '1.3rem', color: 'var(--primary-3, #2ecc71)' }}>{num(tot.entradas)}</div>
          <div className="muted coc-kpi-nota">órdenes, compras directas y cargas manuales</div>
        </div>
        <div className="card" style={{ padding: '.55rem .75rem' }}>
          <div className="coc-kpi-rotulo">− Mermas / salidas</div>
          <div className="mono coc-kpi-valor" style={{ fontSize: '1.3rem', color: 'var(--warning)' }}>{num(tot.salidas)}</div>
          <div className="muted coc-kpi-nota">salidas de material y ajustes a la baja</div>
        </div>
        <div className="card" style={{ padding: '.55rem .75rem' }}>
          <div className="coc-kpi-rotulo">Movimientos</div>
          <div className="mono coc-kpi-valor" style={{ fontSize: '1.3rem' }}>{num(tot.filas)}</div>
          <div className="muted coc-kpi-nota">filas del kardex en el ciclo</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end', margin: '0 0 .6rem' }}>
        <div className="form-row" style={{ margin: 0, minWidth: 200 }}>
          <label style={{ fontSize: '.72rem' }}>Tipo de movimiento</label>
          <SearchSelect options={opcionesTipo} value={tipo} onChange={setTipo}
            placeholder="Escribe el tipo…" emptyText="Ningún tipo con ese nombre" />
        </div>
        <div className="form-row" style={{ margin: 0, flex: '1 1 260px' }}>
          <label style={{ fontSize: '.72rem' }}>Búsqueda</label>
          <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)}
            placeholder="🔍 víver, categoría, comprobante, motivo, responsable, fecha, cantidad…" />
        </div>
        {(tipo || buscar) && (
          <button className="btn btn-ghost" onClick={() => { setTipo(''); setBuscar(''); }}>✕ Limpiar</button>
        )}
      </div>

      {cargando ? (
        <p className="muted" style={{ margin: 0 }}>Cargando…</p>
      ) : error ? (
        <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>
      ) : filas.length === 0 ? (
        <EmptyState message="En este ciclo no entró ni salió nada del inventario, fuera de las comidas." icon="📦" />
      ) : vistas.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Ningún movimiento con ese tipo o búsqueda.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr>
                <th>Fecha / Hora</th>
                <th>Movimiento</th>
                <th>Comprobante</th>
                <th>Víver</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th>Motivo</th>
                <th>Responsable</th>
              </tr></thead>
              <tbody>
                {muestra.map((f) => {
                  const entro = f.delta > 0;
                  return (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateTime(f.fecha)}</td>
                      <td><span className="badge">{entro ? '⬆' : '⬇'} {rotuloOrigen(f.origen, f.tipo)}</span></td>
                      <td className="mono">{f.comprobante ?? '—'}</td>
                      <td>{f.nombre} {f.unidad && <span className="muted">· {f.unidad}</span>}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: entro ? 'var(--primary-3, #2ecc71)' : 'var(--danger)' }}>
                        {entro ? '+' : '−'}{num(Math.abs(f.delta))}
                      </td>
                      <td className="muted" style={{ fontSize: '.8rem' }}>{f.detalle ?? '—'}</td>
                      <td className="muted" style={{ fontSize: '.8rem' }}>{f.responsable ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {vistas.length > TOPE && (
            <button className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={() => setVerTodo((v) => !v)}>
              {verTodo ? '↑ Ver menos' : `↓ Ver los ${num(vistas.length - TOPE)} restantes`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
