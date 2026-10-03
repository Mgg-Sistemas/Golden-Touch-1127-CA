/* Filtrado del historico. Logica pura, sin red: se prueba sola. */
import { norm } from '@/shared/lib/texto';
import type { EstadoInforme, InformeGeodesta } from '@/shared/lib/types';

export interface FiltrosInforme {
  desde: string;
  hasta: string;
  estado: EstadoInforme | '';
  palabra: string;
}

export const FILTROS_VACIOS: FiltrosInforme = { desde: '', hasta: '', estado: '', palabra: '' };

export function filtrarInformes(lista: InformeGeodesta[], f: FiltrosInforme): InformeGeodesta[] {
  const palabra = norm(f.palabra);
  return lista.filter((i) => {
    if (f.desde && i.fecha < f.desde) return false;      // las fechas ISO se comparan como texto
    if (f.hasta && i.fecha > f.hasta) return false;
    if (f.estado && i.estado !== f.estado) return false;
    if (palabra && !norm(i.busq ?? '').includes(palabra)) return false;
    return true;
  });
}
