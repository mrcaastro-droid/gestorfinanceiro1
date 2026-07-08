-- Subcategorias: cada categoria pode ter uma categoria "pai"
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);

-- Vincular lançamentos gerados a partir de uma recorrência (para evitar duplicidade)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurring_rule_id UUID REFERENCES public.recurring_rules(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_recurring_date
  ON public.transactions(recurring_rule_id, date)
  WHERE recurring_rule_id IS NOT NULL;