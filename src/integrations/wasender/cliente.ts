export interface ResultadoEnvio {
  waMessageId: string | null;
}

export interface EnviadorWhatsApp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
}

export class EnvioWhatsAppError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EnvioWhatsAppError';
    this.status = status;
  }
}

export const BASE_URL_PADRAO = 'https://wasenderapi.com/api';

export interface OpcoesClienteWaSender {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Cliente de envio do WaSender.
 *
 * O token nunca é registrado em log e erros de rede/HTTP são propagados: um
 * envio que falhou em silêncio é indistinguível de um envio bem-sucedido, e foi
 * assim que o V1 perdeu mensagens.
 */
export class ClienteWaSender implements EnviadorWhatsApp {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opcoes: OpcoesClienteWaSender) {
    this.apiKey = opcoes.apiKey;
    this.baseUrl = opcoes.baseUrl ?? BASE_URL_PADRAO;
    this.fetchImpl = opcoes.fetchImpl ?? fetch;
  }

  async enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio> {
    let resposta: Response;

    try {
      resposta = await this.fetchImpl(`${this.baseUrl}/send-message`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ to: telefone, text: texto }),
      });
    } catch (error) {
      throw new EnvioWhatsAppError('Falha de rede ao enviar mensagem.', null, { cause: error });
    }

    if (!resposta.ok) {
      throw new EnvioWhatsAppError(
        `WaSender respondeu ${resposta.status}.`,
        resposta.status,
      );
    }

    const corpo = (await resposta.json()) as { data?: { msgId?: string } };

    return { waMessageId: corpo.data?.msgId ?? null };
  }
}
