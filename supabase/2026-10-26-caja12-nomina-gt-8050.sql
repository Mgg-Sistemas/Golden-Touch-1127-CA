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

-- 26/10/2026 (2.ª parte) · La entrega del mismo día «CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL» también era 8.050
-- (confirmado por la usuaria). Se corrigió usd_entregado 7.730 → 8.050 y la foto del cierre (fila, saldo corrido
-- de las filas siguientes +320, resumen.usdEntregado +320, resumen.saldoUsd +320): el cierre vuelve a 0,000843 = saldo_final.
-- La deuda a MGG (cuentas_por_pagar, trigger sync_deuda_mgg_acopio) subió 320 por el mismo motivo.
-- Respaldo previo: public._bkp_caja12_entrega_20261026.
update public.acopio_caja_movimientos set usd_entregado = 8050, updated_at = now()
 where id = '8cf651ae-6220-4094-b1e4-90d1e9738485' and usd_entregado = 7730;
