/* ============================================================
   Conciliación · ventanas de documentos (12/11/2026).
   · FacturasDirectaModal: las facturas que Compras cargó al finalizar una
     COMPRA DIRECTA o un SERVICIO DIRECTO (adjunto principal + adjuntos).
   · ComprobantesPagoModal: el comprobante del pago que cargó Tesorería y los
     que se cargan desde Conciliación (se pueden sumar y quitar).
   · ReferenciaModal: el lapicito ✎ para anotar la referencia del pago.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { ListaArchivos, type ArchivoFactura } from '@/modules/pedidos/FacturasOcModal';
import { cuentaComoFactura, listAdjuntosDirectos, urlAdjuntoDirecto, type ModuloDirecto } from '@/modules/pedidos/adjuntosDirectos.repository';
import { urlAdjuntoOc } from '@/modules/pedidos/pedidos.repository';
import type { ArchivoNota, FilaConciliacion } from './conciliacion';
import {
  guardarReferenciaConciliacion, quitarComprobanteConciliacion, subirComprobantesConciliacion, urlComprobanteConciliacion,
} from './conciliacion.repository';

const esImagenNombre = (n: string) => /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(n);
const fechaVE = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }) : '';

export interface ActorConciliacion { email: string; nombre?: string | null }

/* ───────── Facturas de compra / servicio directo ───────── */

export function FacturasDirectaModal({ fila, onClose }: { fila: FilaConciliacion; onClose: () => void }) {
  const [archivos, setArchivos] = useState<ArchivoFactura[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const modulo: ModuloDirecto = fila.origen === 'sd' ? 'servicio' : 'compra';
    void (async () => {
      const out: ArchivoFactura[] = [];
      try {
        if (fila.facturaPrincipal) {
          const url = await urlAdjuntoDirecto(modulo, fila.facturaPrincipal.path).catch(() => '');
          if (url) out.push({ key: fila.facturaPrincipal.path, nombre: fila.facturaPrincipal.nombre, url, esImagen: esImagenNombre(fila.facturaPrincipal.nombre), detalle: 'Cargada al finalizar' });
        }
        const adj = (await listAdjuntosDirectos(modulo, fila.ordenId)).filter(cuentaComoFactura);
        for (const a of adj) {
          if (out.some((x) => x.key === a.path)) continue;
          const url = await urlAdjuntoDirecto(modulo, a.path).catch(() => '');
          if (!url) continue;
          const nombre = a.nombre || a.path.split('/').pop() || 'factura';
          out.push({ key: a.id, nombre, url, esImagen: (a.content_type ?? '').startsWith('image/') || esImagenNombre(nombre), detalle: fechaVE(a.created_at) || null });
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : 'No se pudieron leer las facturas', 'error');
      }
      if (vivo) setArchivos(out);
    })();
    return () => { vivo = false; };
  }, [fila]);
  return (
    <Modal title={`🧾 Factura · ${fila.codigo}`} size="lg" onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {archivos === null ? <p className="muted">Cargando facturas…</p>
        : <ListaArchivos titulo="🧾 FACTURAS DE COMPRAS" vacio="Compras no cargó la factura al finalizar." archivos={archivos} />}
    </Modal>
  );
}

/* ───────── Comprobante del pago ───────── */

