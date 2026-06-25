import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { listEquipos, setEquipoActivo, eliminarEquipo, type MaquinariaEquipo } from './maquinariaEquipos.repository';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { horasUltimoPorEquipo, solicitudesServicioPorEquipo, type SolicitudServicioEquipo } from './maquinariaMant.repository';
import { horometrosVigentesPorEquipo, kilometrajesVigentesPorEquipo } from '@/modules/combustible/tanques.repository';
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

/** Km restantes hasta el próximo mantenimiento (misma lógica que las HRS, pero por
 *  kilometraje): el servicio toca cada N km; restantes = N − (km mod N). */
function kmRestantes(frecuencia: number | null, kilometraje: number | null): number | null {
  if (!frecuencia || frecuencia <= 0 || kilometraje == null) return null;
  return ((frecuencia - (kilometraje % frecuencia)) % frecuencia);
}

/** Vista activa según la tarjeta de estado seleccionada. */
type VistaMaq = 'activa' | 'critico' | 'proximos';

export function MaquinariaPage() {
  const { can, appUser } = usePermissions();
  const { user } = useSession();
  const navigate = useNavigate();
  const canWrite = can('maquinaria', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [horometros, setHorometros] = useState<Map<string, number>>(new Map());     // combustible: nombre→horómetro
  const [kilometrajes, setKilometrajes] = useState<Map<string, number>>(new Map()); // combustible: nombre→kilometraje
  const [bitMap, setBitMap] = useState<Map<string, { ultimoHorometro: number | null }>>(new Map()); // bitácora: equipo_id→…
  const [solMap, setSolMap] = useState<Map<string, SolicitudServicioEquipo[]>>(new Map()); // solicitudes de servicio por equipo
  const [vista, setVista] = useState<VistaMaq>('activa');
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
    try {
      const [eqs, horos, kms, bit, sol] = await Promise.all([
        listEquipos(),
        horometrosVigentesPorEquipo().catch(() => new Map<string, number>()),
        kilometrajesVigentesPorEquipo().catch(() => new Map<string, number>()),
        horasUltimoPorEquipo().catch(() => new Map()),
        solicitudesServicioPorEquipo().catch(() => new Map<string, SolicitudServicioEquipo[]>()),
      ]);
      setEquipos(eqs);
      setHorometros(horos);
      setKilometrajes(kms);
      setBitMap(bit);
      setSolMap(sol);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  // También vigila los movimientos de combustible (horómetro vigente) y las órdenes
  // (solicitudes de servicio que casan a un equipo).
  useRealtime(['maquinaria_equipos', 'maquinaria_catalogos', 'maquinaria_mantenimientos', 'combustible_tanque_movimientos', 'ordenes'], () => { void cargar(); });

  // HRS / KM restantes + alerta por equipo. Las lecturas vigentes (horómetro y
  // kilometraje) se traen de Combustible por el equipo vinculado (combustible_equipo);
  // el horómetro cae a la bitácora si no hay dato de Combustible. La alerta de
  // «Próximo a mantenimiento» salta si el horómetro O el kilometraje están cerca
  // (≤ 10%) de su próximo servicio.
  const infoEquipo = useMemo(() => {
    const m = new Map<string, {
      restantes: number | null; alerta: boolean; alertaHrs: boolean; horometro: number | null;
      km: number | null; restantesKm: number | null; alertaKm: boolean;
    }>();
    for (const e of equipos) {
      const vinc = e.combustible_equipo ? e.combustible_equipo.trim() : null;
      const horo = (vinc ? horometros.get(vinc) : undefined) ?? bitMap.get(e.id)?.ultimoHorometro ?? null;
      const km = (vinc ? kilometrajes.get(vinc) : undefined) ?? null;
      const restantes = hrsRestantes(e.mantenimiento_cada_hrs, horo);
      const margen = e.mantenimiento_cada_hrs ? e.mantenimiento_cada_hrs * MARGEN_ALERTA_PCT : 0;
      const alertaHrs = restantes != null && restantes <= margen;
      const restantesKm = kmRestantes(e.mantenimiento_cada_km, km);
      const margenKm = e.mantenimiento_cada_km ? e.mantenimiento_cada_km * MARGEN_ALERTA_PCT : 0;
      const alertaKm = restantesKm != null && restantesKm <= margenKm;
      m.set(e.id, { restantes, horometro: horo, alerta: alertaHrs || alertaKm, alertaHrs, km, restantesKm, alertaKm });
    }
    return m;
  }, [equipos, horometros, kilometrajes, bitMap]);

  // Equipos activos que requieren mantenimiento pronto (≤ 250 HRS).
  const enAlerta = useMemo(
    () => equipos.filter((e) => e.activo && infoEquipo.get(e.id)?.alerta),
    [equipos, infoEquipo],
  );

  // ── Tarjetas de estado (Control de Maquinaria) ──
  // ACTIVA: equipos operativos. MANTENIMIENTO: equipos con al menos una solicitud de
  // servicio registrada (vínculo con Pedidos → Servicios). CRÍTICO: alerta de
  // mantenimiento próximo o equipo FUERA DE SERVICIO.
  const activos = useMemo(() => equipos.filter((e) => e.activo), [equipos]);
  const enMantenimiento = useMemo(
    () => equipos.filter((e) => (solMap.get(e.id) ?? []).length > 0),
    [equipos, solMap],
  );
  const criticos = useMemo(
    () => equipos.filter((e) => e.activo && (infoEquipo.get(e.id)?.alerta || e.status === 'FUERA DE SERVICIO')),
    [equipos, infoEquipo],
  );

  const lista = useMemo(() => {
    const q = normTxt(filtro.trim());
    const base = vista === 'critico' ? criticos : vista === 'proximos' ? enAlerta : equipos;
    return base.filter((e) => {
      if (vista === 'activa' && !verInactivos && !e.activo) return false;
      if (!q) return true;
      return [e.equipo, e.tipo, e.propietario, e.status, e.ubicacion, e.serial, e.placa, e.marca, e.modelo]
        .some((v) => normTxt(v ?? '').includes(q));
    });
  }, [equipos, criticos, enAlerta, vista, filtro, verInactivos]);

  async function toggleActivo(e: MaquinariaEquipo) {
    try { await setEquipoActivo(e.id, !e.activo); await cargar(); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo cambiar', 'error'); }
  }

  async function confirmarBorrar(e: MaquinariaEquipo) {
    try { await eliminarEquipo(e.id); toast('Equipo eliminado', 'success'); await cargar(); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🚜 Control de Maquinaria y Vehículos</h1>
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

      {/* 3 tarjetas: ACTIVA · MANTENIMIENTO · ESTADO CRÍTICO. La de mantenimiento
          lleva al submódulo Servicio de Mantenimiento (vínculo con las solicitudes
          de servicio); ACTIVA/CRÍTICO filtran la tabla de abajo. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <EstadoCard
          activa={vista === 'activa'} onClick={() => setVista('activa')}
          icon="✅" titulo="Vehículos / Maquinaria ACTIVA" total={activos.length} color="var(--success)"
          hint="Equipos operativos · ver el detalle" />
        <EstadoCard
          activa={false} onClick={() => navigate('/app/maquinaria/servicio-mantenimiento')}
          icon="🔧" titulo="En MANTENIMIENTO" total={enMantenimiento.length} color="var(--warning)"
          hint="Con solicitud de servicio · ir al control de mantenimiento" />
        <EstadoCard
          activa={vista === 'proximos'} onClick={() => setVista('proximos')}
          icon="🔧" titulo="Próximos a Mantenimiento" total={enAlerta.length} color="var(--brand, #ff8a00)"
          hint="Según kilometraje / horómetro (cerca del próximo servicio)" />
        <EstadoCard
          activa={vista === 'critico'} onClick={() => setVista('critico')}
          icon="⛔" titulo="En ESTADO CRÍTICO" total={criticos.length} color="var(--danger)"
          hint="Mantenimiento vencido / fuera de servicio" />
      </div>

      {enAlerta.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--bg-1)', marginBottom: '.6rem', padding: '.55rem .85rem' }}>
          ⚠️ <strong>{enAlerta.length} equipo(s)</strong> con mantenimiento próximo (cerca de cumplir sus horas u horas/km de servicio, según el horómetro y el kilometraje de Combustible): {enAlerta.slice(0, 6).map((e) => e.equipo).join(', ')}{enAlerta.length > 6 ? '…' : ''}
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
              <th style={{ textAlign: 'right' }}>Mantt. cada (h)</th><th style={{ textAlign: 'right' }}>Horómetro / Kilometraje</th><th></th>
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
                    {info?.horometro == null && info?.km == null
                      ? <span className="muted" title="Sin horómetro ni kilometraje registrado en Combustible (ni bitácora)">—</span>
                      : <>
                          {info?.horometro != null && (
                            <>
                              <div title="Horas acumuladas (horómetro de Combustible)">{fmtNum(info.horometro)} h</div>
                              {info.restantes != null && (
                                info.alertaHrs
                                  ? <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '.72rem' }} title={`Faltan ${fmtNum(info.restantes)} h para el próximo mantenimiento`}>⚠️ faltan {fmtNum(info.restantes)} h</div>
                                  : <div className="muted" style={{ fontSize: '.72rem' }}>faltan {fmtNum(info.restantes)} h</div>
                              )}
                            </>
                          )}
                          {info?.km != null && (
                            <>
                              <div title="Kilometraje vigente (odómetro de Combustible)">{fmtNum(info.km)} km</div>
                              {info.restantesKm != null && (
                                info.alertaKm
                                  ? <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '.72rem' }} title={`Faltan ${fmtNum(info.restantesKm)} km para el próximo mantenimiento`}>⚠️ faltan {fmtNum(info.restantesKm)} km</div>
                                  : <div className="muted" style={{ fontSize: '.72rem' }}>faltan {fmtNum(info.restantesKm)} km</div>
                              )}
                            </>
                          )}
                        </>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" title="Bitácora / horómetro" onClick={() => setBitacora(e)}>🔧</button>
                    {canWrite && <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setForm({ open: true, equipo: e })}>✎</button>}
                    {canWrite && <button className="btn btn-sm btn-ghost" title={e.activo ? 'Desactivar (queda inactivo, no se borra)' : 'Reactivar'} onClick={() => void toggleActivo(e)}>{e.activo ? 'Desactivar' : 'Activar'}</button>}
                    {canWrite && <button className="btn btn-sm btn-ghost" title="Eliminar definitivamente (borra también su bitácora)" onClick={() => setBorrar(e)}>🗑</button>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {borrar && (
        <ConfirmDialog
          title="Eliminar equipo"
          message={`¿Eliminar definitivamente "${borrar.equipo}"? Se borrará también toda su bitácora de mantenimientos. Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          danger
          onCancel={() => setBorrar(null)}
          onConfirm={() => { const e = borrar; setBorrar(null); void confirmarBorrar(e); }}
        />
      )}

      {catalogoOpen && <MaquinariaCatalogoModal canWrite={canWrite} onClose={() => setCatalogoOpen(false)} />}
      {resumenOpen && <ResumenMaquinariaModal equipos={equipos.filter((e) => e.activo)} onClose={() => setResumenOpen(false)} />}
      {form.open && <EquipoFormModal equipo={form.equipo} actor={actor} onClose={() => setForm({ open: false, equipo: null })} onSaved={cargar} />}
      {bitacora && <BitacoraModal equipo={bitacora} canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setBitacora(null)} />}
      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar Control de Maquinaria y Vehículos"
          descripcion={`Se enviará el PDF con ${lista.length} equipo(s).`}
          defaultEmail={actor}
          onEnviar={async (emails) => (await enviarEquiposPorCorreo(lista, emails)).destinatarios}
          onClose={() => setCorreoOpen(false)}
        />
      )}
    </div>
  );
}

/** Tarjeta de estado (ACTIVA / MANTENIMIENTO / CRÍTICO): muestra el total y al tocar abre su detalle. */
function EstadoCard({ activa, onClick, icon, titulo, total, color, hint }: {
  activa: boolean; onClick: () => void; icon: string; titulo: string; total: number; color: string; hint: string;
}) {
  return (
    <button type="button" onClick={onClick} className="card" style={{
      textAlign: 'left', cursor: 'pointer', margin: 0, padding: '.85rem 1rem', width: '100%',
      borderColor: activa ? color : 'var(--border)', borderWidth: activa ? 2 : 1, borderStyle: 'solid',
      background: activa ? 'var(--surface-2)' : undefined,
    }}>
      <div className="muted" style={{ fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{icon} {titulo}</div>
      <div className="mono" style={{ fontSize: '2rem', fontWeight: 800, color }}>{total}</div>
      <div className="muted" style={{ fontSize: '.72rem' }}>{hint}</div>
    </button>
  );
}
