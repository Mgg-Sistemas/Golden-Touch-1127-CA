/* ============================================================
   Golden Touch · Compras · «Compras por estado» (elegir salida)

   Un solo botón en la página de Pedidos abre este modal: las cuatro
   listas del ciclo pendiente de OC se pueden SACAR de tres maneras
   según para qué se necesiten.

   POR QUÉ UN MODAL Y NO TRES BOTONES: son tres salidas del MISMO
   dato y se pisan entre sí en la fila de acciones (Histórico ·
   Pendientes por pagar…). El modal deja claro que es un reporte, dice
   cuántas órdenes trae antes de generarlo, y cada salida sigue su
   camino de siempre: PDF con 🖨 Imprimir, Excel con vista previa, y
   WhatsApp con el texto en emojis para copiar o compartir.

   Las órdenes se leen UNA vez al abrir y las tres salidas usan esa
   misma lectura: así lo que se imprime, lo que se exporta y lo que se
   manda por el chat dicen exactamente lo mismo.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import type { Orden } from '@/shared/lib/types';
import { listOrdenesReporteCompras } from './pedidos.repository';
import { agruparReporteCompras } from './reporteCompras';
import { descargarReporteComprasPdf } from './reporteComprasPdf';
import { descargarReporteComprasExcel } from './reporteComprasExcel';
import { textoReporteComprasWhatsapp } from './reporteComprasWhatsapp';

type Salida = 'pdf' | 'excel';

export function ReporteComprasModal({ onClose }: { onClose: () => void }) {
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [tasa, setTasa] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState<Salida | null>(null);
  const [verWhatsapp, setVerWhatsapp] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [os, t] = await Promise.all([
          listOrdenesReporteCompras(),
          getTasaHoy().catch(() => ({ usd: null, eur: null, fecha: null })),
        ]);
        if (!vivo) return;
        setOrdenes(os);
        setTasa(Number(t?.usd) || 0);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte');
      }
    })();
    return () => { vivo = false; };
  }, []);

  const grupos = useMemo(() => agruparReporteCompras(ordenes ?? []), [ordenes]);
  const total = grupos.reduce((a, g) => a + g.filas.length, 0);
  const textoWhatsapp = useMemo(
    () => (ordenes ? textoReporteComprasWhatsapp(ordenes) : ''),
    [ordenes],
  );

  async function generar(salida: Salida) {
    if (!ordenes) return;
    setGenerando(salida);
    try {
      if (salida === 'pdf') await descargarReporteComprasPdf(ordenes);
      else await descargarReporteComprasExcel(ordenes, tasa);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el reporte', 'error');
    } finally { setGenerando(null); }
  }

  return (
    <Modal
      title="📋 Compras por estado"
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      {error ? (
        <p className="muted">{error}</p>
      ) : ordenes === null ? (
        <p className="muted">Cargando las órdenes…</p>
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
            Órdenes de compra del ciclo pendiente, en cuatro renglones. Elige cómo sacar el reporte;
            las tres salidas llevan el mismo contenido.
          </p>

          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem' }}>
            {grupos.map((g) => (
              <li key={g.estado}>
                <strong>{g.titulo}</strong>{' '}
                <span className="muted">— {g.filas.length} orden(es)</span>
              </li>
            ))}
          </ul>

          {total === 0 && (
            <p className="muted" style={{ marginTop: 0 }}>No hay órdenes en estos estados por ahora.</p>
          )}

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
              disabled={generando !== null || total === 0}
              onClick={() => void generar('excel')}
              title="Excel con los estilos del sistema: un bloque por estado, subtotales y total general"
            >
              📊 {generando === 'excel' ? 'Generando…' : 'Excel'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-grande"
              disabled={total === 0}
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
