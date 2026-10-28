-- 27/10/2026 · APLICADO por la usuaria 22:13 (SQL Editor): Machito 9 surtidos, Jhenchin Azul 5, EC240-40145 retirada. Idempotente.
-- (el MCP de Supabase no conectaba desde Claude Code). Idempotente.

-- 1) CHASIS LARGO GPAMO es el MACHITO BLANCO: sus surtidos pasan al nombre con ficha
update public.combustible_tanque_movimientos
   set equipo = 'MACHITO BLANCO TOYOTA'
 where upper(btrim(equipo)) = 'CHASIS LARGO GPAMO';
update public.combustible_catalogos set activo = false
 where tipo = 'equipo' and upper(btrim(valor)) = 'CHASIS LARGO GPAMO';

-- 2) PLANTA JHENCHIN es el GE JHENCHIN AZUL
update public.combustible_tanque_movimientos
   set equipo = 'GENERADOR JHENCHIN AZUL'
 where upper(btrim(equipo)) = 'PLANTA JHENCHIN';
update public.combustible_catalogos set activo = false
 where tipo = 'equipo' and upper(btrim(valor)) = 'PLANTA JHENCHIN';

-- 3) Volvo EC240 …40145 (id 03859339-c575-4a1f-bde5-93042a53f4a8): retirada, no se borra.
select public.maquinaria_set_estado_interno(
  '03859339-c575-4a1f-bde5-93042a53f4a8', 'retirada',
  'Retirada 27/10/2026 por indicación de la gerencia: el equipo ya no existe en la flota',
  null, null, null);

-- Verificación
select 'MACHITO' que, count(*) surtidos, max(fecha) ultimo from public.combustible_tanque_movimientos where equipo = 'MACHITO BLANCO TOYOTA'
union all
select 'JHENCHIN AZUL', count(*), max(fecha) from public.combustible_tanque_movimientos where equipo = 'GENERADOR JHENCHIN AZUL'
union all
select 'EC240-40145 activo='||activo::text||' estado='||coalesce(estado_operativo,''), 0, null from public.maquinaria_equipos where id = '03859339-c575-4a1f-bde5-93042a53f4a8';
