import { useRef, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ContratosView, type ContratosViewHandle } from './ContratosView';
import { CatalogoAcopioModal } from './ContratosModal';
import { TenorModal } from './TenorModal';

export function ProduccionPage() {
  const { can, appUser } = usePermissions();
  const canWrite = can('produccion', 'escritura');
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const viewRef = useRef<ContratosViewHandle>(null);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [tenorOpen, setTenorOpen] = useState(false);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Producción</h1>
          <p className="muted">Contratos de producción: control de material procesado, recuperación de casiterita y subproductos (hierro).</p>
        </div>
        <div className="actions">
          {canWrite && <button className="btn btn-primary" onClick={() => viewRef.current?.openCreate()}>📜 Crear contrato</button>}
          <button className="btn btn-ghost" onClick={() => setTenorOpen(true)}>📈 Tenor Promedio Diarios</button>
          <button className="btn btn-ghost" onClick={() => setCatalogoOpen(true)}>🗂 Catálogo</button>
        </div>
      </div>

      <ContratosView ref={viewRef} canWrite={canWrite} actor={actor} actorName={actorName} defaultEmail={actor} />

      {catalogoOpen && <CatalogoAcopioModal canWrite={canWrite} onClose={() => setCatalogoOpen(false)} />}
      {tenorOpen && <TenorModal defaultEmail={actor} onClose={() => setTenorOpen(false)} />}
    </div>
  );
}
