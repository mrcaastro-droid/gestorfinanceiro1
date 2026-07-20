import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_transactions",
  title: "Listar transações",
  description:
    "Lista transações do usuário. Aceita filtros opcionais por tipo, intervalo de datas (ISO AAAA-MM-DD), categoria, conta e status de pagamento.",
  inputSchema: {
    type: z.enum(["receita", "despesa", "transferencia"]).optional(),
    from: z.string().optional().describe("Data inicial (AAAA-MM-DD)"),
    to: z.string().optional().describe("Data final (AAAA-MM-DD)"),
    category_id: z.string().uuid().optional(),
    account_id: z.string().uuid().optional(),
    is_paid: z.boolean().optional(),
    limit: z.number().int().positive().optional().describe("Máx. resultados (padrão 50, máximo 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const limit = Math.min(input.limit ?? 50, 200);
    let q = supabaseForUser(ctx)
      .from("transactions")
      .select("id,type,amount,date,description,category_id,account_id,is_paid")
      .order("date", { ascending: false })
      .limit(limit);
    if (input.type) q = q.eq("type", input.type);
    if (input.from) q = q.gte("date", input.from);
    if (input.to) q = q.lte("date", input.to);
    if (input.category_id) q = q.eq("category_id", input.category_id);
    if (input.account_id) q = q.eq("account_id", input.account_id);
    if (typeof input.is_paid === "boolean") q = q.eq("is_paid", input.is_paid);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data);
  },
});