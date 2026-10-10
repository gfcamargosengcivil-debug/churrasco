# Radar LT/SE ≥ 138 kV — inteligência comercial

Plataforma web para identificar, qualificar, priorizar e acompanhar oportunidades de obras de
linhas de transmissão (LT) e subestações (SE) a partir de 138 kV no Brasil: onde estarão as
próximas contratações, quando devem surgir, quem contratará e qual o potencial de serviços.

> **Princípios.** Nenhum dado de mercado é fabricado. Datas e valores calculados aparecem como
> estimativas, com premissas, memória de cálculo e nível de confiança; toda informação aponta
> para evidências (fonte, URL/documento, trecho, datas). Divergências entre fontes viram
> conflitos visíveis. Os dados de demonstração são **fictícios**, marcados como `[DEMO]` e
> removíveis.

Documentação complementar:

| Documento | Conteúdo |
|---|---|
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | diagnóstico, arquitetura, módulos, modelo de dados, decisões, segurança |
| [`docs/FONTES.md`](docs/FONTES.md) | catálogo de fontes: método de acesso, frequência, status real da integração e limitações (gerado do código) |
| [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md) | regras de previsão, confiança, mercado endereçável, prioridade, deduplicação e conflitos |

## Estrutura

```
radar-lt-se/
├── packages/core       domínio puro (tipos zod, previsão, confiança, score, mercado, dedup, mescla, alertas, geo, agregações)
├── packages/ingestion  catálogo de fontes, adaptadores (CKAN, ArcGIS, RSS, Querido Diário), planilhas CSV/XLSX, PDF/HTML, pipeline
├── packages/ai         extração documental (heurística + Claude opcional) com verificação de citação literal; resumo executivo
├── apps/api            API Fastify, repositórios memória/PostgreSQL, auth/RBAC, auditoria, fila de jobs, agendador, worker
├── apps/web            interface React (pt-BR, claro/escuro, responsiva)
├── db/migrations       esquema PostgreSQL/PostGIS (+ políticas RLS para Supabase)
├── docs/               arquitetura, fontes, metodologia
└── scripts/            documentação de fontes, teste de fumaça da interface
```

## Requisitos

- Node.js 22+ e npm 10+
- Para produção: PostgreSQL 15+ com PostGIS 3+ (ou um projeto Supabase)

## Início rápido (avaliação, sem banco)

```bash
cd radar-lt-se
npm install
npm run dev          # API em :3333 (modo memória, sem login) + web em :5173
```

Abra <http://localhost:5173>. Na primeira execução a base é preenchida com 31 empreendimentos
**fictícios** para demonstrar as telas. Remova-os em **Configurações → Dados demonstrativos**
(ou `DELETE /api/demo`) antes de usar dados reais.

O modo memória grava em `apps/api/data/radar.json` e roda a fila/agendador dentro da API. Serve
para avaliação e uso individual; para uso em equipe utilize PostgreSQL.

## Configuração

Copie os exemplos e ajuste:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

**Credenciais ficam somente em variáveis de ambiente do servidor** (`apps/api/.env`, ignorado pelo
git, ou o gerenciador de segredos da hospedagem). O front recebe apenas variáveis públicas
`VITE_*` (URL da API, URL e chave *anon* do Supabase, mapa base). A chave da Anthropic, a URL do
banco e a chave `service_role` do Supabase **nunca** devem ir para o front ou para o repositório.

Principais variáveis da API (lista completa em `apps/api/.env.example`):

| Variável | Uso |
|---|---|
| `PERSISTENCIA` | `memoria` ou `postgres` |
| `DATABASE_URL`, `DATABASE_SSL` | conexão PostgreSQL/PostGIS |
| `AUTH_MODE` | `dev` (sem login; bloqueado em produção) ou `supabase` |
| `SUPABASE_URL` ou `SUPABASE_JWT_SECRET` | validação do JWT (JWKS ou HS256) |
| `PAPEL_PADRAO` | papel quando o token não traz `app_metadata.role` |
| `ANTHROPIC_API_KEY`, `IA_MODELO` | IA documental (opcional) |
| `DEMO_AUTOCARGA` | carrega dados fictícios se a base estiver vazia (desligar em produção) |
| `WEB_DIST` | a API serve o front compilado |

## Produção com PostgreSQL/PostGIS

```bash
# 1. Esquema
DATABASE_URL=postgres://… npm run db:migrate          # idempotente; registra em schema_migracao
# Supabase: aplique também as políticas RLS
DATABASE_URL=postgres://… MIGRAR_SUPABASE=true npm run db:migrate

# 2. Build (front + API em JS único por entrada)
npm run build

# 3. Processos (variáveis em apps/api/.env ou no ambiente)
#    API (serve o front se WEB_DIST=../web/dist):
NODE_ENV=production PERSISTENCIA=postgres AUTH_MODE=supabase DEMO_AUTOCARGA=false \
  npm run start -w @radar/api
#    Worker (coletas agendadas, análise de documentos, rotina diária de janelas/alertas,
#    retrato mensal do pipeline). Pode haver várias réplicas (FOR UPDATE SKIP LOCKED):
npm run worker:prod -w @radar/api
```

### Supabase

1. Crie o projeto e habilite PostGIS (`create extension postgis` — a migração já tenta).
2. Rode as migrações com `MIGRAR_SUPABASE=true` (cria `public.radar_papel()` e políticas RLS).
3. Defina o papel de cada usuário em `app_metadata.role` (`admin`, `analista`, `comercial`,
   `leitor`) pelo painel ou pela API administrativa do Supabase.
