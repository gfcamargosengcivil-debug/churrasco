-- Políticas RLS para uso com Supabase (aplicar SOMENTE em projetos Supabase: depende de auth.jwt()).
-- A API da plataforma conecta com o papel dono das tabelas (ou service_role) e não é afetada por RLS;
-- estas políticas protegem acessos diretos ao banco via PostgREST/supabase-js.
-- Papel do usuário: auth.jwt() -> 'app_metadata' ->> 'role'  (admin | analista | comercial | leitor)

create or replace function public.radar_papel() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'leitor')
$$;

do $$
declare
  t text;
  tabelas_dados text[] := array[
    'empreendimento','participacao','lote','trecho_lt','subestacao','contrato','pacote_servico',
    'etapa_status','marco','evidencia','proveniencia_campo','conflito','historico_alteracao',
    'organizacao','documento','fonte','coleta','match_candidato','evento_mudanca','snapshot_pipeline'
  ];
  tabelas_comerciais text[] := array['oportunidade_comercial','alerta_regra','alerta_notificacao'];
begin
  foreach t in array tabelas_dados loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists leitura on public.%I', t);
    execute format('create policy leitura on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists escrita on public.%I', t);
    execute format($p$create policy escrita on public.%I for all to authenticated
      using (public.radar_papel() in ('admin','analista'))
      with check (public.radar_papel() in ('admin','analista'))$p$, t);
  end loop;

  foreach t in array tabelas_comerciais loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists leitura on public.%I', t);
    execute format('create policy leitura on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists escrita on public.%I', t);
    execute format($p$create policy escrita on public.%I for all to authenticated
      using (public.radar_papel() in ('admin','analista','comercial'))
      with check (public.radar_papel() in ('admin','analista','comercial'))$p$, t);
  end loop;

  -- Tabelas operacionais: apenas admin.
  foreach t in array array['configuracao','job','audit_log','schema_migracao'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists somente_admin on public.%I', t);
    execute format($p$create policy somente_admin on public.%I for all to authenticated
      using (public.radar_papel() = 'admin') with check (public.radar_papel() = 'admin')$p$, t);
  end loop;
end $$;
