import { describe, expect, it } from 'vitest';
import {
  criarEmpreendimentoDeRegistro, decidirCorrespondencia, mesclarRegistro, pontuarCorrespondencia, resolverConflito, type Organizacao,
  type RegistroNormalizado,
} from '../src/index.js';
import { fonte, marco, projeto } from './fabrica.js';

const ANEEL = fonte({ id: 'aneel', classe: 'A' });
const IMPRENSA = fonte({ id: 'imprensa', classe: 'C', categoria: 'imprensa' });
const RI = fonte({ id: 'ri', classe: 'B', categoria: 'empresa' });
const ORG: Organizacao = { id: 'o1', nome: 'Transmissora Exemplo S.A.', nomesAlternativos: [], tipo: 'concessionaria_transmissao', setores: [], demo: false };

function registro(dados: Partial<RegistroNormalizado> = {}): RegistroNormalizado {
  return {
    fonteId: 'aneel',
    nome: 'LT 500 kV Alfa – Beta',
    evidencia: { titulo: 'Documento', tipoDocumento: 'ato_regulatorio', dataPublicacao: '2025-05-01', url: 'https://exemplo.invalid/doc' },
    ...dados,
  };
}

describe('deduplicação', () => {
  const p = projeto({
    nomeOficial: 'LT 500 kV Alfa – Beta C1',
    identificadores: [{ tipo: 'aneel_leilao_lote', valor: '02/2025-L5' }],
    trechosLT: [{ id: 't', nome: 'LT 500 kV Alfa – Beta', tensaoKv: 500, corrente: 'CA', extensaoKm: 210, evidenciaIds: [] }],
    localizacao: { ufs: ['MG', 'BA'], municipios: [] },
    participantes: [{ organizacaoId: 'o1', papel: 'concessionaria', evidenciaIds: [] }],
  });
  const orgs = new Map([[ORG.id, ORG]]);

  it('identificador oficial coincidente vincula automaticamente', () => {
    const d = decidirCorrespondencia(registro({ nome: 'Lote 5', identificadores: [{ tipo: 'aneel_leilao_lote', valor: '02/2025 - L5' }] }), [p], orgs);
    expect(d.acao).toBe('vincular');
  });

  it('identificador compartilhado (contrato/REA) não decide sozinho; exclusivos distintos separam', () => {
    const reforco = projeto({
      nomeOficial: 'Reforço na SE Gama: 3º ATF 500/230 kV',
      identificadores: [{ tipo: 'aneel_siget_empreendimento', valor: '100' }, { tipo: 'aneel_contrato_concessao', valor: '004/2007' }, { tipo: 'aneel_rea', valor: 'REA-1' }],
      localizacao: { ufs: ['SP'], municipios: [] },
    });
    const outro = registro({ nome: 'Reforço na SE Delta: novo reator 500 kV', ufs: ['SP'], identificadores: [{ tipo: 'aneel_contrato_concessao', valor: '004/2007' }, { tipo: 'aneel_rea', valor: 'REA-1' }] });
    expect(decidirCorrespondencia(outro, [reforco], orgs).acao).toBe('novo');
    const irmao = registro({ nome: 'Reforço na SE Gama: 3º ATF 500/230 kV', ufs: ['SP'], identificadores: [{ tipo: 'aneel_siget_empreendimento', valor: '101' }, { tipo: 'aneel_contrato_concessao', valor: '004/2007' }] });
    const d = decidirCorrespondencia(irmao, [reforco], orgs);
    expect(d.acao).toBe('novo');
    expect(d.candidatos[0]?.motivos[0] ?? 'Identificadores oficiais distintos').toContain('distintos');
    const mesmo = registro({ nome: 'qualquer', identificadores: [{ tipo: 'chave_fonte', valor: 'siget|100' }, { tipo: 'aneel_siget_empreendimento', valor: '100' }] });
    expect(decidirCorrespondencia(mesmo, [reforco], orgs).acao).toBe('vincular');
  });

  it('identidade estrutural de LT: mesmo circuito vincula; circuito ou SE de seccionamento diferentes separam', () => {
    const lt = (nome: string, extra: Partial<Parameters<typeof projeto>[0]> = {}) => projeto({ nomeOficial: nome, localizacao: { ufs: ['BA', 'ES'], municipios: [] }, ...extra });
    const c1 = lt('LT 500kV Medeiros Neto II - João Neiva 2 C1');
    const c2 = lt('LT 500kV Medeiros Neto II - João Neiva 2 C2');
    const epeC2 = registro({ nome: 'LT 500 kV Medeiros Neto II - João Neiva 2, C2', tensoesKv: [500], ufs: ['ES'] });
    const d = decidirCorrespondencia(epeC2, [c1, c2], orgs);
    expect(d).toMatchObject({ acao: 'vincular', empreendimentoId: c2.id });
    expect(pontuarCorrespondencia(epeC2, c1, orgs).pontuacao).toBeLessThan(0.55);
    const seccIco = lt('Reforço - Seccionamento da LT Banabuiú-Milagres C2 na SE Icó.', { localizacao: { ufs: ['CE'], municipios: [] } });
    expect(decidirCorrespondencia(registro({ nome: 'SECC LT 230 kV Banabuiú - Milagres, C2 na SE Gameleira', ufs: ['CE'] }), [seccIco], orgs).acao).not.toBe('vincular');
    expect(decidirCorrespondencia(registro({ nome: 'SECC LT 230 kV Milagres - Banabuiú, C2, na SE Icó', ufs: ['CE'] }), [seccIco], orgs).acao).toBe('vincular');
  });

  it('chave da própria fonte prevalece sobre identificador exclusivo divergente', () => {
    const q = projeto({
      nomeOficial: 'Reforço na SE Delta',
      identificadores: [{ tipo: 'ons_empreendimento', valor: '10' }, { tipo: 'chave_fonte', valor: 'aneel-siget|siget:7' }],
    });
    const c = pontuarCorrespondencia(registro({ nome: 'Reforço na SE Delta', identificadores: [{ tipo: 'ons_empreendimento', valor: '11' }, { tipo: 'chave_fonte', valor: 'aneel-siget|siget:7' }] }), q, orgs);
    expect(c.pontuacao).toBe(1);
  });

  it('LT componente de empreendimento multi-tensão não é penalizada pela tensão máxima', () => {
    const multi = projeto({
      nomeOficial: 'SE 500/230 kV Zebu III e LT 230 kV Zebu II - Zebu III, C1',
      trechosLT: [{ id: 't', nome: 'LT 230 kV ZEBU II /ZEBU III C-1', tensaoKv: 230, corrente: 'CA', origem: 'ZEBU II', destino: 'ZEBU III', evidenciaIds: [] }],
      subestacoes: [{ id: 's', nome: 'SE Zebu III', natureza: 'nova', tensoesKv: [500, 230], evidenciaIds: [] }],
      localizacao: { ufs: ['AL'], municipios: [] },
    });
    const c = pontuarCorrespondencia(registro({ nome: 'LT 230 kV Zebu II - Zebu III, C1', tensoesKv: [230], ufs: ['AL'] }), multi, orgs);
    expect(c.motivos.join(' ')).not.toContain('Tensões diferentes');
    expect(c.pontuacao).toBeGreaterThanOrEqual(0.86);
  });

  it('nome + UF + tensão + empreendedor vinculam automaticamente', () => {
    const d = decidirCorrespondencia(
      registro({ nome: 'Linha de Transmissão Beta - Alfa', tensoesKv: [500], ufs: ['BA'], extensaoKm: 205, organizacoes: [{ nome: 'TRANSMISSORA EXEMPLO SA', papel: 'concessionaria' }] }),
      [p],
      orgs,
    );
    expect(d.acao).toBe('vincular');
  });

  it('correspondência parcial vai para revisão manual', () => {
    const d = decidirCorrespondencia(registro({ nome: 'LT Alfa – Beta', ufs: ['MG'] }), [p], orgs);
    expect(d.acao).toBe('revisar');
    expect(d.candidatos[0].motivos.length).toBeGreaterThan(0);
  });

  it('tensão e UF diferentes → novo empreendimento', () => {
    const d = decidirCorrespondencia(registro({ nome: 'LT 230 kV Gama – Delta', tensoesKv: [230], ufs: ['RS'] }), [p], orgs);
    expect(d.acao).toBe('novo');
  });
});

