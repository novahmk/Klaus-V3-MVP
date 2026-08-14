import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ultimaInteracaoRelativa(iso: string | null): string {
  if (iso === null) return "Sem interação registrada";

  try {
    return `há ${formatDistanceToNow(new Date(iso), { locale: ptBR })}`;
  } catch {
    return "Sem interação registrada";
  }
}

/** Extrai o status HTTP de erros lançados por `klausFetch`. Retorna null quando não aplicável. */
export function statusDoErro(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /respondeu (\d{3}) em/.exec(msg);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}
