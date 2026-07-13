ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 AS rn
  FROM public.recurring_rules
)
UPDATE public.recurring_rules r
SET sort_order = o.rn
FROM ordered o
WHERE r.id = o.id;