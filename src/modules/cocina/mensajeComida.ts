/* ============================================================
   Golden Touch · Cocina · Aviso de la comida para WhatsApp

   Lo que se manda al grupo apenas se carga el desayuno, el almuerzo o la
   cena: qué comida fue, cuántas personas comieron, de qué día y qué se
   consumió. Mismo molde que el aviso de combustible.

   TODOS los emojis son «emoji por defecto» a propósito. El plato con
   cubiertos que usa la pantalla (🍽) es un símbolo de TEXTO: solo se pinta a
   color si lo acompaña el selector invisible U+FE0F, y WhatsApp lo pierde al
   abrir el mensaje, así que en el teléfono llega como un cuadrito. Por eso el
   almuerzo va aquí con la olla (🍲). La prueba de este archivo corta
   cualquier emoji que dependa de ese selector.

   El costo NO va en el mensaje: es un aviso para un grupo de trabajo.
   ============================================================ */
import type { CocinaMovimiento, TipoComida } from './cocina.repository';
import { diaCaracas } from './comidaMovil';

export const EMOJI_COMIDA: Record<TipoComida, string> = {
  desayuno: '🍳',
  almuerzo: '🍲',
  cena: '🌙',
};

export const TITULO_COMIDA: Record<TipoComida, string> = {
  desayuno: 'DESAYUNO SERVIDO',
  almuerzo: 'ALMUERZO SERVIDO',
  cena: 'CENA SERVIDA',
};

const num = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 2 });

/** AAAA-MM-DD → DD/MM/AAAA. */
function fechaCorta(dia: string): string {
  return dia.length === 10 ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : '';
}

export interface DatosMensajeComida {
  mov: Pick<CocinaMovimiento, 'tipo_comida' | 'platos' | 'items' | 'nota' | 'codigo' | 'at'>;
  /** Unidad de cada víver (producto_id → «KG», «UND»…), si se conoce. */
  unidades?: Record<string, string | null | undefined>;
  /** Quién lo cargó (va al pie). */
  registradoPor?: string | null;
}

/**
 * El mensaje listo para WhatsApp. Cada dato en su renglón: los que no existen
 * no se escriben, así no quedan renglones vacíos.
 */
export function mensajeComida(d: DatosMensajeComida): string {
  const m = d.mov;
  const tipo = m.tipo_comida;
  const personas = Number(m.platos) || 0;
  const lineas: string[] = [
    `${EMOJI_COMIDA[tipo] ?? '🍲'} *${TITULO_COMIDA[tipo] ?? 'COMIDA SERVIDA'}*`,
    '',
    `👥 *Personas:* ${num(personas)}`,
  ];

  const fecha = fechaCorta(diaCaracas(m.at));
  if (fecha) lineas.push(`📅 *Fecha:* ${fecha}`);
  if (m.codigo) lineas.push(`🧾 *Registro:* ${m.codigo}`);

  const items = (m.items ?? []).filter((i) => Number(i.cantidad) > 0);
  if (items.length) {
    lineas.push('', '🥘 *Consumo:*');
    for (const it of items) {
      const unidad = (it.unidad ?? d.unidades?.[it.producto_id] ?? '').trim();
      lineas.push(`🔸 ${num(it.cantidad)}${unidad ? ` ${unidad}` : ''} · ${it.nombre}`);
    }
  }

  if (m.nota?.trim()) lineas.push('', `📝 *Nota:* ${m.nota.trim()}`);

  lineas.push('', `🏢 GOLDEN TOUCH 1127 C.A.${d.registradoPor ? ` · Cargado por ${d.registradoPor}` : ''}`);
  return lineas.join('\n');
}
