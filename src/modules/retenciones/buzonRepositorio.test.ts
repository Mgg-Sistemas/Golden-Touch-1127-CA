import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cola de respuestas de la base y registro de lo que se pidió (datos inventados; nada va a la base real).
const cola: { data?: unknown; error?: unknown }[] = [];
const llamadas: { que: string; args: unknown[] }[] = [];
const subidas: { path: string; error?: unknown }[] = [];

vi.mock('@/shared/lib/supabase', () => {
  const cadena = (que: string) => {
    const q: Record<string, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          const r = cola.shift() ?? { data: null, error: null };
          return (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...r }).then(ok);
        }
        return (...args: unknown[]) => { llamadas.push({ que: `${que}.${String(prop)}`, args }); return q; };
      },
    });
    return q;
  };
  return {
    supabase: {
      from: (t: string) => { llamadas.push({ que: 'from', args: [t] }); return cadena(t); },
      storage: {
        from: () => ({
          upload: async (path: string, _f: unknown, opciones: unknown) => {
            llamadas.push({ que: 'storage.upload', args: [path, opciones] });
            const r = subidas.shift() ?? { path };
            return r.error ? { data: null, error: r.error } : { data: { path: r.path }, error: null };
          },
          remove: async (paths: string[]) => { llamadas.push({ que: 'storage.remove', args: [paths] }); return { data: [], error: null }; },
          createSignedUrl: async (path: string) => {
            llamadas.push({ que: 'storage.createSignedUrl', args: [path] });
            return path === 'falta/x.pdf' ? { data: null, error: { message: 'Object not found' } } : { data: { signedUrl: `https://firmado/${path}` }, error: null };
          },
          getPublicUrl: () => { throw new Error('nunca se pide un enlace público'); },
        }),
      },
    },
  };
});

import { cargarFacturaBuzon, crearFacturaBuzon, faltaEnFacturaBuzon, listFacturasBuzon, actualizarEstatusFacturaBuzon, eliminarFacturaBuzon, type NuevaFacturaBuzonInput } from './facturasBuzon.repository';
import { listEmpresasReceptoras, guardarEmpresaReceptora, eliminarEmpresaReceptora, faltaEnEmpresa, claveDeEmpresa } from './empresasReceptoras.repository';
import { obtenerUrlAdjunto, prepararImagenesParaSubida } from './adjuntosBuzon';

const FACTURA: NuevaFacturaBuzonInput = {
  empresaId: 'empresa-prueba-uno',
  empresaNombre: 'Empresa de Prueba Uno C.A.',
  proveedorNombre: 'Proveedor de Prueba C.A.',
  proveedorRif: 'J-12345678',        // sin dígito verificador: se completa
  facturaNumero: '000123',
  facturaControl: '00-456',
  facturaFecha: '2026-10-20',
  montoTotal: 100,
  moneda: 'USD',
  tasa: 50,
  descripcion: 'Repuestos de prueba',
};

const filaDe = (extra: Record<string, unknown> = {}) => ({
  id: 'id-prueba', empresa_id: 'empresa-prueba-uno', empresa_nombre: 'Empresa de Prueba Uno C.A.', proveedor_nombre: 'Proveedor de Prueba C.A.',
  proveedor_rif: 'J-12345678-4', factura_numero: '000123', factura_fecha: '2026-10-20', monto_total: 100, moneda: 'USD', tasa: 50,
  monto_bs: 5000, monto_usd: 100, descripcion: 'Repuestos de prueba', estatus: 'recibida', adjuntos: [], created_at: '2026-10-20T10:00:00Z', ...extra,
});

const insertado = () => llamadas.find((l) => l.que === 'retencion_facturas_externas.insert')?.args[0] as Record<string, unknown>;

beforeEach(() => { cola.length = 0; llamadas.length = 0; subidas.length = 0; });

describe('Buzón · validar la factura', () => {
  const hoy = '2026-10-29';
  it('pasa con los datos completos', () => { expect(faltaEnFacturaBuzon(FACTURA, hoy)).toBeNull(); });
  it('pide la empresa, el proveedor, el RIF, el número y la descripción', () => {
    expect(faltaEnFacturaBuzon({ ...FACTURA, empresaId: '' }, hoy)).toMatch(/empresa/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, proveedorNombre: ' ' }, hoy)).toMatch(/proveedor/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, proveedorRif: '' }, hoy)).toMatch(/RIF/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, facturaNumero: '' }, hoy)).toMatch(/número/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, descripcion: '' }, hoy)).toMatch(/descripción/);
  });
  it('rechaza un RIF sin arreglo y uno que empieza por C (la base no lo acepta)', () => {
    expect(faltaEnFacturaBuzon({ ...FACTURA, proveedorRif: 'S/R' }, hoy)).toMatch(/no es válido/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, proveedorRif: 'C-12345678' }, hoy)).toMatch(/no es válido/);
  });
  it('no acepta fecha futura (hora de Venezuela), monto 0 ni dólares sin tasa', () => {
    expect(faltaEnFacturaBuzon({ ...FACTURA, facturaFecha: '2026-10-30' }, hoy)).toMatch(/posterior a hoy/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, montoTotal: 0 }, hoy)).toMatch(/mayor que 0/);
    expect(faltaEnFacturaBuzon({ ...FACTURA, tasa: null }, hoy)).toMatch(/tasa/);
  });
});

