import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Carregando } from './componentes/base';
import { ESTATICO, useApi } from './lib/api';
import { dataHoraBR } from './lib/formatos';
import { TelaLogin, useAuth } from './lib/auth';
import { PaginaAlertas } from './paginas/Alertas';
import { PaginaClienteFicha, PaginaClientes } from './paginas/Clientes';
import { PaginaComercial } from './paginas/Comercial';
import { PaginaConfiguracoes } from './paginas/Configuracoes';
import { PaginaExecutivo } from './paginas/Executivo';
import { PaginaFicha } from './paginas/Ficha';
import { PaginaFontes } from './paginas/Fontes';
import { PaginaFunil } from './paginas/Funil';
import { PaginaMapa } from './paginas/Mapa';
import { PaginaMetodologia } from './paginas/Metodologia';
import { PaginaPrevisao } from './paginas/Previsao';
import { PaginaQualidade } from './paginas/Qualidade';
import { PaginaRadar } from './paginas/Radar';

interface Eu {
  id: string;
  email?: string;
  nome?: string;
  papel: 'admin' | 'analista' | 'comercial' | 'leitor';
}

/** Metadados da versão publicada (gerados pela coleta automática). */
interface Publicacao {
  geradoEm: string;
  coletas: { fonteId: string; fonte: string; status: string; registrosLidos: number; criados: number; atualizados: number; erros: string[] }[];
  empreendimentos: number;
  demo?: boolean;
}

function AvisoPublicacao({ p }: { p: Publicacao }) {
  const falhas = p.coletas.filter((c) => c.status === 'erro');
  return (
    <div className="aviso info" role="note">
      <strong>Versão publicada — somente consulta.</strong>{' '}
      {p.demo ? <>{p.empreendimentos} empreendimentos de DEMONSTRAÇÃO (fictícios), gerados em {dataHoraBR(p.geradoEm)}.</> : (
        <>
          {p.empreendimentos} empreendimentos de fontes públicas; atualização em {dataHoraBR(p.geradoEm)}
          {p.coletas.length ? <> ({p.coletas.filter((c) => c.status !== 'erro').map((c) => c.fonte).join('; ') || 'nenhuma fonte respondeu'})</> : ' (sem coleta automática nesta publicação)'}.
        </>
      )}
      {falhas.length > 0 && <> Sem resposta nesta coleta: {falhas.map((c) => c.fonte).join('; ')} — dados anteriores mantidos.</>}
      {' '}Datas calculadas são estimativas da plataforma, não compromissos dos empreendedores.
    </div>
  );
}

const NAV: { grupo?: string; para: string; rotulo: string; icone: string }[] = [
  { grupo: 'Estratégia', para: '/', rotulo: 'Visão executiva', icone: '◧' },
  { para: '/radar', rotulo: 'Radar de oportunidades', icone: '◎' },
  { para: '/mapa', rotulo: 'Mapa', icone: '⌖' },
  { para: '/funil', rotulo: 'Funil de contratação', icone: '⏷' },
  { para: '/previsao', rotulo: 'Previsão de demanda', icone: '◷' },
  { grupo: 'Relacionamento', para: '/clientes', rotulo: 'Clientes', icone: '◫' },
  { para: '/comercial', rotulo: 'Gestão comercial', icone: '◈' },
  { para: '/alertas', rotulo: 'Monitoramento e alertas', icone: '◉' },
  { grupo: 'Dados', para: '/fontes', rotulo: 'Fontes e ingestão', icone: '⇣' },
  { para: '/qualidade', rotulo: 'Qualidade e revisão', icone: '✓' },
  { para: '/metodologia', rotulo: 'Metodologia', icone: 'ℹ' },
  { para: '/config', rotulo: 'Configurações', icone: '⚙' },
];

function alternarTema() {
  const atual = document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try {
    localStorage.setItem('radar.tema', novo);
  } catch {
    /* preferência apenas nesta sessão */
  }
}

