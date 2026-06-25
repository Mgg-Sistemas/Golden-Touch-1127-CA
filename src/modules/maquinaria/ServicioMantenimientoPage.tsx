import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { useSession } from '@/modules/auth/authStore';
import { num as fmtNum, dateTime } from '@/shared/lib/format';
import { BitacoraModal } from './BitacoraModal';
import { ResumenMantenimientoModal } from './ResumenMantenimientoModal';
import { listEquipos, GRUPOS_MANTENIMIENTO, type MaquinariaEquipo } from './maquinariaEquipos.repository';
import { horasUltimoPorEquipo, solicitudesServicioPorEquipo, type SolicitudServicioEquipo } from './maquinariaMant.repository';
import { horometrosVigentesPorEquipo, kilometrajesVigentesPorEquipo } from '@/modules/combustible/tanques.repository';

/** % de margen para avisar «próximo a mantenimiento» (10% del intervalo). */
const MARGEN_ALERTA_PCT = 0.1;

/** Etiqueta del estado de un servicio (alineada con la pestaña Servicios de Pedidos). */
const SERVICIO_ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Solicitado', aprobada: 'Aprobado (cotizar)', oc_creada: 'Pendiente por aprobación',
  cuenta_abierta: 'Crédito / cuenta abierta', confirmada_metodo: 'Confirmado (método de pago)',
  oc_aprobada: 'Confirmado pagar', por_recibir: 'Pendiente por realizar', pagada: 'Pagado',
  recibida: 'Servicio realizado', finalizada: 'Finalizado', cancelada: 'Cancelado', anulada: 'Anulado',
};
const estadoServicioLabel = (e: string) => SERVICIO_ESTADO_LABEL[e] ?? e;

const STATUS_COLOR: Record<string, string> = {
  'ACTIVO': 'var(--success)', 'MANTENIMIENTO': 'var(--warning)',
  'FUERA DE SERVICIO': 'var(--danger)', 'INACTIVO': 'var(--muted)',
};

/** Umbral de alerta: si faltan ≤ 250 HRS para el próximo mantenimiento, se avisa. */
const UMBRAL_ALERTA_HRS = 250;

/** Ícono de cada switch (grupo). */
const GRUPO_ICON: Record<string, string> = {
  'FLOTA PESADA': '🚜',
  'VEHÍCULOS DE CARGA': '🚚',
  'PLANTAS ELÉCTRICAS': '⚡',
};

/** Switch virtual para los equipos que aún no tienen grupo asignado en su ficha. */
const SIN_GRUPO = '__sin_grupo__';

/** Normaliza (sin acentos, minúsculas) para clasificar por el tipo del equipo. */
const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Grupo de mantenimiento DEDUCIDO del tipo del equipo cuando no tiene uno asignado
 * a mano en su ficha:
 *  · planta / generador / eléctrico        → PLANTAS ELÉCTRICAS
 *  · vehículo / carro / camión / gandola…  → VEHÍCULOS DE CARGA
 *  · todo lo demás (excavadora, cargador…) → FLOTA PESADA
 */
function grupoPorTipo(tipo: string | null | undefined): string {
  const t = norm(tipo ?? '');
  if (/planta|generador|electric/.test(t)) return 'PLANTAS ELÉCTRICAS';
  if (/vehiculo|carro|camion|gandola|camioneta|pickup|\bauto|van\b|autobus|\bbus|encava|jeep|chuto|remolque|moto/.test(t)) return 'VEHÍCULOS DE CARGA';
  return 'FLOTA PESADA';
}

/** Grupo efectivo de un equipo: el asignado a mano en la ficha o, si no, el deducido del tipo. */
function grupoDeEquipo(e: { grupo_mantenimiento?: string | null; tipo?: string | null }): string {
  const g = (e.grupo_mantenimiento ?? '').trim();
  return GRUPOS_MANTENIMIENTO.includes(g as (typeof GRUPOS_MANTENIMIENTO)[number]) ? g : grupoPorTipo(e.tipo);
}

/**
 * HRS restantes hasta el próximo mantenimiento (cada N horas de horómetro):
 * restantes = N − (horómetro mod N). null si falta algún dato.
 */
function hrsRestantes(frecuencia: number | null, horometro: number | null): number | null {
  if (!frecuencia || frecuencia <= 0 || horometro == null) return null;
  return ((frecuencia - (horometro % frecuencia)) % frecuencia);
}

/** Km restantes hasta el próximo mantenimiento (cada N km): N − (km mod N). */
function kmRestantes(frecuencia: number | null, kilometraje: number | null): number | null {
  if (!frecuencia || frecuencia <= 0 || kilometraje == null) return null;
  return ((frecuencia - (kilometraje % frecuencia)) % frecuencia);
}

