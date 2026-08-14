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

import { getSupabase } from "./supabase.server";
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

function clienteId(): string {
  const id = process.env["KLAUS_CLIENTE_ID"];

  if (id === undefined || id.trim().length === 0) {
    throw new Error("KLAUS_CLIENTE_ID não configurada no ambiente do dashboard.");
  }

  return id;
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

/** Rota ainda não existe no backend — ver docblock de `EnviarMensagemInput`. */
export const enviarMensagem = createServerFn({ method: "POST" })
  .validator((input: EnviarMensagemInput) => input)
  .handler(async ({ data }) =>
    klausFetch<MensagemReal>(`/api/leads/${data.id}/mensagens`, {
      method: "POST",
      body: JSON.stringify({ conteudo: data.conteudo }),
    }),
  );

export const buscarConfiguracao = createServerFn({ method: "GET" }).handler(() =>
  buscarConfiguracaoSupabase(),
);

export const atualizarConfiguracao = createServerFn({ method: "POST" })
  .validator((input: AtualizarConfiguracaoInput) => input)
  .handler(async ({ data }) => {
    const sb = getSupabase();

    const { data: configExistente } = await sb
      .from("config_ia")
      .select("id")
      .order("id")
      .limit(1)
      .maybeSingle();

    const payloadConfig: Record<string, unknown> = {};
    if (configExistente?.id) payloadConfig["id"] = configExistente.id;
    if (data.persona !== undefined) payloadConfig["persona"] = data.persona;
    if (data.objetivo !== undefined) payloadConfig["objetivo"] = data.objetivo;
    if (data.tomDeVoz !== undefined) payloadConfig["tom_de_voz"] = data.tomDeVoz;
    if (data.contexto !== undefined) payloadConfig["contexto"] = data.contexto;

    const { error: erroConfig } = await sb.from("config_ia").upsert(payloadConfig);
    if (erroConfig) throw new Error(`Supabase config_ia: ${erroConfig.message}`);

    const temRegras =
      data.nao_prometer !== undefined ||
      data.sempre_confirmar !== undefined ||
      data.escalar_humano_quando !== undefined;

    if (temRegras) {
      const { data: regrasExistentes } = await sb
        .from("regras_conversa")
        .select("id")
        .order("id")
        .limit(1)
        .maybeSingle();

      const payloadRegras: Record<string, unknown> = {};
      if (regrasExistentes?.id) payloadRegras["id"] = regrasExistentes.id;
      if (data.nao_prometer !== undefined) payloadRegras["nao_prometer"] = data.nao_prometer;
      if (data.sempre_confirmar !== undefined)
        payloadRegras["sempre_confirmar"] = data.sempre_confirmar;
      if (data.escalar_humano_quando !== undefined)
        payloadRegras["escalar_humano_quando"] = data.escalar_humano_quando;

      const { error: erroRegras } = await sb.from("regras_conversa").upsert(payloadRegras);
      if (erroRegras) throw new Error(`Supabase regras_conversa: ${erroRegras.message}`);
    }

    return buscarConfiguracaoSupabase();
  });

/** Lê config_ia + regras_conversa do Supabase e monta o formato esperado pela UI. */
async function buscarConfiguracaoSupabase(): Promise<ConfiguracaoCarregada> {
  const sb = getSupabase();

  const { data: linhaConfig, error: erroConfig } = await sb
    .from("config_ia")
    .select("persona, objetivo, tom_de_voz, contexto")
    .order("id")
    .limit(1)
    .maybeSingle();

  if (erroConfig) throw new Error(`Supabase config_ia: ${erroConfig.message}`);

  const { data: linhaRegras, error: erroRegras } = await sb
    .from("regras_conversa")
    .select("nao_prometer, sempre_confirmar, escalar_humano_quando")
    .order("id")
    .limit(1)
    .maybeSingle();

  if (erroRegras) throw new Error(`Supabase regras_conversa: ${erroRegras.message}`);

  return {
    agente: {
      persona: (linhaConfig?.["persona"] as string | null) ?? "",
      objetivo: (linhaConfig?.["objetivo"] as string | null) ?? "",
      tomDeVoz: (linhaConfig?.["tom_de_voz"] as string | null) ?? "",
      contexto: (linhaConfig?.["contexto"] as string | null) ?? "",
    },
    regras: {
      nao_prometer: (linhaRegras?.["nao_prometer"] as string[] | null) ?? [],
      sempre_confirmar: (linhaRegras?.["sempre_confirmar"] as string[] | null) ?? [],
      escalar_humano_quando: (linhaRegras?.["escalar_humano_quando"] as string[] | null) ?? [],
    },
  };
}

/** Rota ainda não existe no backend — ver docblock de `IniciarProspeccaoInput`. */
export const iniciarProspeccao = createServerFn({ method: "POST" })
  .validator((input: Omit<IniciarProspeccaoInput, "clienteId">) => input)
  .handler(async ({ data }) =>
    klausFetch<unknown>("/api/prospeccao/manual-disparos", {
      method: "POST",
      body: JSON.stringify({ ...data, clienteId: clienteId() }),
    }),
  );
