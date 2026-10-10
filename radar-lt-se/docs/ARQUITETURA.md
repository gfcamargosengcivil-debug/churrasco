# Arquitetura — Radar LT/SE ≥ 138 kV

## 1. Diagnóstico do repositório (Fase 1)

O repositório `churrasco` continha apenas um portal estático de PMO para um
evento ("Churrasco da Turma": `churrasco.html` e `churrasco-pmo/`, HTML/CSS/JS
puro, dados em `localStorage`). Não há relação de domínio com esta plataforma,
então **nada foi alterado ou removido**: a plataforma foi criada em
`radar-lt-se/` como um monorepo independente.

Ambiente de desenvolvimento verificado: Node 22, npm 10, PostgreSQL 16 +
PostGIS 3.4 (instalado localmente para testes). Os portais oficiais (ANEEL,
ONS, EPE) **estavam bloqueados pela política de rede do ambiente** onde o
código foi escrito; por isso nenhum conector foi validado contra os endpoints
reais (ver `FONTES.md`).

## 2. Visão geral

```
            ┌──────────────────────── apps/web (React + Vite + TS) ────────────────────────┐
            │ Executivo · Radar · Mapa · Funil · Previsão · Clientes · Alertas · Comercial │
            │ Ficha do empreendimento · Fontes/Ingestão · Qualidade · Config · Metodologia │
            └───────────────────────────────▲──────────────────────────────────────────────┘
                                            │ REST/JSON (JWT Supabase ou modo dev)
            ┌───────────────────────────────┴──────────────────────────────────────────────┐
            │ apps/api (Fastify)                                                            │
            │  rotas · auth/RBAC · auditoria · logs (pino) · validação (zod) · exportações   │
            │  Repositório ──► MemoryRepository (JSON local)  |  PgRepository (PostGIS)      │
            │  Fila de jobs ──► FilaMemoria                   |  FilaPostgres (SKIP LOCKED)  │
            │  Scheduler (frequência por fonte) · Worker (processo separado)                │
            └───────▲──────────────────────▲────────────────────────▲──────────────────────┘
                    │                      │                        │
    ┌───────────────┴──────┐  ┌────────────┴───────────┐  ┌─────────┴─────────────────┐
    │ packages/ingestion   │  │ packages/ai            │  │ packages/core (domínio)   │
    │ catálogo de fontes   │  │ extração heurística    │  │ tipos/schemas · etapas     │
    │ adaptadores (CKAN,   │  │ provedor LLM (server)  │  │ previsão · confiança       │
    │ ArcGIS, RSS, PDF,    │  │ verificação de         │  │ score · mercado endereçável│
    │ CSV/XLSX manual)     │  │ evidências literais    │  │ dedup · merge/conflitos    │
    │ pipeline de ingestão │  │ comparação cronogramas │  │ mudanças → alertas         │
    └──────────────────────┘  └────────────────────────┘  │ clusters · evolução        │
                                                          └───────────────────────────┘
```

* **`packages/core`** — regras de negócio puras (sem I/O): é o que mais importa
  estar correto e é coberto por testes unitários. Todos os outros módulos
  dependem dele.
* **`packages/ingestion`** — camada de ingestão independente da interface.
  Cada fonte tem um adaptador que produz `RegistroBruto` com proveniência; o
  pipeline normaliza, deduplica, mescla (registrando conflitos), gera eventos
  de mudança e alimenta alertas.
* **`packages/ai`** — camada de inteligência documental. Funciona sem chave de
  API (extrator heurístico por regras); com `ANTHROPIC_API_KEY` no servidor
  usa um LLM com saída estruturada. Em ambos os casos **cada valor extraído
  precisa citar um trecho literal do documento**, que é verificado por código
  antes de ser aceito; valores extraídos entram como `inferido` e exigem
  revisão humana para virar `confirmado`.
* **`apps/api`** — API REST, autenticação, autorização por papel, auditoria,
  fila de jobs, agendador e worker.
* **`apps/web`** — interface em português, responsiva.

## 3. Organização por módulos

| Módulo pedido | Onde está |
|---|---|
| fontes | `packages/ingestion/src/fontes/` (catálogo + adaptadores) |
| ingestão | `packages/ingestion/src/pipeline.ts`, `apps/api/src/jobs/` |
| normalização | `packages/core/src/normalizacao/` |
| projetos | `packages/core/src/projetos/`, `apps/api/src/routes/projetos.ts` |
| previsão | `packages/core/src/previsao/` |
| inteligência comercial | `packages/core/src/comercial/` (score, mercado endereçável) |
| mapa | `packages/core/src/geo/` (clusters, GeoJSON), `apps/web/src/pages/Mapa.tsx` |
| alertas | `packages/core/src/alertas/` (detecção de mudanças, regras) |
| relatórios | `apps/api/src/routes/export.ts` (CSV/XLSX para Excel/Power BI) |

