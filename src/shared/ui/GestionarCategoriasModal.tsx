import { useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';

interface Props {
  titulo: string;
  /** Categorías actuales (incluye las en uso y las del catálogo). */
  categorias: string[];
  /** Conteo de "registros que usan" por categoría (para mostrar). */
  conteoUso: Record<string, number>;
  /** Etiqueta singular de los registros usuarios — "producto", "proveedor", etc. */
  entidadLabel: string;
  /** Renombrado en BD + cascada en tablas relacionadas. Devuelve cantidad afectada. */
  onRenombrar: (oldName: string, newName: string) => Promise<number>;
  /** Eliminar la categoría (sólo si no está en uso). */
  onEliminar?: (nombre: string) => Promise<void>;
  /** Refresca el dataset padre tras cambios. */
  onCambioAplicado: () => Promise<void> | void;
  onClose: () => void;
}

export function GestionarCategoriasModal({
  titulo,
  categorias,
  conteoUso,
  entidadLabel,
  onRenombrar,
  onEliminar,
  onCambioAplicado,
  onClose,
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEditado, setValorEditado] = useState('');
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<string | null>(null);
  const [versionLocal, setVersionLocal] = useState(0);

  const ordenadas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return categorias
      .filter((c) => !q || c.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [categorias, filtro, versionLocal]);

  useEffect(() => {
    if (editando) setValorEditado(editando);
  }, [editando]);

  async function aplicarRename() {
    if (!editando) return;
    const nuevo = valorEditado.trim();
    if (!nuevo) {
      toast('El nombre no puede estar vacío', 'error');
      return;
    }
    if (nuevo === editando) {
      setEditando(null);
      return;
    }
    if (categorias.includes(nuevo)) {
      toast(`Ya existe una categoría llamada "${nuevo}". Las uniones por nombre podrían fusionarse.`, 'warning');
    }
    setGuardando(true);
    try {
      const n = await onRenombrar(editando, nuevo);
      notify(
        `Categoría "${editando}" renombrada a "${nuevo}" · ${n} ${entidadLabel}(s) actualizado(s)`,
        'success',
        { link: '#' },
      );
      setEditando(null);
      setVersionLocal((v) => v + 1);
      await onCambioAplicado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo renombrar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function aplicarEliminar() {
    if (!aEliminar || !onEliminar) return;
    setGuardando(true);
    try {
      await onEliminar(aEliminar);
      notify(`Categoría "${aEliminar}" eliminada`, 'success', { link: '#' });
      setAEliminar(null);
      await onCambioAplicado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      title={titulo}
      size="lg"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Corregí errores de tipeo. El cambio se aplica en cascada: todos los {entidadLabel}s
        que usaban el nombre viejo quedan con el nuevo automáticamente.
      </p>

      <input
        className="search"
        placeholder="Filtrar categorías…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: '.5rem' }}
      />

      <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.88rem' }}>
          <thead>
            <tr>
              <th>Categoría</th>
              <th style={{ width: 130, textAlign: 'right' }}>En uso</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 && (
              <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin categorías.</td></tr>
            )}
            {ordenadas.map((c) => {
              const usos = conteoUso[c] ?? 0;
              const enEdicion = editando === c;
              return (
                <tr key={c}>
                  <td>
                    {enEdicion ? (
                      <input
                        className="input"
                        value={valorEditado}
                        onChange={(e) => setValorEditado(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void aplicarRename();
                          if (e.key === 'Escape') setEditando(null);
                        }}
                      />
                    ) : (
                      <strong>{c}</strong>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {usos > 0 ? `${usos} ${entidadLabel}${usos === 1 ? '' : 's'}` : <span className="muted">—</span>}
                  </td>
                  <td className="actions">
                    {enEdicion ? (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={guardando} onClick={() => void aplicarRename()}>
                          {guardando ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button className="btn btn-sm btn-ghost" disabled={guardando} onClick={() => setEditando(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditando(c)}>
                          ✎ Editar
                        </button>
                        {onEliminar && usos === 0 && (
                          <button className="btn btn-sm btn-danger" onClick={() => setAEliminar(c)}>
                            🗑
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {aEliminar && (
        <ConfirmDialog
          title="Eliminar categoría"
          message={`Se eliminará "${aEliminar}" del catálogo. Esto no afecta registros existentes (no hay ninguno asignado). ¿Continuar?`}
          confirmText="Eliminar"
          danger
          onCancel={() => setAEliminar(null)}
          onConfirm={aplicarEliminar}
        />
      )}
    </Modal>
  );
}
