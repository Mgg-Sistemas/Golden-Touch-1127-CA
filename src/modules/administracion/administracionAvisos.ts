/* ============================================================
   Golden Touch · Administración · Avisos (builder puro)
   Deriva los avisos por_vencer/vencido de la agenda, uno por responsable
   efectivo, SIN duplicar los que ya existen. Los avisos de acuerdo/nota se
   crean a mano (crearAviso), no aquí.
   ============================================================ */
import type { Aviso, AvisoInput, DocumentoEmpresa, Responsabilidad } from './admin.repository';
import type { ItemAgenda } from './administracionAgenda';
import { responsablesEfectivosItem } from './administracionResponsabilidad';

function tipoDesdeStatus(status: ItemAgenda['status']): 'por_vencer' | 'vencido' | null {
  if (status === 'vencido' || status === 'vencido_en_tramite') return 'vencido';
  if (status === 'por_vencer') return 'por_vencer';
  return null;
}

const clave = (origen: string, origenId: string, tipo: string, email: string | null) =>
  `${origen}|${origenId}|${tipo}|${email ?? ''}`;

/** Avisos NUEVOS a materializar (los que no estén ya en `existentes`). Un ítem por_vencer/vencido
 *  genera un aviso por cada responsable efectivo; si no tiene, uno con responsable null. */
export function construirAvisos(
  items: ItemAgenda[],
  resp: Responsabilidad[],
  docPorId: Map<string, DocumentoEmpresa>,
  existentes: Aviso[],
): AvisoInput[] {
  const yaHay = new Set(existentes.map((a) => clave(a.origen, a.origenId, a.tipo, a.responsableEmail)));
  const nuevos: AvisoInput[] = [];
  const emitidos = new Set<string>();

  for (const item of items) {
    const tipo = tipoDesdeStatus(item.status);
    if (!tipo) continue;
    const efectivos = responsablesEfectivosItem(item, resp, docPorId);
    const destinatarios: (string | null)[] = efectivos.length > 0 ? efectivos : [null];
    const textoBase = tipo === 'vencido' ? `Vencido: ${item.titulo}` : `Por vencer: ${item.titulo}`;
    for (const email of destinatarios) {
      const k = clave(item.origen, item.id, tipo, email);
      if (yaHay.has(k) || emitidos.has(k)) continue;
      emitidos.add(k);
      nuevos.push({
        empresaClave: item.empresaClave, tipo, origen: item.origen, origenId: item.id,
        responsableEmail: email, fecha: item.fecha, texto: textoBase,
      });
    }
  }
  return nuevos;
}
