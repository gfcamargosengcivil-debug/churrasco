/**
 * Importação de planilhas (CSV/XLSX) para o cadastro mestre.
 * Lê a primeira aba (ou o CSV), identifica as colunas pelo cabeçalho (com sinônimos e
 * mapeamento configurável por fonte) e converte cada linha em RegistroNormalizado,
 * reportando erros por linha sem interromper a importação.
 */
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import {
  FASES_CONTRATACAO, SETORES, SITUACAO_AMBIENTAL, SITUACAO_ENGENHARIA, SITUACAO_FUNDIARIA, SITUACAO_REGULATORIA,
  SITUACOES_OBRA, STATUS_GERAL, SUBSETORES, TIPOS_DOCUMENTO, TIPOS_EMPREENDIMENTO, hojeISO, normalizarData, normalizarEnum,
  normalizarNumero, normalizarTexto, normalizarUF, normalizarValorMonetario, extrairTensoesKv, RegistroNormalizadoSchema,
  type Papel, type RegistroNormalizado, type TipoMarco, type UF,
} from '@radar/core';

export type Linha = Record<string, unknown>;

export interface ResultadoLeitura {
  linhas: Linha[];
  cabecalhos: string[];
  aba?: string;
}

export const LIMITE_LINHAS = 5000;
export const LIMITE_BYTES = 10 * 1024 * 1024;

function valorCelula(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return valorCelula(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('hyperlink' in v) return (v as { text?: string; hyperlink: string }).text ?? (v as { hyperlink: string }).hyperlink;
    return undefined;
  }
  return v;
}

export async function lerPlanilha(conteudo: Buffer, nomeArquivo: string): Promise<ResultadoLeitura> {
  if (conteudo.length > LIMITE_BYTES) throw new Error(`Arquivo excede ${LIMITE_BYTES / 1024 / 1024} MB.`);
  const ext = nomeArquivo.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') {
    let texto = conteudo.toString('utf8');
    if (texto.includes('�')) texto = conteudo.toString('latin1');
    texto = texto.replace(/^﻿/, '');
    const primeira = texto.split(/\r?\n/)[0] ?? '';
    const delimitador = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
    const registros = parseCsv(texto, {
      columns: (h: string[]) => h.map((c) => c.trim()),
      delimiter: delimitador,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    }) as Linha[];
    if (registros.length > LIMITE_LINHAS) throw new Error(`Planilha excede ${LIMITE_LINHAS} linhas.`);
    return { linhas: registros, cabecalhos: registros.length ? Object.keys(registros[0]) : [] };
  }
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(conteudo as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => normalizarTexto(w.name) !== 'instrucoes') ?? wb.worksheets[0];
    if (!ws) throw new Error('Planilha sem abas.');
    const cabecalhos: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      cabecalhos[col - 1] = String(valorCelula(cell.value) ?? '').trim();
    });
    const linhas: Linha[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const l: Linha = {};
      let temValor = false;
      cabecalhos.forEach((h, i) => {
        if (!h) return;
        const v = valorCelula(row.getCell(i + 1).value);
        if (v !== undefined && v !== '') temValor = true;
        l[h] = v;
      });
      if (temValor) linhas.push(l);
    });
    if (linhas.length > LIMITE_LINHAS) throw new Error(`Planilha excede ${LIMITE_LINHAS} linhas.`);
    return { linhas, cabecalhos: cabecalhos.filter(Boolean), aba: ws.name };
  }
  throw new Error('Formato não suportado: use .csv ou .xlsx.');
}

