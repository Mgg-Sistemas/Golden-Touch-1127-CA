-- 26/10/2026 · Carga del Excel «Base_de_Datos_Vehiculos_maquinaria» (supabase/.temp) en maquinaria_equipos
-- SOLO filas con Ubicación / Base = GT o PERAMANAL (16 de MAQUINARIA + 2 de VEHICULO; MOTO y LANCHAS: ninguna).
-- Las 18 ya existían en la base: no se insertó ningún equipo; solo se rellenaron columnas vacías
-- (ubicación, propietario, año, modelo, placa, estado operativo y notas con título/resguardo/RCV/ROCT/capacidad).
-- Nunca se sobrescribió un valor existente. Respaldo previo: public._bkp_maq_excel_flota_20261026.
-- Cotejado uno a uno por 3 agentes (seriales de carrocería y motor, marca+modelo). Aplicado el 26/10/2026.

-- Cotejo Excel flota (26/10/2026) vs public.maquinaria_equipos · filas 3 a 10 (MAQUINARIA)
-- Generado por agente de cotejo. Solo rellena columnas NULL/'' (anio también 0). No sobrescribe valores existentes.

-- fila 3 · CATERPILLAR D9R (id 05c6ac36-ccf6-4063-82f2-52db13e6a1f3)
-- Match por serial parcial (D9RABK00652 ⊂ CAT00D9RJABK00652) + motor_serial '8 CIL' + marca/modelo.
-- Sin UPDATE: todas las columnas ya tienen valor y notas ya tiene texto (informe técnico 09/10/2026).

-- fila 4 · KOMATSU PC220LC 8 (id aab572ec-ce97-468b-b8f7-d432afe286b9)
-- Match por serial exacto KMTPC181V02085339.
-- Sin UPDATE: todas las columnas ya tienen valor y notas ya tiene texto.

-- fila 5 · VOLVO EC240-40144 (id e69299a5-f9cb-4afa-8be4-0101d08bb410)
-- Match por serial exacto VCEC240BK00040144 + motor_serial 11311375.
-- Sin UPDATE: todas las columnas ya tienen valor y notas ya tiene texto.

-- fila 6 · VOLVO EC240-40145 (id 03859339-c575-4a1f-bde5-93042a53f4a8)
-- Match por sufijo de serial ...00040145 + marca/modelo (Excel VCEC240BJ00040145 vs base VCEC240BK00040145).
update public.maquinaria_equipos
set ubicacion = 'GT PERAMANAL',
    notas = 'Excel flota 26/10/2026: título NO · resguardo N/A · RCV FALTA · ROCT N/A · últ. mantenimiento Sin registro · obs: SOLO TIENE FACTURA',
    updated_at = now()
where id = '03859339-c575-4a1f-bde5-93042a53f4a8'
  and (ubicacion is null or ubicacion = '')
  and (notas is null or notas = '');

-- fila 7 · VOLVO EC210BLC (id 0749688f-a589-4e02-9e40-9c822bf3b1e0)
-- Match por motor_serial exacto 11292589 + sufijo de serial ...00078203 (Excel VCEC210BV00078203 vs base VCEC210BU00078203).
update public.maquinaria_equipos
set notas = 'Excel flota 26/10/2026: título NO · resguardo N/A · RCV FALTA · ROCT N/A · últ. mantenimiento Sin registro · obs: SOLO TIENE FACTURA',
    updated_at = now()
where id = '0749688f-a589-4e02-9e40-9c822bf3b1e0'
  and (notas is null or notas = '');

-- fila 8 · CATERPILLAR 966D (id 6d98697a-6739-428d-8993-8385f28b779e)
-- Match por motor_serial exacto 10Z08346 + marca/modelo (Excel serial 35S01836 vs base 35SO1836: cero vs letra O).
update public.maquinaria_equipos
set notas = 'Excel flota 26/10/2026: capacidad 5400 · título SI · resguardo N/A · RCV FALTA · ROCT N/A · últ. mantenimiento Sin registro',
    updated_at = now()
where id = '6d98697a-6739-428d-8993-8385f28b779e'
  and (notas is null or notas = '');

-- fila 9 · CARGADOR FLONTAL VOLVO L220G (id 513ca717-cceb-435e-baad-f243751cacc1)
-- Match por serial exacto VCEL220GA00009238 + motor_serial 364369.
update public.maquinaria_equipos
set notas = 'Excel flota 26/10/2026: título NO · resguardo N/A · RCV FALTA · ROCT N/A · últ. mantenimiento Sin registro · obs: SOLO TIENE FACTURA',
    updated_at = now()
