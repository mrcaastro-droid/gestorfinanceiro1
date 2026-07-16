import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useList, type TransactionRow, type AccountRow, type CategoryRow } from "@/lib/finance";
import { useHideValues, maskCurrency } from "@/lib/hide-values";
import { todayISO, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, ArrowLeftRight, Loader2, HandCoins, TrendingUp, ChevronDown, ChevronRight, Pencil, Trash2, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";

interface Caixinha {
  catId: string;
  name: string;
  color: string;
  reserved: number;
  yield: number;
  withdrawn: number;
  total: number;
  defaultAccount: string | null;
  ops: TransactionRow[];
}

export function ReservesPanel() {
  const qc = useQueryClient();
  const { hidden } = useHideValues();
  const { data: transactions } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: accounts } = useList<AccountRow>("accounts");
  const { data: categories } = useList<CategoryRow>("categories");
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const caixinhas = useMemo<Caixinha[]>(() => {
    const agg = new Map<string, { reserved: number; yield: number; withdrawn: number; accCount: Map<string, number>; ops: TransactionRow[] }>();
    const bump = (id: string) => {
      if (!agg.has(id)) agg.set(id, { reserved: 0, yield: 0, withdrawn: 0, accCount: new Map(), ops: [] });
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
        a.ops.push(t);
      } else if (t.type === "receita" && t.is_reserve_withdrawal) {
        const a = bump(catId);
        a.withdrawn += Number(t.amount);
        a.ops.push(t);
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
          ops: v.ops.slice().sort((a, b) => (a.date > b.date ? -1 : 1)),
        };
      })
      .filter((c) => c.total > 0.005 || c.yield > 0.005)
      .sort((a, b) => b.total - a.total);
  }, [transactions, catMap]);

  const totalGuardado = caixinhas.reduce((s, c) => s + c.total, 0);
  const totalRend = caixinhas.reduce((s, c) => s + c.yield, 0);

  const [expanded, setExpanded] = useState<string | null>(null);
  const accMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

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
  const [rendDate, setRendDate] = useState(todayISO());
  const [rendEditingId, setRendEditingId] = useState<string | null>(null);

  // ---- Editar operação genérica (transferência guardada / resgate) ----
  const [editOp, setEditOp] = useState<TransactionRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState(todayISO());
  const [editDesc, setEditDesc] = useState("");

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

  function startRendimento(catId: string, existing?: TransactionRow) {
    setRendCat(catId);
    if (existing) {
      setRendEditingId(existing.id);
      setRendAmount(String(existing.amount));
      setRendDate(existing.date);
    } else {
      setRendEditingId(null);
      setRendAmount("");
      setRendDate(todayISO());
    }
    setRendOpen(true);
  }

  function startEditOp(op: TransactionRow) {
    setEditOp(op);
    setEditAmount(String(op.amount));
    setEditDate(op.date);
    setEditDesc(op.description ?? "");
  }

  async function submitEditOp(e: React.FormEvent) {
    e.preventDefault();
    if (!editOp) return;
    const value = parseFloat(editAmount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido.");
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions")
        .update({ amount: value, date: editDate, description: editDesc || null })
        .eq("id", editOp.id);
      if (error) throw error;
      invalidate();
      toast.success("Operação atualizada");
      setEditOp(null);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteOp(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      invalidate();
      toast.success("Operação removida");
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
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
      if (rendEditingId) {
        const { error } = await supabase.from("transactions")
          .update({ amount: value, date: rendDate })
          .eq("id", rendEditingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert({
          type: "transferencia",
          amount: value,
          date: rendDate,
          description: `Rendimento • ${rendSelected?.name ?? "reserva"}`,
          is_yield: true,
          category_id: rendCat,
          account_id: null,
          transfer_account_id: null,
          is_paid: true,
        });
        if (error) throw error;
      }
      invalidate();
      toast.success(rendEditingId ? "Rendimento atualizado" : "Rendimento adicionado à caixinha");
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <PiggyBank className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Caixinhas &amp; Reservas</h2>
            <p className="text-xs text-muted-foreground">Guardado por categoria • Rendimento {maskCurrency(totalRend, hidden)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
          <p className="text-lg font-bold tabular">{maskCurrency(totalGuardado, hidden)}</p>
          {caixinhas.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => startResgate()}>
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
          {caixinhas.map((c) => {
            const isOpen = expanded === c.catId;
            return (
              <div key={c.catId} className="px-1 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    onClick={() => setExpanded(isOpen ? null : c.catId)}
                  >
                    {isOpen ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.yield > 0.005 && (
                        <p className="text-[11px] text-income flex items-center gap-1">
                          <TrendingUp className="size-3" /> Rendimento {maskCurrency(c.yield, hidden)}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold tabular shrink-0">{maskCurrency(c.total, hidden)}</span>
                  </button>
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0 pl-6 sm:pl-0">
                    <Button size="sm" variant="ghost" onClick={() => startRendimento(c.catId)}>Rendimento</Button>
                    <Button size="sm" variant="ghost" onClick={() => startResgate(c.catId)}>Resgatar</Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 ml-6 border-l border-border pl-3 space-y-1.5">
                    {c.ops.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Sem operações.</p>
                    ) : c.ops.map((op) => {
                      const isYield = op.type === "transferencia" && op.is_yield;
                      const isReserve = op.type === "transferencia" && !op.is_yield;
                      const isWithdraw = op.type === "receita" && op.is_reserve_withdrawal;
                      const label = isYield ? "Rendimento" : isReserve ? "Guardado" : "Resgate";
                      const sign = isWithdraw ? "-" : "+";
                      const tone = isWithdraw ? "text-expense" : isYield ? "text-income" : "text-foreground";
                      const Icon = isYield ? TrendingUp : isReserve ? ArrowUpRight : ArrowDownRight;
                      const accId = isWithdraw ? op.account_id : op.transfer_account_id;
                      const acc = accId ? accMap.get(accId) : null;
                      return (
                        <div key={op.id} className="flex items-center gap-2 py-1.5 text-xs">
                          <Icon className={`size-3.5 shrink-0 ${tone}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              <span className="font-medium">{label}</span>
                              {op.description && !op.description.startsWith(label) ? ` • ${op.description}` : ""}
                            </p>
                            <p className="text-muted-foreground">{formatDate(op.date)}{acc ? ` • ${acc.name}` : ""}</p>
                          </div>
                          <span className={`tabular font-semibold ${tone} shrink-0`}>
                            {sign} {maskCurrency(Number(op.amount), hidden)}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => isYield ? startRendimento(c.catId, op) : startEditOp(op)}
                            aria-label="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <ConfirmDelete onConfirm={() => deleteOp(op.id)}>
                            <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" aria-label="Excluir">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </ConfirmDelete>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
          <DialogHeader><DialogTitle>{rendEditingId ? "Editar" : "Adicionar"} rendimento{rendSelected ? ` • ${rendSelected.name}` : ""}</DialogTitle></DialogHeader>
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
            <p className="text-xs text-muted-foreground">O rendimento aumenta apenas o montante da caixinha. Não aparece em Transferências, Receitas ou Despesas.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRendOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} {rendEditingId ? "Salvar" : "Adicionar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar operação (guardado / resgate) */}
      <Dialog open={!!editOp} onOpenChange={(o) => !o && setEditOp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar operação</DialogTitle></DialogHeader>
          <form onSubmit={submitEditOp} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input inputMode="decimal" required value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOp(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
