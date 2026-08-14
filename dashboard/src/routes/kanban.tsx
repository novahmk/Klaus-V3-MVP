import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bot, MessageSquare, Search, Send, UserCheck, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { EstagioBadge } from "@/components/estagio-badge";
import { WhatsappPreview } from "@/components/whatsapp-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  definirControleManual,
  enviarMensagem,
  listarLeads,
  listarMensagens,
} from "@/lib/klaus-api.server";
import { ESTAGIOS, type LeadReal } from "@/lib/klaus-types";
import { ultimaInteracaoRelativa, statusDoErro } from "@/lib/utils";

type Busca = { lead?: string };

/** Sem paginação na UI por ora: 200 é o limite máximo aceito pela API. */
const LIMITE_LEADS = 200;

export const Route = createFileRoute("/kanban")({
  validateSearch: (search: Record<string, unknown>): Busca =>
    typeof search["lead"] === "string" ? { lead: search["lead"] } : {},
  head: () => ({
    meta: [
      { title: "Kanban de Leads — Klaus AI" },
      {
        name: "description",
        content:
          "Acompanhe cada lead por estágio, leia a conversa completa do WhatsApp e assuma o atendimento quando quiser.",
      },
      { property: "og:title", content: "Kanban de Leads — Klaus AI" },
      {
        property: "og:description",
        content: "Estágios, conversas e transferência de atendimento da IA para o vendedor.",
      },
    ],
  }),
  component: Kanban,
});

