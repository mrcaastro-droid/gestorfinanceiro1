import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useList, type TransactionRow, type AccountRow } from "@/lib/finance";
import { useHideValues, maskCurrency } from "@/lib/hide-values";
import { todayISO } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, ArrowLeftRight, Loader2, HandCoins } from "lucide-react";

export function ReservesPanel() {
  const qc = useQueryClient();
  const { hidden } = useHideValues();
  const { data: transactions } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: accounts } = useList<AccountRow>("accounts");
  const accMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  const reserves = useMemo(() => {
    const map = new Map<string, number>();
    (transactions ?? []).forEach((t) => {
      if (t.type === "transferencia" && t.transfer_account_id) {
        map.set(t.transfer_account_id, (map.get(t.transfer_account_id) ?? 0) + Number(t.amount));
      } else if (t.type === "receita" && t.is_reserve_withdrawal && t.transfer_account_id) {
        map.set(t.transfer_account_id, (map.get(t.transfer_account_id) ?? 0) - Number(t.amount));
      }
    });
    return Array.from(map.entries())
      .map(([accId, value]) => ({ accId, name: accMap.get(accId)?.name ?? "Conta", color: accMap.get(accId)?.color ?? "#6366f1", value }))
      .filter((r) => r.value > 0.005)
      .sort((a, b) => b.value - a.value);
  }, [transactions, accMap]);

  const total = reserves.reduce((s, r) => s + r.value, 0);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accId, setAccId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");

  const selected = reserves.find((r) => r.accId === accId);

  function startResgate(preAcc?: string) {
    setAccId(preAcc ?? reserves[0]?.accId ?? "");
    setAmount("");
    setDate(todayISO());
    setDescription("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(",", "."));
    if (!accId) return toast.error("Selecione a reserva.");
    if (!value || value <= 0) return toast.error("Informe um valor válido.");
    if (selected && value > selected.value + 0.005) return toast.error("Valor maior que o disponível na reserva.");
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        type: "receita",
        amount: value,
        date,
        description: description || `Resgate • ${selected?.name ?? "reserva"}`,
        is_reserve_withdrawal: true,
        transfer_account_id: accId,
        account_id: null,
        category_id: null,
        is_paid: true,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Resgate realizado — valor de volta como receita");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <PiggyBank className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Reservas</h2>
            <p className="text-xs text-muted-foreground">Total guardado via transferências</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular">{maskCurrency(total, hidden)}</p>
          {reserves.length > 0 && (
            <Button size="sm" variant="outline" className="mt-1" onClick={() => startResgate()}>
              <HandCoins className="size-4" /> Resgatar
            </Button>
          )}
        </div>
      </div>

      {reserves.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <ArrowLeftRight className="size-4" /> Nenhuma reserva ainda. Faça uma transferência para guardar dinheiro.
        </div>
      ) : (
        <div className="divide-y divide-border -mx-1">
          {reserves.map((r) => (
            <div key={r.accId} className="px-1 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-sm font-medium truncate">{r.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold tabular">{maskCurrency(r.value, hidden)}</span>
                <Button size="sm" variant="ghost" onClick={() => startResgate(r.accId)}>Resgatar</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resgatar reserva</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reserva</Label>
              <Select value={accId} onValueChange={setAccId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {reserves.map((r) => (
                    <SelectItem key={r.accId} value={r.accId}>{r.name} • {maskCurrency(r.value, hidden)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
                {selected && <p className="text-[11px] text-muted-foreground">Disponível: {maskCurrency(selected.value, hidden)}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Resgate de reserva" />
            </div>
            <p className="text-xs text-muted-foreground">O valor resgatado volta a contar como receita disponível.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Resgatar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
