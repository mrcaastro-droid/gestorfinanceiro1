import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_accounts",
  title: "Listar contas",
  description: "Lista as contas bancárias do usuário com saldo atual.",
  inputSchema: {
    include_archived: z.boolean().optional().describe("Incluir contas arquivadas. Padrão: false."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_archived }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    let q = supabaseForUser(ctx).from("accounts").select("id,name,type,current_balance,archived").order("name");
    if (!include_archived) q = q.eq("archived", false);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data);
  },
});