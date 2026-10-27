-- =====================================================================
-- 2026-10-27 · Maquinaria: recuperar equipos borrados y equipos con
-- historial de Combustible (surtidos / horómetro) sin ficha
-- =====================================================================
-- Proyecto Supabase: rroohciwhpfonklxuoev (Golden Touch 1127 C.A.)
-- Aplicado el 27/10/2026 vía MCP (execute_sql), sentencia por sentencia.
--
-- Contexto
-- --------
-- * Hoy 27/10/2026 usuarios borraron 5 fichas de `maquinaria_equipos`
--   (auditoria_eventos): 17:21 CHRISTOPHER → MOTOSIERRA STIHL M5 382;
--   ADMINISTRADOR → PE CYV510 (18:33), PLANTA ELECTRICA MECC ECO 38-1 LN/4
--   (18:46), GE TOYAMA (18:58), GE YAMAGRO YG7500DCE (19:01).
--   Las 5 están completas en el respaldo `_bkp_maq_excel_flota_20261027`
--   (misma estructura, sin la columna nueva `clase`).
-- * El 26/10 20:07 KAREANNYS borró "CAMION ARTICULADO VOLVO (483)" y "(484)"
--   (ids 8acf0c78-… y 82b03665-…): eran duplicados creados por ella misma
--   25 minutos antes (19:42 / 19:44) de los VOLVO A35F 483 / 484 originales
--   (1cf132b5-… y 321c9882-…), que siguen vivos con sus 3 documentos cada
--   uno en storage y su bitácora. No había filas hijas que trasladar.
-- * Respaldo completo del 23/10/2026 (tablas maquinaria_*): los 39 equipos
--   de esa fecha existen hoy salvo los 5 borrados hoy (todos en el _bkp de
--   hoy, que es más nuevo). Las 30 filas de maquinaria_documentos, 16 de
--   estado_eventos, 1 lectura y 3 mantenimientos del 23/10 siguen hoy
--   intactas. Las 2 órdenes de servicio (OS-2026-0001 "PRUEBA" y
--   OS-2026-0002) y su foto fueron borradas a propósito por ADMINISTRADOR el
--   26/10 (17:50 y 19:10) junto con otras OS de prueba: NO se restauran.
-- * Ninguna de las 5 fichas borradas hoy tenía documentos/fotos en
--   `storage.objects` (buckets maquinaria-documentos / maquinaria-os-fotos)
--   ni filas hijas en el respaldo del 23/10, así que no se perdió nada por
--   cascada y no hay adjuntos que recuperar.
-- * Las fichas relacionadas con la planta Perkins / Olympian (GEP 550) NO se
--   tocan: las maneja otro agente.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1) Restaurar 4 de las 5 fichas borradas hoy, con el MISMO id, desde el
--    respaldo de esta mañana. `clase` = 'herramienta' para la motosierra
--    (apartado Herramientas) y NULL para el resto (la UI la deduce del tipo).
--    NO se restaura PLANTA ELECTRICA MECC ECO 38-1 LN/4 (ver punto 2).
--    El trigger BEFORE INSERT `maquinaria_vincular_combustible_auto` rellena
--    combustible_equipo si viniera vacío (en el respaldo ya viene lleno).
-- =====================================================================
insert into public.maquinaria_equipos (
  id, equipo, tipo, propietario, status, ubicacion, anio, marca, modelo, color, serial, placa,
  motor_modelo, motor_serial, combustible, litros_consume, ficha_tecnica, ficha_mantenimiento,
  documentacion, mantenimiento_cada_hrs, combustible_equipo, doc_fisico, ficha_mantt, doc_drive,
  esp_tecnicas, revision_mina, notas, activo, created_by, created_at, updated_at,
  grupo_mantenimiento, mantenimiento_cada_km, mantenimiento_base_hrs, mantenimiento_base_km,
  estado_operativo, estado_nota, estado_desde, clase)
