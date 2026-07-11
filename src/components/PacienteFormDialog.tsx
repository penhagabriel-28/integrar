import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const formatBirthDate = (value: string) => {
  const nums = value.replace(/\D/g, "");
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return `${nums.substring(0, 2)}/${nums.substring(2)}`;
  return `${nums.substring(0, 2)}/${nums.substring(2, 4)}/${nums.substring(4, 8)}`;
};

export const formatBirthDateForDisplay = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export const formatPhone = (value: string) => {
  if (!value) return "";
  const nums = value.replace(/\D/g, "");
  if (nums.length <= 2) return nums;
  if (nums.length <= 7) return `(${nums.substring(0, 2)}) ${nums.substring(2)}`;
  return `(${nums.substring(0, 2)}) ${nums.substring(2, 7)}-${nums.substring(7, 11)}`;
};

export const formatCPF = (value: string) => {
  if (!value) return "";
  const nums = value.replace(/\D/g, "");
  if (nums.length <= 3) return nums;
  if (nums.length <= 6) return `${nums.substring(0, 3)}.${nums.substring(3)}`;
  if (nums.length <= 9) return `${nums.substring(0, 3)}.${nums.substring(3, 6)}.${nums.substring(6)}`;
  return `${nums.substring(0, 3)}.${nums.substring(3, 6)}.${nums.substring(6, 9)}-${nums.substring(9, 11)}`;
};

const EMPTY_ARRAY: any[] = [];

const getCleanObservacoes = (rawObs: string | null | undefined): string => {
  return (rawObs || "").replace(/<!--DIAS_FIXOS:.*?-->/, "").trim();
};

