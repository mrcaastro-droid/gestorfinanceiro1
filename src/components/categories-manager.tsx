import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useList, useUpsert, useRemove, type CategoryRow } from "@/lib/finance";
import { Plus, Pencil, Trash2, Tag, ChevronRight, CornerDownRight } from "lucide-react";

type TypeValue = "receita" | "despesa" | "ambos" | "transferencia";

const TYPE_OPTIONS: Array<{ value: TypeValue; label: string }> = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
  { value: "ambos", label: "Ambos" },
  { value: "transferencia", label: "Transferência" },
];

const TYPE_LABEL: Record<string, string> = {
  receita: "Receita",
  despesa: "Despesa",
  ambos: "Ambos",
  transferencia: "Transferência",
};

interface FormState {
  id?: string;
  name: string;
  type: TypeValue;
  parent_id: string | null;
  color: string;
  icon: string;
}

const emptyForm: FormState = { name: "", type: "ambos", parent_id: null, color: "#10b981", icon: "tag" };

export function CategoriesManager() {
  const { data: categories, isLoading } = useList<CategoryRow>("categories");
  const upsert = useUpsert("categories");
  const remove = useRemove("categories");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const all = categories ?? [];
  const parents = all.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => all.filter((c) => c.parent_id === id);

  function openNewParent() {
    setForm({ ...emptyForm });
    setOpen(true);
  }
  function openNewChild(parent: CategoryRow) {
    setForm({ ...emptyForm, parent_id: parent.id, type: parent.type as TypeValue, color: parent.color });
    setOpen(true);
  }
  function openEdit(row: CategoryRow) {
    setForm({
      id: row.id,
      name: row.name,
      type: (row.type as TypeValue) ?? "ambos",
      parent_id: row.parent_id ?? null,
      color: row.color ?? "#10b981",
      icon: row.icon ?? "tag",
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate(
      {
        id: form.id,
        name: form.name,
        type: form.type,
        parent_id: form.parent_id || null,
        color: form.color,
        icon: form.icon || "tag",
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  const isChild = !!form.parent_id;
  const parentName = form.parent_id ? all.find((c) => c.id === form.parent_id)?.name : undefined;
  // parents available to attach to (exclude self and existing subcategories)
  const attachableParents = parents.filter((p) => p.id !== form.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">
          Organize suas finanças em <strong>categorias principais</strong> (ex.: "Gastos fixos") e
          <strong> subcategorias</strong> (ex.: "Aluguel", "Energia"). Assim você mede exatamente quanto gasta em cada uma.
        </p>
        <Button onClick={openNewParent}>
          <Plus className="size-4" /> Nova categoria
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : parents.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <EmptyState icon={Tag} title="Nenhuma categoria" description="Crie sua primeira categoria principal." action={<Button onClick={openNewParent}><Plus className="size-4" /> Nova categoria</Button>} />
        </div>
      ) : (
        <div className="space-y-3">
          {parents.map((parent) => {
            const kids = childrenOf(parent.id);
            return (
              <div key={parent.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Parent header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="size-9 rounded-xl shrink-0 grid place-items-center" style={{ backgroundColor: `${parent.color}22` }}>
                      <span className="size-3.5 rounded-full" style={{ backgroundColor: parent.color }} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{parent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABEL[parent.type] ?? "Ambos"} · {kids.length} {kids.length === 1 ? "subcategoria" : "subcategorias"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => openNewChild(parent)}>
                      <Plus className="size-3.5" /> Subcategoria
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(parent)}><Pencil className="size-4" /></Button>
                    <ConfirmDelete
                      description="Ao excluir uma categoria principal, suas subcategorias podem ficar sem vínculo. Esta ação não pode ser desfeita."
                      onConfirm={() => remove.mutate(parent.id)}
                    >
                      <Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-4" /></Button>
                    </ConfirmDelete>
                  </div>
                </div>

                {/* Subcategories */}
                {kids.length > 0 && (
                  <div className="border-t border-border bg-muted/30 divide-y divide-border">
                    {kids.map((kid) => (
                      <div key={kid.id} className="flex items-center justify-between gap-3 pl-6 pr-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CornerDownRight className="size-4 text-muted-foreground shrink-0" />
                          <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: kid.color }} />
                          <p className="text-sm font-medium truncate">{kid.name}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(kid)}><Pencil className="size-4" /></Button>
                          <ConfirmDelete onConfirm={() => remove.mutate(kid.id)}>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive"><Trash2 className="size-4" /></Button>
                          </ConfirmDelete>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? isChild ? "Editar subcategoria" : "Editar categoria"
                : isChild ? "Nova subcategoria" : "Nova categoria"}
            </DialogTitle>
          </DialogHeader>
          {isChild && parentName && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2">
              <ChevronRight className="size-3.5" /> Dentro de <strong className="text-foreground">{parentName}</strong>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isChild ? "Ex.: Aluguel" : "Ex.: Gastos fixos"} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categoria pai (opcional)</Label>
              <Select
                value={form.parent_id ?? "none"}
                onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhuma (categoria principal)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (categoria principal)</SelectItem>
                  {attachableParents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as TypeValue })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cor</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="size-10 rounded-lg border border-border bg-transparent" />
                <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={upsert.isPending}>Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}