describe('Buzón · guardar en la base, sin copia en el navegador', () => {
  it('inserta con el id del cliente, el RIF completo y los montos que cuadran con la moneda', async () => {
    cola.push({ data: [filaDe()] });
    const f = await crearFacturaBuzon(FACTURA, { id: 'id-prueba' });
    expect(f.montoBs).toBe(5000);
    const ins = insertado();
    expect(ins).toMatchObject({ id: 'id-prueba', proveedor_rif: 'J-12345678-4', monto_total: 100, monto_usd: 100, monto_bs: 5000, estatus: 'recibida' });
    expect(ins).not.toHaveProperty('created_by');   // el autor lo pone la base
    expect(llamadas.some((l) => l.que === 'retencion_facturas_externas.select')).toBe(true);
  });

  it('si la base no devuelve la fila, avisa en vez de darla por cargada', async () => {
    cola.push({ data: [] });
    await expect(crearFacturaBuzon(FACTURA)).rejects.toThrow(/sin permiso/);
  });

  it('un rechazo de la base sale en español, por el nombre de la restricción', async () => {
    cola.push({ error: { code: '23514', message: 'new row violates check constraint "retencion_facturas_externas_rif_forma"' } });
    await expect(crearFacturaBuzon(FACTURA)).rejects.toThrow(/RIF del proveedor no es válido/);
  });

  it('sube primero los soportes a «<id>/…» (sin reemplazar) y después inserta la factura con ellos', async () => {
    cola.push({ data: [filaDe()] });
    const foto = new File(['x'], 'foto 1.jpg', { type: 'image/jpeg' });
    const pdf = new File(['y'], 'factura.pdf', { type: 'application/pdf' });
    await cargarFacturaBuzon(FACTURA, [foto, pdf]);
    const sub = llamadas.filter((l) => l.que === 'storage.upload');
    expect(sub).toHaveLength(2);
    const ins = insertado();
    const id = String(ins.id);
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]{2,63}$/);          // la forma que pide la base
    expect(String(sub[0].args[0]).startsWith(`${id}/`)).toBe(true);
    expect(sub[0].args[1]).toMatchObject({ upsert: false });
    expect(llamadas.findIndex((l) => l.que === 'storage.upload')).toBeLessThan(llamadas.findIndex((l) => l.que === 'retencion_facturas_externas.insert'));
    expect(ins.adjuntos).toHaveLength(2);
    expect((ins.adjuntos as { tipo: string }[]).map((a) => a.tipo)).toEqual(['imagen', 'pdf']);
    expect(llamadas.some((l) => l.que === 'retencion_facturas_externas.update')).toBe(false);   // quien solo lee no puede modificar
  });

  it('si un soporte no sube, no guarda la factura y quita lo que ya subió', async () => {
    subidas.push({ path: 'ok' }, { path: '', error: { message: 'Payload too large', statusCode: '413' } });
    const a = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const b = new File(['y'], 'b.pdf', { type: 'application/pdf' });
    await expect(cargarFacturaBuzon(FACTURA, [a, b])).rejects.toThrow(/No se guardó la factura.*demasiado grande/);
    expect(llamadas.some((l) => l.que === 'retencion_facturas_externas.insert')).toBe(false);
    expect(llamadas.find((l) => l.que === 'storage.remove')?.args[0]).toEqual(['ok']);
  });

  it('la lista falla con el motivo, no con datos guardados en el equipo', async () => {
    cola.push({ error: { code: '42501', message: 'permission denied' } });
    await expect(listFacturasBuzon()).rejects.toThrow(/permiso/);
  });

  it('cambiar el estado o borrar sin filas devueltas es un error', async () => {
    cola.push({ data: [] });
    await expect(actualizarEstatusFacturaBuzon('id-prueba', 'retenida')).rejects.toThrow(/No se cambió el estado/);
    cola.push({ data: [] });
    await expect(eliminarFacturaBuzon({ id: 'id-prueba', adjuntos: [] })).rejects.toThrow(/No se borró la factura/);
  });

  it('borrar la factura quita también sus soportes', async () => {
    cola.push({ data: [{ id: 'id-prueba' }] });
    await eliminarFacturaBuzon({ id: 'id-prueba', adjuntos: [{ id: '1', facturaId: 'id-prueba', tipo: 'pdf', path: 'id-prueba/f.pdf', nombreOriginal: 'f.pdf', tamanoBytes: 1, mimeType: 'application/pdf', createdAt: '' }] });
    expect(llamadas.find((l) => l.que === 'storage.remove')?.args[0]).toEqual(['id-prueba/f.pdf']);
  });
});

