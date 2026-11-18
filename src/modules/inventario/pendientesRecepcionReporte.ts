/* ============================================================
   Golden Touch · Inventario · Motor Dinámico de Pendientes por Recepcionar
   (18/11/2026)

   Unifica las órdenes pendientes por recepción (`Orden` — tanto Órdenes de
   Compra `OC` como Control de Servicios `CS`) y las Compras Directas pagadas
   pendientes de entrada (`CompraDirecta`) en un modelo común con:
   - Analista encargado (siempre Nombre y Apellido real, nunca correo con @)
   - Fecha en que se montó la orden (`oc_creada_en` / `enviada_pagar_at`)
   - Fecha en que pagó Tesorería (`pagada_en` / `pagada_at`)
   - Filtrado dinámico, selección individual por fila, agrupación, ordenamiento
     y selección de campos para PDF y WhatsApp.
   ============================================================ */

import type { Orden } from '@/shared/lib/types';
import type { CompraDirecta } from '@/modules/pedidos/compras.repository';
import { date, dateTime, money, num, montoMoneda } from '@/shared/lib/format';
import { nombrePersonaCompras } from '@/modules/pedidos/personasCompras';
import { quienSync } from '@/shared/lib/directorioUsuarios';

export type OrigenPendienteRecepcion = 'oc' | 'cs' | 'directa';
export type EstadoPendienteRecepcion = 'pagada' | 'por_recibir';

export type CriterioFechaPendientes = 'todas' | 'montada' | 'pago';

export type AgrupacionPendientesRecepcion =
  | 'sin_agrupar'
  | 'analista'
  | 'almacen'
  | 'proveedor'
  | 'solicitante'
  | 'origen'
  | 'estado';

export type OrdenPendientesRecepcion =
  | 'pago_reciente'
  | 'pago_antiguo'
  | 'montada_reciente'
  | 'montada_antigua'
  | 'antiguedad_desc'
  | 'monto_desc'
  | 'codigo_asc';

export type CampoPendienteRecepcion =
  | 'codigo'
  | 'tipo_estado'
  | 'analista'
  | 'fecha_montada'
  | 'fecha_pago'
  | 'dias'
  | 'proveedor'
  | 'solicitante'
  | 'almacen'
  | 'items'
  | 'detalle_items'
  | 'monto';

export interface DefinicionCampoPendiente {
  clave: CampoPendienteRecepcion;
  etiqueta: string;
  etiquetaCorta: string;
  alineacion: 'left' | 'center' | 'right';
  porDefecto: boolean;
}

export const CAMPOS_PENDIENTES_RECEPCION: DefinicionCampoPendiente[] = [
  { clave: 'codigo', etiqueta: 'Código (OC / CS / CD)', etiquetaCorta: 'Código', alineacion: 'left', porDefecto: true },
  { clave: 'tipo_estado', etiqueta: 'Tipo / Estado', etiquetaCorta: 'Estado', alineacion: 'center', porDefecto: true },
  { clave: 'analista', etiqueta: 'Analista encargado', etiquetaCorta: 'Analista encargado', alineacion: 'left', porDefecto: true },
  { clave: 'fecha_montada', etiqueta: 'Fecha montada', etiquetaCorta: 'Fecha montada', alineacion: 'center', porDefecto: true },
  { clave: 'fecha_pago', etiqueta: 'Fecha pago Tesorería', etiquetaCorta: 'Pago Tesorería', alineacion: 'center', porDefecto: true },
  { clave: 'dias', etiqueta: 'Días pendientes', etiquetaCorta: 'Días', alineacion: 'right', porDefecto: true },
  { clave: 'proveedor', etiqueta: 'Proveedor', etiquetaCorta: 'Proveedor', alineacion: 'left', porDefecto: true },
  { clave: 'solicitante', etiqueta: 'Solicitante / Unidad', etiquetaCorta: 'Solicita', alineacion: 'left', porDefecto: true },
  { clave: 'almacen', etiqueta: 'Almacén destino', etiquetaCorta: 'Destino', alineacion: 'left', porDefecto: true },
  { clave: 'items', etiqueta: 'Ítems / Unidades', etiquetaCorta: 'Ítems / Und.', alineacion: 'right', porDefecto: true },
  { clave: 'detalle_items', etiqueta: 'Desglose de renglones', etiquetaCorta: 'Renglones', alineacion: 'left', porDefecto: false },
  { clave: 'monto', etiqueta: 'Monto ($)', etiquetaCorta: 'Monto ($)', alineacion: 'right', porDefecto: true },
];

