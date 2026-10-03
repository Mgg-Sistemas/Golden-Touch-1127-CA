/* ============================================================
   Golden Touch · Geodesta · borrador inicial del editor

   Lógica pura: arma lo que el editor muestra al abrirse, sea un informe
   nuevo (valores por defecto de la configuración) o uno guardado.
   ============================================================ */
import type { GeodestaConfig, InformeGeodesta } from '@/shared/lib/types';
import { hoyVE, type BorradorInforme } from './informeModelo';

/**
 * Un informe guardado manda siempre sobre la configuración. Los nulos pasan a
 * texto vacío para que ningún campo muestre «null». Sin configuración, todo
 * queda vacío y los dos logos encendidos.
 */
export function borradorDesdeInforme(inf: InformeGeodesta | null, cfg: GeodestaConfig | null): BorradorInforme {
  const f = inf ?? cfg;
  return {
    codigo: inf?.codigo ?? '',
    fecha: inf?.fecha ?? hoyVE(),
    estado: inf?.estado ?? 'borrador',
    ciudad: f?.ciudad ?? '',
    para_nombre: f?.para_nombre ?? '',
    para_cargo: f?.para_cargo ?? '',
    de_nombre: f?.de_nombre ?? '',
    de_cargo: f?.de_cargo ?? '',
    firma_nombre: f?.firma_nombre ?? '',
    firma_cargo: f?.firma_cargo ?? '',
    direccion_pie: f?.direccion_pie ?? '',
    logo_gt: f?.logo_gt ?? true,
    logo_cvm: f?.logo_cvm ?? true,
    apartados: inf?.apartados ?? [],
  };
}
