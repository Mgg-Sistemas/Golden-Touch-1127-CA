/* ============================================================
   Golden Touch · Retenciones · Gestión Centralizada de Empresas (Vista PC)

   Permite a los administradores y usuarios de Retenciones:
   1. Visualizar todas las empresas receptoras configuradas en el módulo.
   2. Sincronizar automáticamente con un clic desde el catálogo de Administración (`admin_empresas`).
   3. Crear nuevas empresas receptoras con ficha completa (identidad + datos fiscales).
   4. Editar RIF, razón social, nombre corto, alícuotas municipales (ISAE) y licencias.
   5. Activar o desactivar empresas receptoras del padrón.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import {
  listEmpresasReceptoras,
  guardarEmpresaReceptora,
  eliminarEmpresaReceptora,
  sincronizarEmpresasDesdeAdmin,
  type EmpresaReceptora,
} from './empresasReceptoras.repository';
import { esEmpresaGt } from './empresaActual';
import { EmpresaEditor } from './EmpresaEditor';

export interface GestionEmpresasModalProps {
  isOpen: boolean;
  onClose: () => void;
  empresaActualId?: string | null;
  onEmpresaSeleccionada?: (id: string) => void;
}

export function GestionEmpresasModal({
  isOpen,
  onClose,
  empresaActualId,
  onEmpresaSeleccionada,
}: GestionEmpresasModalProps) {
  const [empresas, setEmpresas] = useState<EmpresaReceptora[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  // Sub-estados para creación/edición
  const [empresaEditando, setEmpresaEditando] = useState<EmpresaReceptora | null>(null);
  const [creandoNueva, setCreandoNueva] = useState(false);
  const [modoEditor, setModoEditor] = useState<'completo' | 'fiscal'>('completo');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await listEmpresasReceptoras();
      setEmpresas(lista);
    } catch {
      toast('No se pudieron cargar las empresas receptoras.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void cargar();
      setEmpresaEditando(null);
      setCreandoNueva(false);
      setBusqueda('');
    }
  }, [isOpen, cargar]);

  const handleSincronizar = async () => {
    setSincronizando(true);
    try {
      const res = await sincronizarEmpresasDesdeAdmin();
      if (res.creadas > 0 || res.actualizadas > 0) {
        toast(
          `✅ Sincronización exitosa: ${res.creadas} empresa(s) importada(s), ${res.actualizadas} actualizada(s).`,
          'success'
        );
      } else {
        toast(
          `Todas las empresas de Administración (${res.totalAdmin}) ya están sincronizadas.`,
          'info'
        );
      }
      await cargar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al sincronizar con Administración.';
      toast(msg, 'error');
    } finally {
      setSincronizando(false);
    }
  };

  const handleToggleActivo = async (emp: EmpresaReceptora) => {
    try {
      const nuevo = !emp.activo;
      await guardarEmpresaReceptora({
        id: emp.id,
        clave: emp.clave,
        nombre: emp.nombre,
        nombreCorto: emp.nombreCorto,
        rif: emp.rif,
        colorBadge: emp.colorBadge,
        activo: nuevo,
        orden: emp.orden,
      });
      setEmpresas((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, activo: nuevo } : e))
      );
      toast(`Empresa ${emp.nombreCorto || emp.nombre} ${nuevo ? 'activada' : 'desactivada'}.`, 'info');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cambiar el estado de la empresa.';
      toast(msg, 'error');
    }
  };

  const handleEliminar = async (emp: EmpresaReceptora) => {
    if (esEmpresaGt(emp)) {
      toast('Golden Touch es la empresa principal del sistema y no puede eliminarse.', 'warning');
      return;
    }
    if (!window.confirm(`¿Seguro que deseas eliminar a «${emp.nombreCorto || emp.nombre}»? Si tiene facturas asociadas, la base de datos requerirá desactivarla en su lugar.`)) {
      return;
    }

    try {
      await eliminarEmpresaReceptora(emp.id);
      setEmpresas((prev) => prev.filter((e) => e.id !== emp.id));
      toast(`Empresa ${emp.nombreCorto || emp.nombre} eliminada correctamente.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo eliminar la empresa.';
      toast(msg, 'error');
    }
  };

  const empresasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return empresas;
    const q = busqueda.trim().toLowerCase();
    return empresas.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) ||
        (e.nombreCorto && e.nombreCorto.toLowerCase().includes(q)) ||
        e.rif.toLowerCase().includes(q) ||
        (e.municipio && e.municipio.toLowerCase().includes(q))
    );
  }, [empresas, busqueda]);

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      title="🏢 Gestión Multi-Empresa de Retenciones"
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '400px' }}>
        {/* Cabecera y descripción contextual */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.8rem' }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '.86rem', maxWidth: '650px' }}>
              Catálogo de empresas agentes de retención. Puedes preconfigurarlas importando directamente desde el catálogo de{' '}
              <strong style={{ color: 'var(--text-normal)' }}>Administración</strong> o crearlas y editarlas con su ficha fiscal propia.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleSincronizar}
              disabled={sincronizando}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.35rem',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid var(--primary, #f59e0b)',
                color: 'var(--primary, #f59e0b)',
                fontWeight: 600,
              }}
              title="Importar y actualizar automáticamente empresas desde el módulo de Administración"
            >
              <span>{sincronizando ? '⏳ Sincronizando…' : '🔄 Sincronizar desde Administración'}</span>
            </button>

            {!creandoNueva && !empresaEditando && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setCreandoNueva(true);
                  setEmpresaEditando(null);
                  setModoEditor('completo');
                }}
              >
                ➕ Nueva empresa
              </button>
            )}
          </div>
        </div>

        {/* Formulario de Creación / Edición */}
        {(creandoNueva || empresaEditando) && (
          <div
            style={{
              padding: '1.2rem',
              borderRadius: '10px',
              background: 'var(--surface-2, rgba(255, 255, 255, 0.03))',
              border: '1.5px solid var(--primary, #f59e0b)',
              marginBottom: '.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>{creandoNueva ? '✨' : '✏️'}</span>
                <strong style={{ fontSize: '1rem', color: 'var(--text-normal)' }}>
                  {creandoNueva ? 'Crear nueva empresa receptora' : `Editar ${empresaEditando?.nombreCorto || empresaEditando?.nombre}`}
                </strong>
                {empresaEditando && (
                  <div style={{ display: 'flex', gap: '.3rem', marginLeft: '.5rem' }}>
                    <button
                      type="button"
                      className={`btn btn-xs ${modoEditor === 'completo' ? 'btn-primary' : ''}`}
                      onClick={() => setModoEditor('completo')}
                    >
                      Identidad y Fiscal
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${modoEditor === 'fiscal' ? 'btn-primary' : ''}`}
                      onClick={() => setModoEditor('fiscal')}
                    >
                      Solo Fiscal
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  setCreandoNueva(false);
                  setEmpresaEditando(null);
                }}
              >
                ✖ Cerrar editor
              </button>
            </div>

            <EmpresaEditor
              empresa={empresaEditando ?? undefined}
              modo={modoEditor}
              onGuardada={(guardada) => {
                toast(`Empresa «${guardada.nombreCorto || guardada.nombre}» guardada con éxito.`, 'success');
                setCreandoNueva(false);
                setEmpresaEditando(null);
                void cargar();
                if (onEmpresaSeleccionada) {
                  onEmpresaSeleccionada(guardada.id);
                }
              }}
              onClose={() => {
                setCreandoNueva(false);
                setEmpresaEditando(null);
              }}
            />
          </div>
        )}

        {/* Barra de Filtros y Estadísticas */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '.7rem',
            flexWrap: 'wrap',
            padding: '.6rem .8rem',
            background: 'var(--surface-1, rgba(255, 255, 255, 0.02))',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600 }}>
              {empresas.length} {empresas.length === 1 ? 'empresa registrada' : 'empresas registradas'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>•</span>
            <span style={{ fontSize: '.78rem', color: '#22c55e', fontWeight: 600 }}>
              {empresas.filter((e) => e.activo).length} activas
            </span>
            {empresas.some((e) => !e.activo) && (
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                ({empresas.filter((e) => !e.activo).length} desactivadas)
              </span>
            )}
          </div>

          <div style={{ minWidth: '220px', flex: '0 1 300px' }}>
            <input
              type="text"
              className="input sm"
              style={{ width: '100%' }}
              placeholder="🔍 Buscar por nombre, RIF o municipio…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Listado de Empresas */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            Cargando empresas receptoras…
          </div>
        ) : empresasFiltradas.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '2.5rem 1rem',
              background: 'rgba(255, 255, 255, 0.01)',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
            }}
          >
            <p style={{ fontWeight: 600, margin: '0 0 .5rem' }}>
              {busqueda ? 'No se encontraron empresas con ese término de búsqueda' : 'No hay empresas receptoras registradas'}
            </p>
            <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 1rem' }}>
              Puedes importarlas automáticamente desde el módulo de Administración o crear una nueva.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleSincronizar}
              disabled={sincronizando}
            >
              🔄 Sincronizar desde Administración
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {empresasFiltradas.map((emp) => {
              const esGt = esEmpresaGt(emp);
              const esActiva = emp.activo;
              const esActual = emp.id === empresaActualId;

              return (
                <div
                  key={emp.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '.8rem',
                    flexWrap: 'wrap',
                    padding: '.75rem .95rem',
                    borderRadius: '8px',
                    border: esActual
                      ? '1.5px solid var(--primary, #f59e0b)'
                      : '1px solid var(--border)',
                    background: esActual
                      ? 'rgba(245, 158, 11, 0.05)'
                      : 'var(--surface-1, rgba(255, 255, 255, 0.02))',
                    opacity: esActiva ? 1 : 0.65,
                  }}
                >
                  {/* Info Principal */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flex: '1 1 350px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: emp.colorBadge || '#2563eb',
                        flexShrink: 0,
                      }}
                      title={`Color identificador: ${emp.colorBadge}`}
                    />

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '.92rem', color: 'var(--text-normal)' }}>
                          {emp.nombreCorto?.trim() || emp.nombre}
                        </strong>
                        {esActual && (
                          <span
                            style={{
                              fontSize: '.66rem',
                              fontWeight: 700,
                              color: 'var(--primary, #f59e0b)',
                              background: 'rgba(245, 158, 11, 0.15)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            ✓ Activa en sesión
                          </span>
                        )}
                        {!esActiva && (
                          <span
                            style={{
                              fontSize: '.66rem',
                              color: 'var(--text-muted)',
                              background: 'rgba(255, 255, 255, 0.05)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Desactivada
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '.68rem',
                            color: esGt ? 'var(--text-muted)' : 'var(--info, #38bdf8)',
                            background: esGt ? 'rgba(255, 255, 255, 0.03)' : 'rgba(56, 189, 248, 0.1)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {esGt ? '🛒 Compras + 📱 Buzón' : '📱 Solo Buzón Móvil'}
                        </span>
                      </div>

                      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.15rem' }}>
                        <span>{emp.nombre}</span> · <code style={{ fontSize: '.75rem' }}>{emp.rif}</code>
                        {emp.municipio && <span> · Municipio: {emp.municipio}</span>}
                        {emp.alicuotaMunicipal != null && <span> · ISAE: {emp.alicuotaMunicipal}%</span>}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
                    {onEmpresaSeleccionada && !esActual && esActiva && (
                      <button
                        type="button"
                        className="btn btn-xs"
                        onClick={() => {
                          onEmpresaSeleccionada(emp.id);
                          toast(`Empresa ${emp.nombreCorto || emp.nombre} seleccionada.`, 'success');
                        }}
                        title="Seleccionar como empresa activa de retención"
                      >
                        Seleccionar
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => {
                        setEmpresaEditando(emp);
                        setCreandoNueva(false);
                        setModoEditor('completo');
                      }}
                      title="Editar RIF, Razón Social, datos de contacto y ficha fiscal"
                    >
                      ✏️ Editar
                    </button>

                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => {
                        setEmpresaEditando(emp);
                        setCreandoNueva(false);
                        setModoEditor('fiscal');
                      }}
                      title="Configuración de alícuota municipal (ISAE), licencia y comprobantes"
                    >
                      🌐 Ficha fiscal
                    </button>

                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => void handleToggleActivo(emp)}
                      title={esActiva ? 'Desactivar empresa' : 'Activar empresa'}
                    >
                      {esActiva ? 'Desactivar' : 'Activar'}
                    </button>

                    {!esGt && (
                      <button
                        type="button"
                        className="btn btn-xs"
                        style={{ color: '#ef4444' }}
                        onClick={() => void handleEliminar(emp)}
                        title="Eliminar empresa receptora (solo si no tiene facturas)"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
