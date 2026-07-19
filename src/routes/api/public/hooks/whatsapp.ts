import { createFileRoute } from "@tanstack/react-router";

type Row = Record<string, any>;

const GEMINI_MODEL = "gemini-2.0-flash";
const META_API_VERSION = "v22.0";

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

async function sendMetaMessage(to: string, body: string) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error("Meta WhatsApp não configurado");
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Meta send failed [${res.status}]: ${t}`);
  }
}

async function parseMessage(body: string, categories: Array<{ id: string; name: string }>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");
  const catList = categories.map((c) => c.name).join(", ") || "(nenhuma)";
  const prompt =
    "Você é um assistente financeiro brasileiro que interpreta mensagens de WhatsApp. " +
    "Responda SEMPRE em JSON válido (sem markdown, sem acentos, puro JSON). Interprete valores em reais (R$). Hoje é " + todayISO() + ". " +
    `Categorias disponíveis do usuário: ${catList}. ` +
    "Campos do JSON: intent ('add' para registrar receita/despesa, 'query' para consultar totais, 'help' caso não entenda), " +
    "type ('receita' ou 'despesa'), amount (número), description (string curta), " +
    "category (escolha o nome MAIS parecido da lista de categorias, ou null), " +
    "is_paid (true se já foi pago/recebido, senão false). " +
    "Ex.: 'gastei 50 no mercado' -> {intent:'add',type:'despesa',amount:50,description:'Mercado',category:'Alimentação',is_paid:true}.";

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${prompt}\n\nMensagem do usuário: ${body}`,
        }],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API ${res.status}: ${t}`);
  }
  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { intent: "help" };
  }
}

export const Route = createFileRoute("/api/public/hooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const url = new URL(request.url);
        const queryToken = url.searchParams.get("token");
        const authHeader = request.headers.get("apikey");
        const ok =
          (!!queryToken && queryToken === process.env.SUPABASE_PUBLISHABLE_KEY) ||
          (!!queryToken && queryToken === process.env.WHATSAPP_WEBHOOK_TOKEN) ||
          (!!authHeader && authHeader === process.env.SUPABASE_PUBLISHABLE_KEY);
        if (!ok) return new Response("Forbidden", { status: 403 });

        const body = await request.json();
        const entry = body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (!message || message.type !== "text") {
          return new Response("OK", { status: 200 });
        }

        const from = String(message.from ?? "").trim();
        const bodyRaw = String(message.text?.body ?? "").trim();
        if (!from) return new Response("OK", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        // Fluxo de vinculação por código
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
            await sendMetaMessage(from, "✅ WhatsApp vinculado com sucesso!\n\n" + HELP);
            return new Response("OK", { status: 200 });
          }
        }

        // Identifica usuário verificado por telefone
        const { data: account } = await (sb.from("whatsapp_accounts") as Row)
          .select("user_id, verified")
          .eq("phone", from)
          .eq("verified", true)
          .maybeSingle();

        if (!account) {
          await sendMetaMessage(
            from,
            "👋 Olá! Seu número ainda não está vinculado a nenhuma conta.\n\n" +
              "Abra o app em *Configurações → WhatsApp*, gere o seu código e me envie aqui para vincular.",
          );
          return new Response("OK", { status: 200 });
        }

        const userId = account.user_id as string;

        if (!bodyRaw || /^(ajuda|help|oi|olá|ola|menu)$/i.test(bodyRaw)) {
          await sendMetaMessage(from, HELP);
          return new Response("OK", { status: 200 });
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
          await sendMetaMessage(from, "😕 Tive um problema para entender agora. Tente novamente em instantes.");
          return new Response("OK", { status: 200 });
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
          let receitas = 0, despesas = 0, transferido = 0;
          for (const t of (txs ?? []) as Row[]) {
            if (t.type === "receita") receitas += Number(t.amount);
            else if (t.type === "transferencia") transferido += Number(t.amount);
            else despesas += Number(t.amount);
          }
          const transfLine = transferido > 0 ? `\n🔄 Transferido/Reservado: ${brl(transferido)}` : "";
          await sendMetaMessage(
            from,
            `📊 *Resumo do mês*\n\n🟢 Receitas: ${brl(receitas)}\n🔴 Despesas: ${brl(despesas)}${transfLine}\n💰 Saldo: ${brl(receitas - despesas)}`,
          );
          return new Response("OK", { status: 200 });
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
            await sendMetaMessage(from, "😕 Não consegui salvar o lançamento. Tente novamente.");
            return new Response("OK", { status: 200 });
          }
          const emoji = type === "receita" ? "🟢" : "🔴";
          const label = type === "receita" ? "Receita" : "Despesa";
          const catTxt = categoryId ? `\n🏷️ ${parsed.category}` : "";
          await sendMetaMessage(
            from,
            `${emoji} *${label} registrada!*\n\n💵 ${brl(Number(parsed.amount))}\n📝 ${parsed.description ?? "Sem descrição"}${catTxt}`,
          );
          return new Response("OK", { status: 200 });
        }

        await sendMetaMessage(from, HELP);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
