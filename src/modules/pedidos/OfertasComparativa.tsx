import { Fragment, useEffect, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { notify } from '@/shared/lib/notify';
import { date, money } from '@/shared/lib/format';
import type {
  OfertaProveedor,
  Orden,
  Proveedor,
} from '@/shared/lib/types';
import { listOfertasByOrden, aceptarOferta as aceptarOfertaRepo, getPdfOfertaSignedUrl, eliminarOferta } from './ofertas.repository';
import { getStatsForProveedores, type ProveedorStats } from './evaluaciones.repository';
import { scoreOfertas, type ScoredOferta } from './score';
import { aprobarOrdenConOferta } from './pedidos.repository';
import { RepartirProveedoresModal } from './RepartirProveedoresModal';

/** Resumen compacto de la ficha del producto para mostrar en la comparativa. */
function resumenFicha(ficha: OfertaProveedor['ficha']): string {
  if (!ficha) return '';
  const partes: string[] = [];
  if (ficha.marca) partes.push(`Marca: ${ficha.marca}`);
  if (ficha.modelo) partes.push(`Modelo: ${ficha.modelo}`);
  if (ficha.procedencia) partes.push(`Proc.: ${ficha.procedencia}`);
  if (ficha.nivel_calidad) partes.push(`Calidad: ${ficha.nivel_calidad}`);
  if (ficha.materiales) partes.push(`Mat.: ${ficha.materiales}`);
  if (ficha.dimensiones) partes.push(`Dim.: ${ficha.dimensiones}`);
  if (ficha.peso) partes.push(`Peso: ${ficha.peso}`);
  const log = ficha.logistica;
  if (log) {
    const lbl = (v?: string | null) => (v === 'incluido' ? 'incl.' : v === 'comprador' ? 'comprador' : null);
    const ls: string[] = [];
    if (lbl(log.flete)) ls.push(`Flete ${lbl(log.flete)}`);
    if (lbl(log.transporte)) ls.push(`Transp. ${lbl(log.transporte)}`);
    if (lbl(log.embalaje)) ls.push(`Embal. ${lbl(log.embalaje)}`);
    if (lbl(log.seguros)) ls.push(`Seg. ${lbl(log.seguros)}`);
    if (ls.length) partes.push(ls.join(', '));
  }
  return partes.join(' · ');
}

interface Props {
  orden: Orden;
  proveedorMap: Map<string, Proveedor>;
  canDecidir: boolean;            // solo el jefe (admin): aceptar oferta = aprobar
  canCrearOferta?: boolean;       // admin o analista: cargar ofertas de proveedores
  actorEmail: string;
  reloadKey?: number;
  onAccepted: () => void;
  onAddOferta: () => void;
  /** Editar una oferta pendiente (proveedor, marca/modelo, cantidad, precio…). */
  onEditarOferta?: (o: OfertaProveedor) => void;
}

export function OfertasComparativa({
  orden,
  proveedorMap,
  canDecidir,
  canCrearOferta,
  actorEmail,
  reloadKey,
  onAccepted,
  onAddOferta,
  onEditarOferta,
}: Props) {
  const [ofertas, setOfertas] = useState<OfertaProveedor[]>([]);
  const [stats, setStats] = useState<Map<string, ProveedorStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState<ScoredOferta | null>(null);
  // Detalle por ítem que se despliega al hacer click en un proveedor.
  const [expandido, setExpandido] = useState<string | null>(null);
  // Oferta a eliminar (confirmación).
  const [aEliminar, setAEliminar] = useState<OfertaProveedor | null>(null);
  // Modal para repartir la OP entre varios proveedores (multi-proveedor).
  const [repartir, setRepartir] = useState(false);

  // Órdenes HIJAS (reparto): las ofertas viven en la orden PADRE. Para mostrar la
  // comparativa igual que el padre, se cargan las del padre y se ven en SOLO LECTURA
  // (la hija ya es una OC: no se agregan/eligen/reparten/editan ofertas desde acá).
  const esHija = !!orden.op_padre_id;
  const ofertasOrdenId = orden.op_padre_id ?? orden.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOfertasByOrden(ofertasOrdenId)
      .then(async (rows) => {
        if (cancelled) return;
        setOfertas(rows);
        const pids = Array.from(new Set(rows.map((r) => r.proveedor_id)));
        const s = await getStatsForProveedores(pids);
        if (!cancelled) setStats(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast(e instanceof Error ? e.message : 'Error al cargar ofertas', 'error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ofertasOrdenId, reloadKey]);

  const scored = scoreOfertas(ofertas, stats);
  // En una orden HIJA se muestra SOLO la oferta del proveedor que se le asignó
  // (la que se eligió al repartir), no toda la comparativa del padre.
  const scoredView = esHija ? scored.filter((s) => s.oferta.proveedor_id === (orden.proveedor_id ?? '')) : scored;

  async function abrirPdf(path: string) {
    try {
      const url = await getPdfOfertaSignedUrl(path);
      previewArchivo(url, path.split('/').pop() || 'oferta.pdf');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir el PDF', 'error');
    }
  }

  async function confirmarAceptacion(s: ScoredOferta) {
    try {
      await aceptarOfertaRepo(s.oferta.id, actorEmail, s.score.total);
      await aprobarOrdenConOferta(
        orden,
        s.oferta.proveedor_id,
        s.oferta.items,
        s.oferta.precio_total,
        s.score.total,
        actorEmail,
      );
      notify('Oferta elegida · pendiente por aprobación del Gerente General', 'success', { link: '#/app/pedidos' });
      onAccepted();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo elegir la oferta', 'error');
    } finally {
      setConfirmando(null);
    }
  }

  async function confirmarEliminar(of: OfertaProveedor) {
    try {
      await eliminarOferta(of.id);
      setOfertas((prev) => prev.filter((o) => o.id !== of.id));
      if (expandido === of.id) setExpandido(null);
      toast('Oferta eliminada', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo eliminar la oferta', 'error');
    } finally {
      setAEliminar(null);
    }
  }

  // Las ofertas se cargan/eligen sobre la OP ya APROBADA (etapa Orden de Compra).
  // En una orden HIJA es SIEMPRE solo lectura (no se decide/agrega/reparte/edita).
  const enEtapaOc = !esHija && (orden.estado === 'aprobada' || orden.estado === 'desistida_proveedor');
  // Cotizaciones: mínimo 1 para poder elegir, máximo 6 para cargar.
  const MIN_OFERTAS = 1, MAX_OFERTAS = 6;
  const minOk = ofertas.length >= MIN_OFERTAS;
  const puedeDecidir = canDecidir && enEtapaOc && minOk;
  const puedeAgregar = (canCrearOferta ?? canDecidir) && enEtapaOc && ofertas.length < MAX_OFERTAS;
  // Edición/eliminación de ofertas: nunca en una hija (la oferta es del padre).
  const puedeEditarOfertas = (canCrearOferta ?? canDecidir) && !esHija;

  const headLine = (
    <div className="card-title" style={{ marginBottom: '.5rem' }}>
      <span>Ofertas y comparativa{esHija ? ' · de la orden padre' : ''}</span>
      <span style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <span className="muted mono">{esHija ? `${scoredView.length} oferta(s)` : `${scored.length}/${MAX_OFERTAS} oferta(s)`}</span>
        {puedeAgregar && (
          <button className="btn btn-sm btn-ghost" onClick={onAddOferta}>+ Agregar oferta</button>
        )}
        {puedeDecidir && ofertas.length >= 1 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setRepartir(true)} title="Comprar distintos ítems a distintos proveedores (una OC por proveedor)">
            🔀 Repartir entre proveedores
          </button>
        )}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        {headLine}
        <p className="muted" style={{ margin: 0 }}>Cargando ofertas…</p>
      </div>
    );
  }

  if (!ofertas.length) {
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        {headLine}
        <EmptyState message={esHija ? 'La orden padre no tiene ofertas registradas.' : 'Aún no hay ofertas registradas para esta orden.'} icon="◇" />
      </div>
    );
  }

  // Hija sin oferta de su proveedor en el padre (caso raro): aviso claro.
  if (esHija && !scoredView.length) {
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        {headLine}
        <EmptyState message="No se encontró la oferta del proveedor de esta orden hija." icon="◇" />
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      {headLine}
      {esHija && (
        <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.5rem' }}>
          📄 Oferta elegida para esta orden hija (solo lectura), tomada de la <strong>orden padre</strong>. Proveedor:{' '}
          <strong>{proveedorMap.get(orden.proveedor_id ?? '')?.razon_social ?? '—'}</strong>. Los precios se muestran en Bs (BCV) y en divisa ($).
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th className="num">Precio (BCV / divisa)</th>
              <th>Entrega prom.</th>
              <th className="num">Puntualidad</th>
              <th className="num">Calidad</th>
              <th className="num">Cumpl.</th>
              <th className="num">Score</th>
              <th>PDF</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {scoredView.map((s) => {
              const prov = proveedorMap.get(s.oferta.proveedor_id);
              const recomendada = s.recomendada && s.oferta.estado === 'pendiente';
              const aceptada = s.oferta.estado === 'aceptada';
              const seleccionable = s.oferta.estado === 'pendiente' && puedeDecidir;
              const rowBg = recomendada
                ? 'var(--grad-primary-soft)'
                : aceptada
                  ? 'rgba(41,192,129,0.08)'
                  : undefined;
              return (
                <Fragment key={s.oferta.id}>
                  <tr
                    className="row-selectable"
                    onClick={() => setExpandido((id) => (id === s.oferta.id ? null : s.oferta.id))}
                    title="Clic para ver el detalle por ítem"
                    style={{ background: rowBg, cursor: 'pointer', borderBottom: 'none' }}
                  >
                    <td>
                      <div>
                        <span className="muted" style={{ marginRight: '.35rem' }}>{expandido === s.oferta.id ? '▾' : '▸'}</span>
                        <strong>{prov?.razon_social ?? '—'}</strong>{' '}
                        {recomendada && <span className="badge primary" style={{ marginLeft: '.4rem' }}>★ Recomendada</span>}
                        {aceptada && <span className="badge success" style={{ marginLeft: '.4rem' }}>Aceptada</span>}
                      </div>
                      <div style={{ marginTop: '.2rem', display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                        {s.mejorPrecio && <span className="badge info">Mejor precio</span>}
                        {s.masPuntual && <span className="badge info">Más puntual</span>}
                        {s.mejorCalidad && <span className="badge info">Mejor calidad</span>}
                      </div>
                      {resumenFicha(s.oferta.ficha) && (
                        <div className="muted" style={{ marginTop: '.25rem', fontSize: '.72rem', lineHeight: 1.35 }}>
                          {resumenFicha(s.oferta.ficha)}
                        </div>
                      )}
                    </td>
                    <td className="num mono">
                      {money(s.oferta.precio_total)}
                      {s.oferta.precio_divisa != null && (() => {
                        const bcv = Number(s.oferta.precio_total);
                        const div = Number(s.oferta.precio_divisa);
                        const dif = bcv - div;
                        const pct = bcv > 0 ? (dif / bcv) * 100 : 0;
                        return (
                          <div style={{ fontSize: '.72rem', fontWeight: 400, marginTop: '.2rem' }}>
                            <div className="muted">Divisa: {money(div)}</div>
                            <div style={{ color: dif >= 0 ? 'var(--success)' : 'var(--danger)' }} title="Diferencia BCV − divisa y su % sobre el BCV">
                              {dif >= 0 ? '−' : '+'}{money(Math.abs(dif))} ({pct.toFixed(2)}%)
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="muted" style={{ fontSize: '.85rem' }}>{date(s.oferta.fecha_entrega_prometida)}</td>
                    <td className="num mono">{(s.score.puntualidad * 100).toFixed(0)}%</td>
                    <td className="num mono">{(s.stats.calidad_avg).toFixed(1)} / 5</td>
                    <td className="num mono">{(s.score.cumplimiento * 100).toFixed(0)}%</td>
                    <td className="num mono"><strong>{(s.score.total * 100).toFixed(0)}</strong></td>
                    <td>
                      {(() => {
                        // Adjuntos: usa la lista nueva; si no, cae al pdf_path legado.
                        const adj = (s.oferta.adjuntos && s.oferta.adjuntos.length)
                          ? s.oferta.adjuntos
                          : (s.oferta.pdf_path ? [{ path: s.oferta.pdf_path, filename: s.oferta.pdf_filename ?? 'Adjunto' }] : []);
                        if (!adj.length) return <span className="muted" style={{ fontSize: '.78rem' }}>—</span>;
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem' }}>
                            {adj.map((a, i) => (
                              <button
                                key={a.path}
                                className="btn btn-sm btn-ghost"
                                onClick={(e) => { e.stopPropagation(); abrirPdf(a.path); }}
                                title={a.filename}
                                style={{ padding: '0 .4rem' }}
                              >
                                📎 {adj.length > 1 ? i + 1 : 'Ver'}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {s.oferta.estado === 'pendiente' && <span className="badge warning">Pendiente</span>}
                      {s.oferta.estado === 'aceptada' && <span className="badge success">Aceptada</span>}
                      {s.oferta.estado === 'descartada' && <span className="badge danger">Descartada</span>}
                    </td>
                  </tr>
                  {expandido === s.oferta.id && (
                    <tr style={{ background: rowBg }}>
                      <td colSpan={9} style={{ paddingTop: 0 }}>
                        <div style={{ padding: '.4rem .2rem .7rem' }}>
                          <div className="card-title" style={{ fontSize: '.82rem', marginBottom: '.35rem' }}>
                            <span>Detalle de precios por ítem · {prov?.razon_social ?? '—'}</span>
                          </div>
                          {(() => {
                            const totalUsd = s.oferta.precio_divisa != null
                              ? Number(s.oferta.precio_divisa)
                              : s.oferta.items.reduce((a, it) => a + (Number(it.cantidad) || 0) * (Number(it.precio_usd) || 0), 0);
                            const hayUsd = s.oferta.items.some((it) => Number(it.precio_usd) > 0) || s.oferta.precio_divisa != null;
                            const difTotal = s.oferta.precio_total - totalUsd;
                            const pctTotal = s.oferta.precio_total > 0 ? (difTotal / s.oferta.precio_total) * 100 : 0;
                            return (
                          <table className="table" style={{ fontSize: '.8rem' }}>
                            <thead>
                              <tr>
                                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Descripción</th>
                                <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Cant</th>
                                <th colSpan={2} className="num" style={{ textAlign: 'center', background: 'rgba(96,165,250,.12)' }}>Pago en Bs a BCV</th>
                                <th colSpan={2} className="num" style={{ textAlign: 'center', background: 'rgba(248,113,113,.12)' }}>Pago en USD</th>
                                <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Diferencia</th>
                                <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Variación %</th>
                              </tr>
                              <tr>
                                <th className="num" style={{ background: 'rgba(96,165,250,.12)' }}>Precio</th>
                                <th className="num" style={{ background: 'rgba(96,165,250,.12)' }}>Total</th>
                                <th className="num" style={{ background: 'rgba(248,113,113,.12)' }}>Precio</th>
                                <th className="num" style={{ background: 'rgba(248,113,113,.12)' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.oferta.items.map((it, i) => {
                                const cant = Number(it.cantidad) || 0;
                                const precio = Number(it.precio) || 0;
                                const precioU = Number(it.precio_usd) || 0;
                                const dif = (precio - precioU) * cant;
                                const pct = precio > 0 ? ((precio - precioU) / precio) * 100 : 0;
                                return (
                                  <tr key={`${it.productoId ?? it.sku ?? i}-${i}`}>
                                    <td>
                                      {it.nombre}
                                      {(it.marca || it.modelo) && (
                                        <div style={{ fontSize: '.72rem', fontWeight: 600 }}>{[it.marca, it.modelo].filter(Boolean).join(' · ')}</div>
                                      )}
                                      <div className="muted mono" style={{ fontSize: '.7rem' }}>{it.sku ?? ''}</div>
                                    </td>
                                    <td className="num mono">{cant}{it.unidad ? ` ${it.unidad}` : ''}</td>
                                    <td className="num mono">{money(precio)}</td>
                                    <td className="num mono">{money(cant * precio)}</td>
                                    <td className="num mono">{precioU > 0 ? money(precioU) : '—'}</td>
                                    <td className="num mono">{precioU > 0 ? money(cant * precioU) : '—'}</td>
                                    <td className="num mono" style={{ color: dif >= 0 ? 'var(--success)' : 'var(--danger)' }}>{precioU > 0 ? money(dif) : '—'}</td>
                                    <td className="num mono">{precioU > 0 ? `${pct.toFixed(2)}%` : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: 700 }}>
                                <td colSpan={3} style={{ textAlign: 'right' }}>TOTAL</td>
                                <td className="num mono">{money(s.oferta.precio_total)}</td>
                                <td></td>
                                <td className="num mono">{hayUsd ? money(totalUsd) : '—'}</td>
                                <td className="num mono" style={{ color: difTotal >= 0 ? 'var(--success)' : 'var(--danger)' }}>{hayUsd ? money(difTotal) : '—'}</td>
                                <td className="num mono">{hayUsd ? `${pctTotal.toFixed(2)}%` : '—'}</td>
                              </tr>
                            </tfoot>
                          </table>
                            );
                          })()}
                          {puedeEditarOfertas && s.oferta.estado === 'pendiente' && (
                            <div style={{ textAlign: 'right', marginTop: '.4rem', display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
                              {onEditarOferta && (
                                <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onEditarOferta(s.oferta); }}>
                                  ✎ Editar oferta
                                </button>
                              )}
                              <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setAEliminar(s.oferta); }}>
                                🗑 Eliminar esta oferta
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {seleccionable && (
                    <tr
                      className="row-selectable"
                      onClick={() => setConfirmando(s)}
                      style={{ background: rowBg, cursor: 'pointer' }}
                    >
                      <td colSpan={9} style={{ textAlign: 'right', paddingTop: 0, paddingBottom: '.6rem' }}>
                        <button
                          className={recomendada ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
                          onClick={(e) => { e.stopPropagation(); setConfirmando(s); }}
                        >
                          {recomendada ? '★ Aceptar oferta recomendada' : 'Aceptar esta oferta'}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recomendación: qué proveedor conviene por precio / calidad / score global.
          En una hija NO aplica (ya tiene su proveedor fijo): se oculta. */}
      {!esHija && ofertas.length > 0 && (() => {
        const mejorPrecioOf = scored.find((s) => s.mejorPrecio);
        const mejorCalidadOf = scored.find((s) => s.mejorCalidad);
        const recomendadaOf = scored.find((s) => s.recomendada) ?? scored[0];
        const nombre = (s?: ScoredOferta) => (s ? (proveedorMap.get(s.oferta.proveedor_id)?.razon_social ?? '—') : '—');
        return (
          <div className="card" style={{ marginTop: '.8rem', background: 'var(--surface-2)' }}>
            <div className="card-title" style={{ fontSize: '.85rem' }}><span>¿Qué proveedor seleccionar?</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.6rem' }}>
              <div>
                <div className="muted" style={{ fontSize: '.72rem' }}>💲 Mejor precio</div>
                <div style={{ fontWeight: 700 }}>{nombre(mejorPrecioOf)}</div>
                {mejorPrecioOf && <div className="mono" style={{ fontSize: '.8rem' }}>{money(mejorPrecioOf.oferta.precio_total)}{mejorPrecioOf.oferta.precio_divisa != null ? ` · divisa ${money(Number(mejorPrecioOf.oferta.precio_divisa))}` : ''}</div>}
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.72rem' }}>⭐ Mejor calidad</div>
                <div style={{ fontWeight: 700 }}>{nombre(mejorCalidadOf)}</div>
                {mejorCalidadOf && <div className="mono" style={{ fontSize: '.8rem' }}>{mejorCalidadOf.stats.calidad_avg.toFixed(1)} / 5</div>}
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.72rem' }}>🏆 Recomendada (score global)</div>
                <div style={{ fontWeight: 700, color: 'var(--primary-3)' }}>{nombre(recomendadaOf)}</div>
                {recomendadaOf && <div className="mono" style={{ fontSize: '.8rem' }}>Score {(recomendadaOf.score.total * 100).toFixed(0)}</div>}
              </div>
            </div>
            <div className="muted" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
              El score combina precio, puntualidad, calidad y cumplimiento. Podés elegir por el criterio que prefieras.
            </div>
          </div>
        );
      })()}

      {enEtapaOc && canDecidir && !minOk && (
        <p className="muted" style={{ marginTop: '.6rem', fontSize: '.82rem' }}>
          Cargá al menos {MIN_OFERTAS} cotización(es) (máximo {MAX_OFERTAS}) para poder elegir la oferta ganadora.
        </p>
      )}
      {enEtapaOc && !canDecidir && (
        <p className="muted" style={{ marginTop: '.6rem', fontSize: '.82rem' }}>
          La oferta del proveedor
        </p>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Confirmar oferta ganadora"
          message={`¿Elegir la oferta de ${proveedorMap.get(confirmando.oferta.proveedor_id)?.razon_social ?? 'este proveedor'} por ${money(confirmando.oferta.precio_total)}? La orden quedará Pendiente por aprobación del Gerente General y las demás ofertas se descartarán.`}
          confirmText="Elegir oferta"
          onConfirm={() => confirmarAceptacion(confirmando)}
          onCancel={() => setConfirmando(null)}
        />
      )}

      {aEliminar && (
        <ConfirmDialog
          title="Eliminar oferta"
          message={`¿Eliminar la oferta de ${proveedorMap.get(aEliminar.proveedor_id)?.razon_social ?? 'este proveedor'}? Se quita de la comparativa.`}
          confirmText="Eliminar"
          danger
          onConfirm={() => confirmarEliminar(aEliminar)}
          onCancel={() => setAEliminar(null)}
        />
      )}

      {repartir && (
        <RepartirProveedoresModal
          orden={orden}
          ofertas={ofertas}
          proveedorMap={proveedorMap}
          actorEmail={actorEmail}
          onClose={() => setRepartir(false)}
          onDone={() => { setRepartir(false); onAccepted(); }}
        />
      )}
    </div>
  );
}
