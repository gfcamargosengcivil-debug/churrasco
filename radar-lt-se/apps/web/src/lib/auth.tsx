import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Autenticação no front: Supabase Auth quando VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY estão
 * definidos (a chave anônima é pública por desenho); caso contrário, modo de desenvolvimento
 * sem login (a API também precisa estar em AUTH_MODE=dev). Nenhuma chave secreta fica no front.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;

let tokenAtual: string | undefined;
export const obterToken = () => tokenAtual;

interface Ctx {
  sessao: Session | null;
  carregando: boolean;
  modo: 'supabase' | 'dev';
  sair: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>({ sessao: null, carregando: false, modo: 'dev', sair: async () => undefined });
export const useAuth = () => useContext(AuthCtx);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(!!supabase);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      tokenAtual = data.session?.access_token;
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s);
      tokenAtual = s?.access_token;
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <AuthCtx.Provider value={{ sessao, carregando, modo: supabase ? 'supabase' : 'dev', sair: async () => void (await supabase?.auth.signOut()) }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function TelaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setEnviando(true);
    setMsg(undefined);
    const { error } = senha
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setEnviando(false);
    setMsg(error ? error.message : senha ? undefined : 'Enviamos um link de acesso para o seu e-mail.');
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="cartao" style={{ width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={entrar}>
        <h1>Radar LT/SE</h1>
        <p className="muted">Inteligência comercial para LT e SE ≥ 138 kV</p>
        <label className="campo"><span>E-mail</span><input className="entrada" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="campo"><span>Senha (deixe em branco para receber link por e-mail)</span><input className="entrada" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" /></label>
        <button className="botao primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        {msg && <div className="aviso info">{msg}</div>}
      </form>
    </div>
  );
}
