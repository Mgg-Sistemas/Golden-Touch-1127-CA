import { describe, expect, it } from 'vitest';
import {
  errorPreSalida,
  etiquetaAlmacenPreSalida,
  mensajePreSalidaWhatsapp,
  motivoSalidaDesdePreSalida,
  resolverUltimasVersionesStorage,
} from './preSalidasMina';

describe('preSalidasMina', () => {
  it('genera el formato exacto de WhatsApp sin selectores U+FE0F', () => {
    const msg = mensajePreSalidaWhatsapp({
      codigo: 'PRE-2026-0045',
      almacen: 'General',
      destino_equipo: 'Payloader CAT 966',
      solicitante: 'Juan Pérez',
      motivo: null,
      items: [
        { producto_id: '1', producto_sku: 'FIL-001', producto_nombre: 'FILTRO DE ACEITE 1R-0716', unidad: 'und', cantidad: 2 },
        { producto_id: '2', producto_sku: 'LUB-010', producto_nombre: 'ACEITE 15W40 MOBIL DELVAC', unidad: 'cuñ', cantidad: 1 },
      ],
    });
    expect(msg).not.toContain('\uFE0F');
    expect(msg).toBe([
      '📦 *SOLICITUD DE SALIDA DE ALMACÉN*',
      '🔢 *Código:* PRE-2026-0045',
      '📍 *Almacén:* Principal (Los Pinos)',
      '🚜 *Destino / Equipo:* Payloader CAT 966',
      '👷 *Solicitado por:* Juan Pérez',
      '',
      '*Materiales a despachar:*',
      '• 2 und · FILTRO DE ACEITE 1R-0716',
      '• 1 cuñ · ACEITE 15W40 MOBIL DELVAC',
      '',
      '_Favor responder indicando aprobación para proceder con la entrega._',
    ].join('\n'));
  });

  it('incluye observación en WhatsApp cuando se indica y respeta el nombre de otros depósitos', () => {
    expect(etiquetaAlmacenPreSalida('Depósito Mina')).toBe('Depósito Mina');
    const msg = mensajePreSalidaWhatsapp({
      codigo: 'PRE-2026-0046',
      almacen: 'Depósito Mina',
      destino_equipo: 'Frente Norte',
      solicitante: 'Carlos Gómez',
      motivo: 'Cambio urgente de turno noche',
      items: [{ producto_id: '1', producto_sku: 'MANG-02', producto_nombre: 'MANGUERA 2 PULGADAS', unidad: 'm', cantidad: 5 }],
    });
    expect(msg).toContain('📍 *Almacén:* Depósito Mina');
    expect(msg).toContain('📝 *Observación:* Cambio urgente de turno noche');
    expect(msg).toContain('• 5 m · MANGUERA 2 PULGADAS');
  });

  it('valida materiales, stock disponible, destino y solicitante en el borrador', () => {
    expect(errorPreSalida({ items: [], destinoEquipo: 'Taller', solicitante: 'Pedro' }))
      .toMatch(/al menos un material/);
    expect(errorPreSalida({
      items: [{ producto_id: '1', producto_nombre: 'FILTRO', cantidad: 0, stock: 5 }],
      destinoEquipo: 'Taller',
      solicitante: 'Pedro',
    })).toMatch(/cantidad/);
    expect(errorPreSalida({
      items: [{ producto_id: '1', producto_nombre: 'FILTRO', cantidad: 6, stock: 4 }],
      destinoEquipo: 'Taller',
      solicitante: 'Pedro',
    })).toMatch(/No alcanza/);
    expect(errorPreSalida({
      items: [{ producto_id: '1', producto_nombre: 'FILTRO', cantidad: 2, stock: 4 }],
      destinoEquipo: '',
      solicitante: 'Pedro',
    })).toMatch(/destino, equipo/);
    expect(errorPreSalida({
      items: [{ producto_id: '1', producto_nombre: 'FILTRO', cantidad: 2, stock: 4 }],
      destinoEquipo: 'Payloader 966',
      solicitante: '',
    })).toMatch(/quién solicita/);
    expect(errorPreSalida({
      items: [{ producto_id: '1', producto_nombre: 'FILTRO', cantidad: 2, stock: 4 }],
      destinoEquipo: 'Payloader 966',
      solicitante: 'Juan Pérez',
    })).toBeNull();
  });

  it('arma el motivo trazable para el kardex oficial al confirmar la pre-salida', () => {
    expect(motivoSalidaDesdePreSalida({
      codigo: 'PRE-2026-0045',
      destino_equipo: 'Payloader CAT 966',
      equipo_nombre: 'Payloader CAT 966',
      solicitante: 'Juan Pérez',
      motivo: 'Servicio 250h',
    })).toBe('Mantenimiento: Payloader CAT 966 · Solicitado por: Juan Pérez · Servicio 250h · Pre-salida PRE-2026-0045');
  });

  it('resuelve la última versión en Storage y oculta las procesadas o canceladas de la bandeja activa', () => {
    const archivos = [
      'id1__0001__borrador.json',
      'id1__0002__borrador.json',
      'id2__0001__borrador.json',
      'id2__0004__procesada.json',
      'id3__0001__borrador.json',
      'id3__0003__cancelada.json',
    ];
    expect(resolverUltimasVersionesStorage(archivos, false)).toEqual([
      { id: 'id1', seq: '0002', estado: 'borrador', filename: 'id1__0002__borrador.json' },
    ]);
    expect(resolverUltimasVersionesStorage(archivos, true).map((x) => [x.id, x.estado])).toEqual([
      ['id2', 'procesada'],
      ['id3', 'cancelada'],
      ['id1', 'borrador'],
    ]);
  });
});
