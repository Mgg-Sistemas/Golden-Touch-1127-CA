/* ============================================================
   Golden Touch · Compras · «Cierre diario»

   El botón «Cierre diario» de Pedidos abre este modal: un RESUMEN de cuatro
   números —Pedidos, Órdenes pendientes por aprobar, Órdenes por pagar y Órdenes
   pagadas— que se filtra por día, semana, mes o un rango de fechas, y se saca en
   PDF (con 🖨 Imprimir), Excel o WhatsApp. Cada salida lleva el período y la
   fecha y hora en que se imprime.

   Las órdenes se leen UNA vez al abrir (solo las columnas necesarias) y el filtro
   se aplica en pantalla: cambiar de día o de mes no vuelve a pedir nada.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { listOrdenesCierreDiario, listCotizacionesCierreDiario } from './pedidos.repository';
import { listUsuarios } from '@/modules/usuarios/usuarios.repository';
import {
  TITULOS_CIERRE, calcularCierre, etiquetaPeriodo, hoyCaracas, momentoImpresion, periodoDe,
  type FilaCierre, type FilaCotizacionCierre, type ModoPeriodo,
} from './cierreDiario';
import { descargarCierreDiarioPdf } from './cierreDiarioPdf';
import { descargarCierreDiarioExcel } from './cierreDiarioExcel';
import { textoCierreDiarioWhatsapp } from './cierreDiarioWhatsapp';
import { crearMapaPersonasCompras } from './personasCompras';

type Salida = 'pdf' | 'excel';

const MODOS: { modo: ModoPeriodo; etiqueta: string }[] = [
  { modo: 'dia', etiqueta: 'Día' },
  { modo: 'semana', etiqueta: 'Semana' },
  { modo: 'mes', etiqueta: 'Mes' },
  { modo: 'rango', etiqueta: 'Rango' },
];

export function CierreDiarioModal({ onClose }: { onClose: () => void }) {
  const hoy = hoyCaracas();
  const [filas, setFilas] = useState<FilaCierre[] | null>(null);
  const [cotizaciones, setCotizaciones] = useState<FilaCotizacionCierre[] | null>(null);
  const [personasMap, setPersonasMap] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPeriodo>('dia');
  const [fecha, setFecha] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [hasta, setHasta] = useState(hoy);
  const [generando, setGenerando] = useState<Salida | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      listOrdenesCierreDiario(),
      listCotizacionesCierreDiario(),
      listUsuarios().catch(() => []),
    ])
      .then(([f, c, usrs]) => {
        if (!vivo) return;
        setFilas(f);
        setCotizaciones(c);
        setPersonasMap(crearMapaPersonasCompras(usrs));
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el cierre');
      });
    return () => { vivo = false; };
  }, []);

  const periodo = useMemo(
    () => (modo === 'mes' ? periodoDe('mes', mes || hoy.slice(0, 7)) : periodoDe(modo, fecha || hoy, hasta || fecha || hoy)),
    [modo, fecha, mes, hasta, hoy],
  );
  const resumen = useMemo(
    () => calcularCierre(filas ?? [], periodo, cotizaciones ?? [], personasMap),
    [filas, periodo, cotizaciones, personasMap],
  );

  async function generar(salida: Salida) {
    setGenerando(salida);
    try {
      // La fecha y hora de impresión son las de ESTE momento.
      const ahora = new Date();
      if (salida === 'pdf') await descargarCierreDiarioPdf(resumen, periodo, ahora);
      else await descargarCierreDiarioExcel(resumen, periodo, ahora);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el cierre', 'error');
    } finally { setGenerando(null); }
  }

  return (
    <Modal
      title="📊 Cierre diario"
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      {error ? (
        <p className="muted">{error}</p>
      ) : filas === null ? (
        <p className="muted">Cargando las órdenes…</p>
      ) : whatsapp !== null ? (
        <div className="form-row">
          <button type="button" className="btn btn-ghost" onClick={() => setWhatsapp(null)}>
            ← Volver al cierre
          </button>
          <CompartirWhatsapp texto={whatsapp} />
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            Resumen de Compras. Elige el período; cada cifra cuenta lo que pasó en esas fechas
            (con <strong>Hoy</strong>, solo lo de hoy).
          </p>

          <div className="actions" style={{ flexWrap: 'wrap', gap: '.4rem', marginBottom: '.6rem' }}>
            {MODOS.map((m) => (
              <button
                key={m.modo}
                type="button"
                className={modo === m.modo ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => setModo(m.modo)}
              >
                {m.etiqueta}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Ver solo lo de hoy"
              onClick={() => { setModo('dia'); setFecha(hoy); }}
            >
              Hoy
            </button>
          </div>

          <div className="form-grid" style={{ marginBottom: '.6rem' }}>
            {modo === 'mes' ? (
              <div className="form-row">
                <label>Mes</label>
                <input className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label>{modo === 'rango' ? 'Desde' : modo === 'semana' ? 'Cualquier día de la semana' : 'Día'}</label>
                  <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
                {modo === 'rango' && (
                  <div className="form-row">
                    <label>Hasta</label>
                    <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>

          <p className="muted" style={{ margin: '0 0 .5rem', fontSize: '.85rem' }}>
            <strong>Período:</strong> {etiquetaPeriodo(periodo, hoy)}
          </p>

          <ul style={{ listStyle: 'none', margin: '0 0 .6rem', padding: 0 }}>
            {TITULOS_CIERRE.map((t) => (
              <li
                key={t.clave}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '.45rem 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}
              >
                <span>{t.emoji} {t.titulo}</span>
                <strong className="mono" style={{ fontSize: '1.25rem' }}>{resumen[t.clave]}</strong>
              </li>
            ))}
          </ul>

          <div style={{ margin: '1rem 0 .8rem', borderTop: '1px solid var(--border, rgba(255,255,255,.08))', paddingTop: '.75rem' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.5rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span>👥 Por analista</span>
            </div>
            {resumen.analistas.length === 0 ? (
              <p className="muted" style={{ margin: '0 0 .4rem', fontSize: '.82rem' }}>
                Sin cotizaciones ni órdenes finalizadas en este período.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '.4rem' }}>
                {resumen.analistas.map((a) => (
                  <div
                    key={a.email}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '.5rem',
                      padding: '.45rem .65rem',
                      background: 'var(--surface-hover, rgba(255,255,255,.03))',
                      borderRadius: '6px',
                      border: '1px solid var(--border, rgba(255,255,255,.06))',
                    }}
                  >
                    <strong style={{ fontSize: '.88rem' }}>{a.nombre}</strong>
                    <div style={{ display: 'flex', gap: '1.2rem', fontSize: '.82rem' }}>
                      <span>Cotizaciones realizadas: <strong className="mono" style={{ fontSize: '.95rem' }}>{a.cotizaciones}</strong></span>
                      <span>Órdenes finalizadas: <strong className="mono" style={{ fontSize: '.95rem' }}>{a.finalizadas}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="muted" style={{ margin: '0 0 1rem', fontSize: '.78rem' }}>
            La fecha y la hora de impresión se anotan al generar el reporte (ahora: {momentoImpresion()}).
          </p>

          <div className="actions" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-grande"
              disabled={generando !== null}
              onClick={() => void generar('pdf')}
              title="Vista previa del PDF, con 🖨 Imprimir y ⬇ Descargar"
            >
              📄 {generando === 'pdf' ? 'Generando…' : 'PDF / Imprimir'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-grande"
              disabled={generando !== null}
              onClick={() => void generar('excel')}
              title="Excel con los estilos del sistema"
            >
              📊 {generando === 'excel' ? 'Generando…' : 'Excel'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-grande"
              onClick={() => setWhatsapp(textoCierreDiarioWhatsapp(resumen, periodo, new Date()))}
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
