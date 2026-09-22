/* ============================================================
   Golden Touch · Cocina · Panel del mercado, por capas

   Portado de MGG (MercadoPanel). Las mismas capas y el mismo dibujo; las
   cuentas viven en mercadoPanel.ts:
     · EcuacionMercado: los cinco números del ciclo, lo que costó el plato y el
       contraste con el inventario, que aparece SOLO si no cuadra. Un «0» que
       tranquiliza ocupa lugar y enseña a no mirar.
     · SelectorVista: Disponible, Movimientos o Ambos.
     · TablaDisponible: los víveres que se movieron; los quietos detrás de un botón.

   Los dos sistemas comparten la hoja de estilos, así que las clases y los
   colores son los de MGG.
   ============================================================ */
import { Fragment, useMemo, useState } from 'react';
import { dateTime, money, num } from '@/shared/lib/format';
import { CICLO_DIAS, type Mercado, type ResumenViver } from './cocinaMercado.repository';
import { esDescartado } from './mercadoDescarte';
import { diaCaracas } from './mercadoInicio';
import {
  costoDelCiclo, ecuacionDelCiclo, explicarDiferencia, filasDisponible, type VistaMercado,
} from './mercadoPanel';

/** Un cero en una tabla larga es ruido: se muestra un punto tenue. */
function cifra(v: number): string { return v === 0 ? '·' : num(v); }
/** Día de un instante en Caracas, como DD-MM-AAAA. */
function dmy(instante: string): string { const [y, m, d] = diaCaracas(instante).split('-'); return `${d}-${m}-${y}`; }

/* ───────── CAPA 1 · La ecuación del ciclo ───────── */

export function EcuacionMercado({ mercado, items, platos, consumoValor, ciclo, soloDif, onSoloDif }: {
  mercado: Mercado;
  items: ResumenViver[];
  /** Platos servidos en el ciclo. `null` si el mercado es anterior a que se guardaran. */
  platos: number | null;
  consumoValor: number;
  /** Contador del ciclo abierto. `null` para uno cerrado. */
  ciclo: { dia: number; faltan: number; vencido: boolean } | null;
  soloDif: boolean;
  onSoloDif: (activar: boolean) => void;
}) {
  const ec = useMemo(() => ecuacionDelCiclo(items), [items]);
  const costo = useMemo(() => costoDelCiclo(platos, consumoValor), [platos, consumoValor]);
  const abierto = mercado.estado === 'abierto';

  return (
    <div className="card" style={{ margin: '.3rem 0 .7rem', padding: '.8rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
        <strong style={{ fontSize: '.95rem' }}>Mercado {mercado.numero ?? ''}</strong>
        <span className="muted" style={{ fontSize: '.78rem' }} title={`Inició ${dateTime(mercado.inicio_at)}`}>
          {dmy(mercado.inicio_at)} → {mercado.cierre_at ? dmy(mercado.cierre_at) : 'en curso'}
          {!abierto && (esDescartado(mercado) ? ' · descartado' : ' · cerrado')}
          {/* El contador que antes iba en la cabecera. Pasado el día 21 se dice con
              palabras además del rojo: en una captura en blanco y negro el color no está. */}
          {abierto && ciclo && (ciclo.vencido
            ? <strong style={{ color: 'var(--danger)' }}> · día {ciclo.dia} de {CICLO_DIAS} · ¡toca cerrar!</strong>
            : ` · día ${ciclo.dia} de ${CICLO_DIAS} · faltan ${ciclo.faltan}`)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '.5rem' }}>
        <Cifra rotulo="Saldo inicial" valor={num(ec.saldoInicial)} />
        <Cifra rotulo="+ Entradas" valor={num(ec.entradas)} color="var(--primary-3, #2ecc71)" />
        <Cifra rotulo="= Disponible" valor={num(ec.disponible)} fuerte />
        <Cifra rotulo="− Consumo" valor={num(ec.consumo)} color="var(--danger)" />
        {/* Las pérdidas restan en la cuenta a la vista, pero no son comida servida: no van
            al costo por plato de abajo (decisión del usuario, 15/09/2026). */}
        <Cifra rotulo="− Mermas / salidas" valor={num(ec.mermas)} color="var(--warning)" />
        {/* Sin «=», a diferencia de MGG: en GT «Queda» no sale de la cuenta, es el stock. */}
        <Cifra rotulo={abierto ? 'Queda en inventario' : 'Quedó en inventario'} valor={num(ec.queda)} fuerte color="var(--primary-3, #2ecc71)" />
      </div>

      {/* Lo que costó dar de comer. La ecuación se lee en UNIDADES y sirve para cuadrar
          el almacén; esta línea responde la pregunta del presupuesto. Va como línea
          secundaria: son otra unidad y mezclarlas con los kilos haría leer mal las dos. */}
      <div style={{
        marginTop: '.6rem', paddingTop: '.55rem', borderTop: '1px solid var(--border)',
        display: 'flex', gap: '1.4rem', flexWrap: 'wrap', alignItems: 'baseline',
      }}>
        {costo.platos != null && <Costo rotulo="Platos servidos" valor={num(costo.platos)} />}
        <Costo rotulo="Costo del consumo" valor={money(costo.consumo)} color="var(--danger)" />
        {costo.platos != null && (
          <Costo rotulo="Costo por plato" valor={costo.porPlato != null ? money(costo.porPlato) : '—'} color="var(--warning)" fuerte
            nota={costo.porPlato == null ? 'todavía no se sirvió ningún plato' : undefined} />
        )}
      </div>

      {ec.viveresConDiferencia > 0 && (
        <div style={{ marginTop: '.6rem', paddingTop: '.55rem', borderTop: '1px solid var(--border)', fontSize: '.83rem' }}>
          ⚠ Según la cuenta del ciclo {abierto ? 'deberían quedar' : 'debían quedar'} <strong className="mono">{num(ec.cuenta)}</strong>
          {ec.diferencia !== 0 ? (
            <>
              {' · diferencia '}
              <strong className="mono" style={{ color: ec.diferencia < 0 ? 'var(--danger)' : 'var(--warning)' }}>
                {ec.diferencia > 0 ? '+' : ''}{num(ec.diferencia)}
              </strong>
              {' en '}
            </>
          ) : ' · no cuadran '}
          {ec.viveresConDiferencia} {ec.viveresConDiferencia === 1 ? 'víver' : 'víveres'}
          {ec.diferencia === 0 && <span className="muted"> (las diferencias se compensan entre sí)</span>}
          {/* Un solo botón lleva de la advertencia a los víveres concretos. */}
          <button className={`btn btn-sm ${soloDif ? 'btn-primary' : 'btn-ghost'}`} style={{ marginLeft: '.5rem' }}
            onClick={() => onSoloDif(!soloDif)}>
            {soloDif ? '↩ Ver todos' : 'Ver solo estos'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Un número de la ecuación, con su rótulo debajo. */
function Cifra({ rotulo, valor, color, fuerte }: { rotulo: string; valor: string; color?: string; fuerte?: boolean }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: fuerte ? '1.35rem' : '1.15rem', fontWeight: fuerte ? 800 : 700, color }}>{valor}</div>
      <div className="muted" style={{ fontSize: '.7rem', letterSpacing: '.02em' }}>{rotulo}</div>
    </div>
  );
}

/** Un número en dinero o platos: rótulo primero, porque acá el rótulo es lo que desambigua. */
function Costo({ rotulo, valor, color, fuerte, nota }: { rotulo: string; valor: string; color?: string; fuerte?: boolean; nota?: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: '.7rem', letterSpacing: '.02em' }}>{rotulo}</div>
      <div className="mono" style={{ fontSize: fuerte ? '1.2rem' : '1.05rem', fontWeight: fuerte ? 800 : 700, color }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '.68rem' }}>{nota}</div>}
    </div>
  );
}

