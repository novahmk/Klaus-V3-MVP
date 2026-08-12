import { Intencao, type ResultadoFallback } from './types.js';
import { mensagemEstaVazia, normalizarMensagem } from './validator.js';

interface RegraPalavraChave {
  intencao: Intencao;
  palavras: readonly string[];
  confianca: number;
}

const REGRAS: readonly RegraPalavraChave[] = [
  {
    intencao: Intencao.QUER_AGENDAR,
    confianca: 0.82,
    palavras: [
      'agendar',
      'agenda',
      'marcar',
      'marca',
      'reunião',
      'reuniao',
      'call',
      'demo',
      'demonstração',
      'demonstracao',
      'visita',
      'horário',
      'horario',
      'disponibilidade',
      'quando podemos conversar',
      'podemos marcar',
    ],
  },
  {
    intencao: Intencao.NAO_INTERESSADO,
    confianca: 0.88,
    palavras: [
      'não tenho interesse',
      'nao tenho interesse',
      'sem interesse',
      'não quero',
      'nao quero',
      'pare de me mandar',
      'não me contacte',
      'nao me contacte',
      'remove meu contato',
      'remova meu contato',
      'não preciso',
      'nao preciso',
      'desisto',
      'cancela',
    ],
  },
  {
    intencao: Intencao.TEM_OBJECAO,
    confianca: 0.8,
    palavras: [
      'caro',
      'caro demais',
      'muito caro',
      'não tenho budget',
      'nao tenho budget',
      'sem budget',
      'não tenho verba',
      'nao tenho verba',
      'não confio',
      'nao confio',
      'dúvida',
      'duvida',
      'preocupação',
      'preocupacao',
      'objeção',
      'objecao',
      'já uso outro',
      'ja uso outro',
      'concorrente',
      'não é prioridade',
      'nao e prioridade',
      'não é o momento',
      'nao e o momento',
    ],
  },
  {
    intencao: Intencao.QUER_MAIS_INFO,
    confianca: 0.78,
    palavras: [
      'quanto custa',
      'qual o preço',
      'qual o preco',
      'preço',
      'preco',
      'valor',
      'como funciona',
      'me explica',
      'mais informações',
      'mais informacoes',
      'detalhes',
      'funcionalidades',
      'o que inclui',
      'planos',
      'condições',
      'condicoes',
    ],
  },
  {
    intencao: Intencao.DEMONSTRA_INTERESSE,
    confianca: 0.72,
    palavras: [
      'interessante',
      'me interessa',
      'gostei',
      'parece bom',
      'faz sentido',
      'quero saber mais',
      'pode me contar',
      'top',
      'legal',
      'show',
      'bacana',
      'curti',
    ],
  },
] as const;

function encontrarRegra(mensagemNormalizada: string): RegraPalavraChave | null {
  let melhorRegra: RegraPalavraChave | null = null;
  let maiorMatch = 0;

  for (const regra of REGRAS) {
    let matches = 0;

    for (const palavra of regra.palavras) {
      if (mensagemNormalizada.includes(palavra)) {
        matches += palavra.split(' ').length;
      }
    }

    if (matches > maiorMatch) {
      maiorMatch = matches;
      melhorRegra = regra;
    }
  }

  return melhorRegra;
}

export function detectarIntencaoPorPalavrasChave(mensagem: string): ResultadoFallback {
  if (mensagemEstaVazia(mensagem)) {
    return {
      intencao: Intencao.NAO_RESPONDEU,
      confianca: 0.95,
      motivo: 'Mensagem vazia detectada pelo fallback por palavras-chave.',
    };
  }

  const mensagemNormalizada = normalizarMensagem(mensagem);
  const regra = encontrarRegra(mensagemNormalizada);

  if (regra) {
    return {
      intencao: regra.intencao,
      confianca: regra.confianca,
      motivo: `Fallback identificou padrão compatível com ${regra.intencao}.`,
    };
  }

  return {
    intencao: Intencao.NAO_RESPONDEU,
    confianca: 0.45,
    motivo: 'Fallback não encontrou padrão claro na mensagem.',
  };
}
