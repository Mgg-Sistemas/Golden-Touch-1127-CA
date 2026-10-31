import { describe, it, expect } from 'vitest';
import { esUnaDeLas16MaquinasAutorizadas, LISTA_16_MAQUINAS_AUTORIZADAS } from './maquinasAutorizadas';

describe('16 Máquinas autorizadas para surtir combustible', () => {
  it('tiene exactamente 16 definiciones oficiales', () => {
    expect(LISTA_16_MAQUINAS_AUTORIZADAS).toHaveLength(16);
  });

  const casosPositivos = [
    // 1. Articulado 1
    'VOLVO A35F 483',
    'CAMION ARTICULADO VOLVO (483)',
    'Articulado 1',
    'Camión Articulado Volvo 483',

    // 2. Articulado 2
    'VOLVO A35F 484',
    'CAMION ARTICULADO VOLVO (484)',
    'Articulado 2',

    // 3. Payloader Volvo
    'CARGADOR FLONTAL VOLVO L220G',
    'PAYLOADER VOLVO L220G 2014',
    'Paylober Volvo',
    'Volvo L220G',

    // 4. Retroexcavadora
    'CAT428E',
    'CAT 428E',
    'RETROEXCAVADORA',

    // 5. Jumbo volvo
    'VOLVO EC240-40144',
    'VOLVO EC240',
    'Jumbo volvo',

    // 6. Caterpillar D9R
    'CATERPILLAR D9R',
    'CAT D9R',

    // 7. Jumbo komatsu
    'KOMATSU PC220LC 8',
    'KOMATSU PC220',
    'Jumbo komatsu',

    // 8. Jumbo XCMG 215
    'JUMBO XCMG',
    'EXCAVADORA HIDRÁULICA XCMG XE215',
    'Jumbo XCMG 215',

    // 9. Jumbo XCMG 225
    'EXCAVADORA HIDRÁULICA XCMG XE225BR',
    'Jumbo XCMG 225',

    // 10. Planta perking
    'PLANTA ELÉCTRICA OLYMPIAN GEP550 (PERKINS)',
    'OLYMPIA GEP550 (PERKINS)',
    'Planta perking',
    'CAT GEP 550-1',

    // 11. Planta Yamagro de 60 KVA
    'YAMAGRO 60KVA',
    'Planta Yamagro de 60 KVA',
    'Generador Yamagro 60 KVA',

    // 12. Generador azul jheachyn
    'GE JHENCHIN AZUL',
    'Generador azul jheachyn',
    'PLANTA JHENCHIN',

    // 13. Compresor camión de servicio
    'COMPRESOR ATLAS XAS 37',
    'Compresor camión de servicio',

    // 14. Camioneta encava EP01
    'ENCAVA EP-01',
    'CAMIONETA ENCAVA EP-1000 A96BM3R',
    'Camioneta encava EP01',

    // 15. Toyota chasis largo blanca
    'MACHITO BLANCO TOYOTA',
    'MACHITO BLANCO',
    'CHASIS LARGO GPAMO',
    'Toyota chasis largo blanca',

    // 16. Camión de lubricación mitsubishi
    'CAMIÓN DE SERVICIO FK617',
    'camión de lubricación mitsubishi',
    'MITSUBISHI FK617',
  ];

  for (const nombre of casosPositivos) {
    it(`reconoce como autorizada: "${nombre}"`, () => {
      expect(esUnaDeLas16MaquinasAutorizadas(nombre)).toBe(true);
    });
  }

  const casosNegativos = [
    'CHUTO IVECO TRAKKER 720T42T A43AT7M',
    'CAMIÓN ASTRA HD864 A50BA9M',
    'CAMIÓN ENCAVA ET-8 A94EE8P',
    'APOYO BIDONES GT',
    'Bidones 20 Litros (2)',
    'Ajuste Manual',
    'Jhenchin Hilux Negra',
    'Jhenchin Hilux Roja',
    'Jhenchin Jumbo Caterpillar 320D',
    'GT Motobomba HP serial',
    'PATROL ALQUILADO (VÍA A GOLDEN)',
    'SINOMACH (1)',
    'SINOMACH (2)',
    'TRAKKER 380T38',
    'CAMIONETA FORD RANGER RAPTOR A62AC1X',
    'CAMIONETA FORD RANGER RAPTOR A64AV7R',
    'CAMIONETA FOTON BJ2037Y3MDV-S A98BM4R',
    'CAMIONETA HILUX A52AE4F',
    'CAMIONETA JEEP GRAND CHEROKEE AE600KM',
    'CAMIONETA LEXUS GX 460 AC626FP',
    'CAMIONETA LEXUS LX 600 AB215HH',
    'MOTO BERA 01',
    'MINI PALA',
    'MONTACARGAS NARANJA HELI',
  ];

  for (const nombre of casosNegativos) {
    it(`bloquea correctamente (false): "${nombre}"`, () => {
      expect(esUnaDeLas16MaquinasAutorizadas(nombre)).toBe(false);
    });
  }
});

