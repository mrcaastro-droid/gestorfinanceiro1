import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrud } from "@/components/simple-crud";
import { formatCurrency } from "@/lib/format";
import { Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recorrencias")({
  component: () => (
    <SimpleCrud
      table="recurring_rules"
      title="Recorrências"
      description="Contas fixas e receitas recorrentes"
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
        { name: "next_run", label: "Próxima geração", type: "date" },
      ]}
      renderItem={(row) => (
        <div>
          <p className="text-sm font-medium truncate">{String(row.name)}</p>
          <p className="text-xs text-muted-foreground">{String(row.type) === "receita" ? "Receita" : "Despesa"} • {formatCurrency(Number(row.amount))} • {String(row.frequency)}</p>
        </div>
      )}
    />
  ),
});