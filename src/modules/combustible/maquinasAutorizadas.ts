/* ============================================================
   Golden Touch · Combustible · 16 Máquinas Autorizadas para Surtir
   
   Define la lista de los 16 equipos operativos que tienen permitido
   recibir combustible (activo = true) en el catálogo de combustible.
   Cualquier otro equipo debe quedar desmarcado (activo = false)
   para que no aparezca en los desplegables de despacho de combustible.
   ============================================================ */

import { norm } from '@/shared/lib/texto';

export interface MaquinaAutorizadaDef {
  idKey: string;
  nombreSolicitado: string;
  nombreOficial: string;
  variantes: string[];
}

export const LISTA_16_MAQUINAS_AUTORIZADAS: MaquinaAutorizadaDef[] = [
  {
    idKey: 'articulado_1',
    nombreSolicitado: 'Articulado 1',
    nombreOficial: 'VOLVO A35F 483',
    variantes: ['VOLVO A35F 483', 'CAMION ARTICULADO VOLVO (483)', 'CAMION ARTICULADO VOLVO 483', 'ARTICULADO 1', 'A35F 483'],
  },
  {
    idKey: 'articulado_2',
    nombreSolicitado: 'Articulado 2',
    nombreOficial: 'VOLVO A35F 484',
    variantes: ['VOLVO A35F 484', 'CAMION ARTICULADO VOLVO (484)', 'CAMION ARTICULADO VOLVO 484', 'ARTICULADO 2', 'A35F 484'],
  },
  {
    idKey: 'payloader_volvo',
    nombreSolicitado: 'Paylober Volvo',
    nombreOficial: 'CARGADOR FLONTAL VOLVO L220G',
    variantes: ['CARGADOR FLONTAL VOLVO L220G', 'CARGADOR FRONTAL VOLVO L220G', 'PAYLOADER VOLVO L220G 2014', 'PAYLOADER VOLVO', 'VOLVO L220G', 'L220G'],
  },
  {
    idKey: 'retroexcavadora',
    nombreSolicitado: 'Retroexcavadora',
    nombreOficial: 'CAT428E',
    variantes: ['CAT428E', 'CAT 428E', 'RETROEXCAVADORA CAT 428E', 'RETROEXCAVADORA'],
  },
  {
    idKey: 'jumbo_volvo',
    nombreSolicitado: 'Jumbo volvo',
    nombreOficial: 'VOLVO EC240-40144',
    variantes: ['VOLVO EC240-40144', 'VOLVO EC240', 'EXCAVADORA VOLVO EC240', 'JUMBO VOLVO', 'EC240', 'EC240BLC'],
  },
  {
    idKey: 'caterpillar_d9r',
    nombreSolicitado: 'Caterpillar D9R',
    nombreOficial: 'CATERPILLAR D9R',
    variantes: ['CATERPILLAR D9R', 'CAT D9R', 'D9R'],
  },
  {
    idKey: 'jumbo_komatsu',
    nombreSolicitado: 'Jumbo komatsu',
    nombreOficial: 'KOMATSU PC220LC 8',
    variantes: ['KOMATSU PC220LC 8', 'KOMATSU PC220LC', 'KOMATSU PC220', 'JUMBO KOMATSU', 'PC220', 'PC220LC'],
  },
  {
    idKey: 'jumbo_xcmg_215',
    nombreSolicitado: 'Jumbo XCMG 215',
    nombreOficial: 'JUMBO XCMG',
    variantes: ['JUMBO XCMG', 'EXCAVADORA HIDRÁULICA XCMG XE215', 'EXCAVADORA XCMG XE215', 'XCMG XE215', 'JUMBO XCMG 215'],
  },
  {
    idKey: 'jumbo_xcmg_225',
    nombreSolicitado: 'Jumbo XCMG 225',
    nombreOficial: 'EXCAVADORA HIDRÁULICA XCMG XE225BR',
    variantes: ['EXCAVADORA HIDRÁULICA XCMG XE225BR', 'EXCAVADORA XCMG XE225BR', 'XCMG XE225BR', 'JUMBO XCMG 225', 'XE225BR'],
  },
  {
    idKey: 'planta_perkins',
    nombreSolicitado: 'Planta perking',
    nombreOficial: 'PLANTA ELÉCTRICA OLYMPIAN GEP550 (PERKINS)',
    variantes: [
      'PLANTA ELÉCTRICA OLYMPIAN GEP550 (PERKINS)',
      'PLANTA ELECTRICA OLYMPIAN GEP550 (PERKINS)',
      'OLYMPIA GEP550 (PERKINS)',
      'OLYMPIAN GEP550',
      'CAT GEP 550-1',
      'PLANTA PERKINS',
    ],
  },
  {
    idKey: 'planta_yamagro_60kva',
    nombreSolicitado: 'Planta Yamagro de 60 KVA',
    nombreOficial: 'YAMAGRO 60KVA',
    variantes: ['YAMAGRO 60KVA', 'YAMAGRO 60 KVA', 'PLANTA YAMAGRO 60KVA', 'GENERADOR YAMAGRO 60 KVA', 'BSCL-60KVA'],
  },
  {
    idKey: 'generador_azul_jhenchin',
    nombreSolicitado: 'Generador azul jheachyn',
    nombreOficial: 'GE JHENCHIN AZUL',
    variantes: ['GE JHENCHIN AZUL', 'GENERADOR JHENCHIN AZUL', 'PLANTA JHENCHIN', 'JHENCHIN AZUL', 'JHEACHYN AZUL'],
  },
  {
    idKey: 'compresor_camion_servicio',
    nombreSolicitado: 'Compresor camión de servicio',
    nombreOficial: 'COMPRESOR ATLAS XAS 37',
    variantes: ['COMPRESOR ATLAS XAS 37', 'COMPRESOR ATLAS', 'ATLAS XAS 37', 'XAS 37', 'COMPRESOR CAMION DE SERVICIO'],
  },
  {
    idKey: 'camioneta_encava_ep01',
    nombreSolicitado: 'Camioneta encava EP01',
    nombreOficial: 'ENCAVA EP-01',
    variantes: [
      'ENCAVA EP-01',
      'ENCAVA EP01',
      'CAMIONETA ENCAVA EP-1000 A96BM3R',
      'ENCAVA EP-1000-A96BM3R (3)',
      'ENCAVA EP-1000',
      'A96BM3R',
    ],
  },
  {
    idKey: 'toyota_chasis_largo_blanca',
    nombreSolicitado: 'Toyota chasis largo blanca',
    nombreOficial: 'MACHITO BLANCO TOYOTA',
    variantes: ['MACHITO BLANCO TOYOTA', 'MACHITO BLANCO', 'CHASIS LARGO GPAMO', 'TOYOTA CHASIS LARGO BLANCA', 'TOYOTA CHASIS LARGO'],
  },
  {
    idKey: 'camion_lubricacion_mitsubishi',
    nombreSolicitado: 'camión de lubricación mitsubishi',
    nombreOficial: 'CAMIÓN DE SERVICIO FK617',
    variantes: [
      'CAMIÓN DE SERVICIO FK617',
      'CAMION DE SERVICIO FK617',
      'MITSUBISHI FK617',
      'CAMION DE LUBRICACION MITSUBISHI',
      'CAMIÓN DE LUBRICACIÓN MITSUBISHI',
    ],
  },
];