export const CAMPOS_POR_DEFECTO_PENDIENTES: CampoPendienteRecepcion[] =
  CAMPOS_PENDIENTES_RECEPCION.filter((c) => c.porDefecto).map((c) => c.clave);

export interface ItemPendienteRecepcion {
  sku: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  subtotalUsd: number;
}

export interface FilaPendienteRecepcion {
  uid: string;
  id: string;
  origen: OrigenPendienteRecepcion;
  origenLabel: string;
  origenCorto: 'OC' | 'CS' | 'CD';
  codigo: string;
  codigoSolicitud: string | null;
  estado: EstadoPendienteRecepcion;
  estadoLabel: string;
  condicionesPago: string | null;
  analista: string;
  fechaMontadaIso: string | null;
  fechaMontadaDia: string;
  fechaMontadaFmt: string;
  fechaMontadaHoraFmt: string;
  fechaPagoIso: string | null;
  fechaPagoDia: string;
  fechaPagoFmt: string;
  fechaPagoHoraFmt: string;
  tienePagoTesoreria: boolean;
  diasPendiente: number;
  proveedor: string;
  solicitante: string;
  unidadSolicitante: string | null;
  almacenDestino: string;
  numItems: number;
  totalUnidades: number;
  moneda: 'USD' | 'Bs';
  montoNativo: number;
  montoNativoFmt: string;
  montoUsd: number;
  items: ItemPendienteRecepcion[];
  itemsResumen: string;
}

export interface FiltrosReportePendientes {
  busqueda: string;
  origenes: OrigenPendienteRecepcion[];
  estados: EstadoPendienteRecepcion[];
  analista: string;
  almacen: string;
  solicitante: string;
  criterioFecha: CriterioFechaPendientes;
  desde: string;
  hasta: string;
  uidsExcluidos: string[];
}

export interface GrupoPendientesRecepcion {
  clave: string;
  titulo: string;
  filas: FilaPendienteRecepcion[];
  totalOrdenes: number;
  totalUnidades: number;
  totalMontoUsd: number;
}

export interface ResumenPendientesRecepcion {
  totalOrdenes: number;
  totalOc: number;
  totalCs: number;
  totalDirectas: number;
  totalPagadas: number;
  totalPorRecibirSinPago: number;
  totalItems: number;
  totalUnidades: number;
  totalMontoUsd: number;
  promedioDiasPendiente: number;
  maxDiasPendiente: number;
}

export type ResolverPersonaFn = (guardado: string | null | undefined, correo?: string | null) => string;

const TZ_VE = 'America/Caracas';

/** Convierte un ISO a `YYYY-MM-DD` en hora de Venezuela para filtros exactos de fecha. */
export function isoADiaVE(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ_VE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {
    // fallback
  }
  return d.toISOString().slice(0, 10);
}

/** Limpia cualquier identificador (correo o nombre) a Nombre y Apellido en mayúsculas sin `@`. */
export function limpiarNombrePersona(
  guardado: string | null | undefined,
  correo?: string | null,
  resolver?: ResolverPersonaFn,
  mapaPersonas?: Map<string, string>,
): string {
  const fn = resolver ?? quienSync;
  const candidato = fn(guardado, correo)?.trim() || '';
  if (candidato && !candidato.includes('@')) {
    return candidato.toUpperCase();
  }
  const porCompras =
    nombrePersonaCompras(correo, mapaPersonas) ||
    nombrePersonaCompras(guardado, mapaPersonas) ||
    nombrePersonaCompras(candidato, mapaPersonas);
  return porCompras ? porCompras.toUpperCase() : '';
}

/** Extrae el correo/identificador crudo del analista encargado de montar la OC / CS. */
export function identificadorAnalistaOrden(
  o: Pick<Orden, 'oc_creada_por' | 'oc_emitida_por' | 'metodo_pago_por' | 'aprobada_por' | 'historial'>,
): string | null {
  const directo = (o.oc_creada_por || o.oc_emitida_por || o.metodo_pago_por || '').trim();
  if (directo) return directo;
  const historial = Array.isArray(o.historial) ? o.historial : [];
  const ev = [...historial]
    .reverse()
    .find((h) => h?.actor && /^(oc_creada|oc_emitida|metodo_pago)/.test(String(h.evento ?? '')));
  if (ev?.actor?.trim()) return ev.actor.trim();
  return o.aprobada_por?.trim() || null;
}

