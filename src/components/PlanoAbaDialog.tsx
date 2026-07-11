import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Copy,
  Info,
  Calendar,
  User,
  Activity,
  CheckCircle,
  Star,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const generateUUID = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

interface Programa {
  id: string;
  nome: string;
  descricao?: string;
  tentativas_prog: number;
  respostas: Record<number, "RI" | "AP" | "AT" | "E" | "">;
}

interface PlanoAbaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  pacienteNome: string;
  profissionalNome: string;
  value: any;
  onChange: (value: any) => void;
  onConfirm?: (value: any) => Promise<void> | void;
}

const DEFAULT_PROGRAMAS: Programa[] = [
  {
    id: "1",
    nome: "Senta bonito ___ segundos",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "2",
    nome: "Olha Para mim ___ segundos",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "3",
    nome: "Imitação Motora (1-Bater palmas, 2-Levantar mãos, 3-Cabeça, 4-Tchau, 5-Apontar, 6-Beijo, 7-Nariz, 8-Orelha, 9-Barriga, 10-Pinça, 11-Legal, 12-Dedos)",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "4",
    nome: "RCO cores (Verde, vermelho, roxo, amarelo)",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "5",
    nome: "RCO consoantes (G-L)",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "6",
    nome: "RCO números (6 - 10)",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "7",
    nome: "Discriminação simples (prato, prato e colher) Passo ______",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "8",
    nome: "Chamar pelo nome “Rafael” sem o item de preferência.",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "9",
    nome: "RCO Objetos (1-Carro, 2-Copo, 3-Mesa, 4-Celular, 5-Biscoito, 6-Camisa, 7-Lápis, 8-Livro, 9-Cadeira, 10-Sapato)",
    tentativas_prog: 12,
    respostas: {},
  },
  {
    id: "10",
    nome: "Imitação com brinquedos",
    tentativas_prog: 12,
    respostas: {},
  },
];

