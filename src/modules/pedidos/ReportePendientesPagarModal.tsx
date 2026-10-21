/* ============================================================
   Golden Touch · Compras · «Pendientes por pagar» (elegir salida)

   El botón «Pendientes por pagar» de Pedidos abre este modal: lo que hay por
   pagar (compras directas, OC, servicios, servicios directos y, aparte, las
   cuentas a crédito) se puede SACAR de tres maneras según para qué se necesite:
   PDF con 🖨 Imprimir, Excel con vista previa, y WhatsApp con el texto en
   emojis para copiar o compartir.

   Los datos se leen UNA vez al abrir y las tres salidas usan esa misma lectura:
   así lo que se imprime, lo que se exporta y lo que se manda por el chat dicen
   exactamente lo mismo (mismos renglones, mismos montos, misma tasa).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { money } from '@/shared/lib/format';
import { cargarPendientesPorPagar, type DatosPendientesPorPagar } from '@/modules/tesoreria/pendientesPorPagar';
import { descargarPendientesPorPagarPdf } from '@/modules/tesoreria/ordenesPorPagarPdf';
import { descargarPendientesPorPagarExcel } from '@/modules/tesoreria/pendientesPorPagarExcel';
import { textoPendientesPorPagarWhatsapp } from '@/modules/tesoreria/pendientesPorPagarWhatsapp';

type Salida = 'pdf' | 'excel';

export function ReportePendientesPagarModal({ onClose }: { onClose: () => void }) {
  const [datos, setDatos] = useState<DatosPendientesPorPagar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState<Salida | null>(null);
  const [verWhatsapp, setVerWhatsapp] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarPendientesPorPagar()
      .then((d) => { if (vivo) setDatos(d); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte'); });
    return () => { vivo = false; };
  }, []);

  const hayAlgo = !!datos && (datos.segmentos.length > 0 || datos.credito !== null);
  const textoWhatsapp = useMemo(() => (datos ? textoPendientesPorPagarWhatsapp(datos) : ''), [datos]);

  async function generar(salida: Salida) {
    if (!datos) return;
    setGenerando(salida);
    try {
      if (salida === 'pdf') await descargarPendientesPorPagarPdf(datos);
      else await descargarPendientesPorPagarExcel(datos);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el reporte', 'error');
    } finally { setGenerando(null); }
  }

  return (
    <Modal
      title="🧾 Pendientes por pagar"
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      {error ? (
        <p className="muted">{error}</p>
      ) : datos === null ? (
        <p className="muted">Cargando lo pendiente por pagar…</p>
      ) : verWhatsapp ? (
        <div className="form-row">
          <button type="button" className="btn btn-ghost" onClick={() => setVerWhatsapp(false)}>
            ← Volver al reporte
          </button>
          <CompartirWhatsapp texto={textoWhatsapp} />
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            Todo lo pendiente por pagar, con a quién, cuánto y por cuál método. Elige cómo sacar el reporte;
            las tres salidas llevan el mismo contenido.
          </p>

          <ul style={{ margin: '0 0 .75rem', paddingLeft: '1.1rem' }}>
            {datos.segmentos.map((s) => (
              <li key={s.clave}>
                <strong>{s.titulo}</strong>{' '}
                <span className="muted">— {s.filas.length} ítem(s) · {money(s.subUsd)}</span>
              </li>
            ))}
            {datos.credito && (
              <li>
                <strong>{datos.credito.titulo}</strong>{' '}
                <span className="muted">— {datos.credito.filas.length} cuenta(s) · {money(datos.credito.subUsd)} (aparte; no suman al total)</span>
              </li>
            )}
          </ul>

          {datos.segmentos.length > 0 && (
            <p style={{ margin: '0 0 1rem' }}>
              <strong>Total por pagar:</strong> {datos.totCant} ítem(s) · {money(datos.totUsd)}
              {datos.tasa > 0 && <> · Bs {datos.totBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
            </p>
          )}

          {!hayAlgo && <p className="muted" style={{ marginTop: 0 }}>No hay pendientes por pagar por ahora.</p>}

          <div className="actions" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-grande"
              disabled={generando !== null}
              onClick={() => void generar('pdf')}
              title="Vista previa del PDF, con 🖨 Imprimir (imprime dentro del sistema) y ⬇ Descargar"
            >
              📄 {generando === 'pdf' ? 'Generando…' : 'PDF / Imprimir'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-grande"
              disabled={generando !== null || !hayAlgo}
              onClick={() => void generar('excel')}
              title="Excel con los estilos del sistema: un bloque por segmento, subtotales, total general y las cuentas a crédito aparte"
            >
              📊 {generando === 'excel' ? 'Generando…' : 'Excel'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-grande"
              disabled={!hayAlgo}
              onClick={() => setVerWhatsapp(true)}
              title="Texto con emojis, listo para copiar o compartir por WhatsApp"
            >
              💬 WhatsApp
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
