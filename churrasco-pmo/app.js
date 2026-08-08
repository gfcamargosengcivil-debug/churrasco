/* ============================================================
   PROJETO CHURRASCO DA TURMA — app.js
   Um projeto gerenciado como projeto.
   Sem backend, sem login, sem instalação. Tudo no navegador.
   ============================================================ */

/* ---------- 1. BANCO DE DADOS (localStorage) ---------- */
const CHAVE = 'churrascoPMO_v1';
let DB = null;

function clone(o){ return JSON.parse(JSON.stringify(o)); }

function carregar(){
  try{
    const bruto = localStorage.getItem(CHAVE);
    if(bruto){ DB = JSON.parse(bruto); mesclarNovosCampos(); return; }
  }catch(e){ console.warn('Falha ao ler o armazenamento local:', e); }
  DB = clone(SEED);
}
function mesclarNovosCampos(){
  // garante que versoes antigas salvas nao quebrem apos atualizacao
  Object.keys(SEED).forEach(k=>{ if(DB[k]===undefined) DB[k] = clone(SEED[k]); });
  Object.keys(SEED.projeto).forEach(k=>{ if(DB.projeto[k]===undefined) DB.projeto[k]=SEED.projeto[k]; });
}
function salvar(){
  try{ localStorage.setItem(CHAVE, JSON.stringify(DB)); }
  catch(e){ toast('⚠️ Não consegui salvar no navegador. Exporte um backup!'); }
}

/* ---------- 2. UTILITÁRIOS ---------- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function moeda(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function moedaCurta(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:0}); }
function dataBR(iso){ if(!iso) return '—'; const p=String(iso).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:iso; }
function dataCurta(iso){ if(!iso) return '—'; const p=String(iso).split('-'); return p.length===3?`${p[2]}/${p[1]}`:iso; }
function hoje(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function dias(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
function proxId(lista, pref){
  let n=0; lista.forEach(x=>{ const m=String(x.id||'').match(/(\d+)$/); if(m) n=Math.max(n,parseInt(m[1],10)); });
  return pref + String(n+1).padStart(2,'0');
}
let toastT;
function toast(msg){
  let el=$('#toast'); if(!el){ el=document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent=msg; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),2600);
}
function copiar(txt){
  const done=()=>toast('✅ Copiado! Agora é só colar no WhatsApp.');
  if(navigator.clipboard && window.isSecureContext){ navigator.clipboard.writeText(txt).then(done).catch(()=>fallback()); }
  else fallback();
  function fallback(){
    const t=document.createElement('textarea'); t.value=txt; t.style.position='fixed'; t.style.opacity='0';
    document.body.appendChild(t); t.select();
    try{ document.execCommand('copy'); done(); }catch(e){ toast('Copie manualmente o texto exibido.'); }
    document.body.removeChild(t);
  }
}
function zap(msg){ window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); }
function baixar(nome, conteudo, tipo){
  // O BOM (\ufeff) faz o Excel abrir o CSV com acentuação correta,
  // mas quebra o JSON.parse — por isso só entra em arquivos de texto/CSV.
  const bom = /json/i.test(tipo||'') ? '' : '\ufeff';
  const blob = new Blob([bom+conteudo], {type: tipo||'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nome;
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},400);
}
function csv(cabec, linhas){
  const q=v=>{ v=String(v==null?'':v); return /[";\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  return [cabec.map(q).join(';')].concat(linhas.map(l=>l.map(q).join(';'))).join('\r\n');
}
function nomeDe(id){ const p=(DB.participantes||[]).find(x=>x.id===id); return p?p.nome:id; }
function linkAtual(){ return DB.linkPublico && DB.linkPublico.trim() ? DB.linkPublico.trim() : (location.href.split('#')[0]); }

/* ---------- 3. CÁLCULOS DO PROJETO ---------- */
function calc(){
  const P = DB.participantes||[], C = DB.compras||[], T = DB.cronograma||[], R = DB.riscos||[], K = DB.checklist||[];
  const confirmados = P.filter(p=>p.presenca==='Confirmado');
  const pendentes   = P.filter(p=>p.presenca==='Pendente');
  const naoVao      = P.filter(p=>p.presenca==='Não vai');
  const pagantes    = confirmados.filter(p=>p.pagamento!=='Isento');
  const pagos       = P.filter(p=>p.pagamento==='Pago');
  const atrasados   = P.filter(p=>p.pagamento==='Atrasado');
  const vp = Number(DB.projeto.valorPessoa)||0;

  const receitaPrev = pagantes.length*vp + (Number(DB.financeiro?.receitaExtra)||0);
  const receitaReal = pagos.length*vp;
  const aReceber    = Math.max(0, receitaPrev - receitaReal);
  const despPrev    = C.reduce((a,c)=> a + (Number(c.qtd)||0)*(Number(c.est)||0), 0) + (Number(DB.financeiro?.despesasPrevistasExtras)||0);
  const despReal    = C.reduce((a,c)=> a + (c.status==='Comprado' ? (Number(c.qtd)||0)*(Number(c.real)||0) : 0), 0);
  const saldoPrev   = receitaPrev - despPrev;
  const saldoReal   = receitaReal - despReal;
  const conting     = receitaPrev * ((Number(DB.projeto.contingenciaPct)||0)/100);
  const custoPessoa = pagantes.length ? despPrev/pagantes.length : 0;

  const tConcl = T.filter(t=>t.status==='Concluído').length;
  const tAtras = T.filter(t=>t.status==='Atrasado').length;
  const tAnda  = T.filter(t=>t.status==='Em andamento').length;
  const pctCron = T.length ? T.reduce((a,t)=>a+(Number(t.pct)||0),0)/T.length : 0;

  const rCrit = R.filter(r=>(Number(r.prob)||0)*(Number(r.imp)||0)>=15 && r.status!=='Encerrado').length;
  const rAtiv = R.filter(r=>r.status!=='Encerrado').length;

  const ckOk = K.filter(k=>k.ok).length;
  const pctCk = K.length ? ckOk/K.length*100 : 0;

  const comprado = C.filter(c=>c.status==='Comprado').length;
  const diasRest = DB.projeto.data ? dias(hoje(), DB.projeto.data) : null;
  const pctPagto = pagantes.length ? pagos.length/pagantes.length*100 : 0;
  const pctConf  = P.length ? confirmados.length/P.length*100 : 0;
  const pctGeral = (pctCron*0.5 + pctCk*0.25 + pctPagto*0.25);

  // Semáforo automático do projeto
  let status='ok', motivos=[];
  if(tAtras>0){ status='alerta'; motivos.push(tAtras+' atividade(s) atrasada(s)'); }
  if(saldoPrev < conting){ status='alerta'; motivos.push('saldo previsto abaixo da contingência'); }
  if(atrasados.length>0){ status='alerta'; motivos.push(atrasados.length+' pagamento(s) em atraso'); }
  if(rCrit>0){ status='alerta'; motivos.push(rCrit+' risco(s) crítico(s) ativo(s)'); }
  if(saldoPrev<0){ status='erro'; motivos.push('orçamento estourado'); }
  if(diasRest!==null && diasRest>=0 && diasRest<=7 && pctPagto<80){ status='erro'; motivos.push('faltam ≤7 dias com menos de 80% arrecadado'); }
  if(tAtras>=3){ status='erro'; }
  if(DB.projeto.statusManual && DB.projeto.statusManual!=='auto'){ status=DB.projeto.statusManual; motivos=['definido manualmente']; }
  if(!motivos.length) motivos.push('todos os indicadores dentro do esperado');

  return {P,C,T,R,K,confirmados,pendentes,naoVao,pagantes,pagos,atrasados,vp,
    receitaPrev,receitaReal,aReceber,despPrev,despReal,saldoPrev,saldoReal,conting,custoPessoa,
    tConcl,tAtras,tAnda,pctCron,rCrit,rAtiv,ckOk,pctCk,comprado,diasRest,pctPagto,pctConf,pctGeral,status,motivos};
}

/* ---------- 4. COMPONENTES REUTILIZÁVEIS ---------- */
// campo editável ligado a DB[coll] (registro id) campo f
function campo(coll, id, f, valor, tipo, opcoes, extra){
  tipo = tipo||'text';
  const dref = `data-coll="${coll}" data-id="${id||''}" data-f="${f}"`;
  if(tipo==='select'){
    const op = (opcoes||[]).map(o=>`<option value="${esc(o)}"${String(o)===String(valor)?' selected':''}>${esc(o)}</option>`).join('');
    return `<span class="no-edit">${badge(f,valor)}</span><select class="f so-edit" ${dref}>${op}</select>`;
  }
  if(tipo==='check'){
    return `<input type="checkbox" ${dref} ${valor?'checked':''}>`;
  }
  const mostra = tipo==='money'? moeda(valor) : tipo==='date'? dataBR(valor) : (valor===''||valor==null?'—':esc(valor));
  const inp = tipo==='date' ? `<input type="date" class="f so-edit" ${dref} value="${esc(valor||'')}">`
            : tipo==='num'||tipo==='money' ? `<input type="number" step="0.01" class="f so-edit" ${dref} value="${esc(valor==null?'':valor)}" ${extra||''}>`
            : tipo==='textarea' ? `<textarea class="f so-edit" rows="2" ${dref}>${esc(valor||'')}</textarea>`
            : `<input type="text" class="f so-edit" ${dref} value="${esc(valor==null?'':valor)}">`;
  return `<span class="ed no-edit">${mostra}</span>${inp}`;
}
function badge(f, v){
  const m = {
    'Confirmado':'p-ok','Pago':'p-ok','Concluído':'p-ok','Comprado':'p-ok','Aprovada':'p-ok','Encerrado':'p-neutro',
    'Pendente':'p-alerta','Em andamento':'p-info','A comprar':'p-alerta','Em votação':'p-alerta','Em monitoramento':'p-alerta',
    'Não vai':'p-erro','Atrasado':'p-erro','Ativo':'p-erro','Cancelado':'p-neutro','Não iniciado':'p-neutro','Isento':'p-info','—':'p-neutro'
  };
  const ic = {
    'Confirmado':'🟢','Pago':'🟢','Concluído':'🟢','Comprado':'🟢','Aprovada':'🟢',
    'Pendente':'🟡','A comprar':'🟡','Em votação':'🟡','Em monitoramento':'🟡','Em andamento':'🔵',
    'Não vai':'🔴','Atrasado':'🔴','Ativo':'🔴','Não iniciado':'⚪','Isento':'🎓','Encerrado':'⚫'
  };
  const cls = m[v]||'p-neutro';
  return `<span class="pill ${cls}">${ic[v]||''} ${esc(v||'—')}</span>`;
}
function botaoAdd(coll, rotulo){ return `<button class="btn btn-sm btn-fogo so-edit" data-add="${coll}">➕ ${esc(rotulo||'Adicionar')}</button>`; }
function btnDel(coll,id){ return `<button class="btn btn-sm btn-perigo so-edit" data-del="${coll}" data-id="${id}" title="Excluir">✕</button>`; }
function btnZap(msgKey, arg){ return `<button class="btn btn-sm btn-zap" data-zap="${msgKey}" ${arg?`data-arg="${esc(arg)}"`:''}>📲 WhatsApp</button>`; }
function btnCsv(o,rot){ return `<button class="btn btn-sm" data-csv="${o}">📥 ${esc(rot||'Excel/CSV')}</button>`; }
function barra(pct, cls){ pct=Math.max(0,Math.min(100,Number(pct)||0)); return `<div class="bar ${cls||''}"><i style="width:${pct}%"></i></div>`; }

