import { useCallback, useEffect, useState } from 'react';
import type { EmpresaRrhh } from '@/shared/lib/types';
import { EMPRESAS } from './fichaPersonal';
import { contarPersonalPorEmpresa, type ConteoPorEmpresa } from './empresas.repository';
import { useRealtime } from '@/shared/lib/useRealtime';
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

/** Un ícono por nómina, solo para que las dos pastillas del switch se
 *  distingan de reojo (van con aria-hidden: no aportan nada al lector). */
const ICONO_EMPRESA: Record<EmpresaRrhh, string> = { GT: '🏢', MTO: '🔧' };

const AYUDA_EMPRESA: Record<EmpresaRrhh, string> = {
  GT: 'Personal y nómina de Golden Touch',
  MTO: 'Personal y nómina de MTO, separados de los de GT',
};

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
              {empresa === 'MTO' ? 'Nómina MTO' : 'Nómina GT'}
            </span>
          </h1>

          {/* Son dos botones que conmutan, no pestañas: por eso `group` +
              `aria-pressed` y no `tablist`. */}
          <div className="rrhh-nominas" role="group" aria-label="Nómina">
            {EMPRESAS.map((e) => {
              const activa = empresa === e.valor;
              const cuantos = conteo?.[e.valor];
              return (
                <button key={e.valor} type="button"
                  className={`rrhh-nomina-btn${activa ? ' activa' : ''}`}
                  aria-pressed={activa}
                  title={AYUDA_EMPRESA[e.valor]}
                  onClick={() => setEmpresa(e.valor)}>
                  <span aria-hidden="true">{ICONO_EMPRESA[e.valor]}</span>
                  <span>{e.label}</span>
                  {/* Sin conteo (aún cargando o consulta caída) no se muestra
                      nada: mejor sin número que con un cero mentiroso. */}
                  {cuantos != null && (
                    <span className="rrhh-nomina-cuenta">({cuantos})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <p className="muted rrhh-cabecera-nota">
          {empresa === 'MTO'
            ? 'Nómina de MTO: personal propio, independiente del de GT. La paga Tesorería igual que la de GT.'
            : 'Personal, nómina quincenal y administrativo. La nómina se paga desde Tesorería.'}
        </p>
      </header>

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
