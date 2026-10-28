-- =============================================================================
-- 2026-10-28 · Choferes: data traída de MGG (itqejsffgueshmlodkjk) a GT
-- =============================================================================
-- Pedido de la usuaria: traer de MGG SOLO estos 5 conductores, «con sus viajes,
-- con su información», y darlos de alta en RRHH en la nómina GT La Guaira (GTLG):
--   1. GREGORIO EZEQUIEL GOMEZ RAMIREZ   V-15477781
--   2. JOSE DORASMO RONDON RAMIREZ       V-11514894
--   3. ALEJANDRO GARCIA                  V-19388836
--   4. LUIS REYMAR ALVAREZ  GOLINDANO    V-20774728
--   5. BARDIS ANTONIO JAIME CARVAJAL     V-6185823
-- Los otros 6 conductores de MGG (BEN HUR, GREGORY BORGES, HECTOR ALAGAL, JONY
-- SALAZAR, LETTIMER RODRIGUEZ y el externo JOSE GOMEZ / METAL FENIX) NO se copian,
-- ni sus viajes ni sus documentos.
--
-- Se conservan los MISMOS id de MGG (personal, conductor, vehículo, viajes,
-- descansos) para que el script sea idempotente y se pueda rastrear el origen.
-- Todo es "on conflict (id) do nothing" / "where not exists": correrlo dos veces
-- no duplica nada. No se tocan periodos ni renglones de nómina.
--
-- Esquema: GT ya tenía todas las columnas necesarias (alineado con MGG el 25/10),
-- no hizo falta agregar ninguna.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) RRHH · personal (empresa GTLG = GOLDEN TOUCH · LA GUAIRA)
-- -----------------------------------------------------------------------------
-- Ninguno existía en GT (se buscó por cédula sin letra/puntos y por nombre).
-- Campos copiados de su ficha de MGG: nombre, apellido, cédula, RIF, cargo,
-- sueldo_base, fecha_ingreso, género (masculino -> 'M'), estado civil,
-- nacionalidad, fecha de nacimiento, grupo sanguíneo y vencimiento del carnet.
-- Departamento: en MGG venía 'Operaciones' / 'OPERACION MGG'; en GT se usa el
-- departamento existente 'OPERACIONES'.
-- ficha_nro va null: el trigger personal_asigna_ficha de GT le da el siguiente
-- número de la empresa GTLG. El sueldo_base > 0 genera solo, por trigger, su
-- renglón "Sueldo inicial" en personal_sueldos.
-- datos_pago en MGG está vacío (null) para los 5: no hay datos bancarios.
-- Fotos: en MGG están en el bucket público carnet-fotos (ver reporte); aquí
-- foto_path queda null hasta subirlas a GT.
insert into public.personal
  (id, nombre, apellido, cedula, rif, cargo, departamento, sueldo_base, activo,
   empresa, fecha_ingreso, genero, estado_civil, nacionalidad, fecha_nacimiento,
   grupo_sanguineo, carnet_vence, created_by)
