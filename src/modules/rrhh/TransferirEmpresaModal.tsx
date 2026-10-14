/* ============================================================
   Golden Touch · RRHH · Transferir a otra empresa (14/10/2026)

   Pasa a la persona a otra nómina (de GT a MTO, por ejemplo): su ficha queda
   en la empresa nueva desde ya y la transferencia queda en su historial (de
   dónde a dónde, cuándo, por qué y quién). Lo anterior no se mueve: las
   nóminas ya cargadas y sus recibos siguen en la empresa de antes.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { date as fmtDate } from '@/shared/lib/format';
import { useEmpresasRrhh } from '@/shared/lib/empresasRrhh';
import type { Personal } from '@/shared/lib/types';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { transferirEmpresa, listTransferencias, type TransferenciaEmpresa } from './empresas.repository';

const hoyVE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

export function TransferirEmpresaModal({ persona, onClose, onHecho }: {
  persona: Personal; onClose: () => void; onHecho: () => void;
}) {
  const actorName = usePermissions().appUser?.nombre ?? null;
  const empresas = useEmpresasRrhh();
  const destinos = empresas.filter((e) => e.activa && e.clave !== (persona.empresa || 'GT'));
  const [destino, setDestino] = useState(destinos.length === 1 ? destinos[0].clave : '');
  const [fecha, setFecha] = useState(hoyVE());
  const [ficha, setFicha] = useState(persona.ficha_nro ?? '');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<TransferenciaEmpresa[]>([]);

  useEffect(() => { listTransferencias(persona.id).then(setHistorial).catch(() => setHistorial([])); }, [persona.id]);

  const nombre = `${persona.nombre} ${persona.apellido ?? ''}`.trim();
  const dest = empresas.find((e) => e.clave === destino) ?? null;

  async function transferir() {
    setError(null);
    if (!destino) { setError('Elige la empresa de destino.'); return; }
    if (motivo.trim().length < 3) { setError('Escribe el motivo de la transferencia.'); return; }
    setSaving(true);
    try {
      const r = await transferirEmpresa({ personalId: persona.id, empresa: destino, fecha, fichaNro: ficha, motivo, actorName });
      toast(`${nombre} pasó a la nómina ${r.hacia}${r.ficha ? ` (ficha ${r.ficha})` : ''}.`, 'success');
      onHecho();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo transferir'); setSaving(false); }
  }

  return (
    <Modal title={`🔁 Transferir a otra empresa · ${nombre}`} onClose={() => !saving && onClose()} footer={<>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button className="btn btn-primary" onClick={() => void transferir()} disabled={saving || !destino}>{saving ? 'Transfiriendo…' : `Transferir${destino ? ` a ${destino}` : ''}`}</button>
    </>}>
      <div style={{ display: 'grid', gap: '.7rem' }}>
        {error && <div className="aviso danger sm"><span className="aviso-icono">⛔</span><div>{error}</div></div>}
        {!destinos.length ? (
          <div className="aviso info sm"><span className="aviso-icono">🏢</span><div>No hay otra empresa activa. Créala en «🏢 Empresas», en el encabezado de RRHH.</div></div>
        ) : (
          <div className="form-grid">
            <div className="form-row"><label htmlFor="tr-destino">Pasa a la nómina de</label>
              <SearchSelect id="tr-destino" value={destino} onChange={setDestino} placeholder="🔍 Empresa…"
                options={destinos.map((e) => ({ value: e.clave, label: `${e.icono} ${e.clave} · ${e.nombre}` }))} /></div>
            <div className="form-row"><label htmlFor="tr-fecha">Desde el</label>
              <input id="tr-fecha" className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="form-row"><label htmlFor="tr-ficha">N° de ficha en la nueva empresa</label>
              <input id="tr-ficha" className="input mono" value={ficha} onChange={(e) => setFicha(e.target.value)} placeholder="Si se repite en la otra nómina, pon otro" /></div>
            <div className="form-row"><label htmlFor="tr-motivo">Motivo</label>
              <input id="tr-motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Reasignación, cambio de contrato…" /></div>
          </div>
        )}
        <VistaPrevia titulo="Qué pasa">
          <Dato label="Persona">{`${nombre}${persona.cedula ? ` · ${persona.cedula}` : ''}`}</Dato>
          <Dato label="De">{`Nómina ${persona.empresa || 'GT'}`}</Dato>
          <Dato label="A">{dest ? `Nómina ${dest.clave} · ${dest.nombre}` : undefined}</Dato>
          <Dato label="Lo anterior">Las nóminas ya cargadas, sus recibos y sus préstamos quedan como están. Desde ahora sale en la nómina nueva y sus papeles llevan el nombre y el logo de esa empresa.</Dato>
        </VistaPrevia>
        {historial.length > 0 && (
          <div>
            <strong style={{ fontSize: '.85rem' }}>Transferencias anteriores</strong>
            <ul style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem', fontSize: '.82rem' }}>
              {historial.map((h) => (
                <li key={h.id}>{fmtDate(h.fecha)} · {h.desde} → {h.hacia}{h.ficha_nueva && h.ficha_nueva !== h.ficha_anterior ? ` · ficha ${h.ficha_anterior ?? '—'} → ${h.ficha_nueva}` : ''}{h.motivo ? ` · ${h.motivo}` : ''}{h.actor_name || h.actor ? ` · ${h.actor_name || h.actor}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