describe('Buzón · soportes', () => {
  it('se abren con enlace firmado; si no se puede, avisa', async () => {
    expect(await obtenerUrlAdjunto('id-prueba/f.pdf')).toBe('https://firmado/id-prueba/f.pdf');
    await expect(obtenerUrlAdjunto('falta/x.pdf')).rejects.toThrow(/No se pudo abrir el archivo/);
  });

  it('una foto que no se puede convertir (HEIC) se avisa antes de subir', async () => {
    const heic = new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' });
    await expect(prepararImagenesParaSubida([heic])).rejects.toThrow(/IMG_0001\.HEIC.*no se puede guardar/);
  });
});

describe('Empresas receptoras · solo las de la base', () => {
  it('sin empresas guardadas, la lista viene vacía (nada de empresas de fábrica)', async () => {
    cola.push({ data: [] });
    expect(await listEmpresasReceptoras()).toEqual([]);
  });

  it('valida la ficha antes de guardar', () => {
    const base = { nombre: 'Empresa de Prueba C.A.', rif: 'J-12345678', colorBadge: '#2563eb', activo: true };
    expect(faltaEnEmpresa(base)).toBeNull();
    expect(faltaEnEmpresa({ ...base, nombre: '' })).toMatch(/nombre/);
    expect(faltaEnEmpresa({ ...base, rif: '' })).toMatch(/RIF/);
    expect(faltaEnEmpresa({ ...base, rif: 'X-1' })).toMatch(/no es válido/);
    expect(faltaEnEmpresa({ ...base, rif: 'C-12345678' })).toMatch(/no puede empezar por C/);
    expect(faltaEnEmpresa({ ...base, pctIvaGeneral: 120 })).toMatch(/0 a 100/);
    expect(faltaEnEmpresa({ ...base, email: 'sin-arroba' })).toMatch(/correo/);
  });

  it('una empresa nueva se inserta con RIF completo y clave sin acentos; si no vuelve la fila, avisa', async () => {
    cola.push({ data: [{ id: 'e1', clave: 'prueba_uno', nombre: 'Empresa de Prueba C.A.', rif: 'J-12345678-4' }] });
    const e = await guardarEmpresaReceptora({ nombre: 'Empresa de Prueba C.A.', nombreCorto: 'Prueba Uño', rif: 'J-12345678', colorBadge: '#2563eb', activo: true });
    expect(e.rif).toBe('J-12345678-4');
    const ins = llamadas.find((l) => l.que === 'retencion_empresas_receptoras.insert')?.args[0] as Record<string, unknown>;
    expect(ins).toMatchObject({ clave: 'prueba_uno', rif: 'J-12345678-4' });
    expect(String(ins.id)).toMatch(/^[a-z0-9][a-z0-9-]{2,63}$/);
    cola.push({ data: [] });
    await expect(guardarEmpresaReceptora({ id: 'e1', nombre: 'Empresa de Prueba C.A.', rif: 'J-12345678', colorBadge: '#2563eb', activo: true })).rejects.toThrow(/sin permiso/);
  });

  it('un nombre corto repetido dice cuál es el problema', async () => {
    cola.push({ error: { code: '23505', message: 'duplicate key value violates unique constraint "retencion_empresas_receptoras_clave_key"' } });
    await expect(guardarEmpresaReceptora({ nombre: 'Empresa de Prueba C.A.', rif: 'J-12345678', colorBadge: '#2563eb', activo: true })).rejects.toThrow(/nombre corto/);
  });

  it('una empresa con facturas no se borra: se pide desactivarla', async () => {
    cola.push({ error: { code: '23503', message: 'update or delete on table violates foreign key constraint' } });
    await expect(eliminarEmpresaReceptora('e1')).rejects.toThrow(/Desactívala/);
  });

  it('la clave sale del nombre, en minúsculas y sin acentos', () => {
    expect(claveDeEmpresa('  Compañía Ñandú, C.A. ')).toBe('compania_nandu_c_a');
  });
});