select v.* from (values
  ('9443f29a-c43e-4f43-89c8-f2383fc831ca'::uuid, 'GREGORIO EZEQUIEL', 'GOMEZ RAMIREZ',      'V-15477781', 'V-15477781-0', 'CONDUCTOR', 'OPERACIONES', 1300::numeric, true, 'GTLG', '2025-01-01'::date, 'M', 'soltero', 'VENEZOLANO', null::date,         null,  '2026-12-31'::date, 'sync-choferes-mgg-2026-10-28'),
  ('5a27687b-56e4-4bd9-ae83-227bc995a86e'::uuid, 'JOSE DORASMO',      'RONDON RAMIREZ',     'V-11514894', null,           'CONDUCTOR', 'OPERACIONES',  600::numeric, true, 'GTLG', '2026-10-01'::date, 'M', 'soltero', 'VENEZOLANO', null::date,         null,  '2026-12-31'::date, 'sync-choferes-mgg-2026-10-28'),
  ('8e8dcc5c-3455-42f7-ac94-4eaee98ef9ab'::uuid, 'ALEJANDRO',         'GARCIA',             'V-19388836', null,           'CONDUCTOR', 'OPERACIONES',  800::numeric, true, 'GTLG', '2026-07-23'::date, 'M', 'soltero', 'VENEZOLANO', null::date,         null,  '2026-12-31'::date, 'sync-choferes-mgg-2026-10-28'),
  ('90a46af6-cd38-4523-94e8-d85dd2ce3cde'::uuid, 'LUIS REYMAR',       'ALVAREZ  GOLINDANO', 'V-20774728', 'V-20774728-5', 'CONDUCTOR', 'OPERACIONES',  600::numeric, true, 'GTLG', '2026-10-22'::date, 'M', 'soltero', 'VENEZOLANO', '1988-08-25'::date, 'O+',  '2026-12-31'::date, 'sync-choferes-mgg-2026-10-28'),
  ('5ce4f7d4-403a-4d18-97cc-04aeebb976a4'::uuid, 'BARDIS ANTONIO',    'JAIME CARVAJAL',     'V-6185823',  'V-06185823-3', 'CONDUCTOR', 'OPERACIONES',  400::numeric, true, 'GTLG', '2025-06-01'::date, 'M', 'soltero', 'VENEZOLANO', null::date,         null,  '2026-12-31'::date, 'sync-choferes-mgg-2026-10-28')
) as v(id, nombre, apellido, cedula, rif, cargo, departamento, sueldo_base, activo,
       empresa, fecha_ingreso, genero, estado_civil, nacionalidad, fecha_nacimiento,
       grupo_sanguineo, carnet_vence, created_by)
where not exists (   -- no duplicar si ya hay alguien con esa cédula (normalizada)
  select 1 from public.personal p
   where regexp_replace(coalesce(p.cedula, ''), '\D', '', 'g') = regexp_replace(v.cedula, '\D', '', 'g')
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2) Choferes · expedientes de los 5 conductores (mismo id que en MGG)
-- -----------------------------------------------------------------------------
-- personal_id se resuelve por cédula en el personal de GT (no por el id de MGG),
-- así sirve aunque la persona ya existiera con otro id.
insert into public.choferes_conductores
  (id, personal_id, licencia_grado, licencia_numero, licencia_vence,
   certificado_medico_vence, seguro_vence, tarifa_viaje_usd, observaciones, activo,
   created_by, actor_name, created_at, updated_at, externo, nombre, apellido,
   cedula, telefono, empresa_externa)
select v.id,
       (select p.id from public.personal p
         where regexp_replace(coalesce(p.cedula, ''), '\D', '', 'g') = v.ced
         order by p.activo desc, p.created_at limit 1),
       v.licencia_grado, v.licencia_numero, v.licencia_vence, v.certificado_medico_vence,
       null, v.tarifa, v.obs, true, v.created_by, v.actor, v.created_at,
       v.updated_at, false, null, null, null, null, null
from (values
  ('49fcfa77-165a-40b7-be44-9f4a5f2939b7'::uuid, '15477781', '5TA', '190204476102', '2029-07-03'::date, '2027-02-03'::date, 25::numeric,
   'Expediente creado desde la ficha de RRHH; completar licencia, certificado médico y seguro. [TASAS: corto=25, largo=50, interno=1]',
   'admin@gmail.com', 'Administrador MGG', '2026-10-12 17:42:41.506002+00'::timestamptz, '2026-10-27 14:54:49.284448+00'::timestamptz),
  ('90844fad-1fcd-4837-a939-ada0ac460684'::uuid, '11514894', null, null, null::date, null::date, 0::numeric,
   'Expediente creado desde la ficha de RRHH; completar licencia, certificado médico y seguro.',
   'admin@gmail.com', 'Administrador MGG', '2026-10-12 17:42:41.506002+00'::timestamptz, null::timestamptz),
  ('4b1f4a63-f965-4d37-b09d-cae02ab62fe2'::uuid, '19388836', null, null, null::date, null::date, 0::numeric,
   'Expediente creado desde la ficha de RRHH; completar licencia, certificado médico y seguro.',
   'admin@gmail.com', 'Administrador MGG', '2026-10-12 17:42:41.506002+00'::timestamptz, null::timestamptz),
  ('94074a5e-dcd6-43bc-b497-59bd47dec7c5'::uuid, '20774728', '5TA', '180203571078', '2028-08-25'::date, '2031-08-15'::date, 25::numeric,
   '[TASAS: corto=25, largo=50, interno=1]',
   'rrhhmgg001@gmail.com', 'ZORYS', '2026-10-25 19:30:50.563999+00'::timestamptz, null::timestamptz),
  ('82f22df2-0697-479a-bb2e-c778b6677212'::uuid, '6185823',  '5TA', '170202738384', '2027-09-24'::date, '2029-12-06'::date, 25::numeric,
   'Expediente creado desde la ficha de RRHH; completar licencia, certificado médico y seguro. [TASAS: corto=25, largo=50, interno=1]',
   'sistema', 'Administrador MGG', '2026-10-26 13:07:11.695004+00'::timestamptz, '2026-10-26 13:10:09.924372+00'::timestamptz)
) as v(id, ced, licencia_grado, licencia_numero, licencia_vence, certificado_medico_vence,
       tarifa, obs, created_by, actor, created_at, updated_at)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 3) Vehículo usado en sus viajes: IVECO TRAKKER 420 · A43AT7M
