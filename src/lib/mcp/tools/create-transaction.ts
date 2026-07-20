import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "create_transaction",
  title: "Registrar transação",
  description:
    "Cria uma receita, despesa ou transferência para o usuário autenticado. Use list_accounts e list_categories primeiro para obter os IDs corretos.",
  inputSchema: {
    type: z.enum(["receita", "despesa", "transferencia"]),
    amount: z.number().positive().describe("Valor em reais."),
    date: z.string().optional().describe("Data no formato AAAA-MM-DD. Padrão: hoje."),
    description: z.string().optional(),
    account_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    is_paid: z.boolean().optional().describe("Se já foi pago/recebido. Padrão: true."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const row = {
      user_id: ctx.getUserId(),
      type: input.type,
      amount: input.amount,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      description: input.description ?? null,
      account_id: input.account_id ?? null,
      category_id: input.category_id ?? null,
      is_paid: input.is_paid ?? true,
    };
    const { data, error } = await supabaseForUser(ctx).from("transactions").insert(row).select().single();
    if (error) return errorResult(error.message);
    return textResult({ ok: true, transaction: data }, { transaction: data });
  },
});