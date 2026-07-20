import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "month_summary",
  title: "Resumo mensal",
  description: "Retorna totais de receitas, despesas e transferências do mês informado (ou mês atual).",
  inputSchema: {
    year: z.number().int().optional(),
    month: z.number().int().min(1).max(12).optional().describe("1-12"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year, month }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .select("type,amount")
      .gte("date", from)
      .lte("date", to);
    if (error) return errorResult(error.message);
    const totals = { receita: 0, despesa: 0, transferencia: 0 };
    for (const r of data ?? []) {
      const t = r.type as keyof typeof totals;
      if (t in totals) totals[t] += Number(r.amount);
    }
    const saldo = totals.receita - totals.despesa;
    return textResult({ year: y, month: m, from, to, totals, saldo });
  },
});