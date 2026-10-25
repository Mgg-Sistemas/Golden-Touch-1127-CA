import { describe, it, expect, vi } from 'vitest';
import { construirPrestamosPdf, movimientosCuenta, type OpcionesPrestamosPdf } from './prestamosPdf';
import type { AnticipoPago, AnticipoPrestamo, Personal } from '@/shared/lib/types';

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
      sueldo_base: 0,
      activo: true,
      created_at: '2024-01-01T00:00:00Z',
    };

    const anticipo = {
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
    } as unknown as AnticipoPrestamo;

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

describe('movimientosCuenta (préstamos y abonos en filas separadas, por fecha)', () => {
  const prestamo = {
    id: 'a1', personal_id: 'p1', tipo: 'prestamo', fecha: '2026-08-23', monto_total: 1750, saldo: 800, estado: 'activo',
    motivo: '[Entrega 09-06-2026 · $ 1.200,00]: PRESTAMO EN USDT\n[Entrega 23-08-2026 · $ 550,00]: PAGO PRESTAMO KEIMER',
    created_at: '2026-06-09T10:00:00Z',
  } as unknown as AnticipoPrestamo;
  const abono = (id: string, fecha: string, monto: number, nota = '') => ({ id, anticipo_id: 'a1', fecha, monto, origen: 'manual', nota, created_at: fecha + 'T12:00:00Z' }) as unknown as AnticipoPago;
  const pagos = [
    abono('b3', '2026-08-15', 100, 'RECIBO 39'), abono('b1', '2026-07-02', 100, 'RECIBO 36'), abono('b2', '2026-07-15', 200, 'RECIBO 37'),
    abono('b4', '2026-08-31', 150, 'RECIBO 40'),
  ];

  it('cada entrega y cada abono van en su fila, en orden de fecha, con el saldo corrido', () => {
    const m = movimientosCuenta(prestamo, pagos);
    expect(m.map((x) => x.tipo)).toEqual(['prestamo', 'abono', 'abono', 'abono', 'prestamo', 'abono']);
    expect(m.map((x) => x.fecha)).toEqual(['2026-06-09', '2026-07-02', '2026-07-15', '2026-08-15', '2026-08-23', '2026-08-31']);
    expect(m.map((x) => x.saldo)).toEqual([1200, 1100, 900, 800, 1350, 1200]);
  });

  it('con varias entregas se numeran («Préstamo 1», «Préstamo 2») y los abonos llevan su viñeta', () => {
    const m = movimientosCuenta(prestamo, pagos);
    expect(m[0].celdas[1]).toBe('Préstamo 1');
    expect(m[4].celdas[1]).toBe('Préstamo 2');
    expect(m[1].celdas[0]).toBe('• 02/07/2026');
    expect(m[1].celdas[1]).toBe('• Abono manual');
    expect(m[0].celdas[3]).toContain('1.200,00');
    expect(m[1].celdas[4]).toContain('100,00');
  });

  it('un préstamo de una sola entrega no se numera y el mismo día va primero la entrega', () => {
    const uno = { ...prestamo, motivo: 'ADELANTO DE NOMINA', monto_total: 100, fecha: '2026-04-23' } as unknown as AnticipoPrestamo;
    const m = movimientosCuenta(uno, [abono('c1', '2026-04-23', 30)]);
    expect(m[0].celdas[1]).toBe('Préstamo');
    expect(m.map((x) => x.tipo)).toEqual(['prestamo', 'abono']);
    expect(m[1].saldo).toBe(70);
  });

  it('el saldo nunca queda negativo', () => {
    const uno = { ...prestamo, motivo: null, monto_total: 50, fecha: '2026-04-01' } as unknown as AnticipoPrestamo;
    expect(movimientosCuenta(uno, [abono('d1', '2026-04-02', 80)]).at(-1)?.saldo).toBe(0);
  });
});