select
  b.id, b.equipo, b.tipo, b.propietario, b.status, b.ubicacion, b.anio, b.marca, b.modelo, b.color, b.serial, b.placa,
  b.motor_modelo, b.motor_serial, b.combustible, b.litros_consume, b.ficha_tecnica, b.ficha_mantenimiento,
  b.documentacion, b.mantenimiento_cada_hrs, b.combustible_equipo, b.doc_fisico, b.ficha_mantt, b.doc_drive,
  b.esp_tecnicas, b.revision_mina,
  concat_ws(' · ', nullif(btrim(coalesce(b.notas, '')), ''),
            'Restaurado 27/10/2026 desde el respaldo de la mañana (había sido borrado ese mismo día)'),
  true, b.created_by, b.created_at, now(),
  b.grupo_mantenimiento, b.mantenimiento_cada_km, b.mantenimiento_base_hrs, b.mantenimiento_base_km,
  b.estado_operativo, b.estado_nota, b.estado_desde,
  case when b.id = '718188c6-c3ee-452d-93d3-4e33d65aa976' then 'herramienta' else null end  -- motosierra → Herramientas
from public._bkp_maq_excel_flota_20261027 b
where b.id in (
    '918d25ff-b0d4-4d99-b34e-bbac528b38cc',  -- PE CYV510
    '746d160f-a002-4316-b839-95f5e0979f55',  -- GE TOYAMA (combustible_equipo 'GE Toyama Negro')
    '718188c6-c3ee-452d-93d3-4e33d65aa976',  -- MOTOSIERRA STIHL M5 382
    'a3b8eb59-a0be-4717-baec-9eefce0a591a')  -- GE YAMAGRO YG7500DCE
  and not exists (select 1 from public.maquinaria_equipos e where e.id = b.id);

-- Verificación de fotos/documentos: no había archivos bajo esos ids
-- (0 filas) → nada que volver a ver; las fichas vuelven sin adjuntos.
-- select bucket_id, name from storage.objects
--  where bucket_id in ('maquinaria-documentos','maquinaria-os-fotos')
--    and split_part(name,'/',1) in ('918d25ff-b0d4-4d99-b34e-bbac528b38cc','746d160f-a002-4316-b839-95f5e0979f55',
--                                   '718188c6-c3ee-452d-93d3-4e33d65aa976','a3b8eb59-a0be-4717-baec-9eefce0a591a');


-- =====================================================================
-- 2) PLANTA ELECTRICA MECC ECO 38-1 LN/4 (a89d0e26-…): NO se restaura.
--    Es un duplicado exacto (serial 1761324, modelo ECO 38-1 LN/4) de
--    "PLANTA ELÉCTRICA MECC ECO 38 300 KVA" (2fdce526-…) que sigue activa.
--    La borrada no tenía historial propio: 0 surtidos a su nombre en
--    Combustible, 0 documentos en storage, 0 bitácora/lecturas/OS en el
--    respaldo del 23/10. Solo se traslada a la ficha que queda el único
--    dato que aportaba y faltaba: el año (2023). La documentación ("FACTURA")
--    ya estaba cargada desde el Excel de flota.
-- =====================================================================
update public.maquinaria_equipos
   set anio = 2023, updated_at = now()
 where id = '2fdce526-33a6-4406-a78f-2a443c987ffa'
   and serial = '1761324'
   and coalesce(anio, 0) = 0;


