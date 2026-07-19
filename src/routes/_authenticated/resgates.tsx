import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useList, type TransactionRow, type CategoryRow, type AccountRow } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/format";
import { useHideValues, maskCurrency } from "@/lib/hide-values";
import { toast } from "sonner";
import { HandCoins, Search, Pencil, Trash2, ArrowDownRight, X, Loader2 } from "lucide-react";

function ResgatesPage() {
  const qc = useQueryClient();
  const { hidden } = useHideValues();
  const { data: transactions, isLoading } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: categories } = useList<CategoryRow>("categories");
  const { data: accounts } = useList<AccountRow>("accounts");

  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const accMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [accFilter, setAccFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");

  const base = useMemo(
    () => (transactions ?? []).filter((t) => t.type === "receita" && t.is_reserve_withdrawal),
    [transactions],
  );

  const caixinhas = useMemo(() => {
    const ids = Array.from(new Set(base.map((t) => t.category_id).filter(Boolean) as string[]));
    return ids
      .map((id) => catMap.get(id))
      .filter((c): c is CategoryRow => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [base, catMap]);

  const years = useMemo(() => {
    const set = new Set(base.map((t) => t.date.slice(0, 4)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [base]);

  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const rows = useMemo(() => {
    let list = base;
    if (search) {
      const q = search.toLowerCase();
      const qDigits = q.replace(/[^0-9]/g, "");
      const qNum = parseFloat(q.replace(/\./g, "").replace(",", "."));
      list = list.filter((t) =>
        (t.description ?? "").toLowerCase().includes(q) ||
        (catMap.get(t.category_id ?? "")?.name ?? "").toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        (qDigits.length > 0 && String(t.amount).replace(/[^0-9]/g, "").includes(qDigits)) ||
        (!Number.isNaN(qNum) && Math.abs(Number(t.amount) - qNum) < 0.005),
      );
    }
    if (catFilter !== "all") list = list.filter((t) => t.category_id === catFilter);
    if (accFilter !== "all") list = list.filter((t) => t.account_id === accFilter);
    if (yearFilter !== "all") list = list.filter((t) => t.date.slice(0, 4) === yearFilter);
    if (monthFilter !== "all") list = list.filter((t) => t.date.slice(5, 7) === monthFilter);
    return list.slice().sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [base, search, catFilter, accFilter, yearFilter, monthFilter, catMap]);

  const total = rows.reduce((s, t) => s + Number(t.amount), 0);
  const hasFilters = !!search || catFilter !== "all" || accFilter !== "all" || yearFilter !== "all" || monthFilter !== "all";
  function clearFilters() {
    setSearch(""); setCatFilter("all"); setAccFilter("all"); setYearFilter("all"); setMonthFilter("all");
  }

  // Edit dialog
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState("");
  const [accId, setAccId] = useState("");
  const [busy, setBusy] = useState(false);

  function startEdit(t: TransactionRow) {
    setEditing(t);
    setAmount(String(t.amount));
    setDate(t.date);
    setDesc(t.description ?? "");
    setCatId(t.category_id ?? "");
    setAccId(t.account_id ?? "");
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido.");
    if (!catId) return toast.error("Selecione a caixinha.");
    if (!accId) return toast.error("Selecione a conta.");
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").update({
        amount: value,
        date,
        description: desc || null,
        category_id: catId,
        account_id: accId,
      }).eq("id", editing.id);
      if (error) throw error;
      invalidate();
      toast.success("Resgate atualizado");
      setEditing(null);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteOp(id: string) {
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      invalidate();
      toast.success("Resgate excluído");
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Resgates"
        description={`${rows.length} resgate(s) • Total ${maskCurrency(total, hidden)}`}
      />

      <div className="flex flex-col gap-3 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por descrição, caixinha ou valor..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Caixinha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas caixinhas</SelectItem>
              {caixinhas.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={accFilter} onValueChange={setAccFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas contas</SelectItem>
              {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos anos</SelectItem>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos meses</SelectItem>
              {monthNames.map((m, i) => <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}><X className="size-4" /> Limpar</Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Nenhum resgate encontrado"
            description="Ao resgatar valores de uma caixinha, o histórico aparece aqui para você editar ou excluir."
          />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              const acc = t.account_id ? accMap.get(t.account_id) : null;
              return (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: (cat?.color ?? "#64748b") + "22", color: cat?.color ?? "#64748b" }}>
                      <ArrowDownRight className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || `Resgate • ${cat?.name ?? "reserva"}`}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cat?.name ?? "Sem caixinha"} → {acc?.name ?? "Sem conta"} • {formatDate(t.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className="text-sm font-semibold tabular text-expense">- {maskCurrency(Number(t.amount), hidden)}</p>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => startEdit(t)} aria-label="Editar">
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDelete onConfirm={() => deleteOp(t.id)}>
                      <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" aria-label="Excluir">
                        <Trash2 className="size-4" />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar resgate</DialogTitle></DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Caixinha</Label>
              <Select value={catId} onValueChange={setCatId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {caixinhas.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Conta creditada</Label>
              <Select value={accId} onValueChange={setAccId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Resgate de reserva" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

export const Route = createFileRoute("/_authenticated/resgates")({
  component: ResgatesPage,
});