/* ============================================================
   Golden Touch · Retenciones · Facturas de Compras por registrar (P03)

   Los archivos de factura que Compras subió y que todavía no son un
   documento fiscal: se ven y, con permiso, «Registrar factura» abre el
   registro con el archivo y su orden (lo arma quien monta este componente
   con onRegistrar). Con `origenIds`, solo los de esas órdenes, compras o
   servicios. Sin P03, o sin archivos por registrar, no se muestra.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { p03Disponible } from './disponibilidad';
import { facturasPorRegistrar, urlFacturaDeOrigen, type FacturaDeOrigen } from './documentosOrigen.repository';

export function FacturasPorRegistrar({ origenIds, puedeRegistrar, onRegistrar, titulo = '🧾 Facturas de Compras por registrar' }: {
  origenIds?: string[];
  puedeRegistrar: boolean;
  onRegistrar: (f: FacturaDeOrigen) => void;
  titulo?: string;
}) {
  const [conP03, setConP03] = useState(false);
  const [lista, setLista] = useState<FacturaDeOrigen[]>([]);
  const clave = origenIds ? origenIds.join(',') : '*';

  useEffect(() => {
    let vivo = true;
    void p03Disponible().then((v) => { if (vivo) setConP03(v); });
    return () => { vivo = false; };
  }, []);

  const reload = useCallback(async () => {
    if (!conP03) return;
    try { setLista(await facturasPorRegistrar(clave === '*' ? undefined : clave.split(',').filter(Boolean))); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron leer las facturas por registrar', 'error'); }
  }, [conP03, clave]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['adjuntos_directos', 'retencion_documento_origenes'], () => { void reload(); }, { enabled: conP03 });

  async function abrir(f: FacturaDeOrigen) {
    try { previewArchivo(await urlFacturaDeOrigen(f), f.nombre); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir la factura', 'error'); }
  }

  if (!conP03 || !lista.length) return null;

  return (
    <div className="card" style={{ marginTop: '.6rem' }}>
      <strong style={{ fontSize: '.9rem' }}>{titulo} <span className="badge">{lista.length}</span></strong>
      <ul style={{ listStyle: 'none', margin: '.4rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
        {lista.map((f) => (
          <li key={f.adjuntoId} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', minWidth: 0 }}>
              <span>{(f.contentType ?? '').startsWith('image/') ? '🖼' : '📄'}</span>
              <button type="button" className="btn btn-sm btn-ghost" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => abrir(f)} title="Ver la factura">{f.nombre}</button>
              <small className="muted">{dateTime(f.subidoEn)}{f.subidoPor ? ` · ${f.subidoPor}` : ''}</small>
            </span>
            {puedeRegistrar && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => onRegistrar(f)}>Registrar factura</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
