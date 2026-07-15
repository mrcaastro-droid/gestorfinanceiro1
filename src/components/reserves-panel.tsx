import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useList, type TransactionRow, type AccountRow, type CategoryRow } from "@/lib/finance";
import { useHideValues, maskCurrency } from "@/lib/hide-values";
import { todayISO } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, ArrowLeftRight, Loader2, HandCoins, TrendingUp } from "lucide-react";

const NONE = "__none__";

interface Caixinha {
  catId: string;
  name: string;
  color: string;
  reserved: number;
  yield: number;
  withdrawn: number;
  total: number;
  defaultAccount: string | null;
}

export function ReservesPanel() {
  const qc = useQueryClient();
  const { hidden } = useHideValues();
  const { data: transactions } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: accounts } = useList<AccountRow>("accounts");
  const { data: categories } = useList<CategoryRow>("categories");
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const caixinhas = useMemo<Caixinha[]>(() => {
    const agg = new Map<string, { reserved: number; yield: number; withdrawn: number; accCount: Map<string, number> }>();
    const bump = (id: string) => {
      if (!agg.has(id)) agg.set(id, { reserved: 0, yield: 0, withdrawn: 0, accCount: new Map() });
      return agg.get(id)!;
    };
    (transactions ?? []).forEach((t) => {
      const catId = t.category_id;
      if (!catId) return;
      if (t.type === "transferencia") {
        const a = bump(catId);
        if (t.is_yield) a.yield += Number(t.amount);
        else a.reserved += Number(t.amount);
        if (t.transfer_account_id) a.accCount.set(t.transfer_account_id, (a.accCount.get(t.transfer_account_id) ?? 0) + Number(t.amount));
      } else if (t.type === "receita" && t.is_reserve_withdrawal) {
        bump(catId).withdrawn += Number(t.amount);
      }
    });
    return Array.from(agg.entries())
      .map(([catId, v]) => {
        let defaultAccount: string | null = null;
        let best = -1;
        v.accCount.forEach((amt, acc) => { if (amt > best) { best = amt; defaultAccount = acc; } });
        return {
          catId,
          name: catMap.get(catId)?.name ?? "Caixinha",
          color: catMap.get(catId)?.color ?? "#6366f1",
          reserved: v.reserved,
          yield: v.yield,
          withdrawn: v.withdrawn,
          total: v.reserved + v.yield - v.withdrawn,
          defaultAccount,
        };
      })
      .filter((c) => c.total > 0.005 || c.yield > 0.005)
      .sort((a, b) => b.total - a.total);
  }, [transactions, catMap]);

  const totalGuardado = caixinhas.reduce((s, c) => s + c.total, 0);
  const totalRend = caixinhas.reduce((s, c) => s + c.yield, 0);

  // ---- Resgate ----
  const [rescOpen, setRescOpen] = useState(false);
  const [rescCat, setRescCat] = useState("");
  const [rescAmount, setRescAmount] = useState("");
  const [rescDate, setRescDate] = useState(todayISO());
  const [rescDesc, setRescDesc] = useState("");
  const [rescAccount, setRescAccount] = useState<string>("");

  // ---- Rendimento ----
  const [rendOpen, setRendOpen] = useState(false);
  const [rendCat, setRendCat] = useState("");
  const [rendAmount, setRendAmount] = useState("");
  const [rendAccount, setRendAccount] = useState(NONE);
  const [rendDate, setRendDate] = useState(todayISO());

  const [busy, setBusy] = useState(false);

  const rescSelected = caixinhas.find((c) => c.catId === rescCat);
  const rendSelected = caixinhas.find((c) => c.catId === rendCat);

  function startResgate(catId?: string) {
    const cat = catId ?? caixinhas[0]?.catId ?? "";
    setRescCat(cat);
    const c = caixinhas.find((x) => x.catId === cat);
    setRescAccount(c?.defaultAccount ?? (accounts?.[0]?.id ?? ""));
    setRescAmount("");
    setRescDate(todayISO());
    setRescDesc("");
    setRescOpen(true);
  }

  function startRendimento(catId: string) {
    const c = caixinhas.find((x) => x.catId === catId);
    setRendCat(catId);
    setRendAmount("");
    setRendAccount(c?.defaultAccount ?? NONE);
    setRendDate(todayISO());
    setRendOpen(true);
  }

  async function submitResgate(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(rescAmount.replace(",", "."));
    if (!rescCat) return toast.error("Selecione a caixinha.");
    if (!value || value <= 0) return toast.error("Informe um valor válido.");
    if (rescSelected && value > rescSelected.total + 0.005) return toast.error("Valor maior que o disponível na caixinha.");
    if (!rescAccount) return toast.error("Selecione a conta que receberá o valor.");
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        type: "receita",
        amount: value,
        date: rescDate,
        description: rescDesc || `Resgate • ${rescSelected?.name ?? "reserva"}`,
        is_reserve_withdrawal: true,
        category_id: rescCat,
        account_id: rescAccount,
        is_paid: true,
      });
      if (error) throw error;
      invalidate();
      toast.success("Resgate realizado — valor de volta como receita");
      setRescOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRendimento(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(rendAmount.replace(",", "."));
    if (!rendCat) return toast.error("Selecione a caixinha.");
    if (!value || value <= 0) return toast.error("Informe um valor válido.");
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        type: "transferencia",
        amount: value,
        date: rendDate,
        description: `Rendimento • ${rendSelected?.name ?? "reserva"}`,
        is_yield: true,
        category_id: rendCat,
        account_id: null,
        transfer_account_id: rendAccount === NONE ? null : rendAccount,
        is_paid: true,
      });
      if (error) throw error;
      invalidate();
      toast.success("Rendimento adicionado à caixinha");
      setRendOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <PiggyBank className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Caixinhas &amp; Reservas</h2>
            <p className="text-xs text-muted-foreground">Guardado por categoria • Rendimento {maskCurrency(totalRend, hidden)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular">{maskCurrency(totalGuardado, hidden)}</p>
          {caixinhas.length > 0 && (
            <Button size="sm" variant="outline" className="mt-1" onClick={() => startResgate()}>
              <HandCoins className="size-4" /> Resgatar
            </Button>
          )}
        </div>
      </div>

      {caixinhas.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <ArrowLeftRight className="size-4" /> Nenhuma caixinha ainda. Faça uma transferência escolhendo uma categoria de reserva.
        </div>
      ) : (
        <div className="divide-y divide-border -mx-1">
          {caixinhas.map((c) => (
            <div key={c.catId} className="px-1 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.yield > 0.005 && (
                    <p className="text-[11px] text-income flex items-center gap-1">
                      <TrendingUp className="size-3" /> Rendimento {maskCurrency(c.yield, hidden)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular">{maskCurrency(c.total, hidden)}</span>
                <Button size="sm" variant="ghost" onClick={() => startRendimento(c.catId)}>Rendimento</Button>
                <Button size="sm" variant="ghost" onClick={() => startResgate(c.catId)}>Resgatar</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resgate */}
      <Dialog open={rescOpen} onOpenChange={setRescOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resgatar de uma caixinha</DialogTitle></DialogHeader>
          <form onSubmit={submitResgate} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Caixinha</Label>
              <Select value={rescCat} onValueChange={setRescCat}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {caixinhas.map((c) => (
                    <SelectItem key={c.catId} value={c.catId}>{c.name} • {maskCurrency(c.total, hidden)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Creditar na conta</Label>
              <Select value={rescAccount} onValueChange={setRescAccount}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input inputMode="decimal" required value={rescAmount} onChange={(e) => setRescAmount(e.target.value)} placeholder="0,00" />
                {rescSelected && <p className="text-[11px] text-muted-foreground">Disponível: {maskCurrency(rescSelected.total, hidden)}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" required value={rescDate} onChange={(e) => setRescDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input value={rescDesc} onChange={(e) => setRescDesc(e.target.value)} placeholder="Resgate de reserva" />
            </div>
            <p className="text-xs text-muted-foreground">O valor volta para o saldo disponível da conta escolhida. Não conta como Receita do mês.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRescOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Resgatar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rendimento */}
      <Dialog open={rendOpen} onOpenChange={setRendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar rendimento{rendSelected ? ` • ${rendSelected.name}` : ""}</DialogTitle></DialogHeader>
          <form onSubmit={submitRendimento} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor do rendimento (R$)</Label>
                <Input inputMode="decimal" required value={rendAmount} onChange={(e) => setRendAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" required value={rendDate} onChange={(e) => setRendDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Creditar na conta (opcional)</Label>
              <Select value={rendAccount} onValueChange={setRendAccount}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma (só a caixinha)</SelectItem>
                  {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">O rendimento aumenta o montante da caixinha sem contar como receita ou despesa.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRendOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Adicionar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
