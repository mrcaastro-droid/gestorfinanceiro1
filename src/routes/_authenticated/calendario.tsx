import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useList, type TransactionRow } from "@/lib/finance";
import { formatCurrency, monthLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/calendario")({ component: CalendarPage });

const WD = ["D", "S", "T", "Q", "Q", "S", "S"];

function CalendarPage() {
  const { data: transactions } = useList<TransactionRow>("transactions", { orderBy: "date" });
  const [ref, setRef] = useState(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, TransactionRow[]>();
    (transactions ?? []).forEach((t) => {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    });
    return map;
  }, [transactions]);

  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const startPad = first.getDay();
  const days = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <PageContainer>
      <PageHeader
        title="Calendário financeiro"
        description={monthLabel(ref)}
        actions={
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
          </div>
        }
      />
      <div className="bg-card border border-border rounded-2xl p-3 md:p-5">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WD.map((d, i) => <div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const iso = new Date(ref.getFullYear(), ref.getMonth(), day).toISOString().slice(0, 10);
            const items = byDay.get(iso) ?? [];
            const rec = items.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
            const exp = items.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
            return (
              <div key={i} className="min-h-16 md:min-h-20 rounded-lg border border-border p-1.5 text-xs">
                <span className="font-medium">{day}</span>
                {rec > 0 && <p className="text-income tabular truncate mt-0.5">+{formatCurrency(rec)}</p>}
                {exp > 0 && <p className="text-expense tabular truncate">-{formatCurrency(exp)}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}