/** Nombre y Apellido limpio del analista encargado de una `Orden` (`OC` o `CS`). */
export function resolverAnalistaOrden(
  o: Pick<Orden, 'oc_creada_por' | 'oc_emitida_por' | 'metodo_pago_por' | 'aprobada_por' | 'historial'>,
  resolver?: ResolverPersonaFn,
  mapaPersonas?: Map<string, string>,
): string {
  const raw = identificadorAnalistaOrden(o);
  if (!raw) return 'Por asignar';
  return limpiarNombrePersona(null, raw, resolver, mapaPersonas) || 'Por asignar';
}

/** Nombre y Apellido limpio del analista encargado de una `CompraDirecta`. */
export function resolverAnalistaCompraDirecta(
  c: Pick<CompraDirecta, 'actor' | 'actor_name'>,
  resolver?: ResolverPersonaFn,
  mapaPersonas?: Map<string, string>,
): string {
  const nombre = limpiarNombrePersona(c.actor_name, c.actor, resolver, mapaPersonas);
  return nombre || 'Por asignar';
}

/** Fecha exacta en que se montó la orden (`oc_creada_en` -> `oc_emitida_en` -> historial `oc_creada` -> `created_at`). */
export function fechaMontadaOrden(
  o: Pick<Orden, 'oc_creada_en' | 'oc_emitida_en' | 'created_at' | 'historial'>,
): string | null {
  if (o.oc_creada_en) return o.oc_creada_en;
  if (o.oc_emitida_en) return o.oc_emitida_en;
  const historial = Array.isArray(o.historial) ? o.historial : [];
  const ev = [...historial]
    .reverse()
    .find((h) => h?.at && /^oc_creada/.test(String(h.evento ?? '')));
  if (ev?.at) return ev.at;
  return o.created_at ?? null;
}

/** Fecha exacta en que Tesorería registró el pago de la orden (`pagada_en` -> historial `pagada`). */
export function fechaPagoTesoreriaOrden(
  o: Pick<Orden, 'pagada_en' | 'historial'>,
): string | null {
  if (o.pagada_en) return o.pagada_en;
  const historial = Array.isArray(o.historial) ? o.historial : [];
  const ev = [...historial]
    .reverse()
    .find((h) => h?.at && String(h.evento ?? '') === 'pagada');
  return ev?.at ?? null;
}

/** Texto legible cuando una orden pendiente de recepción aún no tiene pago de Tesorería. */
export function etiquetaSinPagoTesoreria(condicionesPago?: string | null): string {
  if (condicionesPago === 'contra_entrega') return 'Contra entrega (sin pago)';
  if (condicionesPago === 'credito') return 'A crédito (sin pago)';
  return 'Pendiente de pago';
}

/** Días transcurridos esperando recepción (desde el pago de Tesorería o desde que se montó). */
export function calcularDiasPendiente(
  fechaPagoIso: string | null | undefined,
  fechaMontadaIso: string | null | undefined,
  ahoraMs: number = Date.now(),
): number {
  const ref = fechaPagoIso || fechaMontadaIso;
  if (!ref) return 0;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahoraMs - t) / 86_400_000));
}

export interface OpcionesNormalizarPendientes {
  ordenesPendientes: Orden[];
  comprasPendientes?: CompraDirecta[];
  proveedoresMap?: Map<string, string>;
  personasMap?: Map<string, string>;
  resolverPersona?: ResolverPersonaFn;
  tasaUsdHoy?: number;
  ahoraMs?: number;
}

