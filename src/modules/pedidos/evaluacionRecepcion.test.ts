import { describe, expect, it } from 'vitest';

export const CALIDAD_LABELS: Record<number, string> = {
  5: '5 estrellas · Excelente',
  4: '4 estrellas · Buena',
  3: '3 estrellas · Aceptable',
  2: '2 estrellas · Regular',
  1: '1 estrella · Deficiente',
};

export function calcularDiasPuntualidad(fechaPrometida: string | null | undefined, fechaRecibido: string): number {
  if (!fechaPrometida) return 0;
  const p = new Date(`${fechaPrometida}T00:00:00`).getTime();
  const r = new Date(`${fechaRecibido}T00:00:00`).getTime();
  if (isNaN(p) || isNaN(r)) return 0;
  return Math.round((p - r) / 86_400_000);
}

export function validarFacturaRecepcion(file: { name: string; type?: string; size: number } | null | undefined): string | null {
  if (!file) return null;
  const esPdfOImagen = (file.type === 'application/pdf') || (file.type ? file.type.startsWith('image/') : /\.(pdf|jpe?g|png|webp)$/i.test(file.name));
  if (!esPdfOImagen) return 'La factura debe ser un PDF o una imagen.';
  if (file.size > 10 * 1024 * 1024) return 'La factura no puede superar 10 MB.';
  return null;
}

describe('Finalizar pedido · Calificación por estrellas y recepción', () => {
  it('tiene etiquetas descriptivas para cada nivel de 1 a 5 estrellas', () => {
    expect(CALIDAD_LABELS[5]).toBe('5 estrellas · Excelente');
    expect(CALIDAD_LABELS[4]).toBe('4 estrellas · Buena');
    expect(CALIDAD_LABELS[3]).toBe('3 estrellas · Aceptable');
    expect(CALIDAD_LABELS[2]).toBe('2 estrellas · Regular');
    expect(CALIDAD_LABELS[1]).toBe('1 estrella · Deficiente');
  });

  describe('calcularDiasPuntualidad', () => {
    it('retorna 0 si no hay fecha prometida en la oferta', () => {
      expect(calcularDiasPuntualidad('', '2026-11-10')).toBe(0);
      expect(calcularDiasPuntualidad(null, '2026-11-10')).toBe(0);
      expect(calcularDiasPuntualidad(undefined, '2026-11-10')).toBe(0);
    });

    it('retorna 0 si se recibió exactamente en la fecha prometida', () => {
      expect(calcularDiasPuntualidad('2026-11-10', '2026-11-10')).toBe(0);
    });

    it('retorna número positivo si se recibió antes (adelantado)', () => {
      // Prometida 15 nov, recibida 10 nov -> 5 días adelantado
      expect(calcularDiasPuntualidad('2026-11-15', '2026-11-10')).toBe(5);
    });

    it('retorna número negativo si se recibió después (atrasado)', () => {
      // Prometida 5 nov, recibida 10 nov -> 5 días atrasado (-5)
      expect(calcularDiasPuntualidad('2026-11-05', '2026-11-10')).toBe(-5);
    });
  });

  describe('validarFacturaRecepcion', () => {
    it('acepta null si no se adjunta factura opcional', () => {
      expect(validarFacturaRecepcion(null)).toBeNull();
    });

    it('acepta PDF de menos de 10 MB', () => {
      expect(validarFacturaRecepcion({ name: 'factura.pdf', type: 'application/pdf', size: 2 * 1024 * 1024 })).toBeNull();
    });

    it('acepta imagen PNG/JPEG de menos de 10 MB', () => {
      expect(validarFacturaRecepcion({ name: 'foto.jpg', type: 'image/jpeg', size: 1.5 * 1024 * 1024 })).toBeNull();
      expect(validarFacturaRecepcion({ name: 'foto.png', type: 'image/png', size: 3 * 1024 * 1024 })).toBeNull();
    });

    it('rechaza archivos que no sean PDF ni imagen', () => {
      expect(validarFacturaRecepcion({ name: 'archivo.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 500 * 1024 })).toBe('La factura debe ser un PDF o una imagen.');
      expect(validarFacturaRecepcion({ name: 'archivo.zip', type: 'application/zip', size: 500 * 1024 })).toBe('La factura debe ser un PDF o una imagen.');
    });

    it('rechaza archivos mayores a 10 MB', () => {
      expect(validarFacturaRecepcion({ name: 'factura_pesada.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toBe('La factura no puede superar 10 MB.');
    });
  });
});
