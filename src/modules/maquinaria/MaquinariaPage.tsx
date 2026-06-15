import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useSession } from '@/modules/auth/authStore';
import { num as fmtNum } from '@/shared/lib/format';
import { MaquinariaCatalogoModal } from './MaquinariaCatalogoModal';
import { EquipoFormModal } from './EquipoFormModal';
import { BitacoraModal } from './BitacoraModal';
import { ResumenMaquinariaModal } from './ResumenMaquinariaModal';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import { listEquipos, setEquipoActivo, eliminarEquipo, type MaquinariaEquipo } from './maquinariaEquipos.repository';
import { descargarEquiposPdf, descargarEquiposExcel, enviarEquiposPorCorreo } from './maquinariaReportes';

const STATUS_COLOR: Record<string, string> = {
  'ACTIVO': 'var(--success)', 'MANTENIMIENTO': 'var(--warning)',
  'FUERA DE SERVICIO': 'var(--danger)', 'INACTIVO': 'var(--muted)',
};

export function MaquinariaPage() {
  const { can, appUser } = usePermissions();
  const { user } = useSession();
  const canWrite = can('maquinaria', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [resumenOpen, setResumenOpen] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);
  const [form, setForm] = useState<{ open: boolean; equipo: MaquinariaEquipo | null }>({ open: false, equipo: null });
  const [bitacora, setBitacora] = useState<MaquinariaEquipo | null>(null);
  const [borrar, setBorrar] = useState<MaquinariaEquipo | null>(null);

  const cargar = useCallback(async () => {
    try { setEquipos(await listEquipos()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['maquinaria_equipos', 'maquinaria_catalogos', 'maquinaria_mantenimientos'], () => { void cargar(); });

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return equipos.filter((e) => {
      if (!verInactivos && !e.activo) return false;
      if (!q) return true;
      return [e.equipo, e.tipo, e.propietario, e.status, e.ubicacion, e.serial, e.placa, e.marca, e.modelo]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [equipos, filtro, verInactivos]);

  async function toggleActivo(e: MaquinariaEquipo) {
    try { await setEquipoActivo(e.id, !e.activo); await cargar(); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo cambiar', 'error'); }
  }
  async function doBorrar(e: MaquinariaEquipo) {
    try { await eliminarEquipo(e.id); await cargar(); toast('Equipo eliminado', 'success'); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🚜 Control de Maquinaria</h1>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {canWrite && <button className="btn btn-primary" onClick={() => setForm({ open: true, equipo: null })}>+ Nuevo equipo</button>}
          <button className="btn btn-ghost" onClick={() => setResumenOpen(true)}>📊 Resumen</button>
          <button className="btn btn-ghost" onClick={() => setCatalogoOpen(true)}>🏷 Catálogo</button>
          <button className="btn btn-ghost" disabled={!lista.length} onClick={() => void descargarEquiposPdf(lista)}>↓ PDF</button>
          <button className="btn btn-ghost" disabled={!lista.length} onClick={() => void descargarEquiposExcel(lista)}>↓ Excel</button>
          <button className="btn btn-ghost" disabled={!lista.length} onClick={() => setCorreoOpen(true)}>✉ Correo</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
        <input className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="🔍 Buscar equipo, tipo, propietario, serial…" style={{ flex: '1 1 280px' }} />
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.82rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivos
        </label>
        <span className="muted" style={{ fontSize: '.8rem' }}>{lista.length} equipo(s)</span>
      </div>

      {loading ? (
        <EmptyState message="Cargando…" />
      ) : !lista.length ? (
        <EmptyState message={filtro.trim() ? 'Sin resultados.' : 'Aún no hay equipos registrados.'} />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead><tr>
              <th>Equipo</th><th>Tipo</th><th>Propietario</th><th>Status</th><th>Ubicación</th>
              <th style={{ textAlign: 'right' }}>Mantt. (h)</th><th>⛽</th><th></th>
            </tr></thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.5 }}>
                  <td><strong>{e.equipo}</strong>{e.serial ? <div className="muted mono" style={{ fontSize: '.72rem' }}>{e.serial}</div> : null}</td>
                  <td>{e.tipo ?? '—'}</td>
                  <td>{e.propietario ?? '—'}</td>
                  <td><span className="badge" style={{ color: STATUS_COLOR[e.status] ?? undefined }}>{e.status}</span></td>
                  <td>{e.ubicacion ?? '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{e.mantenimiento_cada_hrs != null ? fmtNum(e.mantenimiento_cada_hrs) : '—'}</td>
                  <td>{e.combustible_equipo ? <span title={`Vinculado a Combustible: ${e.combustible_equipo}`}>✅</span> : <span className="muted" title="Sin vincular">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" title="Bitácora / horómetro" onClick={() => setBitacora(e)}>🔧</button>
                    {canWrite && <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setForm({ open: true, equipo: e })}>✎</button>}
                    {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => void toggleActivo(e)}>{e.activo ? 'Desactivar' : 'Activar'}</button>}
                    {canWrite && <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => setBorrar(e)}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {catalogoOpen && <MaquinariaCatalogoModal canWrite={canWrite} onClose={() => setCatalogoOpen(false)} />}
      {resumenOpen && <ResumenMaquinariaModal equipos={equipos.filter((e) => e.activo)} onClose={() => setResumenOpen(false)} />}
      {form.open && <EquipoFormModal equipo={form.equipo} actor={actor} onClose={() => setForm({ open: false, equipo: null })} onSaved={cargar} />}
      {bitacora && <BitacoraModal equipo={bitacora} canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setBitacora(null)} />}
      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar Control de Maquinaria"
          descripcion={`Se enviará el PDF con ${lista.length} equipo(s).`}
          defaultEmail={actor}
          onEnviar={async (emails) => (await enviarEquiposPorCorreo(lista, emails)).destinatarios}
          onClose={() => setCorreoOpen(false)}
        />
      )}
      {borrar && (
        <ConfirmDialog title="Eliminar equipo" message={`¿Eliminar "${borrar.equipo}" y toda su bitácora?`} confirmText="Eliminar" danger
          onCancel={() => setBorrar(null)} onConfirm={() => { const e = borrar; setBorrar(null); void doBorrar(e); }} />
      )}
    </div>
  );
}
