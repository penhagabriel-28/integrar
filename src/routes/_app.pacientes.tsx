import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PacienteFormDialog, formatBirthDateForDisplay } from "@/components/PacienteFormDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, User, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { differenceInYears, format } from "date-fns";

export const Route = createFileRoute("/_app/pacientes")({
  component: PacientesPage,
});

function PacientesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: pacientes = [], isLoading } = useQuery({
    queryKey: ["pacientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pacientes").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pacienteProfissionais = [] } = useQuery({
    queryKey: ["paciente-profissional-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("paciente_id, profissional_id, profissionais(nome, cor)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // 1. Delete fatura_itens for faturas belonging to these patients
      const { data: faturas } = await supabase.from("faturas").select("id").in("paciente_id", ids);
      const faturaIds = faturas?.map((f) => f.id) || [];
      if (faturaIds.length > 0) {
        await supabase.from("fatura_itens").delete().in("fatura_id", faturaIds);
      }
      // 2. Delete faturas
      await supabase.from("faturas").delete().in("paciente_id", ids);
      // 3. Delete agendamentos
      await supabase.from("agendamentos").delete().in("paciente_id", ids);
      // 4. Delete responsaveis
      await supabase.from("responsaveis").delete().in("paciente_id", ids);
      // 5. Delete patients
      const { error } = await supabase.from("pacientes").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Paciente(s) excluído(s) com sucesso");
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["pacientes"] });
    },
    onError: (e: any) => {
      toast.error("Erro ao excluir paciente(s): " + e.message);
    },
  });

  const handleDeleteSingle = (p: any) => {
    if (confirm(`Tem certeza que deseja excluir o paciente ${p.nome}?`)) {
      deleteMutation.mutate([p.id]);
    }
  };

  const handleDeleteMultiple = () => {
    if (
      confirm(`Tem certeza que deseja excluir os ${selectedIds.length} pacientes selecionados?`)
    ) {
      deleteMutation.mutate(selectedIds);
    }
  };

  const normalizeString = (str: string) =>
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

  const filtered = (pacientes || []).filter((p) =>
    normalizeString(p.nome).includes(normalizeString(q))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar paciente…"
            className="pl-9"
          />
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedIds(filtered.map((p) => p.id));
                } else {
                  setSelectedIds([]);
                }
              }}
            />
            <Label
              htmlFor="select-all"
              className="text-xs cursor-pointer text-muted-foreground select-none"
            >
              Selecionar tudo
            </Label>
          </div>
        )}

        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={handleDeleteMultiple}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" /> Excluir selecionados ({selectedIds.length})
          </Button>
        )}

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="ml-auto gap-1.5">
              <Plus className="h-4 w-4" /> Novo paciente
            </Button>
          </DialogTrigger>
          {open && (
            <PacienteFormDialog
              paciente={editing}
              onSaved={() => {
                setOpen(false);
                setEditing(null);
                qc.invalidateQueries({ queryKey: ["pacientes"] });
              }}
            />
          )}
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <User className="mx-auto mb-2 h-6 w-6 opacity-50" />
            Nenhum paciente encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => {
                  navigate({
                    to: "/pacientes/$id",
                    params: { id: p.id },
                  });
                }}
                className="cursor-pointer group relative rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds([...selectedIds, p.id]);
                        } else {
                          setSelectedIds(selectedIds.filter((id) => id !== p.id));
                        }
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.data_nascimento
                            ? `Nasc.: ${formatBirthDateForDisplay(p.data_nascimento)}`
                            : "Data de nascimento não informada"}
                          {p.cid_principal ? ` • CID: ${p.cid_principal}` : ""}
                        </div>
                      </div>
                      <Badge variant={p.status === "ativo" ? "default" : "secondary"}>
                        {p.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {p.cids_secundarios && (p.cids_secundarios as string[]).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(p.cids_secundarios as string[]).map((cid) => (
                          <Badge
                            key={cid}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 bg-secondary/30"
                          >
                            {cid}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const profs = (pacienteProfissionais || []).filter(
                        (m: any) => m.paciente_id === p.id,
                      );
                      if ((profs || []).length === 0) return null;
                      return (
                        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                          {profs.map((item: any) => (
                            <Badge
                              key={item.profissional_id}
                              variant="secondary"
                              className="text-[9px] px-1.5 py-0 border-l-[3px]"
                              style={{
                                borderLeftColor: item.profissionais?.cor || "var(--primary)",
                              }}
                            >
                              {item.profissionais?.nome}
                            </Badge>
                          ))}
                        </div>
                      );
                    })()}
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div>
                        {p.tipo_atendimento === "convenio"
                          ? `Convênio: ${p.convenio_nome ?? "—"}`
                          : `Particular (${p.valor_mensal && p.valor_mensal > 0 ? "Mensal" : "Por Sessão"})`}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditing(p);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteSingle(p);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
