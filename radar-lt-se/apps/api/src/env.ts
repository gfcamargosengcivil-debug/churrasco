/**
 * Carrega variáveis de `.env` do diretório de execução, se existir (credenciais ficam fora do
 * repositório: `.env` é ignorado pelo git). Variáveis já definidas no ambiente prevalecem.
 * Importar antes de qualquer outro módulo nos pontos de entrada.
 */
import { existsSync } from 'node:fs';

const arquivo = process.env.ARQUIVO_ENV ?? '.env';
if (existsSync(arquivo)) process.loadEnvFile(arquivo);
