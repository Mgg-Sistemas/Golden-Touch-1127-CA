import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { useSession } from '@/modules/auth/authStore';
import { num as fmtNum } from '@/shared/lib/format';
import { MaquinariaCatalogoModal } from './MaquinariaCatalogoModal';
import { EquipoFormModal } from './EquipoFormModal';
import { BitacoraModal } from './BitacoraModal';
import { ResumenMaquinariaModal } from './ResumenMaquinariaModal';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import { listEquipos, setEquipoActivo, type MaquinariaEquipo } from './maquinariaEquipos.repository';
import { horasUltimoPorEquipo } from './maquinariaMant.repository';
import { horometrosVigentesPorEquipo } from '@/modules/combustible/tanques.repository';
import { descargarEquiposPdf, descargarEquiposExcel, enviarEquiposPorCorreo } from './maquinariaReportes';

const STATUS_COLOR: Record<string, string> = {
  'ACTIVO': 'var(--success)', 'MANTENIMIENTO': 'var(--warning)',
  'FUERA DE SERVICIO': 'var(--danger)', 'INACTIVO': 'var(--muted)',
};

/** Umbral de alerta: si faltan ≤ 250 HRS para el próximo mantenimiento, se avisa. */
// La alerta de mantenimiento salta cuando faltan ≤ 10% de las horas del intervalo
// para el próximo servicio (ej.: cada 250 h → avisa con ≤ 25 h restantes). Antes el
// umbral era fijo (250 h): igual o mayor que el intervalo, así que alertaba desde la
// hora 0 y nunca se apagaba.
const MARGEN_ALERTA_PCT = 0.1;

/** Quita acentos y pasa a minúsculas para una búsqueda tolerante. */
const normTxt = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * HRS restantes hasta el próximo mantenimiento. El mantenimiento se hace cada N horas
 * ACUMULADAS de horómetro (N = mantenimiento_cada_hrs); el próximo toca en el siguiente
 * múltiplo de N. restantes = N − (horómetro mod N). Devuelve null si falta el dato.
 */
function hrsRestantes(frecuencia: number | null, horometro: number | null): number | null {
  if (!frecuencia || frecuencia <= 0 || horometro == null) return null;
  return ((frecuencia - (horometro % frecuencia)) % frecuencia);
}