/** Convierte `Orden[]` y `CompraDirecta[]` en filas homogéneas listas para tarjetas, tabla, PDF y WhatsApp. */
export function normalizarPendientesRecepcion({
  ordenesPendientes,
  comprasPendientes = [],
  proveedoresMap,
  personasMap,
  resolverPersona,
  tasaUsdHoy = 0,
  ahoraMs = Date.now(),
}: OpcionesNormalizarPendientes): FilaPendienteRecepcion[] {
  const filas: FilaPendienteRecepcion[] = [];

  for (const o of ordenesPendientes) {
    const codigoPrincipal = (o.oc_codigo || o.codigo || '').trim() || 'SIN CÓDIGO';
    const esServicio = o.tipo === 'servicio' || codigoPrincipal.toUpperCase().startsWith('CS-');
    const origen: OrigenPendienteRecepcion = esServicio ? 'cs' : 'oc';
    const fMontada = fechaMontadaOrden(o);
    const fPago = fechaPagoTesoreriaOrden(o);
    const sinPagoTxt = etiquetaSinPagoTesoreria(o.condiciones_pago);

    const itemsRaw = Array.isArray(o.items) ? o.items : [];
    const items: ItemPendienteRecepcion[] = itemsRaw.map((it) => {
      const cant = Number(it.cantidad) || 0;
      const precio = Number(it.precio) || 0;
      return {
        sku: String(it.sku ?? '').trim(),
        nombre: String(it.nombre ?? 'Ítem').trim(),
        cantidad: cant,
        unidad: String(it.unidad ?? '').trim(),
        subtotalUsd: Math.round(cant * precio * 100) / 100,
      };
    });
    const totalUnidades = items.reduce((acc, it) => acc + it.cantidad, 0);
    const provNombre = (o.proveedor_id ? proveedoresMap?.get(o.proveedor_id) : '')?.trim() || 'Por confirmar';
    const solicitanteLimpio =
      limpiarNombrePersona(o.solicitante, o.solicitante_email, resolverPersona, personasMap) ||
      (o.solicitante ?? '').trim() ||
      '—';

    const montoUsd = Number(o.total) || 0;

    filas.push({
      uid: `orden:${o.id}`,
      id: o.id,
      origen,
      origenLabel: esServicio ? 'Control de Servicio (CS)' : 'Orden de Compra (OC)',
      origenCorto: esServicio ? 'CS' : 'OC',
      codigo: codigoPrincipal,
      codigoSolicitud: o.oc_codigo && o.codigo && o.codigo !== o.oc_codigo ? o.codigo : null,
      estado: o.estado === 'pagada' ? 'pagada' : 'por_recibir',
      estadoLabel: o.estado === 'pagada' ? 'Pagada' : 'Pendiente por recepción',
      condicionesPago: o.condiciones_pago ?? null,
      analista: resolverAnalistaOrden(o, resolverPersona, personasMap),
      fechaMontadaIso: fMontada,
      fechaMontadaDia: isoADiaVE(fMontada),
      fechaMontadaFmt: fMontada ? date(fMontada) : '—',
      fechaMontadaHoraFmt: fMontada ? dateTime(fMontada) : '—',
      fechaPagoIso: fPago,
      fechaPagoDia: isoADiaVE(fPago),
      fechaPagoFmt: fPago ? date(fPago) : sinPagoTxt,
      fechaPagoHoraFmt: fPago ? dateTime(fPago) : sinPagoTxt,
      tienePagoTesoreria: Boolean(fPago),
      diasPendiente: calcularDiasPendiente(fPago, fMontada, ahoraMs),
      proveedor: provNombre,
      solicitante: solicitanteLimpio,
      unidadSolicitante: o.unidad_solicitante?.trim() || null,
      almacenDestino: esServicio ? 'Servicio (Equipo)' : (o.almacen_destino?.trim() || 'General'),
      numItems: items.length,
      totalUnidades,
      moneda: 'USD',
      montoNativo: montoUsd,
      montoNativoFmt: money(montoUsd),
      montoUsd,
      items,
      itemsResumen: items.map((it) => `${it.nombre} (${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''})`).join(', ') || 'Sin ítems',
    });
  }

  for (const c of comprasPendientes) {
    const fMontada = c.enviada_pagar_at || c.created_at || null;
    const fPago = c.pagada_at || null;
    const esBs = c.moneda === 'Bs';
    const tasaRef = Number(c.tasa_pago) || Number(c.tasa_conversion) || tasaUsdHoy || 0;
    const gastoNativo = Number(c.gasto) || 0;
    const montoUsd = esBs
      ? (tasaRef > 0 ? Math.round((gastoNativo / tasaRef) * 100) / 100 : 0)
      : gastoNativo;

    const itemsRaw = Array.isArray(c.items) ? c.items : [];
    const items: ItemPendienteRecepcion[] = itemsRaw.map((it) => {
      const cant = Number(it.cantidad) || 0;
      const g = Number(it.gasto) || 0;
      const subUsd = esBs ? (tasaRef > 0 ? Math.round((g / tasaRef) * 100) / 100 : 0) : g;
      return {
        sku: String(it.producto_sku ?? '').trim(),
        nombre: String(it.producto_nombre ?? 'Material').trim(),
        cantidad: cant,
        unidad: String(it.unidad ?? '').trim(),
        subtotalUsd: subUsd,
      };
    });
    const totalUnidades = items.reduce((acc, it) => acc + it.cantidad, 0);
    const analista = resolverAnalistaCompraDirecta(c, resolverPersona, personasMap);
    const provNombre =
      c.proveedor_nombre?.trim() ||
      (c.proveedor_id ? proveedoresMap?.get(c.proveedor_id)?.trim() : '') ||
      'Compra directa';

    filas.push({
      uid: `directa:${c.id}`,
      id: c.id,
      origen: 'directa',
      origenLabel: 'Compra Directa (CD)',
      origenCorto: 'CD',
      codigo: (c.codigo || 'Compra directa').trim(),
      codigoSolicitud: null,
      estado: 'pagada',
      estadoLabel: 'Pagada',
      condicionesPago: 'contado',
      analista,
      fechaMontadaIso: fMontada,
      fechaMontadaDia: isoADiaVE(fMontada),
      fechaMontadaFmt: fMontada ? date(fMontada) : '—',
      fechaMontadaHoraFmt: fMontada ? dateTime(fMontada) : '—',
      fechaPagoIso: fPago,
      fechaPagoDia: isoADiaVE(fPago),
      fechaPagoFmt: fPago ? date(fPago) : 'Pendiente de pago',
      fechaPagoHoraFmt: fPago ? dateTime(fPago) : 'Pendiente de pago',
      tienePagoTesoreria: Boolean(fPago),
      diasPendiente: calcularDiasPendiente(fPago, fMontada, ahoraMs),
      proveedor: provNombre,
      solicitante: analista,
      unidadSolicitante: 'COMPRAS DIRECTAS',
      almacenDestino: c.almacen?.trim() || 'General',
      numItems: items.length,
      totalUnidades,
      moneda: esBs ? 'Bs' : 'USD',
      montoNativo: gastoNativo,
      montoNativoFmt: montoMoneda(gastoNativo, c.moneda),
      montoUsd,
      items,
      itemsResumen: items.map((it) => `${it.nombre} (${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''})`).join(', ') || 'Sin materiales',
    });
  }

  return filas;
}

