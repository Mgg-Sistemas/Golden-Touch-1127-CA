/* ============================================================
   Golden Touch · Facturas de Compra/Servicio Directo (varias)
   Lista, sube (PDF/imagen), borra y previsualiza las facturas de
   una compra o servicio directo. Reutilizable en ambos módulos.

   Con P03: un archivo registrado como factura en Retenciones lleva su
   marca y no se borra. En una caja «mixta» (facturas y otros papeles)
   cada archivo dice si es factura del proveedor y se puede cambiar
   mientras no esté registrado; al subir, se marca (factura por defecto).
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { p03Disponible } from '@/modules/libroFiscal/disponibilidad';
import {
  listAdjuntosDirectos, agregarAdjuntoDirecto, eliminarAdjuntoDirecto, urlAdjuntoDirecto, adjuntosRegistrados, editarAdjuntoDirecto, cuentaComoFactura,
  type AdjuntoDirecto, type ModuloDirecto,
} from './adjuntosDirectos.repository';

/** Qué papeles lleva la caja: solo facturas del proveedor, o facturas y otros papeles. Lo de 'orden' nunca es factura. */
export type PapelCaja = 'factura' | 'mixto';

export function FacturasDirectas({ modulo, refId, actor, soloLectura = false, titulo = '🧾 Facturas / comprobantes', textoBoton = '＋ Agregar factura (PDF/imagen)', papel, onCambio }: {
  modulo: ModuloDirecto; refId: string; actor: string; soloLectura?: boolean; titulo?: string; textoBoton?: string;
  /** Por defecto: 'factura' en orden_factura; 'mixto' en compra y servicio. */
  papel?: PapelCaja;
  /** Avisa cuántos archivos cuentan como factura (p. ej., para exigir uno al recibir). */
  onCambio?: (facturas: number) => void;
}) {
  const [lista, setLista] = useState<AdjuntoDirecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [borrar, setBorrar] = useState<AdjuntoDirecto | null>(null);
  const [conP03, setConP03] = useState(false);
  const [registrados, setRegistrados] = useState<Set<string>>(new Set());
  const [subirComoFactura, setSubirComoFactura] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const avisar = useRef(onCambio);
  avisar.current = onCambio;

  const esDeFacturas = modulo !== 'orden';
  const papelCaja: PapelCaja = papel ?? (modulo === 'orden_factura' ? 'factura' : 'mixto');
  const mixta = conP03 && esDeFacturas && papelCaja === 'mixto';

  useEffect(() => {
    let vivo = true;
    if (esDeFacturas) void p03Disponible().then((v) => { if (vivo) setConP03(v); });
    return () => { vivo = false; };
  }, [esDeFacturas]);

  const reload = useCallback(async () => {
    try {
      const l = await listAdjuntosDirectos(modulo, refId);
      setLista(l);
      avisar.current?.(l.filter(cuentaComoFactura).length);
      if (conP03) setRegistrados(await adjuntosRegistrados(l.map((a) => a.id)).catch(() => new Set<string>()));
    }
    catch { /* RLS/red */ }
    finally { setCargando(false); }
  }, [modulo, refId, conP03]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(conP03 ? ['adjuntos_directos', 'retencion_documento_origenes'] : ['adjuntos_directos'], () => { void reload(); });

  async function abrir(a: AdjuntoDirecto) {
    try { previewArchivo(await urlAdjuntoDirecto(modulo, a.path), a.nombre || (a.path.split('/').pop() ?? 'factura')); }
    catch { toast('No se pudo abrir la factura', 'error'); }
  }

  async function onPick(archivos: File[]) {
    if (!archivos.length) return;
    setSubiendo(true);
    try {
      // Con P03: la caja de facturas marca factura; la mixta, lo que diga la casilla. Sin P03, como hoy.
      const esFactura = !conP03 || !esDeFacturas ? undefined : papelCaja === 'factura' ? true : subirComoFactura;
      for (const f of archivos) await agregarAdjuntoDirecto(modulo, refId, f, actor, esFactura);
      toast(archivos.length > 1 ? `${archivos.length} archivos cargados` : 'Archivo cargado', 'success');
      if (inputRef.current) inputRef.current.value = '';
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar el archivo', 'error'); }
    finally { setSubiendo(false); }
  }

  async function confirmarBorrar() {
    const a = borrar; if (!a) return;
    try { await eliminarAdjuntoDirecto(a); toast('Factura eliminada', 'success'); setBorrar(null); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  async function cambiarTipo(a: AdjuntoDirecto) {
    try { await editarAdjuntoDirecto(a.id, { esFactura: !cuentaComoFactura(a) }); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  const esImg = (a: AdjuntoDirecto) => (a.content_type ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.path);

  return (
    <div className="card" style={{ marginTop: '.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.9rem' }}>{titulo} {lista.length ? <span className="badge">{lista.length}</span> : null}</strong>
        {!soloLectura && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            {mixta && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                <input type="checkbox" checked={subirComoFactura} onChange={(e) => setSubirComoFactura(e.target.checked)} />
                Es factura del proveedor
              </label>
            )}
            <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
              onChange={(e) => onPick(Array.from(e.target.files ?? []))} />
            <button type="button" className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => inputRef.current?.click()}>
              {subiendo ? 'Subiendo…' : textoBoton}
            </button>
          </span>
        )}
      </div>

      {cargando ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>Cargando…</div>
      ) : !lista.length ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>Sin facturas cargadas.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
          {lista.map((a) => {
            const registrado = conP03 && registrados.has(a.id);
            return (
              <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', minWidth: 0, flexWrap: 'wrap' }}>
                  <span>{esImg(a) ? '🖼' : '📄'}</span>
                  <button type="button" className="btn btn-sm btn-ghost" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={() => abrir(a)} title={a.nombre ?? 'Ver factura'}>{a.nombre || 'factura'}</button>
                  <small className="muted">{dateTime(a.created_at)}</small>
                  {mixta && (
                    soloLectura || registrado
                      ? <span className="badge">{cuentaComoFactura(a) ? 'Factura' : 'Otro papel'}</span>
                      : <button type="button" className="btn btn-sm btn-ghost" title="Cambiar: factura del proveedor u otro papel" onClick={() => cambiarTipo(a)}>
                          {cuentaComoFactura(a) ? 'Factura' : 'Otro papel'} ⇄
                        </button>
                  )}
                  {registrado && <span className="badge badge-success" title="Ya es un documento fiscal en Retenciones: no se elimina">Registrada en Retenciones</span>}
                </span>
                {!soloLectura && !registrado && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(a)} title="Eliminar factura">🗑</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {borrar && (
        <ConfirmDialog title="Eliminar factura" message={`¿Eliminar "${borrar.nombre || 'la factura'}"? No se puede deshacer.`}
          confirmText="Eliminar" danger onConfirm={confirmarBorrar} onCancel={() => setBorrar(null)} />
      )}
    </div>
  );
}