-- =====================================================================
-- 3) Nombres de Combustible (combustible_tanque_movimientos.equipo y
--    combustible_catalogos tipo 'equipo') que no coinciden con ninguna ficha
--    (comparando sin acentos / mayúsculas / signos). Resultado del cotejo:
--
--    nombre en Combustible              surtidos  último      horóm./km       decisión
--    ---------------------------------  --------  ----------  --------------  ---------------------------
--    APOYO BIDONES GT                        63   18/08/2026  (93.1)          descartado: bidones
--    Jhenchin Hilux Negra                     6   02/06/2026  —               ficha nueva (Jhenchin)
--    ENCAVA EP-1000-A96BM3R (3)               4   03/10/2026  hor 10929/394km vincular a CAMIONETA ENCAVA EP-1000 A96BM3R
--    PITMAN ASTRA (catálogo inactivo)         4   20/08/2026  hor 637419      vincular a CAMIÓN ASTRA HD864 A50BA9M
--    CHASIS LARGO GPAMO                       3   21/10/2026  km 526802       mismo equipo probable que MACHITO BLANCO → no se toca (ver abajo)
--    GANDOLA IVECO 420                        3   20/08/2026  —               vincular a CHUTO IVECO TRAKKER 720T42T A43AT7M
--    PLANTA JHENCHIN                          2   16/05/2026  —               mismo equipo probable que GE JHENCHIN AZUL → no se toca
--    ET8 A94EE8P                              2   07/06/2026  hor 37605       vincular a CAMIÓN ENCAVA ET-8 A94EE8P
--    GT Motobomba HP serial                   2   05/06/2026  —               ficha nueva
--    JUMBO XCMG                               2   20/10/2026  hor 4293.7      ficha nueva
--    Bidones 20 Litros (2)                    1   22/10/2026  —               descartado: bidones
--    PATROL ALQUILADO (VÍA A GOLDEN)          1   28/08/2026  —               descartado: equipo alquilado de terceros, sin lectura
--    Jhenchin Hilux Roja                      1   22/05/2026  hor 93.1        ficha nueva (Jhenchin)
--    Jhenchin Jumbo Caterpillar 320D          1   14/05/2026  hor 510.2       ficha nueva (Jhenchin)
--    (catálogo, 0 surtidos: APOYO AGUA POTABLE, APOYO BIDONES KENDRY, MGG APOYO BIDONES,
--     Calibracion de Contadores…, TRANSFERENCIA A GMT, Motosoldador (Prestado), PE 7.5 KVA,
--     GENERADOR YAMAGRO TRAILER DE CHELI, GMT Generador Electrico Amarillo, GT Equipo de
--     Perforación, CATERPILLAR 320D JHENCHIN → sin surtidos, no se crean fichas)
-- =====================================================================

-- 3a) Pares "mismo equipo": la ficha existente estaba vinculada a sí misma
--     y NO tenía surtidos a su propio nombre → se le pone como
--     combustible_equipo el nombre del catálogo que sí tiene surtidos,
--     para que herede surtidos y horómetro en maquinaria_lecturas_unificadas.
update public.maquinaria_equipos e
   set combustible_equipo = v.nuevo,
       notas = concat_ws(' · ', nullif(btrim(coalesce(e.notas, '')), ''), v.nota),
       updated_at = now()
  from (values
    ('400bcedd-59ff-4f4b-a75c-19a5b41b2080'::uuid, 'ENCAVA EP-1000-A96BM3R (3)',
     'Vinculado 27/10/2026 al nombre de Combustible "ENCAVA EP-1000-A96BM3R (3)" (4 surtidos, misma placa A96BM3R)'),
    ('869b1c7c-e5b9-4ffc-bbb7-82e2269e4264'::uuid, 'ET8 A94EE8P',
     'Vinculado 27/10/2026 al nombre de Combustible "ET8 A94EE8P" (2 surtidos, misma placa A94EE8P)'),
    ('a5e32a89-ef81-4778-aa41-a95532d2ce70'::uuid, 'PITMAN ASTRA',
     'Vinculado 27/10/2026 al nombre de Combustible "PITMAN ASTRA" (4 surtidos; único camión Astra de la flota)'),
    ('d5b528ed-dc82-4f70-9a00-a901c5c137e6'::uuid, 'GANDOLA IVECO 420',
     'Vinculado 27/10/2026 al nombre de Combustible "GANDOLA IVECO 420" (3 surtidos; Trakker 720T42T = 420 HP)')
  ) as v(id, nuevo, nota)
 where e.id = v.id
   -- solo si seguía vinculada a sí misma…
   and regexp_replace(lower(unaccent(coalesce(e.combustible_equipo, ''))), '[^a-z0-9]', '', 'g')
       = regexp_replace(lower(unaccent(e.equipo)), '[^a-z0-9]', '', 'g')
   -- …y sin surtidos a su propio nombre (no se pierde nada al cambiar el vínculo)
   and not exists (
     select 1 from public.combustible_tanque_movimientos m
      where regexp_replace(lower(unaccent(btrim(m.equipo))), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(unaccent(e.equipo)), '[^a-z0-9]', '', 'g'));

