import { useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import type { DetalleServicioItem } from '@/shared/lib/types';
import { DetalleServicioEditor, limpiarDetalleServicio } from './DetalleServicioEditor';

/**
 * Bloque para VER y EDITAR el detalle del servicio (piezas + descripción) de un servicio
 * ya creado, desde su detalle. Disponible en cualquier estado (es descriptivo). Los
 * servicios ya creados que no tenían detalle pueden agregarlo acá. Reutilizable: recibe la
 * función que persiste (OC de servicio o servicio directo).
 */
export function DetalleServicioBloque({
  detalleInicial,
  onGuardar,
  onSaved,
}: {
  detalleInicial: DetalleServicioItem[] | null | undefined;
  onGuardar: (detalle: DetalleServicioItem[]) => Promise<void>;
  onSaved?: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleServicioItem[]>(detalleInicial ?? []);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      const limpio = limpiarDetalleServicio(detalle);
      await onGuardar(limpio);
      setDetalle(limpio);
      setSucio(false);
      toast('Detalle del servicio guardado', 'success');
      onSaved?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar el detalle', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '.75rem' }}>
      <div className="card-title" style={{ fontSize: '.85rem', marginBottom: '.35rem' }}>🔧 Detalle del servicio</div>
      <DetalleServicioEditor
        value={detalle}
        onChange={(v) => { setDetalle(v); setSucio(true); }}
        titulo=""
      />
      {sucio && (
        <button className="btn btn-primary btn-sm" onClick={() => void guardar()} disabled={guardando} style={{ marginTop: '.4rem' }}>
          {guardando ? 'Guardando…' : '💾 Guardar detalle'}
        </button>
      )}
    </div>
  );
}
