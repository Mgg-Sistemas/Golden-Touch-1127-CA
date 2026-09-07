-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Las dos «unión universal de 1" con rosca por un lado» se unifican
--
-- QUÉ PASABA
-- La misma pieza escrita dos veces, las dos creadas esta semana:
--   · GEN-273 «UNION UNIVERSAL DE 1" CON ROSCA POR UN LADO» · SP-2026-0157
--   · GEN-264 «UNION UNIVERSAL CON ROSCA 1" UN LAD»         · sin órdenes
-- Ninguna tiene stock ni movimientos: unificar es desactivar la de más.
--
-- SOBREVIVE GEN-273
-- Tiene el nombre completo y está pedida en SP-2026-0157, que está APROBADA
-- (verificado leyendo el estado de la solicitud, no un conteo). GEN-264 quedó
-- con el nombre cortado en «UN LAD» —el mismo truncado que ya vimos en «LENTE
-- DE» y que viene del campo que se corta al teclear— y no la pidió nadie.
-- No hace falta renombrar nada: GEN-273 ya se llama como corresponde.
--
-- LO QUE SIGUE ABIERTO Y NO SE TOCA ACÁ
-- Queda una tercera ficha, GEN-274 «UNION UNIVERSAL DE 1" CON ROSCA», que
-- está en LA MISMA SP-2026-0157 que GEN-273. Que las dos aparezcan en la misma
-- solicitud sugiere que quien la armó las pidió como piezas DISTINTAS —una con
-- rosca de un lado y otra con rosca de los dos—, y en ese caso las dos se
-- quedan. Pero también puede ser que se haya cargado dos veces lo mismo. Ese
-- dato no está en la base: lo dice quien la pidió.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive  uuid;   -- GEN-273
  v_muere uuid;   -- GEN-264
  v_s numeric;
begin
  select id into v_vive  from public.productos where sku = 'GEN-273';
  select id into v_muere from public.productos where sku = 'GEN-264';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas.';
  end if;

  -- Guarda: las dos tienen que estar vacías. Con material aparecería la
  -- necesidad de un traslado por kardex y eso va con su propio análisis.
  select coalesce(sum(e.stock),0) into v_s
    from public.existencias e where e.producto_id in (v_vive, v_muere);
  if round(v_s,4) <> 0 then
    raise exception 'ABORTADO: entre las dos hay % de stock. Aparecio material y hace falta un traslado.', v_s;
  end if;

  update public.productos
     set nombre = 'UNION UNIVERSAL CON ROSCA 1" UN LAD (unificado en GEN-273)',
         estado = 'inactivo', updated_at = now()
   where id = v_muere;

  raise notice 'OK: GEN-264 desactivada. GEN-273 queda sola.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.estado,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock
  from public.productos p
 where p.sku in ('GEN-264','GEN-273','GEN-274')
 order by p.estado, p.sku;
