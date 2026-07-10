import { createFileRoute } from "@tanstack/react-router";
import { TransactionsModule } from "@/components/transactions-module";

export const Route = createFileRoute("/_authenticated/transferencias")({
  component: () => <TransactionsModule type="transferencia" />,
});
