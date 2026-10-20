/* La constancia de trabajo sale sin WhatsApp ni recuadro de sello, y con la cédula con puntos. */
import { describe, it, expect, vi } from 'vitest';
import type { Personal } from '@/shared/lib/types';

const docs: Array<{ output: (t: string) => ArrayBuffer }> = [];
vi.mock('@/shared/lib/reportePreview', () => ({ previewPdf: vi.fn((d: { output: (t: string) => ArrayBuffer }) => { docs.push(d); }) }));
vi.mock('@/shared/lib/pdfLogo', () => ({
  loadLogoPdfEmpresa: vi.fn(async () => null),
  loadFirmaDataUrl: vi.fn(async () => null),
  loadFirma2DataUrl: vi.fn(async () => null),
  dibujarLogoPdf: vi.fn(),
}));

describe('descargarConstanciaTrabajoPdf', () => {
  it('no escribe el WhatsApp ni «Sello» y la cédula lleva puntos', async () => {
    const { descargarConstanciaTrabajoPdf } = await import('./constanciaTrabajoPdf');
    const persona = { nombre: 'Ana', apellido: 'Pérez', cedula: 'V12874838', cargo: 'Analista', empresa: 'GT', fecha_ingreso: '2023-03-15' } as unknown as Personal;
    for (const firmante of ['rrhh', 'ninguna'] as const) {
      docs.length = 0;
      await descargarConstanciaTrabajoPdf({ persona, incluirSalario: false, firmante });
      expect(docs).toHaveLength(1);
      const pdf = new TextDecoder('latin1').decode(docs[0].output('arraybuffer'));
      expect(pdf).toContain('CONSTANCIA DE TRABAJO');
      expect(pdf).toContain('V-12.874.838');
      expect(pdf).not.toMatch(/whatsapp/i);
      expect(pdf).not.toMatch(/sello/i);
    }
  }, 30000);
});
