import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export interface WhatsappAccount {
  id: string;
  phone: string | null;
  link_code: string | null;
  verified: boolean;
  alerts_enabled: boolean;
}

/** Retorna a vinculação do usuário atual (ou null). */
export const getWhatsappAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappAccount | null> => {
    const { data, error } = await (context.supabase.from("whatsapp_accounts" as never) as Row)
      .select("id, phone, link_code, verified, alerts_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return (data as WhatsappAccount) ?? null;
  });

/** Gera (ou regenera) um código de vinculação para o usuário atual. */
export const generateLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ code: string }> => {
    const code = randomCode();
    const sb = context.supabase as Row;
    const { data: existing } = await (sb.from("whatsapp_accounts") as Row)
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await (sb.from("whatsapp_accounts") as Row)
        .update({ link_code: code, verified: false, phone: null })
        .eq("user_id", context.userId);
      if (error) throw error;
    } else {
      const { error } = await (sb.from("whatsapp_accounts") as Row)
        .insert({ user_id: context.userId, link_code: code });
      if (error) throw error;
    }
    return { code };
  });

/** Ativa ou desativa os avisos de contas vencendo. */
export const setWhatsappAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from("whatsapp_accounts" as never) as Row)
      .update({ alerts_enabled: data.enabled })
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/** Desvincula o WhatsApp do usuário atual. */
export const unlinkWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase.from("whatsapp_accounts" as never) as Row)
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
