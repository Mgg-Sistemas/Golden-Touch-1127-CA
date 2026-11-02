-- =====================================================================
-- 2026-11-01 · La retención es OPCIONAL: el pago no se frena por ella
-- ---------------------------------------------------------------------
-- Decisión de la usuaria (01/11/2026): retenga Retenciones o no, la OC se
-- paga igual. `ordenes.retencion_momento` queda como dato informativo
-- (Compras sigue marcando antes/después y Retenciones lo ve), pero ya NADA
-- detiene el flujo:
--   · Base: el trigger trg_oc_retener_antes_de_pagar (30/10/2026) impedía
--     pasar a pagada/cuenta_abierta sin retencion_finalizada. Queda sin
--     efecto (la función devuelve new sin validar). Se deja el trigger
--     colgado de la función para no usar DROP (el MCP lo rechaza).
--   · Front: Tesorería lista y paga todas las OC confirmadas; el check
--     «Tiene retención» nunca se bloquea (pedidos.repository.ts, TesoreriaPage.tsx).
-- =====================================================================

create or replace function public.oc_retener_antes_de_pagar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 01/11/2026: retención opcional. Antes aquí se frenaba el pago de una OC
  -- «antes de pagar» sin retención finalizada. Ya no se valida nada.
  return new;
end;
$$;

comment on function public.oc_retener_antes_de_pagar() is
  'Sin efecto desde el 01/11/2026: la retención es opcional y no frena el pago.';
