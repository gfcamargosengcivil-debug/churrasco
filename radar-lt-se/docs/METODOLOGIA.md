# Metodologia

Este documento descreve como a plataforma calcula janelas de contratação, confiança,
mercado endereçável, prioridade, deduplicação e tratamento de conflitos. As mesmas regras
estão no código (`packages/core`) e são exibidas na interface (página **Metodologia** e
"memória de cálculo" de cada empreendimento).

> **Premissas não são dados de mercado.** Todos os prazos e valores de referência padrão
> são premissas iniciais configuráveis (Configurações), a serem substituídas pelo histórico
> e pela base de custos da empresa. A interface marca essas premissas como tal.

## 1. Dimensões separadas

| Dimensão | Onde | Observação |
|---|---|---|
| Maturidade do projeto | `etapas[]` + fluxo | 10 etapas configuráveis; cada etapa tem status próprio (paralelismo permitido) e evidências |
| Fase de contratação | `pacotes[]` por pacote e escopo (LT/SE) | projeto executivo, fornecimento, montagem eletromecânica, civil, cabos, estruturas, comissionamento, energização |
| Situação da obra | `situacaoObra` | não iniciada → mobilização → construção → comissionamento → concluída (ou paralisada) |
| Necessidade comercial | calculada | quando o pacote de serviços deve ser demandado (RFQ estimada no cenário base) |

Uma concessão assinada ou uma licença emitida **não** é tratada como contratação de obra:
é apenas um marco a partir do qual a contratação é estimada.

Quando a fonte não registra o andamento por etapa (caso dos cadastros oficiais, que trazem outorga
e prazos), a **etapa atual é inferida** do marco ou situação mais avançada: energização realizada →
comissionamento; obra/mobilização → construção; RFQ/contrato de execução → contratação de execução;
outorga, leilão ou FID realizados (ou situação outorgada/autorizada) → concessão; edital/consulta
pública → contratação regulatória; licenças → licenciamento; inclusão em plano → planejamento;
anúncio → sinal de mercado. A ficha indica que a etapa é inferida.

Fluxos padrão: transmissão por leilão; reforço/melhoria autorizado (REA); privado
(mineração/indústria/grandes consumidores); conexão de geração; distribuição AT.

## 2. Janelas de contratação (previsão)

Para cada empreendimento são estimados, separadamente e em três cenários:
RFQ/RFP, contratação de LT, contratação de SE, assinatura do contrato de execução,
mobilização, início das obras, energização e próximo marco.

### 2.1 Regras de precedência

1. **Evento observado** (marco realizado, pacote em cotação/contratado, contrato assinado) — natureza `realizado`.
2. **Data divulgada** por fonte (marco "previsto (divulgado)") — natureza `divulgado` no cenário base; nos cenários otimista/conservador recebe o ajuste do cenário.
3. **Cálculo a partir de marco verificável** (âncora) + premissa — natureza `calculado_de_marco`.
4. **Sinal fraco** (anúncio, inclusão em plano) + premissas — natureza `heuristico`.

A âncora é o marco mais avançado disponível, nesta ordem: outorga realizada (contrato de
concessão/REA) → contratação principal/vencedor definido (privados) → decisão final de
investimento (privados) → parecer de acesso (geração) → outorga prevista divulgada →
leilão realizado (+ prazo até assinatura) → leilão previsto → edital → inclusão em
plano/consulta pública (heurístico) → anúncio (heurístico).

### 2.1.1 Escopos LT e SE separados

A previsão é feita por escopo (LT e SE) e por pacote. Um escopo com pacote já contratado
não gera nova janela; o início de obra só é usado para inferir contratação de um escopo
quando não há pacote pendente daquele escopo. A RFQ "geral" é a mais cedo entre os escopos
pendentes. Se qualquer escopo pendente estiver em cotação, a necessidade é **imediata**.

### 2.2 Cálculo progressivo e regressivo

- **Progressivo:** âncora + prazo (outorga → RFQ de LT/SE; FID → RFQ; RFQ → contrato; contrato → mobilização; mobilização → obras).
- **Licença de Instalação:** a mobilização é a mais tardia entre "contrato + prazo" e "LI (real, divulgada ou estimada) + prazo".
  LI já emitida (ou divulgada) sem RFQ identificada impõe um **teto** à RFQ: LI + prazo "LI → RFQ" (0 / 2 / 4 meses),
  pois o empreendedor tende a contratar logo após a licença.
