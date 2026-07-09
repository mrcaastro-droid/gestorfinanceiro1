import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CalendarClock,
  Target,
  Eye,
  EyeOff,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useList, useAutoGenerateRecurring, type TransactionRow, type AccountRow, type CategoryRow, type GoalRow, type InvestmentRow } from "@/lib/finance";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function useHideValues() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("dashboard.hide-values") === "true";
  });
  useEffect(() => {
    window.localStorage.setItem("dashboard.hide-values", String(hidden));
  }, [hidden]);
  return { hidden, toggle: () => setHidden((v) => !v) };
}

function maskCurrency(value: number, hidden: boolean) {
  if (!hidden) return formatCurrency(value);
  const formatted = formatCurrency(value);
  const digits = formatted.replace(/\D/g, "").length;
  return "R$ " + "•".repeat(Math.max(4, digits));
}

function Dashboard() {
  useAutoGenerateRecurring();
  const { data: transactions, isLoading } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: accounts } = useList<AccountRow>("accounts");
  const { data: categories } = useList<CategoryRow>("categories");
  const { data: goals } = useList<GoalRow>("goals");
  const { data: investments } = useList<InvestmentRow>("investments");
  const { hidden, toggle } = useHideValues();

  const now = new Date();
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const metrics = useMemo(() => {
    const txs = transactions ?? [];
    const monthTxs = txs.filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const receitas = monthTxs.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesas = monthTxs.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const saldo = (accounts ?? []).reduce((s, a) => s + Number(a.current_balance), 0);
    const invest = (investments ?? []).reduce((s, i) => s + Number(i.current_value), 0);
    return { receitas, despesas, economia: receitas - despesas, saldo, patrimonio: saldo + invest };
  }, [transactions, accounts, investments, now]);

  const monthlyChart = useMemo(() => {
    const arr: { mes: string; Receitas: number; Despesas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const rows = (transactions ?? []).filter((t) => {
        const td = new Date(t.date + "T00:00:00");
        return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
      });
      arr.push({
        mes: MONTHS[d.getMonth()],
        Receitas: rows.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0),
        Despesas: rows.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0),
      });
    }
    return arr;
  }, [transactions, now]);

  const categoryChart = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    (transactions ?? [])
      .filter((t) => {
        const d = new Date(t.date + "T00:00:00");
        return t.type === "despesa" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .forEach((t) => {
        const cat = t.category_id ? catMap.get(t.category_id) : null;
        const key = cat?.id ?? "sem";
        const prev = map.get(key);
        map.set(key, {
          name: cat?.name ?? "Sem categoria",
          color: cat?.color ?? "#64748b",
          value: (prev?.value ?? 0) + Number(t.amount),
        });
      });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [transactions, catMap, now]);

  const recent = (transactions ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const todayISO = now.toISOString().slice(0, 10);
  const upcoming = (transactions ?? [])
    .filter((t) => t.type === "despesa" && !t.is_paid && t.date >= todayISO)
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(0, 5);
  const overdue = (transactions ?? []).filter((t) => t.type === "despesa" && !t.is_paid && t.date < todayISO);

  return (
    <PageContainer>
      <PageHeader
        title="Visão Geral"
        description="Seu panorama financeiro do mês"
        actions={
          <button
            onClick={toggle}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-border bg-card hover:bg-accent transition-colors"
            aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
            title={hidden ? "Mostrar valores" : "Ocultar valores"}
          >
            {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            <span className="hidden sm:inline">{hidden ? "Mostrar" : "Ocultar"}</span>
          </button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Wallet} label="Saldo atual" value={metrics.saldo} hidden={hidden} />
          <StatCard icon={TrendingUp} label="Receitas do mês" value={metrics.receitas} tone="income" hidden={hidden} />
          <StatCard icon={TrendingDown} label="Despesas do mês" value={metrics.despesas} tone="expense" hidden={hidden} />
          <StatCard icon={PiggyBank} label="Economia do mês" value={metrics.economia} tone={metrics.economia >= 0 ? "income" : "expense"} hidden={hidden} />
          <StatCard icon={Landmark} label="Patrimônio total" value={metrics.patrimonio} highlight hidden={hidden} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Receitas x Despesas">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} className="opacity-30" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="currentColor" className="text-muted-foreground" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" className="text-muted-foreground" tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receitas" fill="var(--income)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="var(--expense)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Últimos lançamentos" action={<Link to="/despesas" className="text-xs text-primary font-medium hover:underline">Ver todos</Link>}>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lançamento ainda.</p>
            ) : (
              <div className="divide-y divide-border -mx-5">
                {recent.map((t) => {
                  const cat = t.category_id ? catMap.get(t.category_id) : null;
                  return (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: (cat?.color ?? "#64748b") + "22", color: cat?.color ?? "#64748b" }}>
                          {t.type === "receita" ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.description || cat?.name || "Lançamento"}</p>
                          <p className="text-xs text-muted-foreground truncate">{cat?.name ?? "Sem categoria"} • {formatDateShort(t.date)}</p>
                        </div>
                      </div>
                      <p className={`text-sm font-semibold tabular ${t.type === "receita" ? "text-income" : "text-expense"}`}>
                        {t.type === "receita" ? "+" : "-"} {formatCurrency(Number(t.amount))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Gastos por categoria">
            {categoryChart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem despesas neste mês.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {categoryChart.map((c, i) => (
                        <Cell key={i} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-3">
                  {categoryChart.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="truncate text-muted-foreground">{c.name}</span>
                      </div>
                      <span className="tabular font-medium">{formatCurrency(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {overdue.length > 0 && (
            <Card title="Contas vencidas">
              <div className="space-y-3">
                {overdue.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <AlertTriangle className="size-4 text-expense shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || "Despesa"}</p>
                      <p className="text-[11px] text-expense uppercase">Venceu em {formatDateShort(t.date)}</p>
                    </div>
                    <p className="text-sm font-semibold tabular">{formatCurrency(Number(t.amount))}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Próximas contas">
            {upcoming.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <CalendarClock className="size-4" /> Nenhuma conta a vencer.
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description || "Despesa"}</p>
                      <p className="text-[11px] text-muted-foreground uppercase">Vence em {formatDateShort(t.date)}</p>
                    </div>
                    <p className="text-sm font-semibold tabular">{formatCurrency(Number(t.amount))}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Metas financeiras" action={<Link to="/metas" className="text-xs text-primary font-medium hover:underline">Ver</Link>}>
            {(goals ?? []).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Target className="size-4" /> Crie sua primeira meta.
              </div>
            ) : (
              <div className="space-y-4">
                {(goals ?? []).slice(0, 4).map((g) => {
                  const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between mb-1.5 text-sm">
                        <span className="truncate">{g.name}</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  highlight,
  hidden,
}: {
  icon: typeof Wallet;
  label: string;
  value: number;
  tone?: "income" | "expense";
  highlight?: boolean;
  hidden?: boolean;
}) {
  const valueColor = highlight ? "text-primary-foreground" : tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-foreground";
  return (
    <div className={`p-5 rounded-2xl border ${highlight ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border"}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-medium uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</p>
        <Icon className={`size-4 ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`} />
      </div>
      <p className={`text-xl md:text-2xl font-bold tabular ${valueColor}`}>{maskCurrency(value, !!hidden)}</p>
    </div>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-medium mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular">{formatCurrency(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}