/** Colunas da planilha modelo e seus sinônimos aceitos. */
export const COLUNAS_MODELO: { campo: string; descricao: string; obrigatorio?: boolean; sinonimos?: string[]; exemplo?: string }[] = [
  { campo: 'nome', descricao: 'Nome oficial do empreendimento', obrigatorio: true, sinonimos: ['empreendimento', 'nome do empreendimento', 'projeto', 'obra', 'nome_oficial'], exemplo: '[EXEMPLO] LT 230 kV SE Exemplo A – SE Exemplo B' },
  { campo: 'chave_externa', descricao: 'Identificador do registro na fonte (opcional)', sinonimos: ['id', 'codigo', 'código'] },
  { campo: 'identificador_tipo', descricao: 'Tipo de identificador oficial (aneel_leilao_lote, aneel_rea, aneel_ceg, epe_pet, ons_par, mme_potee, licenca_ambiental, processo_ambiental, outro)' },
  { campo: 'identificador_valor', descricao: 'Valor do identificador oficial', sinonimos: ['lote', 'numero do lote', 'rea', 'ceg'] },
  { campo: 'tipo', descricao: 'LT, SE, LT+SE, conexao_geracao, expansao_industrial, infraestrutura_associada', exemplo: 'LT+SE' },
  { campo: 'setor', descricao: 'transmissao, geracao, mineracao, industria, distribuicao, outro', sinonimos: ['setor de origem'], exemplo: 'transmissao' },
  { campo: 'subsetor', descricao: 'Ex.: siderurgia, data_center, hidrogenio, eolica, solar, mineracao_ferro' },
  { campo: 'descricao', descricao: 'Descrição livre', sinonimos: ['objeto', 'descrição'] },
  { campo: 'empreendedor', descricao: 'Empreendedor/concessionária/proprietário', sinonimos: ['concessionaria', 'concessionária', 'vencedor', 'proprietario', 'empresa', 'agente'], exemplo: '[EXEMPLO] Transmissora Fictícia S.A.' },
  { campo: 'empreendedor_cnpj', descricao: 'CNPJ do empreendedor', sinonimos: ['cnpj'] },
  { campo: 'potencial_contratante', descricao: 'Quem deve contratar a obra, se diferente do empreendedor' },
  { campo: 'investidor', descricao: 'Investidor/controlador' },
  { campo: 'epc', descricao: 'EPC/executor já identificado' },
  { campo: 'ufs', descricao: 'UFs separadas por vírgula', sinonimos: ['uf', 'estado', 'estados'], exemplo: 'MG, BA' },
  { campo: 'municipios', descricao: 'Municípios no formato "Cidade/UF; Cidade/UF"', sinonimos: ['municipio', 'município', 'municípios', 'cidade'] },
  { campo: 'latitude', descricao: 'Latitude (graus decimais) — somente se constar da fonte', sinonimos: ['lat'] },
  { campo: 'longitude', descricao: 'Longitude (graus decimais) — somente se constar da fonte', sinonimos: ['lon', 'long'] },
  { campo: 'precisao_coordenada', descricao: 'exata, subestacao, municipio, aproximada (padrão: aproximada)' },
  { campo: 'tensao_kv', descricao: 'Tensões em kV (ex.: 500/230)', sinonimos: ['tensao', 'tensão', 'tensão (kv)', 'nivel de tensao', 'kv'], exemplo: '230' },
  { campo: 'extensao_km', descricao: 'Extensão total de LT (km)', sinonimos: ['extensao', 'extensão', 'extensão (km)', 'km'], exemplo: '120' },
  { campo: 'circuitos', descricao: 'Número de circuitos' },
  { campo: 'qtd_subestacoes', descricao: 'Quantidade de subestações', sinonimos: ['subestacoes', 'subestações', 'qtd se'] },
  { campo: 'capacidade_mva', descricao: 'Capacidade de transformação (MVA)', sinonimos: ['mva'] },
  { campo: 'potencia_mw', descricao: 'Potência/carga associada (MW)', sinonimos: ['mw', 'potencia', 'potência'] },
  { campo: 'capex_total_brl', descricao: 'CAPEX total do empreendimento (R$) — NÃO é o mercado endereçável', sinonimos: ['capex', 'investimento total'] },
  { campo: 'capex_eletrico_brl', descricao: 'Investimento em LT/SE (R$)', sinonimos: ['investimento previsto', 'investimento', 'investimento (r$)'] },
  { campo: 'rap_anual_brl', descricao: 'RAP anual (R$)', sinonimos: ['rap'] },
  { campo: 'fonte_financiamento', descricao: 'Fonte de financiamento (quando pública)' },
  { campo: 'situacao_regulatoria', descricao: SITUACAO_REGULATORIA.join(', ') },
  { campo: 'situacao_ambiental', descricao: SITUACAO_AMBIENTAL.join(', ') },
  { campo: 'situacao_fundiaria', descricao: SITUACAO_FUNDIARIA.join(', ') },
  { campo: 'situacao_engenharia', descricao: SITUACAO_ENGENHARIA.join(', ') },
  { campo: 'situacao_obra', descricao: SITUACOES_OBRA.join(', ') },
  { campo: 'status', descricao: STATUS_GERAL.join(', ') },
  { campo: 'data_anuncio', descricao: 'Data do anúncio (realizado)' },
  { campo: 'data_inclusao_plano', descricao: 'Inclusão em PDE/PET/POTEE/PAR' },
  { campo: 'data_edital', descricao: 'Publicação do edital' },
  { campo: 'data_leilao', descricao: 'Data do leilão', sinonimos: ['leilao', 'leilão', 'data do leilão'] },
  { campo: 'data_assinatura_concessao', descricao: 'Assinatura do contrato de concessão', sinonimos: ['assinatura do contrato', 'data de assinatura'] },
  { campo: 'data_autorizacao', descricao: 'Publicação da REA/autorização' },
  { campo: 'data_fid', descricao: 'Decisão final de investimento' },
  { campo: 'data_lp', descricao: 'Licença Prévia' },
  { campo: 'data_li', descricao: 'Licença de Instalação' },
  { campo: 'data_lo', descricao: 'Licença de Operação' },
  { campo: 'data_rfq', descricao: 'Publicação de RFQ/RFP de obra' },
  { campo: 'data_contrato_execucao', descricao: 'Assinatura do contrato de execução' },
  { campo: 'data_inicio_obras', descricao: 'Início das obras' },
  { campo: 'data_energizacao', descricao: 'Energização (realizada ou prevista pela fonte)' },
  { campo: 'prazo_contratual_energizacao', descricao: 'Prazo contratual de energização', sinonimos: ['prazo de energização', 'data de operação contratual', 'prazo'] },
  { campo: 'fase_contratacao_lt', descricao: `Fase de contratação de montagem de LT: ${FASES_CONTRATACAO.join(', ')}` },
  { campo: 'fase_contratacao_se', descricao: 'Fase de contratação de obras de SE' },
  { campo: 'contratada_lt', descricao: 'Empresa contratada para a LT' },
  { campo: 'contratada_se', descricao: 'Empresa contratada para a SE' },
  { campo: 'fonte_titulo', descricao: 'Título do documento de origem', obrigatorio: true, sinonimos: ['documento', 'fonte'], exemplo: '[EXEMPLO] Documento fictício de teste' },
  { campo: 'fonte_url', descricao: 'Link do documento de origem', sinonimos: ['url', 'link'] },
  { campo: 'fonte_data_publicacao', descricao: 'Data de publicação do documento', sinonimos: ['data de publicacao', 'data publicação'] },
  { campo: 'fonte_trecho', descricao: 'Trecho literal que sustenta os dados' },
  { campo: 'fonte_tipo_documento', descricao: TIPOS_DOCUMENTO.join(', ') },
];