## 4. Modelo de dados

O agregado central é o **Empreendimento** (um registro por empreendimento),
desdobrável em **lotes**, **trechos de LT**, **subestações**, **contratos** e
**pacotes de serviço**. As dimensões pedidas são mantidas **separadas**:

| Dimensão | Campo | Observação |
|---|---|---|
| Maturidade do projeto | `etapas[]` (status por etapa, paralelas) + `fluxoId` | etapas configuráveis; cada tipo segue um fluxo próprio |
| Fase de contratação | `pacotes[].faseContratacao` | por pacote (projeto executivo, fornecimento, montagem eletromecânica, civil, cabos, estruturas, comissionamento, energização) |
| Situação da obra | `situacaoObra` | não iniciada · mobilização · construção · comissionamento · concluída · paralisada |
| Necessidade comercial | calculada pela previsão | quando o pacote de serviços provavelmente será demandado |

Valores financeiros são sempre distintos: `capexTotal` (declarado pelo
empreendedor), `capexInfraEletrica` (declarado ou estimado) e
`oportunidadeConstrucao` (calculada pelo módulo de mercado endereçável, com
faixa e método explícitos).

Rastreabilidade: cada informação relevante aponta para `evidencias[]`
(fonte, URL, documento, trecho, data de publicação, data de coleta, validade /
última confirmação). O mapa `proveniencia` registra, por campo, o status
`confirmado | estimado | inferido | pendente` e as evidências que o sustentam.
Divergências entre fontes viram `conflitos[]` (nunca são resolvidas em
silêncio) e toda alteração gera `historico[]`.

Esquema relacional (PostGIS): `db/migrations/0001_init.sql`. Tabelas
principais: `organizacao`, `empreendimento`, `participacao`, `lote`,
`trecho_lt` (geometria `LineString` + natureza do traçado), `subestacao`
(geometria `Point` + precisão), `contrato`, `pacote_servico`, `etapa_status`,
`marco`, `evidencia`, `documento`, `fonte`, `coleta`, `proveniencia_campo`,
`conflito`, `historico_alteracao` (somente inserção), `evento_mudanca`,
`match_candidato`, `oportunidade_comercial` (contatos, interações e próximos
passos em JSONB), `alerta_regra`, `alerta_notificacao`, `snapshot_pipeline`,
`configuracao`, `job`, `audit_log`. Políticas RLS para Supabase:
`db/migrations/supabase/0002_rls.sql`.

## 5. Decisões técnicas

| Decisão | Motivo |
|---|---|
| Monorepo npm workspaces, TypeScript em tudo | um único tipo de domínio compartilhado entre API, ingestão e web |
| Regras de negócio em `core` sem I/O | testáveis, reutilizáveis no front (recalcular cenários) e no back |
| Dois repositórios (`memory` e `postgres`) com a mesma interface | o sistema roda e demonstra sem banco; produção usa PostgreSQL/PostGIS (Supabase compatível) |
| Fila de jobs em tabela PostgreSQL (`FOR UPDATE SKIP LOCKED`) | processamento assíncrono sem dependência extra (Redis); trocar por pg-boss/Cloud Tasks é simples |
| Fastify + zod | validação de entrada, logs estruturados (pino), bom desempenho |
| React 18 + Vite + Recharts + Leaflet + TanStack Table | componentes maduros, sem custo de licença |
| Mapa base OpenStreetMap | gratuito; **política de uso do OSM não permite tráfego pesado** — em produção configurar um provedor de tiles (`VITE_TILE_URL`) |
| Supabase (opcional) | Postgres + PostGIS + Auth (JWT) + Storage; a API valida o JWT no servidor |
| Previsão por regras com parâmetros configuráveis | transparência: cada data mostra âncora, premissas e evidências; calibrável com histórico |
| Confiança em níveis discretos (alta/média/baixa/muito baixa) | evita precisão numérica artificial; rubrica documentada em `METODOLOGIA.md` |
| Índice de priorização 0–100 com notas por critério | explicável; explicitamente **não é probabilidade** |

## 6. Segurança

* Credenciais apenas em variáveis de ambiente (`.env`, nunca versionado). A
  chave de IA existe **somente na API**; o front nunca a recebe.
* `AUTH_MODE=supabase`: JWT verificado no servidor (JWKS do projeto Supabase
  ou segredo HS256 legado). Papéis via `app_metadata.role`:
  `admin`, `analista`, `comercial`, `leitor`.
* `AUTH_MODE=dev` é bloqueado quando `NODE_ENV=production`.
* RLS habilitado nas tabelas do Postgres (políticas por papel) para quem
  acessar o banco diretamente via Supabase.
* Todas as mutações geram `audit_log` (quem, quando, o quê).
