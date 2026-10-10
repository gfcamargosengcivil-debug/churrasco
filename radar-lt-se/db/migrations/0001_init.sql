-- Radar LT/SE >= 138 kV — esquema inicial (PostgreSQL 15+ / PostGIS 3+; compatível com Supabase)
-- Convenções: ids textuais gerados pela aplicação (UUID), datas como DATE, eventos como TIMESTAMPTZ,
-- geometrias em SRID 4326 (WGS84). Colunas "derivadas" são mantidas pela aplicação a cada gravação
-- para permitir filtros eficientes (tensão máxima, extensão total, regiões, etapa atual).

create extension if not exists postgis;
create extension if not exists pg_trgm;

create table if not exists configuracao (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

create table if not exists fonte (
  id                    text primary key,
  nome                  text not null,
  orgao                 text not null,
  categoria             text not null,
  classe                char(1) not null check (classe in ('A','B','C','D')),
  metodo_acesso         text not null,
  url                   text,
  frequencia            text not null,
  status_integracao     text not null,
  adaptador             text not null,
  config                jsonb not null default '{}',
  credenciais           text[] not null default '{}',
  limitacoes            text[] not null default '{}',
  termos_uso            text,
  ultima_coleta         timestamptz,
  ultima_coleta_status  text,
  ativo                 boolean not null default true
);

create table if not exists coleta (
  id               text primary key,
  fonte_id         text not null references fonte(id),
  disparo          text not null check (disparo in ('agendado','manual','upload')),
  usuario          text,
  iniciada_em      timestamptz not null,
  finalizada_em    timestamptz,
  status           text not null check (status in ('em_andamento','sucesso','parcial','erro')),
  registros_lidos  int not null default 0,
  criados          int not null default 0,
  atualizados      int not null default 0,
  sem_mudanca      int not null default 0,
  para_revisao     int not null default 0,
  conflitos        int not null default 0,
  descartados      int not null default 0,
  erros            text[] not null default '{}',
  avisos           text[] not null default '{}'
);
create index if not exists coleta_fonte_idx on coleta (fonte_id, iniciada_em desc);

create table if not exists organizacao (
  id                  text primary key,
  nome                text not null,
  nomes_alternativos  text[] not null default '{}',
  cnpj                text,
  tipo                text not null,
  setores             text[] not null default '{}',
  site                text,
  uf_sede             char(2),
  grupo_economico     text,
  observacoes         text,
  demo                boolean not null default false,
  atualizado_em       timestamptz not null default now()
);
create unique index if not exists organizacao_cnpj_uq on organizacao (cnpj) where cnpj is not null;
create index if not exists organizacao_nome_trgm on organizacao using gin (nome gin_trgm_ops);

create table if not exists documento (
  id                 text primary key,
  titulo             text not null,
  tipo               text not null,
  fonte_id           text references fonte(id),
  url                text,
  mime               text not null,
  tamanho_bytes      int not null,
  hash               text not null,
  texto_extraido     text,
  paginas            int,
  data_publicacao    date,
  carregado_em       timestamptz not null,
  carregado_por      text not null,
  empreendimento_ids text[] not null default '{}',
  analise            jsonb
);
create unique index if not exists documento_hash_uq on documento (hash);

create table if not exists empreendimento (
  id                    text primary key,
  codigo                text not null unique,
  nome_oficial          text not null,
  nomes_alternativos    text[] not null default '{}',
  identificadores       jsonb not null default '[]',
  tipo                  text not null check (tipo in ('LT','SE','LT+SE','conexao_geracao','expansao_industrial','infraestrutura_associada')),
  setor_origem          text not null check (setor_origem in ('transmissao','geracao','mineracao','industria','distribuicao','outro')),
  subsetor              text,
  descricao             text,
  fluxo_id              text not null,
  status_geral          text not null default 'ativo',
  situacao_obra         text not null default 'nao_iniciada',
  situacao_regulatoria  text not null default 'indefinida',
  situacao_ambiental    text not null default 'indefinida',
  situacao_fundiaria    text not null default 'indefinida',
  situacao_engenharia   text not null default 'indefinida',
  municipios            jsonb not null default '[]',
  ufs                   text[] not null default '{}',
  ponto                 geometry(Point, 4326),
  ponto_precisao        text check (ponto_precisao in ('exata','subestacao','municipio','uf','aproximada')),
  ponto_fonte           text,
  tensoes_kv            numeric[] not null default '{}',
  extensao_km           numeric,
  circuitos             int,
  capacidade_mva        numeric,
  qtd_subestacoes       int,
  potencia_mw           numeric,
  caracteristicas       text,
  capex_total           jsonb,
  capex_infra_eletrica  jsonb,
  rap_anual             jsonb,
  fonte_financiamento   text,
  responsavel_interno   text,
  observacoes           text,
  tags                  text[] not null default '{}',
  identificado_em       date not null,
  criado_em             timestamptz not null,
  atualizado_em         timestamptz not null,
  demo                  boolean not null default false,
  -- derivados (mantidos pela aplicação)
  tensao_max_kv         numeric,
  extensao_total_km     numeric,
  regioes               text[] not null default '{}',
  etapa_atual           text
);
create index if not exists empreendimento_ponto_gix on empreendimento using gist (ponto);
create index if not exists empreendimento_ufs_gin on empreendimento using gin (ufs);
create index if not exists empreendimento_tensao_idx on empreendimento (tensao_max_kv);
create index if not exists empreendimento_setor_idx on empreendimento (setor_origem);
create index if not exists empreendimento_nome_trgm on empreendimento using gin (nome_oficial gin_trgm_ops);

create table if not exists participacao (
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  organizacao_id    text not null references organizacao(id),
  papel             text not null,
  escopo            text,
  evidencia_ids     text[] not null default '{}',
  primary key (empreendimento_id, organizacao_id, papel)
);
create index if not exists participacao_org_idx on participacao (organizacao_id);

create table if not exists lote (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  nome              text not null,
  leilao            text,
  evidencia_ids     text[] not null default '{}'
);

create table if not exists trecho_lt (
  id                   text primary key,
  empreendimento_id    text not null references empreendimento(id) on delete cascade,
  lote_id              text,
  nome                 text not null,
  tensao_kv            numeric not null check (tensao_kv > 0),
  corrente             text not null default 'CA' check (corrente in ('CA','CC')),
  extensao_km          numeric,
  circuitos            int,
  cabo                 text,
  estruturas           text,
  origem               text,
  destino              text,
  tracado              geometry(LineString, 4326),
  tracado_natureza     text check (tracado_natureza in ('oficial','aproximado_digitalizado','esquematico')),
  tracado_evidencia_id text,
  tracado_observacao   text,
  evidencia_ids        text[] not null default '{}'
);
create index if not exists trecho_lt_emp_idx on trecho_lt (empreendimento_id);
create index if not exists trecho_lt_tracado_gix on trecho_lt using gist (tracado);

create table if not exists subestacao (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  lote_id           text,
  nome              text not null,
  natureza          text not null check (natureza in ('nova','ampliacao','seccionamento','adequacao')),
  tensoes_kv        numeric[] not null,
  capacidade_mva    numeric,
  transformadores   text,
  isolamento        text,
  municipio         text,
  uf                char(2),
  ponto             geometry(Point, 4326),
  ponto_precisao    text,
  ponto_fonte       text,
  evidencia_ids     text[] not null default '{}'
);
create index if not exists subestacao_emp_idx on subestacao (empreendimento_id);
create index if not exists subestacao_ponto_gix on subestacao using gist (ponto);

create table if not exists contrato (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  objeto            text not null,
  pacotes           text[] not null default '{}',
  escopo            text not null default 'geral',
  contratante_id    text references organizacao(id),
  contratada_id     text references organizacao(id),
  valor_brl         numeric,
  data_assinatura   date,
  status            text not null,
  evidencia_ids     text[] not null default '{}'
);

create table if not exists pacote_servico (
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  pacote            text not null,
  escopo            text not null,
  fase_contratacao  text not null,
  contratada_id     text references organizacao(id),
  data_evento       date,
  evidencia_ids     text[] not null default '{}',
  observacao        text,
  primary key (empreendimento_id, pacote, escopo)
);

create table if not exists etapa_status (
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  etapa_id          text not null,
  status            text not null check (status in ('nao_iniciada','em_andamento','concluida','nao_aplicavel')),
  data_inicio       date,
  data_fim          date,
  evidencia_ids     text[] not null default '{}',
  observacao        text,
  primary key (empreendimento_id, etapa_id)
);

create table if not exists marco (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  tipo              text not null,
  data              date not null,
  natureza          text not null check (natureza in ('realizado','previsto_oficial','previsto_estimado')),
  escopo            text not null default 'geral',
  descricao         text,
  evidencia_ids     text[] not null default '{}'
);
create index if not exists marco_emp_idx on marco (empreendimento_id);
create index if not exists marco_data_idx on marco (data);

create table if not exists evidencia (
  id                 text primary key,
  empreendimento_id  text not null references empreendimento(id) on delete cascade,
  fonte_id           text not null,
  titulo             text not null,
  url                text,
  documento_id       text,
  trecho             text,
  pagina             int,
  tipo_documento     text not null,
  data_publicacao    date,
  data_coleta        date not null,
  valido_ate         date,
  ultima_confirmacao date,
  classe             char(1),
  coleta_id          text
);
create index if not exists evidencia_emp_idx on evidencia (empreendimento_id);
create index if not exists evidencia_fonte_idx on evidencia (fonte_id);

create table if not exists proveniencia_campo (
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  campo             text not null,
  status            text not null check (status in ('confirmado','estimado','inferido','pendente')),
  evidencia_ids     text[] not null default '{}',
  observacao        text,
  em_conflito       boolean not null default false,
  atualizado_em     date not null,
  primary key (empreendimento_id, campo)
);

create table if not exists conflito (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  campo             text not null,
  valores           jsonb not null,
  valor_adotado     jsonb,
  criterio_adocao   text not null,
  status            text not null check (status in ('aberto','resolvido')),
  resolucao         jsonb,
  aberto_em         date not null
);
create index if not exists conflito_aberto_idx on conflito (status) where status = 'aberto';

-- Histórico é somente-inclusão (append-only): a aplicação nunca atualiza nem apaga linhas.
create table if not exists historico_alteracao (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  em                timestamptz not null,
  por               text not null,
  origem            text not null check (origem in ('ingestao','manual','sistema','ia')),
  campo             text not null,
  de                jsonb,
  para              jsonb,
  evidencia_id      text,
  coleta_id         text,
  observacao        text
);
create index if not exists historico_emp_idx on historico_alteracao (empreendimento_id, em desc);

create table if not exists evento_mudanca (
  id                text primary key,
  empreendimento_id text not null references empreendimento(id) on delete cascade,
  tipo              text not null,
  titulo            text not null,
  descricao         text not null,
  em                timestamptz not null,
  relevancia        text not null check (relevancia in ('alta','media','baixa')),
  dados             jsonb not null default '{}',
  evidencia_ids     text[] not null default '{}',
  demo              boolean not null default false
);
create index if not exists evento_em_idx on evento_mudanca (em desc);

create table if not exists alerta_regra (
  id             text primary key,
  nome           text not null,
  ativo          boolean not null default true,
  criado_por     text not null,
  filtros        jsonb not null default '{}',
  canais         text[] not null default '{app}',
  email_destino  text
);

create table if not exists alerta_notificacao (
  id                text primary key,
  regra_id          text not null references alerta_regra(id) on delete cascade,
  evento_id         text not null references evento_mudanca(id) on delete cascade,
  empreendimento_id text not null,
  criado_em         timestamptz not null,
  lido              boolean not null default false,
  canal             text not null,
  entregue          boolean not null default true,
  erro_entrega      text,
  unique (regra_id, evento_id, canal)
);

create table if not exists oportunidade_comercial (
  id                    text primary key,
  empreendimento_id     text not null unique references empreendimento(id) on delete cascade,
  interesse             text not null default 'nao_avaliado',
  responsavel           text,
  estrategia            text,
  status_prospeccao     text not null default 'identificada',
  pacotes_interesse     text[] not null default '{}',
  valor_qualificado_brl numeric,
  decisao               jsonb not null default '{"decisao":"pendente"}',
  contatos              jsonb not null default '[]',
  interacoes            jsonb not null default '[]',
  proximos_passos       jsonb not null default '[]',
  resultado             jsonb,
  criado_em             timestamptz not null,
  atualizado_em         timestamptz not null,
  demo                  boolean not null default false
);

create table if not exists match_candidato (
  id              text primary key,
  coleta_id       text,
  fonte_id        text not null,
  registro        jsonb not null,
  resumo_registro text not null,
  candidatos      jsonb not null,
  status          text not null check (status in ('pendente','vinculado','novo','descartado')),
  decidido_por    text,
  decidido_em     timestamptz,
  criado_em       timestamptz not null
);
create index if not exists match_pendente_idx on match_candidato (status) where status = 'pendente';

create table if not exists snapshot_pipeline (
  data   date primary key,
  dados  jsonb not null
);

-- Fila de processamento assíncrono (coleta, extração documental, recálculos, alertas).
create table if not exists job (
  id             bigserial primary key,
  tipo           text not null,
  payload        jsonb not null default '{}',
  status         text not null default 'pendente' check (status in ('pendente','executando','concluido','erro')),
  tentativas     int not null default 0,
  max_tentativas int not null default 3,
  executar_em    timestamptz not null default now(),
  iniciado_em    timestamptz,
  finalizado_em  timestamptz,
  erro           text,
  resultado      jsonb,
  criado_em      timestamptz not null default now(),
  chave_unica    text
);
create index if not exists job_fila_idx on job (status, executar_em);
create unique index if not exists job_chave_uq on job (chave_unica) where chave_unica is not null and status in ('pendente','executando');

create table if not exists audit_log (
  id          text primary key,
  em          timestamptz not null,
  usuario     text not null,
  acao        text not null,
  entidade    text not null,
  entidade_id text,
  detalhes    jsonb not null default '{}'
);
create index if not exists audit_em_idx on audit_log (em desc);

create table if not exists schema_migracao (
  arquivo     text primary key,
  aplicado_em timestamptz not null default now()
);
