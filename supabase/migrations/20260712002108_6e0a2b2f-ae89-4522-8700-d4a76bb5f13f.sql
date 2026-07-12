ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_reserve_withdrawal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.is_reserve_withdrawal IS 'When true, this receita is a withdrawal (resgate) of previously reserved/transferred money. It carries transfer_account_id pointing to the reserve account it was drawn from, and account_id is null so it does not alter account balances.';