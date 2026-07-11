import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Calendar, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { differenceInYears, format } from "date-fns";
import { PacienteFormDialog } from "@/components/PacienteFormDialog";

export const Route = createFileRoute("/_app/pacientes/$id")({
  component: PacienteDetail,
});

function PacienteDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [respOpen, setRespOpen] = useState(false);
  const [agendaFixaOpen, setAgendaFixaOpen] = useState(false);
  const [feriasOpen, setFeriasOpen] = useState(false);
  const [gerarSemanaOpen, setGerarSemanaOpen] = useState(false);

  const { data: paciente } = useQuery({
    queryKey: ["paciente", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pacientes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["responsaveis", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responsaveis")
        .select("*")
        .eq("paciente_id", id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ags = [] } = useQuery({
    queryKey: ["paciente-ags", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*, profissionais(nome, cor), servicos(nome)")
        .eq("paciente_id", id)
        .order("data_inicio", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accompanyingProfs = [] } = useQuery({
    queryKey: ["paciente-profissionais-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("*, profissionais(nome, cor)")
        .eq("paciente_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const delResp = useMutation({
    mutationFn: async (rid: string) => {
      const { error } = await supabase.from("responsaveis").delete().eq("id", rid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Responsável removido");
      qc.invalidateQueries({ queryKey: ["responsaveis", id] });
    },
  });

  const { data: servicos = [] } = useQuery({
    queryKey: ["servicos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servicos").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: salas = [] } = useQuery({
    queryKey: ["salas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("salas").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profissionaisList = [] } = useQuery({
    queryKey: ["profissionais-list-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id, nome, cor, especialidade, valores_config, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const targetMonth = new Date().toISOString().substring(0, 7);
  const activeProfs = (profissionaisList || []).filter((p: any) => {
    if (p.ativo) return true;
    const config = p.valores_config as any;
    return config?.ativo_ate && targetMonth <= config.ativo_ate;
  });

  const diasFixos = parseDiasFixos(paciente?.observacoes);

  const handleRemoveDiaFixo = async (dfId: string) => {
    if (!paciente) return;
    const currentDiasFixos = parseDiasFixos(paciente.observacoes);
    const updated = currentDiasFixos.filter((x) => x.id !== dfId);
    const newObs = serializeObservacoes(paciente.observacoes, updated);
    
    const { error } = await supabase
      .from("pacientes")
      .update({ observacoes: newObs })
      .eq("id", id);
      
    if (error) {
      toast.error("Erro ao remover horário fixo: " + error.message);
    } else {
      toast.success("Horário fixo removido com sucesso");
      qc.invalidateQueries({ queryKey: ["paciente", id] });
    }
  };

  if (!paciente) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to="/pacientes">
            <ArrowLeft className="h-4 w-4" /> Pacientes
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{paciente.nome}</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              {paciente.data_nascimento
                ? `Nasc. ${(() => {
                    const parts = paciente.data_nascimento.split("-");
                    return `${parts[2]}/${parts[1]}/${parts[0]}`;
                  })()}`
                : "Data de nascimento não informada"}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant={paciente.status === "ativo" ? "default" : "secondary"}>
              {paciente.status.replace("_", " ")}
            </Badge>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </DialogTrigger>
              {editOpen && (
                <PacienteFormDialog
                  paciente={paciente}
                  onSaved={() => {
                    setEditOpen(false);
                    qc.invalidateQueries({ queryKey: ["paciente", id] });
                    qc.invalidateQueries({ queryKey: ["pacientes"] });
                    qc.invalidateQueries({ queryKey: ["responsaveis", id] });
                  }}
                />
              )}
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="CID(s)" value={paciente.cid_principal} />
          <div className="sm:col-span-1">
            <div className="text-xs text-muted-foreground">Especialidades desejadas</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {Array.isArray(paciente.cids_secundarios) && paciente.cids_secundarios.length > 0 ? (
                (paciente.cids_secundarios as string[]).map((spec: string) => (
                  <Badge key={spec} variant="secondary">
                    {spec}
                  </Badge>
                ))
              ) : (
                <span className="text-sm font-medium">—</span>
              )}
            </div>
          </div>
          <div className="sm:col-span-1">
            <div className="text-xs text-muted-foreground">Profissionais Acompanhantes</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(accompanyingProfs || []).length > 0 ? (
                (accompanyingProfs || []).map((item: any) => (
                  <Badge
                    key={item.profissional_id}
                    variant="outline"
                    className="px-2 py-0.5 border-l-[3px]"
                    style={{ borderLeftColor: item.profissionais?.cor || "var(--primary)" }}
                  >
                    {item.profissionais?.nome}
                  </Badge>
                ))
              ) : (
                <span className="text-sm font-medium">—</span>
              )}
            </div>
          </div>
          <Info
            label="Atendimento"
            value={
              paciente.tipo_atendimento === "convenio"
                ? `Convênio: ${paciente.convenio_nome ?? "—"}`
                : `Particular (${paciente.valor_mensal && paciente.valor_mensal > 0 ? "Mensal" : "Por Sessão"})`
            }
          />

          <Info label="Cadastrado em" value={format(new Date(paciente.created_at), "dd/MM/yyyy")} />
          {getCleanObservacoes(paciente.observacoes) && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Observações</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{getCleanObservacoes(paciente.observacoes)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Responsáveis</CardTitle>
          <Dialog open={respOpen} onOpenChange={setRespOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </DialogTrigger>
            <ResponsavelDialog
              pacienteId={id}
              onSaved={() => {
                setRespOpen(false);
                qc.invalidateQueries({ queryKey: ["responsaveis", id] });
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {(responsaveis || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum responsável cadastrado.</p>
          ) : (
            <div className="divide-y">
              {(responsaveis || []).map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {r.nome}{" "}
                      {r.parentesco && (
                        <span className="text-muted-foreground">• {r.parentesco}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[r.telefone, r.whatsapp && `WhatsApp: ${r.whatsapp}`, r.email]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => delResp.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CARD AGENDA FIXA SEMANAL */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Agenda Fixa Semanal</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Configuração dos dias e horários fixos do paciente por profissional</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={gerarSemanaOpen} onOpenChange={setGerarSemanaOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1" disabled={diasFixos.length === 0}>
                  <Calendar className="h-4 w-4" /> Gerar Semana
                </Button>
              </DialogTrigger>
              {gerarSemanaOpen && (
                <GerarSemanaDialog
                  paciente={paciente}
                  diasFixos={diasFixos}
                  onSaved={() => {
                    setGerarSemanaOpen(false);
                    qc.invalidateQueries({ queryKey: ["paciente-ags", id] });
                  }}
                  onClose={() => setGerarSemanaOpen(false)}
                />
              )}
            </Dialog>

            <Dialog open={feriasOpen} onOpenChange={setFeriasOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-destructive hover:text-destructive">
                  <CalendarOff className="h-4 w-4" /> Férias
                </Button>
              </DialogTrigger>
              {feriasOpen && (
                <FeriasDialog
                  pacienteId={id}
                  onSaved={() => {
                    setFeriasOpen(false);
                    qc.invalidateQueries({ queryKey: ["paciente-ags", id] });
                  }}
                  onClose={() => setFeriasOpen(false)}
                />
              )}
            </Dialog>

            <Dialog open={agendaFixaOpen} onOpenChange={setAgendaFixaOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> Horário Fixo
                </Button>
              </DialogTrigger>
              {agendaFixaOpen && (
                <AgendaFixaFormDialog
                  paciente={paciente}
                  profissionais={activeProfs}
                  salas={salas}
                  servicos={servicos}
                  onSaved={() => {
                    setAgendaFixaOpen(false);
                    qc.invalidateQueries({ queryKey: ["paciente", id] });
                  }}
                />
              )}
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {diasFixos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário fixo configurado.</p>
          ) : (
            <div className="divide-y">
              {diasFixos.map((df) => {
                const prof = activeProfs.find((p) => p.id === df.profissional_id);
                const sala = salas.find((s) => s.id === df.sala_id);
                const serv = servicos.find((s) => s.id === df.servico_id);
                const diasSemanaNomes = [
                  "Domingo",
                  "Segunda-feira",
                  "Terça-feira",
                  "Quarta-feira",
                  "Quinta-feira",
                  "Sexta-feira",
                  "Sábado",
                ];
                return (
                  <div key={df.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {diasSemanaNomes[df.dia_semana]} • {df.hora_inicio} - {df.hora_fim}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Profissional: <span className="font-semibold">{prof?.nome || "—"}</span>
                        {serv && ` • Serviço: ${serv.nome}`}
                        {sala && ` • Sala: ${sala.nome}`}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveDiaFixo(df.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {(ags || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem agendamentos.</p>
          ) : (
            <div className="divide-y">
              {(ags || []).map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div
                    className="h-8 w-1 rounded-full"
                    style={{ background: a.profissionais?.cor }}
                  />
                  <div className="min-w-[140px] font-medium">
                    {format(new Date(a.data_inicio), "dd/MM/yyyy HH:mm")}
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {a.servicos?.nome} • {a.profissionais?.nome}
                  </div>
                  <Badge variant="secondary">{a.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function ResponsavelDialog({ pacienteId, onSaved }: { pacienteId: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    nome: "",
    parentesco: "",
    telefone: "",
    whatsapp: "",
    email: "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("responsaveis")
        .insert({ ...form, paciente_id: pacienteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Responsável adicionado");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo responsável</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Parentesco</Label>
          <Input
            value={form.parentesco}
            onChange={(e) => setForm({ ...form, parentesco: e.target.value })}
            placeholder="Mãe, Pai, Responsável legal…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ============ HELPER TYPES & FUNCTIONS FOR DIAS FIXOS ============

interface DiaFixo {
  id: string;
  profissional_id: string;
  servico_id: string | null;
  sala_id: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

const parseDiasFixos = (observacoes: string | null | undefined): DiaFixo[] => {
  if (!observacoes) return [];
  const match = observacoes.match(/<!--DIAS_FIXOS:(.*?)-->/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.error("Erro ao fazer parse dos dias fixos", e);
    }
  }
  return [];
};

const serializeObservacoes = (rawObs: string | null | undefined, diasFixos: DiaFixo[]): string => {
  const cleanObs = (rawObs || "").replace(/<!--DIAS_FIXOS:.*?-->/, "").trim();
  if (diasFixos.length > 0) {
    return `${cleanObs}\n\n<!--DIAS_FIXOS:${JSON.stringify(diasFixos)}-->`.trim();
  }
  return cleanObs;
};

const getCleanObservacoes = (rawObs: string | null | undefined): string => {
  return (rawObs || "").replace(/<!--DIAS_FIXOS:.*?-->/, "").trim();
};

// ============ DIALOGS FOR AGENDA FIXA & FERIAS ============

function AgendaFixaFormDialog({
  paciente,
  profissionais,
  salas,
  servicos,
  onSaved,
}: {
  paciente: any;
  profissionais: any[];
  salas: any[];
  servicos: any[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    profissional_id: "",
    servico_id: "",
    sala_id: "",
    dia_semana: "1",
    hora_inicio: "08:00",
    hora_fim: "09:00",
  });

  const m = useMutation({
    mutationFn: async () => {
      if (!form.profissional_id) {
        throw new Error("Selecione um profissional.");
      }
      const currentDiasFixos = parseDiasFixos(paciente.observacoes);
      
      const newSlot: DiaFixo = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        profissional_id: form.profissional_id,
        servico_id: form.servico_id || null,
        sala_id: form.sala_id || null,
        dia_semana: Number(form.dia_semana),
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
      };

      const updated = [...currentDiasFixos, newSlot];
      const newObs = serializeObservacoes(paciente.observacoes, updated);

      const { error } = await supabase
        .from("pacientes")
        .update({ observacoes: newObs })
        .eq("id", paciente.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Horário fixo adicionado");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Adicionar horário fixo semanal</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label>Profissional *</Label>
          <select
            required
            value={form.profissional_id}
            onChange={(e) => setForm({ ...form, profissional_id: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Selecione um profissional...</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Serviço (Opcional)</Label>
            <select
              value={form.servico_id}
              onChange={(e) => setForm({ ...form, servico_id: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione um serviço...</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Sala (Opcional)</Label>
            <select
              value={form.sala_id}
              onChange={(e) => setForm({ ...form, sala_id: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione uma sala...</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Dia da Semana</Label>
          <select
            value={form.dia_semana}
            onChange={(e) => setForm({ ...form, dia_semana: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="1">Segunda-feira</option>
            <option value="2">Terça-feira</option>
            <option value="3">Quarta-feira</option>
            <option value="4">Quinta-feira</option>
            <option value="5">Sexta-feira</option>
            <option value="6">Sábado</option>
            <option value="0">Domingo</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Hora Início</Label>
            <Input
              type="time"
              required
              value={form.hora_inicio}
              onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hora Fim</Label>
            <Input
              type="time"
              required
              value={form.hora_fim}
              onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={m.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function GerarSemanaDialog({
  paciente,
  diasFixos,
  onSaved,
  onClose,
}: {
  paciente: any;
  diasFixos: DiaFixo[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [semanaInicio, setSemanaInicio] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split("T")[0];
  });

  const getMondayOfDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const mondayDate = getMondayOfDate(semanaInicio);
  const sundayDate = new Date(mondayDate);
  sundayDate.setDate(mondayDate.getDate() + 6);

  const m = useMutation({
    mutationFn: async () => {
      const startIso = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate(), 0, 0, 0).toISOString();
      const endIso = new Date(sundayDate.getFullYear(), sundayDate.getMonth(), sundayDate.getDate(), 23, 59, 59).toISOString();

      const { data: existingAgs, error: fetchError } = await supabase
        .from("agendamentos")
        .select("data_inicio")
        .eq("paciente_id", paciente.id)
        .gte("data_inicio", startIso)
        .lte("data_inicio", endIso);

      if (fetchError) throw fetchError;

      const occurrencesToInsert = [];
      for (const df of diasFixos) {
        const targetDayDate = new Date(mondayDate);
        const diff = df.dia_semana - 1;
        targetDayDate.setDate(mondayDate.getDate() + (diff < 0 ? 6 : diff));

        const [startH, startM] = df.hora_inicio.split(":").map(Number);
        const [endH, endM] = df.hora_fim.split(":").map(Number);

        const occStart = new Date(targetDayDate.getFullYear(), targetDayDate.getMonth(), targetDayDate.getDate(), startH, startM, 0);
        const occEnd = new Date(targetDayDate.getFullYear(), targetDayDate.getMonth(), targetDayDate.getDate(), endH, endM, 0);

        const occStartIso = occStart.toISOString();
        const occEndIso = occEnd.toISOString();

        const isDuplicate = (existingAgs || []).some((ea: any) => {
          const eaTime = new Date(ea.data_inicio).getTime();
          return Math.abs(eaTime - occStart.getTime()) < 60000;
        });

        if (!isDuplicate) {
          occurrencesToInsert.push({
            paciente_id: paciente.id,
            profissional_id: df.profissional_id,
            servico_id: df.servico_id || null,
            sala_id: df.sala_id || null,
            data_inicio: occStartIso,
            data_fim: occEndIso,
            status: "confirmado",
            recorrencia: "unica",
            observacoes: "Gerado via Agenda Fixa",
          });
        }
      }

      if (occurrencesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("agendamentos")
          .insert(occurrencesToInsert as any);
        if (insertError) throw insertError;
      }

      return occurrencesToInsert.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("Todos os horários desta semana já estavam agendados.");
      } else {
        toast.success(`Gerado(s) ${count} agendamento(s) para a semana com sucesso!`);
      }
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Gerar agendamentos da semana</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label>Selecione um dia da semana desejada</Label>
          <Input
            type="date"
            required
            value={semanaInicio}
            onChange={(e) => setSemanaInicio(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Será gerada a semana de: <strong>{format(mondayDate, "dd/MM/yyyy")}</strong> até <strong>{format(sundayDate, "dd/MM/yyyy")}</strong>
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={m.isPending}>
            Gerar Agendamentos
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function FeriasDialog({
  pacienteId,
  onSaved,
  onClose,
}: {
  pacienteId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    data_inicio: "",
    data_fim: "",
  });

  const m = useMutation({
    mutationFn: async () => {
      if (!form.data_inicio || !form.data_fim) {
        throw new Error("Preencha as datas de início e fim.");
      }
      const startIso = new Date(form.data_inicio + "T00:00:00").toISOString();
      const endIso = new Date(form.data_fim + "T23:59:59").toISOString();

      if (startIso > endIso) {
        throw new Error("A data de início deve ser anterior à data de fim.");
      }

      const { error } = await supabase
        .from("agendamentos")
        .update({
          status: "cancelado",
          motivo_cancelamento: "Férias do paciente",
        })
        .eq("paciente_id", pacienteId)
        .gte("data_inicio", startIso)
        .lte("data_inicio", endIso);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Período de férias marcado. Agendamentos cancelados.");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Marcar férias do paciente</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-xs text-muted-foreground">
          Isso mudará o status de todos os agendamentos do paciente no período informado para <strong>Cancelado</strong>.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Data Início</Label>
            <Input
              type="date"
              required
              value={form.data_inicio}
              onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data Fim</Label>
            <Input
              type="date"
              required
              value={form.data_fim}
              onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={m.isPending} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Confirmar Cancelamentos
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
