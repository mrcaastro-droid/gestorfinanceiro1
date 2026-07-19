import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramMessage, brl } from "@/lib/telegram";

type Row = Record<string, any>;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/hooks/telegram-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const apikey = request.headers.get("apikey");
        const token = url.searchParams.get("token");
        const okAnon = !!apikey && apikey === process.env.SUPABASE_PUBLISHABLE_KEY;
        const okToken = !!token && token === process.env.TELEGRAM_WEBHOOK_TOKEN;
        if (!okAnon && !okToken) {
          return new Response("Forbidden", { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        const now = new Date();
        const d0 = iso(now);
        const d3 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));

        const { data: txs, error } = await (sb.from("transactions") as Row)
          .select("user_id, amount, description, date")
          .eq("type", "despesa")
          .eq("is_paid", false)
          .in("date", [d0, d3]);
        if (error) {
          console.error("telegram reminders query error", error);
          return Response.json({ error: error.message }, { status: 500 });
        }

        const byUser = new Map<string, Row[]>();
        for (const t of (txs ?? []) as Row[]) {
          const arr = byUser.get(t.user_id) ?? [];
          arr.push(t);
          byUser.set(t.user_id, arr);
        }
        if (byUser.size === 0) return Response.json({ sent: 0 });

        const { data: accounts } = await (sb.from("telegram_accounts") as Row)
          .select("user_id, chat_id")
          .eq("verified", true)
          .eq("alerts_enabled", true);
        const chatByUser = new Map<string, string>();
        for (const a of (accounts ?? []) as Row[]) {
          if (a.chat_id) chatByUser.set(a.user_id, a.chat_id);
        }

        let sent = 0;
        for (const [userId, items] of byUser) {
          const chatId = chatByUser.get(userId);
          if (!chatId) continue;
          const lines = items
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((t: Row) => {
              const when = t.date === d0 ? "*vence HOJE*" : "vence em 3 dias";
              return `• ${t.description ?? "Conta"} — ${brl(Number(t.amount))} (${when})`;
            });
          const total = items.reduce((s: number, t: Row) => s + Number(t.amount), 0);
          const body =
            `🔔 *Contas a vencer*\n\n${lines.join("\n")}\n\n💰 Total: ${brl(total)}\n\n` +
            `Responda com _paguei ..._ para registrar o pagamento.`;
          try {
            await sendTelegramMessage(chatId, body);
            sent++;
          } catch (e) {
            console.error("send telegram reminder error", e);
          }
        }

        return Response.json({ sent });
      },
    },
  },
});
