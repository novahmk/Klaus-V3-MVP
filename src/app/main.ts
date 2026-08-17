import { DetectorIntencao } from '../components/1-deteccao-intencao/index.js';
import { processarMensagem } from '../components/7-orquestracao/index.js';
import { executarCicloFollowup } from '../dominio/followup/agendador.js';
import { iniciar } from '../infra/boot/boot.js';
import { carregarAmbiente } from '../infra/config/ambiente.js';
import { criarClientes } from '../infra/database/cliente-supabase.js';
import { TravaDistribuidaSupabase } from '../infra/database/trava-supabase.js';
import { FilaMemoria } from '../infra/filas/fila-memoria.js';
import { Trabalhador } from '../infra/filas/trabalhador.js';
import { TravaPorChave } from '../infra/resiliencia/travas.js';
import { comTimeout } from '../infra/resiliencia/timeout.js';
import { ClienteWaSender } from '../integrations/wasender/index.js';
import type { MensagemRecebida } from '../integrations/wasender/index.js';
import { ProvedorConfiguracaoSupabase } from './adaptadores/configuracao.js';
import { AdaptadorDetectorIntencao } from './adaptadores/detector-intencao.js';
import {
  AdaptadorGeradorResposta,
  ClienteIARespostaOpenAI,
} from './adaptadores/gerador-resposta.js';
import { criarServidor } from './servidor.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Tempo máximo para drenar conexões antes de encerrar o processo. */
const TIMEOUT_ENCERRAMENTO_MS = 10_000;
const TIMEOUT_ENVIO_MS = 15_000;
const INTERVALO_FOLLOWUP_MS = 15 * 60 * 1000;

/**
 * Composition root: é o único lugar que conhece implementações concretas.
 * Todo o resto do sistema fala com portas.
 */
async function main(): Promise<void> {
  const ambiente = carregarAmbiente();
  const {
    client: clienteSupabase,
    cliente,
    leitorSchema,
  } = criarClientes(ambiente.supabaseUrl, ambiente.supabaseServiceKey);

  // Ambiente válido e schema compatível antes de aceitar qualquer tráfego.
  await iniciar({ cliente, leitorSchema });

  const persistencia = { cliente };
  const whatsapp = new ClienteWaSender({ apiKey: ambiente.wasenderApiKey });

  const orquestrador = {
    persistencia,
    detector: new AdaptadorDetectorIntencao(
      new DetectorIntencao({
        openaiApiKey: ambiente.openaiApiKey,
        openaiModel: ambiente.openaiModel,
        ...(ambiente.redisUrl === null ? { cacheEnabled: false } : { redisUrl: ambiente.redisUrl }),
      }),
    ),
    gerador: new AdaptadorGeradorResposta(
      new ClienteIARespostaOpenAI(ambiente.openaiApiKey, ambiente.openaiModel),
    ),
    configuracao: new ProvedorConfiguracaoSupabase(persistencia),
    enviar: async (telefone: string, texto: string): Promise<void> => {
      await comTimeout(whatsapp.enviarTexto(telefone, texto), TIMEOUT_ENVIO_MS, 'Envio WhatsApp');
    },
  };

  // Uma conversa por vez por lead: duas mensagens simultâneas do mesmo número
  // gerariam duas respostas e disputariam a atualização do estágio.
  const trava = new TravaPorChave();
  const fila = new FilaMemoria<MensagemRecebida>();

  const trabalhador = new Trabalhador<MensagemRecebida>(fila, async (mensagem) => {
    try {
      await trava.executar(mensagem.telefone, async () => {
        const resultado = await processarMensagem(orquestrador, {
          telefone: mensagem.telefone,
          texto: mensagem.texto.length > 0 ? mensagem.texto : `[${mensagem.tipo}]`,
          nome: mensagem.nome,
          waMessageId: mensagem.waMessageId,
        });

        if (!resultado.respondeu) {
          app.log.info(
            {
              waMessageId: mensagem.waMessageId,
              estagio: resultado.estagio,
              motivo: resultado.motivo,
            },
            'Mensagem processada sem resposta.',
          );
        }
      });
    } catch (erro) {
      app.log.error(
        { err: erro, waMessageId: mensagem.waMessageId },
        'Processamento da mensagem falhou.',
      );
      throw erro;
    }
  });

  // Build da SPA do dashboard (gerado por `npm run build`); ausente em dev
  // do backend puro, e nesse caso a raiz volta a ser o liveness JSON.
  const raizDashboard = resolve(process.cwd(), 'dashboard', 'dist');

  const app = criarServidor({
    cliente,
    leitorSchema,
    logger: true,
    ...(existsSync(raizDashboard) ? { dashboard: { raiz: raizDashboard } } : {}),
    webhook: {
      segredo: ambiente.wasenderWebhookSecret,
      enfileirar: (mensagem) => {
        fila.enfileirar(mensagem);
        trabalhador.notificar();
        app.log.info(
          { telefone: mensagem.telefone, waMessageId: mensagem.waMessageId },
          'Mensagem enfileirada para processamento.',
        );
      },
      aoIgnorar: (motivo) =>
        app.log.warn({ motivo, timestamp: new Date().toISOString() }, 'Webhook ignorado com motivo.'),
    },
    api: {
      chaveInterna: ambiente.internalApiKey,
      persistencia,
      configuracao: orquestrador.configuracao,
      enviar: orquestrador.enviar,
    },
  });

  // 0.0.0.0 é obrigatório no Railway: localhost não recebe tráfego externo.
  await app.listen({ port: ambiente.port, host: '0.0.0.0' });

  // Ciclo de follow-up. A trava impede disparo duplicado caso um dia rode
  // com mais de uma instância.
  const travaFollowup = new TravaDistribuidaSupabase(clienteSupabase, `${process.pid}`);
  const cicloFollowup = setInterval(() => {
    void executarCicloFollowup({
      persistencia,
      trava: travaFollowup,
      enviar: orquestrador.enviar,
      logger: app.log,
    }).catch((erro: unknown) => {
      app.log.error({ erro: erro instanceof Error ? erro.message : String(erro) }, 'Ciclo de follow-up falhou.');
    });
  }, INTERVALO_FOLLOWUP_MS);

  let encerrando = false;

  const encerrar = (sinal: string): void => {
    if (encerrando) {
      return;
    }

    encerrando = true;
    clearInterval(cicloFollowup);
    app.log.info({ sinal }, 'Encerrando servidor.');

    const forcar = setTimeout(() => process.exit(1), TIMEOUT_ENCERRAMENTO_MS);

    app
      .close()
      // Drena o que já foi aceito antes de sair: a mensagem já está no banco,
      // mas o processamento pendente não pode ser jogado fora em silêncio.
      .then(() => trabalhador.aguardar())
      .then(() => {
        clearTimeout(forcar);
        process.exit(0);
      })
      .catch(() => {
        clearTimeout(forcar);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

main().catch((erro: unknown) => {
  // Falha de boot precisa ser barulhenta: subir quebrado é pior que não subir.
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
