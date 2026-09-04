import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import type { ContratoAcopio, EstadoContratoAcopio } from '@/shared/lib/types';
import { listContratos, eliminarContrato, cerrarContrato, reabrirContrato, setContratoHistorico, type TipoContrato } from './contratos.repository';
import { ContratosModal, pct } from './ContratosModal';
import { descargarContratosPdf } from './contratoPdf';
import { descargarContratoDetallePdf } from './contratoDetallePdf';
import { descargarContratosExcel } from './contratoExcel';
import { enviarContratosPorCorreo } from './enviarContrato';
import { norm } from '@/shared/lib/texto';

export interface ContratosViewHandle { openCreate: () => void }

export const ContratosView = forwardRef<ContratosViewHandle, {
  canWrite: boolean; actor: string; actorName: string | null; defaultEmail: string;
  // Cuando llega un id (p. ej. al hacer click en un contrato desde Acopio) se abre su detalle.
  openContratoId?: string | null; onOpenConsumed?: () => void;
}>(function ContratosView({ canWrite, actor, actorName, defaultEmail, openContratoId, onOpenConsumed }, ref) {
  const [contratos, setContratos] = useState<ContratoAcopio[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ kind: 'none' } | { kind: 'crear' } | { kind: 'editar'; c: ContratoAcopio }>({ kind: 'none' });
  const [correoOpen, setCorreoOpen] = useState(false);
  const [reportesOpen, setReportesOpen] = useState(false);
  const [historicosOpen, setHistoricosOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<{ titulo: string; mensaje: string; confirmText: string; danger?: boolean; run: () => Promise<void> } | null>(null);
  // Filtros (estilo Tesorería).
  const [fTexto, setFTexto] = useState('');
  const [fSupervisor, setFSupervisor] = useState('');
  const [fLugar, setFLugar] = useState('');
  const [fEstado, setFEstado] = useState<'todos' | EstadoContratoAcopio>('todos');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');

  const recargar = useCallback(async () => { setContratos(await listContratos()); }, []);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    recargar().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar contratos', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [recargar]);
  useRealtime(['acopio_contratos'], () => { void recargar(); });

  // El botón "Crear contrato" vive en el header de la página; lo disparamos por ref.
  useImperativeHandle(ref, () => ({ openCreate: () => setModal({ kind: 'crear' }) }), []);

  // Llegada desde Acopio (?contrato=<id>): cuando ya cargaron los contratos, abrir su detalle.
  useEffect(() => {
    if (!openContratoId || !contratos.length) return;
    const c = contratos.find((x) => x.id === openContratoId);
    if (c) {
      setModal({ kind: 'editar', c });
      onOpenConsumed?.();
    }
  }, [openContratoId, contratos, onOpenConsumed]);

  // Vigentes (lista y métricas) vs Históricos (archivados, fuera de las métricas).
  const vigentes = useMemo(() => contratos.filter((c) => !c.historico), [contratos]);
  const historicos = useMemo(() => contratos.filter((c) => c.historico), [contratos]);

  // Opciones para los selectores de filtro.
  const opcs = useMemo(() => {
    const uniq = (sel: (c: ContratoAcopio) => string | null | undefined) =>
      Array.from(new Set(vigentes.map((c) => (sel(c) ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
    return { supervisores: uniq((c) => c.supervisor), lugares: uniq((c) => c.lugar_extraccion) };
  }, [vigentes]);

  const filtrados = useMemo(() => {
    const q = norm(fTexto);
    return vigentes.filter((c) => {
      if (fEstado !== 'todos' && c.estado !== fEstado) return false;
      if (fSupervisor && (c.supervisor ?? '') !== fSupervisor) return false;
      if (fLugar && (c.lugar_extraccion ?? '') !== fLugar) return false;
      if (fDesde && (c.fecha ?? '') < fDesde) return false;
      if (fHasta && (c.fecha ?? '') > fHasta) return false;
      if (q) {
        const hay = [c.numero, c.supervisor, c.lugar_extraccion, c.molino, c.observaciones, c.fecha]
          .map((x) => norm(String(x ?? ''))).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vigentes, fTexto, fSupervisor, fLugar, fEstado, fDesde, fHasta]);

  const hayFiltro = !!(fTexto || fSupervisor || fLugar || fEstado !== 'todos' || fDesde || fHasta);
  function limpiar() { setFTexto(''); setFSupervisor(''); setFLugar(''); setFEstado('todos'); setFDesde(''); setFHasta(''); }

  // Resumen para las tarjetas (sobre los contratos VIGENTES, sin los archivados).
  const resumen = useMemo(() => vigentes.reduce((a, c) => {
    const kg = Number(c.kg_seco_limpio) || 0;
    a.total += 1; a.kg += kg;
    if (c.estado === 'activo') { a.activos += 1; a.kgActivos += kg; }
    return a;
  }, { activos: 0, total: 0, kg: 0, kgActivos: 0 }), [vigentes]);

  async function archivar(c: ContratoAcopio, historico: boolean) {
    try {
      await setContratoHistorico(c.id, historico);
      toast(historico ? `Contrato ${c.numero} enviado a Históricos` : `Contrato ${c.numero} restaurado`, 'success');
      await recargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo archivar', 'error'); }
  }

  function borrar(c: ContratoAcopio) {
    const aviso = c.estado === 'cerrado' && Number(c.mov_cantidad) > 0
      ? ` Se revertirán ${num(c.mov_cantidad)} Kg de Casiterita del inventario.` : '';
    setConfirmar({
      titulo: 'Eliminar contrato', confirmText: 'Eliminar', danger: true,
      mensaje: `¿Eliminar el contrato ${c.numero}?${aviso}`,
      run: async () => {
        try { await eliminarContrato(c.id, actor, actorName); toast('Contrato eliminado', 'success'); await recargar(); }
        catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
      },
    });
  }
  function cambiarEstado(c: ContratoAcopio) {
    const kg = Number(c.kg_seco_limpio) || 0;
    if (c.estado === 'activo') {
      setConfirmar({
        titulo: 'Cerrar contrato', confirmText: 'Cerrar contrato',
        mensaje: `¿Cerrar el contrato ${c.numero}? Entrarán ${num(kg)} Kg de Casiterita al inventario (almacén PRODUCCION).`,
        run: async () => {
          try { await cerrarContrato(c.id, actor, actorName); toast(`Contrato cerrado · +${num(kg)} Kg de Casiterita`, 'success'); await recargar(); }
          catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cerrar', 'error'); }
        },
      });
    } else {
      const rev = Number(c.mov_cantidad) || 0;
      setConfirmar({
        titulo: 'Reabrir contrato', confirmText: 'Reabrir', danger: true,
        mensaje: `¿Reabrir el contrato ${c.numero}?${rev > 0 ? ` Se revertirán ${num(rev)} Kg de Casiterita del inventario.` : ''}`,
        run: async () => {
          try { await reabrirContrato(c.id, actor, actorName); toast('Contrato reabierto', 'success'); await recargar(); }
          catch (e) { toast(e instanceof Error ? e.message : 'No se pudo reabrir', 'error'); }
        },
      });
    }
  }

  return (
    <div>
      {/* Tarjetas de resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', margin: '0 0 1.25rem' }}>
        <div className="card" style={{ borderColor: 'var(--primary)', background: 'linear-gradient(135deg, var(--surface-2), var(--surface))' }}>
          <div className="card-title"><span>📜 Contratos de producción activos</span></div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-3)' }} className="mono">{num(resumen.activos)}</div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>de {num(resumen.total)} contrato(s) en total</div>
        </div>
        <div className="card">
          <div className="card-title"><span>⛏ KG de Casiterita obtenidos</span></div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }} className="mono">{num(resumen.kg)} <span style={{ fontSize: '.9rem', fontWeight: 500 }}>Kg</span></div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>{num(resumen.kgActivos)} Kg de contratos activos</div>
        </div>
      </div>

      {/* Toolbar: crear + reportes + filtros (estilo Tesorería) */}
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
        <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-primary" disabled={!contratos.length} title="Reportes: por contrato (buscable) o resumen general — con vista previa"
            onClick={() => setReportesOpen(true)}>📄 Reportes</button>
          <button className="btn btn-sm btn-ghost" disabled={!historicos.length} title="Contratos archivados en Históricos (no cuentan en las métricas)"
            onClick={() => setHistoricosOpen(true)}>📚 Históricos{historicos.length ? ` (${historicos.length})` : ''}</button>
          <button className="btn btn-sm btn-ghost" disabled={!filtrados.length} title="Descargar PDF (con el filtro aplicado)"
            onClick={() => void descargarContratosPdf(filtrados, { filtro: hayFiltro ? 'filtrado' : undefined }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
          <button className="btn btn-sm btn-ghost" disabled={!filtrados.length} title="Descargar Excel (con el filtro aplicado)"
            onClick={() => void descargarContratosExcel(filtrados).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
          <button className="btn btn-sm btn-ghost" disabled={!filtrados.length} title="Enviar por correo (con el filtro aplicado)"
            onClick={() => setCorreoOpen(true)}>✉ Correo</button>
        </span>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input className="input" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
              placeholder="🔍 Buscar (n°, supervisor, lugar…)" style={{ width: 240, paddingRight: fTexto ? '1.6rem' : undefined }} />
            {fTexto && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFTexto('')} title="Limpiar"
              style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>}
          </div>
          <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value as typeof fEstado)} style={{ width: 'auto' }}>
            <option value="todos">Todo estado</option>
            <option value="activo">● Activos</option>
            <option value="cerrado">✔ Cerrados</option>
          </select>
          <SearchSelect value={fSupervisor} onChange={setFSupervisor} placeholder="🔍 Supervisor…" style={{ width: 170 }}
            options={[{ value: '', label: 'Todo supervisor' }, ...opcs.supervisores.map((v) => ({ value: v, label: v }))]} />
          <SearchSelect value={fLugar} onChange={setFLugar} placeholder="🔍 Lugar…" style={{ width: 170 }}
            options={[{ value: '', label: 'Todo lugar' }, ...opcs.lugares.map((v) => ({ value: v, label: v }))]} />
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
            Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
            Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
          </label>
          {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={limpiar}>✕ Limpiar</button>}
          <span className="muted" style={{ fontSize: '.8rem' }}>{filtrados.length}/{contratos.length}</span>
        </div>
      </div>

      {/* Lista */}
      {loading ? <EmptyState message="Cargando contratos…" icon="◔" />
        : !contratos.length ? <EmptyState message="Sin contratos. Creá el primero con «Crear contrato»." icon="📜" />
        : (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.78rem' }}>
              <thead>
                <tr>
                  <th>N° Contrato</th><th>Fecha</th><th>Supervisor</th><th>Lugar</th><th>Molino</th>
                  <th style={{ textAlign: 'right' }}>Ton</th><th style={{ textAlign: 'right' }}>Tolva</th>
                  <th style={{ textAlign: 'right' }}>Kg húm.</th><th style={{ textAlign: 'right' }}>Kg secos</th>
                  <th style={{ textAlign: 'right' }}>Kg s/limpio</th><th style={{ textAlign: 'right' }}>% Rec. Cas.</th>
                  <th style={{ textAlign: 'right' }}>Kg Fe</th><th style={{ textAlign: 'right' }}>% Fe</th>
                  <th>Estado</th>{canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {!filtrados.length && <tr><td colSpan={canWrite ? 15 : 14} className="muted" style={{ textAlign: 'center' }}>Ningún contrato coincide con el filtro.</td></tr>}
                {filtrados.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer', opacity: c.estado === 'cerrado' ? 0.6 : 1 }} onClick={() => setModal({ kind: 'editar', c })}>
                    <td className="mono"><strong>{c.numero}</strong></td>
                    <td>{date(c.fecha)}</td>
                    <td>{c.supervisor || '—'}</td>
                    <td>{c.lugar_extraccion || '—'}</td>
                    <td className="muted">{c.molino || '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(c.ton_procesadas)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(c.tolva)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(c.kg_humedo)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(c.kg_secos)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--primary-3)', fontWeight: 700 }}>{num(c.kg_seco_limpio)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{pct(c.pct_recuperacion_casiterita)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(c.kg_hierro)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{pct(c.pct_hierro)}</td>
                    <td>{c.estado === 'activo' ? <span className="badge success">● Activo</span> : <span className="badge">✔ Cerrado</span>}</td>
                    {canWrite && (
                      <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setModal({ kind: 'editar', c })}>✎</button>
                        <button className="btn btn-sm btn-ghost" title={c.estado === 'activo' ? 'Cerrar' : 'Reabrir'} onClick={() => void cambiarEstado(c)}>{c.estado === 'activo' ? '🔒' : '↻'}</button>
                        <button className="btn btn-sm btn-ghost" title="Enviar a Históricos (no cuenta en los KG de Casiterita)" onClick={() => void archivar(c, true)}>📚</button>
                        <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => void borrar(c)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modal.kind !== 'none' && (
        <ContratosModal
          contrato={modal.kind === 'editar' ? modal.c : null}
          canWrite={canWrite} actor={actor} actorName={actorName}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={async () => { setModal({ kind: 'none' }); await recargar(); }}
        />
      )}
      {reportesOpen && (
        <ReportesContratosModal contratos={vigentes} onClose={() => setReportesOpen(false)} />
      )}
      {historicosOpen && (
        <HistoricosContratosModal
          historicos={historicos} canWrite={canWrite}
          onVer={(c) => { setHistoricosOpen(false); setModal({ kind: 'editar', c }); }}
          onRestaurar={(c) => void archivar(c, false)}
          onClose={() => setHistoricosOpen(false)} />
      )}
      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar contratos de producción"
          descripcion={`Se enviará el PDF de contratos (${filtrados.length} registro(s)${hayFiltro ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={defaultEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarContratosPorCorreo(filtrados, emails, { filtro: hayFiltro ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
      {confirmar && (
        <ConfirmDialog
          title={confirmar.titulo}
          message={confirmar.mensaje}
          confirmText={confirmar.confirmText}
          danger={confirmar.danger}
          onCancel={() => setConfirmar(null)}
          onConfirm={() => { const c = confirmar; setConfirmar(null); void c.run(); }}
        />
      )}
    </div>
  );
});

/* ───────────── Modal: Reportes de contratos (switch) ─────────────
   Dos modos con vista previa imprimible:
   · Por contrato: se elige el tipo (producción/minero) y un contrato de una lista
     buscable por número; al verlo se abre la vista previa del contrato (todos los
     detalles, con las personas en el minero) para descargar.
   · General (resumen): tabla-resumen de TODOS los contratos (opcional por tipo). */
function ReportesContratosModal({ contratos, onClose }: { contratos: ContratoAcopio[]; onClose: () => void }) {
  const [modo, setModo] = useState<'contrato' | 'general'>('contrato');
  const [tipo, setTipo] = useState<TipoContrato>('produccion');
  const [selId, setSelId] = useState('');
  const [tipoGeneral, setTipoGeneral] = useState<'todos' | TipoContrato>('todos');
  const [generando, setGenerando] = useState(false);

  const esTipo = (c: ContratoAcopio, t: TipoContrato) => (c.tipo === 'minero' ? 'minero' : 'produccion') === t;
  const delTipo = useMemo(() => contratos.filter((c) => esTipo(c, tipo)), [contratos, tipo]);
  // Al cambiar de tipo, si el seleccionado ya no pertenece, se limpia.
  useEffect(() => { if (selId && !delTipo.some((c) => c.id === selId)) setSelId(''); }, [delTipo, selId]);
  const sel = useMemo(() => contratos.find((c) => c.id === selId) ?? null, [contratos, selId]);

  async function verContrato() {
    if (!sel) return;
    setGenerando(true);
    try { await descargarContratoDetallePdf(sel); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el reporte', 'error'); }
    finally { setGenerando(false); }
  }
  async function verGeneral() {
    const rows = tipoGeneral === 'todos' ? contratos : contratos.filter((c) => esTipo(c, tipoGeneral));
    if (!rows.length) { toast('No hay contratos para ese tipo.', 'error'); return; }
    setGenerando(true);
    try { await descargarContratosPdf(rows, { filtro: tipoGeneral === 'todos' ? undefined : `tipo: ${tipoGeneral}` }); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el reporte', 'error'); }
    finally { setGenerando(false); }
  }

  return (
    <Modal title="📄 Reportes de contratos" size="md" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {/* Switch de modo */}
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.9rem' }}>
        <button type="button" className={modo === 'contrato' ? 'active' : ''} onClick={() => setModo('contrato')}>📄 Reporte por contrato</button>
        <button type="button" className={modo === 'general' ? 'active' : ''} onClick={() => setModo('general')}>📊 Reporte general (resumen)</button>
      </div>

      {modo === 'contrato' ? (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
            Elegí el tipo de contrato y buscá el número; al verlo se abre la <strong>vista previa</strong> con todos los detalles para descargar.
          </p>
          <div className="view-toggle" role="tablist" style={{ marginBottom: '.7rem' }}>
            <button type="button" className={tipo === 'produccion' ? 'active' : ''} onClick={() => setTipo('produccion')}>⚙ Producción</button>
            <button type="button" className={tipo === 'minero' ? 'active' : ''} onClick={() => setTipo('minero')}>⛏ Minero</button>
          </div>
          <div className="form-row">
            <label>Contrato de {tipo === 'minero' ? 'minero' : 'producción'} <span className="muted">({delTipo.length} disponible(s))</span></label>
            <SearchSelect value={selId} onChange={setSelId} disabled={!delTipo.length}
              placeholder={delTipo.length ? '🔍 Buscar por número…' : '— sin contratos de este tipo —'}
              options={delTipo.map((c) => ({ value: c.id, label: `${c.numero} · ${date(c.fecha)}${c.lugar_extraccion ? ` · ${c.lugar_extraccion}` : ''}` }))} />
          </div>
          {sel && (
            <div className="card" style={{ background: 'var(--surface-2)', marginTop: '.6rem', fontSize: '.82rem' }}>
              <strong className="mono">{sel.numero}</strong> · {date(sel.fecha)} · {sel.estado === 'activo' ? '● Activo' : '✔ Cerrado'}<br />
              <span className="muted">Lugar: {sel.lugar_extraccion || '—'} · Kg s/limpio: <span className="mono">{num(sel.kg_seco_limpio)}</span>
                {sel.tipo === 'minero' && Array.isArray(sel.personas) && sel.personas.length > 0 && <> · 👤 {sel.personas.length} persona(s)</>}</span>
            </div>
          )}
          <div style={{ marginTop: '.9rem', textAlign: 'right' }}>
            <button className="btn btn-primary" disabled={!sel || generando} onClick={() => void verContrato()}>
              {generando ? 'Generando…' : '👁 Ver vista previa'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
            Resumen general de todos los contratos en una tabla (con totales). Podés acotar por tipo. Se abre en <strong>vista previa</strong> para descargar.
          </p>
          <div className="form-row" style={{ maxWidth: 260 }}>
            <label>Tipo de contrato</label>
            <select className="select" value={tipoGeneral} onChange={(e) => setTipoGeneral(e.target.value as typeof tipoGeneral)}>
              <option value="todos">Todos ({contratos.length})</option>
              <option value="produccion">Solo producción</option>
              <option value="minero">Solo minero</option>
            </select>
          </div>
          <div style={{ marginTop: '.9rem', textAlign: 'right' }}>
            <button className="btn btn-primary" disabled={!contratos.length || generando} onClick={() => void verGeneral()}>
              {generando ? 'Generando…' : '👁 Ver vista previa'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ───────────── Modal: Históricos de contratos ─────────────
   Contratos archivados: NO aparecen en la lista principal ni suman en los KG de
   Casiterita obtenidos. Se pueden ver en detalle (clic) o restaurar. */
function HistoricosContratosModal({ historicos, canWrite, onVer, onRestaurar, onClose }: {
  historicos: ContratoAcopio[]; canWrite: boolean;
  onVer: (c: ContratoAcopio) => void; onRestaurar: (c: ContratoAcopio) => void; onClose: () => void;
}) {
  const kgTotal = historicos.reduce((a, c) => a + (Number(c.kg_seco_limpio) || 0), 0);
  return (
    <Modal title="📚 Contratos en Históricos" size="lg" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        {historicos.length} contrato(s) archivado(s) · <strong className="mono">{num(kgTotal)} Kg</strong> de casiterita.
        No cuentan en las métricas ni en la lista principal. Hacé clic en una fila para ver el detalle.
      </p>
      {!historicos.length ? (
        <EmptyState message="Sin contratos en históricos." icon="📚" />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr>
              <th>N° Contrato</th><th>Fecha</th><th>Supervisor</th><th>Lugar</th>
              <th style={{ textAlign: 'right' }}>Kg s/limpio</th><th>Estado</th>{canWrite && <th></th>}
            </tr></thead>
            <tbody>
              {historicos.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onVer(c)} title="Ver detalle">
                  <td className="mono"><strong>{c.numero}</strong></td>
                  <td>{date(c.fecha)}</td>
                  <td>{c.supervisor || '—'}</td>
                  <td>{c.lugar_extraccion || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--primary-3)', fontWeight: 700 }}>{num(c.kg_seco_limpio)}</td>
                  <td>{c.estado === 'activo' ? <span className="badge success">● Activo</span> : <span className="badge">✔ Cerrado</span>}</td>
                  {canWrite && (
                    <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" title="Restaurar (vuelve a la lista y a las métricas)" onClick={() => onRestaurar(c)}>↩ Restaurar</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