const normTxt = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Aplica los filtros de interfaz (sin excluir por checkbox aún, para permitir ver y marcar/desmarcar en tabla). */
export function filtrarCandidatasPendientes(
  filas: FilaPendienteRecepcion[],
  filtros: Omit<FiltrosReportePendientes, 'uidsExcluidos'>,
): FilaPendienteRecepcion[] {
  const q = normTxt(filtros.busqueda);

  return filas.filter((f) => {
    if (filtros.origenes.length > 0 && !filtros.origenes.includes(f.origen)) return false;
    if (filtros.estados.length > 0 && !filtros.estados.includes(f.estado)) return false;
    if (filtros.analista && f.analista !== filtros.analista) return false;
    if (filtros.almacen && f.almacenDestino !== filtros.almacen) return false;
    if (filtros.solicitante && f.solicitante !== filtros.solicitante) return false;

    if (filtros.criterioFecha !== 'todas' && (filtros.desde || filtros.hasta)) {
      const dia = filtros.criterioFecha === 'pago' ? f.fechaPagoDia : f.fechaMontadaDia;
      if (!dia) return false;
      if (filtros.desde && dia < filtros.desde) return false;
      if (filtros.hasta && dia > filtros.hasta) return false;
    }

    if (q) {
      const pajar = normTxt([
        f.codigo,
        f.codigoSolicitud ?? '',
        f.analista,
        f.proveedor,
        f.solicitante,
        f.unidadSolicitante ?? '',
        f.almacenDestino,
        f.fechaMontadaFmt,
        f.fechaPagoFmt,
        f.itemsResumen,
      ].join(' '));
      if (!pajar.includes(q)) return false;
    }

    return true;
  });
}

/** Filas finales seleccionadas para exportar (tras aplicar filtros + exclusiones por checkbox). */
export function obtenerFilasSeleccionadasPendientes(
  filas: FilaPendienteRecepcion[],
  filtros: FiltrosReportePendientes,
  orden: OrdenPendientesRecepcion,
): FilaPendienteRecepcion[] {
  const excluidos = new Set(filtros.uidsExcluidos);
  const candidatas = filtrarCandidatasPendientes(filas, filtros).filter((f) => !excluidos.has(f.uid));
  return ordenarPendientesRecepcion(candidatas, orden);
}

