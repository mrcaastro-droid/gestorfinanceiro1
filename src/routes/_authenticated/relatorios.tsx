import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useList, type TransactionRow, type CategoryRow, type AccountRow } from "@/lib/finance";
import { formatCurrency, formatCompact } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownRight, ArrowUpRight, Scale, PiggyBank, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: ReportsPage });

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const PALETTE = ["#10b981", "#6366f1", "#f43f5e", "#f59e0b", "#0ea5e9", "#a855f7", "#14b8a6", "#ec4899", "#84cc16", "#f97316", "#8b5cf6", "#06b6d4"];

type TypeFilter = "todos" | "despesa" | "receita" | "transferencia";

function ReportsPage() {
  const { data: transactions } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: categories } = useList<CategoryRow>("categories");
  const { data: accounts } = useList<AccountRow>("accounts");
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const years = useMemo(() => {
    const set = new Set<number>();
    (transactions ?? []).forEach((t) => set.add(new Date(t.date + "T00:00:00").getFullYear()));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<string>("todos"); // "todos" | "0".."11"
  const [categoryId, setCategoryId] = useState<string>("todas"); // id | "todas" | "sem"
  const [accountId, setAccountId] = useState<string>("todas");
  const [type, setType] = useState<TypeFilter>("todos");

  // Resolve a set of category ids that match the filter (a parent selection includes its children).
  const matchedCatIds = useMemo(() => {
    if (categoryId === "todas" || categoryId === "sem") return null;
    const ids = new Set<string>([categoryId]);
    (categories ?? []).forEach((c) => { if (c.parent_id === categoryId) ids.add(c.id); });
    return ids;
  }, [categoryId, categories]);

  // Filtered by everything EXCEPT month (used for the year overview chart).
  const yearRows = useMemo(() => {
    return (transactions ?? []).filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      if (d.getFullYear() !== year) return false;
      if (type !== "todos" && t.type !== type) return false;
      if (accountId !== "todas" && t.account_id !== accountId) return false;
      if (categoryId === "sem") { if (t.category_id) return false; }
      else if (matchedCatIds && (!t.category_id || !matchedCatIds.has(t.category_id))) return false;
      return true;
    });
  }, [transactions, year, type, accountId, categoryId, matchedCatIds]);

  // Filtered by everything INCLUDING month (used for KPIs and category breakdown).
  const rows = useMemo(() => {
    if (month === "todos") return yearRows;
    const m = Number(month);
    return yearRows.filter((t) => new Date(t.date + "T00:00:00").getMonth() === m);
  }, [yearRows, month]);

  const totals = useMemo(() => {
    const rec = rows.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const exp = rows.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const transf = rows.filter((t) => t.type === "transferencia").reduce((s, t) => s + Number(t.amount), 0);
    return { rec, exp, transf, saldo: rec - exp, rate: rec > 0 ? ((rec - exp) / rec) * 100 : 0 };
  }, [rows]);

  // Monthly cash flow across the whole year (respects category/account/type filters).
  const monthly = useMemo(() => MONTHS.map((m, idx) => {
    const mr = yearRows.filter((t) => new Date(t.date + "T00:00:00").getMonth() === idx);
    const Receitas = mr.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const Despesas = mr.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const Transferido = mr.filter((t) => t.type === "transferencia").reduce((s, t) => s + Number(t.amount), 0);
    return { mes: m, Receitas, Despesas, Transferido, Saldo: Receitas - Despesas };
  }), [yearRows]);

  // Cumulative balance evolution.
  const cumulative = useMemo(() => {
    let acc = 0;
    return monthly.map((m) => { acc += m.Saldo; return { mes: m.mes, Acumulado: acc }; });
  }, [monthly]);

  // Breakdown by category (aggregating subcategories under their parent) for the selected period.
  const byCategory = useMemo(() => {
    const targetType = type === "todos" ? "despesa" : type;
    const map = new Map<string, { name: string; value: number; color: string }>();
    rows.filter((t) => t.type === targetType).forEach((t) => {
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const parent = cat?.parent_id ? catMap.get(cat.parent_id) : null;
      const top = parent ?? cat;
      const keyId = top?.id ?? "sem";
      const name = top?.name ?? "Sem categoria";
      const color = top?.color ?? "#94a3b8";
      const prev = map.get(keyId);
      map.set(keyId, { name, color, value: (prev?.value ?? 0) + Number(t.amount) });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [rows, catMap, type]);

  const catTotal = byCategory.reduce((s, c) => s + c.value, 0);

  // Breakdown by subcategory (individual leaf categories) for the selected period.
  const bySubcategory = useMemo(() => {
    const targetType = type === "todos" ? "despesa" : type;
    const map = new Map<string, { name: string; value: number; color: string }>();
    rows.filter((t) => t.type === targetType && t.category_id).forEach((t) => {
      const cat = catMap.get(t.category_id as string);
      if (!cat || !cat.parent_id) return; // only real subcategories
      const parent = catMap.get(cat.parent_id);
      const name = `${parent?.name ?? "?"} › ${cat.name}`;
      const color = cat.color ?? parent?.color ?? "#94a3b8";
      const prev = map.get(cat.id);
      map.set(cat.id, { name, color, value: (prev?.value ?? 0) + Number(t.amount) });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [rows, catMap, type]);

  const subTotal = bySubcategory.reduce((s, c) => s + c.value, 0);
  const periodLabel = month === "todos" ? `Ano de ${year}` : `${MONTHS_FULL[Number(month)]} de ${year}`;
  const breakdownLabel = type === "receita" ? "Receitas" : type === "transferencia" ? "Transferências" : "Despesas";
  const hasTransfers = monthly.some((m) => m.Transferido > 0);

  return (
    <PageContainer>
      <PageHeader title="Relatórios" description={`Análise financeira — ${periodLabel}`} />

      {/* Filtros */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <FilterField label="Ano">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Mês">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Ano inteiro</SelectItem>
              {MONTHS_FULL.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Categoria">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="sem">Sem categoria</SelectItem>
              {(categories ?? []).filter((c) => !c.parent_id).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Conta">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Tipo">
          <Select value={type} onValueChange={(v) => setType(v as TypeFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Tudo</SelectItem>
              <SelectItem value="despesa">Despesas</SelectItem>
              <SelectItem value="receita">Receitas</SelectItem>
              <SelectItem value="transferencia">Transferências</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard icon={ArrowUpRight} label="Receitas" value={totals.rec} tone="income" />
        <KpiCard icon={ArrowDownRight} label="Despesas" value={totals.exp} tone="expense" />
        <KpiCard icon={ArrowLeftRight} label="Transferido" value={totals.transf} tone="neutral" />
        <KpiCard icon={Scale} label="Saldo" value={totals.saldo} tone={totals.saldo >= 0 ? "income" : "expense"} />
        <KpiCard icon={PiggyBank} label="Taxa de economia" value={totals.rate} tone="neutral" isPercent />
      </div>

      {/* Fluxo de caixa mensal */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="font-semibold mb-4">Fluxo de caixa mensal — {year}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
            <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} />
            <Tooltip formatter={(v: number) => formatCurrency(Number(v))} cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Receitas" fill="var(--income)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Despesas" fill="var(--expense)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Transferências / Reservas por mês */}
      {hasTransfers && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Transferências / Reservas por mês — {year}</h3>
            <span className="text-sm text-muted-foreground tabular">{formatCurrency(totals.transf)}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
              <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} />
              <Tooltip formatter={(v: number) => formatCurrency(Number(v))} cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={tooltipStyle} />
              <Bar dataKey="Transferido" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Donut por categoria */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">{breakdownLabel} por categoria</h3>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">Sem dados para o período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={65} outerRadius={110} paddingAngle={2} strokeWidth={0}>
                  {byCategory.map((c, i) => <Cell key={c.name} fill={c.color || PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(Number(v))} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Evolução do saldo acumulado */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Evolução do saldo acumulado</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={cumulative}>
              <defs>
                <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
              <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} />
              <Tooltip formatter={(v: number) => formatCurrency(Number(v))} contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="Acumulado" stroke="var(--primary)" strokeWidth={2} fill="url(#accGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Despesas por subcategoria */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{type === "receita" ? "Receitas" : "Despesas"} por subcategoria</h3>
          <span className="text-sm text-muted-foreground tabular">{formatCurrency(subTotal)}</span>
        </div>
        {bySubcategory.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum lançamento em subcategorias no período. Cadastre subcategorias em Configurações e vincule-as aos lançamentos.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, bySubcategory.length * 38)}>
            <BarChart data={bySubcategory} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} />
              <YAxis type="category" dataKey="name" width={160} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatCurrency(Number(v))} cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {bySubcategory.map((c, i) => <Cell key={c.name} fill={c.color || PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ranking de categorias */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Ranking por categoria</h3>
          <span className="text-sm text-muted-foreground tabular">{formatCurrency(catTotal)}</span>
        </div>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para o período.</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map((c, i) => {
              const pct = catTotal > 0 ? (c.value / catTotal) * 100 : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color || PALETTE[i % PALETTE.length] }} />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="tabular font-medium shrink-0 ml-3">{formatCurrency(c.value)} <span className="text-muted-foreground">· {pct.toFixed(0)}%</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color || PALETTE[i % PALETTE.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone, isPercent }: {
  icon: typeof ArrowUpRight; label: string; value: number; tone: "income" | "expense" | "neutral"; isPercent?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("size-8 rounded-lg grid place-items-center",
          tone === "income" && "bg-income/10 text-income",
          tone === "expense" && "bg-expense/10 text-expense",
          tone === "neutral" && "bg-primary/10 text-primary")}>
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn("text-xl font-bold tabular",
        tone === "income" && "text-income", tone === "expense" && "text-expense")}>
        {isPercent ? `${value.toFixed(0)}%` : formatCurrency(value)}
      </p>
    </div>
  );
}