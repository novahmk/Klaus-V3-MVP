import { REGRAS_CONVERSA_PADRAO, TABELA_REGRAS_CONVERSA } from './constants.js';
import { PersistenciaError } from './errors.js';
import type { PersistenciaDependencies, RegrasConversa } from './types.js';

function normalizarLista(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  return valor
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Lê o singleton `regras_conversa` que o dashboard já edita. A tabela
 * `cfg_regras_conversa` não existe no banco — enquanto o agente a consultava,
 * a tela "Regras da conversa" não influenciava comportamento nenhum.
 */
export async function carregarRegrasConversa(
  deps: PersistenciaDependencies,
): Promise<RegrasConversa> {
  let registro: Record<string, unknown> | null;

  try {
    registro = await deps.cliente.selecionarUm<Record<string, unknown>>(
      TABELA_REGRAS_CONVERSA,
      {},
    );
  } catch (error) {
    throw new PersistenciaError('Falha ao carregar regras da conversa.', TABELA_REGRAS_CONVERSA, {
      cause: error,
    });
  }

  if (registro === null) {
    return {
      nao_prometer: [...REGRAS_CONVERSA_PADRAO.nao_prometer],
      sempre_confirmar: [...REGRAS_CONVERSA_PADRAO.sempre_confirmar],
      escalar_humano_quando: [...REGRAS_CONVERSA_PADRAO.escalar_humano_quando],
    };
  }

  return {
    nao_prometer: normalizarLista(registro['nao_prometer']),
    sempre_confirmar: normalizarLista(registro['sempre_confirmar']),
    escalar_humano_quando: normalizarLista(registro['escalar_humano_quando']),
  };
}

/**
 * Converte as regras em instruções de prompt para o agente. É o ponto em que a
 * configuração do dashboard vira comportamento real.
 */
export function formatarRegrasParaPrompt(regras: RegrasConversa): string {
  const blocos: string[] = [];

  if (regras.nao_prometer.length > 0) {
    blocos.push(`Nunca prometa: ${regras.nao_prometer.join('; ')}.`);
  }

  if (regras.sempre_confirmar.length > 0) {
    blocos.push(`Sempre confirme antes de avançar: ${regras.sempre_confirmar.join('; ')}.`);
  }

  if (regras.escalar_humano_quando.length > 0) {
    blocos.push(`Escale para um humano quando: ${regras.escalar_humano_quando.join('; ')}.`);
  }

  return blocos.join('\n');
}

export function deveEscalarParaHumano(regras: RegrasConversa, mensagem: string): boolean {
  const texto = mensagem.toLowerCase();

  return regras.escalar_humano_quando.some((gatilho) => texto.includes(gatilho.toLowerCase()));
}
