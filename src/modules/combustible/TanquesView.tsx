import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { SearchSelect } from '@/shared/ui/SearchSelect';
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
  registrarTrasladoMGG, DESTINO_MGG, DESTINO_MGG_LABEL, ultimoHorometroEquipo, ultimoContadorTanque,
  actualizarMovimientoTanque,
  crearTanque, actualizarTanque, eliminarTanque, addCatalogo, setCatalogoActivo, updateCatalogo, eliminarCatalogo, crearConciliacion,
  listCubicaciones, crearCubicacion, eliminarCubicacion, cubicarLitros, capacidadCalculada,
  consumoUso, resumenTanquesPeriodo, esBrasileros, type ReporteTanque, type ResumenTanquePeriodo,
} from './tanques.repository';
import { descargarMovimientosTanquePdf } from './tanquePdf';
import { descargarMovimientosTanqueExcel } from './tanqueExcel';
import { enviarMovimientosTanquePorCorreo } from './enviarTanque';
import { descargarConciliacionesPdf, type ConciliacionRow } from './conciliacionPdf';
import { descargarConciliacionesExcel } from './conciliacionExcel';
import { enviarConciliacionesPorCorreo } from './enviarConciliacion';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';

/** Hora actual del sistema (zona Venezuela) en formato «8:02:00 AM», como en el Excel. */
function horaSistema(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

/** YYYY-MM del mes actual (zona Venezuela). */
function mesActualVE(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return f.slice(0, 7);
}
/** «junio de 2026» a partir de «2026-06». */
function nombreMes(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(y, (m || 1) - 1, 1));
}
/** Mes (YYYY-MM) de una fecha ISO. */
const mesDe = (fecha: string | null | undefined) => (fecha ?? '').slice(0, 7);

/** Totales de un grupo de tanques: litros disponibles, valor en USD, tasa promedio
 *  ponderada por litros (correcta aunque cada tanque tenga distinta tasa) y cantidad. */
function totalesGrupo(rep: ReporteTanque[]): { litros: number; valor: number; tasa: number; count: number } {
  const litros = rep.reduce((a, r) => a + (Number(r.disponible) || 0), 0);
  const valor = rep.reduce((a, r) => a + (Number(r.disponible) || 0) * (Number(r.tanque.tasa_usd_litro) || 0), 0);
  return { litros, valor, tasa: litros > 0 ? valor / litros : 0, count: rep.length };
}

