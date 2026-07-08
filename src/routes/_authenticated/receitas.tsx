import { createFileRoute } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

export const Route = createFileRoute("/_authenticated/receitas")({
  component: () => <TransactionsModule type="receita" />,
});