where id = '513ca717-cceb-435e-baad-f243751cacc1'
  and (notas is null or notas = '');

-- fila 10 · VOLVO A35F 483 (id 1cf132b5-9f8b-4b93-9fef-fc415284d240)
-- Match por motor_serial exacto 367478 + sufijo de serial ...50483 (Excel VCEOA35FH00050483 vs base VCE0A35FH00050483: letra O vs cero).
-- Sin UPDATE: todas las columnas ya tienen valor y notas ya tiene texto.

-- Cotejo Excel flota 26/10/2026 vs public.maquinaria_equipos
-- Agente 2 · filas 11 a 18 de MAQUINARIA (C:/tmp/port/flota_gt.json)
-- Regla: solo se rellenan columnas NULL/'' (y anio 0/NULL). Nunca se sobrescribe un valor existente.
-- estado_operativo respeta el CHECK maquinaria_equipos_estado_operativo_chk (valores en minúscula: operativa, averiada, ...).


-- fila 11 · VOLVO A35F 484 (id 321c9882-e8d2-4bcb-9b46-249298f16a05)
-- Match por VIN (Excel VCEOA35FE00050484 ~ base VCE0A35FE00050484; letra O vs cero).
-- Sin UPDATE: todas las columnas ya tienen valor (motor_serial='N/A' se respeta) y notas ya tiene texto.

-- fila 12 · CAT428E (id 1212be65-710f-49fd-a4d8-87c50cedeca3)
-- Match por marca+modelo y VIN casi idéntico (Excel CAT0428ETDPH3465 vs base CAT0428ETDPH03465).
-- Sin UPDATE: todas las columnas ya tienen valor y notas ya tiene texto.

-- fila 13 · CAT GEP 550-1 (id 36685831-e252-49c6-b573-ad0c49c1cb1b)
-- Match por VIN exacto OLY00000PA6A00579.
-- Sin UPDATE: el Excel no trae año/motor/color; las demás columnas ya tienen valor y notas ya tiene texto.

-- fila 14 · MINI PALA (id 0a3d04d6-1174-44c4-ab17-8b5f76a7d91e)
-- Match por VIN exacto AZN712295.
update public.maquinaria_equipos
set ubicacion = 'GT PERAMANAL',
    placa = 'N/A',
    notas = 'Excel flota 26/10/2026: título NO · resguardo SI · RCV FALTA · ROCT N/A · obs: SOLO TIENE FACTURA',
    updated_at = now()
where id = '0a3d04d6-1174-44c4-ab17-8b5f76a7d91e'
  and (ubicacion is null or ubicacion = '')
  and (placa is null or placa = '')
  and (notas is null or notas = '');

-- fila 15 · MONTACARGAS NARANJA HELI (id 112b88b7-3376-42f0-9591-7fd4628d8c88)
-- Match por VIN exacto 010350G9545W4 y motor 4JG2352515.
update public.maquinaria_equipos
set ubicacion = 'GT PERAMANAL',
    notas = 'Excel flota 26/10/2026: capacidad 3500 · clase APARATO APTO · título SI · último mantenimiento: Sin registro',
    updated_at = now()
where id = '112b88b7-3376-42f0-9591-7fd4628d8c88'
  and (ubicacion is null or ubicacion = '')
  and (notas is null or notas = '');

-- fila 16 · SINOMACH (2) (id 53cc0329-0273-4bd9-b095-ac22c364a8b2)
-- Match por VIN (Excel SINE210HHM1300488 = base SINE210HHM1300488*) y motor 90162368. Marca de la base (SINOMACH) NO se toca.
update public.maquinaria_equipos
set notas = 'Excel flota 26/10/2026: capacidad 3000 · clase APARATO APTO · título SI · resguardo FALTA · RCV FALTA · ROCT N/A · obs: el Excel registra marca SHANGLI y año 2021',
    updated_at = now()
where id = '53cc0329-0273-4bd9-b095-ac22c364a8b2'
  and (notas is null or notas = '');

-- fila 17 · SINOMACH (1) (id 63a4dfce-1898-4638-98c2-fd972e7aa1dd)
-- Match por VIN (Excel SINE210HCM1300445 = base SINE210HCM1300445*) y motor 90156784. Marca de la base (SINOMACH) NO se toca.
update public.maquinaria_equipos
set notas = 'Excel flota 26/10/2026: capacidad 3000 · clase APARATO APTO · título SI · resguardo FALTA · RCV FALTA · ROCT N/A · obs: el Excel registra marca SHANGLI, año 2021 y ubicación GT',
    updated_at = now()