/**
 * Submódulo «Servicio de Mantenimiento» de Control de Maquinaria. Los equipos se
 * agrupan en switches (FLOTA PESADA / VEHÍCULOS DE CARGA / PLANTAS ELÉCTRICAS) según
 * el grupo asignado en su ficha; cada switch muestra los equipos de ese grupo con su
 * estado de mantenimiento (horómetro, HRS restantes, alerta) y acceso a la bitácora.
 */
export function ServicioMantenimientoPage() {
  const { can, appUser } = usePermissions();
  const { user } = useSession();
  const canWrite = can('maquinaria', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [horometros, setHorometros] = useState<Map<string, number>>(new Map());
  const [bitMap, setBitMap] = useState<Map<string, { ultimoHorometro: number | null }>>(new Map());
  const [solMap, setSolMap] = useState<Map<string, SolicitudServicioEquipo[]>>(new Map());
  const [kilometrajes, setKilometrajes] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState<string>(GRUPOS_MANTENIMIENTO[0]);
  const [bitacora, setBitacora] = useState<MaquinariaEquipo | null>(null);
  const [resumenOpen, setResumenOpen] = useState(false);
  const [solDe, setSolDe] = useState<MaquinariaEquipo | null>(null);

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
  useRealtime(['maquinaria_equipos', 'maquinaria_catalogos', 'maquinaria_mantenimientos', 'combustible_tanque_movimientos', 'ordenes'], () => { void cargar(); });

  // Horómetro vigente + HRS restantes por equipo (igual que en Control de Maquinaria).
  const infoEquipo = useMemo(() => {
    const m = new Map<string, { restantes: number | null; alerta: boolean; horometro: number | null }>();
    for (const e of equipos) {
      const horo = (e.combustible_equipo ? horometros.get(e.combustible_equipo.trim()) : undefined)
        ?? bitMap.get(e.id)?.ultimoHorometro ?? null;
      const restantes = hrsRestantes(e.mantenimiento_cada_hrs, horo);
      m.set(e.id, { restantes, horometro: horo, alerta: restantes != null && restantes <= UMBRAL_ALERTA_HRS });
    }
    return m;
  }, [equipos, horometros, bitMap]);

  // Conteo por grupo + lista de equipos sin clasificar (para que igual se vean acá,
  // aunque no tengan un grupo asignado en su ficha — así "sincronizan" con Control
  // de Maquinaria sin obligar a clasificarlos primero).
  const porGrupo = useMemo(() => {
    const m = new Map<string, MaquinariaEquipo[]>();
    for (const g of GRUPOS_MANTENIMIENTO) m.set(g, []);
    const sinGrupoList: MaquinariaEquipo[] = [];
    for (const e of equipos) {
      // Grupo efectivo: el asignado a mano o el deducido del tipo del equipo.
      const g = grupoDeEquipo(e);
      if (m.has(g)) m.get(g)!.push(e);
      else sinGrupoList.push(e);
    }
    return { m, sinGrupoList, sinGrupo: sinGrupoList.length };
  }, [equipos]);

  const lista = grupo === SIN_GRUPO ? porGrupo.sinGrupoList : (porGrupo.m.get(grupo) ?? []);
  const grupoLabel = grupo === SIN_GRUPO ? 'SIN CLASIFICAR' : grupo;
  const enAlerta = lista.filter((e) => e.activo && infoEquipo.get(e.id)?.alerta);

  // Equipos de este grupo próximos a su mantenimiento por KILOMETRAJE. El km vigente se
  // trae de Combustible (equipo vinculado) y el intervalo de la ficha (mantenimiento_cada_km):
  // alerta si faltan ≤ 10% del intervalo (o ya se pasó) para el próximo múltiplo.
  const enAlertaKm = useMemo(
    () => lista.flatMap((e) => {
      if (!e.activo) return [];
      const ultimoKm = (e.combustible_equipo ? kilometrajes.get(e.combustible_equipo.trim()) : undefined) ?? null;
      const restante = kmRestantes(e.mantenimiento_cada_km, ultimoKm);
      if (restante == null || ultimoKm == null) return [];
      const margen = (e.mantenimiento_cada_km ?? 0) * MARGEN_ALERTA_PCT;
      if (restante > margen) return [];
      return [{ e, km: { ultimoKm, alertaKm: ultimoKm + restante, restante } }];
    }),
    [lista, kilometrajes],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🔧 Servicio de Mantenimiento</h1>
          <p className="muted" style={{ margin: '.2rem 0 0', fontSize: '.85rem' }}>
            Equipos de Control de Maquinaria agrupados por flota, con su estado de mantenimiento.
          </p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setResumenOpen(true)}>📊 Resumen de {grupoLabel}</button>
        </div>
      </div>

      {/* Switches por grupo */}
      <div className="view-toggle" role="tablist" aria-label="Grupo de mantenimiento" style={{ flexWrap: 'wrap', marginBottom: '.7rem' }}>
        {GRUPOS_MANTENIMIENTO.map((g) => (
          <button key={g} role="tab" aria-selected={grupo === g} className={grupo === g ? 'active' : ''} onClick={() => setGrupo(g)}>
            {GRUPO_ICON[g] ?? '🔧'} {g} <span className="badge" style={{ marginLeft: '.35rem' }}>{porGrupo.m.get(g)?.length ?? 0}</span>
          </button>
        ))}
        {porGrupo.sinGrupo > 0 && (
          <button role="tab" aria-selected={grupo === SIN_GRUPO} className={grupo === SIN_GRUPO ? 'active' : ''} onClick={() => setGrupo(SIN_GRUPO)}>
            🗂 SIN CLASIFICAR <span className="badge" style={{ marginLeft: '.35rem' }}>{porGrupo.sinGrupo}</span>
          </button>
        )}
      </div>

      {porGrupo.sinGrupo > 0 && grupo !== SIN_GRUPO && (
        <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.6rem' }}>
          ℹ️ {porGrupo.sinGrupo} equipo(s) sin grupo asignado — están en la pestaña <strong>🗂 SIN CLASIFICAR</strong>. Asignáles un grupo en su ficha (Control de Maquinaria → ✎ → «Grupo · Servicio de Mantenimiento») para ordenarlos por flota.
        </div>
      )}

      {enAlerta.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--bg-1)', marginBottom: '.6rem', padding: '.55rem .85rem' }}>
          ⚠️ <strong>{enAlerta.length} equipo(s)</strong> con mantenimiento próximo (≤ {UMBRAL_ALERTA_HRS} HRS): {enAlerta.slice(0, 6).map((e) => e.equipo).join(', ')}{enAlerta.length > 6 ? '…' : ''}
        </div>
      )}

      {/* Alerta por KILOMETRAJE: equipos que ya alcanzaron / están próximos al km indicado en la bitácora. */}
      {enAlertaKm.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)', background: 'rgba(239,68,68,.08)', marginBottom: '.6rem', padding: '.55rem .85rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '.25rem' }}>🛞 {enAlertaKm.length} equipo(s) próximos a mantenimiento por kilometraje</div>
          <div style={{ display: 'grid', gap: '.15rem' }}>
            {enAlertaKm.map(({ e, km }) => (
              <div key={e.id} style={{ fontSize: '.82rem' }}>
                <strong>{e.equipo}</strong>: va en <strong className="mono">{fmtNum(km.ultimoKm ?? 0)} km</strong> · alerta en <strong className="mono">{fmtNum(km.alertaKm ?? 0)} km</strong>
                {km.restante != null && (km.restante > 0
                  ? <> — faltan <strong className="mono">{fmtNum(km.restante)} km</strong></>
                  : <> — <strong style={{ color: 'var(--danger)' }}>¡alcanzado! ({fmtNum(Math.abs(km.restante))} km pasados)</strong></>)}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <EmptyState message="Cargando…" />
      ) : !lista.length ? (
        <EmptyState message={`Sin equipos en «${grupoLabel}». Asigná este grupo a los equipos desde su ficha.`} icon="🔧" />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead><tr>
              <th>Equipo</th><th>Status</th><th>Ubicación</th>
              <th style={{ textAlign: 'right' }}>Horómetro</th>
              <th style={{ textAlign: 'right' }}>Mantt. cada (h)</th>
              <th style={{ textAlign: 'right' }}>HRS restantes</th>
              <th style={{ textAlign: 'center' }}>Solicitudes de servicio</th><th></th>
            </tr></thead>
            <tbody>
              {lista.map((e) => {
                const info = infoEquipo.get(e.id);
                const sols = solMap.get(e.id) ?? [];
                const abiertas = sols.filter((s) => s.abierta).length;
                return (
                  <tr key={e.id} style={{ opacity: e.activo ? 1 : 0.5, background: info?.alerta ? 'rgba(255,165,0,.10)' : undefined }}>
                    <td>
                      <strong>{e.equipo}</strong>
                      {!e.activo && <span className="badge" style={{ marginLeft: '.4rem', color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '.7rem' }}>🚫 Inactivo</span>}
                      {e.serial ? <div className="muted mono" style={{ fontSize: '.72rem' }}>{e.serial}</div> : null}
                    </td>
                    <td><span className="badge" style={{ color: STATUS_COLOR[e.status] ?? undefined }}>{e.status}</span></td>
                    <td>{e.ubicacion ?? '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{info?.horometro != null ? fmtNum(info.horometro) : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{e.mantenimiento_cada_hrs != null ? fmtNum(e.mantenimiento_cada_hrs) : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {info?.restantes == null
                        ? <span className="muted" title={!e.mantenimiento_cada_hrs ? 'Definí «Mantenimiento cada (hrs)» en la ficha' : 'Sin horómetro registrado'}>—</span>
                        : info.alerta
                          ? <span style={{ color: 'var(--warning)', fontWeight: 700 }} title={`Faltan ${fmtNum(info.restantes)} h`}>⚠️ {fmtNum(info.restantes)} h</span>
                          : <span>{fmtNum(info.restantes)} h</span>}
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {sols.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <button className="btn btn-sm btn-ghost" title="Ver las solicitudes de servicio de este equipo" onClick={() => setSolDe(e)}>
                          🧾 {sols.length}
                          {abiertas > 0 && <span className="badge" style={{ marginLeft: '.35rem', color: 'var(--warning)', borderColor: 'var(--warning)' }}>{abiertas} en curso</span>}
                        </button>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-sm btn-ghost" title="Bitácora / horómetro / mantenimientos" onClick={() => setBitacora(e)}>🔧 Bitácora</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {solDe && (
        <SolicitudesServicioModal equipo={solDe} solicitudes={solMap.get(solDe.id) ?? []}
          onClose={() => setSolDe(null)}
          onBitacora={() => { const eq = solDe; setSolDe(null); setBitacora(eq); }} />
      )}
      {bitacora && <BitacoraModal equipo={bitacora} canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setBitacora(null)} />}
      {resumenOpen && (
        <ResumenMantenimientoModal
          grupo={grupoLabel}
          equipos={lista}
          infoEquipo={infoEquipo}
          onClose={() => setResumenOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Lista las solicitudes de servicio (tipo='servicio' de Pedidos) vinculadas a un
 * equipo: de dónde se pidió el servicio → acá se ve. Se gestionan en la pestaña
 * Servicios de Pedidos (aprobar, cotizar, pagar, realizar) y el seguimiento del
 * consumo se lleva en la bitácora del equipo.
 */
function SolicitudesServicioModal({ equipo, solicitudes, onClose, onBitacora }: {
  equipo: MaquinariaEquipo;
  solicitudes: SolicitudServicioEquipo[];
  onClose: () => void;
  onBitacora: () => void;
}) {
  const abiertas = solicitudes.filter((s) => s.abierta).length;
  return (
    <Modal title={`🧾 Solicitudes de servicio · ${equipo.equipo}`} size="lg" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={onBitacora} title="Registrar el seguimiento (consumos, repuestos) en la bitácora del equipo">🔧 Seguimiento en bitácora</button>
      </>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Servicios pedidos para este equipo desde <strong>Pedidos → 🔧 Servicios</strong>. {abiertas > 0
          ? <>Hay <strong>{abiertas}</strong> en curso.</>
          : 'No hay servicios en curso.'} Se piden y cotizan en <a href="#/app/pedidos">la pestaña Servicios</a>; el seguimiento del consumo (litros, cauchos, repuestos…) se lleva en la <strong>bitácora</strong> de este equipo.
      </p>
      {solicitudes.length === 0 ? (
        <EmptyState message="Este equipo no tiene solicitudes de servicio." icon="🧾" />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead><tr>
              <th>Código</th><th>Estado</th><th>Descripción</th><th>Solicita</th><th>Unidad</th><th style={{ textAlign: 'right' }}>Fecha</th>
            </tr></thead>
            <tbody>
              {solicitudes.map((s) => (
                <tr key={`${s.id}-${s.equipo_id}`} style={{ opacity: s.abierta ? 1 : 0.55 }}>
                  <td className="mono">{s.codigo}</td>
                  <td><span className="badge" style={s.abierta ? { color: 'var(--warning)', borderColor: 'var(--warning)' } : undefined}>{estadoServicioLabel(s.estado)}</span></td>
                  <td>{s.descripcion}</td>
                  <td>{s.solicitante_persona ?? '—'}</td>
                  <td>{s.solicitante ?? '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{dateTime(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
