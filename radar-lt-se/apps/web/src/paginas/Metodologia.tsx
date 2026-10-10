import { CRITERIOS_SCORE, DESCRICAO_CLASSE_FONTE, DESCRICAO_STATUS_DADO, ETAPAS_PADRAO, FLUXOS_PADRAO, ROTULO_CRITERIO, ROTULO_NATUREZA_DATA, type ConfiguracaoPlataforma } from '@radar/core';
import { Carregando, Cartao } from '../componentes/base';
import { useApi } from '../lib/api';

export function PaginaMetodologia() {
  const { dados } = useApi<{ configuracao: ConfiguracaoPlataforma }>('/config');
  if (!dados) return <Carregando />;
  const c = dados.configuracao;
  const t = (x: [number, number, number]) => x.join(' / ');
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Metodologia</h1>
          <p>Como a plataforma estima janelas, confiança, potencial e prioridade. Os valores abaixo são os vigentes (Configurações). Premissas não são dados de mercado: substitua-as pelo histórico da empresa e use a calibração.</p>
        </div>
      </div>
      <div className="grade g2">
        <Cartao titulo="1. Dimensões separadas">
          <ul>
            <li><strong>Maturidade do projeto</strong> — etapas com status próprio (podem correr em paralelo), por fluxo.</li>
            <li><strong>Fase de contratação</strong> — por pacote (projeto executivo, fornecimento, montagem, civil, cabos, estruturas, comissionamento, energização) e escopo LT/SE.</li>
            <li><strong>Situação da obra</strong> — não iniciada, mobilização, construção, comissionamento, concluída, paralisada.</li>
            <li><strong>Necessidade comercial</strong> — quando o serviço deve ser demandado (RFQ estimada).</li>
          </ul>
          <p className="pequeno muted">Concessão ou licença não significa contratação de obra iminente: são marcos a partir dos quais a contratação é estimada.</p>
          <h3 style={{ marginTop: 10 }}>Etapas</h3>
          <ol className="pequeno">{ETAPAS_PADRAO.map((e) => <li key={e.id}><strong>{e.nome}</strong> — {e.descricao}</li>)}</ol>
          <h3 style={{ marginTop: 10 }}>Fluxos</h3>
          <ul className="pequeno">{FLUXOS_PADRAO.map((f) => <li key={f.id}><strong>{f.nome}</strong> — {f.descricao}</li>)}</ul>
        </Cartao>
        <Cartao titulo="2. Janelas de contratação">
          <ol className="pequeno">
            <li>Evento observado com evidência prevalece (✓ {ROTULO_NATUREZA_DATA.realizado}).</li>
            <li>Data publicada pela fonte é usada no cenário base (◆ {ROTULO_NATUREZA_DATA.divulgado}).</li>
            <li>Senão, âncora verificável + premissa (≈ {ROTULO_NATUREZA_DATA.calculado_de_marco}): outorga, decisão de investimento, parecer de acesso, leilão, edital.</li>
            <li>Sinais fracos (anúncio, inclusão em plano) geram (? {ROTULO_NATUREZA_DATA.heuristico}).</li>
            <li>Com prazo de energização, calcula-se a data-limite regressiva; nos cenários otimista/base a RFQ não é prevista depois dela (aviso “cronograma apertado”).</li>
            <li>Mobilização nunca antes da Licença de Instalação (real ou estimada). LI emitida sem RFQ identificada antecipa a RFQ (teto).</li>
            <li>Datas estimadas que passaram sem evidência ficam “vencidas” → necessidade “verificar”.</li>
          </ol>
          <table className="tabela" style={{ marginTop: 8 }}>
            <thead><tr><th>Premissa (meses)</th><th>Otim. / base / cons.</th></tr></thead>
            <tbody>
              <tr><td>Outorga → RFQ LT</td><td>{t(c.previsao.outorgaParaRfqLT)}</td></tr>
              <tr><td>Outorga → RFQ SE</td><td>{t(c.previsao.outorgaParaRfqSE)}</td></tr>
              <tr><td>FID → RFQ</td><td>{t(c.previsao.fidParaRfq)}</td></tr>
              <tr><td>RFQ → contrato</td><td>{t(c.previsao.rfqParaContrato)}</td></tr>
              <tr><td>Outorga → LI</td><td>{t(c.previsao.outorgaParaLI)}</td></tr>
              <tr><td>Obra de LT</td><td>{t(c.previsao.duracaoObraLT.fixo)} + {t(c.previsao.duracaoObraLT.por100km)} por 100 km</td></tr>
              <tr><td>Obra de SE nova</td><td>{t(c.previsao.duracaoObraSE.nova)}</td></tr>
              <tr><td>Obra de SE ampliação</td><td>{t(c.previsao.duracaoObraSE.ampliacao)}</td></tr>
            </tbody>
          </table>
        </Cartao>
        <Cartao titulo="3. Confiança da previsão (rubrica)">
          <table className="tabela">
            <thead><tr><th>Critério</th><th>Pontos</th></tr></thead>
            <tbody>
              <tr><td>Qualidade da fonte do marco de referência (A=3, B=2, C=1, D=0)</td><td>0–3</td></tr>
              <tr><td>Atualidade (≤ 90 dias = 2; ≤ 365 = 1)</td><td>0–2</td></tr>
              <tr><td>Fontes independentes sustentando marcos (≥ 3 = 2; 2 = 1)</td><td>0–2</td></tr>
              <tr><td>Consistência dos marcos (ordem, datas, conflitos)</td><td>0–2</td></tr>
              <tr><td>Método (realizado/divulgado = 2; calculado = 1; heurístico = 0)</td><td>0–2</td></tr>
            </tbody>
          </table>
          <p className="pequeno" style={{ marginTop: 6 }}>≥ 9 alta · ≥ 6 média · ≥ 3 baixa · &lt; 3 muito baixa. Heurístico limita a “baixa”; inconsistência grave limita a “média”. Não é probabilidade.</p>
          <h3 style={{ marginTop: 10 }}>Classes de fonte</h3>
          <ul className="pequeno">{Object.entries(DESCRICAO_CLASSE_FONTE).map(([k, v]) => <li key={k}><strong>{k}</strong> — {v}</li>)}</ul>
          <h3 style={{ marginTop: 10 }}>Status dos dados</h3>
          <ul className="pequeno">{Object.entries(DESCRICAO_STATUS_DADO).map(([k, v]) => <li key={k}><strong>{k}</strong> — {v}</li>)}</ul>
        </Cartao>
        <Cartao titulo="4. Potencial endereçável">
          <p className="pequeno">CAPEX total ≠ investimento em LT/SE ≠ oportunidade de serviços. Somente a última compõe o mercado endereçável.</p>
          <ul className="pequeno">
            <li>Escopos já contratados são excluídos.</li>
            <li>Com investimento elétrico declarado: LT {Math.round(c.mercado.participacaoServicosLT[0] * 100)}–{Math.round(c.mercado.participacaoServicosLT[1] * 100)}% e SE {Math.round(c.mercado.participacaoServicosSE[0] * 100)}–{Math.round(c.mercado.participacaoServicosSE[1] * 100)}% do investimento.</li>
            <li>Sem investimento declarado: referência paramétrica por km de LT (por classe de tensão) e por subestação (natureza e classe).</li>
            <li>Sem dados: “não estimável” (fora da soma).</li>
            <li>Resultado em faixa; central = ponto médio. {c.mercado.premissaIlustrativa ? <strong>Parâmetros atuais são ilustrativos.</strong> : 'Parâmetros personalizados.'}</li>
          </ul>
        </Cartao>
        <Cartao titulo="5. Índice de priorização">
          <table className="tabela">
            <thead><tr><th>Critério (nota 0–5)</th><th className="num">Peso</th></tr></thead>
            <tbody>{CRITERIOS_SCORE.map((k) => <tr key={k}><td>{ROTULO_CRITERIO[k]}</td><td className="num">{c.score.pesos[k]}</td></tr>)}</tbody>
          </table>
          <p className="pequeno" style={{ marginTop: 6 }}>Índice = média ponderada × 100. Alta ≥ {c.score.faixas.alta}; média ≥ {c.score.faixas.media}. Fora do escopo (&lt; 138 kV), suspensos, adiados e encerrados não entram nas faixas alta/média. Instrumento de ordenação — não é probabilidade.</p>
        </Cartao>
        <Cartao titulo="6. Rastreabilidade, deduplicação e IA">
          <ul className="pequeno">
            <li>Toda informação aponta para evidências (fonte, URL/documento, trecho, datas de publicação/coleta/confirmação).</li>
            <li>Deduplicação por identificador oficial, nome (extremidades de LT em qualquer ordem), empreendedor, UF, tensão, distância e extensão: vínculo automático ≥ {c.dedup.limiarAutomatico}; revisão manual ≥ {c.dedup.limiarRevisao}.</li>
            <li>Divergências viram conflitos visíveis; valor adotado por classe de fonte e data, com histórico; decisão final humana com justificativa.</li>
            <li>IA: cada item extraído precisa de citação literal verificada por código; o restante é descartado. Extrações entram como “inferidas” e só são aplicadas após revisão humana.</li>
          </ul>
        </Cartao>
      </div>
    </>
  );
}
