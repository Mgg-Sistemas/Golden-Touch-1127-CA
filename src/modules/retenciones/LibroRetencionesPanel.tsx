/* ============================================================
   Golden Touch · Libro de retenciones e impuestos

   Golden Touch NO es agente de retención. Lo que pasa de verdad es que sus
   CLIENTES le retienen —IVA, ISLR, municipal— y le entregan un comprobante, y
   que al pagar en divisas le cobran el IGTF. Ese papel vale plata: la retención
   que nos practican es un ANTICIPO DE IMPUESTO que se descuenta en la
   declaración, y el que no se registra se pierde.

   Por eso esta pantalla arranca mostrando «Nos la practicaron» y el número
   grande de arriba es lo que hay a favor. «La practicamos» queda para el caso
   excepcional (una ordenanza municipal, el ISLR de un servicio), y ahí sí el
   sistema genera el comprobante correlativo AAAAMM + 8 dígitos.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { mensajeError } from '@/shared/lib/errores';
import { norm } from '@/shared/lib/texto';
import { supabase } from '@/shared/lib/supabase';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { listContrapartes, type Contraparte } from '@/modules/tesoreria/contrapartes.repository';
import {
  calcularIgtf, calcularIslr, enBolivares, errorRetencionIva, etiquetaQuincena, formatearRif,
  ivaDeFactura, limiteEntregaComprobante, porcentajeIslr, resumirLibro, retencionIva,
  retencionPorAlicuota, rifValido, ROL_AYUDA, ROL_LABEL, SUJETO_LABEL, TIPO_RETENCION_LABEL,
  MOTIVO_IVA_100,
  type ConceptoIslr, type MotivoIva100, type RolRetencion, type SujetoRetenido, type TipoRetencion,
  puedeRetenerLaEmpresa, motivoNoPuedeRetener,
} from './calculosRetenciones';
import {
  anularRetencion, getParametrosFiscales, guardarParametrosFiscales, listConceptosIslr, listLibro,
  marcarDeclaradas, reactivarRetencion, registrarRetencion, urlComprobante,
  type EstadoRetencion, type ParametrosFiscales, type RetencionLibro,
} from './libroRetenciones.repository';
import { descargarComprobanteRetencionPdf, descargarLibroRetencionesPdf } from './retencionesPdf';

const TIPOS: TipoRetencion[] = ['IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF'];

const bs = (v: number | null | undefined) =>
  `Bs ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mon = (v: number | null | undefined, moneda: string) =>
  `${moneda === 'Bs' ? 'Bs' : '$'} ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fechaCorta(f: string | null | undefined): string {
  const d = String(f ?? '').slice(0, 10);
  if (d.length < 10) return '—';
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const primeroDelMes = () => `${hoyISO().slice(0, 7)}-01`;

export function LibroRetencionesPanel({ puedeCargar, actor, actorName }: {
  /** La tabla `retenciones` gatea escritura con is_admin() or puede('tesoreria'). */
  puedeCargar: boolean;
  actor: string;
  actorName: string | null;
}) {
  const [filas, setFilas] = useState<RetencionLibro[]>([]);
  const [params, setParams] = useState<ParametrosFiscales | null>(null);
  const [conceptos, setConceptos] = useState<ConceptoIslr[]>([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [verParams, setVerParams] = useState(false);
  const [anular, setAnular] = useState<RetencionLibro | null>(null);

  const [fRol, setFRol] = useState<RolRetencion | ''>('sufrida');
  const [fTipo, setFTipo] = useState<TipoRetencion | ''>('');
  const [fEstado, setFEstado] = useState<EstadoRetencion | ''>('');
  const [fDesde, setFDesde] = useState(primeroDelMes);
  const [fHasta, setFHasta] = useState(hoyISO);
  const [fTexto, setFTexto] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [ls, ps, cs] = await Promise.all([
        listLibro({ desde: fDesde || undefined, hasta: fHasta || undefined }),
        getParametrosFiscales(),
        listConceptosIslr().catch(() => [] as ConceptoIslr[]),
      ]);
      setFilas(ls); setParams(ps); setConceptos(cs);
    } catch (e) {
      // Un libro fiscal en blanco por un error de red se lee como «no hay nada»,
      // que es justo la conclusión equivocada.
      toast(mensajeError(e, 'No se pudo cargar el libro de retenciones'), 'error');
    }
  }, [fDesde, fHasta]);

  useEffect(() => { setLoading(true); void cargar().finally(() => setLoading(false)); }, [cargar]);
  useRealtime(['retenciones'], () => { void cargar(); });

  const filtradas = useMemo(() => {
    const txt = norm(fTexto);
    return filas.filter((r) => {
      if (fRol && r.rol !== fRol) return false;
      if (fTipo && r.tipo !== fTipo) return false;
      if (fEstado && r.estado !== fEstado) return false;
      if (txt) {
        const hay = norm([r.razon_social, r.rif, r.comprobante_nro, r.factura_nro, r.concepto, r.descripcion].join(' '));
        if (!hay.includes(txt)) return false;
      }
      return true;
    });
  }, [filas, fRol, fTipo, fEstado, fTexto]);

  const resumen = useMemo(() => resumirLibro(filtradas), [filtradas]);
  const porDeclarar = useMemo(
    () => filtradas.filter((r) => r.rol === 'practicada' && r.estado === 'registrada').map((r) => r.id),
    [filtradas],
  );

  async function declarar() {
    try {
      const n = await marcarDeclaradas(porDeclarar, actor);
      toast(n ? `${n} retención(es) marcadas como declaradas` : 'No había nada por declarar', n ? 'success' : 'info');
      await cargar();
    } catch (e) { toast(mensajeError(e, 'No se pudo marcar como declaradas'), 'error'); }
  }

  async function abrirArchivo(r: RetencionLibro) {
    if (!r.comprobante_path) return;
    try { previewArchivo(await urlComprobante(r.comprobante_path), r.comprobante_nombre || 'comprobante'); }
    catch { toast('No se pudo abrir el comprobante', 'error'); }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
        <strong>Golden Touch no es agente de retención.</strong>{' '}
        <span className="muted">
          Lo normal es que le retengan: cada comprobante que entra es un <strong>anticipo de impuesto</strong> que
          se descuenta en la declaración. El IGTF que le cobran al pagar en divisas no se recupera: es costo.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Tarjeta titulo="A favor (nos retuvieron)" valor={bs(resumen.aFavorBs)} color="var(--success)"
          ayuda="Se descuenta del impuesto a pagar" />
        <Tarjeta titulo="IGTF pagado" valor={bs(resumen.igtfBs)} color="var(--danger)" ayuda="No se recupera: es costo" />
        <Tarjeta titulo="Por enterar al fisco" valor={bs(resumen.porEnterarBs)}
          color={resumen.porEnterarBs > 0 ? 'var(--warning)' : undefined}
          ayuda="Lo que la empresa retuvo y todavía no declaró" />
        <Tarjeta titulo="Registros" valor={String(filtradas.length)}
          ayuda={resumen.sinComprobante ? `${resumen.sinComprobante} sin número ni archivo del comprobante` : 'Todos con comprobante'} />
      </div>

      {!!resumen.porTipo.size && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
          {TIPOS.filter((t) => resumen.porTipo.has(t)).map((t) => {
            const v = resumen.porTipo.get(t)!;
            return (
              <button key={t} type="button" className="btn btn-sm btn-ghost"
                style={{ borderColor: fTipo === t ? 'var(--brand, #ff8a00)' : undefined }}
                onClick={() => setFTipo((x) => (x === t ? '' : t))}
                title={`Ver solo ${TIPO_RETENCION_LABEL[t]}`}>
                <strong>{t}</strong> · {v.cantidad} · {bs(v.bs)}
              </button>
            );
          })}
        </div>
      )}

      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="filterbar" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Quién retuvo</label>
            <select className="select" value={fRol} onChange={(e) => setFRol(e.target.value as RolRetencion | '')}>
              <option value="sufrida">Nos la practicaron</option>
              <option value="practicada">La practicamos</option>
              <option value="">Las dos</option>
            </select>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Impuesto</label>
            <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoRetencion | '')}>
              <option value="">Todos</option>
              {TIPOS.map((t) => <option key={t} value={t}>{TIPO_RETENCION_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Estado</label>
            <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value as EstadoRetencion | '')}>
              <option value="">Todos</option>
              <option value="registrada">Registrada</option>
              <option value="declarada">Declarada</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Desde</label>
            <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0, flex: '1 1 180px' }}>
            <label>Buscar</label>
            <input className="input" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
              placeholder="Contraparte, RIF, comprobante, factura…" />
          </div>
          <button className="btn btn-ghost" onClick={() => { setFTipo(''); setFEstado(''); setFTexto(''); setFDesde(primeroDelMes()); setFHasta(hoyISO()); }}>Limpiar</button>
          <button className="btn btn-ghost" disabled={!filtradas.length}
            onClick={() => descargarLibroRetencionesPdf(filtradas, { desde: fDesde, hasta: fHasta, params })
              .catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'))}>↓ PDF del libro</button>
          {puedeCargar && <button className="btn btn-ghost" onClick={() => setVerParams(true)} title="Unidad tributaria y alícuotas">⚙ Parámetros</button>}
          {puedeCargar && porDeclarar.length > 0 && (
            <button className="btn btn-ghost" onClick={declarar} title="Marca como declaradas las que retuvimos y están pendientes">
              ✓ Declarar {porDeclarar.length}
            </button>
          )}
          {puedeCargar && <button className="btn btn-primary" onClick={() => setNueva(true)}>+ Registrar retención</button>}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>Fecha</th><th>Impuesto</th><th>Comprobante</th><th>Contraparte</th>
                <th>Factura</th>
                <th style={{ textAlign: 'right' }}>Base</th>
                <th style={{ textAlign: 'right' }}>IVA fact.</th>
                <th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Retenido</th>
                <th style={{ textAlign: 'right' }}>En Bs</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !filtradas.length && (
                <tr><td colSpan={12}>
                  <EmptyState icon="🧾" message={filas.length
                    ? 'Ninguna retención coincide con esos filtros.'
                    : 'Todavía no hay retenciones en este período. Cargá acá los comprobantes que te entregan los clientes: cada uno es impuesto que ya pagaste.'} />
                </td></tr>
              )}
              {!loading && filtradas.map((r) => (
                <tr key={r.id} style={{ opacity: r.estado === 'anulada' ? 0.55 : 1 }}>
                  <td className="mono">{fechaCorta(r.fecha)}
                    <div className="muted" style={{ fontSize: '.7rem' }}>{etiquetaQuincena(r.fecha)}</div>
                  </td>
                  <td>
                    <span className="badge">{r.tipo}</span>
                    <div className="muted" style={{ fontSize: '.7rem' }}>{ROL_LABEL[r.rol]}</div>
                  </td>
                  <td className="mono" style={{ fontSize: '.78rem' }}>{r.comprobante_nro ?? '—'}</td>
                  <td>{r.razon_social ?? '—'}
                    <div className="muted mono" style={{ fontSize: '.7rem' }}>{r.rif ? formatearRif(r.rif) : ''}</div>
                  </td>
                  <td className="mono" style={{ fontSize: '.78rem' }}>{r.factura_nro ?? '—'}
                    {r.factura_control && <div className="muted" style={{ fontSize: '.7rem' }}>ctrl {r.factura_control}</div>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{mon(r.base, r.moneda)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.iva_monto != null ? mon(r.iva_monto, r.moneda) : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.porcentaje}%
                    {!!r.sustraendo && <div className="muted" style={{ fontSize: '.7rem' }}>−{mon(r.sustraendo, r.moneda)}</div>}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{mon(r.monto, r.moneda)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.monto_bs ? bs(r.monto_bs) : '—'}</td>
                  <td>
                    <span className={r.estado === 'anulada' ? 'badge danger' : r.estado === 'declarada' ? 'badge success' : 'badge'}>
                      {r.estado}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {r.comprobante_path && <button className="btn btn-sm btn-ghost" onClick={() => abrirArchivo(r)} title={r.comprobante_nombre ?? 'Comprobante'}>📎</button>}
                    <button className="btn btn-sm btn-ghost" title="Comprobante en PDF"
                      onClick={() => descargarComprobanteRetencionPdf(r, params)
                        .catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'))}>↓</button>
                    {puedeCargar && r.estado !== 'anulada' && (
                      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                        onClick={() => setAnular(r)} title="Anular (no se borra: queda la constancia)">✕</button>
                    )}
                    {puedeCargar && r.estado === 'anulada' && (
                      <button className="btn btn-sm btn-ghost" title="Reactivar"
                        onClick={async () => { await reactivarRetencion(r.id); await cargar(); }}>↺</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nueva && params && (
        <RegistrarRetencionModal
          params={params} conceptos={conceptos} actor={actor} actorName={actorName}
          onClose={() => setNueva(false)}
          onSaved={async () => { setNueva(false); await cargar(); }}
        />
      )}

      {verParams && params && (
        <ParametrosModal params={params} onClose={() => setVerParams(false)}
          onSaved={async () => { setVerParams(false); await cargar(); }} />
      )}

      {anular && (
        <AnularModal retencion={anular} actor={actor}
          onClose={() => setAnular(null)}
          onSaved={async () => { setAnular(null); await cargar(); }} />
      )}
    </>
  );
}

function Tarjeta({ titulo, valor, color, ayuda }: { titulo: string; valor: string; color?: string; ayuda?: string }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{valor}</div>
      {ayuda && <div className="muted" style={{ fontSize: '.7rem' }}>{ayuda}</div>}
    </div>
  );
}

/* ───────── Registrar ───────── */

function RegistrarRetencionModal({ params, conceptos, actor, actorName, onClose, onSaved }: {
  params: ParametrosFiscales;
  conceptos: ConceptoIslr[];
  actor: string; actorName: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [rol, setRol] = useState<RolRetencion>('sufrida');
  const [tipo, setTipo] = useState<TipoRetencion>('IVA');
  const [fecha, setFecha] = useState(hoyISO);
  const [moneda, setMoneda] = useState('Bs');
  const [tasa, setTasa] = useState(0);

  // Contraparte: el cliente que nos retuvo, o el proveedor al que le retuvimos.
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; razon_social: string; rif: string | null }[]>([]);
  const [contraId, setContraId] = useState('');
  const [rif, setRif] = useState('');
  const [razon, setRazon] = useState('');

  const [comprobante, setComprobante] = useState('');
  const [facturaNro, setFacturaNro] = useState('');
  const [facturaControl, setFacturaControl] = useState('');
  const [facturaFecha, setFacturaFecha] = useState('');

  const [base, setBase] = useState('');
  const [exento, setExento] = useState('');
  const [ivaAlicuota, setIvaAlicuota] = useState(String(params.iva_alicuota));
  const [ivaMonto, setIvaMonto] = useState('');
  const [ivaManual, setIvaManual] = useState(false);
  const [pctIva, setPctIva] = useState<75 | 100>(params.iva_retencion === 100 ? 100 : 75);
  const [motivo, setMotivo] = useState<MotivoIva100 | ''>('');

  const [conceptoCod, setConceptoCod] = useState('');
  const [sujeto, setSujeto] = useState<SujetoRetenido>('PJD');
  const [pctManual, setPctManual] = useState('');

  const [alicuota, setAlicuota] = useState(String(params.municipal_alicuota));
  const [municipio, setMunicipio] = useState(params.municipio);
  const [pagadoDivisas, setPagadoDivisas] = useState('');

  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContrapartes().then(setContrapartes).catch(() => setContrapartes([]));
    supabase.from('proveedores').select('id, razon_social, rif').order('razon_social')
      .then(({ data }) => setProveedores((data ?? []) as { id: string; razon_social: string; rif: string | null }[]));
    getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* sin tasa */ });
  }, []);

  // El IVA se calcula de la base salvo que la factura traiga otra cifra.
  const baseNum = Number(String(base).replace(',', '.')) || 0;
  useEffect(() => {
    if (ivaManual) return;
    const v = ivaDeFactura(baseNum, Number(ivaAlicuota) || 0);
    setIvaMonto(v > 0 ? String(v) : '');
  }, [baseNum, ivaAlicuota, ivaManual]);

  const opciones = useMemo(() => [
    ...contrapartes.map((c) => ({
      value: `cp:${c.id}`,
      label: `${c.nombre}${c.rif ? ` · ${c.rif}` : ''} (${c.tipo})`,
    })),
    ...proveedores.map((p) => ({
      value: `pv:${p.id}`,
      label: `${p.razon_social}${p.rif ? ` · ${p.rif}` : ''} (proveedor)`,
    })),
  ], [contrapartes, proveedores]);

  function elegirContraparte(v: string) {
    setContraId(v);
    const [clase, id] = v.split(':');
    if (clase === 'cp') {
      const c = contrapartes.find((x) => x.id === id);
      if (c) { setRazon(c.nombre); setRif(c.rif ?? ''); }
    } else if (clase === 'pv') {
      const p = proveedores.find((x) => x.id === id);
      if (p) { setRazon(p.razon_social); setRif(p.rif ?? ''); }
    }
  }

  const ivaNum = Number(String(ivaMonto).replace(',', '.')) || 0;
  const concepto = conceptos.find((c) => c.codigo === conceptoCod) ?? null;
  const islr = useMemo(() => calcularIslr({
    pagoSinIva: baseNum, concepto, sujeto,
    unidadTributaria: params.unidad_tributaria,
    porcentajeManual: Number(pctManual) || null,
  }), [baseNum, concepto, sujeto, params.unidad_tributaria, pctManual]);

  const divisasNum = Number(String(pagadoDivisas).replace(',', '.')) || 0;
  const alicuotaNum = Number(String(alicuota).replace(',', '.')) || 0;

  // El monto y el porcentaje, según el impuesto.
  const calculo = useMemo(() => {
    if (tipo === 'IVA') return { monto: retencionIva(ivaNum, pctIva), porcentaje: pctIva, sustraendo: 0 };
    if (tipo === 'ISLR') return { monto: islr.monto, porcentaje: islr.porcentaje, sustraendo: islr.sustraendo };
    if (tipo === 'IGTF') return { monto: calcularIgtf(divisasNum, params.igtf_alicuota), porcentaje: params.igtf_alicuota, sustraendo: 0 };
    return { monto: retencionPorAlicuota(baseNum, alicuotaNum), porcentaje: alicuotaNum, sustraendo: 0 };
  }, [tipo, ivaNum, pctIva, islr, divisasNum, params.igtf_alicuota, baseNum, alicuotaNum]);

  const montoBs = enBolivares(calculo.monto, moneda, tasa);
  const rifMal = !!rif.trim() && !rifValido(rif);

  // Golden Touch no está designada contribuyente especial, así que no puede
  // retener IVA ni percibir IGTF. Solo aplica al lado «practicada»: que le
  // retengan a ella se registra siempre, porque es plata a favor.
  const bloqueoAgente = rol === 'practicada'
    ? motivoNoPuedeRetener(tipo, params.contribuyente_especial)
    : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (bloqueoAgente) { setError(bloqueoAgente); return; }
    if (!razon.trim()) { setError(rol === 'sufrida' ? 'Indicá quién te retuvo.' : 'Indicá a quién le retuviste.'); return; }
    if (rol === 'sufrida' && !comprobante.trim()) {
      setError('Transcribí el N° del comprobante que te entregaron: sin él no se puede respaldar el anticipo.');
      return;
    }
    if (tipo === 'IVA') {
      const err = errorRetencionIva({ baseImponible: baseNum, ivaFactura: ivaNum, porcentaje: pctIva, facturaNro });
      if (err) { setError(err); return; }
      if (pctIva === 100 && !motivo) { setError('Indicá por qué se retiene el 100%.'); return; }
    }
    if (tipo === 'IGTF' && divisasNum <= 0) { setError('Indicá cuánto se pagó en divisas.'); return; }
    if (tipo !== 'IVA' && tipo !== 'IGTF' && baseNum <= 0) { setError('Indicá el monto del pago sin IVA.'); return; }
    if (calculo.monto <= 0) { setError(islr.aviso ?? 'La retención da cero: revisá los montos.'); return; }
    if (moneda !== 'Bs' && !(tasa > 0)) { setError('Indicá la tasa para llevar la retención a bolívares: así se declara.'); return; }

    setSaving(true);
    try {
      await registrarRetencion({
        rol, tipo, fecha,
        proveedorId: contraId.startsWith('pv:') ? contraId.slice(3) : null,
        rif: rif.trim() || null, razonSocial: razon.trim(),
        sujeto: tipo === 'ISLR' ? sujeto : null,
        comprobanteNro: rol === 'sufrida' ? comprobante.trim() : null,
        facturaNro: facturaNro.trim() || null,
        facturaControl: facturaControl.trim() || null,
        facturaFecha: facturaFecha || null,
        base: tipo === 'IGTF' ? divisasNum : baseNum,
        exento: Number(exento) || null,
        ivaAlicuota: tipo === 'IVA' ? Number(ivaAlicuota) || null : null,
        ivaMonto: tipo === 'IVA' ? ivaNum : null,
        porcentaje: calculo.porcentaje,
        motivo: tipo === 'IVA' && pctIva === 100 && motivo ? MOTIVO_IVA_100[motivo] : null,
        conceptoCodigo: tipo === 'ISLR' ? conceptoCod || null : null,
        concepto: tipo === 'ISLR' ? concepto?.concepto ?? null : null,
        sustraendo: calculo.sustraendo || null,
        municipio: tipo === 'MUNICIPAL' || tipo === 'ESTADAL' ? municipio.trim() || null : null,
        monto: calculo.monto, moneda, tasa: moneda === 'Bs' ? null : tasa,
        descripcion: descripcion.trim() || null,
        archivo, actor, actorName,
      });
      toast('Retención registrada en el libro', 'success');
      onSaved();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo registrar la retención.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Registrar retención"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="ret-libro" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : `Registrar · ${mon(calculo.monto, moneda)}`}
          </button>
        </>
      }
    >
      <form id="ret-libro" onSubmit={guardar}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-grid">
          <div className="form-row">
            <label>¿Quién retuvo? *</label>
            <select className="select" value={rol} onChange={(e) => setRol(e.target.value as RolRetencion)}>
              <option value="sufrida">Nos la practicaron (anticipo a favor)</option>
              <option value="practicada">La practicamos nosotros</option>
            </select>
            <small className="muted">{ROL_AYUDA[rol]}</small>
          </div>
          <div className="form-row">
            <label>Impuesto *</label>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRetencion)}>
              {TIPOS.map((t) => (
                <option key={t} value={t}
                  disabled={rol === 'practicada' && !puedeRetenerLaEmpresa(t, params.contribuyente_especial)}>
                  {TIPO_RETENCION_LABEL[t]}
                </option>
              ))}
            </select>
            {bloqueoAgente && (
              <small style={{ color: 'var(--danger)', display: 'block', marginTop: 4 }}>{bloqueoAgente}</small>
            )}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Fecha *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            <small className="muted">{etiquetaQuincena(fecha)} · comprobante hasta el {fechaCorta(limiteEntregaComprobante(fecha))}</small>
          </div>
          <div className="form-row">
            <label>{rol === 'sufrida' ? 'N° del comprobante que te dieron *' : 'N° de comprobante'}</label>
            <input className="input mono" value={comprobante} onChange={(e) => setComprobante(e.target.value)}
              placeholder={rol === 'sufrida' ? '20260900000123' : 'lo genera el sistema'}
              disabled={rol === 'practicada'} />
            {rol === 'practicada' && <small className="muted">Se numera solo: AAAAMM + 8 dígitos correlativos.</small>}
          </div>
        </div>

        <div className="form-row">
          <label>{rol === 'sufrida' ? 'Quién te retuvo (cliente) *' : 'A quién le retuviste *'}</label>
          <SearchSelect value={contraId} onChange={elegirContraparte} options={opciones}
            placeholder="🔍 Buscar en clientes y proveedores…" />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Razón social *</label>
            <input className="input" value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Nombre o razón social" />
          </div>
          <div className="form-row">
            <label>RIF</label>
            <input className="input mono" value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-12345678-9" />
            {rifMal && <small style={{ color: 'var(--danger)' }}>Ese RIF no pasa el dígito verificador: revisalo.</small>}
          </div>
        </div>

        {tipo !== 'IGTF' && (
          <div className="form-grid">
            <div className="form-row">
              <label>N° de factura {tipo === 'IVA' ? '*' : ''}</label>
              <input className="input mono" value={facturaNro} onChange={(e) => setFacturaNro(e.target.value)} placeholder="00012345" />
            </div>
            <div className="form-row">
              <label>N° de control</label>
              <input className="input mono" value={facturaControl} onChange={(e) => setFacturaControl(e.target.value)} placeholder="00-000123" />
            </div>
            <div className="form-row">
              <label>Fecha de la factura</label>
              <input className="input" type="date" value={facturaFecha} onChange={(e) => setFacturaFecha(e.target.value)} />
            </div>
          </div>
        )}

        {tipo === 'IVA' && (
          <div className="card" style={{ borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title">Retención de IVA · Providencia SNAT/2015/0049</div>
            <div className="form-grid">
              <div className="form-row">
                <label>Base imponible *</label>
                <input className="input mono" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="form-row">
                <label>Alícuota de IVA</label>
                <input className="input mono" value={ivaAlicuota} onChange={(e) => { setIvaManual(false); setIvaAlicuota(e.target.value); }} inputMode="decimal" />
              </div>
              <div className="form-row">
                <label>IVA de la factura *</label>
                <input className="input mono" value={ivaMonto} onChange={(e) => { setIvaManual(true); setIvaMonto(e.target.value); }} placeholder="0,00" inputMode="decimal" />
                <small className="muted">La retención se calcula sobre este número, no sobre la base.</small>
              </div>
              <div className="form-row">
                <label>Monto exento / no gravado</label>
                <input className="input mono" value={exento} onChange={(e) => setExento(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted">% retenido:</span>
              {[75, 100].map((p) => (
                <button key={p} type="button" className={`btn btn-sm ${pctIva === p ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPctIva(p as 75 | 100)}>{p}%</button>
              ))}
              {pctIva === 100 && (
                <select className="select" style={{ maxWidth: 320 }} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoIva100 | '')}>
                  <option value="">— motivo del 100% —</option>
                  {(Object.keys(MOTIVO_IVA_100) as MotivoIva100[]).map((k) => (
                    <option key={k} value={k}>{MOTIVO_IVA_100[k]}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {tipo === 'ISLR' && (
          <div className="card" style={{ borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title">Retención de ISLR · Decreto 1808</div>
            <div className="form-grid">
              <div className="form-row">
                <label>Concepto *</label>
                <select className="select" value={conceptoCod} onChange={(e) => setConceptoCod(e.target.value)}>
                  <option value="">— elegí el concepto —</option>
                  {conceptos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.concepto}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Sujeto *</label>
                <select className="select" value={sujeto} onChange={(e) => setSujeto(e.target.value as SujetoRetenido)}>
                  {(Object.keys(SUJETO_LABEL) as SujetoRetenido[]).map((s) => (
                    <option key={s} value={s}>{SUJETO_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Pago sin IVA *</label>
                <input className="input mono" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="form-row">
                <label>% (si hay que pisarlo)</label>
                <input className="input mono" value={pctManual} onChange={(e) => setPctManual(e.target.value)}
                  placeholder={String(porcentajeIslr(concepto, sujeto) || '')} inputMode="decimal" />
              </div>
            </div>
            <small className="muted">
              {concepto
                ? <>Del catálogo: <strong>{porcentajeIslr(concepto, sujeto) || '—'}%</strong>
                    {concepto.base_pct !== 100 ? ` sobre el ${concepto.base_pct}% del pago` : ''}
                    {islr.sustraendo ? ` · sustraendo ${islr.sustraendo.toFixed(2)}` : ''}
                    {islr.aviso ? ` · ${islr.aviso}` : ''}</>
                : 'Elegí el concepto: de ahí sale el porcentaje según quién cobra.'}
            </small>
          </div>
        )}

        {(tipo === 'MUNICIPAL' || tipo === 'ESTADAL') && (
          <div className="card" style={{ borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title">{tipo === 'MUNICIPAL' ? 'Retención municipal (actividades económicas)' : 'Timbre fiscal estadal'}</div>
            <div className="form-grid">
              <div className="form-row">
                <label>Pago sin IVA *</label>
                <input className="input mono" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="form-row">
                <label>Alícuota (%) *</label>
                <input className="input mono" value={alicuota} onChange={(e) => setAlicuota(e.target.value)} inputMode="decimal" />
              </div>
              <div className="form-row">
                <label>{tipo === 'MUNICIPAL' ? 'Municipio' : 'Estado'}</label>
                <input className="input" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
              </div>
            </div>
            <small className="muted">La alícuota sale de la ordenanza del {tipo === 'MUNICIPAL' ? 'municipio' : 'estado'} donde se presta el servicio.</small>
          </div>
        )}

        {tipo === 'IGTF' && (
          <div className="card" style={{ borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title">IGTF · impuesto a las grandes transacciones financieras</div>
            <div className="form-grid">
              <div className="form-row">
                <label>Pagado en divisas *</label>
                <input className="input mono" value={pagadoDivisas} onChange={(e) => setPagadoDivisas(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="form-row">
                <label>Alícuota</label>
                <input className="input mono" value={params.igtf_alicuota} disabled />
                <small className="muted">Se cambia en ⚙ Parámetros.</small>
              </div>
            </div>
            <small className="muted">Se calcula sobre lo que efectivamente se pagó en moneda extranjera, no sobre la factura.</small>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: '.6rem' }}>
          <div className="form-row">
            <label>Moneda</label>
            <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="Bs">Bs</option>
              <option value="USD">USD</option>
            </select>
          </div>
          {moneda !== 'Bs' && (
            <div className="form-row">
              <label>Tasa (Bs por $) *</label>
              <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
                onChange={(e) => setTasa(Number(e.target.value) || 0)} />
              <small className="muted">La declaración va en bolívares.</small>
            </div>
          )}
          <div className="form-row">
            <label>Comprobante (PDF o imagen)</label>
            <input className="input" type="file" accept="application/pdf,image/*"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="form-row">
          <label>Detalle</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. Venta de casiterita · factura 00012345" />
        </div>

        <div className="card" style={{ marginTop: '.5rem', padding: '.6rem .85rem', borderColor: 'var(--brand, #ff8a00)' }}>
          Retenido: <strong className="mono" style={{ fontSize: '1.2rem' }}>{mon(calculo.monto, moneda)}</strong>
          {moneda !== 'Bs' && <> · en bolívares <strong className="mono">{bs(montoBs)}</strong></>}
          {calculo.sustraendo > 0 && <span className="muted"> · ya descontado el sustraendo de {calculo.sustraendo.toFixed(2)}</span>}
        </div>
      </form>
    </Modal>
  );
}

/* ───────── Parámetros fiscales ───────── */

function ParametrosModal({ params, onClose, onSaved }: {
  params: ParametrosFiscales; onClose: () => void; onSaved: () => void;
}) {
  const [p, setP] = useState<ParametrosFiscales>(params);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ParametrosFiscales>(k: K, v: ParametrosFiscales[K]) => setP((x) => ({ ...x, [k]: v }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await guardarParametrosFiscales(p);
      toast('Parámetros fiscales guardados', 'success');
      onSaved();
    } catch (err) { setError(mensajeError(err, 'No se pudieron guardar')); setSaving(false); }
  }

  return (
    <Modal title="⚙ Parámetros fiscales" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="submit" form="ret-params" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <form id="ret-params" onSubmit={guardar}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>RIF de la empresa</label>
            <input className="input mono" value={p.empresa_rif} onChange={(e) => set('empresa_rif', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Razón social</label>
            <input className="input" value={p.empresa_nombre} onChange={(e) => set('empresa_nombre', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <label>Dirección fiscal</label>
          <input className="input" value={p.agente_direccion} onChange={(e) => set('agente_direccion', e.target.value)} />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Unidad tributaria (Bs)</label>
            <input className="input mono" type="number" min={0} step="any" value={p.unidad_tributaria}
              onChange={(e) => set('unidad_tributaria', Number(e.target.value) || 0)} />
            <small className="muted">De acá salen el mínimo exento y el sustraendo del ISLR.</small>
          </div>
          <div className="form-row">
            <label>Alícuota de IVA (%)</label>
            <input className="input mono" type="number" min={0} step="any" value={p.iva_alicuota}
              onChange={(e) => set('iva_alicuota', Number(e.target.value) || 0)} />
          </div>
          <div className="form-row">
            <label>IGTF (%)</label>
            <input className="input mono" type="number" min={0} step="any" value={p.igtf_alicuota}
              onChange={(e) => set('igtf_alicuota', Number(e.target.value) || 0)} />
          </div>
          <div className="form-row">
            <label>Alícuota municipal (%)</label>
            <input className="input mono" type="number" min={0} step="any" value={p.municipal_alicuota}
              onChange={(e) => set('municipal_alicuota', Number(e.target.value) || 0)} />
          </div>
          <div className="form-row">
            <label>Municipio</label>
            <input className="input" value={p.municipio} onChange={(e) => set('municipio', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Timbre fiscal estadal (%)</label>
            <input className="input mono" type="number" min={0} step="any" value={p.estadal_alicuota}
              onChange={(e) => set('estadal_alicuota', Number(e.target.value) || 0)} />
          </div>
        </div>
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginTop: '.5rem' }}>
          <input type="checkbox" checked={p.contribuyente_especial}
            onChange={(e) => set('contribuyente_especial', e.target.checked)} />
          <span>La empresa es contribuyente especial (agente de retención de IVA)</span>
        </label>
        <small className="muted">
          Hoy está en <strong>{p.contribuyente_especial ? 'sí' : 'no'}</strong>. Golden Touch no fue designada agente de
          retención: si el SENIAT la designa, marcalo acá.
        </small>
      </form>
    </Modal>
  );
}

/* ───────── Anular ───────── */

function AnularModal({ retencion, actor, onClose, onSaved }: {
  retencion: RetencionLibro; actor: string; onClose: () => void; onSaved: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) { toast('Escribí el motivo de la anulación', 'error'); return; }
    setSaving(true);
    try {
      await anularRetencion(retencion.id, motivo, actor);
      toast('Retención anulada', 'success');
      onSaved();
    } catch (e) { toast(mensajeError(e, 'No se pudo anular'), 'error'); setSaving(false); }
  }

  return (
    <Modal title="Anular retención" compact onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-danger" onClick={confirmar} disabled={saving || !motivo.trim()}>
          {saving ? 'Anulando…' : 'Anular'}
        </button>
      </>
    }>
      <p style={{ marginTop: 0 }}>
        La retención de <strong>{retencion.tipo}</strong> por <strong className="mono">{mon(retencion.monto, retencion.moneda)}</strong>{' '}
        queda <strong>anulada</strong> en el libro. No se borra: un correlativo con huecos después no lo explica nadie.
      </p>
      <div className="form-row">
        <label>Motivo *</label>
        <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. comprobante duplicado" autoFocus />
      </div>
    </Modal>
  );
}
