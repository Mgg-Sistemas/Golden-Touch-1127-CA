/* ============================================================
   Golden Touch · RRHH · Empresas (14/10/2026)

   RRHH ya no tiene solo GT y MTO: aquí se crean las empresas que hagan falta
   (clave, razón social, RIF, domicilio, ciudad, contacto y logo). Cada una es
   una nómina independiente con su gente, sus períodos y su tabulador, y sus
   papeles (carnet, constancia, recibos, reportes) salen con su nombre, su RIF
   y su logo. No se borran: una empresa que ya no se usa se marca inactiva.
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { urlArchivoPublico, claveEmpresaValida, type IdentidadEmpresa } from '@/shared/lib/empresa';
import { useEmpresasRrhh } from '@/shared/lib/empresasRrhh';
import { crearEmpresa, editarEmpresa, subirLogoEmpresa, type ConteoPorEmpresa, type EmpresaInput } from './empresas.repository';

const ICONOS = ['🏢', '🔧', '⛏️', '🏭', '🚚', '🏗️', '🌿', '⚙️', '💎', '🛠️'];
const errMsg = (e: unknown, def: string) => (e instanceof Error ? e.message : def);

export function EmpresasModal({ conteo, actor, onClose, onElegir }: {
  conteo: ConteoPorEmpresa | null; actor: string; onClose: () => void; onElegir: (clave: string) => void;
}) {
  const empresas = useEmpresasRrhh();
  const [form, setForm] = useState<IdentidadEmpresa | 'nueva' | null>(null);

  return (
    <Modal title="🏢 Empresas de RRHH" size="lg" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {form ? (
        <EmpresaForm inicial={form === 'nueva' ? null : form} actor={actor} onCancel={() => setForm(null)}
          onSaved={(clave, nueva) => { setForm(null); if (nueva) onElegir(clave); }} />
      ) : (
        <div style={{ display: 'grid', gap: '.7rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '.84rem' }}>
            Cada empresa es una nómina aparte, con su personal, sus períodos y su tabulador. Sus papeles salen con su razón social, su RIF y su logo, y cada una maneja su moneda de pago ($ o Real brasileño).
            Con más de dos empresas, el selector del encabezado pasa a ser una lista con buscador.
          </p>
          <div><button className="btn btn-primary" onClick={() => setForm('nueva')}>＋ Nueva empresa</button></div>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.86rem' }}>
              <thead><tr><th>Empresa</th><th>RIF</th><th>Ciudad</th><th>Moneda de pago</th><th style={{ textAlign: 'right' }}>Personal activo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.clave} style={{ opacity: e.activa ? 1 : .6 }}>
                    <td>
                      <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center' }}>
                        {e.logoPropio
                          ? <img src={urlArchivoPublico(e.logoPantalla)} alt="" style={{ width: 52, height: 30, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 2 }} />
                          : <span style={{ width: 52, textAlign: 'center', fontSize: '1.3rem' }} aria-hidden="true">{e.icono}</span>}
                        <div><strong>{e.icono} {e.clave}</strong><div className="muted" style={{ fontSize: '.76rem' }}>{e.nombre}</div></div>
                      </div>
                    </td>
                    <td className="mono">{e.rif || '—'}</td>
                    <td>{e.ciudad || '—'}</td>
                    <td>{e.monedaPago === 'BRL' ? <span className="badge" title="Los recibos de bonificación salen en $ y en Real brasileño">$ + R$</span> : <span className="muted">$</span>}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{conteo?.[e.clave] ?? 0}</td>
                    <td>{e.activa ? <span className="badge success">Activa</span> : <span className="badge">Inactiva</span>}{!e.logoPropio && <div className="muted" style={{ fontSize: '.7rem' }}>sin logo propio</div>}</td>
                    <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                      {e.activa && <button className="btn btn-sm btn-ghost" onClick={() => { onElegir(e.clave); onClose(); }}>Abrir</button>}
                      <button className="btn btn-sm btn-ghost" onClick={() => setForm(e)} title="Editar">✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EmpresaForm({ inicial, actor, onCancel, onSaved }: {
  inicial: IdentidadEmpresa | null; actor: string; onCancel: () => void; onSaved: (clave: string, nueva: boolean) => void;
}) {
  const [v, setV] = useState<EmpresaInput>({
    clave: inicial?.clave ?? '', nombre: inicial?.nombre ?? '', rif: inicial?.rif ?? '', domicilio: inicial?.domicilio ?? '',
    ciudad: inicial?.ciudad ?? '', email: inicial?.email ?? '', whatsapp: inicial?.whatsapp ?? '', icono: inicial?.icono ?? '🏢',
    activa: inicial?.activa ?? true, moneda_pago: inicial?.monedaPago ?? 'USD',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EmpresaInput>(k: K, val: EmpresaInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const clave = (v.clave ?? '').trim().toUpperCase();

  async function guardar() {
    setError(null);
    if (!inicial && !claveEmpresaValida(clave)) { setError('La clave lleva de 2 a 8 letras o números, sin espacios (ej.: SERV, GT2).'); return; }
    setSaving(true);
    try {
      if (inicial) await editarEmpresa(inicial.clave, v, actor);
      else await crearEmpresa({ ...v, clave }, actor);
      if (logo) await subirLogoEmpresa(inicial?.clave ?? clave, logo, actor);
      toast(inicial ? `Empresa ${inicial.clave} guardada` : `Empresa ${clave} creada: ya tiene su nómina`, 'success');
      onSaved(inicial?.clave ?? clave, !inicial);
    } catch (e) { setError(errMsg(e, 'No se pudo guardar')); setSaving(false); }
  }

  return (
    <div style={{ display: 'grid', gap: '.7rem' }}>
      <h4 style={{ margin: 0 }}>{inicial ? `✎ ${inicial.clave} · ${inicial.nombre}` : '＋ Nueva empresa'}</h4>
      {error && <div className="aviso danger sm"><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      <div className="form-grid">
        <div className="form-row"><label htmlFor="emp-clave">Clave (va en el selector y en los códigos: NOM-{clave || 'XXX'}-2026-0001)</label>
          <input id="emp-clave" className="input mono" value={clave} disabled={!!inicial} maxLength={8} onChange={(e) => set('clave', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="SERV" /></div>
        <div className="form-row"><label htmlFor="emp-nombre">Razón social</label>
          <input id="emp-nombre" className="input" value={v.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="SERVICIOS EJEMPLO, C.A." /></div>
        <div className="form-row"><label htmlFor="emp-rif">RIF</label>
          <input id="emp-rif" className="input mono" value={v.rif ?? ''} onChange={(e) => set('rif', e.target.value)} placeholder="J-00000000-0" /></div>
        <div className="form-row"><label htmlFor="emp-ciudad">Ciudad (de expedición de constancias)</label>
          <input id="emp-ciudad" className="input" value={v.ciudad ?? ''} onChange={(e) => set('ciudad', e.target.value)} placeholder="Puerto Ordaz, Estado Bolívar" /></div>
        <div className="form-row" style={{ gridColumn: '1 / -1' }}><label htmlFor="emp-dom">Domicilio fiscal</label>
          <input id="emp-dom" className="input" value={v.domicilio ?? ''} onChange={(e) => set('domicilio', e.target.value)} placeholder="Como aparece en el RIF" /></div>
        <div className="form-row"><label htmlFor="emp-email">Correo</label>
          <input id="emp-email" className="input" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="Si se deja vacío, el del grupo" /></div>
        <div className="form-row"><label htmlFor="emp-wa">WhatsApp</label>
          <input id="emp-wa" className="input" value={v.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="Si se deja vacío, el del grupo" /></div>
        <div className="form-row"><label htmlFor="emp-moneda">Moneda de pago (recibos)</label>
          <select id="emp-moneda" className="select" value={v.moneda_pago ?? 'USD'} onChange={(e) => set('moneda_pago', e.target.value === 'BRL' ? 'BRL' : 'USD')}>
            <option value="USD">Dólares ($): recibos como siempre</option>
            <option value="BRL">Real brasileño (R$): recibos en $ y en R$</option>
          </select>
          <span className="muted" style={{ fontSize: '.75rem' }}>
            {(v.moneda_pago ?? 'USD') === 'BRL'
              ? 'El recibo de bonificación sale en $ y en Real, con la tasa de cambio. Al cargar la nómina se trae la tasa del Real y hay un conversor $ ↔ R$.'
              : 'Los recibos salen como siempre: sueldo en Bs y bonificación en $.'}
          </span></div>
        <div className="form-row"><label>Ícono</label>
          <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
            {ICONOS.map((i) => <button key={i} type="button" className={`btn btn-sm ${v.icono === i ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('icono', i)} aria-pressed={v.icono === i}>{i}</button>)}
          </div></div>
        <div className="form-row"><label htmlFor="emp-logo">Logo (PNG, JPG o WEBP, hasta 2 MB)</label>
          <input id="emp-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          <span className="muted" style={{ fontSize: '.75rem' }}>{logo ? logo.name : inicial?.logoPropio ? 'Tiene logo; elige otro para cambiarlo.' : 'Sin logo, los papeles salen con el de Golden Touch.'}</span></div>
        {inicial && inicial.clave !== 'GT' && (
          <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem', gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={v.activa ?? true} onChange={(e) => set('activa', e.target.checked)} /> Activa (si se desmarca, sale del selector; su personal y sus nóminas se conservan)
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '.45rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Volver</button>
        <button className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear empresa'}</button>
      </div>
    </div>
  );
}