-- -----------------------------------------------------------------------------
-- No existía en GT (cruce por placa). Se inserta con el id de MGG.
-- MGG notas -> GT observacion; MGG creado_por -> GT created_by.
-- (El trigger de GT pasa tipo/marca/modelo/color a mayúsculas: 'chuto' -> 'CHUTO')
insert into public.vehiculos_catalogo
  (id, placa, tipo, marca, modelo, color, observacion, activo, created_by,
   created_at, updated_at, estado_flota)
select '40ffca3e-89b9-41d7-96b9-6f3953be5d7a'::uuid, 'A43AT7M', 'chuto', 'IVECO',
       'TRAKKER 420', 'BLANCO',
       'Importado del catálogo de Salidas el 12-10-2026 (placa original: A43AT7M/BATEA A09BH5F)',
       true, 'mineralgroupguayanaca@gmail.com',
       '2026-10-12 14:57:58.339767+00', '2026-10-12 14:59:11.495175+00', 'operativo'
where not exists (select 1 from public.vehiculos_catalogo where upper(placa) = 'A43AT7M')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 4) Viajes: los 13 de JOSE DORASMO RONDON (los otros 4 conductores no tienen
--    viajes en MGG). 11 pagados el 15/10 + 2 pendientes ($5 + $5).
-- -----------------------------------------------------------------------------
-- Todos: camión, VIAJE CORTO, finalizado, mismo vehículo, salida/llegada real =
-- programada, sin km, sin liquidación ni pago_id. Creado por rrhhmgg001 (ZORYS).
-- vehiculo_id se resuelve por placa en GT.
insert into public.choferes_viajes
  (id, numero, chofer_id, vehiculo_id, origen, destino, paradas, carga,
   fecha_salida, llegada_prevista, salida_real_at, llegada_real_at, km_salida, km_llegada,
   estado, tarifa_usd, nota, created_by, actor_name, created_at, updated_at,
   tipo_viaje, viajes, categoria_viaje, pagado_at)
select v.id, v.numero, '90844fad-1fcd-4837-a939-ada0ac460684'::uuid,
       (select id from public.vehiculos_catalogo where upper(placa) = 'A43AT7M' order by created_at limit 1),
       v.origen, v.destino, '[]'::jsonb, v.carga,
       v.salida, v.llegada, v.salida, v.llegada, null, null,
       'finalizado', v.tarifa,
       'SE REGISTRA TRASLADO DE MAQUINARIA EJECUTADO POR EL CONDUCTOR JOSE RONDON EN LA UNIDAD IVECO TRAKKER 420 · A43AT7M BAJO LA CORRESPONDIENTE AUTORIZACION'
         || case when v.pagado_at is not null then ' [CORTE: 2026-09-30 A 2026-10-14] [PAGADO: 2026-10-15]' else '' end,
       'rrhhmgg001@gmail.com', 'ZORYS', v.created_at, v.updated_at,
       'camion', v.viajes, 'VIAJE CORTO', v.pagado_at