/* ---------- 5. MENSAGENS DE WHATSAPP ---------- */
function msgs(){
  const c=calc(), p=DB.projeto, L=linkAtual();
  const d=dataBR(p.data), dr=c.diasRest;
  const rodape = `\n\n👉 Acompanhe e atualize sua participação:\n${L}`;
  return {
    resumo:{ t:'Resumo do projeto', m:
`🍖 *CHURRASCO DA TURMA*
_Um projeto gerenciado como projeto._

📅 Data: ${d} às ${p.horaInicio}
📍 Local: ${p.local}
👥 Confirmados: ${c.confirmados.length}/${c.P.length}
💰 Valor por pessoa: ${moeda(c.vp)}
💳 Arrecadado: ${moeda(c.receitaReal)} de ${moeda(c.receitaPrev)}
📊 Conclusão: ${c.pctGeral.toFixed(0)}%${dr!==null?`\n⏳ Faltam ${dr} dias`:''}${rodape}` },

    convite:{ t:'1. Convite', m:
`🍖🔥 *CHURRASCO DA TURMA — ${p.turma}*

Fala, pessoal! Está confirmado o nosso churrasco.

📅 ${d} (${diaSemana(p.data)}) a partir das ${p.horaInicio}
📍 ${p.local}
🗺️ ${p.endereco}
💰 ${moeda(c.vp)} por pessoa (comida + bebida + local)

E tem mais: o professor prometeu um *barril de chopp na formatura* para a turma que organizar isso direito. Então bora fazer bonito. 😎${rodape}` },

    pesquisaData:{ t:'2. Pesquisa de data', m:
`🗓️ *ENQUETE — DATA DO CHURRASCO*

Precisamos fechar a data. Responda com a letra da sua preferência:

A) 08/09 (sábado)
B) 15/09 (sábado)
C) 22/09 (sábado)

Prazo para responder: até domingo. Quem não votar, entra na maioria. 🙂${rodape}` },

    confirmacao:{ t:'3. Pedido de confirmação', m:
`✅ *CONFIRME SUA PRESENÇA*

Estamos em ${c.confirmados.length} confirmados de ${c.P.length} da turma.
Ainda faltam ${c.pendentes.length} pessoas responderem.

Responda aqui no grupo com:
🍖 EU VOU  ou  ❌ NÃO VOU

Precisamos do número fechado para comprar a carne certa.${rodape}` },

    cobranca:{ t:'4. Cobrança', m:
`💰 *PAGAMENTOS DO CHURRASCO*

Fala, pessoal! 👋

Estamos fechando os pagamentos do churrasco.
Seu valor ficou em *${moeda(c.vp)}*.

📌 PIX: ${DB.chavePix||'(defina a chave PIX no sistema)'}
📊 Já arrecadamos ${moeda(c.receitaReal)} de ${moeda(c.receitaPrev)} (${c.pctPagto.toFixed(0)}%)

Se ainda não realizou o pagamento, gentileza regularizar para conseguirmos fechar as compras. 🍖

Depois de pagar, manda o comprovante aqui no grupo.${rodape}` },

    prazo:{ t:'5. Aviso de prazo', m:
`⏰ *ATENÇÃO — PRAZO*

${dr!==null&&dr>=0?`Faltam *${dr} dias* para o churrasco.`:'O prazo está chegando.'}

Pendências que travam as compras:
${c.pendentes.length?`• ${c.pendentes.length} confirmações de presença\n`:''}${c.atrasados.length?`• ${c.atrasados.length} pagamentos em atraso\n`:''}${c.tAtras?`• ${c.tAtras} atividade(s) atrasada(s) no cronograma\n`:''}
Prazo final para resolver: *${dr!==null&&dr>7?dataBR(somaDias(p.data,-7)):'esta semana'}*.

Depois disso a lista fecha e não dá mais para incluir ninguém. 🙏${rodape}` },

    votacao:{ t:'6. Resultado de votação', m: resultadoVotacao()+rodape },

    atualizacao:{ t:'7. Atualização do projeto', m:
`📊 *STATUS DO PROJETO — CHURRASCO*

${{ok:'🟢 NO PRAZO',alerta:'🟡 ATENÇÃO',erro:'🔴 CRÍTICO'}[c.status]}
${c.motivos.map(x=>'• '+x).join('\n')}

👥 Confirmados: ${c.confirmados.length}/${c.P.length}
💰 Arrecadado: ${moeda(c.receitaReal)} (${c.pctPagto.toFixed(0)}%)
💳 A receber: ${moeda(c.aReceber)}
📋 Tarefas: ${c.tConcl}/${c.T.length} concluídas
⚠️ Riscos ativos: ${c.rAtiv} (${c.rCrit} crítico(s))
🛒 Compras: ${c.comprado}/${c.C.length}
📊 Conclusão geral: ${c.pctGeral.toFixed(0)}%${rodape}` },

    lembrete:{ t:'8. Lembrete', m:
`🔔 *LEMBRETE — CHURRASCO DA TURMA*

É ${dr===1?'AMANHÃ':dr===0?'HOJE':'dia '+d}! 🍖🔥

📍 ${p.local}
🗺️ ${p.endereco}
🕛 A partir das ${p.horaInicio}

Não esqueça: ${DB.compras.filter(x=>x.status!=='Comprado').length?'quem ficou de levar algo, confere a lista de compras no sistema.':'está tudo comprado, é só chegar!'}${rodape}` },

    infoEvento:{ t:'9. Informações do evento', m:
`📋 *TUDO SOBRE O CHURRASCO*

📅 Data: ${d} (${diaSemana(p.data)})
🕛 Início: ${p.horaInicio}
📍 Local: ${p.local}
🗺️ Endereço: ${p.endereco}
💰 Valor: ${moeda(c.vp)} por pessoa
👥 Confirmados: ${c.confirmados.length} pessoas
🧑‍🍳 Churrasqueiros: ${(DB.participantes.filter(x=>x.equipe==='Churrasqueiro').map(x=>x.nome.split(' ')[0]).join(', '))||'a definir'}
🎵 Som: ${(DB.participantes.filter(x=>x.equipe==='Som').map(x=>x.nome.split(' ')[0]).join(', '))||'a definir'}

O que levar: sua caneca, protetor solar e fome. 😄
Motoristas da vez já definidos — se for beber, avise antes.${rodape}` },

    final:{ t:'10. Mensagem final (véspera)', m:
`🍖🔥 *É AMANHÃ!*

Última chamada da organização:

✅ Confirmados: ${c.confirmados.length}
✅ Compras: ${c.comprado}/${c.C.length} concluídas
✅ Arrecadado: ${moeda(c.receitaReal)}

📍 ${p.local}
🕛 ${p.horaInicio} — equipe de montagem às 09h

Quem ficou de levar algo, não esquece! Lista completa no sistema.
Bora fazer o melhor churrasco da história dessa pós. 🏆🍺${rodape}` },

    agradecimento:{ t:'11. Agradecimento', m:
`🙏 *OBRIGADO, TURMA!*

Que churrasco! 🍖🔥

Números finais do nosso projeto:
👥 ${c.confirmados.length} participantes
💰 ${moeda(c.receitaReal)} arrecadados
💸 ${moeda(c.despReal)} gastos
${c.saldoReal>=0?`✅ Saldo de ${moeda(c.saldoReal)} — devolvido/guardado para a formatura`:`⚠️ Diferença de ${moeda(Math.abs(c.saldoReal))} a acertar`}

A prestação de contas completa e as lições aprendidas estão no sistema.

Agora é cobrar o barril de chopp do professor. 🍺😄${rodape}` }
  };
}
function diaSemana(iso){
  if(!iso) return '';
  const d=new Date(iso+'T12:00:00');
  return ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][d.getDay()];
}
function somaDias(iso,n){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function resultadoVotacao(){
  const v=(DB.votacoes||[]).filter(x=>x.ativa);
  if(!v.length) return '📊 *VOTAÇÃO*\n\nNenhuma votação ativa no momento.';
  return v.map(vo=>{
    const tot=vo.opcoes.reduce((a,o)=>a+(Number(o.votos)||0),0)||1;
    const ord=[...vo.opcoes].sort((a,b)=>b.votos-a.votos);
    return `📊 *${vo.pergunta.toUpperCase()}*\n\n`+ord.map((o,i)=>
      `${i===0?'🏆':'  '} ${o.texto} — ${o.votos} voto(s) (${(o.votos/tot*100).toFixed(0)}%)`).join('\n')+
      `\n\nTotal: ${tot} votos. Vencedora: *${ord[0].texto}*`;
  }).join('\n\n———\n\n');
}

/* ---------- 6. ABAS E RENDERIZAÇÃO ---------- */
const ABAS = [
  ['dash','📊 Dashboard'], ['part','👥 Participantes'], ['fin','💰 Financeiro'], ['pag','💳 Pagamentos'],
  ['eap','🧱 EAP'], ['cron','📅 Cronograma'], ['raci','🧑‍💼 RACI'], ['risc','⚠️ Riscos'],
  ['stk','🎯 Stakeholders'], ['com','📲 Comunicação'], ['dec','🗳️ Decisões'], ['comp','🛒 Compras'],
  ['check','✅ Checklist'], ['qual','⭐ Qualidade'], ['licoes','📚 Lições'], ['pmbok','🎓 PMBOK'], ['conf','⚙️ Compartilhar']
];
let abaAtual = 'dash';

function render(){
  const c = calc();
  // topo
  $('#resumoTopo').innerHTML =
    `<span>📅 <b>${dataBR(DB.projeto.data)}</b></span>`+
    `<span>📍 <b>${esc(DB.projeto.local)}</b></span>`+
    `<span>👥 <b>${c.confirmados.length}/${c.P.length}</b> confirmados</span>`+
    `<span>💰 <b>${moeda(c.vp)}</b>/pessoa</span>`+
    (c.diasRest!==null?`<span>⏳ <b>${c.diasRest>=0?c.diasRest+' dias':'realizado'}</b></span>`:'');
  $('#abas').innerHTML = ABAS.map(([k,r])=>`<button class="aba${k===abaAtual?' on':''}" data-aba="${k}">${r}</button>`).join('');
  const fn = { dash:vDash, part:vPart, fin:vFin, pag:vPag, eap:vEap, cron:vCron, raci:vRaci, risc:vRisc,
    stk:vStk, com:vCom, dec:vDec, comp:vComp, check:vCheck, qual:vQual, licoes:vLicoes, pmbok:vPmbok, conf:vConf }[abaAtual];
  $('#view').innerHTML = `<div class="aviso-edit">✏️ <b>Modo edição ligado.</b> Clique nos campos para alterar. Tudo é salvo automaticamente no seu navegador. Desligue o modo edição para ver a versão limpa.</div>` + fn(c);
  window.scrollTo({top:0,behavior:'instant'});
}
function irPara(k){ abaAtual=k; render(); }

/* ---------- DASHBOARD ---------- */
function vDash(c){
  const rot={ok:'🟢 NO PRAZO',alerta:'🟡 ATENÇÃO',erro:'🔴 CRÍTICO'}[c.status];
  const kpi=(rot,val,pe,cls)=>`<div class="kpi ${cls||''}"><div class="rot">${rot}</div><div class="val">${val}</div><div class="pe">${pe||''}</div></div>`;
  return `
  <div class="card">
    <div class="card-topo">
      <div>
        <h2>Status do projeto</h2>
        <div class="mini">Semáforo calculado automaticamente a partir de prazo, custo, escopo e riscos.</div>
      </div>
      <div class="acoes">
        ${btnZap('atualizacao')}
        <button class="btn btn-sm" data-copy-msg="atualizacao">📋 Copiar</button>
      </div>
    </div>
    <div class="status-projeto sp-${c.status}">${rot}</div>
    <ul style="margin:12px 0 0;padding-left:20px;font-size:13.5px;color:var(--texto-2)">
      ${c.motivos.map(m=>`<li>${esc(m)}</li>`).join('')}
    </ul>
    <div class="so-edit" style="margin-top:12px">
      <label class="mini"><b>Forçar status manualmente:</b></label>
      ${campo('projeto','','statusManual',DB.projeto.statusManual,'select',['auto','ok','alerta','erro'])}
    </div>
  </div>

  <div class="kpis" style="margin-bottom:16px">
    ${kpi('👥 Participantes', c.confirmados.length+'<span style="font-size:15px;color:var(--texto-2)">/'+c.P.length+'</span>', c.pendentes.length+' pendentes · '+c.naoVao.length+' não vão')}
    ${kpi('💰 Arrecadado', moedaCurta(c.receitaReal), c.pctPagto.toFixed(0)+'% de '+moedaCurta(c.receitaPrev), c.pctPagto>=80?'ok':c.pctPagto>=50?'alerta':'erro')}
    ${kpi('💳 A receber', moedaCurta(c.aReceber), c.atrasados.length+' em atraso', c.aReceber===0?'ok':'alerta')}
    ${kpi('📋 Tarefas', c.tConcl+'<span style="font-size:15px;color:var(--texto-2)">/'+c.T.length+'</span>', c.tAnda+' em andamento · '+c.tAtras+' atrasadas', c.tAtras?'alerta':'ok')}
    ${kpi('⚠️ Riscos', c.rAtiv, c.rCrit+' crítico(s)', c.rCrit?'alerta':'ok')}
    ${kpi('🛒 Compras', c.comprado+'<span style="font-size:15px;color:var(--texto-2)">/'+c.C.length+'</span>', moedaCurta(c.despPrev)+' previstos')}
    ${kpi('📅 Dias restantes', c.diasRest===null?'—':(c.diasRest>=0?c.diasRest:'realizado'), dataBR(DB.projeto.data), c.diasRest!==null&&c.diasRest<=7&&c.diasRest>=0?'alerta':'')}
    ${kpi('📊 Conclusão', c.pctGeral.toFixed(0)+'%', 'cronograma + checklist + caixa', c.pctGeral>=70?'ok':c.pctGeral>=40?'alerta':'erro')}
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>Ficha do evento</h2>
      <p class="desc">Clique em ✏️ Modo edição no topo para alterar qualquer campo.</p>
      <div class="tw"><table><tbody>
        ${[['Nome do projeto','nome','text'],['Turma','turma','text'],['Data','data','date'],['Horário de início','horaInicio','text'],
           ['Local','local','text'],['Endereço','endereco','text'],['Gerente do projeto','gerente','text'],['Patrocinador','patrocinador','text'],
           ['Valor por pessoa','valorPessoa','money'],['Contingência (%)','contingenciaPct','num'],['Prêmio do desafio','premio','text']]
          .map(([r,f,t])=>`<tr><td style="width:38%;font-weight:700">${r}</td><td>${campo('projeto','',f,DB.projeto[f],t)}</td></tr>`).join('')}
        <tr><td style="font-weight:700">Objetivo</td><td>${campo('projeto','','objetivo',DB.projeto.objetivo,'textarea')}</td></tr>
      </tbody></table></div>
    </div>

    <div class="card">
      <h2>Andamento por frente</h2>
      <p class="desc">Percentuais calculados a partir dos módulos.</p>
      ${[['Confirmações de presença',c.pctConf,'b'],['Arrecadação',c.pctPagto,'v'],['Cronograma',c.pctCron,''],
         ['Checklist do evento',c.pctCk,'a'],['Compras concluídas',c.C.length?c.comprado/c.C.length*100:0,'']]
        .map(([r,v,cl])=>`<div style="margin-bottom:13px">
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px">
            <span>${r}</span><span>${(v||0).toFixed(0)}%</span></div>${barra(v,cl)}</div>`).join('')}
      <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--linha)">
        <div class="mini" style="margin-bottom:8px"><b>Ações rápidas</b></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-zap" data-zap="resumo">📲 Compartilhar resumo</button>
          <button class="btn btn-sm" data-confirmar>🙋 Confirmar minha presença</button>
          <button class="btn btn-sm btn-zap" data-zap="cobranca">💰 Cobrar pagamentos</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-topo"><h2>Próximas atividades</h2>
      <div class="acoes"><button class="btn btn-sm" data-ir="cron">Ver cronograma completo →</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Atividade</th><th>Responsável</th><th>Prazo</th><th class="ctr">Status</th><th style="width:130px">%</th></tr></thead>
      <tbody>${c.T.filter(t=>t.status!=='Concluído').slice(0,6).map(t=>`<tr>
        <td>${esc(t.atividade)}</td><td>${esc(t.resp)}</td><td>${dataBR(t.fim)}</td>
        <td class="ctr">${badge('status',t.status)}</td>
        <td>${barra(t.pct, t.status==='Atrasado'?'r':t.status==='Concluído'?'v':'b')}</td></tr>`).join('')
        || '<tr><td colspan="5" style="text-align:center;color:var(--texto-2)">Tudo concluído! 🎉</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

/* ---------- PARTICIPANTES ---------- */
function vPart(c){
  const equipes = [...new Set(DB.participantes.map(p=>p.equipe).filter(Boolean))];
  return `
  <div class="card">
    <div class="card-topo">
      <div><h2>👥 Participantes</h2><div class="mini">Confirmados <b>${c.confirmados.length}</b> · Pendentes <b>${c.pendentes.length}</b> · Não vão <b>${c.naoVao.length}</b> · Total <b>${c.P.length}</b></div></div>
      <div class="acoes">
        <button class="btn btn-sm" data-confirmar>🙋 Confirmar presença</button>
        ${btnZap('confirmacao')} ${btnCsv('participantes')} ${botaoAdd('participantes','Novo participante')}
      </div>
    </div>
    <div class="dica">Cada pessoa pode se registrar sozinha pelo botão <b>Confirmar presença</b>. Como o sistema não tem servidor, quem edita salva no <b>próprio navegador</b> — por isso, combine no grupo <b>uma pessoa responsável por consolidar</b> e exportar o backup. Veja a aba ⚙️ Compartilhar.</div>
    <div class="filtros">
      <input type="search" id="fBusca" placeholder="🔎 Buscar por nome..." oninput="filtrarTabela('tParticipantes',this.value)">
      <select id="fPres" onchange="filtrarCol('tParticipantes',1,this.value)">
        <option value="">Presença: todas</option><option>Confirmado</option><option>Pendente</option><option>Não vai</option>
      </select>
      <select id="fPag" onchange="filtrarCol('tParticipantes',2,this.value)">
        <option value="">Pagamento: todos</option><option>Pago</option><option>Pendente</option><option>Atrasado</option><option>Isento</option>
      </select>
      <span class="mini" id="contFiltro"></span>
    </div>
    <div class="tw"><table id="tParticipantes">
      <thead><tr><th>Nome</th><th class="ctr">Presença</th><th class="ctr">Pagamento</th><th>Equipe</th><th>Observação</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.participantes.map(p=>`<tr>
        <td data-v="${esc(p.nome)}">${campo('participantes',p.id,'nome',p.nome)}</td>
        <td class="ctr" data-v="${esc(p.presenca)}">${campo('participantes',p.id,'presenca',p.presenca,'select',['Confirmado','Pendente','Não vai'])}</td>
        <td class="ctr" data-v="${esc(p.pagamento)}">${campo('participantes',p.id,'pagamento',p.pagamento,'select',['Pago','Pendente','Atrasado','Isento','—'])}</td>
        <td>${campo('participantes',p.id,'equipe',p.equipe,'select',['—','Gerência','Compras','Financeiro','Logística','Comunicação','Churrasqueiro','Decoração','Som','Convidado'].concat(equipes.filter(e=>!['—','Gerência','Compras','Financeiro','Logística','Comunicação','Churrasqueiro','Decoração','Som','Convidado'].includes(e))))}</td>
        <td>${campo('participantes',p.id,'obs',p.obs)}</td>
        <td class="ctr so-edit">${btnDel('participantes',p.id)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="legenda">🟢 Confirmado &nbsp; 🟡 Pendente &nbsp; 🔴 Não vai &nbsp;|&nbsp; 🟢 Pago &nbsp; 🟡 Pendente &nbsp; 🔴 Atrasado &nbsp; 🎓 Isento</div>
  </div>

  <div class="card">
    <h2>Equipes do projeto</h2>
    <p class="desc">Distribuição de responsabilidades entre os confirmados — base para a matriz RACI.</p>
    <div class="grid g4">
      ${[...new Set(DB.participantes.filter(p=>p.presenca==='Confirmado'&&p.equipe&&p.equipe!=='—').map(p=>p.equipe))].map(e=>{
        const m=DB.participantes.filter(p=>p.equipe===e&&p.presenca==='Confirmado');
        return `<div class="kpi"><div class="rot">${esc(e)}</div><div class="val" style="font-size:20px">${m.length}</div>
          <div class="pe">${m.map(x=>esc(x.nome.split(' ')[0])).join(', ')}</div></div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ---------- FINANCEIRO ---------- */
function vFin(c){
  const cats={}; DB.compras.forEach(x=>{ const k=x.cat||'Outros'; cats[k]=(cats[k]||0)+(Number(x.qtd)||0)*(Number(x.est)||0); });
  const catArr=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const maxBar=Math.max(c.receitaPrev,c.despPrev,1);
  const cores=['#E8622A','#F2A93B','#2F6FD0','#1FA363','#8A93A3','#9B59B6'];
  const totCat=catArr.reduce((a,x)=>a+x[1],0)||1;
  // donut
  let ang=0; const donut=catArr.map(([k,v],i)=>{
    const frac=v/totCat, a0=ang, a1=ang+frac*Math.PI*2; ang=a1;
    const R=52,r=30,cx=64,cy=64;
    const x0=cx+R*Math.cos(a0-Math.PI/2), y0=cy+R*Math.sin(a0-Math.PI/2);
    const x1=cx+R*Math.cos(a1-Math.PI/2), y1=cy+R*Math.sin(a1-Math.PI/2);
    const xi1=cx+r*Math.cos(a1-Math.PI/2), yi1=cy+r*Math.sin(a1-Math.PI/2);
    const xi0=cx+r*Math.cos(a0-Math.PI/2), yi0=cy+r*Math.sin(a0-Math.PI/2);
    const big=frac>0.5?1:0;
    return `<path d="M${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1} L${xi1} ${yi1} A${r} ${r} 0 ${big} 0 ${xi0} ${yi0} Z" fill="${cores[i%cores.length]}"/>`;
  }).join('');
  const linha=(rot,val,cor,ref)=>`<div style="margin-bottom:11px">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span>${rot}</span><span>${moeda(val)}</span></div>
      <div class="bar" style="height:14px;margin-top:3px"><i style="width:${Math.min(100,val/ref*100)}%;background:${cor}"></i></div></div>`;
  return `
  <div class="card">
    <div class="card-topo"><div><h2>💰 Financeiro</h2>
      <div class="mini">Receita = confirmados pagantes × valor por pessoa. Despesa = lista de compras.</div></div>
      <div class="acoes">${btnCsv('orcamento','Orçamento')} ${btnZap('cobranca')}</div></div>
    <div class="kpis">
      <div class="kpi"><div class="rot">Receita prevista</div><div class="val" style="font-size:22px">${moedaCurta(c.receitaPrev)}</div><div class="pe">${c.pagantes.length} pagantes × ${moeda(c.vp)}</div></div>
      <div class="kpi ok"><div class="rot">Receita realizada</div><div class="val" style="font-size:22px">${moedaCurta(c.receitaReal)}</div><div class="pe">${c.pagos.length} pagamentos confirmados</div></div>
      <div class="kpi"><div class="rot">Despesa prevista</div><div class="val" style="font-size:22px">${moedaCurta(c.despPrev)}</div><div class="pe">${c.C.length} itens na lista</div></div>
      <div class="kpi"><div class="rot">Despesa realizada</div><div class="val" style="font-size:22px">${moedaCurta(c.despReal)}</div><div class="pe">${c.comprado} itens comprados</div></div>
      <div class="kpi ${c.saldoPrev>=c.conting?'ok':c.saldoPrev>=0?'alerta':'erro'}"><div class="rot">Saldo previsto</div><div class="val" style="font-size:22px">${moedaCurta(c.saldoPrev)}</div><div class="pe">contingência necessária: ${moedaCurta(c.conting)}</div></div>
      <div class="kpi"><div class="rot">Saldo realizado</div><div class="val" style="font-size:22px">${moedaCurta(c.saldoReal)}</div><div class="pe">caixa atual</div></div>
      <div class="kpi"><div class="rot">Custo por pessoa</div><div class="val" style="font-size:22px">${moedaCurta(c.custoPessoa)}</div><div class="pe">cobrado: ${moeda(c.vp)}</div></div>
      <div class="kpi ${c.aReceber?'alerta':'ok'}"><div class="rot">A receber</div><div class="val" style="font-size:22px">${moedaCurta(c.aReceber)}</div><div class="pe">${c.pagantes.length-c.pagos.length} pessoa(s)</div></div>
    </div>
    ${c.saldoPrev<c.conting?`<div class="dica" style="background:var(--alerta-bg);border-color:#EBD08A;border-left-color:var(--alerta);margin-top:14px">
      ⚠️ <b>Atenção de custos:</b> o saldo previsto (${moeda(c.saldoPrev)}) está <b>abaixo da reserva de contingência</b> de ${DB.projeto.contingenciaPct}% (${moeda(c.conting)}).
      Opções: reduzir itens da lista de compras, renegociar o local, ou reajustar o valor por pessoa para ${moeda(Math.ceil((c.despPrev+c.conting)/Math.max(1,c.pagantes.length)))}.</div>`:''}
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>Previsto × Realizado</h2>
      <p class="desc">Comparação direta de entradas e saídas.</p>
      ${linha('Receita prevista',c.receitaPrev,'#8CB0D0',maxBar)}
      ${linha('Receita realizada',c.receitaReal,'#1FA363',maxBar)}
      ${linha('Despesa prevista',c.despPrev,'#F2A93B',maxBar)}
      ${linha('Despesa realizada',c.despReal,'#E8622A',maxBar)}
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--linha);font-size:13px">
        <b>Ajustes manuais</b>
        <table style="margin-top:6px"><tbody>
          <tr><td>Receita extra (rifas, doações)</td><td style="width:150px">${campo('financeiro','','receitaExtra',DB.financeiro.receitaExtra,'money')}</td></tr>
          <tr><td>Despesas previstas fora da lista</td><td>${campo('financeiro','','despesasPrevistasExtras',DB.financeiro.despesasPrevistasExtras,'money')}</td></tr>
          <tr><td>Chave PIX do projeto</td><td>${campo('root','','chavePix',DB.chavePix)}</td></tr>
        </tbody></table>
      </div>
    </div>
    <div class="card">
      <h2>Despesa por categoria</h2>
      <p class="desc">Onde o dinheiro da turma está indo.</p>
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <svg viewBox="0 0 128 128" style="width:150px;height:150px;flex:none">${donut}
          <text x="64" y="60" text-anchor="middle" font-size="9" fill="#5C6678" font-weight="700">TOTAL</text>
          <text x="64" y="73" text-anchor="middle" font-size="12" fill="#1D2330" font-weight="800">${moedaCurta(totCat)}</text></svg>
        <div style="flex:1;min-width:180px">
          ${catArr.map(([k,v],i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:13px">
            <span style="width:12px;height:12px;border-radius:3px;background:${cores[i%cores.length]};flex:none"></span>
            <span style="flex:1">${esc(k)}</span><b>${moedaCurta(v)}</b>
            <span class="mini">${(v/totCat*100).toFixed(0)}%</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------- PAGAMENTOS ---------- */
function vPag(c){
  const pend = DB.participantes.filter(p=>p.presenca==='Confirmado' && (p.pagamento==='Pendente'||p.pagamento==='Atrasado'));
  return `
  <div class="card">
    <div class="card-topo"><div><h2>💳 Pagamentos</h2>
      <div class="mini">${c.pagos.length} pagos · ${pend.length} em aberto · ${c.atrasados.length} atrasados · arrecadado ${moeda(c.receitaReal)}</div></div>
      <div class="acoes">${btnZap('cobranca')} <button class="btn btn-sm" data-cobrar-lista>📲 Cobrar quem está devendo</button> ${btnCsv('pagamentos')} ${botaoAdd('pagamentos','Novo lançamento')}</div></div>
    <div class="dica">💡 O <b>status de pagamento de cada pessoa</b> fica na aba Participantes. Aqui você registra os <b>lançamentos</b> (valor, data, forma, comprovante). Chave PIX: <code class="k">${esc(DB.chavePix||'defina no Financeiro')}</code></div>
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:5px">
        <span>Arrecadação</span><span>${c.pctPagto.toFixed(0)}% — ${moeda(c.receitaReal)} de ${moeda(c.receitaPrev)}</span></div>
      ${barra(c.pctPagto, c.pctPagto>=80?'v':c.pctPagto>=50?'a':'r')}
    </div>
    <div class="tw"><table>
      <thead><tr><th>Nome</th><th class="num">Valor</th><th>Data</th><th class="ctr">Status</th><th>Forma</th><th>Observação</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>
        ${DB.pagamentos.map(g=>`<tr>
          <td>${campo('pagamentos',g.id,'nomeId',g.nomeId,'select',DB.participantes.map(p=>p.id))}<span class="no-edit"> ${esc(nomeDe(g.nomeId))}</span></td>
          <td class="num">${campo('pagamentos',g.id,'valor',g.valor,'money')}</td>
          <td>${campo('pagamentos',g.id,'data',g.data,'date')}</td>
          <td class="ctr">${campo('pagamentos',g.id,'status',g.status,'select',['Pago','Pendente','Atrasado'])}</td>
          <td>${campo('pagamentos',g.id,'forma',g.forma,'select',['PIX','Dinheiro','Transferência','Cartão','—'])}</td>
          <td>${campo('pagamentos',g.id,'obs',g.obs)}</td>
          <td class="ctr so-edit">${btnDel('pagamentos',g.id)}</td></tr>`).join('')}
        <tr class="tot"><td>Total lançado</td><td class="num">${moeda(DB.pagamentos.reduce((a,g)=>a+(g.status==='Pago'?Number(g.valor)||0:0),0))}</td><td colspan="5">somente lançamentos com status Pago</td></tr>
      </tbody></table></div>
  </div>

  <div class="card">
    <div class="card-topo"><h2>Quem ainda não pagou (${pend.length})</h2>
      <div class="acoes"><button class="btn btn-sm btn-zap" data-cobrar-lista>📲 Cobrar pelo WhatsApp</button></div></div>
    ${pend.length? `<div class="tw"><table><thead><tr><th>Nome</th><th class="ctr">Status</th><th class="num">Valor</th><th>Equipe</th></tr></thead>
      <tbody>${pend.map(p=>`<tr><td>${esc(p.nome)}</td><td class="ctr">${badge('pagamento',p.pagamento)}</td>
        <td class="num">${moeda(c.vp)}</td><td>${esc(p.equipe)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Total a receber</td><td class="num">${moeda(pend.length*c.vp)}</td><td></td></tr></tbody></table></div>`
      : '<div class="dica" style="background:var(--ok-bg);border-color:#BFE5D0;border-left-color:var(--ok)">🎉 Todo mundo pagou! Caixa fechado.</div>'}
  </div>`;
}

/* ---------- EAP ---------- */
function vEap(c){
  return `
  <div class="card">
    <div class="card-topo"><div><h2>🧱 EAP — Estrutura Analítica do Projeto</h2>
      <div class="mini">Decomposição do escopo em entregas. Nada que não esteja aqui faz parte do projeto.</div></div>
      <div class="acoes">${btnCsv('eap')} ${botaoAdd('eap','Novo pacote')}</div></div>
    <div class="dica"><b>Regra dos 100%:</b> a soma dos pacotes filhos representa 100% do trabalho do pacote pai. Se algo não está na EAP, não será executado — e não será cobrado do orçamento.</div>
    <div class="tw"><table>
      <thead><tr><th style="width:90px">ID</th><th>Pacote de trabalho</th><th style="width:200px">Responsável</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.eap.map(e=>{
        const n1 = !e.pai;
        return `<tr class="${n1?'eap-n1':'eap-n2'}">
          <td>${campo('eap',e.id,'id',e.id)}</td>
          <td>${n1?'📦 ':'↳ '}${campo('eap',e.id,'nome',e.nome)}</td>
          <td>${campo('eap',e.id,'resp',e.resp)}</td>
          <td class="ctr so-edit">${btnDel('eap',e.id)}</td></tr>`;
      }).join('')}</tbody></table></div>
    <div class="mini" style="margin-top:8px">Para criar um subpacote, adicione a linha e preencha o campo <b>pai</b> com o ID do pacote superior (ex.: <code class="k">3</code>). Pacotes sem pai aparecem como nível 1.</div>
    <div class="so-edit" style="margin-top:10px">
      <div class="tw"><table><thead><tr><th>ID</th><th>Pai (ID do pacote superior)</th></tr></thead>
      <tbody>${DB.eap.map(e=>`<tr><td style="width:100px">${esc(e.id)}</td><td>${campo('eap',e.id,'pai',e.pai)}</td></tr>`).join('')}</tbody></table></div>
    </div>
  </div>

  <div class="card">
    <h2>Visão em blocos</h2>
    <p class="desc">A mesma EAP em formato visual, para colar na apresentação do case.</p>
    <div class="grid g3">
      ${DB.eap.filter(e=>!e.pai).map(e=>{
        const f=DB.eap.filter(x=>x.pai===e.id);
        return `<div class="pmb"><h3>${esc(e.id)}. ${esc(e.nome)}</h3>
          <div class="mini" style="margin-bottom:8px">👤 ${esc(e.resp)}</div>
          ${f.map(x=>`<div style="font-size:13px;padding:5px 0;border-top:1px solid var(--linha)">
            <b>${esc(x.id)}</b> ${esc(x.nome)}<div class="mini">${esc(x.resp)}</div></div>`).join('')||'<div class="mini">Sem subpacotes.</div>'}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ---------- CRONOGRAMA (Gantt) ---------- */
function vCron(c){
  const T=DB.cronograma.filter(t=>t.inicio&&t.fim);
  let ini=null, fim=null;
  T.forEach(t=>{ const a=new Date(t.inicio), b=new Date(t.fim); if(!ini||a<ini)ini=a; if(!fim||b>fim)fim=b; });
  if(!ini){ ini=hoje(); fim=hoje(); }
  const total=Math.max(1, dias(ini,fim)+1);
  const cor={'Concluído':'#1FA363','Em andamento':'#2F6FD0','Atrasado':'#D63B30','Não iniciado':'#8A93A3'};
  const h=hoje(); const posHoje = ((dias(ini,h))/total)*100;
  const marcos=[0,.25,.5,.75,1].map(f=>{ const d=new Date(ini); d.setDate(d.getDate()+Math.round(total*f)); return dataCurta(d.toISOString().slice(0,10)); });
  return `
  <div class="card">
    <div class="card-topo"><div><h2>📅 Cronograma</h2>
      <div class="mini">${c.tConcl} concluídas · ${c.tAnda} em andamento · ${c.tAtras} atrasadas · avanço médio ${c.pctCron.toFixed(0)}%</div></div>
      <div class="acoes">${btnCsv('cronograma')} ${botaoAdd('cronograma','Nova atividade')}</div></div>
    ${c.tAtras?`<div class="dica" style="background:var(--erro-bg);border-color:#F0C3BE;border-left-color:var(--erro)">
      🔴 <b>${c.tAtras} atividade(s) atrasada(s):</b> ${DB.cronograma.filter(t=>t.status==='Atrasado').map(t=>esc(t.atividade)).join(' · ')}.
      Ação sugerida: replanejar prazo ou realocar responsável.</div>`:''}
    <div class="gantt"><table>
      <thead><tr><th style="min-width:220px">Atividade</th><th>Resp.</th><th class="ctr">Início</th><th class="ctr">Fim</th>
        <th class="ctr">Dur.</th><th class="ctr">Status</th><th class="ctr">%</th><th class="ctr">Dep.</th>
        <th style="min-width:270px">Linha do tempo</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>
        <tr><td colspan="8"></td><td><div class="g-eixo">${marcos.map(m=>`<span>${m}</span>`).join('')}</div></td><td class="so-edit"></td></tr>
        ${DB.cronograma.map(t=>{
          const off=Math.max(0,dias(ini,t.inicio)/total*100), w=Math.max(1.5,(dias(t.inicio,t.fim)+1)/total*100);
          const d=dias(t.inicio,t.fim)+1;
          return `<tr>
            <td>${campo('cronograma',t.id,'atividade',t.atividade)}<div class="mini">${esc(t.id)} · EAP ${esc(t.eap)}</div></td>
            <td>${campo('cronograma',t.id,'resp',t.resp)}</td>
            <td class="ctr">${campo('cronograma',t.id,'inicio',t.inicio,'date')}</td>
            <td class="ctr">${campo('cronograma',t.id,'fim',t.fim,'date')}</td>
            <td class="ctr">${d}d</td>
            <td class="ctr">${campo('cronograma',t.id,'status',t.status,'select',['Não iniciado','Em andamento','Concluído','Atrasado'])}</td>
            <td class="ctr" style="white-space:nowrap">${campo('cronograma',t.id,'pct',t.pct,'num','','min="0" max="100"')}<span class="no-edit">%</span></td>
            <td class="ctr">${campo('cronograma',t.id,'dep',t.dep)}</td>
            <td><div class="gl"><i style="left:${off}%;width:${w}%;background:${cor[t.status]||'#8A93A3'};opacity:.35"></i>
              <u style="left:${off}%;width:${w*(Number(t.pct)||0)/100}%;background:${cor[t.status]||'#8A93A3'}"></u>
              ${posHoje>=0&&posHoje<=100?`<span class="hoje" style="left:${posHoje}%"></span>`:''}</div></td>
            <td class="ctr so-edit">${btnDel('cronograma',t.id)}</td></tr>`;
        }).join('')}
      </tbody></table></div>
    <div class="legenda">⚪ Não iniciado &nbsp; 🔵 Em andamento &nbsp; 🟢 Concluído &nbsp; 🔴 Atrasado &nbsp;|&nbsp; barra clara = planejado, barra escura = realizado, linha vermelha = hoje</div>
  </div>`;
}

/* ---------- RACI ---------- */
function vRaci(c){
  const nomes = DB.participantes.map(p=>p.nome).concat(['Turma','Comitê','Prof. Ricardo','Coordenação','Dono do sítio']);
  return `
  <div class="card">
    <div class="card-topo"><div><h2>🧑‍💼 Matriz RACI</h2>
      <div class="mini">R = Responsável (faz) · A = Aprovador (responde) · C = Consultado (opina) · I = Informado (fica sabendo)</div></div>
      <div class="acoes">${btnCsv('raci')} ${botaoAdd('raci','Nova atividade')}</div></div>
    <div class="dica"><b>Regra de ouro:</b> cada linha deve ter <b>um único A</b>. Se ninguém aprova, a decisão trava; se todo mundo aprova, ninguém decide.</div>
    <div class="tw"><table>
      <thead><tr><th>Atividade</th><th>R — Responsável</th><th>A — Aprovador</th><th>C — Consultado</th><th>I — Informado</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.raci.map(r=>`<tr>
        <td>${campo('raci',r.id,'atividade',r.atividade)}</td>
        <td>${campo('raci',r.id,'r',r.r)}</td>
        <td>${campo('raci',r.id,'a',r.a)}</td>
        <td>${campo('raci',r.id,'c',r.c)}</td>
        <td>${campo('raci',r.id,'i',r.i)}</td>
        <td class="ctr so-edit">${btnDel('raci',r.id)}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

/* ---------- RISCOS ---------- */
function vRisc(c){
  const zona=s=>s>=15?'z4':s>=10?'z3':s>=5?'z2':'z1';
  const cel={};
  DB.riscos.filter(r=>r.status!=='Encerrado').forEach(r=>{
    const k=`${r.prob}-${r.imp}`; (cel[k]=cel[k]||[]).push(r);
  });
  let matriz='<div class="mr">';
  for(let p=5;p>=1;p--){
    matriz+=`<div class="rot">Prob. ${p}</div>`;
    for(let i=1;i<=5;i++){
      const lista=cel[`${p}-${i}`]||[];
      matriz+=`<div class="cel ${zona(p*i)}">${lista.map(r=>`<span class="tag" title="${esc(r.risco)}">${esc(r.id)}</span>`).join('')}</div>`;
    }
  }
  matriz+='<div class="rot"></div>'+[1,2,3,4,5].map(i=>`<div class="rot">Imp. ${i}</div>`).join('')+'</div>';
  return `
  <div class="card">
    <div class="card-topo"><div><h2>⚠️ Registro de riscos</h2>
      <div class="mini">${c.rAtiv} riscos ativos · ${c.rCrit} crítico(s) (score ≥ 15) · Score = Probabilidade × Impacto (1 a 5)</div></div>
      <div class="acoes">${btnCsv('riscos')} ${botaoAdd('riscos','Novo risco')}</div></div>
    <div class="tw"><table>
      <thead><tr><th style="width:60px">ID</th><th>Risco</th><th class="ctr">P</th><th class="ctr">I</th><th class="ctr">Score</th>
        <th>Responsável</th><th class="ctr">Resposta</th><th>Plano de contingência</th><th class="ctr">Status</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${[...DB.riscos].sort((a,b)=>(b.prob*b.imp)-(a.prob*a.imp)).map(r=>{
        const s=(Number(r.prob)||0)*(Number(r.imp)||0);
        return `<tr>
          <td><b>${esc(r.id)}</b></td>
          <td>${campo('riscos',r.id,'risco',r.risco)}</td>
          <td class="ctr">${campo('riscos',r.id,'prob',r.prob,'select',[1,2,3,4,5])}</td>
          <td class="ctr">${campo('riscos',r.id,'imp',r.imp,'select',[1,2,3,4,5])}</td>
          <td class="ctr"><span class="pill ${s>=15?'p-erro':s>=10?'p-alerta':s>=5?'p-info':'p-ok'}">${s}</span></td>
          <td>${campo('riscos',r.id,'resp',r.resp)}</td>
          <td class="ctr">${campo('riscos',r.id,'resposta',r.resposta,'select',['Mitigar','Evitar','Transferir','Aceitar','Explorar'])}</td>
          <td style="min-width:260px">${campo('riscos',r.id,'plano',r.plano,'textarea')}</td>
          <td class="ctr">${campo('riscos',r.id,'status',r.status,'select',['Ativo','Em monitoramento','Encerrado'])}</td>
          <td class="ctr so-edit">${btnDel('riscos',r.id)}</td></tr>`;
      }).join('')}</tbody></table></div>
  </div>

  <div class="card">
    <h2>Matriz Probabilidade × Impacto</h2>
    <p class="desc">Somente riscos não encerrados. Quanto mais para o canto superior direito, mais urgente.</p>
    ${matriz}
    <div class="legenda"><span class="pill p-ok">1–4 baixo</span><span class="pill p-info">5–9 moderado</span>
      <span class="pill p-alerta">10–14 alto</span><span class="pill p-erro">15–25 crítico</span></div>
  </div>`;
}

/* ---------- STAKEHOLDERS ---------- */
function vStk(c){
  const estrat=(p,i)=> p>=3 ? (i>=3?'Gerenciar de perto':'Manter satisfeito') : (i>=3?'Manter informado':'Monitorar');
  const grupos={'Gerenciar de perto':[],'Manter satisfeito':[],'Manter informado':[],'Monitorar':[]};
  DB.stakeholders.forEach(s=>grupos[estrat(s.poder,s.interesse)].push(s));
  return `
  <div class="card">
    <div class="card-topo"><div><h2>🎯 Stakeholders</h2>
      <div class="mini">Poder e Interesse de 1 a 5. A estratégia é calculada automaticamente.</div></div>
      <div class="acoes">${btnCsv('stakeholders')} ${botaoAdd('stakeholders','Novo stakeholder')}</div></div>
    <div class="tw"><table>
      <thead><tr><th>Stakeholder</th><th>Papel</th><th class="ctr">Poder</th><th class="ctr">Interesse</th>
        <th class="ctr">Estratégia</th><th>Expectativa</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.stakeholders.map(s=>`<tr>
        <td>${campo('stakeholders',s.id,'nome',s.nome)}</td>
        <td>${campo('stakeholders',s.id,'papel',s.papel)}</td>
        <td class="ctr">${campo('stakeholders',s.id,'poder',s.poder,'select',[1,2,3,4,5])}</td>
        <td class="ctr">${campo('stakeholders',s.id,'interesse',s.interesse,'select',[1,2,3,4,5])}</td>
        <td class="ctr"><span class="pill ${s.poder>=3&&s.interesse>=3?'p-erro':s.poder>=3?'p-alerta':s.interesse>=3?'p-info':'p-neutro'}">${estrat(s.poder,s.interesse)}</span></td>
        <td>${campo('stakeholders',s.id,'expectativa',s.expectativa)}</td>
        <td class="ctr so-edit">${btnDel('stakeholders',s.id)}</td></tr>`).join('')}</tbody></table></div>
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>Matriz Poder × Interesse</h2>
      <p class="desc">Eixo horizontal: interesse. Eixo vertical: poder.</p>
      <div class="quad"><div class="qi">
        <div class="lin" style="left:50%;top:0;bottom:0;width:1px"></div>
        <div class="lin" style="top:50%;left:0;right:0;height:1px"></div>
        <div class="ql" style="left:8px;top:8px">Manter satisfeito</div>
        <div class="ql" style="right:8px;top:8px;text-align:right">Gerenciar de perto</div>
        <div class="ql" style="left:8px;bottom:8px">Monitorar</div>
        <div class="ql" style="right:8px;bottom:8px;text-align:right">Manter informado</div>
        ${DB.stakeholders.map((s,i)=>{
          const x=(Number(s.interesse)-1)/4*80+10, y=90-((Number(s.poder)-1)/4*80+10);
          return `<div class="dot" style="left:${x}%;top:${y}%" title="${esc(s.nome)}">${esc(s.nome.split(' ')[0].slice(0,10))}</div>`;
        }).join('')}
      </div></div>
      <div class="mini" style="margin-top:8px">Passe o dedo/mouse sobre os pontos para ver o nome completo.</div>
    </div>
    <div class="card">
      <h2>Plano de engajamento</h2>
      <p class="desc">O que fazer com cada grupo.</p>
      ${Object.entries(grupos).map(([g,l])=>`<div style="margin-bottom:13px">
        <div style="font-weight:800;font-size:13.5px;margin-bottom:4px">${g} <span class="mini">(${l.length})</span></div>
        <div class="mini" style="margin-bottom:5px">${{
          'Gerenciar de perto':'Envolver nas decisões, reportar status semanalmente.',
          'Manter satisfeito':'Consultar antes de decidir; evitar surpresas.',
          'Manter informado':'Comunicados no grupo, sem exigir decisão.',
          'Monitorar':'Acompanhar de leve; comunicar só o essencial.'}[g]}</div>
        ${l.map(s=>`<span class="pill p-neutro" style="margin:2px 3px 2px 0">${esc(s.nome)}</span>`).join('')||'<span class="mini">—</span>'}
      </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- COMUNICAÇÃO ---------- */
function vCom(c){
  const M=msgs();
  const ordem=['convite','pesquisaData','confirmacao','cobranca','prazo','votacao','atualizacao','lembrete','infoEvento','final','agradecimento'];
  return `
  <div class="card">
    <div class="card-topo"><div><h2>📲 Centro de comunicação</h2>
      <div class="mini">11 modelos prontos, já preenchidos com os dados atuais do projeto.</div></div>
      <div class="acoes"><button class="btn btn-sm btn-zap" data-zap="resumo">📲 Compartilhar resumo</button></div></div>
    <div class="dica">Cada mensagem já vem com os números reais do projeto e com o link do sistema. <b>Copiar</b> coloca o texto na área de transferência; <b>Enviar no WhatsApp</b> abre o WhatsApp com a mensagem pronta — é só escolher o grupo.</div>
    <div class="mods">
      ${ordem.map(k=>`<div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <b style="font-size:14px">${esc(M[k].t)}</b>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button class="btn btn-sm" data-copy-msg="${k}">📋 Copiar</button>
            <button class="btn btn-sm btn-zap" data-zap="${k}">📲 Enviar no WhatsApp</button>
          </div>
        </div>
        <pre class="msg">${esc(M[k].m)}</pre>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- DECISÕES E VOTAÇÃO ---------- */
function vDec(c){
  return `
  <div class="card">
    <div class="card-topo"><div><h2>🗳️ Registro de decisões (Decision Log)</h2>
      <div class="mini">Toda decisão relevante fica registrada: quem decidiu, quando, e quais eram as alternativas.</div></div>
      <div class="acoes">${btnCsv('decisoes')} ${botaoAdd('decisoes','Nova decisão')}</div></div>
    <div class="tw"><table>
      <thead><tr><th style="width:60px">ID</th><th class="ctr">Data</th><th>Decisão</th><th>Alternativas avaliadas</th>
        <th>Decisão tomada</th><th>Responsável</th><th>Participantes</th><th class="ctr">Status</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.decisoes.map(d=>`<tr>
        <td><b>${esc(d.id)}</b></td>
        <td class="ctr">${campo('decisoes',d.id,'data',d.data,'date')}</td>
        <td>${campo('decisoes',d.id,'decisao',d.decisao)}</td>
        <td>${campo('decisoes',d.id,'alternativas',d.alternativas)}</td>
        <td><b>${campo('decisoes',d.id,'tomada',d.tomada)}</b></td>
        <td>${campo('decisoes',d.id,'resp',d.resp)}</td>
        <td>${campo('decisoes',d.id,'participantes',d.participantes)}</td>
        <td class="ctr">${campo('decisoes',d.id,'status',d.status,'select',['Aprovada','Em votação','Pendente','Cancelado'])}</td>
        <td class="ctr so-edit">${btnDel('decisoes',d.id)}</td></tr>`).join('')}</tbody></table></div>
  </div>

  <div class="card">
    <div class="card-topo"><div><h2>Votações abertas</h2>
      <div class="mini">Clique na opção para votar. O resultado aparece na hora.</div></div>
      <div class="acoes"><button class="btn btn-sm btn-zap" data-zap="votacao">📲 Divulgar resultado</button> ${botaoAdd('votacoes','Nova votação')}</div></div>
    <div class="dica">⚠️ <b>Como o sistema não tem servidor</b>, cada voto é contado no navegador de quem clicou. Para votação de turma, use uma destas opções: (a) uma pessoa consolida os votos do grupo e registra aqui; (b) publique o sistema e peça o print; (c) use a enquete nativa do WhatsApp e registre o resultado aqui. Veja a aba ⚙️ Compartilhar.</div>
    ${DB.votacoes.map(v=>{
      const tot=v.opcoes.reduce((a,o)=>a+(Number(o.votos)||0),0);
      const max=Math.max(...v.opcoes.map(o=>Number(o.votos)||0));
      return `<div class="voto">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:14.5px">${campo('votacoes',v.id,'pergunta',v.pergunta)}</b>
          <span class="mini" style="margin-left:auto">${tot} voto(s)</span>
          ${btnDel('votacoes',v.id)}
        </div>
        ${v.opcoes.map(o=>{
          const n=Number(o.votos)||0, pct=tot?n/tot*100:0;
          return `<div class="op" data-votar="${v.id}" data-op="${o.id}">
            <div style="flex:1">
              <div style="display:flex;gap:8px;align-items:center">
                <span class="txt">${n===max&&max>0?'🏆 ':''}${esc(o.texto)}</span>
                <span class="n">${n} (${pct.toFixed(0)}%)</span>
              </div>
              ${barra(pct, n===max&&max>0?'v':'')}
            </div>
          </div>`;
        }).join('')}
        <div class="so-edit" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm" data-add-op="${v.id}">➕ Opção</button>
          <button class="btn btn-sm" data-zerar-votos="${v.id}">↺ Zerar votos</button>
        </div>
        <div class="so-edit" style="margin-top:8px">
          <div class="tw"><table><thead><tr><th>Opção</th><th style="width:110px">Votos</th></tr></thead><tbody>
          ${v.opcoes.map(o=>`<tr><td>${campo('votacao_op',v.id+'|'+o.id,'texto',o.texto)}</td>
            <td>${campo('votacao_op',v.id+'|'+o.id,'votos',o.votos,'num')}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------- COMPRAS ---------- */
function vComp(c){
  const cats=[...new Set(DB.compras.map(x=>x.cat))];
  return `
  <div class="card">
    <div class="card-topo"><div><h2>🛒 Lista de compras</h2>
      <div class="mini">${c.comprado}/${c.C.length} itens comprados · previsto ${moeda(c.despPrev)} · realizado ${moeda(c.despReal)}</div></div>
      <div class="acoes">${btnCsv('compras')} <button class="btn btn-sm btn-zap" data-zap-compras>📲 Enviar lista</button> ${botaoAdd('compras','Novo item')}</div></div>
    <div class="filtros">
      <input type="search" placeholder="🔎 Buscar item..." oninput="filtrarTabela('tCompras',this.value)">
      <select onchange="filtrarCol('tCompras',6,this.value)"><option value="">Status: todos</option><option>A comprar</option><option>Comprado</option><option>Cancelado</option></select>
      <select onchange="filtrarCol('tCompras',7,this.value)"><option value="">Categoria: todas</option>${cats.map(x=>`<option>${esc(x)}</option>`).join('')}</select>
    </div>
    <div class="tw"><table id="tCompras">
      <thead><tr><th>Item</th><th class="num">Qtd</th><th>Un.</th><th class="num">Preço est.</th><th class="num">Preço real</th>
        <th class="num">Subtotal</th><th class="ctr">Status</th><th>Categoria</th><th>Responsável</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.compras.map(x=>{
        const sub=(Number(x.qtd)||0)*((x.status==='Comprado'&&Number(x.real))?Number(x.real):(Number(x.est)||0));
        return `<tr>
          <td>${campo('compras',x.id,'item',x.item)}</td>
          <td class="num">${campo('compras',x.id,'qtd',x.qtd,'num')}</td>
          <td>${campo('compras',x.id,'un',x.un)}</td>
          <td class="num">${campo('compras',x.id,'est',x.est,'money')}</td>
          <td class="num">${campo('compras',x.id,'real',x.real,'money')}</td>
          <td class="num"><b>${moeda(sub)}</b></td>
          <td class="ctr" data-v="${esc(x.status)}">${campo('compras',x.id,'status',x.status,'select',['A comprar','Comprado','Cancelado'])}</td>
          <td data-v="${esc(x.cat)}">${campo('compras',x.id,'cat',x.cat,'select',['Alimentação','Bebidas','Logística','Local','Extras'])}</td>
          <td>${campo('compras',x.id,'resp',x.resp)}</td>
          <td class="ctr so-edit">${btnDel('compras',x.id)}</td></tr>`;
      }).join('')}
      <tr class="tot"><td colspan="5">TOTAL</td><td class="num">${moeda(DB.compras.reduce((a,x)=>a+(Number(x.qtd)||0)*((x.status==='Comprado'&&Number(x.real))?Number(x.real):(Number(x.est)||0)),0))}</td><td colspan="4"></td></tr>
      </tbody></table></div>
  </div>

  <div class="card">
    <h2>Resumo por categoria</h2>
    <div class="grid g4">
      ${cats.map(k=>{
        const l=DB.compras.filter(x=>x.cat===k);
        const v=l.reduce((a,x)=>a+(Number(x.qtd)||0)*(Number(x.est)||0),0);
        const ok=l.filter(x=>x.status==='Comprado').length;
        return `<div class="kpi"><div class="rot">${esc(k)}</div><div class="val" style="font-size:20px">${moedaCurta(v)}</div>
          <div class="pe">${ok}/${l.length} comprados</div>${barra(l.length?ok/l.length*100:0,'v')}</div>`;
      }).join('')}
    </div>
    <div class="dica" style="margin-top:14px">📐 <b>Parâmetros usados:</b> 500 g de carne por pessoa · 1 pão de alho por pessoa · 1,5 L de bebida por pessoa · 1,5 kg de gelo por pessoa · 1 kg de carvão para cada 5 kg de carne. Ajuste conforme o perfil da turma.</div>
  </div>`;
}

/* ---------- CHECKLIST ---------- */
function vCheck(c){
  const fases=['30 dias antes','15 dias antes','7 dias antes','1 dia antes','Dia do evento','Pós-evento'];
  return `
  <div class="card">
    <div class="card-topo"><div><h2>✅ Checklist do evento</h2>
      <div class="mini">${c.ckOk} de ${c.K.length} itens concluídos (${c.pctCk.toFixed(0)}%)</div></div>
      <div class="acoes">${btnCsv('checklist')} ${botaoAdd('checklist','Novo item')}</div></div>
    ${barra(c.pctCk,'v')}
    <div class="dica" style="margin-top:14px">Marque os itens conforme forem concluídos. O percentual alimenta o indicador de conclusão do dashboard.</div>
    ${fases.map(f=>{
      const l=DB.checklist.filter(k=>k.fase===f);
      if(!l.length) return '';
      const ok=l.filter(k=>k.ok).length;
      return `<div class="fase">${esc(f)} <span class="mini" style="text-transform:none;letter-spacing:0">— ${ok}/${l.length}</span></div>
        ${l.map(k=>`<div class="ck${k.ok?' done':''}">
          <input type="checkbox" data-coll="checklist" data-id="${k.id}" data-f="ok" ${k.ok?'checked':''}>
          <div style="flex:1"><span class="t">${campo('checklist',k.id,'item',k.item)}</span></div>
          <div class="so-edit" style="display:flex;gap:5px;align-items:center">
            ${campo('checklist',k.id,'fase',k.fase,'select',fases)} ${btnDel('checklist',k.id)}</div>
        </div>`).join('')}`;
    }).join('')}
  </div>`;
}

/* ---------- QUALIDADE ---------- */
function vQual(c){
  const notas=DB.qualidade.filter(q=>Number(q.nota)>0);
  const media=notas.length?notas.reduce((a,q)=>a+Number(q.nota),0)/notas.length:0;
  return `
  <div class="card">
    <div class="card-topo"><div><h2>⭐ Gestão da qualidade</h2>
      <div class="mini">Critérios de aceitação do evento. Nota de 1 a 5 preenchida após o churrasco.</div></div>
      <div class="acoes">${btnCsv('qualidade')} ${botaoAdd('qualidade','Novo critério')}</div></div>
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi ${media>=4?'ok':media>=3?'alerta':media>0?'erro':''}"><div class="rot">Nota média</div>
        <div class="val">${media?media.toFixed(1):'—'}</div><div class="pe">de 5,0 · ${notas.length} critérios avaliados</div></div>
      <div class="kpi"><div class="rot">Critérios atendidos</div>
        <div class="val">${DB.qualidade.filter(q=>q.ok).length}<span style="font-size:15px;color:var(--texto-2)">/${DB.qualidade.length}</span></div>
        <div class="pe">verificação em campo</div></div>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Critério</th><th>Padrão de aceitação</th><th class="ctr">Atendido</th><th class="ctr">Nota (1–5)</th><th class="ctr so-edit">—</th></tr></thead>
      <tbody>${DB.qualidade.map(q=>`<tr>
        <td><b>${campo('qualidade',q.id,'criterio',q.criterio)}</b></td>
        <td>${campo('qualidade',q.id,'padrao',q.padrao)}</td>
        <td class="ctr"><input type="checkbox" data-coll="qualidade" data-id="${q.id}" data-f="ok" ${q.ok?'checked':''}></td>
        <td class="ctr">${campo('qualidade',q.id,'nota',q.nota,'select',[0,1,2,3,4,5])}</td>
        <td class="ctr so-edit">${btnDel('qualidade',q.id)}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

/* ---------- LIÇÕES APRENDIDAS ---------- */
function vLicoes(c){
  const cats=['Funcionou','Não funcionou','Faríamos diferente'];
  return `
  <div class="card">
    <div class="card-topo"><div><h2>📚 Lições aprendidas</h2>
      <div class="mini">Registro contínuo — não deixe para o final. É o que transforma o churrasco em case.</div></div>
      <div class="acoes">${btnCsv('licoes')} ${botaoAdd('licoes','Nova lição')}</div></div>
    <div class="grid g3">
      ${cats.map(cat=>{
        const l=DB.licoes.filter(x=>x.categoria===cat);
        const ic={'Funcionou':'✅','Não funcionou':'❌','Faríamos diferente':'🔄'}[cat];
        return `<div class="pmb"><h3>${ic} ${cat}</h3>
          ${l.map(x=>`<div style="border-top:1px solid var(--linha);padding:9px 0;font-size:13px">
            ${campo('licoes',x.id,'texto',x.texto,'textarea')}
            <div class="mini" style="margin-top:5px"><b>Recomendação:</b> ${campo('licoes',x.id,'recomendacao',x.recomendacao,'textarea')}</div>
            <div class="so-edit" style="margin-top:5px;display:flex;gap:5px">
              ${campo('licoes',x.id,'categoria',x.categoria,'select',cats)} ${btnDel('licoes',x.id)}</div>
          </div>`).join('')||'<div class="mini">Nenhum registro ainda.</div>'}
        </div>`;
      }).join('')}
    </div>
    <div class="dica" style="margin-top:14px">💡 <b>Dica de PMO:</b> registre a lição no dia em que o fato acontece. Lição aprendida escrita um mês depois vira ficção.</div>
  </div>`;
}

/* ---------- PMBOK ---------- */
function vPmbok(c){
  const areas=[
    ['🔗','Integração','Reunir todas as partes do projeto em um plano único e coerente, e controlar as mudanças.',
      'Este próprio Portal é o Termo de Abertura + Plano do Projeto + relatório de status, tudo em um lugar só.',
      'Portal do Churrasco (dashboard integrado) + Registro de decisões','Conclusão geral',c.pctGeral.toFixed(0)+'%','dash'],
    ['📦','Escopo','Definir o que está e o que não está incluído; evitar que o projeto cresça sem controle.',
      'A EAP decompõe o churrasco em 6 entregas e 21 pacotes. Pediu churrasqueira profissional? Não está na EAP — vira solicitação de mudança.',
      'EAP + Dicionário da EAP','Pacotes definidos',DB.eap.length,'eap'],
    ['📅','Cronograma','Sequenciar atividades, estimar durações e controlar o prazo.',
      'Gantt com 20 atividades, dependências e marco final na data do evento — que é imutável.',
      'Cronograma Gantt + caminho crítico','Avanço do cronograma',c.pctCron.toFixed(0)+'%','cron'],
    ['💰','Custos','Estimar, orçar e controlar o dinheiro do projeto.',
      'Orçamento montado de baixo para cima a partir da lista de compras, com reserva de contingência de '+DB.projeto.contingenciaPct+'%.',
      'Orçamento + curva previsto × realizado','Saldo previsto',moedaCurta(c.saldoPrev),'fin'],
    ['⭐','Qualidade','Garantir que a entrega atenda aos critérios acordados.',
      '8 critérios de aceitação definidos antes do evento: carne suficiente, bebida gelada, banheiro limpo, som até 22h.',
      'Checklist de qualidade + pesquisa pós-evento','Critérios atendidos',DB.qualidade.filter(q=>q.ok).length+'/'+DB.qualidade.length,'qual'],
    ['🧑‍💼','Recursos','Organizar as pessoas e os materiais necessários.',
      'A turma foi dividida em equipes (compras, financeiro, churrasqueiros, logística) com papéis formalizados.',
      'Matriz RACI + equipes','Pessoas alocadas',DB.participantes.filter(p=>p.equipe&&p.equipe!=='—').length,'raci'],
    ['📲','Comunicações','Levar a informação certa, para a pessoa certa, na hora certa.',
      'O canal é o grupo de WhatsApp. 11 modelos de mensagem padronizados evitam ruído e repetição.',
      'Centro de comunicação + plano de comunicação','Modelos prontos','11','com'],
    ['⚠️','Riscos','Identificar incertezas e tratá-las antes que virem problema.',
      'Chuva, inadimplência, atraso de fornecedor, falta de gelo. Cada risco tem dono, resposta e plano B.',
      'Registro de riscos + matriz P×I','Riscos críticos ativos',c.rCrit,'risc'],
    ['🤝','Aquisições','Contratar terceiros e gerenciar fornecedores.',
      'Sítio contratado com sinal e multa; açougue e distribuidora com 3 cotações e um fornecedor reserva cada.',
      'Cotações + lista de compras','Itens contratados',c.comprado+'/'+c.C.length,'comp'],
    ['🎯','Stakeholders','Mapear e engajar quem afeta ou é afetado pelo projeto.',
      'Do professor (que dá o barril) ao vizinho do sítio (que reclama do som). Cada um com estratégia própria.',
      'Matriz Poder × Interesse','Stakeholders mapeados',DB.stakeholders.length,'stk']
  ];
  return `
  <div class="card">
    <h2>🎓 PMBOK na prática</h2>
    <p class="desc">Como cada área de conhecimento do PMBOK está sendo efetivamente aplicada neste churrasco. Esta é a página para mostrar ao professor.</p>
    <div class="dica"><b>Desafio da turma:</b> ${esc(DB.projeto.premio)}. Objetivo declarado: <i>${esc(DB.projeto.objetivo)}</i></div>
    <div class="grid g2">
      ${areas.map(([ic,nome,conc,apl,fer,indR,indV,aba])=>`
        <div class="pmb">
          <h3>${ic} ${nome}</h3>
          <dl>
            <dt>Conceito</dt><dd>${conc}</dd>
            <dt>Aplicação no churrasco</dt><dd>${apl}</dd>
            <dt>Ferramenta</dt><dd>${fer}</dd>
          </dl>
          <div class="ind">📊 ${indR}: <span style="color:var(--fogo-esc)">${indV}</span>
            <button class="btn btn-sm" style="float:right" data-ir="${aba}">abrir →</button></div>
        </div>`).join('')}
    </div>
  </div>

  <div class="card">
    <h2>Ciclo de vida do projeto</h2>
    <p class="desc">Os 5 grupos de processos aplicados ao churrasco.</p>
    <div class="tw"><table>
      <thead><tr><th>Grupo de processos</th><th>O que fizemos</th><th>Artefato gerado</th></tr></thead>
      <tbody>
        <tr><td><b>Iniciação</b></td><td>Desafio lançado pelo professor, definição do objetivo e do gerente do projeto, identificação dos stakeholders.</td><td>Termo de abertura (ficha do evento) + registro de stakeholders</td></tr>
        <tr><td><b>Planejamento</b></td><td>EAP, cronograma, orçamento, plano de comunicação, registro de riscos, critérios de qualidade.</td><td>Este Portal completo</td></tr>
        <tr><td><b>Execução</b></td><td>Cotações, contratação do sítio, arrecadação, compras, montagem e realização do evento.</td><td>Lista de compras + pagamentos + checklist</td></tr>
        <tr><td><b>Monitoramento e controle</b></td><td>Semáforo de status, acompanhamento de % concluído, controle de caixa, reavaliação de riscos.</td><td>Dashboard + relatórios de status no WhatsApp</td></tr>
        <tr><td><b>Encerramento</b></td><td>Prestação de contas, pesquisa de satisfação, lições aprendidas, entrega do case.</td><td>Lições aprendidas + fechamento financeiro</td></tr>
      </tbody></table></div>
  </div>

  <div class="card">
    <h2>Argumentos para levar o barril 🍺</h2>
    <p class="desc">Use isto na apresentação ao professor.</p>
    <div class="grid g2">
      ${[
        ['Escopo controlado','A EAP tem '+DB.eap.length+' pacotes e nenhuma entrega foi adicionada sem passar pelo registro de decisões.'],
        ['Prazo gerenciado','Cronograma com dependências, '+c.T.length+' atividades e marco fixo. Avanço atual de '+c.pctCron.toFixed(0)+'%.'],
        ['Custo sob controle','Orçamento bottom-up de '+moeda(c.despPrev)+' com contingência de '+DB.projeto.contingenciaPct+'%. Prestação de contas aberta a todos.'],
        ['Riscos tratados','12 riscos identificados com dono, resposta e plano de contingência — inclusive o risco de perder este desafio.'],
        ['Comunicação padronizada','11 modelos de mensagem, um único canal oficial e relatório de status recorrente.'],
        ['Governança real','Matriz RACI com aprovador único por atividade e log de decisões com alternativas avaliadas.']
      ].map(([t,d])=>`<div class="pmb"><h3>🏆 ${t}</h3><div style="font-size:13.5px">${d}</div></div>`).join('')}
    </div>
  </div>`;
}

/* ---------- COMPARTILHAR / CONFIGURAÇÕES ---------- */
function vConf(c){
  return `
  <div class="card">
    <div class="card-topo"><div><h2>🔗 Compartilhar o projeto</h2>
      <div class="mini">Como levar este Portal para o grupo de WhatsApp.</div></div></div>

    <div class="grid g2">
      <div class="pmb">
        <h3>📱 Modo local (agora)</h3>
        <div style="font-size:13.5px">
          Os dados ficam salvos <b>no navegador de quem abriu o arquivo</b>. Cada pessoa vê a sua própria cópia.
          <br><br><b>Serve para:</b> uma pessoa manter o controle e compartilhar prints ou mensagens no grupo.
          <br><b>Não serve para:</b> todo mundo editar ao mesmo tempo.
          <br><br>Envie o arquivo <code class="k">churrasco.html</code> pelo WhatsApp ou pelo Drive. Quem receber, abre com duplo clique.
        </div>
      </div>
      <div class="pmb">
        <h3>🌐 Modo compartilhado (link)</h3>
        <div style="font-size:13.5px">
          O arquivo fica <b>hospedado na internet</b> e todo mundo acessa o mesmo endereço pelo celular.
          <br><br><b>Importante:</b> mesmo publicado, as <b>edições continuam locais</b> em cada aparelho — porque não há banco de dados.
          <br><br>O fluxo que funciona: <b>uma pessoa é a dona do arquivo</b>, consolida as informações, exporta o backup JSON e republica. Os demais consultam.
        </div>
      </div>
    </div>

    <h3 style="margin:22px 0 10px;font-size:15px">Publicar de graça em 5 minutos — GitHub Pages</h3>
    ${[['Crie uma conta gratuita em <b>github.com</b> (leva 2 minutos).'],
       ['Clique em <b>New repository</b>, dê o nome <code class="k">churrasco</code>, marque <b>Public</b> e crie.'],
       ['Clique em <b>Add file → Upload files</b> e arraste o arquivo <code class="k">churrasco.html</code> (ou a pasta inteira).'],
       ['Renomeie o arquivo para <code class="k">index.html</code> — assim o link fica mais curto.'],
       ['Vá em <b>Settings → Pages</b>. Em <i>Source</i>, escolha <b>Deploy from a branch</b>, branch <code class="k">main</code>, pasta <code class="k">/ (root)</code> e salve.'],
       ['Aguarde 1–2 minutos. O link aparece na mesma tela: <code class="k">https://SEU-USUARIO.github.io/churrasco/</code>'],
       ['Cole esse link no campo abaixo e mande no grupo. Pronto. 🎉']]
      .map((p,i)=>`<div class="passo"><div class="n">${i+1}</div><div class="c">${p[0]}</div></div>`).join('')}

    <div class="dica">⚡ <b>Alternativa ainda mais rápida (sem conta):</b> acesse <b>app.netlify.com/drop</b>, arraste a pasta do projeto na tela e o link é gerado na hora. O endereço é temporário se você não criar conta, mas resolve para o churrasco.</div>

    <div style="margin-top:18px">
      <label style="font-weight:700;font-size:13.5px">Link público do projeto (aparece em todas as mensagens de WhatsApp)</label>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
        <input type="text" class="f" id="inpLink" style="flex:1;min-width:220px" placeholder="https://seu-usuario.github.io/churrasco/" value="${esc(DB.linkPublico||'')}">
        <button class="btn btn-fogo" id="btnSalvarLink">Salvar link</button>
        <button class="btn" data-copy-link>📋 Copiar link</button>
        <button class="btn btn-zap" data-zap="resumo">📲 Mandar no grupo</button>
      </div>
      <div class="mini" style="margin-top:6px">Enquanto estiver vazio, o sistema usa o endereço atual do arquivo.</div>
    </div>
  </div>

  <div class="card">
    <h2>💾 Backup, importação e exportação</h2>
    <p class="desc">Faça um backup sempre que atualizar dados importantes. É a sua rede de segurança.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn btn-fogo" id="btnExportJson">⬇️ Exportar projeto (JSON)</button>
      <button class="btn" id="btnImportJson">⬆️ Importar projeto (JSON)</button>
      <input type="file" id="fileJson" accept=".json,application/json" style="display:none">
      <button class="btn" data-csv="tudo">📥 Exportar tudo em Excel/CSV</button>
      <button class="btn" onclick="window.print()">🖨️ Imprimir / salvar em PDF</button>
    </div>
    <h3 style="font-size:14px;margin:0 0 8px">Exportar módulos separadamente</h3>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${[['participantes','Participantes'],['pagamentos','Pagamentos'],['cronograma','Tarefas'],['riscos','Riscos'],
         ['compras','Compras'],['orcamento','Orçamento'],['eap','EAP'],['raci','RACI'],['stakeholders','Stakeholders'],
         ['decisoes','Decisões'],['checklist','Checklist'],['qualidade','Qualidade'],['licoes','Lições']]
        .map(([k,r])=>`<button class="btn btn-sm" data-csv="${k}">📥 ${r}</button>`).join('')}
    </div>
    <div class="dica" style="margin-top:16px">🔁 <b>Rotina sugerida:</b> a pessoa responsável atualiza o Portal → exporta o JSON → guarda no Drive da turma → republica o arquivo quando houver mudança grande. Assim ninguém perde nada se limpar o navegador.</div>
  </div>

  <div class="card">
    <h2>⚙️ Manutenção</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="btnRestaurar">↺ Restaurar dados de exemplo</button>
      <button class="btn btn-perigo" id="btnZerar">🗑️ Zerar projeto (começar do zero)</button>
    </div>
    <div class="mini" style="margin-top:10px">
      "Restaurar" volta ao conteúdo de demonstração. "Zerar" apaga tudo e deixa as tabelas vazias para você preencher com a sua turma.
      Em ambos os casos, <b>exporte um backup antes</b>.
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--linha)" class="mini">
      <b>Como funciona por dentro:</b> HTML + CSS + JavaScript puro, sem bibliotecas externas e sem servidor.
      Os dados ficam no <code class="k">localStorage</code> do navegador, sob a chave <code class="k">${CHAVE}</code>.
      Não há login, não há coleta de dados e nada sai do seu aparelho a não ser quando você clica em compartilhar.
    </div>
  </div>`;
}

/* ---------- 7. FILTROS DE TABELA ---------- */
function filtrarTabela(id, termo){
  const t=document.getElementById(id); if(!t) return;
  termo=(termo||'').toLowerCase();
  Array.from(t.tBodies[0].rows).forEach(r=>{
    if(r.classList.contains('tot')) return;
    r.dataset.fBusca = r.textContent.toLowerCase().includes(termo) ? '' : '1';
    aplicarFiltros(r);
  });
  atualizarContador(t);
}
function filtrarCol(id, col, valor){
  const t=document.getElementById(id); if(!t) return;
  Array.from(t.tBodies[0].rows).forEach(r=>{
    if(r.classList.contains('tot')) return;
    const cel=r.cells[col];
    const v=cel?(cel.dataset.v||cel.textContent.trim()):'';
    r.dataset['fCol'+col] = (!valor || v===valor) ? '' : '1';
    aplicarFiltros(r);
  });
  atualizarContador(t);
}
function aplicarFiltros(r){
  const oculto = Object.keys(r.dataset).some(k=>k.startsWith('f') && r.dataset[k]==='1');
  r.style.display = oculto ? 'none' : '';
}
function atualizarContador(t){
  const el=document.getElementById('contFiltro'); if(!el) return;
  const vis=Array.from(t.tBodies[0].rows).filter(r=>r.style.display!=='none'&&!r.classList.contains('tot')).length;
  el.textContent = `${vis} registro(s) exibido(s)`;
}

/* ---------- 8. GRAVAÇÃO DE EDIÇÕES ---------- */
function gravar(coll, id, f, valor){
  if(coll==='projeto'){ DB.projeto[f] = (f==='valorPessoa'||f==='contingenciaPct') ? Number(valor)||0 : valor; }
  else if(coll==='financeiro'){ DB.financeiro[f] = Number(valor)||0; }
  else if(coll==='root'){ DB[f]=valor; }
  else if(coll==='votacao_op'){
    const [vid,oid]=id.split('|');
    const v=DB.votacoes.find(x=>x.id===vid); if(!v) return;
    const o=v.opcoes.find(x=>x.id===oid); if(!o) return;
    o[f] = f==='votos' ? Number(valor)||0 : valor;
  }
  else{
    const lista=DB[coll]; if(!lista) return;
    const r=lista.find(x=>x.id===id); if(!r) return;
    const nums=['valor','qtd','est','real','pct','prob','imp','poder','interesse','nota','votos'];
    r[f] = nums.includes(f) ? (valor===''?0:Number(valor)) : valor;
    // consistências automáticas
    if(coll==='participantes' && f==='presenca' && valor==='Não vai') r.pagamento='—';
    if(coll==='participantes' && f==='presenca' && valor==='Confirmado' && r.pagamento==='—') r.pagamento='Pendente';
    if(coll==='cronograma' && f==='status'){ if(valor==='Concluído') r.pct=100; if(valor==='Não iniciado') r.pct=0; }
    if(coll==='cronograma' && f==='pct'){ const n=Number(valor)||0;
      if(n>=100){ r.pct=100; r.status='Concluído'; }
      else if(n>0 && r.status==='Não iniciado') r.status='Em andamento'; }
    if(coll==='compras' && f==='status' && valor==='Comprado' && !Number(r.real)) r.real=Number(r.est)||0;
  }
  salvar();
}

const MODELOS = {
  participantes:{pref:'P', novo:()=>({presenca:'Pendente',pagamento:'Pendente',equipe:'—',nome:'Novo participante',tel:'',obs:''})},
  pagamentos:{pref:'PG', novo:()=>({nomeId:(DB.participantes[0]||{}).id||'',valor:DB.projeto.valorPessoa,data:'',status:'Pendente',forma:'PIX',obs:''})},
  eap:{pref:'E', novo:()=>({id:'novo',nome:'Novo pacote',pai:'',resp:''})},
  cronograma:{pref:'A', novo:()=>({eap:'',atividade:'Nova atividade',resp:'',inicio:new Date().toISOString().slice(0,10),fim:new Date().toISOString().slice(0,10),status:'Não iniciado',pct:0,dep:''})},
  raci:{pref:'R', novo:()=>({atividade:'Nova atividade',r:'',a:'',c:'',i:''})},
  riscos:{pref:'RK', novo:()=>({risco:'Novo risco',prob:3,imp:3,resp:'',resposta:'Mitigar',plano:'',status:'Ativo'})},
  stakeholders:{pref:'S', novo:()=>({nome:'Novo stakeholder',papel:'',poder:3,interesse:3,expectativa:'',estrategia:''})},
  decisoes:{pref:'D', novo:()=>({data:new Date().toISOString().slice(0,10),decisao:'Nova decisão',alternativas:'',tomada:'',resp:'',participantes:'',status:'Pendente'})},
  compras:{pref:'C', novo:()=>({item:'Novo item',qtd:1,un:'un',est:0,real:0,resp:'',status:'A comprar',cat:'Alimentação'})},
  checklist:{pref:'CK', novo:()=>({fase:'30 dias antes',item:'Novo item de checklist',ok:false})},
  qualidade:{pref:'Q', novo:()=>({criterio:'Novo critério',padrao:'',ok:false,nota:0})},
  licoes:{pref:'L', novo:()=>({categoria:'Funcionou',texto:'',recomendacao:''})},
  votacoes:{pref:'V', novo:()=>({pergunta:'Nova pergunta',ativa:true,opcoes:[{id:'a',texto:'Opção A',votos:0},{id:'b',texto:'Opção B',votos:0}]})}
};

/* ---------- 9. EXPORTAÇÕES ---------- */
function exportarCsv(qual){
  const P=DB.participantes, c=calc();
  const mapa={
    participantes:()=>['Nome;Presença;Pagamento;Equipe;Observação', P.map(p=>[p.nome,p.presenca,p.pagamento,p.equipe,p.obs])],
    pagamentos:()=>['Nome;Valor;Data;Status;Forma;Observação', DB.pagamentos.map(g=>[nomeDe(g.nomeId),g.valor,dataBR(g.data),g.status,g.forma,g.obs])],
    cronograma:()=>['ID;EAP;Atividade;Responsável;Início;Término;Duração (dias);Status;% concluído;Dependência',
      DB.cronograma.map(t=>[t.id,t.eap,t.atividade,t.resp,dataBR(t.inicio),dataBR(t.fim),dias(t.inicio,t.fim)+1,t.status,t.pct,t.dep])],
    riscos:()=>['ID;Risco;Probabilidade;Impacto;Score;Responsável;Resposta;Plano de contingência;Status',
      DB.riscos.map(r=>[r.id,r.risco,r.prob,r.imp,r.prob*r.imp,r.resp,r.resposta,r.plano,r.status])],
    compras:()=>['Item;Quantidade;Unidade;Preço estimado;Preço real;Subtotal;Responsável;Status;Categoria',
      DB.compras.map(x=>[x.item,x.qtd,x.un,x.est,x.real,(x.qtd*((x.status==='Comprado'&&x.real)?x.real:x.est)).toFixed(2),x.resp,x.status,x.cat])],
    orcamento:()=>['Linha;Valor', [
      ['Receita prevista',c.receitaPrev.toFixed(2)],['Receita realizada',c.receitaReal.toFixed(2)],['A receber',c.aReceber.toFixed(2)],
      ['Despesa prevista',c.despPrev.toFixed(2)],['Despesa realizada',c.despReal.toFixed(2)],
      ['Saldo previsto',c.saldoPrev.toFixed(2)],['Saldo realizado',c.saldoReal.toFixed(2)],
      ['Contingência ('+DB.projeto.contingenciaPct+'%)',c.conting.toFixed(2)],['Custo por pessoa',c.custoPessoa.toFixed(2)],
      ['Valor cobrado por pessoa',c.vp.toFixed(2)],['Participantes pagantes',c.pagantes.length]]],
    eap:()=>['ID;Pacote;Pai;Responsável', DB.eap.map(e=>[e.id,e.nome,e.pai,e.resp])],
    raci:()=>['Atividade;Responsável (R);Aprovador (A);Consultado (C);Informado (I)', DB.raci.map(r=>[r.atividade,r.r,r.a,r.c,r.i])],
    stakeholders:()=>['Stakeholder;Papel;Poder;Interesse;Expectativa', DB.stakeholders.map(s=>[s.nome,s.papel,s.poder,s.interesse,s.expectativa])],
    decisoes:()=>['ID;Data;Decisão;Alternativas;Decisão tomada;Responsável;Participantes;Status',
      DB.decisoes.map(d=>[d.id,dataBR(d.data),d.decisao,d.alternativas,d.tomada,d.resp,d.participantes,d.status])],
    checklist:()=>['Fase;Item;Concluído', DB.checklist.map(k=>[k.fase,k.item,k.ok?'Sim':'Não'])],
    qualidade:()=>['Critério;Padrão;Atendido;Nota', DB.qualidade.map(q=>[q.criterio,q.padrao,q.ok?'Sim':'Não',q.nota])],
    licoes:()=>['Categoria;Lição;Recomendação', DB.licoes.map(l=>[l.categoria,l.texto,l.recomendacao])]
  };
  if(qual==='tudo'){
    const blocos=Object.keys(mapa).map(k=>{
      const [cab,linhas]=mapa[k]();
      return `### ${k.toUpperCase()}\r\n`+csv(cab.split(';'), linhas);
    });
    baixar('churrasco_completo.csv', blocos.join('\r\n\r\n'), 'text/csv;charset=utf-8');
    toast('📥 Arquivo completo exportado.');
    return;
  }
  const fn=mapa[qual]; if(!fn){ toast('Módulo não encontrado.'); return; }
  const [cab,linhas]=fn();
  baixar(`churrasco_${qual}.csv`, csv(cab.split(';'), linhas), 'text/csv;charset=utf-8');
  toast('📥 CSV exportado — abra no Excel.');
}

/* ---------- 10. AÇÕES ESPECIAIS ---------- */
function confirmarPresenca(){
  const nome=prompt('Qual é o seu nome completo?');
  if(!nome || !nome.trim()) return;
  const n=nome.trim().toLowerCase();
  let p=DB.participantes.find(x=>x.nome.toLowerCase()===n);
  if(p){ p.presenca='Confirmado'; if(p.pagamento==='—') p.pagamento='Pendente'; }
  else{
    p={id:proxId(DB.participantes,'P'), nome:nome.trim(), presenca:'Confirmado', pagamento:'Pendente', equipe:'—', tel:'', obs:'Auto-confirmado'};
    DB.participantes.push(p);
  }
  salvar(); render();
  const c=calc();
  const m=`Eu vou no churrasco! 🍖🔥\n\n*${p.nome}* confirmado(a).\n\n📅 ${dataBR(DB.projeto.data)} · 📍 ${DB.projeto.local}\n💰 ${moeda(c.vp)} — PIX: ${DB.chavePix}\n\nJá somos ${c.confirmados.length} confirmados! 🎉\n\n👉 ${linkAtual()}`;
  if(confirm(`✅ ${p.nome}, presença registrada!\n\nQuer avisar no grupo do WhatsApp agora?`)) zap(m);
  else copiar(m);
}
function cobrarLista(){
  const c=calc();
  const pend=DB.participantes.filter(p=>p.presenca==='Confirmado'&&(p.pagamento==='Pendente'||p.pagamento==='Atrasado'));
  if(!pend.length){ toast('🎉 Ninguém está devendo!'); return; }
  const m=`💰 *COBRANÇA — CHURRASCO DA TURMA*\n\nFala, pessoal! 👋\n\nEstamos fechando os pagamentos do churrasco.\nSeu valor ficou em *${moeda(c.vp)}*.\n\n📌 PIX: ${DB.chavePix}\n\nAinda faltam ${pend.length} pagamento(s):\n${pend.map(p=>`• ${p.nome}${p.pagamento==='Atrasado'?' ⚠️':''}`).join('\n')}\n\nSe ainda não realizou o pagamento, gentileza regularizar para conseguirmos fechar as compras. 🍖\n\n👉 ${linkAtual()}`;
  zap(m);
}
function zapCompras(){
  const pend=DB.compras.filter(x=>x.status!=='Comprado');
  const porResp={};
  pend.forEach(x=>{ const k=x.resp||'A definir'; (porResp[k]=porResp[k]||[]).push(x); });
  const m=`🛒 *LISTA DE COMPRAS — CHURRASCO*\n\n${Object.entries(porResp).map(([r,l])=>
    `*${r}*\n${l.map(x=>`  • ${x.item} — ${x.qtd} ${x.un} (~${moeda(x.qtd*x.est)})`).join('\n')}`).join('\n\n')}\n\n💰 Total pendente: ${moeda(pend.reduce((a,x)=>a+x.qtd*x.est,0))}\n\nQuem comprar, manda a nota no grupo para acertarmos. 🍖\n\n👉 ${linkAtual()}`;
  zap(m);
}
function votar(vid,oid){
  const v=DB.votacoes.find(x=>x.id===vid); if(!v) return;
  const chave='voto_'+CHAVE+'_'+vid;
  const jaVotou=localStorage.getItem(chave);
  if(jaVotou){
    const ant=v.opcoes.find(o=>o.id===jaVotou);
    if(ant) ant.votos=Math.max(0,(Number(ant.votos)||0)-1);
  }
  const o=v.opcoes.find(x=>x.id===oid); if(!o) return;
  o.votos=(Number(o.votos)||0)+1;
  try{ localStorage.setItem(chave,oid); }catch(e){}
  salvar(); render();
  toast(jaVotou&&jaVotou!==oid ? '🔄 Voto alterado!' : jaVotou===oid ? '✅ Voto mantido' : '🗳️ Voto registrado!');
}

/* ---------- 11. EVENTOS ---------- */
function ligarEventos(){
  // abas
  $('#abas').addEventListener('click', e=>{ const b=e.target.closest('[data-aba]'); if(b) irPara(b.dataset.aba); });

  // modo edição
  $('#btnEdit').addEventListener('click', ()=>{
    document.body.classList.toggle('edit');
    const on=document.body.classList.contains('edit');
    $('#btnEdit').classList.toggle('on',on);
    $('#btnEdit').innerHTML = on ? '✅ Concluir edição' : '✏️ Modo edição';
    toast(on?'✏️ Modo edição ligado — clique nos campos.':'✅ Alterações salvas no navegador.');
  });

  // topo
  $('#btnZapTopo').addEventListener('click', ()=>zap(msgs().resumo.m));
  $('#btnLinkTopo').addEventListener('click', ()=>{ copiar(linkAtual()); });

  // delegação geral
  document.addEventListener('click', e=>{
    const t=e.target;
    let b;
    if(b=t.closest('[data-ir]')) return irPara(b.dataset.ir);
    if(b=t.closest('[data-zap]')){ const M=msgs(); const k=b.dataset.zap; if(M[k]) zap(M[k].m); return; }
    if(b=t.closest('[data-copy-msg]')){ const M=msgs(); const k=b.dataset.copyMsg; if(M[k]) copiar(M[k].m); return; }
    if(b=t.closest('[data-copy-link]')){ copiar(linkAtual()); return; }
    if(b=t.closest('[data-csv]')){ exportarCsv(b.dataset.csv); return; }
    if(b=t.closest('[data-confirmar]')){ confirmarPresenca(); return; }
    if(b=t.closest('[data-cobrar-lista]')){ cobrarLista(); return; }
    if(b=t.closest('[data-zap-compras]')){ zapCompras(); return; }
    if(b=t.closest('[data-votar]')){ if(!document.body.classList.contains('edit')) votar(b.dataset.votar,b.dataset.op); return; }
    if(b=t.closest('[data-add]')){
      const coll=b.dataset.add, mod=MODELOS[coll]; if(!mod) return;
      const novo=mod.novo(); if(!novo.id) novo.id=proxId(DB[coll],mod.pref);
      if(coll==='eap') novo.id=proxId(DB.eap.filter(x=>/^\d+$/.test(x.id)),'')||String(DB.eap.filter(x=>!x.pai).length+1);
      DB[coll].push(novo); salvar(); render(); toast('➕ Registro adicionado — role até o final da tabela.');
      return;
    }
    if(b=t.closest('[data-del]')){
      const coll=b.dataset.del, id=b.dataset.id;
      if(!confirm('Excluir este registro? Não dá para desfazer.')) return;
      DB[coll]=DB[coll].filter(x=>x.id!==id); salvar(); render(); toast('🗑️ Registro excluído.');
      return;
    }
    if(b=t.closest('[data-add-op]')){
      const v=DB.votacoes.find(x=>x.id===b.dataset.addOp); if(!v) return;
      const letras='abcdefghij';
      v.opcoes.push({id:letras[v.opcoes.length]||('o'+v.opcoes.length), texto:'Nova opção', votos:0});
      salvar(); render(); return;
    }
    if(b=t.closest('[data-zerar-votos]')){
      const v=DB.votacoes.find(x=>x.id===b.dataset.zerarVotos); if(!v) return;
      v.opcoes.forEach(o=>o.votos=0); try{localStorage.removeItem('voto_'+CHAVE+'_'+v.id);}catch(e){}
      salvar(); render(); toast('↺ Votos zerados.'); return;
    }
  });

  // edição de campos
  document.addEventListener('change', e=>{
    const el=e.target;
    if(!el.dataset || !el.dataset.coll) return;
    const val = el.type==='checkbox' ? el.checked : el.value;
    gravar(el.dataset.coll, el.dataset.id, el.dataset.f, val);
    const precisaRender = el.tagName==='SELECT' || el.type==='checkbox' || ['valorPessoa','contingenciaPct','qtd','est','real','pct','prob','imp','poder','interesse','votos','data','nota','receitaExtra','despesasPrevistasExtras'].includes(el.dataset.f);
    if(precisaRender) render(); else toast('💾 Salvo.');
  });
  document.addEventListener('blur', e=>{
    const el=e.target;
    if(!el.dataset || !el.dataset.coll || el.tagName==='SELECT' || el.type==='checkbox') return;
    gravar(el.dataset.coll, el.dataset.id, el.dataset.f, el.value);
  }, true);

  // configurações (delegado porque a aba é recriada)
  document.addEventListener('click', e=>{
    if(e.target.id==='btnSalvarLink'){
      DB.linkPublico=$('#inpLink').value.trim(); salvar(); toast('🔗 Link salvo — já aparece nas mensagens.');
    }
    if(e.target.id==='btnExportJson'){
      baixar('churrasco_backup.json', JSON.stringify(DB,null,2), 'application/json');
      toast('💾 Backup exportado.');
    }
    if(e.target.id==='btnImportJson'){ $('#fileJson').click(); }
    if(e.target.id==='btnRestaurar'){
      if(!confirm('Restaurar os dados de exemplo? Suas alterações serão perdidas.')) return;
      DB=clone(SEED); salvar(); render(); toast('↺ Dados de exemplo restaurados.');
    }
    if(e.target.id==='btnZerar'){
      if(!confirm('Apagar TODOS os dados e começar do zero? Exporte um backup antes!')) return;
      DB=clone(SEED);
      ['participantes','pagamentos','cronograma','riscos','compras','decisoes','licoes'].forEach(k=>DB[k]=[]);
      DB.checklist.forEach(k=>k.ok=false); DB.qualidade.forEach(q=>{q.ok=false;q.nota=0;});
      DB.votacoes.forEach(v=>v.opcoes.forEach(o=>o.votos=0));
      DB.projeto.nome='Churrasco da Turma'; DB.projeto.local=''; DB.projeto.endereco='';
      salvar(); render(); toast('🗑️ Projeto zerado. Bora preencher!');
    }
  });
  document.addEventListener('change', e=>{
    if(e.target.id!=='fileJson') return;
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const o=JSON.parse(String(r.result).replace(/^\ufeff/,''));
        if(!o.projeto||!o.participantes) throw new Error('formato');
        DB=o; mesclarNovosCampos(); salvar(); render(); toast('⬆️ Projeto importado com sucesso!');
      }catch(err){ alert('Não consegui ler este arquivo. Ele precisa ser um backup gerado por este próprio sistema (churrasco_backup.json).'); }
    };
    r.readAsText(f);
    e.target.value='';
  });

  // atalho: Ctrl/Cmd + E liga o modo edição
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='e'){ e.preventDefault(); $('#btnEdit').click(); }
  });
}

/* ---------- 12. INICIALIZAÇÃO ---------- */
function iniciar(){ carregar(); ligarEventos(); render(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
