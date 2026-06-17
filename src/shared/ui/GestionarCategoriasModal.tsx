import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';

/** Un catálogo gestionable (una pestaña). */
export interface CatalogoTab {
  /** Etiqueta de la pestaña (ej. «Categorías», «Medidas»). */
  label: string;
  categorias: string[];
  conteoUso: Record<string, number>;
  entidadLabel: string;
  onRenombrar: (oldName: string, newName: string) => Promise<number>;
  onEliminar?: (nombre: string) => Promise<void>;
  onAgregar?: (nombre: string) => Promise<string | null>;
  terminoSingular?: string;
}

interface Props {
  titulo: string;
  /** Varios catálogos en pestañas. Si se omite, se usa el modo de un solo catálogo (props sueltas). */
  tabs?: CatalogoTab[];
  // ── Modo un solo catálogo (compatibilidad con usos actuales) ──
  categorias?: string[];
  conteoUso?: Record<string, number>;
  entidadLabel?: string;
  onRenombrar?: (oldName: string, newName: string) => Promise<number>;
  onEliminar?: (nombre: string) => Promise<void>;
  onAgregar?: (nombre: string) => Promise<string | null>;
  terminoSingular?: string;
  /** Refresca el dataset padre tras cambios. */
  onCambioAplicado: () => Promise<void> | void;
  onClose: () => void;
}

