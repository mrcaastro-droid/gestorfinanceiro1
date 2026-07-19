import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTelegramAccount,
  generateTelegramCode,
  setTelegramAlerts,
  unlinkTelegram,
} from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, Loader2, CheckCircle2, Copy, Bell, Link2Off } from "lucide-react";

export function TelegramSettings() {
  const qc = useQueryClient();
  const fetchAccount = useServerFn(getTelegramAccount);
  const genCode = useServerFn(generateTelegramCode);
  const toggleAlerts = useServerFn(setTelegramAlerts);
  const unlink = useServerFn(unlinkTelegram);
  const [busy, setBusy] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["telegram_account"],
    queryFn: () => fetchAccount(),
  });

  async function handleGenerate() {
    setBusy(true);
    try {
      await genCode();
      await qc.invalidateQueries({ queryKey: ["telegram_account"] });
      toast.success("Código gerado! Envie-o no Telegram para vincular.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    try {
      await toggleAlerts({ data: { enabled } });
      await qc.invalidateQueries({ queryKey: ["telegram_account"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleUnlink() {
    setBusy(true);
    try {
      await unlink();
      await qc.invalidateQueries({ queryKey: ["telegram_account"] });
      toast.success("Telegram desvinculado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const verified = account?.verified;
  const code = account?.link_code;

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
            <Send className="size-5 text-sky-500" />
          </div>
          <div>
            <h3 className="font-semibold">Telegram</h3>
            <p className="text-xs text-muted-foreground">
              Registre gastos por mensagem e receba avisos de contas
            </p>
          </div>
        </div>

        {verified ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 px-3 py-2 text-sm font-medium">
              <CheckCircle2 className="size-4" /> Vinculado
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Avisos de contas</p>
                  <p className="text-xs text-muted-foreground">3 dias antes e no dia do vencimento</p>
                </div>
              </div>
              <Switch checked={!!account?.alerts_enabled} onCheckedChange={handleToggle} />
            </div>

            <Button variant="outline" onClick={handleUnlink} disabled={busy} className="text-destructive">
              <Link2Off className="size-4" /> Desvincular
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
              <li>Gere seu código de vinculação abaixo.</li>
              <li>Envie o código no Telegram do assistente.</li>
              <li>Pronto! Comece a registrar por mensagem.</li>
            </ol>

            {code ? (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(code);
                  toast.success("Código copiado");
                }}
                className="w-full flex items-center justify-between rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3"
              >
                <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{code}</span>
                <Copy className="size-4 text-muted-foreground" />
              </button>
            ) : null}

            <Button onClick={handleGenerate} disabled={busy} className="w-full">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {code ? "Gerar novo código" : "Gerar código de vinculação"}
            </Button>
          </div>
        )}
      </div>

      <div className="bg-muted/40 border border-border rounded-2xl p-5 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Exemplos de comandos</p>
        <p>💬 <em>gastei 50 no mercado</em></p>
        <p>💬 <em>paguei 120 de luz</em></p>
        <p>💬 <em>recebi 3000 de salário</em></p>
        <p>💬 <em>quanto gastei esse mês?</em></p>
      </div>
    </div>
  );
}
