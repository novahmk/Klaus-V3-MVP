/**
 * Cliente BFF (Backend-for-Frontend) para a API real do Klaus.
 *
 * Cada função é um `createServerFn` do TanStack Start: o corpo só executa no
 * servidor (Node) e o cliente recebe apenas um stub que faz uma chamada RPC
 * para o próprio servidor do dashboard. Isso garante que `KLAUS_API_URL` e
 * `RAILWAY_INTERNAL_API_KEY` nunca cheguem ao bundle do navegador — só o
 * processo Node que roda o dashboard conhece esses valores.
 */
import { createServerFn } from "@tanstack/react-start";

import type {
  AtualizarConfiguracaoInput,
  ConfiguracaoCarregada,
  ConsultaLeadsInput,
  LeadReal,
  MensagemReal,
  PaginaDeLeads,
} from "./klaus-types";

function baseUrl(): string {
  const url = process.env["KLAUS_API_URL"];

  if (url === undefined || url.trim().length === 0) {
    throw new Error("KLAUS_API_URL não configurada no ambiente do dashboard.");
  }

  return url.replace(/\/$/, "");
}

function apiKey(): string {
  const key = process.env["RAILWAY_INTERNAL_API_KEY"];

  if (key === undefined || key.trim().length === 0) {
    throw new Error("RAILWAY_INTERNAL_API_KEY não configurada no ambiente do dashboard.");
  }

  return key;
}

async function klausFetch<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-api-key": apiKey(),
      ...init?.headers,
    },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Klaus API respondeu ${resposta.status} em ${caminho}: ${corpo}`);
  }

  return (await resposta.json()) as T;
}

export const listarLeads = createServerFn({ method: "GET" })
  .validator((input: ConsultaLeadsInput = {}) => input)
  .handler(async ({ data }) => {
    const params = new URLSearchParams();

    if (data.estagio !== undefined) params.set("estagio", data.estagio);
    if (data.pagina !== undefined) params.set("pagina", String(data.pagina));
    if (data.limite !== undefined) params.set("limite", String(data.limite));

    const query = params.toString();

    return klausFetch<PaginaDeLeads>(`/api/leads${query.length > 0 ? `?${query}` : ""}`);
  });

export const buscarLead = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => klausFetch<LeadReal>(`/api/leads/${id}`));

export const listarMensagens = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) =>
    klausFetch<{ mensagens: MensagemReal[] }>(`/api/leads/${id}/mensagens`),
  );

export const definirControleManual = createServerFn({ method: "POST" })
  .validator((input: { id: string; ativo: boolean }) => input)
  .handler(async ({ data }) =>
    klausFetch<{ id: string; controle_manual: boolean }>(`/api/leads/${data.id}/controle-manual`, {
      method: "POST",
      body: JSON.stringify({ ativo: data.ativo }),
    }),
  );

export const buscarConfiguracao = createServerFn({ method: "GET" }).handler(async () =>
  klausFetch<ConfiguracaoCarregada>("/api/config"),
);

export const atualizarConfiguracao = createServerFn({ method: "POST" })
  .validator((input: AtualizarConfiguracaoInput) => input)
  .handler(async ({ data }) =>
    klausFetch<ConfiguracaoCarregada>("/api/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  );