export function GestionarCategoriasModal({
  titulo,
  tabs,
  categorias,
  conteoUso,
  entidadLabel,
  onRenombrar,
  onEliminar,
  onAgregar,
  terminoSingular,
  onCambioAplicado,
  onClose,
}: Props) {
  // Normalizamos a una lista de pestañas (1 si vino en modo simple).
  const tabsResueltas: CatalogoTab[] = tabs ?? [{
    label: '',
    categorias: categorias ?? [],
    conteoUso: conteoUso ?? {},
    entidadLabel: entidadLabel ?? 'registro',
    onRenombrar: onRenombrar ?? (async () => 0),
    onEliminar,
    onAgregar,
    terminoSingular,
  }];

  const [tabIdx, setTabIdx] = useState(0);
  const activa = tabsResueltas[Math.min(tabIdx, tabsResueltas.length - 1)];
  const termino = activa.terminoSingular ?? 'categoría';

  const [editando, setEditando] = useState<string | null>(null);
  const [valorEditado, setValorEditado] = useState('');
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<string | null>(null);
  const [versionLocal, setVersionLocal] = useState(0);
  // Input de alta NO controlado (ref): el DOM conserva lo tecleado aunque el modal
  // re-renderice. Con `value` controlado, un re-render pisaba el campo y cortaba el
  // texto a la primera letra. Leemos el valor del DOM al agregar.
  const nuevoRef = useRef<HTMLInputElement>(null);
  const [nuevo, setNuevo] = useState(''); // solo para habilitar/deshabilitar el botón
  const [agregando, setAgregando] = useState(false);

  // Al cambiar de pestaña, limpiamos el estado de edición/filtro y el campo de alta.
  useEffect(() => {
    setEditando(null); setFiltro(''); setNuevo('');
    if (nuevoRef.current) nuevoRef.current.value = '';
  }, [tabIdx]);

  const ordenadas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return activa.categorias
      .filter((c) => !q || c.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [activa.categorias, filtro, versionLocal]);

  useEffect(() => {
    if (editando) setValorEditado(editando);
  }, [editando]);

  async function aplicarRename() {
    if (!editando) return;
    const nuevoNombre = valorEditado.trim();
    if (!nuevoNombre) { toast('El nombre no puede estar vacío', 'error'); return; }
    if (nuevoNombre === editando) { setEditando(null); return; }
    // Bloqueo de duplicados sin distinguir mayúsculas/minúsculas (contra OTROS valores).
    const choca = activa.categorias.some(
      (c) => c !== editando && c.toLowerCase() === nuevoNombre.toLowerCase(),
    );
    if (choca) {
      toast(`Ya existe "${nuevoNombre}" (sin distinguir mayúsculas). Elegí otro nombre.`, 'error');
      return;
    }
    setGuardando(true);
    try {
      const n = await activa.onRenombrar(editando, nuevoNombre);
      notify(
        `"${editando}" renombrado a "${nuevoNombre}" · ${n} ${activa.entidadLabel}(s) actualizado(s)`,
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

  async function aplicarAgregar() {
    if (!activa.onAgregar) { toast('No se puede agregar en esta pestaña', 'error'); return; }
    // Fuente de verdad: el DOM (input no controlado), no el estado React.
    const clean = (nuevoRef.current?.value ?? nuevo).trim();
    if (!clean) { toast(`Escribí el nombre de la ${termino}`, 'error'); return; }
    // Sin duplicados por mayúsculas/minúsculas.
    if ((activa.categorias ?? []).some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast(`La ${termino} "${clean}" ya existe`, 'warning');
      return;
    }
    setAgregando(true);
    // 1) Persistir el alta. Si ESTO falla, mostramos el error real (y lo logueamos).
    try {
      await activa.onAgregar(clean);
    } catch (e) {
      console.error('[GestionarCategoriasModal] No se pudo agregar:', e);
      toast(e instanceof Error ? `No se pudo agregar: ${e.message}` : 'No se pudo agregar', 'error');
      setAgregando(false);
      return;
    }
    // 2) Ya quedó agregada: feedback + refresco. Un fallo del refresco NO debe
    //    decir "no se pudo agregar" (ya se agregó); solo se loguea.
    notify(`${termino[0].toUpperCase()}${termino.slice(1)} "${clean}" agregada`, 'success', { link: '#' });
    if (nuevoRef.current) nuevoRef.current.value = '';
    setNuevo('');
    setVersionLocal((v) => v + 1);
    try {
      await onCambioAplicado();
    } catch (e) {
      console.error('[GestionarCategoriasModal] error al refrescar tras agregar:', e);
    } finally {
      setAgregando(false);
    }
  }

  async function aplicarEliminar() {
    if (!aEliminar || !activa.onEliminar) return;
    setGuardando(true);
    try {
      await activa.onEliminar(aEliminar);
      notify(`"${aEliminar}" eliminada`, 'success', { link: '#' });
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
        <button
          className="btn btn-primary"
          onClick={onClose}
          style={{ textTransform: 'uppercase', textAlign: 'center', justifyContent: 'center', width: '100%' }}
        >
          Cerrar
        </button>
      }
    >
      {tabsResueltas.length > 1 && (
        <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
          {tabsResueltas.map((t, i) => (
            <button
              key={t.label || i}
              className={`btn btn-sm ${i === tabIdx ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTabIdx(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Agregá nuevas o corregí errores de tipeo. El renombrado se aplica en cascada: todos los {activa.entidadLabel}s
        que usaban el nombre viejo quedan con el nuevo automáticamente. No se permiten duplicados (ni por mayúsculas/minúsculas).
      </p>

      {activa.onAgregar && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
          <input
            ref={nuevoRef}
            className="input"
            placeholder={`Nueva ${termino}…`}
            defaultValue=""
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void aplicarAgregar(); }}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" disabled={agregando} onClick={() => void aplicarAgregar()}>
            {agregando ? 'Agregando…' : '+ Agregar'}
          </button>
        </div>
      )}

      <input
        className="search"
        placeholder={`Buscar ${termino}s…`}
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: '.5rem' }}
      />

      <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.88rem' }}>
          <thead>
            <tr>
              <th>{termino[0].toUpperCase()}{termino.slice(1)}</th>
              <th style={{ width: 130, textAlign: 'right' }}>En uso</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 && (
              <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin {termino}s.</td></tr>
            )}
            {ordenadas.map((c) => {
              const usos = activa.conteoUso[c] ?? 0;
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
                    {usos > 0 ? `${usos} ${activa.entidadLabel}${usos === 1 ? '' : 's'}` : <span className="muted">—</span>}
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
                        {activa.onEliminar && usos === 0 && (
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
          title={`Eliminar ${termino}`}
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
