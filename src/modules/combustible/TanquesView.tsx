import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ConsumoChartModal } from '@/shared/ui/ConsumoChartModal';
import type {
  CatalogoCombustible,
  ConciliacionCombustible,
  CubicacionCombustible,
  MovimientoTanque,
  TanqueCombustible,
  TipoCatalogoCombustible,
  TipoMovTanque,
  TipoTanque,
} from '@/shared/lib/types';
import {
  listTanques, listCatalogos, listMovimientosTanque, reporteGlobal, listConciliaciones,
  registrarEntrada, registrarUso, registrarTraslado, registrarRetorno, registrarMerma, eliminarMovimientoTanque,
  crearTanque, actualizarTanque, addCatalogo, setCatalogoActivo, crearConciliacion,
  listCubicaciones, crearCubicacion, eliminarCubicacion, cubicarLitros, capacidadCalculada,
  consumoUso, type ReporteTanque,
} from './tanques.repository';
import { descargarMovimientosTanquePdf } from './tanquePdf';
import { descargarMovimientosTanqueExcel } from './tanqueExcel';
import { enviarMovimientosTanquePorCorreo } from './enviarTanque';
import { MedidoresModal } from './MedidoresModal';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';

/** Hora actual del sistema (zona Venezuela) en formato «8:02:00 AM», como en el Excel. */
function horaSistema(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

const TIPO_MOV_LABEL: Record<TipoMovTanque, string> = {
  entrada: '⬇ Entrada (entra combustible)',
  uso: '⛽ Uso (consumo de equipo)',
  traslado: '↔ Traslado (a otra mina/tanque)',
  retorno: '↩ Retorno (vuelve al tanque)',
  merma: '🔻 Merma del tanque (pérdida)',
};

export function TanquesView() {
  const { user } = useSession();
  const { can } = usePermissions();
  const canWrite = can('combustible', 'escritura');
  const actor = user?.email ?? 'sistema';
  const { appUser } = usePermissions();
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [tanques, setTanques] = useState<TanqueCombustible[]>([]);
  const [reporte, setReporte] = useState<ReporteTanque[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoCombustible[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'mov' | 'tanque' | 'catalogos' | 'conciliacion' | 'consumo' | 'cubicacion' | 'medidores'>('none');
  const [editTanque, setEditTanque] = useState<TanqueCombustible | null>(null);
  // Filtros del libro mayor (registro de movimientos del tanque seleccionado).
  const [fTexto, setFTexto] = useState('');
  const [fTipo, setFTipo] = useState<'todos' | TipoMovTanque>('todos');
  const [fEquipo, setFEquipo] = useState('');
  const [fAutorizado, setFAutorizado] = useState('');
  const [fUbicacion, setFUbicacion] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [correoLibroOpen, setCorreoLibroOpen] = useState(false);

  const reloadTanques = useCallback(async () => {
    const [ts, rep, cat] = await Promise.all([listTanques(), reporteGlobal(), listCatalogos()]);
    setTanques(ts);
    setReporte(rep);
    setCatalogos(cat);
    setSelId((prev) => prev || ts[0]?.id || '');
  }, []);

  const reloadMovs = useCallback(async (id: string) => {
    if (!id) { setMovs([]); return; }
    setMovs(await listMovimientosTanque(id));
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reloadTanques().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reloadTanques]);

  useEffect(() => { void reloadMovs(selId); }, [selId, reloadMovs]);

  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos', 'combustible_catalogos', 'combustible_conciliaciones'], () => {
    void reloadTanques();
    void reloadMovs(selId);
  });

  const sel = useMemo(() => tanques.find((t) => t.id === selId) ?? null, [tanques, selId]);
  const totalDisponible = useMemo(() => reporte.reduce((a, r) => a + (Number(r.disponible) || 0), 0), [reporte]);

  // Al cambiar de tanque, limpiamos los filtros del libro.
  useEffect(() => { setFTexto(''); setFTipo('todos'); setFEquipo(''); setFAutorizado(''); setFUbicacion(''); setFDesde(''); setFHasta(''); }, [selId]);

  // Valores distintos presentes en los movimientos (para poblar los desplegables).
  const opcs = useMemo(() => {
    const uniq = (sel2: (m: MovimientoTanque) => string | null | undefined) =>
      Array.from(new Set(movs.map((m) => (sel2(m) ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
    return { equipos: uniq((m) => m.equipo), autorizados: uniq((m) => m.autorizado_por), ubicaciones: uniq((m) => m.ubicacion) };
  }, [movs]);

  const movsFiltrados = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return movs.filter((m) => {
      if (fTipo !== 'todos' && m.tipo !== fTipo) return false;
      if (fEquipo && (m.equipo ?? '') !== fEquipo) return false;
      if (fAutorizado && (m.autorizado_por ?? '') !== fAutorizado) return false;
      if (fUbicacion && (m.ubicacion ?? '') !== fUbicacion) return false;
      if (fDesde && (m.fecha ?? '') < fDesde) return false;
      if (fHasta && (m.fecha ?? '') > fHasta) return false;
      if (q) {
        const hay = [m.fecha, m.hora, m.equipo, m.autorizado_por, m.ubicacion, m.observacion, m.tipo]
          .map((x) => (x ?? '').toString().toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movs, fTexto, fTipo, fEquipo, fAutorizado, fUbicacion, fDesde, fHasta]);

  const hayFiltro = !!(fTexto || fTipo !== 'todos' || fEquipo || fAutorizado || fUbicacion || fDesde || fHasta);
  function limpiarFiltros() { setFTexto(''); setFTipo('todos'); setFEquipo(''); setFAutorizado(''); setFUbicacion(''); setFDesde(''); setFHasta(''); }

  async function recargarTodo() { await reloadTanques(); await reloadMovs(selId); }

  return (
    <div>
      <div className="filterbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <div className="muted" style={{ fontSize: '.85rem' }}>
          A la fecha hay <strong className="mono" style={{ color: 'var(--primary-3)' }}>{num(totalDisponible)} L</strong> disponibles en {reporte.length} tanque(s).
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('consumo')}>📊 Consumo por equipo</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('medidores')} title="Horómetros / contadores por equipo">🕒 Medidores</button>
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('cubicacion')} disabled={!sel} title="Medir altura → litros">📐 Cubicación</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('catalogos')}>🗂 Catálogos</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('conciliacion')} disabled={!sel}>⚖ Conciliación</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { setEditTanque(null); setModal('tanque'); }}>+ Tanque</button>}
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setModal('mov')} disabled={!tanques.length}>+ Nuevo movimiento</button>}
        </div>
      </div>

      {/* Reporte global por tanque */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', margin: '1rem 0 1.25rem' }}>
        {reporte.map((r) => {
          const cap = Number(r.tanque.capacidad_litros) || 0;
          const capCalc = Number(r.tanque.capacidad_calculada_litros) || 0;
          const disp = Number(r.disponible) || 0;
          const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
          const activo = r.tanque.id === selId;
          return (
            <div key={r.tanque.id} role="button" tabIndex={0} onClick={() => setSelId(r.tanque.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelId(r.tanque.id); }} className="card"
              style={{ textAlign: 'left', cursor: 'pointer', borderColor: activo ? 'var(--primary)' : 'var(--border)', borderWidth: activo ? 2 : 1, opacity: r.tanque.estado === 'activo' ? 1 : 0.55 }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
                <span>{r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}</span>
                <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}>
                  {r.tanque.es_movil && <span className="badge" title="Tanque móvil">móvil</span>}
                  {r.tanque.estado !== 'activo' && <span className="badge">inactivo</span>}
                  {canWrite && <button type="button" className="btn btn-sm btn-ghost" title="Editar tanque" onClick={(e) => { e.stopPropagation(); setEditTanque(r.tanque); setModal('tanque'); }}>✎</button>}
                </span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }} className="mono">{num(disp)} <span style={{ fontSize: '.8rem', fontWeight: 500 }}>L</span></div>
              <div style={{ height: 7, borderRadius: 5, background: 'var(--surface-2)', margin: '.5rem 0', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct < 12 ? 'var(--danger)' : 'var(--primary)' }} />
              </div>
              <div className="muted" style={{ fontSize: '.76rem' }}>
                Cap. {num(cap)} L{capCalc > 0 ? <> · calc. <span className="mono">{num(capCalc)}</span></> : null} · Tasa <strong className="mono">{money(r.tanque.tasa_usd_litro)}</strong>/L
              </div>
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
                ↓{num(r.entradas)} · ⛽{num(r.uso)} · ↔{num(r.traslados)} L
              </div>
            </div>
          );
        })}
        {!reporte.length && !loading && <div className="card"><p className="muted" style={{ margin: 0 }}>Sin tanques. Creá uno con "+ Tanque".</p></div>}
      </div>

      {/* Libro mayor del tanque seleccionado */}
      {sel && (
        <>
          <div className="page-head" style={{ marginBottom: '.5rem' }}>
            <div><h2 style={{ margin: 0 }}>📒 {sel.nombre}</h2><p className="muted" style={{ margin: 0, fontSize: '.82rem' }}>Saldo: <strong className="mono">{num(sel.saldo_litros)} L</strong> · <strong className="mono">{money(sel.saldo_usd)}</strong> · Tasa {money(sel.tasa_usd_litro)}/L</p></div>
          </div>

          {/* Filtros del libro mayor: búsqueda libre + todos los campos (estilo Tesorería) */}
          {!!movs.length && (
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
              <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                Registro de movimientos
                <button className="btn btn-sm btn-ghost" disabled={!movsFiltrados.length} title="Descargar PDF del registro (con el filtro aplicado)"
                  onClick={() => sel && void descargarMovimientosTanquePdf(sel, movsFiltrados, { filtro: hayFiltro ? 'filtrado' : undefined }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
                <button className="btn btn-sm btn-ghost" disabled={!movsFiltrados.length} title="Descargar Excel del registro (con el filtro aplicado)"
                  onClick={() => sel && void descargarMovimientosTanqueExcel(sel, movsFiltrados).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
                <button className="btn btn-sm btn-ghost" disabled={!movsFiltrados.length} title="Enviar el registro por correo (con el filtro aplicado)"
                  onClick={() => setCorreoLibroOpen(true)}>✉ Correo</button>
              </span>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <input className="input" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
                    placeholder="🔍 Buscar (equipo, autorizado, destino…)" style={{ width: 260, paddingRight: fTexto ? '1.6rem' : undefined }} />
                  {fTexto && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFTexto('')} title="Limpiar búsqueda"
                      style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
                  )}
                </div>
                <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as 'todos' | TipoMovTanque)} style={{ width: 'auto' }}>
                  <option value="todos">Todo movimiento</option>
                  <option value="entrada">⬇ Entrada</option>
                  <option value="uso">⛽ Uso</option>
                  <option value="traslado">↔ Traslado</option>
                  <option value="retorno">↩ Retorno</option>
                  <option value="merma">🔻 Merma</option>
                </select>
                <select className="select" value={fEquipo} onChange={(e) => setFEquipo(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Todo equipo</option>
                  {opcs.equipos.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="select" value={fAutorizado} onChange={(e) => setFAutorizado(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Todo autorizado</option>
                  {opcs.autorizados.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select className="select" value={fUbicacion} onChange={(e) => setFUbicacion(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Todo destino</option>
                  {opcs.ubicaciones.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                  Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
                </label>
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                  Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
                </label>
                {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={limpiarFiltros}>✕ Limpiar</button>}
                <span className="muted" style={{ fontSize: '.8rem' }}>{movsFiltrados.length}/{movs.length}</span>
              </div>
            </div>
          )}

          {loading ? <EmptyState message="Cargando…" icon="◔" /> : !movs.length ? (
            <EmptyState message="Sin movimientos en este tanque." icon="🛢" />
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Equipo</th><th>Autorizado</th><th>Destino</th><th>Observación</th>
                    <th>HI</th><th>HF</th><th>Hrs</th>
                    <th>Entrada</th><th>Uso</th><th>Traslado</th><th>Retorno</th><th>Merma</th><th>Saldo L</th>
                    <th>Tasa</th><th>$ Mov.</th><th>Saldo $</th>{canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {!movsFiltrados.length && (
                    <tr><td colSpan={canWrite ? 18 : 17} className="muted" style={{ textAlign: 'center' }}>Ningún movimiento coincide con el filtro.</td></tr>
                  )}
                  {movsFiltrados.map((m) => (
                    <tr key={m.id}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{m.fecha}{m.hora ? <div className="muted" style={{ fontSize: '.7rem' }}>{m.hora}</div> : null}</td>
                      <td>{m.equipo || '—'}</td>
                      <td className="muted">{m.autorizado_por || '—'}</td>
                      <td className="muted">{m.ubicacion || '—'}</td>
                      <td className="muted" style={{ maxWidth: 180 }}>{m.observacion || '—'}</td>
                      <td className="mono muted">{m.horometro_ini != null ? num(m.horometro_ini) : '—'}</td>
                      <td className="mono muted">{m.horometro_fin != null ? num(m.horometro_fin) : '—'}</td>
                      <td className="mono muted">{m.horas_utilizadas ? num(m.horas_utilizadas) : '—'}</td>
                      <td className="mono" style={{ color: 'var(--primary-3)' }}>{m.tipo === 'entrada' ? num(m.litros) : ''}</td>
                      <td className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'uso' ? num(m.litros) : ''}</td>
                      <td className="mono" style={{ color: 'var(--warning)' }}>{m.tipo === 'traslado' ? num(m.litros) : ''}</td>
                      <td className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{m.tipo === 'retorno' ? num(m.litros) : ''}</td>
                      <td className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'merma' ? num(m.litros) : ''}</td>
                      <td className="mono"><strong>{num(m.saldo_litros)}</strong></td>
                      <td className="mono muted">{money(m.tasa_usd_litro)}</td>
                      <td className="mono">{money(m.monto_usd)}</td>
                      <td className="mono"><strong>{money(m.saldo_usd)}</strong></td>
                      {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar (revierte saldo)" onClick={() => void borrar(m)}>🗑</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal === 'mov' && sel && (
        <MovimientoModal tanques={tanques.filter((t) => t.estado === 'activo')} tanqueSel={sel} catalogos={catalogos} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await recargarTodo(); }} />
      )}
      {modal === 'tanque' && (
        <TanqueModal catalogos={catalogos} actor={actor} tanque={editTanque}
          onClose={() => { setModal('none'); setEditTanque(null); }}
          onSaved={async () => { setModal('none'); setEditTanque(null); await reloadTanques(); }} />
      )}
      {modal === 'catalogos' && (
        <CatalogosModal catalogos={catalogos} onClose={() => setModal('none')} onChanged={reloadTanques} />
      )}
      {modal === 'conciliacion' && sel && (
        <ConciliacionModal tanque={sel} actor={actor} onClose={() => setModal('none')} />
      )}
      {modal === 'cubicacion' && sel && (
        <CubicacionModal tanque={sel} actor={actor} onClose={() => setModal('none')} onSaved={recargarTodo} />
      )}
      {modal === 'medidores' && (
        <MedidoresModal catalogos={catalogos} canWrite={canWrite} actor={actor} actorName={actorName} defaultEmail={user?.email ?? ''} onClose={() => setModal('none')} />
      )}
      {correoLibroOpen && sel && (
        <CorreoReporteModal
          titulo={`Enviar registro · ${sel.nombre}`}
          descripcion={`Se enviará el PDF del libro mayor de ${sel.nombre} (${movsFiltrados.length} movimiento(s)${hayFiltro ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={user?.email ?? ''}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarMovimientosTanquePorCorreo(sel, movsFiltrados, emails, { filtro: hayFiltro ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoLibroOpen(false)}
        />
      )}
      {modal === 'consumo' && (
        <ConsumoChartModal
          title="Consumo de combustible por equipo"
          subtitle="Litros consumidos (movimientos de USO) por equipo. El valor en $ usa la tasa del tanque."
          cargar={async (desde, hasta) => {
            const items = await consumoUso(desde, hasta, 'equipo');
            return items.map((x) => ({ id: x.id, label: x.nombre, unidad: 'Lt', cantidad: x.cantidad, valor: x.valor }));
          }}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );

  async function borrar(m: MovimientoTanque) {
    if (!confirm('¿Eliminar este movimiento? Se revertirá el saldo del tanque.')) return;
    try { await eliminarMovimientoTanque(m); await recargarTodo(); toast('Movimiento eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }
}

/* ───────────── Modal: nuevo movimiento ───────────── */

function MovimientoModal({ tanques, tanqueSel, catalogos, actor, actorName, onClose, onSaved }: {
  tanques: TanqueCombustible[]; tanqueSel: TanqueCombustible; catalogos: CatalogoCombustible[];
  actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [tanqueId, setTanqueId] = useState(tanqueSel.id);
  const [tipo, setTipo] = useState<TipoMovTanque>('uso');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(() => horaSistema());
  const [equipo, setEquipo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [litros, setLitros] = useState('');
  const [costo, setCosto] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const litrosNum = Number(litros) || 0;
    if (litrosNum <= 0) { setError('Indicá los litros.'); return; }
    if (tipo === 'traslado' && destinoId && destinoId === tanqueId) { setError('El tanque destino debe ser distinto.'); return; }
    const campos = { fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion };
    setSaving(true);
    try {
      if (tipo === 'entrada') await registrarEntrada({ tanqueId, litros: litrosNum, costoLitro: Number(costo) || 0, campos, actor, actorName });
      else if (tipo === 'uso') await registrarUso({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (tipo === 'retorno') await registrarRetorno({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (tipo === 'merma') await registrarMerma({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else await registrarTraslado({ tanqueId, litros: litrosNum, tanqueDestinoId: destinoId || null, campos, actor, actorName });
      toast('Movimiento registrado', 'success');
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-mov" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar movimiento'}</button>
    </>
  );
  return (
    <Modal title="Nuevo movimiento de tanque" size="lg" onClose={onClose} footer={footer}>
      <form id="tnk-mov" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Tanque</label>
            <select className="select" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}>
              {tanques.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {num(t.saldo_litros)} L</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Tipo de movimiento</label>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovTanque)}>
              <option value="entrada">{TIPO_MOV_LABEL.entrada}</option>
              <option value="uso">{TIPO_MOV_LABEL.uso}</option>
              <option value="traslado">{TIPO_MOV_LABEL.traslado}</option>
              <option value="retorno">{TIPO_MOV_LABEL.retorno}</option>
              <option value="merma">{TIPO_MOV_LABEL.merma}</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
          <div className="form-row"><label>Hora (opcional)</label><input className="input" value={hora} onChange={(e) => setHora(e.target.value)} placeholder="8:02:00 AM" /></div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Litros</label>
            <input className="input mono" type="number" min={0} step="any" value={litros} onChange={(e) => setLitros(e.target.value)} required />
          </div>
          {tipo === 'entrada' && (
            <div className="form-row">
              <label>Costo por litro (USD)</label>
              <input className="input mono" type="number" min={0} step="0.0001" value={costo} onChange={(e) => setCosto(e.target.value)} />
              <small className="muted">Recalcula la tasa promedio del tanque.</small>
            </div>
          )}
          {tipo === 'traslado' && (
            <div className="form-row">
              <label>Tanque destino (opcional)</label>
              <select className="select" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">— otra mina / externo —</option>
                {tanques.filter((t) => t.id !== tanqueId).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <small className="muted">Si es a otro tanque, se acredita allí al costo del origen.</small>
            </div>
          )}
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Equipo</label>
            <select className="select" value={equipo} onChange={(e) => setEquipo(e.target.value)}>
              <option value="">— elegí el equipo —</option>
              {opts('equipo').map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Autorizado por</label>
            <select className="select" value={autorizado} onChange={(e) => setAutorizado(e.target.value)}>
              <option value="">— elegí quién autorizó —</option>
              {opts('autorizado').map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <label>Destino</label>
          <select className="select" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
            <option value="">— elegí el destino —</option>
            {opts('ubicacion').map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
          </select>
          <small className="muted">¿Falta un destino? Agregalo en 🗂 Catálogos → Ubicaciones.</small>
        </div>
        <div className="form-row"><label>Observación</label><input className="input" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="SUMINISTRO COMBUSTIBLE…" /></div>
        <small className="muted">Los horómetros y contadores se registran ahora en <strong>🕒 Medidores</strong> (por equipo).</small>
      </form>
    </Modal>
  );
}

/* ───────────── Modal: nuevo tanque ───────────── */

function TanqueModal({ catalogos, actor, tanque, onClose, onSaved }: {
  catalogos: CatalogoCombustible[]; actor: string; tanque: TanqueCombustible | null; onClose: () => void; onSaved: () => void;
}) {
  const editando = !!tanque;
  const [nombre, setNombre] = useState(tanque?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoTanque>(tanque?.tipo ?? 'rectangular');
  const [esMovil, setEsMovil] = useState(!!tanque?.es_movil);
  const [radio, setRadio] = useState(tanque?.radio_m != null ? String(tanque.radio_m) : '');
  const [largo, setLargo] = useState(tanque?.largo_m != null ? String(tanque.largo_m) : '');
  const [ancho, setAncho] = useState(tanque?.ancho_m != null ? String(tanque.ancho_m) : '');
  const [alto, setAlto] = useState(tanque?.alto_m != null ? String(tanque.alto_m) : '');
  const [capacidad, setCapacidad] = useState(tanque?.capacidad_litros != null ? String(tanque.capacidad_litros) : '');
  const [saldo, setSaldo] = useState('');
  const [tasa, setTasa] = useState('');
  const [ubicacion, setUbicacion] = useState(tanque?.ubicacion ?? '');
  const [saving, setSaving] = useState(false);

  // Capacidad calculada por fórmula con las dimensiones actuales (preview en vivo).
  const geom = {
    tipo,
    radio_m: radio === '' ? null : Number(radio),
    largo_m: largo === '' ? null : Number(largo),
    ancho_m: ancho === '' ? null : Number(ancho),
    alto_m: alto === '' ? null : Number(alto),
  };
  const capCalc = capacidadCalculada(geom);

  function datosGeom() {
    return {
      nombre, tipo, esMovil,
      radioM: radio === '' ? null : Number(radio),
      largoM: largo === '' ? null : Number(largo),
      anchoM: ancho === '' ? null : Number(ancho),
      altoM: alto === '' ? null : Number(alto),
      capacidadLitros: Number(capacidad) || 0,
      ubicacion: ubicacion || null,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { toast('Indicá el nombre', 'error'); return; }
    setSaving(true);
    try {
      if (editando && tanque) {
        await actualizarTanque(tanque.id, datosGeom());
        toast('Tanque actualizado', 'success');
      } else {
        await crearTanque({ ...datosGeom(), saldoLitros: Number(saldo) || 0, tasaUsdLitro: Number(tasa) || 0, actor });
        toast('Tanque creado', 'success');
      }
      onSaved();
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error'); }
    finally { setSaving(false); }
  }
  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-new" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear tanque'}</button>
    </>
  );
  return (
    <Modal title={editando ? `Editar ${tanque?.nombre}` : 'Nuevo tanque'} size="md" onClose={onClose} footer={footer}>
      <form id="tnk-new" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-row"><label>Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tanque #4" /></div>
          <div className="form-row">
            <label>Tipo (para la cubicación)</label>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTanque)}>
              <option value="cilindrico_horizontal">Cilíndrico horizontal (acostado)</option>
              <option value="rectangular">Rectangular / prismático</option>
            </select>
          </div>
        </div>
        <label className="form-row" style={{ flexDirection: 'row', alignItems: 'center', gap: '.5rem' }}>
          <input type="checkbox" checked={esMovil} onChange={(e) => setEsMovil(e.target.checked)} />
          <span>🚚 Tanque móvil (camión de lubricación)</span>
        </label>

        {/* Dimensiones según el tipo */}
        {tipo === 'cilindrico_horizontal' ? (
          <div className="form-grid">
            <div className="form-row"><label>Radio R (m)</label><input className="input mono" type="number" min={0} step="any" value={radio} onChange={(e) => setRadio(e.target.value)} placeholder="1.1875" /></div>
            <div className="form-row"><label>Largo L (m)</label><input className="input mono" type="number" min={0} step="any" value={largo} onChange={(e) => setLargo(e.target.value)} placeholder="8.17" /></div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="form-row"><label>Largo (m)</label><input className="input mono" type="number" min={0} step="any" value={largo} onChange={(e) => setLargo(e.target.value)} placeholder="1.99" /></div>
            <div className="form-row"><label>Ancho (m)</label><input className="input mono" type="number" min={0} step="any" value={ancho} onChange={(e) => setAncho(e.target.value)} placeholder="0.99" /></div>
            <div className="form-row"><label>Alto / altura total (m)</label><input className="input mono" type="number" min={0} step="any" value={alto} onChange={(e) => setAlto(e.target.value)} placeholder="0.99" /></div>
          </div>
        )}

        <div className="form-grid">
          <div className="form-row">
            <label>Capacidad rotulada (L)</label>
            <input className="input mono" type="number" min={0} step="any" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="35000" />
            <small className="muted">Tope operativo (el del rótulo físico).</small>
          </div>
          <div className="form-row">
            <label>Capacidad calculada (L)</label>
            <input className="input mono" value={capCalc > 0 ? num(capCalc) : '—'} readOnly title="Calculada por fórmula con las dimensiones" />
            <small className="muted">Por fórmula, a la altura total.</small>
          </div>
        </div>

        {!editando && (
          <div className="form-grid">
            <div className="form-row"><label>Saldo inicial (L)</label><input className="input mono" type="number" min={0} step="any" value={saldo} onChange={(e) => setSaldo(e.target.value)} /></div>
            <div className="form-row"><label>Tasa inicial (USD/L)</label><input className="input mono" type="number" min={0} step="0.0001" value={tasa} onChange={(e) => setTasa(e.target.value)} /></div>
          </div>
        )}
        <div className="form-row">
          <label>Ubicación</label>
          <input className="input" list="cat-ubic-new" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Mina Golden touch" />
          <datalist id="cat-ubic-new">{catalogos.filter((c) => c.tipo === 'ubicacion' && c.activo).map((c) => <option key={c.id} value={c.valor} />)}</datalist>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Modal: catálogos ───────────── */

function CatalogosModal({ catalogos, onClose, onChanged }: {
  catalogos: CatalogoCombustible[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<TipoCatalogoCombustible>('equipo');
  const [valor, setValor] = useState('');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => catalogos.filter((c) => c.tipo === tab), [catalogos, tab]);
  const TABS: { key: TipoCatalogoCombustible; label: string }[] = [
    { key: 'equipo', label: 'Equipos' }, { key: 'autorizado', label: 'Autorizados' }, { key: 'ubicacion', label: 'Ubicaciones' },
  ];

  async function agregar() {
    if (!valor.trim()) { toast('Indicá el valor', 'error'); return; }
    setBusy(true);
    try { await addCatalogo(tab, valor); setValor(''); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function toggle(id: string, activo: boolean) {
    try { await setCatalogoActivo(id, !activo); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  return (
    <Modal title="Catálogos de combustible" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        {TABS.map((t) => <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
        <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={`Nuevo ${tab}…`} onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} />
        <button className="btn btn-primary" onClick={agregar} disabled={busy}>+ Agregar</button>
      </div>
      <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>Valor</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {!items.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin elementos.</td></tr>}
            {items.map((c) => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                <td>{c.valor}</td>
                <td>{c.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => toggle(c.id, c.activo)}>{c.activo ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: conciliación ───────────── */

function ConciliacionModal({ tanque, actor, onClose }: { tanque: TanqueCombustible; actor: string; onClose: () => void }) {
  const [periodo, setPeriodo] = useState('');
  const [reportado, setReportado] = useState('');
  const [cubic, setCubic] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<ConciliacionCombustible[]>([]);
  const libros = Number(tanque.saldo_litros) || 0;
  const dif = libros - (Number(reportado) || 0);
  const difCub = cubic === '' ? null : libros - (Number(cubic) || 0);

  useEffect(() => {
    listConciliaciones(tanque.id).then(setHistorial).catch(() => {});
    // Pre-cargar la última cubicación guardada como referencia.
    listCubicaciones(tanque.id).then((cs) => { if (cs[0]) setCubic(String(cs[0].litros_cubicacion)); }).catch(() => {});
  }, [tanque.id]);

  async function guardar() {
    setBusy(true);
    try {
      await crearConciliacion({
        tanqueId: tanque.id, periodo: periodo || null, saldoLibros: libros,
        saldoReportadoMina: Number(reportado) || 0,
        saldoCubicacion: cubic === '' ? null : Number(cubic) || 0,
        notas: notas || null, actor,
      });
      toast('Conciliación registrada', 'success');
      setHistorial(await listConciliaciones(tanque.id));
      setReportado(''); setNotas(''); setPeriodo('');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Conciliación · ${tanque.nombre}`} size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-grid">
          <div className="form-row"><label>Período</label><input className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Abril 2026" /></div>
          <div className="form-row"><label>Saldo en nuestros libros (L)</label><input className="input mono" value={num(libros)} readOnly /></div>
          <div className="form-row"><label>Saldo reportado por la mina (L)</label><input className="input mono" type="number" step="any" value={reportado} onChange={(e) => setReportado(e.target.value)} /></div>
          <div className="form-row"><label>Dif. vs mina (L)</label><input className="input mono" value={num(dif)} readOnly style={{ color: Math.abs(dif) > 0 ? 'var(--warning)' : 'var(--primary-3)' }} /></div>
          <div className="form-row"><label>Saldo por cubicación (L)</label><input className="input mono" type="number" step="any" value={cubic} onChange={(e) => setCubic(e.target.value)} placeholder="medición física" /></div>
          <div className="form-row"><label>Dif. vs cubicación (L)</label><input className="input mono" value={difCub == null ? '—' : num(difCub)} readOnly style={{ color: difCub != null && Math.abs(difCub) > 0 ? 'var(--warning)' : 'var(--primary-3)' }} /></div>
        </div>
        <div className="form-row"><label>Notas</label><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy}>Guardar conciliación</button>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th>Período</th><th>Libros</th><th>Mina</th><th>Dif. mina</th><th>Cubic.</th><th>Dif. cubic.</th><th>Notas</th></tr></thead>
          <tbody>
            {!historial.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>Sin conciliaciones.</td></tr>}
            {historial.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.fecha}</td><td>{c.periodo || '—'}</td>
                <td className="mono">{num(c.saldo_libros)}</td><td className="mono">{num(c.saldo_reportado_mina)}</td>
                <td className="mono" style={{ color: Math.abs(Number(c.diferencia) || 0) > 0 ? 'var(--warning)' : 'inherit' }}>{num(c.diferencia)}</td>
                <td className="mono">{c.saldo_cubicacion == null ? '—' : num(c.saldo_cubicacion)}</td>
                <td className="mono" style={{ color: c.dif_cubicacion != null && Math.abs(Number(c.dif_cubicacion)) > 0 ? 'var(--warning)' : 'inherit' }}>{c.dif_cubicacion == null ? '—' : num(c.dif_cubicacion)}</td>
                <td className="muted">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: cubicación (altura → litros) ───────────── */

function CubicacionModal({ tanque, actor, onClose, onSaved }: {
  tanque: TanqueCombustible; actor: string; onClose: () => void; onSaved: () => void;
}) {
  const [altura, setAltura] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<CubicacionCombustible[]>([]);

  const litros = cubicarLitros(tanque, Number(altura) || 0);
  const libros = Number(tanque.saldo_litros) || 0;
  const dif = libros - litros;
  const geomOk = tanque.tipo === 'cilindrico_horizontal'
    ? (Number(tanque.radio_m) > 0 && Number(tanque.largo_m) > 0)
    : (Number(tanque.largo_m) > 0 && Number(tanque.ancho_m) > 0);

  useEffect(() => { listCubicaciones(tanque.id).then(setHistorial).catch(() => {}); }, [tanque.id]);

  async function guardar() {
    if (altura === '') { toast('Indicá la altura medida', 'error'); return; }
    setBusy(true);
    try {
      await crearCubicacion({ tanqueId: tanque.id, alturaCm: Number(altura) || 0, fecha, notas: notas || null, actor });
      toast('Cubicación guardada', 'success');
      setHistorial(await listCubicaciones(tanque.id));
      setAltura(''); setNotas('');
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }
  async function borrar(id: string) {
    if (!confirm('¿Eliminar esta medición?')) return;
    try { await eliminarCubicacion(id); setHistorial(await listCubicaciones(tanque.id)); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <Modal title={`Cubicación · ${tanque.nombre}`} size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {!geomOk && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '1rem' }}>
          ⚠️ Este tanque no tiene dimensiones cargadas. Editá el tanque ({tanque.tipo === 'cilindrico_horizontal' ? 'radio y largo' : 'largo y ancho'}) para poder cubicar.
        </div>
      )}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
          Tipo: <strong>{tanque.tipo === 'cilindrico_horizontal' ? 'Cilíndrico horizontal' : 'Rectangular'}</strong>. Meté la varilla, leé la altura del líquido en cm y el sistema calcula los litros.
        </p>
        <div className="form-grid">
          <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="form-row"><label>Altura medida (cm)</label><input className="input mono" type="number" min={0} step="any" value={altura} onChange={(e) => setAltura(e.target.value)} placeholder="87" autoFocus /></div>
          <div className="form-row"><label>Litros (cubicación)</label><input className="input mono" value={num(litros)} readOnly style={{ color: 'var(--primary-3)', fontWeight: 700 }} /></div>
          <div className="form-row"><label>Saldo por libros (L)</label><input className="input mono" value={num(libros)} readOnly /></div>
          <div className="form-row"><label>Diferencia (L)</label><input className="input mono" value={num(dif)} readOnly style={{ color: Math.abs(dif) > 0 ? 'var(--warning)' : 'var(--primary-3)' }} /></div>
        </div>
        <div className="form-row"><label>Notas</label><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="medición río Aro…" /></div>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy || !geomOk}>Guardar medición</button>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th>Altura (cm)</th><th>Litros</th><th>Libros</th><th>Diferencia</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            {!historial.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin mediciones.</td></tr>}
            {historial.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.fecha}</td>
                <td className="mono">{num(c.altura_cm)}</td>
                <td className="mono" style={{ color: 'var(--primary-3)' }}>{num(c.litros_cubicacion)}</td>
                <td className="mono">{num(c.saldo_libros)}</td>
                <td className="mono" style={{ color: Math.abs(Number(c.diferencia) || 0) > 0 ? 'var(--warning)' : 'inherit' }}>{num(c.diferencia)}</td>
                <td className="muted">{c.notas || '—'}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => void borrar(c.id)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
