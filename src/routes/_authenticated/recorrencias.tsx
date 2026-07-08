import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { SimpleCrud } from "@/components/simple-crud";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { useGenerateRecurring } from "@/lib/finance";
import { Repeat, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recorrencias")({
  component: Recorrencias,
});

function Recorrencias() {
  const gen = useGenerateRecurring();

  function generate() {
    gen.mutate(undefined, {
      onSuccess: (res) => {
        const n = res?.created ?? 0;
        toast.success(n > 0 ? `${n} lançamento(s) gerado(s)` : "Tudo em dia, nada a gerar");
      },
      onError: (e: Error) => toast.error(e.message ?? "Erro ao gerar lançamentos"),
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Recorrências"
        description="Contas fixas e receitas que se repetem todo mês. Elas viram lançamentos pendentes e aparecem em 'Próximas contas'."
        actions={
          <Button variant="outline" onClick={generate} disabled={gen.isPending}>
            <RefreshCw className={`size-4 ${gen.isPending ? "animate-spin" : ""}`} /> Gerar lançamentos
          </Button>
        }
      />
      <SimpleCrud
        embedded
        table="recurring_rules"
        title="Suas recorrências"
        singular="Recorrência"
        icon={Repeat}
        fields={[
          { name: "name", label: "Nome" },
          { name: "type", label: "Tipo", type: "select", default: "despesa", options: [{ value: "receita", label: "Receita" }, { value: "despesa", label: "Despesa" }] },
          { name: "amount", label: "Valor (R$)", type: "number", default: 0 },
          { name: "category_id", label: "Categoria", type: "select", optionsFrom: "categories", optional: true },
          { name: "account_id", label: "Conta", type: "select", optionsFrom: "accounts", optional: true },
          { name: "frequency", label: "Frequência", type: "select", default: "mensal", options: [{ value: "semanal", label: "Semanal" }, { value: "mensal", label: "Mensal" }, { value: "bimestral", label: "Bimestral" }, { value: "trimestral", label: "Trimestral" }, { value: "semestral", label: "Semestral" }, { value: "anual", label: "Anual" }] },
          { name: "day_of_month", label: "Dia do vencimento", type: "number", default: 1 },
          { name: "next_run", label: "A partir de", type: "date" },
        ]}
        renderItem={(row) => (
          <div>
            <p className="text-sm font-medium truncate">{String(row.name)}</p>
            <p className="text-xs text-muted-foreground">{String(row.type) === "receita" ? "Receita" : "Despesa"} • {formatCurrency(Number(row.amount))} • {String(row.frequency)} • dia {String(row.day_of_month)}</p>
          </div>
        )}
      />
    </PageContainer>
  );
}
