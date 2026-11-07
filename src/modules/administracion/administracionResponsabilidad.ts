/* ============================================================
   Golden Touch · Administración · Responsabilidad (lógica pura)
   Responsable efectivo (propio o HEREDADO de la carpeta), imputación al
   vencer/incumplir, carga por analista y «mis responsabilidades».
   Responsables = usuarios del sistema (por email). Herencia keyea sobre el
   campo `carpeta` del documento (string que ya existe; no depende del cutover).
   ============================================================ */
import type { DocumentoEmpresa, ObjetivoResp, Responsabilidad, StatusVencimiento } from './admin.repository';
import type { ItemAgenda } from './administracionAgenda';
import { ordenPrioridad } from './administracionVigencia';

const VENCIDO: StatusVencimiento[] = ['vencido', 'vencido_en_tramite'];

/** Emails distintos responsables de un objetivo concreto. */
export function responsablesDeObjetivo(tipo: ObjetivoResp, objetivoId: string, resp: Responsabilidad[]): string[] {
  const set = new Set<string>();
  for (const r of resp) if (r.objetivoTipo === tipo && r.objetivoId === objetivoId) set.add(r.usuarioEmail);
  return Array.from(set);
}

/** Responsables efectivos de un documento: propios si existen; si no, los de su carpeta. */
export function responsablesEfectivosDocumento(
  doc: DocumentoEmpresa,
  resp: Responsabilidad[],
): { emails: string[]; heredado: boolean } {
  const propios = responsablesDeObjetivo('documento', doc.id, resp);
  if (propios.length > 0) return { emails: propios, heredado: false };
  const deCarpeta = doc.carpeta ? responsablesDeObjetivo('carpeta', doc.carpeta, resp) : [];
  return { emails: deCarpeta, heredado: deCarpeta.length > 0 };
}

/** Responsables efectivos de cualquier ítem de agenda (documento con herencia; gasto/gestión directos). */
export function responsablesEfectivosItem(
  item: ItemAgenda,
  resp: Responsabilidad[],
  docPorId: Map<string, DocumentoEmpresa>,
): string[] {
  if (item.origen === 'documento') {
    const doc = docPorId.get(item.id);
    return doc ? responsablesEfectivosDocumento(doc, resp).emails : responsablesDeObjetivo('documento', item.id, resp);
  }
  const tipo: ObjetivoResp = item.origen === 'gasto' ? 'gasto' : 'gestion';
  return responsablesDeObjetivo(tipo, item.id, resp);
}

/** Imputación: `[]` salvo que el ítem esté vencido/incumplido; entonces sus responsables efectivos. */
export function imputacion(
  item: ItemAgenda,
  resp: Responsabilidad[],
  docPorId: Map<string, DocumentoEmpresa>,
): string[] {
  if (!VENCIDO.includes(item.status)) return [];
  return responsablesEfectivosItem(item, resp, docPorId);
}

/* ───────── Carga por analista + Mis responsabilidades ───────── */

export interface CargaAnalista {
  usuarioEmail: string;
  total: number;
  alDia: number;
  porVencer: number;
  vencidos: number;
  items: ItemAgenda[];
}

/** Agrega los ítems por responsable efectivo: un ítem compartido cuenta para cada responsable. */
export function cargaPorAnalista(
  items: ItemAgenda[],
  resp: Responsabilidad[],
  docPorId: Map<string, DocumentoEmpresa>,
): CargaAnalista[] {
  const mapa = new Map<string, CargaAnalista>();
  for (const item of items) {
    for (const email of responsablesEfectivosItem(item, resp, docPorId)) {
      const c = mapa.get(email) ?? { usuarioEmail: email, total: 0, alDia: 0, porVencer: 0, vencidos: 0, items: [] };
      c.total += 1;
      c.items.push(item);
      if (VENCIDO.includes(item.status)) c.vencidos += 1;
      else if (item.status === 'por_vencer') c.porVencer += 1;
      else c.alDia += 1;
      mapa.set(email, c);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.vencidos - a.vencidos || b.porVencer - a.porVencer || a.usuarioEmail.localeCompare(b.usuarioEmail));
}

export type OrdenMisResp = 'prioridad' | 'estatus' | 'vigencia_asc' | 'vigencia_desc';
const RANGO_ESTATUS: Record<StatusVencimiento, number> = { vencido: 0, vencido_en_tramite: 0, por_vencer: 1, vigente: 2, no_vence: 3 };

/** Los ítems a cargo de un analista, ordenados según el criterio elegido. */
export function misResponsabilidades(
  usuarioEmail: string,
  items: ItemAgenda[],
  resp: Responsabilidad[],
  docPorId: Map<string, DocumentoEmpresa>,
  orden: OrdenMisResp,
): ItemAgenda[] {
  const mios = items.filter((i) => responsablesEfectivosItem(i, resp, docPorId).includes(usuarioEmail));
  const dias = (i: ItemAgenda) => (i.diasRestantes == null ? Number.POSITIVE_INFINITY : i.diasRestantes);
  const cmp: Record<OrdenMisResp, (a: ItemAgenda, b: ItemAgenda) => number> = {
    prioridad: (a, b) => ordenPrioridad(a.prioridad) - ordenPrioridad(b.prioridad) || dias(a) - dias(b),
    estatus: (a, b) => RANGO_ESTATUS[a.status] - RANGO_ESTATUS[b.status] || dias(a) - dias(b),
    vigencia_asc: (a, b) => dias(a) - dias(b),
    vigencia_desc: (a, b) => dias(b) - dias(a),
  };
  return [...mios].sort(cmp[orden]);
}
