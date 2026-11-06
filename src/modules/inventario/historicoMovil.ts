/* ============================================================
   Golden Touch · Inventario · Histórico del teléfono (03/11/2026)

   Lo que se calcula sin tocar la base para los botones «🧾 Histórico de
   salidas» y «🔁 Histórico de traslados» de la vista de teléfono:
   · el rango de fechas por defecto (últimos 30 días) y sus límites ISO;
   · armar cada traslado TRA-#### a partir de sus dos movimientos de stock
     (el que sale del origen y el que entra al destino);
   · el buscador (código, material, motivo, quién autorizó, quién registró);
   · el aviso de WhatsApp de una salida del módulo Salidas (PC), con el
     mismo estilo que el de la salida del teléfono (mensajeSalidaMina).

   El histórico de salidas junta DOS fuentes: las salidas del teléfono
   (deposito_mina_salidas) y las salidas ejecutadas del módulo Salidas que
   registró el MISMO usuario desde ese almacén (pedido del 03/11/2026: las
   de Isner en el perfil de Isner).
   ============================================================ */
import type { SolicitudSalida } from '@/shared/lib/types';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import { norm } from '@/shared/lib/texto';
import { fechaHoraVE, num, textoBuscableSalidaMina, type SalidaMina } from './salidasMina';
import { nombreDepositoChat, type TrasladoAlmacen } from './inventarioMovil';

/** Más filas que esto no se traen: se avisa que acote las fechas. */
export const LIMITE_HISTORICO = 200;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Por defecto el histórico muestra los últimos 30 días (hasta hoy). */
export function rangoHistoricoPorDefecto(hoy: string): { desde: string; hasta: string } {
  const [y, m, d] = hoy.split('-').map(Number);
  return { desde: iso(new Date(Date.UTC(y, m - 1, d - 29))), hasta: hoy };
}

/** Límites ISO (hora de Venezuela) de un rango AAAA-MM-DD: desde las 00:00 del «desde»
 *  hasta las 00:00 del día siguiente al «hasta» (exclusivo). */
export function limitesIsoRango(desde: string, hasta: string): { desdeIso: string; hastaIso: string } {
  const [y, m, d] = hasta.split('-').map(Number);
  const sig = iso(new Date(Date.UTC(y, m - 1, d + 1)));
  return { desdeIso: `${desde}T00:00:00-04:00`, hastaIso: `${sig}T00:00:00-04:00` };
}

/** Lo que impide consultar el rango. `null` = se puede. */
export function errorRangoHistorico(desde: string, hasta: string, hoy: string): string | null {
  if (!desde || !hasta) return 'Elige las dos fechas.';
  if (desde > hasta) return '«Desde» no puede ir después de «hasta».';
  if (hasta > hoy) return '«Hasta» no puede pasar de hoy.';
  return null;
}

/* ── Traslados ─────────────────────────────────────────────── */

/** Un movimiento de stock del traslado (con su producto), tal como lo devuelve la base. */
export interface MovimientoTraslado {
  id: string;
  ref_codigo: string | null;
  almacen: string | null;
  destino: string | null;
  delta: number | string;
  stock_despues: number | string | null;
  detalle: string | null;
  actor: string | null;
  actor_name: string | null;
  at: string;
  producto_id: string;
  producto?: { sku: string; nombre: string; unidad: string | null } | null;
}

/** Un traslado del histórico: lo que necesita el PDF y el WhatsApp, más quién lo hizo. */
export interface TrasladoHistorico extends TrasladoAlmacen {
  actor: string | null;
  actor_name: string | null;
}

/** La nota que se escribió al trasladar, guardada dentro del detalle del movimiento:
 *  «Traslado TRA-0001 a Depósito Mina · <nota> (teléfono)». */
export function notaDeDetalleTraslado(detalle: string | null | undefined): string | null {
  const t = String(detalle ?? '').replace(/\s*\(teléfono\)\s*$/i, '');
  const partes = t.split(' · ');
  const nota = partes.slice(1).join(' · ').trim();
  return nota || null;
}

/** De dónde salió, leído del movimiento de entrada: «Traslado TRA-0001 desde General · …». */
function origenDeDetalle(detalle: string | null | undefined): string | null {
  const m = /^Traslado \S+ desde (.+?)(?: · |\s*\(teléfono\)|$)/i.exec(String(detalle ?? ''));
  return m?.[1]?.trim() || null;
}

/** Arma cada traslado con sus dos patas (salida del origen y entrada al destino).
 *  Si el rol solo puede leer uno de los dos almacenes, se arma con la pata que se ve.
 *  Salen del más reciente al más viejo. */
