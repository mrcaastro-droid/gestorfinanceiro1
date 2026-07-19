import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramMessage, parseMessage, HELP, brl, todayISO } from "@/lib/telegram";

type Row = Record<string, any>;

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const USER_ID = process.env.TELEGRAM_USER_ID;

export const Route = createFileRoute("/api/public/hooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json() as Row;
        const message = body?.message;
        if (!message || !message.text || !message.from) {
          return new Response("OK", { status: 200 });
        }

        const chatId = String(message.chat.id);
        const text = String(message.text ?? "").trim();

        // Só responde ao chat_id configurado
        if (chatId !== CHAT_ID) {
          await sendTelegramMessage(chatId, "❌ Conta não autorizada.");
          return new Response("OK", { status: 200 });
        }

        if (text === "/start") {
          await sendTelegramMessage(chatId, "👋 *Bem-vindo ao Gestor Financeiro!*\n\n" + HELP);
          return new Response("OK", { status: 200 });
        }

        if (/^(ajuda|help|oi|olá|ola|menu)$/i.test(text)) {
          await sendTelegramMessage(chatId, HELP);
          return new Response("OK", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        if (!USER_ID) {
          await sendTelegramMessage(chatId, "❌ Usuário não configurado.");
          return new Response("OK", { status: 200 });
        }

        const { data: cats } = await (sb.from("categories") as Row)
          .select("id, name")
          .eq("user_id", USER_ID);
        const categories = (cats ?? []) as Array<{ id: string; name: string }>;

        let parsed: Row;
        try {
          parsed = await parseMessage(text, categories);
        } catch (e) {
          console.error("parseMessage error", e);
          await sendTelegramMessage(chatId, "😕 Tive um problema para entender agora. Tente novamente em instantes.");
          return new Response("OK", { status: 200 });
        }

        if (parsed.intent === "query") {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
          const { data: txs } = await (sb.from("transactions") as Row)
            .select("type, amount")
            .eq("user_id", USER_ID)
            .gte("date", start)
            .lte("date", end);
          let receitas = 0, despesas = 0, transferido = 0;
          for (const t of (txs ?? []) as Row[]) {
            if (t.type === "receita") receitas += Number(t.amount);
            else if (t.type === "transferencia") transferido += Number(t.amount);
            else despesas += Number(t.amount);
          }
          const transfLine = transferido > 0 ? `\n🔄 Transferido/Reservado: ${brl(transferido)}` : "";
          await sendTelegramMessage(chatId,
            `📊 *Resumo do mês*\n\n🟢 Receitas: ${brl(receitas)}\n🔴 Despesas: ${brl(despesas)}${transfLine}\n💰 Saldo: ${brl(receitas - despesas)}`
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
            user_id: USER_ID,
            type,
            amount: Number(parsed.amount),
            date: todayISO(),
            description: parsed.description ?? null,
            category_id: categoryId,
            is_paid: parsed.is_paid !== false,
          });
          if (error) {
            console.error("insert transaction error", error);
            await sendTelegramMessage(chatId, "😕 Não consegui salvar o lançamento. Tente novamente.");
            return new Response("OK", { status: 200 });
          }
          const emoji = type === "receita" ? "🟢" : "🔴";
          const label = type === "receita" ? "Receita" : "Despesa";
          const catTxt = categoryId ? `\n🏷️ ${parsed.category}` : "";
          await sendTelegramMessage(chatId,
            `${emoji} *${label} registrada!*\n\n💵 ${brl(Number(parsed.amount))}\n📝 ${parsed.description ?? "Sem descrição"}${catTxt}`
          );
          return new Response("OK", { status: 200 });
        }

        await sendTelegramMessage(chatId, HELP);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
