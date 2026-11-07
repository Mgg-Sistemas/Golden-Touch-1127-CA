/* ============================================================
   Golden Touch · Administración — «Gastos fijos por servicio»
   Multi-empresa (lista propia del módulo): la cabecera trae el selector de
   EMPRESA (activas + «Todas»), recordado por navegador, y «⚙ Gestionar
   empresas». Toda la vista se filtra por la empresa elegida. Tres pestañas:
   Gastos fijos (viva) · Movimientos/Histórico · Reporte (Fase 2/3).
   Estilo del sistema (view-toggle, tarjetas, tokens). Los datos entran por
   un repo inyectado: Supabase en la app; en memoria en la demo (DEV).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { crearRepoSupabase, type AdminRepo, type Empresa } from './admin.repository';
import { crearPreferenciasAdmin, TODAS, type PreferenciasAdmin, type TabAdmin } from './administracionPreferencias';
import { EmpresasModal } from './EmpresasModal';
import { GastosFijosTab } from './GastosFijosTab';
import { MovimientosTab } from './MovimientosTab';
import { HonorariosTab } from './HonorariosTab';
import { AgendaTab } from './AgendaTab';
import { ResponsabilidadTab } from './ResponsabilidadTab';
import { ReporteTab } from './ReporteTab';
import { DocumentosTab } from './DocumentosTab';
import { ConfiguracionTab } from './ConfiguracionTab';
import { DocumentosEmpresaModal } from './DocumentosEmpresaModal';
import './administracion.css';

const PESTANAS: { id: TabAdmin; label: string }[] = [
  { id: 'gastos', label: '📌 Gastos fijos' },
  { id: 'movimientos', label: '📒 Movimientos / Histórico' },
  { id: 'honorarios', label: '💼 Honorarios' },
  { id: 'documentos', label: '📁 Documentos y Permisos' },
  { id: 'agenda', label: '🗓 Agenda' },
  { id: 'responsabilidad', label: '👥 Responsabilidad' },
  { id: 'reporte', label: '📊 Reporte' },
  { id: 'config', label: '⚙ Configuración' },
];

export function AdministracionPage({ repo: repoDado, prefs: prefsDadas, aviso, puedeEscribir = true, puedeFull = true }: {
  repo?: AdminRepo;
  prefs?: PreferenciasAdmin;
  /** Franja arriba de todo (la demo avisa que es de prueba). */
  aviso?: ReactNode;
  /** Permiso de escritura del módulo (registrar/generar/importar/editar). La demo lo deja en true. */
  puedeEscribir?: boolean;
  /** Full control: además gestiona la lista de empresas (admin_empresas). */
  puedeFull?: boolean;
} = {}) {
  const repo = useMemo(() => repoDado ?? crearRepoSupabase(), [repoDado]);
  const prefs = useMemo(() => prefsDadas ?? crearPreferenciasAdmin(), [prefsDadas]);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [empresaSel, setEmpresaSel] = useState<string>(() => prefs.leerEmpresa());
  const [tab, setTab] = useState<TabAdmin>(() => prefs.leerTab());
  const [gestionar, setGestionar] = useState(false);
  const [documentos, setDocumentos] = useState(false);

  const cargarEmpresas = useCallback(async () => {
    setError(null);
    try { setEmpresas(await repo.listEmpresas()); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron leer las empresas.'); }
  }, [repo]);

  useEffect(() => { void cargarEmpresas(); }, [cargarEmpresas]);

  // Si la empresa elegida ya no está activa (la desactivaron/borraron), vuelve a «Todas».
  useEffect(() => {
    if (empresaSel !== TODAS && empresas.length && !empresas.some((e) => e.clave === empresaSel && e.activa)) {
      setEmpresaSel(TODAS);
      prefs.guardarEmpresa(TODAS);
    }
  }, [empresas, empresaSel, prefs]);

  const activas = useMemo(() => empresas.filter((e) => e.activa), [empresas]);
  const empresaClave = empresaSel === TODAS ? null : empresaSel;
  const empresaActual = useMemo(() => empresas.find((e) => e.clave === empresaClave) ?? null, [empresas, empresaClave]);

  const elegirEmpresa = (v: string) => { setEmpresaSel(v); prefs.guardarEmpresa(v); };
  const elegirTab = (t: TabAdmin) => { setTab(t); prefs.guardarTab(t); };

  return (
    <div>
      {aviso}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>💼 Administración</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Gastos fijos por servicio: plantillas, histórico y reporte.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <span className="muted hint">Empresa</span>
            <select className="input" value={empresaSel} onChange={(e) => elegirEmpresa(e.target.value)} aria-label="Empresa" style={{ minWidth: 190 }}>
              <option value={TODAS}>Todas las empresas</option>
              {activas.map((e) => <option key={e.id} value={e.clave}>{e.nombre}</option>)}
            </select>
          </label>
          {empresaActual && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDocumentos(true)} title={`Papeles legales de ${empresaActual.nombre}`}>📎 Documentos</button>}
          {puedeFull && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGestionar(true)}>⚙ Gestionar empresas</button>}
          <div className="view-toggle" role="tablist" aria-label="Vista de administración">
            {PESTANAS.map((p) => (
              <button key={p.id} className={tab === p.id ? 'active' : ''} onClick={() => elegirTab(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="adm-aviso">
          No se pudieron leer las empresas{/sesi|jwt|auth|401|permission|relation|does not exist/i.test(error) ? ': inicia sesión o la base aún no tiene las tablas del módulo.' : `: ${error}`}
        </div>
      )}

      {tab === 'gastos' && <GastosFijosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
      {tab === 'movimientos' && <MovimientosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
      {tab === 'honorarios' && <HonorariosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
      {tab === 'documentos' && <DocumentosTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
      {tab === 'agenda' && <AgendaTab repo={repo} empresaClave={empresaClave} empresas={empresas} />}
      {tab === 'responsabilidad' && <ResponsabilidadTab repo={repo} empresaClave={empresaClave} empresas={empresas} puedeEscribir={puedeEscribir} />}
      {tab === 'reporte' && <ReporteTab repo={repo} empresaClave={empresaClave} empresas={empresas} />}
      {tab === 'config' && <ConfiguracionTab repo={repo} empresas={empresas} puedeFull={puedeFull} puedeEscribir={puedeEscribir} onGestionarEmpresas={() => setGestionar(true)} />}

      {gestionar && puedeFull && <EmpresasModal repo={repo} onClose={() => setGestionar(false)} onChanged={() => void cargarEmpresas()} />}
      {documentos && empresaActual && <DocumentosEmpresaModal repo={repo} empresa={empresaActual} puedeEscribir={puedeEscribir} onClose={() => setDocumentos(false)} />}
    </div>
  );
}

/** La ruta de la app real: toma los permisos del rol y los pasa a la página.
 *  (La demo DEV usa `AdministracionPage` directo, fuera del PermissionsProvider.) */
export function AdministracionPageApp() {
  const { can } = usePermissions();
  return <AdministracionPage puedeEscribir={can('administracion', 'escritura')} puedeFull={can('administracion', 'full')} />;
}
