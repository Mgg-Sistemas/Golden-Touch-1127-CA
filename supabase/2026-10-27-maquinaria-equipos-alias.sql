-- 27/10/2026 · Maquinaria: alias del equipo («cómo lo conocen los operadores»).
-- Aplicado en Supabase (rroohciwhpfonklxuoev) el 27/10/2026 vía MCP (migración
-- maquinaria_equipos_alias). Idempotente.
--
-- Los operadores no conocen a las máquinas por el nombre largo de la ficha
-- («PAYLOADER VOLVO L220G 2014»): las llaman L220G, EC240, «la amarilla». El alias
-- se carga en la ficha (Maquinaria → Editar) y lo usa el buscador de equipos del
-- Surtidor (teléfono y PC): se muestra como nombre corto y se puede buscar por él.
-- Varios alias se separan por coma. Lo que se guarda en el movimiento de
-- Combustible sigue siendo el nombre oficial del catálogo (no cambia).

alter table public.maquinaria_equipos add column if not exists alias text;
comment on column public.maquinaria_equipos.alias is
  'Cómo lo conocen los operadores (L220G, la amarilla…), varios separados por coma';
