/* ============================================================
   Golden Touch · RRHH · Minutas · cargar una minuta ya hecha (05/11/2026)

   Pedido de la administradora: «permite poder cargar minutas ya creadas».
   Las minutas en papel (o de otro sistema) se suben con su documento —PDF o
   foto— y los datos para encontrarlas: número, fecha, tema, lugar y quiénes
   participaron. La vista previa muestra el documento original.
   ============================================================ */
import { useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { Minuta } from '@/shared/lib/types';
import { hoyVE } from './minutaModelo';
import { errorArchivoAdjunto } from './minutaAdjuntos.repository';
import { crearMinutaCargada } from './minutas.repository';

export function CargarMinutaModal({ actor, onClose, onCargada }: {
  actor: string;
  onClose: () => void;
  onCargada: (m: Minuta) => void;
}) {
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoyVE());
  const [tema, setTema] = useState('');
  const [lugar, setLugar] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fecha) { setError('Indica la fecha de la reunión.'); return; }
    if (!tema.trim()) { setError('Indica el tema u objetivo de la minuta.'); return; }
    if (!archivos.length) { setError('Adjunta el documento de la minuta (PDF o imagen).'); return; }
    const malo = archivos.map((f) => errorArchivoAdjunto(f)).find(Boolean);
    if (malo) { setError(malo); return; }
    setGuardando(true);
    try {
      const m = await crearMinutaCargada({
        numero, fecha, objetivo: tema, lugar, observaciones,
        participantes: participantes.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      }, archivos, actor);
      toast(`Minuta ${m.numero} cargada`, 'success');
      onCargada(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la minuta.');
      setGuardando(false);
    }
  }

  return (
    <Modal title="📤 Cargar una minuta ya hecha" size="md" onClose={guardando ? () => {} : onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
        <button type="submit" form="form-cargar-minuta" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Cargar minuta'}</button>
      </>}>
      <form id="form-cargar-minuta" onSubmit={(e) => void guardar(e)}>
        {error && <div className="badge danger" style={{ display: 'block', padding: '.55rem .7rem', marginBottom: '.6rem' }}>{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>N.º de la minuta</label>
            <input className="input mono" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Vacío = el siguiente (MIN-AAAA-####)" />
          </div>
          <div className="form-row">
            <label>Fecha de la reunión *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="form-row" style={{ gridColumn: '1 / -1' }}>
            <label>Tema / objetivo *</label>
            <input className="input" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej.: Reunión de seguridad en mina" />
          </div>
          <div className="form-row">
            <label>Lugar</label>
            <input className="input" value={lugar} onChange={(e) => setLugar(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Participantes</label>
            <input className="input" value={participantes} onChange={(e) => setParticipantes(e.target.value)} placeholder="Separados por coma" />
          </div>
          <div className="form-row" style={{ gridColumn: '1 / -1' }}>
            <label>Observaciones</label>
            <textarea className="input" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
          <div className="form-row" style={{ gridColumn: '1 / -1' }}>
            <label>Documento de la minuta * <span className="muted">(PDF o imagen; puedes subir varias hojas)</span></label>
            <input className="input" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setArchivos(Array.from(e.target.files ?? []))} />
            {archivos.length > 0 && <small className="muted">{archivos.map((f) => f.name).join(' · ')}</small>}
          </div>
        </div>
      </form>
    </Modal>
  );
}
