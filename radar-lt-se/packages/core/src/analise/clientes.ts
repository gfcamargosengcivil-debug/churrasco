import { PAPEIS_EXECUCAO, ROTULO_PAPEL, type Papel } from '../constantes.js';
import { dataReferenciaEvidencia } from '../projetos/derivados.js';
import type { Empreendimento, EventoMudanca, Organizacao, OportunidadeComercial } from '../tipos.js';
import type { VisaoEmpreendimento } from './visao.js';

export interface ResumoCliente {
  organizacao: Organizacao;
  empreendimentos: number;
  ativos: number;
  emExecucao: number;
  planejados: number;
  potencialCentral: number;
  proximaDemanda?: string;
  prioridadeAlta: number;
  papeis: Papel[];
}

const EM_EXECUCAO = ['mobilizacao', 'construcao', 'comissionamento'];

export function resumirClientes(
  organizacoes: Organizacao[],
  projetos: Empreendimento[],
  visoes: Map<string, VisaoEmpreendimento>,
): ResumoCliente[] {
  const res: ResumoCliente[] = [];
  for (const org of organizacoes) {
    const parts = projetos.flatMap((p) => p.participantes.filter((x) => x.organizacaoId === org.id).map((x) => ({ p, papel: x.papel })));
    if (!parts.length) continue;
    const projs = [...new Map(parts.map((x) => [x.p.id, x.p])).values()];
    const vs = projs.map((p) => visoes.get(p.id)).filter((v): v is VisaoEmpreendimento => !!v);
    const ativos = vs.filter((v) => v.statusGeral !== 'cancelado' && v.statusGeral !== 'concluido');
    const demandas = ativos.map((v) => v.dataDemandaBase).filter((d): d is string => !!d).sort();
    res.push({
      organizacao: org,
      empreendimentos: projs.length,
      ativos: ativos.length,
      emExecucao: ativos.filter((v) => EM_EXECUCAO.includes(v.situacaoObra)).length,
      planejados: ativos.filter((v) => v.situacaoObra === 'nao_iniciada').length,
      potencialCentral: ativos.reduce((s, v) => s + (v.mercado.central ?? 0), 0),
      proximaDemanda: demandas[0],
      prioridadeAlta: ativos.filter((v) => v.score.faixa === 'alta').length,
      papeis: [...new Set(parts.map((x) => x.papel))],
    });
  }
  return res.sort((a, b) => b.potencialCentral - a.potencialCentral || b.empreendimentos - a.empreendimentos);
}

export function fichaCliente(
  org: Organizacao,
  projetos: Empreendimento[],
  visoes: Map<string, VisaoEmpreendimento>,
  organizacoes: Map<string, Organizacao>,
  eventos: EventoMudanca[],
  oportunidades: OportunidadeComercial[],
) {
  const relacionados = projetos.filter((p) => p.participantes.some((x) => x.organizacaoId === org.id));
  const ids = new Set(relacionados.map((p) => p.id));
  const linhas = relacionados.map((p) => {
    const v = visoes.get(p.id);
    return {
      id: p.id,
      nome: p.nomeOficial,
      papeis: p.participantes.filter((x) => x.organizacaoId === org.id).map((x) => ROTULO_PAPEL[x.papel]),
      situacaoObra: p.situacaoObra,
      statusGeral: p.statusGeral,
      etapa: v?.etapa?.nome,
      tensaoMaxKv: v?.tensaoMaxKv,
      dataDemandaBase: v?.dataDemandaBase,
      energizacaoBase: v?.previsao.cenarios.base.datas.energizacao?.data,
      central: v?.mercado.central,
      faixaPrioridade: v?.score.faixa,
      capex: p.financeiro.capexTotal?.valorBRL,
      capexEletrico: p.financeiro.capexInfraEletrica?.valorBRL,
    };
  });
  // Contratos e fornecedores identificados nos empreendimentos do cliente
  const fornecedores = relacionados.flatMap((p) =>
    p.participantes
      .filter((x) => x.organizacaoId !== org.id && (PAPEIS_EXECUCAO.includes(x.papel) || x.papel === 'fornecedor' || x.papel === 'engenharia'))
      .map((x) => ({ empreendimentoId: p.id, empreendimento: p.nomeOficial, organizacao: organizacoes.get(x.organizacaoId)?.nome ?? x.organizacaoId, papel: ROTULO_PAPEL[x.papel], escopo: x.escopo })),
  );
  const contratos = relacionados.flatMap((p) =>
    p.contratos.map((c) => ({ empreendimentoId: p.id, empreendimento: p.nomeOficial, ...c, contratada: c.contratadaId ? organizacoes.get(c.contratadaId)?.nome : undefined })),
  );
  // Histórico de investimentos: CAPEX declarado por ano de anúncio/identificação
  const investimentos = relacionados
    .map((p) => {
      const anuncio = p.marcos.find((m) => m.tipo === 'anuncio' || m.tipo === 'contrato_concessao_assinado' || m.tipo === 'decisao_final_investimento');
      return { ano: (anuncio?.data ?? p.identificadoEm).slice(0, 4), valor: p.financeiro.capexTotal?.valorBRL ?? p.financeiro.capexInfraEletrica?.valorBRL ?? 0, empreendimento: p.nomeOficial };
    })
    .filter((x) => x.valor > 0)
    .sort((a, b) => (a.ano < b.ano ? -1 : 1));
  const documentos = relacionados
    .flatMap((p) => p.evidencias.map((e) => ({ ...e, empreendimentoId: p.id, empreendimento: p.nomeOficial })))
    .sort((a, b) => (dataReferenciaEvidencia(a) < dataReferenciaEvidencia(b) ? 1 : -1))
    .slice(0, 20);
  return {
    organizacao: org,
    empreendimentos: linhas,
    ativos: linhas.filter((l) => l.statusGeral === 'ativo' && l.situacaoObra !== 'concluida'),
    emExecucao: linhas.filter((l) => EM_EXECUCAO.includes(l.situacaoObra)),
    anunciados: linhas.filter((l) => l.situacaoObra === 'nao_iniciada' && l.statusGeral === 'ativo'),
    oportunidadesFuturas: linhas.filter((l) => l.dataDemandaBase).sort((a, b) => (a.dataDemandaBase! < b.dataDemandaBase! ? -1 : 1)),
    fornecedores,
    contratos,
    investimentos,
    eventos: eventos.filter((e) => ids.has(e.empreendimentoId)).sort((a, b) => (a.em < b.em ? 1 : -1)).slice(0, 20),
    documentos,
    relacionamento: oportunidades
      .filter((o) => ids.has(o.empreendimentoId))
      .map((o) => ({
        oportunidadeId: o.id,
        empreendimentoId: o.empreendimentoId,
        status: o.statusProspeccao,
        responsavel: o.responsavel,
        interacoes: o.interacoes,
        proximosPassos: o.proximosPassos.filter((x) => !x.concluido),
      })),
  };
}