export function PacienteFormDialog({
  paciente,
  onSaved,
  defaultSpecialty,
  defaultProfessionalId,
}: {
  paciente?: any;
  onSaved: (newPac?: any) => void;
  defaultSpecialty?: string;
  defaultProfessionalId?: string;
}) {
  const qc = useQueryClient();
  const [hasLoadedResponsavel, setHasLoadedResponsavel] = useState(false);
  const [showSecondaryResponsible, setShowSecondaryResponsible] = useState(false);
  const [form, setForm] = useState({
    nome: paciente?.nome ?? "",
    data_nascimento: paciente?.data_nascimento
      ? formatBirthDateForDisplay(paciente.data_nascimento)
      : "",
    cid_principal: paciente?.cid_principal ?? "",
    cids_secundarios: Array.isArray(paciente?.cids_secundarios)
      ? (paciente.cids_secundarios as string[])
      : defaultSpecialty
        ? [defaultSpecialty]
        : [],
    tipo_atendimento: paciente?.tipo_atendimento ?? "particular",
    convenio_nome: paciente?.convenio_nome ?? "",
    status: paciente?.status ?? "ativo",
    observacoes: getCleanObservacoes(paciente?.observacoes),
    responsavel: "",
    telefone: "",
    responsavel_secundario: "",
    telefone_secundario: "",
    cpf: paciente?.cpf ?? "",
    valor_mensal: paciente?.valor_mensal ? String(paciente.valor_mensal) : "",
    apoio_frequencia: paciente?.apoio_frequencia ?? "avulso",
    apoio_valor_personalizado: paciente?.apoio_valor_personalizado ? String(paciente.apoio_valor_personalizado) : "",
  });
  const { data: profissionais = EMPTY_ARRAY } = useQuery({
    queryKey: ["profissionais"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profissionais").select("especialidade");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profissionaisList = EMPTY_ARRAY } = useQuery({
    queryKey: ["profissionais-list-form"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id, nome, cor, especialidade, valores_config, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: currentProfs = EMPTY_ARRAY, isSuccess: isCurrentProfsSuccess } = useQuery({
    queryKey: ["paciente-profissionais", paciente?.id],
    queryFn: async () => {
      if (!paciente?.id) return [];
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("profissional_id")
        .eq("paciente_id", paciente.id);
      if (error) throw error;
      return (data ?? []).map((d) => d.profissional_id);
    },
    enabled: !!paciente?.id,
  });

  const displayedProfissionaisList = useMemo(() => {
    return (profissionaisList || []).filter((prof: any) => {
      if (prof.ativo) return true;
      if (currentProfs.includes(prof.id)) return true;
      const config = prof.valores_config as any;
      if (config?.ativo_ate) {
        const targetMonth = new Date().toISOString().substring(0, 7);
        return targetMonth <= config.ativo_ate;
      }
      return false;
    });
  }, [profissionaisList, currentProfs]);

  const [selectedProfs, setSelectedProfs] = useState<string[]>(() => {
    if (paciente?.id) {
      return [];
    }
    return defaultProfessionalId ? [defaultProfessionalId] : [];
  });

  useEffect(() => {
    if (paciente?.id && isCurrentProfsSuccess && currentProfs) {
      setSelectedProfs(currentProfs);
    }
  }, [currentProfs, isCurrentProfsSuccess, paciente?.id]);

  const availableSpecialties = Array.from(
    new Set(
      (profissionais || [])
        .flatMap((p) => {
          if (typeof p?.especialidade !== "string") return [];
          return p.especialidade.split(",").map((s: string) => s.trim());
        })
        .filter(Boolean),
    ),
  ) as string[];

  const { data: responsaveis = EMPTY_ARRAY, isSuccess: isResponsaveisSuccess } = useQuery({
    queryKey: ["responsaveis", paciente?.id],
    queryFn: async () => {
      if (!paciente?.id) return [];
      const { data, error } = await supabase
        .from("responsaveis")
        .select("*")
        .eq("paciente_id", paciente.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!paciente?.id,
  });

  useEffect(() => {
    if (isResponsaveisSuccess && responsaveis && responsaveis.length > 0 && !hasLoadedResponsavel) {
      setForm((f) => ({
        ...f,
        responsavel: responsaveis[0]?.nome || "",
        telefone: formatPhone(responsaveis[0]?.telefone ?? ""),
        responsavel_secundario: responsaveis[1]?.nome || "",
        telefone_secundario: formatPhone(responsaveis[1]?.telefone ?? ""),
      }));
      if (responsaveis.length > 1) {
        setShowSecondaryResponsible(true);
      }
      setHasLoadedResponsavel(true);
    }
  }, [responsaveis, isResponsaveisSuccess, hasLoadedResponsavel]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setForm((f) => ({ ...f, telefone: formatted }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (form.telefone.trim() && !form.responsavel.trim()) {
        throw new Error("O nome do responsável é obrigatório quando o telefone é informado.");
      }

      if (form.telefone_secundario.trim() && !form.responsavel_secundario.trim()) {
        throw new Error("O nome do responsável adicional é obrigatório quando o telefone adicional é informado.");
      }

      let dbBirthDate: string | null = null;
      if (form.data_nascimento) {
        const parts = form.data_nascimento.split("/");
        if (
          parts.length !== 3 ||
          parts[0].length !== 2 ||
          parts[1].length !== 2 ||
          parts[2].length !== 4
        ) {
          throw new Error("Data de nascimento inválida. Use o formato DD/MM/AAAA.");
        }
        dbBirthDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      let finalObservacoes = form.observacoes || null;
      if (paciente?.observacoes) {
        const match = paciente.observacoes.match(/<!--DIAS_FIXOS:.*?-->/);
        if (match) {
          finalObservacoes = `${form.observacoes || ""}\n\n${match[0]}`.trim() || null;
        }
      }

      const payload: any = {
        nome: form.nome,
        data_nascimento: dbBirthDate,
        cid_principal: form.cid_principal || null,
        cids_secundarios: form.cids_secundarios,
        tipo_atendimento: form.tipo_atendimento,
        convenio_nome: form.tipo_atendimento === "convenio" ? form.convenio_nome : null,
        status: form.status,
        observacoes: finalObservacoes,
        cpf: form.cpf || null,
        valor_mensal: form.valor_mensal ? Number(form.valor_mensal) : null,
        apoio_frequencia: form.apoio_frequencia,
        apoio_valor_personalizado: form.apoio_valor_personalizado ? Number(form.apoio_valor_personalizado) : null,
      };
      if (paciente) {
        // Edit mode
        const { error } = await supabase.from("pacientes").update(payload).eq("id", paciente.id);
        if (error) throw error;

        // Clear existing mappings
        await supabase.from("paciente_profissional").delete().eq("paciente_id", paciente.id);

        // Insert new mappings
        if (selectedProfs.length > 0) {
          const mappings = selectedProfs.map((profId) => ({
            paciente_id: paciente.id,
            profissional_id: profId,
          }));
          const { error: ppError } = await supabase.from("paciente_profissional").insert(mappings);
          if (ppError) throw ppError;
        }

        if (responsaveis.length > 0) {
          if (!form.responsavel.trim() && !form.telefone.trim()) {
            // Delete existing responsible person if both fields are cleared
            const { error: rError } = await supabase
              .from("responsaveis")
              .delete()
              .eq("id", responsaveis[0].id);
            if (rError) throw rError;
          } else {
            // Update existing responsible person if name is provided
            const { error: rError } = await supabase
              .from("responsaveis")
              .update({
                nome: form.responsavel.trim(),
                telefone: form.telefone.trim() || null,
              })
              .eq("id", responsaveis[0].id);
            if (rError) throw rError;
          }
        } else if (form.responsavel.trim()) {
          // Insert new responsible person if name is provided and none existed
          const { error: rError } = await supabase.from("responsaveis").insert({
            paciente_id: paciente.id,
            nome: form.responsavel.trim(),
            telefone: form.telefone.trim() || null,
          });
          if (rError) throw rError;
        }

        if (responsaveis.length > 1) {
          if (!form.responsavel_secundario.trim() && !form.telefone_secundario.trim()) {
            // Delete secondary responsible
            const { error: rError } = await supabase
              .from("responsaveis")
              .delete()
              .eq("id", responsaveis[1].id);
            if (rError) throw rError;
          } else {
            // Update secondary responsible
            const { error: rError } = await supabase
              .from("responsaveis")
              .update({
                nome: form.responsavel_secundario.trim(),
                telefone: form.telefone_secundario.trim() || null,
              })
              .eq("id", responsaveis[1].id);
            if (rError) throw rError;
          }
        } else if (form.responsavel_secundario.trim()) {
          // Insert secondary responsible
          const { error: rError } = await supabase.from("responsaveis").insert({
            paciente_id: paciente.id,
            nome: form.responsavel_secundario.trim(),
            telefone: form.telefone_secundario.trim() || null,
          });
          if (rError) throw rError;
        }

        // Recalculate Apoio package if applicable
        if (form.cids_secundarios.some((s: string) => s.toLowerCase() === "apoio" || s.toUpperCase() === "AP")) {
          const today = new Date();
          const competencia = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
          await supabase.rpc("fn_recalculate_apoio_package", {
            p_paciente_id: paciente.id,
            p_competencia: competencia
          });
        }

        return { ...paciente, ...payload };
      } else {
        // Create mode
        const { data: newPaciente, error } = await supabase
          .from("pacientes")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        // Insert new mappings
        if (selectedProfs.length > 0 && newPaciente) {
          const mappings = selectedProfs.map((profId) => ({
            paciente_id: newPaciente.id,
            profissional_id: profId,
          }));
          const { error: ppError } = await supabase.from("paciente_profissional").insert(mappings);
          if (ppError) throw ppError;
        }

        if (form.responsavel.trim() && newPaciente) {
          const { error: rError } = await supabase.from("responsaveis").insert({
            paciente_id: newPaciente.id,
            nome: form.responsavel.trim(),
            telefone: form.telefone.trim() || null,
          });
          if (rError) throw rError;
        }

        if (form.responsavel_secundario.trim() && newPaciente) {
          const { error: rError } = await supabase.from("responsaveis").insert({
            paciente_id: newPaciente.id,
            nome: form.responsavel_secundario.trim(),
            telefone: form.telefone_secundario.trim() || null,
          });
          if (rError) throw rError;
        }

        // Recalculate Apoio package if applicable
        if (newPaciente && form.cids_secundarios.some((s: string) => s.toLowerCase() === "apoio" || s.toUpperCase() === "AP")) {
          const today = new Date();
          const competencia = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
          await supabase.rpc("fn_recalculate_apoio_package", {
            p_paciente_id: newPaciente.id,
            p_competencia: competencia
          });
        }

        return newPaciente;
      }
    },
    onSuccess: (data) => {
      toast.success(paciente ? "Paciente atualizado" : "Paciente cadastrado");
      qc.invalidateQueries({ queryKey: ["paciente-profissional-all"] });
      qc.invalidateQueries({ queryKey: ["paciente-profissionais-detail", paciente?.id] });
      qc.invalidateQueries({ queryKey: ["paciente-profissionais", paciente?.id] });
      qc.invalidateQueries({ queryKey: ["paciente-profissional"] });
      onSaved(data);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{paciente ? "Editar paciente" : "Novo paciente"}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label>Nome completo *</Label>
          <Input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Data de Nascimento</Label>
            <Input
              type="text"
              value={form.data_nascimento}
              onChange={(e) =>
                setForm({ ...form, data_nascimento: formatBirthDate(e.target.value) })
              }
              placeholder="DD/MM/AAAA"
              maxLength={10}
            />
          </div>
          <div className="space-y-1.5">
            <Label>CID(s)</Label>
            <Input
              value={form.cid_principal}
              onChange={(e) => setForm({ ...form, cid_principal: e.target.value })}
              placeholder="ex.: F84.0, F84.5"
            />
          </div>
        </div>
        <div className="space-y-1.5 animate-in fade-in duration-200">
          <Label>Especialidades desejadas</Label>
          <div className="flex flex-wrap gap-2">
            {availableSpecialties.map((spec) => {
              const selected = form.cids_secundarios.includes(spec);
              return (
                <button
                  type="button"
                  key={spec}
                  onClick={() => {
                    const next = selected
                      ? form.cids_secundarios.filter((s) => s !== spec)
                      : [...form.cids_secundarios, spec];
                    setForm({ ...form, cids_secundarios: next });
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium border transition ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {spec}
                </button>
              );
            })}
          </div>
        </div>
        
        {form.cids_secundarios.some((s) => s.toLowerCase() === "apoio" || s.toUpperCase() === "AP") && (
          <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-primary/5 border-dashed border-border/80 animate-in fade-in duration-200">
            <div className="col-span-2 text-xs font-bold uppercase tracking-wider text-primary">
              Configurações do Apoio
            </div>
            <div className="space-y-1.5">
              <Label>Frequência do Aluno</Label>
              <Select
                value={form.apoio_frequencia}
                onValueChange={(v) => setForm({ ...form, apoio_frequencia: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avulso">Sessão Avulsa (R$ 50,00)</SelectItem>
                  <SelectItem value="1x">1x por semana (R$ 120,00)</SelectItem>
                  <SelectItem value="2x">2x por semana (R$ 240,00)</SelectItem>
                  <SelectItem value="3x">3x por semana (R$ 360,00)</SelectItem>
                  <SelectItem value="semana_toda">Semana Toda (R$ 450,00)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor Customizado / Desconto</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={form.apoio_frequencia === 'avulso' ? "Ex: 40.00 (por sessão)" : "Ex: 100.00 (mensal)"}
                value={form.apoio_valor_personalizado}
                onChange={(e) => setForm({ ...form, apoio_valor_personalizado: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5 animate-in fade-in duration-200">
          <Label>Profissionais Acompanhantes</Label>
          <div className="flex flex-wrap gap-2">
            {(displayedProfissionaisList || []).map((prof: any) => {
              const selected = selectedProfs.includes(prof.id);
              return (
                <button
                  type="button"
                  key={prof.id}
                  onClick={() => {
                    const next = selected
                      ? selectedProfs.filter((id) => id !== prof.id)
                      : [...selectedProfs, prof.id];
                    setSelectedProfs(next);
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium border transition ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 shrink-0"
                    style={{ backgroundColor: prof.cor || "var(--primary)" }}
                  />
                  {prof.nome}
                </button>
              );
            })}
            {(displayedProfissionaisList || []).length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                Nenhum profissional ativo cadastrado.
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Responsável</Label>
              {!showSecondaryResponsible && (
                <button
                  type="button"
                  onClick={() => setShowSecondaryResponsible(true)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0 font-medium"
                  title="Adicionar responsável adicional"
                >
                  <Plus className="h-2.5 w-2.5" /> Adicionar outro
                </button>
              )}
            </div>
            <Input
              value={form.responsavel}
              onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
              placeholder="Nome do pai, mãe..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={handlePhoneChange}
              placeholder="(XX) XXXXX-XXXX"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CPF do Responsável</Label>
            <Input
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
              placeholder="XXX.XXX.XXX-XX"
              maxLength={14}
            />
          </div>
        </div>

        {showSecondaryResponsible && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Responsável Adicional (Opcional)</Label>
                <button
                  type="button"
                  onClick={() => {
                    setShowSecondaryResponsible(false);
                    setForm({ ...form, responsavel_secundario: "", telefone_secundario: "" });
                  }}
                  className="text-[10px] text-destructive hover:underline cursor-pointer bg-transparent border-none p-0 font-medium"
                  title="Remover responsável adicional"
                >
                  Remover
                </button>
              </div>
              <Input
                value={form.responsavel_secundario || ""}
                onChange={(e) => setForm({ ...form, responsavel_secundario: e.target.value })}
                placeholder="Nome do segundo responsável..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone do Resp. Adicional (Opcional)</Label>
              <Input
                value={form.telefone_secundario || ""}
                onChange={(e) => setForm({ ...form, telefone_secundario: formatPhone(e.target.value) })}
                placeholder="(XX) XXXXX-XXXX"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo de atendimento</Label>
            <Select
              value={form.tipo_atendimento}
              onValueChange={(v) => setForm({ ...form, tipo_atendimento: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="particular">Particular</SelectItem>
                <SelectItem value="convenio">Convênio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="lista_espera">Lista de espera</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.tipo_atendimento === "particular" && (
          <div className="space-y-1.5 animate-in fade-in duration-200">
            <Label>Forma de Cobrança</Label>
            <Select
              value={Number(form.valor_mensal) > 0 ? "mensal" : "sessao"}
              onValueChange={(v) => setForm({ ...form, valor_mensal: v === "mensal" ? "1" : "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a forma de cobrança..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sessao">Por Sessão</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {form.tipo_atendimento === "convenio" && (
          <div className="space-y-1.5 animate-in fade-in duration-200">
            <Label>Nome do convênio</Label>
            <Input
              value={form.convenio_nome}
              onChange={(e) => setForm({ ...form, convenio_nome: e.target.value })}
              placeholder="Nome do plano/convênio"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Observações clínicas</Label>
          <Textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
