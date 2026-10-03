import { useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useSession } from '@/modules/auth/authStore';
import type { InformeGeodesta } from '@/shared/lib/types';
import { TableroGeodesta } from './TableroGeodesta';
import { CalendarioGeodesta } from './CalendarioGeodesta';
import { HistoricoTab } from './HistoricoTab';
import { DiaPanel } from './DiaPanel';
import { InformeDetalleModal } from './InformeDetalleModal';

type Vista = 'tablero' | 'calendario' | 'historico';

const TABS: { key: Vista; label: string; icon: string }[] = [
  { key: 'tablero', label: 'Tablero', icon: '📊' },
  { key: 'calendario', label: 'Calendario', icon: '📅' },
  { key: 'historico', label: 'Histórico', icon: '🗂' },
];

export function GeodestaPage() {
  const { can } = usePermissions();
  const { user } = useSession();
  const canWrite = can('geodesta', 'escritura');
  const actor = user?.email ?? 'sistema';

  const [vista, setVista] = useState<Vista>('tablero');
  // El panel del día vive acá y no en una pestaña: se abre desde el tablero o el
  // calendario, existe una sola vez y sobrevive al cambio de pestaña (se cierra con ✕).
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [informeAbierto, setInformeAbierto] = useState<InformeGeodesta | null>(null);
  // El editor de informes vive en el histórico: el tablero lo pide con un contador
  // (y no un booleano) para que pedirlo dos veces seguidas funcione.
  const [pedidoNuevoInforme, setPedidoNuevoInforme] = useState(0);
  const [pedidoEditarInforme, setPedidoEditarInforme] = useState<{ n: number; informe: InformeGeodesta } | null>(null);
  // Tras borrar un informe se vuelve a montar el panel para que se vuelva a leer el día.
  const [refrescoDia, setRefrescoDia] = useState(0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🧭 Geodesta</h1>
        </div>
      </div>

      <div className="view-toggle" role="tablist" aria-label="Vista de Geodesta" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} className={vista === t.key ? 'active' : ''} onClick={() => setVista(t.key)}>{t.icon} {t.label}</button>
        ))}
      </div>

      {diaAbierto && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <DiaPanel
            key={refrescoDia}
            fecha={diaAbierto}
            canWrite={canWrite}
            actor={actor}
            onCerrar={() => setDiaAbierto(null)}
            onCambiarDia={setDiaAbierto}
            onVerInforme={setInformeAbierto}
          />
        </div>
      )}

      {vista === 'tablero' && (
        <TableroGeodesta
          canWrite={canWrite}
          actor={actor}
          onVerDia={setDiaAbierto}
          onIrACalendario={() => setVista('calendario')}
          onIrAHistorico={() => setVista('historico')}
          onNuevoInforme={() => { setPedidoNuevoInforme((n) => n + 1); setVista('historico'); }}
        />
      )}
      {vista === 'calendario' && <CalendarioGeodesta canWrite={canWrite} actor={actor} onVerDia={setDiaAbierto} />}
      {/* Siempre montado (oculto fuera de su pestaña): así ve los pedidos del tablero y del panel
          del día aunque lleguen justo antes de cambiar de pestaña; montado de cero los tomaría
          por su valor inicial y los ignoraría. */}
      <div hidden={vista !== 'historico'}><HistoricoTab visible={vista === 'historico'} canWrite={canWrite} actor={actor} pedirNuevo={pedidoNuevoInforme} pedirEditar={pedidoEditarInforme} /></div>

      {informeAbierto && (
        <InformeDetalleModal
          informe={informeAbierto}
          canWrite={canWrite}
          actor={actor}
          onClose={() => setInformeAbierto(null)}
          onEditar={() => {
            setPedidoEditarInforme((p) => ({ n: (p?.n ?? 0) + 1, informe: informeAbierto }));
            setInformeAbierto(null);
            setVista('historico');
          }}
          onBorrado={() => { setInformeAbierto(null); setRefrescoDia((n) => n + 1); }}
        />
      )}
    </div>
  );
}
