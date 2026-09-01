import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { BarChart, type ChartPoint } from '@/shared/ui/Chart';
import type { Producto } from '@/shared/lib/types';
import {
  listViveres, listMovimientosCocina, crearMovimientoCocina, actualizarMovimientoCocina, eliminarMovimientoCocina,
  resumirCocina, TIPOS_COMIDA, labelTipoComida, viveresBajos, alertarViveresBajosACompras,
  type CocinaMovimiento, type CocinaItem, type TipoComida, type ResumenCocina,
} from './cocina.repository';
import { descargarCocinaPdf } from './cocinaPdf';
import { crearAlertaMercado } from './alertasMercado.repository';
import {
  asegurarMercadoActivo, getMercadoActivo, computeResumen, cerrarMercado, diasDelCiclo, detalleViverCiclo,
  CICLO_DIAS, type Mercado, type ResumenViver, type TotalesMercado, type DetalleViverCiclo,
} from './cocinaMercado.repository';
import { descargarCocinaCierrePdf } from './cocinaCierrePdf';
import { enviarCierreCocinaPorCorreo } from './enviarCierreCocina';

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function hoyISO(): string { return new Date().toISOString().slice(0, 10); }
/** YYYY-MM-DD → DD/MM/YYYY (para etiquetas legibles). */
function dmy(iso: string): string { const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
function inicioSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00`); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10);
}
function inicioMes(iso: string): string { return `${iso.slice(0, 7)}-01`; }

export function CocinaPage() {
  const { appUser, can, isAdmin } = usePermissions();
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const canWrite = isAdmin || can('cocina', 'escritura');

  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [viveres, setViveres] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'add' | 'resumen' | 'alerta'>('none');
  const [editando, setEditando] = useState<CocinaMovimiento | null>(null);
  const [aEliminar, setAEliminar] = useState<CocinaMovimiento | null>(null);
  const [notaAlerta, setNotaAlerta] = useState('');
  const [enviandoAlerta, setEnviandoAlerta] = useState(false);
  // Ciclo de mercado (21 días): mercado abierto + su resumen (disponible/consumo/queda).
  const [mercado, setMercado] = useState<Mercado | null>(null);
  const [resMercado, setResMercado] = useState<ResumenViver[]>([]);
  const [totMercado, setTotMercado] = useState<TotalesMercado | null>(null);
  const [detalleViver, setDetalleViver] = useState<{ item: ResumenViver; det: DetalleViverCiclo } | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [qMercado, setQMercado] = useState('');   // buscador del panel «Disponible a consumir»
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [emailCierre, setEmailCierre] = useState('');

  async function enviarAlertaMercado() {
    setEnviandoAlerta(true);
    try {
      await crearAlertaMercado({ nota: notaAlerta || null, actor, actorName });
      notify('Alerta enviada a Compras: hay que restablecer el mercado', 'success', { link: '#/app/pedidos' });
      setNotaAlerta('');
      setModal('none');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar la alerta', 'error');
    } finally {
      setEnviandoAlerta(false);
    }
  }

  // Filtros de la tabla.
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fTipo, setFTipo] = useState<TipoComida | ''>('');
  const [fBuscar, setFBuscar] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, v] = await Promise.all([
        listMovimientosCocina({ desde: fDesde || undefined, hasta: fHasta || undefined, tipo: fTipo || undefined }),
        listViveres().catch(() => [] as Producto[]),
      ]);
      setMovs(m); setViveres(v);
      // Ciclo de mercado: garantiza un mercado abierto (solo con permiso de escritura) y
      // calcula su resumen (saldo inicial + entradas = disponible; consumo; lo que queda).
      try {
        const mk = canWrite ? await asegurarMercadoActivo(v) : await getMercadoActivo();
        setMercado(mk);
        if (mk) {
          const { items, totales } = await computeResumen(mk, v);
          setResMercado(items); setTotMercado(totales);
        } else { setResMercado([]); setTotMercado(null); }
      } catch { /* si el ciclo falla, no bloquea la vista de cocina */ }
      // Aviso automático a los Analistas de Compras si hay víveres al 20% o menos de su
      // mínimo (best-effort, con dedup para no repetir). Se evalúa en cada carga/refresh,
      // incluido después de registrar una comida (que baja el stock).
      void alertarViveresBajosACompras(v);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar Cocina', 'error');
    } finally { setLoading(false); }
  }, [fDesde, fHasta, fTipo, canWrite]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['cocina_movimientos', 'movimientos', 'existencias', 'cocina_mercados'], () => { void cargar(); });

  // Búsqueda general (cliente): código, tipo, nota, fecha/hora, productos.
  const movsFiltrados = useMemo(() => {
    const q = norm(fBuscar.trim());
    if (!q) return movs;
    return movs.filter((m) => {
      const campos = [m.codigo ?? '', labelTipoComida(m.tipo_comida), m.nota ?? '', dateTime(m.at),
        ...(m.items ?? []).flatMap((i) => [i.nombre, i.sku])];
      return campos.some((c) => norm(String(c)).includes(q));
    });
  }, [movs, fBuscar]);

  // KPIs sincronizados con lo que muestra la tabla (mismos filtros: fecha, tipo y búsqueda).
  // Antes eran «de hoy» y no reflejaban un movimiento cargado con fecha de servicio desfasada.
  const resFiltrado = useMemo(() => resumirCocina(movsFiltrados), [movsFiltrados]);
  // Etiqueta del período que resumen las tarjetas (según los filtros de fecha).
  const notaPeriodo = fDesde && fHasta
    ? (fDesde === fHasta ? (fDesde === hoyISO() ? 'hoy' : dmy(fDesde)) : `${dmy(fDesde)} – ${dmy(fHasta)}`)
    : fDesde ? `desde ${dmy(fDesde)}` : fHasta ? `hasta ${dmy(fHasta)}` : 'todo el registro';
  // Víveres al 20% o menos de su mínimo (se avisa a Compras y se muestra acá).
  const bajos = useMemo(() => viveresBajos(viveres), [viveres]);
  // Panel «Disponible a consumir»: filtro por buscador (nombre/SKU).
  const mercadoFiltrado = useMemo(() => {
    const q = norm(qMercado.trim());
    return q ? resMercado.filter((r) => norm(r.nombre).includes(q) || norm(r.sku).includes(q)) : resMercado;
  }, [resMercado, qMercado]);

  async function confirmarEliminar(m: CocinaMovimiento) {
    try {
      await eliminarMovimientoCocina(m.id);
      toast('Movimiento eliminado (el stock descontado no se repone automáticamente)', 'success');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setAEliminar(null); }
  }

  // Contador del ciclo (día X de 21, cuántos faltan, si ya venció).
  const ciclo = useMemo(() => (mercado ? diasDelCiclo(mercado) : null), [mercado]);

  // Detalle de un víver del ciclo (lo que quedó + la nueva entrada + los consumos).
  async function abrirDetalleViver(item: ResumenViver) {
    if (!mercado) return;
    setCargandoDetalle(true);
    setDetalleViver({ item, det: { entradas: [], consumos: [] } });
    try {
      const det = await detalleViverCiclo(mercado, item.producto_id);
      setDetalleViver({ item, det });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar el detalle', 'error');
      setDetalleViver(null);
    } finally { setCargandoDetalle(false); }
  }

  // Cierre del mercado: cierra el ciclo, genera el PDF y abre el siguiente con el saldo.
  async function ejecutarCierre(enviarCorreo: boolean) {
    if (!mercado) return;
    setCerrando(true);
    try {
      const cerrado = await cerrarMercado(mercado, viveres, actor);
      await descargarCocinaCierrePdf(cerrado);
      if (enviarCorreo) {
        const destinos = emailCierre.trim() ? emailCierre.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : undefined;
        const { destinatarios } = await enviarCierreCocinaPorCorreo(cerrado, destinos);
        toast(`Mercado ${cerrado.numero ?? ''} cerrado · reporte enviado a ${destinatarios.join(', ') || 'los destinatarios'}`, 'success');
      } else {
        toast(`Mercado ${cerrado.numero ?? ''} cerrado · reporte generado`, 'success');
      }
      notify(`Cierre de mercado ${cerrado.numero ?? ''} · el nuevo ciclo arranca con lo que quedó`, 'success', { link: '#/app/cocina' });
      setConfirmarCierre(false); setEmailCierre('');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cerrar el mercado', 'error'); }
    finally { setCerrando(false); }
  }

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>🍽 Control de Alimentación (Cocina)</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Consumo de víveres por comida (desayuno, almuerzo, cena), con platos y costo del inventario.</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {ciclo && mercado && (
            <span className="mono" title={`Mercado ${mercado.numero ?? ''} · inició ${dateTime(mercado.inicio_at)}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: '.3rem .6rem', borderRadius: 8,
                fontSize: '.8rem', fontWeight: 700,
                border: `1px solid ${ciclo.vencido ? 'var(--danger)' : 'var(--border, #334)'}`,
                color: ciclo.vencido ? 'var(--danger)' : 'inherit',
                background: ciclo.vencido ? 'color-mix(in srgb, var(--danger) 12%, transparent)' : 'transparent',
              }}>
              🛒 Día {ciclo.dia} de {CICLO_DIAS} · {ciclo.vencido ? '¡toca cerrar!' : `faltan ${ciclo.faltan}`}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => setModal('resumen')}>📊 Consumo / Resumen</button>
          {canWrite && mercado && (
            <button className={`btn ${ciclo?.vencido ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setConfirmarCierre(true)}
              title="Cerrar el ciclo de mercado: genera el reporte (PDF/correo) y arranca el siguiente con lo que quedó">
              🧾 Cerrar mercado
            </button>
          )}
          {canWrite && <button className="btn btn-warning" onClick={() => setModal('alerta')} title="Avisar a Compras que hay que montar el mercado">🔔 Alerta a Restablecer</button>}
          {canWrite && <button className="btn btn-primary" onClick={() => setModal('add')}>➕ Añadir Movimiento</button>}
        </div>
      </div>

      {/* KPIs sincronizados con la tabla (según los filtros de fecha/tipo/búsqueda). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
        <KpiCard titulo="Platos" valor={num(resFiltrado.platos)} nota={`${resFiltrado.movimientos} movimiento(s) · ${notaPeriodo}`} />
        <KpiCard titulo="Consumo" valor={money(resFiltrado.valorTotal)} nota={`costo de víveres · ${notaPeriodo}`} destacado />
        <KpiCard titulo="Promedio por plato" valor={money(resFiltrado.promedioPorPlato)} nota={notaPeriodo} />
        <KpiCard titulo="Víveres en catálogo" valor={num(viveres.length)} nota="productos disponibles" />
      </div>

      {/* Disponible a consumir: tarjetas con barra de progreso (lo que queda del disponible). */}
      {mercado && resMercado.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title">
            <span>🛒 Disponible a consumir <span className="muted" style={{ fontWeight: 400 }}>· Mercado {mercado.numero ?? ''} (ciclo desde {dmy(mercado.inicio_at.slice(0, 10))})</span></span>
            <span className="muted" style={{ fontWeight: 400, fontSize: '.78rem' }}>Tocá una tarjeta para ver lo que quedó, la nueva entrada y los consumos</span>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.7rem' }}>
            <input className="input" style={{ maxWidth: 280 }} value={qMercado} onChange={(e) => setQMercado(e.target.value)}
              placeholder="🔍 Buscar víver…" />
            {totMercado && (
              <span className="muted" style={{ fontSize: '.8rem' }}>
                {mercadoFiltrado.length} de {totMercado.viveres} víveres · consumo del ciclo <strong className="mono">{money(totMercado.consumo_valor)}</strong>
              </span>
            )}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '.7rem', fontSize: '.72rem' }} className="muted">
              <span>🟢 abundante</span><span>🟡 medio</span><span>🔴 poco</span>
            </span>
          </div>
          {mercadoFiltrado.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Ningún víver coincide con «{qMercado}».</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: '.6rem' }}>
              {mercadoFiltrado.map((r) => {
                const pct = r.disponible > 0 ? Math.max(0, Math.min(1, r.queda / r.disponible)) : (r.queda > 0 ? 1 : 0);
                const color = pct >= 0.5 ? 'var(--success, #16a34a)' : pct >= 0.2 ? 'var(--warning, #d97706)' : 'var(--danger, #dc2626)';
                return (
                  <button key={r.producto_id} type="button" onClick={() => void abrirDetalleViver(r)}
                    title="Ver lo que quedó + la nueva entrada + los consumos"
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: '.6rem .7rem', borderRadius: 10,
                      border: '1px solid var(--border, #334)', borderLeft: `4px solid ${color}`,
                      background: 'var(--card-bg, transparent)', color: 'inherit', display: 'grid', gap: '.35rem',
                    }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 600, lineHeight: 1.15, minHeight: '2.1em' }}>
                      {r.nombre} {r.unidad && <span className="muted" style={{ fontWeight: 400 }}>· {r.unidad}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '.35rem' }}>
                      <span className="muted" style={{ fontSize: '.7rem' }}>Quedan</span>
                      <span className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color, lineHeight: 1 }}>{num(r.queda)}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 6, background: 'color-mix(in srgb, var(--border, #334) 60%, transparent)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: color, borderRadius: 6, transition: 'width .3s' }} />
                    </div>
                    <div className="muted mono" style={{ fontSize: '.68rem', display: 'flex', justifyContent: 'space-between', gap: '.3rem' }}>
                      <span>disp {num(r.disponible)}</span>
                      {r.entradas > 0 && <span style={{ color: 'var(--brand, #ff8a00)' }}>+{num(r.entradas)}</span>}
                      {r.consumo > 0 && <span style={{ color: 'var(--danger)' }}>−{num(r.consumo)}</span>}
                      <span>{Math.round(pct * 100)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aviso de víveres bajos (20% o menos del mínimo): también se notifica a Compras */}
      {bajos.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '1rem' }}>
          <div className="card-title">
            <span>🥫 Víveres para reponer <span className="muted" style={{ fontWeight: 400 }}>(20% o menos del mínimo)</span></span>
            <span className="muted mono">{num(bajos.length)} · avisado a Compras</span>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {bajos.slice(0, 12).map((p) => (
              <span key={p.id} className="btn btn-sm btn-ghost" style={{ cursor: 'default' }}
                title={`Stock ${num(Number(p.stock))} · mínimo ${num(Number(p.stock_min))} · umbral 20% = ${num(Number(p.stock_min) * 0.2)}`}>
                {p.nombre} · {num(Number(p.stock))} {p.unidad ?? ''}
              </span>
            ))}
            {bajos.length > 12 && <span className="muted" style={{ alignSelf: 'center' }}>…y {num(bajos.length - 12)} más</span>}
          </div>
        </div>
      )}

      {/* Filtros de la tabla */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Desde</label>
            <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Hasta</label>
            <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Tipo de comida</label>
            <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoComida | '')}>
              <option value="">Todas</option>
              {TIPOS_COMIDA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ margin: 0, flex: '1 1 220px' }}>
            <label style={{ fontSize: '.72rem' }}>Búsqueda general</label>
            <input className="input" value={fBuscar} onChange={(e) => setFBuscar(e.target.value)} placeholder="🔍 código, producto, nota, fecha/hora…" />
          </div>
          {(fDesde || fHasta || fTipo || fBuscar) && (
            <button className="btn btn-ghost" onClick={() => { setFDesde(''); setFHasta(''); setFTipo(''); setFBuscar(''); }}>✕ Limpiar</button>
          )}
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }}
            onClick={() => descargarCocinaPdf({ titulo: tituloRango(fDesde, fHasta), resumen: resumirCocina(movsFiltrados), movs: movsFiltrados }).catch(() => toast('No se pudo generar el PDF', 'error'))}>
            ↓ Reporte PDF
          </button>
        </div>
      </div>

      {/* Tabla de movimientos por tipo de comida */}
      {loading ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>
      ) : movsFiltrados.length === 0 ? (
        <div className="card"><EmptyState message="No hay movimientos de cocina con esos filtros." icon="🍽" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.86rem' }}>
              <thead><tr>
                <th>Código</th><th>Tipo de comida</th><th>Fecha / Hora</th>
                <th style={{ textAlign: 'right' }}>Platos</th><th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'right' }}>Prom./plato</th>
                <th>Víveres</th>{canWrite && <th></th>}
              </tr></thead>
              <tbody>
                {movsFiltrados.map((m) => {
                  const tc = TIPOS_COMIDA.find((t) => t.value === m.tipo_comida);
                  return (
                    <tr key={m.id}>
                      <td className="mono">{m.codigo ?? '—'}</td>
                      <td><span className="badge">{tc?.icono} {labelTipoComida(m.tipo_comida)}</span></td>
                      <td>{dateTime(m.at)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(m.platos)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(m.valor_total))}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{Number(m.platos) > 0 ? money(Number(m.valor_total) / Number(m.platos)) : '—'}</td>
                      <td className="muted" style={{ fontSize: '.78rem' }}>
                        {(m.items ?? []).map((i) => `${num(i.cantidad)} ${i.nombre}`).join(' · ')}
                        {m.nota ? <div>📝 {m.nota}</div> : null}
                      </td>
                      {canWrite && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" title="Editar movimiento (tipo, platos, víveres, cantidades, nota y fecha)" onClick={() => setEditando(m)}>✏</button>
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Eliminar" onClick={() => setAEliminar(m)}>🗑</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({movsFiltrados.length})</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(movsFiltrados.reduce((a, m) => a + (Number(m.platos) || 0), 0))}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(movsFiltrados.reduce((a, m) => a + (Number(m.valor_total) || 0), 0))}</td>
                {(() => {
                  const tp = movsFiltrados.reduce((a, m) => a + (Number(m.platos) || 0), 0);
                  const tv = movsFiltrados.reduce((a, m) => a + (Number(m.valor_total) || 0), 0);
                  return <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{tp > 0 ? money(tv / tp) : '—'}</td>;
                })()}
                <td colSpan={canWrite ? 2 : 1}></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {modal === 'add' && (
        <AddMovimientoModal viveres={viveres} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await cargar(); }} />
      )}
      {editando && (
        <AddMovimientoModal viveres={viveres} actor={actor} actorName={actorName} editar={editando}
          onClose={() => setEditando(null)} onSaved={async () => { setEditando(null); await cargar(); }} />
      )}
      {modal === 'resumen' && (
        <ResumenModal viveres={viveres} onClose={() => setModal('none')} />
      )}
      {modal === 'alerta' && (
        <Modal title="🔔 Alerta a Restablecer el mercado" size="md" onClose={() => !enviandoAlerta && setModal('none')} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal('none')} disabled={enviandoAlerta}>Cancelar</button>
            <button className="btn btn-warning" onClick={() => void enviarAlertaMercado()} disabled={enviandoAlerta}>{enviandoAlerta ? 'Enviando…' : '🔔 Enviar alerta a Compras'}</button>
          </>
        }>
          <p style={{ marginTop: 0 }}>
            Esto le avisa a <strong>Compras</strong> que hay que <strong>montar el mercado</strong>. Aparece como una <strong>tarjeta en Pedidos</strong> para que el analista cree la Solicitud de Pedido de <strong>MERCADO</strong>.
          </p>
          <div className="form-row">
            <label>Nota para Compras <span className="muted">(opcional)</span></label>
            <textarea className="textarea" value={notaAlerta} onChange={(e) => setNotaAlerta(e.target.value)} placeholder="Ej.: falta arroz, pollo y aceite; urge para mañana…" rows={3} />
          </div>
        </Modal>
      )}
      {aEliminar && (
        <ConfirmDialog title="Eliminar movimiento de cocina"
          message={`¿Eliminar ${aEliminar.codigo ?? 'el movimiento'} (${labelTipoComida(aEliminar.tipo_comida)})? El stock ya descontado NO se repone automáticamente.`}
          confirmText="Eliminar" onCancel={() => setAEliminar(null)} onConfirm={() => confirmarEliminar(aEliminar)} />
      )}

      {/* Detalle de un víver del ciclo: lo que quedó + la nueva entrada + los consumos. */}
      {detalleViver && (
        <Modal title={`🛒 ${detalleViver.item.nombre}`} size="md" onClose={() => setDetalleViver(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '.5rem', marginBottom: '.8rem' }}>
            <div className="card" style={{ padding: '.5rem', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '.72rem' }}>Saldo (lo que quedó)</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem' }}>{num(detalleViver.item.saldo_inicial)}</div>
            </div>
            <div className="card" style={{ padding: '.5rem', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '.72rem' }}>＋ Entrada (nuevo)</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--brand, #ff8a00)' }}>{num(detalleViver.item.entradas)}</div>
            </div>
            <div className="card" style={{ padding: '.5rem', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '.72rem' }}>＝ Disponible</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem' }}>{num(detalleViver.item.disponible)}</div>
            </div>
            <div className="card" style={{ padding: '.5rem', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '.72rem' }}>Consumo</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--danger)' }}>{num(detalleViver.item.consumo)}</div>
            </div>
            <div className="card" style={{ padding: '.5rem', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '.72rem' }}>Queda</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--success, #16a34a)' }}>{num(detalleViver.item.queda)}</div>
            </div>
          </div>
          {cargandoDetalle ? (
            <p className="muted">Cargando detalle…</p>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: '.85rem', margin: '.3rem 0' }}>Entradas del nuevo mercado</div>
              {detalleViver.det.entradas.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Sin entradas en este ciclo.</p>
              ) : (
                <div className="table-wrap"><table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Fecha</th><th>Ref.</th><th style={{ textAlign: 'right' }}>Cantidad</th></tr></thead>
                  <tbody>{detalleViver.det.entradas.map((e, i) => (
                    <tr key={i}><td>{dateTime(e.fecha)}</td><td className="mono">{e.ref ?? '—'}</td><td className="mono" style={{ textAlign: 'right' }}>+{num(e.cantidad)}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
              <div style={{ fontWeight: 700, fontSize: '.85rem', margin: '.7rem 0 .3rem' }}>Consumos</div>
              {detalleViver.det.consumos.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Sin consumos en este ciclo.</p>
              ) : (
                <div className="table-wrap"><table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Fecha</th><th>Código</th><th>Comida</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>{detalleViver.det.consumos.map((c, i) => (
                    <tr key={i}><td>{dateTime(c.fecha)}</td><td className="mono">{c.codigo ?? '—'}</td><td>{labelTipoComida(c.tipo_comida ?? '')}</td><td className="mono" style={{ textAlign: 'right' }}>−{num(c.cantidad)}</td><td className="mono" style={{ textAlign: 'right' }}>{money(c.valor)}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Cierre del mercado: reporte PDF (descargable / por correo) + arranca el próximo ciclo. */}
      {confirmarCierre && mercado && (
        <Modal title="🧾 Cerrar mercado" size="md" onClose={() => !cerrando && setConfirmarCierre(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmarCierre(false)} disabled={cerrando}>Cancelar</button>
            <button className="btn btn-ghost" onClick={() => void ejecutarCierre(false)} disabled={cerrando}>{cerrando ? 'Cerrando…' : '↓ Cerrar y descargar PDF'}</button>
            <button className="btn btn-primary" onClick={() => void ejecutarCierre(true)} disabled={cerrando}>{cerrando ? 'Cerrando…' : '✉ Cerrar y enviar por correo'}</button>
          </>
        }>
          <p style={{ marginTop: 0 }}>
            Se cierra el mercado <strong>{mercado.numero ?? ''}</strong> ({ciclo ? `día ${ciclo.dia} de ${CICLO_DIAS}` : ''}). Se genera el <strong>reporte del ciclo</strong> (consumo por víver y lo que queda) y el <strong>siguiente mercado arranca con el saldo</strong> de lo que quedó.
          </p>
          <div className="card" style={{ padding: '.6rem', marginBottom: '.7rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Víveres</div><div className="mono" style={{ fontWeight: 700 }}>{num(totMercado?.viveres ?? resMercado.length)}</div></div>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Consumo total</div><div className="mono" style={{ fontWeight: 700 }}>{money(totMercado?.consumo_valor ?? 0)}</div></div>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Pasan al próximo</div><div className="mono" style={{ fontWeight: 700 }}>{num(totMercado?.queda_viveres ?? 0)} víveres</div></div>
          </div>
          <div className="form-row">
            <label>Correo(s) para el reporte <span className="muted">(opcional · separá con coma)</span></label>
            <input className="input" value={emailCierre} onChange={(e) => setEmailCierre(e.target.value)} placeholder="correo@empresa.com, otro@empresa.com" />
            <small className="muted">Si lo dejás vacío y enviás por correo, va al destinatario por defecto (admin/jefe).</small>
          </div>
        </Modal>
      )}
    </div>
  );
}

function tituloRango(desde: string, hasta: string): string {
  if (desde && hasta) return `Consumo · ${desde} a ${hasta}`;
  if (desde) return `Consumo · desde ${desde}`;
  if (hasta) return `Consumo · hasta ${hasta}`;
  return 'Consumo · todo el histórico';
}

function KpiCard({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="card" style={{ borderColor: destacado ? 'var(--brand, #ff8a00)' : undefined }}>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '.75rem' }}>{nota}</div>}
    </div>
  );
}

/* ───────────── Añadir / editar movimiento (consumo de víveres) ───────────── */
function AddMovimientoModal({ viveres, actor, actorName, editar, onClose, onSaved }: {
  viveres: Producto[]; actor: string; actorName: string | null; editar?: CocinaMovimiento | null; onClose: () => void; onSaved: () => void;
}) {
  const esEdicion = !!editar;
  // Cantidades ya consumidas por este movimiento (al editar): liberan stock para la nueva cantidad.
  const oldQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of editar?.items ?? []) m.set(it.producto_id, (m.get(it.producto_id) ?? 0) + Number(it.cantidad || 0));
    return m;
  }, [editar]);
  // Datos de respaldo (sku/nombre/precio/almacén) de los víveres del movimiento, por si alguno
  // ya no está en el listado activo del inventario (así no se pierde al editar).
  const itemFallback = useMemo(() => {
    const m = new Map<string, { sku: string; nombre: string; precio: number; almacen: string | null }>();
    for (const it of editar?.items ?? []) m.set(it.producto_id, { sku: it.sku, nombre: it.nombre, precio: Number(it.precio) || 0, almacen: it.almacen ?? null });
    return m;
  }, [editar]);

  const [tipo, setTipo] = useState<TipoComida>(editar?.tipo_comida ?? 'almuerzo');
  const [platos, setPlatos] = useState(editar ? String(editar.platos ?? '') : '');
  const [nota, setNota] = useState(editar?.nota ?? '');
  // Fecha del servicio (por defecto hoy): permite cargar comidas de un día desfasado.
  const [fecha, setFecha] = useState(() => (editar?.at ? new Date(editar.at).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA')));
  // Selección tipo CHECK: producto_id → cantidad (texto). Marcar el check lo agrega
  // con cantidad 1; desmarcar lo quita. Se pueden elegir varios de un vistazo.
  const [sel, setSel] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const it of editar?.items ?? []) s[it.producto_id] = String(it.cantidad ?? '');
    return s;
  });
  const [busqueda, setBusqueda] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prodMap = useMemo(() => new Map(viveres.map((p) => [p.id, p])), [viveres]);
  const searchRef = useRef<HTMLInputElement>(null);
  // Stock disponible para un víver: al editar, se suma lo que este movimiento ya había
  // consumido (que se reintegra), para no bloquear una edición válida.
  const dispDe = (p: Producto) => Number(p.stock) + (esEdicion ? (oldQty.get(p.id) ?? 0) : 0);

  function toggle(pid: string) {
    setSel((s) => {
      if (pid in s) { const { [pid]: _drop, ...rest } = s; return rest; }
      return { ...s, [pid]: '1' };
    });
    // Al marcar, el foco pasa a la CANTIDAD (el input se autoenfoca al montarse).
  }
  function setCant(pid: string, v: string) { setSel((s) => ({ ...s, [pid]: v })); }
  // Tras escribir la cantidad y presionar Enter, el cursor vuelve al buscador para
  // encontrar el siguiente producto (se limpia la búsqueda para empezar de cero).
  function irABusqueda() {
    setBusqueda('');
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  // Filtrado de la lista por texto (nombre / SKU), sin acentos ni mayúsculas.
  const viveresFiltrados = useMemo(() => {
    const q = norm(busqueda).trim();
    if (!q) return viveres;
    return viveres.filter((p) => norm(`${p.nombre} ${p.sku}`).includes(q));
  }, [viveres, busqueda]);

  // Líneas seleccionadas (para el resumen/validación/submit).
  const lineas = useMemo(() => Object.entries(sel).map(([pid, cantStr]) => {
    const p = prodMap.get(pid) ?? null;
    const fb = itemFallback.get(pid) ?? null;
    const cant = Number(cantStr) || 0;
    const precio = Number(p?.precio ?? fb?.precio) || 0;
    // Disponible = stock actual + (al editar) lo que este movimiento ya consumía (se reintegra).
    const disponible = p ? Number(p.stock) + (esEdicion ? (oldQty.get(pid) ?? 0) : 0) : Infinity;
    const info = p
      ? { id: p.id, sku: p.sku, nombre: p.nombre, almacen: p.almacen ?? null }
      : fb ? { id: pid, sku: fb.sku, nombre: fb.nombre, almacen: fb.almacen } : null;
    return { pid, info, cant, precio, subtotal: cant * precio, excede: cant > disponible };
  }), [sel, prodMap, itemFallback, esEdicion, oldQty]);
  const total = lineas.reduce((a, l) => a + l.subtotal, 0);
  const nSeleccionados = lineas.length;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const items: CocinaItem[] = lineas.filter((l) => l.info && l.cant > 0).map((l) => ({
      producto_id: l.info!.id, sku: l.info!.sku, nombre: l.info!.nombre, cantidad: l.cant, precio: l.precio, almacen: l.info!.almacen ?? null,
    }));
    if (!items.length) { setError('Marcá al menos un víver con cantidad mayor a 0.'); return; }
    const exc = lineas.find((l) => l.excede);
    if (exc) { setError(`No hay stock suficiente de ${exc.info?.nombre} (disponible ${num(Number((prodMap.get(exc.pid)?.stock ?? 0)) + (esEdicion ? (oldQty.get(exc.pid) ?? 0) : 0))}).`); return; }
    const nPlatos = Number(platos) || 0;
    if (nPlatos <= 0) { setError('Indicá cuántos platos se realizaron.'); return; }
    // Fecha del servicio: se combina el día elegido con la hora actual (para el orden dentro
    // del día). Si es una fecha desfasada, queda registrado en ese día.
    let at: string | undefined;
    if (fecha) {
      const d = new Date(`${fecha}T${new Date().toTimeString().slice(0, 8)}`);
      if (!Number.isNaN(d.getTime())) at = d.toISOString();
    }
    setSaving(true);
    try {
      const r = esEdicion
        ? await actualizarMovimientoCocina(editar!.id, { tipoComida: tipo, platos: nPlatos, items, nota: nota || null, at, actor, actorName })
        : await crearMovimientoCocina({ tipoComida: tipo, platos: nPlatos, items, nota: nota || null, at, actor, actorName });
      notify(`Movimiento de cocina ${r.codigo} ${esEdicion ? 'actualizado' : ''} · ${labelTipoComida(tipo)} · ${money(Number(r.valor_total))}`, 'success', { link: '#/app/cocina' });
      onSaved();
    } catch (err) {
      // Los errores de Supabase (PostgrestError) NO son instancias de Error; igual traen
      // `message`. Se muestra el detalle real en vez del genérico para poder diagnosticar.
      const msg = err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err && (err as { message?: unknown }).message)
          ? String((err as { message: unknown }).message)
          : 'No se pudo guardar.';
      setError(msg); setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cocina-add" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : `${esEdicion ? 'Guardar cambios' : 'Registrar'} · ${money(total)}`}</button>
    </>
  );

  return (
    <Modal title={esEdicion ? `✏ Editar movimiento ${editar?.codigo ?? ''}` : 'Añadir movimiento de cocina'} size="lg" onClose={() => !saving && onClose()} footer={footer}>
      <form id="cocina-add" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Tipo de comida (una sola) */}
        <div className="form-row">
          <label>Tipo de comida</label>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {TIPOS_COMIDA.map((t) => (
              <label key={t.value} className="card" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0, padding: '.5rem .8rem', cursor: 'pointer', borderColor: tipo === t.value ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
                <input type="radio" name="tipo-comida" checked={tipo === t.value} onChange={() => setTipo(t.value)} />
                <span>{t.icono} {t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Fecha del servicio <span className="muted">(para comidas de un día desfasado)</span></label>
            <input className="input" type="date" value={fecha} max={new Date().toLocaleDateString('en-CA')} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>¿Cuántos platos se realizaron?</label>
            <input className="input mono" type="number" min={0} step="any" value={platos} onChange={(e) => setPlatos(e.target.value)} placeholder="Ej.: 24" required />
            {(Number(platos) || 0) > 0 && total > 0 && (
              <small className="muted">Prom. por plato: <strong className="mono" style={{ color: 'var(--brand, #ff8a00)' }}>{money(total / (Number(platos) || 1))}</strong></small>
            )}
          </div>
          <div className="form-row">
            <label>Nota (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comentario del servicio…" />
          </div>
        </div>

        {/* Víveres consumidos: checklist de TODOS los víveres del inventario (cualquier almacén) */}
        <div className="form-row">
          <label>Productos consumidos <span className="muted">(marcá los que se usaron · Alimentos, Víveres, Carnes, Proteínas, Hortalizas/Legumbres y Limpieza del inventario, sin importar el almacén)</span></label>
          <input ref={searchRef} className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder={viveres.length ? '🔍 Buscar víver por nombre o SKU…' : '— sin víveres en el inventario —'}
            style={{ marginBottom: '.5rem' }} disabled={!viveres.length} />
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {viveresFiltrados.length === 0 ? (
              <div className="muted" style={{ padding: '.7rem' }}>{viveres.length ? 'Sin coincidencias con la búsqueda.' : 'No hay productos de la categoría Víveres en el inventario.'}</div>
            ) : viveresFiltrados.map((p) => {
              const marcado = p.id in sel;
              const cant = Number(sel[p.id]) || 0;
              const disp = dispDe(p);
              const excede = marcado && cant > disp;
              return (
                <div key={p.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: '.5rem', alignItems: 'center',
                  padding: '.45rem .6rem', borderBottom: '1px solid var(--border)',
                  background: marcado ? 'var(--primary-soft, rgba(255,138,0,.10))' : 'transparent',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', cursor: 'pointer', minWidth: 0 }}>
                    <input type="checkbox" checked={marcado} onChange={() => toggle(p.id)} style={{ flex: '0 0 auto' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{p.nombre}</span> <span className="muted" style={{ fontSize: '.78rem' }}>({p.sku})</span>
                      <span className="muted" style={{ display: 'block', fontSize: '.74rem' }}>
                        📦 {num(disp)} {p.unidad ?? ''}{esEdicion && (oldQty.get(p.id) ?? 0) > 0 ? <span title="Incluye lo que este movimiento ya consumía (se reintegra al editar)"> (incl. {num(oldQty.get(p.id) ?? 0)} de este mov.)</span> : ''} · {money(Number(p.precio) || 0)} · {p.almacen || 'sin almacén'}
                      </span>
                    </span>
                  </label>
                  {marcado && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flex: '0 0 auto' }}>
                      <input className="input mono" type="number" min={0} step="any" value={sel[p.id]} autoFocus
                        onChange={(e) => setCant(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); irABusqueda(); } }}
                        style={{ width: 84, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                      <span className="muted" style={{ fontSize: '.74rem', minWidth: 54, textAlign: 'right' }}>{money(cant * (Number(p.precio) || 0))}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.4rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <small className="muted">Los precios salen del inventario (PMP). {esEdicion ? <>Al guardar, el inventario se <strong>ajusta por la diferencia</strong> (si bajás una cantidad, vuelve al stock; si la subís, se descuenta más).</> : <>Al registrar, cada víver se <strong>descuenta del stock</strong>.</>}</small>
            <span style={{ fontWeight: 700 }}>
              {nSeleccionados} seleccionado{nSeleccionados === 1 ? '' : 's'} · TOTAL {money(total)}
              {(Number(platos) || 0) > 0 && <> · Prom./plato <span style={{ color: 'var(--brand, #ff8a00)' }}>{money(total / (Number(platos) || 1))}</span></>}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Consumo / Resumen con barras ───────────── */
type Rango = 'hoy' | 'semana' | 'mes' | 'rango';
function ResumenModal({ viveres, onClose }: { viveres: Producto[]; onClose: () => void }) {
  const [rango, setRango] = useState<Rango>('hoy');
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [loading, setLoading] = useState(true);

  // Calcula el rango efectivo según el botón elegido.
  const { d, h } = useMemo(() => {
    const hoy = hoyISO();
    if (rango === 'hoy') return { d: hoy, h: hoy };
    if (rango === 'semana') return { d: inicioSemana(hoy), h: hoy };
    if (rango === 'mes') return { d: inicioMes(hoy), h: hoy };
    return { d: desde, h: hasta };
  }, [rango, desde, hasta]);

  useEffect(() => {
    setLoading(true);
    listMovimientosCocina({ desde: d, hasta: h }).then(setMovs).catch(() => setMovs([])).finally(() => setLoading(false));
  }, [d, h]);

  const resumen: ResumenCocina = useMemo(() => resumirCocina(movs), [movs]);
  const barrasTop: ChartPoint[] = resumen.topProductos.slice(0, 10).map((p) => ({ label: p.nombre, value: p.valor, tooltip: `${p.nombre}: ${money(p.valor)} · ${num(p.cantidad)} und` }));
  const promPlatoTipo = (t: TipoComida) => (resumen.porTipo[t].platos > 0 ? resumen.porTipo[t].valor / resumen.porTipo[t].platos : 0);
  const barrasTipo: ChartPoint[] = (['desayuno', 'almuerzo', 'cena'] as const).map((t) => ({ label: labelTipoComida(t), value: resumen.porTipo[t].valor, tooltip: `${labelTipoComida(t)}: ${money(resumen.porTipo[t].valor)} · ${resumen.porTipo[t].platos} platos · prom. ${money(promPlatoTipo(t))}/plato` }));
  const etiquetaRango = rango === 'hoy' ? `Día ${desdeLegible(d)}` : `${desdeLegible(d)} a ${desdeLegible(h)}`;

  return (
    <Modal title="📊 Consumo / Resumen" size="lg" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={() => descargarCocinaPdf({ titulo: `Consumo · ${etiquetaRango}`, resumen, movs }).catch(() => toast('No se pudo generar el PDF', 'error'))}>↓ Reporte PDF</button>
      </>
    }>
      {/* Selector de rango */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.75rem', alignItems: 'flex-end' }}>
        {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['rango', 'Rango…']] as const).map(([val, txt]) => (
          <button key={val} className={rango === val ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'} onClick={() => setRango(val)}>{txt}</button>
        ))}
        {rango === 'rango' && (
          <>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
          </>
        )}
      </div>

      {/* Resumen tipo "Día 23/06/2026: 24 platos, $300 total, prom $12,5/plato" */}
      <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
        <div style={{ fontSize: '.95rem' }}>
          <strong>{etiquetaRango}</strong> · <strong className="mono">{num(resumen.platos)}</strong> platos ·
          consumo total <strong className="mono">{money(resumen.valorTotal)}</strong> ·
          promedio por plato <strong className="mono">{money(resumen.promedioPorPlato)}</strong>
          <span className="muted"> · {resumen.movimientos} movimiento(s)</span>
        </div>
      </div>

      {/* Desglose por tipo de comida con prom. por plato */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}>Por tipo de comida</div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr>
              <th>Tipo de comida</th>
              <th style={{ textAlign: 'right' }}>Platos</th>
              <th style={{ textAlign: 'right' }}>Consumo</th>
              <th style={{ textAlign: 'right' }}>Prom./plato</th>
            </tr></thead>
            <tbody>
              {(['desayuno', 'almuerzo', 'cena'] as const).map((t) => (
                <tr key={t}>
                  <td>{TIPOS_COMIDA.find((x) => x.value === t)?.icono} {labelTipoComida(t)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(resumen.porTipo[t].platos)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(resumen.porTipo[t].valor)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--brand, #ff8a00)' }}>{resumen.porTipo[t].platos > 0 ? money(promPlatoTipo(t)) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(resumen.platos)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(resumen.valorTotal)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(resumen.promedioPorPlato)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      {loading ? <p className="muted">Cargando…</p> : (
        <>
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Víveres más consumidos ($)</div>
            <BarChart data={barrasTop} color="#10b981" yFormatter={(n) => money(n)} emptyMessage="Sin consumo en el rango." />
          </div>
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Consumo por tipo de comida ($)</div>
            <BarChart data={barrasTipo} color="#ff8a00" yFormatter={(n) => money(n)} emptyMessage="Sin consumo en el rango." />
          </div>

          {/* Stock disponible de víveres */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Stock disponible de víveres</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.82rem' }}>
                <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {viveres.map((p) => (
                    <tr key={p.id} style={{ opacity: Number(p.stock) <= 0 ? 0.5 : 1 }}>
                      <td>{p.nombre} <span className="muted mono" style={{ fontSize: '.72rem' }}>{p.sku}</span></td>
                      <td className="mono" style={{ textAlign: 'right', color: Number(p.stock) <= 0 ? 'var(--danger)' : undefined }}>{num(Number(p.stock))} {p.unidad ?? ''}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(p.precio))}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(p.stock) * Number(p.precio))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function desdeLegible(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