const MARCO_POR_COLUNA: Record<string, TipoMarco> = {
  data_anuncio: 'anuncio',
  data_inclusao_plano: 'inclusao_planejamento',
  data_edital: 'edital_publicado',
  data_leilao: 'leilao_realizado',
  data_assinatura_concessao: 'contrato_concessao_assinado',
  data_autorizacao: 'autorizacao_publicada',
  data_fid: 'decisao_final_investimento',
  data_lp: 'licenca_previa',
  data_li: 'licenca_instalacao',
  data_lo: 'licenca_operacao',
  data_rfq: 'rfq_publicada',
  data_contrato_execucao: 'contrato_execucao_assinado',
  data_inicio_obras: 'inicio_obras',
  data_energizacao: 'energizacao',
  prazo_contratual_energizacao: 'prazo_contratual_energizacao',
};

export type MapeamentoColunas = Partial<Record<string, string[]>>;

/** Resolve, para cada campo do modelo, qual cabeçalho da planilha o fornece. */
export function resolverColunas(cabecalhos: string[], mapeamento: MapeamentoColunas = {}): Record<string, string> {
  const porNorm = new Map(cabecalhos.map((h) => [normalizarTexto(h).replace(/[\s_-]+/g, ' '), h]));
  const res: Record<string, string> = {};
  for (const col of COLUNAS_MODELO) {
    const candidatos = [...(mapeamento[col.campo] ?? []), col.campo, ...(col.sinonimos ?? [])];
    for (const c of candidatos) {
      const h = porNorm.get(normalizarTexto(c).replace(/[\s_-]+/g, ' '));
      if (h) {
        res[col.campo] = h;
        break;
      }
    }
  }
  return res;
}

