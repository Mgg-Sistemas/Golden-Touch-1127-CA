/* ============================================================
   Golden Touch · Libro fiscal · Registrar una FACTURA con varias líneas (v8 · VF)

   Una factura (cabecera) y varias líneas de impuesto (IVA, ISLR, ISAE, etc.).
   El cálculo de cada línea es el puro de retencionesCalculo; con R7, una
   practicada se calcula con la regla vigente a la fecha de la factura y la
   línea guarda la regla y la foto (R7F). El registro es atómico vía
   registrarFactura (retencion_factura_registrar). La tasa es la BCV de la
   fecha de la factura; la fecha de la retención es la del comprobante y no
   cambia el período. Se ofrece detrás de v2rDisponible.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import type { Proveedor } from '@/shared/lib/types';
import { list as listProveedores } from '@/modules/proveedores/proveedores.repository';
import { getTasaUsdDeFecha } from '@/modules/tesoreria/tasas.repository';
import { rifValido } from '@/shared/lib/rif';
import {
  CONFIG_RETENCION_DEFECTO, DIRECCIONES, SUJETOS, TIPOS_IMPUESTO,
  calcularIgtf, calcularRetencionIslr, calcularRetencionIva, calcularRetencionLocal, enBolivares, fechaTasaBcv,
  labelImpuesto, motivoCienTexto, motivoNoPuedePracticar, periodoDe, puedePracticar, quincenaDe,
  type CalculoRetencion, type ConceptoRetencion, type ConfigRetencion, type DireccionRetencion,
  type MotivosIvaCien, type SujetoRetenido, type TipoImpuesto,
} from './retencionesCalculo';
import { getConfigRetencion, listConceptos, sujetoAGt, tipoAGt, type DocKind } from './retencionesFiscal.repository';
import { configDeFecha } from './parametros.repository';
import { supuestoAplicado, supuestosVigentes, type Supuesto } from './motivosSupuestos.repository';
import { esCeroSinMotivo } from './motivoCero';
import { sugerirSujetoPorRif } from './residenciaSujeto';
import { leerMonto } from './validarCarga';
import { faltaEnDatosFactura } from './facturaDocumento';
import { r7Disponible } from './reglas.repository';
import { calcularConReglaVigente, columnasDeRegla, type CalculoConRegla } from './reglaRegistro';
import { useDescartar } from './confirmarDescartar';
import { urlFacturaDeOrigen } from './documentosOrigen.repository';
import { previewArchivo } from '@/shared/lib/reportePreview';
import {
  registrarFactura, type FacturaNueva, type LineaFacturaNueva,
} from './retencionFacturas.repository';

/** Para calcular mientras se escribe. Lo ilegible lo señala `ilegibles` antes de registrar. */
const nDec = (v: string) => leerMonto(v) ?? 0;
/** Hoy en la hora local (AAAA-MM-DD). */
const hoyIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fechaCorta = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-'); return a && m && d ? `${d}/${m}/${a}` : iso; };
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
  facturaControl?: string | null;
  facturaFecha?: string | null;
  facturaTotal?: number | null;
  /** P03: el archivo de factura de Compras del que sale el registro. */
  adjuntoId?: string | null;
  /** P03: para verlo mientras se registra (bucket y ruta del archivo). */
  adjunto?: { nombre: string; bucket: string; path: string } | null;
  /** IVA de la factura (base de la línea de IVA). */
  iva?: number | null;
  /** Base imponible sugerida (total sin IVA ni IGTF). */
  baseImponible?: number | null;
  /** Impuesto con el que arranca la primera línea (si se entra desde un botón de «Por realizar»). */
  tipoInicial?: TipoImpuesto;
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
  /** En una recibida: el número del comprobante que entregó el cliente. */
  numeroStr: string;
  /** Los supuestos marcados por código (las 5 casillas fijas, o los de R6). */
  motivos: Record<string, boolean>;
  descripcion: string;
}

