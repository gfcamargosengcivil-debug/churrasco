import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import {
  CONFIGURACAO_PADRAO, ROTULO_CRITERIO, ROTULO_EVENTO_PREVISAO, ROTULO_FASE_CONTRATACAO, ROTULO_MARCO, ROTULO_NATUREZA_DATA,
  ROTULO_NECESSIDADE, ROTULO_NIVEL_CONFIANCA, ROTULO_SETOR, ROTULO_STATUS_PROSPECCAO, ROTULO_TIPO, mesclarConfiguracao,
  type ConfiguracaoPlataforma,
} from '@radar/core';
import { exigir } from '../auth.js';
import type { ContextoRotas } from './contexto.js';

function csv(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return '';
  const cab = Object.keys(linhas[0]);
  const esc = (v: unknown) => {
    if (v === undefined || v === null) return '';
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [cab.join(';'), ...linhas.map((l) => cab.map((c) => esc(l[c])).join(';'))].join('\r\n');
}

export async function rotasAdmin(app: FastifyInstance, { s, fila }: ContextoRotas) {
  app.get('/eu', async (req) => req.usuario);

  app.get('/config', { preHandler: exigir('ler') }, async () => ({ configuracao: await s.configuracao(), padrao: CONFIGURACAO_PADRAO }));

  app.put('/config', { preHandler: exigir('administrar') }, async (req) => {
    const c = mesclarConfiguracao(req.body as Partial<ConfiguracaoPlataforma>);
    const soma = Object.values(c.score.pesos).reduce((a, b) => a + b, 0);
    if (soma <= 0) throw Object.assign(new Error('A soma dos pesos deve ser positiva'), { statusCode: 422 });
    if (c.score.faixas.alta <= c.score.faixas.media) throw Object.assign(new Error('Faixa "alta" deve ser maior que "média"'), { statusCode: 422 });
    return s.salvarConfiguracao(c, req.usuario);
  });

  app.get('/auditoria', { preHandler: exigir('administrar') }, async () => s.repo.listarAuditoria(500));
  app.get('/jobs', { preHandler: exigir('administrar') }, async () => fila.listar(200));

  app.post('/demo/carregar', { preHandler: exigir('administrar') }, async (req) => s.carregarDemo(req.usuario.id));
  app.delete('/demo', { preHandler: exigir('administrar') }, async (req) => s.removerDemo(req.usuario));

  app.get('/ia/status', { preHandler: exigir('ler') }, async () => ({
    habilitada: !!s.amb.ANTHROPIC_API_KEY,
    modelo: s.amb.ANTHROPIC_API_KEY ? s.amb.IA_MODELO : undefined,
    modo: s.amb.ANTHROPIC_API_KEY ? 'LLM com verificação literal de citações + heurística' : 'Somente heurística (defina ANTHROPIC_API_KEY no servidor)',
  }));

  // Exportações (Excel / Power BI)
  app.get('/export/radar.xlsx', { preHandler: exigir('ler') }, async (_req, reply) => {
    const visoes = await s.visoes();
    const orgs = await s.organizacoesMap();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Radar LT/SE';
    const ws = wb.addWorksheet('Radar');
    ws.columns = [
      { header: 'Código', key: 'codigo', width: 12 },
      { header: 'Empreendimento', key: 'nome', width: 60 },
      { header: 'Cliente/contratante', key: 'cliente', width: 34 },
      { header: 'Tipo', key: 'tipo', width: 16 },
      { header: 'Setor', key: 'setor', width: 14 },
      { header: 'UF', key: 'uf', width: 8 },
      { header: 'Tensão máx. (kV)', key: 'kv', width: 10 },
      { header: 'Extensão (km)', key: 'km', width: 10 },
      { header: 'Etapa', key: 'etapa', width: 26 },
      { header: 'Fase contratação', key: 'fase', width: 20 },
      { header: 'RFQ base', key: 'rfq', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Janela RFQ início', key: 'rfqIni', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Janela RFQ fim', key: 'rfqFim', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Natureza da data', key: 'natureza', width: 22 },
      { header: 'Início obras (base)', key: 'obras', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Energização (base)', key: 'energ', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Necessidade comercial', key: 'necessidade', width: 28 },
      { header: 'Oportunidade mín. (R$)', key: 'min', width: 16, style: { numFmt: '#,##0' } },
      { header: 'Oportunidade máx. (R$)', key: 'max', width: 16, style: { numFmt: '#,##0' } },
      { header: 'Método estimativa', key: 'metodo', width: 22 },
      { header: 'CAPEX total (R$) — não endereçável', key: 'capex', width: 18, style: { numFmt: '#,##0' } },
      { header: 'Índice prioridade', key: 'indice', width: 10 },
      { header: 'Prioridade', key: 'prioridade', width: 10 },
      { header: 'Confiança previsão', key: 'confianca', width: 12 },
      { header: 'Última atualização', key: 'atual', width: 14 },
      { header: 'DEMO (fictício)', key: 'demo', width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    const d = (x?: string) => (x ? new Date(`${x}T12:00:00Z`) : undefined);
    for (const v of visoes) {
      const b = v.previsao.cenarios.base.datas;
      ws.addRow({
        codigo: v.codigo, nome: v.nome, cliente: v.contratanteId ? orgs.get(v.contratanteId)?.nome : '', tipo: ROTULO_TIPO[v.tipo], setor: ROTULO_SETOR[v.setor],
        uf: v.ufs.join('/'), kv: v.tensaoMaxKv, km: v.extensaoKm, etapa: v.etapa?.nome, fase: ROTULO_FASE_CONTRATACAO[v.fase.geral],
        rfq: d(b.rfq?.data), rfqIni: d(v.previsao.janelas.rfq?.inicio), rfqFim: d(v.previsao.janelas.rfq?.fim), natureza: b.rfq ? ROTULO_NATUREZA_DATA[b.rfq.natureza] : '',
        obras: d(b.inicioObras?.data), energ: d(b.energizacao?.data), necessidade: ROTULO_NECESSIDADE[v.previsao.necessidadeComercial.classe],
        min: v.mercado.faixa?.[0], max: v.mercado.faixa?.[1], metodo: v.mercado.metodo, capex: v.mercado.capexTotalBRL, indice: v.score.indice, prioridade: v.score.faixa,
        confianca: ROTULO_NIVEL_CONFIANCA[v.previsao.confianca.nivel], atual: v.ultimaAtualizacao.slice(0, 10), demo: v.demo ? 'SIM' : '',
      });
    }
    ws.autoFilter = { from: 'A1', to: 'Z1' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const nota = wb.addWorksheet('Leia-me');
    nota.addRow(['Datas de RFQ/contratação são ESTIMATIVAS da plataforma, salvo natureza "Realizado" ou "Data divulgada".']);
    nota.addRow(['Oportunidade = serviços de construção/montagem ainda não contratados; CAPEX total não é endereçável.']);
    nota.addRow(['Índice de prioridade é instrumento de ordenação, não probabilidade.']);
    nota.addRow(['Linhas marcadas DEMO são fictícias.']);
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', `attachment; filename="radar-lt-se-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return reply.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  /** Tabelas planas em CSV (separador ";", decimal ",") para Excel/Power BI. */
  app.get<{ Params: { tabela: string } }>('/export/:tabela.csv', { preHandler: exigir('ler') }, async (req, reply) => {
    const projetos = await s.repo.listarEmpreendimentos();
    const visoes = await s.visoes(projetos);
    const orgs = await s.organizacoesMap();
    let linhas: Record<string, unknown>[] = [];
    switch (req.params.tabela) {
      case 'empreendimentos':
        linhas = visoes.map((v) => ({
          id: v.id, codigo: v.codigo, nome: v.nome, tipo: v.tipo, setor: v.setor, subsetor: v.subsetor, ufs: v.ufs.join('/'), regioes: v.regioes.join('/'),
          contratante: v.contratanteId ? orgs.get(v.contratanteId)?.nome : '', tensao_max_kv: v.tensaoMaxKv, extensao_km: v.extensaoKm, qtd_se: v.qtdSubestacoes,
          status: v.statusGeral, situacao_obra: v.situacaoObra, etapa: v.etapa?.nome, fase_lt: v.fase.LT, fase_se: v.fase.SE,
          necessidade: v.previsao.necessidadeComercial.classe, confianca_previsao: v.previsao.confianca.nivel, confianca_dados: v.confiancaDados,
          oportunidade_min: v.mercado.faixa?.[0], oportunidade_max: v.mercado.faixa?.[1], oportunidade_central: v.mercado.central, metodo_mercado: v.mercado.metodo,
          capex_total: v.mercado.capexTotalBRL, capex_eletrico: v.mercado.capexInfraEletricaBRL, indice: v.score.indice, prioridade: v.score.faixa,
          lat: v.ponto?.lat, lon: v.ponto?.lon, precisao_local: v.ponto?.precisao, completude: v.qualidade.completude, demo: v.demo,
        }));
        break;
      case 'previsoes':
        linhas = visoes.flatMap((v) =>
          (['otimista', 'base', 'conservador'] as const).flatMap((c) =>
            Object.entries(v.previsao.cenarios[c].datas).map(([evento, d]) => ({
              empreendimento_id: v.id, codigo: v.codigo, cenario: c, evento, rotulo: ROTULO_EVENTO_PREVISAO[evento as keyof typeof ROTULO_EVENTO_PREVISAO],
              data: d!.data, natureza: d!.natureza, vencida: !!d!.vencida, calculo: d!.calculo, demo: v.demo,
            })),
          ),
        );
        break;
      case 'marcos':
        linhas = projetos.flatMap((p) => p.marcos.map((m) => ({ empreendimento_id: p.id, codigo: p.codigo, marco: m.tipo, rotulo: ROTULO_MARCO[m.tipo], data: m.data, natureza: m.natureza, escopo: m.escopo, evidencias: m.evidenciaIds.length, demo: p.demo })));
        break;
      case 'oportunidades':
        linhas = (await s.repo.listarOportunidades()).map((o) => ({
          id: o.id, empreendimento_id: o.empreendimentoId, interesse: o.interesse, status: o.statusProspeccao, status_rotulo: ROTULO_STATUS_PROSPECCAO[o.statusProspeccao],
          responsavel: o.responsavel, decisao: o.decisao.decisao, valor_qualificado: o.valorQualificadoBRL, interacoes: o.interacoes.length,
          proximos_passos_abertos: o.proximosPassos.filter((x) => !x.concluido).length, resultado: o.resultado?.status, demo: o.demo,
        }));
        break;
      case 'score':
        linhas = visoes.flatMap((v) => v.score.notas.map((n) => ({ empreendimento_id: v.id, codigo: v.codigo, criterio: n.criterio, rotulo: ROTULO_CRITERIO[n.criterio], nota: n.nota, peso: n.peso, justificativa: n.justificativa, indice: v.score.indice })));
        break;
      default:
        return reply.code(404).send({ erro: 'Tabela desconhecida. Use: empreendimentos, previsoes, marcos, oportunidades, score.' });
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${req.params.tabela}.csv"`);
    return csv(linhas);
  });
}
