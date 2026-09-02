-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 11
-- GT-INT-05 · Cierre de mes: dos cierres del mismo período
--
-- QUÉ PASA
-- `crearCierre` pregunta si el mes ya está cerrado y, si no, inserta. Preguntar
-- y después escribir: dos personas cerrando el mismo mes a la vez reciben las
-- dos un "no, todavía no" y las dos insertan.
--
-- Y no quedan dos cierres iguales: quedan dos cierres que se REPARTEN los
-- movimientos. El primero archiva todo lo abierto del período; el segundo llega
-- y no encuentra nada que archivar, pero se queda con la foto completa. Dos
-- reportes del mismo mes que no cuadran entre sí, y ningún aviso.
--
-- QUÉ CAMBIA
-- Un índice único parcial: un solo cierre CERRADO por período. Un cierre
-- reabierto queda fuera del índice, así que el mes se puede volver a cerrar sin
-- problema — que es justo el flujo que ya existe.
-- ═══════════════════════════════════════════════════════════════════

create unique index if not exists cierres_caja_periodo_cerrado_uniq
  on public.cierres_caja (periodo)
  where estado = 'cerrado';


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select case
         when count(*) = 1 then 'OK · indice unico creado'
         else 'FALTA · el indice no esta'
       end as estado
from pg_indexes
where schemaname = 'public'
  and tablename = 'cierres_caja'
  and indexname = 'cierres_caja_periodo_cerrado_uniq';
