ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.recalc_account_balance(_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _account_id IS NULL THEN RETURN; END IF;
  UPDATE public.accounts a
  SET current_balance = a.initial_balance
    -- receitas somam, despesas e transferências (saída da conta de origem) subtraem
    + COALESCE((SELECT SUM(CASE WHEN t.type = 'receita' THEN t.amount ELSE -t.amount END)
        FROM public.transactions t
        WHERE t.account_id = a.id AND t.is_paid = true), 0)
    -- transferências recebidas nesta conta (conta de destino) somam
    + COALESCE((SELECT SUM(t.amount)
        FROM public.transactions t
        WHERE t.transfer_account_id = a.id AND t.type = 'transferencia' AND t.is_paid = true), 0)
    -- transferências da tabela dedicada de transferências
    + COALESCE((SELECT SUM(tr.amount) FROM public.transfers tr WHERE tr.to_account_id = a.id), 0)
    - COALESCE((SELECT SUM(tr.amount) FROM public.transfers tr WHERE tr.from_account_id = a.id), 0)
  WHERE a.id = _account_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_transactions_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_account_balance(OLD.account_id);
    PERFORM public.recalc_account_balance(OLD.transfer_account_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_account_balance(NEW.account_id);
    PERFORM public.recalc_account_balance(NEW.transfer_account_id);
    IF TG_OP = 'UPDATE' THEN
      IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
        PERFORM public.recalc_account_balance(OLD.account_id);
      END IF;
      IF OLD.transfer_account_id IS DISTINCT FROM NEW.transfer_account_id THEN
        PERFORM public.recalc_account_balance(OLD.transfer_account_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;