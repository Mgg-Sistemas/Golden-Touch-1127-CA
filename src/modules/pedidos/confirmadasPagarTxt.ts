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

   EL FORMATO SE CUIDA: se lee en monoespaciado (Bloc de notas, WhatsApp Web,
   correo), así que las etiquetas van alineadas a un ancho fijo y las líneas de
   separación miden lo mismo. Si se cambia un ancho hay que cambiarlo en la
   constante, no a ojo en cada línea.
   ============================================================ */
import type { ItemOrden, Orden, PagoMetodo, Proveedor } from '@/shared/lib/types';
import { labelMetodoPago } from './pedidos.repository';
import { labelBanco } from '@/shared/lib/bancos';

/** Ancho de las líneas de separación. */
const ANCHO = 62;
/** Ancho de la etiqueta en el bloque de datos de la orden («UNIDAD SOLICITANTE»). */
const ETIQUETA = 20;
/** Ancho de la etiqueta dentro de un método de pago («CI / RIF»). */
const ETIQUETA_PAGO = 10;

const REGLA_DOBLE = '='.repeat(ANCHO);
const REGLA = '-'.repeat(ANCHO);

/** Número con separador de miles VE y dos decimales, sin símbolo. */
function num(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Monto de la orden y de sus renglones: el dólar va con símbolo. */
function monto(n: number | null | undefined, moneda?: string | null): string {
  if (moneda === 'Bs') return `Bs ${num(n)}`;
  if (!moneda || moneda === 'USD') return `$ ${num(n)}`;
  return `${moneda} ${num(n)}`;
}

/** Monto de una pata del pago: acá la moneda se nombra (USD, Bs, USDT). */
function montoPata(m: PagoMetodo): string {
  return `${m.moneda || 'USD'} ${num(m.monto)}`;
}

/** `  ETIQUETA            : valor` */
function campo(etiqueta: string, valor: string, ancho = ETIQUETA, sangria = '  '): string {
  return `${sangria}${etiqueta.padEnd(ancho, ' ')}: ${valor}`;
}

/** Título de sección entre reglas. */
function seccion(titulo: string): string[] {
  return [REGLA, `  ${titulo}`, REGLA];
}

/**
 * Datos del proveedor para pagarle, uno por línea y con su nombre propio.
 * En pantalla estos datos se muestran en una sola línea separados por «·»;
 * acá van desplegados porque el que paga los copia de a uno (el número de
 * cuenta, el teléfono) y buscarlos dentro de un renglón largo es pedir error.
 */
function lineasDatosPago(metodo: string, d: Record<string, string> | undefined): string[] {
  const dd = d ?? {};
  const par = (etiqueta: string, valor?: string | null): string[] =>
    valor?.trim() ? [campo(etiqueta, valor.trim(), ETIQUETA_PAGO, '     ')] : [];

  if (metodo === 'pago_movil') {
    return [
      ...par('CI / RIF', dd.ci_rif),
      ...par('Banco', dd.banco ? labelBanco(dd.banco) : ''),
      ...par('Teléfono', dd.telefono),
    ];
  }
  if (metodo === 'transferencia') {
    return [
      ...par('Titular', dd.nombre),
      ...par('CI / RIF', dd.ci),
      ...par('Banco', dd.banco ? labelBanco(dd.banco) : ''),
      ...par('Cuenta', dd.cuenta),
    ];
  }
  if (metodo === 'zelle') {
    return [...par('Titular', dd.nombre), ...par('Correo', dd.email)];
  }
  if (metodo === 'binance_usdt') {
    return [...par('Correo / ID', dd.email_o_id)];
  }
  // Efectivo y «otro» no llevan datos: no hay a dónde transferir.
  return [];
}

/** Precio unitario del renglón, en la moneda en la que se va a pagar la orden. */
function precioItem(o: Orden, it: ItemOrden): number {
  if (o.pago_en_divisa && it.precio_usd != null) return Number(it.precio_usd) || 0;
  return Number(it.precio) || 0;
}

/** El cuerpo de una orden. */
function bloqueOrden(o: Orden, proveedor: Proveedor | null): string {
  const L: string[] = [];
  const moneda = o.pago_en_divisa ? 'USD' : (o.total_moneda || 'USD');

  // ── Identificación ──
  // Dos vacíos: uno cierra el encabezado del archivo y el otro deja el renglón
  // en blanco que lo separa de los datos.
  L.push('', '');
  if (o.oc_codigo) L.push(campo('ORDEN', o.oc_codigo));
  L.push(campo('SOLICITUD', o.codigo || '—'));
  L.push(campo('SOLICITA', o.solicitante?.trim() || o.solicitante_email || '—'));
  L.push(campo('UNIDAD SOLICITANTE', o.unidad_solicitante?.trim() || '—'));
  L.push(campo('PROVEEDOR', proveedor?.razon_social?.trim() || '—'));
  L.push('');

  // ── Qué se solicitó ──
  // Solo los ítems marcados para comprar: los otros quedaron fuera de la OC y
  // ponerlos acá sería cobrar por lo que no se compró.
  const items = (o.items ?? []).filter((it) => it.comprar !== false);
  L.push(...seccion('QUÉ SE SOLICITÓ'));
  if (!items.length) {
    L.push('   (sin ítems)');
  } else {
    items.forEach((it, i) => {
      const cant = Number(it.cantidad) || 0;
      const unidad = (it.unidad || 'UND').toUpperCase();
      const precio = precioItem(o, it);
      L.push(`  ${String(i + 1).padStart(2, ' ')}. ${it.nombre}`);
      L.push(`      ${num(cant).replace(/,00$/, '')} ${unidad} x ${monto(precio, moneda)}  =  ${monto(cant * precio, moneda)}`);
    });
  }
  L.push('');
  // El total es el de la orden, no la suma de los renglones: puede llevar IVA,
  // IGTF o un descuento por encima de las líneas.
  L.push(campo('TOTAL', monto(o.pago_en_divisa && o.total_divisa != null ? o.total_divisa : o.total, moneda)));
  L.push('');

  // ── Método de pago ──
  L.push(...seccion('MÉTODO DE PAGO'));
  const metodos = (o.metodo_pago ?? []) as PagoMetodo[];
  if (!metodos.length) {
    L.push('  (sin método indicado)');
  } else {
    metodos.forEach((m, i) => {
      if (i > 0) L.push('');
      L.push(`  [${i + 1}/${metodos.length}] ${labelMetodoPago(m.metodo)}   ${montoPata(m)}`);
      L.push(...lineasDatosPago(m.metodo, m.datos));
    });
  }
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

/** Una sola orden: la instrucción de pago para mandarla por chat o correo. */
export function descargarOrdenPagarTxt(orden: Orden, proveedor: Proveedor | null): void {
  const texto = [
    REGLA_DOBLE,
    '  GOLDEN TOUCH 1127',
    '  ORDEN CONFIRMADA PARA PAGAR',
    REGLA_DOBLE,
  ].join('\n') + bloqueOrden(orden, proveedor);
  // El nombre del archivo lleva el código: llegan varios por chat y hay que
  // distinguirlos sin abrirlos.
  const codigo = (orden.oc_codigo || orden.codigo || 'orden').replace(/[^A-Za-z0-9_-]+/g, '-');
  descargar(texto, `pagar-${codigo}.txt`);
}
