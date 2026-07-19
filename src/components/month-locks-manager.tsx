import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface LockRow {
  id: string;
  year: number;
  month: number;
  locked_at: string;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function MonthLocksManager() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));

  const { data: locks, isLoading } = useQuery({
    queryKey: ["month_locks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("month_locks")
        .select("id, year, month, locked_at")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LockRow[];
    },
  });

  const lockedSet = useMemo(
    () => new Set((locks ?? []).map((l) => `${l.year}-${String(l.month).padStart(2, "0")}`)),
    [locks],
  );

  const years = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 7 }, (_, i) => String(y - 3 + i));
  }, [now]);

  const addLock = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const { error } = await supabase.from("month_locks").insert({
        user_id: u.user.id,
        year: Number(year),
        month: Number(month),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["month_locks"] });
      toast.success("Mês bloqueado");
    },
    onError: (e: Error) => {
      if (e.message.includes("duplicate")) toast.error("Este mês já está bloqueado.");
      else toast.error(e.message);
    },
  });

  const removeLock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("month_locks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["month_locks"] });
      toast.success("Mês desbloqueado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentKey = `${year}-${month}`;
  const alreadyLocked = lockedSet.has(currentKey);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="size-10 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold">Bloqueio de meses</h3>
            <p className="text-xs text-muted-foreground">
              Ao bloquear um mês, nenhum lançamento (receita, despesa ou transferência) daquele período poderá ser
              criado, editado ou excluído. Útil para preservar meses já fechados/conciliados.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Ano</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Mês</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => addLock.mutate()}
            disabled={alreadyLocked || addLock.isPending}
          >
            <Lock className="size-4" />
            {alreadyLocked ? "Já bloqueado" : "Bloquear mês"}
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h4 className="text-sm font-semibold">Meses bloqueados</h4>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Carregando…</p>
        ) : (locks ?? []).length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhum mês bloqueado no momento.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(locks ?? []).map((l) => (
              <li key={l.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-amber-500/10 text-amber-600 grid place-items-center">
                    <Lock className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {MONTHS[l.month - 1]} / {l.year}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bloqueado em {new Date(l.locked_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeLock.mutate(l.id)}
                  disabled={removeLock.isPending}
                >
                  <Unlock className="size-4" /> Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}