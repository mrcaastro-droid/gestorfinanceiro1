import { createFileRoute } from "@tanstack/react-router";

type Row = Record<string, any>;

const META_API_VERSION = "v22.0";

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function sendMetaMessage(to: string, body: string) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    throw new Error("Meta WhatsApp não configurado (META_ACCESS_TOKEN ou META_WHATSAPP_PHONE_ID ausente)");
  }
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

export const Route = createFileRoute("/api/public/hooks/whatsapp-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const apikey = request.headers.get("apikey");
        const token = url.searchParams.get("token");
        const okAnon = !!apikey && apikey === process.env.SUPABASE_PUBLISHABLE_KEY;
        const okToken = !!token && token === process.env.WHATSAPP_WEBHOOK_TOKEN;
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
          console.error("reminders query error", error);
          return Response.json({ error: error.message }, { status: 500 });
        }

        const byUser = new Map<string, Row[]>();
        for (const t of (txs ?? []) as Row[]) {
          const arr = byUser.get(t.user_id) ?? [];
          arr.push(t);
          byUser.set(t.user_id, arr);
        }
        if (byUser.size === 0) return Response.json({ sent: 0 });

        const { data: accounts } = await (sb.from("whatsapp_accounts") as Row)
          .select("user_id, phone")
          .eq("verified", true)
          .eq("alerts_enabled", true);
        const phoneByUser = new Map<string, string>();
        for (const a of (accounts ?? []) as Row[]) {
          if (a.phone) phoneByUser.set(a.user_id, a.phone);
        }

        let sent = 0;
        for (const [userId, items] of byUser) {
          const phone = phoneByUser.get(userId);
          if (!phone) continue;
          const lines = items
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((t) => {
              const when = t.date === d0 ? "*vence HOJE*" : "vence em 3 dias";
              return `• ${t.description ?? "Conta"} — ${brl(Number(t.amount))} (${when})`;
            });
          const total = items.reduce((s, t) => s + Number(t.amount), 0);
          const body =
            `🔔 *Contas a vencer*\n\n${lines.join("\n")}\n\n💰 Total: ${brl(total)}\n\n` +
            `Responda com _paguei ..._ para registrar o pagamento.`;
          try {
            await sendMetaMessage(phone, body);
            sent++;
          } catch (e) {
            console.error("send reminder error", e);
          }
        }

        return Response.json({ sent });
      },
    },
  },
});