export function agruparTraslados(movs: MovimientoTraslado[]): TrasladoHistorico[] {
  const porCodigo = new Map<string, TrasladoHistorico>();
  for (const m of movs) {
    const codigo = m.ref_codigo?.trim();
    if (!codigo) continue;
    const delta = Number(m.delta) || 0;
    const t = porCodigo.get(codigo) ?? {
      codigo, cantidad: Math.abs(delta), unidad: m.producto?.unidad ?? '', origen: '', destino: '',
      producto_origen_id: '', producto_destino_id: '', nombre: m.producto?.nombre ?? '', sku_origen: '', sku_destino: '',
      creado_en_destino: false, stock_origen: 0, stock_destino: 0, nota: notaDeDetalleTraslado(m.detalle), at: m.at,
      actor: m.actor, actor_name: m.actor_name,
    };
    if (!t.nombre && m.producto?.nombre) t.nombre = m.producto.nombre;
    if (!t.unidad && m.producto?.unidad) t.unidad = m.producto.unidad;
    if (delta < 0) {
      t.origen = m.almacen ?? t.origen;
      t.destino = t.destino || (m.destino ?? '');
      t.producto_origen_id = m.producto_id;
      t.sku_origen = m.producto?.sku ?? '';
      t.stock_origen = Number(m.stock_despues) || 0;
    } else {
      t.destino = m.almacen ?? t.destino;
      t.origen = t.origen || origenDeDetalle(m.detalle) || '';
      t.producto_destino_id = m.producto_id;
      t.sku_destino = m.producto?.sku ?? '';
      t.stock_destino = Number(m.stock_despues) || 0;
    }
    if (m.at > t.at) t.at = m.at;
    porCodigo.set(codigo, t);
  }
  return Array.from(porCodigo.values()).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function textoBuscableTraslado(t: TrasladoHistorico): string {
  const f = fechaHoraVE(t.at);
  return norm([
    t.codigo, t.nombre, t.sku_origen, t.sku_destino, nombreDepositoChat(t.origen), nombreDepositoChat(t.destino),
    t.nota, t.actor_name, t.actor, t.unidad, String(t.cantidad), f, f.replace(/\//g, '-'),
  ].filter(Boolean).join(' '));
}

/* ── Salidas: teléfono + módulo Salidas (PC) ───────────────── */

export type FilaHistoricoSalida =
  /** Una salida del teléfono con TODOS sus materiales (04/11/2026: varios productos en una). */
  | { tipo: 'telefono'; at: string; salidas: SalidaMina[] }
  | { tipo: 'pc'; at: string; sol: SolicitudSalida };

/** Renglones de una salida del módulo Salidas (varios materiales o uno solo). */
export function itemsSalidaPc(sol: SolicitudSalida): Array<{ nombre: string; sku?: string | null; cantidad: number; unidad?: string | null }> {
  if (sol.items?.length) {
    return sol.items.map((it) => ({ nombre: it.producto_nombre, sku: it.producto_sku, cantidad: Number(it.cantidad) || 0, unidad: it.unidad }));
  }
  return [{ nombre: sol.producto_nombre || '—', sku: null, cantidad: Number(sol.cantidad) || 0, unidad: null }];
}

/** Resumen corto de los materiales: «MANGUERA 2" · 2 und (+2 más)». */
export function resumenItemsSalidaPc(sol: SolicitudSalida): { material: string; cantidad: string } {
  const items = itemsSalidaPc(sol);
  const [primero] = items;
  const mas = items.length > 1 ? ` (+${items.length - 1} más)` : '';
  return {
    material: `${primero?.nombre ?? '—'}${mas}`,
    cantidad: `${num(primero?.cantidad ?? 0)}${primero?.unidad ? ` ${primero.unidad}` : ''}`,
  };
}

export function textoBuscableSalidaPc(sol: SolicitudSalida): string {
  const f = fechaHoraVE(sol.created_at);
  return norm([
    sol.codigo, sol.motivo, sol.destino, sol.solicitante, sol.unidad_solicitante, sol.aprobada_por, sol.actor_name, sol.actor,
    ...itemsSalidaPc(sol).flatMap((it) => [it.nombre, it.sku, String(it.cantidad), it.unidad]),
    f, f.replace(/\//g, '-'),
  ].filter(Boolean).join(' '));
}

/** Las filas de una misma salida de varios materiales: se guardan en una sola transacción,
 *  así que comparten la hora exacta, quién, el depósito, el motivo, quién autorizó y si retorna. */
const claveLoteSalida = (s: SalidaMina) =>
  [s.actor ?? '', s.created_at, s.almacen ?? '', s.motivo, s.autorizado_por ?? '', s.retorna ? 1 : 0].join('|');

/** Agrupa las salidas del teléfono por salida (cada grupo en el orden de su N°). */
export function agruparSalidasTelefono(salidas: SalidaMina[]): SalidaMina[][] {
  const grupos = new Map<string, SalidaMina[]>();
  for (const s of salidas) {
    const k = claveLoteSalida(s);
    const g = grupos.get(k);
    if (g) g.push(s); else grupos.set(k, [s]);
  }
  return Array.from(grupos.values()).map((g) => g.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })));
}

