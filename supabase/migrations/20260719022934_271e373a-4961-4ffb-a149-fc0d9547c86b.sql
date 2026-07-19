
CREATE TABLE public.month_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.month_locks TO authenticated;
GRANT ALL ON public.month_locks TO service_role;

ALTER TABLE public.month_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own month locks"
  ON public.month_locks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_month_locked(_user_id uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.month_locks
    WHERE user_id = _user_id
      AND year = EXTRACT(YEAR FROM _date)::smallint
      AND month = EXTRACT(MONTH FROM _date)::smallint
  );
$$;

CREATE OR REPLACE FUNCTION public.tg_block_locked_month()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _old_date date;
  _new_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _uid := OLD.user_id;
    _old_date := OLD.date;
    IF public.is_month_locked(_uid, _old_date) THEN
      RAISE EXCEPTION 'MES_BLOQUEADO: o mês % está bloqueado para alterações.', to_char(_old_date, 'MM/YYYY');
    END IF;
    RETURN OLD;
  ELSE
    _uid := NEW.user_id;
    _new_date := NEW.date;
    IF public.is_month_locked(_uid, _new_date) THEN
      RAISE EXCEPTION 'MES_BLOQUEADO: o mês % está bloqueado para alterações.', to_char(_new_date, 'MM/YYYY');
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date THEN
      IF public.is_month_locked(_uid, OLD.date) THEN
        RAISE EXCEPTION 'MES_BLOQUEADO: o mês % está bloqueado para alterações.', to_char(OLD.date, 'MM/YYYY');
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER tg_transactions_block_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_locked_month();

CREATE TRIGGER tg_transfers_block_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_locked_month();
