import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrud } from "@/components/simple-crud";
import { Currency } from "@/lib/hide-values";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contas")({
  component: () => (
    <SimpleCrud
      table="accounts"
      title="Contas"
      description="Suas contas bancárias e carteiras"
      singular="Conta"
      icon={Wallet}
      fields={[
        { name: "name", label: "Nome" },
        { name: "bank_id", label: "Banco", type: "select", optionsFrom: "banks", optional: true },
        {
          name: "type",
          label: "Tipo",
          type: "select",
          default: "corrente",
          options: [
            { value: "corrente", label: "Corrente" },
            { value: "poupanca", label: "Poupança" },
            { value: "carteira", label: "Carteira" },
            { value: "dinheiro", label: "Dinheiro" },
            { value: "investimento", label: "Investimento" },
            { value: "outro", label: "Outro" },
          ],
        },
        { name: "initial_balance", label: "Saldo inicial (R$)", type: "number", default: 0 },
        { name: "color", label: "Cor", type: "color", default: "#10b981" },
      ]}
      renderItem={(row) => (
        <div>
          <p className="text-sm font-medium truncate">{String(row.name)}</p>
          <p className="text-xs text-muted-foreground">Saldo atual: <Currency value={Number(row.current_balance)} /></p>
        </div>
      )}
    />
  ),
});