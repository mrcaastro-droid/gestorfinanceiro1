import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "Listar categorias",
  description: "Lista categorias (e subcategorias) do usuário.",
  inputSchema: {
    type: z
      .enum(["receita", "despesa", "transferencia", "ambos"])
      .optional()
      .describe("Filtrar por tipo de categoria."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ type }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    let q = supabaseForUser(ctx).from("categories").select("id,name,type,parent_id").order("name");
    if (type) q = q.in("type", [type, "ambos"]);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data);
  },
});