import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ContratosView, type ContratosViewHandle } from './ContratosView';
import { CatalogoAcopioModal } from './ContratosModal';
import { TenorModal } from './TenorModal';
import { KgMesasModal } from './KgMesasModal';

export function ProduccionPage() {
  const { can, appUser } = usePermissions();
  const canWrite = can('produccion', 'escritura');
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const viewRef = useRef<ContratosViewHandle>(null);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [tenorOpen, setTenorOpen] = useState(false);
  const [mesasOpen, setMesasOpen] = useState(false);
  // Permite abrir un contrato concreto al entrar con ?contrato=<id> (p. ej. desde Acopio).
  const [params, setParams] = useSearchParams();
  const contratoParam = params.get('contrato');
  const limpiarParam = useCallback(() => {
    setParams((prev) => { const p = new URLSearchParams(prev); p.delete('contrato'); return p; }, { replace: true });
  }, [setParams]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Producción</h1>
          <p className="muted">Contratos de producción: control de material procesado, recuperación de casiterita y subproductos (hierro).</p>
        </div>
        <div className="actions">
          {canWrite && <button className="btn btn-primary" onClick={() => viewRef.current?.openCreate()}>📜 Crear contrato</button>}
          <button className="btn btn-ghost" onClick={() => setMesasOpen(true)}>⚖ KG Mesas</button>
          <button className="btn btn-ghost" onClick={() => setTenorOpen(true)}>📈 Tenor Promedio Diarios</button>
          <button className="btn btn-ghost" onClick={() => setCatalogoOpen(true)}>🗂 Catálogo</button>
        </div>
      </div>

      <ContratosView ref={viewRef} canWrite={canWrite} actor={actor} actorName={actorName} defaultEmail={actor}
        openContratoId={contratoParam} onOpenConsumed={limpiarParam} />

      {mesasOpen && <KgMesasModal onClose={() => setMesasOpen(false)} />}
      {catalogoOpen && <CatalogoAcopioModal canWrite={canWrite} onClose={() => setCatalogoOpen(false)} />}
      {tenorOpen && <TenorModal defaultEmail={actor} onClose={() => setTenorOpen(false)} />}
    </div>
  );
}
