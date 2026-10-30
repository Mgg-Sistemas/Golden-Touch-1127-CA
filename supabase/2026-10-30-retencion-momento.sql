-- ============================================================
-- Golden Touch · Compras · Retener ANTES o DESPUÉS de pagar (30/10/2026)
--
-- Al indicar el método de pago de una OC con FACTURA, Compras marca cuándo
-- se retiene:
--   antes_de_pagar   → la OC va primero a Retenciones; Tesorería la ve y la
--                      puede pagar solo cuando la retención está finalizada.
--                      Se paga el total MENOS la retención (el monto BAJA).
--   despues_de_pagar → va directo a Tesorería, que paga el total COMPLETO
--                      (el monto SUBE); ya pagada, entra a Retenciones.
--
-- Parte del NUEVO FLUJO DE COMPRAS: el check solo aparece con el interruptor
-- `compras_retencion_momento` encendido. Con el interruptor apagado la columna
-- queda en null y todo funciona como hoy.
-- ============================================================

-- 1) Columna
alter table public.ordenes
  add column if not exists retencion_momento text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_retencion_momento_chk') then
    alter table public.ordenes
      add constraint ordenes_retencion_momento_chk
      check (retencion_momento is null or retencion_momento in ('antes_de_pagar', 'despues_de_pagar'));
  end if;
end $$;

comment on column public.ordenes.retencion_momento is
  'Cuándo se retiene (OC con factura): antes_de_pagar (Retenciones primero, el monto a pagar baja) o despues_de_pagar (Tesorería paga completo y luego se retiene). Null = flujo de siempre.';

-- 2) Interruptor (apagado)
insert into public.sistema_interruptores (clave, activo, descripcion, updated_by)
values ('compras_retencion_momento', false,
        'Compras marca si la OC con factura se retiene ANTES de pagar (va primero a Retenciones, el monto baja) o DESPUÉS de pagar (va a Tesorería, se paga completo)',
        'sistema')
on conflict (clave) do nothing;

-- 3) La base no deja pagar una OC «antes de pagar» sin la retención finalizada.
create or replace function public.oc_retener_antes_de_pagar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.retencion_momento = 'antes_de_pagar'
     and coalesce(new.retencion_finalizada, false) = false
     and new.estado in ('pagada', 'cuenta_abierta')
     and old.estado in ('confirmada_metodo', 'oc_aprobada') then
    raise exception 'La OC % se retiene ANTES de pagar: Retenciones tiene que finalizar la retención primero.',
      coalesce(new.oc_codigo, new.codigo)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger trg_oc_retener_antes_de_pagar
  before update of estado on public.ordenes
  for each row execute function public.oc_retener_antes_de_pagar();
