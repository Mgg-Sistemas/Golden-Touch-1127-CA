-- 12/11/2026 · Imágenes de la Solicitud de Pedido para quien solo tiene «Solicitud de Pedido».
--
-- Desde el 31/10 todos los roles crean SP (permiso solicitud_pedido), pero subir la
-- imagen al bucket op-imagenes y registrar las imágenes extra (adjuntos_directos,
-- modulo 'orden') seguía exigiendo puede('pedidos'). 15 usuarios en 9 roles
-- (maquinaria, cocina, combustible, almacén mina, delivery…) no podían crear una SP con
-- foto: la creación entera fallaba por permisos y las fotos extra se perdían en silencio.
-- (Ver también la vista previa nueva de la imagen en PedidosPage.)

alter policy "op-imagenes write op" on storage.objects
  with check ((bucket_id = 'op-imagenes') and ((select public.is_admin()) or (select public.puede('pedidos'))
    or (select public.puede('solicitud_pedido')) or (select public.puede('compras'))));

-- Imágenes extra de la SP (2.ª a 4.ª): agregar, no editar ni borrar las de otros.
create policy "adjuntos_directos insert orden solicitud" on public.adjuntos_directos
  for insert to authenticated
  with check (modulo = 'orden' and ((select public.puede('solicitud_pedido')) or (select public.puede('compras'))));
