-- =============================================================
-- Golden Touch-Inventario · Seed (datos demo)
-- Correr DESPUÉS de schema.sql, en Supabase SQL Editor.
-- Idempotente: usa ON CONFLICT (rif/sku/codigo/numero) DO NOTHING.
-- =============================================================

-- ─── Proveedores ───────────────────────────────────────────
insert into public.proveedores (rif, razon_social, contacto, telefono, email, direccion, categorias, estado) values
  ('J-30056789-1', 'Minera del Sur C.A.',                   'Luis Ramírez', '0414-1234567', 'ventas@minerasur.com.ve',    'Av. Libertador, Caracas',    array['Explosivos','Maquinaria'], 'activo'),
  ('J-40123456-7', 'Suministros Industriales Orinoco',      'María Pérez',  '0212-5557890', 'orinoco@suministros.com.ve', 'Zona Industrial, Pto Ordaz', array['EPP','Herramientas'],      'activo'),
  ('J-29876543-2', 'Transporte Pesado Guayana',             'José Gómez',   '0286-3334455', 'op@tpguayana.com',           'Av. Guayana, Pto Ordaz',     array['Logística'],               'activo'),
  ('J-31112233-4', 'Repuestos y Servicios Andes',           'Carmen Díaz',  '0274-2226677', 'andes@repser.com.ve',        'Mérida',                     array['Repuestos','Lubricantes'], 'activo'),
  ('J-32223344-5', 'Químicos del Caribe',                   'Pedro Salas',  '0212-6669988', 'qcaribe@qdc.com.ve',         'La Guaira',                  array['Reactivos','Químicos'],    'inactivo')
on conflict (rif) do nothing;

-- ─── Almacenes ────────────────────────────────────────────
insert into public.almacenes (nombre, ubicacion) values
  ('General',   'Sede principal'),
  ('Almacén 1', 'Galpón A'),
  ('Almacén 2', 'Galpón B')
on conflict (nombre) do nothing;

-- ─── Productos ────────────────────────────────────────────
insert into public.productos (sku, nombre, categoria, unidad, stock, stock_min, precio, almacen, estado, restock_pct, tipo) values
  ('EXP-001', 'Detonador eléctrico',        'Explosivos',   'und',    240, 80,  12.5,    'General', 'activo', null, 'final'),
  ('EXP-002', 'ANFO (saco 25kg)',           'Explosivos',   'saco',   65,  100, 38.0,    'General', 'activo', 180,  'final'),
  ('EPP-001', 'Casco de seguridad',         'EPP',          'und',    420, 150, 14.0,    'General', 'activo', null, 'final'),
  ('EPP-002', 'Guantes anti-corte',         'EPP',          'par',    50,  200, 6.5,     'General', 'activo', 150,  'final'),
  ('EPP-003', 'Lentes industriales',        'EPP',          'und',    310, 100, 4.8,     'General', 'activo', null, 'final'),
  ('HER-001', 'Pico minero',                'Herramientas', 'und',    75,  30,  22.0,    'General', 'activo', null, 'final'),
  ('HER-002', 'Pala punta corazón',         'Herramientas', 'und',    110, 40,  18.5,    'General', 'activo', null, 'final'),
  ('MAQ-001', 'Broca tricónica 8"',         'Maquinaria',   'und',    12,  8,   540.0,   'General', 'activo', 50,   'final'),
  ('LUB-001', 'Aceite hidráulico 55gal',    'Lubricantes',  'tambor', 18,  10,  320.0,   'General', 'activo', null, 'final'),
  ('REA-001', 'Cianuro de sodio (kg)',      'Reactivos',    'kg',     4,   50,  26.0,    'General', 'activo', 200,  'inicial'),
  ('REP-001', 'Filtro hidráulico CAT',      'Repuestos',    'und',    22,  12,  95.0,    'General', 'activo', null, 'final'),
  ('LOG-001', 'Neumático 14.00R25',         'Logística',    'und',    6,   4,   1850.0,  'General', 'activo', 60,   'final')
on conflict (sku) do nothing;

-- ─── Órdenes ──────────────────────────────────────────────
-- Usamos subconsultas para resolver los UUIDs de proveedores.
insert into public.ordenes (codigo, proveedor_id, solicitante_email, solicitante, items, total, estado, notas, historial, created_at)
select
  'OP-2026-0001',
  (select id from public.proveedores where rif = 'J-40123456-7'),
  'analista@mineralgroupguayana.com.ve',
  'Carlos Hernández',
  jsonb_build_array(
    jsonb_build_object('sku','EPP-002','nombre','Guantes anti-corte','cantidad',250,'precio',6.5),
    jsonb_build_object('sku','EPP-001','nombre','Casco de seguridad','cantidad',50,'precio',14.0)
  ),
  250*6.5 + 50*14,
  'pendiente',
  'Reposición urgente de EPP planta 2.',
  jsonb_build_array(jsonb_build_object('at', (now() - interval '2 days')::text, 'evento', 'creada', 'actor', 'analista@mineralgroupguayana.com.ve')),
  now() - interval '2 days'
on conflict (codigo) do nothing;

insert into public.ordenes (codigo, proveedor_id, solicitante_email, solicitante, items, total, estado, notas, historial, created_at)
select
  'OP-2026-0002',
  (select id from public.proveedores where rif = 'J-32223344-5'),
  'analista@mineralgroupguayana.com.ve',
  'Carlos Hernández',
  jsonb_build_array(jsonb_build_object('sku','REA-001','nombre','Cianuro de sodio (kg)','cantidad',100,'precio',26.0)),
  100*26,
  'pendiente',
  'Proceso de lixiviación.',
  jsonb_build_array(jsonb_build_object('at', (now() - interval '1 day')::text, 'evento', 'creada', 'actor', 'analista@mineralgroupguayana.com.ve')),
  now() - interval '1 day'
on conflict (codigo) do nothing;

insert into public.ordenes (codigo, proveedor_id, solicitante_email, solicitante, items, total, estado, notas, historial, aprobada_por, aprobada_en, created_at)
select
  'OP-2026-0003',
  (select id from public.proveedores where rif = 'J-30056789-1'),
  'analista@mineralgroupguayana.com.ve',
  'Carlos Hernández',
  jsonb_build_array(jsonb_build_object('sku','EXP-002','nombre','ANFO (saco 25kg)','cantidad',80,'precio',38.0)),
  80*38,
  'aprobada',
  'Frente de voladura Norte.',
  jsonb_build_array(
    jsonb_build_object('at', (now() - interval '6 days')::text, 'evento', 'creada', 'actor', 'analista@mineralgroupguayana.com.ve'),
    jsonb_build_object('at', (now() - interval '5 days')::text, 'evento', 'aprobada', 'actor', 'admin@mineralgroupguayana.com.ve')
  ),
  'admin@mineralgroupguayana.com.ve',
  now() - interval '5 days',
  now() - interval '6 days'
on conflict (codigo) do nothing;
