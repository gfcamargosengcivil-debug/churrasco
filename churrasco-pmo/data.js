/* ============================================================
   PROJETO CHURRASCO DA TURMA — DADOS INICIAIS (SEED)
   ------------------------------------------------------------
   Este arquivo guarda os dados de EXEMPLO que aparecem na
   primeira vez que o sistema abre. Depois disso, tudo o que
   voce editar fica salvo no proprio navegador (localStorage).

   Voce NAO precisa mexer aqui. Use o botao "MODO EDICAO".
   Se quiser comecar do zero, use "Zerar projeto" na aba Config.
   ============================================================ */

const SEED = {
  versao: "1.0",
  projeto: {
    nome: "Churrasco da Turma — Pós em Gerenciamento de Projetos",
    turma: "MBA GP — Turma 2026/1",
    data: "2026-09-15",
    horaInicio: "12:00",
    local: "Sítio Recanto das Mangueiras",
    endereco: "Estrada do Sossego, km 7 — Zona Rural",
    gerente: "Gui Camargos",
    patrocinador: "Prof. Ricardo Menezes",
    objetivo: "Realizar o churrasco de confraternização da turma aplicando explicitamente as práticas do PMBOK, com o objetivo de conquistar o barril de chopp da formatura.",
    premio: "Barril de chopp na festa de formatura",
    valorPessoa: 85,
    contingenciaPct: 10,
    statusManual: "auto"
  },

  participantes: [
    { id:"P01", nome:"Gui Camargos",        presenca:"Confirmado", pagamento:"Pago",     equipe:"Gerência",     tel:"", obs:"Gerente do projeto" },
    { id:"P02", nome:"Ana Beatriz Rocha",   presenca:"Confirmado", pagamento:"Pago",     equipe:"Compras",      tel:"", obs:"" },
    { id:"P03", nome:"Bruno Tavares",       presenca:"Confirmado", pagamento:"Pago",     equipe:"Churrasqueiro",tel:"", obs:"Traz a churrasqueira" },
    { id:"P04", nome:"Carla Menezes",       presenca:"Confirmado", pagamento:"Pago",     equipe:"Financeiro",   tel:"", obs:"Tesoureira" },
    { id:"P05", nome:"Daniel Prado",        presenca:"Confirmado", pagamento:"Pago",     equipe:"Logística",    tel:"", obs:"" },
    { id:"P06", nome:"Eduarda Lima",        presenca:"Confirmado", pagamento:"Pago",     equipe:"Comunicação",  tel:"", obs:"Admin do grupo" },
    { id:"P07", nome:"Felipe Andrade",      presenca:"Confirmado", pagamento:"Pago",     equipe:"Compras",      tel:"", obs:"" },
    { id:"P08", nome:"Gabriela Souza",      presenca:"Confirmado", pagamento:"Pago",     equipe:"Decoração",    tel:"", obs:"" },
    { id:"P09", nome:"Henrique Batista",    presenca:"Confirmado", pagamento:"Pago",     equipe:"Churrasqueiro",tel:"", obs:"" },
    { id:"P10", nome:"Isabela Freitas",     presenca:"Confirmado", pagamento:"Pago",     equipe:"Financeiro",   tel:"", obs:"" },
    { id:"P11", nome:"João Pedro Alves",    presenca:"Confirmado", pagamento:"Pago",     equipe:"Logística",    tel:"", obs:"Leva o gelo" },
    { id:"P12", nome:"Karina Duarte",       presenca:"Confirmado", pagamento:"Pago",     equipe:"Comunicação",  tel:"", obs:"" },
    { id:"P13", nome:"Lucas Ferreira",      presenca:"Confirmado", pagamento:"Pago",     equipe:"Compras",      tel:"", obs:"" },
    { id:"P14", nome:"Mariana Castro",      presenca:"Confirmado", pagamento:"Pago",     equipe:"Decoração",    tel:"", obs:"" },
    { id:"P15", nome:"Nathan Ribeiro",      presenca:"Confirmado", pagamento:"Pago",     equipe:"Som",          tel:"", obs:"Leva caixa de som" },
    { id:"P16", nome:"Olívia Martins",      presenca:"Confirmado", pagamento:"Pago",     equipe:"Financeiro",   tel:"", obs:"" },
    { id:"P17", nome:"Paulo Henrique Dias", presenca:"Confirmado", pagamento:"Pago",     equipe:"Churrasqueiro",tel:"", obs:"" },
    { id:"P18", nome:"Rafaela Nunes",       presenca:"Confirmado", pagamento:"Pago",     equipe:"Compras",      tel:"", obs:"" },
    { id:"P19", nome:"Rodrigo Almeida",     presenca:"Confirmado", pagamento:"Pago",     equipe:"Logística",    tel:"", obs:"" },
    { id:"P20", nome:"Sabrina Costa",       presenca:"Confirmado", pagamento:"Pago",     equipe:"Comunicação",  tel:"", obs:"" },
    { id:"P21", nome:"Thiago Moreira",      presenca:"Confirmado", pagamento:"Pendente", equipe:"Logística",    tel:"", obs:"" },
    { id:"P22", nome:"Vanessa Pires",       presenca:"Confirmado", pagamento:"Pendente", equipe:"Decoração",    tel:"", obs:"" },
    { id:"P23", nome:"Wagner Oliveira",     presenca:"Confirmado", pagamento:"Pendente", equipe:"Compras",      tel:"", obs:"" },
    { id:"P24", nome:"Yasmin Correia",      presenca:"Confirmado", pagamento:"Pendente", equipe:"Comunicação",  tel:"", obs:"" },
    { id:"P25", nome:"Alexandre Ramos",     presenca:"Confirmado", pagamento:"Atrasado", equipe:"Churrasqueiro",tel:"", obs:"Cobrar" },
    { id:"P26", nome:"Beatriz Fonseca",     presenca:"Confirmado", pagamento:"Atrasado", equipe:"Financeiro",   tel:"", obs:"Cobrar" },
    { id:"P27", nome:"Caio Bernardes",      presenca:"Confirmado", pagamento:"Pendente", equipe:"Som",          tel:"", obs:"" },
    { id:"P28", nome:"Débora Antunes",      presenca:"Pendente",   pagamento:"Pendente", equipe:"—",            tel:"", obs:"Depende da escala" },
    { id:"P29", nome:"Emerson Vieira",      presenca:"Pendente",   pagamento:"Pendente", equipe:"—",            tel:"", obs:"" },
    { id:"P30", nome:"Fernanda Braga",      presenca:"Pendente",   pagamento:"Pendente", equipe:"—",            tel:"", obs:"" },
    { id:"P31", nome:"Gustavo Peixoto",     presenca:"Pendente",   pagamento:"Pendente", equipe:"—",            tel:"", obs:"" },
    { id:"P32", nome:"Helena Marques",      presenca:"Pendente",   pagamento:"Pendente", equipe:"—",            tel:"", obs:"" },
    { id:"P33", nome:"Igor Salvador",       presenca:"Não vai",    pagamento:"—",        equipe:"—",            tel:"", obs:"Viagem a trabalho" },
    { id:"P34", nome:"Juliana Teixeira",    presenca:"Não vai",    pagamento:"—",        equipe:"—",            tel:"", obs:"Compromisso familiar" },
    { id:"P35", nome:"Prof. Ricardo Menezes", presenca:"Confirmado", pagamento:"Isento", equipe:"Convidado",    tel:"", obs:"Patrocinador — cortesia da turma" }
  ],

  pagamentos: [
    { id:"PG01", nomeId:"P02", valor:85, data:"2026-08-10", status:"Pago",     forma:"PIX",      obs:"" },
    { id:"PG02", nomeId:"P03", valor:85, data:"2026-08-10", status:"Pago",     forma:"PIX",      obs:"" },
    { id:"PG03", nomeId:"P04", valor:85, data:"2026-08-11", status:"Pago",     forma:"PIX",      obs:"" },
    { id:"PG04", nomeId:"P21", valor:85, data:"",           status:"Pendente", forma:"—",        obs:"Prometeu até sexta" },
    { id:"PG05", nomeId:"P25", valor:85, data:"",           status:"Atrasado", forma:"—",        obs:"2ª cobrança enviada" },
    { id:"PG06", nomeId:"P26", valor:85, data:"",           status:"Atrasado", forma:"—",        obs:"2ª cobrança enviada" }
  ],
  chavePix: "churrasco.turma@email.com",

  eap: [
    { id:"1",   nome:"Gerenciamento", pai:"",  resp:"Gui Camargos" },
    { id:"1.1", nome:"Planejamento",  pai:"1", resp:"Gui Camargos" },
    { id:"1.2", nome:"Comunicação",   pai:"1", resp:"Eduarda Lima" },
    { id:"1.3", nome:"Controle",      pai:"1", resp:"Gui Camargos" },
    { id:"1.4", nome:"Encerramento",  pai:"1", resp:"Gui Camargos" },
    { id:"2",   nome:"Local",         pai:"",  resp:"Daniel Prado" },
    { id:"2.1", nome:"Pesquisa",      pai:"2", resp:"Daniel Prado" },
    { id:"2.2", nome:"Cotação",       pai:"2", resp:"Daniel Prado" },
    { id:"2.3", nome:"Contratação",   pai:"2", resp:"Carla Menezes" },
    { id:"3",   nome:"Alimentação",   pai:"",  resp:"Ana Beatriz Rocha" },
    { id:"3.1", nome:"Carne",         pai:"3", resp:"Bruno Tavares" },
    { id:"3.2", nome:"Acompanhamentos",pai:"3",resp:"Ana Beatriz Rocha" },
    { id:"3.3", nome:"Sobremesa",     pai:"3", resp:"Gabriela Souza" },
    { id:"4",   nome:"Bebidas",       pai:"",  resp:"Felipe Andrade" },
    { id:"4.1", nome:"Água",          pai:"4", resp:"Felipe Andrade" },
    { id:"4.2", nome:"Refrigerante",  pai:"4", resp:"Felipe Andrade" },
    { id:"4.3", nome:"Bebidas alcoólicas", pai:"4", resp:"Lucas Ferreira" },
    { id:"5",   nome:"Logística",     pai:"",  resp:"Rodrigo Almeida" },
    { id:"5.1", nome:"Transporte",    pai:"5", resp:"Rodrigo Almeida" },
    { id:"5.2", nome:"Gelo",          pai:"5", resp:"João Pedro Alves" },
    { id:"5.3", nome:"Mesas",         pai:"5", resp:"Rodrigo Almeida" },
    { id:"5.4", nome:"Cadeiras",      pai:"5", resp:"Rodrigo Almeida" },
    { id:"6",   nome:"Evento",        pai:"",  resp:"Gui Camargos" },
    { id:"6.1", nome:"Montagem",      pai:"6", resp:"Daniel Prado" },
    { id:"6.2", nome:"Execução",      pai:"6", resp:"Bruno Tavares" },
    { id:"6.3", nome:"Limpeza",       pai:"6", resp:"Mariana Castro" },
    { id:"6.4", nome:"Encerramento",  pai:"6", resp:"Gui Camargos" }
  ],

  cronograma: [
    { id:"A01", eap:"1.1", atividade:"Reunião de abertura (kickoff) da turma", resp:"Gui Camargos",      inicio:"2026-08-03", fim:"2026-08-03", status:"Concluído",   pct:100, dep:"" },
    { id:"A02", eap:"1.1", atividade:"Definir data por votação no grupo",      resp:"Eduarda Lima",      inicio:"2026-08-04", fim:"2026-08-08", status:"Concluído",   pct:100, dep:"A01" },
    { id:"A03", eap:"2.1", atividade:"Pesquisar 3 opções de local",            resp:"Daniel Prado",      inicio:"2026-08-05", fim:"2026-08-12", status:"Concluído",   pct:100, dep:"A02" },
    { id:"A04", eap:"2.2", atividade:"Cotar e comparar locais",                resp:"Daniel Prado",      inicio:"2026-08-13", fim:"2026-08-18", status:"Concluído",   pct:100, dep:"A03" },
    { id:"A05", eap:"2.3", atividade:"Fechar contrato e dar sinal do sítio",   resp:"Carla Menezes",     inicio:"2026-08-19", fim:"2026-08-22", status:"Concluído",   pct:100, dep:"A04" },
    { id:"A06", eap:"1.2", atividade:"Confirmar lista de presença",            resp:"Eduarda Lima",      inicio:"2026-08-10", fim:"2026-09-01", status:"Em andamento",pct:77,  dep:"A02" },
    { id:"A07", eap:"1.3", atividade:"Arrecadar pagamentos",                   resp:"Carla Menezes",     inicio:"2026-08-10", fim:"2026-09-05", status:"Em andamento",pct:74,  dep:"A06" },
    { id:"A08", eap:"3.1", atividade:"Cotar carnes em 3 açougues",             resp:"Bruno Tavares",     inicio:"2026-08-20", fim:"2026-08-28", status:"Em andamento",pct:60,  dep:"A05" },
    { id:"A09", eap:"4.3", atividade:"Cotar bebidas em distribuidora",         resp:"Lucas Ferreira",    inicio:"2026-08-20", fim:"2026-08-28", status:"Atrasado",    pct:30,  dep:"A05" },
    { id:"A10", eap:"3.2", atividade:"Definir cardápio de acompanhamentos",    resp:"Ana Beatriz Rocha", inicio:"2026-08-25", fim:"2026-09-02", status:"Em andamento",pct:40,  dep:"A08" },
    { id:"A11", eap:"3.1", atividade:"Comprar carnes",                         resp:"Bruno Tavares",     inicio:"2026-09-10", fim:"2026-09-12", status:"Não iniciado",pct:0,   dep:"A08" },
    { id:"A12", eap:"4.2", atividade:"Comprar bebidas e refrigerantes",        resp:"Felipe Andrade",    inicio:"2026-09-10", fim:"2026-09-12", status:"Não iniciado",pct:0,   dep:"A09" },
    { id:"A13", eap:"5.2", atividade:"Comprar gelo e carvão",                  resp:"João Pedro Alves",  inicio:"2026-09-14", fim:"2026-09-14", status:"Não iniciado",pct:0,   dep:"A12" },
    { id:"A14", eap:"5.1", atividade:"Organizar caronas e transporte",         resp:"Rodrigo Almeida",   inicio:"2026-09-01", fim:"2026-09-13", status:"Não iniciado",pct:0,   dep:"A06" },
    { id:"A15", eap:"5.3", atividade:"Confirmar mesas, cadeiras e utensílios",  resp:"Rodrigo Almeida",   inicio:"2026-09-05", fim:"2026-09-13", status:"Não iniciado",pct:0,   dep:"A05" },
    { id:"A16", eap:"6.1", atividade:"Montagem do espaço",                     resp:"Daniel Prado",      inicio:"2026-09-15", fim:"2026-09-15", status:"Não iniciado",pct:0,   dep:"A13" },
    { id:"A17", eap:"6.2", atividade:"Execução do churrasco",                  resp:"Bruno Tavares",     inicio:"2026-09-15", fim:"2026-09-15", status:"Não iniciado",pct:0,   dep:"A16" },
    { id:"A18", eap:"6.3", atividade:"Limpeza e desmontagem",                  resp:"Mariana Castro",    inicio:"2026-09-15", fim:"2026-09-15", status:"Não iniciado",pct:0,   dep:"A17" },
    { id:"A19", eap:"1.4", atividade:"Prestação de contas à turma",            resp:"Carla Menezes",     inicio:"2026-09-16", fim:"2026-09-18", status:"Não iniciado",pct:0,   dep:"A18" },
    { id:"A20", eap:"1.4", atividade:"Lições aprendidas e entrega do case",    resp:"Gui Camargos",      inicio:"2026-09-16", fim:"2026-09-20", status:"Não iniciado",pct:0,   dep:"A19" }
  ],

  raci: [
    { id:"R01", atividade:"Definição da data",        r:"Eduarda Lima",      a:"Gui Camargos",  c:"Turma",             i:"Prof. Ricardo" },
    { id:"R02", atividade:"Escolha e contratação do local", r:"Daniel Prado", a:"Gui Camargos",  c:"Carla Menezes",     i:"Turma" },
    { id:"R03", atividade:"Compra de carnes",         r:"Bruno Tavares",     a:"Ana Beatriz",   c:"Churrasqueiros",    i:"Turma" },
    { id:"R04", atividade:"Compra de bebidas",        r:"Lucas Ferreira",    a:"Felipe Andrade",c:"Turma",             i:"Carla Menezes" },
    { id:"R05", atividade:"Controle financeiro",      r:"Carla Menezes",     a:"Gui Camargos",  c:"Isabela Freitas",   i:"Turma" },
    { id:"R06", atividade:"Comunicação com a turma",  r:"Eduarda Lima",      a:"Gui Camargos",  c:"Karina Duarte",     i:"Turma" },
    { id:"R07", atividade:"Logística e transporte",   r:"Rodrigo Almeida",   a:"Gui Camargos",  c:"João Pedro",        i:"Turma" },
    { id:"R08", atividade:"Montagem e limpeza",       r:"Mariana Castro",    a:"Daniel Prado",  c:"Equipe Decoração",  i:"Dono do sítio" },
    { id:"R09", atividade:"Prestação de contas",      r:"Carla Menezes",     a:"Gui Camargos",  c:"Turma",             i:"Prof. Ricardo" },
    { id:"R10", atividade:"Entrega do case do PMBOK", r:"Gui Camargos",      a:"Prof. Ricardo", c:"Turma",             i:"Coordenação" }
  ],

  riscos: [
    { id:"RK01", risco:"Chuva no dia do evento",                          prob:4, imp:4, resp:"Daniel Prado",   resposta:"Mitigar",   plano:"Contratar sítio com área coberta para 40 pessoas; confirmar previsão com 5 dias e acionar lona reserva.", status:"Em monitoramento" },
    { id:"RK02", risco:"Baixa adesão / menos de 25 confirmados",          prob:3, imp:5, resp:"Eduarda Lima",   resposta:"Mitigar",   plano:"Campanha de confirmação no grupo com prazo; abrir vaga para acompanhantes pagantes.", status:"Em monitoramento" },
    { id:"RK03", risco:"Inadimplência nos pagamentos",                    prob:4, imp:4, resp:"Carla Menezes",  resposta:"Mitigar",   plano:"Cobrança em 3 ondas (D-30, D-15, D-7); compras só liberadas com 80% arrecadado.", status:"Ativo" },
    { id:"RK04", risco:"Fornecedor de carne atrasar a entrega",           prob:2, imp:5, resp:"Bruno Tavares",  resposta:"Mitigar",   plano:"Comprar com 3 dias de antecedência; manter 2º açougue cotado como reserva.", status:"Em monitoramento" },
    { id:"RK05", risco:"Estimativa de carne insuficiente",                prob:3, imp:4, resp:"Bruno Tavares",  resposta:"Mitigar",   plano:"Usar parâmetro de 500 g/pessoa + 10% de folga; conferir na véspera.", status:"Em monitoramento" },
    { id:"RK06", risco:"Sítio cancelar a reserva",                        prob:1, imp:5, resp:"Daniel Prado",   resposta:"Transferir",plano:"Contrato assinado com multa; manter 2ª opção de local pré-cotada.", status:"Encerrado" },
    { id:"RK07", risco:"Excesso de bebida alcoólica / incidente",         prob:2, imp:5, resp:"Gui Camargos",   resposta:"Mitigar",   plano:"Definir motoristas da vez; contratar transporte compartilhado; água e refrigerante à vontade.", status:"Ativo" },
    { id:"RK08", risco:"Falta de gelo no dia",                            prob:3, imp:3, resp:"João Pedro",     resposta:"Mitigar",   plano:"Comprar 20% a mais; mapear posto 24h a 6 km do sítio.", status:"Ativo" },
    { id:"RK09", risco:"Estouro de orçamento acima da contingência",      prob:2, imp:4, resp:"Carla Menezes",  resposta:"Mitigar",   plano:"Reserva de 10%; aprovação do GP para qualquer compra fora da lista.", status:"Ativo" },
    { id:"RK10", risco:"Conflito de agenda com prova da pós",             prob:2, imp:3, resp:"Eduarda Lima",   resposta:"Evitar",    plano:"Data validada contra o calendário acadêmico antes do fechamento.", status:"Encerrado" },
    { id:"RK11", risco:"Churrasqueiro voluntário desistir",               prob:2, imp:3, resp:"Bruno Tavares",  resposta:"Mitigar",   plano:"Escala com 3 churrasqueiros revezando; orçamento reserva para contratar profissional.", status:"Em monitoramento" },
    { id:"RK12", risco:"Perda do desafio do barril de chopp",             prob:2, imp:5, resp:"Gui Camargos",   resposta:"Mitigar",   plano:"Documentar todas as áreas do PMBOK e apresentar o case ao professor até D+5.", status:"Ativo" }
  ],

  stakeholders: [
    { id:"S01", nome:"Prof. Ricardo Menezes", papel:"Patrocinador / avaliador do desafio", poder:5, interesse:5, expectativa:"Ver o PMBOK aplicado de verdade", estrategia:"" },
    { id:"S02", nome:"Gui Camargos",          papel:"Gerente do projeto",                  poder:5, interesse:5, expectativa:"Entregar no prazo e no orçamento", estrategia:"" },
    { id:"S03", nome:"Comitê organizador",    papel:"Equipe do projeto",                   poder:4, interesse:5, expectativa:"Divisão justa de tarefas", estrategia:"" },
    { id:"S04", nome:"Alunos participantes",  papel:"Clientes / usuários",                 poder:3, interesse:5, expectativa:"Churrasco bom e barato", estrategia:"" },
    { id:"S05", nome:"Alunos que não vão",    papel:"Turma",                               poder:2, interesse:2, expectativa:"Ser informado do resultado", estrategia:"" },
    { id:"S06", nome:"Dono do sítio",         papel:"Fornecedor de local",                 poder:4, interesse:2, expectativa:"Pagamento em dia e espaço preservado", estrategia:"" },
    { id:"S07", nome:"Açougue / distribuidora",papel:"Fornecedores",                       poder:3, interesse:2, expectativa:"Pedido confirmado com antecedência", estrategia:"" },
    { id:"S08", nome:"Coordenação do curso",  papel:"Instituição",                         poder:4, interesse:2, expectativa:"Evento sem incidentes", estrategia:"" },
    { id:"S09", nome:"Vizinhança do sítio",   papel:"Comunidade",                          poder:1, interesse:3, expectativa:"Sem barulho após as 22h", estrategia:"" }
  ],

  decisoes: [
    { id:"D01", data:"2026-08-08", decisao:"Data do churrasco", alternativas:"08/09 · 15/09 · 22/09", tomada:"15/09/2026", resp:"Turma (votação)", participantes:"33 votantes", status:"Aprovada" },
    { id:"D02", data:"2026-08-22", decisao:"Local do evento",   alternativas:"Sítio Recanto das Mangueiras · Chácara do Zeca · Espaço Vila Verde", tomada:"Sítio Recanto das Mangueiras", resp:"Daniel Prado", participantes:"Comitê", status:"Aprovada" },
    { id:"D03", data:"2026-08-25", decisao:"Valor por pessoa",  alternativas:"R$ 75 · R$ 85 · R$ 95", tomada:"R$ 85 (com 10% de contingência)", resp:"Carla Menezes", participantes:"Comitê", status:"Aprovada" },
    { id:"D04", data:"", decisao:"Tipo de carne principal",     alternativas:"Picanha · Costela · Mix", tomada:"", resp:"Bruno Tavares", participantes:"Turma", status:"Em votação" }
  ],

  votacoes: [
    { id:"V01", pergunta:"Qual carne principal devemos comprar?", ativa:true,
      opcoes:[
        { id:"a", texto:"🥩 Picanha + linguiça",            votos:11 },
        { id:"b", texto:"🥩 Costela no bafo + linguiça",    votos:14 },
        { id:"c", texto:"🥩 Mix (maminha, fraldinha, frango)", votos:8 }
      ] },
    { id:"V02", pergunta:"Vamos contratar som ou levar caixa própria?", ativa:true,
      opcoes:[
        { id:"a", texto:"🔊 Caixa do Nathan (grátis)", votos:19 },
        { id:"b", texto:"🎤 Alugar som profissional (+R$ 12/pessoa)", votos:6 }
      ] }
  ],

  compras: [
    { id:"C01", item:"Picanha",                qtd:2,   un:"kg",   est:79.90, real:0,     resp:"Bruno Tavares",   status:"A comprar", cat:"Alimentação" },
    { id:"C02", item:"Costela bovina",         qtd:8,   un:"kg",   est:36.90, real:0,     resp:"Bruno Tavares",   status:"A comprar", cat:"Alimentação" },
    { id:"C03", item:"Linguiça toscana",       qtd:4,   un:"kg",   est:24.90, real:0,     resp:"Bruno Tavares",   status:"A comprar", cat:"Alimentação" },
    { id:"C04", item:"Coração de frango",      qtd:2,   un:"kg",   est:29.90, real:0,     resp:"Bruno Tavares",   status:"A comprar", cat:"Alimentação" },
    { id:"C05", item:"Pão de alho",            qtd:30,  un:"un",   est:3.50,  real:0,     resp:"Ana Beatriz",     status:"A comprar", cat:"Alimentação" },
    { id:"C06", item:"Farofa pronta",          qtd:3,   un:"pct",  est:12.90, real:0,     resp:"Ana Beatriz",     status:"A comprar", cat:"Alimentação" },
    { id:"C07", item:"Vinagrete (insumos)",    qtd:1,   un:"kit",  est:45.00, real:0,     resp:"Ana Beatriz",     status:"A comprar", cat:"Alimentação" },
    { id:"C08", item:"Arroz",                  qtd:3,   un:"kg",   est:6.50,  real:0,     resp:"Ana Beatriz",     status:"A comprar", cat:"Alimentação" },
    { id:"C09", item:"Sal grosso",             qtd:2,   un:"kg",   est:6.00,  real:6.00,  resp:"Bruno Tavares",   status:"Comprado",  cat:"Alimentação" },
    { id:"C10", item:"Pudim / sobremesa",      qtd:2,   un:"un",   est:32.00, real:0,     resp:"Gabriela Souza",  status:"A comprar", cat:"Alimentação" },
    { id:"C11", item:"Cerveja (fardo 12)",     qtd:6,   un:"fardo",est:52.00, real:0,     resp:"Lucas Ferreira",  status:"A comprar", cat:"Bebidas" },
    { id:"C12", item:"Refrigerante 2L",        qtd:8,   un:"un",   est:9.50,  real:0,     resp:"Felipe Andrade",  status:"A comprar", cat:"Bebidas" },
    { id:"C13", item:"Água mineral 1,5L",      qtd:12,  un:"un",   est:3.20,  real:0,     resp:"Felipe Andrade",  status:"A comprar", cat:"Bebidas" },
    { id:"C14", item:"Suco em pó",             qtd:8,   un:"un",   est:2.50,  real:0,     resp:"Felipe Andrade",  status:"A comprar", cat:"Bebidas" },
    { id:"C15", item:"Gelo (saco 10 kg)",      qtd:5,   un:"saco", est:14.00, real:0,     resp:"João Pedro",      status:"A comprar", cat:"Logística" },
    { id:"C16", item:"Carvão (saco 5 kg)",     qtd:4,   un:"saco", est:22.00, real:0,     resp:"João Pedro",      status:"A comprar", cat:"Logística" },
    { id:"C17", item:"Descartáveis (kit)",     qtd:1,   un:"kit",  est:90.00, real:0,     resp:"Mariana Castro",  status:"A comprar", cat:"Logística" },
    { id:"C18", item:"Aluguel do sítio",       qtd:1,   un:"diária",est:500.00,real:500.00,resp:"Carla Menezes",  status:"Comprado",  cat:"Local" },
    { id:"C19", item:"Papel toalha / limpeza", qtd:1,   un:"kit",  est:40.00, real:0,     resp:"Mariana Castro",  status:"A comprar", cat:"Logística" },
    { id:"C20", item:"Decoração da turma",     qtd:1,   un:"kit",  est:80.00, real:0,     resp:"Gabriela Souza",  status:"A comprar", cat:"Extras" }
  ],

  checklist: [
    { id:"CK01", fase:"30 dias antes", item:"Data confirmada e divulgada no grupo",           ok:true },
    { id:"CK02", fase:"30 dias antes", item:"Local reservado com sinal pago",                 ok:true },
    { id:"CK03", fase:"30 dias antes", item:"Valor por pessoa definido e comunicado",         ok:true },
    { id:"CK04", fase:"30 dias antes", item:"Comitê organizador formado com responsáveis",    ok:true },
    { id:"CK05", fase:"30 dias antes", item:"1ª rodada de cobrança enviada",                  ok:true },
    { id:"CK06", fase:"15 dias antes", item:"Lista de presença com no mínimo 25 confirmados", ok:true },
    { id:"CK07", fase:"15 dias antes", item:"Cotações de carne e bebida finalizadas",         ok:false },
    { id:"CK08", fase:"15 dias antes", item:"Cardápio fechado e publicado",                   ok:false },
    { id:"CK09", fase:"15 dias antes", item:"2ª rodada de cobrança enviada",                  ok:true },
    { id:"CK10", fase:"7 dias antes",  item:"80% dos pagamentos arrecadados",                 ok:false },
    { id:"CK11", fase:"7 dias antes",  item:"Pedidos de compra confirmados com fornecedores", ok:false },
    { id:"CK12", fase:"7 dias antes",  item:"Caronas e transporte organizados",               ok:false },
    { id:"CK13", fase:"7 dias antes",  item:"Previsão do tempo verificada / plano B ativado",  ok:false },
    { id:"CK14", fase:"1 dia antes",   item:"Carnes e bebidas compradas e refrigeradas",      ok:false },
    { id:"CK15", fase:"1 dia antes",   item:"Gelo, carvão e descartáveis separados",          ok:false },
    { id:"CK16", fase:"1 dia antes",   item:"Mensagem final com endereço e horário enviada",  ok:false },
    { id:"CK17", fase:"Dia do evento", item:"Chegada da equipe de montagem às 09h",           ok:false },
    { id:"CK18", fase:"Dia do evento", item:"Churrasqueira acesa até as 11h30",               ok:false },
    { id:"CK19", fase:"Dia do evento", item:"Bebidas geladas e mesa montada",                 ok:false },
    { id:"CK20", fase:"Dia do evento", item:"Foto oficial da turma",                          ok:false },
    { id:"CK21", fase:"Dia do evento", item:"Limpeza e devolução do espaço",                  ok:false },
    { id:"CK22", fase:"Pós-evento",    item:"Prestação de contas publicada no grupo",         ok:false },
    { id:"CK23", fase:"Pós-evento",    item:"Pesquisa de satisfação aplicada",                ok:false },
    { id:"CK24", fase:"Pós-evento",    item:"Lições aprendidas registradas",                  ok:false },
    { id:"CK25", fase:"Pós-evento",    item:"Case do PMBOK entregue ao professor",            ok:false }
  ],

  qualidade: [
    { id:"Q01", criterio:"Local",     padrao:"Área coberta, banheiros limpos, estacionamento",     ok:true,  nota:5 },
    { id:"Q02", criterio:"Alimentação", padrao:"500 g de carne por pessoa, servida quente",        ok:false, nota:0 },
    { id:"Q03", criterio:"Bebidas",   padrao:"Bebida gelada disponível durante todo o evento",      ok:false, nota:0 },
    { id:"Q04", criterio:"Segurança", padrao:"Motoristas da vez definidos; kit primeiros socorros", ok:false, nota:0 },
    { id:"Q05", criterio:"Limpeza",   padrao:"Espaço devolvido nas mesmas condições",               ok:false, nota:0 },
    { id:"Q06", criterio:"Estrutura", padrao:"Mesas e cadeiras para 100% dos participantes",        ok:true,  nota:4 },
    { id:"Q07", criterio:"Som",       padrao:"Som audível sem incomodar vizinhança após 22h",       ok:false, nota:0 },
    { id:"Q08", criterio:"Experiência", padrao:"Nota média ≥ 8 na pesquisa pós-evento",             ok:false, nota:0 }
  ],

  licoes: [
    { id:"L01", categoria:"Funcionou", texto:"Votar a data no grupo antes de fechar qualquer coisa evitou remarcação.", recomendacao:"Sempre validar a data com a turma antes de reservar o local." },
    { id:"L02", categoria:"Não funcionou", texto:"Cobrança sem prazo claro gerou inadimplência.", recomendacao:"Definir data-limite de pagamento já no primeiro anúncio." },
    { id:"L03", categoria:"Faríamos diferente", texto:"Cotação de bebidas começou tarde e virou atraso no cronograma.", recomendacao:"Iniciar todas as cotações no mesmo dia, logo após fechar o local." }
  ],

  financeiro: {
    despesasPrevistasExtras: 0,
    receitaExtra: 0,
    obs: "Receita = participantes confirmados × valor por pessoa. Despesas vêm da lista de compras."
  },

  comunicacoes: [],
  linkPublico: ""
};