export function ComprobantesPagoModal({ fila, puedeEditar, actor, onCambio, onClose }: {
  fila: FilaConciliacion;
  puedeEditar: boolean;
  actor: ActorConciliacion;
  onCambio: (lista: ArchivoNota[]) => void;
  onClose: () => void;
}) {
  const [tesoreria, setTesoreria] = useState<ArchivoFactura[] | null>(null);
  const [propios, setPropios] = useState<ArchivoNota[]>(fila.comprobantesConciliacion);
  const [urls, setUrls] = useState<ArchivoFactura[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const out: ArchivoFactura[] = [];
      for (const c of fila.comprobantesTesoreria) {
        const url = await urlAdjuntoOc(c.path).catch(() => '');
        if (url) out.push({ key: c.path, nombre: c.nombre, url, esImagen: esImagenNombre(c.nombre), detalle: 'Cargado por Tesorería al pagar' });
      }
      if (vivo) setTesoreria(out);
    })();
    return () => { vivo = false; };
  }, [fila]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const out: ArchivoFactura[] = [];
      for (const c of propios) {
        const url = await urlComprobanteConciliacion(c.path).catch(() => '');
        if (url) out.push({ key: c.path, nombre: c.nombre, url, esImagen: esImagenNombre(c.nombre), detalle: [c.por, fechaVE(c.at)].filter(Boolean).join(' · ') || null });
      }
      if (vivo) setUrls(out);
    })();
    return () => { vivo = false; };
  }, [propios]);

  async function subir() {
    if (!files.length) return;
    setOcupado(true);
    try {
      const lista = await subirComprobantesConciliacion(fila.origen, fila.ordenId, files, actor);
      setPropios(lista); onCambio(lista); setFiles([]);
      toast('Comprobante cargado.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar el comprobante', 'error');
    } finally { setOcupado(false); }
  }

  async function quitar(path: string) {
    setOcupado(true);
    try {
      const lista = await quitarComprobanteConciliacion(fila.origen, fila.ordenId, path, actor);
      setPropios(lista); onCambio(lista);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo quitar', 'error');
    } finally { setOcupado(false); }
  }

  return (
    <Modal title={`💳 Comprobante de pago · ${fila.codigo}`} size="lg" onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {fila.referencias.length > 0 && (
        <p style={{ marginTop: 0 }}>Referencia: {fila.referencias.map((x) => <span key={x} className="badge mono" style={{ marginRight: '.25rem' }}>{x}</span>)}</p>
      )}
      {fila.origen === 'oc' && (tesoreria === null
        ? <p className="muted">Cargando comprobantes de Tesorería…</p>
        : <ListaArchivos titulo="🏦 DE TESORERÍA" vacio="Tesorería no cargó comprobante al pagar." archivos={tesoreria} />)}
      <ListaArchivos titulo="📒 CARGADOS EN CONCILIACIÓN" vacio="Todavía no se cargó ninguno aquí." archivos={urls} />
      {puedeEditar && propios.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginBottom: '.8rem' }}>
          {propios.map((c) => (
            <button key={c.path} type="button" className="btn btn-ghost btn-sm" disabled={ocupado}
              onClick={() => void quitar(c.path)} title="Quitar este comprobante">✕ {c.nombre}</button>
          ))}
        </div>
      )}
      {puedeEditar ? (
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Cargar comprobante de pago · PDF o imagen (máx. 10 MB c/u)</label>
            <input className="input" type="file" accept="application/pdf,image/*" multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.5rem' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado || !files.length} onClick={() => void subir()}>
              {ocupado ? 'Cargando…' : `⬆ Cargar ${files.length || ''}`.trim()}
            </button>
          </div>
        </div>
      ) : <p className="muted" style={{ fontSize: '.82rem' }}>Para cargar comprobantes hace falta escritura en Conciliación o Tesorería.</p>}
    </Modal>
  );
}

/* ───────── Referencia (lapicito) ───────── */

export function ReferenciaModal({ fila, actor, onGuardado, onClose }: {
  fila: FilaConciliacion;
  actor: ActorConciliacion;
  onGuardado: (referencia: string | null) => void;
  onClose: () => void;
}) {
  const [ref, setRef] = useState(fila.referenciaManual ?? '');
  const [ocupado, setOcupado] = useState(false);
  const deTesoreria = fila.referencias.filter((x) => x !== fila.referenciaManual);
  async function guardar() {
    setOcupado(true);
    try {
      await guardarReferenciaConciliacion(fila.origen, fila.ordenId, ref, actor);
      onGuardado(ref.trim() || null);
      toast(ref.trim() ? 'Referencia guardada.' : 'Referencia borrada.', 'success');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar la referencia', 'error');
      setOcupado(false);
    }
  }
  return (
    <Modal title={`✎ Referencia de pago · ${fila.codigo}`} size="md" onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={ocupado}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      {deTesoreria.length > 0 && (
        <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
          Tesorería anotó: {deTesoreria.join(' · ')}. Lo que escribas aquí se suma.
        </p>
      )}
      <div className="form-row" style={{ margin: 0 }}>
        <label>Referencia (transferencia, pago móvil, ID de Binance…)</label>
        <input className="input mono" autoFocus maxLength={60} value={ref} placeholder="Ej. 1234 o el número completo"
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void guardar(); }} />
        <small className="muted">Déjala vacía y guarda para borrarla.</small>
      </div>
    </Modal>
  );
}
