import { useCallback, useEffect, useState } from 'react';
import type { EmpresaRrhh } from '@/shared/lib/types';
import { contarPersonalPorEmpresa, type ConteoPorEmpresa } from './empresas.repository';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { cargarEmpresasRrhh, useEmpresasRrhh } from '@/shared/lib/empresasRrhh';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { EmpresasModal } from './EmpresasModal';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { PersonalTab } from './PersonalTab';
import { AnticiposTab } from './AnticiposTab';
import { NominaTab } from './NominaTab';
import { VacacionesTab } from './VacacionesTab';
import { DescansosTab } from './DescansosTab';
import { AdministrativoTab } from './AdministrativoTab';
import { MinutasTab } from './MinutasTab';

type Vista = 'personal' | 'anticipos' | 'nomina' | 'vacaciones' | 'descansos' | 'administrativo' | 'minutas';

const TABS: { key: Vista; label: string; icon: string }[] = [
  { key: 'personal', label: 'Personal', icon: '👥' },
  { key: 'anticipos', label: 'Anticipos / Préstamos', icon: '💵' },
  { key: 'nomina', label: 'Nómina', icon: '📋' },
  { key: 'vacaciones', label: 'Vacaciones', icon: '🏖' },
  { key: 'descansos', label: 'Descansos', icon: '🏠' },
  { key: 'administrativo', label: 'Administrativo', icon: '🗂' },
  { key: 'minutas', label: 'Minutas', icon: '📝' },
];


/** La última nómina elegida se recuerda: quien trabaja con MTO no quiere
 *  volver a GT en cada recarga. Si el navegador no deja guardar, no pasa nada. */
const CLAVE_EMPRESA = 'gt.rrhh.empresa';
function empresaGuardada(): EmpresaRrhh {
  try {
    return localStorage.getItem(CLAVE_EMPRESA) || 'GT';
  } catch { return 'GT'; }
}

export function RrhhPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('rrhh', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const [vista, setVista] = useState<Vista>('personal');
  // GT y MTO son dos nóminas independientes: cada una con su gente, sus
  // períodos y sus recibos. El switch atraviesa TODO el módulo, así no hay
  // forma de estar mirando el personal de una y cargarle la nómina a la otra.
  const [empresa, setEmpresa] = useState<EmpresaRrhh>(empresaGuardada);
  useEffect(() => {
    try { localStorage.setItem(CLAVE_EMPRESA, empresa); } catch { /* modo privado */ }
  }, [empresa]);

  // Cuánta gente activa tiene cada nómina, para el número entre paréntesis del
  // switch. `null` = todavía no se sabe o la consulta falló: en ese caso las
  // pastillas se dibujan sin número, pero se dibujan. Un conteo de adorno nunca
  // puede tumbar el módulo entero.
  const [conteo, setConteo] = useState<ConteoPorEmpresa | null>(null);
  const cargarConteo = useCallback(() => {
    contarPersonalPorEmpresa()
      .then(setConteo)
      .catch(() => setConteo(null));
  }, []);
  useEffect(() => { cargarConteo(); }, [cargarConteo]);
  // Multiusuario: si alguien da de alta o de baja a una persona, el número del
  // encabezado se actualiza solo, sin recargar la pantalla.
  useRealtime(['personal'], cargarConteo);

  // Empresas (14/10/2026): las que se creen en RRHH. Con más de dos, el switch
  // pasa a ser una lista plegable con buscador.
  const empresas = useEmpresasRrhh();
  useRealtime(['rrhh_empresas'], () => { void cargarEmpresasRrhh(true).catch(() => undefined); });
  const visibles = empresas.filter((e) => e.activa || e.clave === empresa);
  const emp = identidadEmpresa(empresa);
  const [verEmpresas, setVerEmpresas] = useState(false);

  return (
    <div>
      {/* Encabezado: título a la izquierda, switch de nómina a la derecha y la
          línea naranja cruzando abajo (el borde de .rrhh-cabecera-fila). */}
      <header className="rrhh-cabecera">
        <div className="rrhh-cabecera-fila">
          <h1 className="rrhh-titulo">
            <span aria-hidden="true">👥</span>
            {' RRHH · '}
            <span className="rrhh-titulo-nomina">
              Nómina {empresa}
            </span>
          </h1>

          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {visibles.length <= 2 ? (
              /* Dos empresas: botones que conmutan (group + aria-pressed, no pestañas). */
              <div className="rrhh-nominas" role="group" aria-label="Nómina">
                {visibles.map((e) => {
                  const activa = empresa === e.clave;
                  const cuantos = conteo ? (conteo[e.clave] ?? 0) : null;
                  return (
                    <button key={e.clave} type="button"
                      className={`rrhh-nomina-btn${activa ? ' activa' : ''}`}
                      aria-pressed={activa}
                      title={`Personal y nómina de ${e.nombre}`}
                      onClick={() => setEmpresa(e.clave)}>
                      <span aria-hidden="true">{e.icono}</span>
                      <span>Nómina {e.clave}</span>
                      {/* Sin conteo (aún cargando o consulta caída) no se muestra nada. */}
                      {cuantos != null && <span className="rrhh-nomina-cuenta">({cuantos})</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Más de dos: lista plegable con buscador. */
              <div className="rrhh-nominas-lista">
                <SearchSelect id="rrhh-empresa" value={empresa} onChange={(v) => { if (v) setEmpresa(v); }}
                  placeholder="🔍 Buscar empresa…"
                  options={visibles.map((e) => ({ value: e.clave, label: `${e.icono} Nómina ${e.clave} · ${e.nombre}${conteo ? ` (${conteo[e.clave] ?? 0})` : ''}` }))} />
              </div>
            )}
            {canWrite && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVerEmpresas(true)} title="Crear o editar empresas">🏢 Empresas</button>}
          </div>
        </div>

        <p className="muted rrhh-cabecera-nota">
          {empresa === 'GT'
            ? 'Personal, nómina quincenal y administrativo. La nómina se paga desde Tesorería.'
            : `Nómina de ${emp.clave === empresa ? emp.nombre : empresa}: personal propio, independiente de las demás. La paga Tesorería igual que la de GT.`}
        </p>
      </header>
      {verEmpresas && <EmpresasModal conteo={conteo} actor={actor} onClose={() => setVerEmpresas(false)} onElegir={(c) => setEmpresa(c)} />}

      <div className="view-toggle" role="tablist" aria-label="Vista de RRHH" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} className={vista === t.key ? 'active' : ''} onClick={() => setVista(t.key)}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* La `key` con la empresa vuelve a montar la pestaña al cambiar de nómina:
          así ningún estado de la anterior (una selección, un formulario a medias)
          se arrastra a la otra. */}
      {vista === 'personal' && <PersonalTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} />}
      {vista === 'anticipos' && <AnticiposTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} actorName={actorName} />}
      {vista === 'nomina' && <NominaTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} actorName={actorName} />}
      {vista === 'vacaciones' && <VacacionesTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} actorName={actorName} />}
      {vista === 'descansos' && <DescansosTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} actorName={actorName} />}
      {vista === 'administrativo' && <AdministrativoTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} actorName={actorName} />}
      {/* Sin `key`: las minutas son de toda la organización, no dependen de la nómina. */}
      {vista === 'minutas' && <MinutasTab canWrite={canWrite} actor={actor} />}
    </div>
  );
}
