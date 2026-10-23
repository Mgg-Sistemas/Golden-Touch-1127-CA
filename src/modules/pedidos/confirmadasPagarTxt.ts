/* ============================================================
   Golden Touch · Pedidos · Exportar «Confirmada pagar» a TXT

   Una orden ya confirmada para pagar, en texto plano: se copia y se pega en
   un chat. El botón vive en el pie del detalle de la OC, al lado de «OC PDF».

   POR QUÉ TXT Y NO PDF: el PDF es para imprimir y archivar; esto es para
   MANDAR la instrucción de pago. Un texto se copia, se corrige y se reenvía.

   EL FORMATO ES PARA WHATSAPP, NO PARA EL BLOC DE NOTAS.
   Antes esto se escribía en monoespaciado, con etiquetas alineadas a un ancho
   fijo y líneas de guiones para separar. Se veía bien en el Bloc de notas y
   mal donde de verdad se usa: WhatsApp usa tipografía proporcional, así que
   la alineación por espacios se desarma, y en un teléfono cada línea larga se
   parte sola. Ahora se escribe con el marcado de WhatsApp —`*negrita*`— y un
   emoji por campo, que es lo que hace que se lea de un vistazo en el chat.

   TAMBIÉN SIRVE PARA LAS COMPRAS A CRÉDITO (cuenta abierta). Ahí el total no
   es lo que se paga hoy: se agregan lo abonado y el saldo, que es el número que
   de verdad se manda. Sin eso el mensaje diría de más.

   QUÉ LLEVA: la orden, el proveedor, para qué se pide, la nota, cuánto, y por
   dónde se paga. Nada más. No lleva la lista de productos a propósito: quien
   paga necesita a quién, cuánto y por dónde; el detalle de qué se compró vive
   en la OC y en su PDF, que es donde se revisa.
   ============================================================ */
import type { Orden, PagoMetodo, Proveedor } from '@/shared/lib/types';
import { labelMetodoPago } from './pedidos.repository';
import { BANCOS_VE } from '@/shared/lib/bancos';

