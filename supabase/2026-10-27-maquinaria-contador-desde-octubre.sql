-- APLICADO en Supabase por la usuaria el 27/10/2026 22:07 (SQL Editor). Resultado: YAMAGRO 60KVA base 1.128 h → 392 h acumuladas → VENCIDO; el resto OK (Komatsu 119, CAT428E 100, Perkins 69, L220G 60, XCMG 47, EC240 40, A35F 484 36; los demás 0).
-- 27/10/2026 · Maquinaria: el contador de mantenimiento (cada 250 h / cada N km) arranca
-- desde los movimientos cargados en Combustible ESTE MES (octubre 2026).
--
-- Pedido de la usuaria: «es cada 250 h; vamos a partir de los movimientos cargados por
-- combustible de este mes, ya que en combustible se colocan los horómetros o los kilometrajes».
--
-- Cómo: a cada equipo activo SIN base registrada («✔ Mantt. hecho» nunca pulsado) se le fija
-- `mantenimiento_base_hrs` = PRIMER horómetro leído en octubre (lectura unificada: Combustible,
-- Maquinaria o bitácora; se ignoran las correcciones), y si no tuvo lecturas en octubre, el último
-- horómetro anterior a octubre (lo que marcaba al empezar el mes). Igual para `mantenimiento_base_km`
-- en los equipos con `mantenimiento_cada_km`. Desde ahí la regla de siempre: restante =
-- N − (lectura vigente − base); «próximo» con ≤ 10 % y «vencido» al pasar N. «✔ Mantt. hecho»
-- vuelve a fijar la base en la lectura del momento.
-- Idempotente: solo toca bases en NULL. No pisa las bases que ya fijó un usuario.

create temp table _base_oct as
with lec as (
  select l.equipo_id, l.fecha, l.horometro, l.kilometraje
  from public.maquinaria_lecturas_unificadas l
  where not coalesce(l.es_correccion, false)
),
h_oct as (  -- primer horómetro de octubre
  select distinct on (equipo_id) equipo_id, horometro, fecha
  from lec where horometro is not null and fecha >= '2026-10-01T00:00:00-04:00'
  order by equipo_id, fecha asc
),
h_ant as (  -- último horómetro antes de octubre
  select distinct on (equipo_id) equipo_id, horometro, fecha
  from lec where horometro is not null and fecha < '2026-10-01T00:00:00-04:00'
  order by equipo_id, fecha desc
),
k_oct as (
  select distinct on (equipo_id) equipo_id, kilometraje, fecha
  from lec where kilometraje is not null and fecha >= '2026-10-01T00:00:00-04:00'
  order by equipo_id, fecha asc
),
k_ant as (
  select distinct on (equipo_id) equipo_id, kilometraje, fecha
  from lec where kilometraje is not null and fecha < '2026-10-01T00:00:00-04:00'
  order by equipo_id, fecha desc
)
select e.id, e.equipo,
  coalesce(h_oct.horometro, h_ant.horometro) base_hrs,
  coalesce(h_oct.fecha, h_ant.fecha) base_hrs_fecha,
  case when h_oct.equipo_id is not null then 'primera de octubre' when h_ant.equipo_id is not null then 'última antes de octubre' end base_hrs_origen,
  coalesce(k_oct.kilometraje, k_ant.kilometraje) base_km,
  coalesce(k_oct.fecha, k_ant.fecha) base_km_fecha
from public.maquinaria_equipos e
left join h_oct on h_oct.equipo_id = e.id
left join h_ant on h_ant.equipo_id = e.id
left join k_oct on k_oct.equipo_id = e.id
left join k_ant on k_ant.equipo_id = e.id
where e.activo;

update public.maquinaria_equipos e
   set mantenimiento_base_hrs = b.base_hrs,
       updated_at = now()
  from _base_oct b
 where b.id = e.id and e.mantenimiento_base_hrs is null and b.base_hrs is not null;

update public.maquinaria_equipos e
   set mantenimiento_base_km = b.base_km,
       updated_at = now()
  from _base_oct b
 where b.id = e.id and e.mantenimiento_base_km is null and b.base_km is not null
   and coalesce(e.mantenimiento_cada_km, 0) > 0;

-- Verificación: horas acumuladas desde la base y nivel de aviso resultante.
with v as (select * from public.maquinaria_lecturas_vigentes())
select e.equipo, e.mantenimiento_base_hrs base, v.horometro vigente,
       round((v.horometro - e.mantenimiento_base_hrs)::numeric, 2) acumuladas,
       coalesce(nullif(e.mantenimiento_cada_hrs, 0), 250) cada,
       case when v.horometro - e.mantenimiento_base_hrs >= coalesce(nullif(e.mantenimiento_cada_hrs,0),250) then 'VENCIDO'
            when v.horometro - e.mantenimiento_base_hrs >= coalesce(nullif(e.mantenimiento_cada_hrs,0),250) * 0.9 then 'PRÓXIMO'
            else 'ok' end nivel
from public.maquinaria_equipos e join v on v.equipo_id = e.id
where e.activo and e.mantenimiento_base_hrs is not null and v.horometro is not null
order by acumuladas desc;
