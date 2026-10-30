import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { crearAlmacen } from './almacenes.repository';
import type { Almacen } from '@/shared/lib/types';
import { iconoDeposito, normalizarSlug } from './depositos';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (nuevo: Almacen) => void;
  existentes: Almacen[];
  actorEmail?: string;
}

export function CrearDepositoModal({ open, onClose, onCreated, existentes, actorEmail }: Props) {
  const [nombre, setNombre] = useState('');
  const [sede, setSede] = useState('Mina');
  const [ubicacion, setUbicacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) {
      setError('El nombre del depósito es obligatorio.');
      return;
    }

    const nNorm = normalizarSlug(n);
    const yaExiste = existentes.some((a) => normalizarSlug(a.nombre) === nNorm);
    if (yaExiste) {
      setError(`Ya existe un depósito o almacén llamado «${n}».`);
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const creado = await crearAlmacen({
        nombre: n,
        sede: sede.trim() || 'Mina',
        ubicacion: ubicacion.trim() || null,
      }, actorEmail);
      toast(`Depósito «${creado.nombre}» creado con éxito.`, 'success');
      onCreated(creado);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el depósito.');
    } finally {
      setGuardando(false);
    }
  }

  const icono = iconoDeposito(nombre || 'deposito');

  return (
    <Modal title="➕ Crear nuevo depósito" size="md" compact onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '.5rem 0' }}>
        <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
          Crea un depósito independiente con su propio catálogo de productos, existencias, traslados y vista para teléfono.
        </p>

        {error && (
          <div className="aviso danger sm">
            <span className="aviso-icono">⚠️</span>
            <div>{error}</div>
          </div>
        )}

        <div className="form-row">
          <label htmlFor="dep-nombre" style={{ fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
            Nombre del depósito *
          </label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden>{icono}</span>
            <input
              id="dep-nombre"
              type="text"
              className="input"
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setError(null); }}
              placeholder="Ej. Depósito Items Dañados, Depósito Herramientas..."
              autoFocus
              required
              style={{ flex: 1 }}
            />
          </div>
          <small className="muted">Se mostrará en los selectores de traslado y vistas de teléfono.</small>
        </div>

        <div className="form-row">
          <label htmlFor="dep-sede" style={{ fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
            Sede / Ubicación general
          </label>
          <select
            id="dep-sede"
            className="select"
            value={sede}
            onChange={(e) => setSede(e.target.value)}
          >
            <option value="Mina">Mina</option>
            <option value="Los Pinos">Los Pinos</option>
            <option value="Matanzas">Matanzas</option>
            <option value="Principal">Principal</option>
          </select>
        </div>

        <div className="form-row">
          <label htmlFor="dep-ubicacion" style={{ fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
            Ubicación física específica (opcional)
          </label>
          <input
            id="dep-ubicacion"
            type="text"
            className="input"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="Ej. Galpón 2, Contenedor 3, Patio de Mina..."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.6rem', marginTop: '.75rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando || !nombre.trim()}>
            {guardando ? 'Creando…' : 'Crear depósito'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
