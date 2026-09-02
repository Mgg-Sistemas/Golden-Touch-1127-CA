-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 5
-- GT-SIN-09 · Cierre de recepciones: dos cierres a la vez
--
-- QUÉ PASA
-- `cerrarRecepcion` ingresa la casiterita al inventario ANTES de guardar el
-- cierre, y nada impide que dos personas cierren la misma recepción a la vez.
-- Las dos leen las pesadas todavía disponibles, las dos ingresan el neto seco,
-- y recién después cada una marca las pesadas como consumidas. Resultado: el
-- mineral entra DOS VECES al inventario y quedan dos cierres del mismo número.
--
-- QUÉ CAMBIA
-- Un índice único sobre `numero`. El código pasa a RESERVAR el cierre —inserta
-- la fila primero, con la foto vacía— antes de tocar el inventario. Con esto,
-- la segunda persona choca contra el índice y se detiene ANTES de ingresar
-- nada; ve un mensaje claro en vez de duplicar el mineral.
--
-- Es parcial (`where numero is not null`) por si alguna fila vieja no lo tiene.
-- Reabrir un cierre borra su fila, así que el número vuelve a quedar libre y se
-- puede volver a cerrar sin problema.
-- ═══════════════════════════════════════════════════════════════════

create unique index if not exists recepciones_cierres_numero_uniq
  on public.recepciones_cierres (numero)
  where numero is not null;


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select case
         when count(*) = 1 then 'OK · indice unico creado'
         else 'FALTA · el indice no esta'
       end as estado
from pg_indexes
where schemaname = 'public'
  and tablename = 'recepciones_cierres'
  and indexname = 'recepciones_cierres_numero_uniq';
