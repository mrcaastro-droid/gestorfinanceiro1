import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Freq = "semanal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

const MONTH_STEP: Record<Freq, number> = {
  semanal: 0,
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clampDay(year: number, monthIndex: number, day: number) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, last);
}

// Gera as datas de ocorrência de uma regra, do "next_run" até o fim do mês atual.
function occurrences(startISO: string, freq: Freq, dayOfMonth: number, horizon: Date): string[] {
  const dates: string[] = [];
  let cursor = new Date(startISO + "T00:00:00");
  let guard = 0;
  while (cursor <= horizon && guard < 120) {
    dates.push(iso(cursor));
    if (freq === "semanal") {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    } else {
      const step = MONTH_STEP[freq] ?? 1;
      const nextMonthIndex = cursor.getMonth() + step;
      const y = cursor.getFullYear() + Math.floor(nextMonthIndex / 12);
      const m = ((nextMonthIndex % 12) + 12) % 12;
      cursor = new Date(y, m, clampDay(y, m, dayOfMonth));
    }
    guard++;
  }
  return dates;
}

/**
 * Materializa as recorrências ativas em lançamentos pendentes (não pagos),
 * do próximo vencimento até o fim do mês atual. Idempotente: não duplica.
 */
export const runRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: rules, error } = await supabase
      .from("recurring_rules")
      .select("*")
      .eq("active", true);
    if (error) throw error;

    const now = new Date();
    const horizon = new Date(now.getFullYear(), now.getMonth() + 1, 0); // fim do mês atual

    let created = 0;
    for (const rule of rules ?? []) {
      const dates = occurrences(
        rule.next_run as string,
        (rule.frequency as Freq) ?? "mensal",
        Number(rule.day_of_month ?? 1),
        horizon,
      );
      if (dates.length === 0) continue;

      const rows = dates.map((date) => ({
        user_id: userId,
        type: rule.type,
        amount: rule.amount,
        date,
        description: rule.name,
        category_id: rule.category_id,
        account_id: rule.account_id,
        is_paid: false,
        recurring_rule_id: rule.id,
      }));

      const { error: insErr, count } = await supabase
        .from("transactions")
        .upsert(rows as never, { onConflict: "recurring_rule_id,date", ignoreDuplicates: true, count: "exact" });
      if (insErr) throw insErr;
      created += count ?? 0;

      // Avança next_run para logo após a última ocorrência gerada
      const lastGenerated = new Date(dates[dates.length - 1] + "T00:00:00");
      let next: Date;
      if (rule.frequency === "semanal") {
        next = new Date(lastGenerated.getFullYear(), lastGenerated.getMonth(), lastGenerated.getDate() + 7);
      } else {
        const step = MONTH_STEP[(rule.frequency as Freq) ?? "mensal"] ?? 1;
        const nmi = lastGenerated.getMonth() + step;
        const y = lastGenerated.getFullYear() + Math.floor(nmi / 12);
        const m = ((nmi % 12) + 12) % 12;
        next = new Date(y, m, clampDay(y, m, Number(rule.day_of_month ?? 1)));
      }
      await supabase.from("recurring_rules").update({ next_run: iso(next) }).eq("id", rule.id);
    }

    return { created };
  });
