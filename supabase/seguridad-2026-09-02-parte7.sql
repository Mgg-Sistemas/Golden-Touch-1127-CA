-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 7
-- Historial de auditoría que se pisa entre usuarios
--
-- QUÉ PASA
-- `appendHistorial` (en pedidos y en combustible) arma el historial así:
--     return [...(o.historial ?? []), entradaNueva];
-- o sea, reescribe el ARREGLO ENTERO a partir de la copia que el navegador
-- tenía cargada. Si dos personas trabajan la misma orden, la segunda en guardar
-- manda su copia vieja + su evento, y el evento de la primera DESAPARECE.
--
-- Es la traza de auditoría: quién aprobó, quién cambió el precio, quién eligió
-- el proveedor. Justo lo que se mira cuando algo no cuadra, y se borra sin
-- dejar rastro de que se borró.
--
-- QUÉ CAMBIA
-- Un trigger que, en cada UPDATE, arma el historial como:
--     el que YA estaba   ‖   los eventos nuevos que no estaban
-- Así nada se pierde: lo que la copia vieja del navegador no traía se conserva
-- igual, y lo que la persona acaba de hacer se agrega al final. Los eventos se
-- comparan por contenido completo (llevan `at` al milisegundo + evento + actor,
-- así que dos distintos no chocan).
--
-- Se resuelve acá y no en el front a propósito: son ~20 lugares que escriben
-- historial en cuatro módulos, y cualquiera nuevo que se agregue mañana queda
-- protegido sin acordarse de nada.
--
-- Borrar historial a mano sigue siendo posible: mandar el arreglo vacío o null
-- deja el que había (no se destruye desde una pantalla desactualizada).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.historial_solo_agrega()
returns trigger
language plpgsql
as $fn$
declare
  v_viejo jsonb := coalesce(old.historial, '[]'::jsonb);
  v_nuevo jsonb := coalesce(new.historial, '[]'::jsonb);
  v_agregar jsonb;
begin
  -- Sin cambios en el historial: nada que hacer.
  if v_nuevo = v_viejo then
    return new;
  end if;

  -- Eventos que trae el UPDATE y que todavía no estaban registrados.
  select coalesce(jsonb_agg(e.valor order by e.orden), '[]'::jsonb)
    into v_agregar
    from jsonb_array_elements(v_nuevo) with ordinality as e(valor, orden)
   where not v_viejo @> jsonb_build_array(e.valor);

  new.historial := v_viejo || v_agregar;
  return new;
end $fn$;

drop trigger if exists trg_historial_solo_agrega on public.ordenes;
create trigger trg_historial_solo_agrega
  before update on public.ordenes
  for each row execute function public.historial_solo_agrega();

drop trigger if exists trg_historial_solo_agrega on public.combustible_solicitudes;
create trigger trg_historial_solo_agrega
  before update on public.combustible_solicitudes
  for each row execute function public.historial_solo_agrega();

drop trigger if exists trg_historial_solo_agrega on public.solicitudes_salida;
create trigger trg_historial_solo_agrega
  before update on public.solicitudes_salida
  for each row execute function public.historial_solo_agrega();

drop trigger if exists trg_historial_solo_agrega on public.salidas_temporales;
create trigger trg_historial_solo_agrega
  before update on public.salidas_temporales
  for each row execute function public.historial_solo_agrega();


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select c.relname as tabla, t.tgname as trigger
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and t.tgname = 'trg_historial_solo_agrega'
order by 1;
