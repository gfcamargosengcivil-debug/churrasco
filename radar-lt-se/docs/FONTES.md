# Catálogo de fontes

> Gerado por `npm run docs:fontes` a partir de `packages/ingestion/src/fontes/catalogo.ts`. Não editar à mão.

Princípios: nenhuma integração é declarada como validada sem teste contra o serviço real; quando não há API
utilizável, a fonte opera por **importação manual (CSV/XLSX)** ou **extração documental assistida** com revisão.
A data da última coleta de cada fonte fica registrada na tela **Fontes e ingestão** (tabela `fonte` / `coleta`).

## Classes de confiabilidade

- **A** — Documento oficial aplicável (ANEEL, MME, EPE, ONS, órgão ambiental, Diário Oficial, contrato).
- **B** — Comunicação oficial do empreendedor (RI, fato relevante, relatório de sustentabilidade, site oficial).
- **C** — Imprensa setorial ou terceiros com citação de fonte.
- **D** — Informação informal/comercial não verificada.

## Resumo

| Fonte | Classe | Método | Frequência | Status da integração |
|---|---|---|---|---|
| ANEEL — Portal de Dados Abertos (CKAN) | A | API CKAN (dados abertos) | Mensal | Implementado — não validado contra o endpoint real |
| ANEEL — SIGA (empreendimentos de geração) via Dados Abertos | A | API CKAN (dados abertos) | Mensal | Implementado — não validado contra o endpoint real |
| ANEEL — Leilões de transmissão (editais, lotes e resultados) | A | Download de arquivo (CSV/XLSX) | Eventual (por publicação) | Importação manual |
| ANEEL — Resoluções Autorizativas (reforços e melhorias) | A | Documento PDF | Semanal | Adaptador preparado (requer configuração/credencial) |
| ANEEL — Relatórios de acompanhamento/fiscalização de empreendimentos de transmissão | A | Download de arquivo (CSV/XLSX) | Mensal | Importação manual |
| EPE — Plano Decenal de Expansão de Energia (PDE) | A | Documento PDF | Anual | Adaptador preparado (requer configuração/credencial) |
| EPE — Programa de Expansão da Transmissão / Plano de Expansão de Longo Prazo (PET/PELP) | A | Download de arquivo (CSV/XLSX) | Anual | Importação manual |
| EPE — WebMap (serviços ArcGIS REST de LT e SE) | A | API ArcGIS REST | Trimestral | Implementado — não validado contra o endpoint real |
| ONS — Portal de Dados Abertos (CKAN) | A | API CKAN (dados abertos) | Mensal | Implementado — não validado contra o endpoint real |
| ONS — Plano de Ampliações e Reforços / Plano da Operação Elétrica (PAR/PEL) | A | Documento PDF | Anual | Adaptador preparado (requer configuração/credencial) |
| MME — Plano de Outorgas de Transmissão (POTEE) e diretrizes | A | Download de arquivo (CSV/XLSX) | Eventual (por publicação) | Importação manual |
| CCEE — Resultados de leilões de energia (geração contratada) | A | Download de arquivo (CSV/XLSX) | Eventual (por publicação) | Importação manual |
| IBAMA — Licenciamento ambiental federal (LP/LI/LO) | A | Página HTML | Semanal | Adaptador preparado (requer configuração/credencial) |
| Órgãos ambientais estaduais (OEMAs) | A | Importação/registro manual | Manual | Importação manual |
| Diário Oficial da União — INLABS (Imprensa Nacional) | A | API REST | Diária | Adaptador preparado (requer configuração/credencial) |
| Querido Diário (OKBR) — diários oficiais municipais | A | API REST | Semanal | Implementado — não validado contra o endpoint real |
| Feeds RSS/Atom (imprensa setorial e RI de empresas) | C | RSS/Atom | Diária | Implementado — não validado contra o endpoint real |
| Relações com investidores, relatórios de sustentabilidade e anúncios de CAPEX | B | Documento PDF | Trimestral | Importação manual |
| Portais de fornecedores / processos de cotação de clientes | B | Importação/registro manual | Manual | Importação manual |
| Registro manual da equipe | C | Importação/registro manual | Manual | Importação manual |
| Importação de planilha (CSV/XLSX) — origem a declarar | C | Download de arquivo (CSV/XLSX) | Manual | Implementado e validado |
| DADOS DEMONSTRATIVOS FICTÍCIOS | D | Importação/registro manual | Manual | Implementado e validado |

## Detalhamento

### ANEEL — Portal de Dados Abertos (CKAN)

