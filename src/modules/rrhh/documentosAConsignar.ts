/* ============================================================
   Golden Touch · RRHH · Documentos a consignar por oficina

   El listado que la oficina va tildando a medida que quien ingresa entrega
   sus papeles. Va como SEGUNDA HOJA de la hoja de ingreso, así que se
   imprime y se llena a mano junto con ella.

   POR QUÉ ESTÁ Aquí Y NO ESCRITO DENTRO DEL PDF. Es una lista que va a
   cambiar: se agrega un requisito, se saca otro. Teniéndola como dato se
   toca en un solo lugar, se puede probar (que no haya repetidos, que ningún
   segmento quede vacío) y mañana la misma lista sirve para una pantalla de
   control de expedientes sin volver a escribirla.

   LO QUE NO ESTÁ, A PROPÓSITO:

   · Nada bancario. La hoja de ingreso se armó sin la sección de datos de
     transferencia a pedido del usuario, así que pedir aquí una constancia de
     cuenta sería volver a entrar por la ventana.

   · Nada de seguridad social (29/09/2026). El segmento entero —IVSS forma
     14-02, cuenta individual del IVSS, FAOV/BANAVIH, beneficiarios de la
     póliza y carnet del INCES— se quitó a pedido del usuario. Va en línea con
     la nómina, que tampoco descuenta IVSS ni FAOV. Si alguna vez vuelve a
     pedirse, se agrega un segmento nuevo; no se reponga este sin decirlo.

   «(si aplica)» marca lo que no le corresponde a todo el mundo: sin eso, una
   lista con casilleros vacíos parece un expediente incompleto.

   SOLO COPIAS (07/10/2026). La oficina no recibe originales: cada documento
   se consigna en COPIA y el original se lo queda la persona. Por eso cada
   renglón dice «Copia de…» (las fotos carnet y el currículum son de la
   persona, no se copian). La prueba lo vigila.
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
      'Copia de la constancia de residencia o carta de domicilio',
      'Copia de la licencia de conducir (si aplica)',
      'Copia del certificado de no antecedentes penales (si aplica)',
    ],
  },
  {
    titulo: 'Documentos académicos y laborales',
    documentos: [
      'Copia del título obtenido (bachiller, técnico o universitario)',
      'Copia de las notas certificadas del último grado cursado',
      'Copia de los certificados de cursos, talleres y capacitaciones',
      'Currículum vitae actualizado',
      'Copia de las constancias de trabajo de empleos anteriores',
      'Copia de dos (2) referencias personales con teléfono de contacto',
      'Copia del colegio o gremio profesional (si aplica)',
    ],
  },
  {
    titulo: 'Documentos de salud',
    documentos: [
      'Copia del certificado médico de salud pre-empleo (vigente)',
      'Copia del examen médico ocupacional del cargo a desempeñar',
      'Copia de la constancia del tipo de sangre y factor RH',
      'Copia de la constancia o carnet de vacunación',
      'Copia del informe médico de enfermedad preexistente (si aplica)',
      'Copia del informe médico de alergias declaradas (si aplica)',
      'Copia del certificado de discapacidad CONAPDIS (si aplica)',
    ],
  },
  {
    titulo: 'Documentos de matrimonio y carga familiar',
    documentos: [
      'Copia del acta de matrimonio',
      'Copia de la constancia de concubinato o unión estable de hecho (si aplica)',
      'Copia de la cédula del cónyuge o pareja',
      'Copia de la partida de nacimiento de cada hijo',
      'Copia de la cédula de los hijos mayores de nueve (9) años',
      'Copia de la constancia de estudios de cada hijo en edad escolar',
      'Copia de la cédula de los padres a cargo (si aplica)',
      'Copia del acta de defunción del cónyuge (si aplica)',
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
