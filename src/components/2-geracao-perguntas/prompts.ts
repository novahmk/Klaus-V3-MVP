import { DESCRICAO_CAMADAS } from './constants.js';
import type { CamadaPergunta, GeradorPerguntasInput } from './types.js';

export const SYSTEM_PROMPT = `Você é o módulo de geração de perguntas do Klaus V2, um SDR conversacional orientado a conversão.

Sua tarefa é gerar UMA pergunta adaptativa para conduzir a conversa comercial.

Regras obrigatórias:
- Responda SOMENTE com JSON válido, sem markdown.
- A pergunta deve ter entre 20 e 150 caracteres.
- Deve ser uma pergunta aberta (não sim/não).
- Deve terminar com "?".
- Não use placeholders como {nome}, {{variavel}}, [campo] ou similares.
- Não repita perguntas já feitas.
- Seja natural, consultivo e orientado a descoberta.
- contextoEsperado deve descrever brevemente o que esperamos aprender com a resposta.`;

export function buildUserPrompt(
  input: GeradorPerguntasInput,
  camada: CamadaPergunta,
): string {
  const historicoFormatado =
    input.historico.length === 0
      ? 'Nenhuma mensagem anterior.'
      : input.historico
          .slice(-8)
          .map(
            (item) =>
              `[${item.role}] ${item.conteudo}${item.timestamp ? ` (${item.timestamp.toISOString()})` : ''}`,
          )
          .join('\n');

  const perguntasAnteriores =
    input.perguntasJaFeitas.length === 0
      ? 'Nenhuma pergunta feita ainda.'
      : input.perguntasJaFeitas.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const baseConhecimento =
    input.baseConhecimento === undefined || input.baseConhecimento === null
      ? 'Não informado.'
      : JSON.stringify(input.baseConhecimento, null, 2);

  return `Camada atual: ${camada}
Objetivo da camada: ${DESCRICAO_CAMADAS[camada]}

Tema: ${input.tema}
Intenção detectada: ${input.intencao}
Cliente ID: ${input.clienteId}

Histórico recente:
${historicoFormatado}

Perguntas já feitas:
${perguntasAnteriores}

Base de conhecimento:
${baseConhecimento}

Retorne JSON no formato:
{
  "pergunta": "sua pergunta aqui?",
  "contextoEsperado": "o que esperamos descobrir"
}`;
}

export const JSON_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'geracao_pergunta',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['pergunta', 'contextoEsperado'],
      properties: {
        pergunta: {
          type: 'string',
          minLength: 20,
          maxLength: 150,
        },
        contextoEsperado: {
          type: 'string',
          minLength: 5,
        },
      },
    },
  },
};
