/* ============================================================
   Golden Touch · Pedidos · Exportar «Confirmada pagar» a TXT

   Una orden ya confirmada para pagar, en texto plano: se abre en cualquier
   lado, se pega en un chat o en un correo y se lee sin depender del sistema.
   El botón vive en el pie del detalle de la OC, al lado de «OC PDF».

   POR QUÉ TXT Y NO PDF: el PDF es para imprimir y archivar; esto es para
   MANDAR la instrucción de pago. Un texto se copia, se corrige y se reenvía.

   QUÉ LLEVA: quién la pide, de qué unidad, qué pidió, a qué proveedor, y con
   qué método se paga —con los datos del proveedor y el monto de cada pata
   cuando el pago va partido—.
   ============================================================ */
import type { Orden, PagoMetodo, Proveedor } from '@/shared/lib/types';
import { labelMetodoPago } from './pedidos.repository';
import { resumenDatosPago } from '@/shared/ui/DatosPagoFields';

/** Monto con su moneda, sin depender del formateador de la app (esto es texto plano). */
function monto(n: number | null | undefined, moneda?: string | null): string {
  const v = Number(n) || 0;
  const num = v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (moneda === 'Bs') return `Bs ${num}`;
  if (!moneda || moneda === 'USD') return `$ ${num}`;
  return `${moneda} ${num}`;
}

function fecha(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

/** Etiqueta alineada, para que los dos puntos queden en columna y se lea de un vistazo. */
function campo(etiqueta: string, valor: string): string {
  return `${etiqueta.padEnd(20, ' ')}: ${valor}`;
}

/** Bloque de una orden. */
function bloqueOrden(o: Orden, proveedor: Proveedor | null): string {
  const L: string[] = [];
  const codigo = [o.codigo, o.oc_codigo].filter(Boolean).join('  ·  ') || o.id;

  L.push('─'.repeat(64));
  L.push(codigo);
  L.push('─'.repeat(64));
  L.push(campo('Solicita', o.solicitante?.trim() || o.solicitante_email || '—'));
  L.push(campo('Unidad solicitante', o.unidad_solicitante?.trim() || '—'));
  L.push(campo('Proveedor', proveedor?.razon_social?.trim() || '—'));
  if (proveedor?.rif) L.push(campo('RIF del proveedor', proveedor.rif));
  L.push(campo('Fecha de la orden', fecha(o.created_at)));

  // ── Qué solicitó ──
  // Solo los ítems marcados para comprar: los demás quedaron fuera de la OC y
  // ponerlos acá haría pagar por lo que no se compró.
  const items = (o.items ?? []).filter((it) => it.comprar !== false);
  L.push('');
  L.push('Qué solicitó:');
  if (!items.length) {
    L.push('  (sin ítems)');
  } else {
    for (const it of items) {
      const cant = Number(it.cantidad) || 0;
      const unidad = it.unidad ? ` ${it.unidad}` : '';
      const marca = [it.marca, it.modelo].filter(Boolean).join(' ');
      const detalle = [it.sku, marca || null].filter(Boolean).join(' · ');
      L.push(`  · ${cant}${unidad} — ${it.nombre}${detalle ? `  (${detalle})` : ''}`);
      if (it.finalidad?.trim()) L.push(`      para: ${it.finalidad.trim()}`);
    }
  }

  // ── Cómo se paga ──
  const metodos = (o.metodo_pago ?? []) as PagoMetodo[];
  L.push('');
  L.push('Método de pago:');
  if (!metodos.length) {
    L.push('  (sin método indicado)');
  } else {
    for (const m of metodos) {
      L.push(`  · ${labelMetodoPago(m.metodo)} — ${monto(m.monto, m.moneda)}`);
      const datos = resumenDatosPago(m.metodo, m.datos ?? {}).trim();
      if (datos) L.push(`      ${datos}`);
    }
  }

  L.push('');
  L.push(campo('TOTAL', monto(o.total, o.total_moneda)));
  L.push('');
  return L.join('\n');
}

/** Dispara la descarga de un texto como archivo .txt. */
function descargar(texto: string, nombre: string): void {
  // El Bloc de notas de Windows solo corta en \r\n: sin eso el archivo se ve
  // como un único renglón enorme.
  const blob = new Blob([texto.split('\n').join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Encabezado del archivo. */
function encabezado(titulo: string, extra?: string): string {
  return [
    'GOLDEN TOUCH 1127 C.A.',
    titulo,
    `Generado: ${new Date().toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' })}`,
    ...(extra ? [extra] : []),
    '',
  ].join('\n');
}

/** Una sola orden: la instrucción de pago para mandarla por chat o correo. */
export function descargarOrdenPagarTxt(orden: Orden, proveedor: Proveedor | null): void {
  const texto = encabezado('ORDEN CONFIRMADA PARA PAGAR') + bloqueOrden(orden, proveedor);
  // El nombre del archivo lleva el código: llegan varios por chat y hay que
  // distinguirlos sin abrirlos.
  const codigo = (orden.oc_codigo || orden.codigo || 'orden').replace(/[^A-Za-z0-9_-]+/g, '-');
  descargar(texto, `pagar-${codigo}.txt`);
}
