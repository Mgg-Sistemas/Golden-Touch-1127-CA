-- 27/10/2026 · Carga COMPLETA del Excel «Base_de_Datos_Vehiculos_maquinaria» (supabase/.temp) en maquinaria_equipos
-- Todas las hojas: VEHICULO (100), MAQUINARIA (22), MOTO (30), LANCHAS + REMOLQUES (10). Cotejo uno a uno por 4 agentes
-- (placa normalizada, serial de carroceria, serial de motor, marca+modelo). Match: solo se rellenan columnas vacias
-- (coalesce(nullif(col,''), valor)); sin match: INSERT idempotente guardado por la funcion maq_flota_existe
-- (placa normalizada, serial exacto o mismo nombre de equipo). Respaldo previo: public._bkp_maq_excel_flota_20261027 (51 filas).
-- Aplicado el 27/10/2026 en varias tandas (el MCP declino la version completa en una sola llamada).

create or replace function public.maq_flota_existe(p_placa text, p_serial text, p_equipo text) returns boolean language sql stable as $$
  select exists (select 1 from public.maquinaria_equipos e
    where (upper(regexp_replace(coalesce(p_placa,''),'[^A-Za-z0-9]','','g')) not in ('','NA','SN') and upper(regexp_replace(coalesce(e.placa,''),'[^A-Za-z0-9]','','g')) = upper(regexp_replace(p_placa,'[^A-Za-z0-9]','','g')))
       or (upper(coalesce(p_serial,'')) not in ('','N/A','S/N','NA','SN') and upper(coalesce(e.serial,'')) = upper(p_serial))
       or (upper(btrim(coalesce(e.equipo,''))) = upper(btrim(coalesce(p_equipo,'')))));
$$;
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'RÚSTICO'),
  propietario = coalesce(nullif(propietario,''), 'MINERIA TIN OXIDE CA'),
  marca = coalesce(nullif(marca,''), 'TOYOTA'),
  modelo = coalesce(nullif(modelo,''), 'LAND CRUISER TE / FZJ78L-RJMRK'),
  color = coalesce(nullif(color,''), 'PLATA'),
  serial = coalesce(nullif(serial,''), '8XA21UJ7899502798'),
  placa = coalesce(nullif(placa,''), 'AB381AA'),
  motor_serial = coalesce(nullif(motor_serial,''), '1FZ'),
  anio = coalesce(nullif(anio,0), 2009),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo Techo duro · capacidad 1140 KGS · título SI · resguardo N/A'),
  updated_at = now()
where id = 'cd56277e-81e5-4805-9771-7339d2ac14fa';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'RÚSTICO'),
  propietario = coalesce(nullif(propietario,''), 'MINERIA TIN OXIDE CA'),
  marca = coalesce(nullif(marca,''), 'TOYOTA'),
  modelo = coalesce(nullif(modelo,''), 'LAND CRUISER'),
  color = coalesce(nullif(color,''), 'BLANCO'),
  serial = coalesce(nullif(serial,''), 'JTGRB71JX97003576'),
  placa = coalesce(nullif(placa,''), 'AM643MA'),
  motor_serial = coalesce(nullif(motor_serial,''), '1HZ0618047'),
  anio = coalesce(nullif(anio,0), 2009),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo Techo duro · capacidad 1000 KGS · título SI · resguardo N/A'),
  updated_at = now()
where id = '8e892df7-667c-4d79-8e0f-222bd1f0aabe';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'RÚSTICO'),
  propietario = coalesce(nullif(propietario,''), 'GOLDEN TOUCH 1127'),
  marca = coalesce(nullif(marca,''), 'TOYOTA'),
  modelo = coalesce(nullif(modelo,''), 'TECHO DURO LARGO'),
  color = coalesce(nullif(color,''), 'AMARILLO'),
  serial = coalesce(nullif(serial,''), '8XA21UJ7519010934'),
  placa = coalesce(nullif(placa,''), 'AI839JK'),
  motor_serial = coalesce(nullif(motor_serial,''), '1FZ0448155'),
  anio = coalesce(nullif(anio,0), 2001),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo Techo duro · capacidad 1040 KGS · título SI · resguardo N/A'),
  updated_at = now()
where id = 'dbcf7636-2c09-45b5-9014-7c4dd47beb9c';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'CAMIÓN'),
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'VEHÍCULOS DE CARGA'),
  propietario = coalesce(nullif(propietario,''), 'JHENZAEN 2012, C.A'),
  marca = coalesce(nullif(marca,''), 'IVECO'),
  modelo = coalesce(nullif(modelo,''), '380T38 / TRAKKER'),
  color = coalesce(nullif(color,''), 'AMARILLO'),
  serial = coalesce(nullif(serial,''), '8ATE3TRT08X064210'),
  placa = coalesce(nullif(placa,''), 'A41AH7D'),
  motor_serial = coalesce(nullif(motor_serial,''), 'F3BE06815009723'),
  anio = coalesce(nullif(anio,0), 2008),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo volteo · capacidad 23256 KGS · título SI · resguardo N/A · RCV FALTA · ROCT FALTA'),
  updated_at = now()
where id = 'af832ed7-1c2f-4a12-a7f7-d42836f66853';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'CAMIÓN'),
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'VEHÍCULOS DE CARGA'),
  propietario = coalesce(nullif(propietario,''), 'ENDERSON ENRIQUE LOZADA MORA'),
  marca = coalesce(nullif(marca,''), 'MITSUBISHI'),
  modelo = coalesce(nullif(modelo,''), 'FK617 /N/A'),
  color = coalesce(nullif(color,''), 'BLANCO'),
  serial = coalesce(nullif(serial,''), 'JLBFK617J9KV01243'),
  placa = coalesce(nullif(placa,''), 'A18AS7G'),
  motor_serial = coalesce(nullif(motor_serial,''), '6D16 A23618'),
  anio = coalesce(nullif(anio,0), 2009),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo casillero · capacidad 7550 KGS · título SI · resguardo N/A · RCV FALTA · ROCT FALTA'),
  updated_at = now()
where id = 'baa85952-0966-4fea-a766-b196d26e8c97';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'CAMIÓN'),
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'VEHÍCULOS DE CARGA'),
  propietario = coalesce(nullif(propietario,''), 'ENDERSON ENRIQUE LOZADA MORA'),
  marca = coalesce(nullif(marca,''), 'IVECO'),
  modelo = coalesce(nullif(modelo,''), '50,12/DAILY'),
  color = coalesce(nullif(color,''), 'BLANCO'),
  serial = coalesce(nullif(serial,''), 'N/A'),
  placa = coalesce(nullif(placa,''), 'A28DC1V'),
  motor_serial = coalesce(nullif(motor_serial,''), '8140.4315B0527'),
  anio = coalesce(nullif(anio,0), 2015),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo plataforma · capacidad 2850 KGS · título SI · resguardo N/A · RCV FALTA · ROCT FALTA'),
  updated_at = now()
where id = '40ceba1f-88bb-4548-99c8-b9717881525d';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'PICK-UP D/C'),
  propietario = coalesce(nullif(propietario,''), 'INDUSTRIAS JHENZAEN 2016 C.A'),
  ubicacion = coalesce(nullif(ubicacion,''), 'GT PERAMANAL'),
  marca = coalesce(nullif(marca,''), 'TOYOTA'),
  modelo = coalesce(nullif(modelo,''), 'HILUX D/C 2TR M /TGN26L-PRMDKLA'),
  color = coalesce(nullif(color,''), 'PLATA'),
  placa = coalesce(nullif(placa,''), 'A52AE4F'),
  anio = coalesce(nullif(anio,0), 2008),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 995 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
  updated_at = now()
