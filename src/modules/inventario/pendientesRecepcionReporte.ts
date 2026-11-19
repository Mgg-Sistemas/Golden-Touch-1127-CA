/* ============================================================
   Golden Touch · Reporte Dinámico de Pendientes por Recepcionar
   (Alineado al diseño estándar MGG · 18/11/2026)

   Procesa y normaliza tanto las Órdenes de Compra (OC / CS) como las
   Compras Directas pendientes por entrar al inventario.
   Incluye:
     · Analista encargado (Nombre y Apellido real sin @)
     · Fecha en que se montó la orden (formato «10 nov. 2026»)
     · Fecha en que pagó Tesorería (formato «17 nov. 2026»)
     · Sede / almacén sugerido
     · Ítems, unidades y montos ($ / Bs)
     · Métricas y filtros interactivos
     · Formateo estructurado de mensaje para WhatsApp con la leyenda
       obligatoria «NO HA LLEGADO A ALMACEN DAR STATUS»
   ============================================================ */

import type { Almacen, Orden } from '@/shared/lib/types';
import type { CompraDirecta } from '@/modules/pedidos/compras.repository';
import { dateTime, money, montoMoneda, num } from '@/shared/lib/format';
import { nombrePersonaCompras } from '@/modules/pedidos/personasCompras';
import { quienSync } from '@/shared/lib/directorioUsuarios';

export const AVISO_WHATSAPP_POR_DEFECTO = 'NO HA LLEGADO A ALMACEN DAR STATUS';

export type OrigenPendienteRecepcion = 'oc' | 'cs' | 'directa';
export type EstadoPendienteRecepcion = 'pagada' | 'por_recibir';
export type TipoFiltroRecepcion = 'todos' | 'oc' | 'cs' | 'directa';
export type CriterioFechaPendientes = 'todas' | 'montada' | 'pago';

export type ResolverPersonaFn = (guardado: string | null | undefined, correo?: string | null) => string;

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
  texto?: string;
  sede?: string;
  analista?: string;
  tipo?: TipoFiltroRecepcion;
  criterioFecha?: 'montada' | 'pago';
  desde?: string;
  hasta?: string;
  uidsExcluidos?: string[];
}

export interface TotalesPendientesRecepcion {
  totalRegistros: number;
  totalOc: number;
  totalCs: number;
  totalDirectas: number;
  totalItems: number;
  totalUnidades: number;
  totalUsd: number;
  totalBs: number;
  sedes: string[];
  analistas: string[];
}

const TZ_VE = 'America/Caracas';
const MESES_CORTOS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

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

/** Formatea una fecha ISO al estilo MGG: «10 nov. 2026». */
export function fechaEstiloMgg(iso: string | null | undefined): string {
  const dia = isoADiaVE(iso);
  if (!dia) return '—';
  const [y, m, d] = dia.split('-');
  const mesIdx = Number(m) - 1;
  if (!y || !d || mesIdx < 0 || mesIdx > 11) return dia;
  return `${Number(d)} ${MESES_CORTOS[mesIdx]} ${y}`;
}

