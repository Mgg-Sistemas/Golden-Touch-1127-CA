-- 26/10/2026 · Caja 12 (cerrada) · «NÓMINA DE GOLDEN TOUCH» del 03-06-2026: 7.730 → 8.050
-- Corrección pedida por la usuaria: el monto real era 8.050. Solo se cambia ese movimiento.
-- Se sincroniza la foto del cierre (acopio_cajas.resumen_json): la fila, el saldo corrido de las
-- filas siguientes (-320), resumen.nominas (+320) y resumen.saldoUsd (-320).
-- NO se tocó saldo_final de la Caja 12 ni el saldo inicial de la Caja 13 (abierta): el saldo que
-- se arrastró al cerrar no cambia. La deuda a MGG depende solo de usd_entregado: no se afecta.
-- Respaldo previo: public._bkp_caja12_nomina_20261026 (resumen_json_antes y nominas_antes).
update public.acopio_caja_movimientos set nominas = 8050, updated_at = now()
 where id = 'ab16a64e-3bba-4784-a86b-2b57710c4a68' and nominas = 7730;
-- (la foto se reescribió con un bloque DO equivalente: ver el respaldo para volver atrás)
