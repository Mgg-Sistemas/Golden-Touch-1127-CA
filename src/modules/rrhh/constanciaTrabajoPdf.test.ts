/* La constancia de trabajo: sin WhatsApp, sin «Sello», sin «A quien pueda interesar», con la cédula con puntos
   y con la firma del Presidente (ORLANDO MOLINA) como firmante por defecto. */
import { describe, it, expect, vi } from 'vitest';
import type { Personal } from '@/shared/lib/types';

const docs: Array<{ output: (t: string) => ArrayBuffer }> = [];
vi.mock('@/shared/lib/reportePreview', () => ({ previewPdf: vi.fn((d: { output: (t: string) => ArrayBuffer }) => { docs.push(d); }) }));
// PNG de 1x1 píxel: basta para comprobar que la firma de Orlando se estampa sin romper el PDF.
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const firmaOrlando = vi.fn(async () => ({ dataUrl: PNG_1X1, w: 328, h: 157 }));
vi.mock('@/shared/lib/pdfLogo', () => ({
  loadLogoPdfEmpresa: vi.fn(async () => null),
  loadFirmaDataUrl: vi.fn(async () => null),
  loadFirma2DataUrl: vi.fn(async () => null),
  loadFirmaOrlandoDataUrl: () => firmaOrlando(),
  dibujarLogoPdf: vi.fn(),
}));

const persona = { nombre: 'Ana', apellido: 'Pérez', cedula: 'V12874838', cargo: 'Analista', empresa: 'GT', fecha_ingreso: '2023-03-15' } as unknown as Personal;

async function generar(opts: { firmante: 'orlando' | 'rrhh' | 'ninguna'; dirigidoA?: string }): Promise<string> {
  const { descargarConstanciaTrabajoPdf } = await import('./constanciaTrabajoPdf');
  docs.length = 0;
  await descargarConstanciaTrabajoPdf({ persona, incluirSalario: false, ...opts });
  expect(docs).toHaveLength(1);
  return new TextDecoder('latin1').decode(docs[0].output('arraybuffer'));
}

describe('descargarConstanciaTrabajoPdf', () => {
  it('no escribe el WhatsApp ni «Sello» y la cédula lleva puntos', async () => {
    for (const firmante of ['rrhh', 'ninguna'] as const) {
      const pdf = await generar({ firmante });
      expect(pdf).toContain('CONSTANCIA DE TRABAJO');
      expect(pdf).toContain('V-12.874.838');
      expect(pdf).not.toMatch(/whatsapp/i);
      expect(pdf).not.toMatch(/sello/i);
    }
  }, 30000);

  it('ya no escribe «A quien pueda interesar»; solo lleva destinatario si se escribe uno', async () => {
    expect(await generar({ firmante: 'orlando' })).not.toMatch(/interesar/i);
    expect(await generar({ firmante: 'orlando', dirigidoA: 'Banco Provincial' })).toContain('Banco Provincial');
  }, 30000);

  it('con la firma de Orlando: su firma, nombre, cédula y cargo al pie', async () => {
    firmaOrlando.mockClear();
    const pdf = await generar({ firmante: 'orlando' });
    expect(firmaOrlando).toHaveBeenCalledTimes(1);
    expect(pdf).toContain('ORLANDO MOLINA');
    expect(pdf).toContain('C.I. V-8.336.951');
    expect(pdf).toContain('PRESIDENTE');
    expect(pdf).toContain('/Subtype /Image');   // la firma quedó estampada
  }, 30000);

  it('con otro firmante no se pide la firma de Orlando', async () => {
    firmaOrlando.mockClear();
    const pdf = await generar({ firmante: 'rrhh' });
    expect(firmaOrlando).not.toHaveBeenCalled();
    expect(pdf).not.toContain('ORLANDO MOLINA');
  }, 30000);
});
