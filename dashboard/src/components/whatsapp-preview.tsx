import { cn } from "@/lib/utils";
import type { Mensagem } from "@/lib/klaus-data";

type Props = {
  nome: string;
  telefone?: string;
  mensagens: Mensagem[];
  rodape?: string;
  iaAtiva?: boolean;
  className?: string;
};

export function WhatsappPreview({
  nome,
  telefone,
  mensagens,
  rodape = "Prévia da interação...",
  iaAtiva = true,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-wa-bg shadow-2xl",
        className,
      )}
    >
      <div className="flex items-center gap-3 bg-wa-panel p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
          {nome.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{nome}</h3>
          <p className="truncate text-[11px] text-wa-muted">{telefone ?? "online"}</p>
        </div>
        {iaAtiva && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-primary/90 px-2.5 py-1 text-[10px] font-bold tracking-widest text-primary-foreground uppercase">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
            </span>
            IA ativa
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {mensagens.map((m) => (
          <div
            key={m.id}
            className={cn("flex", m.direcao === "saida" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-t-lg p-3 text-sm shadow-sm",
                m.direcao === "saida"
                  ? "rounded-bl-lg bg-wa-out text-foreground"
                  : "rounded-br-lg bg-wa-in text-foreground",
              )}
            >
              {m.conteudo}
              <div className="mt-1 text-right text-[10px] text-wa-muted">
                {m.criado_em}
                {m.direcao === "saida" ? " ✓✓" : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-wa-panel p-3">
        <div className="rounded-lg bg-wa-input px-4 py-2 text-sm text-wa-muted">{rodape}</div>
      </div>
    </div>
  );
}
