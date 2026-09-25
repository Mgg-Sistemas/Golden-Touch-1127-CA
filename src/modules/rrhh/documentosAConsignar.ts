/* ============================================================
   Golden Touch · RRHH · Documentos a consignar por oficina

   El listado que la oficina va tildando a medida que quien ingresa entrega
   sus papeles. Va como SEGUNDA HOJA de la hoja de ingreso, así que se
   imprime y se llena a mano junto con ella.

   POR QUÉ ESTÁ ACÁ Y NO ESCRITO DENTRO DEL PDF. Es una lista que va a
   cambiar: se agrega un requisito, se saca otro. Teniéndola como dato se
   toca en un solo lugar, se puede probar (que no haya repetidos, que ningún
   segmento quede vacío) y mañana la misma lista sirve para una pantalla de
   control de expedientes sin volver a escribirla.

   LO QUE NO ESTÁ, A PROPÓSITO: nada bancario. La hoja de ingreso se armó sin
   la sección de datos de transferencia a pedido del usuario, así que pedir
   acá una constancia de cuenta sería volver a entrar por la ventana.

   «(si aplica)» marca lo que no le corresponde a todo el mundo: sin eso, una
   lista con casilleros vacíos parece un expediente incompleto.
   ============================================================ */

export interface SegmentoDocumentos {
  /** Título del segmento, tal como sale impreso. */
  titulo: string;
  /** Cada documento, uno por casillero. */
  documentos: string[];
}

export const SEGMENTOS_DOCUMENTOS: readonly SegmentoDocumentos[] = [
  {
    titulo: 'Documentos personales',
    documentos: [
      'Copia de la cédula de identidad (legible, ampliada)',
      'Copia del RIF personal (SENIAT, vigente)',
      'Dos (2) fotografías tipo carnet, fondo blanco',
      'Copia de la partida de nacimiento',
      'Constancia de residencia o carta de domicilio',
      'Copia de la licencia de conducir (si aplica)',
      'Certificado de no antecedentes penales (si aplica)',
    ],
  },
  {
    titulo: 'Documentos académicos y laborales',
    documentos: [
      'Copia del título obtenido (bachiller, técnico o universitario)',
      'Notas certificadas del último grado cursado',
      'Certificados de cursos, talleres y capacitaciones',
      'Currículum vitae actualizado',
      'Constancias de trabajo de empleos anteriores',
      'Dos (2) referencias personales con teléfono de contacto',
      'Copia del colegio o gremio profesional (si aplica)',
    ],
  },
  {
    titulo: 'Documentos de salud',
    documentos: [
      'Certificado médico de salud pre-empleo (vigente)',
      'Examen médico ocupacional del cargo a desempeñar',
      'Constancia del tipo de sangre y factor RH',
      'Constancia o carnet de vacunación',
      'Informe médico de enfermedad preexistente (si aplica)',
      'Informe médico de alergias declaradas (si aplica)',
      'Certificado de discapacidad CONAPDIS (si aplica)',
    ],
  },
  {
    titulo: 'Documentos de matrimonio y carga familiar',
    documentos: [
      'Copia del acta de matrimonio',
      'Constancia de concubinato o unión estable de hecho (si aplica)',
      'Copia de la cédula del cónyuge o pareja',
      'Copia de la partida de nacimiento de cada hijo',
      'Copia de la cédula de los hijos mayores de nueve (9) años',
      'Constancia de estudios de cada hijo en edad escolar',
      'Copia de la cédula de los padres a cargo (si aplica)',
      'Acta de defunción del cónyuge (si aplica)',
    ],
  },
  {
    titulo: 'Seguridad social y régimen laboral',
    documentos: [
      'Constancia de inscripción en el IVSS (forma 14-02)',
      'Constancia de cuenta individual del IVSS',
      'Planilla de inscripción del FAOV / BANAVIH',
      'Declaración de beneficiarios de la póliza',
      'Copia del carnet del INCES (si aplica)',
    ],
  },
];

/** Todos los documentos de la lista, sin importar el segmento. */
export function todosLosDocumentos(): string[] {
  return SEGMENTOS_DOCUMENTOS.flatMap((s) => s.documentos);
}

/** Cuántos casilleros tiene la hoja en total. Para no contarlos a mano. */
export function totalDocumentos(): number {
  return todosLosDocumentos().length;
}
