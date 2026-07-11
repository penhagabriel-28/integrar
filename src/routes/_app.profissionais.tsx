import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign, GripVertical, Users, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/profissionais")({
  component: ProfissionaisPage,
});

const CORES = [
  "#3b82f6",
  "#fb923c",
  "#10b981",
  "#a78bfa",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#ef4444",
];

const PLANOS_AP = [
  { label: "1x na semana: R$ 240,00", value: "240" },
  { label: "2x na semana: R$ 360,00", value: "360" },
  { label: "Semana inteira: R$ 450,00", value: "450" },
];

const formatDisplayValue = (val: any) => {
  if (val === undefined || val === null || val === "") return "0";
  const num = Number(val);
  return isNaN(num) ? "0" : num.toFixed(0);
};

function ProfissionaisPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));

  const monthOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    for (let i = -6; i <= 3; i++) {
      const d = addMonths(today, i);
      const value = format(d, "yyyy-MM");
      const label = format(d, "MMMM 'de' yyyy", { locale: ptBR });
      options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  const startOfSelectedMonth = useMemo(() => {
    if (!selectedMonth || typeof selectedMonth !== "string" || !selectedMonth.includes("-")) {
      return startOfMonth(new Date());
    }
    const [year, month] = selectedMonth.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return isNaN(d.getTime()) ? startOfMonth(new Date()) : startOfMonth(d);
  }, [selectedMonth]);

  const endOfSelectedMonth = useMemo(() => {
    if (!selectedMonth || typeof selectedMonth !== "string" || !selectedMonth.includes("-")) {
      return endOfMonth(new Date());
    }
    const [year, month] = selectedMonth.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return isNaN(d.getTime()) ? endOfMonth(new Date()) : endOfMonth(d);
  }, [selectedMonth]);

  const {
    data: agendamentos = [],
    isLoading: loadingAgendamentos,
    isError: errorAgendamentos,
    refetch: refetchAgendamentos,
  } = useQuery({
    queryKey: ["profissionais-agendamentos", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, profissional_id, status")
        .gte("data_inicio", startOfSelectedMonth.toISOString())
        .lte("data_inicio", endOfSelectedMonth.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data = [],
    isLoading: loadingProfs,
    isError: errorProfs,
    refetch: refetchProfs,
  } = useQuery({
    queryKey: ["profissionais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("*")
        .order("cor")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: pacientes = [],
    isLoading: loadingPacientes,
    isError: errorPacientes,
    refetch: refetchPacientes,
  } = useQuery({
    queryKey: ["pacientes-nomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pacientes").select("id, nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: pacienteProfissional = [],
    isLoading: loadingPP,
    isError: errorPP,
    refetch: refetchPP,
  } = useQuery({
    queryKey: ["paciente-profissional"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("paciente_id, profissional_id, pacientes(nome)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = loadingAgendamentos || loadingProfs || loadingPacientes || loadingPP;
  const isError = errorAgendamentos || errorProfs || errorPacientes || errorPP;

  const handleRetry = () => {
    refetchAgendamentos();
    refetchProfs();
    refetchPacientes();
    refetchPP();
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profissionais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profissional removido");
      qc.invalidateQueries({ queryKey: ["profissionais"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [orderIds, setOrderIds] = useState<string[]>(() => {
    try {
      const savedOrder = localStorage.getItem("profissionais_ordem");
      const parsed = savedOrder ? JSON.parse(savedOrder) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Error parsing profissionais_ordem from localStorage:", e);
      return [];
    }
  });

  const orderedData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (!orderIds.length) return data;
    return [...data].sort((a, b) => {
      const idxA = orderIds.indexOf(a.id);
      const idxB = orderIds.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [data, orderIds]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando profissionais...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[50vh] items-center justify-center animate-in fade-in duration-300">
        <Card className="max-w-md w-full border-destructive/20 shadow-lg">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <span className="font-bold text-xl">!</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg text-foreground">Erro ao carregar profissionais</h3>
              <p className="text-xs text-muted-foreground">
                Não foi possível carregar os dados dos profissionais do banco de dados. Verifique a sua conexão ou tente novamente.
              </p>
            </div>
            <Button onClick={handleRetry} className="w-full h-9 text-xs">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData("text/plain");
    if (!sourceIndexStr) return;
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (sourceIndex === targetIndex) return;

    const items = [...orderedData];
    const [reorderedItem] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, reorderedItem);

    const orderIds = items.map((p) => p.id);
    setOrderIds(orderIds);
    localStorage.setItem("profissionais_ordem", JSON.stringify(orderIds));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border/80 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <Button
            type="button"
            className="gap-1.5 h-9 text-xs self-end sm:self-auto"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4" /> Novo profissional
          </Button>
          {open && (
            <ProfForm
              prof={editing}
              onSaved={() => {
                setOpen(false);
                setEditing(null);
                qc.invalidateQueries({ queryKey: ["profissionais"] });
              }}
            />
          )}
        </Dialog>
      </div>
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum profissional cadastrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
          {orderedData.map((p, idx) => (
            <Card
              key={p.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative group h-full flex flex-col"
            >
              <CardContent className="p-4 flex flex-col flex-1 justify-between">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
                
                {/* Upper block with all details */}
                <div className="space-y-3 flex-1 flex flex-col justify-start">
                  {/* Header (avatar + name + status) */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 shrink-0 rounded-full border border-border/20 shadow-sm" style={{ background: p.cor }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-sm text-foreground">{p.nome}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.especialidade ? (
                            p.especialidade
                              .split(",")
                              .map((s: string) => s.trim())
                              .filter(Boolean)
                              .map((esp: string) => (
                                <Badge
                                  key={esp}
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 font-medium bg-primary/5 border-primary/20 text-primary"
                                >
                                  {esp}
                                </Badge>
                              ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.valores_config && (p.valores_config as any).ativo_ate && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/40 font-medium">
                          Ativo até: {String((p.valores_config as any).ativo_ate).split("-").reverse().join("/")}
                        </span>
                      )}
                      <Badge
                        variant={p.ativo ? "default" : "secondary"}
                        onDragStart={(e) => e.stopPropagation()}
                        className="shrink-0 text-[10px] h-5 px-1.5"
                      >
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </div>

                  {/* Pricing Details */}
                  <div className="space-y-1 text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded border border-border/40 mt-1">
                    {p.valores_config && Array.isArray((p.valores_config as any).especialidades) && (p.valores_config as any).especialidades.length > 0 ? (
                      (p.valores_config as any).especialidades
                        .filter((esp: any) => {
                          if (!esp || !esp.nome) return false;
                          const activeSpecs = p.especialidade
                            ? p.especialidade
                                .split(",")
                                .map((s: string) => s.trim().toLowerCase())
                            : [];
                          return activeSpecs.includes(String(esp.nome).toLowerCase());
                        })
                        .slice(0, 2)
                        .map((esp: any, espIdx: number) => {
                          const espNomeUpper = String(esp?.nome || "").toUpperCase();
                          if (espNomeUpper === "AP") {
                            const plano = PLANOS_AP.find(
                              (pl) => pl.value === String(esp.plano_mensal),
                            );
                            return (
                              <div
                                key={esp?.nome || `ap-${espIdx}`}
                                className="flex justify-between gap-4"
                              >
                                <span className="font-medium text-foreground">AP:</span>
                                <span className="font-semibold text-foreground">
                                  {plano ? `R$ ${plano.value}` : "Não config."}
                                </span>
                              </div>
                            );
                          }
                          const isSupervisorABA = String(esp?.nome || "").toLowerCase() === "supervisor aba";
                          const isAtABA = String(esp?.nome || "").toLowerCase() === "at aba";
                          let valStr = "";
                          if (isSupervisorABA) {
                            valStr = `Ana. R$ ${formatDisplayValue(esp?.valor_avaliacao)}`;
                          } else if (isAtABA) {
                            valStr = `Sess. R$ ${formatDisplayValue(esp?.valor_sessao)}`;
                          } else {
                            valStr = `Sess. R$ ${formatDisplayValue(esp?.valor_sessao)} | Ana. R$ ${formatDisplayValue(esp?.valor_avaliacao)}`;
                          }
                          return (
                            <div
                              key={esp?.nome || `esp-${espIdx}`}
                              className="flex justify-between gap-4"
                            >
                              <span className="font-medium truncate">{esp?.nome || "Especialidade"}:</span>
                              <span className="font-semibold text-foreground shrink-0">{valStr}</span>
                            </div>
                          );
                        })
                    ) : p.valor_sessao ? (
                      <div className="flex justify-between gap-4">
                        <span className="font-medium text-foreground">Geral:</span>
                        <span className="font-semibold text-foreground">
                          R$ {formatDisplayValue(p.valor_sessao)}/sessão
                        </span>
                      </div>
                    ) : (
                      <div className="italic text-muted-foreground text-center py-1">
                        Valores não configurados
                      </div>
                    )}
                    {p.valores_config && Array.isArray((p.valores_config as any).especialidades) && (p.valores_config as any).especialidades.length > 2 && (
                      <div className="text-[10px] text-muted-foreground/80 italic text-right pt-0.5">
                        + {(p.valores_config as any).especialidades.length - 2} especialidade(s)
                      </div>
                    )}
                  </div>

                  {/* Summary Badges (Pacientes & Descontos & Sessões) */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(() => {
                      const acompanhados = (pacienteProfissional || []).filter(
                        (m: any) => m && m.profissional_id === p.id,
                      );
                      const descontosCount = p.valores_config && Array.isArray((p.valores_config as any).descontos)
                        ? (p.valores_config as any).descontos.length
                        : 0;
                      const sessionsCount = (agendamentos || []).filter(
                        (a: any) => a && a.profissional_id === p.id && a.status !== "cancelado"
                      ).length;
                      
                      return (
                        <>
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-normal bg-muted/60 text-muted-foreground hover:bg-muted/60 shrink-0">
                            👥 {acompanhados.length} {acompanhados.length === 1 ? "Paciente" : "Pacientes"}
                          </Badge>
                          {descontosCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-normal bg-muted/60 text-muted-foreground hover:bg-muted/60 shrink-0">
                              🏷️ {descontosCount} {descontosCount === 1 ? "Desconto" : "Descontos"}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-normal bg-primary/10 text-primary hover:bg-primary/10 shrink-0 border border-primary/10">
                            📅 {sessionsCount} {sessionsCount === 1 ? "Sessão" : "Sessões"}
                          </Badge>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Footer with Edit/Delete Buttons */}
                <div
                  className="mt-4 pt-2 border-t border-border/30 flex justify-end items-center gap-2"
                  onDragStart={(e) => e.stopPropagation()}
                >
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remover ${p.nome}?`)) del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const parseMoneyValue = (val: any) => {
  if (val === undefined || val === null || val === "") return null;
  const cleaned = String(val).replace(",", ".").trim();
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
};

function ProfForm({ prof, onSaved }: { prof: any; onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: pacientes = [] } = useQuery({
    queryKey: ["pacientes-min-prof"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pacientes").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: acompanhados = [] } = useQuery({
    queryKey: ["prof-pacientes", prof?.id],
    queryFn: async () => {
      if (!prof?.id) return [];
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("paciente_id, pacientes(id, nome)")
        .eq("profissional_id", prof.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!prof?.id,
  });

  const config: any = {
    especialidades: (prof?.valores_config as any)?.especialidades || [],
    descontos: (prof?.valores_config as any)?.descontos || [],
    ativo_ate: (prof?.valores_config as any)?.ativo_ate,
  };

  const [form, setForm] = useState(() => {
    const initialSpecs = prof?.especialidade
      ? prof.especialidade
          .split(", ")
          .filter(Boolean)
          .map((s: string) => {
            const existing = config.especialidades?.find(
              (e: any) => e && e.nome && e.nome.toLowerCase() === s.toLowerCase(),
            );
            return {
              nome: s,
              valor_sessao:
                existing?.valor_sessao !== undefined && existing?.valor_sessao !== null
                  ? String(existing.valor_sessao)
                  : "",
              valor_avaliacao:
                existing?.valor_avaliacao !== undefined && existing?.valor_avaliacao !== null
                  ? String(existing.valor_avaliacao)
                  : "",
              plano_mensal:
                existing?.plano_mensal !== undefined && existing?.plano_mensal !== null
                  ? String(existing.plano_mensal)
                  : "",
            };
          })
      : [{ nome: "", valor_sessao: "", valor_avaliacao: "", plano_mensal: "" }];

    return {
      nome: prof?.nome ?? "",
      especialidades: initialSpecs,
      email: prof?.email ?? "",
      telefone: prof?.telefone ?? "",
      cor: prof?.cor ?? CORES[0],
      ativo: prof?.ativo ?? true,
      ativo_ate: config.ativo_ate ?? "",
    };
  });

  const [descontos, setDescontos] = useState<any[]>(() => config.descontos || []);
  const [newDesc, setNewDesc] = useState({
    paciente_id: "",
    especialidade: "",
    valor_sessao: "",
    valor_avaliacao: "",
  });

  // Set default specialty for new discount when specialties change
  useEffect(() => {
    const activeSpecs = form.especialidades
      .map((e: any) => e?.nome?.trim())
      .filter(Boolean);
    if (activeSpecs.length > 0 && !activeSpecs.includes(newDesc.especialidade)) {
      setNewDesc((prev) => ({ ...prev, especialidade: activeSpecs[0] }));
    }
  }, [form.especialidades]);

  const m = useMutation({
    mutationFn: async () => {
      const activeSpecs = form.especialidades.filter((e: any) => e && e.nome && e.nome.trim());

      const payloadConfig = {
        especialidades: activeSpecs.map((v: any) => {
          const nomeLower = v.nome?.trim().toLowerCase() || "";
          const isAP = nomeLower === "ap";
          const isSupervisorABA = nomeLower === "supervisor aba";
          const isAtABA = nomeLower === "at aba";
          return {
            nome: v.nome?.trim() || "",
            valor_sessao: isAP || isSupervisorABA ? null : parseMoneyValue(v.valor_sessao),
            valor_avaliacao: isAP || isAtABA ? null : parseMoneyValue(v.valor_avaliacao),
            plano_mensal: isAP ? v.plano_mensal || null : null,
          };
        }),
        descontos: (descontos || [])
          .filter((d: any) => d && d.paciente_id)
          .map((d: any) => {
            const specLower = d.especialidade?.toLowerCase() || "";
            const isSupervisorABA = specLower === "supervisor aba";
            const isAtABA = specLower === "at aba";
            return {
              paciente_id: d.paciente_id,
              especialidade: d.especialidade,
              valor_sessao: isSupervisorABA ? null : parseMoneyValue(d.valor_sessao),
              valor_avaliacao: isAtABA ? null : parseMoneyValue(d.valor_avaliacao),
            };
          }),
        ativo_ate: form.ativo_ate || null,
      };

      const payload: any = {
        nome: form.nome,
        especialidade: activeSpecs.map((e: any) => e.nome?.trim() || "").filter(Boolean).join(", ") || null,
        email: form.email || null,
        telefone: form.telefone || null,
        cor: form.cor,
        ativo: form.ativo,
        valores_config: payloadConfig,
      };

      if (prof) {
        const { error } = await supabase.from("profissionais").update(payload).eq("id", prof.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profissionais").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(prof ? "Atualizado" : "Cadastrado");
      qc.invalidateQueries({ queryKey: ["paciente-profissional"] });
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const renderGeralForm = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input
          required
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Especialidades & Valores</Label>
        <div className="space-y-3">
          {form.especialidades.map((esp: any, index: number) => (
            <div
              key={index}
              className="border p-3.5 rounded-lg bg-accent/10 space-y-2.5 relative group"
            >
              <div className="flex gap-2 items-center">
                <Input
                  required
                  value={esp.nome}
                  onChange={(e) => {
                    const next = [...form.especialidades];
                    next[index].nome = e.target.value;
                    setForm({ ...form, especialidades: next });
                  }}
                  placeholder={`Especialidade ${index + 1}`}
                  className="font-semibold text-sm"
                />
                {form.especialidades.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setForm({
                        ...form,
                        especialidades: form.especialidades.filter(
                          (_: any, i: number) => i !== index,
                        ),
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {esp.nome.trim() && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                  {esp.nome.toUpperCase() === "AP" ? (
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Plano Mensal (AP)</Label>
                      <Select
                        value={esp.plano_mensal}
                        onValueChange={(val) => {
                          const next = [...form.especialidades];
                          next[index].plano_mensal = val;
                          setForm({ ...form, especialidades: next });
                        }}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Selecione um plano..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANOS_AP.map((plano) => (
                            <SelectItem key={plano.value} value={plano.value}>
                              {plano.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <>
                      {esp.nome.toLowerCase() !== "supervisor aba" && (
                        <div
                          className={`space-y-1 ${esp.nome.toLowerCase() === "at aba" ? "col-span-2" : ""}`}
                        >
                          <Label className="text-[11px] text-muted-foreground">
                            Sessão Padrão (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Ex.: 150.00"
                            value={esp.valor_sessao}
                            onChange={(e) => {
                              const next = [...form.especialidades];
                              next[index].valor_sessao = e.target.value;
                              setForm({ ...form, especialidades: next });
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                      {esp.nome.toLowerCase() !== "at aba" && (
                        <div
                          className={`space-y-1 ${esp.nome.toLowerCase() === "supervisor aba" ? "col-span-2" : ""}`}
                        >
                          <Label className="text-[11px] text-muted-foreground">Anamnese (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Ex.: 200.00"
                            value={esp.valor_avaliacao}
                            onChange={(e) => {
                              const next = [...form.especialidades];
                              next[index].valor_avaliacao = e.target.value;
                              setForm({ ...form, especialidades: next });
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() =>
            setForm({
              ...form,
              especialidades: [
                ...form.especialidades,
                { nome: "", valor_sessao: "", valor_avaliacao: "", plano_mensal: "" },
              ],
            })
          }
        >
          <Plus className="h-4 w-4 mr-1.5" /> Adicionar especialidade
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input
            value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Cor da agenda</Label>
        <div className="flex flex-wrap gap-2">
          {CORES.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setForm({ ...form, cor: c })}
              className={`h-7 w-7 rounded-full ring-offset-2 transition ${form.cor === c ? "ring-2 ring-foreground" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <input
          type="checkbox"
          id="ativo"
          checked={form.ativo}
          onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="ativo" className="text-sm font-medium leading-none cursor-pointer">
          Ativo
        </Label>
      </div>

      <div className="space-y-1.5 pt-2">
        <Label htmlFor="ativo_ate">Ativo até (Mês/Ano) - Opcional</Label>
        <Input
          type="month"
          id="ativo_ate"
          value={form.ativo_ate || ""}
          onChange={(e) => setForm({ ...form, ativo_ate: e.target.value })}
          className="w-full"
        />
        <p className="text-[11px] text-muted-foreground">
          Se definido, o profissional aparecerá como ativo nas agendas, relatórios e cobranças até o mês selecionado. A partir do mês seguinte, ele será tratado como inativo.
        </p>
      </div>
    </div>
  );

  const renderDescontosForm = () => {
    const activeSpecs = form.especialidades
      .map((e: any) => e?.nome?.trim())
      .filter(Boolean);

    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Configure descontos e valores especiais de sessões e anamneses para pacientes
          selecionados.
        </p>

        {activeSpecs.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground border rounded-lg">
            Adicione e salve especialidades na aba "Dados Gerais & Valores" primeiro.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 p-3 border border-dashed rounded-lg bg-muted/40">
              <div className="space-y-1.5">
                <Label>Paciente</Label>
                <Select
                  value={newDesc.paciente_id}
                  onValueChange={(v) => setNewDesc({ ...newDesc, paciente_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(pacientes || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Especialidade</Label>
                <Select
                  value={newDesc.especialidade}
                  onValueChange={(v) => setNewDesc({ ...newDesc, especialidade: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSpecs.map((s: string) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newDesc.especialidade && newDesc.especialidade.toLowerCase() !== "supervisor aba" && (
                <div
                  className={`space-y-1.5 ${newDesc.especialidade.toLowerCase() === "at aba" ? "col-span-2" : ""}`}
                >
                  <Label>Valor Sessão (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex.: 120"
                    value={newDesc.valor_sessao}
                    onChange={(e) => setNewDesc({ ...newDesc, valor_sessao: e.target.value })}
                  />
                </div>
              )}
              {newDesc.especialidade && newDesc.especialidade.toLowerCase() !== "at aba" && (
                <div
                  className={`space-y-1.5 ${newDesc.especialidade.toLowerCase() === "supervisor aba" ? "col-span-2" : ""}`}
                >
                  <Label>Valor Anamnese (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex.: 180"
                    value={newDesc.valor_avaliacao}
                    onChange={(e) => setNewDesc({ ...newDesc, valor_avaliacao: e.target.value })}
                  />
                </div>
              )}
              <div className="col-span-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!newDesc.paciente_id || !newDesc.especialidade) {
                      toast.error("Selecione o paciente e a especialidade");
                      return;
                    }
                    const specLower = newDesc.especialidade.toLowerCase();
                    const isSupervisorABA = specLower === "supervisor aba";
                    const isAtABA = specLower === "at aba";
                    const needsSession = !isSupervisorABA;
                    const needsAnamnese = !isAtABA;

                    if (needsSession && !newDesc.valor_sessao) {
                      toast.error("Preencha o valor da sessão");
                      return;
                    }
                    if (needsAnamnese && !newDesc.valor_avaliacao) {
                      toast.error("Preencha o valor da anamnese");
                      return;
                    }

                    const newRule = {
                      paciente_id: newDesc.paciente_id,
                      especialidade: newDesc.especialidade,
                      valor_sessao: needsSession
                        ? (parseMoneyValue(newDesc.valor_sessao) ?? 0)
                        : null,
                      valor_avaliacao: needsAnamnese
                        ? (parseMoneyValue(newDesc.valor_avaliacao) ?? 0)
                        : null,
                    };
                    const exists = (descontos || []).some(
                      (d: any) =>
                        d &&
                        d.paciente_id === newRule.paciente_id &&
                        d.especialidade === newRule.especialidade,
                    );
                    if (exists) {
                      toast.error("Já existe desconto para este paciente nesta especialidade");
                      return;
                    }
                    setDescontos([...(descontos || []), newRule]);
                    setNewDesc({
                      paciente_id: "",
                      especialidade: activeSpecs[0] || "",
                      valor_sessao: "",
                      valor_avaliacao: "",
                    });
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar Desconto
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table className="w-full">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Especialidade</TableHead>
                    <TableHead>Sessão</TableHead>
                    <TableHead>Anamnese</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!descontos || descontos.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-xs text-muted-foreground py-6"
                      >
                        Nenhum valor com desconto cadastrado para este profissional.
                      </TableCell>
                    </TableRow>
                  ) : (
                    descontos.map((d: any, idx: number) => {
                      if (!d) return null;
                      const pac = (pacientes || []).find((p: any) => p.id === d.paciente_id);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium text-xs">
                            {pac?.nome || "Carregando..."}
                          </TableCell>
                          <TableCell className="text-xs">{d.especialidade}</TableCell>
                          <TableCell className="text-xs font-semibold text-primary">
                            {d.especialidade?.toLowerCase() === "supervisor aba"
                              ? "—"
                              : `R$ ${Number(d.valor_sessao ?? 0).toFixed(2)}`}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-primary">
                            {d.especialidade?.toLowerCase() === "at aba"
                              ? "—"
                              : `R$ ${Number(d.valor_avaliacao ?? 0).toFixed(2)}`}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDescontos(descontos.filter((_: any, i: number) => i !== idx))
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderPacientesForm = () => {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Lista de pacientes associados ao profissional para acompanhamento de sessões e especialidades.
        </p>
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="divide-y divide-border/60 max-h-[40vh] overflow-y-auto pr-1">
            {acompanhados.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                Nenhum paciente associado a este profissional no momento.
              </div>
            ) : (
              acompanhados.map((item: any) => {
                const pac = item.pacientes;
                return (
                  <div
                    key={item.paciente_id}
                    className="flex items-center justify-between p-3 hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-xs text-foreground truncate">
                        {pac?.nome || "Carregando..."}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
      <DialogHeader>
        <DialogTitle>{prof ? "Editar profissional" : "Novo profissional"}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex-1 flex flex-col overflow-hidden space-y-3"
      >
        {prof ? (
          <Tabs defaultValue="geral" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-3 shrink-0">
              <TabsTrigger value="geral">Dados Gerais & Valores</TabsTrigger>
              <TabsTrigger value="descontos">Descontos por Paciente</TabsTrigger>
              <TabsTrigger value="pacientes">Pacientes ({acompanhados.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="flex-1 overflow-y-auto py-2 pr-1 space-y-3">
              {renderGeralForm()}
            </TabsContent>

            <TabsContent value="descontos" className="flex-1 overflow-y-auto py-2 pr-1 space-y-3">
              {renderDescontosForm()}
            </TabsContent>

            <TabsContent value="pacientes" className="flex-1 overflow-y-auto py-2 pr-1 space-y-3">
              {renderPacientesForm()}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-3">{renderGeralForm()}</div>
        )}
        <DialogFooter className="shrink-0 pt-2 border-t">
          <Button type="submit" disabled={m.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
