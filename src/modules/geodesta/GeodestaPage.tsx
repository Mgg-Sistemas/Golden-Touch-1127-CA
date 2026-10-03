import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useSession } from '@/modules/auth/authStore';
import { useRealtime } from '@/shared/lib/useRealtime';
import { date } from '@/shared/lib/format';
import type { Apartado, InformeGeodesta } from '@/shared/lib/types';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { listInformes } from './informes.repository';
import { FILTROS_VACIOS, filtrarInformes, type FiltrosInforme } from './informeFiltros';
import { InformeDetalleModal } from './InformeDetalleModal';
import { InformeEditorModal } from './InformeEditorModal';

/** ¿Algún apartado referencia al menos una imagen (tira de texto o celda de imagen)? */
function llevaImagenes(apartados: Apartado[]): boolean {
  return apartados.some((a) => {
    if (a.tipo === 'texto') return a.imagenes.length > 0;
    const colsImg = a.columnas.filter((c) => c.tipo === 'imagen');
    return a.filas.some((f) => colsImg.some((c) => !!f.celdas[c.id]));
  });
}

export function GeodestaPage() {
  const { can } = usePermissions();
  const { user } = useSession();
  const canWrite = can('geodesta', 'escritura');
  const actor = user?.email ?? 'sistema';

  const [informes, setInformes] = useState<InformeGeodesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosInforme>(FILTROS_VACIOS);
  const [detalle, setDetalle] = useState<InformeGeodesta | null>(null);
  // `informe: null` con `abierto` = alta.
  const [editor, setEditor] = useState<{ abierto: boolean; informe: InformeGeodesta | null }>({ abierto: false, informe: null });

  const recargar = useCallback(async () => {
    try {
      setInformes(await listInformes());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudieron cargar los informes', 'error');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['geodesta_informes', 'geodesta_imagenes'], () => { void recargar(); });

  const lista = useMemo(() => filtrarInformes(informes, filtros), [informes, filtros]);
  const hayFiltros = !!(filtros.desde || filtros.hasta || filtros.estado || filtros.palabra.trim());
  const set = (p: Partial<FiltrosInforme>) => setFiltros((f) => ({ ...f, ...p }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🧭 Geodesta · Informes</h1>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setEditor({ abierto: true, informe: null })}>
              + Nuevo informe
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '.75rem', padding: '.6rem .85rem' }}>
        <label style={{ display: 'grid', gap: '.2rem', fontSize: '.8rem' }}>
          Desde
          <input type="date" className="input" value={filtros.desde} onChange={(e) => set({ desde: e.target.value })} />
        </label>
        <label style={{ display: 'grid', gap: '.2rem', fontSize: '.8rem' }}>
          Hasta
          <input type="date" className="input" value={filtros.hasta} onChange={(e) => set({ hasta: e.target.value })} />
        </label>
        <label style={{ display: 'grid', gap: '.2rem', fontSize: '.8rem' }}>
          Estado
          <select className="input" value={filtros.estado} onChange={(e) => set({ estado: e.target.value as FiltrosInforme['estado'] })}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: '.2rem', fontSize: '.8rem', flex: '1 1 200px' }}>
          Buscar
          <input className="input" placeholder="Palabra en el contenido del informe" value={filtros.palabra} onChange={(e) => set({ palabra: e.target.value })} />
        </label>
        {hayFiltros && <button className="btn btn-ghost" onClick={() => setFiltros(FILTROS_VACIOS)}>Limpiar</button>}
      </div>

      {loading ? (
        <div className="muted">Cargando…</div>
      ) : lista.length === 0 ? (
        <EmptyState message={informes.length === 0 ? 'Todavía no hay informes.' : 'Ningún informe coincide con los filtros.'} />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead>
              <tr>
                <th>Código</th><th>Fecha</th><th>Para</th><th>Apartados</th><th>Estado</th><th aria-label="Imágenes" />
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} onClick={() => setDetalle(i)} style={{ cursor: 'pointer' }}>
                  <td><strong>{i.codigo}</strong></td>
                  <td>{date(i.fecha)}</td>
                  <td>{i.para_nombre || '—'}</td>
                  <td>{i.apartados.length}</td>
                  <td><span className="badge" style={{ color: i.estado === 'finalizado' ? 'var(--success)' : 'var(--warning)' }}>
                    {i.estado === 'finalizado' ? 'Finalizado' : 'Borrador'}
                  </span></td>
                  <td title="Lleva imágenes">{llevaImagenes(i.apartados) ? '🖼' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <InformeDetalleModal
          informe={detalle}
          canWrite={canWrite}
          actor={actor}
          onClose={() => setDetalle(null)}
          onEditar={() => { setEditor({ abierto: true, informe: detalle }); setDetalle(null); }}
          onBorrado={() => { setDetalle(null); void recargar(); }}
        />
      )}

      {editor.abierto && (
        <InformeEditorModal
          informe={editor.informe}
          actor={actor}
          onClose={() => setEditor({ abierto: false, informe: null })}
          onGuardado={() => {
            void recargar();
            // Alta: el editor sigue abierto (pasó solo a modo edición para subir
            // imágenes) y NO se le cambia el `informe`: remontaría el formulario.
            if (editor.informe) setEditor({ abierto: false, informe: null });
          }}
        />
      )}
    </div>
  );
}
