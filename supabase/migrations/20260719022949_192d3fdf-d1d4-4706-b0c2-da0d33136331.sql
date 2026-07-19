
REVOKE EXECUTE ON FUNCTION public.is_month_locked(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_block_locked_month() FROM PUBLIC, anon, authenticated;