export function MaquinariaPage() {
  const { can, appUser } = usePermissions();
  const { user } = useSession();
  const canWrite = can('maquinaria', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [horometros, setHorometros] = useState<Map<string, number>>(new Map());     // combustible: nombre→horómetro
  const [bitMap, setBitMap] = useState<Map<string, { ultimoHorometro: number | null }>>(new Map()); // bitácora: equipo_id→…
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [resumenOpen, setResumenOpen] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);
  const [form, setForm] = useState<{ open: boolean; equipo: MaquinariaEquipo | null }>({ open: false, equipo: null });
  const [bitacora, setBitacora] = useState<MaquinariaEquipo | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [eqs, horos, bit] = await Promise.all([
        listEquipos(),
        horometrosVigentesPorEquipo().catch(() => new Map<string, number>()),
        horasUltimoPorEquipo().catch(() => new Map()),
      ]);
      setEquipos(eqs);
      setHorometros(horos);
      setBitMap(bit);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  // También vigila los movimientos de combustible: el horómetro vigente sale de ahí.
  useRealtime(['maquinaria_equipos', 'maquinaria_catalogos', 'maquinaria_mantenimientos', 'combustible_tanque_movimientos'], () => { void cargar(); });

  // HRS restantes + alerta por equipo. Horómetro vigente: el de Combustible (si está
  // vinculado), si no el último de la bitácora.
  const infoEquipo = useMemo(() => {
    const m = new Map<string, { restantes: number | null; alerta: boolean; horometro: number | null }>();
    for (const e of equipos) {
      const horo = (e.combustible_equipo ? horometros.get(e.combustible_equipo.trim()) : undefined)
        ?? bitMap.get(e.id)?.ultimoHorometro ?? null;
      const restantes = hrsRestantes(e.mantenimiento_cada_hrs, horo);
      const margen = e.mantenimiento_cada_hrs ? e.mantenimiento_cada_hrs * MARGEN_ALERTA_PCT : 0;
      m.set(e.id, { restantes, horometro: horo, alerta: restantes != null && restantes <= margen });
    }
    return m;
  }, [equipos, horometros, bitMap]);

  const lista = useMemo(() => {
    const q = normTxt(filtro.trim());
    return equipos.filter((e) => {
      if (!verInactivos && !e.activo) return false;
      if (!q) return true;
      return [e.equipo, e.tipo, e.propietario, e.status, e.ubicacion, e.serial, e.placa, e.marca, e.modelo]
        .some((v) => normTxt(v ?? '').includes(q));
    });
  }, [equipos, filtro, verInactivos]);

  // Equipos activos que requieren mantenimiento pronto (≤ 250 HRS).
  const enAlerta = useMemo(
    () => equipos.filter((e) => e.activo && infoEquipo.get(e.id)?.alerta),
    [equipos, infoEquipo],
  );

  async function toggleActivo(e: MaquinariaEquipo) {
    try { await setEquipoActivo(e.id, !e.activo); await cargar(); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo cambiar', 'error'); }
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

      {enAlerta.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--bg-1)', marginBottom: '.6rem', padding: '.55rem .85rem' }}>
          ⚠️ <strong>{enAlerta.length} equipo(s)</strong> con mantenimiento próximo (cerca de cumplir sus horas de servicio): {enAlerta.slice(0, 6).map((e) => e.equipo).join(', ')}{enAlerta.length > 6 ? '…' : ''}
        </div>
      )}

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
              <th style={{ textAlign: 'right' }}>Mantt. cada (h)</th><th style={{ textAlign: 'right' }}>HRS acumuladas</th><th></th>
            </tr></thead>
            <tbody>
              {lista.map((e) => {
                const info = infoEquipo.get(e.id);
                return (
                <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.5, background: info?.alerta ? 'rgba(255,165,0,.10)' : undefined }}>
                  <td><strong>{e.equipo}</strong>{e.serial ? <div className="muted mono" style={{ fontSize: '.72rem' }}>{e.serial}</div> : null}</td>
                  <td>{e.tipo ?? '—'}</td>
                  <td>{e.propietario ?? '—'}</td>
                  <td><span className="badge" style={{ color: STATUS_COLOR[e.status] ?? undefined }}>{e.status}</span></td>
                  <td>{e.ubicacion ?? '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{e.mantenimiento_cada_hrs != null ? fmtNum(e.mantenimiento_cada_hrs) : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {info?.horometro == null
                      ? <span className="muted" title="Sin horómetro registrado (se toma el acumulado de HRS de Combustible o la bitácora)">—</span>
                      : <>
                          <div title="Horas acumuladas (suma de HRS)">{fmtNum(info.horometro)} h</div>
                          {info.restantes != null && (
                            info.alerta
                              ? <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '.72rem' }} title={`Faltan ${fmtNum(info.restantes)} h para el próximo mantenimiento`}>⚠️ faltan {fmtNum(info.restantes)} h</div>
                              : <div className="muted" style={{ fontSize: '.72rem' }}>faltan {fmtNum(info.restantes)} h</div>
                          )}
                        </>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" title="Bitácora / horómetro" onClick={() => setBitacora(e)}>🔧</button>
                    {canWrite && <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setForm({ open: true, equipo: e })}>✎</button>}
                    {canWrite && <button className="btn btn-sm btn-ghost" title={e.activo ? 'Desactivar (queda inactivo, no se borra)' : 'Reactivar'} onClick={() => void toggleActivo(e)}>{e.activo ? 'Desactivar' : 'Activar'}</button>}
                  </td>
                </tr>
                );
              })}
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
    </div>
  );
}
