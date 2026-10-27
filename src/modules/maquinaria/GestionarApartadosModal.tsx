import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import {
  listarApartados,
  guardarApartadoCustom,
  eliminarApartadoCustom,
  type ApartadoEquipo,
} from './flota';
import { addCatalogoMaquinaria } from './maquinaria.repository';

interface Props {
  onClose: () => void;
  onChanged?: () => void;
}

const EMOJIS_SUGERIDOS = ['🛠️', '🧰', '⚡', '⚙️', '🔋', '📦', '🏗️', '🪚', '🪓', '🚜', '🚚', '🏍️', '🚤', '🔌', '⛏️', '🦺', '🎯', '🔧', '🔨'];

export function GestionarApartadosModal({ onClose, onChanged }: Props) {
  const [apartados, setApartados] = useState<ApartadoEquipo[]>(() => listarApartados());
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState('📦');
  const [palabrasClave, setPalabrasClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = () => {
    setApartados(listarApartados());
    onChanged?.();
  };

  useEffect(() => {
    const handler = () => recargar();
    window.addEventListener('maquinaria:apartados-changed', handler);
    return () => window.removeEventListener('maquinaria:apartados-changed', handler);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = nombre.trim();
    if (!n) {
      setError('Escribe el nombre del apartado.');
      return;
    }
    setGuardando(true);
    try {
      const kws = palabrasClave
        .split(/[,;\n]+/)
        .map((k) => k.trim())
        .filter(Boolean);

      guardarApartadoCustom({
        label: n,
        icon: icono || '📦',
        keywords: kws.length > 0 ? kws : [n.toLowerCase()],
      });

      // Se guarda también en los catálogos de tipo de maquinaria para que esté disponible en los selectores
      addCatalogoMaquinaria('tipo_maquinaria', n.toUpperCase()).catch(() => {});

      toast(`Apartado «${n}» creado exitosamente`, 'success');
      setNombre('');
      setIcono('📦');
      setPalabrasClave('');
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el apartado.');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = (ap: ApartadoEquipo) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el apartado «${ap.label}»?`)) return;
    try {
      eliminarApartadoCustom(ap.id);
      toast(`Apartado «${ap.label}» eliminado`, 'success');
      recargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const footer = (
    <button type="button" className="btn btn-ghost" onClick={onClose}>
      Cerrar
    </button>
  );

  return (
    <Modal title="⚙️ Gestión de Apartados y Secciones" size="md" onClose={onClose} footer={footer}>
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {/* Lista de apartados actuales */}
        <div>
          <label style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: '.5rem' }}>
            Apartados actuales ({apartados.length})
          </label>
          <div style={{ display: 'grid', gap: '.4rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '.25rem' }}>
            {apartados.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '.55rem .75rem',
                  background: 'var(--surface-2, rgba(255,255,255,0.04))',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
                  <span style={{ fontSize: '1.35rem' }}>{a.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{a.label}</div>
                    <div style={{ fontSize: '.74rem', color: 'var(--text-muted, #64748b)' }}>
                      {a.esCustom ? `Personalizado · ID: ${a.id}` : 'Apartado del sistema'}
                    </div>
                  </div>
                </div>
                <div>
                  {a.esCustom ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleEliminar(a)}
                      title="Eliminar este apartado"
                      style={{ color: 'var(--danger, #ef4444)', padding: '.25rem .5rem' }}
                    >
                      🗑️ Eliminar
                    </button>
                  ) : (
                    <span style={{ fontSize: '.72rem', background: 'rgba(255,255,255,0.06)', padding: '.2rem .5rem', borderRadius: '4px', color: 'var(--text-secondary, #94a3b8)' }}>
                      Fijo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Formulario para añadir nuevo apartado */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '1rem',
            background: 'var(--surface-1, rgba(255,255,255,0.02))',
            border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
            borderRadius: '8px',
            display: 'grid',
            gap: '.85rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '.92rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            ➕ Añadir nuevo apartado
          </div>

          {error && (
            <div style={{ padding: '.5rem .75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--danger, #ef4444)', borderRadius: '6px', fontSize: '.84rem', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: '.8rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
              Nombre del apartado *
            </label>
            <input
              type="text"
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Generadores, Equipos Eléctricos, Implementos…"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '.8rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
              Ícono / Emoji:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
              <input
                type="text"
                className="input"
                value={icono}
                onChange={(e) => setIcono(e.target.value)}
                style={{ width: '60px', textAlign: 'center', fontSize: '1.25rem' }}
                maxLength={4}
              />
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted, #64748b)' }}>
                Selecciona uno rápido o escribe un emoji:
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
              {EMOJIS_SUGERIDOS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setIcono(em)}
                  className="btn btn-sm btn-ghost"
                  style={{
                    padding: '.25rem .45rem',
                    fontSize: '1.15rem',
                    background: icono === em ? 'var(--primary-soft, rgba(59, 130, 246, 0.2))' : undefined,
                    border: icono === em ? '1px solid var(--primary, #3b82f6)' : '1px solid transparent',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '.8rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
              Palabras clave de auto-clasificación (opcional):
            </label>
            <input
              type="text"
              className="input"
              value={palabrasClave}
              onChange={(e) => setPalabrasClave(e.target.value)}
              placeholder="Separadas por comas. Ej: generador, alternador, planta electrica"
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '.74rem', color: 'var(--text-muted, #64748b)', display: 'block', marginTop: '.25rem' }}>
              Los equipos con estos términos en su tipo o grupo se clasificarán automáticamente en este apartado.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.25rem' }}>
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : '➕ Guardar apartado'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
