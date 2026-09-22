import { useEffect, useState } from 'react';
import type { EmpresaRrhh } from '@/shared/lib/types';
import { EMPRESAS } from './fichaPersonal';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { PersonalTab } from './PersonalTab';
import { AnticiposTab } from './AnticiposTab';
import { NominaTab } from './NominaTab';
import { VacacionesTab } from './VacacionesTab';
import { AdministrativoTab } from './AdministrativoTab';

type Vista = 'personal' | 'anticipos' | 'nomina' | 'vacaciones' | 'administrativo';

const TABS: { key: Vista; label: string; icon: string }[] = [
  { key: 'personal', label: 'Personal', icon: '👥' },
  { key: 'anticipos', label: 'Anticipos / Préstamos', icon: '💵' },
  { key: 'nomina', label: 'Nómina', icon: '📋' },
  { key: 'vacaciones', label: 'Vacaciones', icon: '🏖' },
  { key: 'administrativo', label: 'Administrativo', icon: '🗂' },
];

/** La última nómina elegida se recuerda: quien trabaja con MTO no quiere
 *  volver a GT en cada recarga. Si el navegador no deja guardar, no pasa nada. */
const CLAVE_EMPRESA = 'gt.rrhh.empresa';
function empresaGuardada(): EmpresaRrhh {
  try {
    return localStorage.getItem(CLAVE_EMPRESA) === 'MTO' ? 'MTO' : 'GT';
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>👥 RRHH / {empresa === 'MTO' ? 'Nómina MTO' : 'Nómina GT'}</h1>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>
            {empresa === 'MTO'
              ? 'Nómina de MTO: personal propio, independiente del de GT. La paga Tesorería igual que la de GT.'
              : 'Personal, nómina quincenal y administrativo. La nómina se paga desde Tesorería.'}
          </p>
        </div>

        <div className="view-toggle" role="tablist" aria-label="Nómina">
          {EMPRESAS.map((e) => (
            <button key={e.valor} role="tab" aria-selected={empresa === e.valor}
              className={empresa === e.valor ? 'active' : ''}
              title={e.valor === 'MTO'
                ? 'Personal y nómina de MTO, separados de los de GT'
                : 'Personal y nómina de Golden Touch'}
              onClick={() => setEmpresa(e.valor)}>{e.label}</button>
          ))}
        </div>
      </div>

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
      {vista === 'administrativo' && <AdministrativoTab key={empresa} empresa={empresa} canWrite={canWrite} actor={actor} actorName={actorName} />}
    </div>
  );
}
