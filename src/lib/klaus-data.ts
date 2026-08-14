/**
 * Dados de exemplo da Etapa 1.
 *
 * Os nomes de campo espelham o schema real do Supabase (leads, mensagens,
 * cfg_ia_persona, cfg_ia_tom_voz, regras_conversa) para que a Etapa 2 seja
 * substituição direta por leitura/escrita real, sem renomear nada.
 */

export type FaseLead =
  | "em_andamento"
  | "qualificado"
  | "finalizado"
  | "sem_resposta"
  | "follow_up";

export const FASES: { valor: FaseLead; rotulo: string }[] = [
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "qualificado", rotulo: "Qualificado" },
  { valor: "finalizado", rotulo: "Finalizado" },
  { valor: "sem_resposta", rotulo: "Sem resposta" },
  { valor: "follow_up", rotulo: "Follow-up" },
];

export function rotuloFase(fase: FaseLead) {
  return FASES.find((f) => f.valor === fase)?.rotulo ?? fase;
}

/** Tabela `leads` — a chave de negócio é o telefone; `id` é UUID. */
export type Lead = {
  id: string;
  nome: string;
  telefone: string;
  fase: FaseLead;
  controle_manual: boolean;
  ultima_mensagem: string;
  ultimo_contato_em: string;
  disparado_em: string;
};

/** Tabela `mensagens` — `lead_id` é UUID com FK para `leads.id`. */
export type Mensagem = {
  id: string;
  lead_id: string;
  direcao: "entrada" | "saida";
  conteudo: string;
  criado_em: string;
};

export const leads: Lead[] = [
  {
    id: "9f1c3a1e-0f3a-4c2b-9a10-1d1f4c2a7b01",
    nome: "Ricardo Oliveira",
    telefone: "+55 11 98765-4321",
    fase: "em_andamento",
    controle_manual: false,
    ultima_mensagem: "Nosso problema é que os SDRs perdem tempo com leads frios.",
    ultimo_contato_em: "há 4 min",
    disparado_em: "Hoje, 14:32",
  },
  {
    id: "3b6d2c88-52a1-4f77-8c14-27b0f1c9de02",
    nome: "Ana Paula Silva",
    telefone: "+55 21 91234-5678",
    fase: "qualificado",
    controle_manual: true,
    ultima_mensagem: "Pode me chamar amanhã às 10h para a demo.",
    ultimo_contato_em: "há 22 min",
    disparado_em: "Hoje, 11:07",
  },
  {
    id: "c4e1f0a9-77bb-4a3e-9d55-6a2e5f9b1c03",
    nome: "Marcos Mendes",
    telefone: "+55 31 99887-7665",
    fase: "follow_up",
    controle_manual: false,
    ultima_mensagem: "Klaus reenviou a abordagem — 2º follow-up.",
    ultimo_contato_em: "há 6 h",
    disparado_em: "Ontem, 16:45",
  },
  {
    id: "7d9a5b21-3ec4-4d18-b7a6-9f0c8d3e2a04",
    nome: "Juliana Prado",
    telefone: "+55 47 98123-4400",
    fase: "sem_resposta",
    controle_manual: false,
    ultima_mensagem: "Sem resposta após 3 tentativas.",
    ultimo_contato_em: "há 2 dias",
    disparado_em: "Segunda, 09:12",
  },
  {
    id: "1a2b3c4d-5e6f-4071-8a92-b3c4d5e6f705",
    nome: "Eduardo Lima",
    telefone: "+55 11 97444-1188",
    fase: "finalizado",
    controle_manual: true,
    ultima_mensagem: "Passado para o vendedor Bruno.",
    ultimo_contato_em: "há 1 dia",
    disparado_em: "Terça, 10:40",
  },
  {
    id: "8e7d6c5b-4a39-4281-9f0e-2d1c3b4a5906",
    nome: "Camila Rocha",
    telefone: "+55 85 99555-2211",
    fase: "em_andamento",
    controle_manual: false,
    ultima_mensagem: "Interessante. Como funciona a cobrança?",
    ultimo_contato_em: "há 12 min",
    disparado_em: "Hoje, 13:58",
  },
];