export interface ErroLinha {
  linha: number;
  mensagem: string;
}

export interface OpcoesMapeamento {
  fonteId: string;
  mapeamento?: MapeamentoColunas;
  hoje?: string;
  setorPadrao?: string;
  tipoPadrao?: string;
  /** Prefixo da linha no relatório (planilhas têm cabeçalho na linha 1). */
  primeiraLinha?: number;
  demo?: boolean;
}

const lista = (v: unknown) =>
  String(v ?? '')
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function mapearLinhas(linhas: Linha[], cabecalhos: string[], opcoes: OpcoesMapeamento): { registros: RegistroNormalizado[]; erros: ErroLinha[]; colunas: Record<string, string>; ignoradas: string[] } {
  const colunas = resolverColunas(cabecalhos, opcoes.mapeamento);
  const usadas = new Set(Object.values(colunas));
  const ignoradas = cabecalhos.filter((h) => !usadas.has(h));
  const hoje = opcoes.hoje ?? hojeISO();
  const registros: RegistroNormalizado[] = [];
  const erros: ErroLinha[] = [];
  const base = opcoes.primeiraLinha ?? 2;

  linhas.forEach((l, i) => {
    const n = base + i;
    const v = (campo: string) => {
      const h = colunas[campo];
      const x = h ? l[h] : undefined;
      return typeof x === 'string' ? x.trim() : x;
    };
    const avisosLinha: string[] = [];
    try {
      const nome = String(v('nome') ?? '').trim();
      if (!nome) throw new Error('coluna "nome" vazia');
      if (/^\[exemplo\]/i.test(nome)) throw new Error('linha de EXEMPLO da planilha modelo ignorada');
      const ufs = new Set<UF>();
      for (const u of lista(v('ufs'))) {
        const uf = normalizarUF(u);
        if (uf) ufs.add(uf);
        else avisosLinha.push(`UF inválida "${u}"`);
      }
      const municipios = lista(v('municipios'))
        .map((m) => {
          const [nomeM, ufM] = m.split('/').map((x) => x.trim());
          const uf = normalizarUF(ufM);
          if (!uf) {
            avisosLinha.push(`município sem UF válida "${m}"`);
            return undefined;
          }
          ufs.add(uf);
          return { nome: nomeM, uf };
        })
        .filter((m): m is { nome: string; uf: UF } => !!m);

      const lat = normalizarNumero(v('latitude'));
      const lon = normalizarNumero(v('longitude'));
      let ponto: RegistroNormalizado['ponto'];
      if (lat !== undefined && lon !== undefined) {
        if (lat < -35 || lat > 6 || lon < -75 || lon > -28) avisosLinha.push('coordenadas fora do território brasileiro — ignoradas');
        else {
          const precisao = normalizarEnum(v('precisao_coordenada'), ['exata', 'subestacao', 'municipio', 'aproximada'] as const) ?? 'aproximada';
          ponto = { lat, lon, precisao, fonte: 'planilha importada' };
        }
      }

      const organizacoes: NonNullable<RegistroNormalizado['organizacoes']> = [];
      const addOrg = (campo: string, papel: Papel, cnpj?: string) => {
        const nomeOrg = v(campo);
        if (nomeOrg && String(nomeOrg).trim().length >= 2) organizacoes.push({ nome: String(nomeOrg).trim(), papel, cnpj });
      };
      const setor = normalizarEnum(v('setor') ?? opcoes.setorPadrao, SETORES, { 'transmissão': 'transmissao', 'geração': 'geracao', 'mineração': 'mineracao', 'indústria': 'industria', 'distribuição': 'distribuicao' });
      addOrg('empreendedor', setor === 'transmissao' ? 'concessionaria' : 'empreendedor', v('empreendedor_cnpj') ? String(v('empreendedor_cnpj')) : undefined);
      addOrg('potencial_contratante', 'potencial_contratante');
      addOrg('investidor', 'investidor');
      addOrg('epc', 'epc');

      const hojeRef = hoje;
      const marcos: NonNullable<RegistroNormalizado['marcos']> = [];
      for (const [coluna, tipo] of Object.entries(MARCO_POR_COLUNA)) {
        const bruto = v(coluna);
        if (bruto === undefined || bruto === '') continue;
        const d = normalizarData(bruto);
        if (!d) {
          avisosLinha.push(`data inválida em "${colunas[coluna]}": ${String(bruto)}`);
          continue;
        }
        const natureza = tipo === 'prazo_contratual_energizacao' ? 'previsto_oficial' : d.data <= hojeRef ? 'realizado' : 'previsto_oficial';
        marcos.push({ tipo, data: d.data, natureza, descricao: d.precisao !== 'dia' ? `Data informada com precisão de ${d.precisao}` : undefined });
      }

      const pacotes: NonNullable<RegistroNormalizado['pacotes']> = [];
      for (const esc of ['lt', 'se'] as const) {
        const fase = normalizarEnum(v(`fase_contratacao_${esc}`), FASES_CONTRATACAO, { contratado: 'contratada', rfq: 'rfq_rfp', rfp: 'rfq_rfp', cotacao: 'rfq_rfp' });
        const contratada = v(`contratada_${esc}`) ? String(v(`contratada_${esc}`)) : undefined;
        if (fase || contratada) {
          pacotes.push({
            pacote: esc === 'lt' ? 'montagem_eletromecanica' : 'construcao_civil',
            escopo: esc === 'lt' ? 'LT' : 'SE',
            faseContratacao: fase ?? 'contratada',
            contratada,
          });
        }
      }

      const idTipo = v('identificador_tipo');
      const idValor = v('identificador_valor');
      const tensoes = extrairTensoesKv(typeof v('tensao_kv') === 'number' ? (v('tensao_kv') as number) : String(v('tensao_kv') ?? '').replace(/^(\d+(?:[.,]\d+)?)(\s*\/\s*\d+)*$/, '$& kV'));
      const pub = normalizarData(v('fonte_data_publicacao'));
      const tipoDoc = normalizarEnum(v('fonte_tipo_documento'), TIPOS_DOCUMENTO) ?? 'planilha';
      const fonteTitulo = String(v('fonte_titulo') ?? '').trim();
      if (!fonteTitulo) throw new Error('coluna "fonte_titulo" vazia — toda linha precisa de documento de origem');

      const registro: RegistroNormalizado = {
        fonteId: opcoes.fonteId,
        chaveExterna: v('chave_externa') ? String(v('chave_externa')) : undefined,
        nome,
        identificadores: idTipo && idValor ? [{ tipo: normalizarEnum(idTipo, ['aneel_leilao_lote', 'aneel_rea', 'aneel_contrato_concessao', 'aneel_ceg', 'epe_pet', 'ons_par', 'mme_potee', 'licenca_ambiental', 'processo_ambiental', 'cnpj_spe', 'interno', 'outro'] as const) ?? 'outro', valor: String(idValor) }] : undefined,
        tipo: normalizarEnum(v('tipo') ?? opcoes.tipoPadrao, TIPOS_EMPREENDIMENTO, { 'lt + se': 'LT+SE', 'lt/se': 'LT+SE' }),
        setorOrigem: setor,
        subsetor: normalizarEnum(v('subsetor'), SUBSETORES),
        descricao: v('descricao') ? String(v('descricao')) : undefined,
        organizacoes: organizacoes.length ? organizacoes : undefined,
        ufs: ufs.size ? [...ufs] : undefined,
        municipios: municipios.length ? municipios : undefined,
        ponto,
        tensoesKv: tensoes.length ? tensoes : undefined,
        extensaoKm: normalizarNumero(v('extensao_km')) || undefined,
        circuitos: normalizarNumero(v('circuitos')) || undefined,
        qtdSubestacoes: normalizarNumero(v('qtd_subestacoes')),
        capacidadeMva: normalizarNumero(v('capacidade_mva')),
        potenciaMw: normalizarNumero(v('potencia_mw')),
        capexTotalBRL: normalizarValorMonetario(v('capex_total_brl')),
        capexInfraEletricaBRL: normalizarValorMonetario(v('capex_eletrico_brl')),
        rapAnualBRL: normalizarValorMonetario(v('rap_anual_brl')),
        fonteFinanciamento: v('fonte_financiamento') ? String(v('fonte_financiamento')) : undefined,
        situacoes: {
          regulatoria: normalizarEnum(v('situacao_regulatoria'), SITUACAO_REGULATORIA),
          ambiental: normalizarEnum(v('situacao_ambiental'), SITUACAO_AMBIENTAL),
          fundiaria: normalizarEnum(v('situacao_fundiaria'), SITUACAO_FUNDIARIA),
          engenharia: normalizarEnum(v('situacao_engenharia'), SITUACAO_ENGENHARIA),
        },
        situacaoObra: normalizarEnum(v('situacao_obra'), SITUACOES_OBRA),
        statusGeral: normalizarEnum(v('status'), STATUS_GERAL),
        marcos: marcos.length ? marcos : undefined,
        pacotes: pacotes.length ? pacotes : undefined,
        evidencia: {
          titulo: fonteTitulo,
          url: v('fonte_url') ? String(v('fonte_url')) : undefined,
          trecho: v('fonte_trecho') ? String(v('fonte_trecho')) : undefined,
          tipoDocumento: tipoDoc,
          dataPublicacao: pub?.data,
        },
        demo: opcoes.demo,
      };
      const validado = RegistroNormalizadoSchema.safeParse(registro);
      if (!validado.success) {
        throw new Error(validado.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '));
      }
      registros.push(validado.data);
      for (const a of avisosLinha) erros.push({ linha: n, mensagem: `aviso: ${a}` });
    } catch (e) {
      erros.push({ linha: n, mensagem: (e as Error).message });
    }
  });
  return { registros, erros, colunas, ignoradas };
}

/** Gera a planilha modelo (XLSX) com instruções e uma linha de exemplo FICTÍCIA. */
export async function gerarPlanilhaModelo(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Radar LT/SE';
  const ws = wb.addWorksheet('empreendimentos');
  ws.columns = COLUNAS_MODELO.map((c) => ({ header: c.campo, key: c.campo, width: Math.max(14, c.campo.length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(Object.fromEntries(COLUNAS_MODELO.filter((c) => c.exemplo).map((c) => [c.campo, c.exemplo])));
  ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  const inst = wb.addWorksheet('instrucoes');
  inst.columns = [
    { header: 'coluna', key: 'campo', width: 30 },
    { header: 'obrigatória', key: 'obrigatorio', width: 12 },
    { header: 'descrição', key: 'descricao', width: 90 },
    { header: 'sinônimos aceitos', key: 'sinonimos', width: 50 },
  ];
  inst.getRow(1).font = { bold: true };
  inst.addRow({ campo: 'ATENÇÃO', descricao: 'A linha 2 da aba "empreendimentos" é um EXEMPLO FICTÍCIO: apague-a antes de importar. Informe apenas dados que constam da fonte; não preencha coordenadas estimadas.' });
  inst.addRow({ campo: 'Datas', descricao: 'Datas até hoje são registradas como "realizado"; datas futuras como "previsto (divulgado)". Formatos: dd/mm/aaaa, aaaa-mm-dd, mm/aaaa, "março de 2027".' });
  for (const c of COLUNAS_MODELO) inst.addRow({ campo: c.campo, obrigatorio: c.obrigatorio ? 'sim' : '', descricao: c.descricao, sinonimos: (c.sinonimos ?? []).join(', ') });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