- **Regressivo:** quando há prazo de energização (contratual ou divulgado), calcula-se a data-limite de RFQ =
  energização − comissionamento − duração da obra − mobilização→obras − contrato→mobilização − RFQ→contrato.
  Nos cenários otimista e base a RFQ não é prevista depois dessa data-limite (aviso "cronograma apertado").
- **Duração da obra de LT:** fixo + meses por 100 km × extensão (limitada a 8–36 meses). SE: por natureza (nova, ampliação, seccionamento, adequação).
- **Energização:** realizada; ou data divulgada ± ajuste do cenário (substituída pela estimativa física quando esta for mais de 3 meses posterior — com aviso); ou início das obras + duração + comissionamento.
- Datas estimadas que já passaram sem evidência ficam marcadas como **vencidas** e a necessidade comercial vira **"verificar"** (possível contratação não identificada ou atraso).

### 2.3 Premissas padrão (meses: otimista / base / conservador)

| Intervalo | Valor |
|---|---|
| Leilão → assinatura da concessão | 2 / 3 / 5 |
| Inclusão em plano → outorga | 12 / 24 / 36 |
| Edital → leilão | 1 / 2 / 3 |
| Outorga → RFQ de LT | 3 / 6 / 10 |
| Outorga → RFQ de SE | 4 / 8 / 12 |
| Outorga → LI (quando não emitida) | 9 / 14 / 20 |
| Anúncio → FID | 6 / 12 / 24 |
| FID / contratação principal → RFQ | 2 / 4 / 8 |
| Parecer de acesso → RFQ | 4 / 8 / 14 |
| Pré-qualificação/RFI → RFQ | 1 / 2 / 3 |
| LI emitida → RFQ (teto) | 0 / 2 / 4 |
| RFQ → contrato | 2 / 3 / 5 |
| Contrato → mobilização | 1 / 2 / 3 |
| LI → mobilização | 0 / 1 / 3 |
| Mobilização → obras | 1 / 1 / 2 |
| Obra de LT | (8 / 10 / 13) + (2 / 3 / 4) por 100 km |
| Obra de SE nova / ampliação / seccionamento / adequação | 12-15-20 / 6-9-12 / 6-8-11 / 4-6-9 |
| Comissionamento | 1 / 2 / 3 |
| Ajuste sobre energização divulgada | −3 / 0 / +6 |
| Ajuste sobre outras datas divulgadas | 0 / 0 / +3 |

**Recalculo:** a previsão é recalculada a cada consulta a partir dos dados atuais; a
"assinatura de entrada" (hash dos marcos, pacotes, contratos, extensão, status e
parâmetros) permite identificar quando algo relevante mudou.

**Calibração:** Configurações → Calibração mede, na própria base (excluindo dados
demonstrativos), os intervalos reais entre marcos realizados e propõe P20/P50/P80 como
otimista/base/conservador quando há ao menos 8 observações. A proposta não é aplicada
automaticamente.

## 3. Confiança da previsão

Rubrica de pontos (sem precisão artificial; resultado em níveis):

| Critério | Pontos | Regra |
|---|---|---|
| Qualidade da fonte do marco de referência | 0–3 | classe A = 3, B = 2, C = 1, D/sem evidência = 0 (evidência não vinculada ao marco: máx. 1) |
| Atualidade | 0–2 | última confirmação ≤ 90 dias = 2; ≤ 365 = 1; mais antiga = 0 |
| Evidências independentes | 0–2 | fontes distintas sustentando marcos: ≥ 3 = 2; 2 = 1; ≤ 1 = 0 |
| Consistência dos marcos | 0–2 | sem problemas = 2; previsão vencida sem atualização = 1; ordem impossível, data futura "realizada" ou conflito de datas aberto = 0 |
| Método | 0–2 | realizado/divulgado = 2; calculado de marco = 1; heurístico = 0 |

Nível: ≥ 9 **alta**; ≥ 6 **média**; ≥ 3 **baixa**; < 3 **muito baixa**.
Limitadores: método heurístico → no máximo baixa; inconsistência grave → no máximo média;
sem evidências → muito baixa. **Não é probabilidade.**

## 4. Mercado endereçável

Três grandezas nunca se confundem:

1. **CAPEX total** do empreendimento (ex.: mina, planta, usina) — exibido, nunca somado ao mercado.
2. **Investimento em infraestrutura elétrica** (LT/SE) — declarado pela fonte ou ausente.
3. **Oportunidade de serviços de construção** — o que é endereçável à construtora.