- **Id:** `aneel-dados-abertos` · **Órgão:** ANEEL · **Classe:** A
- **Portal:** https://dadosabertos.aneel.gov.br
- **Método de acesso:** API CKAN (dados abertos) (adaptador `ckan`)
- **Frequência esperada:** Mensal
- **Status:** Implementado — não validado contra o endpoint real — desativada até configuração
- **Limitações conhecidas:**
  - Endpoint não validado contra o serviço real: o ambiente de desenvolvimento não tinha acesso de rede a este domínio. Validar na implantação (Fontes → Testar conexão).
  - É necessário informar o resource_id do conjunto de interesse e revisar o mapeamento de colunas (nomes variam entre conjuntos).
  - Acompanhamento detalhado de obras de transmissão pode estar disponível apenas em relatórios (PDF/planilhas), não no datastore.
- **Termos de uso:** Dados abertos governamentais; respeitar limites de requisição do portal.

### ANEEL — SIGA (empreendimentos de geração) via Dados Abertos

- **Id:** `aneel-siga` · **Órgão:** ANEEL · **Classe:** A
- **Portal:** https://dadosabertos.aneel.gov.br
- **Método de acesso:** API CKAN (dados abertos) (adaptador `ckan`)
- **Frequência esperada:** Mensal
- **Status:** Implementado — não validado contra o endpoint real — desativada até configuração
- **Limitações conhecidas:**
  - Endpoint não validado contra o serviço real: o ambiente de desenvolvimento não tinha acesso de rede a este domínio. Validar na implantação (Fontes → Testar conexão).
  - Lista usinas (não as obras de conexão): serve como sinal de demanda de LT/SE de conexão; a tensão de conexão geralmente não consta.
  - Informar resource_id e mapeamento de colunas.

### ANEEL — Leilões de transmissão (editais, lotes e resultados)

- **Id:** `aneel-leiloes-transmissao` · **Órgão:** ANEEL · **Classe:** A
- **Portal:** https://www.gov.br/aneel
- **Método de acesso:** Download de arquivo (CSV/XLSX) (adaptador `planilha`)
- **Frequência esperada:** Eventual (por publicação)
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Editais e anexos técnicos publicados em PDF; resultados em comunicados/planilhas sem API estável.
  - Operação: importar lotes pela planilha modelo (CSV/XLSX) ou enviar o edital/anexo para extração documental assistida (revisão obrigatória).

### ANEEL — Resoluções Autorizativas (reforços e melhorias)

- **Id:** `aneel-rea` · **Órgão:** ANEEL · **Classe:** A
- **Portal:** https://www.gov.br/aneel
- **Método de acesso:** Documento PDF (adaptador `documento`)
- **Frequência esperada:** Semanal
- **Status:** Adaptador preparado (requer configuração/credencial)
- **Limitações conhecidas:**
  - REAs são publicadas no DOU e na biblioteca da ANEEL em texto/PDF; sem API estruturada utilizada.
  - Operação: enviar o documento (PDF/texto) para extração assistida; coleta automática depende do adaptador do DOU (INLABS).

### ANEEL — Relatórios de acompanhamento/fiscalização de empreendimentos de transmissão

- **Id:** `aneel-acompanhamento-transmissao` · **Órgão:** ANEEL · **Classe:** A
- **Portal:** https://www.gov.br/aneel
- **Método de acesso:** Download de arquivo (CSV/XLSX) (adaptador `planilha`)
- **Frequência esperada:** Mensal
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Localizar a publicação vigente; o formato (planilha ou PDF) e as colunas podem mudar entre edições.
  - Operação: importar via planilha com mapeamento de colunas ou extração documental.

### EPE — Plano Decenal de Expansão de Energia (PDE)

- **Id:** `epe-pde` · **Órgão:** EPE/MME · **Classe:** A
- **Portal:** https://www.epe.gov.br
- **Método de acesso:** Documento PDF (adaptador `documento`)
- **Frequência esperada:** Anual
- **Status:** Adaptador preparado (requer configuração/credencial)
- **Limitações conhecidas:**
  - Publicado em relatórios PDF e cadernos; obras de transmissão listadas em anexos.
  - Operação: extração documental assistida dos anexos de transmissão (revisão obrigatória).

### EPE — Programa de Expansão da Transmissão / Plano de Expansão de Longo Prazo (PET/PELP)