export function PlanoAbaDialog({
  open,
  onOpenChange,
  pacienteId,
  pacienteNome,
  profissionalNome,
  value,
  onChange,
  onConfirm,
}: PlanoAbaProps) {
  // Plano ABA local states
  const [supervisorId, setSupervisorId] = useState("");

  // Query active professionals to populate supervisor options
  const { data: profissionais = [] } = useQuery({
    queryKey: ["profissionais-aba"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profissionais")
        .select("id, nome, especialidade, valores_config, ativo")
        .order("nome");
      return data ?? [];
    },
    enabled: open,
  });

  const activeProfissionais = useMemo(() => {
    if (!Array.isArray(profissionais)) return [];
    return profissionais.filter((p: any) => {
      if (p.id === supervisorId) return true;
      if (p.ativo) return true;
      const config = p.valores_config as any;
      if (config?.ativo_ate) {
        const targetMonth = new Date().toISOString().substring(0, 7);
        return targetMonth <= config.ativo_ate;
      }
      return false;
    });
  }, [profissionais, supervisorId]);

  // Filter or sort professionals to prioritize supervisors
  const supervisores = useMemo(() => {
    return activeProfissionais.filter((p: any) => {
      const spec = p.especialidade ? String(p.especialidade).toLowerCase() : "";
      return spec.includes("supervisor") || spec.includes("coordenad");
    });
  }, [activeProfissionais]);
  const [tentativasMax, setTentativasMax] = useState(19);
  const [avaliacoesPreferencia, setAvaliacoesPreferencia] = useState<string[]>([
    "",
    "",
    "",
    "",
  ]);
  const [observacoesMedica, setObservacoesMedica] = useState("");
  const [programas, setProgramas] = useState<Programa[]>([]);

  // Initialize fields when opening (only once per open cycle)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (value && typeof value === "object" && Array.isArray(value.programas)) {
      // Load existing plan
      setSupervisorId(value.supervisor_id ?? "");
      setTentativasMax(value.tentativas_max ?? 19);
      setAvaliacoesPreferencia(
        Array.isArray(value.avaliacoes_preferencia)
          ? [...value.avaliacoes_preferencia, "", "", "", ""].slice(0, 4)
          : ["", "", "", ""]
      );
      setObservacoesMedica(value.observacoes_medica ?? "");
      setProgramas(value.programas);
      return;
    }

    // Look up previous session for this patient
    const loadHistory = async () => {
      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("plano_aba")
          .eq("paciente_id", pacienteId)
          .not("plano_aba", "is", null)
          .order("data_inicio", { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0 && data[0].plano_aba) {
          const prevPlan = data[0].plano_aba as any;
          setSupervisorId(prevPlan.supervisor_id ?? "");
          setTentativasMax(prevPlan.tentativas_max ?? 19);
          setAvaliacoesPreferencia(
            Array.isArray(prevPlan.avaliacoes_preferencia)
              ? [...prevPlan.avaliacoes_preferencia, "", "", "", ""].slice(0, 4)
              : ["", "", "", ""]
          );
          setObservacoesMedica(prevPlan.observacoes_medica ?? "");

          const cleanedPrograms = (prevPlan.programas ?? []).map((p: any) => ({
            id: p.id || generateUUID(),
            nome: p.nome || "",
            descricao: p.descricao || "",
            tentativas_prog: p.tentativas_prog ?? 12,
            respostas: {},
          }));
          setProgramas(cleanedPrograms);
          toast.success("Estrutura do Plano ABA copiada do último atendimento!");
        } else {
          setProgramas(
            DEFAULT_PROGRAMAS.map((p) => ({
              ...p,
              id: generateUUID(),
              respostas: {},
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load historical Plano ABA:", err);
        setProgramas(
          DEFAULT_PROGRAMAS.map((p) => ({
            ...p,
            id: generateUUID(),
            respostas: {},
          }))
        );
      }
    };

    loadHistory();
  }, [open, value, pacienteId]);

  // Auto-select supervisor when professional list arrives (only if none chosen yet)
  useEffect(() => {
    if (!open) return;
    if (supervisorId) return;
    if (!Array.isArray(profissionais) || profissionais.length === 0) return;
    const braulio = profissionais.find((p: any) => {
      const name = p.nome ? String(p.nome).toLowerCase() : "";
      return name.includes("bráulio");
    });
    if (braulio) {
      setSupervisorId(braulio.id);
    } else if (supervisores.length > 0) {
      setSupervisorId(supervisores[0].id);
    }
  }, [open, profissionais, supervisores, supervisorId]);

  // Fetch history manually
  const handleCopyHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("plano_aba")
        .eq("paciente_id", pacienteId)
        .not("plano_aba", "is", null)
        .order("data_inicio", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0 && data[0].plano_aba) {
        const prevPlan = data[0].plano_aba as any;
        setSupervisorId(prevPlan.supervisor_id ?? "");
        setTentativasMax(prevPlan.tentativas_max ?? 19);
        setAvaliacoesPreferencia(
          Array.isArray(prevPlan.avaliacoes_preferencia)
            ? [...prevPlan.avaliacoes_preferencia, "", "", "", ""].slice(0, 4)
            : ["", "", "", ""]
        );
        setObservacoesMedica(prevPlan.observacoes_medica ?? "");
        
        // Copy programs but reset trial responses
        const cleanedPrograms = (prevPlan.programas ?? []).map((p: any) => ({
          id: p.id || generateUUID(),
          nome: p.nome || "",
          descricao: p.descricao || "",
          tentativas_prog: p.tentativas_prog ?? 12,
          respostas: {},
        }));
        setProgramas(cleanedPrograms);
        toast.success("Estrutura do Plano ABA copiada com sucesso!");
      } else {
        toast.info("Nenhum histórico de Plano ABA encontrado para este paciente.");
      }
    } catch (err: any) {
      toast.error("Erro ao copiar histórico: " + err.message);
    }
  };

  // Restore default programs
  const handleRestoreDefault = () => {
    setProgramas(
      DEFAULT_PROGRAMAS.map((p) => ({
        ...p,
        id: generateUUID(),
        respostas: {},
      }))
    );
    toast.success("Plano ABA restaurado para o modelo padrão.");
  };

  const [saving, setSaving] = useState(false);

  // Save changes — persist directly when onConfirm is provided
  const handleSave = async () => {
    const supervisor = Array.isArray(profissionais) ? profissionais.find((p) => p.id === supervisorId) : undefined;
    const payload = {
      supervisor_id: supervisorId || null,
      supervisor_nome: supervisor ? supervisor.nome : "",
      tentativas_max: tentativasMax,
      avaliacoes_preferencia: avaliacoesPreferencia.filter(Boolean),
      observacoes_medica: observacoesMedica,
      programas: programas,
    };
    onChange(payload);
    if (onConfirm) {
      try {
        setSaving(true);
        await onConfirm(payload);
        toast.success("Plano ABA salvo no agendamento!");
        onOpenChange(false);
      } catch (err: any) {
        toast.error("Erro ao salvar Plano ABA: " + (err?.message ?? String(err)));
      } finally {
        setSaving(false);
      }
    } else {
      onOpenChange(false);
      toast.success("Plano ABA salvo temporariamente no agendamento!");
    }
  };

  // Cycle trial cell response
  const handleCellClick = (progId: string, trialIdx: number, disabled: boolean) => {
    if (disabled) return;
    setProgramas((prev) =>
      prev.map((prog) => {
        if (prog.id !== progId) return prog;
        const current = prog.respostas?.[trialIdx] || "";
        let next: "RI" | "AP" | "AT" | "E" | "" = "";
        if (current === "") next = "RI";
        else if (current === "RI") next = "AP";
        else if (current === "AP") next = "AT";
        else if (current === "AT") next = "E";
        else if (current === "E") next = "";

        return {
          ...prog,
          respostas: {
            ...prog.respostas,
            [trialIdx]: next,
          },
        };
      })
    );
  };

  // Zero/Reset all responses
  const handleClearAll = () => {
    setProgramas((prev) =>
      prev.map((prog) => ({
        ...prog,
        respostas: {},
      }))
    );
    toast.success("Todas as tentativas foram zeradas.");
  };

  // Fill empty trials with RI up to program limit
  const handleFillWithRI = () => {
    setProgramas((prev) =>
      prev.map((prog) => {
        const newRespostas = { ...prog.respostas };
        for (let i = 1; i <= prog.tentativas_prog; i++) {
          if (!newRespostas[i]) {
            newRespostas[i] = "RI";
          }
        }
        return {
          ...prog,
          respostas: newRespostas,
        };
      })
    );
    toast.success("Tentativas vazias preenchidas com 'RI'.");
  };

  // Add new program row
  const handleAddProgram = () => {
    setProgramas((prev) => [
      ...prev,
      {
        id: generateUUID(),
        nome: `Programa ${prev.length + 1}`,
        descricao: "",
        tentativas_prog: 12,
        respostas: {},
      },
    ]);
  };

  // Remove program row
  const handleRemoveProgram = (id: string) => {
    setProgramas((prev) => prev.filter((p) => p.id !== id));
  };

  // Edit program name
  const handleProgramNameChange = (id: string, name: string) => {
    setProgramas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, nome: name } : p))
    );
  };

  // Edit program description
  const handleProgramDescChange = (id: string, desc: string) => {
    setProgramas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, descricao: desc } : p))
    );
  };

  // Edit program trials count
  const handleProgramTrialsChange = (id: string, count: number) => {
    setProgramas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, tentativas_prog: count } : p))
    );
  };

  // Helper count totals
  const countTotals = (prog: Programa, type: "RI" | "AP" | "AT" | "E") => {
    let count = 0;
    for (let i = 1; i <= prog.tentativas_prog; i++) {
      if (prog.respostas?.[i] === type) {
        count++;
      }
    }
    return count;
  };

  const [activeMobileTab, setActiveMobileTab] = useState<"planilha" | "dados" | "preferencias" | "observacoes">("planilha");

  const cardDados = (
    <div className="bg-white dark:bg-slate-950 border rounded-xl p-4 space-y-3.5 shadow-sm">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-slate-500" />
        Dados do Atendimento
      </h3>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Paciente</Label>
        <div className="text-sm font-semibold truncate bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded border">
          {pacienteNome}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Terapeuta</Label>
        <div className="text-sm font-semibold truncate bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded border">
          {profissionalNome}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Supervisor ABA *</Label>
        <Select value={supervisorId} onValueChange={setSupervisorId}>
          <SelectTrigger className="text-xs h-9 bg-slate-50/50">
            <SelectValue placeholder="Selecione o Supervisor..." />
          </SelectTrigger>
          <SelectContent>
            {Array.isArray(supervisores) && supervisores.length > 0 ? (
              supervisores.map((p: any) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.nome}
                </SelectItem>
              ))
            ) : Array.isArray(activeProfissionais) ? (
              activeProfissionais.map((p: any) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.nome} ({p.especialidade || "Profissional"})
                </SelectItem>
              ))
            ) : null}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const cardPreferencias = (
    <div className="bg-white dark:bg-slate-950 border rounded-xl p-4 space-y-3 shadow-sm">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-slate-500" />
        Avaliações de Preferência
      </h3>
      <p className="text-[10px] text-muted-foreground -mt-1.5">
        Registre itens/atividades preferidos usados para reforço:
      </p>

      {avaliacoesPreferencia.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-slate-400 w-3">
            {idx + 1}
          </span>
          <Input
            placeholder={`Item de preferência ${idx + 1}...`}
            value={item}
            onChange={(e) => {
              const updated = [...avaliacoesPreferencia];
              updated[idx] = e.target.value;
              setAvaliacoesPreferencia(updated);
            }}
            className="h-8 text-xs"
          />
        </div>
      ))}
    </div>
  );

  const cardObservacoes = (
    <div className="bg-white dark:bg-slate-950 border rounded-xl p-4 space-y-3 shadow-sm flex-grow flex flex-col min-h-[220px]">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 text-slate-500" />
        Observação / Medicamentos
      </h3>
      
      <Textarea
        placeholder="Exemplo: Risperidona 3 vezes ao dia (0,5 manhã, 0,5 tarde e 1 à noite); Canabidiol 1,5 dividido em 3x ao dia; Carbamazepina 5ml 3x ao dia..."
        value={observacoesMedica}
        onChange={(e) => setObservacoesMedica(e.target.value)}
        className="text-xs resize-none flex-1 min-h-[140px] focus-visible:ring-purple-500"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full sm:h-auto max-w-full sm:max-w-[95vw] sm:w-[1400px] max-h-[100vh] sm:max-h-[92vh] flex flex-col p-3 sm:p-6 rounded-none sm:rounded-xl border border-border/80 shadow-2xl bg-background overflow-hidden animate-in fade-in duration-200">
          <DialogHeader className="border-b pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 space-y-0">
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 text-foreground">
                <Activity className="h-5 w-5 text-purple-600 animate-pulse" />
                Plano de Intervenção ABA — Registro de Sessão
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Organize programas, número de tentativas e registre o desempenho do paciente.
              </p>
            </div>
            <div className="flex flex-row gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold flex-1 sm:flex-initial flex justify-center items-center gap-1.5 hover:bg-slate-50 border-slate-200"
                onClick={handleCopyHistory}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar Histórico
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold flex-1 sm:flex-initial flex justify-center items-center gap-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200"
                onClick={handleRestoreDefault}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar Padrão
              </Button>
            </div>
          </DialogHeader>

          {/* Mobile Tabs Header */}
          <div className="xl:hidden flex border-b bg-slate-100/80 dark:bg-slate-900 p-1 rounded-lg gap-1 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveMobileTab("planilha")}
              className={cn(
                "flex-1 min-w-[80px] py-1.5 px-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeMobileTab === "planilha"
                  ? "bg-white dark:bg-slate-950 text-purple-700 dark:text-purple-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              )}
            >
              <Activity className="h-3.5 w-3.5 text-purple-600 animate-pulse" />
              Planilha
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab("dados")}
              className={cn(
                "flex-1 min-w-[80px] py-1.5 px-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeMobileTab === "dados"
                  ? "bg-white dark:bg-slate-950 text-purple-700 dark:text-purple-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              )}
            >
              <User className="h-3.5 w-3.5 text-slate-500" />
              Dados
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab("preferencias")}
              className={cn(
                "flex-1 min-w-[80px] py-1.5 px-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeMobileTab === "preferencias"
                  ? "bg-white dark:bg-slate-950 text-purple-700 dark:text-purple-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              )}
            >
              <Star className="h-3.5 w-3.5 text-amber-500" />
              Preferências
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab("observacoes")}
              className={cn(
                "flex-1 min-w-[80px] py-1.5 px-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeMobileTab === "observacoes"
                  ? "bg-white dark:bg-slate-950 text-purple-700 dark:text-purple-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              )}
            >
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              Obs / Meds
            </button>
          </div>

        {/* Outer Split Layout */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-4 gap-6 py-3 overflow-y-auto xl:overflow-hidden min-h-0">
          
          {/* Main Grid Sheet - Take 3 Columns */}
          <div className={cn(
            "xl:col-span-3 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl border p-3 sm:p-4 space-y-3",
            activeMobileTab === "planilha" ? "flex" : "hidden xl:flex"
          )}>
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white dark:bg-slate-950 p-2.5 rounded-lg border shadow-sm">
              <div className="flex items-center gap-3">
                <Label htmlFor="tentativasMaxInput" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tentativas:
                </Label>
                <Select
                  value={String(tentativasMax)}
                  onValueChange={(v) => setTentativasMax(Number(v))}
                >
                  <SelectTrigger id="tentativasMaxInput" className="w-18 h-8 font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 12, 15, 19, 20, 25, 30].map((num) => (
                      <SelectItem key={num} value={String(num)} className="text-xs font-mono">
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quick filling tools */}
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] px-2.5 flex-1 sm:flex-initial font-bold hover:bg-emerald-50 text-emerald-700 border-emerald-200"
                  onClick={handleFillWithRI}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Resto com RI
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] px-2.5 flex-1 sm:flex-initial font-bold hover:bg-rose-50 text-rose-700 border-rose-200"
                  onClick={handleClearAll}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Zerar Tudo
                </Button>
              </div>
            </div>

            {/* Scrollable Table Area */}
            <div className="h-[420px] xl:h-auto xl:flex-1 border rounded-lg overflow-auto bg-white dark:bg-slate-950 shadow-sm min-h-[200px] relative">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-900 border-b text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-20">
                    <th className="w-8 md:w-10 p-1 text-center sticky left-0 bg-slate-100 dark:bg-slate-900 border-r z-30">Nº</th>
                    <th className="w-[128px] md:w-[240px] p-1 sticky left-8 md:left-10 bg-slate-100 dark:bg-slate-900 border-r z-30">Programas</th>
                    <th className="w-[100px] md:w-[150px] p-2 text-center border-r">Descrição</th>
                    <th className="w-[60px] md:w-[70px] p-2 text-center border-r">Tents</th>
                    
                    {/* Render columns up to tentativasMax */}
                    {Array.from({ length: tentativasMax }).map((_, i) => (
                      <th key={i} className="w-8 md:w-10 p-1 text-center font-mono border-r">
                        {i + 1}
                      </th>
                    ))}
                    
                    <th className="w-[36px] md:w-[42px] p-1 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-r">RI</th>
                    <th className="w-[36px] md:w-[42px] p-1 text-center bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-r">AP</th>
                    <th className="w-[36px] md:w-[42px] p-1 text-center bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-r">AT</th>
                    <th className="w-[36px] md:w-[42px] p-1 text-center bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-r">E</th>
                    <th className="w-[44px] md:w-[48px] p-2 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs">
                  {programas.map((prog, index) => (
                    <tr key={prog.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                      {/* Sticky index */}
                      <td className="p-1 text-center font-semibold font-mono border-r bg-white dark:bg-slate-950 sticky left-0 z-10 text-[10px]">
                        {index + 1}
                      </td>

                      {/* Sticky program name/description */}
                      <td className="p-0 border-r bg-white dark:bg-slate-950 sticky left-8 md:left-10 z-10">
                        <Input
                          value={prog.nome}
                          onChange={(e) => handleProgramNameChange(prog.id, e.target.value)}
                          className="h-8 text-[11px] md:text-xs font-medium border-transparent hover:border-border focus:border-primary px-1 focus:bg-white"
                        />
                      </td>

                      {/* Program description */}
                      <td className="p-0 border-r align-middle">
                        <Textarea
                          value={prog.descricao || ""}
                          onChange={(e) => handleProgramDescChange(prog.id, e.target.value)}
                          placeholder="Descrição..."
                          className="min-h-[32px] h-9 py-1 px-1.5 resize-y text-[11px] md:text-xs font-medium border-transparent hover:border-border focus:border-primary focus:bg-white leading-tight focus-visible:ring-0 shadow-none rounded-none"
                        />
                      </td>

                      {/* Trials count for this program */}
                      <td className="p-1.5 border-r text-center">
                        <Input
                          type="number"
                          min={1}
                          max={tentativasMax}
                          value={prog.tentativas_prog}
                          onChange={(e) =>
                            handleProgramTrialsChange(
                              prog.id,
                              Math.min(tentativasMax, Math.max(1, Number(e.target.value)))
                            )
                          }
                          className="h-8 w-11 md:w-14 text-[11px] md:text-xs text-center px-0.5 font-mono"
                        />
                      </td>

                      {/* Trial cells */}
                      {Array.from({ length: tentativasMax }).map((_, i) => {
                        const trialNum = i + 1;
                        const isDisabled = trialNum > prog.tentativas_prog;
                        const res = prog.respostas?.[trialNum] || "";

                        // Determine classes based on status
                        let cellContent = "-";
                        let cellClass = "bg-slate-50 dark:bg-slate-900/20 text-slate-300 dark:text-slate-700";

                        if (isDisabled) {
                          cellContent = "";
                          cellClass =
                            "bg-slate-100/50 dark:bg-slate-900/40 cursor-not-allowed [background-image:repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(0,0,0,0.03)_4px,rgba(0,0,0,0.03)_8px)]";
                        } else if (res === "RI") {
                          cellContent = "RI";
                          cellClass =
                            "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold scale-[1.03]";
                        } else if (res === "AP") {
                          cellContent = "AP";
                          cellClass =
                            "bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold scale-[1.03]";
                        } else if (res === "AT") {
                          cellContent = "AT";
                          cellClass =
                            "bg-rose-500/15 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-bold scale-[1.03]";
                        } else if (res === "E") {
                          cellContent = "E";
                          cellClass =
                            "bg-indigo-500/15 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-bold scale-[1.03]";
                        } else {
                          cellClass =
                            "bg-slate-50 hover:bg-slate-200 dark:bg-slate-900/30 dark:hover:bg-slate-800 text-slate-400 cursor-pointer font-medium";
                        }

                        return (
                          <td
                            key={i}
                            className={`p-0.5 border-r h-full align-middle text-center`}
                          >
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleCellClick(prog.id, trialNum, isDisabled)}
                              className={`w-full h-8 flex items-center justify-center rounded text-[10px] uppercase transition-all duration-150 ${cellClass}`}
                            >
                              {cellContent}
                            </button>
                          </td>
                        );
                      })}

                      {/* Sum fields */}
                      <td className="p-1 border-r text-center font-bold text-[11px] bg-emerald-50/20 text-emerald-700 dark:text-emerald-400 font-mono">
                        {countTotals(prog, "RI")}
                      </td>
                      <td className="p-1 border-r text-center font-bold text-[11px] bg-amber-50/20 text-amber-700 dark:text-amber-400 font-mono">
                        {countTotals(prog, "AP")}
                      </td>
                      <td className="p-1 border-r text-center font-bold text-[11px] bg-rose-50/20 text-rose-700 dark:text-rose-400 font-mono">
                        {countTotals(prog, "AT")}
                      </td>
                      <td className="p-1 border-r text-center font-bold text-[11px] bg-indigo-50/20 text-indigo-700 dark:text-indigo-400 font-mono">
                        {countTotals(prog, "E")}
                      </td>

                      {/* Row Actions */}
                      <td className="p-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveProgram(prog.id)}
                          className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Empty state or program addition */}
              {programas.length === 0 && (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Info className="h-8 w-8 text-slate-400 mb-2" />
                  Nenhum programa adicionado a esta sessão.
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1"
                    onClick={handleAddProgram}
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Primeiro Programa
                  </Button>
                </div>
              )}
            </div>

            {/* Footnote & Legend (Collapsible Details) */}
            <details className="w-full bg-slate-50 dark:bg-slate-900/20 p-2.5 rounded-lg border text-[11px] text-slate-600 dark:text-slate-400 group">
              <summary className="font-bold flex items-center gap-1 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <Info className="h-3.5 w-3.5 text-primary" />
                <span>Legenda de Respostas (Clique para expandir)</span>
                <span className="ml-1 text-[9px] text-slate-400 font-normal group-open:hidden">(ver)</span>
                <span className="ml-1 text-[9px] text-slate-400 font-normal hidden group-open:inline">(recolher)</span>
                
                <div className="ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddProgram();
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Incluir Programa
                  </Button>
                </div>
              </summary>
              
              <div className="flex gap-3 flex-wrap mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <span className="w-5 h-4 flex items-center justify-center rounded text-[9px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 font-bold">RI</span>
                  Resposta Independente
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 h-4 flex items-center justify-center rounded text-[9px] bg-amber-500/15 border border-amber-500/20 text-amber-700 font-bold">AP</span>
                  Ajuda Parcial
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 h-4 flex items-center justify-center rounded text-[9px] bg-rose-500/15 border border-rose-500/20 text-rose-700 font-bold">AT</span>
                  Ajuda Total
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 h-4 flex items-center justify-center rounded text-[9px] bg-indigo-500/15 border border-indigo-500/20 text-indigo-700 font-bold">E</span>
                  Ecoico
                </span>
              </div>
            </details>
          </div>

          {/* Right Sidebar - Metadata & Assessments (1 Column - Desktop Only) */}
          <div className="hidden xl:flex flex-col gap-4 overflow-y-auto pr-1 min-h-0">
            {cardDados}
            {cardPreferencias}
            {cardObservacoes}
          </div>

          {/* Mobile Sidebar Tabs Content (Mobile Only) */}
          <div className="xl:hidden flex flex-col gap-4 shrink-0">
            {activeMobileTab === "dados" && cardDados}
            {activeMobileTab === "preferencias" && cardPreferencias}
            {activeMobileTab === "observacoes" && cardObservacoes}
          </div>

        </div>

        <DialogFooter className="border-t pt-4 flex items-center justify-between sm:justify-between w-full">
          <div className="text-[11px] text-muted-foreground">
            * Campos obrigatórios. Os dados serão consolidados no agendamento.
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-4 font-semibold text-xs text-slate-600 border-slate-200"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              className="h-9 px-4 font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white flex gap-1.5"
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando…" : "Confirmar Plano ABA"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
