CREATE TABLE public.whatsapp_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  link_code text,
  verified boolean NOT NULL DEFAULT false,
  alerts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_whatsapp_accounts_phone ON public.whatsapp_accounts (phone) WHERE verified = true;
CREATE INDEX idx_whatsapp_accounts_link_code ON public.whatsapp_accounts (link_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own whatsapp account"
ON public.whatsapp_accounts FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_whatsapp_accounts_updated_at
BEFORE UPDATE ON public.whatsapp_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();