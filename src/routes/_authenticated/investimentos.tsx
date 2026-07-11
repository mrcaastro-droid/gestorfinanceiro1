import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrud } from "@/components/simple-crud";
import { Currency } from "@/lib/hide-values";
import { LineChart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/investimentos")({
  component: () => (
    <SimpleCrud
      table="investments"
      title="Investimentos"
      description="Sua carteira de investimentos"
      singular="Investimento"
      icon={LineChart}
      fields={[
        { name: "name", label: "Nome" },
        { name: "ticker", label: "Ticker", optional: true },
        { name: "type_id", label: "Tipo", type: "select", optionsFrom: "investment_types", optional: true },
        { name: "quantity", label: "Quantidade", type: "number", default: 0 },
        { name: "invested_amount", label: "Valor investido (R$)", type: "number", default: 0 },
        { name: "avg_price", label: "Preço médio", type: "number", default: 0 },
        { name: "current_value", label: "Valor atual (R$)", type: "number", default: 0 },
      ]}
      renderItem={(row) => {
        const invested = Number(row.invested_amount);
        const current = Number(row.current_value);
        const rent = invested > 0 ? ((current - invested) / invested) * 100 : 0;
        return (
          <div>
            <p className="text-sm font-medium truncate">{String(row.name)} {row.ticker ? `• ${row.ticker}` : ""}</p>
            <p className="text-xs text-muted-foreground">
              <Currency value={current} /> • <span className={rent >= 0 ? "text-income" : "text-expense"}>{rent >= 0 ? "+" : ""}{rent.toFixed(2)}%</span>
            </p>
          </div>
        );
      }}
    />
  ),
});