/* ============================================================
   Golden Touch · Retenciones · Buzón de Facturas y Multi-Empresa
   Soporte para recepción móvil de facturas de compras externas,
   segregación de retenciones entre Golden Touch y otras empresas (MTO, MGG, etc.),
   y gestión de Ficha Fiscal completa por empresa receptora.
   ============================================================ */

begin;

-- 1. Catálogo editable de empresas receptoras con ficha fiscal completa
create table if not exists public.retencion_empresas_receptoras (
  id                         text primary key,
  clave                      text not null unique,
  nombre                     text not null,
  nombre_corto               text,
  rif                        text not null,
  color_badge                text not null default '#64748b',
  activo                     boolean not null default true,
  orden                      int not null default 10,
  
  -- Domicilio e información fiscal (para Retención / Impuestos)
  email                      text,
  telefono                   text,
  direccion_fiscal           text,
  municipio                  text,
  estado                     text,
  licencia_municipal         text,

  -- Régimen y condición de agente
  es_agente_iva              boolean not null default true,
  es_contribuyente_especial  boolean not null default false,
  retiene_islr               boolean not null default true,
  retiene_municipal          boolean not null default false,
  pct_iva_general            numeric(5,2) not null default 75,
  imprimir_original_y_copia  boolean not null default true,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Si la tabla ya existía sin las nuevas columnas fiscales, añadirlas de forma idempotente
alter table public.retencion_empresas_receptoras add column if not exists nombre_corto text;
alter table public.retencion_empresas_receptoras add column if not exists email text;
alter table public.retencion_empresas_receptoras add column if not exists telefono text;
alter table public.retencion_empresas_receptoras add column if not exists direccion_fiscal text;
alter table public.retencion_empresas_receptoras add column if not exists municipio text;
alter table public.retencion_empresas_receptoras add column if not exists estado text;
alter table public.retencion_empresas_receptoras add column if not exists licencia_municipal text;
alter table public.retencion_empresas_receptoras add column if not exists es_agente_iva boolean not null default true;
alter table public.retencion_empresas_receptoras add column if not exists es_contribuyente_especial boolean not null default false;
alter table public.retencion_empresas_receptoras add column if not exists retiene_islr boolean not null default true;
alter table public.retencion_empresas_receptoras add column if not exists retiene_municipal boolean not null default false;
alter table public.retencion_empresas_receptoras add column if not exists pct_iva_general numeric(5,2) not null default 75;
alter table public.retencion_empresas_receptoras add column if not exists imprimir_original_y_copia boolean not null default true;

-- Semilla inicial de empresas (Golden Touch, Minería TS / MTO, MGG)
insert into public.retencion_empresas_receptoras (
  id, clave, nombre, nombre_corto, rif, color_badge, orden,
  municipio, estado, es_agente_iva, es_contribuyente_especial, retiene_islr
)
values
  ('empresa-golden-touch', 'golden_touch', 'Golden Touch 1127 C.A.', 'Golden Touch', 'J-50112745-6', '#eab308', 1, 'Caroní', 'Bolívar', true, false, true),
  ('empresa-mineria-ts', 'mineria_ts', 'Minería TS C.A.', 'Minería TS / MTO', 'J-50348912-3', '#d97706', 2, 'El Callao', 'Bolívar', true, false, true),
  ('empresa-mgg', 'mgg', 'MGG Inversiones Mineras C.A.', 'MGG', 'J-50284711-2', '#2563eb', 3, 'Roscio', 'Bolívar', false, false, true)
on conflict (id) do update set
  nombre = excluded.nombre,
  nombre_corto = excluded.nombre_corto,
  color_badge = excluded.color_badge;

-- 2. Buzón de facturas externas (móvil y recepción de compras fuera del flujo)
create table if not exists public.retencion_facturas_externas (
  id                text primary key,
  empresa_id        text not null references public.retencion_empresas_receptoras (id) on delete restrict,
  empresa_nombre    text not null,
  proveedor_nombre  text not null,
  proveedor_rif     text not null,
  factura_numero    text not null,
  factura_control   text,
  factura_fecha     date not null,
  monto_total       numeric(14,2) not null,
  moneda            text not null default 'Bs' check (moneda in ('Bs', 'USD')),
  tasa              numeric(12,4),
  monto_bs          numeric(14,2) not null default 0,
  monto_usd         numeric(14,2),
  descripcion       text not null,
  observaciones     text,
  estatus           text not null default 'recibida' check (estatus in ('recibida', 'en_revision', 'retenida', 'descartada')),
  adjuntos          jsonb not null default '[]'::jsonb,
  created_by        text,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Idempotencia para tablas preexistentes
alter table public.retencion_facturas_externas add column if not exists monto_usd numeric(14,2);
alter table public.retencion_facturas_externas add column if not exists observaciones text;
alter table public.retencion_facturas_externas add column if not exists created_by_name text;

create index if not exists idx_retencion_facturas_empresa on public.retencion_facturas_externas (empresa_id);
create index if not exists idx_retencion_facturas_estatus on public.retencion_facturas_externas (estatus);
create index if not exists idx_retencion_facturas_fecha on public.retencion_facturas_externas (factura_fecha desc);

-- 3. Storage bucket para los adjuntos del buzón móvil (máx 4 imágenes, 1-2 PDFs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'retenciones-facturas-externas',
  'retenciones-facturas-externas',
  true,
  12582912, -- 12 MB por archivo
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- 4. Permisos base y RLS
grant select, insert, update, delete on public.retencion_empresas_receptoras to authenticated;
grant all on public.retencion_empresas_receptoras to service_role;

grant select, insert, update, delete on public.retencion_facturas_externas to authenticated;
grant all on public.retencion_facturas_externas to service_role;

alter table public.retencion_empresas_receptoras enable row level security;
alter table public.retencion_facturas_externas enable row level security;

-- Políticas de lectura para autenticados
drop policy if exists "retencion_empresas_select_all" on public.retencion_empresas_receptoras;
create policy "retencion_empresas_select_all" on public.retencion_empresas_receptoras
  for select to authenticated using (true);

drop policy if exists "retencion_facturas_select_all" on public.retencion_facturas_externas;
create policy "retencion_facturas_select_all" on public.retencion_facturas_externas
  for select to authenticated using (true);

-- Políticas de inserción y modificación
drop policy if exists "retencion_empresas_insert_all" on public.retencion_empresas_receptoras;
create policy "retencion_empresas_insert_all" on public.retencion_empresas_receptoras
  for insert to authenticated with check (true);

drop policy if exists "retencion_empresas_update_all" on public.retencion_empresas_receptoras;
create policy "retencion_empresas_update_all" on public.retencion_empresas_receptoras
  for update to authenticated using (true);

drop policy if exists "retencion_facturas_insert_all" on public.retencion_facturas_externas;
create policy "retencion_facturas_insert_all" on public.retencion_facturas_externas
  for insert to authenticated with check (true);

drop policy if exists "retencion_facturas_update_all" on public.retencion_facturas_externas;
create policy "retencion_facturas_update_all" on public.retencion_facturas_externas
  for update to authenticated using (true);

drop policy if exists "retencion_facturas_delete_all" on public.retencion_facturas_externas;
create policy "retencion_facturas_delete_all" on public.retencion_facturas_externas
  for delete to authenticated using (true);

-- Políticas de Storage para el bucket retenciones-facturas-externas
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists "retenciones_adjuntos_read" on storage.objects;
    create policy "retenciones_adjuntos_read" on storage.objects
      for select to authenticated, anon
      using (bucket_id = 'retenciones-facturas-externas');

    drop policy if exists "retenciones_adjuntos_insert" on storage.objects;
    create policy "retenciones_adjuntos_insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'retenciones-facturas-externas');

    drop policy if exists "retenciones_adjuntos_delete" on storage.objects;
    create policy "retenciones_adjuntos_delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'retenciones-facturas-externas');
  end if;
end $$;

-- 5. Publicación en Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'retencion_facturas_externas'
  ) then
    alter publication supabase_realtime add table public.retencion_facturas_externas;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'retencion_empresas_receptoras'
  ) then
    alter publication supabase_realtime add table public.retencion_empresas_receptoras;
  end if;
end $$;

commit;

