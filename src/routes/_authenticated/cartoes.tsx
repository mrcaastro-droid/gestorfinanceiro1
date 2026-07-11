import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrud } from "@/components/simple-crud";
import { Currency } from "@/lib/hide-values";
import { CreditCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cartoes")({
  component: () => (
    <SimpleCrud
      table="cards"
      title="Cartões de crédito"
      description="Gerencie seus cartões, limites e datas"
      singular="Cartão"
      icon={CreditCard}
      fields={[
        { name: "name", label: "Nome" },
        { name: "brand", label: "Bandeira", optional: true },
        { name: "limit_amount", label: "Limite (R$)", type: "number", default: 0 },
        { name: "closing_day", label: "Dia de fechamento", type: "number", default: 1 },
        { name: "due_day", label: "Dia de vencimento", type: "number", default: 10 },
        { name: "best_purchase_day", label: "Melhor dia de compra", type: "number", optional: true },
        { name: "color", label: "Cor", type: "color", default: "#6366f1" },
      ]}
      renderItem={(row) => (
        <div>
          <p className="text-sm font-medium truncate">{String(row.name)} {row.brand ? `• ${row.brand}` : ""}</p>
          <p className="text-xs text-muted-foreground">Limite: <Currency value={Number(row.limit_amount)} /> • Vence dia {String(row.due_day)}</p>
        </div>
      )}
    />
  ),
});