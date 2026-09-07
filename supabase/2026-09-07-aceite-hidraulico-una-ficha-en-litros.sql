-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Aceite hidráulico 68: una sola ficha, en LITROS, a $5 el litro
--
-- LA REGLA QUE FIJÓ EL ADMINISTRADOR
-- «La presentación es por tambor, pero se usa y se descuenta por litros.»
-- Esa frase resuelve las dos cosas: cómo se mide la ficha y cuál sobra.
--   · El tambor es la forma de COMPRAR.
--   · El litro es la forma de CONSUMIR, y el inventario lleva lo que se
--     consume, porque es lo que hay que descontar cada vez.
-- Entonces queda UNA ficha, GEN-015, medida en LITROS, y se retira GEN-155
-- «TAMBOR DE ACEITE HIDRAULICO 68», que nunca se usó (0 stock, 0 movimientos,
-- 0 órdenes). El tambor se compra y se descarga en litros.
--
-- POR QUÉ IMPORTA QUE SOBRE UNA
-- Tener las dos fichas es lo que produjo el error del 4/9: se compró el tambor
-- y su precio TOTAL se cargó en el campo de precio por litro, dejando el aceite
-- valuado en $1.500 el litro y el inventario inflado en ~$58.500. Con una sola
-- ficha en litros no hay dónde equivocarse: el precio que se teclea siempre es
-- el del litro.
--
-- EL COSTO PASA DE $37,50 A $5,00 EL LITRO
-- El 4/9 se corrigió a $37,50 partiendo de que «los 40 litros totalizan $1.500».
-- El administrador aclaró hoy que ese $1.500 es el valor DEL TAMBOR, no el de
-- los 40 litros que quedan, y fijó el litro en $5.
--   40 litros × $5 = $200 de valor de inventario (antes $1.500).
--
-- ⚠ UN NÚMERO QUE NO CIERRA — queda anotado, no se decide acá
-- Si un tambor son los 208 litros habituales y cuesta $1.500, el litro daría
-- ~$7,21. A $5 el litro, el tambor saldría $1.040. La diferencia puede ser
-- que el tambor no sea de 208 L, que el $1.500 incluya algo más, o que el
-- precio de referencia esté viejo. Se aplica $5 porque es lo que indicó el
-- administrador; si el tambor es de 208 L y hoy cuesta $1.500, el litro
-- habría que subirlo a $7,21.
--
-- CÓMO SE APLICA
-- Con `fijar_costo_producto`, que deja `productos.precio` y
-- `existencias.costo_promedio` en el mismo número dentro de una transacción y
-- anota el ajuste en el kardex con quién lo valoró y cuándo. No mueve stock.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive   uuid;   -- GEN-015, la ficha en litros
  v_muere  uuid;   -- GEN-155, la ficha por tambor
  v_stock  numeric;
  v_movs   int;
  v_antes  numeric;
begin
  select id, coalesce(precio,0) into v_vive, v_antes
    from public.productos where sku = 'GEN-015';
  select id into v_muere from public.productos where sku = 'GEN-155';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas.';
  end if;

  -- Guarda 1 · la ficha del tambor tiene que estar vacía: retirarla no debe
  -- hacer desaparecer material ni historial de consumo.
  select coalesce(sum(stock),0) into v_stock from public.existencias where producto_id = v_muere;
  select count(*) into v_movs from public.movimientos where producto_id = v_muere;
  if round(v_stock,4) <> 0 or v_movs > 0 then
    raise exception 'ABORTADO: GEN-155 tiene stock=% y % movimiento(s). Ya no esta vacia: hace falta trasladar los litros con analisis propio.',
      v_stock, v_movs;
  end if;

  -- Guarda 2 · el costo se corrige sobre el valor que dejamos el 4/9. Si es
  -- otro, alguien lo toco entre medio y hay que volver a mirar.
  if round(v_antes,2) <> 37.50 then
    raise exception 'ABORTADO: se esperaba GEN-015 en $37,50 (la correccion del 4/9) y esta en $%.', v_antes;
  end if;

  -- ── 1 · Se retira la ficha por tambor ────────────────────────────
  update public.productos
     set nombre = 'TAMBOR DE ACEITE HIDRAULICO 68 (se compra por tambor, se lleva en litros en GEN-015)',
         estado = 'inactivo', updated_at = now()
   where id = v_muere;

  -- ── 2 · El litro vale $5 ─────────────────────────────────────────
  perform public.fijar_costo_producto(
    v_vive, 5.00,
    'correccion-costo',
    'Aceite hidráulico 68: el litro vale $5 (el $1.500 era el valor del tambor, no el de los 40 litros)'
  );

  raise notice 'OK: GEN-015 queda a $5/litro (40 L = $200) y GEN-155 se retira.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.unidad, p.estado, p.precio as costo_litro,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select round(coalesce(sum(e.stock*e.costo_promedio),0),2) from public.existencias e where e.producto_id = p.id) as valor
  from public.productos p
 where p.sku in ('GEN-015','GEN-155')
 order by p.estado;
