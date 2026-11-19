import { describe, expect, it } from 'vitest';
import type { Personal, PersonalFamiliar } from '@/shared/lib/types';
import {
  COLUMNAS_CARGA_MASIVA_NOMINA,
  buscarCuentaBancoTesoro,
  dividirNombreCompuesto,
  extraerTipoDocYCedula15,
  formatearCorrelativo7,
  formatearFechaBancaria8,
  formatearSueldoBancario15,
  formatearTelefono11,
  generarLoteCargaMasivaNomina,
  inferirUbicacionBancaria,
  mapearCodigoCargo3,
  mapearCodigoProfesion4,
  mapearNivelEducacion2,
  mezclarDatosPagoConCuentas,
  mezclarDatosPagoConFichaNomina,
  serializarCargaMasivaCsv,
  serializarCargaMasivaTxt,
  CONFIG_CARGA_MASIVA_DEFECTO,
} from './cargaMasivaNomina';

function crearPersonalBase(parcial: Partial<Personal> = {}): Personal {
  return {
    id: 'p-1',
    empresa: 'GT',
    nombre: 'Carlos Argenis',
    apellido: 'Martínez Villalta',
    cedula: 'V-2.980.635',
    rif: 'V-02980635-1',
    cargo: 'Analista de Compras',
    departamento: 'Compras',
    telefono: '+58 426-3869794',
    correo: 'carlos.martinez@goldentouch.com',
    fecha_ingreso: '2024-09-15',
    sueldo_base: 200,
    datos_pago: null,
    activo: true,
    created_at: '2024-09-15T12:00:00Z',
    ficha_nro: '001',
    fecha_nacimiento: '1990-05-04',
    nacionalidad: 'Venezolana',
    genero: 'M',
    estado_civil: 'casado',
    direccion: 'Urb. Unare II Calle 4 Casa 12, Puerto Ordaz',
    grado_instruccion: 'universitario',
    titulo_obtenido: 'Ingeniero Industrial',
    ...parcial,
  };
}

