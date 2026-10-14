/* ============================================================
   Golden Touch · Libro fiscal · La página

   El libro fiscal nuevo. Mientras se comprueba en pantalla vive en una ruta
   aparte, solo para el administrador; la pantalla de Retenciones de siempre
   sigue igual hasta el corte.

   Dos vistas: el libro y las OC con factura (desde donde se registra la
   retención con los datos de la OC).

   Escribe quien tenga Retenciones con escritura; los parámetros fiscales,
   solo el administrador (la base lo exige).
   ============================================================ */
import { useState } from 'react';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { LibroFiscalView } from './LibroFiscal';
import { BandejaOc } from './BandejaOc';

type Vista = 'libro' | 'oc';

export function LibroFiscalPage() {
  const { user } = useSession();
  const { can, appUser, isAdmin } = usePermissions();
  const [vista, setVista] = useState<Vista>('libro');
  const [pendientes, setPendientes] = useState<number | null>(null);

  const canWrite = can('retenciones', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>🧾 Libro fiscal</h1>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>
            IVA, ISLR, municipal, estadal e IGTF: lo que le retienen a la empresa y lo que ella retiene.
          </p>
        </div>
        <div className="view-toggle" role="tablist" aria-label="Vista del libro fiscal">
          <button className={vista === 'libro' ? 'active' : ''} onClick={() => setVista('libro')}>📒 Libro fiscal</button>
          <button className={vista === 'oc' ? 'active' : ''} onClick={() => setVista('oc')}>
            OC con factura{pendientes ? ` (${pendientes})` : ''}
          </button>
        </div>
      </div>
      {vista === 'libro' ? (
        <LibroFiscalView canWrite={canWrite} esAdmin={isAdmin} actor={actor} actorName={actorName} />
      ) : (
        <BandejaOc canWrite={canWrite} actor={actor} actorName={actorName} onCantidad={setPendientes} />
      )}
    </div>
  );
}
