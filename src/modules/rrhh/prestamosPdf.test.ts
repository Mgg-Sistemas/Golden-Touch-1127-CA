import { describe, it, expect, vi } from 'vitest';
import { construirPrestamosPdf, type OpcionesPrestamosPdf } from './prestamosPdf';
import type { AnticipoPrestamo, Personal } from '@/shared/lib/types';

vi.mock('@/shared/lib/reportePreview', () => ({ previewPdf: vi.fn() }));
vi.mock('@/shared/lib/pdfLogo', () => ({
  loadLogoPdfEmpresa: vi.fn().mockResolvedValue(null),
  dibujarLogoPdf: vi.fn(),
}));

describe('construirPrestamosPdf', () => {
  it('se construye correctamente con un trabajador de nombre largo, cargo y departamento sin solapamiento', async () => {
    const persona: Personal = {
      id: 'p1',
      empresa: 'GT',
      nombre: 'JOSE IGNACIO',
      apellido: 'MEJIA RINCON',
      ficha_nro: '004',
      cedula: '14340143',
      cargo: 'SUPERVISOR DE PRODUCCION',
      departamento: 'OPERACIONES DE PRODUCCIÓN MINA',
      fecha_ingreso: '2024-01-01',
      estado: 'activo',
    };

    const anticipo: AnticipoPrestamo = {
      id: 'a1',
      personal_id: 'p1',
      tipo: 'prestamo',
      fecha: '2026-08-15',
      monto_total: 2000,
      saldo: 2000,
      cuota_sugerida: 200,
      estado: 'activo',
      motivo: 'PRESTAMO SE PAGO CON USDT',
      created_at: '2026-08-15T10:00:00Z',
    };

    const opciones: OpcionesPrestamosPdf = {
      titulo: 'Estado de cuenta · Préstamo',
      empresa: 'GT',
      detalle: 'JOSE IGNACIO MEJIA RINCON · Préstamo del 15-08-2026',
      grupos: [
        {
          persona,
          anticipos: [anticipo],
          pagos: [],
        },
      ],
      archivo: 'prestamos-test.pdf',
    };

    const doc = await construirPrestamosPdf(opciones);
    expect(doc).toBeDefined();
    const pdfText = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(pdfText).toContain('ESTADO DE CUENTA');
    expect(pdfText).toContain('MEJIA RINCON');
    expect(pdfText).toContain('SUPERVISOR DE PRODUCCION');
  });
});
