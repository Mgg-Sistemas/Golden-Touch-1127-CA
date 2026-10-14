/* ============================================================
   Golden Touch · Libro fiscal · La página

   El libro fiscal nuevo. Mientras se comprueba en pantalla vive en una ruta
   aparte, solo para el administrador; la pantalla de Retenciones de siempre
   sigue igual hasta el corte.

   Escribe quien tenga Retenciones con escritura; los parámetros fiscales,
   solo el administrador (la base lo exige).
   ============================================================ */
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { LibroFiscalView } from './LibroFiscal';

export function LibroFiscalPage() {
  const { user } = useSession();
  const { can, appUser, isAdmin } = usePermissions();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>🧾 Libro fiscal</h1>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>
            IVA, ISLR, municipal, estadal e IGTF: lo que le retienen a la empresa y lo que ella retiene.
          </p>
        </div>
      </div>
      <LibroFiscalView
        canWrite={can('retenciones', 'escritura')}
        esAdmin={isAdmin}
        actor={user?.email ?? 'sistema'}
        actorName={appUser?.nombre ?? null}
      />
    </div>
  );
}
