import { useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import type { Almacen } from '@/shared/lib/types';
import type { AlmacenInput } from './almacenes.repository';

interface AlmacenFormProps {
  almacen?: Almacen | null; // null/undefined => crear
  onClose: () => void;
  onSubmit: (data: AlmacenInput) => Promise<void>;
}

export function AlmacenForm({ almacen, onClose, onSubmit }: AlmacenFormProps) {
  const isEdit = !!almacen;
  const [nombre, setNombre] = useState(almacen?.nombre ?? '');
  const [ubicacion, setUbicacion] = useState(almacen?.ubicacion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError('El nombre del almacén es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ nombre: nombre.trim(), ubicacion: ubicacion.trim() || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el almacén.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button type="submit" form="almacen-form" className="btn btn-primary" disabled={saving}>
        {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear almacén'}
      </button>
    </>
  );

  return (
    <Modal title={isEdit ? 'Editar almacén' : 'Nuevo almacén'} onClose={onClose} footer={footer}>
      <form id="almacen-form" onSubmit={handleSubmit}>
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}
        <div className="form-row">
          <label>Nombre del almacén</label>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Almacén 1, Galpón A…"
            required
            autoFocus
          />
        </div>
        <div className="form-row">
          <label>Ubicación</label>
          <input
            className="input"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="Ej: Galpón A · Planta 2 · Sede principal…"
          />
        </div>
      </form>
    </Modal>
  );
}
