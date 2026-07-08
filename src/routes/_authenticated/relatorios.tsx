import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useList, type TransactionRow, type CategoryRow } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: ReportsPage });

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function ReportsPage() {
  const { data: transactions } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const { data: categories } = useList<CategoryRow>("categories");
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const year = new Date().getFullYear();

  const monthly = useMemo(() => {
    return MONTHS.map((m, idx) => {
      const rows = (transactions ?? []).filter((t) => {
        const d = new Date(t.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === idx;
      });
      return {
        mes: m,
        Receitas: rows.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0),
        Despesas: rows.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [transactions, year]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    (transactions ?? []).filter((t) => t.type === "despesa").forEach((t) => {
      const name = t.category_id ? catMap.get(t.category_id)?.name ?? "Sem categoria" : "Sem categoria";
      map.set(name, (map.get(name) ?? 0) + Number(t.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions, catMap]);

  const totalRec = monthly.reduce((s, m) => s + m.Receitas, 0);
  const totalExp = monthly.reduce((s, m) => s + m.Despesas, 0);

  return (
    <PageContainer>
      <PageHeader title="Relatórios" description={`Resumo anual de ${year}`} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-2xl p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Receitas no ano</p><p className="text-xl font-bold text-income tabular">{formatCurrency(totalRec)}</p></div>
        <div className="bg-card border border-border rounded-2xl p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Despesas no ano</p><p className="text-xl font-bold text-expense tabular">{formatCurrency(totalExp)}</p></div>
        <div className="bg-card border border-border rounded-2xl p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Saldo do ano</p><p className="text-xl font-bold tabular">{formatCurrency(totalRec - totalExp)}</p></div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="font-semibold mb-4">Fluxo de caixa mensal</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
            <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
            <Bar dataKey="Receitas" fill="var(--income)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Despesas" fill="var(--expense)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Despesas por categoria</h3>
        <div className="space-y-2">
          {byCategory.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados.</p> : byCategory.map((c) => (
            <div key={c.name} className="flex justify-between text-sm"><span className="text-muted-foreground">{c.name}</span><span className="tabular font-medium">{formatCurrency(c.value)}</span></div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}