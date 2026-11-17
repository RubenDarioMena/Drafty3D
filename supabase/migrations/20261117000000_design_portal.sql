create table public.design_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create index design_projects_owner_idx on public.design_projects (owner_id);

create table public.design_files (
  id uuid primary key,
  project_id uuid not null references public.design_projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 180 and name !~ '[/[:cntrl:]]' and strpos(name, chr(92)) = 0),
  latest_version_id uuid,
  created_at timestamptz not null default now()
);

create index design_files_project_idx on public.design_files (project_id);

create table public.design_file_versions (
  id uuid primary key,
  file_id uuid not null references public.design_files(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  object_path text not null unique,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now(),
  unique (file_id, version_number),
  unique (file_id, id)
);

alter table public.design_files add foreign key (id, latest_version_id)
  references public.design_file_versions(file_id, id) deferrable initially deferred;

alter table public.design_projects enable row level security;
alter table public.design_files enable row level security;
alter table public.design_file_versions enable row level security;

revoke all on public.design_projects, public.design_files, public.design_file_versions from public, anon, authenticated;
grant select on public.design_projects, public.design_files, public.design_file_versions to authenticated;
grant insert (name), update (name) on public.design_projects to authenticated;

create policy "Owners can read projects"
  on public.design_projects for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners can create projects"
  on public.design_projects for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Owners can rename projects"
  on public.design_projects for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can read project files"
  on public.design_files for select to authenticated
  using (exists (select 1 from public.design_projects where id = project_id));

create policy "Owners can read file versions"
  on public.design_file_versions for select to authenticated
  using (exists (select 1 from public.design_files where id = file_id));

create view public.design_project_files with (security_invoker = true) as
  select file.id, file.project_id, file.name, file.latest_version_id,
         version.version_number, version.size_bytes, version.object_path, version.created_at
    from public.design_files file
    join public.design_file_versions version
      on version.file_id = file.id and version.id = file.latest_version_id;

revoke all on public.design_project_files from public, anon, authenticated;
grant select on public.design_project_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('design-files', 'design-files', false, 52428800, array['application/octet-stream']);

-- Objects are stored as <owner>/<project>/<file>/<version UUID>, without a user-controlled extension.
create policy "Owners can upload project objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'design-files'
    and cardinality(storage.foldername(name)) = 3
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}$'
    and exists (select 1 from public.design_projects where id::text = (storage.foldername(objects.name))[2])
  );

create policy "Owners can download registered objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'design-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.design_file_versions where object_path = objects.name)
  );

create function public.save_design_version(
  p_project_id uuid,
  p_file_id uuid,
  p_name text,
  p_version_id uuid,
  p_expected_version uuid,
  p_size_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_path text;
  file_row public.design_files%rowtype;
  current_number integer := 0;
begin
  if current_user_id is null or not exists (
    select 1 from public.design_projects where id = p_project_id and owner_id = current_user_id
  ) then
    raise exception 'Project not found' using errcode = '42501';
  end if;

  if p_expected_version is null then
    insert into public.design_files (id, project_id, name)
      values (p_file_id, p_project_id, btrim(p_name))
      on conflict (id) do nothing;
  end if;

  select * into file_row
    from public.design_files where id = p_file_id and project_id = p_project_id
    for update;
  if not found then
    raise exception 'File not found' using errcode = '42501';
  end if;

  -- Retries of an already registered upload are safe, even if a newer version exists.
  if exists (select 1 from public.design_file_versions where id = p_version_id and file_id = p_file_id) then
    return;
  end if;
  if file_row.latest_version_id is distinct from p_expected_version then
    raise exception 'File has a newer version' using errcode = '40001';
  end if;

  target_path := current_user_id::text || '/' || p_project_id::text || '/' || p_file_id::text || '/' || p_version_id::text;
  if not exists (
    select 1 from storage.objects
     where bucket_id = 'design-files' and name = target_path
       and metadata->>'size' = p_size_bytes::text
  ) then
    raise exception 'Uploaded object missing or invalid' using errcode = '23514';
  end if;

  if p_expected_version is not null then
    select version_number into strict current_number
      from public.design_file_versions where id = p_expected_version and file_id = p_file_id;
  end if;

  insert into public.design_file_versions (id, file_id, version_number, object_path, size_bytes)
    values (p_version_id, p_file_id, current_number + 1, target_path, p_size_bytes);
  update public.design_files set latest_version_id = p_version_id where id = p_file_id;
end;
$$;

revoke all on function public.save_design_version(uuid, uuid, text, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.save_design_version(uuid, uuid, text, uuid, uuid, bigint) to authenticated;
