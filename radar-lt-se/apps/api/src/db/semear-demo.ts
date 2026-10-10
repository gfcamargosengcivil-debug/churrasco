/** Carrega os dados DEMONSTRATIVOS FICTÍCIOS na base configurada (memória ou PostgreSQL). */
import pino from 'pino';
import { criarRepositorio } from '../app.js';
import { carregarConfig } from '../config.js';
import { Servicos } from '../servicos/dominio.js';

const amb = { ...carregarConfig(), DEMO_AUTOCARGA: false };
const log = pino({ name: 'semear-demo' });
const { repo, fila } = await criarRepositorio(amb);
const s = new Servicos(repo, fila, amb, log as never);
await s.inicializar();
const r = await s.carregarDemo('cli');
console.log(`Dados demonstrativos FICTÍCIOS carregados: ${r.empreendimentos} empreendimentos, ${r.organizacoes} organizações.`);
await repo.fechar();