- **Id:** `epe-pet-pelp` · **Órgão:** EPE · **Classe:** A
- **Portal:** https://www.epe.gov.br
- **Método de acesso:** Download de arquivo (CSV/XLSX) (adaptador `planilha`)
- **Frequência esperada:** Anual
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Quando houver planilha anexa, importar com mapeamento de colunas; caso contrário, extração documental.

### EPE — WebMap (serviços ArcGIS REST de LT e SE)

- **Id:** `epe-webmap` · **Órgão:** EPE · **Classe:** A
- **Portal:** https://gisepe.epe.gov.br
- **Método de acesso:** API ArcGIS REST (adaptador `arcgis`)
- **Frequência esperada:** Trimestral
- **Status:** Implementado — não validado contra o endpoint real — desativada até configuração
- **Limitações conhecidas:**
  - Endpoint não validado contra o serviço real: o ambiente de desenvolvimento não tinha acesso de rede a este domínio. Validar na implantação (Fontes → Testar conexão).
  - Informar a URL do serviço/camada (planejadas ou existentes) após conferência no portal.
  - Geometrias de planejamento são indicativas: registradas como traçado "aproximado_digitalizado", nunca como traçado executivo.

### ONS — Portal de Dados Abertos (CKAN)

- **Id:** `ons-dados-abertos` · **Órgão:** ONS · **Classe:** A
- **Portal:** https://dados.ons.org.br
- **Método de acesso:** API CKAN (dados abertos) (adaptador `ckan`)
- **Frequência esperada:** Mensal
- **Status:** Implementado — não validado contra o endpoint real — desativada até configuração
- **Limitações conhecidas:**
  - Endpoint não validado contra o serviço real: o ambiente de desenvolvimento não tinha acesso de rede a este domínio. Validar na implantação (Fontes → Testar conexão).
  - Conjuntos tratam majoritariamente da rede existente; a expansão (PAR/PEL) é publicada em relatórios.

### ONS — Plano de Ampliações e Reforços / Plano da Operação Elétrica (PAR/PEL)

- **Id:** `ons-par-pel` · **Órgão:** ONS · **Classe:** A
- **Portal:** https://www.ons.org.br
- **Método de acesso:** Documento PDF (adaptador `documento`)
- **Frequência esperada:** Anual
- **Status:** Adaptador preparado (requer configuração/credencial)
- **Limitações conhecidas:**
  - Relatórios em PDF; extração assistida das obras recomendadas com revisão obrigatória.

### MME — Plano de Outorgas de Transmissão (POTEE) e diretrizes

- **Id:** `mme-potee` · **Órgão:** MME · **Classe:** A
- **Portal:** https://www.gov.br/mme
- **Método de acesso:** Download de arquivo (CSV/XLSX) (adaptador `planilha`)
- **Frequência esperada:** Eventual (por publicação)
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Publicações em documento/planilha; importar com mapeamento ou extração documental.

### CCEE — Resultados de leilões de energia (geração contratada)

- **Id:** `ccee-leiloes-geracao` · **Órgão:** CCEE · **Classe:** A
- **Portal:** https://www.ccee.org.br
- **Método de acesso:** Download de arquivo (CSV/XLSX) (adaptador `planilha`)
- **Frequência esperada:** Eventual (por publicação)
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Planilhas de resultado por leilão; vencedores indicam demanda de conexão (LT/SE) a confirmar no parecer de acesso.

### IBAMA — Licenciamento ambiental federal (LP/LI/LO)

- **Id:** `ibama-licenciamento` · **Órgão:** IBAMA · **Classe:** A
- **Portal:** https://www.gov.br/ibama
- **Método de acesso:** Página HTML (adaptador `documento`)
- **Frequência esperada:** Semanal
- **Status:** Adaptador preparado (requer configuração/credencial)
- **Limitações conhecidas:**
  - Consulta pública por processo; nenhuma API foi integrada. Registrar licenças via planilha, documento (PDF da licença) ou registro manual.

### Órgãos ambientais estaduais (OEMAs)

- **Id:** `oemas` · **Órgão:** Diversos · **Classe:** A
- **Método de acesso:** Importação/registro manual (adaptador `planilha`)
- **Frequência esperada:** Manual
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Sistemas heterogêneos por estado; cadastrar licenças via planilha/documento.

### Diário Oficial da União — INLABS (Imprensa Nacional)

