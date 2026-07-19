import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, any>;

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export interface TelegramAccount {
  id: string;
  chat_id: string | null;
  link_code: string | null;
  verified: boolean;
  alerts_enabled: boolean;
}

export const getTelegramAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TelegramAccount | null> => {
    const { data, error } = await (context.supabase.from("telegram_accounts" as never) as Row)
      .select("id, chat_id, link_code, verified, alerts_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return (data as TelegramAccount) ?? null;
  });

export const generateTelegramCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ code: string }> => {
    const code = randomCode();
    const sb = context.supabase as Row;
    const { data: existing } = await (sb.from("telegram_accounts") as Row)
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await (sb.from("telegram_accounts") as Row)
        .update({ link_code: code, verified: false, chat_id: null })
        .eq("user_id", context.userId);
      if (error) throw error;
    } else {
      const { error } = await (sb.from("telegram_accounts") as Row)
        .insert({ user_id: context.userId, link_code: code });
      if (error) throw error;
    }
    return { code };
  });

export const setTelegramAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from("telegram_accounts" as never) as Row)
      .update({ alerts_enabled: data.enabled })
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase.from("telegram_accounts" as never) as Row)
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
