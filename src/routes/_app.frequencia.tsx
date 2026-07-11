import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
const supabase = supabaseClient as any;
import { useState, useMemo, useRef, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  FileText,
  Lock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Printer,
  Calendar,
  User,
  Trash2,
  Plus,
  Search,
  Filter,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const normalizeString = (str: string) =>
  str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

export const Route = createFileRoute("/_app/frequencia")({
  component: FrequenciaPage,
});

// Signature pad component using W3C Pointer Events
function SignaturePad({
  onSave,
  onCancel,
}: {
  onSave: (base64: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1e293b"; // slate-800
  }, []);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg bg-slate-50 overflow-hidden relative shadow-inner">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          className="w-full h-44 cursor-crosshair touch-none"
        />
        <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground select-none pointer-events-none font-medium">
          Assine com o dedo ou caneta touch
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
          Limpar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} className="gap-1.5">
          Confirmar Assinatura
        </Button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  realizado: "Realizado",
  falta: "Falta",
  pago: "Pago",
};

function FrequenciaPage() {
  const qc = useQueryClient();
  const today = new Date();
  const [inicio, setInicio] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [fim, setFim] = useState(format(endOfMonth(today), "yyyy-MM-dd"));

  // Dialog States
  const [signDialog, setSignDialog] = useState<{ open: boolean; ag: any }>({
    open: false,
    ag: null,
  });
  const [viewSignDialog, setViewSignDialog] = useState<{ open: boolean; ag: any }>({
    open: false,
    ag: null,
  });
  const [reportDialog, setReportDialog] = useState({
    open: false,
    pacienteId: "",
    profissionalId: "",
    mesComp: format(today, "yyyy-MM"),
  });

  const [nomeResponsavel, setNomeResponsavel] = useState("");

  // Multi-select filters (like in agenda)
  const [selectedProfs, setSelectedProfs] = useState<string[]>([]);
  const [profSearch, setProfSearch] = useState("");
  const [profsPopoverOpen, setProfsPopoverOpen] = useState(false);
  const [selectedPacs, setSelectedPacs] = useState<string[]>([]);
  const [pacSearch, setPacSearch] = useState("");
  const [pacsPopoverOpen, setPacsPopoverOpen] = useState(false);

  useEffect(() => {
    if (!profsPopoverOpen) {
      setProfSearch("");
    }
  }, [profsPopoverOpen]);

  useEffect(() => {
    if (!pacsPopoverOpen) {
      setPacSearch("");
    }
  }, [pacsPopoverOpen]);

  // Reset filters when date range changes
  useEffect(() => {
    setSelectedProfs([]);
    setSelectedPacs([]);
  }, [inicio, fim]);

  // Fetch Professionals
  const { data: profissionais = [] } = useQuery({
    queryKey: ["freq-profissionais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id, nome, especialidade, cor, valores_config, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch Patients
  const { data: pacientes = [] } = useQuery({
    queryKey: ["freq-pacientes-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pacientes")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeProfissionais = useMemo(() => {
    return (profissionais || []).filter((p: any) => {
      if (selectedProfs.includes(p.id)) return true;
      if (p.ativo) return true;
      const config = p.valores_config as any;
      if (config?.ativo_ate) {
        const targetMonth = inicio ? inicio.substring(0, 7) : format(new Date(), "yyyy-MM");
        return targetMonth <= config.ativo_ate;
      }
      return false;
    });
  }, [profissionais, inicio, selectedProfs]);

  const sortedProfissionais = useMemo(() => {
    return [...activeProfissionais].sort((a, b) => {
      const aSelected = selectedProfs.includes(a.id);
      const bSelected = selectedProfs.includes(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return (a.nome || "").localeCompare(b.nome || "");
    });
  }, [activeProfissionais, selectedProfs]);

  const filteredProfissionaisList = useMemo(() => {
    const searchLower = normalizeString(profSearch);
    if (!searchLower) return sortedProfissionais;
    return sortedProfissionais.filter(p => 
      normalizeString(p.nome || "").includes(searchLower)
    );
  }, [sortedProfissionais, profSearch]);

  const sortedPacientesList = useMemo(() => {
    if (!Array.isArray(pacientes)) return [];
    return [...pacientes].sort((a, b) => {
      const aSelected = selectedPacs.includes(a.id);
      const bSelected = selectedPacs.includes(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return (a.nome || "").localeCompare(b.nome || "");
    });
  }, [pacientes, selectedPacs]);

  const filteredPacientesList = useMemo(() => {
    const searchLower = normalizeString(pacSearch);
    if (!searchLower) return sortedPacientesList;
    return sortedPacientesList.filter(p => 
      normalizeString(p.nome || "").includes(searchLower)
    );
  }, [sortedPacientesList, pacSearch]);

  // Fetch Appointments
  const { data: agendamentos = [], isLoading: loadingAgs } = useQuery({
    queryKey: ["freq-agendamentos", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*, pacientes(nome), profissionais(nome), servicos(nome)")
        .gte("data_inicio", `${inicio}T00:00:00`)
        .lte("data_inicio", `${fim}T23:59:59`)
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Filter appointments by patient and professional selections, search term and signability
  const filteredAgendamentos = useMemo(() => {
    // Only display sessions that are signed OR are unsigned but have the "Assinar digitalmente" button
    // (i.e. status is not cancelado)
    let list = agendamentos.filter(
      (a: any) =>
        !!a.assinatura_responsavel ||
        a.status !== "cancelado"
    );

    if (selectedProfs.length > 0) {
      list = list.filter((a: any) => selectedProfs.includes(a.profissional_id));
    }

    if (selectedPacs.length > 0) {
      list = list.filter((a: any) => selectedPacs.includes(a.paciente_id));
    }
    return list;
  }, [agendamentos, selectedProfs, selectedPacs]);

  // Fetch all Patients who have sessions for reporting dropdown
  const reportPatients = useMemo(() => {
    const map = new Map<string, string>();
    agendamentos.forEach((a: any) => {
      if (a.paciente_id && a.pacientes?.nome) {
        map.set(a.paciente_id, a.pacientes.nome);
      }
    });
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [agendamentos]);

  // Sign Attendance Mutation
  const signMutation = useMutation({
    mutationFn: async ({
      agId,
      signatureBase64,
      name,
    }: {
      agId: string;
      signatureBase64: string;
      name: string;
    }) => {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({
          assinatura_responsavel: signatureBase64,
          nome_assinante: name,
          data_assinatura: new Date().toISOString(),
          status: "realizado",
        } as any)
        .eq("id", agId);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freq-agendamentos"] });
      qc.invalidateQueries({ queryKey: ["faturas"] });
      qc.invalidateQueries({ queryKey: ["dir-faturas"] });
      qc.invalidateQueries({ queryKey: ["agendamentos"] });
      toast.success("Frequência assinada com sucesso!");
      setSignDialog({ open: false, ag: null });
      setNomeResponsavel("");
    },
    onError: (err: any) => {
      console.error(err);
      toast.error("Erro ao registrar assinatura: " + err.message);
    },
  });

  // Clear Signature Mutation
  const clearSignatureMutation = useMutation({
    mutationFn: async (agId: string) => {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({
          assinatura_responsavel: null,
          nome_assinante: null,
          data_assinatura: null,
        } as any)
        .eq("id", agId);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freq-agendamentos"] });
      toast.success("Assinatura removida.");
      setViewSignDialog({ open: false, ag: null });
    },
    onError: (err: any) => {
      console.error(err);
      toast.error("Erro ao remover assinatura: " + err.message);
    },
  });

  // Delete Agenda Session (Appointment) Mutation
  const deleteAgendamentoMutation = useMutation({
    mutationFn: async (agId: string) => {
      const { error } = await supabase
        .from("agendamentos")
        .delete()
        .eq("id", agId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freq-agendamentos"] });
      toast.success("Sessão excluída com sucesso!");
    },
    onError: (err: any) => {
      console.error(err);
      toast.error("Erro ao excluir sessão: " + err.message);
    },
  });

  const handleOpenSign = (ag: any) => {
    setNomeResponsavel("");
    setSignDialog({ open: true, ag });
  };

  const handleSaveSignature = (base64: string) => {
    if (!nomeResponsavel.trim()) {
      toast.error("Por favor, digite o nome do responsável.");
      return;
    }
    if (!signDialog.ag) return;
    signMutation.mutate({
      agId: signDialog.ag.id,
      signatureBase64: base64,
      name: nomeResponsavel.trim(),
    });
  };

  // Report view calculations
  const reportData = useMemo(() => {
    if (!reportDialog.pacienteId || !reportDialog.mesComp) return [];
    const [year, month] = reportDialog.mesComp.split("-");
    const mStart = startOfMonth(new Date(Number(year), Number(month) - 1));
    const mEnd = endOfMonth(new Date(Number(year), Number(month) - 1));

    return agendamentos
      .filter((a: any) => {
        const d = new Date(a.data_inicio);
        return (
          a.paciente_id === reportDialog.pacienteId &&
          (!reportDialog.profissionalId || a.profissional_id === reportDialog.profissionalId) &&
          d >= mStart &&
          d <= mEnd &&
          a.status !== "cancelado"
        );
      })
      .sort((a: any, b: any) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
  }, [agendamentos, reportDialog.pacienteId, reportDialog.profissionalId, reportDialog.mesComp]);

  const selectedReportProfessional = profissionais.find((p: any) => p.id === reportDialog.profissionalId);
  const selectedReportPatientName =
    reportPatients.find((p) => p.id === reportDialog.pacienteId)?.nome || "";

  const handleOpenReport = () => {
    setReportDialog({
      open: true,
      pacienteId: selectedPacs.length === 1 ? selectedPacs[0] : "",
      profissionalId: selectedProfs.length === 1 ? selectedProfs[0] : "",
      mesComp: reportDialog.mesComp || format(new Date(), "yyyy-MM"),
    });
  };

  return (
    <div className="space-y-6">
      {/* Selection Header */}
      {(profsPopoverOpen || pacsPopoverOpen) && (
        <div
          className="fixed inset-0 z-40 bg-transparent cursor-default"
          onClick={() => {
            setProfsPopoverOpen(false);
            setPacsPopoverOpen(false);
          }}
        />
      )}
      <Card className="border-border shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5 w-full sm:w-auto flex-1 sm:flex-initial min-w-[140px]">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Início
            </Label>
            <Input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5 w-full sm:w-auto flex-1 sm:flex-initial min-w-[140px]">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Fim
            </Label>
            <Input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Professionals Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Profissionais
            </Label>
            <Popover open={profsPopoverOpen} onOpenChange={setProfsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-10 gap-1.5 text-xs transition-all hover:bg-accent border-dashed min-w-[160px] justify-between",
                    selectedProfs.length > 0 && "border-solid border-primary bg-primary/5 text-primary",
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span>Profissionais</span>
                    {selectedProfs.length > 0 && (
                      <>
                        <div className="h-3.5 w-[1px] bg-border mx-1" />
                        <Badge variant="secondary" className="rounded-sm px-1 font-normal h-4 text-[9px] min-w-[16px] justify-center">
                          {selectedProfs.length}
                        </Badge>
                      </>
                    )}
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-2 z-50" align="start">
                <div className="space-y-2">
                  <div className="flex items-center border-b pb-2 px-1 gap-2 border-border/80">
                    <Search className="h-4 w-4 shrink-0 opacity-50" />
                    <input
                      placeholder="Buscar profissional..."
                      className="flex h-7 w-full rounded-md bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                      value={profSearch}
                      onChange={(e) => setProfSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-[250px] overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                    {filteredProfissionaisList.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">Nenhum profissional encontrado.</div>
                    ) : (
                      filteredProfissionaisList.map((p: any, index: number) => {
                        const isSelected = selectedProfs.includes(p.id);
                        const showDivider = !isSelected && index > 0 && selectedProfs.includes(filteredProfissionaisList[index - 1].id);
                        return (
                          <div key={p.id}>
                            {showDivider && <div className="h-[1px] bg-border/60 my-1 mx-1" />}
                            <div
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedProfs(selectedProfs.filter((id) => id !== p.id));
                                } else {
                                  setSelectedProfs([...selectedProfs, p.id]);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-accent hover:text-accent-foreground select-none",
                                isSelected && "bg-primary/5 font-semibold text-primary"
                              )}
                            >
                              <Checkbox checked={isSelected} className="h-3.5 w-3.5 pointer-events-none" />
                              <div
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: p.cor || "var(--primary)" }}
                              />
                              <span className="truncate">{p.nome}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  {selectedProfs.length > 0 && (
                    <div className="border-t border-border pt-1.5 mt-1">
                      <button
                        onClick={() => setSelectedProfs([])}
                        className="w-full text-center text-xs text-muted-foreground font-medium hover:text-foreground py-1 rounded-sm hover:bg-accent transition-colors cursor-pointer"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Patients Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Pacientes
            </Label>
            <Popover open={pacsPopoverOpen} onOpenChange={setPacsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-10 gap-1.5 text-xs transition-all hover:bg-accent border-dashed min-w-[160px] justify-between",
                    selectedPacs.length > 0 && "border-solid border-primary bg-primary/5 text-primary",
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span>Pacientes</span>
                    {selectedPacs.length > 0 && (
                      <>
                        <div className="h-3.5 w-[1px] bg-border mx-1" />
                        <Badge variant="secondary" className="rounded-sm px-1 font-normal h-4 text-[9px] min-w-[16px] justify-center">
                          {selectedPacs.length}
                        </Badge>
                      </>
                    )}
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-2 z-50" align="start">
                <div className="space-y-2">
                  <div className="flex items-center border-b pb-2 px-1 gap-2 border-border/80">
                    <Search className="h-4 w-4 shrink-0 opacity-50" />
                    <input
                      placeholder="Buscar paciente..."
                      className="flex h-7 w-full rounded-md bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                      value={pacSearch}
                      onChange={(e) => setPacSearch(e.target.value)}
                    />
                  </div>
                  
                  <div className="max-h-[250px] overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                    {filteredPacientesList.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">Nenhum paciente encontrado.</div>
                    ) : (
                      filteredPacientesList.map((p: any, index: number) => {
                        const isSelected = selectedPacs.includes(p.id);
                        const showDivider = !isSelected && index > 0 && selectedPacs.includes(filteredPacientesList[index - 1].id);
                        return (
                          <div key={p.id}>
                            {showDivider && <div className="h-[1px] bg-border/60 my-1 mx-1" />}
                            <div
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedPacs(selectedPacs.filter((id) => id !== p.id));
                                } else {
                                  setSelectedPacs([...selectedPacs, p.id]);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-accent hover:text-accent-foreground select-none",
                                isSelected && "bg-primary/5 font-semibold text-primary"
                              )}
                            >
                              <Checkbox checked={isSelected} className="h-3.5 w-3.5 pointer-events-none" />
                              <span className="truncate">{p.nome}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  {selectedPacs.length > 0 && (
                    <div className="border-t border-border pt-1.5 mt-1">
                      <button
                        onClick={() => setSelectedPacs([])}
                        className="w-full text-center text-xs text-muted-foreground font-medium hover:text-foreground py-1 rounded-sm hover:bg-accent transition-colors cursor-pointer"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>



          {agendamentos.length > 0 && (
            <Button
              onClick={handleOpenReport}
              variant="outline"
              className="gap-2 h-10 sm:ml-auto"
            >
              <FileText className="h-4 w-4" /> Relatório de Frequência
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Main Content Area */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Controle de Frequência</CardTitle>
              <CardDescription>
                Profissional:{" "}
                <span className="font-semibold text-foreground">
                  {selectedProfs.length === 0
                    ? "Todos"
                    : selectedProfs.length === 1
                    ? profissionais.find((p: any) => p.id === selectedProfs[0])?.nome
                    : `${selectedProfs.length} selecionados`}
                </span>
              </CardDescription>
            </div>
              <div className="flex gap-2">
                <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                  {filteredAgendamentos.length} Sessões
                </Badge>
                <Badge
                  variant="outline"
                  className="px-2.5 py-1 text-xs text-green-600 border-green-200 bg-green-50/20"
                >
                  {filteredAgendamentos.filter((a: any) => a.assinatura_responsavel).length} Assinadas
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingAgs ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Carregando sessões...
              </div>
            ) : agendamentos.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Nenhum agendamento encontrado no período.
              </div>
            ) : filteredAgendamentos.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Nenhum agendamento correspondente à busca.
              </div>
            ) : (
              <>
                {/* Visualização Mobile (celular) */}
                <div className="md:hidden divide-y divide-border/60">
                  {filteredAgendamentos.map((a: any) => {
                    const signed = !!a.assinatura_responsavel;
                    const isApoio = a.servicos?.nome?.toLowerCase() === "apoio";
                    return (
                      <div key={a.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-sm font-semibold text-foreground">
                              {format(new Date(a.data_inicio), "dd/MM/yyyy")}
                            </span>
                            <span className="text-[11px] text-muted-foreground block capitalize">
                              {format(new Date(a.data_inicio), "EEEE 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] font-bold uppercase",
                                a.status === "confirmado" &&
                                  "border-green-500/30 text-green-600 bg-green-50/50",
                                a.status === "pago" &&
                                  "border-emerald-500/30 text-emerald-600 bg-emerald-50/50",
                                a.status === "cancelado" &&
                                  "border-red-500/30 text-red-600 bg-red-50/50",
                                a.status === "realizado" &&
                                  "border-blue-500/30 text-blue-600 bg-blue-50/50",
                                a.status === "falta" &&
                                  "border-orange-500/30 text-orange-600 bg-orange-50/50",
                                a.status === "pendente" &&
                                  "border-yellow-500/30 text-yellow-600 bg-yellow-50/50",
                              )}
                            >
                              {STATUS_LABEL[a.status] || a.status}
                            </Badge>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Excluir Sessão"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Sessão</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir esta sessão? Esta ação é irreversível e excluirá qualquer registro de faturamento associado.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                    onClick={() => deleteAgendamentoMutation.mutate(a.id)}
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground block text-[10px] uppercase font-semibold tracking-wider">
                              Paciente
                            </span>
                            <span className="font-medium text-foreground">{a.pacientes?.nome}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[10px] uppercase font-semibold tracking-wider">
                              Especialidade
                            </span>
                            <span className="font-medium text-foreground">
                              {a.servicos?.nome || "Sessão"}
                            </span>
                          </div>
                        </div>

                        <div className="pt-1">
                          {signed ? (
                            <Button
                              variant="outline"
                              type="button"
                              size="sm"
                              onClick={() => setViewSignDialog({ open: true, ag: a })}
                              className="w-full h-9 gap-1.5 border-green-200 hover:border-green-300 hover:bg-green-50 text-green-700 bg-green-50/20 text-xs px-2.5 cursor-pointer justify-center"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Assinado por{" "}
                              {a.nome_assinante?.split(" ")[0]}
                            </Button>
                          ) : isApoio ? (
                            <div className="text-center text-xs text-muted-foreground py-1.5 bg-muted/35 rounded border border-dashed font-medium">
                              Não necessita assinatura
                            </div>
                          ) : a.status === "cancelado" ? (
                            <div className="text-center text-xs text-muted-foreground py-1.5 bg-muted/30 rounded">
                              Sessão cancelada
                            </div>
                          ) : (
                            <Button
                              onClick={() => handleOpenSign(a)}
                              type="button"
                              size="sm"
                              className="w-full h-9 gap-1.5 text-xs px-2.5 cursor-pointer justify-center"
                            >
                              <Plus className="h-3.5 w-3.5" /> Assinar Digitalmente
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Visualização Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data & Hora</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Especialidade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Frequência / Assinatura</TableHead>
                        <TableHead className="w-[80px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAgendamentos.map((a: any) => {
                        const signed = !!a.assinatura_responsavel;
                        const isApoio = a.servicos?.nome?.toLowerCase() === "apoio";
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              <div className="font-semibold text-foreground">
                                {format(new Date(a.data_inicio), "dd/MM/yyyy")}
                              </div>
                              <div className="text-[11px] text-muted-foreground capitalize">
                                {format(new Date(a.data_inicio), "EEEE 'às' HH:mm", { locale: ptBR })}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{a.pacientes?.nome}</TableCell>
                            <TableCell className="text-muted-foreground text-xs font-semibold">
                              {a.servicos?.nome || "Sessão"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[9px] font-bold uppercase",
                                  a.status === "confirmado" &&
                                    "border-green-500/30 text-green-600 bg-green-50/50",
                                  a.status === "pago" &&
                                    "border-emerald-500/30 text-emerald-600 bg-emerald-50/50",
                                  a.status === "cancelado" &&
                                    "border-red-500/30 text-red-600 bg-red-50/50",
                                  a.status === "realizado" &&
                                    "border-blue-500/30 text-blue-600 bg-blue-50/50",
                                  a.status === "falta" &&
                                    "border-orange-500/30 text-orange-600 bg-orange-50/50",
                                  a.status === "pendente" &&
                                    "border-yellow-500/30 text-yellow-600 bg-yellow-50/50",
                                )}
                              >
                                {STATUS_LABEL[a.status] || a.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {signed ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    type="button"
                                    size="sm"
                                    onClick={() => setViewSignDialog({ open: true, ag: a })}
                                    className="h-8 gap-1 border-green-200 hover:border-green-300 hover:bg-green-50 text-green-700 bg-green-50/20 text-xs px-2.5 cursor-pointer"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Assinado por{" "}
                                    {a.nome_assinante?.split(" ")[0]}
                                  </Button>
                                </div>
                              ) : isApoio ? (
                                <span className="text-muted-foreground text-xs italic">Não necessita assinatura</span>
                              ) : a.status === "cancelado" ? (
                                <span className="text-muted-foreground text-xs">—</span>
                              ) : (
                                <Button
                                  onClick={() => handleOpenSign(a)}
                                  type="button"
                                  size="sm"
                                  className="h-8 gap-1 text-xs px-2.5 cursor-pointer"
                                >
                                  <Plus className="h-3.5 w-3.5" /> Assinar Digitalmente
                                </Button>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Excluir Sessão"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Sessão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir esta sessão? Esta ação é irreversível e excluirá qualquer registro de faturamento associado.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                      onClick={() => deleteAgendamentoMutation.mutate(a.id)}
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

      {/* Signature Modal */}
      <Dialog
        open={signDialog.open}
        onOpenChange={(open) => setSignDialog({ open, ag: open ? signDialog.ag : null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assinatura Digital de Frequência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div>
                  <span className="text-muted-foreground">Paciente:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {signDialog.ag?.pacientes?.nome}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Profissional:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {signDialog.ag?.profissionais?.nome}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Sessão:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {signDialog.ag?.data_inicio &&
                      format(new Date(signDialog.ag.data_inicio), "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resp-name">Nome do Responsável *</Label>
              <Input
                id="resp-name"
                placeholder="Ex: Maria Souza (Mãe)"
                value={nomeResponsavel}
                onChange={(e) => setNomeResponsavel(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Assinatura Digital *</Label>
              <SignaturePad
                onSave={handleSaveSignature}
                onCancel={() => setSignDialog({ open: false, ag: null })}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Signature Modal */}
      <Dialog
        open={viewSignDialog.open}
        onOpenChange={(open) => setViewSignDialog({ open, ag: open ? viewSignDialog.ag : null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assinatura Digital Registrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div>
                  <span className="text-muted-foreground">Paciente:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {viewSignDialog.ag?.pacientes?.nome}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Assinante:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {viewSignDialog.ag?.nome_assinante}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Data/Hora da Assinatura:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {viewSignDialog.ag?.data_assinatura &&
                      format(new Date(viewSignDialog.ag.data_assinatura), "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                </div>
              </div>
            </div>
            <div className="border border-border rounded-lg bg-white p-4 flex items-center justify-center">
              {viewSignDialog.ag?.assinatura_responsavel ? (
                <img
                  src={viewSignDialog.ag.assinatura_responsavel}
                  alt="Assinatura Digital"
                  className="max-h-36 object-contain"
                />
              ) : (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Nenhuma imagem de assinatura salva.
                </div>
              )}
            </div>
            <DialogFooter className="justify-between sm:justify-between flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (confirm("Tem certeza que deseja excluir esta assinatura?")) {
                    clearSignatureMutation.mutate(viewSignDialog.ag.id);
                  }
                }}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
              >
                <Trash2 className="h-4 w-4" /> Excluir Assinatura
              </Button>
              <Button type="button" onClick={() => setViewSignDialog({ open: false, ag: null })}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance Report View Dialog */}
      <Dialog
        open={reportDialog.open}
        onOpenChange={(open) => setReportDialog({ ...reportDialog, open })}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="print:hidden">
            <DialogTitle>Gerar Relatório de Frequência</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3 pb-4 border-b border-border/60 print:hidden">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label>Paciente</Label>
              <Select
                value={reportDialog.pacienteId}
                onValueChange={(val) => setReportDialog({ ...reportDialog, pacienteId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o paciente..." />
                </SelectTrigger>
                <SelectContent>
                  {reportPatients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label>Profissional</Label>
              <Select
                value={reportDialog.profissionalId}
                onValueChange={(val) => setReportDialog({ ...reportDialog, profissionalId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o profissional..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os profissionais</SelectItem>
                  {profissionais.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[150px]">
              <Label>Mês de Referência</Label>
              <Input
                type="month"
                value={reportDialog.mesComp}
                onChange={(e) => setReportDialog({ ...reportDialog, mesComp: e.target.value })}
              />
            </div>
            <Button
              disabled={!reportDialog.pacienteId || reportData.length === 0}
              onClick={() => window.print()}
              type="button"
              className="gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Imprimir Relatório
            </Button>
          </div>

          {/* Printable Report Section */}
          <div
            id="freq-report-printable"
            className="p-4 bg-white text-black font-sans min-h-[400px]"
          >
            {!reportDialog.pacienteId ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground print:hidden">
                <FileText className="h-10 w-10 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-medium">
                  Selecione um paciente para carregar o relatório.
                </p>
              </div>
            ) : reportData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground print:hidden">
                <AlertCircle className="h-10 w-10 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-medium">
                  Nenhuma sessão encontrada para este paciente no mês selecionado.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b-2 border-black pb-4">
                  <div>
                    <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900">
                      Espaço MULTI
                    </h2>
                    <p className="text-[10px] text-muted-foreground font-semibold">
                      Clínica Multidisciplinar de Desenvolvimento Infantil
                    </p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-md font-bold uppercase">Relatório de Frequência</h3>
                    <p className="text-xs font-semibold text-slate-800">
                      Mês:{" "}
                      <span className="capitalize font-bold">
                        {format(new Date(reportData[0].data_inicio), "MMMM yyyy", { locale: ptBR })}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-xs pb-4 border-b border-dashed border-gray-300">
                  <div>
                    <p>
                      <span className="font-bold">Paciente:</span> {selectedReportPatientName}
                    </p>
                    <p className="mt-1">
                      <span className="font-bold">Profissional:</span> {selectedReportProfessional?.nome || "Vários / Todos"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>
                      <span className="font-bold">Especialidade:</span>{" "}
                      {selectedReportProfessional?.especialidade || "Terapia"}
                    </p>
                    <p className="mt-1">
                      <span className="font-bold">Total de Sessões:</span> {reportData.length}
                    </p>
                  </div>
                </div>

                {/* Table */}
                <table className="w-full text-left border-collapse text-xs border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="p-2.5 font-bold border-r border-gray-300">Data</th>
                      <th className="p-2.5 font-bold border-r border-gray-300">Horário</th>
                      <th className="p-2.5 font-bold border-r border-gray-300">Serviço</th>
                      <th className="p-2.5 font-bold border-r border-gray-300">Status</th>
                      <th className="p-2.5 font-bold">Assinatura do Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((a: any) => (
                      <tr key={a.id} className="border-b border-gray-300">
                        <td className="p-2.5 border-r border-gray-300 font-semibold">
                          {format(new Date(a.data_inicio), "dd/MM/yyyy")}
                        </td>
                        <td className="p-2.5 border-r border-gray-300 capitalize">
                          {format(new Date(a.data_inicio), "EEEE 'às' HH:mm", { locale: ptBR })}
                        </td>
                        <td className="p-2.5 border-r border-gray-300">
                          {a.servicos?.nome || "Sessão"}
                        </td>
                        <td className="p-2.5 border-r border-gray-300">
                          {STATUS_LABEL[a.status] || a.status}
                        </td>
                        <td className="p-1.5 flex items-center justify-center">
                          {a.assinatura_responsavel ? (
                            <div className="flex flex-col items-center">
                              <img
                                src={a.assinatura_responsavel}
                                alt="Assinatura"
                                className="h-8 max-w-[120px] object-contain"
                              />
                              <span className="text-[9px] text-gray-500 font-medium mt-0.5">
                                Signed by: {a.nome_assinante}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-[10px]">
                              Pendente de assinatura
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Footer signatures */}
                <div className="grid grid-cols-2 gap-12 pt-16 text-center text-[10px]">
                  <div>
                    <div className="border-t border-black w-48 mx-auto mt-4"></div>
                    <p className="font-bold mt-1.5">{selectedReportProfessional?.nome || "Assinatura do Profissional"}</p>
                    <p className="text-gray-500 font-medium">
                      {selectedReportProfessional?.especialidade || "Terapeuta"}
                    </p>
                  </div>
                  <div>
                    <div className="border-t border-black w-48 mx-auto mt-4"></div>
                    <p className="font-bold mt-1.5">Assinatura da Direção</p>
                    <p className="text-gray-500 font-medium">Clínica Espaço MULTI</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Global CSS for Print */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #freq-report-printable, #freq-report-printable * {
            visibility: visible;
          }
          #freq-report-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
