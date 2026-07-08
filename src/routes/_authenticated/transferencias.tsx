import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useList, useRemove, type AccountRow } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface TransferRow { id: string; from_account_id: string; to_account_id: string; amount: number; date: string; notes: string | null; }

export const Route = createFileRoute("/_authenticated/transferencias")({ component: TransfersPage });

function TransfersPage() {
  const qc = useQueryClient();
  const { data: transfers } = useList<TransferRow>("transfers", { orderBy: "date" });
  const { data: accounts } = useList<AccountRow>("accounts");
  const remove = useRemove("transfers");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_account_id: "", to_account_id: "", amount: "", date: todayISO(), notes: "" });
  const accMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!amount || amount <= 0) return toast.error("Informe um valor válido.");
    if (form.from_account_id === form.to_account_id) return toast.error("Escolha contas diferentes.");
    const { error } = await supabase.from("transfers").insert({
      from_account_id: form.from_account_id, to_account_id: form.to_account_id, amount, date: form.date, notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    toast.success("Transferência registrada");
    setOpen(false);
  }

  return (
    <PageContainer>
      <PageHeader title="Transferências" description="Entre suas contas" actions={<Button onClick={() => { setForm({ from_account_id: "", to_account_id: "", amount: "", date: todayISO(), notes: "" }); setOpen(true); }}><Plus className="size-4" /> Nova</Button>} />
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {(transfers ?? []).length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="Nenhuma transferência" description="Mova valores entre suas contas." />
        ) : (
          <div className="divide-y divide-border">
            {(transfers ?? []).map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl grid place-items-center bg-primary/10 text-primary shrink-0"><ArrowLeftRight className="size-5" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{accMap.get(t.from_account_id)?.name ?? "?"} → {accMap.get(t.to_account_id)?.name ?? "?"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.date)}{t.notes ? ` • ${t.notes}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <p className="text-sm font-semibold tabular">{formatCurrency(Number(t.amount))}</p>
                  <ConfirmDelete onConfirm={() => remove.mutate(t.id)}><Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-4" /></Button></ConfirmDelete>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova transferência</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Conta origem</Label>
              <Select value={form.from_account_id} onValueChange={(v) => setForm({ ...form, from_account_id: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Conta destino</Label>
              <Select value={form.to_account_id} onValueChange={(v) => setForm({ ...form, to_account_id: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Valor (R$)</Label><Input inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Data</Label><Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Observação</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}