const tsSeguro = (iso: string | null): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function ordenarPendientesRecepcion(
  filas: FilaPendienteRecepcion[],
  orden: OrdenPendientesRecepcion,
): FilaPendienteRecepcion[] {
  const copia = [...filas];
  copia.sort((a, b) => {
    switch (orden) {
      case 'pago_reciente':
        return (tsSeguro(b.fechaPagoIso) || tsSeguro(b.fechaMontadaIso)) - (tsSeguro(a.fechaPagoIso) || tsSeguro(a.fechaMontadaIso));
      case 'pago_antiguo':
        return (tsSeguro(a.fechaPagoIso) || tsSeguro(a.fechaMontadaIso)) - (tsSeguro(b.fechaPagoIso) || tsSeguro(b.fechaMontadaIso));
      case 'montada_reciente':
        return tsSeguro(b.fechaMontadaIso) - tsSeguro(a.fechaMontadaIso);
      case 'montada_antigua':
        return tsSeguro(a.fechaMontadaIso) - tsSeguro(b.fechaMontadaIso);
      case 'antiguedad_desc':
        return b.diasPendiente - a.diasPendiente || b.montoUsd - a.montoUsd;
      case 'monto_desc':
        return b.montoUsd - a.montoUsd;
      case 'codigo_asc':
        return a.codigo.localeCompare(b.codigo, 'es-VE');
      default:
        return 0;
    }
  });
  return copia;
}

export const ETIQUETA_AGRUPACION_PENDIENTES: Record<AgrupacionPendientesRecepcion, string> = {
  sin_agrupar: 'Sin agrupar (Lista detallada)',
  analista: 'Por Analista encargado',
  almacen: 'Por Almacén destino',
  proveedor: 'Por Proveedor',
  solicitante: 'Por Solicitante',
  origen: 'Por Tipo (OC / CS / Directa)',
  estado: 'Por Estado (Pagada / Por recibir)',
};

export function agruparPendientesRecepcion(
  filas: FilaPendienteRecepcion[],
  agrupacion: AgrupacionPendientesRecepcion,
): GrupoPendientesRecepcion[] {
  if (agrupacion === 'sin_agrupar') {
    return [{
      clave: 'todas',
      titulo: 'Todas las órdenes seleccionadas',
      filas,
      totalOrdenes: filas.length,
      totalUnidades: filas.reduce((a, f) => a + f.totalUnidades, 0),
      totalMontoUsd: filas.reduce((a, f) => a + f.montoUsd, 0),
    }];
  }

  const mapa = new Map<string, FilaPendienteRecepcion[]>();
  for (const f of filas) {
    let clave = '';
    switch (agrupacion) {
      case 'analista': clave = f.analista || 'Por asignar'; break;
      case 'almacen': clave = f.almacenDestino || 'General'; break;
      case 'proveedor': clave = f.proveedor || 'Por confirmar'; break;
      case 'solicitante': clave = f.solicitante || '—'; break;
      case 'origen': clave = f.origenLabel; break;
      case 'estado': clave = f.estadoLabel; break;
    }
    const lista = mapa.get(clave) ?? [];
    lista.push(f);
    mapa.set(clave, lista);
  }

  return Array.from(mapa.entries())
    .map(([clave, grupo]) => ({
      clave,
      titulo: clave,
      filas: grupo,
      totalOrdenes: grupo.length,
      totalUnidades: grupo.reduce((a, x) => a + x.totalUnidades, 0),
      totalMontoUsd: grupo.reduce((a, x) => a + x.montoUsd, 0),
    }))
    .sort((a, b) => b.totalOrdenes - a.totalOrdenes || b.totalMontoUsd - a.totalMontoUsd);
}

export function calcularResumenPendientes(filas: FilaPendienteRecepcion[]): ResumenPendientesRecepcion {
  const totalOrdenes = filas.length;
  const totalOc = filas.filter((f) => f.origen === 'oc').length;
  const totalCs = filas.filter((f) => f.origen === 'cs').length;
  const totalDirectas = filas.filter((f) => f.origen === 'directa').length;
  const totalPagadas = filas.filter((f) => f.estado === 'pagada').length;
  const totalPorRecibirSinPago = totalOrdenes - totalPagadas;
  const totalItems = filas.reduce((a, f) => a + f.numItems, 0);
  const totalUnidades = filas.reduce((a, f) => a + f.totalUnidades, 0);
  const totalMontoUsd = filas.reduce((a, f) => a + f.montoUsd, 0);
  const sumaDias = filas.reduce((a, f) => a + f.diasPendiente, 0);
  const maxDiasPendiente = filas.reduce((m, f) => Math.max(m, f.diasPendiente), 0);

  return {
    totalOrdenes,
    totalOc,
    totalCs,
    totalDirectas,
    totalPagadas,
    totalPorRecibirSinPago,
    totalItems,
    totalUnidades,
    totalMontoUsd,
    promedioDiasPendiente: totalOrdenes > 0 ? Math.round((sumaDias / totalOrdenes) * 10) / 10 : 0,
    maxDiasPendiente,
  };
}

