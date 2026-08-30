-- Nilo Entregas • segurança de produção
-- Execute no SQL Editor do projeto Supabase depois de supabase_delivery_sync.sql.
-- A aplicação continua funcionando offline; estas regras protegem a sincronização no banco.

alter table public.delivery_workspace_members
  drop constraint if exists delivery_workspace_members_role;

alter table public.delivery_workspace_members
  add constraint delivery_workspace_members_role
  check (role in ('admin', 'leader', 'operator', 'viewer'));

create or replace function public.delivery_is_manager(target_workspace uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.delivery_workspace_members manager
    where manager.workspace_id = target_workspace
      and manager.user_id = auth.uid()
      and manager.active
      and manager.role in ('admin', 'leader')
  );
$$;

drop policy if exists delivery_workspace_members_select_self on public.delivery_workspace_members;
create policy delivery_workspace_members_select_self
on public.delivery_workspace_members
for select
to authenticated
  using (
    active
    and (
      user_id = (select auth.uid())
      or public.delivery_is_manager(workspace_id)
    )
  );

drop policy if exists delivery_sync_entities_insert_operator on public.delivery_sync_entities;
create policy delivery_sync_entities_insert_operator
on public.delivery_sync_entities
for insert
to authenticated
with check (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('admin', 'leader', 'operator')
  )
);

drop policy if exists delivery_sync_entities_update_operator on public.delivery_sync_entities;
create policy delivery_sync_entities_update_operator
on public.delivery_sync_entities
for update
to authenticated
using (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('admin', 'leader', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('admin', 'leader', 'operator')
  )
);

-- A trilha oficial é append-only: registros de auditoria sincronizados não podem
-- ser apagados por um cliente. A lixeira continua sendo restauração lógica.
drop policy if exists delivery_sync_entities_delete_any on public.delivery_sync_entities;
revoke delete on public.delivery_sync_entities from authenticated;

comment on table public.delivery_sync_entities is
  'Estado sincronizado do Nilo Entregas. Exclusão física é proibida; use deleted_at e a lixeira.';
