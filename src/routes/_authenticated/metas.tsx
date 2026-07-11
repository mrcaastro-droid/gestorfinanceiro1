import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useList, useUpsert, useRemove, type GoalRow } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { useHideValues, maskCurrency } from "@/lib/hide-values";
import { Target, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/metas")({ component: MetasPage });

function MetasPage() {
  const { hidden } = useHideValues();
  const { data: goals } = useList<GoalRow>("goals");
  const upsert = useUpsert("goals");
  const remove = useRemove("goals");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  function startNew() { setForm({ color: "#10b981" }); setOpen(true); }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate(
      {
        id: form.id,
        name: form.name,
        target_amount: Number(form.target_amount) || 0,
        current_amount: Number(form.current_amount) || 0,
        target_date: form.target_date || null,
        color: form.color || "#10b981",
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Metas financeiras" description="Acompanhe seus objetivos" actions={<Button onClick={startNew}><Plus className="size-4" /> Nova meta</Button>} />
      {(goals ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-2xl">
          <EmptyState icon={Target} title="Nenhuma meta ainda" description="Defina um objetivo e acompanhe o progresso." action={<Button onClick={startNew}><Plus className="size-4" /> Criar meta</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(goals ?? []).map((g) => {
            const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
            return (
              <div key={g.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    <h3 className="font-semibold truncate">{g.name}</h3>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => { setForm({ ...g }); setOpen(true); }}><Pencil className="size-4" /></Button>
                    <ConfirmDelete onConfirm={() => remove.mutate(g.id)}><Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-4" /></Button></ConfirmDelete>
                  </div>
                </div>
                <Progress value={pct} className="mb-2" />
                <div className="flex justify-between text-sm">
                  <span className="tabular font-medium">{maskCurrency(g.current_amount, hidden)}</span>
                  <span className="text-muted-foreground tabular">{maskCurrency(g.target_amount, hidden)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{pct}% concluído{g.target_date ? ` • até ${formatDate(g.target_date)}` : ""}</p>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar meta" : "Nova meta"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Nome</Label><Input required value={String(form.name ?? "")} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Valor desejado (R$)</Label><Input type="number" step="any" required value={String(form.target_amount ?? "")} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Valor atual (R$)</Label><Input type="number" step="any" value={String(form.current_amount ?? "")} onChange={(e) => setForm({ ...form, current_amount: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Data prevista</Label><Input type="date" value={String(form.target_date ?? "")} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Cor</Label><input type="color" value={String(form.color ?? "#10b981")} onChange={(e) => setForm({ ...form, color: e.target.value })} className="size-10 rounded-lg border border-border bg-transparent" /></div>
            </div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}