-- 3b) Fichas nuevas para equipos reales con surtidos y sin ficha.
--     combustible_equipo = nombre EXACTO del catálogo (hereda surtidos y
--     horómetro). Guard: no existe ya por nombre normalizado ni por vínculo.
--     El trigger AFTER INSERT `maquinaria_asegurar_catalogo_combustible`
--     no crea nada porque esos nombres ya están en combustible_catalogos.
insert into public.maquinaria_equipos
  (equipo, tipo, clase, marca, modelo, color, propietario, ubicacion, combustible,
   status, activo, mantenimiento_cada_hrs, combustible_equipo, created_by, notas)
select v.equipo, v.tipo, v.clase, v.marca, v.modelo, v.color, v.propietario, v.ubicacion, v.combustible,
       'ACTIVO', true, 250, v.comb_equipo, 'recuperacion-combustible-2026-10-27', v.notas
  from (values
    ('JUMBO XCMG', 'EXCAVADORA', 'maquinaria', 'XCMG', null, null, null, 'MINA GOLDEN TOUCH', 'GASOIL', 'JUMBO XCMG',
     'Recuperado 27/10/2026: tenía 2 surtidos en Combustible (último 20/10/2026, horómetro 4293.7) sin ficha en Maquinaria. Operadores lo llaman "jumbo"; completar modelo y serial.'),
    ('JHENCHIN JUMBO CATERPILLAR 320D', 'EXCAVADORA', 'maquinaria', 'CATERPILLAR', '320D', null,
     'GRUPO DE INVERSIÓN MINERA JHENCHIN, C.A.', 'BRASILEROS', 'GASOIL', 'Jhenchin Jumbo Caterpillar 320D',
     'Recuperado 27/10/2026: tenía 1 surtido en Combustible (último 14/05/2026, horómetro 510.2) sin ficha en Maquinaria. Equipo de Jhenchin surtido desde "Registro Brasileros - GT". El catálogo también tiene el alias "CATERPILLAR 320D JHENCHIN" (sin surtidos).'),
    ('JHENCHIN HILUX NEGRA', 'PICK-UP D/C', 'vehiculo', 'TOYOTA', 'HILUX', 'NEGRO',
     'GRUPO DE INVERSIÓN MINERA JHENCHIN, C.A.', 'BRASILEROS', 'GASOIL', 'Jhenchin Hilux Negra',
     'Recuperado 27/10/2026: tenía 6 surtidos en Combustible (último 02/06/2026, sin horómetro ni kilometraje) sin ficha en Maquinaria. Camioneta de Jhenchin surtida desde "Registro Brasileros - GT"; completar placa.'),
    ('JHENCHIN HILUX ROJA', 'PICK-UP D/C', 'vehiculo', 'TOYOTA', 'HILUX', 'ROJO',
     'GRUPO DE INVERSIÓN MINERA JHENCHIN, C.A.', 'BRASILEROS', 'GASOIL', 'Jhenchin Hilux Roja',
     'Recuperado 27/10/2026: tenía 1 surtido en Combustible (último 22/05/2026, horómetro 93.1) sin ficha en Maquinaria. Camioneta de Jhenchin surtida desde "Registro Brasileros - GT"; completar placa.'),
    ('GT MOTOBOMBA HP SERIAL', 'MOTOBOMBA', 'maquinaria', null, null, null,
     'GOLDEN TOUCH 1127', 'MINA GOLDEN TOUCH', 'GASOIL', 'GT Motobomba HP serial',
     'Recuperado 27/10/2026: tenía 2 surtidos en Combustible (último 05/06/2026, sin horómetro) sin ficha en Maquinaria. Motobomba usada para achicar el área 3 de producción; completar marca, HP y serial.')
  ) as v(equipo, tipo, clase, marca, modelo, color, propietario, ubicacion, combustible, comb_equipo, notas)
 where not exists (
   select 1 from public.maquinaria_equipos e
    where regexp_replace(lower(unaccent(e.equipo)), '[^a-z0-9]', '', 'g')
          = regexp_replace(lower(unaccent(v.equipo)), '[^a-z0-9]', '', 'g')
       or regexp_replace(lower(unaccent(coalesce(e.combustible_equipo, ''))), '[^a-z0-9]', '', 'g')
          = regexp_replace(lower(unaccent(v.comb_equipo)), '[^a-z0-9]', '', 'g'));