Método por empreendimento (faixa mínimo–máximo; central = ponto médio):

- **Já contratado:** pacotes de construção adjudicados/contratados → excluídos (oportunidade 0 naquele escopo).
- **% do investimento elétrico declarado:** LT 25–40%, SE 15–30% (premissa); divisão LT/SE proporcional à referência paramétrica ou 50/50 com aviso.
- **Paramétrico físico:** km de LT × R$/km por classe de tensão; SE por natureza e classe.
- **Não estimável:** quando só há CAPEX total ou faltam extensão/tensão.

Os valores paramétricos padrão são **ilustrativos** (ordem de grandeza) e aparecem como
premissa na interface até serem substituídos pela base de custos da empresa.

## 5. Índice de priorização

Dez critérios com nota 0–5 por regra explícita e justificativa, ponderados por pesos
configuráveis; índice = média ponderada × 100. Faixas padrão: alta ≥ 75; média ≥ 55.
Fora do escopo (< 138 kV) e empreendimentos cancelados, concluídos, suspensos ou adiados
ficam limitados abaixo da faixa média.

| Critério | Peso padrão | Regra resumida |
|---|---|---|
| Aderência técnica | 15 | < 138 kV = 0 (fora do escopo); HVDC sem experiência = 1; tensão na experiência = 4 (+1 se LT+SE) |
| Potencial de receita | 12 | faixas do valor central (R$ 20/60/150/400 mi); não estimável = 2 |
| Proximidade da janela | 15 | ≤ 6 meses = 5; ≤ 12 = 4; ≤ 24 = 3; ≤ 36 = 2; > 36 = 1; verificar = 3; já contratada = 0 |
| Probabilidade de execução (qualitativa) | 12 | outorga/FID + LI = 5; outorga/FID = 4; leilão/LP/financiamento = 3; plano = 2; anúncio = 1 |
| Maturidade | 8 | por etapa atual |
| Visibilidade do contratante | 8 | contratante identificado, contatos, interações recentes, status de prospecção |
| Atratividade geográfica | 8 | UF prioritária = 5; UF de atuação = 4; distância da base |
| Capacidade de execução | 7 | porte dentro da faixa da empresa; extensão vs capacidade anual |
| Competitividade | 10 | nenhum contrato = 5; EPC/parcial = 3; contratado = 0 |
| Risco (invertido) | 5 | status, conflitos, adiamentos, escopo indefinido, fundiário, confiança |

O índice serve para **ordenar** oportunidades. Calibração: com ≥ 20 oportunidades
disputadas com resultado registrado, a tela de calibração compara o desempenho das faixas.

## 6. Deduplicação e conflitos

Pontuação de correspondência (0–1): identificador oficial igual = 1 (decisivo); nome
(similaridade de tokens/bigramas, extremidades de LT em qualquer ordem) até 0,45; tensão
igual +0,15 (diferente −0,20); UF em comum +0,10 (nenhuma −0,25); mesmo
empreendedor +0,15; localização ≤ 60 km +0,10 (> 180 km −0,15); extensão compatível +0,05.
≥ 0,85 vincula automaticamente (sem ambiguidade); 0,55–0,85 vai para **revisão manual**;
abaixo cria novo empreendimento.

**Identidade estrutural de LT.** Uma LT é identificada por extremidades + tensão + circuito
(seccionamentos: LT seccionada + SE de seccionamento). Extremidades são comparadas pelo nome canônico
(sem acentos, prefixo "SE", apelido entre parênteses e UF; numeração romana convertida); tolerância de
grafia só quando a numeração coincide ("Juazeiro II" ≠ "Juazeiro III"). Mesmas extremidades, tensão e
circuito em todas as LTs de um dos lados → correspondência forte (≥ 0,86, prevalece sobre diferenças
de localização e extensão indicativas); mesmas extremidades com circuitos diferentes → instalações
distintas (−0,35); LTs com extremidades distintas → −0,15. A tensão é comparada com o conjunto de
tensões do empreendimento (uma LT 230 kV de um empreendimento 500/230 kV é compatível).
Identificadores exclusivos (código SIGET, código ONS, lote de leilão, CEG) diferentes provam que são
empreendimentos distintos; contrato de concessão e REA são compartilhados por vários empreendimentos
e apenas somam pontos. A chave do item na fonte é guardada e reconhece o mesmo item nas coletas
seguintes (prevalece sobre os demais identificadores).

