import { useMemo, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { TransactionDialog } from "@/components/transaction-dialog";
import { useList, useRemove, type TransactionRow, type CategoryRow, type AccountRow } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/format";
import { useHideValues, maskCurrency } from "@/lib/hide-values";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  MoreVertical,
  X,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type MovType = "receita" | "despesa" | "transferencia";

const MOV_CONFIG = {
  receita: { title: "Receitas", singular: "receita", Icon: TrendingUp, RowIcon: ArrowUpRight, tone: "text-income", sign: "+" },
  despesa: { title: "Despesas", singular: "despesa", Icon: TrendingDown, RowIcon: ArrowDownRight, tone: "text-expense", sign: "-" },
  transferencia: { title: "Transferências", singular: "transferência", Icon: ArrowLeftRight, RowIcon: ArrowLeftRight, tone: "text-foreground", sign: "" },
} as const;

export function TransactionsModule({ type }: { type: MovType }) {
  const qc = useQueryClient();
  const { hidden } = useHideValues();
  const { data: transactions, isLoading } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: categories } = useList<CategoryRow>("categories");
  const { data: accounts } = useList<AccountRow>("accounts");
  const remove = useRemove("transactions");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("date");

  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const accMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  const cats = useMemo(
    () =>
      (categories ?? []).filter((c) =>
        type === "transferencia" ? c.type === "transferencia" : c.type === type || c.type === "ambos",
      ),
    [categories, type],
  );
  const parentCats = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const subCats = useMemo(
    () => (catFilter === "all" ? [] : cats.filter((c) => c.parent_id === catFilter)),
    [cats, catFilter],
  );

  const years = useMemo(() => {
    const set = new Set(
      (transactions ?? []).filter((t) => t.type === type).map((t) => t.date.slice(0, 4)),
    );
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions, type]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const rows = useMemo(() => {
    let list = (transactions ?? []).filter((t) => t.type === type);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.notes ?? "").toLowerCase().includes(q) ||
          (catMap.get(t.category_id ?? "")?.name ?? "").toLowerCase().includes(q),
      );
    }
    if (catFilter !== "all") {
      list = list.filter((t) => {
        if (t.category_id === catFilter) return true;
        const parent = catMap.get(t.category_id ?? "")?.parent_id;
        return parent === catFilter;
      });
    }
    if (subFilter !== "all") list = list.filter((t) => t.category_id === subFilter);
    if (yearFilter !== "all") list = list.filter((t) => t.date.slice(0, 4) === yearFilter);
    if (monthFilter !== "all") list = list.filter((t) => t.date.slice(5, 7) === monthFilter);
    if (statusFilter !== "all") list = list.filter((t) => (statusFilter === "paid" ? t.is_paid : !t.is_paid));
    list = list.slice().sort((a, b) => {
      if (sort === "amount") return Number(b.amount) - Number(a.amount);
      if (sort === "description") return (a.description ?? "").localeCompare(b.description ?? "");
      return a.date > b.date ? -1 : 1;
    });
    return list;
  }, [transactions, type, search, catFilter, subFilter, yearFilter, monthFilter, statusFilter, sort, catMap]);

  const total = rows.reduce((s, t) => s + Number(t.amount), 0);

  const hasFilters =
    catFilter !== "all" || subFilter !== "all" || yearFilter !== "all" || monthFilter !== "all" || statusFilter !== "all" || !!search;

  function clearFilters() {
    setSearch("");
    setCatFilter("all");
    setSubFilter("all");
    setYearFilter("all");
    setMonthFilter("all");
    setStatusFilter("all");
  }

  async function duplicate(t: TransactionRow) {
    const { id, installment_group, installment_number, installment_total, ...rest } = t;
    void id;
    void installment_group;
    void installment_number;
    void installment_total;
    const { error } = await supabase.from("transactions").insert({ ...rest, date: t.date });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    toast.success("Lançamento duplicado");
  }

  const cfg = MOV_CONFIG[type];
  const Icon = cfg.Icon;

  return (
    <PageContainer>
      <PageHeader
        title={cfg.title}
        description={`${rows.length} lançamento(s) • Total ${maskCurrency(total, hidden)}`}
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="size-4" /> Nova
          </Button>
        }
      />

      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar..." className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accFilter} onValueChange={setAccFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="Conta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas contas</SelectItem>
            {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="sm:w-32"><SelectValue placeholder="Ano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos anos</SelectItem>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos meses</SelectItem>
            {monthNames.map((m, i) => (
              <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas situações</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Data</SelectItem>
            <SelectItem value="amount">Valor</SelectItem>
            <SelectItem value="description">Descrição</SelectItem>
          </SelectContent>
        </Select>
        {(catFilter !== "all" || accFilter !== "all" || yearFilter !== "all" || monthFilter !== "all" || statusFilter !== "all" || search) && (
          <Button
            variant="ghost"
            onClick={() => { setSearch(""); setCatFilter("all"); setAccFilter("all"); setYearFilter("all"); setMonthFilter("all"); setStatusFilter("all"); }}
          >
            <X className="size-4" /> Limpar
          </Button>
        )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={`Nenhuma ${cfg.singular} encontrada`}
            description="Comece adicionando seu primeiro lançamento."
            action={<Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-4" /> Nova {cfg.singular}</Button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              const acc = t.account_id ? accMap.get(t.account_id) : null;
              const destAcc = t.transfer_account_id ? accMap.get(t.transfer_account_id) : null;
              return (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: (cat?.color ?? "#64748b") + "22", color: cat?.color ?? "#64748b" }}>
                      <cfg.RowIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || cat?.name || "Lançamento"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {type === "transferencia"
                          ? `${acc?.name ?? "?"} → ${destAcc?.name ?? "?"}`
                          : `${cat?.name ?? "Sem categoria"} • ${acc?.name ?? "Sem conta"}`} • {formatDate(t.date)}
                        {!t.is_paid && <span className="text-amber-500"> • Pendente</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className={`text-sm font-semibold tabular ${cfg.tone}`}>
                      {cfg.sign} {maskCurrency(Number(t.amount), hidden)}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8"><MoreVertical className="size-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing(t); setDialogOpen(true); }}>
                          <Pencil className="size-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(t)}>
                          <Copy className="size-4" /> Duplicar
                        </DropdownMenuItem>
                        <ConfirmDelete onConfirm={() => remove.mutate(t.id)}>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                            <Trash2 className="size-4" /> Excluir
                          </DropdownMenuItem>
                        </ConfirmDelete>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} type={type} editing={editing} />
    </PageContainer>
  );
}