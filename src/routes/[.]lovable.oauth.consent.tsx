import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wallet, Loader2 } from "lucide-react";

type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center bg-background text-foreground px-4">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">Não foi possível abrir esta autorização</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setErr(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setErr("O servidor de autorização não retornou um redirect.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "um aplicativo";

  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3 justify-center">
          <div className="size-11 rounded-2xl bg-primary grid place-items-center text-primary-foreground">
            <Wallet className="size-6" />
          </div>
          <span className="text-lg font-bold tracking-tight">Gestor Financeiro</span>
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Conectar {clientName} à sua conta</h1>
          <p className="text-sm text-muted-foreground">
            {clientName} poderá usar as ferramentas do Gestor Financeiro agindo como você.
          </p>
        </div>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>Ler suas contas, categorias e transações</li>
          <li>Registrar receitas, despesas e transferências</li>
          <li>Consultar seu resumo mensal</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          As regras de acesso do app (RLS) continuam valendo — o cliente só vê os seus dados.
        </p>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy && <Loader2 className="size-4 animate-spin" />} Aprovar
          </Button>
          <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
            Negar
          </Button>
        </div>
      </div>
    </main>
  );
}