**Fontes complementares.** Planejamento (EPE) e lotes de leilão, ao se ligarem a um empreendimento
já documentado por outra fonte, só acrescentam evidência, traçado de trechos correspondentes,
participantes e marcos de tipos ainda ausentes. Nomes, identificadores e investimento/RAP só quando o
registro é exatamente a mesma instalação (mesmas LTs, tensões e circuitos dos dois lados, pelo nome
oficial e trechos do empreendimento); UFs e localização só quando o registro é parte do empreendimento.
Um lote que abrange vários empreendimentos já acompanhados (todas as LTs de cada um estão no lote) é
ligado a cada parte, sem investimento atribuído e sem criar cadastro sobreposto. Extensão total, tipo e
situações não são comparados entre parte e todo; o tipo combina escopos (LT + SE = LT+SE) sem conflito.
O investimento previsto pela ANEEL no edital é gravado como **estimativa** (data-base = data do leilão);
a RAP vencedora, como valor declarado.

**Execução sem revisor** (publicação automática): correspondências incertas (0,55–0,85) viram
empreendimentos novos em vez de ficarem pendentes; os pares semelhantes aparecem em Qualidade →
Possíveis duplicidades.

Mescla: valor novo → proveniência; valor igual → reforço (nova evidência, última
confirmação); valor divergente → **conflito visível** com todos os valores e fontes. O
valor adotado segue: maior classe de fonte → publicação mais recente → mantém o atual;
o conflito permanece aberto até resolução manual com justificativa. Revisões de datas
previstas por fonte de classe igual/maior ou mais recente atualizam o marco e geram
evento de "revisão de cronograma" (e "atraso" se ≥ 60 dias). Extrações por IA entram
sempre como **inferidas**.

## 7. Fontes automáticas e mapeamento

| Fonte | Campo oficial | Uso na plataforma |
|---|---|---|
| ANEEL SIGET | `DscSituacaoEpd` | Em andamento/Planejado → ativo; Em Operação/Concluído (últimos 12 meses) → concluído |
| | `DatCaoCgmAtoLgl` ("previsão de conclusão no ato legal") | prazo contratual de energização (divulgado) |
| | `DatOprComEpd` | data de operação comercial registrada (divulgada), quando difere do prazo |
| | `DatEfeOprComEpd` | operação comercial realizada |
| | Resolução (REA): `DatPubDoc`/`DatAssDoc`, `DscLink` | autorização publicada (realizado), link do ato |
| | Contrato: `DatAsnCcd`, razão social | outorga (só se compatível com o prazo do escopo), concessionária (contrato da REA → dos módulos de LT → mais frequente; módulos em vários contratos geram nota "verificar") |
| | Nome (`NomEpd`) e módulos | tensões da obra (nada acima das tensões citadas no nome; módulos gerais MG/IB/EL excluídos); SEs citadas (nova quando o nome as lista como item) |
| | Módulos LT: origem/destino, `NumEtnLinTms`, circuitos | trechos; extensão só de obras de instalação |
| ANEEL leilões de transmissão | data, lote, `QtdPrazoConstrucaoMeses`, km, MVA, `VlrInvestimentoPrevisto`, `VlrRAPVencedorLeilao`, vencedor | leilão realizado, investimento de referência (**estimativa** do edital), RAP vencedora (declarada), energização **estimada** (leilão + premissa + prazo do edital, rotulada); lotes com energização estimada há mais de 12 meses não são coletados; o status não é afirmado pela fonte |
| EPE WebMap | nome, ano previsto, tensão, extensão, geometria | inclusão em plano, energização **estimada** a partir do ano (01/07 do ano, precisão anual — não é data divulgada), traçado aproximado, UF pela geometria (código IBGE); extensão validada contra o traçado; feições repetidas contadas uma vez |
| EPE WebMap (SEs) | nome + UF | localização de obras sem coordenadas pela SE homônima (inequívoca; existente = precisão "subestação", planejada = "aproximada") |

`VlrHisRct` (receita do contrato) não é usado como investimento.

**Encerramento.** Empreendimentos do SIGET que saem do conjunto ativo (operação registrada, revogação)
são encerrados pela própria fonte. Empreendimentos conhecidos só pela EPE ou só por lote de leilão não
têm encerramento informado por essas fontes: permanecem com a situação padrão ("ativo", não afirmada
pela fonte) e perdem confirmação recente quando deixam de aparecer na coleta (indicador "dias sem
confirmação" em Qualidade).
