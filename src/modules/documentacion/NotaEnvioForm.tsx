/* ============================================================
   Golden Touch · Documentación · Formulario de la nota de envío
   Crear o corregir (mientras está «Enviada»). El N° lo asigna la base
   al guardar. El total sigue la suma de cantidades salvo que se escriba
   a mano (en el papel a veces se cuenta distinto, p. ej. solo facturas).

   Cliente / departamento y detalles de entrega salen del catálogo de
   destinatarios (📇): al elegir uno se rellenan los cinco campos, y al
   guardar la nota se puede agregar o actualizar ese destinatario.
   ============================================================ */
import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { FechaInput } from '@/shared/ui/FechaInput';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import {
  crearNotaEnvio, actualizarNotaEnvio, guardarDestinatario, type DestinatarioEnvio, type NotaEnvio,
} from './documentacion.repository';
import {
  buscarDestinatario, difiereDelCatalogo, etiquetaDestinatario, numeroEnvio, totalRenglones, type RenglonEnvio,
} from './notaEnvio';

const hoyCaracas = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

export function NotaEnvioForm({ nota, sugerencias, destinatarios, onCatalogo, actor, onClose, onSaved }: {
  nota: NotaEnvio | null;
  /** Valores ya usados (razón social, atención, condición) para autocompletar. */
  sugerencias: { razon: string[]; rif: Record<string, string>; atencion: string[]; condicion: string[] };
  /** Catálogo de destinatarios (📇). */
  destinatarios: DestinatarioEnvio[];
  /** Abre el catálogo para gestionarlo. */
  onCatalogo?: () => void;
  actor: { email: string; nombre: string | null };
  onClose: () => void;
  onSaved: (n: NotaEnvio) => void;
}) {
  const [fecha, setFecha] = useState(nota?.fecha ?? hoyCaracas());
  const [razon, setRazon] = useState(nota?.razon_social ?? '');
  const [rif, setRif] = useState(nota?.rif ?? '');
  const [direccion, setDireccion] = useState(nota?.direccion ?? '');
  const [atencion, setAtencion] = useState(nota?.atencion_a ?? '');
  const [condicion, setCondicion] = useState(nota?.condicion ?? '');
  const [items, setItems] = useState<Array<{ descripcion: string; cantidad: string }>>(
    nota?.items.length
      ? nota.items.map((r) => ({ descripcion: r.descripcion, cantidad: r.cantidad == null ? '' : String(r.cantidad) }))
      : [{ descripcion: '', cantidad: '' }],
  );
  const [etiqueta, setEtiqueta] = useState(nota?.total_etiqueta ?? 'Documentos');
  const [totalManual, setTotalManual] = useState<string | null>(
    nota && nota.total != null && nota.total !== totalRenglones(nota.items) ? String(nota.total) : null,
  );
  const [entregadoPor, setEntregadoPor] = useState(nota?.entregado_por ?? actor.nombre ?? '');
  const [notas, setNotas] = useState(nota?.notas ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renglones: RenglonEnvio[] = useMemo(
    () => items.map((r) => ({ descripcion: r.descripcion, cantidad: r.cantidad.trim() === '' ? null : Number(r.cantidad.replace(',', '.')) })),
    [items],
  );
  const suma = totalRenglones(renglones);
  const total = totalManual == null || totalManual.trim() === '' ? suma : Number(totalManual.replace(',', '.'));

  const setItem = (i: number, campo: 'descripcion' | 'cantidad', v: string) =>
    setItems((xs) => xs.map((r, j) => (j === i ? { ...r, [campo]: v } : r)));

  // Elegido del catálogo: rellena los cinco campos (se pueden retocar después).
  function elegirDestinatario(id: string) {
    const d = destinatarios.find((x) => x.id === id);
    if (!d) return;
    setRazon(d.razon_social); setRif(d.rif ?? ''); setDireccion(d.direccion ?? '');
    setAtencion(d.atencion_a ?? ''); setCondicion(d.condicion ?? '');
  }

  // Escrita a mano: si coincide con uno del catálogo, completa lo que esté vacío.
  function elegirRazon(v: string) {
    setRazon(v);
    const d = buscarDestinatario(destinatarios, v);
    if (d) {
      if (!rif) setRif(d.rif ?? '');
      if (!direccion) setDireccion(d.direccion ?? '');
      if (!atencion) setAtencion(d.atencion_a ?? '');
      if (!condicion) setCondicion(d.condicion ?? '');
    } else if (!rif && sugerencias.rif[v]) setRif(sugerencias.rif[v]);
  }

  // ¿Se guarda en el catálogo? Nuevo → marcado; ya existe y cambió → se ofrece actualizarlo.
  const datos = { razon_social: razon, rif: rif || null, direccion: direccion || null, atencion_a: atencion || null, condicion: condicion || null };
  const enCatalogo = buscarDestinatario(destinatarios, razon);
  const cambioCatalogo = !!enCatalogo && difiereDelCatalogo(datos, enCatalogo);
  // Por defecto: nuevo se guarda; uno existente NO se pisa (un retoque puede ser solo para esta nota).
  const [eleccionCatalogo, setGuardarEnCatalogo] = useState<boolean | null>(null);
  const guardarEnCatalogo = eleccionCatalogo ?? !enCatalogo;
  const ofrecerCatalogo = !!razon.trim() && (!enCatalogo || cambioCatalogo);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    const input = {
      fecha, razon_social: razon, rif, direccion, atencion_a: atencion, condicion,
      items: renglones, total_etiqueta: etiqueta, total, entregado_por: entregadoPor, notas,
    };
    try {
      const n = nota ? await actualizarNotaEnvio(nota.id, input) : await crearNotaEnvio(input, actor);
      toast(nota ? `Nota N° ${numeroEnvio(n.numero)} actualizada` : `Nota de envío N° ${numeroEnvio(n.numero)} creada`, 'success');
      // El catálogo va después de la nota: si falla, la nota ya quedó y solo se avisa.
      if (ofrecerCatalogo && guardarEnCatalogo) {
        try {
          await guardarDestinatario(enCatalogo?.id ?? null, datos, actor.email);
          toast(enCatalogo ? `«${razon.trim()}» actualizado en el catálogo` : `«${razon.trim()}» guardado en el catálogo`, 'success');
        } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo guardar en el catálogo', 'error'); }
      }
      onSaved(n);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); setSaving(false); }
  }

  return (
    <Modal
      title={nota ? `Editar nota de envío N° ${numeroEnvio(nota.numero)}` : 'Nueva nota de envío'} size="lg" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="submit" form="nota-envio-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : nota ? 'Guardar cambios' : 'Crear nota'}</button>
      </>}
    >
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <form id="nota-envio-form" onSubmit={submit}>
        <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.6rem' }}>
          {nota ? 'El N° no cambia al editar.' : 'El N° (correlativo) lo asigna el sistema al guardar.'} Las firmas van a mano sobre la nota impresa.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 1rem' }}>
          <div className="form-row">
            <label htmlFor="ne-fecha">Fecha *</label>
            <FechaInput id="ne-fecha" value={fecha} onChange={setFecha} />
          </div>
          <div className="form-row">
            <label htmlFor="ne-entregado">Entregado por</label>
            <input id="ne-entregado" className="input" value={entregadoPor} onChange={(e) => setEntregadoPor(e.target.value)} />
          </div>
        </div>

        <div className="card-title" style={{ margin: '.4rem 0' }}>Datos del cliente / departamento</div>
        <div className="form-row">
          <label htmlFor="ne-catalogo">Elegir del catálogo</label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <SearchSelect id="ne-catalogo" value={enCatalogo?.id ?? ''} onChange={elegirDestinatario}
                placeholder={destinatarios.length ? '🔍 Buscar destinatario guardado…' : 'Aún no hay destinatarios guardados'}
                options={destinatarios.map((d) => ({ value: d.id, label: etiquetaDestinatario(d) }))} />
            </div>
            {onCatalogo && <button type="button" className="btn btn-ghost" onClick={onCatalogo} title="Agregar, editar o borrar destinatarios">📇 Catálogo</button>}
          </div>
          <small className="muted">Rellena los cinco campos de abajo; se pueden retocar para esta nota.</small>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 1rem' }}>
          <div className="form-row">
            <label htmlFor="ne-razon">Razón social / departamento *</label>
            <input id="ne-razon" className="input" list="ne-razones" value={razon} onChange={(e) => elegirRazon(e.target.value)} />
            <datalist id="ne-razones">{[...new Set([...destinatarios.map((d) => d.razon_social), ...sugerencias.razon])].map((v) => <option key={v} value={v} />)}</datalist>
          </div>
          <div className="form-row">
            <label htmlFor="ne-rif">RIF / C.I.</label>
            <input id="ne-rif" className="input" value={rif} onChange={(e) => setRif(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="ne-direccion">Dirección (opcional)</label>
          <input id="ne-direccion" className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </div>

        <div className="card-title" style={{ margin: '.4rem 0' }}>Detalles de entrega</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 1rem' }}>
          <div className="form-row">
            <label htmlFor="ne-atencion">Atención a</label>
            <input id="ne-atencion" className="input" list="ne-atenciones" value={atencion} onChange={(e) => setAtencion(e.target.value)} />
            <datalist id="ne-atenciones">{sugerencias.atencion.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
          <div className="form-row">
            <label htmlFor="ne-condicion">Condición</label>
            <input id="ne-condicion" className="input" list="ne-condiciones" value={condicion} onChange={(e) => setCondicion(e.target.value)} placeholder="Ej: Facturas originales, copias…" />
            <datalist id="ne-condiciones">{sugerencias.condicion.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
        </div>
        {ofrecerCatalogo && (
          <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.86rem', margin: '.1rem 0 .6rem' }}>
            <input type="checkbox" checked={guardarEnCatalogo} onChange={(e) => setGuardarEnCatalogo(e.target.checked)} />
            <span>
              {enCatalogo
                ? <>Actualizar <strong>{enCatalogo.razon_social}</strong> en el catálogo con estos datos</>
                : <>Guardar este destinatario en el <strong>catálogo</strong> para la próxima nota</>}
            </span>
          </label>
        )}

        <div className="card-title" style={{ margin: '.4rem 0' }}>Renglones</div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead><tr><th style={{ width: 50 }}>Ítem</th><th>Descripción / concepto</th><th style={{ width: 110 }}>Cant.</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{String(i + 1).padStart(2, '0')}</td>
                  <td><input id={`ne-desc-${i}`} className="input" value={r.descripcion} onChange={(e) => setItem(i, 'descripcion', e.target.value)} placeholder="Ej: Facturas originales de …" /></td>
                  <td><input id={`ne-cant-${i}`} className="input mono" inputMode="decimal" value={r.cantidad} onChange={(e) => setItem(i, 'cantidad', e.target.value.replace(/[^\d.,]/g, ''))} /></td>
                  <td>
                    {items.length > 1 && (
                      <button type="button" className="btn btn-sm btn-ghost" title="Quitar renglón" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.4rem' }} onClick={() => setItems((xs) => [...xs, { descripcion: '', cantidad: '' }])}>＋ Agregar renglón</button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1rem', marginTop: '.75rem' }}>
          <div className="form-row">
            <label htmlFor="ne-etiqueta">Total de… (texto)</label>
            <input id="ne-etiqueta" className="input" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Facturas, Documentos…" />
          </div>
          <div className="form-row">
            <label htmlFor="ne-total">Total {etiqueta || ''}</label>
            <input id="ne-total" className="input mono" inputMode="decimal" value={totalManual ?? String(suma)}
              onChange={(e) => setTotalManual(e.target.value.replace(/[^\d.,]/g, ''))} />
            <small className="muted">
              Suma de cantidades: {suma}.{totalManual != null && (
                <> <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTotalManual(null)}>Usar la suma</button></>
              )}
            </small>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="ne-notas">Observaciones (opcional)</label>
          <textarea id="ne-notas" className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
