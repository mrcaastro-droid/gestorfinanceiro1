import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RecurringDialog, type RecurringRow } from "@/components/recurring-dialog";
import { formatCurrency } from "@/lib/format";
import { useList, useRemove, useGenerateRecurring } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Repeat, RefreshCw, Plus, Pencil, Trash2, GripVertical, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

const FREQ_LABEL: Record<string, string> = {
  semanal: "Semanal", mensal: "Mensal", bimestral: "Bimestral",
  trimestral: "Trimestral", semestral: "Semestral", anual: "Anual",
};

export const Route = createFileRoute("/_authenticated/recorrencias")({
  component: Recorrencias,
});

function Recorrencias() {
  const qc = useQueryClient();
  const gen = useGenerateRecurring();
  const remove = useRemove("recurring_rules");
  const { data, isLoading } = useList<RecurringRow & { sort_order?: number }>("recurring_rules", { orderBy: "sort_order", ascending: true });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [order, setOrder] = useState<(RecurringRow & { sort_order?: number })[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const serverList = useMemo(() => data ?? [], [data]);
  useEffect(() => { setOrder(serverList); }, [serverList]);

  function generate() {
    gen.mutate(undefined, {
      onSuccess: (res) => {
        const n = res?.created ?? 0;
        toast.success(n > 0 ? `${n} lançamento(s) gerado(s)` : "Tudo em dia, nada a gerar");
      },
      onError: (e: Error) => toast.error(e.message ?? "Erro ao gerar lançamentos"),
    });
  }

  async function persistOrder(list: (RecurringRow & { sort_order?: number })[]) {
    setOrder(list);
    try {
      await Promise.all(
        list.map((r, i) => supabase.from("recurring_rules").update({ sort_order: i } as never).eq("id", r.id)),
      );
      qc.invalidateQueries({ queryKey: ["recurring_rules"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = order.findIndex((r) => r.id === dragId);
    const to = order.findIndex((r) => r.id === targetId);
    if (from === -1 || to === -1) return;
    const next = order.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Recorrências"
        description="Contas fixas e receitas que se repetem. Elas viram lançamentos pendentes e aparecem em 'Próximas contas'. Arraste para reordenar."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={generate} disabled={gen.isPending}>
              <RefreshCw className={`size-4 ${gen.isPending ? "animate-spin" : ""}`} /> Gerar
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="size-4" /> Nova
            </Button>
          </div>
        }
      />

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : order.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Nenhuma recorrência"
            description="Cadastre suas contas fixas e receitas que se repetem."
            action={<Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-4" /> Nova recorrência</Button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {order.map((row) => {
              const isReceita = row.type === "receita";
              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(row.id)}
                  className={`px-3 py-3 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors ${dragId === row.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
                    <span className={`size-9 rounded-xl grid place-items-center shrink-0 ${isReceita ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
                      {isReceita ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.name}{!row.active && <span className="text-muted-foreground font-normal"> • inativa</span>}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {isReceita ? "Receita" : "Despesa"} • {formatCurrency(Number(row.amount))} • {FREQ_LABEL[row.frequency] ?? row.frequency} • dia {row.day_of_month}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditing(row); setDialogOpen(true); }}><Pencil className="size-4" /></Button>
                    <ConfirmDelete onConfirm={() => remove.mutate(row.id)}>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-4" /></Button>
                    </ConfirmDelete>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RecurringDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </PageContainer>
  );
}
