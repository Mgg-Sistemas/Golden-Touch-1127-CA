-- =============================================================
-- MGG-Inventario · Schema completo (FASE 0: portado del demo)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- Idempotente: puedes correrlo varias veces sin romper datos.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ENUMs
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'analista', 'supervisor', 'obrero', 'jefe', 'contabilidad', 'gerencia');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_generico') then
    create type estado_generico as enum ('activo', 'inactivo');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_orden') then
    create type estado_orden as enum ('pendiente', 'aprobada', 'rechazada', 'recibida', 'cancelada', 'desistida_proveedor', 'reasignada');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_factura') then
    create type estado_factura as enum ('pendiente', 'pagada', 'anulada');
  end if;

  if not exists (select 1 from pg_type where typname = 'tipo_movimiento') then
    create type tipo_movimiento as enum ('creacion', 'entrada', 'salida', 'consumo', 'transferencia', 'ajuste');
  end if;

  if not exists (select 1 from pg_type where typname = 'notif_kind') then
    create type notif_kind as enum ('info', 'success', 'warning', 'error');
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 2. usuarios (1:1 con auth.users)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.usuarios (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  nombre       text not null,
  role         user_role not null default 'obrero',
  telefono     text,
  departamento text,
  estado       estado_generico not null default 'activo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

-- Trigger: al registrar usuario en auth, crear fila en public.usuarios
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, email, nombre, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'obrero')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 3. proveedores
-- ─────────────────────────────────────────────────────────────
create table if not exists public.proveedores (
  id            uuid primary key default gen_random_uuid(),
  rif           text not null unique,
  razon_social  text not null,
  contacto      text,
  telefono      text,
  email         text,
  direccion     text,
  categorias    text[] not null default '{}',
  estado        estado_generico not null default 'activo',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 4. productos
-- ─────────────────────────────────────────────────────────────
create table if not exists public.productos (
  id           uuid primary key default gen_random_uuid(),
  sku          text not null unique,
  nombre       text not null,
  categoria    text not null,
  unidad       text not null,
  stock        numeric not null default 0,
  stock_min    numeric not null default 0,
  precio       numeric not null default 0,
  almacen      text not null default 'General',
  estado       estado_generico not null default 'activo',
  restock_pct  numeric,
  -- FASE 1: tipo de inventario (inicial / proceso / final)
  tipo         text check (tipo in ('inicial', 'proceso', 'final')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index if not exists idx_productos_categoria on public.productos(categoria);
create index if not exists idx_productos_almacen   on public.productos(almacen);
create index if not exists idx_productos_estado    on public.productos(estado);

-- ─────────────────────────────────────────────────────────────
-- 5. movimientos (kardex)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.movimientos (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos(id) on delete cascade,
  tipo          tipo_movimiento not null,
  delta         numeric not null,
  stock_antes   numeric not null,
  stock_despues numeric not null,
  actor         text not null,
  actor_name    text,
  ref_tipo      text,
  ref_id        text,
  ref_codigo    text,
  proveedor_id  uuid references public.proveedores(id) on delete set null,
  detalle       text,
  at            timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_mov_producto on public.movimientos(producto_id, at desc);
create index if not exists idx_mov_at       on public.movimientos(at desc);

-- ─────────────────────────────────────────────────────────────
-- 5.1 almacenes (depósitos físicos). productos.almacen referencia nombre (texto).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.almacenes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  ubicacion   text,
  estado      estado_generico not null default 'activo',
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 5.2 existencias: stock y costo (PMP) por (producto, almacen).
--     productos.stock / productos.precio quedan como agregados
--     (total y promedio global) mantenidos desde aquí.
--     movimientos.almacen indica en qué almacén ocurrió el movimiento.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.existencias (
  producto_id     uuid not null references public.productos(id) on delete cascade,
  almacen         text not null,
  stock           numeric not null default 0,
  costo_promedio  numeric not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (producto_id, almacen)
);
create index if not exists idx_existencias_almacen on public.existencias(almacen);

alter table public.movimientos add column if not exists almacen text;

-- Campos de producto para producción: precio de venta, marca de receta (insumo)
-- y marca de "producible" (producto terminado del catálogo de producción).
alter table public.productos add column if not exists precio_venta   numeric;
alter table public.productos add column if not exists es_receta      boolean not null default false;
alter table public.productos add column if not exists es_producible  boolean not null default false;
-- Los productos con receta de fundición ya son insumos de producción.
update public.productos set es_receta = true where receta_fundicion is not null and es_receta = false;

-- ─────────────────────────────────────────────────────────────
-- 5.3 producción: órdenes de producción + materiales consumidos.
--   Costo de Producción (CP) = costo_material (CTM) + mano_obra + costos_indirectos.
--   costo_unitario = CP / cantidad → entra como costo (PMP) del producto terminado.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.produccion (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid references public.productos(id) on delete set null,
  producto_nombre   text not null,
  cantidad          numeric not null,
  almacen_destino   text not null,
  estado            text not null default 'produccion' check (estado in ('produccion','finalizado')),
  costo_material    numeric not null default 0,
  mano_obra         numeric not null default 0,
  costos_indirectos numeric not null default 0,
  costo_unitario    numeric not null default 0,
  precio_venta      numeric,
  ganancia          numeric,
  receta_num        integer,
  horno             text,
  inicio_at         timestamptz not null default now(),
  fin_at            timestamptz,
  created_by        text,
  created_at        timestamptz not null default now()
);
alter table public.produccion add column if not exists horno text;
create index if not exists idx_prod_estado on public.produccion(estado, created_at desc);
create index if not exists idx_prod_producto on public.produccion(producto_id, created_at desc);

-- 5.4 hornos: catálogo de hornos (se administran como las categorías:
--     alta, renombrado e inhabilitación con motivo). produccion.horno guarda
--     el NOMBRE del horno usado (texto), por simetría con almacen.
create table if not exists public.hornos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  estado      estado_generico not null default 'activo',
  motivo_inhabilitacion text,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz
);

create table if not exists public.produccion_materiales (
  id              uuid primary key default gen_random_uuid(),
  produccion_id   uuid not null references public.produccion(id) on delete cascade,
  producto_id     uuid references public.productos(id) on delete set null,
  material_nombre text not null,
  almacen         text not null,
  cantidad        numeric not null,
  costo_unitario  numeric not null default 0,
  subtotal        numeric not null default 0
);
create index if not exists idx_prodmat_prod on public.produccion_materiales(produccion_id);

-- ─────────────────────────────────────────────────────────────
-- 5.5 Tesorería (módulo Salidas / Traslados · Dinero)
--   cajas: cuentas de dinero con saldo, en USD o Bs.
--   movimientos_caja: libro de cada caja (mantiene el saldo) y documento de
--   la salida de dinero con su conciliación contra una recepción de mineral.
--   movimientos.destino: a quién va dirigida una salida/traslado de material.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cajas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  moneda      text not null check (moneda in ('USD','Bs')),
  saldo       numeric not null default 0,
  estado      estado_generico not null default 'activo',
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz,
  unique (nombre, moneda)
);

create table if not exists public.movimientos_caja (
  id            uuid primary key default gen_random_uuid(),
  caja_id       uuid not null references public.cajas(id) on delete cascade,
  tipo          text not null check (tipo in ('ingreso','salida','traslado_salida','traslado_entrada','ajuste')),
  monto         numeric not null,
  moneda        text not null,
  saldo_antes   numeric not null default 0,
  saldo_despues numeric not null default 0,
  motivo        text,
  destino       text,
  ref_caja_id   uuid references public.cajas(id) on delete set null,
  -- Conciliación con recepción de mineral (solo tipo='salida').
  estado_mineral          text check (estado_mineral in ('pendiente','conciliada')),
  mineral_producto_id     uuid references public.productos(id) on delete set null,
  mineral_producto_nombre text,
  mineral_cantidad        numeric,
  mineral_unidad          text,
  mineral_costo_unit      numeric,
  mineral_descripcion     text,
  mineral_mov_id          uuid references public.movimientos(id) on delete set null,
  conciliada_at           timestamptz,
  actor         text not null,
  actor_name    text,
  at            timestamptz not null default now()
);
create index if not exists idx_movcaja_caja on public.movimientos_caja(caja_id, at desc);
create index if not exists idx_movcaja_at on public.movimientos_caja(at desc);
create index if not exists idx_movcaja_pendiente on public.movimientos_caja(estado_mineral) where estado_mineral = 'pendiente';

-- A quién va dirigida una salida/traslado de material.
alter table public.movimientos add column if not exists destino text;
-- Fecha en que se entregó la salida/traslado de material al destino.
alter table public.movimientos add column if not exists fecha_entrega date;

-- ─────────────────────────────────────────────────────────────
-- 5b. compras_directas — compras sin proveedor (EN PROCESO → FINALIZADA).
--   Al finalizar, el material entra al inventario como ENTRADA (al costo
--   = gasto / cantidad) y se adjunta el PDF en el bucket 'compras-directas'.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.compras_directas (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid references public.productos(id) on delete set null,
  producto_nombre text not null,
  producto_sku    text,
  almacen         text not null,
  cantidad        numeric not null check (cantidad > 0),
  estado          text not null default 'en_proceso' check (estado in ('en_proceso','finalizada')),
  gasto           numeric,
  adjunto_path    text,
  adjunto_nombre  text,
  mov_id          uuid,
  actor           text,
  actor_name      text,
  created_at      timestamptz not null default now(),
  finalizada_at   timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_compra_directa_estado on public.compras_directas(estado, created_at desc);
-- RLS: lectura para autenticados, escritura para operativo (admin/analista/obrero).
-- Bucket privado 'compras-directas' (storage) con políticas para autenticados.
-- (Ver migración aplicada; políticas: compra_directa read/write + cd_obj_* en storage.objects.)

-- ─────────────────────────────────────────────────────────────
-- 5c. combustible — inventario por tipo (litros + costo PMP por litro)
--   y solicitudes de salida (por_aprobar → aprobada → finalizada).
--   El ingreso suma litros al instante; finalizar descuenta litros.
--   RLS: lectura auth, escritura is_operativo(). (Ver migración aplicada.)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.combustibles (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  litros      numeric not null default 0,
  costo_litro numeric not null default 0,
  estado      estado_generico not null default 'activo',
  -- Producto del inventario al que está vinculado (traza Inventario → Combustible).
  producto_id uuid references public.productos(id),
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now()
);
create table if not exists public.combustible_movimientos (
  id               uuid primary key default gen_random_uuid(),
  combustible_id   uuid not null references public.combustibles(id) on delete cascade,
  tipo             text not null check (tipo in ('ingreso','salida','ajuste')),
  litros           numeric not null,
  costo_litro      numeric,
  litros_antes     numeric not null default 0,
  litros_despues   numeric not null default 0,
  ref_solicitud_id uuid,
  detalle          text,
  actor            text,
  actor_name       text,
  at               timestamptz not null default now()
);
create table if not exists public.combustible_solicitudes (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null,
  combustible_id     uuid references public.combustibles(id) on delete set null,
  combustible_nombre text not null,
  solicitante        text not null,
  destino            text not null,
  almacen            text,  -- almacén del inventario de donde sale el combustible
  litros             numeric not null check (litros > 0),
  estado             text not null default 'por_aprobar' check (estado in ('por_aprobar','aprobada','finalizada','cancelada')),
  motivo             text,
  historial          jsonb not null default '[]'::jsonb,
  aprobada_por       text, aprobada_en   timestamptz,
  finalizada_por     text, finalizada_en timestamptz,
  mov_id             uuid,
  actor              text, actor_name text,
  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. ordenes (de compra / pedido)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ordenes (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique,
  proveedor_id       uuid not null references public.proveedores(id) on delete restrict,
  solicitante_email  text not null,
  solicitante        text,
  items              jsonb not null default '[]',
  total              numeric not null default 0,
  estado             estado_orden not null default 'pendiente',
  notas              text,
  clasificacion      text[],
  historial          jsonb not null default '[]',
  aprobada_por       text,
  aprobada_en        timestamptz,
  rechazada_por      text,
  rechazada_en       timestamptz,
  motivo_rechazo     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);

create index if not exists idx_ordenes_proveedor on public.ordenes(proveedor_id);
create index if not exists idx_ordenes_estado    on public.ordenes(estado);

-- ─────────────────────────────────────────────────────────────
-- 7. facturas
-- ─────────────────────────────────────────────────────────────
create table if not exists public.facturas (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null unique,
  orden_id      uuid references public.ordenes(id) on delete set null,
  proveedor_id  uuid not null references public.proveedores(id) on delete restrict,
  items         jsonb not null default '[]',
  subtotal      numeric not null default 0,
  iva           numeric not null default 0,
  total         numeric not null default 0,
  estado        estado_factura not null default 'pendiente',
  emision       timestamptz not null default now(),
  vencimiento   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 8. notificaciones (in-app)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  -- destinatario: 'all' o un user_role
  destino     text not null default 'all',
  kind        notif_kind not null default 'info',
  title       text not null,
  message     text,
  link        text,
  dedup_key   text,
  read        boolean not null default false,
  at          timestamptz not null default now()
);

create index if not exists idx_notif_destino_at on public.notificaciones(destino, at desc);
create index if not exists idx_notif_dedup      on public.notificaciones(dedup_key) where dedup_key is not null;

-- ─────────────────────────────────────────────────────────────
-- 9. config (Key/Value para política de restock, preferencias, etc.)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.config (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 9.b tasa_cambio (Tesorería · historial de tasas BCV USD/EUR)
--     La Edge Function `tasa-bcv` la actualiza a diario; snapshot
--     del día en config (key 'tesoreria.tasa_hoy').
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tasa_cambio (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  moneda     text not null check (moneda in ('USD','EUR')),
  tasa       numeric not null check (tasa > 0),
  fuente     text not null default 'bcv',
  created_by text,
  at         timestamptz not null default now(),
  unique (fecha, moneda, fuente)
);
create index if not exists tasa_cambio_fecha_idx on public.tasa_cambio (fecha desc);
alter table public.tasa_cambio enable row level security;
create policy tasa_cambio_read on public.tasa_cambio for select to authenticated using (true);
create policy tasa_cambio_write on public.tasa_cambio for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 9.0 Ofertas de proveedores + evaluaciones de recepción (Sourcing)
--     Permite cargar varias ofertas por orden y comparar/seleccionar.
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_oferta') then
    create type estado_oferta as enum ('pendiente', 'aceptada', 'descartada');
  end if;
end$$;

create table if not exists public.ofertas_proveedor (
  id                         uuid primary key default gen_random_uuid(),
  orden_id                   uuid not null references public.ordenes(id) on delete cascade,
  proveedor_id               uuid not null references public.proveedores(id) on delete restrict,
  items                      jsonb not null default '[]',  -- precios y cantidades cotizados
  precio_total               numeric not null,
  fecha_entrega_prometida    date,
  condiciones_pago           text,
  notas                      text,
  estado                     estado_oferta not null default 'pendiente',
  score_calculado            numeric,                       -- snapshot al momento de aceptar
  registrada_por_email       text not null,
  registrada_en              timestamptz not null default now(),
  decidida_por_email         text,
  decidida_en                timestamptz,
  motivo_descarte            text,
  pdf_path                   text,                          -- path en bucket `ofertas-pdf`
  pdf_filename               text
);

-- Reconciliación: agrega columnas PDF si el schema ya estaba creado
alter table public.ofertas_proveedor
  add column if not exists pdf_path text,
  add column if not exists pdf_filename text;

create index if not exists idx_ofertas_orden     on public.ofertas_proveedor(orden_id);
create index if not exists idx_ofertas_proveedor on public.ofertas_proveedor(proveedor_id);
create index if not exists idx_ofertas_estado    on public.ofertas_proveedor(estado);

-- Solo una oferta aceptada por orden (constraint funcional vía índice parcial único)
create unique index if not exists uniq_oferta_aceptada_por_orden
  on public.ofertas_proveedor(orden_id) where estado = 'aceptada';

create table if not exists public.evaluaciones_recepcion (
  id                  uuid primary key default gen_random_uuid(),
  orden_id            uuid not null unique references public.ordenes(id) on delete cascade,
  proveedor_id        uuid not null references public.proveedores(id) on delete restrict,
  calidad             smallint not null check (calidad between 1 and 5),
  puntualidad_dias    integer not null,                    -- signed: negativo = atrasado, 0 = en fecha, positivo = adelantado
  comentario          text,
  evaluado_por_email  text not null,
  evaluado_por_rol    text not null,                       -- 'almacenista' o 'jefe'
  evaluado_en         timestamptz not null default now(),
  ajustado_por_jefe   boolean not null default false,
  rating_original     smallint check (rating_original between 1 and 5),  -- preserva calificación del almacenista si el jefe ajustó
  ajustado_en         timestamptz
);

create index if not exists idx_evals_proveedor on public.evaluaciones_recepcion(proveedor_id);

-- Semilla de pesos del score (idempotente)
insert into public.config(key, value)
  values ('oferta.score.weights',
          '{"precio":0.40,"puntualidad":0.25,"calidad":0.25,"cumplimiento":0.10}'::jsonb)
on conflict (key) do nothing;

-- RLS: cualquier autenticado lee; admin escribe
alter table public.ofertas_proveedor       enable row level security;
alter table public.evaluaciones_recepcion  enable row level security;

drop policy if exists "ofertas read auth"  on public.ofertas_proveedor;
drop policy if exists "ofertas write admin" on public.ofertas_proveedor;
drop policy if exists "ofertas write staff" on public.ofertas_proveedor;
drop policy if exists "evals read auth"    on public.evaluaciones_recepcion;
drop policy if exists "evals write admin"  on public.evaluaciones_recepcion;

create policy "ofertas read auth"
  on public.ofertas_proveedor for select
  using (auth.role() = 'authenticated');
-- Escritura para STAFF (admin + analista): el analista gestiona las cotizaciones.
create policy "ofertas write staff"
  on public.ofertas_proveedor for all
  using (public.is_staff()) with check (public.is_staff());

create policy "evals read auth"
  on public.evaluaciones_recepcion for select
  using (auth.role() = 'authenticated');
create policy "evals write admin"
  on public.evaluaciones_recepcion for all
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 9.1 Reconciliar columnas (en caso de schema previo más simple)
--     Estos ALTER son no-ops si la columna ya existe.
-- ─────────────────────────────────────────────────────────────
alter table public.usuarios    add column if not exists telefono     text;
alter table public.usuarios    add column if not exists departamento text;
alter table public.usuarios    add column if not exists estado       estado_generico not null default 'activo';
alter table public.usuarios    add column if not exists updated_at   timestamptz;
alter table public.usuarios    add column if not exists ci           text;

alter table public.proveedores add column if not exists updated_at   timestamptz;
alter table public.productos   add column if not exists updated_at   timestamptz;
alter table public.productos   add column if not exists tipo         text check (tipo in ('inicial','proceso','final'));

-- Trazabilidad de costos (PMP / promedio ponderado):
--   precio_unitario → costo unitario informado en ese movimiento (lo pagado al proveedor en una entrada).
--   costo_promedio  → costo base resultante (PMP) del producto luego de aplicar el movimiento.
alter table public.movimientos add column if not exists precio_unitario numeric;
alter table public.movimientos add column if not exists costo_promedio  numeric;
alter table public.ordenes     add column if not exists updated_at      timestamptz;
alter table public.ordenes     add column if not exists ci_solicitante  text;
-- El formulario de solicitud del obrero/planta NO pide proveedor; el admin
-- lo asigna después en el flujo de aprobación / sourcing.
alter table public.ordenes     alter column proveedor_id drop not null;
alter table public.facturas    add column if not exists updated_at   timestamptz;

-- ─────────────────────────────────────────────────────────────
-- Re-flujo de Compras (FASE 3): la OP se aprueba/rechaza; al elegir la oferta
-- ganadora se crea la OC (oc_creada · sin confirmar); se aprueba en lote desde
-- el checklist (oc_aprobada); Tesorería la paga (pagada) → recibida → finalizada.
-- Estados nuevos del enum estado_orden + columnas de OC/pago en ordenes.
-- ─────────────────────────────────────────────────────────────
alter type public.estado_orden add value if not exists 'oc_emitida';
alter type public.estado_orden add value if not exists 'oc_creada';
alter type public.estado_orden add value if not exists 'oc_aprobada';
alter type public.estado_orden add value if not exists 'pagada';
alter type public.estado_orden add value if not exists 'finalizada';
alter table public.ordenes add column if not exists oc_codigo       text;
alter table public.ordenes add column if not exists oc_emitida_por  text;
alter table public.ordenes add column if not exists oc_emitida_en   timestamptz;
alter table public.ordenes add column if not exists oc_creada_por   text;
alter table public.ordenes add column if not exists oc_creada_en    timestamptz;
alter table public.ordenes add column if not exists oc_aprobada_por text;
alter table public.ordenes add column if not exists oc_aprobada_en  timestamptz;
-- Almacén destino de la mercancía, elegido al confirmar la OC (oc_creada → oc_aprobada).
alter table public.ordenes add column if not exists almacen_destino text;
alter table public.ordenes add column if not exists pagada_por      text;
alter table public.ordenes add column if not exists pagada_en       timestamptz;
alter table public.ordenes add column if not exists caja_id         uuid;
alter table public.ordenes add column if not exists caja_mov_id     uuid;
alter table public.ordenes add column if not exists factura_path    text;
alter table public.ordenes add column if not exists factura_nombre  text;
alter table public.ordenes add column if not exists retencion_path  text;
alter table public.ordenes add column if not exists retencion_nombre text;
-- Storage: bucket privado `compras-oc` para la factura adjunta al pago de la OC
-- (políticas: lectura/escritura para usuarios autenticados, espejo de `compras-directas`).
-- movimientos_caja: categoría 'pago_oc' (ref_orden_id) casa el pago con la orden.

-- Storage: bucket privado `ofertas-pdf` para las cotizaciones (PDF) de los proveedores.
-- El analista carga las ofertas, así que la escritura es para STAFF (admin + analista),
-- en línea con la tabla `ofertas_proveedor`. (Antes exigía is_admin() y el analista
-- recibía "new row violates row-level security policy" al subir el PDF.)
drop policy if exists "ofertas-pdf write admin"  on storage.objects;
drop policy if exists "ofertas-pdf update admin"  on storage.objects;
drop policy if exists "ofertas-pdf delete admin"  on storage.objects;
create policy "ofertas-pdf write staff"  on storage.objects for insert to authenticated
  with check (bucket_id = 'ofertas-pdf' and public.is_staff());
create policy "ofertas-pdf update staff" on storage.objects for update to authenticated
  using (bucket_id = 'ofertas-pdf' and public.is_staff());
create policy "ofertas-pdf delete staff" on storage.objects for delete to authenticated
  using (bucket_id = 'ofertas-pdf' and public.is_staff());

-- ─────────────────────────────────────────────────────────────
-- 10. updated_at automático
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array['usuarios', 'proveedores', 'productos', 'ordenes', 'facturas']) loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 11. RLS · política simple para FASE 0
--     - Cualquier usuario autenticado puede leer todo.
--     - Solo admin puede escribir (insert/update/delete).
--     - La tabla usuarios tiene reglas específicas.
-- ─────────────────────────────────────────────────────────────
alter table public.usuarios       enable row level security;
alter table public.proveedores    enable row level security;
alter table public.productos      enable row level security;
alter table public.movimientos    enable row level security;
alter table public.ordenes        enable row level security;
alter table public.facturas       enable row level security;
alter table public.notificaciones enable row level security;
alter table public.config         enable row level security;
alter table public.almacenes      enable row level security;
alter table public.hornos         enable row level security;
alter table public.cajas          enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.existencias    enable row level security;
alter table public.produccion     enable row level security;
alter table public.produccion_materiales enable row level security;

-- Helper: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and role = 'admin');
$$;

-- usuarios
drop policy if exists "usuarios self read" on public.usuarios;
create policy "usuarios self read" on public.usuarios for select using (auth.uid() = id);

drop policy if exists "usuarios admin all" on public.usuarios;
create policy "usuarios admin all" on public.usuarios for all using (public.is_admin());

-- proveedores, productos, movimientos, ordenes, facturas, config:
-- read = cualquiera autenticado · write = admin
do $$
declare t text;
begin
  for t in select unnest(array['proveedores', 'productos', 'movimientos', 'ordenes', 'facturas', 'config', 'almacenes', 'hornos', 'cajas', 'movimientos_caja', 'existencias', 'produccion', 'produccion_materiales']) loop
    execute format('drop policy if exists "%I read auth" on public.%I', t, t);
    execute format('create policy "%I read auth" on public.%I for select using (auth.role() = ''authenticated'')', t, t);

    execute format('drop policy if exists "%I write admin" on public.%I', t, t);
    execute format('create policy "%I write admin" on public.%I for all using (public.is_admin())', t, t);
  end loop;
end$$;

-- Helper: ¿el usuario actual es "staff" de operaciones? (admin o analista).
-- El analista maneja el ciclo de compras: cargar ofertas, emitir OC, recibir
-- mercancía (movimientos + actualización de stock) y evaluar la recepción.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and role in ('admin','analista'));
$$;

-- Helper: ¿el usuario es "operativo"? (admin, analista u obrero). Estos roles
-- trabajan inventario y producción (movimientos, existencias, stock, órdenes de
-- producción y sus materiales).
create or replace function public.is_operativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and role in ('admin','analista','obrero'));
$$;

-- Directorio mínimo de usuarios activos (id, nombre, apellido, cargo) legible por
-- cualquier autenticado. La tabla usuarios tiene RLS de "solo tu fila"; esta
-- función SECURITY DEFINER expone solo datos no sensibles para elegir destinatario
-- (módulo Salidas · "a quién va dirigido" → Persona).
create or replace function public.directorio_usuarios()
returns table(id uuid, nombre text, apellido text, cargo text)
language sql stable security definer set search_path = public as $$
  select id, nombre, coalesce(apellido,''), coalesce(nullif(departamento,''), role::text)
  from public.usuarios
  where estado = 'activo'
  order by nombre, apellido;
$$;
grant execute on function public.directorio_usuarios() to authenticated, anon;

-- ordenes (pedidos): el ciclo de negocio (crear solicitud, aprobar, recibir,
-- finalizar) lo ejecutan analistas y obreros desde el cliente, no solo el admin.
-- Por eso permitimos escritura a cualquier autenticado (los guards de rol viven
-- en el front). El obrero debe poder CREAR su OP y FINALIZARLA.
drop policy if exists "ordenes write admin" on public.ordenes;
drop policy if exists "ordenes write auth"  on public.ordenes;
create policy "ordenes write auth" on public.ordenes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Tablas exclusivas del ciclo de compras: escritura para STAFF (admin o analista).
do $$
declare t text;
begin
  for t in select unnest(array['proveedores', 'ofertas_proveedor', 'evaluaciones_recepcion']) loop
    execute format('drop policy if exists "%I write admin" on public.%I', t, t);
    execute format('drop policy if exists "%I write staff" on public.%I', t, t);
    execute format('create policy "%I write staff" on public.%I for all using (public.is_staff()) with check (public.is_staff())', t, t);
  end loop;
end$$;

-- Tablas operativas (inventario + producción): escritura para OPERATIVO
-- (admin, analista u obrero). El obrero trabaja inventario y producción.
do $$
declare t text;
begin
  for t in select unnest(array['movimientos', 'productos', 'existencias', 'produccion', 'produccion_materiales', 'hornos', 'cajas', 'movimientos_caja']) loop
    execute format('drop policy if exists "%I write admin" on public.%I', t, t);
    execute format('drop policy if exists "%I write staff" on public.%I', t, t);
    execute format('drop policy if exists "%I write operativo" on public.%I', t, t);
    execute format('create policy "%I write operativo" on public.%I for all using (public.is_operativo()) with check (public.is_operativo())', t, t);
  end loop;
end$$;

-- productos: además de la escritura operativa, permitimos que cualquier
-- autenticado INSERTE un producto (alta rápida de "producto nuevo" desde una
-- solicitud de pedido).
drop policy if exists "productos insert auth" on public.productos;
create policy "productos insert auth" on public.productos for insert
  with check (auth.role() = 'authenticated');

-- notificaciones:
--   SELECT: cualquier autenticado puede leer las que matchean su rol o 'all'.
--   INSERT: cualquier autenticado puede crear notificaciones (necesario para auto-alertas
--           de stock que disparan los clientes — el front del admin las inserta on-mount).
--   UPDATE: cualquier autenticado puede marcar como leídas las que puede ver.
--   DELETE: solo admin.
drop policy if exists "notif read role"  on public.notificaciones;
drop policy if exists "notif write admin" on public.notificaciones;
drop policy if exists "notif insert auth" on public.notificaciones;
drop policy if exists "notif update auth" on public.notificaciones;
drop policy if exists "notif delete admin" on public.notificaciones;

create policy "notif read role" on public.notificaciones for select using (
  destino = 'all'
  or destino = (select role::text from public.usuarios where id = auth.uid())
);

create policy "notif insert auth" on public.notificaciones for insert
  with check (auth.role() = 'authenticated');

create policy "notif update auth" on public.notificaciones for update using (
  destino = 'all'
  or destino = (select role::text from public.usuarios where id = auth.uid())
);

create policy "notif delete admin" on public.notificaciones for delete using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 12. Promover admin@gmail.com a rol admin
-- (Correr después de crear el usuario en Authentication → Users)
-- ─────────────────────────────────────────────────────────────
update public.usuarios
   set role = 'admin', nombre = 'Administrador MGG'
 where email = 'admin@gmail.com';
