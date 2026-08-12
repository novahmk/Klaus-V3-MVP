import {
  DESCRICAO_CAMADAS,
  ORIGEM_TEMPLATE,
  TEMPLATES_FALLBACK,
} from './constants.js';
import type { CamadaPergunta, GeradorPerguntasInput, RespostaGptPergunta } from './types.js';
import {
  ValidacaoGeradorPerguntasError,
  interpolarTemplate,
  validarPergunta,
} from './validators.js';

const CONTEXTO_ESPERADO_POR_CAMADA: Record<CamadaPergunta, string> = {
  1: 'Entender necessidade, dor ou objetivo principal do lead.',
  2: 'Identificar objeções, dúvidas ou barreiras à decisão.',
  3: 'Confirmar prontidão e validar o próximo passo comercial.',
};

export function gerarPerguntaPorTemplate(
  input: GeradorPerguntasInput,
  camada: CamadaPergunta,
): RespostaGptPergunta {
  const templates = TEMPLATES_FALLBACK[camada];
  const erros: string[] = [];

  for (const template of templates) {
    const pergunta = interpolarTemplate(template, input.tema);

    try {
      validarPergunta(pergunta, input.perguntasJaFeitas);

      return {
        pergunta,
        contextoEsperado: CONTEXTO_ESPERADO_POR_CAMADA[camada],
      };
    } catch (error) {
      erros.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new ValidacaoGeradorPerguntasError(
    `Nenhum template válido encontrado para camada ${camada}: ${DESCRICAO_CAMADAS[camada]}. Erros: ${erros.join('; ')}`,
  );
}

export { ORIGEM_TEMPLATE };
