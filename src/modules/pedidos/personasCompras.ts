/* ============================================================
   Golden Touch · Compras · Resolución de personas (Nombre y Apellido)
   
   En los mensajes de WhatsApp de compras (instrucciones de pago, avisos
   de aprobación para el Gerente General y Cierres diarios), se debe
   mostrar SIEMPRE el Nombre y Apellido del analista de compras y de
   quien aprueba / autoriza.
   
   BAJO NINGUNA CIRCUNSTANCIA debe mostrarse una dirección de correo
   electrónico (ej. @gmail.com) en el texto enviado por el chat.
   ============================================================ */
import type { Usuario } from '@/shared/lib/types';
import { APROBADOR_JESUS_EMAIL, APROBADOR_LEYDIS_EMAIL, ELABORADOR_OC } from './aprobadoresOc';

/** Nombres canónicos de aprobadores y personal clave de Golden Touch. */
export const PERSONAS_CONOCIDAS_COMPRAS: Record<string, string> = {
  [APROBADOR_JESUS_EMAIL.toLowerCase()]: 'JESUS LOZADA',
  [APROBADOR_LEYDIS_EMAIL.toLowerCase()]: 'LEYDIS RENGEL',
  'marianatovar@gmail.com': ELABORADOR_OC.nombre,
  'marianatovar1127@gmail.com': ELABORADOR_OC.nombre,
};

/**
 * Convierte un correo electrónico tipo "nombre.apellido@dominio.com" en "NOMBRE APELLIDO".
 * Elimina dominios (@...), separadores (. _ -) y números finales.
 */
export function derivarNombreDesdeCorreo(correo: string): string {
  const parteUsuario = correo.split('@')[0]?.trim() || '';
  if (!parteUsuario) return '';

  // Limpiar posibles números pegados al final (ej. "kelvin2026" → "kelvin", "analista1" → "analista")
  const sinDigitosFinales = parteUsuario.replace(/\d+$/, '').trim() || parteUsuario;

  // Separar por puntos, guiones o guiones bajos
  const palabras = sinDigitosFinales
    .split(/[._\-+]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!palabras.length) return parteUsuario.toUpperCase();
  return palabras.map((p) => p.toUpperCase()).join(' ');
}

/**
 * Resuelve el Nombre y Apellido de una persona a partir de su correo, ID o nombre libre.
 * Garantiza que el resultado NUNCA contenga una arroba (@) ni dominio de correo.
 */
export function nombrePersonaCompras(
  identificador: string | null | undefined,
  personas?: Map<string, string>,
): string {
  const raw = (identificador ?? '').trim();
  if (!raw) return '';

  const norm = raw.toLowerCase();

  // 1. Búsqueda en el mapa provisto (usuarios cargados desde la base de datos)
  if (personas) {
    const enMapa = personas.get(norm) || personas.get(raw);
    if (enMapa && enMapa.trim() && !enMapa.includes('@')) {
      return enMapa.trim();
    }
  }

  // 2. Aprobadores y personal institucional conocido
  if (PERSONAS_CONOCIDAS_COMPRAS[norm]) {
    return PERSONAS_CONOCIDAS_COMPRAS[norm];
  }
  if (norm.includes('touchgolden') || (norm.includes('jesus') && norm.includes('lozada'))) {
    return 'JESUS LOZADA';
  }
  if (norm.includes('jhzgcontabilidad') || (norm.includes('leydis') && norm.includes('rengel'))) {
    return 'LEYDIS RENGEL';
  }
  if (norm.includes('mariana') && norm.includes('tovar')) {
    return ELABORADOR_OC.nombre;
  }

  // 3. Si viene con formato de correo electrónico (@...), derivar Nombre y Apellido limpio
  if (raw.includes('@')) {
    return derivarNombreDesdeCorreo(raw);
  }

  // 4. Si ya es un nombre sin @, devolverlo limpio en mayúsculas
  return raw.toUpperCase();
}

/**
 * Construye un mapa email|id → "NOMBRE APELLIDO" a partir de la lista de usuarios,
 * incorporando de antemano a los aprobadores y analistas institucionales.
 */
export function crearMapaPersonasCompras(usuarios: Usuario[] = []): Map<string, string> {
  const map = new Map<string, string>();

  // Base institucional fija
  for (const [correo, nombre] of Object.entries(PERSONAS_CONOCIDAS_COMPRAS)) {
    map.set(correo.toLowerCase(), nombre);
  }

  // Usuarios de la base de datos
  for (const u of usuarios) {
    const nombreCompleto = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim();
    if (nombreCompleto) {
      const nombreMayusc = nombreCompleto.toUpperCase();
      if (u.email) {
        map.set(u.email.toLowerCase().trim(), nombreMayusc);
      }
      if (u.id) {
        map.set(u.id.trim(), nombreMayusc);
      }
    }
  }

  return map;
}