/** Tarjeta-resumen de un grupo de combustible (litros + valor + tasa promedio). */
function ResumenCombustible({ titulo, totales }: { titulo: string; totales: { litros: number; valor: number; tasa: number; count: number } }) {
  return (
    <div className="card" style={{ margin: 0, borderColor: 'var(--primary)', borderWidth: 2, background: 'linear-gradient(135deg, var(--surface-2), var(--surface))' }}>
      <div className="card-title"><span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
        <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M7 0 C7 0 0 8 0 12 a7 7 0 0 0 14 0 C14 8 7 0 7 0 Z" fill="#000" stroke="rgba(255,255,255,.35)" strokeWidth="0.6" />
        </svg>
        {titulo}
      </span></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-3)' }} className="mono">
          {num(totales.litros)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>ltrs</span>
        </div>
        <div className="muted" style={{ fontSize: '.9rem' }}>disponibles en <strong>{totales.count}</strong> tanque(s)</div>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
        <div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Valor total del combustible</div>
          <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>{money(totales.valor)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Tasa promedio (ponderada por litros)</div>
          <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{money(totales.tasa)} <span style={{ fontSize: '.8rem', fontWeight: 500 }}>/ltrs</span></div>
        </div>
      </div>
    </div>
  );
}

/** Un grupo de combustible: su tarjeta-resumen (banner) + las tarjetas de SUS tanques debajo. */
function GrupoTanques({ titulo, totales, grupo, canWrite, loading, estiloTop, vacio, onAbrir, onEditar }: {
  titulo: string;
  totales: { litros: number; valor: number; tasa: number; count: number };
  grupo: ReporteTanque[];
  canWrite: boolean;
  loading: boolean;
  estiloTop: string;
  vacio: string;
  onAbrir: (id: string) => void;
  onEditar: (t: TanqueCombustible) => void;
}) {
  return (
    <div style={{ marginTop: estiloTop, marginBottom: '1.5rem' }}>
      <ResumenCombustible titulo={titulo} totales={totales} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {grupo.map((r) => (
          <TanqueCard key={r.tanque.id} r={r} canWrite={canWrite}
            onClick={() => onAbrir(r.tanque.id)}
            onEdit={() => onEditar(r.tanque)} />
        ))}
        {!grupo.length && !loading && <div className="card"><p className="muted" style={{ margin: 0 }}>{vacio}</p></div>}
      </div>
    </div>
  );
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
  const [modal, setModal] = useState<'none' | 'mov' | 'tanque' | 'catalogos' | 'conciliacion' | 'consumo' | 'cubicacion'>('none');
  const [detalle, setDetalle] = useState<MovimientoTanque | null>(null);
  const [aBorrar, setABorrar] = useState<MovimientoTanque | null>(null);
  const [editTanque, setEditTanque] = useState<TanqueCombustible | null>(null);
  const [tanqueABorrar, setTanqueABorrar] = useState<TanqueCombustible | null>(null);
  const [borrandoTanque, setBorrandoTanque] = useState(false);
  // La lista actual solo muestra el mes en curso; lo anterior va al Histórico.
  const [historico, setHistorico] = useState(false);
  // Se incrementa ante cada recarga/realtime para que el modal Histórico (que tiene
  // su propio estado de movimientos) vuelva a consultar y refleje las ediciones.
  const [reloadKey, setReloadKey] = useState(0);
  const mesActual = useMemo(() => mesActualVE(), []);

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
    setReloadKey((k) => k + 1);
  });

  const sel = useMemo(() => tanques.find((t) => t.id === selId) ?? null, [tanques, selId]);
  // El total de combustible se divide en DOS grupos: «Los Brasileros» (Tanque #2
  // Brasileros + Registro Brasileros - GT, identificados por su nombre) y el resto.
  // Esos tanques se descuentan del total general y SOLO suman en la tarjeta Brasileros.
  const grupoBrasileros = useMemo(() => reporte.filter((r) => esBrasileros(r.tanque.nombre)), [reporte]);
  const grupoGeneral = useMemo(() => reporte.filter((r) => !esBrasileros(r.tanque.nombre)), [reporte]);
  const totalGeneral = useMemo(() => totalesGrupo(grupoGeneral), [grupoGeneral]);
  const totalBrasileros = useMemo(() => totalesGrupo(grupoBrasileros), [grupoBrasileros]);
  // Modo de vista: false = inicio (resumen + tarjetas); true = detalle (tarjeta + movimientos).
  const [abierto, setAbierto] = useState(false);
  const reporteSel = useMemo(() => reporte.find((r) => r.tanque.id === selId) ?? null, [reporte, selId]);

  // La lista actual solo muestra los movimientos del MES EN CURSO. Los meses
  // anteriores quedan en el Histórico (agrupados por mes). El saldo, horómetro y
  // contador NO se reinician: siguen encadenados sobre TODOS los movimientos.
  const movsMesActual = useMemo(() => movs.filter((m) => mesDe(m.fecha) === mesActual), [movs, mesActual]);

  async function recargarTodo() { await reloadTanques(); await reloadMovs(selId); setReloadKey((k) => k + 1); }

  return (
    <div>
      <div className="filterbar" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setHistorico(true)} disabled={!tanques.length} title="Movimientos de meses anteriores, por mes">📚 Histórico de Movimientos</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('consumo')}>📊 Consumo por equipo</button>
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('cubicacion')} disabled={!sel} title="Medir altura → litros">📐 Cubicación</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('catalogos')}>🗂 Catálogos</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('conciliacion')} disabled={!tanques.length} title="Conciliación semanal de los tanques">⚖ Conciliación</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { setEditTanque(null); setModal('tanque'); }}>+ Tanque</button>}
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setModal('mov')} disabled={!tanques.length}>+ Nuevo movimiento</button>}
        </div>
      </div>

      {!abierto ? (
        <>
          {/* Cada banner con SUS tanques debajo: general (sin Brasileros) y Los Brasileros. */}
          <GrupoTanques
            titulo="Combustible disponible" totales={totalGeneral} grupo={grupoGeneral}
            canWrite={canWrite} loading={loading} estiloTop="1rem"
            vacio={reporte.length ? 'Sin tanques en este grupo.' : 'Sin tanques. Creá uno con "+ Tanque".'}
            onAbrir={(id) => { setSelId(id); setAbierto(true); }}
            onEditar={(t) => { setEditTanque(t); setModal('tanque'); }} />
          <GrupoTanques
            titulo="Los Brasileros" totales={totalBrasileros} grupo={grupoBrasileros}
            canWrite={canWrite} loading={loading} estiloTop="0"
            vacio="Sin tanques en Los Brasileros."
            onAbrir={(id) => { setSelId(id); setAbierto(true); }}
            onEditar={(t) => { setEditTanque(t); setModal('tanque'); }} />
        </>
      ) : sel && reporteSel ? (
        <>
          {/* Detalle: botón Volver + tarjeta seleccionada arriba + movimientos abajo */}
          <div style={{ margin: '1rem 0 .75rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAbierto(false)} title="Volver al inicio de Combustible">← Volver</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <TanqueCard r={reporteSel} canWrite={canWrite} activo
              onEdit={() => { setEditTanque(reporteSel.tanque); setModal('tanque'); }} />
          </div>

          <div className="page-head" style={{ marginBottom: '.5rem' }}>
            <div><h2 style={{ margin: 0 }}>📒 {sel.nombre}</h2><p className="muted" style={{ margin: 0, fontSize: '.82rem' }}>Saldo: <strong className="mono">{num(sel.saldo_litros)} ltrs</strong> · <strong className="mono">{money(sel.saldo_usd)}</strong> · Tasa {money(sel.tasa_usd_litro)}/ltrs</p></div>
          </div>

          <RegistroMovimientos
            sel={sel}
            movs={movsMesActual}
            userEmail={user?.email ?? ''}
            canWrite={canWrite}
            allowDelete
            titulo={`Registro de movimientos · ${nombreMes(mesActual)}`}
            emptyMsg="Sin movimientos este mes."
            loading={loading}
            onVerDetalle={setDetalle}
            onBorrar={setABorrar}
          />
        </>
      ) : null}

      {modal === 'mov' && sel && (
        <MovimientoModal tanques={tanques.filter((t) => t.estado === 'activo')} tanqueSel={sel} catalogos={catalogos} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await recargarTodo(); }} />
      )}
      {modal === 'tanque' && (
        <TanqueModal catalogos={catalogos} actor={actor} tanque={editTanque}
          onClose={() => { setModal('none'); setEditTanque(null); }}
          onRequestDelete={(t) => { setModal('none'); setEditTanque(null); setTanqueABorrar(t); }}
          onSaved={async () => { setModal('none'); setEditTanque(null); await reloadTanques(); }} />
      )}
      {modal === 'catalogos' && (
        <CatalogosModal catalogos={catalogos} onClose={() => setModal('none')} onChanged={reloadTanques} />
      )}
      {modal === 'conciliacion' && (
        <ConciliacionModal tanques={tanques} actor={actor} defaultEmail={user?.email ?? ''} onClose={() => setModal('none')} />
      )}
      {modal === 'cubicacion' && sel && (
        <CubicacionModal tanque={sel} actor={actor} onClose={() => setModal('none')} onSaved={recargarTodo} />
      )}
      {detalle && (
        <DetalleMovimientoModal mov={detalle} tanque={tanques.find((t) => t.id === detalle.tanque_id) ?? sel}
          catalogos={catalogos} canWrite={canWrite}
          onClose={() => setDetalle(null)}
          onSaved={async () => { setDetalle(null); await recargarTodo(); }} />
      )}
      {aBorrar && (
        <ConfirmDialog
          title="Eliminar movimiento"
          message={
            aBorrar.tipo === 'traslado' && aBorrar.mov_vinculado_id
              ? 'Este es un traslado entre tanques. Al eliminarlo se revierte el saldo de AMBOS tanques (sale del destino y vuelve al origen). ¿Continuar?'
              : '¿Eliminar este movimiento? Se revertirá el saldo del tanque.'
          }
          confirmText="Eliminar"
          danger
          onCancel={() => setABorrar(null)}
          onConfirm={() => { const m = aBorrar; setABorrar(null); void borrar(m); }}
        />
      )}
      {tanqueABorrar && (
        <ConfirmDialog
          title={`Eliminar ${tanqueABorrar.nombre}`}
          message={`Vas a borrar el tanque «${tanqueABorrar.nombre}» y TODOS sus movimientos. Esta acción no se puede deshacer. Para confirmar que no es por error, escribí el nombre del tanque tal cual.`}
          requireText={tanqueABorrar.nombre}
          confirmText={borrandoTanque ? 'Eliminando…' : 'Eliminar tanque'}
          danger
          onCancel={() => { if (!borrandoTanque) setTanqueABorrar(null); }}
          onConfirm={async () => {
            const t = tanqueABorrar;
            setBorrandoTanque(true);
            try {
              await eliminarTanque(t.id);
              toast(`Tanque «${t.nombre}» eliminado`, 'success');
              setTanqueABorrar(null);
              if (selId === t.id) { setSelId(''); setAbierto(false); }
              await reloadTanques();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'No se pudo eliminar el tanque', 'error');
            } finally { setBorrandoTanque(false); }
          }}
        />
      )}
      {historico && (
        <HistoricoMovimientosModal
          tanques={tanques}
          reporte={reporte}
          userEmail={user?.email ?? ''}
          mesActual={mesActual}
          reloadKey={reloadKey}
          onVerDetalle={setDetalle}
          onClose={() => setHistorico(false)}
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
          realtimeTables={['combustible_tanque_movimientos', 'combustible_tanques']}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );

  async function borrar(m: MovimientoTanque) {
    try { await eliminarMovimientoTanque(m); await recargarTodo(); toast('Movimiento eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }
}

/* ───────────── Tarjeta de un tanque (reporte) ─────────────
   Reutilizable: en el grid del inicio (clickeable, abre el detalle) y arriba del
   detalle (sin click, solo informativa). */
function TanqueCard({ r, canWrite, activo, onClick, onEdit }: {
  r: ReporteTanque; canWrite: boolean; activo?: boolean;
  onClick?: () => void; onEdit?: () => void;
}) {
  const cap = Number(r.tanque.capacidad_litros) || 0;
  const capCalc = Number(r.tanque.capacidad_calculada_litros) || 0;
  const disp = Number(r.disponible) || 0;
  const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
  const clickable = !!onClick;
  return (
    <div role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick!(); } : undefined} className="card"
      style={{ textAlign: 'left', cursor: clickable ? 'pointer' : 'default', borderColor: activo ? 'var(--primary)' : 'var(--border)', borderWidth: activo ? 2 : 1, opacity: r.tanque.estado === 'activo' ? 1 : 0.55 }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
        <span>{r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}</span>
        <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}>
          {r.tanque.es_movil && <span className="badge" title="Tanque móvil">móvil</span>}
          {r.tanque.estado !== 'activo' && <span className="badge">inactivo</span>}
          {canWrite && onEdit && <button type="button" className="btn btn-sm btn-ghost" title="Editar tanque" onClick={(e) => { e.stopPropagation(); onEdit(); }}>✎</button>}
        </span>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800 }} className="mono">{num(disp)} <span style={{ fontSize: '.8rem', fontWeight: 500 }}>ltrs</span></div>
      <div style={{ height: 7, borderRadius: 5, background: 'var(--surface-2)', margin: '.5rem 0', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct < 12 ? 'var(--danger)' : 'var(--primary)' }} />
      </div>
      <div className="muted" style={{ fontSize: '.76rem' }}>
        Cap. {num(cap)} ltrs{capCalc > 0 ? <> · calc. <span className="mono">{num(capCalc)}</span></> : null} · Tasa <strong className="mono">{money(r.tanque.tasa_usd_litro)}</strong>/ltrs
      </div>
      <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
        ↓{num(r.entradas)} · ⛽{num(r.uso)} · ↔{num(r.traslados)} ltrs
      </div>
    </div>
  );
}