/** Construye un subtítulo descriptivo con los filtros activos para el membrete del PDF y WhatsApp. */
export function describirFiltrosPendientes(filtros: Omit<FiltrosReportePendientes, 'uidsExcluidos'>): string {
  const partes: string[] = [];
  if (filtros.origenes.length > 0 && filtros.origenes.length < 3) {
    const map: Record<OrigenPendienteRecepcion, string> = { oc: 'OC', cs: 'CS', directa: 'Compras Directas' };
    partes.push(`Tipo: ${filtros.origenes.map((o) => map[o]).join(' + ')}`);
  }
  if (filtros.estados.length === 1) {
    partes.push(`Estado: ${filtros.estados[0] === 'pagada' ? 'Pagada' : 'Pendiente por recepción'}`);
  }
  if (filtros.analista) partes.push(`Analista: ${filtros.analista}`);
  if (filtros.almacen) partes.push(`Destino: ${filtros.almacen}`);
  if (filtros.solicitante) partes.push(`Solicita: ${filtros.solicitante}`);
  if (filtros.criterioFecha !== 'todas' && (filtros.desde || filtros.hasta)) {
    const etq = filtros.criterioFecha === 'pago' ? 'Pago Tesorería' : 'Fecha montada';
    partes.push(`${etq}: ${filtros.desde || 'inicio'} al ${filtros.hasta || 'hoy'}`);
  }
  if (filtros.busqueda.trim()) {
    partes.push(`Búsqueda: "${filtros.busqueda.trim()}"`);
  }
  return partes.length > 0 ? partes.join(' · ') : 'Todas las órdenes pendientes por recepcionar';
}

/* ============================================================
   Generador Dinámico de Mensaje de WhatsApp
   ============================================================ */

export const AVISO_WHATSAPP_POR_DEFECTO = 'NO HA LLEGADO A ALMACEN DAR STATUS';

export interface OpcionesWhatsappPendientes {
  filas: FilaPendienteRecepcion[];
  agrupacion: AgrupacionPendientesRecepcion;
  campos: CampoPendienteRecepcion[];
  incluirResumen?: boolean;
  subtituloFiltros?: string;
  generadoEnIso?: string;
  avisoEstado?: string;
}

