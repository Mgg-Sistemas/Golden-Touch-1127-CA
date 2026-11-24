import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/shared/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div data-testid="modal-mock">
      <div className="modal-body-mock">{children}</div>
      {footer && <div className="modal-footer-mock">{footer}</div>}
    </div>
  ),
}));

import { RespaldoDataModal } from './RespaldoDataModal';
import { BACKUP_EMAILS } from '@/shared/lib/backup';

describe('RespaldoDataModal', () => {
  it('no renderiza nada si open es false', () => {
    const html = renderToStaticMarkup(
      <RespaldoDataModal open={false} onClose={() => {}} userEmail="admin@goldentouch1127.com" />
    );
    expect(html).toBe('');
  });

  it('renderiza la estructura ejecutiva del modal cuando open es true', () => {
    const html = renderToStaticMarkup(
      <RespaldoDataModal open={true} onClose={() => {}} userEmail="admin@goldentouch1127.com" />
    );

    // Encabezado y títulos
    expect(html).toContain('Copia de Seguridad de Base de Datos');
    expect(html).toContain('Descarga Local Directa');
    expect(html).toContain('Custodia en Bóveda por Correo');

    // Tags y especificaciones
    expect(html).toContain('.sql');
    expect(html).toContain('.zip');
    expect(html).toContain('Nivel 9 de compresión');

    // Correos de custodia configurados
    for (const email of BACKUP_EMAILS) {
      expect(html).toContain(email);
    }

    // Pie de seguridad y privilegios
    expect(html).toContain('SECURITY DEFINER');
  });
});