-- 3c) Pares detectados que NO se tocaron (ambos nombres tienen surtidos y
--     una ficha solo puede heredar un nombre; decide la usuaria):
--   * "CHASIS LARGO GPAMO" (3 surtidos, km 526802, obs. "TOYOTA CHASIS LARGO BLANCA")
--     ≈ ficha MACHITO BLANCO (8e892df7-…, Toyota Long Van blanco, vinculada a
--     "MACHITO BLANCO TOYOTA": 6 surtidos, km 527418). Mismo odómetro ~527 mil km.
--     Para unificar: renombrar en Combustible los 3 surtidos "CHASIS LARGO GPAMO"
--     a "MACHITO BLANCO TOYOTA" (o viceversa) y desactivar el alias del catálogo.
--   * "PLANTA JHENCHIN" (2 surtidos, mayo 2026) ≈ ficha GE JHENCHIN AZUL
--     (5ac1e537-…, vinculada a "GENERADOR JHENCHIN AZUL": 3 surtidos, mayo 2026).


-- =====================================================================
-- 4) Verificación (consultas, sin cambios): lecturas unificadas por equipo.
--    La vista solo trae surtidos con horómetro o kilometraje, por eso
--    GANDOLA IVECO 420, JHENCHIN HILUX NEGRA y GT MOTOBOMBA quedan en 0 aunque
--    sus surtidos ya aparecen en Maquinaria por nombre.
-- =====================================================================
-- select e.equipo, e.combustible_equipo,
--        (select count(*) from public.maquinaria_lecturas_unificadas u where u.equipo_id = e.id) lecturas,
--        (select max(fecha) from public.maquinaria_lecturas_unificadas u where u.equipo_id = e.id) ult
--   from public.maquinaria_equipos e
--  where e.created_by = 'recuperacion-combustible-2026-10-27'
--     or e.id in ('918d25ff-b0d4-4d99-b34e-bbac528b38cc','746d160f-a002-4316-b839-95f5e0979f55',
--                 '718188c6-c3ee-452d-93d3-4e33d65aa976','a3b8eb59-a0be-4717-baec-9eefce0a591a',
--                 '400bcedd-59ff-4f4b-a75c-19a5b41b2080','869b1c7c-e5b9-4ffc-bbb7-82e2269e4264',
--                 'a5e32a89-ef81-4778-aa41-a95532d2ce70','d5b528ed-dc82-4f70-9a00-a901c5c137e6');
--
-- Resultado 27/10/2026:
--   CAMIONETA ENCAVA EP-1000 A96BM3R → 2 lecturas (últ. 03/10/2026)
--   CAMIÓN ENCAVA ET-8 A94EE8P       → 2 lecturas (últ. 07/06/2026, hor 37605)
--   CAMIÓN ASTRA HD864 A50BA9M       → 1 lectura  (últ. 20/06/2026, hor 637419)
--   CHUTO IVECO TRAKKER 720T42T      → 0 (3 surtidos sin lectura)
--   JUMBO XCMG                       → 1 lectura  (20/10/2026, hor 4293.7)
--   JHENCHIN JUMBO CATERPILLAR 320D  → 1 lectura  (14/05/2026, hor 510.2)
--   JHENCHIN HILUX ROJA              → 1 lectura  (22/05/2026, hor 93.1)
--   JHENCHIN HILUX NEGRA / GT MOTOBOMBA → 0 (surtidos sin lectura)
--   PE CYV510 / GE TOYAMA / MOTOSIERRA / GE YAMAGRO YG7500DCE → 0 (nunca tuvieron surtidos)
-- Total maquinaria_equipos tras aplicar: 171 = 160 + 4 restauradas + 5 nuevas
--   + 2 ajenas a este trabajo (PLANTA ELÉCTRICA OLYMPIAN GEP150 (PERKINS), del
--   agente que lleva la Perkins, y GE JOHN DEERE, creada por CHRISTOPHER a las 19:40).
