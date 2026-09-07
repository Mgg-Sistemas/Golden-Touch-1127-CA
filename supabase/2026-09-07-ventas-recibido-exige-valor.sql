-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Un material recibido en permuta no puede entrar sin valor
--
-- QUÉ PASABA
-- `ventas_recibidos.valor_unit` nacía sin restricción, así que se podía guardar
-- en 0. Y al entregar, `registrar_movimiento_stock` recibe ese 0 como
-- `precio_unitario`. Desde la corrección del 4/9, la regla de la casa es que un
-- precio 0 NO significa «vale cero» sino «no me informaron precio»: la entrada
-- conserva el costo anterior en vez de promediarlo.
--
-- El resultado sería material entrando al inventario sin costo propio, y el
-- costo promedio de esa ficha quedaría mintiendo hacia arriba o hacia abajo
-- según lo que hubiera antes. Peor todavía en una permuta, donde el valor del
-- material NO es un dato opcional: es la forma de pago. Un recibido en 0 dice
-- que el cliente no pagó nada, y entonces la diferencia a cobrar sale mal.
--
-- POR QUÉ EN LA BASE Y NO EN EL FORMULARIO
-- Acá el navegador habla directo con Postgres. Una validación en React es
-- decorativa: cualquiera con la sesión abierta puede escribir la fila igual.
-- Lo único que de verdad impide guardar un dato imposible es la restricción.
-- El formulario igual va a avisarlo, pero para ser amable, no para cuidar.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ventas_recibidos
  drop constraint if exists ventas_recibidos_valor_unit_check;

alter table public.ventas_recibidos
  add constraint ventas_recibidos_valor_unit_check
  check (valor_unit > 0);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select con.conname, pg_get_constraintdef(con.oid) as definicion
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
 where c.relname = 'ventas_recibidos' and con.contype = 'c'
 order by con.conname;