/** Los traslados de un mismo envío de varios productos (misma hora exacta, quién, origen,
 *  destino y nota), cada grupo en el orden de su N°; del más reciente al más viejo. */
export function agruparLotesTraslado(ts: TrasladoHistorico[]): TrasladoHistorico[][] {
  const grupos = new Map<string, TrasladoHistorico[]>();
  for (const t of ts) {
    const k = [t.actor ?? '', t.at, t.origen, t.destino, t.nota ?? ''].join('|');
    const g = grupos.get(k);
    if (g) g.push(t); else grupos.set(k, [t]);
  }
  return Array.from(grupos.values())
    .map((g) => g.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })))
    .sort((a, b) => (a[0].at < b[0].at ? 1 : a[0].at > b[0].at ? -1 : 0));
}

/** Junta las dos fuentes, de la más reciente a la más vieja. */
export function unirHistoricoSalidas(telefono: SalidaMina[], pc: SolicitudSalida[]): FilaHistoricoSalida[] {
  const filas: FilaHistoricoSalida[] = [
    ...agruparSalidasTelefono(telefono).map((salidas) => ({ tipo: 'telefono' as const, at: salidas[0].created_at, salidas })),
    ...pc.map((sol) => ({ tipo: 'pc' as const, at: sol.created_at, sol })),
  ];
  return filas.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Filtro por lo tecleado: sin acentos ni mayúsculas y con varias palabras todas tienen
 *  que aparecer. Vacío devuelve todo. */
function filtrar<T>(xs: T[], buscar: string, texto: (x: T) => string): T[] {
  const palabras = norm(buscar).split(/\s+/).filter(Boolean);
  if (!palabras.length) return xs;
  return xs.filter((x) => { const t = texto(x); return palabras.every((p) => t.includes(p)); });
}

export const filtrarHistoricoSalidas = (filas: FilaHistoricoSalida[], buscar: string) =>
  filtrar(filas, buscar, (f) => (f.tipo === 'telefono' ? f.salidas.map(textoBuscableSalidaMina).join(' ') : textoBuscableSalidaPc(f.sol)));

export const filtrarHistoricoTraslados = (ts: TrasladoHistorico[], buscar: string) =>
  filtrar(ts, buscar, textoBuscableTraslado);

/** Igual, pero con los traslados ya agrupados por envío: basta que un producto coincida. */
export const filtrarLotesTraslado = (lotes: TrasladoHistorico[][], buscar: string) =>
  filtrar(lotes, buscar, (g) => g.map(textoBuscableTraslado).join(' '));

/** El aviso de una salida del módulo Salidas (PC), con el estilo del de la salida del teléfono. */
export function mensajeSalidaPc(sol: SolicitudSalida, quien?: string | null): string {
  const almacen = nombreDepositoChat(sol.almacen_origen || 'General');
  const items = itemsSalidaPc(sol);
  const lineas = [
    almacen === 'Inventario General' ? '📤 *SALIDA DE INVENTARIO LOS PINOS*' : '📤 *SALIDA DE DEPÓSITO*',
    `🔖 *N°:* ${sol.codigo}`,
    '',
  ];
  if (items.length === 1) {
    lineas.push(`📦 *Material:* ${items[0].nombre}`, `🔢 *Cantidad:* ${num(items[0].cantidad)}${items[0].unidad ? ` ${items[0].unidad}` : ''}`);
  } else {
    lineas.push('📦 *Materiales:*', ...items.map((it) => `• ${it.nombre}: ${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''}`));
  }
  if (sol.motivo?.trim()) lineas.push(`📝 *Motivo:* ${sol.motivo.trim()}`);
  if (sol.destino?.trim()) lineas.push(`📍 *Dirigido a:* ${sol.destino.trim()}`);
  if (sol.unidad_solicitante?.trim()) lineas.push(`🏷 *Unidad solicitante:* ${sol.unidad_solicitante.trim()}`);
  if (sol.aprobada_por) lineas.push(`✅ *Autorizado por:* ${quienSync(null, sol.aprobada_por)}`);
  lineas.push('🖥 *Registrada en:* Módulo Salidas', '');
  const q = quien ?? quienSync(sol.actor_name, sol.actor);
  if (q) lineas.push(`👷 *Registrado por:* ${q}`);
  const f = fechaHoraVE(sol.ejecutada_en ?? sol.created_at);
  if (f) lineas.push(`🕒 ${f}`);
  lineas.push('', `🏢 GOLDEN TOUCH 1127 C.A. · ${almacen}`);
  return lineas.join('\n');
}