function Kanban() {
  const { lead: leadBuscado } = Route.useSearch();
  const navigate = useNavigate({ from: "/kanban" });
  const queryClient = useQueryClient();
  const [termo, setTermo] = useState("");
  const [resposta, setResposta] = useState("");

  const leadsQuery = useQuery({
    queryKey: ["leads", { limite: LIMITE_LEADS }],
    queryFn: () => listarLeads({ data: { limite: LIMITE_LEADS } }),
  });

  const mensagensQuery = useQuery({
    queryKey: ["lead-mensagens", leadBuscado],
    queryFn: () => listarMensagens({ data: leadBuscado as string }),
    enabled: leadBuscado !== undefined,
  });

  const controleManualMutation = useMutation({
    mutationFn: definirControleManual,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => {
      const status = statusDoErro(err);
      if (status === 404) toast.error("Lead não encontrado.");
      else if (status === 401) toast.error("Sem autorização — verifique a chave de API.");
      else if (status === 503 || status === null) toast.error("Backend fora do ar.");
      else toast.error("Não foi possível atualizar o controle da conversa.");
    },
  });

  const enviarMensagemMutation = useMutation({
    mutationFn: enviarMensagem,
    onSuccess: () => {
      setResposta("");
      void queryClient.invalidateQueries({ queryKey: ["lead-mensagens", leadBuscado] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => {
      const status = statusDoErro(err);
      if (status === 404) toast.error("Envio de mensagens ainda não disponível no backend.");
      else if (status === 401) toast.error("Sem autorização — verifique a chave de API.");
      else if (status === 503 || status === null) toast.error("Backend fora do ar.");
      else toast.error("Não foi possível enviar a mensagem.");
    },
  });

  const leads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data]);

  const filtrados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return leads;
    return leads.filter(
      (l) => (l.nome ?? "").toLowerCase().includes(t) || l.telefone.replace(/\D/g, "").includes(t),
    );
  }, [termo, leads]);

  const selecionado = leads.find((l) => l.id === leadBuscado) ?? null;

  function abrir(l: LeadReal) {
    navigate({ search: { lead: l.id } });
  }

  function alternarControle(l: LeadReal) {
    const assumindo = !l.controle_manual;
    controleManualMutation.mutate(
      { data: { id: l.id, ativo: assumindo } },
      {
        onSuccess: () => {
          toast.success(
            assumindo
              ? `Você assumiu a conversa com ${l.nome ?? l.telefone}. Klaus pausado.`
              : `Klaus retomou a conversa com ${l.nome ?? l.telefone}.`,
          );
        },
      },
    );
  }

  function enviar(l: LeadReal) {
    const conteudo = resposta.trim();
    if (!conteudo) return;
    enviarMensagemMutation.mutate({ data: { id: l.id, conteudo } });
  }

  if (leadsQuery.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Não foi possível carregar os leads. Verifique se o backend está no ar.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Kanban de Leads"
        descricao="Cada lead no seu estágio, com a conversa a um clique."
        acao={
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="pl-9"
            />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:overflow-hidden lg:p-8">
        {/* Desktop: colunas kanban */}
        <div className="hidden h-full gap-4 overflow-x-auto lg:flex">
          {ESTAGIOS.map((e) => {
            const doGrupo = filtrados.filter((l) => l.estagio === e.valor);
            return (
              <div
                key={e.valor}
                className="flex w-72 shrink-0 flex-col rounded-2xl border border-border bg-surface/40"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="truncate text-sm font-semibold text-foreground">{e.rotulo}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {doGrupo.length}
                  </span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-3">
                  {doGrupo.map((l) => (
                    <CardLead key={l.id} lead={l} onAbrir={() => abrir(l)} />
                  ))}
                  {doGrupo.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      Nenhum lead neste estágio.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: lista agrupada */}
        <div className="space-y-6 lg:hidden">
          {ESTAGIOS.map((e) => {
            const doGrupo = filtrados.filter((l) => l.estagio === e.valor);
            if (doGrupo.length === 0) return null;
            return (
              <section key={e.valor} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{e.rotulo}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {doGrupo.length}
                  </span>
                </div>
                {doGrupo.map((l) => (
                  <CardLead key={l.id} lead={l} onAbrir={() => abrir(l)} />
                ))}
              </section>
            );
          })}
        </div>
      </div>

      {/* Painel da conversa */}
      {selecionado && (
        <div className="fixed inset-0 z-50 flex bg-background/80 backdrop-blur-sm">
          <button
            className="hidden flex-1 cursor-default lg:block"
            onClick={() => navigate({ search: {} })}
            aria-label="Fechar conversa"
          />
          <div className="flex h-full w-full flex-col border-l border-border bg-sidebar lg:w-[520px]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {selecionado.nome ?? selecionado.telefone}
                </h2>
                <p className="truncate text-xs text-muted-foreground">{selecionado.telefone}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => navigate({ search: {} })}
                aria-label="Fechar"
              >
                <X />
              </Button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              <WhatsappPreview
                className="h-full"
                nome={selecionado.nome ?? selecionado.telefone}
                telefone={selecionado.telefone}
                iaAtiva={!selecionado.controle_manual}
                mensagens={mensagensQuery.data?.mensagens ?? []}
              />
            </div>

            <div className="space-y-3 border-t border-border p-4">
              {selecionado.controle_manual ? (
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Escreva uma resposta..."
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar(selecionado);
                      }
                    }}
                    className="flex-1 resize-none"
                  />
                  <Button
                    size="icon"
                    className="shrink-0"
                    disabled={enviarMensagemMutation.isPending || resposta.trim().length === 0}
                    onClick={() => enviar(selecionado)}
                    aria-label="Enviar mensagem"
                  >
                    <Send />
                  </Button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Assuma a conversa para responder pelo dashboard.
                </p>
              )}
              <Button
                className="w-full"
                variant={selecionado.controle_manual ? "secondary" : "default"}
                disabled={controleManualMutation.isPending}
                onClick={() => alternarControle(selecionado)}
              >
                {selecionado.controle_manual ? (
                  <>
                    <Bot /> Devolver conversa ao Klaus
                  </>
                ) : (
                  <>
                    <UserCheck /> Assumir conversa
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CardLead({ lead, onAbrir }: { lead: LeadReal; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="w-full space-y-2 rounded-xl border border-border bg-panel p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <p className="truncate text-sm font-medium text-foreground">{lead.nome ?? lead.telefone}</p>
        <EstagioBadge estagio={lead.estagio} />
      </div>
      <p className="truncate text-xs text-muted-foreground">{lead.telefone}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {lead.ultima_mensagem ?? "Nenhuma mensagem ainda."}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquare className="size-3" />
          {ultimaInteracaoRelativa(lead.ultima_interacao)}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            lead.controle_manual
              ? "bg-fase-followup/15 text-fase-followup"
              : "bg-primary/15 text-primary"
          }`}
        >
          {lead.controle_manual ? "Vendedor" : "Klaus"}
        </span>
      </div>
    </button>
  );
}
