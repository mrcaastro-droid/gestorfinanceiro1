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
        const text = String(message.text ?? "").trim();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        if (text === "/start") {
          const { data: existing } = await (sb.from("telegram_accounts") as Row)
            .select("id, user_id, verified")
            .eq("chat_id", chatId)
            .eq("verified", true)
            .maybeSingle();

          if (existing) {
            await sendTelegramMessage(chatId, "👋 *Bem-vindo de volta ao Gestor Financeiro!*\n\n" + HELP);
          } else {
            await sendTelegramMessage(chatId, "👋 *Bem-vindo ao Gestor Financeiro!*\n\nPara começar, vincule sua conta:\n1. Acesse as Configuracoes > Telegram no aplicativo\n2. Gere um codigo\n3. Envie o codigo aqui\n\n" + HELP);
          }
          return new Response("OK", { status: 200 });
        }

        if (/^(ajuda|help|oi|ola|menu)$/i.test(text)) {
          await sendTelegramMessage(chatId, HELP);
          return new Response("OK", { status: 200 });
        }

        // Verificar se e um codigo de vinculacao (6 caracteres alfanumericos)
        if (/^[A-Z0-9]{6}$/i.test(text)) {
          const { data: account } = await (sb.from("telegram_accounts") as Row)
            .select("id, user_id")
            .eq("link_code", text.toUpperCase())
            .eq("verified", false)
            .maybeSingle();

          if (account) {
            await (sb.from("telegram_accounts") as Row)
              .update({ verified: true, chat_id: chatId, link_code: null })
              .eq("id", account.id);
            await sendTelegramMessage(chatId, "✅ *Conta vinculada com sucesso!*\n\nAgora voce pode registrar gastos e receitas por mensagem.\n\n" + HELP);
          } else {
            await sendTelegramMessage(chatId, "❌ Codigo invalido ou ja utilizado.\n\nGere um novo codigo nas Configuracoes > Telegram do aplicativo.");
          }
          return new Response("OK", { status: 200 });
        }

        // Verificar se o chat esta vinculado
        const { data: linkedAccount } = await (sb.from("telegram_accounts") as Row)
          .select("id, user_id")
          .eq("chat_id", chatId)
          .eq("verified", true)
          .maybeSingle();

        if (!linkedAccount) {
          await sendTelegramMessage(chatId, "❌ Conta nao vinculada.\n\nEnvie /start para ver como vincular.");
          return new Response("OK", { status: 200 });
        }

        const USER_ID = linkedAccount.user_id;

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
            `📊 *Resumo do mes*\n\n🟢 Receitas: ${brl(receitas)}\n🔴 Despesas: ${brl(despesas)}${transfLine}\n💰 Saldo: ${brl(receitas - despesas)}`
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
            await sendTelegramMessage(chatId, "😕 Nao consegui salvar o lancamento. Tente novamente.");
            return new Response("OK", { status: 200 });
          }
          const emoji = type === "receita" ? "🟢" : "🔴";
          const label = type === "receita" ? "Receita" : "Despesa";
          const catTxt = categoryId ? `\n🏷️ ${parsed.category}` : "";
          await sendTelegramMessage(chatId,
            `${emoji} *${label} registrada!*\n\n💵 ${brl(Number(parsed.amount))}\n📝 ${parsed.description ?? "Sem descricao"}${catTxt}`
          );
          return new Response("OK", { status: 200 });
        }

        await sendTelegramMessage(chatId, HELP);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
