/**
 * Cliente HTTP do dashboard para a API do Klaus (`/api/*`).
 *
 * O dashboard é servido pelo próprio backend (mesma origem), então as
 * chamadas usam caminhos relativos — sem URL externa nem chave de API no
 * navegador. Em dev, o Vite faz proxy de `/api` para o backend local.
 */
import type {
  AtualizarConfiguracaoInput,
  ConfiguracaoCarregada,
  ConsultaLeadsInput,
  EnviarMensagemInput,
  IniciarProspeccaoInput,
  LeadReal,
  MensagemReal,
  PaginaDeLeads,
} from "./klaus-types";

async function klausFetch<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(caminho, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    // Formato preservado: `statusDoErro` em utils.ts extrai o status daqui.
    throw new Error(`Klaus API respondeu ${resposta.status} em ${caminho}: ${corpo}`);
  }

  return (await resposta.json()) as T;
}

export async function listarLeads(
  opts: { data?: ConsultaLeadsInput } = {},
): Promise<PaginaDeLeads> {
  const data = opts.data ?? {};
  const params = new URLSearchParams();

  if (data.estagio !== undefined) params.set("estagio", data.estagio);
  if (data.pagina !== undefined) params.set("pagina", String(data.pagina));
  if (data.limite !== undefined) params.set("limite", String(data.limite));

  const query = params.toString();

  return klausFetch<PaginaDeLeads>(`/api/leads${query.length > 0 ? `?${query}` : ""}`);
}

export async function buscarLead(opts: { data: string }): Promise<LeadReal> {
  return klausFetch<LeadReal>(`/api/leads/${opts.data}`);
}

export async function listarMensagens(opts: {
  data: string;
}): Promise<{ mensagens: MensagemReal[] }> {
  return klausFetch<{ mensagens: MensagemReal[] }>(`/api/leads/${opts.data}/mensagens`);
}

export async function definirControleManual(opts: {
  data: { id: string; ativo: boolean };
}): Promise<{ id: string; controle_manual: boolean }> {
  return klausFetch<{ id: string; controle_manual: boolean }>(
    `/api/leads/${opts.data.id}/controle-manual`,
    { method: "POST", body: JSON.stringify({ ativo: opts.data.ativo }) },
  );
}

export async function enviarMensagem(opts: { data: EnviarMensagemInput }): Promise<MensagemReal> {
  return klausFetch<MensagemReal>(`/api/leads/${opts.data.id}/mensagens`, {
    method: "POST",
    body: JSON.stringify({ conteudo: opts.data.conteudo }),
  });
}

export async function buscarConfiguracao(): Promise<ConfiguracaoCarregada> {
  return klausFetch<ConfiguracaoCarregada>("/api/config");
}

export async function atualizarConfiguracao(opts: {
  data: AtualizarConfiguracaoInput;
}): Promise<ConfiguracaoCarregada> {
  return klausFetch<ConfiguracaoCarregada>("/api/config", {
    method: "PUT",
    body: JSON.stringify(opts.data),
  });
}

/**
 * Converte a fila da tela de Prospecção para o contrato real do backend
 * (`targets[{phone, message}]`), aplicando a variável `{{nome}}` por contato.
 */
export async function iniciarProspeccao(opts: {
  data: Omit<IniciarProspeccaoInput, "clienteId">;
}): Promise<{ queued_count: number; results: unknown[] }> {
  const { mensagem, itens } = opts.data;

  const targets = itens.map((item) => ({
    phone: item.telefone.replace(/\D/g, ""),
    message: mensagem.replaceAll("{{nome}}", item.nome.split(" ")[0] ?? item.nome),
  }));

  return klausFetch<{ queued_count: number; results: unknown[] }>(
    "/api/prospeccao/manual-disparos",
    { method: "POST", body: JSON.stringify({ targets }) },
  );
}
