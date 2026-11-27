/* ============================================================
   Golden Touch · Retenciones · Devoluciones Pendientes (Reintegros Post-Pago)

   Módulo dedicado al seguimiento y cobranza de retenciones emitidas
   sobre compras u órdenes que ya fueron canceladas al 100% al proveedor.
   El proveedor debe reembolsar el monto retenido a banco o caja.

   Homologado con la funcionalidad de reintegros de Lacantera y conectado
   con el flujo de Conciliación de Entradas de Golden Touch.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cargarOrdenesEsperandoReintegro,
  type FilaConciliacionEntrada,
} from '@/modules/conciliacion/conciliacionEntradas';
import { listRetenciones, type RetencionPracticada } from '@/modules/libroFiscal/retencionesFiscal.repository';
import { bs, usd } from '@/modules/conciliacion/reporteConciliacion';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';

export interface ReintegroPersistido {
  id: string;
  ordenId?: string | null;
  codigoOc?: string | null;
  fechaReintegro: string;
  referencia: string;
  cuentaBanco: string;
  montoBs: number;
  nota?: string | null;
  registradoEn: string;
}

const CLAVE_LOCAL_REINTEGROS = 'gt.retenciones.reintegros';

export function leerReintegrosLocales(): ReintegroPersistido[] {
  try {
    const raw = localStorage.getItem(CLAVE_LOCAL_REINTEGROS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarReintegrosLocales(items: ReintegroPersistido[]) {
  try {
    localStorage.setItem(CLAVE_LOCAL_REINTEGROS, JSON.stringify(items));
  } catch {
    // best-effort
  }
}

export interface ReintegroItemFila {
  id: string;
  ordenId?: string | null;
  codigoOc?: string | null;
  numeroComprobante?: string | null;
  proveedor: string;
  proveedorRif?: string | null;
  proveedorTelefono?: string | null;
  facturas: string[];
  fechaEmision: string;
  fechaReintegro?: string | null;
  moneda: string;
  montoBs: number;
  montoUsd?: number | null;
  tipoRetencion: string;
  estado: 'esperando_reintegro' | 'reintegrado';
  referencia?: string | null;
  cuentaBanco?: string | null;
  diasEspera: number;
  empresaId?: string | null;
}

export interface ReintegrosPendientesViewProps {
  empresaId?: string | null;
  empresaNombre?: string;
  canWrite: boolean;
  actorName?: string | null;
}

const CUENTAS_RECEPTORAS = [
  'Banco Digital de los Trabajadores (BDT) - Cuenta Corriente',
  'Banesco Banco Universal - Cuenta Corriente',
  'Banco de Venezuela (BDV) - Cuenta Corriente',
  'Banco Mercantil - Cuenta Corriente',
  'Bancamiga - Cuenta Corriente',
  'Caja Principal / Efectivo',
  'Otra Cuenta Bancaria',
];

export function ReintegrosPendientesView({
  empresaId,
  empresaNombre,
  canWrite,
}: ReintegrosPendientesViewProps) {
  const [cargando, setCargando] = useState(true);
  const [filas, setFilas] = useState<ReintegroItemFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'esperando_reintegro' | 'reintegrado' | 'todas'>('esperando_reintegro');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Modal para registrar reintegro
  const [modalItem, setModalItem] = useState<ReintegroItemFila | null>(null);
  const [regFecha, setRegFecha] = useState(new Date().toISOString().slice(0, 10));
  const [regCuenta, setRegCuenta] = useState(CUENTAS_RECEPTORAS[0]);
  const [regRef, setRegRef] = useState('');
  const [regMontoBs, setRegMontoBs] = useState('');
  const [regNota, setRegNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const locales = leerReintegrosLocales();
      const localesMap = new Map<string, ReintegroPersistido>();
      for (const loc of locales) {
        if (loc.ordenId) localesMap.set(`id:${loc.ordenId}`, loc);
        if (loc.codigoOc) localesMap.set(`oc:${loc.codigoOc.trim().toUpperCase()}`, loc);
        localesMap.set(loc.id, loc);
      }

      // 1. Órdenes con retención 'despues_de_pagar'
      const ordenesEspera = await cargarOrdenesEsperandoReintegro().catch(() => [] as FilaConciliacionEntrada[]);

      // 2. Comprobantes emitidos en libro fiscal practicado
      const libroRet = await listRetenciones({ direccion: 'practicada' }).catch(() => [] as RetencionPracticada[]);
      const retPorOrdenId = new Map<string, RetencionPracticada>();
      for (const r of libroRet) {
        if (r.docId) retPorOrdenId.set(r.docId, r);
      }

      const hoy = Date.now();
      const resultado: ReintegroItemFila[] = [];

      for (const oe of ordenesEspera) {
        const claveId = oe.ordenId ? `id:${oe.ordenId}` : '';
        const claveOc = oe.codigoOc ? `oc:${oe.codigoOc.trim().toUpperCase()}` : '';
        const loc = (claveId && localesMap.get(claveId)) || (claveOc && localesMap.get(claveOc)) || localesMap.get(oe.id);

        const retAsoc = oe.ordenId ? retPorOrdenId.get(oe.ordenId) : null;
        const fechaRef = oe.fechaReintegro || retAsoc?.fecha || retAsoc?.facturaFecha || oe.id.slice(0, 10);
        const fechaEmisionMs = new Date(fechaRef).getTime();
        const diasEspera = isNaN(fechaEmisionMs)
          ? 0
          : Math.max(0, Math.floor((hoy - fechaEmisionMs) / 86400000));

        const esReintegrado = !!loc || oe.estado === 'reintegrado';

        resultado.push({
          id: oe.id,
          ordenId: oe.ordenId,
          codigoOc: oe.codigoOc,
          numeroComprobante: retAsoc?.numeroComprobante ?? null,
          proveedor: oe.proveedor,
          proveedorRif: retAsoc?.contraparteRif ?? null,
          proveedorTelefono: null,
          facturas: retAsoc?.facturaNumero ? [retAsoc.facturaNumero] : oe.facturas,
          fechaEmision: retAsoc?.fecha || oe.fechaReintegro || '—',
          fechaReintegro: loc?.fechaReintegro ?? oe.fechaReintegro ?? null,
          moneda: oe.moneda || 'Bs',
          montoBs: loc?.montoBs ?? oe.montoRetenidoBs ?? oe.montoBs,
          montoUsd: oe.montoRetenidoUsd ?? oe.montoUsd,
          tipoRetencion: oe.tipoRetencion || (retAsoc ? retAsoc.tipo.toUpperCase() : 'Retención'),
          estado: esReintegrado ? 'reintegrado' : 'esperando_reintegro',
          referencia: loc?.referencia ?? oe.referencia ?? null,
          cuentaBanco: loc?.cuentaBanco ?? oe.cuentaBanco ?? null,
          diasEspera,
          empresaId: retAsoc?.empresaId ?? null,
        });
      }

      setFilas(resultado);
    } catch (e) {
      console.error('Error al cargar reintegros pendientes:', e);
      toast('Error al consultar reintegros de proveedores', 'error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // Filtrado por empresa actual + filtros de cabecera
  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      // Filtro multiempresa (si empresaId está definida y no es GT universal)
      if (empresaId && f.empresaId && f.empresaId !== empresaId) {
        return false;
      }

      if (filtroEstado !== 'todas' && f.estado !== filtroEstado) {
        return false;
      }

      if (desde && f.fechaEmision && f.fechaEmision < desde) return false;
      if (hasta && f.fechaEmision && f.fechaEmision > hasta) return false;

      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const enOc = (f.codigoOc ?? '').toLowerCase().includes(q);
        const enComp = (f.numeroComprobante ?? '').toLowerCase().includes(q);
        const enProv = f.proveedor.toLowerCase().includes(q);
        const enRif = (f.proveedorRif ?? '').toLowerCase().includes(q);
        const enFact = f.facturas.some((x) => x.toLowerCase().includes(q));
        const enRef = (f.referencia ?? '').toLowerCase().includes(q);
        if (!enOc && !enComp && !enProv && !enRif && !enFact && !enRef) return false;
      }

      return true;
    });
  }, [filas, empresaId, filtroEstado, desde, hasta, busqueda]);

  // Indicadores de resumen
  const kpis = useMemo(() => {
    const pendientes = filtradas.filter((f) => f.estado === 'esperando_reintegro');
    const reintegradas = filtradas.filter((f) => f.estado === 'reintegrado');

    const totalBsPendiente = pendientes.reduce((acc, f) => acc + (f.montoBs || 0), 0);
    const totalUsdPendiente = pendientes.reduce((acc, f) => acc + (f.montoUsd || 0), 0);

    const totalBsCobrado = reintegradas.reduce((acc, f) => acc + (f.montoBs || 0), 0);
    const totalUsdCobrado = reintegradas.reduce((acc, f) => acc + (f.montoUsd || 0), 0);

    const promedioDias = pendientes.length
      ? Math.round(pendientes.reduce((acc, f) => acc + f.diasEspera, 0) / pendientes.length)
      : 0;

    return {
      pendientesCount: pendientes.length,
      totalBsPendiente,
      totalUsdPendiente,
      reintegradasCount: reintegradas.length,
      totalBsCobrado,
      totalUsdCobrado,
      promedioDias,
    };
  }, [filtradas]);

  const abrirModal = (item: ReintegroItemFila) => {
    setModalItem(item);
    setRegFecha(item.fechaReintegro || new Date().toISOString().slice(0, 10));
    setRegCuenta(item.cuentaBanco || CUENTAS_RECEPTORAS[0]);
    setRegRef(item.referencia || '');
    setRegMontoBs(String(item.montoBs));
    setRegNota('');
  };

  const handleGuardarReintegro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalItem) return;

    const monto = parseFloat(regMontoBs.replace(/\./g, '').replace(',', '.'));
    if (isNaN(monto) || monto <= 0) {
      toast('Ingresa un monto válido para el reintegro', 'error');
      return;
    }
    if (!regRef.trim()) {
      toast('Ingresa el número de referencia bancaria o recibo', 'error');
      return;
    }

    setGuardando(true);
    try {
      const nuevoReintegro: ReintegroPersistido = {
        id: modalItem.id,
        ordenId: modalItem.ordenId,
        codigoOc: modalItem.codigoOc,
        fechaReintegro: regFecha,
        referencia: regRef.trim(),
        cuentaBanco: regCuenta,
        montoBs: monto,
        nota: regNota.trim() || null,
        registradoEn: new Date().toISOString(),
      };

      const existentes = leerReintegrosLocales().filter((x) => x.id !== modalItem.id && x.codigoOc !== modalItem.codigoOc);
      existentes.push(nuevoReintegro);
      guardarReintegrosLocales(existentes);

      toast(`✅ Reintegro de ${modalItem.proveedor} registrado con éxito (${bs(monto)})`, 'success');
      setModalItem(null);
      await cargarDatos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el reintegro', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const copiarMensajeCobro = (item: ReintegroItemFila) => {
    const txt = [
      `*🔔 AVISO DE REINTEGRO PENDIENTE · ${empresaNombre || 'GOLDEN TOUCH'}*`,
      `Estimado proveedor *${item.proveedor}*,`,
      `Le informamos que tenemos pendiente el reembolso de la retención correspondiente a la orden *${item.codigoOc || 'S/N'}*${item.facturas.length ? ` (Factura ${item.facturas.join(', ')})` : ''}.`,
      item.numeroComprobante ? `Comprobante de retención emitido: *N° ${item.numeroComprobante}*` : '',
      `*Monto por reintegrar:* ${bs(item.montoBs)}${item.montoUsd ? ` (${usd(item.montoUsd)})` : ''}`,
      `Días transcurridos: *${item.diasEspera} día(s)*`,
      `Favor realizar el reintegro a nuestras cuentas autorizadas y remitir el soporte correspondiente.`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(txt).then(() => {
      toast('📋 Mensaje de cobranza copiado al portapapeles para WhatsApp o correo.', 'success');
    }).catch(() => {
      toast('No se pudo copiar el texto', 'error');
    });
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* ── Banner explicativo normativo / operativo ── */}
      <div
        style={{
          display: 'flex',
          gap: '.85rem',
          alignItems: 'flex-start',
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          background: 'rgba(245, 158, 11, 0.07)',
          border: '1.5px solid rgba(245, 158, 11, 0.35)',
        }}
      >
        <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>⚠️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#fbbf24', marginBottom: '.25rem' }}>
            Devoluciones pendientes de proveedores (Reintegros post-pago)
          </div>
          <div style={{ fontSize: '.82rem', color: '#cbd5e1', lineHeight: 1.45 }}>
            Retenciones emitidas después de haber pagado la orden de compra al 100%. El proveedor debe reembolsar el monto retenido en banco o caja. Al recibir los fondos, pulse <strong>«Registrar reintegro»</strong> para cuadrar el libro fiscal y conciliación bancaria.
          </div>
        </div>
      </div>

      {/* ── KPI Cards de Gestión ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '.75rem',
        }}
      >
        <div className="card" style={{ padding: '.85rem 1rem', borderLeft: '4px solid #f59e0b' }}>
          <div className="muted" style={{ fontSize: '.76rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Por Recuperar (Pendientes)
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b', marginTop: '.2rem' }}>
            {bs(kpis.totalBsPendiente)}
          </div>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '.15rem' }}>
            {kpis.pendientesCount} comprobante(s) en espera {kpis.totalUsdPendiente > 0 && `· ${usd(kpis.totalUsdPendiente)}`}
          </div>
        </div>

        <div className="card" style={{ padding: '.85rem 1rem', borderLeft: '4px solid #22c55e' }}>
          <div className="muted" style={{ fontSize: '.76rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Reintegrados (Cobrados)
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#22c55e', marginTop: '.2rem' }}>
            {bs(kpis.totalBsCobrado)}
          </div>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '.15rem' }}>
            {kpis.reintegradasCount} reembolso(s) confirmados en banco
          </div>
        </div>

        <div className="card" style={{ padding: '.85rem 1rem', borderLeft: '4px solid #38bdf8' }}>
          <div className="muted" style={{ fontSize: '.76rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Tiempo Promedio en Espera
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '.2rem' }}>
            {kpis.promedioDias} {kpis.promedioDias === 1 ? 'día' : 'días'}
          </div>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: '.15rem' }}>
            Desde la emisión de la orden o comprobante
          </div>
        </div>
      </div>

      {/* ── Barra de filtros y búsqueda ── */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '.6rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '.65rem .85rem',
        }}
      >
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 320px' }}>
          <input
            className="input"
            style={{ minWidth: '220px', flex: 1 }}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por OC, comprobante, proveedor o factura…"
          />

          <div className="view-toggle" style={{ margin: 0 }}>
            <button
              type="button"
              className={filtroEstado === 'esperando_reintegro' ? 'active' : ''}
              onClick={() => setFiltroEstado('esperando_reintegro')}
            >
              Pendientes ({kpis.pendientesCount})
            </button>
            <button
              type="button"
              className={filtroEstado === 'reintegrado' ? 'active' : ''}
              onClick={() => setFiltroEstado('reintegrado')}
            >
              Reintegrados ({kpis.reintegradasCount})
            </button>
            <button
              type="button"
              className={filtroEstado === 'todas' ? 'active' : ''}
              onClick={() => setFiltroEstado('todas')}
            >
              Todos ({filas.length})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            title="Desde fecha de emisión"
          />
          <span className="muted">a</span>
          <input
            className="input"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            title="Hasta fecha de emisión"
          />
          {(desde || hasta || busqueda) && (
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => { setDesde(''); setHasta(''); setBusqueda(''); }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla de Reintegros ── */}
      {cargando ? (
        <div className="card text-center" style={{ padding: '2.5rem' }}>
          <p className="muted">Consultando reintegros de retenciones post-pago…</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div
          className="card text-center"
          style={{
            padding: '3rem 1.5rem',
            border: '1.5px dashed var(--border)',
            background: 'rgba(255, 255, 255, 0.01)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '.6rem' }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
            No hay reintegros {filtroEstado === 'esperando_reintegro' ? 'pendientes de cobro' : 'para mostrar'}
          </div>
          <p className="muted" style={{ maxWidth: '420px', margin: '.4rem auto 0', fontSize: '.82rem' }}>
            {filtroEstado === 'esperando_reintegro'
              ? 'Todos los proveedores con retenciones emitidas post-pago han devuelto los importes correspondientes.'
              : 'No se encontraron registros con los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="table-responsive card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" style={{ margin: 0, width: '100%', fontSize: '.82rem' }}>
            <thead style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '.65rem .85rem' }}>Comprobante / OC</th>
                <th style={{ padding: '.65rem .85rem' }}>Proveedor / Contacto</th>
                <th style={{ padding: '.65rem .85rem' }}>Factura</th>
                <th style={{ padding: '.65rem .85rem' }}>Emisión</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'right' }}>Por Reintegrar</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'center' }}>Espera</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'center' }}>Estatus</th>
                <th style={{ padding: '.65rem .85rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((item) => {
                const esPendiente = item.estado === 'esperando_reintegro';
                const badgeColor = item.diasEspera >= 15 ? '#ef4444' : item.diasEspera >= 7 ? '#f59e0b' : '#22c55e';
                const badgeBg = item.diasEspera >= 15 ? 'rgba(239, 68, 68, 0.15)' : item.diasEspera >= 7 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)';

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: !esPendiente ? 'rgba(34, 197, 94, 0.02)' : 'transparent' }}>
                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle' }}>
                      <div className="mono font-semibold" style={{ color: 'var(--text)' }}>
                        {item.codigoOc || 'S/N'}
                      </div>
                      {item.numeroComprobante && (
                        <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                          Comp: <span className="mono">{item.numeroComprobante}</span>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.proveedor}</div>
                      {item.proveedorRif && (
                        <div className="muted mono" style={{ fontSize: '.74rem' }}>{item.proveedorRif}</div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle' }}>
                      {item.facturas.length ? (
                        item.facturas.map((fc) => (
                          <span key={fc} className="mono" style={{ fontSize: '.76rem', background: 'rgba(255,255,255,0.04)', padding: '2px 5px', borderRadius: '4px', marginRight: '4px' }}>
                            {fc}
                          </span>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span className="muted">{item.fechaEmision}</span>
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 700, color: esPendiente ? '#f59e0b' : '#22c55e', fontSize: '.9rem' }}>
                        {bs(item.montoBs)}
                      </div>
                      {item.montoUsd != null && item.montoUsd > 0 && (
                        <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                          {usd(item.montoUsd)}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'center', verticalAlign: 'middle' }}>
                      {esPendiente ? (
                        <span
                          style={{
                            fontSize: '.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            color: badgeColor,
                            background: badgeBg,
                            border: `1px solid ${badgeColor}`,
                          }}
                        >
                          {item.diasEspera} {item.diasEspera === 1 ? 'día' : 'días'}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: '.74rem' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'center', verticalAlign: 'middle' }}>
                      {esPendiente ? (
                        <span style={{ fontSize: '.74rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          Esperando
                        </span>
                      ) : (
                        <div>
                          <span style={{ fontSize: '.74rem', color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            Reintegrado
                          </span>
                          {item.referencia && (
                            <div style={{ fontSize: '.68rem', color: '#94a3b8', marginTop: '.2rem' }}>
                              Ref: <span className="mono">{item.referencia}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '.65rem .85rem', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: '.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {canWrite && esPendiente && (
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            onClick={() => abrirModal(item)}
                            title="Registrar devolución bancaria o en caja"
                          >
                            ✏️ Registrar reintegro
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => copiarMensajeCobro(item)}
                          title="Copiar texto de reclamo para WhatsApp / Correo"
                        >
                          💬 Cobro
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal para Registrar Reintegro ── */}
      {modalItem && (
        <Modal
          title="Registrar Reintegro de Proveedor"
          onClose={() => setModalItem(null)}
        >
          <form onSubmit={handleGuardarReintegro} style={{ display: 'grid', gap: '.85rem' }}>
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '.8rem',
                borderRadius: '8px',
                fontSize: '.82rem',
              }}
            >
              <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: '.2rem' }}>
                Ingreso por devolución de retención post-pago
              </div>
              <div className="muted" style={{ lineHeight: 1.4 }}>
                El proveedor <strong>{modalItem.proveedor}</strong> reembolsa los fondos correspondientes a la retención de la orden <strong>{modalItem.codigoOc || 'S/N'}</strong>.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  Cuenta Receptora *
                </label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={regCuenta}
                  onChange={(e) => setRegCuenta(e.target.value)}
                  required
                >
                  {CUENTAS_RECEPTORAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  Monto Reintegrado (Bs) *
                </label>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0.01"
                  style={{ width: '100%' }}
                  value={regMontoBs}
                  onChange={(e) => setRegMontoBs(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  Fecha del Reintegro *
                </label>
                <input
                  className="input"
                  type="date"
                  style={{ width: '100%' }}
                  value={regFecha}
                  onChange={(e) => setRegFecha(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                  N° Referencia Bancaria / Recibo *
                </label>
                <input
                  className="input mono"
                  type="text"
                  style={{ width: '100%' }}
                  value={regRef}
                  onChange={(e) => setRegRef(e.target.value)}
                  placeholder="Ej. REF-09823412"
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.2rem' }}>
                Nota u Observación (opcional)
              </label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: '60px' }}
                value={regNota}
                onChange={(e) => setRegNota(e.target.value)}
                placeholder="Detalle adicional del reintegro o comprobante de depósito…"
              />
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setModalItem(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={guardando}
              >
                {guardando ? 'Guardando…' : 'Confirmar Reintegro'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
