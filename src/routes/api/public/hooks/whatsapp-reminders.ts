import { createFileRoute } from "@tanstack/react-router";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function sendWhatsapp(to: string, body: string) {
  const gateway = "https://connector-gateway.lovable.dev/twilio";
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!lovableKey || !twilioKey || !from) {
    throw new Error("Twilio/WhatsApp não configurado (TWILIO_WHATSAPP_FROM ausente)");
  }
  const res = await fetch(`${gateway}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      Body: body,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Twilio send failed [${res.status}]: ${t}`);
  }
}

export const Route = createFileRoute("/api/public/hooks/whatsapp-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? request.headers.get("apikey");
        if (token !== process.env.WHATSAPP_WEBHOOK_TOKEN) {
          return new Response("Forbidden", { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as Row;

        const now = new Date();
        const d0 = iso(now);
        const d3 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3));

        // Contas a vencer hoje ou em 3 dias, ainda não pagas
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

        // Contas de WhatsApp verificadas com avisos ativos
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
            await sendWhatsapp(phone, body);
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