from (values
  ('0e309651-0252-42ca-a2a1-f4683a786725'::uuid, 'VJ-2026-0009', 'CORAL BEACH',     'PARQUE EL AGUA',  'ESCOMBROS',                 '2026-10-02 12:00:00+00'::timestamptz, '2026-10-02 16:00:00+00'::timestamptz, 5::numeric,  2::numeric, '2026-10-16 17:57:32.48484+00'::timestamptz,  '2026-10-23 21:56:16.307247+00'::timestamptz, '2026-10-15 00:00:00+00'::timestamptz),
  ('b5011038-6df8-4a71-8ae3-f497ad89f327'::uuid, 'VJ-2026-0010', 'CORAL BEACH',     'PARQUE EL AGUA',  'ESCOMBROS',                 '2026-10-03 12:00:00+00', '2026-10-03 16:00:00+00', 5,  7, '2026-10-16 17:59:48.893593+00', '2026-10-23 21:56:18.298424+00', '2026-10-15 00:00:00+00'),
  ('9c7bba01-2f5f-4116-8db5-5d972158542b'::uuid, 'VJ-2026-0011', 'CORAL BEACH',     'PARQUE EL AGUA',  'ESCOMBROS',                 '2026-10-04 12:00:00+00', '2026-10-04 16:00:00+00', 5,  5, '2026-10-16 18:02:20.883679+00', '2026-10-23 21:56:18.807755+00', '2026-10-15 00:00:00+00'),
  ('33c3e52f-1d99-40a5-9e6b-96e1f5821327'::uuid, 'VJ-2026-0012', 'CORAL BEACH',     'PARQUE EL AGUA',  'ESCOMBROS',                 '2026-10-05 12:00:00+00', '2026-10-05 16:00:00+00', 5,  3, '2026-10-16 18:04:59.267477+00', '2026-10-23 21:56:19.831202+00', '2026-10-15 00:00:00+00'),
  ('e41054a0-3545-4194-8558-e53f5a1eb0c4'::uuid, 'VJ-2026-0013', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', 'ESCOMBROS',                 '2026-10-06 12:00:00+00', '2026-10-07 00:00:00+00', 1, 25, '2026-10-16 18:07:11.09485+00',  '2026-10-23 21:56:20.935523+00', '2026-10-15 00:00:00+00'),
  ('2fab693f-7746-4970-bc77-65f1f43bc81a'::uuid, 'VJ-2026-0014', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', 'ESCOMBROS',                 '2026-10-07 12:00:00+00', '2026-10-08 00:00:00+00', 1, 21, '2026-10-16 18:08:56.806035+00', '2026-10-23 21:56:22.034066+00', '2026-10-15 00:00:00+00'),
  ('fa2fd3b5-b220-4f26-9001-d63b098aea00'::uuid, 'VJ-2026-0015', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', '(6)ESCOMBROS/(10)CABILLAS', '2026-10-08 12:00:00+00', '2026-10-09 00:00:00+00', 1, 16, '2026-10-16 18:11:02.610561+00', '2026-10-23 21:56:24.342342+00', '2026-10-15 00:00:00+00'),
  ('60507144-75fb-4dfa-a3d8-41184b4cd171'::uuid, 'VJ-2026-0016', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', 'CABILLAS',                  '2026-10-09 12:00:00+00', '2026-10-10 00:00:00+00', 1, 12, '2026-10-16 18:12:47.161068+00', '2026-10-23 21:56:25.891764+00', '2026-10-15 00:00:00+00'),
  ('bed8327b-dade-4a89-9e04-0c03d803877f'::uuid, 'VJ-2026-0017', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', '(3)ESCOMBROS/(11)CABILLAS', '2026-10-10 12:00:00+00', '2026-10-11 00:00:00+00', 1, 14, '2026-10-16 18:16:04.785403+00', '2026-10-23 21:56:26.429099+00', '2026-10-15 00:00:00+00'),
  ('8c674321-3ecc-4813-9929-c7fa19d3cdf5'::uuid, 'VJ-2026-0018', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', 'CABILLAS',                  '2026-10-11 12:00:00+00', '2026-10-12 00:00:00+00', 1, 12, '2026-10-16 18:17:47.774351+00', '2026-10-23 21:56:26.939112+00', '2026-10-15 00:00:00+00'),
  ('d5754c8c-f696-4b34-9f26-3ba6b2cce3cc'::uuid, 'VJ-2026-0019', 'PLAYA ESCONDIDA', 'PLAYA ESCONDIDA', 'ESCOMBROS',                 '2026-10-12 12:00:00+00', '2026-10-13 00:00:00+00', 1, 20, '2026-10-16 18:19:27.237888+00', '2026-10-23 21:56:27.471806+00', '2026-10-15 00:00:00+00'),
  ('b04440fb-b89a-41da-b69f-632f5628c37e'::uuid, 'VJ-2026-0020', 'PLAYA ESCONDIDA', 'CANTERA',         'POLVILLO',                  '2026-10-13 12:00:00+00', '2026-10-13 16:00:00+00', 5,  1, '2026-10-20 12:51:08.190291+00', '2026-10-23 20:52:15.077319+00', null),
  ('e83a31ac-5bd5-4862-a9e8-86e5311b4a70'::uuid, 'VJ-2026-0021', 'PLAYA ESCONDIDA', 'CANTERA',         'ARROCILLO',                 '2026-10-14 12:00:00+00', '2026-10-14 16:00:00+00', 5,  1, '2026-10-20 12:56:21.804942+00', '2026-10-23 20:52:15.274416+00', null)
) as v(id, numero, origen, destino, carga, salida, llegada, tarifa, viajes, created_at, updated_at, pagado_at)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 5) Documentos: NINGUNO de estos 5 tiene documentos en MGG.
--    Los 2 de MGG (licencia y certificado médico) son de GREGORY BORGES, que
--    no está en la lista -> no se copian.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 6) Descansos (rrhh_descansos): en MGG se guardan por persona (sin grupo ni
--    clave 'choferes'). Se copian solo los de estos 5: hay 2.
-- -----------------------------------------------------------------------------
insert into public.rrhh_descansos
  (id, personal_id, desde, hasta, origen, nota, created_at, created_by, actor_name)
select v.id, p.id, v.desde, v.hasta, 'manual', 'SEMAMA LIBRE', v.created_at,
       'rrhhmgg001@gmail.com', 'ZORYS'
from (values
  ('4521cab8-f3f3-4e84-921a-c4c9fd8e3646'::uuid, '6185823',  '2026-10-31'::date, '2026-11-06'::date, '2026-10-26 13:29:59.438006+00'::timestamptz),  -- BARDIS JAIME
  ('77d79ae7-723b-4a90-9452-b62c7b8b796a'::uuid, '11514894', '2026-10-24'::date, '2026-10-30'::date, '2026-10-24 13:29:09.68168+00'::timestamptz)    -- JOSE DORASMO RONDON
) as v(id, ced, desde, hasta, created_at)
join lateral (
  select id from public.personal
   where regexp_replace(coalesce(cedula, ''), '\D', '', 'g') = v.ced
   order by activo desc, created_at limit 1
) p on true
where not exists (   -- no duplicar por persona + fecha
  select 1 from public.rrhh_descansos d
   where d.personal_id = p.id and d.desde = v.desde and d.hasta = v.hasta
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 7) Guías, pagos y viáticos: 0 filas en MGG -> nada que copiar.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Verificación (Nómina y viajes: monto = tarifa_usd × viajes; pendiente = pagado_at null)
-- -----------------------------------------------------------------------------
-- select p.nombre || ' ' || p.apellido as conductor,
--        count(v.id) as registros, sum(v.viajes) as viajes,
--        sum(v.tarifa_usd * v.viajes) as total_usd,
--        sum(v.viajes) filter (where v.pagado_at is null) as viajes_pend,
--        coalesce(sum(v.tarifa_usd * v.viajes) filter (where v.pagado_at is null), 0) as pendiente_usd
--   from choferes_conductores c
--   join personal p on p.id = c.personal_id
--   left join choferes_viajes v on v.chofer_id = c.id
--  where p.empresa = 'GTLG'
--  group by 1 order by 1;