/**
 * Determina si el nombre de un equipo (o valor de catálogo de combustible)
 * corresponde a alguna de las 16 máquinas operativas autorizadas.
 */
export function esUnaDeLas16MaquinasAutorizadas(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  const n = norm(nombre);
  if (!n) return false;

  // 1. Articulado 1 (Volvo A35F 483)
  if ((n.includes('a35f') && n.includes('483')) || n.includes('articulado 1') || (n.includes('articulado') && n.includes('483'))) {
    return true;
  }

  // 2. Articulado 2 (Volvo A35F 484)
  if ((n.includes('a35f') && n.includes('484')) || n.includes('articulado 2') || (n.includes('articulado') && n.includes('484'))) {
    return true;
  }

  // 3. Payloader Volvo (L220G)
  if (n.includes('l220g') || n.includes('paylober') || (n.includes('payloader') && n.includes('volvo'))) {
    return true;
  }

  // 4. Retroexcavadora (CAT 428E)
  if (n.includes('428e') || n.includes('retroexcavadora')) {
    return true;
  }

  // 5. Jumbo volvo (EC240)
  if (n.includes('ec240') || (n.includes('jumbo') && n.includes('volvo'))) {
    return true;
  }

  // 6. Caterpillar D9R
  if (n.includes('d9r')) {
    return true;
  }

  // 7. Jumbo komatsu (PC220)
  if (n.includes('pc220') || (n.includes('jumbo') && n.includes('komatsu'))) {
    return true;
  }

  // 8. Jumbo XCMG 215
  if ((n.includes('xcmg') && n.includes('215')) || n === norm('JUMBO XCMG')) {
    return true;
  }

  // 9. Jumbo XCMG 225
  if ((n.includes('xcmg') && n.includes('225')) || n.includes('xe225br')) {
    return true;
  }

  // 10. Planta perking (Olympian GEP550 Perkins)
  if (n.includes('perkin') || n.includes('gep550') || n.includes('gep 550') || n.includes('olympia')) {
    return true;
  }

  // 11. Planta Yamagro de 60 KVA
  if (n.includes('yamagro') && (n.includes('60') || n.includes('60kva') || n.includes('60 kva'))) {
    return true;
  }

  // 12. Generador azul jheachyn / jhenchin
  if (n.includes('jhenchin') && (n.includes('azul') || n.includes('planta'))) {
    return true;
  }
  if (n.includes('jheachyn') && n.includes('azul')) {
    return true;
  }

  // 13. Compresor camión de servicio
  if (n.includes('compresor') || n.includes('xas 37') || n.includes('xas37') || (n.includes('atlas') && n.includes('37'))) {
    return true;
  }

  // 14. Camioneta encava EP01
  if (n.includes('ep01') || n.includes('ep-01') || (n.includes('encava') && (n.includes('1000') || n.includes('a96bm3r')))) {
    return true;
  }

  // 15. Toyota chasis largo blanca (Machito blanco)
  if (n.includes('machito') || n.includes('chasis largo')) {
    return true;
  }

  // 16. Camión de lubricación mitsubishi
  if (
    n.includes('fk617') ||
    n === norm('CAMIÓN DE SERVICIO FK617') ||
    (n.includes('mitsubishi') && (n.includes('lubricacion') || n.includes('servicio')))
  ) {
    return true;
  }

  return false;
}
