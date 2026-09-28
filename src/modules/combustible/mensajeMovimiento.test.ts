import { describe, it, expect } from 'vitest';
import { EMOJI_TIPO, enlaceWhatsapp, fechaCorta, mensajeMovimiento } from './mensajeMovimiento';
import type { MovimientoTanque } from '@/shared/lib/types';

const mov = (p: Partial<MovimientoTanque>): MovimientoTanque => ({
  id: 'x', tanque_id: 't1', fecha: '2026-09-28', tipo: 'uso', litros: 55, tasa_usd_litro: 0.7, orden: 1, created_at: '', ...p,
});

describe('fechaCorta', () => {
  it('pasa a DD/MM/AAAA y aguanta un dato vacío', () => {
    expect(fechaCorta('2026-09-28')).toBe('28/09/2026');
    expect(fechaCorta(null)).toBe('');
  });
});

describe('mensajeMovimiento', () => {
  it('un surtido lleva flecha hacia abajo, litros en negativo y todos los datos', () => {
    const t = mensajeMovimiento({
      mov: mov({ equipo: 'ET8 A94EE8P', autorizado_por: 'EDINSON ANGULO', ubicacion: 'Mina Golden Touch', hora: '2:34:24 PM', contador_global_fin: 192960 }),
      tanque: 'Tanque #1', registradoPor: 'PRUEBA',
    });
    expect(t).toContain('🔽 *SALIDA DE COMBUSTIBLE*');
    expect(t).toContain('⛽ *Litros:* -55 L');
    expect(t).toContain('🛢️ *Tanque:* Tanque #1');
    expect(t).toContain('🚚 *Equipo:* ET8 A94EE8P');
    expect(t).toContain('✅ *Autorizado por:* EDINSON ANGULO');
    expect(t).toContain('📍 *Destino:* Mina Golden Touch');
    expect(t).toContain('📅 *Fecha:* 28/09/2026 · 🕒 2:34:24 PM');
    expect(t).toContain('🔢 *Contador:* 192.960');
    expect(t).toContain('Cargado por PRUEBA');
  });

  it('una entrada suma y una merma avisa', () => {
    expect(mensajeMovimiento({ mov: mov({ tipo: 'entrada', litros: 10000 }) })).toContain('⛽ *Litros:* +10.000 L');
    expect(mensajeMovimiento({ mov: mov({ tipo: 'entrada' }) })).toContain('🔼 *ENTRADA DE COMBUSTIBLE*');
    expect(mensajeMovimiento({ mov: mov({ tipo: 'merma', litros: 25, observacion: 'Fuga' }) })).toContain('⚠️ *MERMA / FALTANTE*');
    expect(mensajeMovimiento({ mov: mov({ tipo: 'merma', observacion: 'Fuga' }) })).toContain('📝 *Nota:* Fuga');
    expect(EMOJI_TIPO.uso).toBe('🔽');
  });

  it('el traslado nombra el tanque que recibe', () => {
    const t = mensajeMovimiento({ mov: mov({ tipo: 'traslado', litros: 1736 }), tanque: 'Tanque #1', tanqueDestino: 'Tanque #3' });
    expect(t).toContain('🔁 *TRASLADO ENTRE TANQUES*');
    expect(t).toContain('➡️ *Pasa al tanque:* Tanque #3');
  });

  it('no escribe los renglones de lo que no hay', () => {
    const t = mensajeMovimiento({ mov: mov({}) });
    expect(t).not.toContain('Equipo');
    expect(t).not.toContain('Autorizado');
    expect(t).not.toContain('Contador');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('null');
  });
});

describe('enlaceWhatsapp', () => {
  it('arma el enlace con el texto escapado', () => {
    const url = enlaceWhatsapp('Hola *mundo*\ncon salto');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe('Hola *mundo*\ncon salto');
  });
});
