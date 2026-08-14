import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, Save, ShieldAlert, Target, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/help-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { buscarConfiguracao, atualizarConfiguracao } from "@/lib/klaus-api.server";
import type { RegrasConversaReal } from "@/lib/klaus-types";

export const Route = createFileRoute("/configuracao")({
  head: () => ({
    meta: [
      { title: "Configuração — Klaus AI" },
      {
        name: "description",
        content: "Ajuste a persona do Klaus, o objetivo, o tom de voz e as regras da conversa.",
      },
      { property: "og:title", content: "Configuração — Klaus AI" },
      {
        property: "og:description",
        content: "Persona, objetivo, tom de voz e regras de escalonamento do Klaus.",
      },
    ],
  }),
  component: Configuracao,
});

type ChaveRegra = keyof RegrasConversaReal;

const REGRAS_CAMPOS: [ChaveRegra, string, string][] = [
  [
    "nao_prometer",
    "Nunca prometer",
    "Limite absoluto: o que o Klaus nunca pode prometer ao lead (ex: prazos, resultados, funcionalidades).",
  ],
  [
    "sempre_confirmar",
    "Sempre confirmar",
    "Informações que o Klaus deve sempre confirmar com o lead antes de prosseguir.",
  ],
  [
    "escalar_humano_quando",
    "Escalar para humano quando",
    "Sinais que fazem o Klaus convidar o vendedor a assumir a conversa.",
  ],
];

function Configuracao() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["configuracao"],
    queryFn: () => buscarConfiguracao(),
  });

  const [persona, setPersona] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [tomDeVoz, setTomDeVoz] = useState("");
  const [contexto, setContexto] = useState("");

  useEffect(() => {
    if (!configQuery.data) return;
    setPersona(configQuery.data.agente.persona);
    setObjetivo(configQuery.data.agente.objetivo);
    setTomDeVoz(configQuery.data.agente.tomDeVoz);
    setContexto(configQuery.data.agente.contexto);
  }, [configQuery.data]);

  const regras = configQuery.data?.regras;

  const salvarMutation = useMutation({
    mutationFn: atualizarConfiguracao,
    onSuccess: (dados) => {
      queryClient.setQueryData(["configuracao"], dados);
      toast.success("Configuração salva.");
    },
    onError: () => {
      toast.error("Não foi possível salvar a configuração.");
    },
  });

  function salvar() {
    salvarMutation.mutate({
      data: { persona, objetivo, tomDeVoz, contexto },
    });
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Carregando configuração...
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Não foi possível carregar a configuração. Verifique se o backend está no ar.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Configuração"
        descricao="Tudo o que define como o Klaus conversa, em uma tela só."
        acao={
          <Button
            onClick={salvar}
            disabled={salvarMutation.isPending}
            className="hidden shadow-glow sm:inline-flex"
          >
            <Save /> Salvar
          </Button>
        }
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-28 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Persona */}
          <Secao icone={Bot} titulo="Persona da IA" tabela="agente.persona">
            <div className="space-y-2">
              <LabelComAjuda
                htmlFor="persona"
                texto="Texto base que define quem é o Klaus, sua função e como ele deve conduzir cada conversa desde a primeira mensagem."
              >
                Como o Klaus se apresenta e conduz
              </LabelComAjuda>
              <Textarea
                id="persona"
                rows={8}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Este texto vai direto no prompt do sistema em cada conversa.
              </p>
            </div>
          </Secao>

          {/* Objetivo */}
          <Secao icone={Target} titulo="Objetivo" tabela="agente.objetivo">
            <div className="space-y-2">
              <LabelComAjuda
                htmlFor="objetivo"
                texto="O que o Klaus deve buscar alcançar em cada conversa (ex: qualificar o lead, agendar uma reunião, coletar dados)."
              >
                O que o Klaus deve buscar em cada conversa
              </LabelComAjuda>
              <Textarea
                id="objetivo"
                rows={4}
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
              />
            </div>
            <div className="mt-4 space-y-2">
              <LabelComAjuda
                htmlFor="contexto"
                texto="Contexto adicional sobre o produto, empresa ou mercado que ajuda o Klaus a responder com mais precisão."
              >
                Contexto adicional
              </LabelComAjuda>
              <Textarea
                id="contexto"
                rows={4}
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
              />
            </div>
          </Secao>

          {/* Tom de voz */}
          <Secao icone={Volume2} titulo="Tom de voz" tabela="agente.tomDeVoz">
            <div className="space-y-2">
              <LabelComAjuda
                htmlFor="tom-de-voz"
                texto="Tom padrão usado em toda a conversa. Define se o Klaus é mais formal, descontraído, direto ou consultivo."
              >
                Tom de voz
              </LabelComAjuda>
              <Input
                id="tom-de-voz"
                value={tomDeVoz}
                onChange={(e) => setTomDeVoz(e.target.value)}
              />
            </div>
          </Secao>

          {/* Regras (somente leitura: não editável via API) */}
          <Secao icone={ShieldAlert} titulo="Regras da conversa" tabela="regras">
            <div className="space-y-4">
              {REGRAS_CAMPOS.map(([chave, rotulo, ajuda]) => (
                <div key={chave} className="space-y-2">
                  <LabelComAjuda htmlFor={chave} texto={ajuda}>
                    {rotulo}
                  </LabelComAjuda>
                  {regras && regras[chave].length > 0 ? (
                    <ul className="list-disc space-y-1 rounded-lg border border-border bg-surface/60 p-3 pl-6 text-sm text-foreground">
                      {regras[chave].map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-border bg-surface/60 p-3 text-sm text-muted-foreground">
                      Nenhuma regra definida.
                    </p>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Regras são definidas pela equipe técnica e exibidas aqui apenas para consulta.
              </p>
            </div>
          </Secao>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-sidebar/95 p-3 backdrop-blur sm:hidden">
        <Button onClick={salvar} disabled={salvarMutation.isPending} className="w-full">
          <Save /> Salvar configuração
        </Button>
      </div>
    </>
  );
}

function LabelComAjuda({
  children,
  texto,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  texto: string;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label htmlFor={htmlFor} className="mb-0">
        {children}
      </Label>
      <HelpTooltip text={texto} label={children} />
    </div>
  );
}

function Secao({
  icone: Icone,
  titulo,
  tabela,
  children,
}: {
  icone: React.ElementType;
  titulo: string;
  tabela: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <div className="mb-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10">
          <Icone className="size-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{titulo}</h2>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{tabela}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
