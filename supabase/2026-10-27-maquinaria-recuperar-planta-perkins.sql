-- =============================================================================
-- 2026-10-27 · Maquinaria: recuperar la planta eléctrica PERKINS / OLYMPIAN
-- Proyecto Supabase: rroohciwhpfonklxuoev  ·  Aplicado el 27/10/2026 (ya ejecutado)
-- =============================================================================
-- Contexto
--   La usuaria no encontraba «la planta PERKINS (OLYMPIAN)» tras la carga del
--   Excel de flota. En maquinaria_equipos no existía ninguna fila con "perkins":
--   la planta estaba registrada como «CAT GEP 550-1» (id 36685831-…), que es la
--   Olympian GEP550 con motor Perkins (serial OLY00000PA6A00579).
--
--   Hallazgos previos (solo lectura):
--   · Combustible: catálogo tipo 'equipo' «OLYMPIA GEP550 (PERKINS)»
--     (id 9d28f01b-7c55-4f81-a51a-a2e6c6f538de) con 32 surtidos de uso en
--     combustible_tanque_movimientos (01/05/2026 → 24/10/2026, 19 103 L,
--     último horómetro 12 387,6 h). 27 de esos surtidos traen horómetro y en la
--     vista maquinaria_lecturas_unificadas aparecían con equipo_id NULL
--     (huérfanos) porque el equipo tenía combustible_equipo = 'CAT GEP 550-1'.
--   · El trigger trg_maquinaria_asegurar_catalogo_combustible había creado el
--     valor de catálogo «CAT GEP 550-1» (id 83b2c0de-9369-4320-88c4-989f6ef71bc2,
--     27/10 01:39) sin ningún movimiento.
--   · El equipo tenía 1 lectura manual en maquinaria_lecturas (20/10/2026,
--     12 365,7 h); sin filas en maquinaria_mantenimientos ni
--     maquinaria_alertas_respuestas.
--   · No existía la Olympian GEP150 (serial OLY00000PA6A000679) ni en
--     maquinaria_equipos ni en el catálogo de Combustible; sí venía en el
--     import del 23/10 (supabase/.temp/import-equipos.sql) como «GEP 150».
--
-- Regla: no se borra nada y no se duplica nada.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- a) Renombrar y completar la planta Perkins (antes «CAT GEP 550-1»)
--    - equipo:        nombre reconocible para la usuaria
--    - marca:         se conserva CATERPILLAR (Olympian es la línea de CAT)
--    - modelo:        'GEP5501' → 'OLYMPIAN GEP550'
--    - motor_modelo:  estaba 'S/N' → 'PERKINS' (solo si estaba vacío/S-N/N-A)
--    - clase:         'maquinaria' (apartado donde se lista)
--    - grupo_mantenimiento: se deja NULL, igual que las demás plantas eléctricas
--    - combustible_equipo: nombre EXACTO del catálogo donde están sus surtidos,
--      para que Maquinaria vea su historial de combustible y horómetro
--    - notas: se concatena (no se pisa el informe técnico del 09/10/2026)
-- ---------------------------------------------------------------------------
update public.maquinaria_equipos set
  equipo = 'PLANTA ELÉCTRICA OLYMPIAN GEP550 (PERKINS)',
  marca = coalesce(nullif(btrim(marca),''), 'CATERPILLAR'),
  modelo = 'OLYMPIAN GEP550',
  motor_modelo = case when coalesce(upper(btrim(motor_modelo)),'') in ('','S/N','N/A') then 'PERKINS' else motor_modelo end,
  clase = 'maquinaria',
  combustible_equipo = 'OLYMPIA GEP550 (PERKINS)',
  notas = concat_ws(E'\n', nullif(btrim(notas),''),
                    'Recuperada 27/10/2026: es la planta Perkins / Olympian GEP550; antes figuraba como CAT GEP 550-1'),
  updated_at = now()