describe('mescla com rastreabilidade e conflitos', () => {
  const ctx = (f = ANEEL) => ({ fonte: f, organizacoes: [ORG], por: 'teste', origem: 'ingestao' as const, agora: '2025-06-01T12:00:00Z' });

  it('cria empreendimento com proveniência, histórico e organização resolvida', () => {
    const r = criarEmpreendimentoDeRegistro(
      registro({ tensoesKv: [500], extensaoKm: 210, ufs: ['MG'], organizacoes: [{ nome: 'Transmissora Exemplo SA', papel: 'concessionaria' }, { nome: 'Nova Construtora Ltda', papel: 'epc' }] }),
      ctx(),
      'RLT-000001',
    );
    expect(r.projeto.tipo).toBe('LT');
    expect(r.projeto.proveniencia['tecnico.extensaoKm']).toMatchObject({ status: 'confirmado' });
    expect(r.projeto.participantes.find((x) => x.papel === 'concessionaria')?.organizacaoId).toBe('o1');
    expect(r.organizacoesNovas.map((o) => o.nome)).toEqual(['Nova Construtora Ltda']);
    expect(r.projeto.historico[0].campo).toBe('empreendimento');
    expect(r.projeto.evidencias).toHaveLength(1);
  });

  it('valor igual reforça a proveniência sem criar conflito', () => {
    const base = criarEmpreendimentoDeRegistro(registro({ extensaoKm: 210 }), ctx(), 'X').projeto;
    const r = mesclarRegistro(base, registro({ fonteId: 'ri', extensaoKm: 210.5, evidencia: { titulo: 'RI', tipoDocumento: 'relatorio_ri' } }), ctx(RI));
    expect(r.conflitosNovos).toHaveLength(0);
    expect(r.projeto.proveniencia['tecnico.extensaoKm'].evidenciaIds).toHaveLength(2);
  });

  it('divergência gera conflito visível e prioriza a fonte oficial', () => {
    const base = criarEmpreendimentoDeRegistro(registro({ fonteId: 'imprensa', extensaoKm: 250, evidencia: { titulo: 'Notícia', tipoDocumento: 'noticia' } }), ctx(IMPRENSA), 'X').projeto;
    expect(base.proveniencia['tecnico.extensaoKm'].status).toBe('inferido');
    const r = mesclarRegistro(base, registro({ extensaoKm: 210 }), ctx(ANEEL));
    expect(r.conflitosNovos).toHaveLength(1);
    const c = r.projeto.conflitos[0];
    expect(c.status).toBe('aberto');
    expect(c.valores.map((v) => v.valor)).toEqual([250, 210]);
    expect(c.valorAdotado).toBe(210);
    expect(c.criterioAdocao).toContain('maior classe');
    expect(r.projeto.tecnico.extensaoKm).toBe(210);
    expect(r.projeto.proveniencia['tecnico.extensaoKm'].emConflito).toBe(true);
    expect(r.projeto.historico.some((h) => h.campo === 'tecnico.extensaoKm' && h.de === 250 && h.para === 210)).toBe(true);
  });

  it('fonte de menor classe não substitui valor oficial, mas registra a divergência', () => {
    const base = criarEmpreendimentoDeRegistro(registro({ extensaoKm: 210 }), ctx(), 'X').projeto;
    const r = mesclarRegistro(base, registro({ fonteId: 'imprensa', extensaoKm: 300, evidencia: { titulo: 'Notícia', tipoDocumento: 'noticia' } }), ctx(IMPRENSA));
    expect(r.projeto.tecnico.extensaoKm).toBe(210);
    expect(r.projeto.conflitos[0].valorAdotado).toBe(210);
  });

  it('revisão de cronograma atualiza a data prevista e registra histórico', () => {
    const base = projeto({ marcos: [{ ...marco('energizacao', '2027-06-01', 'previsto_oficial'), evidenciaIds: [] }] });
    const r = mesclarRegistro(base, registro({ marcos: [{ tipo: 'energizacao', data: '2027-12-01', natureza: 'previsto_oficial' }] }), ctx());
    expect(r.projeto.marcos[0].data).toBe('2027-12-01');
    expect(r.projeto.historico.some((h) => h.campo === 'marcos.energizacao.geral' && h.de === '2027-06-01')).toBe(true);
    expect(r.conflitosNovos).toHaveLength(0);
  });

  it('marco realizado substitui o previsto', () => {
    const base = projeto({ marcos: [marco('licenca_instalacao', '2025-08-01', 'previsto_estimado')] });
    const r = mesclarRegistro(base, registro({ marcos: [{ tipo: 'licenca_instalacao', data: '2025-07-20', natureza: 'realizado' }] }), ctx());
    const li = r.projeto.marcos.filter((m) => m.tipo === 'licenca_instalacao');
    expect(li).toHaveLength(1);
    expect(li[0]).toMatchObject({ natureza: 'realizado', data: '2025-07-20' });
  });

  it('pacote avança de fase e identifica a contratada', () => {
    const base = projeto({ pacotes: [{ pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'rfq_rfp', evidenciaIds: [] }] });
    const r = mesclarRegistro(base, registro({ pacotes: [{ pacote: 'montagem_eletromecanica', escopo: 'LT', faseContratacao: 'contratada', contratada: 'Construtora Z', dataEvento: '2025-05-20' }] }), ctx());
    expect(r.projeto.pacotes[0].faseContratacao).toBe('contratada');
    expect(r.projeto.participantes.some((x) => x.papel === 'executor_obra')).toBe(true);
  });

  it('resolução manual de conflito registra justificativa e histórico', () => {
    const base = criarEmpreendimentoDeRegistro(registro({ fonteId: 'imprensa', extensaoKm: 250, evidencia: { titulo: 'N', tipoDocumento: 'noticia' } }), ctx(IMPRENSA), 'X').projeto;
    const comConflito = mesclarRegistro(base, registro({ extensaoKm: 210 }), ctx()).projeto;
    const c = comConflito.conflitos[0];
    const resolvido = resolverConflito(comConflito, c.id, 212, 'Memorial descritivo revisado', 'analista', (proj, v) => (proj.tecnico.extensaoKm = v as number));
    expect(resolvido.conflitos[0]).toMatchObject({ status: 'resolvido', valorAdotado: 212 });
    expect(resolvido.tecnico.extensaoKm).toBe(212);
    expect(resolvido.proveniencia['tecnico.extensaoKm'].emConflito).toBe(false);
    expect(resolvido.historico.at(-1)?.observacao).toContain('Memorial descritivo revisado');
  });

  it('extração por IA entra sempre como inferida', () => {
    const r = criarEmpreendimentoDeRegistro(registro({ extensaoKm: 210 }), { ...ctx(), origem: 'ia' }, 'X');
    expect(r.projeto.proveniencia['tecnico.extensaoKm'].status).toBe('inferido');
  });
});
