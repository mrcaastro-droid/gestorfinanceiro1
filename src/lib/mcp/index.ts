import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccounts from "./tools/list-accounts";
import listCategories from "./tools/list-categories";
import listTransactions from "./tools/list-transactions";
import createTransaction from "./tools/create-transaction";
import monthSummary from "./tools/month-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gestor-financeiro-mcp",
  title: "Gestor Financeiro",
  version: "0.1.0",
  instructions:
    "Ferramentas para gerenciar as finanças pessoais do usuário no Gestor Financeiro: listar contas, categorias e transações, registrar receitas/despesas/transferências e consultar o resumo mensal. Valores em BRL.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAccounts, listCategories, listTransactions, createTransaction, monthSummary],
});