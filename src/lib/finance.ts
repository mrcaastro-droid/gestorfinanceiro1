import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { runRecurring } from "@/lib/recurring.functions";
import { useEffect } from "react";

export type TableName =
  | "accounts"
  | "banks"
  | "categories"
  | "payment_methods"
  | "people"
  | "tags"
  | "cards"
  | "transactions"
  | "transfers"
  | "recurring_rules"
  | "investment_types"
  | "investments"
  | "dividends"
  | "goal_categories"
  | "goals"
  | "notifications";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

interface ListOptions {
  select?: string;
  orderBy?: string;
  ascending?: boolean;
  filters?: Array<[string, string, unknown]>;
  key?: unknown[];
}

export function useList<T = Row>(table: TableName, opts: ListOptions = {}) {
  const { select = "*", orderBy = "created_at", ascending = false, filters = [], key = [] } = opts;
  return useQuery({
    queryKey: [table, ...key],
    queryFn: async () => {
      let query = (supabase.from(table as never) as never as {
        select: (s: string) => Row;
      }).select(select) as Row;
      for (const [col, op, val] of filters) {
        query = (query as Row)[op](col, val);
      }
      const { data, error } = await (query as Row).order(orderBy, { ascending });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function invalidateRelated(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["accounts"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["cards"] });
}

export function useUpsert(table: TableName, successMsg = "Salvo com sucesso") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Row) => {
      const { id, ...rest } = values;
      if (id) {
        const { error } = await (supabase.from(table as never) as Row).update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from(table as never) as Row).insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      invalidateRelated(qc);
      toast.success(successMsg);
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao salvar"),
  });
}

export function useRemove(table: TableName, successMsg = "Excluído com sucesso") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(table as never) as Row).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      invalidateRelated(qc);
      toast.success(successMsg);
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao excluir"),
  });
}

export async function insertRows(table: TableName, rows: Row[]) {
  const { error } = await (supabase.from(table as never) as Row).insert(rows);
  if (error) throw error;
}

/** Materializa recorrências ativas em contas pendentes até o fim do mês atual. */
export function useGenerateRecurring() {
  const qc = useQueryClient();
  const fn = useServerFn(runRecurring);
  return useMutation({
    mutationFn: async () => await fn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

/** Executa a geração de recorrências uma vez ao montar (silencioso). */
export function useAutoGenerateRecurring() {
  const gen = useGenerateRecurring();
  useEffect(() => {
    gen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface TransactionRow {
  id: string;
  type: "receita" | "despesa" | "transferencia";
  amount: number;
  date: string;
  description: string | null;
  notes: string | null;
  category_id: string | null;
  account_id: string | null;
  transfer_account_id: string | null;
  card_id: string | null;
  payment_method_id: string | null;
  person_id: string | null;
  is_paid: boolean;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_reserve_withdrawal?: boolean;
  is_yield?: boolean;
}

export interface AccountRow {
  id: string;
  name: string;
  bank_id: string | null;
  type: string;
  color: string;
  icon: string;
  initial_balance: number;
  current_balance: number;
  archived: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  type: "receita" | "despesa" | "ambos" | "transferencia";
  parent_id: string | null;
}

export interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  category_id: string | null;
  color: string;
}

export interface CardRow {
  id: string;
  name: string;
  brand: string | null;
  color: string;
  limit_amount: number;
  closing_day: number;
  due_day: number;
  best_purchase_day: number | null;
  account_id: string | null;
  archived: boolean;
}

export interface InvestmentRow {
  id: string;
  type_id: string | null;
  name: string;
  ticker: string | null;
  quantity: number;
  invested_amount: number;
  avg_price: number;
  current_value: number;
}