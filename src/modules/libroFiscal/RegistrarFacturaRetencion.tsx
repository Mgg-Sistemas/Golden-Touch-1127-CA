/* ============================================================
   Golden Touch · Libro fiscal · Registrar una FACTURA con varias líneas (v8 · VF)

   Una factura (cabecera) y varias líneas de impuesto (IVA, ISLR, ISAE, etc.).
   El cálculo de cada línea es el puro de retencionesCalculo; el registro es
   atómico vía registrarFactura (retencion_factura_registrar). Pieza aparte,
   lista para enchufar en la pantalla cuando BD aplique VF y V2. No se importa
   todavía desde LibroFiscal/RetencionesPage.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import {
  CONFIG_RETENCION_DEFECTO, DIRECCIONES, SUJETOS, TIPOS_IMPUESTO,
  calcularIgtf, calcularRetencionIslr, calcularRetencionIva, calcularRetencionLocal, enBolivares,
  labelImpuesto, motivoNoPuedePracticar, periodoDe, puedePracticar, quincenaDe,
  type CalculoRetencion, type ConceptoRetencion, type ConfigRetencion, type DireccionRetencion,
  type MotivosIvaCien, type SujetoRetenido, type TipoImpuesto,
} from './retencionesCalculo';
import { getConfigRetencion, listConceptos, type DocKind } from './retencionesFiscal.repository';
import { esCeroSinMotivo } from './motivoCero';
import { sugerirSujetoPorRif } from './residenciaSujeto';
import {
  registrarFactura, type FacturaNueva, type LineaFacturaNueva,
} from './retencionFacturas.repository';

const nDec = (v: string) => Number(String(v).replace(',', '.')) || 0;
const hoyIso = () => new Date().toISOString().slice(0, 10);
const money = (n: number, moneda: string) => {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
};

/** Con qué datos se abre el registro (desde una OC/compra, o vacío para manual). */
export interface SemillaFactura {
  direccion?: DireccionRetencion;
  docKind?: DocKind;
  docId?: string | null;
  contraparteId?: string | null;
  contraparteNombre?: string | null;
  contraparteRif?: string | null;
  moneda?: string;
  facturaNro?: string | null;
  facturaFecha?: string | null;
  facturaTotal?: number | null;
  /** IVA de la factura (base de la línea de IVA). */
  iva?: number | null;
  /** Base imponible sugerida (total sin IVA ni IGTF). */
  baseImponible?: number | null;
}

interface LineaUI {
  id: number;
  tipo: TipoImpuesto;
  sujeto: SujetoRetenido;
  conceptoId: string;
  baseStr: string;
  ivaStr: string;
  pctStr: string;
  montoStr: string;
  motivos: MotivosIvaCien;
  descripcion: string;
}

let semilla = 0;
const nuevaLinea = (over: Partial<LineaUI> = {}): LineaUI => ({
  id: (semilla += 1), tipo: 'iva', sujeto: 'pj_domiciliada', conceptoId: '',
  baseStr: '0', ivaStr: '0', pctStr: '', montoStr: '', motivos: {}, descripcion: '', ...over,
});