export function construirWhatsappPendientesRecepcion({
  filas,
  agrupacion,
  campos,
  incluirResumen = true,
  subtituloFiltros,
  generadoEnIso,
  avisoEstado = AVISO_WHATSAPP_POR_DEFECTO,
}: OpcionesWhatsappPendientes): string {
  const set = new Set<CampoPendienteRecepcion>(campos);
  const resumen = calcularResumenPendientes(filas);
  const ahoraTxt = dateTime(generadoEnIso ?? new Date().toISOString());
  const avisoLimpio = avisoEstado.trim();

  const lineas: string[] = [];
  if (avisoLimpio) {
    lineas.push(`🚨 *${avisoLimpio}*`);
  }
  lineas.push(
    '📦 *REPORTE DE PENDIENTES POR RECEPCIONAR*',
    '🏢 *GOLDEN TOUCH 1127 C.A.* · Inventario',
    `🕒 *Corte:* ${ahoraTxt}`,
  );

  if (subtituloFiltros && subtituloFiltros !== 'Todas las órdenes pendientes por recepcionar') {
    lineas.push(`🎯 *Filtro:* ${subtituloFiltros}`);
  }

  if (!filas.length) {
    lineas.push('', '✅ _No hay órdenes pendientes por recepcionar con los filtros seleccionados._');
    return lineas.join('\n');
  }

  if (incluirResumen) {
    const desgloseTipos = [
      resumen.totalOc ? `${resumen.totalOc} OC` : '',
      resumen.totalCs ? `${resumen.totalCs} CS` : '',
      resumen.totalDirectas ? `${resumen.totalDirectas} Directa(s)` : '',
    ].filter(Boolean).join(' · ');

    lineas.push(
      '',
      `📊 *Resumen:* *${num(resumen.totalOrdenes)}* orden(es)${desgloseTipos ? ` (${desgloseTipos})` : ''} · *${num(resumen.totalUnidades)}* und.`,
    );
    if (set.has('monto')) {
      lineas.push(`💰 *Monto total:* *${money(resumen.totalMontoUsd)}*`);
    }
  }

  const grupos = agruparPendientesRecepcion(filas, agrupacion);

  grupos.forEach((g) => {
    if (agrupacion !== 'sin_agrupar') {
      const montoGrupo = set.has('monto') ? ` · ${money(g.totalMontoUsd)}` : '';
      lineas.push('', `━━━ 📂 *${g.titulo.toUpperCase()}* (${num(g.totalOrdenes)}${montoGrupo}) ━━━`);
    } else {
      lineas.push('');
    }

    g.filas.forEach((f, idx) => {
      const iconoEstado = f.estado === 'pagada' ? '🟢' : '🟠';
      const partesCabecera: string[] = [];
      if (set.has('codigo') || !campos.length) {
        partesCabecera.push(`*${f.codigo}*${f.codigoSolicitud ? ` _(${f.codigoSolicitud})_` : ''}`);
      }
      if (set.has('tipo_estado')) {
        partesCabecera.push(`${iconoEstado} ${f.estadoLabel}`);
      }
      if (set.has('monto')) {
        partesCabecera.push(`*${f.moneda === 'Bs' ? `${f.montoNativoFmt} (${money(f.montoUsd)})` : money(f.montoUsd)}*`);
      }

      lineas.push(`${idx + 1}. ${partesCabecera.join(' · ') || `*${f.codigo}*`}`);

      if (set.has('analista')) {
        lineas.push(`   🛒 *Analista encargado:* ${f.analista}`);
      }
      if (set.has('fecha_montada') || set.has('fecha_pago')) {
        const fechasTxt: string[] = [];
        if (set.has('fecha_montada')) fechasTxt.push(`📅 *Montada:* ${f.fechaMontadaFmt}`);
        if (set.has('fecha_pago')) fechasTxt.push(`💳 *Pago Tesorería:* ${f.fechaPagoFmt}`);
        if (set.has('dias')) fechasTxt.push(`⏱ ${f.diasPendiente}d`);
        lineas.push(`   ${fechasTxt.join(' · ')}`);
      } else if (set.has('dias')) {
        lineas.push(`   ⏱ *Espera:* ${f.diasPendiente} día(s)`);
      }

      if (set.has('proveedor') && f.proveedor && f.proveedor !== 'Por confirmar') {
        lineas.push(`   🏭 *Proveedor:* ${f.proveedor}`);
      }

      const solYDest: string[] = [];
      if (set.has('solicitante') && f.solicitante && f.solicitante !== '—') {
        solYDest.push(`👤 *Solicita:* ${f.solicitante}${f.unidadSolicitante ? ` (${f.unidadSolicitante})` : ''}`);
      }
      if (set.has('almacen')) {
        solYDest.push(`🏬 *Destino:* ${f.almacenDestino}`);
      }
      if (solYDest.length > 0) {
        lineas.push(`   ${solYDest.join(' · ')}`);
      }

      if (set.has('items')) {
        lineas.push(`   📦 *Ítems:* ${num(f.numItems)} ítem(s) · ${num(f.totalUnidades)} und.`);
      }

      if (set.has('detalle_items') && f.items.length > 0) {
        f.items.slice(0, 8).forEach((it) => {
          lineas.push(`      • ${it.nombre} — *${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''}*`);
        });
        if (f.items.length > 8) {
          lineas.push(`      • _…y ${f.items.length - 8} renglón(es) más_`);
        }
      }
    });
  });

  if (avisoLimpio) {
    lineas.push('', `⚠️ *${avisoLimpio}*`);
  }

  return lineas.join('\n');
}

/** Mensaje de WhatsApp individual de una orden pendiente por recepcionar (para compartir una sola orden). */
export function construirWhatsappDetallePendiente(f: FilaPendienteRecepcion): string {
  return construirWhatsappPendientesRecepcion({
    filas: [f],
    agrupacion: 'sin_agrupar',
    campos: [
      'codigo',
      'tipo_estado',
      'analista',
      'fecha_montada',
      'fecha_pago',
      'dias',
      'proveedor',
      'solicitante',
      'almacen',
      'items',
      'detalle_items',
      'monto',
    ],
    incluirResumen: false,
  });
}
