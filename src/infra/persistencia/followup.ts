import {
  DIA_DOMINGO,
  DIA_SABADO,
  FOLLOWUP_CONFIG_PADRAO,
  MINUTOS_POR_HORA,
  TABELA_FOLLOWUP_CONFIG,
  TABELA_FOLLOWUP_MODELOS,
} from './constants.js';
import { PersistenciaError, ValidacaoPersistenciaError } from './errors.js';
import type { FollowupConfig, FollowupModelo, PersistenciaDependencies } from './types.js';

/**
 * Converte um TIME do Postgres ("09:00:00") em minutos desde a meia-noite.
 * O schema antigo tratava horários como INT, o que nunca casou com o banco.
 */
export function converterHorarioEmMinutos(horario: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(horario.trim());

  if (match === null) {
    throw new ValidacaoPersistenciaError(
      `Horário inválido: "${horario}". Formato esperado HH:MM ou HH:MM:SS.`,
    );
  }

  const horas = Number(match[1]);
  const minutos = Number(match[2]);

  if (horas > 23 || minutos > 59) {
    throw new ValidacaoPersistenciaError(`Horário fora do intervalo válido: "${horario}".`);
  }

  return horas * MINUTOS_POR_HORA + minutos;
}

/**
 * `followup_config` é singleton no banco real — não há filtro por `cliente_id`.
 */
export async function carregarFollowupConfig(
  deps: PersistenciaDependencies,
): Promise<FollowupConfig> {
  let registro: FollowupConfig | null;

  try {
    registro = await deps.cliente.selecionarUm<FollowupConfig>(TABELA_FOLLOWUP_CONFIG, {});
  } catch (error) {
    throw new PersistenciaError(
      'Falha ao carregar configuração de follow-up.',
      TABELA_FOLLOWUP_CONFIG,
      { cause: error },
    );
  }

  return registro ?? { ...FOLLOWUP_CONFIG_PADRAO };
}

export async function carregarModelosAtivos(
  deps: PersistenciaDependencies,
): Promise<FollowupModelo[]> {
  try {
    return await deps.cliente.selecionarTodos<FollowupModelo>(
      TABELA_FOLLOWUP_MODELOS,
      { ativo: true },
      { ordenacao: { coluna: 'ordem', ascendente: true } },
    );
  } catch (error) {
    throw new PersistenciaError(
      'Falha ao carregar modelos de follow-up.',
      TABELA_FOLLOWUP_MODELOS,
      { cause: error },
    );
  }
}

/**
 * Avalia a janela de envio usando o horário local do processo.
 */
export function dentroDaJanelaDeEnvio(config: FollowupConfig, referencia: Date): boolean {
  const diaDaSemana = referencia.getDay();

  if (
    config.parar_aos_fins_de_semana &&
    (diaDaSemana === DIA_SABADO || diaDaSemana === DIA_DOMINGO)
  ) {
    return false;
  }

  const minutoAtual = referencia.getHours() * MINUTOS_POR_HORA + referencia.getMinutes();
  const inicio = converterHorarioEmMinutos(config.horario_inicio);
  const fim = converterHorarioEmMinutos(config.horario_fim);

  return minutoAtual >= inicio && minutoAtual <= fim;
}

export function selecionarProximoModelo(
  modelos: FollowupModelo[],
  followupsEnviados: number,
  config: FollowupConfig,
): FollowupModelo | null {
  if (followupsEnviados >= config.max_followups) {
    return null;
  }

  return modelos[followupsEnviados] ?? null;
}