export function RegistrarFacturaRetencion({ semilla: s = {}, actor, actorName, onClose, onHecho }: {
  semilla?: SemillaFactura;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onHecho: (res: Awaited<ReturnType<typeof registrarFactura>>) => void;
}) {
  const [config, setConfig] = useState<ConfigRetencion>(CONFIG_RETENCION_DEFECTO);
  const [conceptos, setConceptos] = useState<ConceptoRetencion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [direccion, setDireccion] = useState<DireccionRetencion>(s.direccion ?? 'practicada');
  const [contraparte, setContraparte] = useState(s.contraparteNombre ?? '');
  const [rif, setRif] = useState(s.contraparteRif ?? '');
  const [moneda, setMoneda] = useState(s.moneda ?? 'Bs');
  const [tasaStr, setTasaStr] = useState('');
  const [facturaNro, setFacturaNro] = useState(s.facturaNro ?? '');
  const [facturaControl, setFacturaControl] = useState('');
  const [facturaFecha, setFacturaFecha] = useState(s.facturaFecha ?? hoyIso());
  const [facturaTotal, setFacturaTotal] = useState(String(s.facturaTotal ?? 0));
  const [nota, setNota] = useState('');
  const [lineas, setLineas] = useState<LineaUI[]>(() => [nuevaLinea({
    tipo: 'iva', baseStr: String(s.baseImponible ?? 0), ivaStr: String(s.iva ?? 0),
  })]);

  useEffect(() => {
    void Promise.all([getConfigRetencion(), listConceptos(true)])
      .then(([c, cs]) => { setConfig(c); setConceptos(cs); })
      .catch((e) => setError(e instanceof Error ? `No se pudo leer la configuración: ${e.message}` : 'No se pudo leer la configuración.'));
  }, []);

  const esManual = direccion === 'recibida';
  const tasa = nDec(tasaStr);

  const setLinea = useCallback((id: number, patch: Partial<LineaUI>) => {
    setLineas((xs) => xs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  /** El cálculo puro de una línea (practicada); en recibida se copian los números a mano. */
  const calculoDe = useCallback((l: LineaUI): CalculoRetencion => {
    const base = nDec(l.baseStr);
    const concepto = conceptos.find((c) => c.id === l.conceptoId) ?? null;
    if (l.tipo === 'iva') return calcularRetencionIva({ baseImponible: base, ivaFactura: nDec(l.ivaStr), motivos: l.motivos }, config);
    if (l.tipo === 'islr') return calcularRetencionIslr({ montoPago: base, concepto }, config);
    if (l.tipo === 'igtf') return calcularIgtf({ montoPago: base, enDivisas: true }, config);
    return calcularRetencionLocal({ montoPago: base, concepto }, l.tipo);
  }, [conceptos, config]);

  const montoDe = useCallback((l: LineaUI): number => (esManual
    ? (nDec(l.montoStr) || Math.round(nDec(l.baseStr) * nDec(l.pctStr)) / 100)
    : calculoDe(l).montoRetenido), [esManual, calculoDe]);
  const pctDe = (l: LineaUI) => (esManual ? nDec(l.pctStr) : calculoDe(l).porcentaje);

  const totalRetenido = useMemo(() => lineas.reduce((a, l) => a + montoDe(l), 0), [lineas, montoDe]);

  const conceptosDeLinea = (l: LineaUI) => conceptos.filter((c) => c.tipo === l.tipo && (c.sujeto === l.sujeto || c.sujeto === 'todos'));

  function validar(): string | null {
    if (!facturaNro.trim()) return 'Indica el número de la factura.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(facturaFecha)) return 'Indica la fecha de la factura.';
    if (moneda !== 'Bs' && !(tasa > 0)) return 'Indica la tasa para llevar los montos a bolívares.';
    if (!lineas.length) return 'Agrega al menos una línea de impuesto.';
    for (const l of lineas) {
      if (direccion === 'practicada') {
        const m = motivoNoPuedePracticar(l.tipo, config);
        if (m) return `${labelImpuesto(l.tipo)}: ${m}`;
      }
      const monto = montoDe(l);
      if (monto < 0) return `${labelImpuesto(l.tipo)}: el monto no puede ser negativo.`;
      if (esCeroSinMotivo(pctDe(l), monto, l.descripcion)) return `${labelImpuesto(l.tipo)}: un 0 % se registra solo con su motivo.`;
    }
    return null;
  }

  async function emitir() {
    const falla = validar();
    if (falla) { setError(falla); return; }
    setError(null); setSaving(true);
    try {
      const periodo = periodoDe(facturaFecha);
      const facturaNueva: FacturaNueva = {
        direccion, docKind: s.docKind ?? 'manual', docId: s.docId ?? null,
        contraparteId: s.contraparteId ?? null, contraparteRif: rif.trim() || null, contraparteNombre: contraparte.trim() || null,
        facturaNro: facturaNro.trim() || null, facturaControl: facturaControl.trim() || null,
        facturaFecha, facturaTotal: nDec(facturaTotal) || null,
        moneda, tasa: moneda === 'Bs' ? null : tasa, periodo,
        nota: nota.trim() || null, actor, actorName,
      };
      const lineasNuevas: LineaFacturaNueva[] = lineas.map((l) => {
        const calc = calculoDe(l);
        const monto = montoDe(l);
        return {
          tipo: l.tipo,
          base: esManual ? nDec(l.baseStr) : calc.baseImponible,
          porcentaje: pctDe(l),
          monto,
          sustraendo: esManual ? null : calc.sustraendo,
          ivaAlicuota: l.tipo === 'iva' ? (esManual ? null : calc.alicuota) : null,
          ivaMonto: l.tipo === 'iva' ? (esManual ? nDec(l.ivaStr) : calc.impuesto) : null,
          moneda,
          tasa: moneda === 'Bs' ? null : tasa,
          baseBs: enBolivares(esManual ? nDec(l.baseStr) : calc.baseImponible, moneda, tasa) || null,
          montoBs: enBolivares(monto, moneda, tasa) || null,
          conceptoCodigo: l.tipo === 'islr' ? (l.conceptoId.split(':')[0] || null) : null,
          conceptoNombre: conceptos.find((c) => c.id === l.conceptoId)?.nombre ?? null,
          descripcion: l.descripcion.trim() || null,
          quincena: l.tipo === 'iva' ? quincenaDe(facturaFecha) : null,
          comprobanteNro: esManual ? null : null,
          fecha: facturaFecha,
        };
      });
      const res = await registrarFactura(facturaNueva, lineasNuevas);
      notify(`Factura ${facturaNro} registrada · ${res.lineas.length} línea(s) · ${money(totalRetenido, moneda)}`, 'success', { link: '#/app/retenciones' });
      onHecho(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la factura.');
      setSaving(false);
    }
  }

  return (
    <Modal title="🧾 Registrar retención por factura" size="xl" onClose={() => !saving && onClose()}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void emitir()} disabled={saving || !lineas.length}>
            {saving ? 'Guardando…' : `Registrar · ${money(totalRetenido, moneda)}`}
          </button>
        </>
      )}>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      <div className="form-row">
        <label>¿Quién retuvo?</label>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {DIRECCIONES.map((d) => (
            <label key={d.key} className="card" style={{
              margin: 0, padding: '.45rem .8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem',
              borderColor: direccion === d.key ? 'var(--primary)' : 'var(--border)',
            }}>
              <input type="radio" checked={direccion === d.key} onChange={() => setDireccion(d.key)} />
              <span style={{ fontWeight: 600 }}>{d.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '2 1 240px' }}>
          <label>{direccion === 'recibida' ? 'Quién nos retuvo' : 'A quién le retenemos'}</label>
          <input className="input" value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder="Razón social" />
        </div>
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>RIF</label>
          <input className="input mono" value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-XXXXXXXX-X" />
        </div>
        <div className="form-row" style={{ flex: '0 1 110px' }}>
          <label>Moneda</label>
          <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="Bs">Bs</option>
            <option value="USD">$</option>
          </select>
        </div>
        {moneda !== 'Bs' && (
          <div className="form-row" style={{ flex: '0 1 140px' }}>
            <label>Tasa (Bs por $)</label>
            <input className="input mono" value={tasaStr} onChange={(e) => setTasaStr(e.target.value)} inputMode="decimal" />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '1 1 140px' }}>
          <label>N° de factura</label>
          <input className="input mono" value={facturaNro} onChange={(e) => setFacturaNro(e.target.value)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 120px' }}>
          <label>N° de control</label>
          <input className="input mono" value={facturaControl} onChange={(e) => setFacturaControl(e.target.value)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>Fecha de la factura</label>
          <input className="input" type="date" value={facturaFecha} onChange={(e) => setFacturaFecha(e.target.value)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 130px' }}>
          <label>Total de la factura</label>
          <input className="input mono" value={facturaTotal} onChange={(e) => setFacturaTotal(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      {/* Las líneas de impuesto */}
      <div className="card" style={{ marginTop: '.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
          <strong style={{ fontSize: '.9rem' }}>Líneas de impuesto</strong>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLineas((xs) => [...xs, nuevaLinea()])}>+ Agregar línea</button>
        </div>
        {lineas.map((l) => {
          const calc = calculoDe(l);
          const monto = montoDe(l);
          const sugerido = l.tipo === 'islr' ? sugerirSujetoPorRif(rif) : null;
          const noPuede = direccion === 'practicada' && !puedePracticar(l.tipo, config);
          return (
            <div key={l.id} className="card" style={{ margin: '.3rem 0', background: 'var(--bg-2)' }}>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-row" style={{ margin: 0, flex: '0 1 130px' }}>
                  <label>Impuesto</label>
                  <select className="select" value={l.tipo} onChange={(e) => setLinea(l.id, { tipo: e.target.value as TipoImpuesto })}>
                    {TIPOS_IMPUESTO.map((t) => <option key={t.key} value={t.key}>{t.corto}</option>)}
                  </select>
                </div>
                {l.tipo === 'islr' && (
                  <div className="form-row" style={{ margin: 0, flex: '1 1 180px' }}>
                    <label>Sujeto {sugerido && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLinea(l.id, { sujeto: sugerido.sujeto })}>por RIF</button>}</label>
                    <select className="select" value={l.sujeto} onChange={(e) => setLinea(l.id, { sujeto: e.target.value as SujetoRetenido })}>
                      {SUJETOS.filter((x) => x.key !== 'todos').map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </div>
                )}
                {l.tipo !== 'iva' && l.tipo !== 'igtf' && (
                  <div className="form-row" style={{ margin: 0, flex: '2 1 200px' }}>
                    <label>Concepto</label>
                    <select className="select" value={l.conceptoId} onChange={(e) => setLinea(l.id, { conceptoId: e.target.value })}>
                      <option value="">—</option>
                      {conceptosDeLinea(l).map((c) => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.nombre} — {c.porcentaje}%</option>)}
                    </select>
                  </div>
                )}
                <div className="form-row" style={{ margin: 0, flex: '1 1 120px' }}>
                  <label>{l.tipo === 'iva' ? 'Base imponible' : 'Monto del pago'}</label>
                  <input className="input mono" value={l.baseStr} onChange={(e) => setLinea(l.id, { baseStr: e.target.value })} inputMode="decimal" />
                </div>
                {l.tipo === 'iva' && (
                  <div className="form-row" style={{ margin: 0, flex: '1 1 110px' }}>
                    <label>IVA de la factura</label>
                    <input className="input mono" value={l.ivaStr} onChange={(e) => setLinea(l.id, { ivaStr: e.target.value })} inputMode="decimal" />
                  </div>
                )}
                {esManual && (
                  <>
                    <div className="form-row" style={{ margin: 0, flex: '0 1 90px' }}>
                      <label>% ret.</label>
                      <input className="input mono" value={l.pctStr} onChange={(e) => setLinea(l.id, { pctStr: e.target.value })} inputMode="decimal" />
                    </div>
                    <div className="form-row" style={{ margin: 0, flex: '1 1 120px' }}>
                      <label>Monto retenido</label>
                      <input className="input mono" value={l.montoStr} onChange={(e) => setLinea(l.id, { montoStr: e.target.value })} inputMode="decimal" />
                    </div>
                  </>
                )}
                <div style={{ flex: '1 1 120px', textAlign: 'right' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>Retenido</div>
                  <div className="mono" style={{ fontWeight: 700, color: monto > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{money(monto, moneda)}</div>
                </div>
                {lineas.length > 1 && (
                  <button type="button" className="btn btn-sm btn-ghost" title="Quitar la línea" onClick={() => setLineas((xs) => xs.filter((x) => x.id !== l.id))}>✕</button>
                )}
              </div>
              {noPuede && <small className="hint" style={{ color: 'var(--warning)' }}>{motivoNoPuedePracticar(l.tipo, config)}</small>}
              {!esManual && <small className="hint muted">{calc.explicacion}</small>}
              {monto === 0 && (
                <div className="form-row" style={{ margin: '.3rem 0 0' }}>
                  <label style={{ color: 'var(--warning)' }}>Motivo del 0 % (obligatorio)</label>
                  <input className="input" value={l.descripcion} onChange={(e) => setLinea(l.id, { descripcion: e.target.value })}
                    placeholder="Ej.: el pago no supera el mínimo exento" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="form-row">
        <label>Nota de la factura</label>
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: p. ej. la compra incluye 2 facturas" />
      </div>
    </Modal>
  );
}
