import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wallet, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Gestor Financeiro" },
      { name: "description", content: "Acesse sua conta do Gestor Financeiro." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { next } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (!loading && user) {
      if (next) window.location.replace(next);
      else navigate({ to: "/dashboard", replace: true });
    }
  }, [user, loading, navigate, next]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    if (next) window.location.replace(next);
    else navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: next ? `${window.location.origin}${next}` : window.location.origin,
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Você já pode usar o app.");
    if (next) window.location.replace(next);
    else navigate({ to: "/dashboard", replace: true });
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link de redefinição para seu e-mail.");
    setTab("login");
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="size-11 rounded-2xl bg-primary grid place-items-center text-primary-foreground">
            <Wallet className="size-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">Gestor Financeiro</span>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <Field label="E-mail">
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                </Field>
                <Field label="Senha">
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </Field>
                <button type="button" onClick={() => setTab("forgot")} className="text-xs text-primary hover:underline">
                  Esqueci minha senha
                </button>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <Field label="Nome">
                  <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                </Field>
                <Field label="E-mail">
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                </Field>
                <Field label="Senha">
                  <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Criar conta
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="forgot">
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Informe seu e-mail e enviaremos um link para redefinir a senha.
                </p>
                <Field label="E-mail">
                  <Input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="voce@email.com" />
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Enviar link
                </Button>
                <button type="button" onClick={() => setTab("login")} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
                  Voltar para o login
                </button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Ao continuar, você concorda em manter suas finanças organizadas. 💚
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}