where id = '63a4dfce-1898-4638-98c2-fd972e7aa1dd'
  and (notas is null or notas = '');

-- fila 18 · YAMAGRO 60KVA (id 32025eae-79bb-494f-b7bf-c3b710acb915)
-- Match por VIN exacto 202507010 y marca+modelo BSCL-60KVA.
-- Excel "Operativo" -> 'operativa' (valor permitido por el CHECK de la columna).
update public.maquinaria_equipos
set estado_operativo = 'operativa',
    updated_at = now()
where id = '32025eae-79bb-494f-b7bf-c3b710acb915'
  and (estado_operativo is null or estado_operativo = '');


-- Cotejo Excel flota 26/10/2026 (clave VEHICULO) vs public.maquinaria_equipos
-- Generado por agente 3. Solo rellena columnas NULL/'' (anio también si 0). No sobrescribe valores existentes.
-- Guardas WHERE adicionales por columna para que, si alguien ya cargó el dato, el UPDATE no lo pise.

-- =====================================================================
-- fila 39 · CAMIONETA HILUX A52AE4F  (id 97641e79-d23e-4337-a78a-d242314f5776)
-- Emparejada por placa (A52AE4F = A52AE4F).
-- Se rellenan: propietario, ubicacion, anio, modelo, notas.
-- NO se tocan (ya tienen valor): tipo='PICK-UP D/C', marca='TOYOTA', color='PLATA', combustible='GASOIL', placa.
-- NO se cargan serial ni motor_serial: el Excel trae 8XA33NV2689006574 / 2TR6530655 en AMBAS filas (39 y 40)
--   y en la base ese mismo serial/motor ya está asignado a la A01EH4P. Ver discrepancia en el reporte.
-- =====================================================================
update public.maquinaria_equipos
set
  propietario = case when coalesce(propietario, '') = '' then 'INDUSTRIAS JHENZAEN 2016 C.A' else propietario end,
  ubicacion   = case when coalesce(ubicacion, '') = ''   then 'GT PERAMANAL' else ubicacion end,
  anio        = case when coalesce(anio, 0) = 0         then 2008 else anio end,
  modelo      = case when coalesce(modelo, '') = ''      then 'HILUX D/C 2TR M /TGN26L-PRMDKLA' else modelo end,
  notas       = case when coalesce(notas, '') = ''       then 'Excel flota 26/10/2026: pick-up D/C · capacidad 995 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA' else notas end,
  updated_at  = now()
where id = '97641e79-d23e-4337-a78a-d242314f5776';

-- Alternativa SOLO si se confirma que el serial/motor del Excel pertenecen a la Hilux 2008 (A52AE4F)
-- y NO a la A01EH4P (el NIV 8XA33NV26*8*9006574 tiene dígito de año "8" = 2008 y el motor 2TR es el 2.7L
-- de la Hilux 2008; la A01EH4P es V6 2015 / GGN25L, cuyo motor sería 1GR). Revisar documentos antes de aplicar:
-- update public.maquinaria_equipos
-- set serial       = case when coalesce(serial, '') = '' then '8XA33NV2689006574' else serial end,
--     motor_serial = case when coalesce(motor_serial, '') = '' then '2TR6530655' else motor_serial end,
--     updated_at   = now()
-- where id = '97641e79-d23e-4337-a78a-d242314f5776';

-- =====================================================================
-- fila 40 · CAMIONETA PICK-UP D/C A01EH4P  (id bef62493-df95-4b42-9278-3f488e535151)
-- Emparejada por serial de carrocería (8XA33NV2689006574) y serial de motor (2TR6530655); la placa NO coincide
--   (base 'A01EH49' vs Excel 'A01EH4P') y NO se modifica.
-- Se rellenan: ubicacion, notas.
-- NO se tocan (ya tienen valor): tipo='CAMIONETA', propietario='ORLANDO MOLINA', anio=2015, marca, modelo, color,
--   serial, motor_serial, combustible='GASOIL', placa.
-- =====================================================================
update public.maquinaria_equipos
set
  ubicacion  = case when coalesce(ubicacion, '') = '' then 'GT PERAMANAL' else ubicacion end,
  notas      = case when coalesce(notas, '') = ''     then 'Excel flota 26/10/2026: pick-up D/C · capacidad 680 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA' else notas end,
  updated_at = now()
where id = 'bef62493-df95-4b42-9278-3f488e535151';

-- Claves MOTO y LANCHAS del JSON: vacías ([]), nada que cotejar.