4. API: `AUTH_MODE=supabase` e `SUPABASE_URL` (JWKS) ou `SUPABASE_JWT_SECRET`.
5. Web: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` → tela de login por e-mail/senha.

### Papéis

| Permissão | admin | analista | comercial | leitor |
|---|:-:|:-:|:-:|:-:|
| Consultar painéis, radar, fichas, exportações | ✓ | ✓ | ✓ | ✓ |
| Editar empreendimentos, resolver conflitos, revisar correspondências | ✓ | ✓ | | |
| Ingestão (importar planilhas, documentos, executar fontes) | ✓ | ✓ | | |
| Gestão comercial e regras de alerta | ✓ | ✓ | ✓ | |
| Configurações, auditoria, dados demonstrativos | ✓ | | | |

Toda escrita gera registro de auditoria (`/api/auditoria`); toda alteração de dado gera
histórico append-only com origem e justificativa.

## Operação

- **Importação manual (CSV/XLSX):** Fontes e ingestão → baixar modelo → pré-visualizar → importar.
  Cada linha exige `fonte_titulo` (evidência); linhas iniciadas por `[EXEMPLO]` são ignoradas.
  Datas até hoje entram como realizadas; futuras como previstas (divulgadas).
- **Documentos (PDF/HTML/TXT):** upload → análise → revisão humana item a item → aplicação como
  dado **inferido** com a citação literal como evidência. Sem `ANTHROPIC_API_KEY` usa extração
  heurística (regex); PDFs escaneados precisam de OCR externo antes do upload.
- **Coletas automáticas:** Fontes e ingestão → configurar a fonte (ex.: `resourceId` do CKAN,
  URL do serviço ArcGIS, URLs de feeds RSS) → executar. O agendador dispara cada fonte conforme
  a frequência do catálogo. Falta de configuração gera erro registrado sem retentativa;
  falhas de rede são retentadas com atraso exponencial (até 3 vezes).
- **Revisão:** Qualidade e revisão → correspondências duvidosas (vincular / criar novo /
  descartar), conflitos entre fontes (resolver com justificativa), possíveis duplicidades.
- **Alertas:** regras por tipo de evento, setor, região, UF, tensão, janela, cliente ou
  empreendimento; notificações no app. E-mail ainda não implementado (ver pendências).
- **Excel / Power BI:** `GET /api/export/radar.xlsx` (planilha com abas) e
  `GET /api/export/{empreendimentos|previsoes|marcos|oportunidades|score}.csv`
  (separador `;`, UTF-8 com BOM). No Power BI use *Obter dados → Web* com o cabeçalho
  `Authorization: Bearer <token>` quando a autenticação estiver ativa.

### Incluir uma nova fonte

1. Acrescente a entrada em `packages/ingestion/src/fontes/catalogo.ts` com método de acesso,
   frequência, classe da fonte (A–D), limitações e **status real** da integração.
2. Se houver acesso automatizável, implemente um `Adaptador` (`packages/ingestion/src/adaptadores/`)
   que devolva `RegistroNormalizado[]` com evidência, e registre-o em `ADAPTADORES`.
   Sem API viável, use importação manual (planilha/documento) — não simule a integração.
3. `npm run docs:fontes` para regenerar `docs/FONTES.md`; adicione testes com respostas gravadas.

## Testes

```bash
npm run typecheck     # TypeScript em todos os pacotes
npm test              # unitários + API em memória (93 testes)
DATABASE_URL_TESTE=postgres://…/banco_descartavel npm test   # + mesma suíte de API sobre PostgreSQL (recria o schema public!)
npm run test:ui       # fumaça da interface (API e web rodando; Chromium/Playwright)
```

## Estado atual, dependências e limitações

**Implementado e testado:** domínio completo (previsão em 3 cenários por escopo LT/SE,
confiança, mercado endereçável, índice de prioridade, deduplicação, mescla com conflitos e
histórico, alertas, clusters/corredores); API com RBAC, auditoria, fila e agendador;
repositório PostgreSQL/PostGIS (suíte de API completa executada contra PostGIS 3.4); importação
CSV/XLSX; extração documental com verificação de citação; todas as telas.

**Depende de credenciais/configuração:**

| Item | Necessário |
|---|---|
| Banco de produção | `DATABASE_URL` (PostgreSQL + PostGIS ou Supabase) |
| Login e papéis | projeto Supabase (`SUPABASE_URL`/`SUPABASE_JWT_SECRET`, `VITE_SUPABASE_*`) |
| IA generativa (extração e resumo) | `ANTHROPIC_API_KEY` — custo por token na API da Anthropic |
| Diário Oficial (INLABS) | `INLABS_EMAIL`/`INLABS_SENHA` + implementação do download |
| CKAN ANEEL/ONS | `resourceId` dos conjuntos na configuração da fonte |
| Camadas ArcGIS (EPE/SIGEL) | URL do serviço/camada na configuração da fonte |
| RSS setorial | URLs dos feeds na configuração da fonte |

**Pendente / limitações conhecidas:**

- Adaptadores CKAN, ArcGIS, RSS e Querido Diário foram escritos conforme a documentação pública,
  mas **não validados** contra os endpoints reais (rede bloqueada no ambiente de desenvolvimento);
  ANEEL REA, EPE PDE, ONS PAR/PEL, IBAMA e INLABS estão como adaptador preparado + importação manual.
- Envio de alertas por e-mail (SMTP) não implementado — notificações apenas no app.
- OCR de PDFs escaneados não incluído.
- Parâmetros de mercado (R$/km, R$/SE) são **ilustrativos**: substitua pela base de custos da
  empresa em Configurações. Premissas de prazo devem ser calibradas com o histórico (tela de
  calibração exige ≥ 8 observações por intervalo).
- Mapa base OpenStreetMap: respeite a [política de uso de tiles](https://operations.osmfoundation.org/policies/tiles/);
  para uso corporativo intenso configure um provedor próprio (`VITE_TILE_URL`).
