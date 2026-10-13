/* ============================================================
   Golden Touch · Choferes / Conductores · La pantalla
   (traído de MGG el 13/10/2026; en GT sin pagos ni viáticos)

   Cuatro pestañas sobre los mismos datos, cargados una vez aquí y pasados a
   cada una (así el tablero y las rutas siempre cuentan lo mismo):
     Tablero     → cuántos activos, en ruta, de descanso; alertas de documentos
     Expediente  → licencia, certificado médico y seguro de cada conductor; la flota
     Rutas       → órdenes de ruta con paradas, vehículo y estado
     Descansos   → la MISMA pestaña de RRHH, solo con los choferes y su propio tope

   El conductor es una ficha de RRHH (`personal`): acá no se crea gente, se le
   abre expediente a quien ya está en la nómina.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal } from '@/shared/lib/types';
import { listPersonal } from '@/modules/rrhh/personal.repository';
import { listDescansos, type Descanso } from '@/modules/rrhh/descansos.repository';
import { DescansosTab } from '@/modules/rrhh/DescansosTab';
import {
  TABLAS_CHOFERES, esTablaFaltante, listConductores, listDocumentosChofer, listFlota, listViajes,
  type Conductor, type DocumentoChofer, type VehiculoFlota, type Viaje,
} from './choferes.repository';
import { hoyVE } from './choferes';
import { TableroTab } from './TableroTab';
import { ExpedienteTab } from './ExpedienteTab';
import { ViajesTab } from './ViajesTab';

export type Vista = 'tablero' | 'expediente' | 'viajes' | 'descansos';

const TABS: { key: Vista; label: string; icon: string }[] = [
  { key: 'tablero', label: 'Tablero', icon: '📊' },
  { key: 'expediente', label: 'Expediente y flota', icon: '🪪' },
  { key: 'viajes', label: 'Rutas y viajes', icon: '🗺' },
  { key: 'descansos', label: 'Descansos', icon: '🏠' },
];

/** Clave con la que Descansos guarda el tope y las selecciones de los choferes (ver DescansosTab). */
export const CLAVE_DESCANSOS_CHOFERES = 'choferes';

export interface DatosChoferes {
  conductores: Conductor[];
  personal: Personal[];
  flota: VehiculoFlota[];
  viajes: Viaje[];
  descansos: Descanso[];
  /** Documentos de los conductores (vigentes e históricos). */
  documentos: DocumentoChofer[];
  /** La tabla de documentos todavía no existe en la base. */
  docsSinInstalar: boolean;
  hoy: string;
  loading: boolean;
  recargar: () => Promise<void>;
}

export interface PropsTab {
  datos: DatosChoferes;
  canWrite: boolean;
  actor: string;
  actorName: string | null;
}

export function ChoferesPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('choferes', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const [vista, setVista] = useState<Vista>('tablero');

  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [flota, setFlota] = useState<VehiculoFlota[]>([]);
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [descansos, setDescansos] = useState<Descanso[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoChofer[]>([]);
  const [docsSinInstalar, setDocsSinInstalar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sinInstalar, setSinInstalar] = useState(false);
  const hoy = useMemo(hoyVE, []);

  const recargar = useCallback(async () => {
    try {
      // Las dos nóminas (GT y MTO): un chofer puede estar en cualquiera.
      const ps = await listPersonal(false).catch(() => [] as Personal[]);
      const [cs, fl, vj] = await Promise.all([listConductores(), listFlota(), listViajes()]);
      const ds = await listDescansos(cs.map((c) => c.personal_id)).catch(() => [] as Descanso[]);
      // Los documentos tienen su propio SQL: si falta, el resto del módulo sigue andando.
      const docs = await listDocumentosChofer().catch((e) => { if (esTablaFaltante(e)) { setDocsSinInstalar(true); return [] as DocumentoChofer[]; } throw e; });
      const porId = new Map(ps.map((p) => [p.id, p]));
      setPersonal(ps);
      setConductores(cs.map((c) => ({ ...c, personal: porId.get(c.personal_id) ?? null })));
      setFlota(fl); setViajes(vj); setDescansos(ds);
      setDocumentos(docs); if (docs.length) setDocsSinInstalar(false);
      setSinInstalar(false);
    } catch (e) {
      if (esTablaFaltante(e)) setSinInstalar(true);
      else toast(e instanceof Error ? e.message : 'No se pudo cargar el módulo de choferes', 'error');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  // Silencioso: el cambio de otro usuario no deja la pantalla en «Cargando…».
  useRealtime(TABLAS_CHOFERES, () => { void recargar(); });

  const datos: DatosChoferes = useMemo(() => ({
    conductores, personal, flota, viajes, descansos, documentos, docsSinInstalar, hoy, loading, recargar,
  }), [conductores, personal, flota, viajes, descansos, documentos, docsSinInstalar, hoy, loading, recargar]);

  // Para la pestaña Descansos: solo las fichas con expediente de conductor activo.
  const idsConductores = useMemo(() => new Set(conductores.filter((c) => c.activo).map((c) => c.personal_id)), [conductores]);
  const soloChoferes = useCallback((p: Personal) => idsConductores.has(p.id), [idsConductores]);

  const props: PropsTab = { datos, canWrite, actor, actorName };

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>🚛 Choferes / Conductores</h1>
        <p className="hint muted" style={{ margin: '.25rem 0 0' }}>
          Flota y conductores: expediente con vigencias, órdenes de ruta y descansos. Los conductores son fichas de RRHH.
        </p>
      </div>

      {sinInstalar && (
        <div className="aviso warning" style={{ marginBottom: '1rem' }}>
          <span className="aviso-icono">⚠</span>
          <div>
            <strong>El módulo todavía no está instalado en la base de datos.</strong> Avisa a soporte del sistema.
          </div>
        </div>
      )}

      <div className="view-toggle" role="tablist" aria-label="Vista de Choferes" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} className={vista === t.key ? 'active' : ''} onClick={() => setVista(t.key)}>{t.icon} {t.label}</button>
        ))}
      </div>

      {vista === 'tablero' && <TableroTab {...props} irA={(v) => setVista(v)} />}
      {vista === 'expediente' && <ExpedienteTab {...props} />}
      {vista === 'viajes' && <ViajesTab {...props} />}
      {vista === 'descansos' && (
        <DescansosTab canWrite={canWrite} actor={actor} actorName={actorName} empresa="GT"
          soloPersonal={soloChoferes} claveConfig={CLAVE_DESCANSOS_CHOFERES} etiquetaGente="conductores activos" />
      )}
    </div>
  );
}

/* ───────────── Ayudantes compartidos por las pestañas ───────────── */

export function nombreConductor(c: Conductor | undefined | null): string {
  if (!c) return '—';
  const p = c.personal;
  return p ? `${p.nombre} ${p.apellido ?? ''}`.trim() : '(ficha eliminada)';
}

export function textoVehiculo(v: VehiculoFlota | undefined | null): string {
  if (!v) return '—';
  const partes = [v.marca, v.modelo].filter(Boolean).join(' ');
  return `${partes || 'Vehículo'} · ${v.placa}`;
}

/** Fecha y hora local corta: 12/10/2026 08:30. */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Valor para un <input type="datetime-local"> a partir de un ISO (hora de Venezuela). */
export function aDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

/** Ahora, listo para un <input type="datetime-local">. */
export function ahoraLocal(): string {
  return aDatetimeLocal(new Date().toISOString());
}
