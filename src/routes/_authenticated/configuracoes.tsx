import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SimpleCrud } from "@/components/simple-crud";
import { CategoriesManager } from "@/components/categories-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Landmark, CreditCard, Users, Hash, TrendingUp, Target, Sun, Moon, Palette } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: SettingsPage });

const ACCENTS = ["#10b981", "#6366f1", "#f43f5e", "#f59e0b", "#0ea5e9", "#a855f7"];

function SettingsPage() {
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso");
    setPassword("");
  }

  return (
    <PageContainer>
      <PageHeader title="Configurações" description="Personalize o sistema e gerencie seus cadastros" />
      <Tabs defaultValue="geral">
        <TabsList className="flex flex-wrap h-auto justify-start mb-6">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="bancos">Bancos</TabsTrigger>
          <TabsTrigger value="formas">Formas de pagamento</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="tipos">Tipos de investimento</TabsTrigger>
          <TabsTrigger value="metas">Categorias de metas</TabsTrigger>
          <TabsTrigger value="seguranca">Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <div className="space-y-6 max-w-lg">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Tema</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTheme("light")} className={`flex items-center gap-2 justify-center rounded-xl border p-3 text-sm font-medium ${theme === "light" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                  <Sun className="size-4" /> Claro
                </button>
                <button onClick={() => setTheme("dark")} className={`flex items-center gap-2 justify-center rounded-xl border p-3 text-sm font-medium ${theme === "dark" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                  <Moon className="size-4" /> Escuro
                </button>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Palette className="size-4" /> Cor principal</h3>
              <div className="flex flex-wrap gap-3">
                {ACCENTS.map((c) => (
                  <button key={c} onClick={() => setAccent(c)} className={`size-9 rounded-full border-2 ${accent === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="categorias">
          <CategoriesManager />
        </TabsContent>
        <TabsContent value="bancos">
          <SimpleCrud embedded table="banks" title="Bancos" singular="Banco" icon={Landmark}
            fields={[{ name: "name", label: "Nome" }, { name: "color", label: "Cor", type: "color", default: "#10b981" }]} />
        </TabsContent>
        <TabsContent value="formas">
          <SimpleCrud embedded table="payment_methods" title="Formas de pagamento" singular="Forma" icon={CreditCard}
            fields={[{ name: "name", label: "Nome" }]} />
        </TabsContent>
        <TabsContent value="pessoas">
          <SimpleCrud embedded table="people" title="Pessoas" singular="Pessoa" icon={Users}
            fields={[{ name: "name", label: "Nome" }, { name: "type", label: "Tipo", type: "select", default: "pessoa_fisica", options: [{ value: "cliente", label: "Cliente" }, { value: "empresa", label: "Empresa" }, { value: "pessoa_fisica", label: "Pessoa física" }, { value: "outro", label: "Outro" }] }]} />
        </TabsContent>
        <TabsContent value="tags">
          <SimpleCrud embedded table="tags" title="Tags" singular="Tag" icon={Hash}
            fields={[{ name: "name", label: "Nome" }, { name: "color", label: "Cor", type: "color", default: "#64748b" }]} />
        </TabsContent>
        <TabsContent value="tipos">
          <SimpleCrud embedded table="investment_types" title="Tipos de investimento" singular="Tipo" icon={TrendingUp}
            fields={[{ name: "name", label: "Nome" }]} />
        </TabsContent>
        <TabsContent value="metas">
          <SimpleCrud embedded table="goal_categories" title="Categorias de metas" singular="Categoria" icon={Target}
            fields={[{ name: "name", label: "Nome" }]} />
        </TabsContent>

        <TabsContent value="seguranca">
          <form onSubmit={changePassword} className="bg-card border border-border rounded-2xl p-5 max-w-md space-y-4">
            <h3 className="font-semibold">Alterar senha</h3>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nova senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <Button type="submit" disabled={busy}>Salvar nova senha</Button>
          </form>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}