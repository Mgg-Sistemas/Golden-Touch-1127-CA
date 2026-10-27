-- 27/10/2026 · Maquinaria: estado «Por confirmar» (status 'POR CONFIRMAR' del Excel de flota).
-- Aplicado en Supabase (rroohciwhpfonklxuoev) vía MCP (migración maquinaria_estado_por_confirmar).
-- Antes, 6 equipos con status 'POR CONFIRMAR' salían como «Operativa» en el PDF y las tarjetas,
-- porque maquinaria_estado_efectivo (y estadoEfectivo en flota.ts) mandaban todo lo desconocido a 'operativa'.

alter table public.maquinaria_equipos drop constraint if exists maquinaria_equipos_estado_operativo_chk;
alter table public.maquinaria_equipos add constraint maquinaria_equipos_estado_operativo_chk
  check (estado_operativo is null or estado_operativo = any (array['operativa','averiada','parada','taller','repuestos','espera','por_confirmar','retirada']));

create or replace function public.maquinaria_estado_efectivo(p_estado text, p_status text, p_activo boolean)
 returns text language sql immutable set search_path to 'public' as $$
  select case
    when coalesce(p_activo, true) = false then 'retirada'
    when p_estado is not null then p_estado
    when upper(coalesce(p_status,'')) = 'MANTENIMIENTO' then 'taller'
    when upper(coalesce(p_status,'')) = 'FUERA DE SERVICIO' then 'averiada'
    when upper(coalesce(p_status,'')) = 'INACTIVO' then 'retirada'
    when upper(coalesce(p_status,'')) = 'POR CONFIRMAR' then 'por_confirmar'
    else 'operativa' end;
$$;

create or replace function public.maquinaria_status_de_estado(p_estado text)
 returns text language sql immutable set search_path to 'public' as $$
  select case p_estado
    when 'averiada' then 'FUERA DE SERVICIO'
    when 'parada' then 'FUERA DE SERVICIO'
    when 'taller' then 'MANTENIMIENTO'
    when 'repuestos' then 'MANTENIMIENTO'
    when 'retirada' then 'INACTIVO'
    when 'por_confirmar' then 'POR CONFIRMAR'
    else 'ACTIVO' end;
$$;

-- maquinaria_set_estado_interno: misma función, con 'por_confirmar' admitido en la lista de estados válidos
-- (ver migración en Supabase; el cuerpo no cambia).
