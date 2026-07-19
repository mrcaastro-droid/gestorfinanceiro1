import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramMessage, parseMessage, HELP, brl, todayISO } from "@/lib/telegram";

type Row = Record<string, any>;

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
        const fromId = String(message.from.id);
        const text = String(message.text ?? "").trim();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        // Comando /start
        if (text === "/start") {
          await sendTelegramMessage(chatId,
            "👋 *Bem-vindo ao Gestor Financeiro!*\n\n" +
            "Envie o código de vinculação gerado no app para conectar sua conta.\n\n" +
            "Ou me mande mensagens como:\n" +
            "• _gastei 50 no mercado_\n• _paguei 120 de luz_\n• _recebi 3000 de salário_"
          );
          return new Response("OK", { status: 200 });
        }

        // Fluxo de vinculação por código (6 caracteres)
        const maybeCode = text.toUpperCase();
        if (/^[A-Z0-9]{6}$/.test(maybeCode)) {
          const { data: acc } = await (sb.from("telegram_accounts") as Row)
            .select("id, user_id")
            .eq("link_code", maybeCode)
            .maybeSingle();
          if (acc) {
            await (sb.from("telegram_accounts") as Row)
              .update({ chat_id: chatId, verified: true, link_code: null })
              .eq("id", acc.id);
            await sendTelegramMessage(chatId, "✅ Conta vinculada com sucesso!\n\n" + HELP);
            return new Response("OK", { status: 200 });
          }
        }

        // Busca conta verificada
        const { data: account } = await (sb.from("telegram_accounts") as Row)
          .select("user_id")
          .eq("chat_id", chatId)
          .eq("verified", true)
          .maybeSingle();

        if (!account) {
          await sendTelegramMessage(chatId,
            "👋 Seu Telegram ainda não está vinculado.\n\n" +
            "Abra o app em *Configurações*, gere o código e envie aqui."
          );
          return new Response("OK", { status: 200 });
        }

        const userId = account.user_id as string;

        if (/^(ajuda|help|oi|olá|ola|menu)$/i.test(text)) {
          await sendTelegramMessage(chatId, HELP);
          return new Response("OK", { status: 200 });
        }

        const { data: cats } = await (sb.from("categories") as Row)
          .select("id, name")
          .eq("user_id", userId);
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