/* ───────────── Registro de movimientos (filtros + tabla) reutilizable ─────────────
   Se usa tanto para la LISTA ACTUAL (mes en curso) como para cada mes del HISTÓRICO.
   La tabla NO muestra Tanque, HI (horómetro inicial), Cont. ini ni Tasa: esos datos
   quedan disponibles en «Ver detalle». */
function RegistroMovimientos({ sel, movs, userEmail, canWrite, allowDelete, titulo, emptyMsg, loading, onVerDetalle, onBorrar }: {
  sel: TanqueCombustible;
  movs: MovimientoTanque[];        // ya acotados a un mes, en orden cronológico ascendente
  userEmail: string;
  canWrite: boolean;
  allowDelete?: boolean;
  titulo: ReactNode;
  emptyMsg?: string;
  loading?: boolean;
  onVerDetalle: (m: MovimientoTanque) => void;
  onBorrar?: (m: MovimientoTanque) => void;
}) {
  const [fTexto, setFTexto] = useState('');
  const [fTipo, setFTipo] = useState<'todos' | TipoMovTanque>('todos');
  const [fEquipo, setFEquipo] = useState('');
  const [fAutorizado, setFAutorizado] = useState('');
  const [fUbicacion, setFUbicacion] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [ordenDesc, setOrdenDesc] = useState(true);
  const [ordenCampo, setOrdenCampo] = useState<'fecha' | 'contIni' | 'contFin'>('fecha');
  const [correoOpen, setCorreoOpen] = useState(false);
  function ordenarPor(campo: 'fecha' | 'contIni' | 'contFin') {
    if (campo === ordenCampo) setOrdenDesc((d) => !d);
    else { setOrdenCampo(campo); setOrdenDesc(true); }
  }
  // Al cambiar de tanque, limpiamos los filtros.
  useEffect(() => { setFTexto(''); setFTipo('todos'); setFEquipo(''); setFAutorizado(''); setFUbicacion(''); setFDesde(''); setFHasta(''); }, [sel.id]);

  const opcs = useMemo(() => {
    const uniq = (g: (m: MovimientoTanque) => string | null | undefined) =>
      Array.from(new Set(movs.map((m) => (g(m) ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
    return { equipos: uniq((m) => m.equipo), autorizados: uniq((m) => m.autorizado_por), ubicaciones: uniq((m) => m.ubicacion) };
  }, [movs]);

  const movsFiltrados = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    const arr = movs.filter((m) => {
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
    if (ordenCampo === 'fecha') return ordenDesc ? arr.slice().reverse() : arr;
    return arr.slice().sort((a, b) => {
      const av = ordenCampo === 'contIni' ? a.contador_global_ini : a.contador_global_fin;
      const bv = ordenCampo === 'contIni' ? b.contador_global_ini : b.contador_global_fin;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const d = Number(av) - Number(bv);
      return ordenDesc ? -d : d;
    });
  }, [movs, fTexto, fTipo, fEquipo, fAutorizado, fUbicacion, fDesde, fHasta, ordenDesc, ordenCampo]);

  const hayFiltro = !!(fTexto || fTipo !== 'todos' || fEquipo || fAutorizado || fUbicacion || fDesde || fHasta);
  function limpiarFiltros() { setFTexto(''); setFTipo('todos'); setFEquipo(''); setFAutorizado(''); setFUbicacion(''); setFDesde(''); setFHasta(''); }

  return (
    <>
      {!!movs.length && (
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
          <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {titulo}
            <button className="btn btn-sm btn-ghost" disabled={!movsFiltrados.length} title="Descargar PDF del registro (con el filtro aplicado)"
              onClick={() => void descargarMovimientosTanquePdf(sel, movsFiltrados, { filtro: hayFiltro ? 'filtrado' : undefined }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
            <button className="btn btn-sm btn-ghost" disabled={!movsFiltrados.length} title="Descargar Excel del registro (con el filtro aplicado)"
              onClick={() => void descargarMovimientosTanqueExcel(sel, movsFiltrados).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
            <button className="btn btn-sm btn-ghost" disabled={!movsFiltrados.length} title="Enviar el registro por correo (con el filtro aplicado)"
              onClick={() => setCorreoOpen(true)}>✉ Correo</button>
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
            <SearchSelect value={fEquipo} onChange={setFEquipo} placeholder="🔍 Equipo…" style={{ width: 180 }}
              options={[{ value: '', label: 'Todo equipo' }, ...opcs.equipos.map((v) => ({ value: v, label: v }))]} />
            <SearchSelect value={fAutorizado} onChange={setFAutorizado} placeholder="🔍 Autorizado…" style={{ width: 180 }}
              options={[{ value: '', label: 'Todo autorizado' }, ...opcs.autorizados.map((v) => ({ value: v, label: v }))]} />
            <SearchSelect value={fUbicacion} onChange={setFUbicacion} placeholder="🔍 Destino…" style={{ width: 180 }}
              options={[{ value: '', label: 'Todo destino' }, ...opcs.ubicaciones.map((v) => ({ value: v, label: v }))]} />
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <button className={`btn btn-sm ${ordenCampo === 'fecha' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => ordenarPor('fecha')} title="Ordenar por fecha y hora">
              Fecha {ordenCampo === 'fecha' ? (ordenDesc ? '↓ (nuevo→viejo)' : '↑ (viejo→nuevo)') : ''}
            </button>
            <button className={`btn btn-sm ${ordenCampo === 'contFin' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => ordenarPor('contFin')} title="Ordenar por el contador final del surtidor">
              Cont. F {ordenCampo === 'contFin' ? (ordenDesc ? '↓' : '↑') : ''}
            </button>
            {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={limpiarFiltros}>✕ Limpiar</button>}
            <span className="muted" style={{ fontSize: '.8rem' }}>{movsFiltrados.length}/{movs.length}</span>
          </div>
        </div>
      )}

      {loading ? <EmptyState message="Cargando…" icon="◔" /> : !movs.length ? (
        <EmptyState message={emptyMsg ?? 'Sin movimientos.'} icon="🛢" />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th>Fecha</th><th>Equipo</th><th>Autorizado</th><th>Destino</th><th>Observación</th>
                <th>HF</th><th>Hrs</th>
                <th>Cont. fin</th><th>Lt usados (cont.)</th>
                <th>Entrada</th><th>Uso</th><th>Traslado</th><th>Retorno</th><th>Merma</th><th>Saldo ltrs</th>
                <th>$ Mov.</th><th>Saldo $</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!movsFiltrados.length && (
                <tr><td colSpan={18} className="muted" style={{ textAlign: 'center' }}>Ningún movimiento coincide con el filtro.</td></tr>
              )}
              {movsFiltrados.map((m) => (
                <tr key={m.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{m.fecha}{m.hora ? <div className="muted" style={{ fontSize: '.7rem' }}>{m.hora}</div> : null}</td>
                  <td>{m.equipo || '—'}</td>
                  <td className="muted">{m.autorizado_por || '—'}</td>
                  <td className="muted">{m.ubicacion || '—'}</td>
                  <td className="muted" style={{ maxWidth: 180 }}>{m.observacion || '—'}</td>
                  <td className="mono muted">{m.horometro_fin != null ? num(m.horometro_fin) : '—'}</td>
                  <td className="mono muted">{m.horas_utilizadas ? num(m.horas_utilizadas) : '—'}</td>
                  <td className="mono muted">{m.contador_global_fin != null ? num(m.contador_global_fin) : '—'}</td>
                  <td className="mono muted">{m.contador_global_dif ? num(m.contador_global_dif) : '—'}</td>
                  <td className="mono" style={{ color: 'var(--primary-3)' }}>{m.tipo === 'entrada' ? num(m.litros) : ''}</td>
                  <td className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'uso' ? num(m.litros) : ''}</td>
                  <td className="mono" style={{ color: 'var(--warning)' }}>{m.tipo === 'traslado' ? num(m.litros) : ''}</td>
                  <td className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{m.tipo === 'retorno' ? num(m.litros) : ''}</td>
                  <td className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'merma' ? num(m.litros) : ''}</td>
                  <td className="mono"><strong>{num(m.saldo_litros)}</strong></td>
                  <td className="mono">{money(m.monto_usd)}</td>
                  <td className="mono"><strong>{money(m.saldo_usd)}</strong></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-ghost" title="Ver detalle" onClick={() => onVerDetalle(m)}>👁 Ver</button>
                    {canWrite && allowDelete && onBorrar && <button className="btn btn-sm btn-ghost" title="Eliminar (revierte saldo)" onClick={() => onBorrar(m)}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {correoOpen && (
        <CorreoReporteModal
          titulo={`Enviar registro · ${sel.nombre}`}
          descripcion={`Se enviará el PDF del registro de ${sel.nombre} (${movsFiltrados.length} movimiento(s)${hayFiltro ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={userEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarMovimientosTanquePorCorreo(sel, movsFiltrados, emails, { filtro: hayFiltro ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
    </>
  );
}

/* ───────────── Modal: Histórico de Movimientos (por tanque y por mes) ─────────────
   Tarjetas de tanques → al elegir uno, sus movimientos de meses ANTERIORES al actual,
   agrupados por mes, con filtros, búsqueda y reportes. El mes en curso NO aparece acá
   (ese está en la lista actual). No se reinicia saldo/horómetro/contador: solo es una
   vista segmentada por mes de los mismos movimientos. */
function HistoricoMovimientosModal({ tanques, reporte, userEmail, mesActual, reloadKey, onVerDetalle, onClose }: {
  tanques: TanqueCombustible[];
  reporte: ReporteTanque[];
  userEmail: string;
  mesActual: string;
  reloadKey: number;
  onVerDetalle: (m: MovimientoTanque) => void;
  onClose: () => void;
}) {
  const [tankId, setTankId] = useState('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState('');
  const tank = useMemo(() => tanques.find((t) => t.id === tankId) ?? null, [tanques, tankId]);

  useEffect(() => {
    if (!tankId) { setMovs([]); setMes(''); return; }
    let cancel = false;
    setLoading(true);
    listMovimientosTanque(tankId).then((ms) => {
      if (cancel) return;
      // Solo meses ANTERIORES al mes en curso (el actual vive en la lista actual).
      const previos = ms.filter((m) => mesDe(m.fecha) < mesActual);
      setMovs(previos);
      const meses = Array.from(new Set(previos.map((m) => mesDe(m.fecha)).filter(Boolean))).sort();
      // Conservar el mes que el usuario está viendo (si sigue existiendo tras recargar);
      // si no, mostrar el más reciente.
      setMes((prev) => (prev && meses.includes(prev) ? prev : (meses[meses.length - 1] ?? '')));
    }).catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar el histórico', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
    // reloadKey: al editar/eliminar un movimiento (o por realtime) se vuelve a consultar.
  }, [tankId, mesActual, reloadKey]);

  const meses = useMemo(() => Array.from(new Set(movs.map((m) => mesDe(m.fecha)).filter(Boolean))).sort().reverse(), [movs]);
  const movsMes = useMemo(() => movs.filter((m) => mesDe(m.fecha) === mes), [movs, mes]);

  return (
    <Modal title="📚 Histórico de Movimientos" size="xl" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {!tankId ? (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Elegí un tanque para ver sus movimientos de meses anteriores, agrupados por mes.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {reporte.map((r) => {
              const cap = Number(r.tanque.capacidad_litros) || 0;
              const disp = Number(r.disponible) || 0;
              const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
              return (
                <div key={r.tanque.id} role="button" tabIndex={0} onClick={() => setTankId(r.tanque.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTankId(r.tanque.id); }} className="card"
                  style={{ textAlign: 'left', cursor: 'pointer', opacity: r.tanque.estado === 'activo' ? 1 : 0.55 }}>
                  <div className="card-title"><span>{r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}</span></div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }} className="mono">{num(disp)} <span style={{ fontSize: '.8rem', fontWeight: 500 }}>ltrs</span></div>
                  <div style={{ height: 7, borderRadius: 5, background: 'var(--surface-2)', margin: '.5rem 0', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct < 12 ? 'var(--danger)' : 'var(--primary)' }} />
                  </div>
                  <div className="muted" style={{ fontSize: '.76rem' }}>
                    Cap. {num(cap)} ltrs · Tasa <strong className="mono">{money(r.tanque.tasa_usd_litro)}</strong>/ltrs
                  </div>
                  <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
                    ↓{num(r.entradas)} · ⛽{num(r.uso)} · ↔{num(r.traslados)} ltrs
                  </div>
                </div>
              );
            })}
            {!reporte.length && <div className="card"><p className="muted" style={{ margin: 0 }}>Sin tanques.</p></div>}
          </div>
        </>
      ) : (
        <>
          <div className="page-head" style={{ marginBottom: '.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setTankId('')}>← Tanques</button>
              <h3 style={{ margin: 0 }}>{tank?.es_movil ? '🚚' : '🛢'} {tank?.nombre}</h3>
              {!!meses.length && (
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.82rem' }}>
                  Mes
                  <select className="select" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 'auto' }}>
                    {meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
          {loading ? <EmptyState message="Cargando…" icon="◔" /> : !meses.length ? (
            <EmptyState message="Este tanque aún no tiene meses anteriores en el histórico." icon="📚" />
          ) : tank ? (
            <RegistroMovimientos
              sel={tank}
              movs={movsMes}
              userEmail={userEmail}
              canWrite={false}
              titulo={`Movimientos · ${nombreMes(mes)}`}
              emptyMsg="Sin movimientos en este mes."
              onVerDetalle={onVerDetalle}
            />
          ) : null}
        </>
      )}
    </Modal>
  );
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
  // Medidores del equipo (integrados al movimiento, ya no en un modal aparte).
  const [hi, setHi] = useState('');
  const [hf, setHf] = useState('');
  const [ci, setCi] = useState('');
  const [cf, setCf] = useState('');
  // Cuando el HI / contador inicial se traen del último del equipo, quedan BLOQUEADOS (no se modifican).
  const [hiAuto, setHiAuto] = useState(false);
  const [ciAuto, setCiAuto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);

  // El HORÓMETRO inicial sí es del vehículo: autocarga con el último HF de ese equipo.
  const cargarHi = useCallback(() => {
    if (!equipo) { setHiAuto(false); return; }
    ultimoHorometroEquipo(equipo).then((ult) => {
      if (ult != null) { setHi(String(ult)); setHiAuto(true); } else { setHiAuto(false); }
    }).catch(() => {});
  }, [equipo]);
  useEffect(() => { cargarHi(); }, [cargarHi]);

  // El CONTADOR GLOBAL es por TANQUE: el contador final de un movimiento es el inicial del
  // siguiente del mismo tanque. Para un movimiento normal trae el último del tanque seleccionado;
  // para un traslado trae el del tanque ORIGEN (que es justamente el tanque seleccionado), y
  // ese contador se refleja luego en el tanque destino. Si trae dato, se bloquea.
  const cargarCi = useCallback(() => {
    if (!tanqueId) { setCiAuto(false); return; }
    ultimoContadorTanque(tanqueId).then((ult) => {
      if (ult != null) { setCi(String(ult)); setCiAuto(true); } else { setCi(''); setCiAuto(false); }
    }).catch(() => {});
  }, [tanqueId]);
  useEffect(() => { cargarCi(); }, [cargarCi]);

  // En vivo: si se elimina/edita/agrega un movimiento (acá o por otro usuario), el HI del
  // equipo y el contador del tanque se vuelven a consultar para no quedar desfasados.
  useRealtime(['combustible_tanque_movimientos'], () => { cargarHi(); cargarCi(); });

  const hrs = hi !== '' && hf !== '' ? Number(hf) - Number(hi) : null;
  // Litros usados según el contador del surtidor (final − inicial). No se modifica.
  const litrosContador = ci !== '' && cf !== '' ? Number(cf) - Number(ci) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const litrosNum = Number(litros) || 0;
    if (litros.trim() === '' || litrosNum === 0) { setError('Indicá los litros (se admiten negativos, como en el Excel).'); return; }
    if (tipo === 'traslado' && !destinoId) { setError('Indicá el tanque destino del traslado.'); return; }
    if (tipo === 'traslado' && destinoId === tanqueId) { setError('El tanque destino debe ser distinto.'); return; }
    const campos = {
      fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
      horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
      contadorGlobalIni: ci === '' ? null : Number(ci), contadorGlobalFin: cf === '' ? null : Number(cf),
    };
    setSaving(true);
    try {
      if (tipo === 'entrada') await registrarEntrada({ tanqueId, litros: litrosNum, costoLitro: Number(costo) || 0, campos, actor, actorName });
      else if (tipo === 'uso') await registrarUso({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (tipo === 'retorno') await registrarRetorno({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (tipo === 'merma') await registrarMerma({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (destinoId === DESTINO_MGG) await registrarTrasladoMGG({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else await registrarTraslado({ tanqueId, litros: litrosNum, tanqueDestinoId: destinoId || null, campos, actor, actorName });
      toast('Movimiento registrado', 'success');
      onSaved();
    } catch (err) { setError((err as { message?: string })?.message || 'No se pudo registrar.'); }
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
            <SearchSelect value={tanqueId} onChange={setTanqueId} placeholder="Buscar tanque…"
              options={tanques.map((t) => ({ value: t.id, label: `${t.nombre} · ${num(t.saldo_litros)} L` }))} />
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
          <div className="form-row"><label>Hora (opcional)</label><input className="input" name="mov-hora" defaultValue={hora} onChange={(e) => setHora(e.target.value)} placeholder="8:02:00 AM" /></div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Litros</label>
            <input className="input mono" type="number" step="any" name="mov-litros" defaultValue={litros} onChange={(e) => setLitros(e.target.value)} required />
          </div>
          {tipo === 'entrada' && (
            <div className="form-row">
              <label>Costo por litro (USD)</label>
              <input className="input mono" type="number" min={0} step="0.0001" name="mov-costo" defaultValue={costo} onChange={(e) => setCosto(e.target.value)} />
              <small className="muted">Recalcula la tasa promedio del tanque.</small>
            </div>
          )}
          {tipo === 'traslado' && (
            <div className="form-row">
              <label>Tanque destino *</label>
              <SearchSelect value={destinoId} onChange={setDestinoId} placeholder="🔍 Buscar destino…"
                options={[
                  { value: '', label: '— elegí el tanque destino —' },
                  { value: DESTINO_MGG, label: `🌐 ${DESTINO_MGG_LABEL} (otro sistema)` },
                  ...tanques.filter((t) => t.id !== tanqueId).map((t) => ({ value: t.id, label: t.nombre })),
                ]} />
              <small className="muted">Si es a otro tanque, se acredita allí al costo del origen. <strong>{DESTINO_MGG_LABEL}</strong> envía el combustible al otro sistema (MGG lo confirma y entra a su TANQUE MGG).</small>
            </div>
          )}
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Equipo</label>
            <SearchSelect value={equipo} onChange={setEquipo} placeholder="🔍 Buscar equipo…"
              options={[{ value: '', label: '— elegí el equipo —' }, ...opts('equipo').map((c) => ({ value: c.valor, label: c.valor }))]} />
          </div>
          <div className="form-row">
            <label>Autorizado por</label>
            <SearchSelect value={autorizado} onChange={setAutorizado} placeholder="🔍 Buscar autorizado…"
              options={[{ value: '', label: '— elegí quién autorizó —' }, ...opts('autorizado').map((c) => ({ value: c.valor, label: c.valor }))]} />
          </div>
        </div>
        <div className="form-row">
          <label>Destino</label>
          <SearchSelect value={ubicacion} onChange={setUbicacion} placeholder="🔍 Buscar destino…"
            options={[{ value: '', label: '— elegí el destino —' }, ...opts('ubicacion').map((c) => ({ value: c.valor, label: c.valor }))]} />
          <small className="muted">¿Falta un destino? Agregalo en 🗂 Catálogos → Ubicaciones.</small>
        </div>
        <div className="form-row"><label>Observación</label><input className="input" name="mov-observacion" defaultValue={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="SUMINISTRO COMBUSTIBLE…" /></div>

        {/* Medidores del equipo — parte del movimiento (no opcional). El HI autocarga con el último HF del equipo. */}
        <div className="card" style={{ marginTop: '.75rem' }}>
          <div className="card-title">🕒 Medidores del equipo</div>
          <div className="form-grid">
            <div className="form-row">
              <label>Horómetro inicial (HI)</label>
              <input className="input mono" type="number" step="any" value={hi} onChange={(e) => setHi(e.target.value)} readOnly={hiAuto}
                placeholder="auto: último del equipo" style={hiAuto ? { background: 'rgba(255,255,255,.04)', cursor: 'not-allowed' } : undefined} />
              <small className="muted">{hiAuto ? 'Traído del último final del equipo (no se modifica).' : 'Trae el último horómetro final del equipo; si no hay, ingresalo.'}</small>
            </div>
            <div className="form-row">
              <label>Horómetro final (HF)</label>
              <input className="input mono" type="number" step="any" name="mov-hf" defaultValue={hf} onChange={(e) => setHf(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <label>Horas utilizadas (HRS = HF − HI)</label>
            <input className="input mono" value={hrs == null ? '' : num(hrs)} readOnly placeholder="se calcula automáticamente"
              style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Contador global inicial</label>
              <input className="input mono" type="number" step="any" value={ci} onChange={(e) => setCi(e.target.value)} readOnly={ciAuto}
                placeholder="auto: último del tanque" style={ciAuto ? { background: 'rgba(255,255,255,.04)', cursor: 'not-allowed' } : undefined} />
              <small className="muted">{ciAuto ? (tipo === 'traslado' ? 'Traído del último contador final del tanque ORIGEN (se reflejará en el destino).' : 'Traído del último contador final de este tanque (no se modifica).') : 'No hay contador previo en este tanque; ingresalo.'}</small>
            </div>
            <div className="form-row"><label>Contador global final</label><input className="input mono" type="number" step="any" name="mov-cf" defaultValue={cf} onChange={(e) => setCf(e.target.value)} /></div>
          </div>
          <div className="form-row">
            <label>Litros usados (según contador = final − inicial)</label>
            <input className="input mono" value={litrosContador == null ? '' : num(litrosContador)} readOnly placeholder="se calcula automáticamente"
              style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Modal: ver / editar detalle de un movimiento ───────────── */

function DetalleMovimientoModal({ mov, tanque, catalogos, canWrite, onClose, onSaved }: {
  mov: MovimientoTanque; tanque: TanqueCombustible | null | undefined; catalogos: CatalogoCombustible[];
  canWrite: boolean; onClose: () => void; onSaved: () => void;
}) {
  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));

  const [fecha, setFecha] = useState(mov.fecha);
  const [hora, setHora] = useState(mov.hora ?? '');
  const [equipo, setEquipo] = useState(mov.equipo ?? '');
  const [autorizado, setAutorizado] = useState(mov.autorizado_por ?? '');
  const [ubicacion, setUbicacion] = useState(mov.ubicacion ?? '');
  const [observacion, setObservacion] = useState(mov.observacion ?? '');
  const [tipo, setTipo] = useState<TipoMovTanque>(mov.tipo);
  const [litros, setLitros] = useState(s(mov.litros));
  const [tasa, setTasa] = useState(s(mov.tasa_usd_litro));
  const [hi, setHi] = useState(s(mov.horometro_ini));
  const [hf, setHf] = useState(s(mov.horometro_fin));
  const [ci, setCi] = useState(s(mov.contador_global_ini));
  const [cf, setCf] = useState(s(mov.contador_global_fin));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hrs = hi !== '' && hf !== '' ? Number(hf) - Number(hi) : null;
  const litrosContador = ci !== '' && cf !== '' ? Number(cf) - Number(ci) : null;
  const montoCalc = litros !== '' && tasa !== '' ? Number(litros) * Number(tasa) : null;

  async function guardar() {
    setError(null);
    if (litros === '' || Number(litros) === 0) { setError('Indicá los litros (distinto de 0).'); return; }
    setSaving(true);
    try {
      await actualizarMovimientoTanque(mov.id, {
        fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
        tipo, litros: Number(litros), tasaUsdLitro: tasa === '' ? 0 : Number(tasa),
        horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
        contadorGlobalIni: ci === '' ? null : Number(ci), contadorGlobalFin: cf === '' ? null : Number(cf),
      });
      toast('Movimiento actualizado', 'success');
      onSaved();
    } catch (err) { setError((err as { message?: string })?.message || 'No se pudo guardar.'); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
      {canWrite && <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>}
    </>
  );

  const Fila = ({ k, v, hi: hl }: { k: string; v: ReactNode; hi?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.35rem 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}>
      <span className="muted" style={{ fontSize: '.82rem' }}>{k}</span>
      <span className="mono" style={hl ? { fontWeight: 700, color: 'var(--warning)' } : undefined}>{v}</span>
    </div>
  );

  return (
    <Modal title="Detalle del movimiento" size="md" onClose={onClose} footer={footer}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      <Fila k="Tanque" v={tanque?.nombre ?? '—'} />
      <Fila k="Saldo del tanque (L · $)" v={`${num(mov.saldo_litros)} L · ${money(mov.saldo_usd)}`} />

      {/* Datos editables (TODO). Al cambiar tipo/litros/tasa se recalcula el saldo del tanque. */}
      <div className="card-title" style={{ marginTop: '1rem' }}>✎ Datos editables</div>
      <div className="form-grid">
        <div className="form-row">
          <label>Tipo de movimiento</label>
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovTanque)} disabled={!canWrite}>
            <option value="entrada">{TIPO_MOV_LABEL.entrada}</option>
            <option value="uso">{TIPO_MOV_LABEL.uso}</option>
            <option value="traslado">{TIPO_MOV_LABEL.traslado}</option>
            <option value="retorno">{TIPO_MOV_LABEL.retorno}</option>
            <option value="merma">{TIPO_MOV_LABEL.merma}</option>
          </select>
        </div>
        <div className="form-row"><label>Litros</label><input className="input mono" type="number" step="any" name="det-litros" defaultValue={litros} onChange={(e) => setLitros(e.target.value)} disabled={!canWrite} /></div>
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Tasa $/L</label><input className="input mono" type="number" step="0.0001" name="det-tasa" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} disabled={!canWrite} /></div>
        <div className="form-row">
          <label>Monto $ (= litros × tasa)</label>
          <input className="input mono" value={montoCalc == null ? '' : money(montoCalc)} readOnly placeholder="se calcula automáticamente"
            style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
        </div>
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!canWrite} /></div>
        <div className="form-row"><label>Hora</label><input className="input" name="det-hora" defaultValue={hora} onChange={(e) => setHora(e.target.value)} disabled={!canWrite} placeholder="8:02:00 AM" /></div>
      </div>
      <div className="form-grid">
        <div className="form-row">
          <label>Equipo</label>
          <SearchSelect value={equipo} onChange={setEquipo} placeholder="🔍 Buscar equipo…" disabled={!canWrite}
            options={[{ value: '', label: '— sin equipo —' }, ...opts('equipo').map((c) => ({ value: c.valor, label: c.valor }))]} />
        </div>
        <div className="form-row">
          <label>Autorizado por</label>
          <SearchSelect value={autorizado} onChange={setAutorizado} placeholder="🔍 Buscar autorizado…" disabled={!canWrite}
            options={[{ value: '', label: '— sin autorizado —' }, ...opts('autorizado').map((c) => ({ value: c.valor, label: c.valor }))]} />
        </div>
      </div>
      <div className="form-row">
        <label>Destino</label>
        <SearchSelect value={ubicacion} onChange={setUbicacion} placeholder="🔍 Buscar destino…" disabled={!canWrite}
          options={[{ value: '', label: '— sin destino —' }, ...opts('ubicacion').map((c) => ({ value: c.valor, label: c.valor }))]} />
      </div>
      <div className="form-row"><label>Observación</label><input className="input" name="det-observacion" defaultValue={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={!canWrite} /></div>

      <div className="card-title" style={{ marginTop: '1rem' }}>🕒 Medidores</div>
      <div className="form-grid">
        <div className="form-row"><label>Horómetro inicial (HI)</label><input className="input mono" type="number" step="any" name="det-hi" defaultValue={hi} onChange={(e) => setHi(e.target.value)} disabled={!canWrite} /></div>
        <div className="form-row"><label>Horómetro final (HF)</label><input className="input mono" type="number" step="any" name="det-hf" defaultValue={hf} onChange={(e) => setHf(e.target.value)} disabled={!canWrite} /></div>
      </div>
      <div className="form-row">
        <label>Horas utilizadas (HRS = HF − HI)</label>
        <input className="input mono" value={hrs == null ? '' : num(hrs)} readOnly placeholder="se calcula automáticamente"
          style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Contador global inicial</label><input className="input mono" type="number" step="any" name="det-ci" defaultValue={ci} onChange={(e) => setCi(e.target.value)} disabled={!canWrite} /></div>
        <div className="form-row"><label>Contador global final</label><input className="input mono" type="number" step="any" name="det-cf" defaultValue={cf} onChange={(e) => setCf(e.target.value)} disabled={!canWrite} /></div>
      </div>
      <div className="form-row">
        <label>Litros usados (según contador = final − inicial)</label>
        <input className="input mono" value={litrosContador == null ? '' : num(litrosContador)} readOnly placeholder="se calcula automáticamente"
          style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
      </div>
    </Modal>
  );
}

/* ───────────── Modal: nuevo tanque ───────────── */

function TanqueModal({ catalogos, actor, tanque, onClose, onSaved, onRequestDelete }: {
  catalogos: CatalogoCombustible[]; actor: string; tanque: TanqueCombustible | null; onClose: () => void; onSaved: () => void;
  onRequestDelete?: (t: TanqueCombustible) => void;
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
  const [tasa, setTasa] = useState(tanque?.tasa_usd_litro != null ? String(tanque.tasa_usd_litro) : '');
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
        await actualizarTanque(tanque.id, { ...datosGeom(), tasaUsdLitro: tasa === '' ? undefined : Number(tasa) });
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
      {editando && tanque && onRequestDelete && (
        <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}
          onClick={() => onRequestDelete(tanque)}>🗑 Eliminar tanque</button>
      )}
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-new" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear tanque'}</button>
    </>
  );
  return (
    <Modal title={editando ? `Editar ${tanque?.nombre}` : 'Nuevo tanque'} size="md" onClose={onClose} footer={footer}>
      <form id="tnk-new" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-row"><label>Nombre</label><input className="input" name="tnk-nombre" defaultValue={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tanque #4" /></div>
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
            <div className="form-row"><label>Radio R (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-radio" defaultValue={radio} onChange={(e) => setRadio(e.target.value)} placeholder="1.1875" /></div>
            <div className="form-row"><label>Largo L (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-largo-cil" defaultValue={largo} onChange={(e) => setLargo(e.target.value)} placeholder="8.17" /></div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="form-row"><label>Largo (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-largo-rect" defaultValue={largo} onChange={(e) => setLargo(e.target.value)} placeholder="1.99" /></div>
            <div className="form-row"><label>Ancho (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-ancho" defaultValue={ancho} onChange={(e) => setAncho(e.target.value)} placeholder="0.99" /></div>
            <div className="form-row"><label>Alto / altura total (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-alto" defaultValue={alto} onChange={(e) => setAlto(e.target.value)} placeholder="0.99" /></div>
          </div>
        )}

        <div className="form-grid">
          <div className="form-row">
            <label>Capacidad rotulada (L)</label>
            <input className="input mono" type="number" min={0} step="any" name="tnk-capacidad" defaultValue={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="35000" />
            <small className="muted">Tope operativo (el del rótulo físico).</small>
          </div>
          <div className="form-row">
            <label>Capacidad calculada (L)</label>
            <input className="input mono" value={capCalc > 0 ? num(capCalc) : '—'} readOnly title="Calculada por fórmula con las dimensiones" />
            <small className="muted">Por fórmula, a la altura total.</small>
          </div>
        </div>

        {!editando ? (
          <div className="form-grid">
            <div className="form-row"><label>Saldo inicial (L)</label><input className="input mono" type="number" min={0} step="any" name="tnk-saldo" defaultValue={saldo} onChange={(e) => setSaldo(e.target.value)} /></div>
            <div className="form-row"><label>Tasa inicial (USD/L)</label><input className="input mono" type="number" min={0} step="0.0001" name="tnk-tasa-new" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} /></div>
          </div>
        ) : (
          <div className="form-row">
            <label>Tasa (USD/L)</label>
            <input className="input mono" type="number" min={0} step="0.0001" name="tnk-tasa-edit" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} />
            <small className="muted">Modifica la tasa promedio del tanque; recalcula el saldo en $ (saldo L × tasa).</small>
          </div>
        )}
        <div className="form-row">
          <label>Ubicación</label>
          <input className="input" list="cat-ubic-new" name="tnk-ubicacion" defaultValue={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Mina Golden touch" />
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
  // Con el input no-controlado, al limpiar por estado hay que remontarlo para vaciar el DOM.
  const [valorKey, setValorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const items = useMemo(() => catalogos.filter((c) => c.tipo === tab), [catalogos, tab]);
  const TABS: { key: TipoCatalogoCombustible; label: string }[] = [
    { key: 'equipo', label: 'Equipos' }, { key: 'autorizado', label: 'Autorizados' }, { key: 'ubicacion', label: 'Ubicaciones' },
  ];

  async function agregar() {
    if (!valor.trim()) { toast('Indicá el valor', 'error'); return; }
    setBusy(true);
    try { await addCatalogo(tab, valor); setValor(''); setValorKey((k) => k + 1); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function guardarEdicion(id: string) {
    try { await updateCatalogo(id, editValor); setEditId(null); await onChanged(); toast('Actualizado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo editar', 'error'); }
  }
  async function toggle(id: string, activo: boolean) {
    try { await setCatalogoActivo(id, !activo); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar este elemento del catálogo?')) return;
    try { await eliminarCatalogo(id); await onChanged(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <Modal title="Catálogos de combustible" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        {TABS.map((t) => <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
        <input key={valorKey} className="input" name="cat-valor" defaultValue={valor} onChange={(e) => setValor(e.target.value)} placeholder={`Nuevo ${tab}…`} onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} />
        <button className="btn btn-primary" onClick={agregar} disabled={busy}>+ Agregar</button>
      </div>
      <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>Valor</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {!items.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin elementos.</td></tr>}
            {items.map((c) => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                <td>
                  {editId === c.id ? (
                    <input className="input" value={editValor} autoFocus onChange={(e) => setEditValor(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(c.id); if (e.key === 'Escape') setEditId(null); }} />
                  ) : c.valor}
                </td>
                <td>{c.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {editId === c.id ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(c.id)}>Guardar</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => { setEditId(c.id); setEditValor(c.valor); }}>✎</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(c.id, c.activo)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                      <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => void borrar(c.id)}>🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: conciliación ───────────── */

function ConciliacionModal({ tanques, actor, defaultEmail, onClose }: { tanques: TanqueCombustible[]; actor: string; defaultEmail: string; onClose: () => void }) {
  // Semana actual (lunes a domingo) por defecto.
  const semanaActual = () => {
    const d = new Date(); const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const f = (x: Date) => x.toISOString().slice(0, 10);
    return { desde: f(mon), hasta: f(sun) };
  };
  const [{ desde, hasta }, setRango] = useState(semanaActual);
  const [resumenes, setResumenes] = useState<ResumenTanquePeriodo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [libreta, setLibreta] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');
  // Con notas no-controlado, al limpiar tras guardar hay que remontar el input para vaciar el DOM.
  const [notasKey, setNotasKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<ConciliacionCombustible[]>([]);
  // Filtros del historial de conciliaciones (estilo Tesorería).
  const [hTexto, setHTexto] = useState('');
  const [hTanque, setHTanque] = useState('');
  const [hDesde, setHDesde] = useState('');
  const [hHasta, setHHasta] = useState('');
  const [correoOpen, setCorreoOpen] = useState(false);

  const nombreTanque = (id: string) => tanques.find((t) => t.id === id)?.nombre ?? '—';
  const cargarHistorial = useCallback(() => { listConciliaciones().then(setHistorial).catch(() => {}); }, []);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // Recalcular al cambiar la semana (el saldo según la mina se carga a mano).
  useEffect(() => {
    if (!desde || !hasta || desde > hasta) { setResumenes([]); return; }
    let cancel = false;
    setCargando(true);
    resumenTanquesPeriodo(desde, hasta)
      .then((r) => { if (!cancel) setResumenes(r); })
      .catch(() => { if (!cancel) setResumenes([]); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  function moverSemana(dir: number) {
    const f = (x: Date) => x.toISOString().slice(0, 10);
    const d = new Date(desde + 'T00:00:00'); d.setDate(d.getDate() + dir * 7);
    const h = new Date(hasta + 'T00:00:00'); h.setDate(h.getDate() + dir * 7);
    setRango({ desde: f(d), hasta: f(h) });
  }

  const difLibreta = (r: ResumenTanquePeriodo) => {
    const c = libreta[r.tanqueId];
    return c === '' || c == null ? null : r.saldoLibros - (Number(c) || 0);
  };

  // Totales por columna (sin la diferencia) + los dos saldos generales de la semana.
  const tot = useMemo(() => {
    const s = (f: (r: ResumenTanquePeriodo) => number) => resumenes.reduce((a, r) => a + f(r), 0);
    return {
      saldoInicial: s((r) => r.saldoInicial), entradas: s((r) => r.entradas), usos: s((r) => r.usos),
      traslados: s((r) => r.traslados), retornos: s((r) => r.retornos), mermas: s((r) => r.mermas),
      saldoLibros: s((r) => r.saldoLibros),
      libreta: resumenes.reduce((a, r) => a + (Number(libreta[r.tanqueId]) || 0), 0),
    };
  }, [resumenes, libreta]);

  // Historial enriquecido con el nombre del tanque + aplicando filtros.
  const historialFiltrado = useMemo<ConciliacionRow[]>(() => {
    const q = hTexto.trim().toLowerCase();
    return historial
      .map((c) => ({ ...c, tanqueNombre: nombreTanque(c.tanque_id) }))
      .filter((c) => {
        if (hTanque && c.tanque_id !== hTanque) return false;
        if (hDesde && (c.fecha ?? '') < hDesde) return false;
        if (hHasta && (c.fecha ?? '') > hHasta) return false;
        if (q) {
          const hay = [c.periodo, c.tanqueNombre, c.fecha, c.notas, num(c.saldo_libros), num(c.saldo_reportado_mina), num(c.diferencia)]
            .map((x) => (x ?? '').toString().toLowerCase()).join(' ');
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial, hTexto, hTanque, hDesde, hHasta, tanques]);

  const totHist = useMemo(() => ({
    libros: historialFiltrado.reduce((a, c) => a + (Number(c.saldo_libros) || 0), 0),
    libreta: historialFiltrado.reduce((a, c) => a + (Number(c.saldo_reportado_mina) || 0), 0),
  }), [historialFiltrado]);

  const hayFiltroHist = !!(hTexto || hTanque || hDesde || hHasta);
  function limpiarHist() { setHTexto(''); setHTanque(''); setHDesde(''); setHHasta(''); }

  async function guardar() {
    if (!resumenes.length) { toast('Semana sin datos', 'error'); return; }
    setBusy(true);
    try {
      const periodo = `${desde} a ${hasta}`;
      for (const r of resumenes) {
        const lib = libreta[r.tanqueId];
        await crearConciliacion({
          tanqueId: r.tanqueId, periodo, saldoLibros: r.saldoLibros,
          saldoReportadoMina: lib === '' || lib == null ? 0 : Number(lib) || 0,
          saldoCubicacion: null,
          notas: notas || null, actor,
        });
      }
      toast('Conciliación semanal registrada', 'success');
      cargarHistorial(); setNotas(''); setNotasKey((k) => k + 1);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Conciliación semanal · Tanques" size="xl" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '.6rem' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => moverSemana(-1)}>← Semana ant.</button>
          <label className="muted" style={{ fontSize: '.8rem' }}>Desde <input className="input" type="date" value={desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} style={{ width: 'auto' }} /></label>
          <label className="muted" style={{ fontSize: '.8rem' }}>Hasta <input className="input" type="date" value={hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} style={{ width: 'auto' }} /></label>
          <button className="btn btn-sm btn-ghost" onClick={() => moverSemana(1)}>Semana sig. →</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setRango(semanaActual())}>Semana actual</button>
        </div>

        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr>
              <th>Tanque</th><th>Saldo inicial</th><th>Entradas</th><th>Usos</th><th>Traslados</th><th>Retornos</th><th>Mermas</th><th>Saldo libros</th><th>Saldo según la mina (Libreta)</th><th>Dif.</th>
            </tr></thead>
            <tbody>
              {cargando && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center' }}>Calculando…</td></tr>}
              {!cargando && !resumenes.length && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center' }}>Sin tanques.</td></tr>}
              {!cargando && resumenes.map((r) => {
                const d = difLibreta(r);
                return (
                  <tr key={r.tanqueId}>
                    <td><strong>{r.tanqueNombre}</strong> <span className="muted" style={{ fontSize: '.72rem' }}>· {r.movimientos} mov.</span></td>
                    <td className="mono">{num(r.saldoInicial)}</td>
                    <td className="mono" style={{ color: 'var(--primary-3)' }}>{num(r.entradas)}</td>
                    <td className="mono" style={{ color: 'var(--danger)' }}>{num(r.usos)}</td>
                    <td className="mono" style={{ color: 'var(--warning)' }}>{num(r.traslados)}</td>
                    <td className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{num(r.retornos)}</td>
                    <td className="mono" style={{ color: 'var(--danger)' }}>{num(r.mermas)}</td>
                    <td className="mono"><strong>{num(r.saldoLibros)}</strong></td>
                    <td><input className="input mono" type="number" step="any" name={`conc-libreta-${r.tanqueId}`} defaultValue={libreta[r.tanqueId] ?? ''} onChange={(e) => setLibreta((c) => ({ ...c, [r.tanqueId]: e.target.value }))} placeholder="libreta" style={{ width: 110 }} /></td>
                    <td className="mono" style={{ color: d != null && Math.abs(d) > 0.01 ? 'var(--warning)' : 'inherit' }}>{d == null ? '—' : num(d)}</td>
                  </tr>
                );
              })}
            </tbody>
            {!cargando && resumenes.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td>TOTALES</td>
                  <td className="mono">{num(tot.saldoInicial)}</td>
                  <td className="mono" style={{ color: 'var(--primary-3)' }}>{num(tot.entradas)}</td>
                  <td className="mono" style={{ color: 'var(--danger)' }}>{num(tot.usos)}</td>
                  <td className="mono" style={{ color: 'var(--warning)' }}>{num(tot.traslados)}</td>
                  <td className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{num(tot.retornos)}</td>
                  <td className="mono" style={{ color: 'var(--danger)' }}>{num(tot.mermas)}</td>
                  <td className="mono">{num(tot.saldoLibros)}</td>
                  <td className="mono">{num(tot.libreta)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Resultado general de la semana (no editable) — como en el Excel de la mina */}
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '.9rem 0' }}>
          <div className="card" style={{ flex: 1, minWidth: 220, textAlign: 'center', background: 'rgba(244,179,179,.10)', borderColor: 'rgba(244,179,179,.4)' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.02em' }}>SALDOS DE CONSUMO DIÉSEL · NUESTROS LIBROS</div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '.2rem' }}>{num(tot.saldoLibros)} L</div>
            <div className="muted" style={{ fontSize: '.7rem' }}>resultado de la semana · no editable</div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 220, textAlign: 'center', background: 'rgba(110,160,230,.12)', borderColor: 'rgba(110,160,230,.45)' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.02em' }}>SALDOS REPORTADOS POR LA MINA (LIBRETA)</div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '.2rem' }}>{num(tot.libreta)} L</div>
            <div className="muted" style={{ fontSize: '.7rem' }}>según libreta · no editable</div>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '.6rem' }}><label>Notas de la semana</label><input key={notasKey} className="input" name="conc-notas" defaultValue={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy || !resumenes.length}>Guardar conciliación de la semana</button>
        <p className="muted" style={{ fontSize: '.76rem' }}>El saldo en libros se calcula con todos los movimientos de cada tanque en la semana (saldo inicial + entradas + retornos − usos − traslados − mermas). La diferencia contra el <strong>saldo según la mina (libreta)</strong> es el faltante/merma a vigilar.</p>
      </div>

      {/* Historial de conciliaciones: filtros + reportes (estilo Tesorería) */}
      {!!historial.length && (
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
          <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            Conciliaciones registradas
            <button className="btn btn-sm btn-ghost" disabled={!historialFiltrado.length} title="Descargar PDF (con el filtro aplicado)"
              onClick={() => void descargarConciliacionesPdf(historialFiltrado, { filtro: hayFiltroHist ? 'filtrado' : undefined }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
            <button className="btn btn-sm btn-ghost" disabled={!historialFiltrado.length} title="Descargar Excel (con el filtro aplicado)"
              onClick={() => void descargarConciliacionesExcel(historialFiltrado).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
            <button className="btn btn-sm btn-ghost" disabled={!historialFiltrado.length} title="Enviar por correo (con el filtro aplicado)"
              onClick={() => setCorreoOpen(true)}>✉ Correo</button>
          </span>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input className="input" type="search" value={hTexto} onChange={(e) => setHTexto(e.target.value)}
                placeholder="🔍 Buscar (semana, tanque, notas…)" style={{ width: 240, paddingRight: hTexto ? '1.6rem' : undefined }} />
              {hTexto && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHTexto('')} title="Limpiar búsqueda"
                  style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
              )}
            </div>
            <SearchSelect value={hTanque} onChange={setHTanque} placeholder="🔍 Tanque…" style={{ width: 180 }}
              options={[{ value: '', label: 'Todo tanque' }, ...tanques.map((t) => ({ value: t.id, label: t.nombre }))]} />
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Desde <input className="input" type="date" value={hDesde} onChange={(e) => setHDesde(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Hasta <input className="input" type="date" value={hHasta} onChange={(e) => setHHasta(e.target.value)} style={{ width: 'auto' }} />
            </label>
            {hayFiltroHist && <button className="btn btn-sm btn-ghost" onClick={limpiarHist}>✕ Limpiar</button>}
            <span className="muted" style={{ fontSize: '.8rem' }}>{historialFiltrado.length}/{historial.length}</span>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Semana</th><th>Tanque</th><th>Registrada</th><th>Libros</th><th>Libreta (mina)</th><th>Dif.</th><th>Notas</th></tr></thead>
          <tbody>
            {!historial.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin conciliaciones.</td></tr>}
            {!!historial.length && !historialFiltrado.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Ninguna conciliación coincide con el filtro.</td></tr>}
            {historialFiltrado.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.periodo || '—'}</td>
                <td>{c.tanqueNombre}</td>
                <td className="mono">{c.fecha}</td>
                <td className="mono">{num(c.saldo_libros)}</td>
                <td className="mono">{num(c.saldo_reportado_mina)}</td>
                <td className="mono" style={{ color: Math.abs(Number(c.diferencia) || 0) > 0.01 ? 'var(--warning)' : 'inherit' }}>{num(c.diferencia)}</td>
                <td className="muted">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
          {historialFiltrado.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td colSpan={3}>TOTALES</td>
                <td className="mono">{num(totHist.libros)}</td>
                <td className="mono">{num(totHist.libreta)}</td>
                <td></td><td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar conciliaciones"
          descripcion={`Se enviará el PDF de las conciliaciones (${historialFiltrado.length} registro(s)${hayFiltroHist ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={defaultEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarConciliacionesPorCorreo(historialFiltrado, emails, { filtro: hayFiltroHist ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
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
  // Inputs no-controlados: al limpiar por estado tras guardar hay que remontarlos para vaciar el DOM.
  const [formKey, setFormKey] = useState(0);
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
      setAltura(''); setNotas(''); setFormKey((k) => k + 1);
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
          <div className="form-row"><label>Altura medida (cm)</label><input key={`alt-${formKey}`} className="input mono" type="number" min={0} step="any" name="cub-altura" defaultValue={altura} onChange={(e) => setAltura(e.target.value)} placeholder="87" autoFocus /></div>
          <div className="form-row"><label>Litros (cubicación)</label><input className="input mono" value={num(litros)} readOnly style={{ color: 'var(--primary-3)', fontWeight: 700 }} /></div>
          <div className="form-row"><label>Saldo por libros (L)</label><input className="input mono" value={num(libros)} readOnly /></div>
          <div className="form-row"><label>Diferencia (L)</label><input className="input mono" value={num(dif)} readOnly style={{ color: Math.abs(dif) > 0 ? 'var(--warning)' : 'var(--primary-3)' }} /></div>
        </div>
        <div className="form-row"><label>Notas</label><input key={`notas-${formKey}`} className="input" name="cub-notas" defaultValue={notas} onChange={(e) => setNotas(e.target.value)} placeholder="medición río Aro…" /></div>
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