/* ───────── CAPA 2 · Qué se quiere mirar ───────── */

const VISTAS: [VistaMercado, string][] = [
  ['disponible', 'Disponible'], ['movimientos', 'Movimientos'], ['ambos', 'Ambos'],
  // Traído de MGG (21/09/2026): el control de distribución vive acá, no en una
  // pantalla aparte, porque mira el mismo ciclo que las otras tres vistas.
  ['distribucion', '📊 Distribución'],
];

export function SelectorVista({ vista, onElegir }: { vista: VistaMercado; onElegir: (v: VistaMercado) => void }) {
  return (
    <div className="view-switch" role="group" aria-label="Qué mirar del mercado"
      style={{ display: 'flex', gap: '.35rem', marginBottom: '.7rem', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: '.76rem', alignSelf: 'center', marginRight: '.2rem' }}>Ver:</span>
      {VISTAS.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={vista === v}
          className={`btn btn-sm ${vista === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onElegir(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ───────── CAPA 3 · Disponible a consumir ───────── */

export function TablaDisponible({ items, soloDif, onSoloDif, onElegir, alCierre = false, maxHeight = 420 }: {
  items: ResumenViver[];
  soloDif: boolean;
  onSoloDif: (activar: boolean) => void;
  /** Tocar un víver abre su detalle. Sin esto, la tabla es de solo lectura. */
  onElegir?: (r: ResumenViver) => void;
  /** Un ciclo ya cerrado: los verbos van en pasado y la última columna es «Quedó». */
  alCierre?: boolean;
  maxHeight?: number | string;
}) {
  const [verQuietos, setVerQuietos] = useState(false);
  const { filas, quietosOcultables, difPorProducto } = useMemo(
    () => filasDisponible(items, { verQuietos, soloDif }),
    [items, verQuietos, soloDif],
  );

  return (
    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div className="card-title" style={{ marginBottom: '.5rem' }}>
        Disponible a consumir{' '}
        <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          · saldo inicial + entradas − consumos − mermas{onElegir ? ' · tocá un víver para el detalle' : ''}
        </span>
      </div>

      {/* Una tabla filtrada que no lo dice se lee como si fuera todo el mercado. El aviso
          lleva su propia salida, para no tener que volver a la tira de arriba. */}
      {soloDif && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.5rem', padding: '.4rem .6rem',
          borderLeft: '3px solid var(--warning)', background: 'var(--bg-2, rgba(255,255,255,.03))', borderRadius: 'var(--r-sm, 4px)', fontSize: '.79rem',
        }}>
          <span style={{ color: 'var(--warning)' }}>
            Mostrando solo los <strong>{filas.length}</strong> víveres que no cuadran, de {items.length}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => onSoloDif(false)}>↩ Ver todos</button>
        </div>
      )}

      {!filas.length ? (
        <p className="muted" style={{ margin: 0 }}>
          {soloDif
            ? 'Ya no queda ningún víver descuadrado: la cuenta del ciclo y el inventario coinciden.'
            : items.length ? 'Ningún víver se movió en este mercado todavía.' : 'Sin víveres en este mercado todavía.'}
        </p>
      ) : (
        <div className="table-wrap" style={{ maxHeight, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.83rem' }}>
            <thead><tr>
              <th>Víver</th>
              <th style={{ textAlign: 'right' }}>Saldo inicial</th>
              <th style={{ textAlign: 'right' }}>Entradas</th>
              <th style={{ textAlign: 'right' }}>Disponible</th>
              <th style={{ textAlign: 'right' }}>Consumido</th>
              <th style={{ textAlign: 'right' }} title="Salidas que no son comidas: pérdidas, salidas manuales, ajustes a la baja, traslados">Mermas / salidas</th>
              <th style={{ textAlign: 'right' }}>{alCierre ? 'Quedó' : 'Queda'}</th>
            </tr></thead>
            <tbody>
              {filas.map((r) => {
                const dif = difPorProducto.get(r.producto_id);
                const unidad = r.unidad ?? '';
                return (
                  // El Fragment lleva la key: la fila y su sub-línea de diferencia son dos <tr>.
                  <Fragment key={r.producto_id}>
                    <tr className={onElegir ? 'row-selectable' : undefined}
                      style={{ cursor: onElegir ? 'pointer' : undefined, ...(dif ? { borderLeft: '3px solid var(--warning)' } : {}) }}
                      onClick={onElegir ? () => onElegir(r) : undefined}
                      onKeyDown={onElegir ? (e) => { if (e.key === 'Enter') onElegir(r); } : undefined}
                      tabIndex={onElegir ? 0 : undefined}
                      title={onElegir ? 'Ver saldo, entradas y consumos' : undefined}>
                      {/* La unidad va UNA vez, con el nombre: repetida en cada celda partía los números. */}
                      <td>
                        {r.nombre}{' '}
                        {unidad && <span className="muted mono" style={{ fontSize: '.72rem' }}>{unidad}</span>}
                        {' '}{r.sku && <span className="dim mono" style={{ fontSize: '.7rem' }}>{r.sku}</span>}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{cifra(r.saldo_inicial)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.entradas ? 'var(--primary-3, #2ecc71)' : undefined }}>{r.entradas ? `+${num(r.entradas)}` : '·'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{cifra(r.disponible)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.consumo ? 'var(--danger)' : undefined }}>{r.consumo ? `−${num(r.consumo)}` : '·'}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.mermas ? 'var(--warning)' : undefined }}>{r.mermas ? `−${num(r.mermas)}` : '·'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: r.queda <= 0 ? 'var(--danger)' : 'var(--primary-3, #2ecc71)' }}>{num(r.queda)}</td>
                    </tr>
                    {/* La diferencia se dice con números y palabras, no solo con el color. */}
                    {dif && (
                      <tr style={{ borderLeft: '3px solid var(--warning)' }}>
                        <td colSpan={7} style={{ paddingTop: 0, fontSize: '.76rem' }}>
                          <span style={{ color: 'var(--warning)' }}>
                            ⚠ la cuenta del ciclo {alCierre ? 'daba' : 'da'} <strong className="mono">{num(dif.cuenta)}</strong>
                          </span>
                          {' · '}{dif.diferencia < 0 ? (alCierre ? 'faltaban' : 'faltan') : (alCierre ? 'sobraban' : 'sobran')}{' '}
                          <strong className="mono">{num(Math.abs(dif.diferencia))}</strong>{unidad ? ` ${unidad.toLowerCase()}` : ''}
                          <span className="dim" style={{ display: 'block', marginTop: '.1rem' }}>↳ {explicarDiferencia(dif.diferencia)}</span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Los que no se movieron no desaparecen: su stock sigue siendo real. Con el filtro
          encendido el botón no va: contradiría al filtro. */}
      {!soloDif && quietosOcultables > 0 && (
        <button className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={() => setVerQuietos((v) => !v)}>
          {verQuietos ? `Ocultar los ${quietosOcultables} que no se movieron` : `Ver los ${quietosOcultables} víveres que no se movieron`}
        </button>
      )}
    </div>
  );
}
