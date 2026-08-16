import {
  carregarFollowupConfig,
  carregarModelosAtivos,
  dentroDaJanelaDeEnvio,
  listarLeads,
  registrarMensagem,
  selecionarProximoModelo,
} from '../../infra/persistencia/index.js';
import type { FollowupConfig, Lead, PersistenciaDependencies } from '../../infra/persistencia/index.js';
import { ConflitoUnicoError } from '../../infra/persistencia/errors.js';
import type { TravaDistribuida } from '../../infra/resiliencia/trava-distribuida.js';

export const TABELA_FOLLOWUP_ENVIOS = 'followup_envios';
export const NOME_TRAVA = 'followup';
export const TTL_TRAVA_SEGUNDOS = 120;
export const LIMITE_LEADS_POR_CICLO = 100;

const HORAS_POR_DIA = 24;

/** Estágios em que follow-up automático não faz sentido. */
const ESTAGIOS_SEM_FOLLOWUP = new Set(['encerrado', 'handoff']);

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface DependenciasFollowup {
  persistencia: PersistenciaDependencies;
  trava: TravaDistribuida;
  enviar: (telefone: string, texto: string) => Promise<void>;
  agora?: () => Date;
  logger?: Logger;
}

export interface ResultadoCiclo {
  executou: boolean;
  motivo?: string;
  enviados: number;
  avaliados: number;
}

type LeadCompleto = Lead & { estagio?: string; opt_out?: boolean };

/**
 * Regras que o playbook exige e que o V1 não aplicava.
 *
 * Controle manual e opt-out são travas absolutas: mandar follow-up para quem
 * pediu para parar não é só ruim de produto, é problema de compliance.
 */
export function podeReceberFollowup(lead: LeadCompleto): boolean {
  if (lead.controle_manual || lead.opt_out === true) {
    return false;
  }

  if (lead.estagio !== undefined && ESTAGIOS_SEM_FOLLOWUP.has(lead.estagio)) {
    return false;
  }

  return lead.ultima_interacao !== null && lead.ultima_interacao !== undefined;
}

export function intervaloCumprido(
  lead: LeadCompleto,
  config: FollowupConfig,
  agora: Date,
): boolean {
  if (lead.ultima_interacao === null || lead.ultima_interacao === undefined) {
    return false;
  }

  const horas = (agora.getTime() - new Date(lead.ultima_interacao).getTime()) / (1000 * 60 * 60);

  return horas >= config.intervalo_dias * HORAS_POR_DIA;
}

/**
 * Executa um ciclo de follow-up.
 *
 * A ordem é deliberada: reserva o envio no banco ANTES de mandar a mensagem.
 * Se a reserva falhar por conflito, outro ciclo já cuidou daquele lead. Se o
 * envio falhar depois da reserva, o follow-up é perdido — e isso é melhor que
 * o risco oposto, mandar a mesma mensagem duas vezes para o lead.
 */
export async function executarCicloFollowup(
  deps: DependenciasFollowup,
): Promise<ResultadoCiclo> {
  const agora = (deps.agora ?? (() => new Date()))();

  if (!(await deps.trava.adquirir(NOME_TRAVA, TTL_TRAVA_SEGUNDOS))) {
    return { executou: false, motivo: 'Outro ciclo em andamento.', enviados: 0, avaliados: 0 };
  }

  try {
    const config = await carregarFollowupConfig(deps.persistencia);

    if (!dentroDaJanelaDeEnvio(config, agora)) {
      return { executou: false, motivo: 'Fora da janela de envio.', enviados: 0, avaliados: 0 };
    }

    const modelos = await carregarModelosAtivos(deps.persistencia);

    if (modelos.length === 0) {
      return { executou: true, motivo: 'Sem modelos ativos.', enviados: 0, avaliados: 0 };
    }

    const { leads } = await listarLeads(deps.persistencia, { limite: LIMITE_LEADS_POR_CICLO });
    let enviados = 0;
    let avaliados = 0;

    for (const lead of leads as LeadCompleto[]) {
      avaliados += 1;

      if (!podeReceberFollowup(lead) || !intervaloCumprido(lead, config, agora)) {
        continue;
      }

      const jaEnviados = await deps.persistencia.cliente.contar(TABELA_FOLLOWUP_ENVIOS, {
        lead_id: lead.id,
      });

      const modelo = selecionarProximoModelo(modelos, jaEnviados, config);

      if (modelo === null) {
        continue;
      }

      const ordem = jaEnviados + 1;

      try {
        await deps.persistencia.cliente.inserirUm(TABELA_FOLLOWUP_ENVIOS, {
          lead_id: lead.id,
          ordem,
          enviado_em: agora.toISOString(),
        });
      } catch (erro) {
        if (erro instanceof ConflitoUnicoError) {
          continue;
        }

        throw erro;
      }

      try {
        await deps.enviar(lead.telefone, modelo.mensagem);
        await registrarMensagem(
          { ...deps.persistencia, agora: deps.agora, logger: deps.logger },
          {
            telefone: lead.telefone,
            direcao: 'saida',
            conteudo: modelo.mensagem,
          },
        );

        enviados += 1;
      } catch (erro) {
        deps.logger?.error('Falha ao enviar follow-up.', {
          leadId: lead.id,
          ordem,
          erro: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }

    return { executou: true, enviados, avaliados };
  } finally {
    await deps.trava.liberar(NOME_TRAVA);
  }
}
