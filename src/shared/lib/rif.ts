// Prefijos de RIF válidos en Venezuela (SENIAT). Compartido por el formulario de
// proveedores y por el alta de proveedor en línea desde una OC.
export const PREFIJOS_RIF: { letra: string; desc: string }[] = [
  { letra: 'J', desc: 'Jurídico (empresa)' },
  { letra: 'V', desc: 'Venezolano (natural)' },
  { letra: 'E', desc: 'Extranjero' },
  { letra: 'P', desc: 'Pasaporte' },
  { letra: 'G', desc: 'Gubernamental' },
  { letra: 'C', desc: 'Consejo comunal' },
];

export const LETRAS_RIF = PREFIJOS_RIF.map((p) => p.letra);

/** Separa un RIF guardado ("J-40778442") en su letra y su número (máx. 10 dígitos). */
export function partirRif(rif: string): { letra: string; numero: string } {
  const limpio = (rif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letra = LETRAS_RIF.includes(limpio[0]) ? limpio[0] : 'J';
  const numero = limpio.replace(/^[A-Z]/, '').slice(0, 10);
  return { letra, numero };
}

/** Normaliza un RIF a J123456789 (sin guiones ni espacios, en mayúsculas). */
export function normalizarRif(rif: string | null | undefined): string {
  return String(rif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * ¿El RIF tiene forma válida? Letra y 9 dígitos, el último de ellos el DÍGITO
 * VERIFICADOR. Un RIF mal escrito invalida el documento donde se imprime, así
 * que conviene cazarlo cuando se carga y no cuando hay que presentarlo.
 */
export function rifValido(rif: string | null | undefined): boolean {
  const v = normalizarRif(rif);
  if (!/^[JGVEPC]\d{9}$/.test(v)) return false;
  const pesos = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  const letras: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5, C: 3 };
  let suma = (letras[v[0]] ?? 0) * 4;
  for (let i = 0; i < 8; i += 1) suma += Number(v[i + 1]) * pesos[i + 1];
  const resto = suma % 11;
  let dv = 11 - resto;
  if (dv === 11 || dv === 10) dv = 0;
  return dv === Number(v[9]);
}

/** El RIF con guiones, como se escribe en los documentos: J-50129993-5. */
export function formatearRif(rif: string | null | undefined): string {
  const v = normalizarRif(rif);
  if (!/^[A-Z]\d{9}$/.test(v)) return String(rif ?? '');
  return `${v[0]}-${v.slice(1, 9)}-${v[9]}`;
}