export function App() {
  const { sessao, carregando, modo, sair } = useAuth();
  const [menu, setMenu] = useState(false);
  const local = useLocation();
  useEffect(() => setMenu(false), [local.pathname]);
  const autenticado = modo === 'dev' || !!sessao;
  const { dados: eu } = useApi<Eu>(autenticado ? '/eu' : null);
  const { dados: naoLidas } = useApi<unknown[]>(autenticado ? `/alertas/notificacoes?lido=0&p=${encodeURIComponent(local.pathname)}` : null);
  const { dados: publicacao } = useApi<Publicacao>(ESTATICO ? '/publicacao' : null);

  if (carregando) return <Carregando />;
  if (!autenticado) return <TelaLogin />;

  return (
    <div className="app">
      <aside className={`lateral ${menu ? 'aberta' : ''}`} aria-label="Navegação principal">
        <div className="marca">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="var(--acento)" />
            <path d="M9 22 L16 8 L23 22 M12 16 H20" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
          <div>
            <strong>Radar LT/SE</strong>
            <span>Obras ≥ 138 kV</span>
          </div>
        </div>
        {NAV.map((n) => (
          <div key={n.para}>
            {n.grupo && <div className="nav-grupo">{n.grupo}</div>}
            <NavLink to={n.para} end={n.para === '/'} className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`}>
              <span aria-hidden style={{ width: 16, textAlign: 'center' }}>{n.icone}</span>
              {n.rotulo}
              {n.para === '/alertas' && !!naoLidas?.length && <span className="num">{naoLidas.length}</span>}
            </NavLink>
          </div>
        ))}
        <div className="lateral-rodape">
          {ESTATICO ? (
            <div>Versão publicada · somente consulta{publicacao && <><br />Dados de {dataHoraBR(publicacao.geradoEm)}</>}</div>
          ) : (
            <>
              <div>{eu ? `${eu.email ?? eu.nome ?? eu.id} · ${eu.papel}` : '…'}</div>
              {modo === 'dev' && <div style={{ color: 'var(--atencao-texto)' }}>Modo desenvolvimento (sem login)</div>}
            </>
          )}
          <div className="flex" style={{ marginTop: 8 }}>
            <button className="botao peq" onClick={alternarTema}>Tema claro/escuro</button>
            {modo === 'supabase' && <button className="botao peq" onClick={() => void sair()}>Sair</button>}
          </div>
        </div>
      </aside>
      <div className="principal">
        <div className="topo-movel">
          <button className="botao" onClick={() => setMenu(true)} aria-label="Abrir menu">☰</button>
          <strong>Radar LT/SE</strong>
        </div>
        <main className="conteudo">
          {ESTATICO && publicacao && <AvisoPublicacao p={publicacao} />}
          <Routes>
            <Route path="/" element={<PaginaExecutivo />} />
            <Route path="/radar" element={<PaginaRadar />} />
            <Route path="/mapa" element={<PaginaMapa />} />
            <Route path="/funil" element={<PaginaFunil />} />
            <Route path="/previsao" element={<PaginaPrevisao />} />
            <Route path="/clientes" element={<PaginaClientes />} />
            <Route path="/clientes/:id" element={<PaginaClienteFicha />} />
            <Route path="/comercial" element={<PaginaComercial papel={eu?.papel} />} />
            <Route path="/alertas" element={<PaginaAlertas />} />
            <Route path="/empreendimentos/:id" element={<PaginaFicha papel={eu?.papel} />} />
            <Route path="/fontes" element={<PaginaFontes papel={eu?.papel} />} />
            <Route path="/qualidade" element={<PaginaQualidade papel={eu?.papel} />} />
            <Route path="/metodologia" element={<PaginaMetodologia />} />
            <Route path="/config" element={<PaginaConfiguracoes papel={eu?.papel} />} />
            <Route path="*" element={<div className="vazio">Página não encontrada.</div>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