export const mensagensPorLead: Record<string, Mensagem[]> = {
  "9f1c3a1e-0f3a-4c2b-9a10-1d1f4c2a7b01": [
    {
      id: "m1",
      lead_id: "9f1c3a1e-0f3a-4c2b-9a10-1d1f4c2a7b01",
      direcao: "saida",
      conteudo:
        "Olá, Ricardo! Aqui é o Klaus. Vi que você está buscando escalar seu time de vendas e queria entender se hoje o gargalo é na prospecção ou no fechamento.",
      criado_em: "14:32",
    },
    {
      id: "m2",
      lead_id: "9f1c3a1e-0f3a-4c2b-9a10-1d1f4c2a7b01",
      direcao: "entrada",
      conteudo:
        "Oi Klaus, legal o contato. Nosso problema é que os SDRs perdem muito tempo com leads frios.",
      criado_em: "14:35",
    },
    {
      id: "m3",
      lead_id: "9f1c3a1e-0f3a-4c2b-9a10-1d1f4c2a7b01",
      direcao: "saida",
      conteudo:
        "Entendo perfeitamente. O que eu faço é justamente filtrar esses leads antes de passarem para os humanos. Gostaria de ver como eu classifico um lead em tempo real?",
      criado_em: "14:36",
    },
  ],
};

export function mensagensDoLead(leadId: string): Mensagem[] {
  return (
    mensagensPorLead[leadId] ?? [
      {
        id: `${leadId}-1`,
        lead_id: leadId,
        direcao: "saida",
        conteudo:
          "Olá! Aqui é o Klaus. Queria entender rapidamente como está a sua operação de vendas hoje — posso fazer duas perguntas?",
        criado_em: "09:41",
      },
    ]
  );
}

/** Cadência da prospecção — aleatoriedade entre disparos. */
export type Cadencia = {
  intervalo_min_seg: number;
  intervalo_max_seg: number;
  tamanho_lote: number;
  pausa_entre_lotes_min: number;
  horario_inicio: string;
  horario_fim: string;
  apenas_dias_uteis: boolean;
};

export const cadenciaPadrao: Cadencia = {
  intervalo_min_seg: 30,
  intervalo_max_seg: 90,
  tamanho_lote: 20,
  pausa_entre_lotes_min: 10,
  horario_inicio: "09:00",
  horario_fim: "18:00",
  apenas_dias_uteis: true,
};

/** Contato na fila de uma nova prospecção (ainda não virou lead). */
export type ContatoFila = {
  id: string;
  nome: string;
  telefone: string;
  origem: "planilha" | "manual";
};

export const filaInicial: ContatoFila[] = [
  { id: "f1", nome: "Bruno Tavares", telefone: "+55 11 98812-3344", origem: "planilha" },
  { id: "f2", nome: "Letícia Amaral", telefone: "+55 19 99771-2020", origem: "planilha" },
  { id: "f3", nome: "Diego Fontes", telefone: "+55 41 98444-9090", origem: "manual" },
];

/** cfg_ia_persona / cfg_ia_tom_voz */
export const cfgIaPersona = {
  persona:
    "Você é o Klaus, SDR da Novah. Fala como um consultor direto e cordial, sem jargão de vendas. Faz no máximo duas perguntas por mensagem, sempre curtas, e conduz o lead até entender se há dor real de prospecção.",
};

export const cfgIaTomVoz = {
  tom_geral: "Direto, cordial e objetivo",
  tom_executivo: "Foco em resultado e tempo do decisor",
  tom_tecnico: "Explica integrações sem prometer prazos",
  tom_suporte: "Paciente, confirma o entendimento antes de seguir",
};

/** Singleton regras_conversa — somente leitura na Etapa 1. */
export const regrasConversa = {
  nao_prometer: "Nunca prometer desconto, prazo de implantação ou integração específica.",
  sempre_confirmar: "Sempre confirmar nome da empresa e o papel do lead antes de qualificar.",
  escalar_humano_quando:
    "Escalar para humano quando o lead pedir proposta, falar de contrato ou demonstrar urgência de compra.",
};

/** Modelos de mensagem usados na prospecção. */
export type ModeloMensagem = { id: string; titulo: string; mensagem: string; ativo: boolean };

export const modelosMensagem: ModeloMensagem[] = [
  {
    id: "t1",
    titulo: "Abordagem fria — B2B",
    mensagem:
      "Olá {{nome}}! Aqui é o Klaus. Vi que vocês estão escalando o time comercial e queria entender se o gargalo hoje é na prospecção ou no fechamento.",
    ativo: true,
  },
  {
    id: "t2",
    titulo: "Follow-up 1 — sem resposta",
    mensagem:
      "{{nome}}, tudo certo? Só retomando aqui — consigo te mostrar em 2 minutos como filtro leads frios antes de chegarem no seu time.",
    ativo: true,
  },
  {
    id: "t3",
    titulo: "Reengajamento — lead antigo",
    mensagem:
      "Oi {{nome}}! Faz um tempo que conversamos. A operação de prospecção de vocês mudou desde então?",
    ativo: false,
  },
];