describe('cargaMasivaNomina · especificación 44 columnas (A..AR)', () => {
  it('define exactamente las 44 columnas oficiales desde A hasta AR', () => {
    expect(COLUMNAS_CARGA_MASIVA_NOMINA).toHaveLength(44);
    expect(COLUMNAS_CARGA_MASIVA_NOMINA[0].colLetra).toBe('A');
    expect(COLUMNAS_CARGA_MASIVA_NOMINA[0].clave).toBe('numero_banco');
    expect(COLUMNAS_CARGA_MASIVA_NOMINA[43].colLetra).toBe('AR');
    expect(COLUMNAS_CARGA_MASIVA_NOMINA[43].clave).toBe('tipo_solicitud');
  });

  it('formatea correlativos, cédula a 15 dígitos, fechas DDMMYYYY, teléfonos a 11 dígitos y sueldos a 15 dígitos', () => {
    expect(formatearCorrelativo7(1)).toBe('0000001');
    expect(formatearCorrelativo7(45)).toBe('0000045');

    expect(extraerTipoDocYCedula15('V-2.980.635', 'Venezolana')).toEqual({
      tipoDoc: 'V',
      cedula15: '000000002980635',
      digitos: '2980635',
    });
    expect(extraerTipoDocYCedula15('E-84512369', 'Colombiana')).toEqual({
      tipoDoc: 'E',
      cedula15: '000000084512369',
      digitos: '84512369',
    });

    expect(formatearFechaBancaria8('1944-09-19')).toBe('19091944');
    expect(formatearFechaBancaria8('15/09/2014')).toBe('15092014');

    expect(formatearTelefono11('+58 424-9639047')).toBe('04249639047');
    expect(formatearTelefono11('4141234567')).toBe('04141234567');
    expect(formatearTelefono11('')).toBe('00000000000');

    expect(formatearSueldoBancario15(14846.5, 'centimos')).toBe('000000001484650');
    expect(formatearSueldoBancario15(14846.5, 'entero')).toBe('000000000014847');
  });

  it('divide nombres y apellidos compuestos respetando preposiciones y limpiando tildes/Ñ', () => {
    expect(dividirNombreCompuesto('De La Cruz Peña')).toEqual(['DE LA CRUZ', 'PENA']);
    expect(dividirNombreCompuesto('María Del Valle')).toEqual(['MARIA', 'DEL VALLE']);
    expect(dividirNombreCompuesto('Solís')).toEqual(['SOLIS', '']);
  });

  it('mapea niveles educativos, profesiones (4 letras) y tipos de cargo (3 dígitos) contra catálogos oficiales', () => {
    expect(mapearNivelEducacion2('universitario', 'TSU en Geología y Minas')).toBe('04');
    expect(mapearNivelEducacion2('universitario', 'Ingeniero Mecánico')).toBe('05');
    expect(mapearNivelEducacion2('bachiller', null)).toBe('02');

    expect(mapearCodigoProfesion4('Ingeniero Industrial', 'Coordinador').codigo).toBe('INID');
    expect(mapearCodigoProfesion4('Lic. en Contaduría Pública', 'Contador').codigo).toBe('LCPU');
    expect(mapearCodigoProfesion4('TSU Geología', 'Geólogo').codigo).toBe('TSUG');
    expect(mapearCodigoProfesion4(null, 'Chofer de Carga Pesada').codigo).toBe('CHOF');

    expect(mapearCodigoCargo3('Gerente General').codigo).toBe('075');
    expect(mapearCodigoCargo3('Analista de Compras').codigo).toBe('007');
    expect(mapearCodigoCargo3('Comprador Senior').codigo).toBe('074');
    expect(mapearCodigoCargo3('Chofer').codigo).toBe('021');
    expect(mapearCodigoCargo3('Mecánico Diesel').codigo).toBe('016');
  });

  it('infiere códigos geográficos de Bolívar / Guayana desde la dirección', () => {
    const baseCfg = CONFIG_CARGA_MASIVA_DEFECTO;

    const sanFelix = inferirUbicacionBancaria('Sector Vista al Sol, San Félix', baseCfg);
    expect(sanFelix).toEqual({
      region: '09',
      estado: '07',
      ciudad: '7031',
      municipio: '0702',
      parroquia: '070108',
      zonaPostal10: '0000008051',
    });

    const elCallao = inferirUbicacionBancaria('Sector Centro El Callao Edo Bolívar', baseCfg);
    expect(elCallao.ciudad).toBe('7007');
    expect(elCallao.parroquia).toBe('070501');
    expect(elCallao.zonaPostal10).toBe('0000008056');
  });

  it('genera el lote completo con correlativos secuenciales, dependientes y detección de cuenta 0163', () => {
    const p1 = crearPersonalBase({
      id: 'p-1',
      sueldo_base: 100,
      datos_pago: {
        cuentas: [{ id: 'c1', tipo: 'transferencia', banco: '0163', cuenta: '01630405123456789012' }],
      },
    });
    const p2 = crearPersonalBase({
      id: 'p-2',
      nombre: 'Ana Sofía',
      apellido: 'Peña Rojas',
      cedula: 'V-25400100',
      genero: 'F',
      estado_civil: 'soltero',
      sueldo_base: 150,
      cargo: 'Contadora',
      titulo_obtenido: 'Licenciada en Contaduría Pública',
    });

    const famMap = new Map<string, PersonalFamiliar[]>([
      [
        'p-1',
        [
          {
            id: 'f1',
            personal_id: 'p-1',
            nombre: 'Hijo 1',
            parentesco: 'hijo',
            estudia: true,
            discapacidad: false,
            created_at: '2024-09-15T12:00:00Z',
          },
          {
            id: 'f2',
            personal_id: 'p-1',
            nombre: 'Esposa',
            parentesco: 'conyuge',
            estudia: false,
            discapacidad: false,
            created_at: '2024-09-15T12:00:00Z',
          },
        ],
      ],
    ]);

    const lote = generarLoteCargaMasivaNomina([p1, p2], famMap, {
      correlativoInicial: 10,
      porcionSueldo: 'bs_20',
      tasaBs: 50,
      oficinaPrincipal: '0405',
      oficinaSecundaria: '0405',
      tipoCuenta: 'CCVI',
      tipoNomina: 'B',
      tipoSolicitud: 'I',
    });

    expect(lote).toHaveLength(2);

    // Registro 1: 100 USD * 50 Bs * 20% = 1000.00 Bs -> 000000000100000
    expect(lote[0].celdas).toHaveLength(44);
    expect(lote[0].campos.numero_banco).toBe('0163');
    expect(lote[0].campos.correlativo_cliente).toBe('0000010');
    expect(lote[0].campos.dependientes).toBe('02');
    expect(lote[0].campos.estado_civil).toBe('2');
    expect(lote[0].campos.profesion).toBe('INID');
    expect(lote[0].campos.codigo_industria).toBe('0902');
    expect(lote[0].campos.sueldo_basico).toBe('000000000100000');
    expect(lote[0].campos.oficina_principal).toBe('0405');
    expect(lote[0].campos.tipo_solicitud).toBe('I');
    expect(lote[0].tieneCuenta0163).toBe(true);
    expect(buscarCuentaBancoTesoro(p1.datos_pago)).toBe('01630405123456789012');

    // Registro 2: correlativo siguiente 0000011, 150 * 50 * 20% = 1500.00 Bs -> 000000000150000
    expect(lote[1].campos.correlativo_cliente).toBe('0000011');
    expect(lote[1].campos.primer_apellido).toBe('PENA');
    expect(lote[1].campos.sexo).toBe('F');
    expect(lote[1].campos.dependientes).toBe('00');
    expect(lote[1].campos.profesion).toBe('LCPU');
    expect(lote[1].campos.sueldo_basico).toBe('000000000150000');
    expect(lote[1].tieneCuenta0163).toBe(false);
  });

  it('toma prioritariamente los campos guardados en ficha_nomina del formulario de personal sin perder cuentas bancarias', () => {
    const conCuentas = mezclarDatosPagoConCuentas(null, [
      { id: 'c1', tipo: 'transferencia', banco: '0163', cuenta: '01630221012211002934' },
    ]);
    const combinado = mezclarDatosPagoConFichaNomina(conCuentas, {
      calle_avenida: 'Av. Atlántico Manzana 8',
      casa_edificio: 'Res. Caroní',
      piso_nivel: '03',
      apto_local: '3-B',
      referencia: 'Diagonal al parque',
      telefono_local: '0286-9621455',
      condicion_inmueble: '2',
      tipo_vivienda: '3',
      tiempo_residencia: 5,
      pais_nacimiento: 'CO',
      region: '09',
      estado: '07',
      ciudad: '7029',
      municipio: '0701',
      parroquia: '070107',
      zona_postal: '8050',
      nivel_educacion_cod: '06',
      profesion_cod: 'GEOL',
      tipo_cargo_cod: '068',
      fuente_ingreso: '2',
      tipo_contrato: '1',
      tipo_nomina: 'M',
      tipo_cuenta_nomina: 'VI01',
      oficina_principal: '0410',
      oficina_secundaria: '0405',
    });

    const p = crearPersonalBase({ datos_pago: combinado });
    const [fila] = generarLoteCargaMasivaNomina([p], new Map(), {
      correlativoInicial: 180719,
      porcionSueldo: 'monto_fijo_bs',
      montoFijoBs: 7250,
    });

    expect(fila.campos.calle_avenida).toBe('AV. ATLANTICO MANZANA 8');
    expect(fila.campos.casa_edificio).toBe('RES. CARONI');
    expect(fila.campos.piso_nivel).toBe('03');
    expect(fila.campos.apto_local).toBe('3-B');
    expect(fila.campos.referencia).toBe('DIAGONAL AL PARQUE');
    expect(fila.campos.telefono_local).toBe('02869621455');
    expect(fila.campos.condicion_inmueble).toBe('2');
    expect(fila.campos.tipo_vivienda).toBe('3');
    expect(fila.campos.tiempo_residencia).toBe('05');
    expect(fila.campos.pais_nacimiento).toBe('CO');
    expect(fila.campos.parroquia).toBe('070107');
    expect(fila.campos.nivel_educacion).toBe('06');
    expect(fila.campos.profesion).toBe('GEOL');
    expect(fila.campos.tipo_cargo).toBe('068');
    expect(fila.campos.fuente_ingreso).toBe('2');
    expect(fila.campos.tipo_contrato).toBe('1');
    expect(fila.campos.tipo_nomina).toBe('M');
    expect(fila.campos.tipo_cuenta).toBe('VI01');
    expect(fila.campos.oficina_principal).toBe('0410');
    expect(fila.campos.oficina_secundaria).toBe('0405');
    // Y las cuentas bancarias no se perdieron:
    expect(fila.resumenTxt).toEqual({
      referencia10: '0163180719',
      cedula10: 'V002980635',
      cuenta20: '01630221012211002934',
      monto15: '000000000725000',
    });
  });

  it('serializa CSV (44 cols) y TXT en formato Resumen Hoja 1 (por defecto) y Sábana 44 cols', () => {
    const lote = generarLoteCargaMasivaNomina(
      [
        crearPersonalBase({
          datos_pago: {
            cuentas: [{ id: 'c1', tipo: 'transferencia', banco: '0163', cuenta: '01630221012211002934' }],
          },
        }),
      ],
      new Map(),
      { correlativoInicial: 180719, porcionSueldo: 'monto_fijo_bs', montoFijoBs: 7250 },
    );

    const csv = serializarCargaMasivaCsv(lote, true);
    const lineasCsv = csv.split('\r\n');
    expect(lineasCsv).toHaveLength(2);
    expect(lineasCsv[1]).toContain('"0163";"0180719";"V";"000000002980635"');
    expect(lineasCsv[1]).toContain('"000000000725000"');

    // Por defecto el TXT genera el Resumen de Hoja1 del Excel:
    const txtResumenTab = serializarCargaMasivaTxt(lote);
    expect(txtResumenTab).toBe('0163180719\tV002980635\t01630221012211002934\t000000000725000');

    const txtResumenFijo = serializarCargaMasivaTxt(lote, {
      modo: 'resumen_hoja1',
      separador: 'ancho_fijo',
      incluirEncabezado: false,
    });
    expect(txtResumenFijo).toBe('0163180719V00298063501630221012211002934000000000725000');
    expect(txtResumenFijo).toHaveLength(55);

    // Y en modo sabana_44 sigue soportando las 44 columnas:
    const txtPipe44 = serializarCargaMasivaTxt(lote, {
      modo: 'sabana_44',
      separador: '|',
      incluirEncabezado: false,
    });
    expect(txtPipe44.startsWith('0163|0180719|V|000000002980635|MARTINEZ|VILLALTA|CARLOS|ARGENIS|04051990|VE|VE|M|2|00|')).toBe(true);

    const txtAnchoFijo44 = serializarCargaMasivaTxt(lote, {
      modo: 'sabana_44',
      separador: 'ancho_fijo',
      incluirEncabezado: false,
    });
    const anchoEsperado = COLUMNAS_CARGA_MASIVA_NOMINA.reduce((acc, c) => acc + c.anchoFijo, 0);
    expect(txtAnchoFijo44).toHaveLength(anchoEsperado);
  });
});
