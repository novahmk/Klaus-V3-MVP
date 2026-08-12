/**
 * Validação de ambiente com fail fast.
 *
 * O V1 subia com variáveis faltando ou dessincronizadas entre os dois serviços
 * Railway e só falhava depois, em runtime, dentro de um try/catch silencioso.
 * Aqui o processo morre no boot com a lista completa do que está errado.
 */

const TAMANHO_MINIMO_CHAVE = 16;

export interface Ambiente {
  supabaseUrl: string;
  supabaseServiceKey: string;
  internalApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  wasenderApiKey: string;
  wasenderWebhookSecret: string;
  redisUrl: string | null;
  port: number;
  nodeEnv: string;
}

export class AmbienteInvalidoError extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(`Ambiente inválido:\n${problemas.map((item) => `- ${item}`).join('\n')}`);
    this.name = 'AmbienteInvalidoError';
    this.problemas = problemas;
  }
}

type Fonte = Record<string, string | undefined>;

function lerObrigatoria(fonte: Fonte, nome: string, problemas: string[]): string {
  const valor = fonte[nome]?.trim() ?? '';

  if (valor.length === 0) {
    problemas.push(`${nome} não definida`);
  }

  return valor;
}

function validarChave(nome: string, valor: string, problemas: string[]): void {
  if (valor.length > 0 && valor.length < TAMANHO_MINIMO_CHAVE) {
    problemas.push(`${nome} tem menos de ${TAMANHO_MINIMO_CHAVE} caracteres`);
  }
}

function validarUrl(nome: string, valor: string, problemas: string[]): void {
  if (valor.length === 0) {
    return;
  }

  try {
    const url = new URL(valor);

    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      problemas.push(`${nome} deve usar https`);
    }
  } catch {
    problemas.push(`${nome} não é uma URL válida`);
  }
}

function lerPorta(fonte: Fonte, problemas: string[]): number {
  const bruto = fonte['PORT']?.trim();

  if (bruto === undefined || bruto.length === 0) {
    return 3000;
  }

  const porta = Number(bruto);

  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
    problemas.push(`PORT inválida: "${bruto}"`);
    return 3000;
  }

  return porta;
}

export function carregarAmbiente(fonte: Fonte = process.env): Ambiente {
  const problemas: string[] = [];

  const supabaseUrl = lerObrigatoria(fonte, 'SUPABASE_URL', problemas);
  const supabaseServiceKey = lerObrigatoria(fonte, 'SUPABASE_SERVICE_KEY', problemas);
  const internalApiKey = lerObrigatoria(fonte, 'INTERNAL_API_KEY', problemas);
  const openaiApiKey = lerObrigatoria(fonte, 'OPENAI_API_KEY', problemas);
  const wasenderApiKey = lerObrigatoria(fonte, 'WASENDER_API_KEY', problemas);
  // Sem segredo, o webhook fica aberto e qualquer um injeta mensagem no sistema.
  const wasenderWebhookSecret = lerObrigatoria(fonte, 'WASENDER_WEBHOOK_SECRET', problemas);

  validarUrl('SUPABASE_URL', supabaseUrl, problemas);
  validarChave('SUPABASE_SERVICE_KEY', supabaseServiceKey, problemas);
  validarChave('INTERNAL_API_KEY', internalApiKey, problemas);
  validarChave('WASENDER_WEBHOOK_SECRET', wasenderWebhookSecret, problemas);

  const port = lerPorta(fonte, problemas);
  const redisUrl = fonte['REDIS_URL']?.trim() ?? '';

  if (problemas.length > 0) {
    throw new AmbienteInvalidoError(problemas);
  }

  return {
    supabaseUrl,
    supabaseServiceKey,
    internalApiKey,
    openaiApiKey,
    openaiModel: fonte['OPENAI_MODEL']?.trim() || 'gpt-4o-mini',
    wasenderApiKey,
    wasenderWebhookSecret,
    redisUrl: redisUrl.length > 0 ? redisUrl : null,
    port,
    nodeEnv: fonte['NODE_ENV']?.trim() || 'development',
  };
}
