import { createFileRoute } from "@tanstack/react-router";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function twiml(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } },
  );
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const HELP =
  "🤖 *Gestor Financeiro*\n\nMe diga o que você gastou ou recebeu que eu registro pra você:\n\n" +
  "• _gastei 50 no mercado_\n• _paguei 120 de luz_\n• _recebi 3000 de salário_\n• _almoço 35 no cartão_\n\n" +
  "Você também pode perguntar:\n• _quanto gastei esse mês?_\n• _qual meu saldo?_";

async function parseMessage(body: string, categories: Array<{ id: string; name: string }>) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const catList = categories.map((c) => c.name).join(", ") || "(nenhuma)";
  const system =
    "Você é um assistente financeiro brasileiro que interpreta mensagens de WhatsApp. " +
    "Responda SEMPRE em JSON válido. Interprete valores em reais (R$). Hoje é " + todayISO() + ". " +
    `Categorias disponíveis do usuário: ${catList}. ` +
    "Campos do JSON: intent ('add' para registrar receita/despesa, 'query' para consultar totais, 'help' caso não entenda), " +
    "type ('receita' ou 'despesa'), amount (número), description (string curta), " +
    "category (escolha o nome MAIS parecido da lista de categorias, ou null), " +
    "is_paid (true se já foi pago/recebido, senão false). " +
    "Ex.: 'gastei 50 no mercado' -> {intent:'add',type:'despesa',amount:50,description:'Mercado',category:'Alimentação',is_paid:true}.";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: body },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { intent: "help" };
  }
}

export const Route = createFileRoute("/api/public/hooks/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const ok =
          (!!token && token === process.env.SUPABASE_PUBLISHABLE_KEY) ||
          (!!token && token === process.env.WHATSAPP_WEBHOOK_TOKEN);
        if (!ok) return new Response("Forbidden", { status: 403 });

        const form = await request.formData();
        const from = String(form.get("From") ?? "").replace("whatsapp:", "").trim();
        const bodyRaw = String(form.get("Body") ?? "").trim();
        if (!from) return twiml("Não consegui identificar seu número.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        // 1) Fluxo de vinculação por código
        const maybeCode = bodyRaw.replace(/vincular/i, "").trim().toUpperCase();
        if (/^[A-Z0-9]{6}$/.test(maybeCode)) {
          const { data: acc } = await (sb.from("whatsapp_accounts") as Row)
            .select("id, user_id")
            .eq("link_code", maybeCode)
            .maybeSingle();
          if (acc) {
            await (sb.from("whatsapp_accounts") as Row)
              .update({ phone: from, verified: true, link_code: null })
              .eq("id", acc.id);
            return twiml("✅ WhatsApp vinculado com sucesso!\n\n" + HELP);
          }
        }

        // 2) Identifica usuário verificado por telefone
        const { data: account } = await (sb.from("whatsapp_accounts") as Row)
          .select("user_id, verified")
          .eq("phone", from)
          .eq("verified", true)
          .maybeSingle();

        if (!account) {
          return twiml(
            "👋 Olá! Seu número ainda não está vinculado a nenhuma conta.\n\n" +
              "Abra o app em *Configurações → WhatsApp*, gere o seu código e me envie aqui para vincular.",
          );
        }

        const userId = account.user_id as string;

        if (!bodyRaw || /^(ajuda|help|oi|olá|ola|menu)$/i.test(bodyRaw)) {
          return twiml(HELP);
        }

        // Carrega categorias do usuário
        const { data: cats } = await (sb.from("categories") as Row)
          .select("id, name")
          .eq("user_id", userId);
        const categories = (cats ?? []) as Array<{ id: string; name: string }>;

        let parsed: Row;
        try {
          parsed = await parseMessage(bodyRaw, categories);
        } catch (e) {
          console.error("parseMessage error", e);
          return twiml("😕 Tive um problema para entender agora. Tente novamente em instantes.");
        }

        if (parsed.intent === "query") {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
          const { data: txs } = await (sb.from("transactions") as Row)
            .select("type, amount")
            .eq("user_id", userId)
            .gte("date", start)
            .lte("date", end);
          let receitas = 0, despesas = 0;
          for (const t of (txs ?? []) as Row[]) {
            if (t.type === "receita") receitas += Number(t.amount);
            else despesas += Number(t.amount);
          }
          return twiml(
            `📊 *Resumo do mês*\n\n🟢 Receitas: ${brl(receitas)}\n🔴 Despesas: ${brl(despesas)}\n💰 Saldo: ${brl(receitas - despesas)}`,
          );
        }

        if (parsed.intent === "add" && Number(parsed.amount) > 0) {
          const type = parsed.type === "receita" ? "receita" : "despesa";
          let categoryId: string | null = null;
          if (parsed.category) {
            const match = categories.find(
              (c) => c.name.toLowerCase() === String(parsed.category).toLowerCase(),
            );
            categoryId = match?.id ?? null;
          }
          const { error } = await (sb.from("transactions") as Row).insert({
            user_id: userId,
            type,
            amount: Number(parsed.amount),
            date: todayISO(),
            description: parsed.description ?? null,
            category_id: categoryId,
            is_paid: parsed.is_paid !== false,
          });
          if (error) {
            console.error("insert transaction error", error);
            return twiml("😕 Não consegui salvar o lançamento. Tente novamente.");
          }
          const emoji = type === "receita" ? "🟢" : "🔴";
          const label = type === "receita" ? "Receita" : "Despesa";
          const catTxt = categoryId ? `\n🏷️ ${parsed.category}` : "";
          return twiml(
            `${emoji} *${label} registrada!*\n\n💵 ${brl(Number(parsed.amount))}\n📝 ${parsed.description ?? "Sem descrição"}${catTxt}`,
          );
        }

        return twiml(HELP);
      },
    },
  },
});