/** Los supuestos del art. 5 (Providencia SNAT/2015/0049) que llevan la retención de IVA al 100 %. */
const MOTIVOS_IVA_CIEN: Array<[keyof MotivosIvaCien & string, string]> = [
  ['ivaNoDiscriminado', 'El IVA no está discriminado en la factura'],
  ['facturaNoCumple', 'La factura no cumple los requisitos de facturación'],
  ['proveedorNoInscrito', 'El proveedor está sujeto a retención del 100% según el Portal Fiscal, o no está inscrito en el RIF'],
  ['proveedorNoDomiciliado', 'El proveedor no está domiciliado en el país'],
  ['metalesPreciosos', 'Compra de metales o piedras preciosas'],
];

let semilla = 0;
const nuevaLinea = (over: Partial<LineaUI> = {}): LineaUI => ({
  id: (semilla += 1), tipo: 'iva', sujeto: 'pj_domiciliada', conceptoId: '',
  baseStr: '0', ivaStr: '0', pctStr: '', montoStr: '', numeroStr: '', motivos: {}, descripcion: '', ...over,
});

export function RegistrarFacturaRetencion({ semilla: s = {}, actor, actorName, onClose, onHecho, proveedorIdsPendientes }: {
  semilla?: SemillaFactura;
  /** En una practicada, solo se ofrecen los proveedores con retenciones por realizar (si se pasa). */
  proveedorIdsPendientes?: Set<string>;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onHecho: (res: Awaited<ReturnType<typeof registrarFactura>>) => void;
}) {
  const [configBase, setConfigBase] = useState<ConfigRetencion>(CONFIG_RETENCION_DEFECTO);
  // Con R3, los valores (UT, % del IVA) de la fecha de la factura; sin R3, los de Parámetros.
  const [config, setConfig] = useState<ConfigRetencion>(CONFIG_RETENCION_DEFECTO);
  const [avisoFecha, setAvisoFecha] = useState<string | null>(null);
  // R6: los supuestos del IVA vigentes a la fecha de la factura; null = sin R6, las 5 casillas fijas.
  const [supuestosIva, setSupuestosIva] = useState<Supuesto[] | null>(null);
  const [conceptos, setConceptos] = useState<ConceptoRetencion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { marcarSucio, pedirCierre, dialogo } = useDescartar(onClose, saving);
  // R7: el cálculo con la regla vigente de cada línea (por id de línea); sin entrada = el cálculo de hoy.
  const [conR7, setConR7] = useState(false);
  const [reglas, setReglas] = useState<Record<number, CalculoConRegla | null>>({});
  const [avisoRegla, setAvisoRegla] = useState<string | null>(null);
  const [tasaBcv, setTasaBcv] = useState<{ tasa: number | null; nota: string } | null>(null);

  const [direccion, setDireccion] = useState<DireccionRetencion>(s.direccion ?? 'practicada');
  const [proveedorId, setProveedorId] = useState(s.contraparteId ?? '');
  const [contraparte, setContraparte] = useState(s.contraparteNombre ?? '');
  const [rif, setRif] = useState(s.contraparteRif ?? '');
  const [moneda, setMoneda] = useState(s.moneda ?? 'Bs');
  const [tasaStr, setTasaStr] = useState('');
  const [facturaNro, setFacturaNro] = useState(s.facturaNro ?? '');
  const [facturaControl, setFacturaControl] = useState(s.facturaControl ?? '');
  const [facturaFecha, setFacturaFecha] = useState(s.facturaFecha ?? '');
  const [fechaRetencion, setFechaRetencion] = useState(hoyIso());
  const [facturaTotal, setFacturaTotal] = useState(String(s.facturaTotal ?? 0));
  const [nota, setNota] = useState('');
  const [lineas, setLineas] = useState<LineaUI[]>(() => [nuevaLinea({
    tipo: s.tipoInicial ?? 'iva', baseStr: String(s.baseImponible ?? 0), ivaStr: String(s.iva ?? 0),
  })]);

  useEffect(() => {
    void Promise.all([getConfigRetencion(), listConceptos(true), listProveedores()])
      .then(([c, cs, ps]) => {
        setConfigBase(c); setConfig(c); setConceptos(cs);
        const activos = ps.filter((p) => p.estado === 'activo');
        setProveedores(activos);
        const p = s.contraparteId ? activos.find((x) => x.id === s.contraparteId) : null;
        if (p) {
          setContraparte(p.razon_social); setRif(p.rif ?? '');
          const sug = sugerirSujetoPorRif(p.rif ?? '');
          if (sug) setLineas((xs) => xs.map((l) => ({ ...l, sujeto: sug.sujeto })));
        }
      })
      .catch((e) => setError(e instanceof Error ? `No se pudo leer la configuración: ${e.message}` : 'No se pudo leer la configuración.'));
    r7Disponible().then(setConR7).catch(() => setConR7(false));
  }, [s.contraparteId]);

  // La tasa es la BCV de la fecha de la factura (sábado y domingo: la del lunes), no la del día en que se registra.
  useEffect(() => {
    const f = fechaTasaBcv(facturaFecha);
    if (!f) { setTasaBcv({ tasa: null, nota: 'Escribe la fecha de la factura: la tasa es la BCV de esa fecha.' }); return; }
    let vivo = true;
    const cuando = f === facturaFecha ? fechaCorta(f) : `${fechaCorta(f)}, el lunes siguiente`;
    getTasaUsdDeFecha(f)
      .then((t) => {
        if (!vivo) return;
        setTasaBcv(t != null
          ? { tasa: t, nota: `Tasa BCV del ${cuando}, por la fecha de la factura.` }
          : { tasa: null, nota: `No hay tasa BCV registrada del ${cuando}${moneda === 'Bs' ? '' : ': escríbela'}.` });
        if (moneda !== 'Bs') setTasaStr(t != null ? String(t) : '');
      })
      .catch(() => { if (vivo) setTasaBcv({ tasa: null, nota: 'No se pudo leer la tasa BCV.' }); });
    return () => { vivo = false; };
  }, [facturaFecha, moneda]);

  const opcionesProveedor = useMemo(() => {
    const lista = proveedorIdsPendientes ? proveedores.filter((p) => proveedorIdsPendientes.has(p.id)) : proveedores;
    return lista.map((p) => ({ value: p.id, label: `${p.razon_social}${p.rif ? ` · ${p.rif}` : ''}` }));
  }, [proveedores, proveedorIdsPendientes]);

  /** El proveedor llena razón social y RIF. El sujeto del ISLR no se toca: se sugiere en cada línea. */
  function elegirProveedor(id: string) {
    marcarSucio();
    setProveedorId(id);
    const p = proveedores.find((x) => x.id === id);
    if (p) { setContraparte(p.razon_social); setRif(p.rif ?? ''); }
  }

  const esManual = direccion === 'recibida';
  const tasa = nDec(tasaStr);

  const tiposLineas = lineas.map((l) => l.tipo).join(',');
  useEffect(() => {
    let vivo = true;
    configDeFecha(configBase, facturaFecha, tiposLineas ? (tiposLineas.split(',') as TipoImpuesto[]) : [])
      .then((c) => { if (vivo) { setConfig(c); setAvisoFecha(null); } })
      .catch((e) => { if (vivo) { setConfig(configBase); setAvisoFecha(e instanceof Error ? e.message : 'No se pudieron leer los valores de esa fecha.'); } });
    return () => { vivo = false; };
  }, [configBase, facturaFecha, tiposLineas]);

  useEffect(() => {
    let vivo = true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(facturaFecha)) {
      supuestosVigentes('IVA', facturaFecha).then((xs) => { if (vivo) setSupuestosIva(xs); }).catch(() => { if (vivo) setSupuestosIva(null); });
    }
    return () => { vivo = false; };
  }, [facturaFecha]);

  const setLinea = useCallback((id: number, patch: Partial<LineaUI>) => {
    marcarSucio();
    setLineas((xs) => xs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, [marcarSucio]);

  /** El cálculo puro de hoy de una línea (practicada); en recibida se copian los números a mano. */
  const calculoHoyDe = useCallback((l: LineaUI): CalculoRetencion => {
    const base = nDec(l.baseStr);
    const concepto = conceptos.find((c) => c.id === l.conceptoId) ?? null;
    if (l.tipo === 'iva') {
      const supuesto = supuestosIva ? supuestoAplicado(l.motivos, supuestosIva) : undefined;
      return calcularRetencionIva({ baseImponible: base, ivaFactura: nDec(l.ivaStr), motivos: l.motivos, supuesto }, config);
    }
    // El mínimo en UT y el sustraendo están en Bs: el cálculo necesita la moneda y la tasa.
    if (l.tipo === 'islr') return calcularRetencionIslr({ montoPago: base, concepto, moneda, tasa }, config);
    if (l.tipo === 'igtf') return calcularIgtf({ montoPago: base, enDivisas: true }, config);
    return calcularRetencionLocal({ montoPago: base, concepto }, l.tipo);
  }, [conceptos, config, moneda, tasa, supuestosIva]);

  // R7: con cada cambio de las líneas (o de la fecha, la moneda o la tasa), la regla vigente de cada practicada.
  const firmaReglas = JSON.stringify(lineas.map((l) => [l.id, l.tipo, l.sujeto, l.conceptoId, l.baseStr, l.ivaStr, l.motivos]));
  useEffect(() => {
    setAvisoRegla(null);
    if (!conR7 || direccion !== 'practicada' || !/^\d{4}-\d{2}-\d{2}$/.test(facturaFecha)) { setReglas({}); return; }
    let vivo = true;
    const t = setTimeout(() => {
      void Promise.all(lineas.map(async (l): Promise<[number, CalculoConRegla | null]> => {
        const base = nDec(l.baseStr);
        const supuesto = l.tipo === 'iva' && (supuestosIva ? !!supuestoAplicado(l.motivos, supuestosIva) : Object.values(l.motivos).some(Boolean));
        const c = await calcularConReglaVigente(tipoAGt(l.tipo), {
          fecha: facturaFecha, direccion: 'practicada',
          sujeto: l.tipo === 'iva' || l.tipo === 'igtf' ? null : sujetoAGt(l.sujeto),
          moneda, tasa: moneda === 'Bs' ? null : (tasa || null),
          pago: base, baseImponible: base, iva: nDec(l.ivaStr),
          supuesto, codigo: conceptos.find((x) => x.id === l.conceptoId)?.codigo ?? null,
        });
        return [l.id, c];
      }))
        .then((pares) => { if (vivo) setReglas(Object.fromEntries(pares)); })
        .catch((e) => {
          if (!vivo) return;
          setReglas({});
          setAvisoRegla(e instanceof Error ? `No se pudo leer la regla vigente: ${e.message}` : 'No se pudo leer la regla vigente.');
        });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [conR7, direccion, facturaFecha, moneda, tasa, firmaReglas, conceptos, supuestosIva]); // eslint-disable-line react-hooks/exhaustive-deps

  /** La regla manda sobre el cálculo de hoy solo cuando hay una vigente que aplica a la línea. */
  const calculoDe = useCallback((l: LineaUI): CalculoRetencion => {
    const hoy = calculoHoyDe(l);
    const rc = reglas[l.id];
    if (!rc || direccion !== 'practicada') return hoy;
    const r = rc.resultado;
    const cual = `regla «${rc.regla.nombre}» v${rc.regla.version}`;
    return {
      ...hoy,
      baseImponible: r.base, impuesto: r.impuesto, porcentaje: r.pct ?? 0, sustraendo: r.sustraendo, montoRetenido: r.monto,
      explicacion: r.aplica ? `Calculado con la ${cual}, vigente al ${fechaCorta(facturaFecha)}.` : `No se retiene según la ${cual}: ${r.motivo ?? 'sin motivo'}.`,
    };
  }, [calculoHoyDe, reglas, direccion, facturaFecha]);

  const montoDe = useCallback((l: LineaUI): number => (esManual
    ? (nDec(l.montoStr) || Math.round(nDec(l.baseStr) * nDec(l.pctStr)) / 100)
    : calculoDe(l).montoRetenido), [esManual, calculoDe]);
  const pctDe = (l: LineaUI) => (esManual ? nDec(l.pctStr) : calculoDe(l).porcentaje);

  const totalRetenido = useMemo(() => lineas.reduce((a, l) => a + montoDe(l), 0), [lineas, montoDe]);

  const totalRetenidoBs = enBolivares(totalRetenido, moneda, tasa);

  const conceptosDeLinea = (l: LineaUI) => conceptos.filter((c) => c.tipo === l.tipo && (c.sujeto === l.sujeto || c.sujeto === 'todos'));

  // Una practicada sin OC, CS ni compra directa queda «fuera del sistema»: se dice y se anota de dónde viene.
  const sinDocumento = direccion === 'practicada' && !s.docId;
  const rifMal = rif.trim() !== '' && !rifValido(rif);
  const ilegibles = [
    ...(moneda !== 'Bs' && leerMonto(tasaStr) == null ? ['Tasa'] : []),
    ...(leerMonto(facturaTotal) == null ? ['Total de la factura'] : []),
    ...lineas.flatMap((l) => ([
      [l.tipo === 'iva' ? 'base imponible' : 'monto del pago', l.baseStr, true],
      ['IVA de la factura', l.ivaStr, l.tipo === 'iva'],
      ['% retenido', l.pctStr, esManual],
      ['monto retenido', l.montoStr, esManual],
    ] as Array<[string, string, boolean]>).filter(([, v, aplica]) => aplica && leerMonto(v) == null).map(([n]) => `${labelImpuesto(l.tipo)}: ${n}`)),
  ];

  function validar(): string | null {
    if (direccion === 'practicada' && !proveedorId) return 'Elige el proveedor al que se le retiene.';
    if (direccion === 'recibida' && !contraparte.trim()) return 'Indica quién nos retuvo.';
    if (rifMal) return 'El RIF no es válido: revisa la letra, los números y el dígito verificador.';
    const falta = faltaEnDatosFactura({ nro: facturaNro, control: facturaControl, fecha: facturaFecha }, hoyIso());
    if (falta) return falta;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRetencion)) return 'Indica la fecha de la retención (emisión del comprobante).';
    if (fechaRetencion < facturaFecha) return 'La fecha de la retención no puede ser anterior a la de la factura.';
    if (avisoFecha) return avisoFecha;
    if (avisoRegla) return avisoRegla;
    if (ilegibles.length) return `No se entiende: ${ilegibles.join(', ')}. Escribe 1.234,56 o 1234,56.`;
    if (moneda !== 'Bs' && !(tasa > 0)) return 'Indica la tasa para llevar los montos a bolívares.';
    if (sinDocumento && !nota.trim()) return 'Sin documento del sistema: indica en la nota de la factura de dónde viene.';
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
        direccion, docKind: s.docKind ?? 'manual', docId: s.docId ?? null, adjuntoId: s.adjuntoId ?? null,
        contraparteId: direccion === 'practicada' ? proveedorId || null : null, contraparteRif: rif.trim() || null, contraparteNombre: contraparte.trim() || null,
        facturaNro: facturaNro.trim() || null, facturaControl: facturaControl.trim() || null,
        facturaFecha, facturaTotal: nDec(facturaTotal) || null,
        moneda, tasa: moneda === 'Bs' ? null : tasa, periodo,
        nota: nota.trim() || null, valorUt: config.valorUt, actor, actorName,
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
          // El texto del supuesto queda como foto en la retención.
          motivo: l.tipo === 'iva' && !esManual
            ? (supuestosIva ? supuestoAplicado(l.motivos, supuestosIva)?.texto ?? null : motivoCienTexto(l.motivos))
            : null,
          moneda,
          tasa: moneda === 'Bs' ? null : tasa,
          baseBs: enBolivares(esManual ? nDec(l.baseStr) : calc.baseImponible, moneda, tasa) || null,
          montoBs: enBolivares(monto, moneda, tasa) || null,
          conceptoCodigo: l.tipo === 'islr' ? (l.conceptoId.split(':')[0] || null) : null,
          conceptoNombre: conceptos.find((c) => c.id === l.conceptoId)?.nombre ?? null,
          descripcion: l.descripcion.trim() || null,
          quincena: l.tipo === 'iva' ? quincenaDe(facturaFecha) : null,
          comprobanteNro: esManual ? (l.numeroStr.trim() || null) : null,
          // La fecha de la línea es la de la retención; el período y la quincena salen de la factura.
          fecha: fechaRetencion,
          regla: !esManual && reglas[l.id] ? columnasDeRegla(reglas[l.id] as CalculoConRegla) : null,
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
    <Modal title="🧾 Registrar retención por factura" size="xl" onClose={pedirCierre}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={pedirCierre} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void emitir()} disabled={saving || !lineas.length}>
            {saving ? 'Guardando…' : `Registrar · ${money(totalRetenido, moneda)}`}
          </button>
        </>
      )}>
      {dialogo}
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      {s.adjunto && (
        <div className="card" style={{ marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <span>📄 Factura cargada por Compras: <strong>{s.adjunto.nombre}</strong></span>
          <button type="button" className="btn btn-sm btn-ghost"
            onClick={() => { const a = s.adjunto; if (a) urlFacturaDeOrigen(a).then((u) => previewArchivo(u, a.nombre)).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.')); }}>
            Ver
          </button>
          <small className="muted">Al registrar, el archivo queda enlazado a esta factura.</small>
        </div>
      )}
      {sinDocumento && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '.75rem' }}>
          <small>Esta factura no viene de una OC, un CS ni una compra directa. Quedará en el libro marcada «Fuera del sistema» y hay que anotar en la nota de dónde viene.</small>
        </div>
      )}

      <div className="form-row">
        <label>¿Quién retuvo?</label>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {DIRECCIONES.map((d) => (
            <label key={d.key} className="card" style={{
              margin: 0, padding: '.45rem .8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem',
              borderColor: direccion === d.key ? 'var(--primary)' : 'var(--border)',
            }}>
              <input type="radio" checked={direccion === d.key} onChange={() => { marcarSucio(); setDireccion(d.key); }} />
              <span style={{ fontWeight: 600 }}>{d.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '2 1 240px' }}>
          <label>{direccion === 'recibida' ? 'Quién nos retuvo' : 'A quién le retenemos'}</label>
          {direccion === 'practicada' ? (
            <SearchSelect value={proveedorId} onChange={elegirProveedor} options={opcionesProveedor}
              placeholder="Buscar proveedor por nombre o RIF…" disabled={!!s.contraparteId} />
          ) : (
            <input className="input" value={contraparte} onChange={(e) => { marcarSucio(); setContraparte(e.target.value); }} placeholder="Razón social" />
          )}
        </div>
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>RIF</label>
          <input className="input mono" value={rif} onChange={(e) => { marcarSucio(); setRif(e.target.value); }} placeholder="J-XXXXXXXX-X"
            readOnly={direccion === 'practicada' && !!proveedorId} />
          {rifMal && <small className="hint" style={{ color: 'var(--danger)' }}>El RIF no es válido.</small>}
        </div>
        <div className="form-row" style={{ flex: '0 1 110px' }}>
          <label>Moneda de la factura</label>
          <select className="select" value={moneda} onChange={(e) => { marcarSucio(); setMoneda(e.target.value); }}>
            <option value="Bs">Bs</option>
            <option value="USD">$</option>
          </select>
        </div>
        {moneda !== 'Bs' && (
          <div className="form-row" style={{ flex: '0 1 140px' }}>
            <label>Tasa (Bs por $)</label>
            <input className="input mono" value={tasaStr} onChange={(e) => { marcarSucio(); setTasaStr(e.target.value); }} inputMode="decimal" />
          </div>
        )}
        {tasaBcv && <small className="hint muted" style={{ alignSelf: 'center', flex: '1 1 100%' }}>{tasaBcv.nota}</small>}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '1 1 140px' }}>
          <label>N° de factura</label>
          <input className="input mono" value={facturaNro} onChange={(e) => { marcarSucio(); setFacturaNro(e.target.value); }} placeholder="Número fiscal (no el código de la OC)" maxLength={30} />
        </div>
        <div className="form-row" style={{ flex: '1 1 120px' }}>
          <label>N° de control</label>
          <input className="input mono" value={facturaControl} onChange={(e) => { marcarSucio(); setFacturaControl(e.target.value); }} maxLength={30} />
        </div>
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>Fecha de la factura</label>
          <input className="input" type="date" value={facturaFecha} max={hoyIso()} onChange={(e) => { marcarSucio(); setFacturaFecha(e.target.value); }} />
          {avisoFecha
            ? <small className="hint" style={{ color: 'var(--danger)' }}>{avisoFecha}</small>
            : <small className="hint muted">Define el período, la quincena y la tasa.</small>}
        </div>
        <div className="form-row" style={{ flex: '1 1 150px' }}>
          <label>Fecha de la retención</label>
          <input className="input" type="date" value={fechaRetencion} onChange={(e) => { marcarSucio(); setFechaRetencion(e.target.value); }} />
          <small className="hint muted">Emisión del comprobante. No cambia el período.</small>
        </div>
        <div className="form-row" style={{ flex: '1 1 130px' }}>
          <label>Total de la factura</label>
          <input className="input mono" value={facturaTotal} onChange={(e) => { marcarSucio(); setFacturaTotal(e.target.value); }} inputMode="decimal" />
        </div>
      </div>

      {/* Las líneas de impuesto */}
      <div className="card" style={{ marginTop: '.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
          <strong style={{ fontSize: '.9rem' }}>Líneas de impuesto</strong>
          <button type="button" className="btn btn-sm btn-ghost"
            onClick={() => { marcarSucio(); setLineas((xs) => [...xs, nuevaLinea({ sujeto: sugerirSujetoPorRif(rif)?.sujeto ?? 'pj_domiciliada' })]); }}>+ Agregar línea</button>
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
                    <label>Sujeto</label>
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
                    <div className="form-row" style={{ margin: 0, flex: '1 1 140px' }}>
                      <label>N° de comprobante</label>
                      <input className="input mono" value={l.numeroStr} onChange={(e) => setLinea(l.id, { numeroStr: e.target.value })}
                        placeholder="El del cliente" />
                    </div>
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
                  <button type="button" className="btn btn-sm btn-ghost" title="Quitar la línea" onClick={() => { marcarSucio(); setLineas((xs) => xs.filter((x) => x.id !== l.id)); }}>✕</button>
                )}
              </div>
              {l.tipo === 'islr' && sugerido && sugerido.sujeto !== l.sujeto && (
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.25rem' }}>
                  <small className="hint muted">
                    Según la letra del RIF sería «{SUJETOS.find((x) => x.key === sugerido.sujeto)?.label ?? sugerido.sujeto}». Verifica antes de registrar: el porcentaje cambia con el sujeto.
                  </small>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLinea(l.id, { sujeto: sugerido.sujeto })}>Usar la sugerencia</button>
                </div>
              )}
              {direccion === 'practicada' && l.tipo === 'iva' && (
                <div className="form-row" style={{ margin: '.3rem 0 0' }}>
                  <label>{supuestosIva ? '¿Aplica un supuesto con su propio porcentaje? (vigentes a la fecha de la factura)' : '¿Corresponde retener el 100%? (Providencia SNAT/2015/0049, art. 5)'}</label>
                  {(supuestosIva ? supuestosIva.map((x): [string, string] => [x.codigo, `${x.texto}${x.pct !== 100 ? ` (${x.pct} %)` : ''}`]) : MOTIVOS_IVA_CIEN).map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', marginTop: '.2rem' }}>
                      <input type="checkbox" checked={!!l.motivos[k]} onChange={(e) => setLinea(l.id, { motivos: { ...l.motivos, [k]: e.target.checked } })} />
                      {label}
                    </label>
                  ))}
                  <small className="hint muted">Sin ninguna marcada se retiene el {config.pctIvaGeneral}%.</small>
                </div>
              )}
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
        <input className="input" value={nota} onChange={(e) => { marcarSucio(); setNota(e.target.value); }}
          placeholder={sinDocumento ? 'De dónde viene esta factura (obligatorio fuera del sistema)' : 'P. ej.: la compra incluye 2 facturas'} />
      </div>
      {moneda !== 'Bs' && tasa > 0 && (
        <small className="hint muted">
          Total retenido en bolívares: Bs {totalRetenidoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (a {tasa} Bs por $).
        </small>
      )}
    </Modal>
  );
}
