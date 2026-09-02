-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 12
-- GT-INT-10 · Número de big bag duplicado
--
-- QUÉ PASA
-- `crearBigbag` numera así: lee el número más alto y le suma uno. Dos personas
-- pesando al mismo tiempo leen el mismo máximo y se llevan el MISMO número. Y
-- `actualizarBigbag` deja escribir cualquier número a mano, así que también se
-- puede repetir al renumerar.
--
-- El número del big bag es cómo se identifica el bulto entre la balanza y la
-- planilla. Dos con el mismo número y no hay forma de saber cuál pesó cuánto.
--
-- QUÉ CAMBIA
--  1) Un trigger asigna el número en el servidor tomando un lock por conjunto
--     (la pesada, o el set de trabajo). Dos inserciones simultáneas se ordenan y
--     salen con números distintos. El cliente deja de calcularlo: manda 0.
--
--     Solo asigna cuando el número viene en 0 o nulo. Eso importa: al REABRIR un
--     cierre de recepción, los bigbags se reinsertan con su número original desde
--     la foto. Si el trigger renumerara siempre, la recepción reabierta volvería
--     con los bultos cambiados de número.
--
--  2) Un índice único por (pesada, número), que además cierra la puerta a
--     duplicar renumerando a mano. Va con `nulls not distinct` porque el set de
--     trabajo tiene `pesada_id` en NULL y, sin eso, Postgres trataría cada fila
--     como distinta y el índice no cubriría justamente el caso más común.
--
-- El número sigue siendo por conjunto y NO por persona: en pantalla se ve el set
-- de trabajo completo, así que numerar por usuario mostraría repetidos.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.asignar_numero_bigbag()
returns trigger
language plpgsql
as $fn$
declare v_max int;
begin
  -- Número explícito (restauración de un cierre reabierto): se respeta tal cual.
  -- El índice único es el que valida que no choque.
  if coalesce(new.numero, 0) > 0 then
    return new;
  end if;

  -- Lock por conjunto: serializa las inserciones que compiten por el mismo número.
  -- El set de trabajo (pesada_id null) usa su propia clave.
  perform pg_advisory_xact_lock(
    hashtext('bigbag:' || coalesce(new.pesada_id::text, 'set-de-trabajo'))
  );

  select coalesce(max(numero), 0) into v_max
    from public.recepciones_bigbags
   where pesada_id is not distinct from new.pesada_id;

  new.numero := v_max + 1;
  return new;
end $fn$;

drop trigger if exists trg_numero_bigbag on public.recepciones_bigbags;
create trigger trg_numero_bigbag
  before insert on public.recepciones_bigbags
  for each row execute function public.asignar_numero_bigbag();

create unique index if not exists recepciones_bigbags_pesada_numero_uniq
  on public.recepciones_bigbags (pesada_id, numero) nulls not distinct;


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'recepciones_bigbags' and t.tgname = 'trg_numero_bigbag')  as trigger_ok,
  (select count(*) from pg_indexes
    where schemaname = 'public' and tablename = 'recepciones_bigbags'
      and indexname = 'recepciones_bigbags_pesada_numero_uniq')                  as indice_ok;