where id = '97641e79-d23e-4337-a78a-d242314f5776';
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'PICK-UP D/C'),
  propietario = coalesce(nullif(propietario,''), 'ORLANDO SIMÓN MOLINA CHACON'),
  ubicacion = coalesce(nullif(ubicacion,''), 'GT PERAMANAL'),
  marca = coalesce(nullif(marca,''), 'TOYOTA'),
  modelo = coalesce(nullif(modelo,''), 'HILUX D/C V6 4./GGN25L'),
  color = coalesce(nullif(color,''), 'DORADO'),
  serial = coalesce(nullif(serial,''), '8XA33NV2689006574'),
  motor_serial = coalesce(nullif(motor_serial,''), '2TR6530655'),
  anio = coalesce(nullif(anio,0), 2015),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 680 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
  updated_at = now()
where id = 'bef62493-df95-4b42-9278-3f488e535151';
insert into public.maquinaria_equipos (equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, activo, created_by)
select equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio::int, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, true, 'excel-flota-2026-10-27' from (values
('CAMIONETA TOYOTA HILUX A75BH8F', 'PICK-UP D/C', null, 'INDUSTRIAS JHENZAEN 2016 C.A', 'ACTIVO', null, 2006, 'TOYOTA', 'HILUX DC 4WD 2T/ TGN26L-PRMDKLA', 'GRIS', '8XA33NV2669000135', 'A75BH8F', null, '2TR6092467', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 750 KGS · título SI · resguardo N/A'),
('CAMIÓN ASTRA HD864 A50BA9M', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'JHENZAEN 2012, C.A', 'ACTIVO', null, 2008, 'ASTRA', 'HD864 40', 'BLANCO', 'ZCNH864408P490295', 'A50BA9M', null, 'N/P', null, null, 'Excel flota 27/10/2026: tipo Grúa · capacidad 12000 KGS · título SI · resguardo N/A · RCV SI · ROCT FALTA'),
('CAMIÓN CHEVROLET NHR A93DA2M', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'HATEM SROUR GEORGES', 'ACTIVO', null, 2012, 'CHEVROLET', 'NHR/F/H/T/M', 'BLANCO', 'N/A', 'A93DA2M', null, '219299', null, null, 'Excel flota 27/10/2026: tipo plataforma · capacidad 2065 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA 4RUNNER AI838JK', 'SUV', null, 'ELIANY ALEXANDRA LOZADA CONTRERAS', 'ACTIVO', 'CARACAS', 2008, 'TOYOTA', '4RUNNER 2WD 5A/ /GRN210L-GKAGK', 'PLATA', 'JTEZU14R88K001855', 'AI838JK', null, '1GR5512838', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 400 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA TOYOTA 4RUNNER AA193OW', 'SUV', null, 'ASHLY KISBEY CARVAJAL OCHOA', 'ACTIVO', 'CARACAS', 2008, 'TOYOTA', '4RUNNER LTD V6 / GRN215L-GKAZK', 'BEIGE', 'JTEBU17R48K001199', 'AA193OW', null, '1GR5505834', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 400 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA TOYOTA LAND CRUISER 71 AB250UR', 'SUV', null, 'GAMA SUMINISTROS, C.A', 'ACTIVO', 'CARACAS', 2022, 'TOYOTA', 'LAND CRUISER 71', 'BLANCO', 'N/A', 'AB250UR', null, '6 CILINDROS', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 578 KGS · título SI · resguardo SI · RCV FALTA · ROCT N/A'),
('CAMIONETA LEXUS GX 460 AC626FP', 'SUV', null, 'YURIANNY MAYGLYN DOMINGUEZ ACEVEDO', 'ACTIVO', 'CARACAS', 2023, 'LEXUS', 'GX 460', 'NEGRO', 'N/A', 'AC626FP', null, '8CIL', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 760 KGS · título SI · resguardo SI · RCV FALTA · ROCT N/A'),
('AUTOMÓVIL TOYOTA COROLLA AG088PD', 'SEDÁN', null, 'OMAR EDUARDO RODRIGUEZ LUNA', 'ACTIVO', 'CARACAS', 2011, 'TOYOTA', 'COROLLA GLI 1.8 / ZZE142L-GEPNMF-', 'GRIS', '8XBBA42E3B7817152', 'AG088PD', null, '1ZZB061407', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 385 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA TOYOTA 4RUNNER AH271XV', 'SUV', null, 'JESUS ORLANDO JIMENEZ RODRIGIEZ', 'ACTIVO', 'CARACAS', 2020, 'TOYOTA', '4 RUNNER', 'BLANCO', 'N/A', 'AH271XV', null, '6CIL', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 900 KGS · título SI · resguardo SI · RCV FALTA · ROCT N/A · obs: POSEE DOCUMENTO DE COMPRA-VENTA'),
('CAMIONETA TOYOTA TUNDRA A10CA2K', 'PICK-UP D/C', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', 'LECHERIA/BARCELONA', 2016, 'TOYOTA', 'TUNDRA', 'AZUL', 'N/A', 'A10CA2K', null, '3UR6142296', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 700 KGS · título SI · resguardo SI · RCV FALTA · ROCT N/A'),
('AUTOMÓVIL TOYOTA COROLLA AJ760TM', 'SEDÁN', null, 'ZAIRA NATALIA MEJIA RINCON', 'ACTIVO', 'LECHERIA/BARCELONA', 2020, 'TOYOTA', 'COROLLA', 'GRIS', 'N/A', 'AJ760TM', null, '4CIL', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 500 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA TOYOTA LAND CRUISER 79 A38BL0R', 'PICK-UP D/C', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2026, 'TOYOTA', 'LAND CRUISER / 79 DC LX 4.0 MT', 'BLANCO', 'JTEBU71J4TB102953', 'A38BL0R', null, '1GRD035588', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 840 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA FORD BRONCO AB609OI', 'SUV', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2025, 'FORD', 'BAD LANDS / BRONCO', 'NEGRO', '1FMEE9BP2SLA55312', 'AB609OI', null, 'SLA55312', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 469 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA FORD RANGER RAPTOR A64AV7R', 'PICK-UP D/C', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, 2026, 'FORD', 'RAPTOR / RANGER', 'GRIS', 'MPBAR2F17TX734042', 'A64AV7R', null, 'DD2SSX734042', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 700 KGS · título SI · resguardo N/A · RCV SI'),
('CAMIONETA TOYOTA SEQUOIA AO403IB', 'SUV', null, 'RANCHO JHENZAEN C.A', 'ACTIVO', null, null, 'TOYOTA', 'SEQUOIA/TRD PRO HYBRID', 'NEGRO', '7SVAAABAXTX075772', 'AO403IB', null, '6 CIL', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 665 KGS · título SI · resguardo N/A · RCV FALTA · año Excel «226» (¿2026?) no cargado'),
('CAMIONETA TOYOTA HILUX A27AH8T', 'PICK-UP D/C', null, 'INDUSTRIAS JHENZAEN 2016 C.A', 'ACTIVO', 'EL TIGRE', 2012, 'TOYOTA', 'HILUX 4X4 M/T D / TGN26L-PRMDKL-B', 'AZUL', 'N/A', 'A27AH8T', null, '2TR7351141', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 885 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIÓN CHEVROLET NHR A96BD3F', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', 'FABRICA', 2009, 'CHEVROLET', 'NHR/NHR T/M F/H D/H', 'BLANCO', '8ZCFN01609V404055', 'A96BD3F', null, '663707', null, null, 'Excel flota 27/10/2026: tipo plataforma · capacidad 1820 KGS · título SI · resguardo N/A · RCV FALTA · ROCT FALTA'),
('CAMIÓN CHEVROLET NHR A96BD5F', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', 'FABRICA', 2012, 'CHEVROLET', 'NHR/ F/H T/M', 'BLANCO', 'N/A', 'A96BD5F', null, '209927', null, null, 'Excel flota 27/10/2026: tipo plataforma · capacidad 2065 KGS · título SI · resguardo N/A · RCV FALTA · ROCT FALTA'),
('CAMIÓN CHEVROLET NHR A59AR4A', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', 'FINCA', 2013, 'CHEVROLET', 'NHR / F/H T/M', 'BLANCO', 'N/A', 'A59AR4A', null, '279259', null, null, 'Excel flota 27/10/2026: tipo plataforma · capacidad 2065 KGS · título SI · resguardo N/A · RCV FALTA · ROCT SI'),
('AUTOMÓVIL TOYOTA COROLLA AJ059SA', 'SEDÁN', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', 'TACHIRA', 2007, 'TOYOTA', 'COROLLA 1.6L A/', 'BLANCO', '8XA53ZEC179513019', 'AJ059SA', null, '3ZZE489035', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 450 KGS · título SI · resguardo N/A · RCV FALTA · ROCT N/A'),
('CAMIONETA TOYOTA HILUX A06BK6F', 'PICK-UP D/C', null, 'MULTI TIENDA HOLIDAY, C.A', 'ACTIVO', 'TACHIRA', 2021, 'TOYOTA', 'HILUX', 'BLANCO', 'MR0KB8CD7M1211455', 'A06BK6F', null, '4 CILINDROS', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 900 KGS · título SI · resguardo SI · RCV FALTA · ROCT N/A'),
('REMOLQUE D INNOCENZO DM10 A97BE9P', 'REMOLQUE', null, 'ALFARERIA VENEZUELA, C.A', 'ACTIVO', null, 1974, 'D INNOCENZO', 'DM10', 'AMARILLO', '572', 'A97BE9P', null, 'N/P', null, null, 'Excel flota 27/10/2026: tipo low boy · capacidad 8000 KGS · título SI · resguardo SI · RCV FALTA · ROCT SI'),
('REMOLQUE D INNOCENZO DM-10A A50AI8N', 'REMOLQUE', null, 'TRANSP. CONST Y SERV. CARBER, C.A', 'ACTIVO', null, 2013, 'D INNOCENZO', 'DM-10A/WB', 'AMARILLO', '8X9LL173XDM001002', 'A50AI8N', null, 'S/M', null, null, 'Excel flota 27/10/2026: clase SEMI REMOLQUE · tipo low boy · capacidad 60000 KGS · título SI · resguardo SI · RCV FALTA · ROCT SI'),
('AUTOMÓVIL DODGE FORZA AI728AA', 'SEDÁN', null, 'ERIKA CAROLINA LOZADA MORA', 'ACTIVO', null, 2013, 'DODGE', 'DODGE FORZA LE', 'NEGRO', 'N/A', 'AI728AA', null, '4CIL', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 400 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CHUTO IVECO TRAKKER 720T42T A43AT7M', 'CHUTO', 'VEHÍCULOS DE CARGA', 'RANCHO JHENZAEN C.A', 'ACTIVO', null, 2011, 'IVECO', '720T42T/TRAKKER', 'BLANCO', '8XVS3TSS8BDPB1581', 'A43AT7M', null, 'F3BE0681*5031473*', null, null, 'Excel flota 27/10/2026: tipo chuto · capacidad 49770 KGS · título SI · resguardo FALTA · RCV SI · ROCT SI'),
('CAMIONETA JEEP GRAND CHEROKEE AE600KM', 'SUV', null, 'YNGRID DEL VALLE TABOR', 'ACTIVO', null, 2012, 'JEEP', 'GRAND CHEROKEE', 'NEGRO', 'N/A', 'AE600KM', null, '8 CIL', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 748 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('AUTOMÓVIL KIA RIO STYLUS AA254XO', 'SEDÁN', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2012, 'KIA', 'RIO STYLUS', 'AZUL', 'N/A', 'AA254XO', null, 'A5D400286', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 531 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('AUTOMÓVIL KIA RIO STYLUS AA365NO', 'SEDÁN', null, 'EDGARDO JOSE OBANDO AVILA', 'ACTIVO', null, 2010, 'KIA', 'RIO STYLUS', 'PLATA', '8LCDC2232AE014695', 'AA365NO', null, 'A5D386016', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 531 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('REMOLQUE REMYVECA 3SPL A09BH5F', 'REMOLQUE', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2015, 'REMYVECA', '3SPL', 'ROJO Y AZUL', '8X9P13032FM006050', 'A09BH5F', null, 'S/M', null, null, 'Excel flota 27/10/2026: clase SEMI REMOLQUE · tipo plataforma · capacidad 35000 KGS · título SI · resguardo FALTA · RCV SI · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER AC652OE', 'SUV', null, 'GUSTAVO ELIAS ROMERO GONZALEZ', 'ACTIVO', null, 2016, 'TOYOTA', 'LAND CRUISER', 'BLANCO', 'N/A', 'AC652OE', null, 'H108780', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 800 KGS · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA HILUX A91BC6M', 'PICK-UP D/C', null, 'INDUSTRIAS JHENZAEN 2016 C.A', 'ACTIVO', null, 2011, 'TOYOTA', 'HILUX 4X4 MTT D/TGN 26L-PRMDKLA-', 'GRIS', '8XA33NV26B9008348', 'A91BC6M', null, '2TR6905315', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 885 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA 4RUNNER AC719UB', 'SUV', null, 'JHONNY ELEAZAR DURAN CARDOZO', 'ACTIVO', null, 2015, 'TOYOTA', '4RUNNER', 'NEGRO', 'N/A', 'AC719UB', null, '6CIL', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 600 KGS · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER AG972JD', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2021, 'TOYOTA', 'LAND CRUISER', 'NEGRO', 'N/A', 'AG972JD', null, '8 CILINDROS', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 531 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER A98CC7K', 'PICK-UP D/C', null, 'ERIKA CAROLINA LOZADA MORA', 'ACTIVO', null, 2016, 'TOYOTA', 'LAND CRUISER', 'GRIS', 'N/A', 'A98CC7K', null, '6 CIL', null, null, 'Excel flota 27/10/2026: tipo pick-up D/C · capacidad 900 KGS · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER GRJ76 AI488BK', 'SUV', null, 'RENZON RAUL ESCALANTE ROSALES', 'ACTIVO', null, 2021, 'TOYOTA', 'LAND CRUISER GRJ76', 'GRIS', 'N/A', 'AI488BK', null, '1GRH282140', null, null, 'Excel flota 27/10/2026: clase CAMIONETA (MACHITO) · tipo sport wagon · capacidad 910 KGS · título SI · resguardo SI · RCV FALTA · ROCT N/A'),
('AUTOMÓVIL TOYOTA COROLLA AA275XF', 'SEDÁN', null, 'HECTOR YAVIER ROSALES RUJANO', 'ACTIVO', null, 2011, 'TOYOTA', 'COROLLA 1.6', 'VERDE', '8XBBA42E6B7813421', 'AA275XF', null, '1ZZB106939', null, null, 'Excel flota 27/10/2026: tipo sedan · capacidad 390 KGS · título SI'),
('CAMIONETA TOYOTA LAND CRUISER 79 A83BJ0P', 'PICK-UP D/C', null, 'JESUS ORLANDO JIMENEZ RODRIGIEZ', 'ACTIVO', null, 2024, 'TOYOTA', 'LAND CRUISER / 79 LX 4.0L MT', 'PLATA', 'N/A', 'A83BJ0P', null, '1GRH387543', null, null, 'Excel flota 27/10/2026: clase CAMIONETA (HEMBRITA) · tipo pick-up D/C · capacidad 840 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA 4RUNNER AH949XD', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2025, 'TOYOTA', '4RUNNER', 'NEGRO', 'N/A', 'AH949XD', null, '4 CILINDROS', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 760 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA 4RUNNER AB260WT', 'SUV', null, 'JESUS ORLANDO JIMENEZ RODRIGIEZ', 'ACTIVO', null, 2025, 'TOYOTA', '4RUNNER', 'BLANCO', 'N/A', 'AB260WT', null, '6 CILINDROS', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 1260 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LC PRADO AH130BD', 'SUV', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2024, 'TOYOTA', 'LC PRADO 4WD', 'NEGRO', 'N/A', 'AH130BD', null, 'T24A5A17846', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 760 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LC PRADO AK390KG', 'SUV', null, 'BETHANIA CHINQUINQUIRA BORGES BRAVO', 'ACTIVO', null, 2024, 'TOYOTA', 'LC PRADO 4WD', 'DORADO', 'JTEAACAJ5RK083581', 'AK390KG', null, 'T24A5A13045', null, null, 'Excel flota 27/10/2026: tipo sport wagon · capacidad 840 KGS · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA ENCAVA BJ6608 A0089AI', 'CAMIONETA', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', null, 2025, 'ENCAVA', 'BJ6608B1DDA-A2', 'BLANCO', 'N/A', 'A0089AI', null, '77645675', null, null, 'Excel flota 27/10/2026: tipo vans · capacidad 999 KGS · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA')
) v(equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas)
where not public.maq_flota_existe(v.placa, v.serial, v.equipo);
update public.maquinaria_equipos set notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: capacidad 45000 kg · título SI · resguardo N/A · obs: tipo Excel: Chasis; año Excel 2027 (base 2026)'), updated_at = now() where id = '92d9f002-d668-407d-b91b-74c68bf324b4';
update public.maquinaria_equipos set grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'VEHÍCULOS DE CARGA'), estado_operativo = coalesce(nullif(estado_operativo,''), 'operativa'), notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: capacidad 45000 kg · título SI · resguardo N/A'), updated_at = now() where id = '5301751e-03cc-4de8-a391-5126dec26fef';
update public.maquinaria_equipos set grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'VEHÍCULOS DE CARGA'), estado_operativo = coalesce(nullif(estado_operativo,''), 'operativa'), notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: capacidad 12840 kg · título SI · resguardo N/A'), updated_at = now() where id = '973c58cb-c9b1-405d-9c87-df3af3244cf8';
update public.maquinaria_equipos set serial = coalesce(nullif(serial,''), 'N/A'), estado_operativo = coalesce(nullif(estado_operativo,''), 'operativa'), notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: capacidad 1050 kg · título SI · resguardo N/A'), updated_at = now() where id = 'd39667c9-3f40-465b-80d4-fd2b1d27e21f';
update public.maquinaria_equipos set serial = coalesce(nullif(serial,''), 'N/A'), estado_operativo = coalesce(nullif(estado_operativo,''), 'operativa'), anio = coalesce(nullif(anio,0), 2026), notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: capacidad 1150 kg · título SI · resguardo N/A'), updated_at = now() where id = '9f0fcf5c-8639-4968-ae17-fe477b3267c7';
update public.maquinaria_equipos set notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: capacidad 1025 kg · título SI · resguardo FALTA · RCV FALTA · ROCT N/A'), updated_at = now() where id = '207ffe83-c5c9-45ee-964a-bd303c83601f';
insert into public.maquinaria_equipos (equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, activo, created_by)
select equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio::int, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, true, 'excel-flota-2026-10-27' from (values
('CAMIONETA TOYOTA SEQUOIA AB036DH', 'SUV', null, 'SAMUEL ELIAS ALCEDO MENDEZ', 'ACTIVO', null, 2024, 'TOYOTA', 'SEQUOIA', 'NARANJA', 'N/A', 'AB036DH', null, '6 CILINDROS', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 665 kg · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA ENCAVA EP-1000 A96BM3R', 'PICK-UP D/C', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', 'LA GUAIRA', 2026, 'ENCAVA', 'EP-1000', 'BLANCO', 'LVAV2MBB3TC964012', 'A96BM3R', null, '14413071', 'GASOIL', 'operativa', 'Excel flota 27/10/2026: capacidad 1025 kg · título SI · resguardo N/A · RCV SI · obs: placa en Excel «A96BM3R (3)»'),
('CAMIONETA TOYOTA HILUX A31AL5R', 'PICK-UP D/C', null, 'PEDRO CAMILO ZAMBRANO ROSAS', 'ACTIVO', null, 2015, 'TOYOTA', 'HILUX D/C V6 4./GGN25L-PRASKL-C', 'DORADO', 'N/A', 'A31AL5R', null, '1GRH061386', null, null, 'Excel flota 27/10/2026: capacidad 680 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA FOTON BJ2037Y3MDV-S A98BM4R', 'PICK-UP D/C', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', 'C.A. LOS PINOS', 2026, 'FOTON', 'BJ2037Y3MDV-S / 360362080', 'BLANCO', 'N/A', 'A98BM4R', null, '14413015', 'GASOIL', 'operativa', 'Excel flota 27/10/2026: capacidad 1025 kg · título SI · resguardo N/A'),
('CAMIÓN FOTON BJ1088 A91BR6F', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2026, 'FOTON', 'BJ1088VEJEA-F', 'BLANCO', 'LVBV4JBB2TY015834', 'A91BR6F', null, '14604206', 'GASOIL', null, 'Excel flota 27/10/2026: tipo Excel: plataforma · capacidad 5000 kg · título SI'),
('CAMIÓN FOTON BJ1088 A92BR4F', 'CAMIÓN CAVA', 'VEHÍCULOS DE CARGA', 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2026, 'FOTON', 'BJ1088VEJEA-F', 'BLANCO', 'LVBV4JBB4TY015835', 'A92BR4F', null, '14604205', 'GASOIL', null, 'Excel flota 27/10/2026: capacidad 5000 kg · título SI'),
('CAMIÓN FOTON BJ1088 A91BR9F', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, 2026, 'FOTON', 'BJ1088VEJEA-F', 'BLANCO', 'LVBV4JBB4TY015883', 'A91BR9F', null, '14603642', 'GASOIL', null, 'Excel flota 27/10/2026: tipo Excel: Grúa · capacidad 5000 kg · título SI'),
('AUTOMÓVIL TOYOTA COROLLA CROSS AM985VA', 'SUV', null, 'MARIA BRIGIDA MORA DE LOZADA', 'ACTIVO', null, 2025, 'TOYOTA', 'COROLLA CROSS', 'BLANCO', 'LFMCC1BR0S0949912', 'AM985VA', null, 'GE83283', null, null, 'Excel flota 27/10/2026: tipo Excel: CROSSOVER · capacidad 505 kg · título SI · resguardo N/A'),
('CAMIONETA TOYOTA LAND CRUISER 76 AP828HB', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2026, 'TOYOTA', 'LAND CRUISER / 76 LX 4.0 5MT', 'PLATA', 'JTEEU71J3TF009122', 'AP828HB', null, '1GRD060867', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 915 kg · título SI · resguardo N/A'),
('CAMIONETA TOYOTA COASTER AE561DR', 'AUTOBÚS', null, 'GRUPO INMOBILIARIA ALONDRA', 'ACTIVO', null, 2025, 'TOYOTA', 'COASTER / DLX 2.7L', 'BLANCO', 'JTGCKCB88S6520364', 'AE561DR', null, '2TR2737721', null, null, 'Excel flota 27/10/2026: tipo Excel: SUPERVAN · capacidad 2300 kg · título SI · resguardo N/A · obs: las filas 65 (sin placa, título NO, resguardo SI) y 81 (placa N/A, capacidad 2935 kg) repiten el serial'),
('CAMIONETA FORD RANGER RAPTOR A62AC1X', 'PICK-UP D/C', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2026, 'FORD', 'RAPTOR/RANGER', 'GRIS', 'MPBAR2F19TX748962', 'A62AC1X', null, 'DD2STX748962', null, null, 'Excel flota 27/10/2026: capacidad 700 kg · título SI · resguardo N/A'),
('CAMIONETA FORD RANGER RAPTOR A48AX6R', 'PICK-UP D/C', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2026, 'FORD', 'RAPTOR / RANGER', 'NEGRO', 'MPBAR2F17TX735790', 'A48AX6R', null, 'DD2SSX735790', null, null, 'Excel flota 27/10/2026: capacidad 700 kg · título SI · resguardo N/A'),
('AUTOMÓVIL TOYOTA COROLLA CROSS AP920HB', 'SUV', null, 'JOSE GREGORIO TORRES LOZADA', 'ACTIVO', null, 2025, 'TOYOTA', 'COROLLA CROSS / 2,0L ELITE', 'PLATA', 'LFMCC1BR0S0951479', 'AP920HB', null, 'GE85189', null, null, 'Excel flota 27/10/2026: tipo Excel: CROSSOVER · capacidad 505 kg · título SI · resguardo N/A · obs: modelo en Excel «COROLLA CROSSS»'),
('AUTOMÓVIL TOYOTA COROLLA CROSS AP909IB', 'SUV', null, 'NELSON HUMBERTO SALAS VALOR', 'ACTIVO', null, 2025, 'TOYOTA', 'COROLLA CROSS / 2,0L ELITE', 'BLANCO', 'LFMCC1BR5S0948674', 'AP909IB', null, 'GE62367', null, null, 'Excel flota 27/10/2026: tipo Excel: CROSSOVER · capacidad 505 kg · título SI · resguardo N/A · obs: modelo en Excel «COROLLA CROSSS»; la fila 73 repite placa y serial con motor GE72600 y color NEGRO'),
('CAMIÓN ENCAVA ET-8 A94EE8P', 'CHASIS', 'VEHÍCULOS DE CARGA', 'MINERAL GROUP GUAYANA', 'ACTIVO', null, 2025, 'ENCAVA', 'ET-8 / PTCM0000005', 'BLANCO', '8Y78EEDL5SG000004', 'A94EE8P', null, '77320762', null, null, 'Excel flota 27/10/2026: tipo Excel: CHASIS CABINA · capacidad 8100 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA DONGFENG ZNA AI2BZ7M', 'PICK-UP D/C', null, 'ORLANDO SIMÓN MOLINA CHACON', 'ACTIVO', null, 2013, 'DONGFENG', 'ZNA / DOBLE CABINA4X4', 'BLANCO', '8XSTGUBK1DG000998', 'AI2BZ7M', null, '446372', null, null, 'Excel flota 27/10/2026: capacidad 875 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA COROLLA CROSS AB428NT', 'SUV', null, 'JOSE GREGORIO TORRES LOZADA', 'ACTIVO', null, 2023, 'TOYOTA', 'COROLLA / CROSS', 'BLANCO', '9BRK4AAGXP0077170', 'AB428NT', null, 'M20AAC14261', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 700 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA LEXUS LX 600 AB215HH', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2024, 'LEXUS', 'LX 600', 'NEGRO', 'JTJLBACX7R4042870', 'AB215HH', null, '6 CIL', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 560 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER 79 A83BL9R', 'PICK-UP D/C', null, 'GUSTAVO ELIAS ROMERO GONZALEZ', 'ACTIVO', null, 2026, 'TOYOTA', 'LAND CRUISER / 79 DC LX 4.0 MT', 'BLANCO', 'JTEBU71J9TB101944', 'A83BL9R', null, '1GRD028262', null, null, 'Excel flota 27/10/2026: capacidad 840 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER 79 A82BL5R', 'PICK-UP D/C', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2026, 'TOYOTA', 'LAND CRUISER / 79 DC LX 4.0 MT', 'GRIS', 'JTEBU71J1TB101436', 'A82BL5R', null, '1GRD007707', null, null, 'Excel flota 27/10/2026: capacidad 840 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA YARIS CROSS AO969HA', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2026, 'TOYOTA', 'YARIS CROSS / G 1.5 CVT', 'PLATA', 'MHFAA8AF6T0064281', 'AO969HA', null, '2NRY526736', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 435 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA FORD EXPLORER AE272XM', 'SUV', null, 'ALBERKIS ANDREINA CARREÑO HERNANDEZ', 'ACTIVO', null, 2013, 'FORD', 'EXPLORER/EXPLORER', 'BLANCO', 'N/A', 'AE272XM', null, 'DA09305', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 598 kg · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA LAND CRUISER AA289BM', 'SUV', null, 'RENTA AUTO 2000 C.A', 'ACTIVO', null, 2018, 'TOYOTA', 'LAND CRUISER', 'BLANCO', 'N/A', 'AA289BM', null, '1UR0697115', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 900 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA FORTUNER AE562PV', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2013, 'TOYOTA', 'FORTUNER 4.0L 4 /GGN50L-NKASKL-B', 'NEGRO', 'N/A', 'AE562PV', null, '1GRA769276', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 605 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA 4 RUNNER AM009SA', 'SUV', null, 'DUNAMOTORS', 'ACTIVO', null, 2018, 'TOYOTA', '4 RUNNER', 'NEGRO', 'JTEBU5JR9J5491840', 'AM009SA', null, '6 CIL', null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 500 kg · título SI · resguardo SI · RCV FALTA · ROCT FALTA'),
('CAMIONETA TOYOTA 4 RUNNER AM569SA', 'SUV', null, 'YANET NASSER', 'ACTIVO', null, 2018, 'TOYOTA', '4 RUNNER', 'NEGRO', 'JTEBU5JR7J5500227', 'AM569SA', null, null, null, null, 'Excel flota 27/10/2026: tipo Excel: sport wagon · capacidad 760 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA · obs: Excel trae modelo «5 RUNNER» y motor «7 CIL» (probable arrastre de celda); se carga como 4 RUNNER'),
('AUTOMÓVIL TOYOTA COROLLA AG987VG', 'SEDÁN', null, 'ERIKA CAROLINA LOZADA MORA', 'ACTIVO', null, 2007, 'TOYOTA', 'COROLLA 1.8 A/T', 'ROJO', '8XA53ZEC279513074', 'AG987VG', null, '00R3971ZZ', null, null, 'Excel flota 27/10/2026: tipo Excel: sedan · capacidad 400 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIÓN CHEVROLET NHR A81AU3A', 'CAMIÓN', 'VEHÍCULOS DE CARGA', 'ZAIRA NATALIA MEJIA RINCON', 'ACTIVO', null, 2012, 'CHEVROLET', 'NHR/F/H/T/M', 'BLANCO', '8ZCWRNA64CG401754', 'A81AU3A', null, '169698', null, null, 'Excel flota 27/10/2026: tipo Excel: plataforma · capacidad 2065 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('AUTOMÓVIL CHERY ORINOCO AE166PK', 'SEDÁN', null, 'NAHARA SARAY FERNANDEZ CONTRERAS', 'ACTIVO', null, 2017, 'CHERY', 'ORINOCO', 'BLANCO', '8X7T1C129HDO24092', 'AE166PK', null, 'SQR481FCFFHD01745', null, null, 'Excel flota 27/10/2026: tipo Excel: sedan · capacidad 375 kg · título SI · resguardo FALTA · RCV FALTA · ROCT FALTA'),
('CAMIONETA FORD F-150 A69CO9D', 'PICK-UP D/C', null, 'GUSTAVO ELIAS ROMERO GONZALEZ', 'ACTIVO', null, 2007, 'FORD', 'F.150 4.6L AUT', 'BLANCO', '3FTRF17W97MA29400', 'A69CO9D', null, '7MA29400', null, null, 'Excel flota 27/10/2026: CARPETA 7 · obs: la fila 95 (placa 18JVAZ, propietario Ricardo Mejia Rojas) repite el serial'),
('CAMIONETA MAZDA BT-50 A26CV1A', 'PICK-UP D/C', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2013, 'MAZDA', 'BT-50 2.6L 4X4 / BT-50', 'GRIS', 'N/A', 'A26CV1A', null, 'G6411133', null, null, 'Excel flota 27/10/2026: VARIOS'),
('CAMIONETA TOYOTA 4RUNNER AA368AS', 'SUV', null, 'JESUS MIGUEL PIÑANGO NIOCHET', 'ACTIVO', null, 2007, 'TOYOTA', '4RUNNER LTD V6', 'BLANCO', 'JTEBU17R078093875', 'AA368AS', null, '1GR5411566', null, null, 'Excel flota 27/10/2026: VARIOS · tipo Excel: sport wagon'),
('CAMIONETA TOYOTA TUNDRA AG559NM', 'PICK-UP D/C', null, 'JEAN CARLOS TORRES MOLERO', 'ACTIVO', null, 2015, 'TOYOTA', 'TUNDRA', 'BLANCO', 'N/A', 'AG559NM', null, '3UR5943499', null, null, 'Excel flota 27/10/2026: VARIOS'),
('CAMIÓN CHEVROLET NHR A40BV6D', 'CHASIS', 'VEHÍCULOS DE CARGA', 'ZAIRA NATALIA MEJIA RINCON', 'ACTIVO', null, 2013, 'CHEVROLET', 'NHR/F/H/T/M', null, 'N/A', 'A40BV6D', null, '347435', null, null, 'Excel flota 27/10/2026: VEH-110 · obs: color en Excel «CARGA» (no es un color)'),
('CAMIONETA TOYOTA HILUX A99BZ1M', 'PICK-UP D/C', null, 'REINALDO JOSE BOGARIN GONZALEZ', 'ACTIVO', null, 2017, 'TOYOTA', 'HILUX D/C V6 4 / GGN25L-PRASKL-C', 'BLANCO', 'N/A', 'A99BZ1M', null, '1GRH169686', null, null, 'Excel flota 27/10/2026: VEH-114'),
('AUTOMÓVIL TOYOTA CAMRY AA341EB', 'SEDÁN', null, 'JOSE LUIS GUTIERREZ SILVA', 'ACTIVO', null, 2008, 'TOYOTA', 'CAMRY V6/GSV40L-AETGKW', 'PLATA', 'JTNBK40KX83034920', 'AA341EB', null, '2GR0456030', null, null, 'Excel flota 27/10/2026: VEH-115 · tipo Excel: sedan'),
('AUTOMÓVIL CHERY ORINOCO AB905FC', 'SEDÁN', null, 'JOSSEN ERVIN MORA ROA', 'ACTIVO', null, 2014, 'CHERY', 'ORINOCO', 'PLATA', 'N/A', 'AB905FC', null, 'SQR481FCFFEH08656', null, null, 'Excel flota 27/10/2026: VEH-116 · tipo Excel: sedan'),
('CAMIONETA TOYOTA LAND CRUISER AM040SA', 'SUV', null, 'RACELIS MARIA CARVAJAL ZAMBRANO', 'ACTIVO', null, 2018, 'TOYOTA', 'LAND CRUISER', 'BLANCO', 'N/A', 'AM040SA', null, '6 CIL', null, null, 'Excel flota 27/10/2026: VEH-118 · tipo Excel: sport wagon'),
('CAMIONETA TOYOTA LAND CRUISER AC895XE', 'SUV', null, 'CARLOS JOSE ORTA', 'ACTIVO', null, 2018, 'TOYOTA', 'LAND CRUISER', 'BLANCO', 'N/A', 'AC895XE', null, '1GRH185215', null, null, 'Excel flota 27/10/2026: VEH-119 · tipo Excel: sport wagon'),
('CAMIONETA TOYOTA FORTUNER AA992UF', 'SUV', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2010, 'TOYOTA', 'FORTUNER 4.0L 4 /GGN50L-NKASKL-C', 'BLANCO', '8XA11ZV50A6002644', 'AA992UF', null, '1GR0962321', null, null, 'Excel flota 27/10/2026: VEH-057 · tipo Excel: sport wagon')
) v(equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas)
where not public.maq_flota_existe(v.placa, v.serial, v.equipo);
update public.maquinaria_equipos set
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  updated_at = now()
where id = '05c6ac36-ccf6-4063-82f2-52db13e6a1f3';
update public.maquinaria_equipos set
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  updated_at = now()
where id = '03859339-c575-4a1f-bde5-93042a53f4a8';
update public.maquinaria_equipos set
  motor_serial = coalesce(nullif(motor_serial,''), 'YD51130*B001162S'),
  updated_at = now()
where id = '36685831-e252-49c6-b573-ad0c49c1cb1b';
update public.maquinaria_equipos set
  modelo = coalesce(nullif(modelo,''), 'S530'),
  color = coalesce(nullif(color,''), 'BLANCO / NEGRO / NARANJA'),
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  updated_at = now()
where id = '0a3d04d6-1174-44c4-ab17-8b5f76a7d91e';
update public.maquinaria_equipos set
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  ubicacion = coalesce(nullif(ubicacion,''), 'FINCA'),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: cód. 17 · clase APARATO APTO · capacidad 4500 · título SI · resguardo FALTA · RCV FALTA · ROCT N/A'),
  updated_at = now()
where id = '29997efe-7a5f-47d7-ab8e-e556dac4a035';
update public.maquinaria_equipos set
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  ubicacion = coalesce(nullif(ubicacion,''), 'FINCA'),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: cód. 18 · clase APARATO APTO · capacidad 4500 · título SI · resguardo FALTA · RCV FALTA · ROCT N/A'),
  updated_at = now()
where id = '85c4d334-e149-4aea-8eae-ce06c9714b29';
update public.maquinaria_equipos set
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  ubicacion = coalesce(nullif(ubicacion,''), 'FINCA'),
  placa = coalesce(nullif(placa,''), 'N/A'),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: cód. 19 · clase MAQUINARIA · capacidad 13600 · título SI · resguardo FALTA · RCV FALTA · ROCT N/A'),
  updated_at = now()
where id = '85fd15ae-5a42-436e-a0b3-97d9938bb869';
update public.maquinaria_equipos set
  grupo_mantenimiento = coalesce(nullif(grupo_mantenimiento,''), 'FLOTA PESADA'),
  propietario = coalesce(nullif(propietario,''), 'RANCHO JHENZAEN C.A'),
  anio = coalesce(nullif(anio,0), 2006),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: cód. 20 · clase APARATO APTO · capacidad 4500 · título SI · resguardo FALTA · RCV FALTA · ROCT N/A · obs: el Excel registra color ROJO y ubicación FINCA'),
  updated_at = now()
where id = 'd4f9333d-335e-4720-a434-bead203409dc';
update public.maquinaria_equipos set
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: cód. 21 · clase PLANTA ELECTRICA · marca Excel MECC ALTE · serial Excel «1761324 300 KVA» · últ. mant. Sin registro · obs: SOLO TIENE FACTURA'),
  updated_at = now()
where id = '2fdce526-33a6-4406-a78f-2a443c987ffa';
update public.maquinaria_equipos set
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: cód. 22 · equipo pesado · clase CAMION ARTICULADO · últ. mant. Sin registro · obs: SOLO TIENE FACTURA'),
  updated_at = now()
where id = 'eafbb1b5-77db-4238-b6e7-cfb9b9d5f596';
insert into public.maquinaria_equipos (equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, activo, created_by)
select equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio::int, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, true, 'excel-flota-2026-10-27' from (values
('LANCHA SKYY · LEGACY 36 GEN X', 'LANCHA', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2006, 'LEGACY', '36 GEN X', 'BLANCO CON AZUL', 'YYD-12.846', 'AGSP-RE-1.979', 'MERCURY ME300 HP XL VERADO', '1B939515 / 1B966411', 'GASOLINA', null, 'Excel flota 27/10/2026: cód. 1 · lancha a motor · matrícula vieja AGSMD2577 · registro 13/02/2026 · UAB 7.15 · UAN 1.79 · compra-venta SI · expediente digital SI'),
('LANCHA AQUALIRO · PROMARINE OPEN 27', 'LANCHA', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, 2011, 'PROMARINE', 'OPEN 27', null, 'YYD 17.827', 'ARSK-RE-0173', 'MERCURY de 225 OPTIMAX', '1B867975 / 1B882449', 'GASOLINA', null, 'Excel flota 27/10/2026: cód. 2 · buque a motor · nombre anterior LAS 7 LEGUAS · matrícula vieja N/A · registro 02/02/2026 · UAB 46179 (valor dudoso en el Excel) · UAN 3.33 · certificado de matriculación ASRK-RE-0173 · compra-venta SI · expediente digital SI'),
('REMOLQUE REMEQ 2160222', 'REMOLQUE', null, 'JHENDERSON LOZADA', 'ACTIVO', null, 2025, 'REMEQ', 'REMEQ', null, '2REA2S8A7S2160222', null, null, null, null, null, 'Excel flota 27/10/2026: cód. 6 · tipo TRAYLER · sin placa'),
('REMOLQUE REMEQ 2160221', 'REMOLQUE', null, 'JESUS LOZADA', 'ACTIVO', null, 2025, 'REMEQ', 'REMEQ', null, '2REA2S8A5S2160221', null, null, null, null, null, 'Excel flota 27/10/2026: cód. 7 · tipo TRAYLER · sin placa · (hoja MOTO fila 32: remolque SEA-DOO BRP, color PLATA, título NO · resguardo SI · RCV FALTA)'),
('REMOLQUE REMEQ 2160224', 'REMOLQUE', null, 'ELIANETTE MATA', 'ACTIVO', null, 2025, 'REMEQ', 'REMEQ', null, '2REA2S8A0S2160224', null, null, null, null, null, 'Excel flota 27/10/2026: cód. 8 · tipo TRAYLER · sin placa')
) v(equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas)
where not public.maq_flota_existe(v.placa, v.serial, v.equipo);
update public.maquinaria_equipos set
  tipo = coalesce(nullif(tipo,''), 'MOTO'),
  ubicacion = coalesce(nullif(ubicacion,''), 'C.A. LOS PINOS'),
  anio = coalesce(nullif(anio,0), 2026),
  modelo = coalesce(nullif(modelo,''), 'HORSE 150'),
  color = coalesce(nullif(color,''), 'NEGRO'),
  serial = coalesce(nullif(serial,''), '8Z53AAAK8TM013838'),
  motor_serial = coalesce(nullif(motor_serial,''), 'KW162FMJ*H5M84918*'),
  notas = coalesce(nullif(notas,''), 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA · obs: el Excel registra marca EMPIREKEEWAY, propietario Golden Touch 1127 y ubicación LOS PINOS'),
  updated_at = now()
where id = '7e3dfac4-1d2c-4d42-b70d-6c8cd80354b8';
insert into public.maquinaria_equipos (equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, activo, created_by)
select equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio::int, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas, true, 'excel-flota-2026-10-27' from (values
('MOTO BERA BR150-2 AI9H01M', 'MOTO', null, 'MANUEL JOSE PALMA', 'ACTIVO', 'UPATA', 2016, 'BERA', 'BR150-2', 'NEGRO', '8211MBCA7GD001417', 'AI9H01M', null, 'SK162FMJ1500307173', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo paseo · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO BERA BR150-2 AI9H03M', 'MOTO', null, 'ORLANDO SIMÓN MOLINA CHACON', 'ACTIVO', 'TACHIRA', 2016, 'BERA', 'BR150-2/21', 'NEGRO', '8211MBCA9GD001211', 'AI9H03M', null, 'SK162FMJ1500306105', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo paseo · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO MD AGUILA AD1Y51V', 'MOTO', null, 'RANCHO JHENZAEN C.A', 'ACTIVO', 'RANCHO JHENZAEN', 2012, 'MD', 'AGUILA / UNICA', 'NEGRO', '813SMECA4CV004435', 'AD1Y51V', null, 'HJ162FMJ120444773', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO KEEWAY HORSE 150 AG4D28E', 'MOTO', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', 'LOS ANGELES', 2023, 'KEEWAY', 'HORSE 150', 'ROJO', '8123AAK16PM261877', 'AG4D28E', null, 'KW162FMJ*H5M13215*', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO KEEWAY HORSE 150 AC0155E', 'MOTO', null, 'ORLANDO SIMÓN MOLINA CHACON', 'ACTIVO', 'LECHERIA', 2023, 'KEEWAY', 'HORSE 150', 'NEGRO', '3123AAK10PM193558', 'AC0155E', null, 'KW162FMJ1SW039784', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA · obs: el serial del Excel empieza por 3123 (las demás Keeway empiezan por 8123), verificar'),
('MOTO KEEWAY HORSE 150 AC5G00E', 'MOTO', null, 'GERLITA VANESSA ESTEVES MORENO', 'ACTIVO', 'PIJIGUAOS', 2023, 'KEEWAY', 'HORSE 150', 'NEGRO', '8123AAK10PM193916', 'AC5G00E', null, 'KW162FMJ*SW039250*', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO KEEWAY HORSE 150 AB2P82F', 'MOTO', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', 'C.A. LA ESPERANZA', 2024, 'KEEWAY', 'HORSE 150', 'NEGRO', '8123AAK15RM386954', 'AB2P82F', null, 'KW162FMJ*H5M43149*', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO KEEWAY HORSE 150 AM3E33G', 'MOTO', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', 'C.A. LOS PINOS', 2024, 'KEEWAY', 'HORSE 150', 'NEGRO', '8123AAK3XRM391097', 'AM3E33G', null, 'QJ162FMJ-B14108406', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo MOTOCICLETA · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO BERA BR200-CARGUERO AP6A50D', 'MOTO', null, 'MINERAL GROUP GUAYANA', 'ACTIVO', 'GALPON', 2024, 'BERA', 'BR200-CARGUERO / 22', 'NEGRO', '821ZVUEC8RD001519', 'AP6A50D', null, 'ZS163ML8R0S5102', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo enduro · capacidad 500 Kg · título SI · resguardo N/A · RCV FALTA'),
('MOTO BERA BR150 KAVAK AN4P87J', 'MOTO', null, 'GOLDEN TOUCH 1127', 'ACTIVO', 'C.A. LOS PINOS', 2026, 'BERA', 'BR150 KAVAK', 'ROJO', '8YZLMECA3TD013194', 'AN4P87J', null, '8YZLMECA3TD013194', 'GASOLINA', null, 'Excel flota 27/10/2026: tipo enduro · capacidad 150 Kg · título SI · resguardo N/A · RCV FALTA · obs: el Excel trae el mismo valor como serial de carrocería y de motor'),
('MOTO CFMOTO CF1000SZ-3L 4288', 'MOTO', null, null, 'ACTIVO', null, 2026, 'CFMOTO', 'CF1000SZ-3L', 'BEIGE', 'LCELV1ZU5R6004288', 'N/A', null, '2V91Y-D RE288201', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (UTV) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFMOTO1»; sin propietario en Excel'),
('MOTO CFMOTO CF1000SZ-3L 4284', 'MOTO', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, null, 'CFMOTO', 'CF1000SZ-3L', 'NEGRO', 'LCELV1ZU8R6004284', 'N/A', null, '2V91Y-D RE288194', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (UTV) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFZ951»'),
('MOTO CFMOTO CF1000SZ-3L 4283', 'MOTO', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, null, 'CFMOTO', 'CF1000SZ-3L', 'NEGRO', 'LCELV1ZU6R6004283', 'N/A', null, '2V91Y-D RE288187', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (UTV) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFZ951»'),
('MOTO CFMOTO CF1000SZ-3L 4279', 'MOTO', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, null, 'CFMOTO', 'CF1000SZ-3L', 'NEGRO', 'LCELV1ZU4R6004279', 'N/A', null, '2V91Y-D RE288168', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (UTV) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFZ951»'),
('MOTO CFMOTO CF1000SZ-3L 2318', 'MOTO', null, null, 'ACTIVO', null, null, 'CFMOTO', 'CF1000SZ-3L', 'NEGRO', 'LCELV1ZU0R6002318', 'N/A', null, '2V91Y-D RM078076', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (UTV) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFZ951»; sin propietario en Excel'),
('MOTO CFMOTO CF-FORCE 110 0613', 'MOTO', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, null, 'CFMOTO', 'CF-FORCE 110', 'AZUL', 'LCELBHL25S6000613', 'N/A', null, '1P52YH-2 SA070429', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (ATV / cuatrimoto) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFORCEAY»'),
('MOTO CFMOTO CF-FORCE 110 0615', 'MOTO', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, null, 'CFMOTO', 'CF-FORCE 110', 'AZUL', 'LCELBHL29S6000615', 'N/A', null, '1P52YH-2 SA070425', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (ATV / cuatrimoto) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «CFORCEAY»'),
('MOTO ATV QUAD 125CC CH-22', 'MOTO', null, 'MAHER ANTONIO HOUDA FIDDA', 'ACTIVO', null, null, null, 'ATV QUAD 125CC', 'ROJO', 'CH-22', 'N/A', null, '154FMI25083526', 'GASOLINA', null, 'Excel flota 27/10/2026: grupo CF - FORZE (ATV / cuatrimoto) · título NO · resguardo FALTA · RCV FALTA · obs: marca en Excel «MOTO» (no es una marca); serial de carrocería «CH-22» parece un código interno'),
('MOTO CAN AM MAVERICK X3 MAX XRC TURBO-1000 1003', 'MOTO', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, 2026, 'CAN AM', 'MAVERICK X3 MAX XRC TURBO-1000', 'VERDE', '3JB8UAU48TE001003', 'N/A', null, '3 CIL', 'GASOLINA', 'operativa', 'Excel flota 27/10/2026: tipo Ruv (UTV) · capacidad 360 Kg · título SI · resguardo SI · RCV FALTA'),
('MOTO CAN AM MAVERICK X3 MAX XRC TURBO-1000 0946', 'MOTO', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2026, 'CAN AM', 'MAVERICK X3 MAX XRC TURBO-1000', 'VERDE', '3JB8UAU42TE000946', 'N/A', null, '3 CIL', 'GASOLINA', 'operativa', 'Excel flota 27/10/2026: tipo Ruv (UTV) · capacidad 360 Kg · título SI · resguardo FALTA · RCV FALTA'),
('MOTO CAN AM MAVERICK X3 MAX XRC TURBO-1000 0930', 'MOTO', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2026, 'CAN AM', 'MAVERICK X3 MAX XRC TURBO-1000', 'VERDE', '3JB8UAU49TE000930', 'N/A', null, '3 CIL', 'GASOLINA', 'operativa', 'Excel flota 27/10/2026: tipo Ruv (UTV) · capacidad 360 Kg · título SI · resguardo FALTA · RCV FALTA'),
('MOTO ACUÁTICA SEA-DOO GTX LIMITED 325', 'MOTO ACUÁTICA', null, 'ENDERSON ENRIQUE LOZADA MORA', 'ACTIVO', null, 2026, 'SEA-DOO', 'GTX LIMITED 325', 'TEAL METALLIC', null, null, null, null, 'GASOLINA', null, 'Excel flota 27/10/2026: grupo SEE DOO (moto acuática) · título NO · resguardo FALTA · RCV FALTA · obs: sin placa ni serial en el Excel'),
('MOTO ACUÁTICA SEA-DOO RXT-XTM (1)', 'MOTO ACUÁTICA', null, 'JESUS ENRIQUE LOZADA', 'ACTIVO', null, 2026, 'SEA-DOO', 'RXT-XTM', 'GULFSTREAM BLUE PREMIUM', null, null, null, null, 'GASOLINA', null, 'Excel flota 27/10/2026: grupo SEE DOO (moto acuática) · título NO · resguardo FALTA · RCV FALTA · obs: sin placa ni serial en el Excel; modelo en Excel «MODELO RXT-XTM»'),
('MOTO ACUÁTICA SEA-DOO RXT-XTM (2)', 'MOTO ACUÁTICA', null, 'JHENDERSON ENRIQUE LOZADA MEJIA', 'ACTIVO', null, 2026, 'SEA-DOO', 'RXT-XTM', 'GULFSTREAM BLUE PREMIUM', null, null, null, null, 'GASOLINA', null, 'Excel flota 27/10/2026: grupo SEE DOO (moto acuática) · título NO · resguardo FALTA · RCV FALTA · obs: sin placa ni serial en el Excel; modelo en Excel «MODELO RXT-XTM»'),
('MOTO ACUÁTICA SEA-DOO PREMIUM GTX LIMITED', 'MOTO ACUÁTICA', null, 'ELIANETTE MATA', 'ACTIVO', null, 2026, 'SEA-DOO', 'PREMIUM GTX LIMITED', 'WHITE PEARL', null, null, null, null, 'GASOLINA', null, 'Excel flota 27/10/2026: grupo SEE DOO (moto acuática) · título NO · resguardo FALTA · RCV FALTA · obs: sin placa ni serial en el Excel')
) v(equipo, tipo, grupo_mantenimiento, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa, motor_modelo, motor_serial, combustible, estado_operativo, notas)
where not public.maq_flota_existe(v.placa, v.serial, v.equipo);
select (select count(*) from public.maquinaria_equipos) total, (select count(*) from public.maquinaria_equipos where created_by='excel-flota-2026-10-27') nuevos, (select count(*) from public.maquinaria_equipos where updated_at > (select max(respaldado_en) from public._bkp_maq_excel_flota_20261027) and created_by is distinct from 'excel-flota-2026-10-27') actualizados;
