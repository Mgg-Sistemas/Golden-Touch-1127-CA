import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import type { ContratoAcopio, EstadoContratoAcopio } from '@/shared/lib/types';
import { listContratos, eliminarContrato, cerrarContrato, reabrirContrato } from './contratos.repository';
import { ContratosModal, pct } from './ContratosModal';
import { descargarContratosPdf } from './contratoPdf';
import { descargarContratosExcel } from './contratoExcel';
import { enviarContratosPorCorreo } from './enviarContrato';

export interface ContratosViewHandle { openCreate: () => void }

export const ContratosView = forwardRef<ContratosViewHandle, {
  canWrite: boolean; actor: string; actorName: string | null; defaultEmail: string;
}>(function ContratosView({ canWrite, actor, actorName, defaultEmail }, ref) {
  const [contratos, setContratos] = useState<ContratoAcopio[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ kind: 'none' } | { kind: 'crear' } | { kind: 'editar'; c: ContratoAcopio }>({ kind: 'none' });
  const [correoOpen, setCorreoOpen] = useState(false);
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

  // Opciones para los selectores de filtro.
  const opcs = useMemo(() => {
    const uniq = (sel: (c: ContratoAcopio) => string | null | undefined) =>
      Array.from(new Set(contratos.map((c) => (sel(c) ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
    return { supervisores: uniq((c) => c.supervisor), lugares: uniq((c) => c.lugar_extraccion) };
  }, [contratos]);

  const filtrados = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return contratos.filter((c) => {
      if (fEstado !== 'todos' && c.estado !== fEstado) return false;
      if (fSupervisor && (c.supervisor ?? '') !== fSupervisor) return false;
      if (fLugar && (c.lugar_extraccion ?? '') !== fLugar) return false;
      if (fDesde && (c.fecha ?? '') < fDesde) return false;
      if (fHasta && (c.fecha ?? '') > fHasta) return false;
      if (q) {
        const hay = [c.numero, c.supervisor, c.lugar_extraccion, c.molino, c.observaciones, c.fecha]
          .map((x) => (x ?? '').toString().toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contratos, fTexto, fSupervisor, fLugar, fEstado, fDesde, fHasta]);

  const hayFiltro = !!(fTexto || fSupervisor || fLugar || fEstado !== 'todos' || fDesde || fHasta);
  function limpiar() { setFTexto(''); setFSupervisor(''); setFLugar(''); setFEstado('todos'); setFDesde(''); setFHasta(''); }

  // Resumen para las tarjetas (sobre TODOS los contratos, no el filtro).
  const resumen = useMemo(() => contratos.reduce((a, c) => {
    const kg = Number(c.kg_seco_limpio) || 0;
    a.total += 1; a.kg += kg;
    if (c.estado === 'activo') { a.activos += 1; a.kgActivos += kg; }
    return a;
  }, { activos: 0, total: 0, kg: 0, kgActivos: 0 }), [contratos]);

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