/** Obtiene el nombre visible de la sede o almacén sugerido. */
export function nombreSedeAlmacen(idOrNombre: string | null | undefined, almacenes: Almacen[] = []): string {
  if (!idOrNombre) return 'General';
  const limpio = idOrNombre.trim();
  if (!limpio) return 'General';
  const alm = almacenes.find((a) => a.id === limpio || a.nombre === limpio || a.sede === limpio);
  return alm?.sede?.trim() || alm?.nombre?.trim() || limpio;
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
  almacenes?: Almacen[];
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
  almacenes = [],
  proveedoresMap,
  personasMap,
  resolverPersona,
  tasaUsdHoy = 0,
  ahoraMs = Date.now(),
}: OpcionesNormalizarPendientes): FilaPendienteRecepcion[] {
  const filas: FilaPendienteRecepcion[] = [];

  for (const o of ordenesPendientes) {
    const codigoPrincipal = (o.oc_codigo || o.codigo || '').trim() || '—';
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
        nombre: String(it.nombre ?? 'Material').trim(),
        cantidad: cant,
        unidad: String(it.unidad ?? '').trim(),
        subtotalUsd: Math.round(cant * precio * 100) / 100,
      };
    });
    const totalUnidades = items.reduce((acc, it) => acc + it.cantidad, 0);
    const provNombre = (o.proveedor_id ? proveedoresMap?.get(o.proveedor_id) : '')?.trim() || '—';
    const solicitanteLimpio =
      limpiarNombrePersona(o.solicitante, o.solicitante_email, resolverPersona, personasMap) ||
      (o.solicitante ?? '').trim() ||
      '—';

    const montoUsd = Number(o.total) || 0;
    const destinoSugerido = esServicio
      ? 'Servicio (Equipo)'
      : nombreSedeAlmacen(o.almacen_destino || 'General', almacenes);

    filas.push({
      uid: `orden:${o.id}`,
      id: o.id,
      origen,
      origenLabel: esServicio ? 'Control de Servicio' : 'Orden de Compra',
      origenCorto: esServicio ? 'CS' : 'OC',
      codigo: codigoPrincipal,
      codigoSolicitud: o.oc_codigo && o.codigo && o.codigo !== o.oc_codigo ? o.codigo : null,
      estado: o.estado === 'pagada' ? 'pagada' : 'por_recibir',
      estadoLabel: o.estado === 'pagada' ? 'Pagada' : 'Por recibir',
      condicionesPago: o.condiciones_pago ?? null,
      analista: resolverAnalistaOrden(o, resolverPersona, personasMap),
      fechaMontadaIso: fMontada,
      fechaMontadaDia: isoADiaVE(fMontada),
      fechaMontadaFmt: fMontada ? fechaEstiloMgg(fMontada) : '—',
      fechaMontadaHoraFmt: fMontada ? dateTime(fMontada) : '—',
      fechaPagoIso: fPago,
      fechaPagoDia: isoADiaVE(fPago),
      fechaPagoFmt: fPago ? fechaEstiloMgg(fPago) : sinPagoTxt,
      fechaPagoHoraFmt: fPago ? dateTime(fPago) : sinPagoTxt,
      tienePagoTesoreria: Boolean(fPago),
      diasPendiente: calcularDiasPendiente(fPago, fMontada, ahoraMs),
      proveedor: provNombre,
      solicitante: solicitanteLimpio,
      unidadSolicitante: o.unidad_solicitante?.trim() || null,
      almacenDestino: destinoSugerido,
      numItems: items.length,
      totalUnidades,
      moneda: 'USD',
      montoNativo: montoUsd,
      montoNativoFmt: money(montoUsd, 'USD'),
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
      '—';

    filas.push({
      uid: `directa:${c.id}`,
      id: c.id,
      origen: 'directa',
      origenLabel: 'Compra Directa',
      origenCorto: 'CD',
      codigo: (c.codigo || '—').trim(),
      codigoSolicitud: null,
      estado: 'pagada',
      estadoLabel: 'Por recibir',
      condicionesPago: 'contado',
      analista,
      fechaMontadaIso: fMontada,
      fechaMontadaDia: isoADiaVE(fMontada),
      fechaMontadaFmt: fMontada ? fechaEstiloMgg(fMontada) : '—',
      fechaMontadaHoraFmt: fMontada ? dateTime(fMontada) : '—',
      fechaPagoIso: fPago,
      fechaPagoDia: isoADiaVE(fPago),
      fechaPagoFmt: fPago ? fechaEstiloMgg(fPago) : 'Pagada',
      fechaPagoHoraFmt: fPago ? dateTime(fPago) : 'Pagada',
      tienePagoTesoreria: true,
      diasPendiente: calcularDiasPendiente(fPago, fMontada, ahoraMs),
      proveedor: provNombre,
      solicitante: analista,
      unidadSolicitante: 'COMPRAS DIRECTAS',
      almacenDestino: nombreSedeAlmacen(c.almacen || 'General', almacenes),
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

/** Filtra dinámicamente las filas de recepciones pendientes (estilo MGG + soporte de casillas). */
export function filtrarPendientesRecepcion(
  filas: FilaPendienteRecepcion[],
  filtros: FiltrosReportePendientes,
): FilaPendienteRecepcion[] {
  const txt = normTxt(filtros.texto ?? '');
  const sede = (filtros.sede ?? '').trim();
  const analista = (filtros.analista ?? '').trim();
  const tipo = filtros.tipo && filtros.tipo !== 'todos' ? filtros.tipo : null;
  const criterio = filtros.criterioFecha || 'montada';
  const desde = (filtros.desde ?? '').trim();
  const hasta = (filtros.hasta ?? '').trim();
  const excluidos = new Set(filtros.uidsExcluidos ?? []);

  return filas.filter((f) => {
    if (excluidos.has(f.uid)) return false;
    if (tipo && f.origen !== tipo) return false;
    if (sede && f.almacenDestino !== sede) return false;
    if (analista && f.analista !== analista) return false;

    if (txt) {
      const pajar = normTxt([
        f.codigo,
        f.codigoSolicitud ?? '',
        f.analista,
        f.proveedor,
        f.solicitante,
        f.almacenDestino,
        f.itemsResumen,
      ].join(' '));
      if (!pajar.includes(txt)) return false;
    }

    if (desde || hasta) {
      const dia = criterio === 'pago' ? f.fechaPagoDia : f.fechaMontadaDia;
      if (!dia) return false;
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
    }

    return true;
  });
}

/** Calcula totales e indicadores dinámicos estilo MGG. */
export function calcularTotalesPendientes(filas: FilaPendienteRecepcion[]): TotalesPendientesRecepcion {
  let totalOc = 0;
  let totalCs = 0;
  let totalDirectas = 0;
  let totalItems = 0;
  let totalUnidades = 0;
  let totalUsd = 0;
  let totalBs = 0;
  const sedesSet = new Set<string>();
  const analistasSet = new Set<string>();

  for (const f of filas) {
    if (f.origen === 'oc') totalOc++;
    else if (f.origen === 'cs') totalCs++;
    else totalDirectas++;

    totalItems += f.numItems;
    totalUnidades += f.totalUnidades;

    if (f.moneda === 'Bs') {
      totalBs += f.montoNativo;
    } else {
      totalUsd += f.montoNativo;
    }

    if (f.almacenDestino && f.almacenDestino !== '—') sedesSet.add(f.almacenDestino);
    if (f.analista && f.analista !== '—') analistasSet.add(f.analista);
  }

  return {
    totalRegistros: filas.length,
    totalOc,
    totalCs,
    totalDirectas,
    totalItems,
    totalUnidades,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalBs: Math.round(totalBs * 100) / 100,
    sedes: Array.from(sedesSet).sort((a, b) => a.localeCompare(b, 'es-VE')),
    analistas: Array.from(analistasSet).sort((a, b) => a.localeCompare(b, 'es-VE')),
  };
}

/** Genera el mensaje estructurado para WhatsApp idéntico al estándar de MGG. */
export function construirWhatsappPendientesRecepcion(
  filas: FilaPendienteRecepcion[],
  filtros?: FiltrosReportePendientes,
  actor?: string | null,
): string {
  const totales = calcularTotalesPendientes(filas);
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-VE', { timeZone: TZ_VE });
  const horaStr = ahora.toLocaleTimeString('es-VE', { timeZone: TZ_VE, hour: '2-digit', minute: '2-digit' });

  const lineas: string[] = [];
  lineas.push('📦 *GOLDEN TOUCH 1127 C.A.*');
  lineas.push('📋 *REPORTE DE PENDIENTES POR RECEPCIONAR*');
  lineas.push(`🚨 *${AVISO_WHATSAPP_POR_DEFECTO}*`);
  lineas.push(`📅 *Fecha de emisión:* ${fechaStr} · ${horaStr}`);
  if (actor) lineas.push(`👤 *Generado por:* ${actor}`);

  if (filtros?.sede) lineas.push(`🏢 *Sede / Almacén:* ${filtros.sede}`);
  if (filtros?.analista) lineas.push(`👥 *Analista filtrado:* ${filtros.analista}`);

  const desgloseTipos = [
    `${totales.totalOc} OC`,
    totales.totalCs > 0 ? `${totales.totalCs} CS` : null,
    `${totales.totalDirectas} Compras directas`,
  ].filter(Boolean).join(' · ');

  lineas.push('');
  lineas.push('📊 *RESUMEN DE PENDIENTES:*');
  lineas.push(`• *Total pendientes:* ${totales.totalRegistros} (${desgloseTipos})`);
  lineas.push(`• *Total ítems:* ${totales.totalItems} (${num(totales.totalUnidades)} und. estimadas)`);
  if (totales.totalUsd > 0) lineas.push(`• *Monto en divisas:* ${money(totales.totalUsd, 'USD')}`);
  if (totales.totalBs > 0) lineas.push(`• *Monto en bolívares:* ${money(totales.totalBs, 'Bs')}`);
  lineas.push('');

  if (!filas.length) {
    lineas.push('✅ _No hay mercancía pendiente por recepcionar con los filtros actuales._');
    return lineas.join('\n');
  }

  lineas.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lineas.push('📝 *DETALLE DE ÓRDENES POR RECIBIR:*');
  lineas.push('━━━━━━━━━━━━━━━━━━━━━━━━');

  filas.forEach((f, idx) => {
    lineas.push(`${idx + 1}. 🔹 *${f.codigo}* (${f.estadoLabel})`);
    lineas.push(`   ⚠️ *${AVISO_WHATSAPP_POR_DEFECTO}*`);
    lineas.push(`   📅 *Montada:* ${f.fechaMontadaFmt}`);
    lineas.push(`   💳 *Pagó Tesorería:* ${f.fechaPagoFmt}`);
    lineas.push(`   👤 *Analista:* ${f.analista}`);
    if (f.proveedor && f.proveedor !== '—') lineas.push(`   🏭 *Proveedor:* ${f.proveedor}`);
    lineas.push(`   🏢 *Destino sugerido:* ${f.almacenDestino}`);
    lineas.push(`   📦 *Ítems:* ${f.numItems} ítem(s) · ${num(f.totalUnidades)} und.`);
    lineas.push(`   💰 *Monto:* ${money(f.montoNativo, f.moneda)}`);

    if (f.items.length > 0) {
      if (filas.length === 1) {
        lineas.push('   🛒 *Materiales / ítems por recibir:*');
        f.items.forEach((it, i) => {
          const skuTxt = it.sku ? ` · ${it.sku}` : '';
          const undTxt = it.unidad ? ` ${it.unidad}` : ' und.';
          lineas.push(`      ${i + 1}. ${it.nombre}${skuTxt}: *${num(it.cantidad)}${undTxt}*`);
        });
      } else {
        const resumenItems = f.items
          .slice(0, 3)
          .map((it) => `${it.nombre} (${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''})`)
          .join(', ');
        const resto = f.items.length > 3 ? ` y ${f.items.length - 3} más…` : '';
        lineas.push(`   🛒 _${resumenItems}${resto}_`);
      }
    }

    lineas.push('────────────────────────');
  });

  lineas.push('');
  lineas.push(`🚨 *${AVISO_WHATSAPP_POR_DEFECTO}*`);
  lineas.push('ℹ️ _Favor coordinar con el equipo de compras/logística para dar entrada oportuna en inventario._');

  return lineas.join('\n');
}

/** Mensaje de WhatsApp detallado para una orden individual pendiente por recepcionar. */
export function construirWhatsappDetallePendiente(f: FilaPendienteRecepcion, actor?: string | null): string {
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-VE', { timeZone: TZ_VE });
  const horaStr = ahora.toLocaleTimeString('es-VE', { timeZone: TZ_VE, hour: '2-digit', minute: '2-digit' });

  const lineas: string[] = [];
  lineas.push('📦 *GOLDEN TOUCH 1127 C.A.*');
  lineas.push(`📋 *ORDEN PENDIENTE POR RECEPCIONAR · ${f.codigo}*`);
  lineas.push(`🚨 *${AVISO_WHATSAPP_POR_DEFECTO}*`);
  lineas.push(`📅 *Fecha de emisión:* ${fechaStr} · ${horaStr}`);
  if (actor) lineas.push(`👤 *Generado por:* ${actor}`);
  lineas.push('');
  lineas.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lineas.push(`🔹 *${f.codigo}* (${f.estadoLabel})`);
  lineas.push(`📄 *Tipo:* ${f.origenLabel}${f.codigoSolicitud ? ` · Solicitud ${f.codigoSolicitud}` : ''}`);
  lineas.push(`📅 *Montada:* ${f.fechaMontadaFmt}`);
  lineas.push(`💳 *Pagó Tesorería:* ${f.fechaPagoFmt}`);
  lineas.push(`👤 *Analista encargado:* ${f.analista}`);
  if (f.solicitante && f.solicitante !== '—') lineas.push(`🙋 *Solicita:* ${f.solicitante}`);
  if (f.proveedor && f.proveedor !== '—') lineas.push(`🏭 *Proveedor:* ${f.proveedor}`);
  lineas.push(`🏢 *Destino sugerido:* ${f.almacenDestino}`);
  lineas.push(`📦 *Resumen:* ${f.numItems} ítem(s) · ${num(f.totalUnidades)} und.`);
  lineas.push(`💰 *Monto total:* ${money(f.montoNativo, f.moneda)}`);
  lineas.push('━━━━━━━━━━━━━━━━━━━━━━━━');

  if (f.items.length > 0) {
    lineas.push('');
    lineas.push(`🛒 *MATERIALES / ÍTEMS POR RECIBIR (${f.items.length}):*`);
    f.items.forEach((it, idx) => {
      const skuTxt = it.sku ? ` · ${it.sku}` : '';
      const undTxt = it.unidad ? ` ${it.unidad}` : ' und.';
      const subTxt = it.subtotalUsd > 0 ? ` · ${money(it.subtotalUsd, 'USD')}` : '';
      lineas.push(`${idx + 1}. *${it.nombre}*${skuTxt} — *${num(it.cantidad)}${undTxt}*${subTxt}`);
    });
  }

  lineas.push('');
  lineas.push(`🚨 *${AVISO_WHATSAPP_POR_DEFECTO}*`);
  lineas.push('ℹ️ _Favor indicar estatus de entrega para coordinar su recepción oportuna en almacén._');

  return lineas.join('\n');
}
