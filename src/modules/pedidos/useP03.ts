/* Golden Touch · Compras · ¿Está P03 en la base? (facturas del proveedor por origen). false mientras se pregunta. */
import { useEffect, useState } from 'react';
import { p03Disponible } from '@/modules/libroFiscal/disponibilidad';

export function useP03(): boolean {
  const [conP03, setConP03] = useState(false);
  useEffect(() => {
    let vivo = true;
    void p03Disponible().then((v) => { if (vivo) setConP03(v); }).catch(() => { /* sin P03 */ });
    return () => { vivo = false; };
  }, []);
  return conP03;
}
