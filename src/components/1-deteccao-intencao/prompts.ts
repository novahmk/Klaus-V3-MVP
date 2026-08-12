import { DESCRICAO_INTENCOES, INTENCOES_VALIDAS } from './constants.js';
import type { ContextoDeteccao, MensagemHistorico } from './types.js';

const INTENCOES_FORMATADAS = INTENCOES_VALIDAS.map(
  (intencao) => `- ${intencao}: ${DESCRICAO_INTENCOES[intencao]}`,
).join('\n');

export const SYSTEM_PROMPT = `Você é o módulo de detecção de intenção do Klaus V2, um SDR conversacional orientado a conversão.

Sua única tarefa é classificar a intenção do lead com base na mensagem atual, no histórico e no contexto.

Intenções possíveis:
${INTENCOES_FORMATADAS}

Regras:
- Responda SOMENTE com JSON válido, sem markdown.
- Use exatamente uma das intenções listadas.
- confianca deve ser um número entre 0 e 1.
- motivo deve ser uma justificativa curta e objetiva em português.
- Priorize a intenção mais específica quando houver ambiguidade.
- Se a mensagem estiver vazia ou for irrelevante, use NAO_RESPONDEU.`;

export function buildUserPrompt(
  mensagem: string,
  historico: MensagemHistorico[],
  contexto: ContextoDeteccao,
): string {
  const historicoFormatado =
    historico.length === 0
      ? 'Nenhuma mensagem anterior.'
      : historico
          .slice(-10)
          .map(
            (item) =>
              `[${item.role}] ${item.conteudo}${item.timestamp ? ` (${item.timestamp.toISOString()})` : ''}`,
          )
          .join('\n');

  const contextoFormatado = JSON.stringify(contexto, null, 2);

  return `Mensagem atual do lead:
"${mensagem}"

Histórico recente:
${historicoFormatado}

Contexto:
${contextoFormatado}

Retorne JSON no formato:
{
  "intencao": "INTENCAO",
  "confianca": 0.0,
  "motivo": "justificativa"
}`;
}

export const JSON_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'deteccao_intencao',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['intencao', 'confianca', 'motivo'],
      properties: {
        intencao: {
          type: 'string',
          enum: [...INTENCOES_VALIDAS],
        },
        confianca: {
          type: 'number',
          minimum: 0,
          maximum: 1,
        },
        motivo: {
          type: 'string',
          minLength: 1,
        },
      },
    },
  },
};