- **Id:** `dou-inlabs` · **Órgão:** Imprensa Nacional · **Classe:** A
- **Portal:** https://inlabs.in.gov.br
- **Método de acesso:** API REST (adaptador `inlabs`)
- **Frequência esperada:** Diária
- **Status:** Adaptador preparado (requer configuração/credencial) — desativada até configuração
- **Credenciais (variáveis de ambiente do servidor):** `INLABS_EMAIL`, `INLABS_SENHA`
- **Limitações conhecidas:**
  - Requer cadastro e credenciais no INLABS. O adaptador está preparado (interface e filtro por palavras-chave), mas o download não foi implementado nem validado.

### Querido Diário (OKBR) — diários oficiais municipais

- **Id:** `querido-diario` · **Órgão:** Open Knowledge Brasil · **Classe:** A
- **Portal:** https://queridodiario.ok.org.br
- **Método de acesso:** API REST (adaptador `querido_diario`)
- **Frequência esperada:** Semanal
- **Status:** Implementado — não validado contra o endpoint real — desativada até configuração
- **Limitações conhecidas:**
  - Endpoint não validado contra o serviço real: o ambiente de desenvolvimento não tinha acesso de rede a este domínio. Validar na implantação (Fontes → Testar conexão).
  - Cobertura municipal parcial. Resultados entram como SINAIS para triagem (não criam empreendimentos automaticamente).

### Feeds RSS/Atom (imprensa setorial e RI de empresas)

- **Id:** `rss-setorial` · **Órgão:** Diversos · **Classe:** C
- **Método de acesso:** RSS/Atom (adaptador `rss`)
- **Frequência esperada:** Diária
- **Status:** Implementado — não validado contra o endpoint real — desativada até configuração
- **Limitações conhecidas:**
  - Nenhum feed pré-configurado: cadastrar URLs de feeds cujo uso seja permitido pelos termos do veículo.
  - Armazena apenas título, link, data e resumo; itens entram como SINAIS para triagem.

### Relações com investidores, relatórios de sustentabilidade e anúncios de CAPEX

- **Id:** `ri-empresas` · **Órgão:** Empresas · **Classe:** B
- **Método de acesso:** Documento PDF (adaptador `documento`)
- **Frequência esperada:** Trimestral
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Enviar releases/apresentações (PDF) para extração assistida ou registrar manualmente com link da fonte.

### Portais de fornecedores / processos de cotação de clientes

- **Id:** `portais-fornecedores` · **Órgão:** Empresas · **Classe:** B
- **Método de acesso:** Importação/registro manual (adaptador `planilha`)
- **Frequência esperada:** Manual
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Acesso autenticado e termos de uso normalmente vedam coleta automatizada: registrar RFQ/RFP manualmente.

### Registro manual da equipe

- **Id:** `manual` · **Órgão:** Interno · **Classe:** C
- **Método de acesso:** Importação/registro manual (adaptador `manual`)
- **Frequência esperada:** Manual
- **Status:** Importação manual
- **Limitações conhecidas:**
  - Informação interna: sempre que possível, anexar a fonte original e escolher a fonte correspondente.

### Importação de planilha (CSV/XLSX) — origem a declarar

- **Id:** `importacao-planilha` · **Órgão:** Interno · **Classe:** C
- **Método de acesso:** Download de arquivo (CSV/XLSX) (adaptador `planilha`)
- **Frequência esperada:** Manual
- **Status:** Implementado e validado
- **Limitações conhecidas:**
  - Use a fonte específica (ex.: ANEEL Leilões) ao importar dados de origem oficial para herdar a classe correta.

### DADOS DEMONSTRATIVOS FICTÍCIOS

- **Id:** `demo` · **Órgão:** Plataforma · **Classe:** D
- **Método de acesso:** Importação/registro manual (adaptador `demo`)
- **Frequência esperada:** Manual
- **Status:** Implementado e validado
- **Limitações conhecidas:**
  - Dados inventados para demonstração da interface. Não representam empreendimentos, empresas ou valores reais.

## Como incluir uma nova fonte

1. Acrescente a entrada em `packages/ingestion/src/fontes/catalogo.ts` (classe, método, frequência, limitações, status honesto).
2. Se houver API/arquivo estruturado, reutilize um adaptador existente (`ckan`, `arcgis`, `rss`, `querido_diario`) configurando `config`,
   ou crie um novo implementando a interface `Adaptador` (`packages/ingestion/src/adaptadores/tipos.ts`) e registre em `ADAPTADORES`.
3. Escreva teste com resposta simulada (veja `packages/ingestion/test/ingestao.test.ts`).
4. Valide contra o serviço real em homologação (Fontes → Executar agora) e só então altere o status para `implementado`.
5. Rode `npm run docs:fontes` para atualizar este documento.