/** Número con separador de miles VE y dos decimales, sin símbolo. */
function num(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Monto de la orden: el dólar va con símbolo pegado, como se escribe en el chat. */
function monto(n: number | null | undefined, moneda?: string | null): string {
  if (moneda === 'Bs') return `Bs ${num(n)}`;
  if (!moneda || moneda === 'USD') return `$${num(n)}`;
  return `${moneda} ${num(n)}`;
}

/** Monto de una pata del pago: aquí la moneda se nombra (USD, Bs, USDT). */
function montoPata(m: PagoMetodo): string {
  return `${m.moneda || 'USD'} ${num(m.monto)}`;
}

/**
 * Banco como lo pide quien paga: el nombre primero y el código entre
 * paréntesis. En la app se muestra al revés («0102 · Banco de Venezuela»)
 * porque ahí se elige de una lista ordenada por código; aquí se lee, no se
 * busca, y el nombre es lo que se reconoce.
 */
function banco(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  const b = BANCOS_VE.find((x) => x.codigo === codigo);
  return b ? `${b.nombre} (${b.codigo})` : codigo;
}

import { nombrePersonaCompras } from './personasCompras';

/** Nombre de quien hizo algo: Nombre y Apellido legible para humanos (nunca correo con @). */
function nombreDe(identificador: string | null | undefined, personas?: Map<string, string>): string {
  return nombrePersonaCompras(identificador, personas);
}

/**
 * Quiénes intervinieron en la orden, uno por renglón y solo los que se conocen:
 * quien hace la solicitud, quien autorizó (el Gerente General o Jefa de administración al aprobar la OC) y el
 * analista de compras encargado (el que elaboró la OC o indicó el método de pago).
 * Se muestra siempre Nombre y Apellido, nunca correo electrónico.
 */
function lineasPersonas(o: Orden, personas: Map<string, string> | undefined, conAutorizo: boolean): string[] {
  const L: string[] = [];
  const unidad = o.unidad_solicitante?.trim();
  const solRaw = o.solicitante?.trim() || o.solicitante_email?.trim();
  const solNombre = solRaw ? nombrePersonaCompras(solRaw, personas) : '';
  const solicita = [solNombre, unidad].filter(Boolean).join(' · ');
  if (solicita) L.push(`👤 *Solicita:* ${solicita}`);
  if (conAutorizo) {
    const autorizo = nombreDe(o.oc_aprobada_por || o.aprobada_por, personas);
    if (autorizo) L.push(`✅ *Autorizó:* ${autorizo}`);
  }
  const analistaRaw = o.oc_creada_por || o.oc_emitida_por || o.metodo_pago_por;
  if (analistaRaw) {
    const analista = nombreDe(analistaRaw, personas);
    if (analista) L.push(`🛒 *Analista de compras:* ${analista}`);
  }
  return L;
}

/**
 * El «para qué» de la solicitud. Se resuelve igual que en el PDF de la orden
 * —primero la finalidad de la orden, si no las de sus renglones, si no el
 * motivo— para que los dos documentos digan lo mismo.
 */
function descripcionDe(o: Orden): string {
  const propia = o.finalidad?.trim();
  if (propia) return propia;
  const deItems = Array.from(new Set((o.items ?? []).map((it) => (it.finalidad ?? '').trim()).filter(Boolean)));
  if (deItems.length) return deItems.join(' · ');
  return o.motivo?.trim() || '';
}

/**
 * Los datos para pagarle, uno por viñeta. Van desplegados y no en una línea
 * separada por «·» porque el que paga los copia de a uno —el número de
 * cuenta, el teléfono— y buscarlos dentro de un renglón largo es pedir error.
 */
function lineasDatosPago(metodo: string, d: Record<string, string> | undefined): string[] {
  const dd = d ?? {};
  const par = (etiqueta: string, valor?: string | null): string[] =>
    valor?.trim() ? [`* ${etiqueta}: ${valor.trim()}`] : [];

  if (metodo === 'pago_movil') {
    return [
      ...par('Banco', dd.banco ? banco(dd.banco) : ''),
      ...par('CI/RIF', dd.ci_rif),
      ...par('Tlf', dd.telefono),
    ];
  }
  if (metodo === 'transferencia') {
    return [
      ...par('Titular', dd.nombre),
      ...par('CI/RIF', dd.ci),
      ...par('Banco', dd.banco ? banco(dd.banco) : ''),
      ...par('Cuenta', dd.cuenta),
    ];
  }
  if (metodo === 'zelle') {
    return [...par('Titular', dd.nombre), ...par('Correo', dd.email)];
  }
  if (metodo === 'binance_usdt') {
    return [...par('Correo/ID', dd.email_o_id)];
  }
  // Efectivo y «otro» no llevan datos: no hay a dónde transferir.
  return [];
}

/**
 * Determina si la orden corresponde a una cuenta a crédito (abonos abiertos).
 * En estas órdenes no se muestra método de pago: se pagan mediante abonos en Tesorería.
 */
export function esCuentaCredito(orden: Partial<Pick<Orden, 'condiciones_pago' | 'estado' | 'abonado_total'>>): boolean {
  return orden.condiciones_pago === 'credito'
    || orden.estado === 'cuenta_abierta'
    || (Number(orden.abonado_total) || 0) > 0;
}

/**
 * El cuerpo de una orden, en el marcado de WhatsApp.
 * Se exporta para poder fijarlo con tests: el formato es un acuerdo con quien
 * lo lee del otro lado del chat, así que un cambio accidental se tiene que
 * notar aquí y no en el teléfono de alguien.
 */
export function textoOrdenPagar(o: Orden, proveedor: Proveedor | null, personas?: Map<string, string>): string {
  const L: string[] = [];
  const moneda = o.pago_en_divisa ? 'USD' : (o.total_moneda || 'USD');
  const esCredito = esCuentaCredito(o);

  // Título y pie como el aviso de Combustible: el chat es un grupo de trabajo y el
  // mensaje tiene que decir de entrada qué es y de dónde viene.
  L.push(esCredito ? '🧾 *COMPRA A CRÉDITO*' : '💸 *ORDEN PARA PAGAR*', '');
  L.push(`🔹 *ORDEN:* ${o.oc_codigo || o.codigo || '—'}`);
  L.push(`🏭 *Proveedor:* ${proveedor?.razon_social?.trim() || '—'}`);
  L.push(...lineasPersonas(o, personas, true));
  // El detalle solo si existe: un «Detalle: —» no informa nada y aleja el
  // método de pago, que es lo que se busca en este papel.
  const descripcion = descripcionDe(o);
  if (descripcion) L.push(`📝 *Detalle:* ${descripcion}`);
  // La nota es, en los hechos, el campo que la gente llena: la tienen 64 de
  // las 70 ordenes con metodo de pago cargado, contra 2 que tienen finalidad o
  // motivo. Va entera y sin cortar: el chat la envuelve solo.
  const nota = o.notas?.trim();
  // 📌 y no 🗒: ese es símbolo de TEXTO y necesita el selector invisible U+FE0F, que WhatsApp pierde.
  if (nota) L.push(`📌 *Nota:* ${nota}`);
  // El total es el de la orden, no la suma de los renglones: puede llevar IVA,
  // IGTF o un descuento por encima de las líneas.
  const totalOrden = Number(o.pago_en_divisa && o.total_divisa != null ? o.total_divisa : o.total) || 0;
  L.push(`💵 *Total:* ${monto(totalOrden, moneda)}`);

  // A CRÉDITO: el total no es lo que hay que pagar hoy. Una cuenta abierta se salda
  // por abonos, así que mandar solo el total es mandar el número equivocado: quien
  // recibe el mensaje paga de más o vuelve a preguntar. Se dice cuánto se abonó y
  // cuánto queda. Sin abonos todavía no hay resta que mostrar, pero igual se avisa
  // que es a crédito para que nadie lo lea como un pago único.
  // Tampoco lleva método de pago: se paga por abonos en Tesorería.
  if (esCredito) {
    const abonado = Number(o.abonado_total) || 0;
    if (abonado > 0) {
      L.push(`💰 *Abonado:* ${monto(abonado, moneda)}`);
      L.push(`🧾 *Saldo a pagar:* ${monto(Math.max(0, Math.round((totalOrden - abonado) * 100) / 100), moneda)}`);
    } else {
      L.push('🧾 *A crédito:* cuenta abierta, sin abonos todavía');
    }
  } else {
    const metodos = (o.metodo_pago ?? []) as PagoMetodo[];
    if (!metodos.length) {
      L.push('💳 *Método de pago:* (sin indicar)');
    } else {
      // Con una sola pata el monto ya está en el total y repetirlo estorba. Con
      // varias hace falta: es lo que dice cuánto va por cada lado.
      const partido = metodos.length > 1;
      for (const m of metodos) {
        L.push(`💳 *${labelMetodoPago(m.metodo)}:*${partido ? ` ${montoPata(m)}` : ''}`);
        L.push(...lineasDatosPago(m.metodo, m.datos));
      }
    }
  }
  L.push('', '🏢 GOLDEN TOUCH 1127 C.A.');
  return L.join('\n');
}


/**
 * El aviso para el Gerente General: la orden ya tiene proveedor elegido y espera su
 * aprobación. Lleva lo que se necesita para decidir —quién pide, a quién se le compra,
 * qué y cuánto cuesta— y nada del pago, que todavía no se indica en esta etapa.
 */
export function textoOrdenAprobacion(o: Orden, proveedor: Proveedor | null, personas?: Map<string, string>): string {
  const L: string[] = [];
  const moneda = o.pago_en_divisa ? 'USD' : (o.total_moneda || 'USD');
  const esServicio = o.tipo === 'servicio';

  L.push(`⏳ *${esServicio ? 'CONTROL DE SERVICIO' : 'ORDEN'} PENDIENTE POR APROBACIÓN*`, '');
  L.push(`🔹 *ORDEN:* ${o.oc_codigo || o.codigo || '—'}`);
  L.push(`🏭 *Proveedor:* ${proveedor?.razon_social?.trim() || '—'}`);
  L.push(...lineasPersonas(o, personas, false));
  if (o.urgente) L.push('🚨 *URGENTE*');
  const descripcion = descripcionDe(o);
  if (descripcion) L.push(`📝 *Detalle:* ${descripcion}`);

  const items = (o.items ?? []).filter((it) => it.comprar !== false);
  // Solo CUÁNTOS productos son, no cuáles (pedido del usuario 20/10/2026): el gerente decide
  // con quién, para qué y por cuánto; qué se compró se revisa en la OC.
  if (items.length) L.push(`📦 *Cantidad de productos:* ${items.length}`);

  const nota = o.notas?.trim();
  if (nota) L.push(`📌 *Nota:* ${nota}`);
  const totalOrden = Number(o.pago_en_divisa && o.total_divisa != null ? o.total_divisa : o.total) || 0;
  L.push(`💵 *Total:* ${monto(totalOrden, moneda)}`);
  L.push('', '🏢 GOLDEN TOUCH 1127 C.A.');
  return L.join('\n');
}
