import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect, SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, date as fmtDate, dosDecimales, redondearArriba5 } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { GestionarCajasModal } from '@/modules/salidas/GestionarCajasModal';
import {
  listRenglonesPorPagar, countRenglonesPorPagar, pagarRenglon, getRenglonById, urlComprobanteNomina, labelMotivoNomina,
} from '@/modules/rrhh/nomina.repository';
import { previewPdf, previewArchivo } from '@/shared/lib/reportePreview';
import type { NominaRenglon } from '@/shared/lib/types';
import type { Caja, MovimientoCaja, Orden } from '@/shared/lib/types';
import { HistorialTasasModal } from './HistorialTasasModal';
import { TasasView } from './TasasView';
import { DirectosPorPagarPanel } from './DirectosPorPagarPanel';
import { listComprasDirectas, getCompraDirectaByCajaMovId, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { listServiciosDirectos, getServicioDirectoByCajaMovId, type ServicioDirecto } from '@/modules/pedidos/serviciosDirectos.repository';
import { getTasaHoy, aBs, aExtranjero, round2, getTasasMercado, refrescarBinanceP2P, getBinance3, refrescarTasasSiVencido, type TasasMercado, type Binance3 } from './tasas.repository';
import { saldosDeCaja, ingresarDivisa, listLotes, listSaldos, trasladoEntreCajasMulti, convertirDivisa } from './cajaSaldos.repository';
import {
  crearTransferenciaSaliente, confirmarTransferenciaEntrante, reintentarTransferencia,
  listTransferenciasInter,
} from './transferenciasInter.repository';
import type { TransferenciaInter, TransferLeg } from '@/shared/lib/types';
import { listMonedas, addMoneda } from './monedas';
import type { MonedaCaja, CuentaCaja, CajaSaldo, CajaLote } from '@/shared/lib/types';
import { BarChart, type ChartPoint } from '@/shared/ui/Chart';
import {
  listCajasActivas, listCentrosAcopio,
  registrarGasto, disponibilidadFinanciera, listLibroMayor, ultimoCorrelativo,
  type Disponibilidad,
} from './tesoreria.repository';
import { esMovimientoEditable, editarMovimientoCajaManual, eliminarMovimientoCajaManual, editarFechaMovimiento } from '@/modules/salidas/cajas.repository';
import {
  listContrapartes, crearContraparte, actualizarContraparte, eliminarContraparte,
  type Contraparte, type TipoContraparte,
} from './contrapartes.repository';
import {
  crearCuentaPorPagar, listCuentasPorPagar, listAbonosCuenta, listIngresosCuenta, registrarAbonoCuenta,
  pagarCuentaConProductos, abonarCuentaConProductoRecibido, recibirDineroDeMGG,
  type CuentaPorPagar, type AbonoCxP, type IngresoCxP,
} from './cuentasPorPagar.repository';
import { listProductos, createProducto, getUnidades, nextSku } from '@/modules/inventario/inventario.repository';
import { getNombresAlmacenes } from '@/modules/inventario/almacenes.repository';
import type { Producto } from '@/shared/lib/types';
import {
  listCuentasPorCobrar, listCargosCobrar, listCobrosCuenta, registrarCobro, crearOAcumularCuentaPorCobrar,
  type CuentaPorCobrar, type CargoCxC, type CobroCxC,
} from './cuentasPorCobrar.repository';
import { descargarCuentaPorCobrarPdf } from './cuentaPorCobrarPdf';
import { descargarOrdenesPorPagarPdf } from './ordenesPorPagarPdf';
import { descargarLibroMayorPdf } from './libroMayorPdf';
import {
  listOrdenesPorPagar, pagarOrdenCompra, pagarOrdenCompraMultiCajas, labelMetodoPago, pagoSinComprobante, type OrdenPorPagar,
  listOrdenesEnCredito, registrarAbonoMulti, listAbonos, type AbonoLeg, type AbonoComision,
  getOrdenById, urlAdjuntoOc, getImagenOrdenSignedUrl,
} from '@/modules/pedidos/pedidos.repository';
import { labelCondicionPago } from '@/modules/pedidos/ofertas.repository';
import { ChatOrden } from '@/modules/pedidos/ChatOrden';
import { noLeidosPorOrden } from '@/modules/pedidos/ordenChat.repository';
import { resumenDatosPago, DatosPagoFields, validarDatosPago } from '@/shared/ui/DatosPagoFields';
import { listDatosPago, guardarDatosPago, METODOS_CON_DATOS, type DatosPago } from '@/modules/pedidos/datosPago.repository';
import { comprobantesDeOrden, urlRetencion, labelRetencionModo, listRetencionesHechas, type RetencionItem } from '@/modules/retenciones/retenciones.repository';
import { descargarReportePdf, type ReporteMeta } from './reportePdf';
import { CierreMesModal } from './CierreMesModal';
import { CategoriasGastoModal } from './CategoriasGastoModal';
import { listCategoriasGasto, soloCategorias, subcategoriasDe, ensureCategoriaGasto, categoriaLlevaCorrelativo, type CategoriaGasto } from './categoriasGasto.repository';
import { descargarMovimientoDetallePdf, type DirectoDetalle } from './movimientoDetallePdf';
import { descargarCuentaPorPagarPdf } from './cuentaPorPagarPdf';
import { descargarResumenCuentasPdf } from './resumenCuentasPdf';
import { enviarReportePorCorreo, enviarMovimientoDetallePorCorreo, enviarCuentaPorPagarPorCorreo } from './enviarReporte';
import type { AbonoCredito } from '@/shared/lib/types';
import { descargarOrdenCompraPdf } from '@/modules/pedidos/ordenCompraPdf';
import { listOfertasByOrden, getPdfOfertaSignedUrl } from '@/modules/pedidos/ofertas.repository';
import type { OfertaProveedor } from '@/shared/lib/types';

const TIPO_MOV_LABEL: Record<string, string> = {
  ingreso: '⬇ Ingreso', salida: '⬆ Egreso', traslado_salida: '↔ Traslado (sale)',
  traslado_entrada: '↔ Traslado (entra)', ajuste: '⚙ Ajuste',
};
const CAT_LABEL: Record<string, string> = {
  gasto: 'Gasto', pago_personal: 'Pago a personal', pago_oc: 'Pago de compra', pago_nomina: 'Pago de nómina',
};

/** ¿El movimiento resta del saldo (egreso)? Mismo criterio que usa el render. */
function esEgresoMov(m: MovimientoCaja): boolean {
  return m.tipo === 'salida' || m.tipo === 'traslado_salida'
    || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
}

/** Total NETO (ingresos − egresos) de la columna Monto, agrupado por moneda.
 *  Las monedas no se mezclan: una línea de total por cada una. */
function netoMontoPorMoneda(movs: MovimientoCaja[]): Array<{ moneda: string; total: number }> {
  const map = new Map<string, number>();
  for (const m of movs) {
    const v = (esEgresoMov(m) ? -1 : 1) * (Number(m.monto) || 0);
    map.set(m.moneda, (map.get(m.moneda) || 0) + v);
  }
  return [...map.entries()]
    .map(([moneda, total]) => ({ moneda, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => (a.moneda < b.moneda ? -1 : 1));
}

/** Detalle del gasto etiquetado: "N° 12 · Recepción · Flete" (lo que aplique). */
function detalleGasto(m: MovimientoCaja): string {
  return [
    m.gasto_correlativo != null ? `N° ${m.gasto_correlativo}` : null,
    m.gasto_categoria, m.gasto_subcategoria,
  ].filter(Boolean).join(' · ');
}

/** Formatea un monto con el símbolo de su moneda (2 decimales). */
function monto(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

/** Normaliza texto para buscar: minúsculas y sin acentos (búsqueda tolerante). */
function normalizarBusqueda(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export function TesoreriaPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('tesoreria', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [disp, setDisp] = useState<Disponibilidad | null>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [libro, setLibro] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'gasto' | 'traslado' | 'pago' | 'cajas' | 'tasas' | 'porpagar' | 'creditos' | 'cobrar' | 'conversor' | 'calculadora' | 'grafico' | 'contrapartes' | 'retencion' | 'cierre' | 'categorias' | 'recibir_mgg'>('none');
  // Abrir un modal directo desde la URL (?ver=creditos), p. ej. al venir de la
  // tarjeta "USD entregados" de Acopio → Cuentas por pagar (créditos) / deuda MGG.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const ver = searchParams.get('ver');
    if (!ver) return;
    const validos = ['gasto', 'traslado', 'pago', 'cajas', 'tasas', 'porpagar', 'creditos', 'cobrar', 'conversor', 'calculadora', 'grafico', 'contrapartes', 'retencion', 'cierre', 'categorias', 'recibir_mgg'];
    if (validos.includes(ver)) setModal(ver as typeof modal);
    const next = new URLSearchParams(searchParams);
    next.delete('ver');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [cajaSel, setCajaSel] = useState<Caja | null>(null);
  const [porPagarCount, setPorPagarCount] = useState(0);
  const [creditosCount, setCreditosCount] = useState(0);
  const [nominaCount, setNominaCount] = useState(0);
  // Cuentas por pagar / cobrar abiertas (para el libro mayor por moneda).
  const [cxpRows, setCxpRows] = useState<CuentaPorPagar[]>([]);
  const [cxcRows, setCxcRows] = useState<CuentaPorCobrar[]>([]);
  // Filtros del libro mayor (rango de fechas para Debe/Haber + moneda).
  const [lmDesde, setLmDesde] = useState('');
  const [lmHasta, setLmHasta] = useState('');
  const [lmMoneda, setLmMoneda] = useState('');
  // Moneda cuyo detalle de movimientos se está viendo (clic en una fila del libro mayor).
  const [lmDetalleMoneda, setLmDetalleMoneda] = useState<string | null>(null);
  const [vista, setVista] = useState<'tesoreria' | 'tasas' | 'movimientos'>('tesoreria');
  const [correoMovOpen, setCorreoMovOpen] = useState(false);
  const [movSel, setMovSel] = useState<MovimientoCaja | null>(null);
  const [resumenMovOpen, setResumenMovOpen] = useState(false);

  // Filtros del registro de movimientos
  const [fCaja, setFCaja] = useState<string>('');   // billetera/caja (server-side, listLibroMayor)
  const [fMoneda, setFMoneda] = useState<string>('');
  const [monedasReg, setMonedasReg] = useState<string[]>(['Bs', 'USD', 'USDT', 'COP']);
  useEffect(() => { listMonedas().then(setMonedasReg).catch(() => { /* base */ }); }, []);
  const [fTipo, setFTipo] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fBuscar, setFBuscar] = useState('');

  const [transfers, setTransfers] = useState<TransferenciaInter[]>([]);

  const reload = useCallback(async () => {
    const [d, cs, sal, mov, pp, cr, cxp, cxc, tr, nc, cd, sd] = await Promise.all([
      disponibilidadFinanciera(),
      listCajasActivas(),
      listSaldos().catch(() => [] as CajaSaldo[]),
      listLibroMayor({ cajaId: fCaja || undefined, moneda: fMoneda || undefined, tipo: fTipo || undefined, desde: fDesde || undefined, hasta: fHasta || undefined }),
      listOrdenesPorPagar().catch(() => [] as OrdenPorPagar[]),
      listOrdenesEnCredito().catch(() => [] as OrdenPorPagar[]),
      listCuentasPorPagar(true).catch(() => [] as CuentaPorPagar[]),
      listCuentasPorCobrar(true).catch(() => [] as CuentaPorCobrar[]),
      listTransferenciasInter().catch(() => [] as TransferenciaInter[]),
      countRenglonesPorPagar().catch(() => 0),
      listComprasDirectas().catch(() => [] as CompraDirecta[]),
      listServiciosDirectos().catch(() => [] as ServicioDirecto[]),
    ]);
    const crPendientes = cr.filter((x) => (Number(x.orden.total) - (Number(x.orden.abonado_total) || 0)) > 0.01);
    // Directos (compra/servicio) que el analista dejó "por pagar" — los paga Tesorería.
    const directosPorPagar = cd.filter((c) => c.estado === 'por_pagar').length + sd.filter((s) => s.estado === 'por_pagar').length;
    // El contador del botón suma créditos de OC + cuentas por pagar manuales (cliente/proveedor) abiertas.
    setDisp(d); setCajas(cs); setSaldos(sal); setLibro(mov); setPorPagarCount(pp.length + directosPorPagar); setCreditosCount(crPendientes.length + cxp.length); setCxpRows(cxp); setCxcRows(cxc); setTransfers(tr); setNominaCount(nc);
  }, [fCaja, fMoneda, fTipo, fDesde, fHasta]);

  // Realtime: multiusuario · lo que registra otro usuario (o el otro sistema) se refleja acá.
  useRealtime(['movimientos_caja', 'caja_saldos', 'cajas', 'transferencias_inter', 'ordenes', 'nomina_renglones', 'cuentas_por_pagar', 'cuentas_por_pagar_abonos', 'cuentas_por_pagar_ingresos', 'cuentas_por_cobrar', 'cuentas_por_cobrar_cargos', 'cuentas_por_cobrar_abonos', 'compras_directas', 'servicios_directos'], () => { void reload(); });

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => {
        const msg = e instanceof Error ? e.message
          : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
          : 'Error al cargar';
        toast(msg, 'error');
      })
      .finally(() => setLoading(false));
  }, [reload]);

  const cerrarYRecargar = async () => { setModal('none'); await reload(); };

  // Búsqueda general (client-side) sobre los movimientos ya cargados: caja,
  // concepto, beneficiario, motivo, moneda, monto, saldo y fecha. Cada palabra
  // tecleada debe aparecer en algún campo (búsqueda tipo "todas las palabras").
  // Texto de búsqueda por fila, precomputado SOLO cuando cambia `libro`. Así teclear
  // en el buscador no recalcula normalize/toLocaleString por cada movimiento en cada
  // pulsación (antes era el cuello de botella con cientos de filas), solo hace `includes`.
  const libroIndexado = useMemo(() => libro.map((m) => ({
    m,
    heno: normalizarBusqueda([
      m.caja?.nombre, TIPO_MOV_LABEL[m.tipo] ?? m.tipo, CAT_LABEL[m.categoria ?? ''] ?? m.categoria,
      detalleGasto(m), m.beneficiario, m.motivo, m.destino, m.cuenta, m.moneda,
      monto(m.monto, m.moneda), monto(m.saldo_despues, m.moneda), dateTime(m.at),
    ].filter(Boolean).join(' ')),
  })), [libro]);
  const libroView = useMemo(() => {
    const q = normalizarBusqueda(fBuscar);
    if (!q) return libro;
    const palabras = q.split(/\s+/).filter(Boolean);
    return libroIndexado.filter(({ heno }) => palabras.every((p) => heno.includes(p))).map(({ m }) => m);
  }, [libro, libroIndexado, fBuscar]);

  // Libro mayor por moneda: una fila por moneda con Debe (entra), Haber (sale),
  // Saldo disponible en cajas, y los saldos abiertos de cuentas por pagar y por cobrar.
  // Los totales son por moneda (no se convierten ni se mezclan monedas).
  const libroMayor = useMemo(() => {
    const entra = (m: MovimientoCaja) => m.tipo === 'ingreso' || m.tipo === 'traslado_entrada' || (m.tipo === 'ajuste' && Number(m.saldo_despues) > Number(m.saldo_antes));
    const sale = (m: MovimientoCaja) => m.tipo === 'salida' || m.tipo === 'traslado_salida' || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
    // El rango de fechas filtra los movimientos de Debe/Haber. Saldo, CxP y CxC
    // son saldos vigentes (a hoy), no dependen del rango.
    const enRango = (m: MovimientoCaja) => {
      const dia = (m.at ?? '').slice(0, 10);
      if (lmDesde && dia < lmDesde) return false;
      if (lmHasta && dia > lmHasta) return false;
      return true;
    };
    const movs = libro.filter(enRango);
    const monedasSet = new Set<string>();
    saldos.forEach((s) => monedasSet.add(s.moneda));
    libro.forEach((m) => monedasSet.add(m.moneda));
    cxpRows.forEach((c) => monedasSet.add(c.moneda));
    cxcRows.forEach((c) => monedasSet.add(c.moneda));
    return [...monedasSet].sort()
      .filter((mon) => !lmMoneda || mon === lmMoneda)
      .map((mon) => {
        const debe = round2(movs.filter((m) => m.moneda === mon && entra(m)).reduce((a, m) => a + (Number(m.monto) || 0), 0));
        const haber = round2(movs.filter((m) => m.moneda === mon && sale(m)).reduce((a, m) => a + (Number(m.monto) || 0), 0));
        const saldo = round2(saldos.filter((s) => s.moneda === mon).reduce((a, s) => a + (Number(s.saldo) || 0), 0));
        const porPagar = round2(cxpRows.filter((c) => c.moneda === mon).reduce((a, c) => a + (Number(c.monto) - (Number(c.abonado) || 0)), 0));
        const porCobrar = round2(cxcRows.filter((c) => c.moneda === mon).reduce((a, c) => a + (Number(c.monto) - (Number(c.cobrado) || 0)), 0));
        return { moneda: mon, debe, haber, saldo, porPagar, porCobrar };
      }).filter((r) => r.debe || r.haber || r.saldo || r.porPagar || r.porCobrar);
  }, [libro, saldos, cxpRows, cxcRows, lmDesde, lmHasta, lmMoneda]);

  // Monedas disponibles para el selector del filtro del libro mayor.
  const lmMonedas = useMemo(() => {
    const s = new Set<string>();
    saldos.forEach((x) => s.add(x.moneda));
    libro.forEach((x) => s.add(x.moneda));
    cxpRows.forEach((x) => s.add(x.moneda));
    cxcRows.forEach((x) => s.add(x.moneda));
    return [...s].sort();
  }, [saldos, libro, cxpRows, cxcRows]);

  // Metadatos del reporte PDF/correo del registro de movimientos (según filtros).
  const reporteMeta = () => ({
    titulo: 'REPORTE DE MOVIMIENTOS',
    subtitulo: [
      fDesde && `Desde ${fDesde}`, fHasta && `Hasta ${fHasta}`,
      fCaja && `Billetera ${cajas.find((c) => c.id === fCaja)?.nombre ?? ''}`.trim(),
      fMoneda && `Moneda ${fMoneda}`, fTipo && `Tipo ${fTipo}`,
      fBuscar.trim() && `Búsqueda "${fBuscar.trim()}"`,
    ].filter(Boolean).join(' · ') || 'Todos los movimientos',
  });

  // Respaldo del cron: si las tasas están vencidas (>11h), las refresca al abrir.
  useEffect(() => { void refrescarTasasSiVencido().catch(() => { /* sin conexión */ }); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>🏦 Tesorería</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Flujo de dinero, registro de movimientos y pagos.</p>
        </div>
        <div className="view-toggle" role="tablist" aria-label="Vista de tesorería">
          <button className={vista === 'tesoreria' ? 'active' : ''} onClick={() => setVista('tesoreria')}>🏦 Tesorería</button>
          <button className={vista === 'tasas' ? 'active' : ''} onClick={() => setVista('tasas')}>📈 Tasas del Día</button>
          <button className={vista === 'movimientos' ? 'active' : ''} onClick={() => setVista('movimientos')}>📒 Registro de Movimientos</button>
        </div>
      </div>

      {vista === 'tasas' && <TasasView />}

      {vista === 'tesoreria' && (
      <>
          {/* Disponibilidad financiera */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <DispCard titulo="Disponible en USD" valor={monto(disp?.usd ?? 0, 'USD')} />
            <DispCard titulo="Disponible en USDT" valor={monto(disp?.usdt ?? 0, 'USDT')} />
            <DispCard titulo="Total en Bs" valor={monto(disp?.bs ?? 0, 'Bs')} nota="solo lo ingresado en la cuenta Bs" destacado />
          </div>

          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {canWrite && (
              <>
                <button className="btn btn-primary" onClick={() => setModal('porpagar')}>
                  🧾 ÓRDENES PENDIENTES POR PAGAR{porPagarCount ? ` (${porPagarCount})` : ''}
                </button>
                <button className="btn btn-primary" onClick={() => setModal('creditos')} title={`${creditosCount} cuenta(s) por pagar pendiente(s)`}>
                  💳 CUENTAS POR PAGAR (CRÉDITOS)
                  <span
                    className="mono"
                    style={{
                      marginLeft: '.5rem', padding: '.05rem .5rem', borderRadius: '999px',
                      fontWeight: 800, fontSize: '.85rem',
                      background: creditosCount > 0 ? 'var(--danger, #e5484d)' : 'rgba(0,0,0,.25)',
                      color: '#fff', minWidth: '1.4rem', display: 'inline-block', textAlign: 'center',
                    }}
                  >
                    {creditosCount}
                  </span>
                </button>
                <button className="btn btn-primary" onClick={() => setModal('cobrar')} title="Lo que clientes/proveedores le deben a la empresa">
                  💰 CUENTAS POR COBRAR
                </button>
                <button className="btn btn-primary" onClick={() => setModal('recibir_mgg')} title="Recibir dinero de MGG directo en una caja (crea deuda a MGG, se salda con producto o abonos)">
                  💵 RECIBIR DINERO DE MGG
                </button>
                <button className={nominaCount > 0 ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setModal('pago')}>
                  {nominaCount > 0 ? `💸 PAGAR NÓMINA (${nominaCount})` : '👥 Pago a personal'}
                </button>
                <button className="btn btn-ghost" onClick={() => setModal('gasto')}>− Gasto</button>
                <button className="btn btn-ghost" onClick={() => setModal('traslado')}>↔ Traspaso de dinero</button>
                <button className="btn btn-ghost" onClick={() => setModal('cajas')}>🏦 Cajas</button>
                <button className="btn btn-ghost" onClick={() => setModal('contrapartes')}>👥 Clientes / Proveedores</button>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => setModal('conversor')}>💱 Conversor</button>
            <button className="btn btn-ghost" onClick={() => setModal('calculadora')}>🧮 Calculadora</button>
            <button className="btn btn-ghost" onClick={() => setModal('grafico')}>📊 Tasas Binance</button>
            <button className="btn btn-ghost" onClick={() => setModal('tasas')}>📈 Historial Tasas</button>
            <button className="btn btn-ghost" onClick={() => setResumenMovOpen(true)}>📊 Resumen de movimientos</button>
            <button className="btn btn-ghost" onClick={() => setModal('retencion')}>🧾 Retención</button>
            <button className="btn btn-ghost" onClick={() => setModal('categorias')}>🏷 Categorías (gasto)</button>
            <button className="btn btn-ghost" onClick={() => setModal('cierre')}>🗓️ Cierre de mes</button>
          </div>

          {/* Saldos por caja (multimoneda; clic = detalle, ingreso, trazabilidad) */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {cajas.map((c) => {
              const sc = saldos.filter((s) => s.caja_id === c.id && (Number(s.saldo) || 0) !== 0);
              return (
                <button key={c.id} className="card" onClick={() => setCajaSel(c)}
                  style={{ padding: '.6rem .9rem', minWidth: 170, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card, transparent)' }}
                  title="Ver detalle, ingresar dinero y trazabilidad">
                  <div className="muted" style={{ fontSize: '.72rem' }}>{c.nombre} <span style={{ float: 'right' }}>⚙</span></div>
                  {sc.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem .5rem', margin: '.2rem 0' }}>
                      {sc.map((s) => (
                        <span key={s.id} className="mono" style={{ fontSize: '.82rem' }}>
                          {monto(s.saldo, s.moneda)}
                        </span>
                      ))}
                    </div>
                  ) : <strong className="mono">{monto(0, c.moneda)}</strong>}
                </button>
              );
            })}
          </div>

          {/* Libro mayor por moneda: Debe / Haber / Saldo / Por pagar / Por cobrar */}
          {lmMonedas.length > 0 && (
            <div className="card" style={{ padding: '.7rem .85rem', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: '.45rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
                <span>📒 Libro mayor (por moneda)</span>
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.76rem', textTransform: 'none', fontWeight: 400 }}>
                    Desde <input className="input" type="date" value={lmDesde} max={lmHasta || undefined} onChange={(e) => setLmDesde(e.target.value)} style={{ width: 'auto', padding: '.3rem .5rem' }} />
                  </label>
                  <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.76rem', textTransform: 'none', fontWeight: 400 }}>
                    Hasta <input className="input" type="date" value={lmHasta} min={lmDesde || undefined} onChange={(e) => setLmHasta(e.target.value)} style={{ width: 'auto', padding: '.3rem .5rem' }} />
                  </label>
                  <select className="select" value={lmMoneda} onChange={(e) => setLmMoneda(e.target.value)} style={{ width: 'auto', padding: '.3rem .5rem' }}>
                    <option value="">Todas las monedas</option>
                    {lmMonedas.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {(lmDesde || lmHasta || lmMoneda) && <button className="btn btn-sm btn-ghost" onClick={() => { setLmDesde(''); setLmHasta(''); setLmMoneda(''); }}>✕ Filtros</button>}
                </div>
              </div>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: '.84rem' }}>
                  <thead><tr>
                    <th>Moneda</th>
                    <th style={{ textAlign: 'right' }}>Debe (entra)</th>
                    <th style={{ textAlign: 'right' }}>Haber (sale)</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th style={{ textAlign: 'right' }}>Cuentas por pagar</th>
                    <th style={{ textAlign: 'right' }}>Cuentas por cobrar</th>
                  </tr></thead>
                  <tbody>
                    {!libroMayor.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Sin movimientos para el filtro elegido.</td></tr>}
                    {libroMayor.map((r) => (
                      <tr key={r.moneda} style={{ cursor: 'pointer' }} onClick={() => setLmDetalleMoneda(r.moneda)} title="Ver los movimientos de esta moneda">
                        <td><strong>{r.moneda}</strong> 🔍</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{monto(r.debe, r.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>{monto(r.haber, r.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{monto(r.saldo, r.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: r.porPagar > 0 ? 'var(--warning)' : undefined }}>{monto(r.porPagar, r.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: r.porCobrar > 0 ? 'var(--primary-3, #5b9)' : undefined }}>{monto(r.porCobrar, r.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: '.72rem', margin: '.4rem 0 0' }}>Debe = entradas · Haber = salidas (filtran por el rango de fechas) · Saldo, Cuentas por pagar y por cobrar son saldos vigentes (a hoy). Cada moneda por separado (no se convierte). El detalle de cada movimiento está en «📊 Resumen de movimientos» y en el registro.</p>
            </div>
          )}

          {/* Transferencias inter-sistema (centros de acopio externos / otra Supabase) */}
          <TransferenciasInterPanel transfers={transfers} cajas={cajas} canWrite={canWrite} actor={actor} actorName={actorName} onChanged={reload} />
      </>
      )}

      {vista === 'movimientos' && (
      <>
          {/* Registro de movimientos (vista propia) */}
          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
              <span>Registro de movimientos</span>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <input className="input" type="search" value={fBuscar} onChange={(e) => setFBuscar(e.target.value)}
                    placeholder="🔍 Buscar (caja, concepto, monto…)" style={{ width: 240, paddingRight: fBuscar ? '1.6rem' : undefined }} />
                  {fBuscar && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFBuscar('')}
                      title="Limpiar búsqueda"
                      style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
                  )}
                </div>
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                  Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
                </label>
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                  Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
                </label>
                {(fDesde || fHasta) && <button className="btn btn-sm btn-ghost" onClick={() => { setFDesde(''); setFHasta(''); }}>✕ Fechas</button>}
                <select className="select" value={fCaja} onChange={(e) => setFCaja(e.target.value)} style={{ width: 'auto' }} title="Filtrar por billetera / caja">
                  <option value="">Toda billetera</option>
                  {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select className="select" value={fMoneda} onChange={(e) => setFMoneda(e.target.value)} style={{ width: 'auto' }} title="Filtrar por moneda (USDT, Bs, USD…)">
                  <option value="">Toda moneda</option>
                  {monedasReg.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Todo movimiento</option>
                  <option value="ingreso">Ingresos</option><option value="salida">Egresos</option>
                  <option value="traslado_salida">Traslados</option><option value="ajuste">Ajustes</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem', alignItems: 'center' }}>
              <button className="btn btn-sm btn-ghost" disabled={!libroView.length} onClick={async () => {
                try { await descargarReportePdf(libroView, reporteMeta()); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
              }}>↓ PDF</button>
              <button className="btn btn-sm btn-ghost" disabled={!libroView.length} onClick={() => setCorreoMovOpen(true)}>✉ Enviar por correo</button>
              {fBuscar.trim() && (
                <span className="muted" style={{ fontSize: '.8rem' }}>
                  {libroView.length} de {libro.length} {libro.length === 1 ? 'movimiento' : 'movimientos'}
                </span>
              )}
            </div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.85rem' }}>
                <thead><tr><th>Fecha</th><th>Caja</th><th>Movimiento</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'center' }}>Detalle</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
                  {!loading && !libroView.length && <tr><td colSpan={7}><EmptyState message={fBuscar.trim() ? `Sin resultados para "${fBuscar.trim()}"` : 'Sin movimientos'} /></td></tr>}
                  {!loading && libroView.map((m) => {
                    const egreso = m.tipo === 'salida' || m.tipo === 'traslado_salida'
                  || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
                    const concepto = [CAT_LABEL[m.categoria ?? ''] , detalleGasto(m), m.beneficiario, m.motivo].filter(Boolean).join(' · ') || '—';
                    return (
                      <tr key={m.id}>
                        <td>{dateTime(m.at)}</td>
                        <td>{m.caja?.nombre ?? '—'}</td>
                        <td>{TIPO_MOV_LABEL[m.tipo] ?? m.tipo}</td>
                        <td>{concepto}</td>
                        <td className="mono" style={{ textAlign: 'right', color: egreso ? 'var(--danger)' : 'var(--success)' }}>{egreso ? '−' : '+'}{monto(m.monto, m.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto(m.saldo_despues, m.moneda)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setMovSel(m)}>🔍 Detalles</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!loading && libroView.length > 0 && (
                  <tfoot>
                    {netoMontoPorMoneda(libroView).map(({ moneda, total }) => (
                      <tr key={moneda}>
                        <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL {moneda} (neto)</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: total < 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {total < 0 ? '−' : '+'}{monto(Math.abs(total), moneda)}
                        </td>
                        <td></td><td></td>
                      </tr>
                    ))}
                  </tfoot>
                )}
              </table>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.4rem' }}>
              Total neto = ingresos − egresos del Monto, por moneda (no se mezclan monedas). Respeta los filtros y la búsqueda aplicados.
            </small>
          </div>
      </>
      )}

      {movSel && <MovimientoDetalleModal mov={movSel} defaultEmail={actor} onClose={() => setMovSel(null)} onChanged={() => { void reload(); }} />}
      {lmDetalleMoneda && (
        <LibroMayorDetalleModal
          moneda={lmDetalleMoneda}
          movimientos={libro.filter((m) => {
            if (m.moneda !== lmDetalleMoneda) return false;
            const d = (m.at ?? '').slice(0, 10);
            if (lmDesde && d < lmDesde) return false;
            if (lmHasta && d > lmHasta) return false;
            return true;
          })}
          onSelMov={(m) => setMovSel(m)}
          onClose={() => setLmDetalleMoneda(null)}
        />
      )}
      {resumenMovOpen && <ResumenMovimientosModal movimientos={libro} defaultEmail={actor} onClose={() => setResumenMovOpen(false)} />}
      {correoMovOpen && <EnviarReporteModal movs={libroView} meta={reporteMeta()} defaultEmail={actor} onClose={() => setCorreoMovOpen(false)} />}
      {modal === 'gasto' && <GastoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'traslado' && <TrasladoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'pago' && <NominaPorPagarModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onPaid={reload} />}
      {modal === 'cajas' && <GestionarCajasModal actor={actor} actorName={actorName} onClose={() => setModal('none')} onCambioAplicado={reload} />}
      {modal === 'retencion' && <RetencionesTesoreriaModal onClose={() => setModal('none')} />}
      {modal === 'categorias' && <CategoriasGastoModal canWrite={canWrite} actor={actor} onClose={() => setModal('none')} />}
      {modal === 'cierre' && <CierreMesModal canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setModal('none')} />}
      {modal === 'tasas' && <TasasGate onClose={() => setModal('none')} />}
      {modal === 'conversor' && <ConversorModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onConverted={reload} />}
      {modal === 'calculadora' && <CalculadoraModal onClose={() => setModal('none')} />}
      {modal === 'grafico' && <GraficoTasasModal onClose={() => setModal('none')} />}
      {modal === 'porpagar' && <OrdenesPorPagarModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onPaid={reload} />}
      {modal === 'creditos' && <CuentasCreditoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onChanged={reload} />}
      {modal === 'cobrar' && <CuentasPorCobrarModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onChanged={reload} />}
      {modal === 'contrapartes' && <ContrapartesModal onClose={() => setModal('none')} />}
      {modal === 'recibir_mgg' && <RecibirDineroMggModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {cajaSel && <CajaDetalleModal caja={cajaSel} canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setCajaSel(null)} onChanged={async () => { await reload(); }} />}
    </div>
  );
}

/* ───────────── Detalle de un movimiento del registro ───────────── */

function MovimientoDetalleModal({ mov, defaultEmail, onClose, onChanged }: { mov: MovimientoCaja; defaultEmail: string; onClose: () => void; onChanged?: () => void }) {
  const egreso = mov.tipo === 'salida' || mov.tipo === 'traslado_salida'
    || (mov.tipo === 'ajuste' && Number(mov.saldo_despues) < Number(mov.saldo_antes));
  const [orden, setOrden] = useState<Orden | null>(null);
  const [cargandoOrden, setCargandoOrden] = useState(false);
  const [renglon, setRenglon] = useState<NominaRenglon | null>(null);
  const [cargandoReng, setCargandoReng] = useState(false);
  // Compra / servicio directo pagado en este movimiento (qué se compró y el requerimiento).
  const [compraDir, setCompraDir] = useState<CompraDirecta | null>(null);
  const [servicioDir, setServicioDir] = useState<ServicioDirecto | null>(null);
  const [cargandoDir, setCargandoDir] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);

  // ── Editar / borrar movimiento MANUAL (gasto / ingreso / ajuste) ──
  const editable = esMovimientoEditable(mov);
  const [editando, setEditando] = useState(false);
  // Editar SOLO la fecha — disponible para TODOS los movimientos (también los vinculados),
  // p.ej. cuando el pago real fue otro día pero se cargó tarde. No cambia montos ni saldos.
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [errEdit, setErrEdit] = useState<string | null>(null);
  const [catsEdit, setCatsEdit] = useState<CategoriaGasto[]>([]);
  const [eMonto, setEMonto] = useState(String(mov.monto ?? ''));
  const [eMotivo, setEMotivo] = useState(mov.motivo ?? '');
  const [eFecha, setEFecha] = useState((mov.at ?? '').slice(0, 16));
  const [eCatId, setECatId] = useState('');
  const [eSubId, setESubId] = useState('');
  useEffect(() => {
    if (!editable) return;
    listCategoriasGasto(true).then((rows) => {
      setCatsEdit(rows);
      const cat = soloCategorias(rows).find((c) => c.nombre === mov.gasto_categoria);
      if (cat) {
        setECatId(cat.id);
        const sub = subcategoriasDe(rows, cat.id).find((c) => c.nombre === mov.gasto_subcategoria);
        if (sub) setESubId(sub.id);
      }
    }).catch(() => setCatsEdit([]));
  }, [editable, mov.gasto_categoria, mov.gasto_subcategoria]);

  async function guardarEdicion() {
    setErrEdit(null); setSavingEdit(true);
    try {
      await editarMovimientoCajaManual({
        mov, monto: Number(eMonto) || 0, motivo: eMotivo,
        gastoCategoria: catsEdit.find((c) => c.id === eCatId)?.nombre ?? null,
        gastoSubcategoria: catsEdit.find((c) => c.id === eSubId)?.nombre ?? null,
        fecha: eFecha ? new Date(eFecha).toISOString() : null,
      });
      toast('Movimiento actualizado · saldo sincronizado', 'success');
      onChanged?.(); onClose();
    } catch (e) { setErrEdit(e instanceof Error ? e.message : 'No se pudo editar el movimiento'); setSavingEdit(false); }
  }
  async function guardarFecha() {
    setErrEdit(null); setSavingEdit(true);
    try {
      await editarFechaMovimiento(mov, eFecha ? new Date(eFecha).toISOString() : '');
      toast('Fecha del movimiento actualizada · sincronizada', 'success');
      onChanged?.(); onClose();
    } catch (e) { setErrEdit(e instanceof Error ? e.message : 'No se pudo cambiar la fecha'); setSavingEdit(false); }
  }
  async function borrarMov() {
    setSavingEdit(true);
    try {
      await eliminarMovimientoCajaManual(mov);
      toast('Movimiento borrado · saldo sincronizado', 'success');
      onChanged?.(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo borrar el movimiento', 'error'); setSavingEdit(false); setConfirmBorrar(false); }
  }

  // Si el movimiento es un pago de compra (pago_oc), traemos la OC para mostrar
  // seriales de billetes, comprobante y datos de la orden pagada.
  useEffect(() => {
    if (!mov.ref_orden_id) { setOrden(null); return; }
    setCargandoOrden(true);
    getOrdenById(mov.ref_orden_id)
      .then((o) => setOrden(o))
      .catch(() => setOrden(null))
      .finally(() => setCargandoOrden(false));
  }, [mov.ref_orden_id]);

  // Si es un pago de nómina, traemos el renglón (persona, período, seriales, comprobante).
  useEffect(() => {
    if (!mov.ref_nomina_renglon_id) { setRenglon(null); return; }
    setCargandoReng(true);
    getRenglonById(mov.ref_nomina_renglon_id)
      .then((r) => setRenglon(r))
      .catch(() => setRenglon(null))
      .finally(() => setCargandoReng(false));
  }, [mov.ref_nomina_renglon_id]);

  // Si el movimiento es el pago de una compra/servicio directo, traemos la orden
  // por su movimiento de caja para mostrar qué se compró/contrató y el requerimiento.
  useEffect(() => {
    const cat = mov.categoria ?? '';
    if (cat !== 'compra_directa' && cat !== 'servicio_directo') { setCompraDir(null); setServicioDir(null); return; }
    setCargandoDir(true);
    const p = cat === 'compra_directa'
      ? getCompraDirectaByCajaMovId(mov.id).then((c) => { setCompraDir(c); setServicioDir(null); })
      : getServicioDirectoByCajaMovId(mov.id).then((s) => { setServicioDir(s); setCompraDir(null); });
    p.catch(() => { setCompraDir(null); setServicioDir(null); }).finally(() => setCargandoDir(false));
  }, [mov.id, mov.categoria]);

  async function verComprobante(path: string) {
    setAbriendo(true);
    try {
      const url = await urlAdjuntoOc(path);
      previewArchivo(url, path.split('/').pop() || 'comprobante');
    } catch { toast('No se pudo abrir el comprobante', 'error'); }
    finally { setAbriendo(false); }
  }
  async function verComprobanteNomina(path: string) {
    setAbriendo(true);
    try {
      const url = await urlComprobanteNomina(path);
      previewArchivo(url, path.split('/').pop() || 'comprobante');
    } catch { toast('No se pudo abrir el comprobante', 'error'); }
    finally { setAbriendo(false); }
  }

  const seriales = orden?.seriales_billetes ?? [];
  const serialesNomina = renglon?.seriales_billetes ?? [];

  async function descargarPdf() {
    setGenerandoPdf(true);
    try { await descargarMovimientoDetallePdf(mov, orden, directoDetallePdf()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
    finally { setGenerandoPdf(false); }
  }
  // Arma el detalle de compra/servicio directo para el PDF (qué se compró + requerimiento).
  function directoDetallePdf(): DirectoDetalle | null {
    // Texto del pago a externo (persona que pagó y a quien hay que reintegrar), para el PDF.
    const textoPagoExterno = (d: {
      pago_externo?: boolean | null; pago_externo_nombre?: string | null; pago_externo_cedula?: string | null;
      pago_externo_telefono?: string | null; pago_externo_nota?: string | null;
    }): string | null => {
      if (!d.pago_externo) return null;
      return [d.pago_externo_nombre || '—', d.pago_externo_cedula, d.pago_externo_telefono ? `Tel: ${d.pago_externo_telefono}` : null, d.pago_externo_nota]
        .filter(Boolean).join(' · ');
    };
    if (compraDir) return {
      tipo: 'compra', codigo: compraDir.codigo, proveedor: compraDir.proveedor_nombre,
      almacen: compraDir.almacen, requerimiento: compraDir.nota?.trim() || null,
      pagoExterno: textoPagoExterno(compraDir),
      moneda: compraDir.moneda === 'Bs' ? 'Bs' : 'USD', tasaConversion: compraDir.tasa_conversion ?? null, gasto: compraDir.gasto,
      items: compraDir.items.map((it) => ({ nombre: it.producto_nombre, extra: it.producto_sku, cantidad: Number(it.cantidad) || 0, gasto: it.gasto ?? null })),
    };
    if (servicioDir) return {
      tipo: 'servicio', codigo: servicioDir.codigo, proveedor: servicioDir.proveedor_nombre,
      equipo: servicioDir.equipo_nombre, solicitante: servicioDir.solicitante ? `${servicioDir.solicitante}${servicioDir.unidad_solicitante ? ` · ${servicioDir.unidad_solicitante}` : ''}` : null,
      requerimiento: [servicioDir.descripcion?.trim(), servicioDir.nota?.trim()].filter(Boolean).join(' · ') || null, moneda: servicioDir.moneda === 'Bs' ? 'Bs' : 'USD', tasaConversion: servicioDir.tasa_conversion ?? null, gasto: servicioDir.gasto,
      pagoExterno: textoPagoExterno(servicioDir),
      items: servicioDir.items.map((it) => ({ nombre: it.descripcion, extra: it.equipo_nombre, cantidad: Number(it.cantidad) || 0, gasto: it.gasto ?? null })),
    };
    return null;
  }

  return (
    <Modal title="Detalle del movimiento" size="lg" onClose={onClose} footer={
      editando ? (
        <>
          <button className="btn btn-ghost" onClick={() => setEditando(false)} disabled={savingEdit}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardarEdicion} disabled={savingEdit}>{savingEdit ? 'Guardando…' : '💾 Guardar'}</button>
        </>
      ) : editandoFecha ? (
        <>
          <button className="btn btn-ghost" onClick={() => setEditandoFecha(false)} disabled={savingEdit}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardarFecha} disabled={savingEdit}>{savingEdit ? 'Guardando…' : '💾 Guardar fecha'}</button>
        </>
      ) : (
        <>
          {editable && <button className="btn btn-ghost" onClick={() => setEditando(true)} title="Editar este movimiento manual">✏ Editar</button>}
          {!editable && <button className="btn btn-ghost" onClick={() => { setEFecha((mov.at ?? '').slice(0, 16)); setEditandoFecha(true); }} title="Cambiar la fecha de este movimiento (p.ej. el pago real fue otro día)">📅 Editar fecha</button>}
          {editable && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setConfirmBorrar(true)} title="Borrar este movimiento manual">🗑 Borrar</button>}
          <button className="btn btn-ghost" onClick={descargarPdf} disabled={generandoPdf || cargandoOrden}>
            {generandoPdf ? 'Generando…' : '↓ PDF'}
          </button>
          <button className="btn btn-ghost" onClick={() => setCorreoOpen(true)} disabled={cargandoOrden}>✉ Enviar por correo</button>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </>
      )
    }>
      {confirmBorrar && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}>
          <strong>¿Borrar este movimiento?</strong> Se revertirá su efecto en el saldo de la caja. No se puede deshacer.
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmBorrar(false)} disabled={savingEdit}>Cancelar</button>
            <button className="btn btn-sm btn-primary" style={{ background: 'var(--danger)' }} onClick={borrarMov} disabled={savingEdit}>{savingEdit ? 'Borrando…' : 'Sí, borrar'}</button>
          </div>
        </div>
      )}

      {editandoFecha && (
        <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>📅 Editar fecha del movimiento</div>
          {errEdit && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {errEdit}</div>}
          <div className="form-row">
            <label>Fecha y hora reales del movimiento</label>
            <input className="input" type="datetime-local" value={eFecha} onChange={(e) => setEFecha(e.target.value)} />
          </div>
          <small className="muted">Solo cambia la fecha (no toca montos ni saldos). Se sincroniza con la fecha de pago del documento vinculado (OC, compra/servicio directo, nómina).</small>
        </div>
      )}

      {editando && (
        <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>✏ Editar movimiento{mov.tipo === 'ajuste' ? ' (ajuste · el monto no se edita)' : ''}</div>
          {errEdit && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {errEdit}</div>}
          {mov.tipo !== 'ajuste' && (
            <div className="form-row">
              <label>Monto ({mov.moneda})</label>
              <input className="input mono" type="number" min={0} step="any" value={eMonto} onChange={(e) => setEMonto(e.target.value)} />
              <small className="muted">Si cambia, el saldo de la caja se ajusta por la diferencia (sincroniza).</small>
            </div>
          )}
          <div className="form-row">
            <label>Concepto / motivo</label>
            <input className="input" value={eMotivo} onChange={(e) => setEMotivo(e.target.value)} placeholder="Concepto del movimiento" />
          </div>
          {catsEdit.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="form-row">
                <label>Categoría de gasto</label>
                <SearchSelect value={eCatId} onChange={(v) => { setECatId(v); setESubId(''); }} placeholder="🔍 Categoría…" emptyText="Sin categorías"
                  options={soloCategorias(catsEdit).map((c) => ({ value: c.id, label: c.nombre }))} />
              </div>
              <div className="form-row">
                <label>Subcategoría</label>
                <SearchSelect value={eSubId} onChange={setESubId} disabled={!eCatId} placeholder={eCatId ? '🔍 Subcategoría…' : '— elegí la categoría —'} emptyText="Sin subcategorías"
                  options={(eCatId ? subcategoriasDe(catsEdit, eCatId) : []).map((c) => ({ value: c.id, label: c.nombre }))} />
              </div>
            </div>
          )}
          <div className="form-row">
            <label>Fecha y hora</label>
            <input className="input" type="datetime-local" value={eFecha} onChange={(e) => setEFecha(e.target.value)} />
          </div>
        </div>
      )}

      {/* Datos generales del movimiento */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}>Movimiento</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
          <div><span className="muted">Fecha:</span> <strong>{dateTime(mov.at)}</strong></div>
          <div><span className="muted">Caja:</span> <strong>{mov.caja?.nombre ?? '—'}</strong></div>
          <div><span className="muted">Tipo:</span> <strong>{TIPO_MOV_LABEL[mov.tipo] ?? mov.tipo}</strong></div>
          <div><span className="muted">Categoría:</span> <strong>{CAT_LABEL[mov.categoria ?? ''] ?? (mov.categoria || '—')}</strong></div>
          {detalleGasto(mov) && <div><span className="muted">Detalle del gasto:</span> <strong>{detalleGasto(mov)}</strong></div>}
          <div><span className="muted">Monto:</span> <strong className="mono" style={{ color: egreso ? 'var(--danger)' : 'var(--success)' }}>{egreso ? '−' : '+'}{monto(mov.monto, mov.moneda)}</strong></div>
          {mov.cuenta && <div><span className="muted">Cuenta:</span> <strong>{mov.cuenta}</strong></div>}
          {mov.tasa_bs != null && mov.tasa_bs > 0 && <div><span className="muted">Tasa aplicada:</span> <strong className="mono">{monto(mov.tasa_bs, 'Bs')} / $</strong></div>}
          <div><span className="muted">Saldo antes:</span> <strong className="mono">{monto(mov.saldo_antes, mov.moneda)}</strong></div>
          <div><span className="muted">Saldo después:</span> <strong className="mono">{monto(mov.saldo_despues, mov.moneda)}</strong></div>
          {mov.beneficiario && <div><span className="muted">Beneficiario:</span> <strong>{mov.beneficiario}</strong></div>}
          {mov.destino && <div><span className="muted">Destino:</span> <strong>{mov.destino}</strong></div>}
          <div><span className="muted">Registrado por:</span> <strong>{mov.actor_name || mov.actor}</strong></div>
        </div>
        {mov.motivo && (
          <div style={{ marginTop: '.5rem', fontSize: '.84rem' }}>
            <span className="muted">Concepto / motivo:</span> {mov.motivo}
          </div>
        )}
      </div>

      {/* Orden pagada (si el movimiento es un pago de compra) */}
      {mov.ref_orden_id && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Orden pagada</div>
          {cargandoOrden && <div className="muted" style={{ fontSize: '.84rem' }}>Cargando la orden…</div>}
          {!cargandoOrden && !orden && <div className="muted" style={{ fontSize: '.84rem' }}>No se pudo cargar la orden vinculada.</div>}
          {!cargandoOrden && orden && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
                <div><span className="muted">OP:</span> <strong className="mono">{orden.codigo}</strong></div>
                <div><span className="muted">N°ODC:</span> <strong className="mono">{orden.oc_codigo ?? '—'}</strong></div>
                <div><span className="muted">Total OC:</span> <strong className="mono">{monto(orden.total, orden.total_moneda ?? 'USD')}</strong></div>
                {orden.iva_aplicado && <div><span className="muted">IVA:</span> <strong className="mono">{monto(Number(orden.iva_monto ?? 0), orden.total_moneda ?? 'USD')}</strong> <span className="muted">({Number(orden.iva_pct ?? 16).toLocaleString('es-VE', { maximumFractionDigits: 2 })}% · incluido)</span></div>}
                {orden.igtf_aplicado && <div><span className="muted">IGTF:</span> <strong className="mono">{monto(Number(orden.igtf_monto ?? 0), orden.total_moneda ?? 'USD')}</strong> <span className="muted">({Number(orden.igtf_pct ?? 3).toLocaleString('es-VE', { maximumFractionDigits: 2 })}% · incluido)</span></div>}
                {orden.recibido_total != null && <div><span className="muted">Recibido:</span> <strong className="mono">{monto(Number(orden.recibido_total), orden.total_moneda ?? 'USD')}</strong></div>}
                <div><span className="muted">Solicitante:</span> <strong>{orden.solicitante || orden.solicitante_email}</strong></div>
                {orden.condiciones_pago && <div><span className="muted">Condición:</span> <strong>{labelCondicionPago(orden.condiciones_pago)}</strong></div>}
                {orden.pagada_en && <div><span className="muted">Pagada:</span> <strong>{dateTime(orden.pagada_en)}</strong></div>}
              </div>

              {/* Seriales de billetes entregados */}
              <div style={{ marginTop: '.6rem' }}>
                <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.25rem' }}>Seriales de los billetes entregados</div>
                {seriales.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                    {seriales.map((s, i) => (
                      <span key={s} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: 'var(--bg-1)' }}>
                        <span className="muted">{i + 1}.</span><span className="mono">{s}</span>
                      </span>
                    ))}
                    <span className="muted" style={{ alignSelf: 'center', fontSize: '.8rem' }}>{seriales.length} billete(s)</span>
                  </div>
                ) : <span className="muted" style={{ fontSize: '.84rem' }}>No se registraron seriales en este pago.</span>}
              </div>

              {/* Comprobante de pago (si se subió) */}
              <div style={{ marginTop: '.6rem' }}>
                <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.25rem' }}>Comprobante de pago</div>
                {orden.factura_path ? (
                  <button className="btn btn-sm btn-ghost" disabled={abriendo} onClick={() => verComprobante(orden.factura_path!)}>
                    {abriendo ? 'Abriendo…' : `📎 Ver comprobante${orden.factura_nombre ? ` · ${orden.factura_nombre}` : ''}`}
                  </button>
                ) : <span className="muted" style={{ fontSize: '.84rem' }}>No se subió comprobante (pago en efectivo, opcional).</span>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Nómina pagada (si el movimiento es un pago de nómina) */}
      {mov.ref_nomina_renglon_id && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Nómina pagada</div>
          {cargandoReng && <div className="muted" style={{ fontSize: '.84rem' }}>Cargando el renglón…</div>}
          {!cargandoReng && !renglon && <div className="muted" style={{ fontSize: '.84rem' }}>No se pudo cargar el renglón vinculado.</div>}
          {!cargandoReng && renglon && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
                <div><span className="muted">Trabajador:</span> <strong>{renglon.nombre}</strong></div>
                <div><span className="muted">Nómina:</span> <strong className="mono">{renglon.periodo?.codigo ?? '—'}</strong></div>
                <div><span className="muted">Motivo:</span> <strong>{labelMotivoNomina(renglon.periodo?.tipo)}</strong></div>
                <div><span className="muted">Departamento:</span> {renglon.departamento || '—'}</div>
                <div><span className="muted">Días:</span> <strong>{renglon.dias_trabajados}</strong></div>
                <div><span className="muted">Bruto:</span> <strong className="mono">{monto(renglon.salario_bruto, 'USD')}</strong></div>
                <div><span className="muted">Deducciones:</span> <strong className="mono">{monto(round2((Number(renglon.deduc_anticipos) || 0) + (Number(renglon.deduc_prestamos) || 0)), 'USD')}</strong></div>
                <div><span className="muted">Neto:</span> <strong className="mono" style={{ color: 'var(--success)' }}>{monto(renglon.neto_usd, 'USD')}</strong></div>
                {renglon.tasa_pago != null && renglon.tasa_pago > 0 && <div><span className="muted">Tasa aplicada:</span> <strong className="mono">{monto(renglon.tasa_pago, 'Bs')} / $</strong></div>}
              </div>

              <div style={{ marginTop: '.6rem' }}>
                <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.25rem' }}>Seriales de los billetes entregados</div>
                {serialesNomina.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                    {serialesNomina.map((s, i) => (
                      <span key={s} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: 'var(--bg-1)' }}>
                        <span className="muted">{i + 1}.</span><span className="mono">{s}</span>
                      </span>
                    ))}
                    <span className="muted" style={{ alignSelf: 'center', fontSize: '.8rem' }}>{serialesNomina.length} billete(s)</span>
                  </div>
                ) : <span className="muted" style={{ fontSize: '.84rem' }}>No se registraron seriales en este pago.</span>}
              </div>

              <div style={{ marginTop: '.6rem' }}>
                <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.25rem' }}>Comprobante de pago</div>
                {renglon.comprobante_path ? (
                  <button className="btn btn-sm btn-ghost" disabled={abriendo} onClick={() => verComprobanteNomina(renglon.comprobante_path!)}>
                    {abriendo ? 'Abriendo…' : `📎 Ver comprobante${renglon.comprobante_nombre ? ` · ${renglon.comprobante_nombre}` : ''}`}
                  </button>
                ) : <span className="muted" style={{ fontSize: '.84rem' }}>No se subió comprobante (opcional).</span>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Compra directa pagada — qué materiales se compraron y el requerimiento */}
      {mov.categoria === 'compra_directa' && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>🛒 Compra directa</div>
          {cargandoDir && <div className="muted" style={{ fontSize: '.84rem' }}>Cargando la compra…</div>}
          {!cargandoDir && !compraDir && <div className="muted" style={{ fontSize: '.84rem' }}>No se pudo cargar la compra vinculada.</div>}
          {!cargandoDir && compraDir && (() => {
            const mnd = compraDir.moneda === 'Bs' ? 'Bs' : 'USD';
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
                  <div><span className="muted">Código:</span> <strong className="mono">{compraDir.codigo ?? '—'}</strong></div>
                  <div><span className="muted">Proveedor:</span> <strong>{compraDir.proveedor_nombre || '—'}</strong></div>
                  <div><span className="muted">Almacén destino:</span> <strong>{compraDir.almacen || '—'}</strong></div>
                  <div><span className="muted">Solicitó:</span> <strong>{compraDir.actor_name || compraDir.actor || '—'}</strong></div>
                </div>
                {compraDir.nota?.trim() && (
                  <div style={{ marginTop: '.5rem', fontSize: '.84rem' }}>
                    <span className="muted">Requerimiento / nota:</span> <span style={{ whiteSpace: 'pre-wrap' }}>{compraDir.nota}</span>
                  </div>
                )}
                {compraDir.pago_externo && (
                  <div className="card" style={{ marginTop: '.5rem', borderColor: 'var(--warning)', background: 'var(--bg-2)', padding: '.55rem .7rem', fontSize: '.84rem' }}>
                    💵 <strong>Pago a externo · reintegrar</strong> — lo pagó otra persona:{' '}
                    <strong>{compraDir.pago_externo_nombre || '—'}</strong>
                    {compraDir.pago_externo_cedula ? ` · ${compraDir.pago_externo_cedula}` : ''}
                    {compraDir.pago_externo_telefono ? ` · 📞 ${compraDir.pago_externo_telefono}` : ''}
                    {compraDir.pago_externo_nota ? ` · ${compraDir.pago_externo_nota}` : ''}
                  </div>
                )}
                <div className="table-wrap" style={{ marginTop: '.6rem' }}>
                  <table className="table">
                    <thead><tr><th>#</th><th>Material</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th></tr></thead>
                    <tbody>
                      {compraDir.items.map((it, i) => (
                        <tr key={i}>
                          <td className="muted">{i + 1}</td>
                          <td>{it.producto_nombre}{it.producto_sku ? <span className="muted mono"> · {it.producto_sku}</span> : null}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{Number(it.cantidad) || 0}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{it.gasto != null ? monto(it.gasto, mnd) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {compraDir.gasto != null && (
                      <tfoot><tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td><td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{monto(compraDir.gasto, mnd)}</td></tr></tfoot>
                    )}
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Servicio directo pagado — qué se contrató y el requerimiento */}
      {mov.categoria === 'servicio_directo' && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>🔧 Servicio directo</div>
          {cargandoDir && <div className="muted" style={{ fontSize: '.84rem' }}>Cargando el servicio…</div>}
          {!cargandoDir && !servicioDir && <div className="muted" style={{ fontSize: '.84rem' }}>No se pudo cargar el servicio vinculado.</div>}
          {!cargandoDir && servicioDir && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
                <div><span className="muted">Código:</span> <strong className="mono">{servicioDir.codigo ?? '—'}</strong></div>
                <div><span className="muted">Proveedor:</span> <strong>{servicioDir.proveedor_nombre || '—'}</strong></div>
                {servicioDir.equipo_nombre && <div><span className="muted">Equipo:</span> <strong>{servicioDir.equipo_nombre}</strong></div>}
                {servicioDir.solicitante && <div><span className="muted">Solicitante:</span> <strong>{servicioDir.solicitante}{servicioDir.unidad_solicitante ? ` · ${servicioDir.unidad_solicitante}` : ''}</strong></div>}
              </div>
              {servicioDir.descripcion?.trim() && (
                <div style={{ marginTop: '.5rem', fontSize: '.84rem' }}>
                  <span className="muted">Requerimiento:</span> <span style={{ whiteSpace: 'pre-wrap' }}>{servicioDir.descripcion}</span>
                </div>
              )}
              {servicioDir.nota?.trim() && (
                <div style={{ marginTop: '.35rem', fontSize: '.84rem' }}>
                  <span className="muted">Nota / motivo:</span> <span style={{ whiteSpace: 'pre-wrap' }}>{servicioDir.nota}</span>
                </div>
              )}
              {servicioDir.pago_externo && (
                <div className="card" style={{ marginTop: '.5rem', borderColor: 'var(--warning)', background: 'var(--bg-2)', padding: '.55rem .7rem', fontSize: '.84rem' }}>
                  💵 <strong>Pago a externo · reintegrar</strong> — lo pagó otra persona:{' '}
                  <strong>{servicioDir.pago_externo_nombre || '—'}</strong>
                  {servicioDir.pago_externo_cedula ? ` · ${servicioDir.pago_externo_cedula}` : ''}
                  {servicioDir.pago_externo_telefono ? ` · 📞 ${servicioDir.pago_externo_telefono}` : ''}
                  {servicioDir.pago_externo_nota ? ` · ${servicioDir.pago_externo_nota}` : ''}
                </div>
              )}
              <div className="table-wrap" style={{ marginTop: '.6rem' }}>
                <table className="table">
                  <thead><tr><th>#</th><th>Servicio</th><th>Equipo</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th></tr></thead>
                  <tbody>
                    {servicioDir.items.map((it, i) => (
                      <tr key={i}>
                        <td className="muted">{i + 1}</td>
                        <td>{it.descripcion}{it.categoria ? <span className="muted"> · {it.categoria}</span> : null}</td>
                        <td>{it.equipo_nombre || <span className="muted">—</span>}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{Number(it.cantidad) || 0}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{it.gasto != null ? monto(it.gasto, servicioDir.moneda === 'Bs' ? 'Bs' : 'USD') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {servicioDir.gasto != null && (
                    <tfoot><tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td><td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{monto(servicioDir.gasto, servicioDir.moneda === 'Bs' ? 'Bs' : 'USD')}</td></tr></tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {correoOpen && (
        <DetalleCorreoModal mov={mov} orden={orden} defaultEmail={defaultEmail} onClose={() => setCorreoOpen(false)} />
      )}
    </Modal>
  );
}

/** Envío por correo del detalle de un movimiento (mismo patrón que el reporte). */
function DetalleCorreoModal({ mov, orden, defaultEmail, onClose }: {
  mov: MovimientoCaja; orden: Orden | null; defaultEmail: string; onClose: () => void;
}) {
  const [incluirPropio, setIncluirPropio] = useState(true);
  const [extra, setExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const propio = defaultEmail.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleEnviar() {
    const lista: string[] = [];
    if (incluirPropio && propio) lista.push(propio);
    const extraClean = extra.trim().toLowerCase();
    if (extraClean) {
      if (!emailRx.test(extraClean)) { toast('El correo adicional no es válido', 'error'); return; }
      lista.push(extraClean);
    }
    setEnviando(true);
    try {
      const r = await enviarMovimientoDetallePorCorreo(mov, orden, lista);
      notify(`Detalle enviado a ${r.destinatarios.join(', ')}`, 'success', { link: '#/app/tesoreria' });
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setEnviando(false); }
  }

  return (
    <Modal title="Enviar detalle por correo" size="md" onClose={() => !enviando && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>{enviando ? 'Enviando…' : '📧 Enviar'}</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Se enviará el <strong>PDF del detalle</strong>{orden ? ' (con la orden pagada, seriales y comprobante)' : ''} a los destinatarios seleccionados.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: incluirPropio ? 'rgba(255,138,0,0.06)' : 'transparent', cursor: propio ? 'pointer' : 'not-allowed', marginBottom: '.6rem' }}>
        <input type="checkbox" checked={incluirPropio} disabled={!propio} onChange={(e) => setIncluirPropio(e.target.checked)} />
        <div>
          <div style={{ fontWeight: 600 }}>Tu correo</div>
          <div className="mono" style={{ fontSize: '.82rem' }}>{propio || '—'}</div>
        </div>
      </label>
      <div className="form-row" style={{ marginTop: '.4rem' }}>
        <label>Correo adicional (opcional)</label>
        <input className="input" type="email" name="correo-extra" defaultValue={extra} onChange={(e) => setExtra(e.target.value)} placeholder="otro@correo.com" maxLength={120} />
        <small className="muted">Si no marcás ninguno, se envía a los admin/jefe.</small>
      </div>
    </Modal>
  );
}

/* ───────────── Detalle de caja (multimoneda: cuentas + divisas) ───────────── */

function CajaDetalleModal({ caja, canWrite, actor, actorName, onClose, onChanged }: {
  caja: Caja; canWrite: boolean; actor: string; actorName: string | null; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [movs, setMovs] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [lotesDe, setLotesDe] = useState<{ moneda: string; cuenta: CuentaCaja } | null>(null);
  const [lotes, setLotes] = useState<CajaLote[]>([]);
  const [monedas, setMonedas] = useState<string[]>([...MONEDAS_CAJA]);
  const [nuevaMonedaOpen, setNuevaMonedaOpen] = useState(false);
  const [nuevaMoneda, setNuevaMoneda] = useState('');

  // Form de ingreso. Arranca en la moneda propia de la caja (USDT→USDT con tasa
  // Binance, Bs→Bs), pero se puede ingresar cualquier moneda (igual que Multimoneda).
  const [moneda, setMoneda] = useState<string>(caja.moneda || 'Bs');
  const [cuenta, setCuenta] = useState<CuentaCaja>(caja.moneda === 'Bs' ? 'juridica' : 'general');
  const [montoStr, setMontoStr] = useState('');
  const [tasaStr, setTasaStr] = useState('');
  const [origen, setOrigen] = useState('');
  // El origen del ingreso manual identifica de quién entra el dinero: cliente o proveedor.
  const [origenTipo, setOrigenTipo] = useState<'cliente' | 'proveedor' | ''>('');
  // Contrapartes guardadas (para buscar/reutilizar nombres en el campo origen).
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([]);
  const reloadContrapartes = useCallback(() => {
    listContrapartes().then(setContrapartes).catch(() => setContrapartes([]));
  }, []);
  useEffect(() => { reloadContrapartes(); }, [reloadContrapartes]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  const [correoOpen, setCorreoOpen] = useState(false);
  // Inputs no controlados (monto/origen): este nonce remonta el formulario al
  // limpiarlo tras un ingreso, para que el DOM refleje los campos vacíos.
  const [ingresoKey, setIngresoKey] = useState(0);

  // Sugerencia de tasa del día para la moneda elegida (Bs por 1 unidad).
  const tasaSugerida = moneda === 'Bs' || !mercado ? null : tasaCruzada(moneda as MonedaCaja, 'Bs', mercado);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([saldosDeCaja(caja.id), listLibroMayor({ cajaId: caja.id })]);
      setSaldos(s); setMovs(m);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la caja', 'error'); }
    finally { setLoading(false); }
  }, [caja.id]);
  useEffect(() => { void reload(); setLotesDe(null); }, [reload]);
  useEffect(() => { listMonedas().then(setMonedas).catch(() => setMonedas([...MONEDAS_CAJA])); }, []);
  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);

  // Al elegir una divisa con tasa de mercado (COP/USD/USDT), precarga la tasa del día (editable).
  useEffect(() => {
    if (tasaSugerida != null && tasaSugerida > 0) setTasaStr(String(tasaSugerida));
    else if (moneda === 'Bs') setTasaStr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneda, mercado]);

  // La cuenta jurídica/personal solo aplica a Bs.
  useEffect(() => { setCuenta(moneda === 'Bs' ? 'juridica' : 'general'); }, [moneda]);

  async function agregarMoneda() {
    const code = nuevaMoneda.trim().toUpperCase();
    if (!code) { setNuevaMonedaOpen(false); return; }
    try {
      await addMoneda(code, actor);
      const lista = await listMonedas();
      setMonedas(lista); setMoneda(code);
      setNuevaMoneda(''); setNuevaMonedaOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar la moneda', 'error'); }
  }

  async function verLotes(s: CajaSaldo) {
    setLotesDe({ moneda: s.moneda, cuenta: s.cuenta });
    try { setLotes(await listLotes({ cajaId: caja.id, moneda: s.moneda, cuenta: s.cuenta })); }
    catch { setLotes([]); }
  }

  async function ingresar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if ((Number(montoStr) || 0) <= 0) { setError('El monto debe ser mayor que 0.'); return; }
    if (moneda !== 'Bs' && (Number(tasaStr) || 0) <= 0) { setError('Indicá la tasa de compra (Bs por unidad).'); return; }
    // El cliente/proveedor es OPCIONAL: si se eligió un tipo, exigimos el nombre;
    // si no se elige ninguno, el ingreso es solo un movimiento de caja (sin cuenta).
    if (origenTipo && !origen.trim()) { setError(origenTipo === 'proveedor' ? 'Indicá la razón social del proveedor.' : 'Indicá el nombre del cliente.'); return; }
    const generaCuenta = !!origenTipo && !!origen.trim();
    setSaving(true);
    try {
      const origenStr = generaCuenta
        ? `${origenTipo === 'proveedor' ? 'Proveedor' : 'Cliente'}: ${origen.trim()}`
        : 'Ingreso de caja';
      const montoNum = Number(montoStr) || 0;
      await ingresarDivisa({
        cajaId: caja.id, cuenta, moneda, monto: montoNum,
        tasaBs: moneda === 'Bs' ? 1 : Number(tasaStr) || 0,
        origen: origenStr, actor, actorName,
      });
      // Solo con datos del cliente/proveedor se genera una cuenta por pagar (por el
      // mismo monto) que se salda con abonos. Sin datos → solo el movimiento de caja.
      if (generaCuenta) {
        await crearCuentaPorPagar({
          tipo: origenTipo as 'cliente' | 'proveedor', contraparte: origen.trim(), monto: montoNum, moneda, cuenta,
          cajaId: caja.id, nota: `Ingreso ${moneda} en ${caja.nombre}`, actor, actorName,
        });
        // Si el cliente/proveedor es nuevo, se guarda en el directorio para próximos
        // pagos (queda disponible en la búsqueda y en "Clientes / Proveedores").
        const yaGuardado = contrapartes.some(
          (c) => c.tipo === origenTipo && c.nombre.trim().toUpperCase() === origen.trim().toUpperCase(),
        );
        if (!yaGuardado) {
          try { await crearContraparte({ tipo: origenTipo as 'cliente' | 'proveedor', nombre: origen.trim() }); reloadContrapartes(); }
          catch { /* duplicado u otra causa: no bloquea el ingreso */ }
        }
      }
      const etiqueta = moneda === 'Bs' ? `Bs · ${cuenta}` : moneda;
      notify(
        `Ingreso ${etiqueta} · ${monto(montoNum, moneda)} · ${origenStr}${generaCuenta ? ' · genera cuenta por pagar' : ' · movimiento de caja'}`,
        'success', { link: '#/app/tesoreria' },
      );
      setMontoStr(''); setTasaStr(''); setOrigen(''); setOrigenTipo('');
      setIngresoKey((k) => k + 1);
      await reload(); await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo ingresar.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Caja · ${caja.nombre}`} size="xl" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {/* Saldos por cuenta/moneda */}
      <div className="card" style={{ marginBottom: '.6rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.4rem' }}>
          <span>Saldos por cuenta / moneda</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <button className="btn btn-sm btn-ghost" disabled={!movs.length} onClick={async () => {
              try { await descargarReportePdf(movs, { titulo: 'REPORTE DE CAJA', subtitulo: caja.nombre }); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
            }}>↓ PDF</button>
            <button className="btn btn-sm btn-ghost" disabled={!movs.length} onClick={() => setCorreoOpen(true)}>✉ Correo</button>
          </span>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr><th>Cuenta</th><th>Moneda</th><th style={{ textAlign: 'right' }}>Saldo</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !saldos.length && <tr><td colSpan={4}><EmptyState message="Sin saldos · ingresá dinero abajo" /></td></tr>}
              {!loading && saldos.map((s) => (
                <tr key={s.id}>
                  <td>{s.cuenta === 'general' ? '—' : s.cuenta === 'juridica' ? 'Jurídica' : 'Personal'}</td>
                  <td><span className="badge">{s.moneda}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(s.saldo, s.moneda)}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-ghost" onClick={() => verLotes(s)}>Trazabilidad</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparativo de tasas: Binance (USDT/VES) vs BCV + margen de ahorro */}
      {(() => {
        const bin = mercado?.usdtVes ?? null;
        const bcv = mercado?.bcvUsd ?? null;
        const margen = bin && bcv && bin > 0 ? ((bin - bcv) / bin) * 100 : null;
        return (
          <div className="card" style={{ marginBottom: '.6rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Tasas de referencia (Bs por USD)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem' }}>
              <div>
                <div className="muted" style={{ fontSize: '.68rem' }}>BINANCE (USDT/VES)</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{bin != null ? monto(bin, 'Bs') : '—'}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.68rem' }}>BCV</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{bcv != null ? monto(bcv, 'Bs') : '—'}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.68rem' }}>MARGEN DE AHORRO (vs Binance)</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: margen != null && margen > 0 ? 'var(--success)' : 'var(--muted)' }}>
                  {margen != null ? `${margen.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : '—'}
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: '.7rem', marginTop: '.4rem' }}>
              El margen es cuánto se ahorra pagando a tasa BCV respecto a la de Binance: (Binance − BCV) ÷ Binance.
            </div>
          </div>
        );
      })()}

      {lotesDe && (
        <div className="card" style={{ marginBottom: '.6rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Trazabilidad · {lotesDe.moneda}{lotesDe.cuenta !== 'general' ? ` · ${lotesDe.cuenta}` : ''} (lotes de ingreso)</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setLotesDe(null)}>✕</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Tasa (Bs)</th><th>Origen</th><th>Registró</th></tr></thead>
              <tbody>
                {!lotes.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin lotes</td></tr>}
                {lotes.map((l) => (
                  <tr key={l.id}>
                    <td>{dateTime(l.created_at)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(l.monto, lotesDe.moneda)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{l.tasa_bs != null ? Number(l.tasa_bs).toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—'}</td>
                    <td>{l.origen || '—'}</td>
                    <td className="muted">{l.actor_name || l.actor || '—'}</td>
                  </tr>
                ))}
              </tbody>
              {lotes.length > 0 && (() => {
                const tot = lotes.reduce((a, l) => a + (Number(l.monto) || 0), 0);
                const prom = tot > 0 ? lotes.reduce((a, l) => a + (Number(l.monto) || 0) * (Number(l.tasa_bs) || 0), 0) / tot : 0;
                return (
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Total</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{monto(tot, lotesDe.moneda)}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: '#16c784' }} title="Promedio ponderado por monto de los lotes">{prom.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</td>
                      <td colSpan={2} className="muted" style={{ fontSize: '.72rem' }}>Promedio ponderado de las tasas de ingreso</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}

      {correoOpen && <EnviarReporteModal movs={movs} meta={{ titulo: 'REPORTE DE CAJA', subtitulo: caja.nombre }} defaultEmail={actor} onClose={() => setCorreoOpen(false)} />}

      {/* Ingresar dinero (cuenta jurídica/personal en Bs, o divisa con tasa) */}
      {canWrite && (
        <form onSubmit={ingresar} className="card" style={{ marginBottom: '.6rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Ingresar dinero (suma al saldo y recalcula el promedio)</div>
          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {error}</div>}
          <div className="form-grid">
            <div className="form-row">
              <label>Moneda</label>
              {nuevaMonedaOpen ? (
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <input className="input mono" name="ing-nueva-moneda" defaultValue={nuevaMoneda} autoFocus placeholder="Ej. EUR, PEN…"
                    onChange={(e) => { const v = e.target.value.toUpperCase(); e.target.value = v; setNuevaMoneda(v); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarMoneda(); } if (e.key === 'Escape') setNuevaMonedaOpen(false); }} />
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void agregarMoneda()}>✓</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNuevaMonedaOpen(false)}>✕</button>
                </div>
              ) : (
                <select className="select" value={moneda}
                  onChange={(e) => { if (e.target.value === '__nueva__') setNuevaMonedaOpen(true); else setMoneda(e.target.value); }}>
                  {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__nueva__">+ Nueva moneda…</option>
                </select>
              )}
            </div>
            {moneda === 'Bs' && (
              <div className="form-row">
                <label>Cuenta</label>
                <select className="select" value={cuenta} onChange={(e) => setCuenta(e.target.value as CuentaCaja)}>
                  <option value="juridica">Jurídica</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
            )}
            <div className="form-row">
              <label>Monto ({moneda})</label>
              <input key={`ing-monto-${ingresoKey}`} className="input mono" type="number" name="ing-monto" min={0} step="any" defaultValue={montoStr} onChange={(e) => { const v = dosDecimales(e.target.value); e.target.value = v; setMontoStr(v); }} placeholder="0,00" required />
            </div>
            {moneda !== 'Bs' && (
              <div className="form-row">
                <label>Tasa de compra (Bs por 1 {moneda})</label>
                <input className="input mono" type="number" min={0} step="any" value={tasaStr} onChange={(e) => setTasaStr(e.target.value)} required />
                {tasaSugerida != null && tasaSugerida > 0 && (
                  <small className="muted" style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginTop: '.2rem' }}>
                    Tasa del día: <strong className="mono">{tasaSugerida.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</strong>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .4rem' }}
                      onClick={() => setTasaStr(String(tasaSugerida))}>Usar</button>
                  </small>
                )}
              </div>
            )}
            <div className="form-row">
              <label>Origen del dinero <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.4rem' }}>
                {([
                  { v: '' as const, label: '— Solo movimiento' },
                  { v: 'cliente' as const, label: '👤 Cliente' },
                  { v: 'proveedor' as const, label: '🏭 Proveedor' },
                ]).map(({ v, label }) => {
                  const sel = origenTipo === v;
                  return (
                    <label key={v || 'ninguno'} style={{
                      display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer',
                      padding: '.4rem .7rem', borderRadius: 'var(--r-md)',
                      border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                      background: sel ? 'rgba(255,138,0,0.10)' : 'transparent', flex: 1, justifyContent: 'center',
                    }}>
                      <input type="radio" name="origen-tipo" checked={sel} onChange={() => { setOrigenTipo(v); setOrigen(''); }} />
                      <span style={{ fontWeight: 600 }}>{label}</span>
                    </label>
                  );
                })}
              </div>
              {!origenTipo && (
                <small className="muted">Sin cliente/proveedor el ingreso es <strong>solo un movimiento de caja</strong>. Elegí Cliente o Proveedor para que además genere una <strong>cuenta por pagar</strong>.</small>
              )}
              {origenTipo && (() => {
                const guardados = contrapartes.filter((c) => c.tipo === origenTipo);
                const existe = guardados.some((c) => c.nombre.trim().toUpperCase() === origen.trim().toUpperCase());
                return (
                <>
                  <input
                    key={`ing-origen-${origenTipo}-${ingresoKey}`}
                    className="input"
                    name="ing-origen"
                    list="origen-contrapartes"
                    defaultValue={origen}
                    onChange={(e) => setOrigen(e.target.value)}
                    placeholder={origenTipo === 'proveedor' ? 'Buscar o agregar razón social del proveedor…' : 'Buscar o agregar nombre del cliente…'}
                    autoFocus
                  />
                  <datalist id="origen-contrapartes">
                    {guardados.map((c) => <option key={c.id} value={c.nombre} />)}
                  </datalist>
                  <small className="muted">
                    Buscá en los {guardados.length} {origenTipo === 'proveedor' ? 'proveedor(es)' : 'cliente(s)'} guardados o escribí uno nuevo.{' '}
                    {origen.trim() && !existe
                      ? <strong style={{ color: 'var(--primary-3, #ff8a00)' }}>Nuevo → se guardará para próximos pagos.</strong>
                      : 'Se gestionan en “👥 Clientes / Proveedores”.'}
                  </small>
                </>
                );
              })()}
            </div>
          </div>
          {moneda !== 'Bs' && (Number(montoStr) || 0) > 0 && (Number(tasaStr) || 0) > 0 && (() => {
            const saldoActual = saldos.find((s) => s.moneda === moneda && s.cuenta === cuenta);
            const sa = Number(saldoActual?.saldo) || 0;
            const tp = Number(saldoActual?.tasa_prom) || 0;
            const mn = Number(montoStr) || 0;
            const tn = Number(tasaStr) || 0;
            const nuevoSaldo = sa + mn;
            const nuevoProm = nuevoSaldo > 0 ? (sa * tp + mn * tn) / nuevoSaldo : tn;
            const f4 = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
            return (
              <div className="card" style={{ marginTop: '.5rem', padding: '.55rem .7rem', background: 'var(--bg-1)' }}>
                <div style={{ fontSize: '.83rem' }}>
                  Entran <strong className="mono">{monto(mn, moneda)}</strong> a tasa <strong className="mono">{f4(tn)}</strong> Bs.
                  {sa > 0 ? (
                    <> Ya tenías <strong className="mono">{monto(sa, moneda)}</strong> a prom. <strong className="mono">{f4(tp)}</strong> → quedan{' '}
                      <strong className="mono">{monto(nuevoSaldo, moneda)}</strong> a <strong>promedio ponderado</strong>{' '}
                      <strong className="mono" style={{ color: '#16c784', fontWeight: 800 }}>{f4(nuevoProm)}</strong> Bs.</>
                  ) : (
                    <> Es el primer lote → promedio <strong className="mono" style={{ color: '#16c784', fontWeight: 800 }}>{f4(tn)}</strong> Bs.</>
                  )}
                </div>
              </div>
            );
          })()}
          <div style={{ textAlign: 'right', marginTop: '.5rem' }}>
            <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Ingresando…' : '+ Ingresar'}</button>
          </div>
          <small className="muted">El Bs se maneja en dos cuentas: <strong>jurídica</strong> y <strong>personal</strong>. Las divisas guardan su tasa de compra; cada ingreso es un <strong>lote</strong> con su tasa, y el saldo muestra el <strong>promedio ponderado</strong> (ver Trazabilidad).</small>
        </form>
      )}

      {/* Movimientos (libro de la caja) */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: '.5rem' }}>Movimientos de esta caja</div>
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !movs.length && <tr><td colSpan={5}><EmptyState message="Sin movimientos en esta caja" /></td></tr>}
              {!loading && movs.map((m) => {
                const egreso = m.tipo === 'salida' || m.tipo === 'traslado_salida'
                  || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
                const concepto = [CAT_LABEL[m.categoria ?? ''], detalleGasto(m), m.beneficiario, m.motivo, m.destino].filter(Boolean).join(' · ') || '—';
                return (
                  <tr key={m.id}>
                    <td>{dateTime(m.at)}</td>
                    <td>{TIPO_MOV_LABEL[m.tipo] ?? m.tipo}</td>
                    <td>{concepto}</td>
                    <td className="mono" style={{ textAlign: 'right', color: egreso ? 'var(--danger)' : 'var(--success)' }}>{egreso ? '−' : '+'}{monto(m.monto, m.moneda)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(m.saldo_despues, m.moneda)}</td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && movs.length > 0 && (
              <tfoot>
                {netoMontoPorMoneda(movs).map(({ moneda, total }) => (
                  <tr key={moneda}>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL {moneda} (neto)</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: total < 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {total < 0 ? '−' : '+'}{monto(Math.abs(total), moneda)}
                    </td>
                    <td></td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Modal>
  );
}

function DispCard({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="card" style={destacado ? { borderColor: 'var(--brand, #ff8a00)' } : undefined}>
      <div className="muted" style={{ fontSize: '.74rem' }}>{titulo}</div>
      <strong className="mono" style={{ fontSize: '1.25rem' }}>{valor}</strong>
      {nota && <div className="muted" style={{ fontSize: '.68rem', marginTop: '.2rem' }}>{nota}</div>}
    </div>
  );
}

/* ───────────── Directorio de clientes / proveedores ───────────── */
const VACIA = { tipo: 'proveedor' as TipoContraparte, nombre: '', rif: '', telefono: '', email: '', nota: '' };
function ContrapartesModal({ onClose }: { onClose: () => void }) {
  const [lista, setLista] = useState<Contraparte[]>([]);
  const [filtro, setFiltro] = useState<'todos' | TipoContraparte>('todos');
  const [form, setForm] = useState({ ...VACIA });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inputs no controlados: este nonce remonta el bloque del formulario cuando se
  // limpia/cambia el registro en edición, para que el DOM refleje el nuevo estado.
  const [formKey, setFormKey] = useState(0);
  // Se lee directo del DOM al guardar (robusto ante re-renders/realtime que
  // desincronizan el estado mientras se escribe).
  const formRef = useRef<HTMLDivElement>(null);

  const recargar = useCallback(async () => {
    try { setLista(await listContrapartes()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error'); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);

  function nuevo() { setEditId(null); setForm({ ...VACIA }); setError(null); setFormKey((k) => k + 1); }
  function editar(c: Contraparte) {
    setEditId(c.id);
    setForm({ tipo: c.tipo, nombre: c.nombre, rif: c.rif ?? '', telefono: c.telefono ?? '', email: c.email ?? '', nota: c.nota ?? '' });
    setError(null);
    setFormKey((k) => k + 1);
  }

  async function guardar() {
    // Lee del DOM (no del estado) para evitar el caso en que un re-render
    // desincroniza `form` mientras se escribe y el nombre llega vacío.
    const root = formRef.current;
    const leer = (n: string) => ((root?.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? '').trim();
    const datos = {
      tipo: form.tipo,
      nombre: leer('cp-nombre'),
      rif: leer('cp-rif'),
      telefono: leer('cp-telefono'),
      email: leer('cp-email'),
      nota: leer('cp-nota'),
    };
    if (!datos.nombre) { setError(form.tipo === 'proveedor' ? 'Indicá la razón social.' : 'Indicá el nombre del cliente.'); return; }
    setBusy(true); setError(null);
    try {
      if (editId) await actualizarContraparte(editId, datos);
      else await crearContraparte(datos);
      toast(editId ? 'Actualizado' : 'Registrado', 'success');
      nuevo();
      await recargar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setBusy(false); }
  }

  async function borrar(c: Contraparte) {
    if (!window.confirm(`¿Eliminar a "${c.nombre}"?`)) return;
    try { await eliminarContraparte(c.id); if (editId === c.id) nuevo(); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const visibles = lista.filter((c) => filtro === 'todos' || c.tipo === filtro);

  return (
    <Modal title="Clientes / Proveedores" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {/* Alta / edición */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title"><span>{editId ? 'Editar' : 'Nuevo'} registro</span></div>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', margin: '0 0 .6rem' }}><strong>Error:</strong> {error}</div>}
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
          {(['cliente', 'proveedor'] as const).map((t) => {
            const sel = form.tipo === t;
            return (
              <label key={t} style={{
                display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', flex: 1, justifyContent: 'center',
                padding: '.4rem .7rem', borderRadius: 'var(--r-md)',
                border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                background: sel ? 'rgba(255,138,0,0.10)' : 'transparent',
              }}>
                <input type="radio" name="cp-tipo" checked={sel} onChange={() => setForm((f) => ({ ...f, tipo: t }))} />
                <span style={{ fontWeight: 600 }}>{t === 'cliente' ? '👤 Cliente' : '🏭 Proveedor'}</span>
              </label>
            );
          })}
        </div>
        <div key={formKey} ref={formRef}>
          <div className="form-grid">
            <div className="form-row">
              <label>{form.tipo === 'proveedor' ? 'Razón social' : 'Nombre del cliente'}</label>
              <input className="input" name="cp-nombre" defaultValue={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="form-row">
              <label>RIF / C.I. (opcional)</label>
              <input className="input" name="cp-rif" defaultValue={form.rif} onChange={(e) => setForm((f) => ({ ...f, rif: e.target.value }))} />
            </div>
            <div className="form-row">
              <label>Teléfono (opcional)</label>
              <input className="input" name="cp-telefono" defaultValue={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div className="form-row">
              <label>Correo (opcional)</label>
              <input className="input" name="cp-email" defaultValue={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <label>Nota (opcional)</label>
            <input className="input" name="cp-nota" defaultValue={form.nota} onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))} />
          </div>
        </div>
        <div className="actions" style={{ marginTop: '.5rem' }}>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : (editId ? 'Guardar cambios' : '+ Registrar')}</button>
          {editId && <button className="btn btn-ghost btn-sm" onClick={nuevo} disabled={busy}>Cancelar edición</button>}
        </div>
      </div>

      {/* Listado */}
      <div className="filterbar" style={{ justifyContent: 'flex-start', gap: '.4rem', marginBottom: '.5rem' }}>
        {(['todos', 'cliente', 'proveedor'] as const).map((t) => (
          <button key={t} className={`btn btn-sm ${filtro === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltro(t)}>
            {t === 'todos' ? 'Todos' : t === 'cliente' ? 'Clientes' : 'Proveedores'}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Categoría</th><th>Nombre / Razón social</th><th>RIF / C.I.</th><th>Contacto</th><th></th></tr></thead>
          <tbody>
            {!visibles.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin registros.</td></tr>}
            {visibles.map((c) => (
              <tr key={c.id}>
                <td><span className="badge">{c.tipo === 'cliente' ? '👤 Cliente' : '🏭 Proveedor'}</span></td>
                <td>{c.nombre}</td>
                <td className="mono">{c.rif || '—'}</td>
                <td className="muted" style={{ fontSize: '.82rem' }}>{[c.telefono, c.email].filter(Boolean).join(' · ') || '—'}</td>
                <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => editar(c)}>✎</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => borrar(c)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ───────────── Modales ───────────── */

function GastoModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [concepto, setConcepto] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [esPeramanal, setEsPeramanal] = useState(false);
  const [tasaPeramanalStr, setTasaPeramanalStr] = useState(''); // Bs por $ (custom) para gastos en Bs
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;

  // Categoría / subcategoría de gasto (obligatorias; se pueden crear al vuelo).
  const [catRows, setCatRows] = useState<CategoriaGasto[]>([]);
  const [catNombre, setCatNombre] = useState('');
  const [subNombre, setSubNombre] = useState('');
  const cargarCats = useCallback(() => { listCategoriasGasto(true).then(setCatRows).catch(() => {}); }, []);
  useEffect(() => { cargarCats(); }, [cargarCats]);
  useRealtime(['categorias_gasto'], () => { cargarCats(); });
  const catOpts = useMemo(() => soloCategorias(catRows).map((c) => c.nombre), [catRows]);
  const catSel = useMemo(() => soloCategorias(catRows).find((c) => c.nombre.toLowerCase() === catNombre.trim().toLowerCase()) ?? null, [catRows, catNombre]);
  const subOpts = useMemo(() => (catSel ? subcategoriasDe(catRows, catSel.id).map((s) => s.nombre) : []), [catRows, catSel]);

  // Correlativo autoincremental para RECEPCIÓN/EXPORTACIÓN: el primero lo ingresa
  // el usuario; si ya hay registrados, se sugiere el siguiente y queda fijo.
  const llevaCorrelativo = useMemo(() => categoriaLlevaCorrelativo(catNombre), [catNombre]);
  const [ultimoCorr, setUltimoCorr] = useState<number | null>(null);
  const [cargandoCorr, setCargandoCorr] = useState(false);
  const [correlativoStr, setCorrelativoStr] = useState('');
  useEffect(() => {
    const catN = catNombre.trim();
    if (!llevaCorrelativo || !catN) { setUltimoCorr(null); return; }
    setCargandoCorr(true);
    ultimoCorrelativo(catN)
      .then((u) => setUltimoCorr(u))
      .catch(() => setUltimoCorr(null))
      .finally(() => setCargandoCorr(false));
  }, [llevaCorrelativo, catNombre]);
  const correlativoSugerido = ultimoCorr != null ? ultimoCorr + 1 : null;

  // Saldos reales de la caja (multimoneda: cada cuenta/moneda con su saldo).
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  const [saldoSelId, setSaldoSelId] = useState('');
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); setSaldoSelId(''); return; }
    saldosDeCaja(cajaId).then((rows) => {
      const conSaldo = rows.filter((r) => Number(r.saldo) > 0);
      setSaldosCaja(conSaldo);
      setSaldoSelId(conSaldo[0]?.id ?? '');
    }).catch(() => { setSaldosCaja([]); setSaldoSelId(''); });
  }, [cajaId]);

  const esMulti = saldosCaja.length > 0;
  const selSaldo = saldosCaja.find((s) => s.id === saldoSelId) ?? null;
  const monedaPago = esMulti ? (selSaldo?.moneda ?? caja?.moneda ?? 'Bs') : (caja?.moneda ?? 'Bs');
  // Reflejo en la caja de Acopio: en dólares va el monto tal cual; en Bs se convierte
  // a $ con la tasa personalizada (monto / tasa).
  const esDolar = monedaPago === 'USD' || monedaPago === 'USDT';
  const tasaPeramanalNum = Number(tasaPeramanalStr) || 0;
  const montoNumRef = Number(montoStr) || 0;
  const reflejoUsd = esDolar
    ? montoNumRef
    : (tasaPeramanalNum > 0 ? Math.round((montoNumRef / tasaPeramanalNum) * 100) / 100 : 0);
  const cuentaPago = esMulti ? (selSaldo?.cuenta ?? 'general') : null;
  const disponible = esMulti ? (Number(selSaldo?.saldo) || 0) : (Number(caja?.saldo) || 0);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja.'); return; }
    if (esMulti && !selSaldo) { setError('Elegí de qué saldo (moneda) se paga.'); return; }
    const m = Number(montoStr) || 0;
    if (m > disponible + 0.01) { setError(`Saldo insuficiente. Disponible: ${monto(disponible, monedaPago)}.`); return; }
    const catN = catNombre.trim(); const subN = subNombre.trim();
    if (!catN) { setError('Elegí o creá la categoría del gasto.'); return; }
    if (!subN) { setError('Elegí o creá la subcategoría del gasto.'); return; }
    if (esPeramanal && !esDolar && tasaPeramanalNum <= 0) { setError('Indicá la tasa (Bs por $) para reflejar el gasto en la caja de Acopio.'); return; }
    // Para RECEPCIÓN/EXPORTACIÓN el primer correlativo lo ingresa el usuario.
    let primerCorr: number | null = null;
    if (llevaCorrelativo && ultimoCorr == null) {
      const c = Math.trunc(Number(correlativoStr));
      if (!Number.isFinite(c) || c <= 0) { setError('Ingresá el número de correlativo inicial (mayor que 0).'); return; }
      primerCorr = c;
    }
    setSaving(true);
    try {
      // Asegura la categoría/subcategoría en el catálogo (idempotente) y etiqueta el gasto.
      const cat = await ensureCategoriaGasto(catN, null, actor);
      await ensureCategoriaGasto(subN, cat.id, actor);
      await registrarGasto({
        cajaId, monto: m, concepto, cuenta: cuentaPago, moneda: monedaPago,
        gastoCategoria: cat.nombre, gastoSubcategoria: subN, gastoCorrelativo: primerCorr,
        esPeramanal, acopioMontoUsd: esPeramanal ? reflejoUsd : null, actor, actorName,
      });
      notify(`Gasto registrado: ${monto(m, monedaPago)}`, 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); setSaving(false); }
  }

  return (
    <Modal title="Registrar gasto" size="md" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="teso-gasto" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar gasto'}</button></>
    }>
      <form id="teso-gasto" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Caja</label>
            <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length}
              placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
              options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
          </div>
          {esMulti && (
            <div className="form-row">
              <label>Saldo (moneda / cuenta)</label>
              <select className="select" value={saldoSelId} onChange={(e) => setSaldoSelId(e.target.value)}>
                {saldosCaja.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.moneda}{s.cuenta !== 'general' ? ` · ${s.cuenta === 'juridica' ? 'Jurídica' : 'Personal'}` : ''} · {monto(Number(s.saldo), s.moneda)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-row">
            <label>Monto ({monedaPago})</label>
            <input className="input mono" type="number" name="g-monto" min={0} step="any" defaultValue={montoStr} onChange={(e) => { const v = dosDecimales(e.target.value); e.target.value = v; setMontoStr(v); }} required />
            <small className="muted">Disponible: <strong className="mono">{monto(disponible, monedaPago)}</strong></small>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Categoría *</label>
            <SearchCreateSelect value={catNombre} onChange={(v) => { setCatNombre(v); setSubNombre(''); }} options={catOpts} placeholder="Elegí o escribí una categoría…" />
          </div>
          <div className="form-row">
            <label>Subcategoría *</label>
            <SearchCreateSelect value={subNombre} onChange={setSubNombre} options={subOpts} placeholder={catNombre.trim() ? 'Elegí o escribí una subcategoría…' : 'Elegí primero la categoría'} />
          </div>
        </div>
        {llevaCorrelativo && (
          <div className="form-row">
            <label>Correlativo (N°)</label>
            {cargandoCorr ? (
              <input className="input mono" value="Cargando…" disabled />
            ) : ultimoCorr == null ? (
              <input className="input mono" type="number" min={1} step={1} value={correlativoStr}
                onChange={(e) => setCorrelativoStr(e.target.value)} placeholder="N° inicial" required />
            ) : (
              <input className="input mono" value={String(correlativoSugerido)} disabled />
            )}
            <small className="muted">
              {ultimoCorr == null
                ? 'Primer registro de esta categoría: ingresá el número inicial. De ahí la secuencia sigue sola.'
                : `Se asignará automáticamente el N° ${correlativoSugerido} (último registrado: ${ultimoCorr}).`}
            </small>
          </div>
        )}
        <div className="form-row">
          <label>Concepto</label>
          <input className="input" name="g-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="A qué corresponde el gasto" required />
          <small className="muted">Categoría y subcategoría son obligatorias (podés crearlas escribiéndolas). El gasto queda etiquetado y aparece en el registro de movimientos.</small>
        </div>
        {/* Reflejo en la caja del Centro de Acopio (Peramanal). En Bs se convierte a $ con tasa personalizada. */}
        <div className="form-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={esPeramanal} onChange={(e) => setEsPeramanal(e.target.checked)} />
            <span>🏭 Es gasto del <strong>Centro de Acopio (Peramanal)</strong></span>
          </label>
          {esPeramanal && !esDolar && (
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.45rem', flexWrap: 'wrap' }}>
              <label className="muted" style={{ fontSize: '.8rem' }}>Tasa (Bs por $)</label>
              <input className="input mono" type="number" min={0} step="any" value={tasaPeramanalStr}
                onChange={(e) => setTasaPeramanalStr(e.target.value)} placeholder="Bs/$" style={{ width: 130, textAlign: 'right' }} />
              <span className="muted" style={{ fontSize: '.82rem' }}>
                ≈ <strong className="mono" style={{ color: 'var(--brand, #ff8a00)' }}>${reflejoUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> a Acopio
              </span>
            </div>
          )}
          <small className="muted">
            {esPeramanal
              ? (esDolar
                  ? `Se crea el movimiento en la caja de Acopio por $${reflejoUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (columna Gastos o Nómina según la categoría) y afecta la tasa $/kg.`
                  : 'El gasto está en Bs: indicá la tasa (Bs por $) y se refleja convertido a $ en la caja de Acopio (Gastos o Nómina según la categoría), afectando la tasa $/kg.')
              : 'Marcalo si el gasto es del Centro de Acopio: además del movimiento en Tesorería, se refleja en la caja de Acopio.'}
          </small>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Recibir dinero de MGG (directo a una caja → deuda MGG) ─────────────
   Igual que la entrada de dinero en Acopio, pero el dinero entra DIRECTO a la caja
   elegida (sube su saldo) y queda anclado como una CUENTA POR PAGAR a MGG en la
   moneda de la caja, que después se salda con producto o abonos. */
function RecibirDineroMggModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [montoStr, setMontoStr] = useState('');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';

  // Billetera de la caja elegida (saldo visible + multimoneda si aplica).
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); return; }
    saldosDeCaja(cajaId).then((rows) => setSaldosCaja(rows.filter((r) => Number(r.saldo) > 0))).catch(() => setSaldosCaja([]));
  }, [cajaId]);

  const montoNum = Number(montoStr) || 0;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja a la que entra el dinero.'); return; }
    if (montoNum <= 0) { setError('Indicá el monto recibido (mayor que 0).'); return; }
    setSaving(true);
    try {
      await recibirDineroDeMGG({ cajaId, monto: montoNum, nota: nota.trim() || null, actor, actorName });
      notify(`Recibido de MGG: ${monto(montoNum, moneda)} → ${caja?.nombre ?? 'caja'} · deuda a MGG`, 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); setSaving(false); }
  }

  return (
    <Modal title="💵 Recibir dinero de MGG" size="md" onClose={() => !saving && onClose()} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="recibir-mgg" className="btn btn-primary" disabled={saving}>{saving ? 'Registrando…' : `Recibir ${montoNum > 0 ? monto(montoNum, moneda) : ''}`.trim()}</button></>
    }>
      <form id="recibir-mgg" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Explicación: a dónde va el dinero. */}
        <div className="card" style={{ marginBottom: '.85rem', borderColor: 'var(--brand, #ff8a00)', background: 'var(--bg-1)' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>¿A dónde va este dinero?</div>
          <div style={{ fontSize: '.86rem', display: 'grid', gap: '.35rem' }}>
            <div>1️⃣ <strong>Entra a la caja</strong> que elijas abajo: <strong>sube su saldo</strong> (el mismo que se ve en Cajas), en la moneda de la caja.</div>
            <div>2️⃣ Queda anclado como una <strong>cuenta por pagar a MGG</strong> (deuda): «<strong>MGG · directo</strong>», en la moneda de la caja.</div>
            <div>3️⃣ Esa deuda se <strong>salda después</strong> desde <strong>💳 Cuentas por pagar</strong>: con <strong>abonos</strong> o entregando <strong>producto</strong> (igual que las demás).</div>
            <small className="muted">Es una cuenta <strong>aparte</strong> de la deuda «MGG» que se sincroniza desde Acopio (no se mezclan).</small>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Caja (a dónde entra el dinero)</label>
            <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length}
              placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
              options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
          </div>
          <div className="form-row">
            <label>Monto recibido ({moneda})</label>
            <input className="input mono" type="number" min={0} step="any" value={montoStr}
              onChange={(e) => setMontoStr(dosDecimales(e.target.value))} required autoFocus />
          </div>
        </div>

        {/* Billetera de la caja elegida. */}
        {caja && (
          <div className="card" style={{ margin: '0 0 .85rem', padding: '.6rem .8rem' }}>
            <div className="muted" style={{ fontSize: '.72rem', marginBottom: '.25rem' }}>Billetera de {caja.nombre}</div>
            {saldosCaja.length > 0 ? (
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                {saldosCaja.map((s) => (
                  <span key={s.id} className="badge mono" style={{ background: 'var(--bg-2)' }}>
                    {monto(Number(s.saldo), s.moneda)}{s.cuenta !== 'general' ? ` · ${s.cuenta === 'juridica' ? 'Jurídica' : 'Personal'}` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <strong className="mono">{monto(Number(caja.saldo) || 0, caja.moneda)}</strong>
            )}
          </div>
        )}

        <div className="form-row">
          <label>Nota (opcional)</label>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: para operar, ref., etc." />
          <small className="muted">Queda en el movimiento de caja y en la cuenta por pagar a MGG.</small>
        </div>
      </form>
    </Modal>
  );
}

function TrasladoModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [origenId, setOrigenId] = useState(cajas[0]?.id ?? '');
  const [destinoId, setDestinoId] = useState('');
  const [centros, setCentros] = useState<Caja[]>([]);
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({}); // key = saldo.id
  const [motivo, setMotivo] = useState('');
  const [loadingSaldos, setLoadingSaldos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origen = cajas.find((c) => c.id === origenId) ?? null;
  const destino = centros.find((c) => c.id === destinoId) ?? null;

  useEffect(() => { listCentrosAcopio().then(setCentros).catch(() => setCentros([])); }, []);
  useEffect(() => {
    if (!origenId) { setSaldos([]); return; }
    setLoadingSaldos(true);
    saldosDeCaja(origenId)
      .then((s) => setSaldos(s.filter((x) => (Number(x.saldo) || 0) > 0)))
      .catch(() => setSaldos([]))
      .finally(() => setLoadingSaldos(false));
    setMontos({});
  }, [origenId]);

  const cuentaLabel = (c: string) => c === 'general' ? '' : c === 'juridica' ? ' · Jurídica' : ' · Personal';

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!origenId || !destinoId) { setError('Elegí la caja origen y el centro de acopio.'); return; }
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return; }
    const legs = saldos
      .map((s) => ({ cuenta: s.cuenta, moneda: s.moneda, monto: Number(montos[s.id]) || 0 }))
      .filter((l) => l.monto > 0);
    if (!legs.length) { setError('Indicá al menos un monto a trasladar.'); return; }
    setSaving(true);
    try {
      await trasladoEntreCajasMulti({
        origenId, destinoId, legs, motivo: motivo.trim(),
        origenNombre: origen?.nombre, destinoNombre: destino?.nombre, actor, actorName,
      });
      // Centro de acopio EXTERNO (otro sistema/Supabase): además del traslado local,
      // replicar la transferencia al otro sistema vía el puente inter-sistema.
      if (destino?.externo && destino.empresa_codigo) {
        const transferLegs: TransferLeg[] = saldos
          .map((s) => ({ cuenta: s.cuenta, moneda: s.moneda, monto: Number(montos[s.id]) || 0, tasa_bs: s.tasa_prom ?? null }))
          .filter((l) => l.monto > 0);
        await crearTransferenciaSaliente({
          empresaDestino: destino.empresa_codigo, cajaId: destinoId, cajaNombre: destino.nombre,
          legs: transferLegs, motivo: motivo.trim(), actor, actorName,
        });
        notify(`Traslado a ${destino.nombre} registrado y enviado al otro sistema`, 'success', { link: '#/app/tesoreria' });
      } else {
        notify('Traslado a centro de acopio registrado', 'success', { link: '#/app/tesoreria' });
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo trasladar.'); setSaving(false); }
  }

  return (
    <Modal title="Traspaso de dinero" size="md" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="teso-tras" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Trasladar'}</button></>
    }>
      <form id="teso-tras" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Desde</label>
            <SearchSelect value={origenId} onChange={(v) => { setOrigenId(v); setDestinoId(destinoId); }} placeholder="🔍 Buscar caja…"
              options={cajas.map((c) => ({ value: c.id, label: `${c.nombre} · ${monto(c.saldo, c.moneda)}` }))} />
          </div>
          <div className="form-row">
            <label>Hacia (Centro de Acopio)</label>
            <SearchSelect value={destinoId} onChange={setDestinoId} placeholder="🔍 Buscar centro…"
              options={centros.map((c) => ({ value: c.id, label: `${c.nombre}${c.externo ? ' · sistema externo' : ''}` }))} />
            {destino?.externo && (
              <small className="muted">🔗 Centro de acopio en otro sistema: el traslado se replica automáticamente y queda “por confirmar” del otro lado.</small>
            )}
          </div>
        </div>

        {/* Montos a sacar de cada moneda registrada en la caja origen */}
        <div className="card" style={{ margin: '.4rem 0', padding: '.5rem .7rem' }}>
          <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.35rem' }}>¿Cuánto trasladar de cada moneda registrada en la caja?</div>
          {loadingSaldos ? <div className="muted" style={{ fontSize: '.85rem' }}>Cargando saldos…</div>
            : !saldos.length ? <div className="muted" style={{ fontSize: '.85rem' }}>Esta caja no tiene saldos.</div>
            : (
              <div style={{ display: 'grid', gap: '.4rem' }}>
                {saldos.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <span style={{ flex: '1 1 auto', fontSize: '.85rem' }}>
                      <span className="badge">{s.moneda}</span>{cuentaLabel(s.cuenta)} <span className="muted">· disp. {monto(s.saldo, s.moneda)}</span>
                    </span>
                    <input className="input mono" type="number" name={`tras-monto-${s.id}`} min={0} max={Number(s.saldo) || 0} step="any" placeholder="0,00"
                      defaultValue={montos[s.id] ?? ''} onChange={(e) => { const v = dosDecimales(e.target.value); e.target.value = v; setMontos((m) => ({ ...m, [s.id]: v })); }}
                      style={{ width: 140 }} />
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="form-row"><label>Motivo *</label><input className="input" name="tras-motivo" defaultValue={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Obligatorio" required /></div>
      </form>
    </Modal>
  );
}

/* ───────────── Transferencias inter-sistema (centros de acopio externos) ───────────── */

const ESTADO_TRANSFER: Record<string, { label: string; color: string }> = {
  enviada: { label: 'En tránsito · esperando confirmación', color: 'var(--warning)' },
  por_confirmar: { label: 'Por confirmar', color: 'var(--warning)' },
  recibida: { label: 'Recibida ✓', color: 'var(--success)' },
  rechazada: { label: 'Rechazada', color: 'var(--danger)' },
  error: { label: 'Pendiente de entrega ⟳', color: 'var(--danger)' },
};

function TransferenciasInterPanel({ transfers, cajas, canWrite, actor, actorName, onChanged }: {
  transfers: TransferenciaInter[]; cajas: Caja[]; canWrite: boolean; actor: string; actorName: string | null; onChanged: () => void | Promise<void>;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const entrantes = transfers.filter((t) => t.direccion === 'entrante' && t.estado === 'por_confirmar' && !t.aceptado_tesoreria);
  const salientes = transfers.filter((t) => t.direccion === 'saliente');
  const salientesVivas = salientes.filter((t) => t.estado !== 'recibida');
  const salientesRecibidas = salientes.filter((t) => t.estado === 'recibida');
  const recibidas = salientesRecibidas.length;
  // Nombre real del destino (caja externa) en vez de "el otro sistema".
  const destinosRecibidos = Array.from(
    new Set(salientesRecibidas.map((t) => t.caja_nombre || t.empresa_destino)),
  ).join(' · ');
  if (!entrantes.length && !salientes.length) return null;

  async function confirmar(t: TransferenciaInter) {
    const cajaId = t.caja_id || sel[t.id];
    if (!cajaId) { toast('Elegí la caja que recibe el dinero.', 'error'); return; }
    setBusy(t.id);
    try {
      await confirmarTransferenciaEntrante({ row: t, cajaId, actor, actorName });
      toast(`Transferencia de ${t.empresa_origen} acreditada`, 'success');
      await onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo confirmar', 'error'); }
    finally { setBusy(null); }
  }

  async function reintentar(t: TransferenciaInter) {
    setBusy(t.id);
    try {
      await reintentarTransferencia(t);
      toast('Reintento enviado al otro sistema', 'success');
      await onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Sigue sin poder entregarse', 'error'); }
    finally { setBusy(null); }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem', borderColor: entrantes.length ? 'var(--brand, #ff8a00)' : undefined }}>
      <div className="card-title" style={{ marginBottom: '.5rem' }}>
        🔗 Transferencias inter-sistema (centros de acopio externos)
      </div>

      {/* ENTRANTES por confirmar */}
      {entrantes.length > 0 && (
        <div style={{ marginBottom: salientesVivas.length ? '.8rem' : 0 }}>
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.35rem' }}>Entrantes por confirmar · acreditá a la caja que recibe</div>
          <div className="muted" style={{ fontSize: '.72rem', marginBottom: '.4rem', color: 'var(--brand, #ff8a00)' }}>
            🏭 El mismo dinero se acepta por separado en cada módulo: acá acreditás la parte de <strong>Tesorería</strong> (a la caja elegida). En <strong>Acopio</strong>, el banner «Dinero por entrar» acredita su parte como «USD entregado». La transferencia se completa cuando ambos aceptan.
          </div>
          <div style={{ display: 'grid', gap: '.45rem' }}>
            {entrantes.map((t) => (
              <div key={t.id} className="card" style={{ margin: 0, padding: '.55rem .7rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ flex: '1 1 240px', fontSize: '.85rem' }}>
                  <strong>De {t.empresa_origen}</strong> · <span className="mono">{t.resumen}</span>
                  {t.motivo ? <span className="muted"> · {t.motivo}</span> : null}
                  <div className="muted" style={{ fontSize: '.72rem' }}>{dateTime(t.created_at)}</div>
                </div>
                {!t.caja_id && (
                  <SearchSelect value={sel[t.id] ?? ''} onChange={(v) => setSel((m) => ({ ...m, [t.id]: v }))} style={{ maxWidth: 200 }}
                    placeholder="🔍 Caja que recibe…" options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
                )}
                {canWrite && (
                  <button className="btn btn-sm btn-primary" disabled={busy === t.id} onClick={() => confirmar(t)}>
                    {busy === t.id ? 'Confirmando…' : '✓ Confirmar recepción'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SALIENTES en tránsito / con error */}
      {salientesVivas.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.35rem' }}>Salientes (enviadas a otro sistema)</div>
          <div style={{ display: 'grid', gap: '.4rem' }}>
            {salientesVivas.map((t) => {
              const est = ESTADO_TRANSFER[t.estado] ?? { label: t.estado, color: 'var(--muted)' };
              return (
                <div key={t.id} className="card" style={{ margin: 0, padding: '.5rem .7rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>
                  <div style={{ flex: '1 1 240px', fontSize: '.84rem' }}>
                    <strong>→ {t.empresa_destino}</strong> · <span className="mono">{t.resumen}</span>
                    <div style={{ fontSize: '.72rem', color: est.color }}>{est.label}{t.mensaje_error ? ` · ${t.mensaje_error}` : ''}</div>
                  </div>
                  {canWrite && t.estado === 'error' && (
                    <button className="btn btn-sm btn-ghost" disabled={busy === t.id} onClick={() => reintentar(t)}>
                      {busy === t.id ? 'Reintentando…' : '⟳ Reintentar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recibidas > 0 && (
        <div className="muted" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
          {recibidas === 1 ? 'Confirmado' : `${recibidas} confirmadas`} por {destinosRecibidos}.
        </div>
      )}
    </div>
  );
}

/* ───────── Enviar reporte por correo (mismo patrón que las OC) ───────── */
function EnviarReporteModal({ movs, meta, defaultEmail, onClose }: {
  movs: MovimientoCaja[]; meta: ReporteMeta; defaultEmail: string; onClose: () => void;
}) {
  const [incluirPropio, setIncluirPropio] = useState(true);
  const [extra, setExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const propio = defaultEmail.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleEnviar() {
    const lista: string[] = [];
    if (incluirPropio && propio) lista.push(propio);
    const extraClean = extra.trim().toLowerCase();
    if (extraClean) {
      if (!emailRx.test(extraClean)) { toast('El correo adicional no es válido', 'error'); return; }
      lista.push(extraClean);
    }
    setEnviando(true);
    try {
      const r = await enviarReportePorCorreo(movs, meta, lista);
      notify(`Reporte enviado a ${r.destinatarios.join(', ')}`, 'success', { link: '#/app/tesoreria' });
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setEnviando(false); }
  }

  return (
    <Modal title={`Enviar reporte · ${meta.titulo}`} size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>{enviando ? 'Enviando…' : '📧 Enviar'}</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Se enviará el PDF del reporte ({meta.subtitulo || 'todos los movimientos'}) a los destinatarios seleccionados.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: incluirPropio ? 'rgba(255,138,0,0.06)' : 'transparent', cursor: propio ? 'pointer' : 'not-allowed', marginBottom: '.6rem' }}>
        <input type="checkbox" checked={incluirPropio} disabled={!propio} onChange={(e) => setIncluirPropio(e.target.checked)} />
        <div>
          <div style={{ fontWeight: 600 }}>Tu correo</div>
          <div className="mono" style={{ fontSize: '.82rem' }}>{propio || '—'}</div>
        </div>
      </label>
      <div className="form-row" style={{ marginTop: '.4rem' }}>
        <label>Correo adicional (opcional)</label>
        <input className="input" type="email" name="correo-extra" defaultValue={extra} onChange={(e) => setExtra(e.target.value)} placeholder="otro@correo.com" maxLength={120} />
        <small className="muted">Si no marcás ninguno, se envía a los admin/jefe.</small>
      </div>
    </Modal>
  );
}

/* ───────── Pagar nómina: cola de renglones cargados por RRHH ───────── */
function NominaPorPagarModal({ cajas, actor, actorName, onClose, onPaid }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const [rows, setRows] = useState<NominaRenglon[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagar, setPagar] = useState<NominaRenglon | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    try { setRows(await listRenglonesPorPagar()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la nómina', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['nomina_renglones'], () => { void recargar(); });

  const total = useMemo(() => round2(rows.reduce((a, r) => a + (Number(r.neto_usd) || 0), 0)), [rows]);

  return (
    <Modal title="Pagar nómina" size="xl" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="muted" style={{ marginBottom: '.6rem', fontSize: '.86rem' }}>
        Renglones cargados desde <strong>RRHH</strong>. Tesorería paga uno a uno (efectivo USD con seriales, o Bs a tasa BCV) y adjunta el comprobante (opcional).
        {rows.length > 0 && <> · {rows.length} pendiente(s) · Total <strong className="mono">{monto(total, 'USD')}</strong></>}
      </div>
      <div className="table-wrap" style={{ maxHeight: 440, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>Trabajador</th><th>Nómina</th><th>Motivo</th><th>Departamento</th><th style={{ textAlign: 'right' }}>Días</th><th style={{ textAlign: 'right' }}>Neto USD</th><th style={{ textAlign: 'center' }}>Acción</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={7}><EmptyState message="No hay nómina pendiente por pagar" icon="✅" /></td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td>{r.nombre}</td>
                <td className="mono muted">{r.periodo?.codigo ?? '—'}</td>
                <td><span className="badge" style={{ background: r.periodo?.tipo === 'vacaciones' ? 'var(--danger, #e5484d)' : r.periodo?.tipo === 'liquidacion' ? 'var(--warning, #ffae00)' : 'var(--primary-2, #2b6cb0)', color: '#fff' }}>{labelMotivoNomina(r.periodo?.tipo)}</span></td>
                <td className="muted">{r.departamento || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.dias_trabajados}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{monto(r.neto_usd, 'USD')}</td>
                <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-primary" onClick={() => setPagar(r)}>💸 Pagar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagar && (
        <PagarRenglonModal renglon={pagar} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagar(null)}
          onPaid={async () => { setPagar(null); await recargar(); onPaid(); }} />
      )}
    </Modal>
  );
}

/* ───────── Pagar un renglón de nómina (mismo motor que el pago de OC) ───────── */
function PagarRenglonModal({ renglon, cajas, actor, actorName, onClose, onPaid }: {
  renglon: NominaRenglon; cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const neto = round2(Number(renglon.neto_usd) || 0);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  // Saldos reales de la caja (caja multimoneda: cada cuenta/moneda con su saldo).
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  const [saldoSelId, setSaldoSelId] = useState('');
  const [tasa, setTasa] = useState(0);
  const [tasaFecha, setTasaFecha] = useState<string | null>(null);
  const [montoStr, setMontoStr] = useState(String(neto));
  const [factura, setFactura] = useState<File | null>(null);
  const [seriales, setSeriales] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); setTasaFecha(t.fecha); }).catch(() => {});
  }, []);

  // Carga los saldos de la caja elegida. Prefiere USD como saldo por defecto.
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); setSaldoSelId(''); return; }
    saldosDeCaja(cajaId).then((rows) => {
      const conSaldo = rows.filter((r) => Number(r.saldo) > 0);
      setSaldosCaja(conSaldo);
      const pref = conSaldo.find((r) => r.moneda === 'USD') ?? conSaldo[0];
      setSaldoSelId(pref?.id ?? '');
    }).catch(() => { setSaldosCaja([]); setSaldoSelId(''); });
  }, [cajaId]);

  // Si la caja maneja saldos multimoneda, se paga desde el saldo elegido;
  // si no (caja legada), desde el saldo simple de la caja.
  const esMulti = saldosCaja.length > 0;
  const selSaldo = saldosCaja.find((s) => s.id === saldoSelId) ?? null;
  const moneda = esMulti ? (selSaldo?.moneda ?? 'USD') : (caja?.moneda ?? 'USD');
  const cuentaPago = esMulti ? (selSaldo?.cuenta ?? 'general') : null;
  const disponible = esMulti ? (Number(selSaldo?.saldo) || 0) : (Number(caja?.saldo) || 0);

  // Autocompleta el monto según la moneda elegida (USD/USDT directo, Bs a tasa BCV).
  useEffect(() => {
    if (moneda === 'Bs') setMontoStr(tasa > 0 ? String(aBs(neto, tasa)) : '');
    else setMontoStr(String(neto));
  }, [moneda, tasa, neto]);

  const pagaUsdEfectivo = moneda === 'USD';
  function agregarSerial() {
    const v = serialInput.trim();
    if (!v) return;
    if (!seriales.includes(v)) setSeriales((xs) => [...xs, v]);
    setSerialInput('');
  }
  function quitarSerial(s: string) { setSeriales((xs) => xs.filter((x) => x !== s)); }

  const deducTotal = round2((Number(renglon.deduc_anticipos) || 0) + (Number(renglon.deduc_prestamos) || 0));

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja con la que se paga.'); return; }
    if (esMulti && !selSaldo) { setError('Elegí de qué saldo (moneda) de la caja se paga.'); return; }
    const m = round2(Number(montoStr) || 0);
    if (m <= 0) { setError('Indicá el monto a pagar.'); return; }
    if (m > disponible + 0.01) { setError(`Saldo insuficiente. Disponible: ${monto(disponible, moneda)}.`); return; }
    setSaving(true);
    try {
      await pagarRenglon({
        renglon, cajaId, monto: m,
        cuenta: cuentaPago, moneda,
        tasa: moneda === 'Bs' ? tasa : null,
        seriales: pagaUsdEfectivo ? seriales : null,
        comprobante: factura,
        actorEmail: actor, actorName,
      });
      notify(`Nómina pagada · ${renglon.nombre} · ${monto(m, moneda)}`, 'success', { link: '#/app/tesoreria' });
      onPaid();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar.'); setSaving(false); }
  }

  return (
    <Modal title={`Pagar nómina · ${renglon.nombre}`} size="lg" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="submit" form="pagar-nomina" className="btn btn-primary" disabled={saving}>{saving ? 'Pagando…' : `PAGAR · ${monto(Number(montoStr) || 0, moneda)}`}</button>
      </>
    }>
      <form id="pagar-nomina" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Detalle del renglón</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.3rem .9rem', fontSize: '.84rem' }}>
            <div><span className="muted">Nómina:</span> <strong className="mono">{renglon.periodo?.codigo ?? '—'}</strong></div>
            <div><span className="muted">Departamento:</span> {renglon.departamento || '—'}</div>
            <div><span className="muted">Días:</span> <strong>{renglon.dias_trabajados}</strong></div>
            <div><span className="muted">Bruto:</span> <strong className="mono">{monto(renglon.salario_bruto, 'USD')}</strong></div>
            <div><span className="muted">Deducciones:</span> <strong className="mono">{monto(deducTotal, 'USD')}</strong></div>
            <div><span className="muted">Neto a pagar:</span> <strong className="mono" style={{ color: 'var(--success)' }}>{monto(neto, 'USD')}</strong></div>
          </div>
        </div>

        {/* Conversión USD ⇄ Bs (tasa BCV editable). */}
        <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Conversión</div>
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Neto en USD</div><strong className="mono" style={{ fontSize: '1.1rem' }}>{monto(neto, 'USD')}</strong></div>
            <div className="muted" style={{ fontSize: '1.2rem' }}>⇄</div>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Equivale en Bs</div><strong className="mono" style={{ fontSize: '1.1rem' }}>{tasa > 0 ? monto(aBs(neto, tasa), 'Bs') : '—'}</strong></div>
            <div className="form-row" style={{ marginLeft: 'auto', minWidth: 150 }}>
              <label style={{ fontSize: '.72rem' }}>Tasa BCV (Bs/$){tasaFecha ? ` · ${fmtDate(tasaFecha)}` : ''}</label>
              <input className="input mono" type="number" min={0} step="any" value={tasa || ''} onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" />
            </div>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Caja (de dónde sale el dinero)</label>
            <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length}
              placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
              options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
          </div>
          {esMulti && (
            <div className="form-row">
              <label>Saldo de la caja (moneda / cuenta)</label>
              <select className="select" value={saldoSelId} onChange={(e) => setSaldoSelId(e.target.value)} required>
                {saldosCaja.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.moneda}{s.cuenta !== 'general' ? ` · ${s.cuenta === 'juridica' ? 'Jurídica' : 'Personal'}` : ''} · {monto(Number(s.saldo), s.moneda)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-row">
            <label>Monto a pagar ({moneda})</label>
            <input className="input mono" type="number" min={0} step="any" value={montoStr} onChange={(e) => setMontoStr(dosDecimales(e.target.value))} required />
            <small className="muted">Disponible: <strong className="mono">{monto(disponible, moneda)}</strong></small>
            {moneda === 'Bs' && <small className="muted">Se autocompletó con la tasa BCV; podés ajustarlo.</small>}
            {pagaUsdEfectivo && redondearArriba5(Number(montoStr) || 0) > (Number(montoStr) || 0) && (
              <small className="muted" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
                💵 El monto tiene decimales. En efectivo se sugiere <strong className="mono">{monto(redondearArriba5(Number(montoStr) || 0), 'USD')}</strong> (redondeado al múltiplo de $5).
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMontoStr(String(redondearArriba5(Number(montoStr) || 0)))}>Redondear a {monto(redondearArriba5(Number(montoStr) || 0), 'USD')}</button>
              </small>
            )}
          </div>
        </div>

        {/* Seriales de billetes (solo al pagar USD físico). */}
        {pagaUsdEfectivo && (
          <div className="card" style={{ margin: '.75rem 0', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Seriales de los billetes entregados <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label style={{ fontSize: '.72rem' }}>Serial del billete</label>
                <input className="input mono" value={serialInput} onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarSerial(); } }} placeholder="Ej.: AB 1234567 C" />
              </div>
              <button type="button" className="btn btn-ghost" onClick={agregarSerial}>+ Agregar</button>
            </div>
            {seriales.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.5rem' }}>
                {seriales.map((s, i) => (
                  <span key={s} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: 'var(--bg-1)' }}>
                    <span className="muted">{i + 1}.</span><span className="mono">{s}</span>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .25rem', lineHeight: 1 }} title="Quitar" onClick={() => quitarSerial(s)}>✕</button>
                  </span>
                ))}
                <span className="muted" style={{ alignSelf: 'center', fontSize: '.8rem' }}>{seriales.length} billete(s)</span>
              </div>
            )}
          </div>
        )}

        <div className="form-row">
          <label>Comprobante de pago (PDF o imagen) <span className="muted">(opcional)</span></label>
          <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} />
          {factura && <small className="muted">{factura.name}</small>}
        </div>
      </form>
    </Modal>
  );
}


/** Carga la tasa del día y abre el modal de historial. */
function TasasGate({ onClose }: { onClose: () => void }) {
  const [tasa, setTasa] = useState<Awaited<ReturnType<typeof getTasaHoy>> | null>(null);
  useEffect(() => { getTasaHoy().then(setTasa).catch(() => setTasa({ usd: null, eur: null, fecha: null })); }, []);
  return <HistorialTasasModal tasaHoy={tasa} onClose={onClose} />;
}

/* ───────────── Conversor multimoneda (tasa personalizada) ───────────── */

const MONEDAS_CONV: MonedaCaja[] = ['Bs', 'USD', 'USDT', 'COP'];

/** Valor de 1 unidad de la moneda expresado en USD, con las tasas de mercado.
 *  Bs usa la tasa Binance (USDT/VES) como referencia del dólar; COP usa COP/USD.
 *  USD y USDT se toman en paridad (~1). */
function valorEnUsd(m: MonedaCaja, t: TasasMercado): number | null {
  switch (m) {
    case 'USD': return 1;
    case 'USDT': return 1;
    case 'Bs': return t.usdtVes && t.usdtVes > 0 ? 1 / t.usdtVes : null;
    case 'COP': return t.copUsd && t.copUsd > 0 ? 1 / t.copUsd : null;
  }
}

/** Tasa cruzada sugerida: cuántas unidades de `a` por 1 de `de`. */
function tasaCruzada(de: MonedaCaja, a: MonedaCaja, t: TasasMercado): number | null {
  const vd = valorEnUsd(de, t), va = valorEnUsd(a, t);
  if (vd == null || va == null || va === 0) return null;
  return round2(vd / va);
}

/* ───────── Resumen de movimientos (gráfico + drill-down + filtro por fechas) ───────── */
type CatResumen = 'ingresos' | 'egresos' | 'gastos';
/* Detalle de los movimientos de UNA moneda (clic en una fila del libro mayor).
   Lista cada movimiento como Debe/Haber; al tocar uno se abre su detalle completo. */
function LibroMayorDetalleModal({ moneda, movimientos, onSelMov, onClose }: {
  moneda: string; movimientos: MovimientoCaja[]; onSelMov: (m: MovimientoCaja) => void; onClose: () => void;
}) {
  const entra = (m: MovimientoCaja) => m.tipo === 'ingreso' || m.tipo === 'traslado_entrada' || (m.tipo === 'ajuste' && Number(m.saldo_despues) > Number(m.saldo_antes));
  const ordenados = [...movimientos].sort((a, b) => (a.at < b.at ? 1 : -1));
  const totDebe = round2(ordenados.filter(entra).reduce((a, m) => a + (Number(m.monto) || 0), 0));
  const totHaber = round2(ordenados.filter((m) => !entra(m)).reduce((a, m) => a + (Number(m.monto) || 0), 0));
  const neto = round2(totDebe - totHaber);

  function descargarPdf() {
    const rows = ordenados.map((m) => {
      const e = entra(m);
      const concepto = [CAT_LABEL[m.categoria ?? ''], detalleGasto(m)].filter(Boolean).join(' · ') || (TIPO_MOV_LABEL[m.tipo] ?? m.tipo);
      const beneficiario = [m.beneficiario, m.motivo].filter(Boolean).join(' · ') || '—';
      return {
        fecha: dateTime(m.at), caja: m.caja?.nombre ?? '—', concepto, beneficiario,
        debe: e ? monto(m.monto, m.moneda) : '', haber: !e ? monto(m.monto, m.moneda) : '',
        saldo: m.saldo_despues != null ? monto(m.saldo_despues, m.moneda) : '',
      };
    });
    descargarLibroMayorPdf({ moneda, rows, totDebe: monto(totDebe, moneda), totHaber: monto(totHaber, moneda), neto: monto(neto, moneda) })
      .catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'));
  }

  return (
    <Modal title={`📒 Movimientos en ${moneda}`} size="lg" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" disabled={!ordenados.length} onClick={descargarPdf} title="Reporte PDF del libro mayor (vista previa)">↓ PDF</button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.78rem' }}>{ordenados.length} movimiento(s). Tocá uno para ver <strong>todo su detalle</strong> (fecha, motivo, beneficiario, cuenta, etc.).</p>
      <div className="table-wrap" style={{ maxHeight: 440, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th>Caja</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'right' }}>Haber</th></tr></thead>
          <tbody>
            {!ordenados.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin movimientos.</td></tr>}
            {ordenados.map((m) => {
              const concepto = [CAT_LABEL[m.categoria ?? ''], detalleGasto(m), m.beneficiario, m.motivo].filter(Boolean).join(' · ') || (TIPO_MOV_LABEL[m.tipo] ?? m.tipo);
              const e = entra(m);
              return (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => onSelMov(m)} title="Ver todo el detalle">
                  <td>{dateTime(m.at)}</td>
                  <td>{m.caja?.nombre ?? '—'}</td>
                  <td>{concepto} 🔍</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{e ? monto(m.monto, m.moneda) : ''}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>{!e ? monto(m.monto, m.moneda) : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
            <td colSpan={3} style={{ textAlign: 'right' }}>Totales</td>
            <td className="mono" style={{ textAlign: 'right', color: 'var(--success)' }}>{monto(totDebe, moneda)}</td>
            <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>{monto(totHaber, moneda)}</td>
          </tr></tfoot>
        </table>
      </div>
    </Modal>
  );
}

function ResumenMovimientosModal({ movimientos, defaultEmail, onClose }: { movimientos: MovimientoCaja[]; defaultEmail: string; onClose: () => void }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const monedas = useMemo(() => Array.from(new Set(movimientos.map((m) => m.moneda))).sort(), [movimientos]);
  const [moneda, setMoneda] = useState<string>('');
  const [drill, setDrill] = useState<CatResumen | null>(null);
  const [catAbierta, setCatAbierta] = useState<string | null>(null); // categoría de gasto expandida
  const [movSel, setMovSel] = useState<MovimientoCaja | null>(null);  // detalle completo de un movimiento

  // Moneda por defecto: la de mayor cantidad de movimientos.
  useEffect(() => {
    if (moneda || !movimientos.length) return;
    const cnt: Record<string, number> = {};
    movimientos.forEach((m) => { cnt[m.moneda] = (cnt[m.moneda] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) setMoneda(top);
  }, [movimientos, moneda]);

  // Movimientos del rango + moneda elegida.
  const enRango = useMemo(() => movimientos.filter((m) => {
    if (moneda && m.moneda !== moneda) return false;
    const dia = (m.at ?? '').slice(0, 10);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    return true;
  }), [movimientos, moneda, desde, hasta]);

  const esEgreso = (m: MovimientoCaja) => m.tipo === 'salida' || m.tipo === 'traslado_salida' || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
  const movIngresos = useMemo(() => enRango.filter((m) => m.tipo === 'ingreso' || m.tipo === 'traslado_entrada'), [enRango]);
  const movEgresos = useMemo(() => enRango.filter(esEgreso), [enRango]);
  const movGastos = useMemo(() => movEgresos.filter((m) => m.categoria === 'gasto'), [movEgresos]);

  const sum = (arr: MovimientoCaja[]) => round2(arr.reduce((a, m) => a + (Number(m.monto) || 0), 0));
  const totIngresos = sum(movIngresos);
  const totEgresos = sum(movEgresos);
  const totGastos = sum(movGastos);
  const neto = round2(totIngresos - totEgresos);

  const data: ChartPoint[] = [
    { label: 'Ingresos', value: totIngresos, tooltip: `Ingresos: ${monto(totIngresos, moneda)}` },
    { label: 'Egresos', value: totEgresos, tooltip: `Egresos: ${monto(totEgresos, moneda)}` },
    { label: 'Gastos', value: totGastos, tooltip: `Gastos: ${monto(totGastos, moneda)}` },
  ];

  const drillMovs = drill === 'ingresos' ? movIngresos : drill === 'egresos' ? movEgresos : drill === 'gastos' ? movGastos : [];

  // Gastos agrupados por categoría (para el drill de Gastos): cada categoría se
  // expande y muestra sus gastos; cada gasto abre su detalle completo al tocarlo.
  const gastosPorCat = useMemo(() => {
    const m = new Map<string, { categoria: string; total: number; movs: MovimientoCaja[] }>();
    for (const g of movGastos) {
      const key = (g.gasto_categoria ?? '').trim() || 'Sin categoría';
      const e = m.get(key) ?? { categoria: key, total: 0, movs: [] };
      e.total = round2(e.total + (Number(g.monto) || 0));
      e.movs.push(g);
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [movGastos]);
  const Card = ({ cat, titulo, valor, color }: { cat: CatResumen; titulo: string; valor: number; color: string }) => (
    <div className="card" style={{ margin: 0, padding: '.6rem .85rem', cursor: 'pointer', borderColor: drill === cat ? color : undefined }}
      onClick={() => { setCatAbierta(null); setDrill((d) => d === cat ? null : cat); }} title="Ver los movimientos">
      <div className="muted" style={{ fontSize: '.68rem' }}>{titulo} 📊</div>
      <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color }}>{monto(valor, moneda)}</div>
    </div>
  );

  return (
    <Modal title="📊 Resumen de movimientos" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.7rem' }}>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
          Desde <input className="input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
          Hasta <input className="input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </label>
        {(desde || hasta) && <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(''); setHasta(''); }}>✕ Fechas</button>}
        <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)} style={{ width: 'auto' }}>
          {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="muted" style={{ fontSize: '.78rem', marginLeft: 'auto' }}>{enRango.length} movimiento(s)</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
        <Card cat="ingresos" titulo="INGRESOS" valor={totIngresos} color="var(--success, #16c784)" />
        <Card cat="egresos" titulo="EGRESOS" valor={totEgresos} color="var(--danger, #e5484d)" />
        <Card cat="gastos" titulo="GASTOS" valor={totGastos} color="#f59e0b" />
        <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
          <div className="muted" style={{ fontSize: '.68rem' }}>NETO (ingresos − egresos)</div>
          <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: neto < 0 ? 'var(--danger)' : 'var(--success)' }}>{monto(neto, moneda)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '.8rem', marginBottom: '.75rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Ingresos vs Egresos vs Gastos ({moneda})</span></div>
        <BarChart data={data} yFormatter={(v) => monto(v, moneda)} emptyMessage="Sin movimientos en el período."
          onBarClick={(_, i) => {
            const cat: CatResumen = i === 0 ? 'ingresos' : i === 1 ? 'egresos' : 'gastos';
            setCatAbierta(null);
            setDrill((d) => d === cat ? null : cat);
          }} />
      </div>

      <p className="muted" style={{ fontSize: '.74rem', margin: '0 0 .4rem' }}>📊 Tocá una barra o una tarjeta (Ingresos/Egresos/Gastos) para ver sus movimientos. Tocá un movimiento para ver <strong>todo su detalle</strong>.</p>

      {/* Drill de GASTOS: agrupado por categoría, expandible; cada gasto abre su detalle. */}
      {drill === 'gastos' && (
        <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Categoría de gasto</th><th style={{ textAlign: 'right' }}>Gastos</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {!gastosPorCat.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin gastos.</td></tr>}
              {gastosPorCat.map((c) => (
                <Fragment key={c.categoria}>
                  <tr style={{ cursor: 'pointer', background: catAbierta === c.categoria ? 'var(--bg-1)' : undefined, fontWeight: 600 }}
                    onClick={() => setCatAbierta((k) => k === c.categoria ? null : c.categoria)}>
                    <td>{catAbierta === c.categoria ? '▾' : '▸'} {c.categoria}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{c.movs.length}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>−{monto(c.total, moneda)}</td>
                  </tr>
                  {catAbierta === c.categoria && c.movs.map((m) => (
                    <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setMovSel(m)} title="Ver todo el detalle">
                      <td style={{ paddingLeft: '1.6rem' }}>
                        <span className="muted">{dateTime(m.at)}</span>
                        {' · '}{[detalleGasto(m), m.motivo].filter(Boolean).join(' · ') || m.caja?.nombre || '—'} 🔍
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{m.gasto_correlativo != null ? `N° ${m.gasto_correlativo}` : ''}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>−{monto(m.monto, m.moneda)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>Total gastos</td>
              <td className="mono" style={{ textAlign: 'right' }}>{monto(totGastos, moneda)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {/* Drill de INGRESOS / EGRESOS: lista plana; cada fila abre su detalle. */}
      {drill && drill !== 'gastos' && (
        <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Fecha</th><th>Caja</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
            <tbody>
              {!drillMovs.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin movimientos.</td></tr>}
              {drillMovs.map((m) => {
                const concepto = [CAT_LABEL[m.categoria ?? ''], detalleGasto(m), m.beneficiario, m.motivo].filter(Boolean).join(' · ') || '—';
                const eg = esEgreso(m);
                return (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setMovSel(m)} title="Ver todo el detalle">
                    <td>{dateTime(m.at)}</td>
                    <td>{m.caja?.nombre ?? '—'}</td>
                    <td>{concepto} 🔍</td>
                    <td className="mono" style={{ textAlign: 'right', color: eg ? 'var(--danger)' : 'var(--success)' }}>{eg ? '−' : '+'}{monto(m.monto, m.moneda)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>Total {drill}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{monto(sum(drillMovs), moneda)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {movSel && <MovimientoDetalleModal mov={movSel} defaultEmail={defaultEmail} onClose={() => setMovSel(null)} />}
    </Modal>
  );
}

/* ───────── Retenciones listas (vista desde Tesorería: detalle + comprobante + OC + estado pago) ───────── */
function RetencionesTesoreriaModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<RetencionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<RetencionItem | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setItems(await listRetencionesHechas()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las retenciones', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  // En vivo: al pagar una OC (retencion_pagada) o finalizar una retención, se refleja al instante.
  useRealtime(['ordenes'], () => { void cargar(); });

  // Mantiene sincronizado el detalle abierto con la última data (p. ej. pasó a "Pagada").
  const selLive = sel ? (items.find((i) => i.orden.id === sel.orden.id) ?? sel) : null;

  async function descargar(path: string) {
    try { previewArchivo(await urlRetencion(path), path.split('/').pop() || 'comprobante'); }
    catch { toast('No se pudo abrir el comprobante', 'error'); }
  }

  const footer = <button className="btn btn-primary" onClick={onClose}>Cerrar</button>;

  return (
    <Modal title="🧾 Retenciones listas" size="lg" onClose={onClose} footer={footer}>
      <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 .6rem' }}>
        Retenciones <strong>finalizadas</strong> (con sus comprobantes cargados), listas para pagar. Al pagar la OC se marcan como <strong>pagadas</strong> automáticamente y se reflejan acá y en el módulo de Retenciones.
      </p>

      {loading && <EmptyState message="Cargando…" />}
      {!loading && !items.length && <EmptyState message="No hay retenciones finalizadas." />}

      {!loading && items.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 300, overflow: 'auto', marginBottom: selLive ? '.85rem' : 0 }}>
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr><th>OC</th><th>Proveedor</th><th style={{ textAlign: 'right' }}>Total</th><th>Finalizada</th><th style={{ textAlign: 'center' }}>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((it) => {
                const o = it.orden;
                const activo = selLive?.orden.id === o.id;
                return (
                  <tr key={o.id} style={{ cursor: 'pointer', background: activo ? 'var(--bg-1)' : undefined }} onClick={() => setSel(it)}>
                    <td className="mono">{o.oc_codigo ?? o.codigo}</td>
                    <td>{it.proveedorNombre}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(o.total, 'USD')}</td>
                    <td>{o.retencion_finalizada_en ? fmtDate(o.retencion_finalizada_en) : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {o.retencion_pagada
                        ? <span className="badge" style={{ color: 'var(--success)' }}>✓ Pagada</span>
                        : <span className="badge" style={{ color: 'var(--warning)' }}>Por pagar</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setSel(it); }}>🔍 Ver</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selLive && (() => {
        const o = selLive.orden;
        const comprobantes = comprobantesDeOrden(o);
        return (
          <div className="card" style={{ margin: 0 }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Detalle de la retención · OC {o.oc_codigo ?? o.codigo}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.4rem .9rem', fontSize: '.86rem' }}>
              <div><span className="muted">OC:</span> <strong className="mono">{o.oc_codigo ?? o.codigo}</strong></div>
              <div><span className="muted">Proveedor:</span> <strong>{selLive.proveedorNombre}</strong></div>
              <div><span className="muted">Modo retención:</span> {labelRetencionModo(o.retencion_modo)}</div>
              <div><span className="muted">Total OC:</span> <strong className="mono">{monto(o.total, 'USD')}</strong></div>
              <div><span className="muted">Finalizada:</span> {o.retencion_finalizada_en ? dateTime(o.retencion_finalizada_en) : '—'}</div>
              <div><span className="muted">Tesorería:</span> {o.retencion_pagada
                ? <strong style={{ color: 'var(--success)' }}>✓ Pagada{o.retencion_pagada_en ? ` · ${dateTime(o.retencion_pagada_en)}` : ''}</strong>
                : <strong style={{ color: 'var(--warning)' }}>Por pagar</strong>}</div>
            </div>

            {/* Ítems de la OC */}
            <div className="table-wrap" style={{ marginTop: '.55rem' }}>
              <table className="table" style={{ fontSize: '.82rem' }}>
                <thead><tr><th>Material</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th></tr></thead>
                <tbody>
                  {(o.items ?? []).map((it, i) => (
                    <tr key={i}><td>{it.nombre}{it.sku ? <span className="muted"> · {it.sku}</span> : null}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{Number(it.cantidad).toLocaleString('es-VE', { maximumFractionDigits: 2 })}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{monto(it.precio, 'USD')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Comprobantes */}
            <div className="card-title" style={{ margin: '.7rem 0 .35rem' }}>Comprobantes</div>
            {comprobantes.length === 0 && <div className="muted" style={{ fontSize: '.84rem' }}>Sin comprobantes cargados.</div>}
            <div style={{ display: 'grid', gap: '.35rem' }}>
              {comprobantes.map((c) => (
                <div key={c.tipo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', fontSize: '.85rem' }}>
                  <span><span className="badge">{c.label}</span> <span className="muted">{c.nombre}</span></span>
                  <button className="btn btn-sm btn-ghost" onClick={() => descargar(c.path)}>📎 Descargar</button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}

const labelCuentaConv = (c: CuentaCaja | string) => c === 'general' ? 'General' : c === 'juridica' ? 'Jurídica' : c === 'personal' ? 'Personal' : String(c);

function ConversorModal({ cajas, actor, actorName, onClose, onConverted }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onConverted: () => void | Promise<void>;
}) {
  const [de, setDe] = useState<MonedaCaja>('USD');
  const [a, setA] = useState<MonedaCaja>('Bs');
  const [origenSaldoId, setOrigenSaldoId] = useState('');     // saldo existente del que sale el dinero
  const [destinoCajaId, setDestinoCajaId] = useState('');
  const [destinoCuenta, setDestinoCuenta] = useState<CuentaCaja>('general');
  const [montoStr, setMontoStr] = useState('');
  const [tasaStr, setTasaStr] = useState('');
  const [comisionStr, setComisionStr] = useState('');   // % de comisión/descuento sobre el convertido
  const [netoOverride, setNetoOverride] = useState<number | null>(null); // neto redondeado escrito a mano
  const [redondearOpen, setRedondearOpen] = useState(false);            // modal «Ingrese monto redondeado»
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Con quién se hace el intercambio (cliente o proveedor), igual que en CxC/CxP.
  const [cpTipo, setCpTipo] = useState<'cliente' | 'proveedor' | ''>('');
  const [cpNombre, setCpNombre] = useState('');
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([]);

  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);
  useEffect(() => { listContrapartes().then(setContrapartes).catch(() => setContrapartes([])); }, []);
  useEffect(() => { listSaldos().then(setSaldos).catch(() => setSaldos([])); }, []);

  // Saldos disponibles en la moneda DE (de cualquier caja/cuenta, con saldo > 0).
  const saldosOrigen = useMemo(
    () => saldos.filter((s) => s.moneda === de && (Number(s.saldo) || 0) > 0),
    [saldos, de],
  );
  const nombreCaja = useCallback((id: string) => cajas.find((c) => c.id === id)?.nombre ?? '—', [cajas]);

  // Al cambiar la moneda DE, elige el primer saldo disponible.
  useEffect(() => {
    setOrigenSaldoId((prev) => saldosOrigen.some((s) => s.id === prev) ? prev : (saldosOrigen[0]?.id ?? ''));
  }, [saldosOrigen]);

  // Cuentas/billeteras existentes en la caja destino (las que ya tienen saldo) + «General».
  const cuentasDestino = useMemo(() => {
    const set = new Set<string>(['general']);
    saldos.filter((s) => s.caja_id === destinoCajaId).forEach((s) => set.add(s.cuenta));
    return Array.from(set);
  }, [saldos, destinoCajaId]);
  // Si la cuenta elegida ya no es válida para la caja, volver a «General».
  useEffect(() => {
    if (!cuentasDestino.includes(destinoCuenta)) setDestinoCuenta((cuentasDestino[0] ?? 'general') as CuentaCaja);
  }, [cuentasDestino, destinoCuenta]);

  // Sugerencia de tasa al cambiar las monedas o cargar el mercado (editable).
  useEffect(() => {
    if (!mercado || de === a) { if (de === a) setTasaStr('1'); return; }
    const sug = tasaCruzada(de, a, mercado);
    if (sug != null) setTasaStr(String(sug));
  }, [de, a, mercado]);

  const origenSaldo = saldosOrigen.find((s) => s.id === origenSaldoId) ?? null;
  const disponible = Number(origenSaldo?.saldo) || 0;
  const montoNum = Number(montoStr) || 0;
  // Tasa con toda la precisión escrita: la conversión real usa este mismo valor, así
  // la vista previa coincide al céntimo con lo que se acredita.
  const tasaNum = Number(tasaStr) || 0;
  const comisionPctInput = Math.max(0, Math.min(100, Number(comisionStr) || 0));
  const bruto = round2(montoNum * tasaNum);
  // Neto redondeado a mano: tiene prioridad mientras sea válido (≤ bruto). Si no, manda el %.
  const netoManual = netoOverride != null && netoOverride > 0 && netoOverride <= bruto ? round2(netoOverride) : null;
  const resultado = netoManual != null ? netoManual : round2(bruto - round2(bruto * comisionPctInput / 100)); // neto que recibe el destino
  const comisionMonto = round2(bruto - resultado);
  const comisionPct = bruto > 0 ? round2(comisionMonto / bruto * 100) : 0;
  const excede = montoNum > disponible + 0.001;
  const puede = !!origenSaldo && !!destinoCajaId && de !== a && montoNum > 0 && tasaNum > 0 && !excede && !saving;

  function swap() { setDe(a); setA(de); }
  function usarMercado() {
    if (!mercado) return;
    const sug = de === a ? 1 : tasaCruzada(de, a, mercado);
    if (sug != null) setTasaStr(String(sug));
  }
  // «Redondear»: el usuario escribe a mano el neto redondeado que debe recibir el destino.
  function aplicarRedondeo(montoRedondeado: number) {
    setNetoOverride(montoRedondeado > 0 ? round2(montoRedondeado) : null);
    setComisionStr('');
    setRedondearOpen(false);
  }
  function limpiarComision() { setNetoOverride(null); setComisionStr(''); }

  async function convertir() {
    if (!origenSaldo) { setErr('Elegí de qué saldo sale el dinero.'); return; }
    if (!destinoCajaId) { setErr('Elegí la caja destino.'); return; }
    if (de === a) { setErr('Las monedas de origen y destino deben ser distintas.'); return; }
    if (excede) { setErr(`No hay saldo suficiente. Disponible: ${monto(disponible, de)}.`); return; }
    setErr(null); setSaving(true);
    try {
      // Con quién se hizo el intercambio (cliente/proveedor): queda en el motivo y se
      // guarda en el directorio para reutilizarlo (igual que en CxC/CxP).
      const quien = cpTipo && cpNombre.trim()
        ? `${cpTipo === 'proveedor' ? 'Proveedor' : 'Cliente'}: ${cpNombre.trim()}`
        : null;
      const partes = [
        `Conversión ${monto(montoNum, de)} → ${monto(resultado, a)}`,
        comisionPct > 0 ? `comisión ${comisionPct}% = ${monto(comisionMonto, a)} (bruto ${monto(bruto, a)})` : null,
        quien,
      ].filter(Boolean);
      const motivo = (comisionPct > 0 || quien) ? partes.join(' · ') : undefined;
      await convertirDivisa({
        origenCajaId: origenSaldo.caja_id, origenCuenta: origenSaldo.cuenta, monedaDe: de,
        destinoCajaId, destinoCuenta, monedaA: a,
        montoDe: montoNum, tasa: tasaNum, comisionPct, montoANeto: netoManual, motivo,
        actor, actorName,
      });
      if (cpTipo && cpNombre.trim()) {
        const ya = contrapartes.some((c) => c.tipo === cpTipo && c.nombre.trim().toUpperCase() === cpNombre.trim().toUpperCase());
        if (!ya) { try { await crearContraparte({ tipo: cpTipo, nombre: cpNombre.trim() }); } catch { /* duplicado u otro: no bloquea */ } }
      }
      notify(`Convertido: ${monto(montoNum, de)} → ${monto(resultado, a)}${quien ? ` · ${quien}` : ''}`, 'success', { link: '#/app/tesoreria' });
      await onConverted();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo convertir.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Conversor multimoneda" size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => void convertir()} disabled={!puede}>
          {saving ? 'Convirtiendo…' : '💱 Convertir'}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Convierte un <strong>saldo existente</strong> de una moneda a otra: descuenta de la caja
        origen y acredita el equivalente en la caja destino. La tasa sugerida toma el dólar
        de <strong>Binance (USDT/VES)</strong> y la TRM del COP (la <strong>BCV</strong> queda en la barra superior); es editable y se redondea a 2 decimales.
      </p>

      <div className="form-grid">
        <div className="form-row">
          <label>De (moneda)</label>
          <select className="select" value={de} onChange={(e) => setDe(e.target.value as MonedaCaja)}>
            {MONEDAS_CONV.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ alignSelf: 'end' }}>
          <button type="button" className="btn btn-ghost" onClick={swap} title="Invertir">⇄ Invertir</button>
        </div>
        <div className="form-row">
          <label>A (moneda)</label>
          <select className="select" value={a} onChange={(e) => setA(e.target.value as MonedaCaja)}>
            {MONEDAS_CONV.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Origen: de qué saldo sale el dinero (caja + cuenta + moneda DE). */}
      <div className="form-row">
        <label>Sale de (saldo en {de})</label>
        {saldosOrigen.length === 0 ? (
          <div className="muted" style={{ fontSize: '.82rem', padding: '.4rem 0' }}>
            No hay ninguna caja con saldo en {de}.
          </div>
        ) : (
          <select className="select" value={origenSaldoId} onChange={(e) => setOrigenSaldoId(e.target.value)}>
            {saldosOrigen.map((s) => (
              <option key={s.id} value={s.id}>
                {nombreCaja(s.caja_id)}{s.cuenta !== 'general' ? ` · ${labelCuentaConv(s.cuenta)}` : ''} — {monto(s.saldo, s.moneda)}
              </option>
            ))}
          </select>
        )}
        {origenSaldo && <div className="muted" style={{ fontSize: '.74rem', marginTop: '.2rem' }}>Disponible: <strong className="mono">{monto(disponible, de)}</strong></div>}
      </div>

      {/* Destino: a qué caja entra el convertido (caja + cuenta), moneda A. */}
      <div className="form-grid">
        <div className="form-row">
          <label>Entra en (caja destino)</label>
          <select className="select" value={destinoCajaId} onChange={(e) => setDestinoCajaId(e.target.value)}>
            <option value="">— Elegí caja —</option>
            {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>Cuenta / billetera destino</label>
          <select className="select" value={destinoCuenta} onChange={(e) => setDestinoCuenta(e.target.value as CuentaCaja)} disabled={!destinoCajaId}>
            {cuentasDestino.map((c) => <option key={c} value={c}>{labelCuentaConv(c)}</option>)}
          </select>
          {destinoCajaId && (
            <small className="muted">
              {cuentasDestino.length > 1
                ? <>Entra a <strong>{nombreCaja(destinoCajaId)}</strong> · billetera <strong>{labelCuentaConv(destinoCuenta)}</strong>.</>
                : <>Esta caja no tiene billeteras: entra directo a <strong>General</strong>.</>}
            </small>
          )}
        </div>
      </div>

      {/* Con quién se hace el intercambio: cliente o proveedor (como en CxC/CxP). */}
      <div className="form-row">
        <label>¿Con quién? (cliente o proveedor)</label>
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.4rem' }}>
          {(['cliente', 'proveedor'] as const).map((t) => {
            const sel = cpTipo === t;
            return (
              <label key={t} style={{
                display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer',
                padding: '.4rem .7rem', borderRadius: 'var(--r-md)',
                border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                background: sel ? 'rgba(255,138,0,0.10)' : 'transparent', flex: 1, justifyContent: 'center',
              }}>
                <input type="radio" name="conv-cp-tipo" checked={sel} onChange={() => { setCpTipo(t); setCpNombre(''); }} />
                <span style={{ fontWeight: 600 }}>{t === 'cliente' ? '👤 Cliente' : '🏭 Proveedor'}</span>
              </label>
            );
          })}
          {cpTipo && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setCpTipo(''); setCpNombre(''); }} title="Quitar">✕</button>}
        </div>
        {cpTipo && (() => {
          const guardados = contrapartes.filter((c) => c.tipo === cpTipo);
          const existe = guardados.some((c) => c.nombre.trim().toUpperCase() === cpNombre.trim().toUpperCase());
          return (
            <>
              <input className="input" list="conv-contrapartes" value={cpNombre} onChange={(e) => setCpNombre(e.target.value)}
                placeholder={cpTipo === 'proveedor' ? 'Buscar o agregar razón social del proveedor…' : 'Buscar o agregar nombre del cliente…'} autoFocus />
              <datalist id="conv-contrapartes">
                {guardados.map((c) => <option key={c.id} value={c.nombre} />)}
              </datalist>
              <small className="muted">
                Buscá en los {guardados.length} {cpTipo === 'proveedor' ? 'proveedor(es)' : 'cliente(s)'} guardados o escribí uno nuevo.{' '}
                {cpNombre.trim() && !existe
                  ? <strong style={{ color: 'var(--primary-3, #ff8a00)' }}>Nuevo → se guardará para próximas operaciones.</strong>
                  : 'Queda registrado en el motivo del movimiento.'}
              </small>
            </>
          );
        })()}
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Monto en {de}</label>
          <input className="input mono" type="number" min={0} step="any" value={montoStr}
            onChange={(e) => setMontoStr(dosDecimales(e.target.value))} placeholder="0,00" autoFocus
            style={excede ? { borderColor: 'var(--danger)' } : undefined} />
          {origenSaldo && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.3rem' }}
              onClick={() => setMontoStr(String(disponible))}>Usar todo ({monto(disponible, de)})</button>
          )}
        </div>
        <div className="form-row">
          <label>Tasa · 1 {de} = ? {a}</label>
          <input className="input mono" type="number" min={0} step="any" value={tasaStr}
            onChange={(e) => setTasaStr(e.target.value)} placeholder={mercado ? '0,00' : 'cargando…'} />
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.3rem' }} onClick={usarMercado}>↺ Tasa de mercado</button>
        </div>
        <div className="form-row">
          <label>Comisión / descuento (%)</label>
          <input className="input mono" type="number" min={0} max={100} step="any"
            value={netoManual != null ? '' : comisionStr}
            onChange={(e) => { setNetoOverride(null); setComisionStr(e.target.value); }}
            placeholder={netoManual != null ? `≈ ${comisionPct}% (redondeado)` : '0'} />
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.3rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRedondearOpen(true)} disabled={bruto <= 0}
              title="Escribí a mano el monto redondeado que debe recibir el destino (ej. 60)">⊕ Redondear</button>
            {(comisionStr || netoManual != null) && <button type="button" className="btn btn-sm btn-ghost" onClick={limpiarComision}>✕ Sin comisión</button>}
          </div>
          <small className="muted">
            {netoManual != null
              ? <>El destino recibe el monto redondeado <strong>{monto(netoManual, a)}</strong> (comisión {monto(comisionMonto, a)}).</>
              : <>Opcional. Se le descuenta al convertido; el destino recibe el neto. «Redondear» te deja escribir el monto redondeado a recibir.</>}
          </small>
        </div>
      </div>

      <div className="card" style={{ marginTop: '.5rem', textAlign: 'center', borderColor: 'var(--brand, #ff8a00)' }}>
        <div className="muted" style={{ fontSize: '.74rem' }}>{comisionMonto > 0 ? (netoManual != null ? 'Recibe (redondeado) en ' : 'Recibe (neto) en ') : 'Equivalente en '}{a}</div>
        <strong className="mono" style={{ fontSize: '1.6rem', color: 'var(--text, #fff)' }}>{monto(resultado, a)}</strong>
        {tasaNum > 0 && montoNum > 0 && (
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
            {monto(montoNum, de)} × {tasaNum.toLocaleString('es-VE')} = {monto(bruto, a)}
            {comisionMonto > 0 && <> · − comisión {comisionPct}% ({monto(comisionMonto, a)}) = <strong>{monto(resultado, a)}</strong></>}
          </div>
        )}
      </div>

      {redondearOpen && (
        <RedondearNetoModal
          moneda={a}
          bruto={bruto}
          sugerido={Math.round(resultado / 10) * 10}
          onAceptar={aplicarRedondeo}
          onClose={() => setRedondearOpen(false)}
        />
      )}

      {excede && <div className="muted" style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: '.4rem' }}>El monto supera el saldo disponible.</div>}
      {err && <div className="muted" style={{ color: 'var(--danger)', fontSize: '.82rem', marginTop: '.4rem' }}>{err}</div>}
    </Modal>
  );
}

/** Modal chico: el usuario escribe el monto redondeado que debe recibir el destino. */
function RedondearNetoModal({ moneda, bruto, sugerido, onAceptar, onClose }: {
  moneda: string; bruto: number; sugerido: number; onAceptar: (m: number) => void; onClose: () => void;
}) {
  const [valStr, setValStr] = useState(sugerido > 0 && sugerido <= bruto ? String(sugerido) : '');
  const val = Number(valStr) || 0;
  const excede = val > bruto + 0.001;
  const puede = val > 0 && !excede;
  return (
    <Modal title="Monto redondeado" size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!puede} onClick={() => onAceptar(val)}>Aplicar</button>
      </>
    }>
      <div className="form-row">
        <label>Ingrese el monto redondeado que recibe el destino ({moneda})</label>
        <input className="input mono" type="number" min={0} step="any" autoFocus value={valStr}
          onChange={(e) => setValStr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && puede) onAceptar(val); }}
          placeholder={sugerido > 0 ? String(sugerido) : '0'} />
        <small className="muted">
          Convertido (bruto): <strong>{monto(bruto, moneda)}</strong>.
          {val > 0 && !excede && <> La comisión será <strong>{monto(round2(bruto - val), moneda)}</strong>.</>}
        </small>
        {excede && <small className="muted" style={{ color: 'var(--danger)' }}>No puede superar el convertido ({monto(bruto, moneda)}).</small>}
      </div>
    </Modal>
  );
}

/* ───────────── Calculadora (con historial + export PDF) ───────────── */

/** Evalúa una expresión aritmética simple (+ − × ÷, paréntesis, decimales) sin eval. */
function evalExpr(expr: string): number {
  const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
  if (!/^[0-9.+\-*/()]+$/.test(s)) throw new Error('Expresión inválida');
  const out: number[] = []; const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const apply = () => {
    const op = ops.pop()!; const b = out.pop()!; const a = out.pop()!;
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
  };
  const toks = s.match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g) ?? [];
  let prev: string | null = null;
  for (const t of toks) {
    if (/^[\d.]/.test(t)) { out.push(parseFloat(t)); }
    else if (t === '(') { ops.push(t); }
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') apply(); ops.pop(); }
    else {
      // Signo unario (ej. "-5" o "(-3)").
      if ((t === '-' || t === '+') && (prev === null || prev === '(' || prev in prec)) { out.push(0); }
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[t]) apply();
      ops.push(t);
    }
    prev = t;
  }
  while (ops.length) apply();
  const r = out.pop();
  if (r == null || !Number.isFinite(r)) throw new Error('Resultado inválido');
  return Math.round(r * 1e6) / 1e6;
}

function CalculadoraModal({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState('');
  const [resultado, setResultado] = useState<string>('');
  const [historial, setHistorial] = useState<{ expr: string; res: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Conversor $ → Bs: compara BCV vs Binance y muestra el margen de ahorro.
  const [mercadoCalc, setMercadoCalc] = useState<TasasMercado | null>(null);
  const [montoUsd, setMontoUsd] = useState('');
  useEffect(() => { getTasasMercado().then(setMercadoCalc).catch(() => setMercadoCalc(null)); }, []);
  const bcvCalc = mercadoCalc?.bcvUsd ?? null;
  const binCalc = mercadoCalc?.usdtVes ?? null;
  const montoUsdNum = Number(montoUsd.replace(',', '.')) || 0;
  const aBcv = bcvCalc != null ? montoUsdNum * bcvCalc : null;
  const aBin = binCalc != null ? montoUsdNum * binCalc : null;
  const difBs = aBcv != null && aBin != null ? aBin - aBcv : null;       // Bs de más a Binance
  const margenPct = bcvCalc != null && binCalc != null && binCalc > 0 ? ((binCalc - bcvCalc) / binCalc) * 100 : null;

  const fmt = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 6 });
  const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function push(s: string) { setError(null); setExpr((e) => e + s); }
  function limpiar() { setExpr(''); setResultado(''); setError(null); }
  function borrar() { setExpr((e) => e.slice(0, -1)); }
  function calcular() {
    if (!expr.trim()) return;
    try {
      const r = evalExpr(expr);
      const res = fmt(r);
      setResultado(res);
      setHistorial((h) => [{ expr, res }, ...h].slice(0, 50));
      setExpr(res.replace(/\./g, '').replace(/,/g, '.'));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  async function exportarPdf() {
    if (!historial.length) { toast('No hay operaciones para exportar', 'error'); return; }
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const MARGIN = 42.52; // 1.5 cm
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('CALCULADORA · OPERACIONES', MARGIN, MARGIN + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`Generado: ${dateTime(new Date().toISOString())}`, MARGIN, MARGIN + 24);
      autoTable(doc, {
        startY: MARGIN + 40,
        head: [['#', 'Operación', 'Resultado']],
        body: historial.map((h, i) => [String(historial.length - i), h.expr, h.res]),
        margin: MARGIN,
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 40 }, 2: { halign: 'right' } },
      });
      previewPdf(doc, 'calculadora-operaciones.pdf');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }

  const teclas = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '(', ')'];

  return (
    <Modal title="🧮 Calculadora" size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={exportarPdf} disabled={!historial.length}>↓ PDF</button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>
    }>
      <div className="card" style={{ padding: '.6rem .8rem', marginBottom: '.6rem' }}>
        <input className="input mono" value={expr} onChange={(e) => { setError(null); setExpr(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') calcular(); }} placeholder="0" style={{ textAlign: 'right', fontSize: '1.1rem' }} autoFocus />
        <div className="mono" style={{ textAlign: 'right', fontSize: '1.7rem', fontWeight: 800, marginTop: '.3rem', minHeight: '2rem' }}>
          {error ? <span style={{ color: 'var(--danger)', fontSize: '1rem' }}>{error}</span> : (resultado || '0')}
        </div>
      </div>

      {/* Conversor $ → Bs: BCV vs Binance + margen de ahorro */}
      <div className="card" style={{ padding: '.7rem .8rem', marginBottom: '.6rem', borderColor: 'var(--brand, #ff8a00)' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}><span>💵 Convertir $ a Bs (BCV vs Binance)</span></div>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.74rem' }}>Monto en USD</label>
          <input className="input mono" inputMode="decimal" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)} placeholder="ej. 9,5" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '.5rem' }}>
          <div className="card" style={{ padding: '.5rem .6rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--brand, #ff8a00)', fontWeight: 800, fontSize: '.78rem' }}>BCV</div>
            <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800 }}>{aBcv != null ? `Bs ${fmtBs(aBcv)}` : '—'}</div>
            <div className="muted" style={{ fontSize: '.68rem' }}>tasa {bcvCalc != null ? fmtBs(bcvCalc) : '—'}</div>
          </div>
          <div className="card" style={{ padding: '.5rem .6rem', textAlign: 'center' }}>
            <div style={{ color: '#f3ba2f', fontWeight: 800, fontSize: '.78rem' }}>BINANCE</div>
            <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800 }}>{aBin != null ? `Bs ${fmtBs(aBin)}` : '—'}</div>
            <div className="muted" style={{ fontSize: '.68rem' }}>tasa {binCalc != null ? fmtBs(binCalc) : '—'}</div>
          </div>
        </div>
        {difBs != null && margenPct != null && montoUsdNum > 0 && (
          <div style={{ marginTop: '.5rem', textAlign: 'center', fontSize: '.85rem' }}>
            <span className="muted">Margen de ahorro pagando a BCV: </span>
            <strong className="mono" style={{ color: '#16c784' }}>Bs {fmtBs(Math.abs(difBs))} · {Math.abs(margenPct).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.4rem' }}>
        <button className="btn btn-ghost" onClick={limpiar}>C</button>
        <button className="btn btn-ghost" onClick={borrar}>⌫</button>
        <button className="btn btn-ghost" onClick={() => push('+')}>+</button>
        <button className="btn btn-ghost" onClick={() => push('/')}>÷</button>
        {teclas.map((t) => (
          <button key={t} className="btn btn-ghost" onClick={() => push(t === '÷' ? '/' : t === '×' ? '*' : t)}>{t}</button>
        ))}
        <button className="btn btn-primary" style={{ gridColumn: 'span 4' }} onClick={calcular}>=</button>
      </div>

      {historial.length > 0 && (
        <div style={{ marginTop: '.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '.84rem' }}>Historial de operaciones</strong>
            <button className="btn btn-sm btn-ghost" onClick={() => setHistorial([])}>Limpiar</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 180, overflow: 'auto', marginTop: '.3rem' }}>
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead><tr><th>Operación</th><th style={{ textAlign: 'right' }}>Resultado</th></tr></thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setExpr(h.res.replace(/\./g, '').replace(/,/g, '.'))} title="Usar este resultado">
                    <td className="mono">{h.expr}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{h.res}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ───────────── Cajas multimoneda (saldos + lotes + promedio) ───────────── */

const MONEDAS_CAJA: MonedaCaja[] = ['Bs', 'USD', 'USDT', 'COP'];


/* ───────────── Tasas Binance (3 tasas del P2P, en barras) ───────────── */

function GraficoTasasModal({ onClose }: { onClose: () => void }) {
  const [tasas, setTasas] = useState<Binance3 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setTasas(await getBinance3()); }
    catch { setTasas(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function actualizarAhora() {
    setRefrescando(true);
    try {
      setTasas(await refrescarBinanceP2P());
      notify('Tasas Binance actualizadas', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo actualizar (¿Edge Function desplegada?)', 'error'); }
    finally { setRefrescando(false); }
  }

  const fmtTasa = (v: number | null | undefined) => v != null ? Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const bars: ChartPoint[] = tasas ? [
    { label: 'Compra', value: Number(tasas.buy) || 0, tooltip: `Compra: ${fmtTasa(tasas.buy)} Bs` },
    { label: 'Promedio', value: Number(tasas.promedio) || 0, tooltip: `Promedio: ${fmtTasa(tasas.promedio)} Bs` },
    { label: 'Venta', value: Number(tasas.sell) || 0, tooltip: `Venta: ${fmtTasa(tasas.sell)} Bs` },
  ] : [];

  return (
    <Modal title="Tasas Binance" size="xl" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <strong>USDT / VES · P2P Binance</strong>
        <button className="btn btn-sm btn-primary" onClick={actualizarAhora} disabled={refrescando}>{refrescando ? 'Actualizando…' : '↻ Actualizar ahora'}</button>
        <span className="muted" style={{ fontSize: '.78rem' }}>3 tasas de referencia del mercado P2P (Bs por 1 USDT).</span>
      </div>

      {/* Tarjetas de las 3 tasas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.8rem' }}>
        {[
          { t: 'Compra', v: tasas?.buy, c: '#22c55e', n: 'Lo que cobran al venderte USDT' },
          { t: 'Promedio', v: tasas?.promedio, c: '#f3ba2f', n: 'Punto medio (referencia)' },
          { t: 'Venta', v: tasas?.sell, c: '#ef4444', n: 'Lo que pagan por tu USDT' },
        ].map((x) => (
          <div key={x.t} className="card" style={{ borderColor: x.c, textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: '.74rem' }}>{x.t}</div>
            <strong className="mono" style={{ fontSize: '1.4rem', color: x.c }}>{fmtTasa(x.v)}</strong>
            <div className="muted" style={{ fontSize: '.66rem', marginTop: '.15rem' }}>{x.n}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="muted" style={{ padding: '1rem' }}>Cargando…</div>
      ) : (
        <BarChart data={bars} color="#f3ba2f" height={240}
          yFormatter={(v) => v.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
          emptyMessage="Aún no hay tasas capturadas. Usá ↻ Actualizar ahora." />
      )}
      {tasas?.at && <div className="muted" style={{ fontSize: '.72rem', marginTop: '.4rem', textAlign: 'right' }}>Última captura: {dateTime(tasas.at)}</div>}
    </Modal>
  );
}

/* ───────────── Órdenes pendientes por pagar (OC confirmadas) ───────────── */

function OrdenesPorPagarModal({ cajas, actor, actorName, onClose, onPaid }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const [rows, setRows] = useState<OrdenPorPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<OrdenPorPagar | null>(null);
  // Selección múltiple (tipo check) para pagar varias OC del MISMO proveedor a la vez.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagarVarias, setPagarVarias] = useState<OrdenPorPagar[] | null>(null);

  const { user } = useSession();
  const [noLeidos, setNoLeidos] = useState<Map<string, number>>(new Map());

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRows(await listOrdenesPorPagar()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  // Chat interno: mensajes no leídos por OC (chip 💬) para Tesorería. En vivo.
  const recalcNoLeidos = useCallback(() => {
    if (!user?.id || !user?.email || !rows.length) { setNoLeidos(new Map()); return; }
    noLeidosPorOrden(rows.map((r) => r.orden.id), user.id, user.email).then(setNoLeidos).catch(() => setNoLeidos(new Map()));
  }, [rows, user?.id, user?.email]);
  useEffect(() => { recalcNoLeidos(); }, [recalcNoLeidos]);
  useRealtime(['orden_mensajes'], () => { recalcNoLeidos(); });

  // Filas seleccionadas, proveedor "bloqueado" (el de la primera marcada) y total.
  const seleccionadas = useMemo(() => rows.filter((r) => seleccion.has(r.orden.id)), [rows, seleccion]);
  const provSel = seleccionadas[0]?.orden.proveedor_id ?? null;
  const provNombreSel = seleccionadas[0]?.proveedorNombre ?? '';
  const totalSel = round2(seleccionadas.reduce((a, r) => a + Number(r.montoAPagar || 0), 0));
  function toggleSel(r: OrdenPorPagar) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(r.orden.id)) n.delete(r.orden.id); else n.add(r.orden.id);
      return n;
    });
  }
  // Se puede marcar cualquier OC (incluso "esperando método") siempre que sea del MISMO
  // proveedor que la primera marcada. Al pagar varias del mismo proveedor, las que aún no
  // tenían método de pago se pagan igual (no hace falta esperar a Compras).
  const checkDisabled = (r: OrdenPorPagar) => provSel != null && r.orden.proveedor_id !== provSel;

  return (
    <Modal title="Órdenes pendientes por pagar" size="xl" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" disabled={!rows.length}
          onClick={() => descargarOrdenesPorPagarPdf(rows).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}
          title="Resumen en PDF de las OC por pagar (N°ODC, proveedor, finalidad y monto)">↓ Resumen PDF</button>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Órdenes de compra aprobadas por el Gerente. Hacé clic en una fila (o en <strong>Ver</strong>) para ver el detalle de la
        compra y registrar el pago, o <strong>marcá varias del mismo proveedor</strong> (✓) para <strong>pagarlas juntas</strong>
        (un egreso por OC). Se pueden incluir las que están <strong>⏳ Esperando método de pago</strong>: Tesorería las paga
        directo eligiendo la caja, aunque el analista todavía no haya indicado el método.
      </p>
      {seleccionadas.length > 0 && (
        <div className="card" style={{ marginBottom: '.6rem', padding: '.55rem .85rem', borderColor: 'var(--brand, #ff8a00)', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <strong>{seleccionadas.length}</strong> OC de <strong>{provNombreSel}</strong> · total <strong className="mono">{monto(totalSel, 'USD')}</strong>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setSeleccion(new Set())}>Limpiar</button>
            <button className="btn btn-sm btn-primary" onClick={() => setPagarVarias(seleccionadas)}>💳 Pagar {seleccionadas.length} seleccionadas</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr>
            <th style={{ width: 34 }}></th>
            <th>N°ODC</th><th>OP</th><th>Proveedor</th><th>Condición</th>
            <th style={{ textAlign: 'right' }}>A pagar $</th><th>OC creada</th><th>Confirmada GG</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={9}><EmptyState message="No hay órdenes aprobadas por pagar" icon="✅" /></td></tr>}
            {!loading && rows.map((r) => {
              const espera = r.esperandoMetodo;
              return (
              <tr key={r.orden.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setSel(r)}>
                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={seleccion.has(r.orden.id)} disabled={checkDisabled(r)}
                    title={checkDisabled(r) ? `Solo se pueden pagar juntas las OC de ${provNombreSel}` : 'Seleccionar para pago múltiple (mismo proveedor)'}
                    onChange={() => toggleSel(r)} />
                </td>
                <td className="mono">{r.orden.oc_codigo ?? '—'}
                  {r.orden.tipo === 'servicio' && (
                    <span className="badge" style={{ marginLeft: '.35rem', background: '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: '.62rem', padding: '.05rem .35rem' }}
                      title="Control de Servicio (no es compra de producto)">🔧 Servicio</span>
                  )}
                  {(noLeidos.get(r.orden.id) ?? 0) > 0 && (
                    <span className="badge" style={{ marginLeft: '.35rem', background: '#ff8a00', color: '#111', fontWeight: 700 }}
                      title="Mensajes sin leer en el chat de esta OC">💬 {noLeidos.get(r.orden.id)}</span>
                  )}
                  {r.orden.iva_aplicado && (
                    <span className="badge" style={{ marginLeft: '.35rem', background: '#6d28d9', color: '#fff', fontWeight: 700, fontSize: '.62rem', padding: '.05rem .35rem' }}
                      title={`Incluye IVA (${Number(r.orden.iva_pct ?? 16).toLocaleString('es-VE', { maximumFractionDigits: 2 })}%): ${monto(Number(r.orden.iva_monto ?? 0), r.orden.total_moneda ?? 'USD')}`}>IVA</span>
                  )}
                  {r.orden.igtf_aplicado && (
                    <span className="badge" style={{ marginLeft: '.35rem', background: '#b45309', color: '#fff', fontWeight: 700, fontSize: '.62rem', padding: '.05rem .35rem' }}
                      title={`Incluye IGTF (${Number(r.orden.igtf_pct ?? 3).toLocaleString('es-VE', { maximumFractionDigits: 2 })}%): ${monto(Number(r.orden.igtf_monto ?? 0), r.orden.total_moneda ?? 'USD')}`}>IGTF</span>
                  )}
                </td>
                <td className="mono">{r.orden.codigo}</td>
                <td>{r.proveedorNombre}</td>
                <td style={{ fontSize: '.78rem' }}>
                  {labelCondicionPago(r.orden.condiciones_pago)}
                  {espera && (
                    <div style={{ marginTop: '.25rem' }}>
                      <span className="badge warning" title="Aprobada por el Gerente. Compras aún no indicó el método de pago; Tesorería igual puede pagarla eligiendo la caja.">⏳ Esperando método de pago</span>
                    </div>
                  )}
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  {monto(r.montoAPagar, r.orden.total_moneda ?? 'USD')}
                  {r.esContraEntrega && r.montoAPagar < Number(r.orden.total) && (
                    <div className="muted" style={{ fontSize: '.68rem' }}>de {monto(r.orden.total, r.orden.total_moneda ?? 'USD')}</div>
                  )}
                </td>
                <td className="muted">{r.orden.oc_creada_en ? fmtDate(r.orden.oc_creada_en) : '—'}</td>
                <td className="muted">{r.orden.oc_aprobada_en ? fmtDate(r.orden.oc_aprobada_en) : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSel(r); }}>
                    {espera ? 'Ver' : 'Ver / Pagar'}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel && (
        <PagarOrdenModal
          row={sel} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => { setSel(null); recalcNoLeidos(); }}
          onPaid={async () => { setSel(null); await reload(); onPaid(); }}
        />
      )}

      {pagarVarias && (
        <PagarVariasOcModal
          rows={pagarVarias} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagarVarias(null)}
          onPaid={async () => { setPagarVarias(null); setSeleccion(new Set()); await reload(); onPaid(); }}
        />
      )}

      {/* Compras directas montadas por el analista, pendientes de pago por Tesorería. */}
      <DirectosPorPagarPanel
        cajas={cajas} actor={actor} actorName={actorName}
        onPaid={async () => { await reload(); onPaid(); }}
      />
    </Modal>
  );
}

/* ───────────── Pagar VARIAS OC del mismo proveedor (pago por lote) ───────────── */

function PagarVariasOcModal({ rows, cajas, actor, actorName, onClose, onPaid }: {
  rows: OrdenPorPagar[]; cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [factura, setFactura] = useState<File | null>(null);
  const [motivoPago, setMotivoPago] = useState('');
  const [gastoCat, setGastoCat] = useState('');
  const [gastoSub, setGastoSub] = useState('');
  const [saving, setSaving] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // OC cuyo detalle está desplegado (clic sobre la fila).
  const [detalle, setDetalle] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';
  const provNombre = rows[0]?.proveedorNombre ?? '';
  const finalidadDe = (o: Orden): string =>
    o.finalidad?.trim()
    || Array.from(new Set((o.items ?? []).map((it) => (it.finalidad ?? '').trim()).filter(Boolean))).join(' · ')
    || '—';

  // El comprobante solo es obligatorio si alguna OC NO es en efectivo.
  const comprobanteOpcional = rows.every((r) => pagoSinComprobante(r.orden.metodo_pago));

  const [tasa, setTasa] = useState<number>(0);
  useEffect(() => { getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* sin tasa */ }); }, []);
  // Monto a pagar en USD-equivalente: las OC cuyo total está en Bs se convierten con la
  // tasa BCV para que el motor (USD) sume y valide bien. Las USD quedan igual.
  const usdDe = (r: OrdenPorPagar) => (r.orden.total_moneda === 'Bs' && tasa > 0)
    ? round2(Number(r.montoAPagar || 0) / tasa)
    : Number(r.montoAPagar || 0);
  const totalUsd = round2(rows.reduce((a, r) => a + usdDe(r), 0));
  const totalEnMoneda = moneda === 'Bs' ? (tasa > 0 ? aBs(totalUsd, tasa) : 0) : totalUsd;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja con la que se paga.'); return; }
    if (moneda === 'Bs' && !(tasa > 0)) { setError('Indicá la tasa BCV (Bs por $) para convertir el pago.'); return; }
    if (!comprobanteOpcional && !factura) { setError('Adjuntá el comprobante (PDF o imagen).'); return; }
    if (factura && factura.type && factura.type !== 'application/pdf' && !factura.type.startsWith('image/')) {
      setError('El comprobante debe ser un PDF o una imagen.'); return;
    }
    setSaving(true);
    try {
      let pagadas = 0;
      for (const r of rows) {
        setProgreso(`Pagando ${r.orden.oc_codigo ?? r.orden.codigo}… (${pagadas + 1}/${rows.length})`);
        const usd = usdDe(r);
        const montoOc = moneda === 'Bs' ? aBs(usd, tasa) : usd;
        await pagarOrdenCompra({
          orden: r.orden, cajaId, monto: montoOc,
          factura, motivoPago: motivoPago || null, gastoCategoria: gastoCat || null, gastoSubcategoria: gastoSub || null,
          actorEmail: actor, actorName,
        });
        pagadas++;
      }
      notify(`${pagadas} OC de ${provNombre} pagadas · ${monto(totalEnMoneda, moneda)}`, 'success', { link: '#/app/tesoreria' });
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el pago por lote.');
      setSaving(false); setProgreso(null);
    }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="pagar-varias" className="btn btn-primary" disabled={saving}>
        {saving ? (progreso ?? 'Pagando…') : `PAGAR ${rows.length} OC · ${monto(totalEnMoneda, moneda)}`}
      </button>
    </>
  );

  return (
    <Modal title={`Pagar ${rows.length} OC · ${provNombre}`} size="lg" onClose={onClose} footer={footer}>
      <form id="pagar-varias" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Órdenes a pagar · {provNombre}</div>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead><tr><th>N°ODC</th><th>OP</th><th>Condición</th><th style={{ textAlign: 'right' }}>Monto $</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const o = r.orden;
                  const abierto = detalle === o.id;
                  return (
                  <Fragment key={o.id}>
                  <tr className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setDetalle(abierto ? null : o.id)} title="Ver/ocultar el detalle de esta OC">
                    <td className="mono">{abierto ? '▾ ' : '▸ '}{o.oc_codigo ?? '—'}</td>
                    <td className="mono">{o.codigo}</td>
                    <td style={{ fontSize: '.78rem' }}>{labelCondicionPago(o.condiciones_pago)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(r.montoAPagar || 0), 'USD')}</td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={4} style={{ background: 'var(--bg-1)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.3rem .9rem', fontSize: '.8rem', padding: '.3rem .15rem' }}>
                          <div><span className="muted">Solicitante:</span> {o.solicitante || o.solicitante_email || '—'}</div>
                          <div><span className="muted">Unidad solicitante:</span> {o.unidad_solicitante?.trim() || '—'}</div>
                          <div><span className="muted">Creada (OP):</span> {dateTime(o.created_at)}</div>
                          <div><span className="muted">Aprobada (OP):</span> {o.aprobada_en ? dateTime(o.aprobada_en) : '—'}</div>
                          <div style={{ gridColumn: '1 / -1' }}><span className="muted">Finalidad:</span> {finalidadDe(o)}</div>
                          <div style={{ gridColumn: '1 / -1' }}><span className="muted">Motivo:</span> {o.motivo?.trim() || '—'}</div>
                          <div style={{ gridColumn: '1 / -1' }}><span className="muted">Nota (OP):</span> {o.notas?.trim() || '—'}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td><td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{monto(totalUsd, 'USD')}</td></tr></tfoot>
            </table>
          </div>
        </div>

        <div className="form-row">
          <label>Caja (de dónde sale el dinero)</label>
          <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length} style={{ maxWidth: 340 }}
            placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
            options={cajas.map((c) => ({ value: c.id, label: `${c.nombre} · ${monto(c.saldo, c.moneda)}` }))} />
          <small className="muted">Cada OC se paga por separado desde esta caja (un egreso por orden en Tesorería).</small>
        </div>

        {moneda === 'Bs' && (
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Tasa BCV (Bs por $)</label>
            <input className="input mono" type="number" min={0} step="any" value={tasa || ''} onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" />
            <small className="muted">Total en Bs: <strong className="mono">{monto(totalEnMoneda, 'Bs')}</strong></small>
          </div>
        )}

        <div className="form-row">
          <label>Comprobante {comprobanteOpcional ? <span className="muted">(opcional · efectivo)</span> : '· PDF o imagen'}</label>
          <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} />
          {factura && <small className="muted">{factura.name} · se adjunta a cada OC</small>}
        </div>

        <div className="form-row">
          <label>Motivo del pago <span className="muted">(opcional, se aplica a todas)</span></label>
          <input className="input" value={motivoPago} onChange={(e) => setMotivoPago(e.target.value)} placeholder="Ej.: pago consolidado del proveedor" />
        </div>

        <AnclarGastoFields categoria={gastoCat} subcategoria={gastoSub} onChange={(c, s) => { setGastoCat(c); setGastoSub(s); }} />
      </form>
    </Modal>
  );
}

/* ───────────── Cuentas por pagar (créditos) · abonos multipago ───────────── */
/* ─── Form reutilizable: crear una cuenta por pagar/cobrar nueva. Elige
   Cliente/Proveedor (con buscador) y, si no existe, lo agrega al directorio. ─── */
function NuevaCuentaForm({ btnLabel, onCrear }: {
  btnLabel: string;
  onCrear: (input: { tipo: 'cliente' | 'proveedor'; contraparte: string; monto: number; moneda: string; nota: string | null }) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'cliente' | 'proveedor'>('proveedor');
  const [contraparte, setContraparte] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [nota, setNota] = useState('');
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([]);
  const [monedas, setMonedas] = useState<string[]>([...MONEDAS_CAJA]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadCp = useCallback(() => { listContrapartes().then(setContrapartes).catch(() => setContrapartes([])); }, []);
  useEffect(() => { reloadCp(); }, [reloadCp]);
  useEffect(() => { listMonedas().then((m) => setMonedas(m.length ? m : [...MONEDAS_CAJA])).catch(() => setMonedas([...MONEDAS_CAJA])); }, []);
  useRealtime(['contrapartes'], () => { reloadCp(); });
  const opts = useMemo(() => contrapartes.filter((c) => c.tipo === tipo).map((c) => c.nombre), [contrapartes, tipo]);

  async function crear() {
    setError(null);
    const n = contraparte.trim();
    if (!n) { setError('Indicá el cliente o proveedor.'); return; }
    const m = Number(montoStr) || 0;
    if (m <= 0) { setError('El monto debe ser mayor que 0.'); return; }
    setSaving(true);
    try {
      await onCrear({ tipo, contraparte: n, monto: m, moneda, nota: nota.trim() || null });
      // Si el cliente/proveedor no estaba en el directorio, se agrega para próximos usos.
      const ya = contrapartes.some((c) => c.tipo === tipo && c.nombre.trim().toUpperCase() === n.toUpperCase());
      if (!ya) { try { await crearContraparte({ tipo, nombre: n }); reloadCp(); } catch { /* duplicado: no bloquea */ } }
      setContraparte(''); setMontoStr(''); setNota(''); setAbierto(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta'); }
    finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ marginBottom: '.7rem', padding: '.55rem .8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setAbierto((v) => !v)}>
        <strong style={{ fontSize: '.85rem' }}>{abierto ? '▾' : '➕'} {btnLabel}</strong>
      </div>
      {abierto && (
        <div style={{ marginTop: '.5rem' }}>
          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {error}</div>}
          <div className="form-grid">
            <div className="form-row">
              <label>Tipo</label>
              <select className="select" value={tipo} onChange={(e) => { setTipo(e.target.value as 'cliente' | 'proveedor'); setContraparte(''); }}>
                <option value="proveedor">🏭 Proveedor</option>
                <option value="cliente">👤 Cliente</option>
              </select>
            </div>
            <div className="form-row">
              <label>{tipo === 'proveedor' ? 'Proveedor' : 'Cliente'} *</label>
              <SearchCreateSelect value={contraparte} onChange={setContraparte} options={opts} placeholder="Elegí o escribí… (se crea si no existe)" />
            </div>
            <div className="form-row">
              <label>Monto *</label>
              <input className="input mono" type="number" min={0} step="any" value={montoStr} onChange={(e) => setMontoStr(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Moneda</label>
              <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                {monedas.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>Nota (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia de la cuenta…" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void crear()} disabled={saving}>{saving ? 'Creando…' : 'Crear cuenta'}</button>
        </div>
      )}
    </div>
  );
}

/** Etiqueta legible de cada método con datos de pago. */
const LABEL_METODO_DATOS: Record<string, string> = {
  pago_movil: 'Pago móvil',
  transferencia: 'Transferencia',
  zelle: 'Zelle',
  binance_usdt: 'Binance (USDT)',
};

/**
 * Editor inline de los datos de pago de un proveedor (dónde pagarle por método).
 * Se reutiliza en Tesorería para cargar/editar los datos sin ir al directorio.
 */
function DatosPagoProveedorModal({ proveedorId, proveedorNombre, actor, inicial, onClose, onSaved }: {
  proveedorId: string;
  proveedorNombre: string;
  actor: string;
  inicial: Record<string, DatosPago>;
  onClose: () => void;
  onSaved: (datos: Record<string, DatosPago>) => void;
}) {
  const [metodo, setMetodo] = useState<string>(() => METODOS_CON_DATOS.find((m) => inicial[m]) ?? 'transferencia');
  const [datos, setDatos] = useState<Record<string, DatosPago>>(() => ({ ...inicial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    const d = datos[metodo] ?? {};
    const err = validarDatosPago(metodo, d);
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      await guardarDatosPago(proveedorId, metodo, d, actor);
      const next = { ...datos, [metodo]: d };
      setDatos(next);
      onSaved(next);
      toast(`Datos de pago guardados · ${proveedorNombre}`, 'success');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ margin: '.4rem 0 0', padding: '.6rem .75rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div className="form-row" style={{ margin: '0 0 .4rem' }}>
        <label style={{ fontSize: '.72rem' }}>Método</label>
        <select className="select" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {METODOS_CON_DATOS.map((m) => <option key={m} value={m}>{LABEL_METODO_DATOS[m]}{inicial[m] ? ' ✓' : ''}</option>)}
        </select>
      </div>
      <DatosPagoFields metodo={metodo} value={datos[metodo] ?? {}} onChange={(d) => setDatos((prev) => ({ ...prev, [metodo]: d }))} />
      {error && <div className="card" style={{ borderColor: 'var(--danger)', margin: '.4rem 0 0', padding: '.4rem .6rem' }}><small><strong>Error:</strong> {error}</small></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.4rem', marginTop: '.5rem' }}>
        <button className="btn btn-sm btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
        <button className="btn btn-sm btn-primary" onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : '💾 Guardar'}</button>
      </div>
    </div>
  );
}

function CuentasCreditoModal({ cajas, actor, actorName, onClose, onChanged }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const [vista, setVista] = useState<'oc' | 'manual'>('oc');
  const [ordenes, setOrdenes] = useState<OrdenPorPagar[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [abonos, setAbonos] = useState<AbonoCredito[]>([]);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  const [legMontos, setLegMontos] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const [factura, setFactura] = useState<File | null>(null);
  const [tasa, setTasa] = useState(0);
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  // Comisión bancaria opcional: monto + saldo de caja (moneda/cuenta) del que sale.
  const [comisionMonto, setComisionMonto] = useState('');
  const [comisionSaldoId, setComisionSaldoId] = useState('');
  const [datosPago, setDatosPago] = useState<Record<string, DatosPago>>({});
  const [editarDatosPago, setEditarDatosPago] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inputs no controlados (montos/nota): este nonce remonta los campos al
  // limpiarlos tras registrar un abono (el panel queda abierto).
  const [formKey, setFormKey] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listOrdenesEnCredito();
      // Solo las que aún tienen saldo por pagar (las saldadas se gestionan en Compras).
      const os = all.filter((x) => (Number(x.orden.total) - (Number(x.orden.abonado_total) || 0)) > 0.01);
      setOrdenes(os);
      setSelId((p) => (p && os.some((x) => x.orden.id === p)) ? p : (os[0]?.orden.id ?? ''));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* manual */ });
    getTasasMercado().then(setMercado).catch(() => setMercado(null));
  }, []);
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); return; }
    saldosDeCaja(cajaId).then((rows) => {
      const con = rows.filter((r) => Number(r.saldo) > 0);
      setSaldosCaja(con);
      setComisionSaldoId((p) => (p && con.some((s) => s.id === p)) ? p : (con[0]?.id ?? ''));
    }).catch(() => setSaldosCaja([]));
    setLegMontos({}); setComisionMonto('');
  }, [cajaId]);
  useEffect(() => {
    if (!selId) { setAbonos([]); return; }
    listAbonos(selId).then(setAbonos).catch(() => setAbonos([]));
  }, [selId]);
  // Datos de pago guardados del proveedor de la OC (para mostrarlos / editarlos).
  useEffect(() => {
    const provId = ordenes.find((x) => x.orden.id === selId)?.proveedor?.id;
    setEditarDatosPago(false);
    if (!provId) { setDatosPago({}); return; }
    listDatosPago(provId).then(setDatosPago).catch(() => setDatosPago({}));
  }, [selId, ordenes]);

  const sel = ordenes.find((x) => x.orden.id === selId) ?? null;
  const o = sel?.orden ?? null;
  const total = Number(o?.total) || 0;
  const abonado = o ? (Number(o.abonado_total) || abonos.reduce((a, b) => a + Number(b.monto), 0)) : 0;
  const saldo = Math.round((total - abonado) * 100) / 100;

  function legUsd(m: string, n: number): number {
    if (!n || n <= 0) return 0;
    if (m === 'USD' || m === 'USDT') return round2(n);
    if (m === 'Bs') return tasa > 0 ? round2(n / tasa) : 0;
    if (m === 'COP') return mercado?.copUsd ? round2(n / mercado.copUsd) : 0;
    return round2(n);
  }
  const sumUsd = round2(saldosCaja.reduce((a, s) => a + legUsd(s.moneda, Number(legMontos[s.id]) || 0), 0));
  // Comisión bancaria: monto + saldo (moneda/cuenta) elegido de la misma caja.
  const comisionSaldo = saldosCaja.find((s) => s.id === comisionSaldoId) ?? null;
  const comisionMontoNum = Number(comisionMonto) || 0;
  const comisionUsd = comisionSaldo ? legUsd(comisionSaldo.moneda, comisionMontoNum) : 0;

  async function handleAbonar() {
    setError(null);
    if (!o) return;
    const legs: AbonoLeg[] = saldosCaja
      .map((s) => ({ cajaId, cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: Number(legMontos[s.id]) || 0, montoUsd: legUsd(s.moneda, Number(legMontos[s.id]) || 0) }))
      .filter((l) => l.monto > 0);
    if (!legs.length) { setError('Indicá cuánto abonar en al menos una moneda.'); return; }
    if (sumUsd > saldo + 0.01) { setError(`El abono (${monto(sumUsd, 'USD')}) supera el saldo pendiente (${monto(saldo, 'USD')}).`); return; }
    // Comisión bancaria opcional (egreso aparte; no reduce la deuda).
    let comision: AbonoComision | null = null;
    if (comisionMontoNum > 0) {
      if (!comisionSaldo) { setError('Elegí de qué saldo sale la comisión bancaria.'); return; }
      if (comisionMontoNum > Number(comisionSaldo.saldo) + 0.01) { setError('La comisión bancaria supera el saldo disponible de esa moneda.'); return; }
      comision = { cajaId, cuenta: comisionSaldo.cuenta as CuentaCaja, moneda: comisionSaldo.moneda, monto: comisionMontoNum, montoUsd: comisionUsd };
    }
    // Lee la nota del DOM (no del estado) para evitar capturas incompletas.
    const notaVal = (((document.querySelector('[name="cred-nota"]') as HTMLInputElement | null)?.value ?? '') || nota).trim();
    setSaving(true);
    try {
      const r = await registrarAbonoMulti({ orden: o, legs, nota: notaVal || null, factura, comision, actorEmail: actor, actorName });
      const saldadoNow = r.orden.estado !== 'cuenta_abierta';
      notify(saldadoNow
        ? `Crédito saldado · ${o.oc_codigo ?? o.codigo} · pasa a recepción/finalización`
        : `Abono ${monto(sumUsd, 'USD')}${comision ? ` + comisión ${monto(comisionMontoNum, comisionSaldo!.moneda)}` : ''} · ${o.oc_codigo ?? o.codigo}`, 'success');
      setLegMontos({}); setNota(''); setFactura(null); setComisionMonto('');
      setFormKey((k) => k + 1);
      await onChanged();
      await cargar();
      if (!saldadoNow) await listAbonos(o.id).then(setAbonos);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el abono'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Cuentas por pagar (créditos)" size="xl" onClose={() => !saving && onClose()}
      footer={<button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>}>
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.8rem' }}>
        <button className={vista === 'oc' ? 'active' : ''} onClick={() => setVista('oc')}>🧾 Compras a crédito</button>
        <button className={vista === 'manual' ? 'active' : ''} onClick={() => setVista('manual')}>👥 Cliente / Proveedor</button>
      </div>

      {vista === 'manual' && <CuentasPorPagarManualPanel cajas={cajas} actor={actor} actorName={actorName} onChanged={onChanged} />}

      {vista === 'oc' && (<>
      {loading && <p className="muted">Cargando…</p>}
      {!loading && !ordenes.length && <p className="muted" style={{ textAlign: 'center' }}>No hay compras a crédito con cuenta abierta. 🎉</p>}
      {!loading && ordenes.length > 0 && (
        <>
          <div className="form-row" style={{ marginBottom: '.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
              <label style={{ margin: 0 }}>Cuenta a crédito ({ordenes.length})</label>
              <button className="btn btn-sm btn-ghost" title="Resumen de compras a crédito en PDF (vista previa)"
                onClick={async () => {
                  try {
                    await descargarResumenCuentasPdf('Resumen de Compras a Crédito', ordenes.map((x) => {
                      const tot = Number(x.orden.total) || 0;
                      const ab = Number(x.orden.abonado_total) || 0;
                      return {
                        concepto: x.orden.oc_codigo ?? x.orden.codigo,
                        contraparte: x.proveedorNombre,
                        moneda: 'USD',
                        total: tot, pagado: ab, saldo: round2(tot - ab),
                        estado: 'A CRÉDITO',
                        fecha: x.orden.oc_aprobada_en ?? x.orden.oc_creada_en ?? x.orden.created_at ?? null,
                      };
                    }), 'ABONADO');
                  } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
                }}>📄 Resumen</button>
            </div>
            <SearchSelect value={selId} onChange={setSelId} placeholder="🔍 Buscar cuenta…"
              options={ordenes.map((x) => ({ value: x.orden.id, label: `${x.orden.oc_codigo ?? x.orden.codigo} · ${x.proveedorNombre} · saldo ${monto(round2(Number(x.orden.total) - (Number(x.orden.abonado_total) || 0)), 'USD')}` }))} />
          </div>

          {o && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>TOTAL</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{monto(total, 'USD')}</div>
                </div>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>ABONADO</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-3)' }}>{monto(abonado, 'USD')}</div>
                </div>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>SALDO</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: saldo > 0 ? 'var(--warning)' : 'var(--success)' }}>{monto(saldo, 'USD')}</div>
                </div>
              </div>
              {/* Datos del proveedor de la OC (se traen del directorio por proveedor_id). */}
              {sel?.proveedor && (
                <div className="card" style={{ margin: '0 0 .6rem', padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem', marginBottom: '.25rem' }}>PROVEEDOR</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem 1.5rem', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '.95rem' }}>{sel.proveedor.razon_social}</strong>
                    {sel.proveedor.rif && <span className="mono muted" style={{ fontSize: '.8rem' }}>RIF {sel.proveedor.rif}</span>}
                    {sel.proveedor.telefono && <span className="muted" style={{ fontSize: '.8rem' }}>📞 {sel.proveedor.telefono}</span>}
                    {sel.proveedor.contacto && <span className="muted" style={{ fontSize: '.8rem' }}>👤 {sel.proveedor.contacto}</span>}
                    {sel.proveedor.email && <span className="muted" style={{ fontSize: '.8rem' }}>✉ {sel.proveedor.email}</span>}
                    {sel.proveedor.direccion && <span className="muted" style={{ fontSize: '.8rem' }}>📍 {sel.proveedor.direccion}</span>}
                  </div>

                  {/* Datos de pago guardados (dónde pagarle) + edición. */}
                  <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--border, #2a2f3a)', paddingTop: '.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                      <span className="muted" style={{ fontSize: '.7rem' }}>DATOS DE PAGO</span>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditarDatosPago((v) => !v)}>
                        {editarDatosPago ? '✕ Cerrar' : '✏ Cargar / editar datos de pago'}
                      </button>
                    </div>
                    {!editarDatosPago && (
                      Object.keys(datosPago).length === 0
                        ? <div className="muted" style={{ fontSize: '.78rem' }}>Sin datos de pago guardados.</div>
                        : <div style={{ display: 'grid', gap: '.2rem', marginTop: '.25rem' }}>
                            {METODOS_CON_DATOS.filter((m) => datosPago[m]).map((m) => (
                              <div key={m} style={{ fontSize: '.8rem' }}>
                                <span className="badge">{LABEL_METODO_DATOS[m]}</span>{' '}
                                <span className="mono muted">{resumenDatosPago(m, datosPago[m])}</span>
                              </div>
                            ))}
                          </div>
                    )}
                    {editarDatosPago && sel.proveedor && (
                      <DatosPagoProveedorModal
                        proveedorId={sel.proveedor.id}
                        proveedorNombre={sel.proveedor.razon_social}
                        actor={actor}
                        inicial={datosPago}
                        onClose={() => setEditarDatosPago(false)}
                        onSaved={(d) => { setDatosPago(d); }}
                      />
                    )}
                  </div>
                </div>
              )}
              {o.recibida_en && <div className="badge warning" style={{ marginBottom: '.6rem' }}>📦 Mercancía ya recibida · crédito pendiente</div>}

              {/* Conversión del saldo a Bs con tasa personalizable (por defecto BCV). */}
              <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
                <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>Saldo en USD</div>
                    <strong className="mono" style={{ fontSize: '1.1rem' }}>{monto(saldo, 'USD')}</strong>
                  </div>
                  <div style={{ fontSize: '1.1rem' }} className="muted">⇄</div>
                  <div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>Equivale en Bs</div>
                    <strong className="mono" style={{ fontSize: '1.1rem' }}>{tasa > 0 ? monto(aBs(saldo, tasa), 'Bs') : '—'}</strong>
                  </div>
                  <div className="form-row" style={{ marginLeft: 'auto', minWidth: 160 }}>
                    <label style={{ fontSize: '.72rem' }}>Tasa (Bs por $) · editable, por defecto BCV</label>
                    <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
                      onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" />
                  </div>
                </div>
              </div>

              {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

              <div className="card" style={{ padding: '.75rem', marginBottom: '.75rem' }}>
                <div className="card-title" style={{ marginBottom: '.5rem' }}>Registrar abono (multipago)</div>
                <div className="form-row" style={{ marginBottom: '.5rem' }}>
                  <label>Caja (de dónde sale el dinero)</label>
                  <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length}
                    placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
                    options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
                </div>
                <div className="table-wrap">
                  <table className="table" style={{ fontSize: '.84rem' }}>
                    <thead><tr><th>Moneda</th><th style={{ textAlign: 'right' }}>Disponible</th><th style={{ textAlign: 'right' }}>A abonar (en su moneda)</th><th style={{ textAlign: 'right' }}>Equiv. USD</th></tr></thead>
                    <tbody>
                      {!saldosCaja.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Esta caja no tiene saldos.</td></tr>}
                      {saldosCaja.map((s) => {
                        const n = Number(legMontos[s.id]) || 0;
                        const excede = n > Number(s.saldo);
                        const etq = s.cuenta === 'general' ? '' : s.cuenta === 'juridica' ? ' · Jurídica' : ' · Personal';
                        return (
                          <tr key={s.id}>
                            <td><span className="badge">{s.moneda}</span>{etq}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(s.saldo), s.moneda)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <input key={`cred-leg-${s.id}-${formKey}`} className="input mono" type="number" name={`cred-leg-${s.id}`} min={0} max={Number(s.saldo)} step="any"
                                defaultValue={legMontos[s.id] ?? ''} placeholder="0,00"
                                onChange={(e) => { const v = dosDecimales(e.target.value); e.target.value = v; setLegMontos((m) => ({ ...m, [s.id]: v })); }}
                                style={{ width: 130, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                            </td>
                            <td className="mono" style={{ textAlign: 'right' }}>{n > 0 ? monto(legUsd(s.moneda, n), 'USD') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Abono (USD)</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: sumUsd > saldo + 0.01 ? 'var(--danger)' : 'var(--success)' }}>{monto(sumUsd, 'USD')}</td></tr>
                    </tfoot>
                  </table>
                </div>

                {/* Comisión bancaria (opcional): sale de la caja, NO reduce la deuda. */}
                <div className="card" style={{ margin: '.5rem 0 0', padding: '.5rem .75rem', borderColor: 'var(--brand, #ff8a00)' }}>
                  <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-row" style={{ margin: 0, minWidth: 150 }}>
                      <label style={{ fontSize: '.72rem' }}>Comisión bancaria (opcional)</label>
                      <input key={`cred-comision-${formKey}`} className="input mono" type="number" min={0} step="any" name="cred-comision"
                        defaultValue={comisionMonto} placeholder="0,00"
                        onChange={(e) => { const v = dosDecimales(e.target.value); e.target.value = v; setComisionMonto(v); }}
                        style={{ width: 130, textAlign: 'right' }} />
                    </div>
                    <div className="form-row" style={{ margin: 0, minWidth: 160 }}>
                      <label style={{ fontSize: '.72rem' }}>Sale del saldo</label>
                      <select className="select" value={comisionSaldoId} onChange={(e) => setComisionSaldoId(e.target.value)} disabled={!saldosCaja.length}>
                        {!saldosCaja.length && <option value="">— sin saldos —</option>}
                        {saldosCaja.map((s) => {
                          const etq = s.cuenta === 'general' ? '' : s.cuenta === 'juridica' ? ' · Jurídica' : ' · Personal';
                          return <option key={s.id} value={s.id}>{s.moneda}{etq} · {monto(Number(s.saldo), s.moneda)}</option>;
                        })}
                      </select>
                    </div>
                    <div style={{ fontSize: '.8rem' }} className="muted">
                      {comisionMontoNum > 0 ? <>≈ {monto(comisionUsd, 'USD')} · se descuenta de la caja (no abona la deuda)</> : 'Se descuenta de la caja además del abono. No reduce la deuda.'}
                    </div>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: '.5rem' }}>
                  <div className="form-row">
                    <label>Comprobante (PDF o imagen) (opcional)</label>
                    <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} />
                    {factura && <small className="muted">{factura.name}</small>}
                  </div>
                  <div className="form-row">
                    <label>Nota (opcional)</label>
                    <input key={`cred-nota-${formKey}`} className="input" name="cred-nota" defaultValue={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia del abono…" />
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginTop: '.5rem' }}>
                  <button className="btn btn-success" disabled={saving || sumUsd <= 0} onClick={() => void handleAbonar()}>{saving ? 'Registrando…' : `💵 Registrar abono · ${monto(sumUsd, 'USD')}`}</button>
                </div>
              </div>

              <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Abono (USD)</th><th style={{ textAlign: 'right' }}>Comisión bancaria</th><th>Nota</th></tr></thead>
                  <tbody>
                    {!abonos.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin abonos todavía.</td></tr>}
                    {abonos.map((ab) => {
                      const com = Number(ab.comision_monto) || 0;
                      return (
                        <tr key={ab.id}>
                          <td>{dateTime(ab.at)}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(ab.monto), 'USD')}</td>
                          <td className="mono" style={{ textAlign: 'right', color: com > 0 ? 'var(--warning)' : undefined }}>
                            {com > 0 ? <>{monto(com, ab.comision_moneda || 'Bs')}{Number(ab.comision_usd) > 0 ? <span className="muted"> · {monto(Number(ab.comision_usd), 'USD')}</span> : null}</> : '—'}
                          </td>
                          <td className="muted">{ab.nota || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      </>)}
    </Modal>
  );
}

/* ───────────── Panel: cuentas por pagar manuales (cliente/proveedor) ───────────── */
function CuentasPorPagarManualPanel({ cajas, actor, actorName, onChanged }: {
  cajas: Caja[]; actor: string; actorName: string | null; onChanged: () => void | Promise<void>;
}) {
  const [lista, setLista] = useState<CuentaPorPagar[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [abonos, setAbonos] = useState<AbonoCxP[]>([]);
  const [ingresos, setIngresos] = useState<IngresoCxP[]>([]);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [cuentaCaja, setCuentaCaja] = useState<string>('');
  const [montoStr, setMontoStr] = useState('');
  const [nota, setNota] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correoCuentaOpen, setCorreoCuentaOpen] = useState(false);
  const [pagarProdOpen, setPagarProdOpen] = useState(false);
  const [abonarProdRecibidoOpen, setAbonarProdRecibidoOpen] = useState(false);
  // Inputs no controlados (monto/nota): este nonce remonta los campos al
  // limpiarlos tras registrar el abono (el panel queda abierto).
  const [formKey, setFormKey] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const cs = await listCuentasPorPagar(true);
      setLista(cs);
      setSelId((p) => (p && cs.some((c) => c.id === p)) ? p : (cs[0]?.id ?? ''));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    if (!selId) { setAbonos([]); setIngresos([]); return; }
    listAbonosCuenta(selId).then(setAbonos).catch(() => setAbonos([]));
    listIngresosCuenta(selId).then(setIngresos).catch(() => setIngresos([]));
  }, [selId]);

  const sel = lista.find((c) => c.id === selId) ?? null;
  // Saldos completos de la caja elegida (para mostrar dónde hay dinero disponible).
  const [cajaSaldosSel, setCajaSaldosSel] = useState<CajaSaldo[]>([]);
  useEffect(() => {
    if (!cajaId || !sel) { setCuentaCaja(''); setCajaSaldosSel([]); return; }
    saldosDeCaja(cajaId)
      .then((rows) => {
        setCajaSaldosSel(rows);
        // El egreso sale en la MISMA moneda de la cuenta por pagar.
        const mismos = rows.filter((r) => r.moneda === sel.moneda && Number(r.saldo) > 0);
        setCuentaCaja((prev) => (prev && mismos.some((r) => r.cuenta === prev)) ? prev : (mismos[0]?.cuenta ?? ''));
      })
      .catch(() => { setCajaSaldosSel([]); setCuentaCaja(''); });
  }, [cajaId, sel]);
  // Cuentas de esta caja que tienen saldo en la moneda de la cuenta por pagar.
  const cuentasMoneda = sel ? cajaSaldosSel.filter((r) => r.moneda === sel.moneda && Number(r.saldo) > 0) : [];
  // Todo lo disponible en la caja (cualquier moneda) para ver dónde hay dinero.
  const dispCaja = cajaSaldosSel.filter((r) => Number(r.saldo) > 0);
  const saldoCuentaSel = cuentasMoneda.find((r) => r.cuenta === cuentaCaja) ?? null;

  const saldo = sel ? round2(Number(sel.monto) - (Number(sel.abonado) || 0)) : 0;

  async function abonar() {
    setError(null);
    if (!sel) return;
    // Lee monto y nota del DOM (no del estado) para evitar capturas incompletas
    // cuando un re-render desincroniza el estado mientras se escribe.
    const leer = (n: string) => ((document.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? '');
    const m = Number(leer('cxp-monto')) || Number(montoStr) || 0;
    const notaVal = (leer('cxp-nota') || nota).trim();
    if (m <= 0) { setError('Indicá el monto a abonar.'); return; }
    if (!cajaId) { setError('Elegí la caja del egreso.'); return; }
    if (!cuentaCaja) { setError(`La caja no tiene saldo en ${sel.moneda}.`); return; }
    setSaving(true);
    try {
      const r = await registrarAbonoCuenta({
        cuenta: sel, cajaId, cuentaCaja: cuentaCaja as CuentaCaja, monto: m,
        nota: notaVal || null, actor, actorName,
      });
      notify(r.exceso > 0.01
        ? `Pago ${monto(m, sel.moneda)} · ${sel.contraparte} · excedente ${monto(r.exceso, sel.moneda)} → cuenta por cobrar`
        : (r.cuenta.estado === 'saldada'
          ? `Cuenta por pagar saldada · ${sel.contraparte}`
          : `Abono ${monto(m, sel.moneda)} · ${sel.contraparte}`), 'success', { link: '#/app/tesoreria' });
      setMontoStr(''); setNota('');
      setFormKey((k) => k + 1);
      await cargar(); await onChanged();
      if (r.cuenta.estado !== 'saldada') await listAbonosCuenta(sel.id).then(setAbonos);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el abono'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <NuevaCuentaForm btnLabel="Nueva cuenta por pagar (cliente / proveedor)"
        onCrear={async (inp) => { await crearCuentaPorPagar({ ...inp, actor, actorName }); await cargar(); await onChanged(); }} />

      {loading ? <p className="muted">Cargando…</p>
        : !lista.length ? <p className="muted" style={{ textAlign: 'center' }}>No hay cuentas por pagar de clientes/proveedores todavía. Agregá una arriba. 🎉</p>
        : (
      <>
      <div className="form-row" style={{ marginBottom: '.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
          <label style={{ margin: 0 }}>Cuenta por pagar ({lista.length})</label>
          <button className="btn btn-sm btn-ghost" title="Resumen de cuentas por pagar en PDF (vista previa)"
            onClick={async () => {
              try {
                await descargarResumenCuentasPdf('Resumen de Cuentas por Pagar', lista.map((c) => {
                  const tot = Number(c.monto) || 0;
                  const ab = Number(c.abonado) || 0;
                  return {
                    concepto: c.tipo === 'proveedor' ? 'PROVEEDOR' : 'CLIENTE',
                    contraparte: c.contraparte,
                    moneda: c.moneda,
                    total: tot, pagado: ab, saldo: round2(tot - ab),
                    estado: (c.estado || '').toUpperCase(),
                    fecha: c.created_at ?? null,
                  };
                }), 'ABONADO');
              } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
            }}>📄 Resumen</button>
        </div>
        <SearchSelect value={selId} onChange={setSelId} placeholder="🔍 Buscar cuenta…"
          options={lista.map((c) => ({ value: c.id, label: `${c.tipo === 'proveedor' ? '🏭' : '👤'} ${c.contraparte} · saldo ${monto(round2(Number(c.monto) - (Number(c.abonado) || 0)), c.moneda)}` }))} />
      </div>

      {sel && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
            <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
              <div className="muted" style={{ fontSize: '.7rem' }}>TOTAL</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{monto(Number(sel.monto), sel.moneda)}</div>
            </div>
            <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
              <div className="muted" style={{ fontSize: '.7rem' }}>ABONADO</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-3)' }}>{monto(Number(sel.abonado) || 0, sel.moneda)}</div>
            </div>
            <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
              <div className="muted" style={{ fontSize: '.7rem' }}>SALDO</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: saldo > 0 ? 'var(--warning)' : 'var(--success)' }}>{monto(saldo, sel.moneda)}</div>
            </div>
          </div>
          <div className="badge" style={{ marginBottom: '.6rem' }}>{sel.tipo === 'proveedor' ? '🏭 Proveedor' : '👤 Cliente'}{sel.nota ? ` · ${sel.nota}` : ''}</div>

          {saldo > 0 && (
            <div style={{ marginBottom: '.6rem' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setPagarProdOpen(true)} title="Saldar entregando productos del inventario (ej. casiterita a MGG)">
                📦 Pagar con productos (entrega de inventario)
              </button>
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: '.4rem' }} onClick={() => setAbonarProdRecibidoOpen(true)}
                title="La contraparte salda entregando producto: entra al inventario y su valor al cambio (USD) abona la deuda">
                💱 Abonar con producto recibido (al cambio)
              </button>
            </div>
          )}

          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}

          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title"><span>Registrar abono (egreso de caja · {sel.moneda})</span></div>
            <div className="form-grid">
              <div className="form-row">
                <label>Caja (egreso)</label>
                <SearchSelect value={cajaId} onChange={setCajaId} placeholder="🔍 Buscar caja…"
                  options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
                {/* De qué cuenta/moneda sale el dinero (el abono es en la moneda de la cuenta por pagar). */}
                {cuentasMoneda.length > 1 ? (
                  <select className="select" style={{ marginTop: '.35rem' }} value={cuentaCaja} onChange={(e) => setCuentaCaja(e.target.value)}>
                    {cuentasMoneda.map((r) => (
                      <option key={r.cuenta} value={r.cuenta}>
                        Sale de {r.cuenta === 'general' ? 'general' : r.cuenta === 'juridica' ? 'Jurídica' : 'Personal'} · {monto(Number(r.saldo), r.moneda)} disp.
                      </option>
                    ))}
                  </select>
                ) : saldoCuentaSel ? (
                  <small className="muted">Sale en <strong>{sel.moneda}</strong> de la cuenta <strong>{cuentaCaja === 'general' ? 'general' : cuentaCaja === 'juridica' ? 'Jurídica' : 'Personal'}</strong> · disponible <strong className="mono">{monto(Number(saldoCuentaSel.saldo), sel.moneda)}</strong></small>
                ) : (
                  <small style={{ color: 'var(--danger)' }}>⚠ Esta caja no tiene saldo en {sel.moneda}. Elegí otra caja.</small>
                )}
              </div>
              <div className="form-row">
                <label>Monto a abonar ({sel.moneda})</label>
                <input key={`cxp-monto-${formKey}`} className="input mono" type="number" name="cxp-monto" min={0} step="any" defaultValue={montoStr} onChange={(e) => setMontoStr(e.target.value)} />
                <small className="muted">Saldo pendiente: <strong className="mono">{monto(saldo, sel.moneda)}</strong></small>
              </div>
            </div>

            {/* Dónde hay dinero disponible en la caja elegida (todas las monedas). */}
            <div className="card" style={{ margin: '.25rem 0 .1rem', padding: '.5rem .7rem', background: 'rgba(255,255,255,.02)' }}>
              <div className="muted" style={{ fontSize: '.7rem', marginBottom: '.3rem' }}>DINERO DISPONIBLE EN ESTA CAJA</div>
              {!dispCaja.length ? (
                <small className="muted">Sin saldo en ninguna moneda.</small>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                  {dispCaja.map((r) => {
                    const esLaQueSale = r.moneda === sel.moneda && r.cuenta === cuentaCaja;
                    return (
                      <span key={`${r.cuenta}-${r.moneda}`} className="mono" style={{
                        padding: '.15rem .55rem', borderRadius: '999px', fontSize: '.8rem',
                        border: `1px solid ${esLaQueSale ? 'var(--primary, #ff8a00)' : 'var(--border)'}`,
                        background: esLaQueSale ? 'rgba(255,138,0,.12)' : 'transparent',
                        fontWeight: esLaQueSale ? 700 : 500,
                      }}>
                        {monto(Number(r.saldo), r.moneda)} {r.moneda}{r.cuenta === 'general' ? '' : r.cuenta === 'juridica' ? ' · Jurídica' : ' · Personal'}{esLaQueSale ? ' ←' : ''}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="form-row">
              <label>Nota (opcional)</label>
              <input key={`cxp-nota-${formKey}`} className="input" name="cxp-nota" defaultValue={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia del abono…" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={abonar} disabled={saving || saldo <= 0}>{saving ? 'Registrando…' : 'Registrar abono'}</button>
          </div>

          {/* Historial de INGRESOS (préstamos): cada fecha en que entró dinero del mismo cliente
              y el total adeudado acumulado tras ese ingreso. */}
          <strong style={{ fontSize: '.84rem' }}>Historial de ingresos (préstamos)</strong>
          <div className="table-wrap" style={{ marginBottom: '.7rem', marginTop: '.3rem' }}>
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead><tr><th>Fecha de ingreso</th><th style={{ textAlign: 'right' }}>Monto prestado</th><th style={{ textAlign: 'right' }}>Total adeudado (acum.)</th><th>Nota</th></tr></thead>
              <tbody>
                {!ingresos.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin ingresos registrados.</td></tr>}
                {(() => { let acc = 0; return ingresos.map((ig) => {
                  acc = round2(acc + Number(ig.monto || 0));
                  return (
                    <tr key={ig.id}>
                      <td>{dateTime(ig.at)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(ig.monto), ig.moneda)}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{monto(acc, ig.moneda)}</td>
                      <td className="muted">{ig.nota || '—'}</td>
                    </tr>
                  );
                }); })()}
              </tbody>
            </table>
          </div>

          {/* Reportes de la cuenta por pagar: PDF y correo (mismo formato que los demás reportes). */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
            <strong style={{ fontSize: '.84rem' }}>Historial de abonos</strong>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button
                className="btn btn-sm btn-ghost"
                title="Descargar el reporte de esta cuenta por pagar en PDF"
                onClick={async () => {
                  try { await descargarCuentaPorPagarPdf(sel, abonos, ingresos); }
                  catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
                }}
              >↓ PDF</button>
              <button
                className="btn btn-sm btn-ghost"
                title="Enviar el reporte por correo"
                onClick={() => setCorreoCuentaOpen(true)}
              >📧 Correo</button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Abono</th><th style={{ textAlign: 'right' }}>Saldo restante</th><th>Nota</th></tr></thead>
              <tbody>
                {!abonos.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin abonos.</td></tr>}
                {abonos.map((ab) => (
                  <tr key={ab.id}>
                    <td>{dateTime(ab.at)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(ab.monto), ab.moneda)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{ab.saldo_restante != null ? monto(Number(ab.saldo_restante), ab.moneda) : '—'}</td>
                    <td className="muted">{ab.nota || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {correoCuentaOpen && (
            <EnviarCuentaPorPagarModal cuenta={sel} abonos={abonos} ingresos={ingresos} defaultEmail={actor} onClose={() => setCorreoCuentaOpen(false)} />
          )}

          {pagarProdOpen && (
            <PagarConProductosModal
              cuenta={sel}
              actor={actor}
              actorName={actorName}
              onClose={() => setPagarProdOpen(false)}
              onPagado={async () => {
                setPagarProdOpen(false);
                await cargar(); await onChanged();
                await listAbonosCuenta(sel.id).then(setAbonos).catch(() => {});
              }}
            />
          )}

          {abonarProdRecibidoOpen && (
            <AbonarConProductoRecibidoModal
              cuenta={sel}
              actor={actor}
              actorName={actorName}
              onClose={() => setAbonarProdRecibidoOpen(false)}
              onAbonado={async () => {
                setAbonarProdRecibidoOpen(false);
                await cargar(); await onChanged();
                await listAbonosCuenta(sel.id).then(setAbonos).catch(() => {});
              }}
            />
          )}
        </>
      )}
      </>
      )}
    </>
  );
}

/* ───────── Pagar una cuenta por pagar ENTREGANDO PRODUCTOS (descuenta inventario) ───────── */
function PagarConProductosModal({ cuenta, actor, actorName, onClose, onPagado }: {
  cuenta: CuentaPorPagar; actor: string; actorName: string | null; onClose: () => void; onPagado: () => void | Promise<void>;
}) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [lineas, setLineas] = useState<Array<{ productoId: string; cantidad: string }>>([{ productoId: '', cantidad: '' }]);
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listProductos().then(setProductos).catch(() => setProductos([])); }, []);

  const opciones = productos.map((p) => ({ value: p.id, label: `${p.sku} · ${p.nombre} (stock ${p.stock} ${p.unidad ?? ''} · ${monto(Number(p.precio) || 0, 'USD')})` }));
  const prodById = (id: string) => productos.find((p) => p.id === id) ?? null;

  function setLinea(i: number, patch: Partial<{ productoId: string; cantidad: string }>) {
    setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }
  function addLinea() { setLineas((ls) => [...ls, { productoId: '', cantidad: '' }]); }
  function removeLinea(i: number) { setLineas((ls) => ls.filter((_, k) => k !== i)); }

  const itemsValidos = lineas
    .map((l) => { const p = prodById(l.productoId); const cant = Number(l.cantidad.replace(',', '.')); return p && cant > 0 ? { p, cant } : null; })
    .filter((x): x is { p: Producto; cant: number } => x != null);
  const valorTotal = round2(itemsValidos.reduce((a, { p, cant }) => a + (Number(p.precio) || 0) * cant, 0));
  const saldo = round2(Number(cuenta.monto) - (Number(cuenta.abonado) || 0));

  async function confirmar() {
    setError(null);
    if (!itemsValidos.length) { setError('Agregá al menos un producto con cantidad.'); return; }
    // Validar stock disponible por producto.
    for (const { p, cant } of itemsValidos) {
      if (cant > (Number(p.stock) || 0)) { setError(`Stock insuficiente de ${p.sku}: hay ${p.stock}, pedís ${cant}.`); return; }
    }
    setSaving(true);
    try {
      const r = await pagarCuentaConProductos({
        cuenta,
        items: itemsValidos.map(({ p, cant }) => ({ productoId: p.id, sku: p.sku, nombre: p.nombre, cantidad: cant, precio: Number(p.precio) || 0, almacen: p.almacen ?? null })),
        nota: nota.trim() || null, actor, actorName,
      });
      notify(`Pago con productos · ${cuenta.contraparte} · ${monto(r.valorTotal, cuenta.moneda)} descontados de inventario`, 'success', { link: '#/app/tesoreria' });
      await onPagado();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el pago con productos'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Pagar con productos · ${cuenta.contraparte}`} size="lg" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar} disabled={saving || !itemsValidos.length}>
          {saving ? 'Procesando…' : `Entregar y abonar ${monto(Math.min(valorTotal, saldo), cuenta.moneda)}`}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Saldás la deuda <strong>entregando productos del inventario</strong> (ej.: casiterita a MGG). Cada producto se valora a su
        <strong> precio de inventario × cantidad</strong>, se descuenta del stock y el valor abona la cuenta. Saldo actual: <strong>{monto(saldo, cuenta.moneda)}</strong>.
      </p>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}

      <div style={{ display: 'grid', gap: '.5rem' }}>
        {lineas.map((l, i) => {
          const p = prodById(l.productoId);
          const cant = Number(l.cantidad.replace(',', '.')) || 0;
          const subtotal = p ? (Number(p.precio) || 0) * cant : 0;
          return (
            <div key={i} className="card" style={{ margin: 0, padding: '.6rem' }}>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-row" style={{ margin: 0, flex: '1 1 260px' }}>
                  <label>Producto</label>
                  <SearchSelect value={l.productoId} onChange={(v) => setLinea(i, { productoId: v })} options={opciones} placeholder="🔍 Buscar producto…" emptyText="Ningún producto coincide" />
                </div>
                <div className="form-row" style={{ margin: 0, width: 130 }}>
                  <label>Cantidad {p?.unidad ? `(${p.unidad})` : ''}</label>
                  <input className="input mono" type="number" min={0} step="any" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: e.target.value })} />
                </div>
                <div className="form-row" style={{ margin: 0, width: 120 }}>
                  <label>Valor</label>
                  <div className="mono" style={{ padding: '.45rem 0', fontWeight: 700 }}>{monto(subtotal, cuenta.moneda)}</div>
                </div>
                {lineas.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeLinea(i)}>✕</button>}
              </div>
              {p && cant > (Number(p.stock) || 0) && <small style={{ color: 'var(--danger)' }}>Stock insuficiente (hay {p.stock}).</small>}
            </div>
          );
        })}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={addLinea}>+ Agregar producto</button>

      <div className="card" style={{ marginTop: '.75rem', padding: '.6rem .85rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Valor total a entregar</span>
        <strong className="mono">{monto(valorTotal, cuenta.moneda)}</strong>
      </div>
      {valorTotal > saldo + 0.01 && (
        <small className="muted">El valor supera el saldo; solo se abonará {monto(saldo, cuenta.moneda)} (el resto no se aplica).</small>
      )}

      <div className="form-row" style={{ marginTop: '.5rem' }}>
        <label>Nota (opcional)</label>
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia del traslado / entrega" />
      </div>
    </Modal>
  );
}

/* ───────── Abonar una cuenta por pagar RECIBIENDO PRODUCTO (al cambio · entra al inventario) ───────── */
function AbonarConProductoRecibidoModal({ cuenta, actor, actorName, onClose, onAbonado }: {
  cuenta: CuentaPorPagar; actor: string; actorName: string | null; onClose: () => void; onAbonado: () => void | Promise<void>;
}) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [noRegistrado, setNoRegistrado] = useState(false);
  const [productoId, setProductoId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCategoria, setNuevoCategoria] = useState('GENERAL');
  const [nuevoUnidad, setNuevoUnidad] = useState('und');
  const [almacen, setAlmacen] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [valorUsd, setValorUsd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProductos().then(setProductos).catch(() => setProductos([]));
    getNombresAlmacenes().then((a) => { setAlmacenes(a); setAlmacen((p) => p || a[0] || 'General'); }).catch(() => setAlmacenes(['General']));
    getUnidades().then((u) => { setUnidades(u); setNuevoUnidad((p) => (u.includes(p) ? p : (u[0] ?? 'und'))); }).catch(() => setUnidades(['und']));
  }, []);

  const opciones = productos.map((p) => ({ value: p.id, label: `${p.sku} · ${p.nombre}` }));
  const saldo = round2(Number(cuenta.monto) - (Number(cuenta.abonado) || 0));
  const valor = round2(Number(valorUsd.replace(',', '.')) || 0);
  const saldoTras = round2(saldo - Math.min(valor, saldo));

  async function confirmar() {
    setError(null);
    const cant = Number(cantidad.replace(',', '.')) || 0;
    if (cant <= 0) { setError('Indicá la cantidad recibida.'); return; }
    if (valor <= 0) { setError('Indicá el valor del producto al cambio (USD).'); return; }
    if (!almacen) { setError('Elegí el almacén destino.'); return; }
    if (!noRegistrado && !productoId) { setError('Elegí el producto recibido (o marcá «producto no registrado»).'); return; }
    if (noRegistrado && !nuevoNombre.trim()) { setError('Escribí el nombre del producto nuevo.'); return; }
    setSaving(true);
    try {
      let pid = productoId;
      if (noRegistrado) {
        const nombre = nuevoNombre.trim().toUpperCase();
        // SKU correlativo por categoría (prefijo 3 letras + Nº incremental, p. ej. PRO-001).
        const categoria = nuevoCategoria.trim().toUpperCase() || 'GENERAL';
        const sku = await nextSku(categoria);
        const creado = await createProducto({
          sku, nombre, categoria,
          unidad: nuevoUnidad.trim() || 'und', stock: 0, stock_min: 0, precio: 0,
          almacen: almacen || 'General', estado: 'activo',
        });
        pid = creado.id;
      }
      await abonarCuentaConProductoRecibido({
        cuenta, productoId: pid, almacen, cantidad: cant, valorUsd: valor, actor, actorName,
      });
      notify(`Abono en producto (al cambio) · ${cuenta.contraparte} · ${monto(Math.min(valor, saldo), cuenta.moneda)} · entró al inventario`, 'success', { link: '#/app/tesoreria' });
      await onAbonado();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el abono con producto'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Abonar con producto (al cambio) · ${cuenta.contraparte}`} size="lg" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar} disabled={saving}>
          {saving ? 'Procesando…' : `Recibir y abonar ${monto(Math.min(valor, saldo), cuenta.moneda)}`}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        La contraparte salda entregando producto: <strong>entra al inventario</strong> y su <strong>valor al cambio (USD)</strong> abona la deuda. No entra dinero a caja. Saldo actual: <strong>{monto(saldo, cuenta.moneda)}</strong>.
      </p>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}

      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={noRegistrado} onChange={(e) => setNoRegistrado(e.target.checked)} />
        <span style={{ fontWeight: 600 }}>Producto no registrado (lo creo ahora)</span>
      </label>

      {noRegistrado ? (
        <div className="card" style={{ margin: 0, padding: '.6rem', marginBottom: '.6rem', display: 'grid', gap: '.5rem' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Nombre del producto *</label>
            <input className="input" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value.toUpperCase())} placeholder="Ej.: CASITERITA" />
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <div className="form-row" style={{ margin: 0, flex: '1 1 160px' }}>
              <label>Categoría</label>
              <input className="input" value={nuevoCategoria} onChange={(e) => setNuevoCategoria(e.target.value.toUpperCase())} />
            </div>
            <div className="form-row" style={{ margin: 0, flex: '1 1 120px' }}>
              <label>Unidad</label>
              <SearchSelect value={nuevoUnidad} onChange={setNuevoUnidad} options={unidades.map((u) => ({ value: u, label: u }))} placeholder="🔍 Unidad…" />
            </div>
          </div>
        </div>
      ) : (
        <div className="form-row">
          <label>Producto recibido</label>
          <SearchSelect value={productoId} onChange={setProductoId} options={opciones} placeholder="🔍 Buscar producto…" emptyText="Ningún producto coincide" />
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ flex: '1 1 220px' }}>
          <label>Almacén destino</label>
          <SearchSelect value={almacen} onChange={setAlmacen} options={almacenes.map((a) => ({ value: a, label: a }))} placeholder="🔍 Buscar almacén…" />
        </div>
        <div className="form-row" style={{ width: 160 }}>
          <label>Cantidad recibida</label>
          <input className="input mono" type="number" min={0} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Ej.: 500" />
        </div>
      </div>

      <div className="form-row">
        <label>Valor del producto al cambio (USD)</label>
        <input className="input mono" type="number" min={0} step="any" value={valorUsd} onChange={(e) => setValorUsd(e.target.value)} placeholder="Ej.: 10241" />
      </div>

      <div className="card" style={{ marginTop: '.4rem', padding: '.6rem .85rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Saldo tras abonar</span>
        <strong className="mono">{monto(saldoTras, cuenta.moneda)}</strong>
      </div>
      {valor > saldo + 0.01 && (
        <small className="muted">El valor supera el saldo; solo se abonará {monto(saldo, cuenta.moneda)} (el resto no se aplica).</small>
      )}
    </Modal>
  );
}

/* ───────── Cuentas por COBRAR (lo que nos deben) ───────── */
function CuentasPorCobrarModal({ cajas, actor, actorName, onClose, onChanged }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const [lista, setLista] = useState<CuentaPorCobrar[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [cargos, setCargos] = useState<CargoCxC[]>([]);
  const [cobros, setCobros] = useState<CobroCxC[]>([]);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [cuentaCaja, setCuentaCaja] = useState<CuentaCaja>('general');
  const [montoStr, setMontoStr] = useState('');
  const [tasaStr, setTasaStr] = useState('');
  const [nota, setNota] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inputs no controlados (monto/nota): este nonce remonta los campos al
  // limpiarlos tras registrar el cobro (el modal queda abierto).
  const [formKey, setFormKey] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const cs = await listCuentasPorCobrar(true);
      setLista(cs);
      setSelId((p) => (p && cs.some((c) => c.id === p)) ? p : (cs[0]?.id ?? ''));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['cuentas_por_cobrar', 'cuentas_por_cobrar_cargos', 'cuentas_por_cobrar_abonos'], () => { void cargar(); });
  useEffect(() => {
    if (!selId) { setCargos([]); setCobros([]); return; }
    listCargosCobrar(selId).then(setCargos).catch(() => setCargos([]));
    listCobrosCuenta(selId).then(setCobros).catch(() => setCobros([]));
  }, [selId]);

  const sel = lista.find((c) => c.id === selId) ?? null;
  // Cuenta destino del cobro: Bs → jurídica/personal; otras monedas → general.
  useEffect(() => { if (sel) setCuentaCaja(sel.moneda === 'Bs' ? 'juridica' : 'general'); }, [sel]);
  const saldo = sel ? round2(Number(sel.monto) - (Number(sel.cobrado) || 0)) : 0;
  const esBs = sel?.moneda === 'Bs';

  async function cobrar() {
    setError(null);
    if (!sel) return;
    // Lee monto y nota del DOM (no del estado) para evitar capturas incompletas.
    const leer = (n: string) => ((document.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? '');
    const m = Number(leer('cxc-monto')) || Number(montoStr) || 0;
    const notaVal = (leer('cxc-nota') || nota).trim();
    if (m <= 0) { setError('Indicá el monto a cobrar.'); return; }
    if (!cajaId) { setError('Elegí la caja que recibe el dinero.'); return; }
    if (!esBs && (Number(tasaStr) || 0) <= 0) { setError(`Indicá la tasa (Bs por ${sel.moneda}).`); return; }
    setSaving(true);
    try {
      const r = await registrarCobro({
        cuenta: sel, cajaId, cuentaCaja, monto: m, tasaBs: esBs ? 1 : (Number(tasaStr) || 0),
        nota: notaVal || null, actor, actorName,
      });
      notify(r.cuenta.estado === 'saldada'
        ? `Cuenta por cobrar saldada · ${sel.contraparte}`
        : `Cobro ${monto(m, sel.moneda)} · ${sel.contraparte}`, 'success', { link: '#/app/tesoreria' });
      setMontoStr(''); setNota('');
      setFormKey((k) => k + 1);
      await cargar(); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="💰 Cuentas por cobrar" size="xl" onClose={() => !saving && onClose()}
      footer={<button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Lo que un cliente/proveedor le debe a la empresa. Nace al <strong>pagar de más</strong> una cuenta por pagar (el excedente queda a favor) y se cobra con <strong>abonos</strong> (entradas de dinero a la caja). Acumula los cargos del mismo cliente. También podés <strong>agregar una cuenta por cobrar manual</strong> acá abajo.
      </p>
      <NuevaCuentaForm btnLabel="Nueva cuenta por cobrar (cliente / proveedor)"
        onCrear={async (inp) => { await crearOAcumularCuentaPorCobrar({ ...inp, actor, actorName }); await cargar(); await onChanged(); }} />
      {loading ? <p className="muted">Cargando…</p> : !lista.length ? (
        <p className="muted" style={{ textAlign: 'center' }}>No hay cuentas por cobrar todavía. Agregá una arriba. 🎉</p>
      ) : (
        <>
          <div className="form-row" style={{ marginBottom: '.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
              <label style={{ margin: 0 }}>Cuenta por cobrar ({lista.length})</label>
              <button className="btn btn-sm btn-ghost" title="Resumen de cuentas por cobrar en PDF (vista previa)"
                onClick={async () => {
                  try {
                    await descargarResumenCuentasPdf('Resumen de Cuentas por Cobrar', lista.map((c) => {
                      const tot = Number(c.monto) || 0;
                      const co = Number(c.cobrado) || 0;
                      return {
                        concepto: c.tipo === 'proveedor' ? 'PROVEEDOR' : 'CLIENTE',
                        contraparte: c.contraparte,
                        moneda: c.moneda,
                        total: tot, pagado: co, saldo: round2(tot - co),
                        estado: (c.estado || '').toUpperCase(),
                        fecha: c.created_at ?? null,
                      };
                    }), 'COBRADO');
                  } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
                }}>📄 Resumen</button>
            </div>
            <SearchSelect value={selId} onChange={setSelId} placeholder="🔍 Buscar cuenta…"
              options={lista.map((c) => ({ value: c.id, label: `${c.tipo === 'proveedor' ? '🏭' : '👤'} ${c.contraparte} · saldo ${monto(round2(Number(c.monto) - (Number(c.cobrado) || 0)), c.moneda)}` }))} />
          </div>

          {sel && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>TOTAL A COBRAR</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{monto(Number(sel.monto), sel.moneda)}</div>
                </div>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>COBRADO</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-3)' }}>{monto(Number(sel.cobrado) || 0, sel.moneda)}</div>
                </div>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>SALDO</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: saldo > 0 ? 'var(--warning)' : 'var(--success)' }}>{monto(saldo, sel.moneda)}</div>
                </div>
              </div>

              {/* Registrar un cobro: ENTRA dinero a la caja elegida. */}
              {saldo > 0.01 && (
                <div className="card" style={{ marginBottom: '.75rem' }}>
                  <div className="card-title"><span>Registrar cobro (entra a caja)</span></div>
                  {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {error}</div>}
                  <div className="form-grid">
                    <div className="form-row">
                      <label>Caja que recibe</label>
                      <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
                        {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    {esBs ? (
                      <div className="form-row">
                        <label>Cuenta (Bs)</label>
                        <select className="select" value={cuentaCaja} onChange={(e) => setCuentaCaja(e.target.value as CuentaCaja)}>
                          <option value="juridica">Jurídica</option>
                          <option value="personal">Personal</option>
                        </select>
                      </div>
                    ) : (
                      <div className="form-row">
                        <label>Tasa (Bs por {sel.moneda})</label>
                        <input className="input mono" type="number" name="cxc-tasa" min={0} step="any" defaultValue={tasaStr} onChange={(e) => setTasaStr(e.target.value)} placeholder="0.00" />
                      </div>
                    )}
                    <div className="form-row">
                      <label>Monto a cobrar ({sel.moneda})</label>
                      <input key={`cxc-monto-${formKey}`} className="input mono" type="number" name="cxc-monto" min={0} step="any" defaultValue={montoStr} onChange={(e) => setMontoStr(e.target.value)} placeholder="0.00" />
                      <small className="muted">Máx. {monto(saldo, sel.moneda)}</small>
                    </div>
                    <div className="form-row">
                      <label>Nota <span className="muted">(opcional)</span></label>
                      <input key={`cxc-nota-${formKey}`} className="input" name="cxc-nota" defaultValue={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota del cobro" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.5rem' }}>
                    <button className="btn btn-primary" onClick={() => void cobrar()} disabled={saving}>{saving ? 'Registrando…' : '＋ Registrar cobro'}</button>
                  </div>
                </div>
              )}

              {/* Historial de cargos (incremental). */}
              <strong style={{ fontSize: '.84rem' }}>Historial de cargos (lo que se le debe)</strong>
              <div className="table-wrap" style={{ marginBottom: '.7rem', marginTop: '.3rem' }}>
                <table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Monto cargado</th><th style={{ textAlign: 'right' }}>Total adeudado (acum.)</th><th>Nota</th></tr></thead>
                  <tbody>
                    {!cargos.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin cargos.</td></tr>}
                    {(() => { let acc = 0; return cargos.map((cg) => {
                      acc = round2(acc + Number(cg.monto || 0));
                      return (
                        <tr key={cg.id}>
                          <td>{dateTime(cg.at)}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(cg.monto), cg.moneda)}</td>
                          <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{monto(acc, cg.moneda)}</td>
                          <td className="muted">{cg.nota || '—'}</td>
                        </tr>
                      );
                    }); })()}
                  </tbody>
                </table>
              </div>

              {/* Historial de cobros + PDF. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
                <strong style={{ fontSize: '.84rem' }}>Historial de cobros</strong>
                <button className="btn btn-sm btn-ghost" title="Descargar el reporte en PDF"
                  onClick={async () => {
                    try { await descargarCuentaPorCobrarPdf(sel, cargos, cobros); }
                    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
                  }}>↓ PDF</button>
              </div>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Cobro</th><th style={{ textAlign: 'right' }}>Saldo restante</th><th>Nota</th></tr></thead>
                  <tbody>
                    {!cobros.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin cobros.</td></tr>}
                    {cobros.map((ab) => (
                      <tr key={ab.id}>
                        <td>{dateTime(ab.at)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(ab.monto), ab.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{ab.saldo_restante != null ? monto(Number(ab.saldo_restante), ab.moneda) : '—'}</td>
                        <td className="muted">{ab.nota || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/* ───────── Enviar por correo el reporte de una cuenta por pagar ───────── */
function EnviarCuentaPorPagarModal({ cuenta, abonos, ingresos, defaultEmail, onClose }: {
  cuenta: CuentaPorPagar; abonos: AbonoCxP[]; ingresos: IngresoCxP[]; defaultEmail: string; onClose: () => void;
}) {
  const [incluirPropio, setIncluirPropio] = useState(true);
  const [extra, setExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const propio = defaultEmail.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleEnviar() {
    const lista: string[] = [];
    if (incluirPropio && propio) lista.push(propio);
    const extraClean = extra.trim().toLowerCase();
    if (extraClean) {
      if (!emailRx.test(extraClean)) { toast('El correo adicional no es válido', 'error'); return; }
      lista.push(extraClean);
    }
    setEnviando(true);
    try {
      const r = await enviarCuentaPorPagarPorCorreo(cuenta, abonos, lista, ingresos);
      notify(`Reporte enviado a ${r.destinatarios.join(', ')}`, 'success', { link: '#/app/tesoreria' });
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setEnviando(false); }
  }

  return (
    <Modal title={`Enviar cuenta por pagar · ${cuenta.contraparte}`} size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>{enviando ? 'Enviando…' : '📧 Enviar'}</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Se enviará el PDF de la cuenta por pagar de <strong>{cuenta.contraparte}</strong> (con su historial de abonos) a los destinatarios seleccionados.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: incluirPropio ? 'rgba(255,138,0,0.06)' : 'transparent', cursor: propio ? 'pointer' : 'not-allowed', marginBottom: '.6rem' }}>
        <input type="checkbox" checked={incluirPropio} disabled={!propio} onChange={(e) => setIncluirPropio(e.target.checked)} />
        <div>
          <div style={{ fontWeight: 600 }}>Tu correo</div>
          <div className="mono" style={{ fontSize: '.82rem' }}>{propio || '—'}</div>
        </div>
      </label>
      <div className="form-row" style={{ marginTop: '.4rem' }}>
        <label>Correo adicional (opcional)</label>
        <input className="input" type="email" name="correo-extra" defaultValue={extra} onChange={(e) => setExtra(e.target.value)} placeholder="otro@correo.com" maxLength={120} />
        <small className="muted">Si no marcás ninguno, se envía a los admin/jefe.</small>
      </div>
    </Modal>
  );
}

/* Selector opcional para anclar un pago a un GASTO (categoría → subcategoría, ambas
   buscables/filtrables). Devuelve los NOMBRES elegidos al contenedor. */
function AnclarGastoFields({ categoria, subcategoria, onChange }: {
  categoria: string; subcategoria: string; onChange: (cat: string, sub: string) => void;
}) {
  const [rows, setRows] = useState<CategoriaGasto[]>([]);
  useEffect(() => { listCategoriasGasto(true).then(setRows).catch(() => setRows([])); }, []);
  const catOpts = useMemo(() => soloCategorias(rows).map((c) => c.nombre), [rows]);
  const catSel = useMemo(() => soloCategorias(rows).find((c) => c.nombre.toLowerCase() === categoria.trim().toLowerCase()) ?? null, [rows, categoria]);
  const subOpts = useMemo(() => (catSel ? subcategoriasDe(rows, catSel.id).map((s) => s.nombre) : []), [rows, catSel]);
  return (
    <div className="card" style={{ marginBottom: '.75rem' }}>
      <div className="card-title" style={{ marginBottom: '.4rem' }}>Anclar a un gasto <span className="muted">(opcional)</span></div>
      <div className="form-grid">
        <div className="form-row">
          <label>Categoría de gasto</label>
          <SearchSelect value={categoria} onChange={(v) => onChange(v, '')}
            placeholder={catOpts.length ? '🔍 Buscar categoría…' : '— sin categorías —'}
            options={catOpts.map((c) => ({ value: c, label: c }))} />
        </div>
        <div className="form-row">
          <label>Subcategoría</label>
          <SearchSelect value={subcategoria} onChange={(v) => onChange(categoria, v)} disabled={!catSel}
            placeholder={catSel ? (subOpts.length ? '🔍 Buscar subcategoría…' : '— sin subcategorías —') : 'Elegí una categoría primero'}
            options={subOpts.map((s) => ({ value: s, label: s }))} />
        </div>
      </div>
      {categoria && <small className="muted">El pago se etiqueta como gasto: <strong>{categoria}{subcategoria ? ` · ${subcategoria}` : ''}</strong> (además de pago de OC).</small>}
      {categoria && <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.3rem' }} onClick={() => onChange('', '')}>✕ Quitar gasto</button>}
    </div>
  );
}

function PagarOrdenModal({ row, cajas, actor, actorName, onClose, onPaid }: {
  row: OrdenPorPagar; cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const o = row.orden;
  // Contra entrega: se paga SOLO lo recibido (montoAPagar = recibido_total).
  // Si la OC está expresada en Bs (total_moneda='Bs'), se convierte a USD-equivalente con
  // la tasa BCV para que TODO el motor (que trabaja en USD) valide y convierta bien; al
  // pagar con una caja en Bs el monto vuelve a los mismos bolívares.
  const ordenEnBs = (o.total_moneda ?? 'USD') === 'Bs';
  const baseOrden = Number(row.montoAPagar ?? o.total) || 0;
  const pagoParcial = row.esContraEntrega && o.recibido_total != null && Number(o.recibido_total) < Number(o.total);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [montoStr, setMontoStr] = useState(String(baseOrden));
  const [factura, setFactura] = useState<File | null>(null);
  const [motivoPago, setMotivoPago] = useState('');
  // Anclaje opcional a un gasto (categoría → subcategoría).
  const [gastoCat, setGastoCat] = useState('');
  const [gastoSub, setGastoSub] = useState('');
  // Seriales de billetes entregados (solo cuando se paga con USD físico).
  const [seriales, setSeriales] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';
  // Imagen del pago (QR) que cargó Compras: Tesorería la ve para escanear y pagar directo.
  const [qrPagoUrl, setQrPagoUrl] = useState<string | null>(null);
  useEffect(() => {
    const p = o.metodo_pago_imagen_path;
    if (!p) { setQrPagoUrl(null); return; }
    getImagenOrdenSignedUrl(p).then(setQrPagoUrl).catch(() => setQrPagoUrl(null));
  }, [o.metodo_pago_imagen_path]);

  // Saldos multimoneda de la caja elegida (para el multipago por cuenta).
  const [primarySaldos, setPrimarySaldos] = useState<CajaSaldo[]>([]);
  const [legMontos, setLegMontos] = useState<Record<string, string>>({});
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  // Multipago ENTRE CAJAS: además de la caja primaria se pueden añadir otras cajas
  // para completar el total. Cada caja aporta sus cuentas/monedas con saldo.
  const [cajasExtra, setCajasExtra] = useState<string[]>([]);
  const [extraSaldos, setExtraSaldos] = useState<CajaSaldo[]>([]);
  useEffect(() => {
    if (!cajaId) { setPrimarySaldos([]); return; }
    saldosDeCaja(cajaId).then((rows) => setPrimarySaldos(rows.filter((r) => Number(r.saldo) > 0))).catch(() => setPrimarySaldos([]));
    setLegMontos({});
    setCajasExtra([]);
  }, [cajaId]);
  // Carga (y sintetiza, para cajas legadas sin caja_saldos) los saldos de las cajas extra.
  useEffect(() => {
    const ids = cajasExtra.filter((id) => id && id !== cajaId);
    if (!ids.length) { setExtraSaldos([]); return; }
    Promise.all(ids.map((id) => saldosDeCaja(id).then((rows) => ({ id, rows: rows.filter((r) => Number(r.saldo) > 0) })).catch(() => ({ id, rows: [] as CajaSaldo[] }))))
      .then((res) => {
        const out: CajaSaldo[] = [];
        for (const { id, rows } of res) {
          if (rows.length) { out.push(...rows); continue; }
          // Caja sin saldos multimoneda: usar su saldo visible (legado) como una cuenta.
          const cj = cajas.find((c) => c.id === id);
          if (cj && Number(cj.saldo) > 0) {
            out.push({ id: `legacy:${id}`, caja_id: id, cuenta: 'general', moneda: cj.moneda, saldo: Number(cj.saldo), tasa_prom: null } as unknown as CajaSaldo);
          }
        }
        setExtraSaldos(out);
      }).catch(() => setExtraSaldos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajasExtra.join('|'), cajaId]);
  // Lista combinada de cuentas disponibles para el multipago (primaria + extra).
  const saldosCaja = useMemo(() => [...primarySaldos, ...extraSaldos], [primarySaldos, extraSaldos]);
  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);
  // Si la caja maneja saldos por cuenta/moneda (caja_saldos), se paga eligiendo
  // de qué cuentas sale el dinero — aunque tenga una sola moneda con saldo.
  const esMultimoneda = saldosCaja.length >= 1;
  // Si el método de pago es en efectivo (divisas/Bs), no se exige comprobante.
  const comprobanteOpcional = pagoSinComprobante(o.metodo_pago);

  // El monto a pagar está en USD. Si se paga con una caja en Bs, se convierte
  // con la tasa BCV del día (editable). Se autocompleta el monto según la moneda.
  const [tasa, setTasa] = useState<number>(0);
  // Total de la OC en USD-equivalente: si la OC está en Bs, se divide por la tasa BCV.
  const totalUsd = ordenEnBs ? (tasa > 0 ? round2(baseOrden / tasa) : 0) : baseOrden;
  const [tasaFecha, setTasaFecha] = useState<string | null>(null);
  const [tasaLista, setTasaLista] = useState(false);
  // Comisión bancaria opcional: egreso EXTRA (no suma al total de la OC).
  const [comisionMonto, setComisionMonto] = useState('');
  const [comisionSaldoId, setComisionSaldoId] = useState('');
  useEffect(() => {
    getTasaHoy()
      .then((t) => { if (t.usd != null) setTasa(t.usd); setTasaFecha(t.fecha); })
      .catch(() => { /* sin tasa: el usuario la ingresa manualmente */ })
      .finally(() => setTasaLista(true));
  }, []);

  // Autocompletar el monto cuando cambia la moneda de la caja o la tasa.
  useEffect(() => {
    if (moneda === 'USD') setMontoStr(String(totalUsd));
    else if (tasa > 0) setMontoStr(String(aBs(totalUsd, tasa)));
  }, [moneda, tasa, totalUsd]);

  const montoNum = Number(montoStr) || 0;
  const totalBs = tasa > 0 ? aBs(totalUsd, tasa) : 0;
  // Equivalente del monto tecleado en la otra moneda.
  const equivOtra = moneda === 'Bs'
    ? (tasa > 0 ? aExtranjero(montoNum, tasa) : 0)   // Bs → $
    : (tasa > 0 ? aBs(montoNum, tasa) : 0);          // $ → Bs

  // Multipago: equivalente en USD de un monto en su propia moneda (tasa del día).
  function legUsd(monedaLeg: string, n: number): number {
    if (!n || n <= 0) return 0;
    if (monedaLeg === 'USD' || monedaLeg === 'USDT') return round2(n);
    if (monedaLeg === 'Bs') return tasa > 0 ? round2(n / tasa) : 0;
    if (monedaLeg === 'COP') return mercado?.copUsd ? round2(n / mercado.copUsd) : 0;
    return round2(n); // moneda desconocida: se asume paridad con el dólar
  }
  // Inverso de legUsd: cuánto representa, en la moneda de la cuenta, un monto en USD.
  function montoDesdeUsd(monedaLeg: string, usd: number): number {
    if (!usd || usd <= 0) return 0;
    if (monedaLeg === 'USD' || monedaLeg === 'USDT') return round2(usd);
    if (monedaLeg === 'Bs') return tasa > 0 ? round2(usd * tasa) : 0;
    if (monedaLeg === 'COP') return mercado?.copUsd ? round2(usd * mercado.copUsd) : 0;
    return round2(usd);
  }
  const sumUsdMulti = round2(saldosCaja.reduce((a, s) => a + legUsd(s.moneda, Number(legMontos[s.id]) || 0), 0));
  const cubreTotalMulti = sumUsdMulti >= totalUsd - 0.01;
  // No se puede pagar más que el total de la OC (ni en multipago ni en pago simple).
  const excedeTotalMulti = sumUsdMulti > totalUsd + 0.01;
  const montoUsdSimple = moneda === 'Bs' ? (tasa > 0 ? round2(montoNum / tasa) : 0) : round2(montoNum);
  const excedeTotalSimple = !esMultimoneda && montoUsdSimple > totalUsd + 0.01;
  const excedeTotal = esMultimoneda ? excedeTotalMulti : excedeTotalSimple;

  // Al elegir una caja multimoneda, prellenar cuánto sale de cada cuenta para
  // cubrir el total automáticamente (de mayor a menor saldo en USD), así el
  // usuario ve de una vez lo que debe pagar sin teclear el monto en Bs a mano.
  // Solo prellena cuando aún no se cargó nada (no pisa lo que el usuario edite).
  const saldosKey = saldosCaja.map((s) => s.id).join('|');
  // Objetivo por moneda indicado desde la OC (Compras puede repartir el total por
  // moneda; los montos vienen en USD). Si trae reparto, el prellenado lo respeta.
  const indicKey = JSON.stringify((o.metodo_pago ?? []).map((m) => [m.moneda, m.monto]));
  useEffect(() => {
    if (!saldosCaja.length || totalUsd <= 0) return;
    // Si hay cuentas en Bs/COP, esperar a tener la tasa para poder convertir.
    if (saldosCaja.some((s) => s.moneda === 'Bs') && !(tasa > 0)) return;
    if (saldosCaja.some((s) => s.moneda === 'COP') && !mercado?.copUsd) return;

    // Reparto por moneda que indicó Compras en la OC (montos en USD).
    const objetivo: Record<string, number> = {};
    let indicUsd = 0;
    for (const m of o.metodo_pago ?? []) {
      const u = round2(Number(m.monto) || 0);
      if (u <= 0) continue;
      objetivo[m.moneda] = round2((objetivo[m.moneda] || 0) + u);
      indicUsd = round2(indicUsd + u);
    }
    const usarIndic = indicUsd > 0.01;

    // Disponible (en USD) de cada cuenta y cuánto le vamos asignando.
    const capUsd = (s: CajaSaldo) => legUsd(s.moneda, Number(s.saldo));
    const asignadoUsd: Record<string, number> = {};
    // Paso 1: por cada moneda indicada, repartir su USD entre las cuentas de esa
    // moneda (de mayor a menor saldo).
    if (usarIndic) {
      for (const [mon, usdObj] of Object.entries(objetivo)) {
        let rest = usdObj;
        const legsMon = saldosCaja.filter((s) => s.moneda === mon).sort((a, b) => capUsd(b) - capUsd(a));
        for (const s of legsMon) {
          if (rest <= 0.01) break;
          const space = round2(capUsd(s) - (asignadoUsd[s.id] || 0));
          const use = Math.min(rest, space);
          if (use <= 0) continue;
          asignadoUsd[s.id] = round2((asignadoUsd[s.id] || 0) + use);
          rest = round2(rest - use);
        }
      }
    }
    // Paso 2: completar el total que falte (sin reparto, o monedas sin cuenta) de
    // mayor a menor saldo entre las cuentas con espacio libre.
    let totalAsig = round2(Object.values(asignadoUsd).reduce((a, b) => a + b, 0));
    let restante = round2(totalUsd - totalAsig);
    if (restante > 0.01) {
      const ordenadas = [...saldosCaja].sort((a, b) => capUsd(b) - capUsd(a));
      for (const s of ordenadas) {
        if (restante <= 0.01) break;
        const space = round2(capUsd(s) - (asignadoUsd[s.id] || 0));
        const use = Math.min(restante, space);
        if (use <= 0) continue;
        asignadoUsd[s.id] = round2((asignadoUsd[s.id] || 0) + use);
        restante = round2(restante - use);
      }
    }
    const next: Record<string, string> = {};
    for (const s of saldosCaja) {
      const u = asignadoUsd[s.id] || 0;
      if (u > 0) next[s.id] = dosDecimales(String(montoDesdeUsd(s.moneda, u)));
    }
    setLegMontos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldosKey, tasa, mercado, totalUsd, indicKey]);

  // ¿El pago entrega USD físico (efectivo)? Solo entonces se piden los seriales de
  // los billetes. Simple: caja en USD. Multimoneda: pata USD con monto cargado.
  const pagaUsdEfectivo = esMultimoneda
    ? saldosCaja.some((s) => s.moneda === 'USD' && (Number(legMontos[s.id]) || 0) > 0)
    : moneda === 'USD' && montoNum > 0;

  function agregarSerial() {
    const v = serialInput.trim();
    if (!v) return;
    if (seriales.includes(v)) { setSerialInput(''); return; }
    setSeriales((xs) => [...xs, v]);
    setSerialInput('');
  }
  function quitarSerial(s: string) {
    setSeriales((xs) => xs.filter((x) => x !== s));
  }

  // Archivos cargados durante la OC: cotizaciones (PDF) de las ofertas.
  const [adjuntos, setAdjuntos] = useState<OfertaProveedor[]>([]);
  const [descargando, setDescargando] = useState<string | null>(null);
  useEffect(() => {
    listOfertasByOrden(o.id)
      .then((rows) => setAdjuntos(rows.filter((r) => r.pdf_path)))
      .catch(() => setAdjuntos([]));
  }, [o.id]);

  async function descargarAdjunto(path: string, id: string) {
    setDescargando(id);
    try {
      const url = await getPdfOfertaSignedUrl(path);
      previewArchivo(url, path.split('/').pop() || 'oferta.pdf');
    } catch { toast('No se pudo abrir el archivo', 'error'); }
    finally { setDescargando(null); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja con la que se paga.'); return; }
    if (!comprobanteOpcional && !factura) { setError('Adjuntá el comprobante (PDF o imagen).'); return; }
    if (factura && factura.type && factura.type !== 'application/pdf' && !factura.type.startsWith('image/')) {
      setError('El comprobante debe ser un PDF o una imagen.'); return;
    }
    // Comisión bancaria opcional: sale de la billetera elegida (egreso extra, no suma al total).
    const comSaldo = saldosCaja.find((s) => s.id === comisionSaldoId) ?? saldosCaja[0] ?? null;
    const comMonto = Number(comisionMonto) || 0;
    if (comMonto > 0 && !comSaldo) { setError('Elegí de qué billetera sale la comisión bancaria.'); return; }
    const comision = comMonto > 0 && comSaldo
      ? { cajaId: comSaldo.caja_id, cuenta: comSaldo.cuenta as CuentaCaja, moneda: comSaldo.moneda, monto: comMonto, montoUsd: legUsd(comSaldo.moneda, comMonto) }
      : null;
    setSaving(true);
    try {
      if (esMultimoneda) {
        // Una pata por cuenta, cada una con SU caja (multipago entre cajas).
        const legs = saldosCaja
          .map((s) => ({ cajaId: s.caja_id, cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: Number(legMontos[s.id]) || 0 }))
          .filter((l) => l.monto > 0);
        if (!legs.length) { setError('Indicá cuánto pagar en al menos una cuenta.'); setSaving(false); return; }
        if (excedeTotalMulti) { setError(`No podés pagar más que el total de la OC. Cargado ${monto(sumUsdMulti, 'USD')}, total ${monto(totalUsd, 'USD')} (te pasaste por ${monto(round2(sumUsdMulti - totalUsd), 'USD')}).`); setSaving(false); return; }
        if (!cubreTotalMulti) { setError(`Lo cargado (${monto(sumUsdMulti, 'USD')}) no cubre el total (${monto(totalUsd, 'USD')}).`); setSaving(false); return; }
        await pagarOrdenCompraMultiCajas({ orden: o, legs, factura, motivoPago: motivoPago || null, gastoCategoria: gastoCat || null, gastoSubcategoria: gastoSub || null, seriales: pagaUsdEfectivo ? seriales : null, comision, actorEmail: actor, actorName });
        notify(`OC ${o.oc_codigo ?? o.codigo} pagada · multipago ${monto(sumUsdMulti, 'USD')}`, 'success', { link: '#/app/tesoreria' });
        onPaid();
        return;
      }
      if (excedeTotalSimple) { setError(`No podés pagar más que el total de la OC (${monto(totalUsd, 'USD')}). El monto ingresado equivale a ${monto(montoUsdSimple, 'USD')}.`); setSaving(false); return; }
      await pagarOrdenCompra({
        orden: o, cajaId, monto: Number(montoStr) || 0,
        factura, motivoPago: motivoPago || null, gastoCategoria: gastoCat || null, gastoSubcategoria: gastoSub || null,
        seriales: pagaUsdEfectivo ? seriales : null, comision, actorEmail: actor, actorName,
      });
      notify(`OC ${o.oc_codigo ?? o.codigo} pagada · ${monto(Number(montoStr) || 0, moneda)}`, 'success', { link: '#/app/tesoreria' });
      onPaid();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar.'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={() => descargarOrdenCompraPdf(o.id).catch(() => toast('No se pudo generar el PDF', 'error'))}>↓ OC PDF</button>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="pagar-oc" className="btn btn-primary" disabled={saving || excedeTotal}>{saving ? 'Pagando…' : excedeTotal ? 'Excede el total de la OC' : `PAGAR ORDEN · ${esMultimoneda ? monto(sumUsdMulti, 'USD') : monto(Number(montoStr) || 0, moneda)}`}</button>
    </>
  );

  return (
    <Modal title={`Pagar OC ${o.oc_codigo ?? o.codigo}`} size="lg" onClose={() => !saving && onClose()} footer={footer}>
      <form id="pagar-oc" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Trazabilidad: de la OP a la confirmación, con fechas */}
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Detalle de la orden</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
            <div><span className="muted">OP:</span> <strong className="mono">{o.codigo}</strong></div>
            <div><span className="muted">N°ODC:</span> <strong className="mono">{o.oc_codigo ?? '—'}</strong></div>
            <div><span className="muted">Proveedor:</span> {row.proveedorNombre}</div>
            <div><span className="muted">Solicitante:</span> {o.solicitante || o.solicitante_email}</div>
            <div><span className="muted">Unidad solicitante:</span> {o.unidad_solicitante?.trim() || <span className="muted">—</span>}</div>
            <div><span className="muted">Creada (OP):</span> {dateTime(o.created_at)}</div>
            <div><span className="muted">Aprobada (OP):</span> {o.aprobada_en ? dateTime(o.aprobada_en) : '—'}</div>
            <div><span className="muted">OC creada:</span> {o.oc_creada_en ? dateTime(o.oc_creada_en) : '—'}</div>
            <div><span className="muted">OC confirmada:</span> {o.oc_aprobada_en ? dateTime(o.oc_aprobada_en) : '—'}</div>
            <div><span className="muted">Condición de pago:</span>{' '}
              <span className="badge" style={{ background: 'var(--primary-2)', color: '#fff', fontWeight: 600 }}>
                {o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : 'Contado / anticipado'}
              </span>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><span className="muted">Finalidad:</span> {
              o.finalidad?.trim()
              || Array.from(new Set((o.items ?? []).map((it) => (it.finalidad ?? '').trim()).filter(Boolean))).join(' · ')
              || <span className="muted">—</span>
            }</div>
            <div style={{ gridColumn: '1 / -1' }}><span className="muted">Motivo:</span> {o.motivo?.trim() || <span className="muted">—</span>}</div>
            <div style={{ gridColumn: '1 / -1' }}><span className="muted">Nota (OP):</span> {o.notas?.trim() || <span className="muted">—</span>}</div>
            {(o.oc_seleccion_observacion || (o.oc_seleccion_adjuntos && o.oc_seleccion_adjuntos.length > 0)) && (
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '.4rem', marginTop: '.15rem' }}>
                <span className="muted">Justificación de la elección (analista):</span>{' '}
                {o.oc_seleccion_observacion
                  ? <span style={{ whiteSpace: 'pre-wrap' }}>{o.oc_seleccion_observacion}</span>
                  : <span className="muted">—</span>}
                {o.oc_seleccion_adjuntos && o.oc_seleccion_adjuntos.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.3rem' }}>
                    {o.oc_seleccion_adjuntos.map((a, i) => (
                      <button
                        key={a.path}
                        type="button"
                        className="btn btn-sm btn-ghost"
                        title={a.filename}
                        onClick={() => getPdfOfertaSignedUrl(a.path)
                          .then((url) => previewArchivo(url, a.filename || (a.path.split('/').pop() ?? 'adjunto')))
                          .catch(() => toast('No se pudo abrir el adjunto', 'error'))}
                      >
                        📎 {a.filename || `Adjunto ${i + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {pagoParcial && (
          <div className="card" style={{ marginBottom: '.75rem', borderLeft: '3px solid var(--warning)', background: 'var(--bg-1)' }}>
            <div style={{ fontSize: '.84rem' }}>
              <strong>Pago por monto recibido (recepción parcial).</strong> De {monto(o.total, 'USD')} pedidos
              se recibieron {monto(Number(o.recibido_total), 'USD')}; se paga solo lo recibido.
              {o.nota_recepcion && <div className="muted" style={{ marginTop: '.2rem' }}>Nota: {o.nota_recepcion}</div>}
            </div>
          </div>
        )}

        {/* Método de pago indicado en Compras (multipago) */}
        {o.metodo_pago && o.metodo_pago.length > 0 && (
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Método de pago indicado{comprobanteOpcional ? ' · efectivo (sin comprobante)' : ''}</div>
            {o.metodo_pago.map((m, i) => (
              <div key={i} style={{ padding: '.15rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem' }}>
                  <span>{labelMetodoPago(m.metodo)}</span>
                  <strong className="mono">{m.monto > 0 ? <>{monto(m.monto, 'USD')} <span className="muted" style={{ fontWeight: 400 }}>en {m.moneda}</span></> : m.moneda}</strong>
                </div>
                {m.datos && Object.keys(m.datos).length > 0 && (
                  <div className="muted" style={{ fontSize: '.74rem', paddingLeft: '.3rem' }}>↳ {resumenDatosPago(m.metodo, m.datos)}</div>
                )}
              </div>
            ))}
            {/* Imagen del pago (QR) que cargó Compras: escaneá y pagá directo. */}
            {qrPagoUrl && (
              <div style={{ marginTop: '.5rem', borderTop: '1px dashed var(--border)', paddingTop: '.5rem' }}>
                <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.3rem' }}>📷 Imagen / QR del pago — escaneá y pagá:</div>
                <a href={qrPagoUrl} target="_blank" rel="noreferrer" title="Ver en grande">
                  <img src={qrPagoUrl} alt="QR / imagen del pago" style={{ maxWidth: 220, maxHeight: 260, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'contain', background: '#fff' }} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Soporte / Retención: tipo y comprobantes (descarga) — reflejo del módulo Retenciones */}
        {o.comprobante_tipo && (
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Soporte / Retención</div>
            <div style={{ fontSize: '.85rem' }}>
              Soporte: <strong>{o.comprobante_tipo === 'factura' ? 'Factura' : 'Nota de entrega'}</strong>
              {o.comprobante_tipo === 'factura' && <> · Retención: <strong>{labelRetencionModo(o.retencion_modo)}</strong>{o.retencion_pagada ? <span className="badge" style={{ marginLeft: '.4rem', color: 'var(--success)' }}>✓ pagada</span> : null}</>}
            </div>
            {comprobantesDeOrden(o).length > 0 ? (
              <div style={{ display: 'grid', gap: '.3rem', marginTop: '.4rem' }}>
                {comprobantesDeOrden(o).map((c) => (
                  <div key={c.tipo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
                    <span><span className="badge">{c.label}</span> <span className="muted">{c.nombre}</span></span>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => urlRetencion(c.path).then((u) => previewArchivo(u, c.nombre || (c.path.split('/').pop() ?? 'comprobante'))).catch(() => toast('No se pudo abrir el comprobante', 'error'))}>📎 Ver</button>
                  </div>
                ))}
              </div>
            ) : o.comprobante_tipo === 'factura' ? (
              <div className="muted" style={{ fontSize: '.78rem', marginTop: '.3rem' }}>Retención aún no cargada en el módulo Retenciones.</div>
            ) : null}
          </div>
        )}

        <div className="table-wrap" style={{ marginBottom: '.75rem' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>SKU</th><th>Producto</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
            <tbody>
              {(o.items ?? []).map((it, i) => (
                <tr key={`${it.sku}-${i}`}>
                  <td className="mono">{it.sku}</td><td>{it.nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{it.cantidad}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(it.precio, o.total_moneda ?? 'USD')}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(it.cantidad * it.precio, o.total_moneda ?? 'USD')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4} style={{ textAlign: 'right' }}><strong>TOTAL</strong></td><td className="mono" style={{ textAlign: 'right' }}><strong>{monto(o.total, o.total_moneda ?? 'USD')}</strong></td></tr></tfoot>
          </table>
        </div>

        {/* Conversión $ ⇄ Bs con la tasa BCV del día (editable). */}
        <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Conversión del total</div>
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>{ordenEnBs ? 'Total en Bs' : 'Total en USD'}</div>
              <strong className="mono" style={{ fontSize: '1.15rem' }}>{ordenEnBs ? monto(o.total, 'Bs') : monto(totalUsd, 'USD')}</strong>
            </div>
            <div style={{ fontSize: '1.2rem' }} className="muted">⇄</div>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>{ordenEnBs ? 'Equivale en USD' : 'Equivale en Bs'}</div>
              <strong className="mono" style={{ fontSize: '1.15rem' }}>{ordenEnBs ? monto(totalUsd, 'USD') : (tasa > 0 ? monto(totalBs, 'Bs') : '—')}</strong>
            </div>
            <div style={{ fontSize: '1.2rem' }} className="muted">⇄</div>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>Equivale en USDT</div>
              <strong className="mono" style={{ fontSize: '1.15rem' }}>{totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</strong>
            </div>
            <div className="form-row" style={{ marginLeft: 'auto', minWidth: 160 }}>
              <label style={{ fontSize: '.72rem' }}>Tasa BCV (Bs por $){tasaFecha ? ` · ${fmtDate(tasaFecha)}` : ''}</label>
              <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
                onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder={tasaLista ? '0,00' : 'cargando…'} />
            </div>
          </div>
        </div>

        {/* Comisión bancaria opcional: egreso EXTRA de una billetera (no suma al total). */}
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Comisión bancaria <span className="muted" style={{ fontWeight: 400, fontSize: '.78rem' }}>(opcional · no suma al total de la OC)</span></div>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input mono" type="number" min={0} step="any" value={comisionMonto} onChange={(e) => setComisionMonto(dosDecimales(e.target.value))} placeholder="0,00" style={{ width: 140, textAlign: 'right' }} />
            <select className="select" value={comisionSaldoId} onChange={(e) => setComisionSaldoId(e.target.value)} style={{ maxWidth: 240 }}>
              <option value="">— billetera de la comisión —</option>
              {saldosCaja.map((s) => <option key={s.id} value={s.id}>{s.moneda}{s.cuenta !== 'general' ? ` · ${s.cuenta}` : ''} · {monto(Number(s.saldo), s.moneda)}</option>)}
            </select>
            <span className="muted" style={{ fontSize: '.78rem' }}>Se descuenta de la caja como gasto aparte.</span>
          </div>
        </div>

        {/* Archivos cargados durante la OC (cotizaciones de los proveedores). */}
        {adjuntos.length > 0 && (
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Archivos de la OC (cotizaciones)</div>
            {adjuntos.map((of) => (
              <div key={of.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', padding: '.25rem 0' }}>
                <span style={{ fontSize: '.84rem' }}>
                  {of.estado === 'aceptada' ? '✅ ' : '📄 '}
                  {of.pdf_filename ?? 'Cotización.pdf'}
                  <span className="muted"> · {monto(of.precio_total, 'USD')}{of.estado === 'aceptada' ? ' · elegida' : ''}</span>
                </span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={descargando === of.id}
                  onClick={() => descargarAdjunto(of.pdf_path!, of.id)}>
                  {descargando === of.id ? 'Abriendo…' : '↓ Descargar'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="form-grid">
          <div className="form-row">
            <label>Caja (de dónde sale el dinero)</label>
            <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajas.length}
              placeholder={cajas.length ? '🔍 Buscar caja…' : '— sin cajas —'}
              options={cajas.map((c) => ({ value: c.id, label: c.nombre }))} />
            <small className="muted">Se descuenta de esta caja y queda registrado en el registro de movimientos (pago de compra).{esMultimoneda ? ' Abajo elegís de qué cuentas (con saldo) sale el dinero.' : ''}</small>
          </div>
          {!esMultimoneda && (
            <div className="form-row">
              <label>Monto a pagar ({moneda})</label>
              <input className="input mono" type="number" min={0} step="any" value={montoStr} onChange={(e) => setMontoStr(dosDecimales(e.target.value))} required={!esMultimoneda}
                style={{ borderColor: excedeTotalSimple ? 'var(--danger)' : undefined }} />
              {excedeTotalSimple && (
                <small style={{ color: 'var(--danger)' }}>⚠ No podés pagar más que el total de la OC ({monto(totalUsd, 'USD')}{moneda === 'Bs' && tasa > 0 ? ` ≈ ${monto(aBs(totalUsd, tasa), 'Bs')}` : ''}).</small>
              )}
              {tasa > 0 && montoNum > 0 && (
                <small className="muted">
                  Equivale a <strong className="mono">{monto(equivOtra, moneda === 'Bs' ? 'USD' : 'Bs')}</strong>
                  {moneda === 'Bs'
                    ? ` · ${monto(montoNum, 'Bs')} ÷ ${tasa.toLocaleString('es-VE')}`
                    : ` · ${monto(montoNum, 'USD')} × ${tasa.toLocaleString('es-VE')}`}
                </small>
              )}
              {moneda === 'Bs' && <small className="muted">Se autocompletó con la tasa BCV; podés ajustarlo.</small>}
            </div>
          )}
        </div>

        {/* Multipago por cuenta: repartí el total entre las monedas de la caja Multimoneda. */}
        {esMultimoneda && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Multipago por cuenta · ¿cuánto sale de cada caja/moneda?</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.84rem' }}>
                <thead><tr><th>Caja</th><th>Moneda</th><th style={{ textAlign: 'right' }}>Disponible</th><th style={{ textAlign: 'right' }}>A pagar (en su moneda)</th><th style={{ textAlign: 'right' }}>Equiv. USD</th></tr></thead>
                <tbody>
                  {saldosCaja.map((s) => {
                    const n = Number(legMontos[s.id]) || 0;
                    const excede = n > Number(s.saldo);
                    const etiquetaCuenta = s.cuenta === 'general' ? '' : s.cuenta === 'juridica' ? ' · Jurídica' : ' · Personal';
                    const cajaNombre = cajas.find((c) => c.id === s.caja_id)?.nombre ?? '—';
                    return (
                      <tr key={s.id}>
                        <td>{cajaNombre}</td>
                        <td><span className="badge">{s.moneda}</span>{etiquetaCuenta}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(s.saldo), s.moneda)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input className="input mono" type="number" min={0} max={Number(s.saldo)} step="any"
                            value={legMontos[s.id] ?? ''} placeholder="0,00"
                            onChange={(e) => setLegMontos((m) => ({ ...m, [s.id]: dosDecimales(e.target.value) }))}
                            style={{ width: 130, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>{n > 0 ? monto(legUsd(s.moneda, n), 'USD') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Cubierto / Total</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: excedeTotalMulti ? 'var(--danger)' : cubreTotalMulti ? 'var(--success)' : 'var(--warning)' }}>
                      {monto(sumUsdMulti, 'USD')} / {monto(totalUsd, 'USD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Añadir otra caja para completar el total (multipago entre cajas). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '.8rem' }}>¿No alcanza una sola caja?</span>
              <div style={{ minWidth: 220 }}>
                <SearchSelect value="" onChange={(id) => { if (id) setCajasExtra((xs) => (xs.includes(id) ? xs : [...xs, id])); }}
                  placeholder="+ Añadir otra caja…"
                  options={cajas.filter((c) => c.id !== cajaId && !cajasExtra.includes(c.id)).map((c) => ({ value: c.id, label: c.nombre }))} />
              </div>
              {cajasExtra.length > 0 && (
                <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {cajasExtra.map((id) => (
                    <span key={id} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', background: 'var(--bg-1)' }}>
                      {cajas.find((c) => c.id === id)?.nombre ?? id}
                      <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .25rem', lineHeight: 1 }} title="Quitar caja"
                        onClick={() => setCajasExtra((xs) => xs.filter((x) => x !== id))}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
              {excedeTotalMulti
                ? <span style={{ color: 'var(--danger)' }}>⚠ Te pasaste por <strong>{monto(round2(sumUsdMulti - totalUsd), 'USD')}</strong>. No podés pagar más que el total de la OC ({monto(totalUsd, 'USD')}).</span>
                : cubreTotalMulti
                ? <>✓ Cubre exactamente el total. Cada moneda se descuenta de su saldo real con la tasa del día.</>
                : <>Faltan <strong>{monto(round2(totalUsd - sumUsdMulti), 'USD')}</strong>. Bs↔$ usa la tasa BCV de arriba.</>}
            </small>
          </div>
        )}
        {/* Seriales de los billetes entregados (solo al pagar con USD físico). */}
        {pagaUsdEfectivo && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>
              Seriales de los billetes entregados <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label style={{ fontSize: '.72rem' }}>Serial del billete</label>
                <input className="input mono" value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarSerial(); } }}
                  placeholder="Ej.: AB 1234567 C" />
              </div>
              <button type="button" className="btn btn-ghost" onClick={agregarSerial}>+ Agregar</button>
            </div>
            {seriales.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.5rem' }}>
                {seriales.map((s, i) => (
                  <span key={s} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: 'var(--bg-1)' }}>
                    <span className="muted">{i + 1}.</span><span className="mono">{s}</span>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .25rem', lineHeight: 1 }}
                      title="Quitar" onClick={() => quitarSerial(s)}>✕</button>
                  </span>
                ))}
                <span className="muted" style={{ alignSelf: 'center', fontSize: '.8rem' }}>{seriales.length} billete(s)</span>
              </div>
            ) : (
              <small className="muted" style={{ display: 'block', marginTop: '.4rem' }}>
                Agregá un serial por billete. Quedan registrados con el pago.
              </small>
            )}
          </div>
        )}

        <div className="form-grid">
          <div className="form-row">
            <label>Comprobante (PDF o imagen) {comprobanteOpcional ? '(opcional)' : '*'}</label>
            <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} required={!comprobanteOpcional} />
            {factura && <small className="muted">{factura.name}</small>}
            {comprobanteOpcional && <small className="muted">Pago en efectivo: el comprobante no es obligatorio.</small>}
          </div>
          <div className="form-row">
            <label>Motivo del pago</label>
            <input className="input" name="oc-motivo" defaultValue={motivoPago} onChange={(e) => setMotivoPago(e.target.value)} placeholder="Nota del pago (opcional)" />
            <small className="muted">Se suma al motivo de la OP en el registro de movimientos.</small>
          </div>
        </div>

        <AnclarGastoFields categoria={gastoCat} subcategoria={gastoSub} onChange={(c, s) => { setGastoCat(c); setGastoSub(s); }} />
      </form>

      {/* Chat interno con Compras (mismo hilo que la OC en Pedidos): coordinar el método
          de pago / aclarar la orden sin salir de Tesorería. */}
      <ChatOrden ordenId={o.id} ordenLabel={o.oc_codigo ?? o.codigo} autorNombre={actorName ?? actor} />
    </Modal>
  );
}