where id = '36685831-e252-49c6-b573-ad0c49c1cb1b';

-- ---------------------------------------------------------------------------
-- b) Desactivar (no borrar) el valor de catálogo «CAT GEP 550-1» que creó el
--    trigger: no tiene movimientos, así deja de ofrecerse al surtir.
-- ---------------------------------------------------------------------------
update public.combustible_catalogos set activo = false
where id = '83b2c0de-9369-4320-88c4-989f6ef71bc2'
  and tipo = 'equipo' and valor = 'CAT GEP 550-1'
  and not exists (select 1 from public.combustible_tanque_movimientos m
                  where upper(btrim(m.equipo)) = 'CAT GEP 550-1');

-- ---------------------------------------------------------------------------
-- c) Insertar la Olympian GEP150 (Perkins) con los datos del import del 23/10,
--    solo si no existe (por serial o por nombre). combustible_equipo va NULL:
--    el trigger trg_maquinaria_vincular_combustible_auto la vincula a su propio
--    nombre y trg_maquinaria_asegurar_catalogo_combustible crea el valor en el
--    catálogo de Combustible (no había catálogo previo para la GEP150).
--    Resultado: id 7a556e93-4b9d-43d8-978c-a428d5fc164c.
-- ---------------------------------------------------------------------------
insert into public.maquinaria_equipos
 (equipo,tipo,propietario,status,ubicacion,anio,marca,modelo,color,serial,placa,
  motor_modelo,motor_serial,combustible,litros_consume,documentacion,ficha_tecnica,
  combustible_equipo,clase,notas,created_by)
select 'PLANTA ELÉCTRICA OLYMPIAN GEP150 (PERKINS)','PLANTA ELÉCTRICA','GOLDEN TOUCH 1127',
       'INACTIVO','C.A. LA ESPERANZA',2012,'CATERPILLAR','OLYMPIAN GEP150','AMARILLO',
       'OLY00000PA6A000679','S/N','PERKINS',null,'GASOIL',280,'FACTURA','OLYMPIA PERKINS',
       null,'maquinaria','Recuperada 27/10/2026 del import del 23/10 (OLYMPIA PERKINS)',
       'recuperacion-perkins-2026-10-27'
where not exists (select 1 from public.maquinaria_equipos
                  where serial ilike '%PA6A000679%'
                     or equipo ilike '%GEP150%' or equipo ilike '%GEP 150%');

commit;

-- =============================================================================
-- Verificación (resultado obtenido el 27/10/2026)
--   PLANTA ELÉCTRICA OLYMPIAN GEP550 (PERKINS)  id 36685831-… · ACTIVO
--     combustible_equipo = 'OLYMPIA GEP550 (PERKINS)'
--     lecturas unificadas = 28 (27 de combustible + 1 manual) · máx. 12 387,6 h
--   PLANTA ELÉCTRICA OLYMPIAN GEP150 (PERKINS)  id 7a556e93-… · INACTIVO
--     combustible_equipo = 'PLANTA ELÉCTRICA OLYMPIAN GEP150 (PERKINS)' (sin lecturas)
--   Lecturas huérfanas (equipo_id NULL) con perkins/olymp/gep = 0
--   Catálogo «CAT GEP 550-1» → activo = false
-- =============================================================================
select e.id, e.equipo, e.status, e.combustible_equipo,
       (select count(*) from public.maquinaria_lecturas_unificadas u where u.equipo_id = e.id) as lecturas_unif,
       (select max(u.horometro) from public.maquinaria_lecturas_unificadas u where u.equipo_id = e.id) as max_horometro
from public.maquinaria_equipos e
where e.equipo ilike '%olympian%' or e.equipo ilike '%perkins%'
order by e.equipo;

select count(*) as huerfanas
from public.maquinaria_lecturas_unificadas
where equipo_id is null
  and (equipo_comb ilike '%perkins%' or equipo_comb ilike '%olymp%' or equipo_comb ilike '%gep%');
