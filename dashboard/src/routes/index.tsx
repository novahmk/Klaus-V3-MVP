import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  AlertTriangle,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { EstagioBadge } from "@/components/estagio-badge";
import { WhatsappPreview } from "@/components/whatsapp-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cadenciaPadrao, filaInicial, modelosMensagem, type ContatoFila } from "@/lib/klaus-data";
import { iniciarProspeccao, listarLeads } from "@/lib/klaus-api";
import { ESTAGIOS, rotuloEstagio, type Estagio } from "@/lib/klaus-types";
import { ultimaInteracaoRelativa, statusDoErro } from "@/lib/utils";

/** Sem paginação na UI por ora: 200 é o limite máximo aceito pela API. */
const LIMITE_LEADS = 200;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prospecção — Klaus AI" },
      {
        name: "description",
        content:
          "Monte a fila de contatos, ajuste a cadência aleatória e acompanhe a fase de cada número prospectado pelo Klaus.",
      },
      { property: "og:title", content: "Prospecção — Klaus AI" },
      {
        property: "og:description",
        content:
          "Importe planilha ou adicione contatos manualmente, regule o intervalo entre disparos e veja a fase de cada lead.",
      },
    ],
  }),
  component: Prospeccao,
});

function Prospeccao() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fila, setFila] = useState<ContatoFila[]>(filaInicial);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [modeloId, setModeloId] = useState(modelosMensagem[0]?.id ?? "t1");
  const [mensagem, setMensagem] = useState(modelosMensagem[0]?.mensagem ?? "");
  const [cadencia, setCadencia] = useState(cadenciaPadrao);
  const [filtro, setFiltro] = useState<Estagio | "todas">("todas");

  const leadsQuery = useQuery({
    queryKey: ["leads", { limite: LIMITE_LEADS }],
    queryFn: () => listarLeads({ data: { limite: LIMITE_LEADS } }),
  });

  const iniciarProspeccaoMutation = useMutation({
    mutationFn: iniciarProspeccao,
    onSuccess: (resultado) => {
      const falhas = resultado.results.length - resultado.queued_count;

      if (falhas > 0) {
        toast.error(
          `${resultado.queued_count} envios concluídos e ${falhas} falharam. A fila foi preservada.`,
        );
      } else {
        toast.success(`Prospecção iniciada para ${resultado.queued_count} contatos.`);
        setFila([]);
      }

      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => {
      const status = statusDoErro(err);
      if (status === 404) toast.error("Rota de prospecção ainda não disponível no backend.");
      else if (status === 401) toast.error("Sem autorização — verifique a chave de API.");
      else if (status === 503 || status === null) toast.error("Backend fora do ar.");
      else toast.error("Não foi possível iniciar a prospecção.");
    },
  });

  const previa = useMemo(
    () => [
      {
        id: "p1",
        lead_id: "previa",
        direcao: "saida" as const,
        conteudo: mensagem.replaceAll("{{nome}}", fila[0]?.nome.split(" ")[0] ?? "Ricardo"),
        criado_em: "14:32",
      },
      {
        id: "p2",
        lead_id: "previa",
        direcao: "entrada" as const,
        conteudo:
          "Oi Klaus, legal o contato. Nosso problema é que os SDRs perdem muito tempo com leads frios.",
        criado_em: "14:35",
      },
      {
        id: "p3",
        lead_id: "previa",
        direcao: "saida" as const,
        conteudo:
          "Entendo perfeitamente. Eu filtro esses leads antes de chegarem no seu time. Posso te mostrar como classifico um lead em tempo real?",
        criado_em: "14:36",
      },
    ],
    [mensagem, fila],
  );

  const leadsReais = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data]);

  const contagens = useMemo(() => {
    return ESTAGIOS.map((e) => ({
      ...e,
      total: leadsReais.filter((l) => l.estagio === e.valor).length,
    }));
  }, [leadsReais]);

  const disparados = useMemo(
    () => (filtro === "todas" ? leadsReais : leadsReais.filter((l) => l.estagio === filtro)),
    [filtro, leadsReais],
  );

  function adicionarManual() {
    const digitos = telefone.replace(/\D/g, "");
    if (!nome.trim() || digitos.length < 10) {
      toast.error("Informe nome e um telefone com DDD.");
      return;
    }
    setFila((f) => [
      ...f,
      { id: crypto.randomUUID(), nome: nome.trim(), telefone, origem: "manual" },
    ]);
    setNome("");
    setTelefone("");
    toast.success("Contato adicionado à fila.");
  }

  function importarPlanilha() {
    fileInputRef.current?.click();
  }

  /** Aceita apenas .csv com colunas Nome,Telefone (com ou sem cabeçalho). */
  function processarCsv(texto: string) {
    const linhas = texto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const novos: ContatoFila[] = [];
    for (const linha of linhas) {
      const colunas = linha.split(/[,;]/).map((c) => c.trim());
      const nomeCol = colunas[0];
      const telefoneCol = colunas[1] ?? "";
      const digitos = telefoneCol.replace(/\D/g, "");
      if (!nomeCol || digitos.length < 10) continue; // pula cabeçalho ou linha inválida
      novos.push({
        id: crypto.randomUUID(),
        nome: nomeCol,
        telefone: telefoneCol,
        origem: "planilha",
      });
    }

    if (novos.length === 0) {
      toast.error("Nenhum contato válido encontrado na planilha.");
      return;
    }
    setFila((f) => [...f, ...novos]);
    toast.success(`${novos.length} contatos importados da planilha.`);
  }

  function arquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    arquivo
      .text()
      .then(processarCsv)
      .catch(() => toast.error("Não foi possível ler o arquivo."));
  }

  function iniciar() {
    iniciarProspeccaoMutation.mutate({
      data: {
        origem: fila.every((c) => c.origem === "planilha") ? "planilha" : "manual",
        mensagem,
        itens: fila.map((c) => ({ nome: c.nome, telefone: c.telefone })),
      },
    });
  }

  return (
    <>
      <PageHeader
        titulo="Prospecção"
        descricao="Inicie conversas e deixe o Klaus qualificar antes de passar ao vendedor."
        acao={
          <Button
            onClick={iniciar}
            className="hidden shadow-glow lg:inline-flex"
            disabled={fila.length === 0 || iniciarProspeccaoMutation.isPending}
          >
            <Send /> Iniciar prospecção
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <Tabs defaultValue="nova" className="gap-6">
          <TabsList>
            <TabsTrigger value="nova">Nova prospecção</TabsTrigger>
            <TabsTrigger value="disparados">Disparados</TabsTrigger>
          </TabsList>

          {/* --------------------------- NOVA PROSPECÇÃO --------------------------- */}
          <TabsContent value="nova" className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-7">
              {/* Contatos */}
              <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
                <h2 className="mb-5 text-lg font-semibold text-foreground">Adicionar contatos</h2>

                <button
                  onClick={importarPlanilha}
                  className="group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-input p-6 transition-all hover:border-primary/50 hover:bg-primary/5 sm:p-8"
                >
                  <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary transition-colors group-hover:bg-primary/20">
                    <FileSpreadsheet className="size-6 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <p className="font-medium text-foreground">Importar planilha (.csv)</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Colunas esperadas: Nome e Telefone
                  </p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={arquivoSelecionado}
                  className="hidden"
                />

                <div className="mt-6 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Ou adicione um a um</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      placeholder="Nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                    />
                    <Input
                      placeholder="Telefone com DDD"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && adicionarManual()}
                    />
                    <Button variant="secondary" onClick={adicionarManual} className="shrink-0">
                      <Plus /> Adicionar
                    </Button>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-border bg-surface/60">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <span className="text-sm font-medium text-foreground">
                      Fila de envio · {fila.length}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      {fila.filter((c) => c.origem === "planilha").length} da planilha
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {fila.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Nenhum contato na fila ainda.
                      </li>
                    )}
                    {fila.map((c) => (
                      <li
                        key={c.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{c.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.telefone} · {c.origem === "manual" ? "manual" : "planilha"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setFila((f) => f.filter((x) => x.id !== c.id))}
                          aria-label={`Remover ${c.nome}`}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Abordagem */}
              <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
                <h2 className="mb-5 text-lg font-semibold text-foreground">Abordagem</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Modelo de mensagem</Label>
                    <Select
                      value={modeloId}
                      onValueChange={(v) => {
                        setModeloId(v);
                        const m = modelosMensagem.find((x) => x.id === v);
                        if (m) setMensagem(m.mensagem);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {modelosMensagem.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.titulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mensagem">Primeira mensagem</Label>
                    <Textarea
                      id="mensagem"
                      rows={4}
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use <code className="text-primary">{"{{nome}}"}</code> para personalizar. O
                      Klaus conduz a conversa a partir daqui.
                    </p>
                  </div>
                </div>
              </section>

              {/* Cadência */}
              <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-2">
                  <Timer className="size-5 shrink-0 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Cadência e aleatoriedade
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Intervalo aleatório entre envios (seg)</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={5}
                        value={cadencia.intervalo_min_seg}
                        onChange={(e) =>
                          setCadencia({ ...cadencia, intervalo_min_seg: Number(e.target.value) })
                        }
                      />
                      <span className="shrink-0 text-muted-foreground">—</span>
                      <Input
                        type="number"
                        min={5}
                        value={cadencia.intervalo_max_seg}
                        onChange={(e) =>
                          setCadencia({ ...cadencia, intervalo_max_seg: Number(e.target.value) })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cada disparo sorteia um tempo dentro dessa faixa.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Tamanho do lote</Label>
                    <Input
                      type="number"
                      min={1}
                      value={cadencia.tamanho_lote}
                      onChange={(e) =>
                        setCadencia({ ...cadencia, tamanho_lote: Number(e.target.value) })
                      }
                    />
                    <p className="text-xs text-muted-foreground">Contatos antes da pausa longa.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Pausa entre lotes (min)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={cadencia.pausa_entre_lotes_min}
                      onChange={(e) =>
                        setCadencia({ ...cadencia, pausa_entre_lotes_min: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Janela de horário</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="time"
                        value={cadencia.horario_inicio}
                        onChange={(e) =>
                          setCadencia({ ...cadencia, horario_inicio: e.target.value })
                        }
                      />
                      <span className="shrink-0 text-muted-foreground">às</span>
                      <Input
                        type="time"
                        value={cadencia.horario_fim}
                        onChange={(e) => setCadencia({ ...cadencia, horario_fim: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/60 p-3 sm:col-span-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Somente dias úteis</p>
                      <p className="text-xs text-muted-foreground">
                        Pausa a fila nos fins de semana.
                      </p>
                    </div>
                    <Switch
                      checked={cadencia.apenas_dias_uteis}
                      onCheckedChange={(v) => setCadencia({ ...cadencia, apenas_dias_uteis: v })}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-2 rounded-xl border border-fase-followup/25 bg-fase-followup/10 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fase-followup" />
                  <p className="text-xs text-fase-followup">
                    Estimativa: {fila.length} contatos levariam cerca de{" "}
                    {Math.max(
                      1,
                      Math.round(
                        (fila.length *
                          ((cadencia.intervalo_min_seg + cadencia.intervalo_max_seg) / 2)) /
                          60,
                      ),
                    )}{" "}
                    min, mais pausas entre lotes.
                  </p>
                </div>
              </section>
            </div>

            {/* Prévia WhatsApp */}
            <div className="xl:col-span-5">
              <WhatsappPreview
                className="h-[520px] xl:sticky xl:top-4 xl:h-[700px]"
                nome={fila[0]?.nome ?? "Lead prospectado"}
                telefone={fila[0]?.telefone ?? "online"}
                mensagens={previa}
              />
            </div>
          </TabsContent>

          {/* ------------------------------ DISPARADOS ------------------------------ */}
          <TabsContent value="disparados" className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {contagens.map((c) => (
                <button
                  key={c.valor}
                  onClick={() => setFiltro(filtro === c.valor ? "todas" : c.valor)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    filtro === c.valor
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-panel hover:bg-secondary/40"
                  }`}
                >
                  <p className="truncate text-xs text-muted-foreground uppercase">{c.rotulo}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{c.total}</p>
                </button>
              ))}
            </div>

            <section className="overflow-hidden rounded-2xl border border-border bg-panel">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Números disparados</h2>
                {filtro !== "todas" && (
                  <Button variant="ghost" size="sm" onClick={() => setFiltro("todas")}>
                    Limpar filtro
                  </Button>
                )}
              </div>

              {/* Desktop: tabela */}
              <table className="hidden w-full lg:table">
                <thead>
                  <tr className="bg-surface/40 text-left text-xs tracking-wider text-muted-foreground uppercase">
                    <th className="px-5 py-3 font-semibold">Lead</th>
                    <th className="px-5 py-3 font-semibold">Telefone</th>
                    <th className="px-5 py-3 font-semibold">Última interação</th>
                    <th className="px-5 py-3 font-semibold">Estágio</th>
                    <th className="px-5 py-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {disparados.map((l) => (
                    <tr key={l.id} className="transition-colors hover:bg-secondary/30">
                      <td className="px-5 py-4 text-sm font-medium text-foreground">
                        {l.nome ?? l.telefone}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{l.telefone}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {ultimaInteracaoRelativa(l.ultima_interacao)}
                      </td>
                      <td className="px-5 py-4">
                        <EstagioBadge estagio={l.estagio} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate({ to: "/kanban", search: { lead: l.id } as never })
                          }
                        >
                          Ver conversa
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: cards */}
              <ul className="divide-y divide-border lg:hidden">
                {disparados.map((l) => (
                  <li key={l.id} className="space-y-2 p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {l.nome ?? l.telefone}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{l.telefone}</p>
                      </div>
                      <EstagioBadge estagio={l.estagio} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ultimaInteracaoRelativa(l.ultima_interacao)}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate({ to: "/kanban", search: { lead: l.id } as never })}
                    >
                      Ver conversa
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      {/* Ação principal fixa no celular */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-sidebar/95 p-3 backdrop-blur lg:hidden">
        <Button
          onClick={iniciar}
          className="w-full"
          disabled={fila.length === 0 || iniciarProspeccaoMutation.isPending}
        >
          <Send /> Iniciar prospecção ({fila.length})
        </Button>
      </div>
    </>
  );
}
