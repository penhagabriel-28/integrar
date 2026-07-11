import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, memo } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  ChevronsUpDown,
  Trash2,
  MessageCircle,
  Filter,
  Users,
  Pencil,
  FileText,
  Activity,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PlanoAbaDialog } from "@/components/PlanoAbaDialog";
import { addDays, addWeeks, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { PacienteFormDialog } from "@/components/PacienteFormDialog";
import { AnamneseFormDialog } from "@/components/AnamneseFormDialog";

const normalizeString = (str: string) =>
  str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

export const Route = createFileRoute("/_app/agenda")({
  component: Agenda,
});

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7h..19h
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  realizado: "Realizado",
  falta: "Falta",
  pago: "Pago",
};

function Agenda() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("agendamentos-realtime-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
        },
        () => {
          qc.invalidateQueries({ queryKey: ["ags"] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const [dialog, setDialog] = useState<{
    open: boolean;
    editing?: any;
    defaults?: { date: Date; hour: number };
  }>({ open: false });
  const [cancelTarget, setCancelTarget] = useState<any>(null);

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

  const [patientDialogState, setPatientDialogState] = useState<{
    open: boolean;
    paciente?: any;
    defaultSpecialty?: string;
    defaultProfessionalId?: string;
    onSaved?: (newPac?: any) => void;
    restoreDialog?: any;
  }>({ open: false });

  const [anamneseDialogState, setAnamneseDialogState] = useState<{
    open: boolean;
    pacienteId: string;
    agendamentoId?: string;
    profissionalId?: string;
    restoreDialog?: any;
  }>({ open: false, pacienteId: "" });

  const { data: profissionais = [] } = useQuery({
    queryKey: ["prof-min"],
    queryFn: async () =>
      (
        await supabase
          .from("profissionais")
          .select("id, nome, cor, especialidade, valor_sessao, valores_config, ativo")
          .order("nome")
      ).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: pacientes = [] } = useQuery({
    queryKey: ["pacientes-filter-list"],
    queryFn: async () =>
      (
        await supabase
          .from("pacientes")
          .select("id, nome")
          .order("nome")
      ).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
  const sortedProfissionais = useMemo(() => {
    if (!Array.isArray(profissionais)) return [];
    
    // Filter active professionals in the selected week
    const activeInWeek = profissionais.filter((p: any) => {
      if (selectedProfs.includes(p.id)) return true;
      if (p.ativo) return true;
      const config = p.valores_config as any;
      if (config?.ativo_ate) {
        const targetMonth = format(weekStart, "yyyy-MM");
        return targetMonth <= config.ativo_ate;
      }
      return false;
    });

    return [...activeInWeek].sort((a, b) => {
      const aSelected = selectedProfs.includes(a.id);
      const bSelected = selectedProfs.includes(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return (a.nome || "").localeCompare(b.nome || "");
    });
  }, [profissionais, selectedProfs, weekStart]);

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
  const { data: ags = [] } = useQuery({
    queryKey: ["ags", weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(
          "*, pacientes(nome, cids_secundarios), profissionais(nome, cor, especialidade), servicos(nome), salas(nome)",
        )
        .gte("data_inicio", weekStart.toISOString())
        .lt("data_inicio", addDays(weekEnd, 1).toISOString())
        .order("data_inicio");
      if (error) throw error;
      return data;
    },
    staleTime: 15 * 1000,
  });

  const filteredAgs = useMemo(() => {
    let result = Array.isArray(ags) ? ags : [];
    if (selectedProfs.length > 0) {
      result = result.filter((a) => selectedProfs.includes(a.profissional_id));
    }
    if (selectedPacs.length > 0) {
      result = result.filter((a) => selectedPacs.includes(a.paciente_id));
    }
    return result;
  }, [ags, selectedProfs, selectedPacs]);

  return (
    <div className="space-y-4">
      {(profsPopoverOpen || pacsPopoverOpen) && (
        <div
          className="fixed inset-0 z-40 bg-transparent cursor-default"
          onClick={() => {
            setProfsPopoverOpen(false);
            setPacsPopoverOpen(false);
          }}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border/80 shadow-sm">
        {/* Date Navigation & Range */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium px-2.5"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs sm:text-sm font-semibold ml-1 text-foreground/95">
            {format(weekStart, "d 'de' MMM", { locale: ptBR })} –{" "}
            {format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}
          </div>
        </div>

        {/* Filters & Actions Group */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto w-full sm:w-auto">
          {/* Professionals Filter */}
          <Popover open={profsPopoverOpen} onOpenChange={setProfsPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs transition-all hover:bg-accent border-dashed",
                  selectedProfs.length > 0 && "border-solid border-primary bg-primary/5 text-primary",
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Profissionais</span>
                {selectedProfs.length > 0 && (
                  <>
                    <div className="h-3.5 w-[1px] bg-border mx-1" />
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal h-4 text-[9px] min-w-[16px] justify-center lg:hidden">
                      {selectedProfs.length}
                    </Badge>
                    <div className="hidden space-x-1 lg:flex items-center">
                      {selectedProfs.length > 2 ? (
                        <Badge variant="secondary" className="rounded-sm px-1 font-normal h-4 text-[9px]">
                          {selectedProfs.length} selecionados
                        </Badge>
                      ) : (
                        profissionais
                          .filter((p: any) => selectedProfs.includes(p.id))
                          .map((p: any) => (
                            <Badge
                              variant="secondary"
                              key={p.id}
                              className="rounded-sm px-1 font-normal h-4 text-[9px]"
                            >
                              {p.nome.split(" ")[0]}
                            </Badge>
                          ))
                      )}
                    </div>
                  </>
                )}
              </Button>
            </PopoverTrigger>            <PopoverContent className="w-[200px] p-2" align="start">
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
                    filteredProfissionaisList.map((p: any) => {
                      const isSelected = selectedProfs.includes(p.id);
                      return (
                        <div
                          key={p.id}
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

          {/* Patients Filter */}
          <Popover open={pacsPopoverOpen} onOpenChange={setPacsPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs transition-all hover:bg-accent border-dashed",
                  selectedPacs.length > 0 && "border-solid border-primary bg-primary/5 text-primary",
                )}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Pacientes</span>
                {selectedPacs.length > 0 && (
                  <>
                    <div className="h-3.5 w-[1px] bg-border mx-1" />
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal h-4 text-[9px] min-w-[16px] justify-center lg:hidden">
                      {selectedPacs.length}
                    </Badge>
                    <div className="hidden space-x-1 lg:flex items-center">
                      {selectedPacs.length > 2 ? (
                        <Badge variant="secondary" className="rounded-sm px-1 font-normal h-4 text-[9px]">
                          {selectedPacs.length} selecionados
                        </Badge>
                      ) : (
                        pacientes
                          .filter((p: any) => selectedPacs.includes(p.id))
                          .map((p: any) => (
                            <Badge
                              variant="secondary"
                              key={p.id}
                              className="rounded-sm px-1 font-normal h-4 text-[9px]"
                            >
                              {p.nome.split(" ")[0]}
                            </Badge>
                          ))
                      )}
                    </div>
                  </>
                )}
              </Button>
            </PopoverTrigger>             <PopoverContent className="w-[220px] p-2" align="start">
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
                    filteredPacientesList.map((p: any) => {
                      const isSelected = selectedPacs.includes(p.id);
                      return (
                        <div
                          key={p.id}
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

          {/* New Appointment Button */}
          <Button
            size="sm"
            className="h-8 text-xs font-semibold gap-1.5 ml-auto sm:ml-2 shadow-sm transition-all"
            onClick={() => setDialog({ open: true })}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo<span className="hidden min-[380px]:inline"> agendamento</span></span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto max-h-[calc(100dvh-180px)] md:max-h-[calc(100vh-220px)] p-0">
          <div className="grid min-w-[650px] md:min-w-[800px] lg:min-w-0 grid-cols-[60px_repeat(6,minmax(0,1fr))]">
            <div className="sticky top-0 z-20 border-b border-r bg-card p-2 text-xs font-medium text-muted-foreground"></div>
            {days.map((d) => {
              const isToday = isSameDay(d, new Date());
              return (
                <div
                  key={d.toString()}
                  className={cn(
                    "sticky top-0 z-20 border-b border-r p-2 text-center text-xs font-medium bg-card",
                    isToday && "text-primary font-semibold",
                  )}
                >
                  {isToday && (
                    <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
                  )}
                  <div className="relative z-10">{format(d, "EEE", { locale: ptBR })}</div>
                  <div className="relative z-10 text-base text-foreground">{format(d, "d")}</div>
                </div>
              );
            })}
            {HOURS.map((h) => (
              <FragmentRow
                key={h}
                h={h}
                days={days}
                ags={filteredAgs}
                onCellClick={(date: Date) => setDialog({ open: true, defaults: { date, hour: h } })}
                onEdit={(a: any) => setDialog({ open: true, editing: a })}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ open: o })}>
        {dialog.open && (
          <AgendamentoDialog
            editing={dialog.editing}
            defaults={dialog.defaults}
            onSaved={async () => {
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["ags"] }),
                qc.invalidateQueries({ queryKey: ["patient-ags-dialog"] }),
                qc.invalidateQueries({ queryKey: ["faturas"] }),
              ]);
              setDialog({ open: false });
            }}
            onCancel={(a: any) => {
              setDialog({ open: false });
              setCancelTarget(a);
            }}
            triggerNewPatient={(defaultSpecialty, defaultProfessionalId, onSaved) => {
              const currentDialog = { ...dialog };
              setDialog({ open: false });
              setPatientDialogState({
                open: true,
                defaultSpecialty,
                defaultProfessionalId,
                onSaved,
                restoreDialog: currentDialog,
              });
            }}
            triggerEditPatient={(paciente, onSaved) => {
              const currentDialog = { ...dialog };
              setDialog({ open: false });
              setPatientDialogState({
                open: true,
                paciente,
                onSaved,
                restoreDialog: currentDialog,
              });
            }}
            triggerAnamnese={(pacienteId, agendamentoId, profissionalId) => {
              const currentDialog = { ...dialog };
              setDialog({ open: false });
              setAnamneseDialogState({
                open: true,
                pacienteId,
                agendamentoId,
                profissionalId,
                restoreDialog: currentDialog,
              });
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        {cancelTarget && (
          <CancelDialog
            ag={cancelTarget}
            onDone={() => {
              setCancelTarget(null);
              qc.invalidateQueries({ queryKey: ["ags"] });
              qc.invalidateQueries({ queryKey: ["patient-ags-dialog"] });
              qc.invalidateQueries({ queryKey: ["faturas"] });
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={patientDialogState.open}
        onOpenChange={(o) => {
          if (!o) {
            const restore = patientDialogState.restoreDialog;
            setPatientDialogState((prev) => ({ ...prev, open: false }));
            if (restore) {
              setDialog(restore);
            }
          } else {
            setPatientDialogState((prev) => ({ ...prev, open: true }));
          }
        }}
      >
        {patientDialogState.open && (
          <PacienteFormDialog
            paciente={patientDialogState.paciente}
            defaultSpecialty={patientDialogState.defaultSpecialty}
            defaultProfessionalId={patientDialogState.defaultProfessionalId}
            onSaved={async (newPac: any) => {
              const restore = patientDialogState.restoreDialog;
              setPatientDialogState((prev) => ({ ...prev, open: false }));
              if (patientDialogState.onSaved) {
                await patientDialogState.onSaved(newPac);
              }
              if (restore) {
                setDialog(restore);
              }
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={anamneseDialogState.open}
        onOpenChange={(o) => {
          if (!o) {
            const restore = anamneseDialogState.restoreDialog;
            setAnamneseDialogState((prev) => ({ ...prev, open: false }));
            if (restore) {
              setDialog(restore);
            }
          } else {
            setAnamneseDialogState((prev) => ({ ...prev, open: true }));
          }
        }}
      >
        {anamneseDialogState.open && (
          <AnamneseFormDialog
            pacienteId={anamneseDialogState.pacienteId}
            agendamentoId={anamneseDialogState.agendamentoId}
            profissionalId={anamneseDialogState.profissionalId}
            onClose={() => {
              const restore = anamneseDialogState.restoreDialog;
              setAnamneseDialogState((prev) => ({ ...prev, open: false }));
              if (restore) {
                setDialog(restore);
              }
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

const safeFormatDate = (dateVal: any, formatStr: string, options?: any) => {
  if (!dateVal) return "—";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "—";
  try {
    return format(d, formatStr, options);
  } catch (e) {
    return "—";
  }
};

const isApoio = (spec: string) => spec && (spec.toLowerCase() === "apoio" || spec.toUpperCase() === "AP");

const getEspecialidade = (a: any) => {
  if (!a) return null;
  if (a.servicos?.nome) return a.servicos.nome;
  const pacSpecs = (
    Array.isArray(a.pacientes?.cids_secundarios) ? a.pacientes.cids_secundarios : []
  ).filter((s: any): s is string => typeof s === "string");
  const profSpecs = a.profissionais?.especialidade
    ? a.profissionais.especialidade
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];
  const intersection = pacSpecs.filter((s: string) =>
    profSpecs.some((ps: string) => ps.toLowerCase() === s.toLowerCase()),
  );
  if (intersection.length > 0) return intersection[0];
  if (profSpecs.length > 0) return profSpecs[0];
  return null;
};

const syncAgendamentoFinanceiro = async (
  _agendamentoId: string,
  _pacienteId: string,
  _profissionalId: string,
  _dataInicio: string,
  _status: string,
  _tipoAgendamento: "sessao" | "anamnese",
  _especialidade: string,
  _valor: number,
  _meioPagamento?: string,
) => {
  // O banco de dados (através do trigger tg_sync_agendamento_financeiro) gerencia
  // todo o sincronismo e cálculo de faturas/itens de forma atômica e consistente.
  // Retornamos imediatamente para evitar race conditions ou sobrescrever valores customizados.
  return;
};

const FragmentRow = memo(
  function FragmentRow({ h, days, ags, onCellClick, onEdit }: any) {
    return (
      <>
        <div className="border-b border-r p-1 text-right text-xs text-muted-foreground">
          {String(h).padStart(2, "0")}:00
        </div>
        {days.map((d: Date) => {
          const cellAgs = Array.isArray(ags)
            ? ags.filter((a: any) => {
                const dt = new Date(a.data_inicio);
                return isSameDay(dt, d) && dt.getHours() === h;
              })
            : [];
          return (
            <div
              key={d.toString() + h}
              className="group relative min-h-[60px] border-b border-r p-1 hover:bg-muted/10 transition-colors"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCellClick(d);
                }}
                className="absolute top-1 right-1 z-10 flex h-8 w-8 md:h-5 md:w-5 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 shadow-sm border border-primary/20 cursor-pointer before:content-[''] before:absolute before:-inset-2 md:before:hidden"
                title="Adicionar sessão"
              >
                <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
              </button>
              {cellAgs.map((a: any) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(a);
                  }}
                  className="mb-1 block w-full rounded-md border-l-4 bg-card pl-2 pr-6 py-1 text-left text-xs shadow-sm transition hover:shadow"
                  style={{ borderLeftColor: a.profissionais?.cor ?? "var(--primary)" }}
                >
                  <div className="truncate font-medium text-foreground">{a.pacientes?.nome}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {safeFormatDate(a.data_inicio, "HH:mm")} {a.salas?.nome ? `• ${a.salas.nome}` : ""}
                  </div>
                  <div className="truncate text-[9px] text-muted-foreground">
                    {a.profissionais?.nome}
                  </div>
                  {getEspecialidade(a) && (
                    <div className="truncate text-[9px] font-medium text-primary">
                      {getEspecialidade(a)}
                    </div>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 h-4 px-1 text-[8px] uppercase font-bold shrink-0 border",
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
                </button>
              ))}
            </div>
          );
        })}
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.h === nextProps.h &&
      prevProps.ags === nextProps.ags &&
      prevProps.days === nextProps.days
    );
  }
);

function AgendamentoDialog({
  editing,
  defaults,
  onSaved,
  onCancel,
  triggerNewPatient,
  triggerEditPatient,
  triggerAnamnese,
}: {
  editing?: any;
  defaults?: any;
  onSaved: () => void;
  onCancel: (a: any) => void;
  triggerNewPatient: (
    defaultSpecialty: string,
    defaultProfessionalId: string,
    onSaved: (newPac: any) => void,
  ) => void;
  triggerEditPatient: (paciente: any, onSaved: () => void) => void;
  triggerAnamnese?: (pacienteId: string, agendamentoId?: string, profissionalId?: string) => void;
}) {
  const qc = useQueryClient();
  const initialStart =
    editing && editing.data_inicio
      ? safeFormatDate(editing.data_inicio, "yyyy-MM-dd'T'HH:mm")
      : defaults
        ? format(new Date(defaults.date.setHours(defaults.hour, 0, 0, 0)), "yyyy-MM-dd'T'HH:mm")
        : format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const initialEnd =
    editing && editing.data_fim
      ? safeFormatDate(editing.data_fim, "yyyy-MM-dd'T'HH:mm")
      : format(new Date(new Date(initialStart).getTime() + 60 * 60000), "yyyy-MM-dd'T'HH:mm");

  const initialTipo: "sessao" | "anamnese" = editing?.observacoes?.startsWith("[Tipo: Anamnese]")
    ? "anamnese"
    : "sessao";
  const [tipoAgendamento, setTipoAgendamento] = useState<"sessao" | "anamnese">(initialTipo);

  const paymentMethodMatch = editing?.observacoes?.match(/\[Meio: (Pix|Espécie)\]/);
  const initialPaymentMethod = paymentMethodMatch ? paymentMethodMatch[1] : "Pix";

  const initialObservacoes = editing?.observacoes
    ? editing.observacoes
        .replace(/^\[Tipo: (Anamnese|Sessão Padrão)\]\n?/, "")
        .replace(/\[Meio: (Pix|Espécie)\]\n?/, "")
    : "";

  const [form, setForm] = useState({
    paciente_id: editing?.paciente_id ?? "",
    profissional_id: editing?.profissional_id ?? "",
    servico_id: editing?.servico_id ?? "",
    data_inicio: initialStart,
    data_fim: initialEnd,
    status: editing?.status ?? "pendente",
    recorrencia: editing?.recorrencia ?? "unica",
    observacoes: initialObservacoes,
    meio_pagamento: initialPaymentMethod,
    sala_id: editing?.sala_id ?? "",
    plano_aba: editing?.plano_aba ?? null,
  });

  const [pacienteOpen, setPacienteOpen] = useState(false);
  const [recorrenciaConfirmOpen, setRecorrenciaConfirmOpen] = useState(false);
  const [planoAbaOpen, setPlanoAbaOpen] = useState(false);
  const [apoioFrequencia, setApoioFrequencia] = useState<'avulso' | '1x' | '2x' | '3x' | 'semana_toda'>('avulso');
  const [apoioValorPersonalizado, setApoioValorPersonalizado] = useState<string>('');

  const [selectedSpecialty, setSelectedSpecialty] = useState(() => {
    if (editing) {
      return editing.servicos?.nome || getEspecialidade(editing) || "";
    }
    return "";
  });

  const specialtyUpper = (selectedSpecialty || "").toUpperCase();

  const { data: pacientes = [] } = useQuery({
    queryKey: ["pac-min"],
    queryFn: async () => (await supabase.from("pacientes").select("id, nome, valor_mensal, apoio_frequencia, apoio_valor_personalizado, cids_secundarios").order("nome")).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: profPacientes = [] } = useQuery({
    queryKey: ["prof-pacientes-agenda", form.profissional_id],
    queryFn: async () => {
      if (!form.profissional_id) return [];
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("paciente_id")
        .eq("profissional_id", form.profissional_id);
      if (error) throw error;
      return (data ?? []).map((item: any) => item.paciente_id);
    },
    enabled: !!form.profissional_id,
  });
  const { data: profissionais = [] } = useQuery({
    queryKey: ["prof-min"],
    queryFn: async () =>
      (
        await supabase
          .from("profissionais")
          .select("id, nome, cor, especialidade, valor_sessao, valores_config, ativo")
          .order("nome")
      ).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: servicos = [] } = useQuery({
    queryKey: ["serv-min"],
    queryFn: async () =>
      (
        await supabase
          .from("servicos")
          .select("id, nome, duracao_minutos")
          .eq("ativo", true)
          .order("nome")
      ).data ?? [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: salas = [] } = useQuery({
    queryKey: ["salas-dialog"],
    queryFn: async () =>
      (
        await supabase
          .from("salas")
          .select("id, nome")
          .eq("ativo", true)
          .order("nome")
      ).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: patientAgs = [] } = useQuery({
    queryKey: ["patient-ags-dialog", form.paciente_id],
    queryFn: async () => {
      if (!form.paciente_id) return [];
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*, profissionais(nome, cor), servicos(nome), salas(nome)")
        .eq("paciente_id", form.paciente_id)
        .order("data_inicio", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!form.paciente_id,
  });

  const sortedPatientAgs = useMemo(() => {
    if (!Array.isArray(patientAgs)) return [];
    return [...patientAgs]
      .filter((a: any) => a?.data_inicio && !isNaN(new Date(a.data_inicio).getTime()))
      .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
  }, [patientAgs]);

  const { data: responsaveisPaciente = [] } = useQuery({
    queryKey: ["responsaveis-paciente-dialog", form.paciente_id],
    queryFn: async () => {
      if (!form.paciente_id) return [];
      const { data, error } = await supabase
        .from("responsaveis")
        .select("telefone, whatsapp, nome")
        .eq("paciente_id", form.paciente_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!form.paciente_id,
  });

  // Localiza o paciente selecionado para recuperar os detalhes de faturamento/cobrança
  const selectedPaciente = Array.isArray(pacientes) ? pacientes.find((p: any) => p.id === form.paciente_id) : undefined;
  const isMensal = !!(selectedPaciente?.valor_mensal && selectedPaciente.valor_mensal > 0);

  const whatsappUrl = useMemo(() => {
    if (!Array.isArray(responsaveisPaciente) || !responsaveisPaciente.length) return null;
    const respWithWhats = responsaveisPaciente.find((r: any) => r?.whatsapp);
    const respWithTel = responsaveisPaciente.find((r: any) => r?.telefone);
    const num =
      respWithWhats?.whatsapp ||
      respWithWhats?.telefone ||
      respWithTel?.whatsapp ||
      respWithTel?.telefone;
    if (!num) return null;

    const cleanNum = String(num).replace(/\D/g, "");
    if (!cleanNum) return null;

    let phoneWithCountry = cleanNum;
    if (cleanNum.length === 10 || cleanNum.length === 11) {
      phoneWithCountry = "55" + cleanNum;
    }

    const dateObj = form.data_inicio ? new Date(form.data_inicio) : null;
    let formattedDate = "";
    if (dateObj && !isNaN(dateObj.getTime())) {
      const rawDateStr = format(dateObj, "EEEE, dd/MM 'às' HH:mm", { locale: ptBR });
      formattedDate = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1);
    }

    let textMsg = "";
    if (tipoAgendamento === "anamnese") {
      textMsg = `Olá!
Estou com uma vaga para Avaliação de ${selectedSpecialty || "terapia"} para *${formattedDate}*.

Você tem interesse em agendar a avaliação?`;
    } else {
      textMsg = `Olá!
Sua sessão de ${selectedSpecialty || "terapia"} está agendada para *${formattedDate}*.

Você pode confirmar, por favor?

*Importante: em caso de ausência ou cancelamento sem aviso prévio, a sessão será cobrada normalmente.*

Fico à disposição para qualquer dúvida!`;
    }

    const msg = encodeURIComponent(textMsg);
    return `https://wa.me/${phoneWithCountry}?text=${msg}`;
  }, [
    responsaveisPaciente,
    selectedPaciente,
    editing,
    form.data_inicio,
    selectedSpecialty,
    tipoAgendamento,
  ]);

  const displayedPacientes = useMemo(() => {
    let basePacientes = Array.isArray(pacientes) ? pacientes : [];
    if (form.profissional_id) {
      basePacientes = basePacientes.filter((p: any) =>
        profPacientes.includes(p.id) || p.id === form.paciente_id
      );
    }

    if (!selectedSpecialty) {
      if (!form.profissional_id) return basePacientes;
      const selectedProf = Array.isArray(profissionais)
        ? profissionais.find((p: any) => p.id === form.profissional_id)
        : undefined;
      if (!selectedProf) return basePacientes;
      const targetSpecs = selectedProf.especialidade
        ? selectedProf.especialidade.split(",").map((s: string) => s.trim().toLowerCase())
        : [];
      if (targetSpecs.length === 0) return basePacientes;
      return basePacientes.filter((p: any) => {
        const pacSpecs = Array.isArray(p.cids_secundarios) 
          ? p.cids_secundarios.map((s: any) => String(s).trim().toLowerCase()) 
          : [];
        return pacSpecs.some((s: string) => targetSpecs.includes(s));
      });
    }

    const targetSpec = selectedSpecialty.trim().toLowerCase();
    return basePacientes.filter((p: any) => {
      const pacSpecs = Array.isArray(p.cids_secundarios) 
        ? p.cids_secundarios.map((s: any) => String(s).trim().toLowerCase()) 
        : [];
      return pacSpecs.includes(targetSpec);
    });
  }, [pacientes, form.profissional_id, selectedSpecialty, profissionais, profPacientes]);

  const formDate = form.data_inicio ? form.data_inicio.split("T")[0] : "";
  const formTime = form.data_inicio ? form.data_inicio.split("T")[1] : "";

  // 1. Filter professionals registered on patient's file (having custom discounts)
  const patientProfessionals = useMemo(() => {
    if (!form.paciente_id || !Array.isArray(profissionais)) return [];
    return profissionais.filter((prof: any) => {
      const config = prof.valores_config as any;
      return (
        Array.isArray(config?.descontos) &&
        config.descontos.some((d: any) => d.paciente_id === form.paciente_id)
      );
    });
  }, [profissionais, form.paciente_id]);

  // Fallback to all active professionals if none are configured on the patient's card
  const displayedProfessionals = useMemo(() => {
    if (patientProfessionals.length > 0) {
      return patientProfessionals;
    }
    return Array.isArray(profissionais) ? profissionais : [];
  }, [patientProfessionals, profissionais]);

  // 2. Parse specialties registered on selected professional's file
  const professionalSpecialties = useMemo(() => {
    if (!form.profissional_id) return [];
    const prof = Array.isArray(profissionais) ? profissionais.find((p: any) => p.id === form.profissional_id) : undefined;
    if (!prof) return [];
    const specs = prof.especialidade
      ? prof.especialidade
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];
    if (selectedSpecialty && !specs.includes(selectedSpecialty)) {
      specs.push(selectedSpecialty);
    }
    return specs;
  }, [profissionais, form.profissional_id, selectedSpecialty]);

  // Auto-select specialty if only one is available
  const professionalSpecialtiesKey = professionalSpecialties.join(",");
  useEffect(() => {
    if (professionalSpecialties.length === 1) {
      if (selectedSpecialty !== professionalSpecialties[0]) {
        setSelectedSpecialty(professionalSpecialties[0]);
      }
    } else if (professionalSpecialties.length > 0) {
      if (selectedSpecialty && !professionalSpecialties.includes(selectedSpecialty)) {
        setSelectedSpecialty("");
      }
    } else {
      if (selectedSpecialty !== "") {
        setSelectedSpecialty("");
      }
    }
  }, [professionalSpecialtiesKey, selectedSpecialty]);

  useEffect(() => {
    if (selectedPaciente) {
      setApoioFrequencia((selectedPaciente.apoio_frequencia as any) || 'avulso');
      setApoioValorPersonalizado(selectedPaciente.apoio_valor_personalizado ? String(selectedPaciente.apoio_valor_personalizado) : '');
    }
  }, [form.paciente_id, selectedPaciente]);

  // 3. Find configured rates/plans
  const currentPricing = useMemo(() => {
    if (!form.profissional_id || !selectedSpecialty) return null;
    const prof = Array.isArray(profissionais) ? profissionais.find((p: any) => p.id === form.profissional_id) : undefined;
    if (!prof) return null;

    const config = (prof.valores_config as any) || { especialidades: [], descontos: [] };

    // Check custom patient discount
    const discount = Array.isArray(config.descontos)
      ? config.descontos.find(
          (d: any) =>
            d.paciente_id === form.paciente_id &&
            typeof d.especialidade === "string" &&
            d.especialidade.toLowerCase() === selectedSpecialty.toLowerCase(),
        )
      : null;

    if (discount) {
      return {
        type: "Paciente (Desconto)",
        valor_sessao: discount.valor_sessao,
        valor_avaliacao: discount.valor_avaliacao,
      };
    }

    // Check standard specialty rates
    const specConfig = Array.isArray(config.especialidades)
      ? config.especialidades.find(
          (e: any) =>
            typeof e?.nome === "string" && e.nome.toLowerCase() === selectedSpecialty.toLowerCase(),
        )
      : null;
    if (specConfig) {
      return {
        type: "Padrão Especialidade",
        valor_sessao:
          specialtyUpper === "AP" ? null : (specConfig.valor_sessao ?? prof.valor_sessao),
        valor_avaliacao: specConfig.valor_avaliacao,
        plano_mensal: specConfig.plano_mensal,
      };
    }

    // Default professional rate
    return {
      type: "Padrão Profissional",
      valor_sessao: prof.valor_sessao,
      valor_avaliacao: null,
    };
  }, [form.profissional_id, form.paciente_id, selectedSpecialty, profissionais, specialtyUpper]);

  const getSelectedSpecialtyDuration = () => {
    const specUpper = (selectedSpecialty || "").toUpperCase();
    if (specUpper === "AT ABA") return 90;
    const s: any = Array.isArray(servicos) ? servicos.find(
      (x: any) => x.nome?.toLowerCase() === selectedSpecialty?.toLowerCase(),
    ) : undefined;
    return s ? s.duracao_minutos : 60;
  };

  const handleDateChange = (dateVal: string) => {
    if (!dateVal) return;
    const timeVal = form.data_inicio ? form.data_inicio.split("T")[1] || "09:00" : "09:00";
    const newStart = `${dateVal}T${timeVal}`;
    const duration = getSelectedSpecialtyDuration();
    const newEnd = safeFormatDate(
      new Date(newStart).getTime() + duration * 60000,
      "yyyy-MM-dd'T'HH:mm",
    );
    setForm({
      ...form,
      data_inicio: newStart,
      data_fim: newEnd,
    });
  };

  const handleTimeChange = (timeVal: string) => {
    if (!timeVal) return;
    const dateVal = form.data_inicio
      ? form.data_inicio.split("T")[0] || safeFormatDate(new Date(), "yyyy-MM-dd")
      : safeFormatDate(new Date(), "yyyy-MM-dd");
    const newStart = `${dateVal}T${timeVal}`;
    const duration = getSelectedSpecialtyDuration();
    const newEnd = safeFormatDate(
      new Date(newStart).getTime() + duration * 60000,
      "yyyy-MM-dd'T'HH:mm",
    );
    setForm({
      ...form,
      data_inicio: newStart,
      data_fim: newEnd,
    });
  };

  const handlePacienteChange = (pacId: string) => {
    setForm((prev) => ({
      ...prev,
      paciente_id: pacId,
    }));
  };

  const handleProfissionalChange = (profId: string) => {
    setForm((prev) => ({
      ...prev,
      profissional_id: profId,
    }));
    setSelectedSpecialty("");
  };

  const handleSpecialtyChange = (spec: string) => {
    setSelectedSpecialty(spec);
    const specUpper = (spec || "").toUpperCase();
    const s: any = Array.isArray(servicos) ? servicos.find((x: any) => x.nome?.toLowerCase() === spec?.toLowerCase()) : undefined;
    const duration = specUpper === "AT ABA" ? 90 : (s ? s.duracao_minutos : 60);
    const newEnd = safeFormatDate(
      new Date(form.data_inicio).getTime() + duration * 60000,
      "yyyy-MM-dd'T'HH:mm",
    );
    setForm((prev) => ({
      ...prev,
      data_fim: newEnd,
    }));
  };

  const save = useMutation({
    mutationFn: async (updateAllFuture: boolean = false) => {
      if (!form.paciente_id || !form.profissional_id)
        throw new Error("Selecione paciente e profissional");

      const isApoioVal = selectedSpecialty && (selectedSpecialty.toLowerCase() === "apoio" || selectedSpecialty.toUpperCase() === "AP");
      if (isApoioVal && form.paciente_id) {
        const { error: pacUpdateErr } = await supabase
          .from("pacientes")
          .update({
            apoio_frequencia: apoioFrequencia,
            apoio_valor_personalizado: apoioValorPersonalizado ? Number(apoioValorPersonalizado) : null,
          })
          .eq("id", form.paciente_id);
        if (pacUpdateErr) throw pacUpdateErr;
      }

      const start = new Date(form.data_inicio).toISOString();
      const end = new Date(form.data_fim).toISOString();
      
      if (form.status !== "cancelado" && form.status !== "falta") {
        const { data: conflicts } = await supabase
          .from("agendamentos")
          .select("id")
          .eq("profissional_id", form.profissional_id)
          .neq("status", "cancelado")
          .neq("status", "falta")
          .lt("data_inicio", end)
          .gt("data_fim", start);
        const others = (conflicts ?? []).filter((c) => c.id !== editing?.id);
        if (others.length > 0) {
          const ok = confirm(
            "⚠ Conflito de horário detectado para este profissional. Deseja salvar mesmo assim?",
          );
          if (!ok) throw new Error("Cancelado pelo usuário");
        }
      }

      let matchingServico = Array.isArray(servicos) ? servicos.find(
        (s: any) => s.nome?.toLowerCase() === selectedSpecialty?.toLowerCase(),
      ) : undefined;

      if (!matchingServico && selectedSpecialty) {
        const specUpper = (selectedSpecialty || "").toUpperCase();
        const duration = specUpper === "AT ABA" ? 90 : 60;
        const { data: newServ, error: servError } = await supabase
          .from("servicos")
          .insert({ nome: selectedSpecialty, duracao_minutos: duration })
          .select()
          .single();
        if (servError) throw servError;
        matchingServico = newServ;
        qc.invalidateQueries({ queryKey: ["serv-min"] });
      }

      const typePrefix =
        specialtyUpper !== "AP"
          ? tipoAgendamento === "anamnese"
            ? "[Tipo: Anamnese]\n"
            : "[Tipo: Sessão Padrão]\n"
          : "";
      const paymentPrefix = isMensal ? "" : `[Meio: ${form.meio_pagamento}]\n`;
      const finalObservacoes = typePrefix + paymentPrefix + form.observacoes;

      // Calculate valor for sync
      let valor = 0;
      if (specialtyUpper !== "AP" && currentPricing) {
        valor =
          tipoAgendamento === "sessao"
            ? Number(currentPricing.valor_sessao ?? 0)
            : Number(currentPricing.valor_avaliacao ?? currentPricing.valor_sessao ?? 0);
      }

      if (editing) {
        const hasOtherFieldsChanged =
          form.paciente_id !== (editing.paciente_id ?? "") ||
          form.profissional_id !== (editing.profissional_id ?? "") ||
          selectedSpecialty !== (editing.servicos?.nome || getEspecialidade(editing) || "") ||
          form.data_inicio !== initialStart ||
          form.data_fim !== initialEnd ||
          form.recorrencia !== (editing.recorrencia ?? "unica") ||
          form.observacoes !== initialObservacoes ||
          form.status !== (editing.status ?? "pendente") ||
          tipoAgendamento !== initialTipo ||
          form.meio_pagamento !== initialPaymentMethod ||
          form.sala_id !== (editing.sala_id ?? "");
        void hasOtherFieldsChanged;

        const explicitPayload = {
          paciente_id: form.paciente_id,
          profissional_id: form.profissional_id,
          servico_id: matchingServico ? matchingServico.id : null,
          data_inicio: start,
          data_fim: end,
          status: form.status,
          recorrencia: form.recorrencia,
          observacoes: finalObservacoes,
          sala_id: form.sala_id || null,
          plano_aba: form.plano_aba,
        };

        if (updateAllFuture) {
          const { data: futureAgs, error: fetchError } = await supabase
            .from("agendamentos")
            .select("id, data_inicio, data_fim")
            .eq("recorrencia_grupo", editing.recorrencia_grupo)
            .gte("data_inicio", editing.data_inicio);

          if (fetchError) throw fetchError;

          const startDiff =
            new Date(form.data_inicio).getTime() - new Date(editing.data_inicio).getTime();
          const endDiff = new Date(form.data_fim).getTime() - new Date(editing.data_fim).getTime();

          const updates = (futureAgs ?? []).map(async (occ) => {
            const occStart = new Date(
              new Date(occ.data_inicio).getTime() + startDiff,
            ).toISOString();
            const occEnd = new Date(new Date(occ.data_fim).getTime() + endDiff).toISOString();
            const { error } = await supabase
              .from("agendamentos")
              .update({
                paciente_id: form.paciente_id,
                profissional_id: form.profissional_id,
                servico_id: matchingServico ? matchingServico.id : null,
                data_inicio: occStart,
                data_fim: occEnd,
                status: form.status,
                sala_id: form.sala_id || null,
                recorrencia: form.recorrencia,
                observacoes: finalObservacoes,
              })
              .eq("id", occ.id);
            if (error) throw error;
          });

          await Promise.all(updates);

          if (futureAgs && futureAgs.length > 0) {
            for (const occ of futureAgs) {
              const occStart = new Date(
                new Date(occ.data_inicio).getTime() + startDiff,
              ).toISOString();
              await syncAgendamentoFinanceiro(
                occ.id,
                form.paciente_id,
                form.profissional_id,
                occStart,
                form.status,
                tipoAgendamento,
                selectedSpecialty,
                valor,
                form.meio_pagamento,
              );
            }
          }
        } else {
          const { error } = await supabase
            .from("agendamentos")
            .update(explicitPayload)
            .eq("id", editing.id);
          if (error) throw error;

          await syncAgendamentoFinanceiro(
            editing.id,
            form.paciente_id,
            form.profissional_id,
            start,
            form.status,
            tipoAgendamento,
            selectedSpecialty,
            valor,
            form.meio_pagamento,
          );
        }
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (form.recorrencia !== "unica") {
          const occurrences: any[] = [];
          const numOccurrences = 12;
          const groupId = crypto.randomUUID();

          for (let i = 0; i < numOccurrences; i++) {
            let occStart: Date;
            let occEnd: Date;
            if (form.recorrencia === "semanal") {
              occStart = addWeeks(new Date(form.data_inicio), i);
              occEnd = addWeeks(new Date(form.data_fim), i);
            } else if (form.recorrencia === "quinzenal") {
              occStart = addWeeks(new Date(form.data_inicio), i * 2);
              occEnd = addWeeks(new Date(form.data_fim), i * 2);
            } else if (form.recorrencia === "mensal") {
              const baseStart = new Date(form.data_inicio);
              const baseEnd = new Date(form.data_fim);
              occStart = new Date(
                baseStart.getFullYear(),
                baseStart.getMonth() + i,
                baseStart.getDate(),
                baseStart.getHours(),
                baseStart.getMinutes(),
              );
              occEnd = new Date(
                baseEnd.getFullYear(),
                baseEnd.getMonth() + i,
                baseEnd.getDate(),
                baseEnd.getHours(),
                baseEnd.getMinutes(),
              );
            } else {
              occStart = new Date(form.data_inicio);
              occEnd = new Date(form.data_fim);
            }

            const payload: any = {
              ...form,
              sala_id: form.sala_id || null,
              servico_id: matchingServico ? matchingServico.id : null,
              data_inicio: occStart.toISOString(),
              data_fim: occEnd.toISOString(),
              observacoes: finalObservacoes,
              recorrencia_grupo: groupId,
              created_by: user?.id || null,
              plano_aba: i === 0 ? form.plano_aba : null,
            };
            delete (payload as any).meio_pagamento;
            occurrences.push(payload);
          }
          const { data: insertedAgs, error } = await supabase
            .from("agendamentos")
            .insert(occurrences)
            .select("id, data_inicio, status");
          if (error) throw error;

          if (insertedAgs && insertedAgs.length > 0) {
            for (const occ of insertedAgs) {
              await syncAgendamentoFinanceiro(
                occ.id,
                form.paciente_id,
                form.profissional_id,
                occ.data_inicio,
                occ.status,
                tipoAgendamento,
                selectedSpecialty,
                valor,
                form.meio_pagamento,
              );
            }
          }
        } else {
          const payload: any = {
            ...form,
            sala_id: form.sala_id || null,
            servico_id: matchingServico ? matchingServico.id : null,
            data_inicio: start,
            data_fim: end,
            observacoes: finalObservacoes,
            created_by: user?.id || null,
          };
          delete (payload as any).meio_pagamento;
          const { data: insertedAg, error } = await supabase
            .from("agendamentos")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;

          if (insertedAg) {
            await syncAgendamentoFinanceiro(
              insertedAg.id,
              form.paciente_id,
              form.profissional_id,
              start,
              form.status,
              tipoAgendamento,
              selectedSpecialty,
              valor,
              form.meio_pagamento,
            );
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Agendamento atualizado" : "Agendamento criado");
      onSaved();
    },
    onError: (e: any) => e.message !== "Cancelado pelo usuário" && toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (deleteAllFuture: boolean) => {
      if (deleteAllFuture && editing?.recorrencia_grupo) {
        const { data: futureAgs } = await supabase
          .from("agendamentos")
          .select("id, data_inicio, observacoes, servicos(nome)")
          .eq("recorrencia_grupo", editing.recorrencia_grupo)
          .gte("data_inicio", editing.data_inicio);

        const { error } = await supabase
          .from("agendamentos")
          .delete()
          .eq("recorrencia_grupo", editing.recorrencia_grupo)
          .gte("data_inicio", editing.data_inicio);
        if (error) throw error;

        if (futureAgs && futureAgs.length > 0) {
          for (const occ of futureAgs) {
            const occTipo = occ.observacoes?.startsWith("[Tipo: Anamnese]") ? "anamnese" : "sessao";
            const occSpec = (occ as any).servicos?.nome || "";
            await syncAgendamentoFinanceiro(
              occ.id,
              editing.paciente_id,
              editing.profissional_id,
              occ.data_inicio,
              "cancelado",
              occTipo,
              occSpec,
              0,
              editing.meio_pagamento,
            );
          }
        }
      } else {
        const { error } = await supabase.from("agendamentos").delete().eq("id", editing.id);
        if (error) throw error;

        const occTipo = editing.observacoes?.startsWith("[Tipo: Anamnese]") ? "anamnese" : "sessao";
        const occSpec = editing.servicos?.nome || getEspecialidade(editing) || "";
        await syncAgendamentoFinanceiro(
          editing.id,
          editing.paciente_id,
          editing.profissional_id,
          editing.data_inicio,
          "cancelado",
          occTipo,
          occSpec,
          0,
          editing.meio_pagamento,
        );
      }
    },
    onSuccess: () => {
      toast.success("Agendamento excluído com sucesso");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.paciente_id || !form.profissional_id) {
      toast.error("Selecione paciente e profissional");
      return;
    }

    const hasOtherFieldsChanged =
      form.paciente_id !== (editing?.paciente_id ?? "") ||
      form.profissional_id !== (editing?.profissional_id ?? "") ||
      selectedSpecialty !== (editing?.servicos?.nome || getEspecialidade(editing) || "") ||
      form.data_inicio !== initialStart ||
      form.data_fim !== initialEnd ||
      form.recorrencia !== (editing?.recorrencia ?? "unica") ||
      form.observacoes !== initialObservacoes ||
      form.status !== (editing?.status ?? "pendente") ||
      tipoAgendamento !== initialTipo ||
      form.meio_pagamento !== initialPaymentMethod ||
      form.sala_id !== (editing?.sala_id ?? "");

    if (
      editing?.recorrencia_grupo &&
      hasOtherFieldsChanged &&
      form.status !== "pago" &&
      form.status !== "realizado" &&
      form.status !== "cancelado" &&
      form.status !== "confirmado" &&
      form.status !== "falta"
    ) {
      setRecorrenciaConfirmOpen(true);
    } else {
      save.mutate(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {recorrenciaConfirmOpen
            ? "Editar agendamento recorrente"
            : editing
              ? "Editar agendamento"
              : "Novo agendamento"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        {recorrenciaConfirmOpen ? (
          <div className="space-y-4 py-2 animate-in fade-in duration-200">
            <p className="text-sm text-muted-foreground">
              Este agendamento faz parte de uma série recorrente. Deseja aplicar estas alterações
              também para todas as datas futuras da série?
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecorrenciaConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={save.isPending}
                onClick={() => {
                  save.mutate(false);
                }}
              >
                Não
              </Button>
              <Button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  save.mutate(true);
                }}
              >
                Ok
              </Button>
            </div>
          </div>
        ) : (
          <>
            {editing && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-3 animate-in fade-in duration-200">
                <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  Dados Agendados & Histórico
                </div>

                <div className="max-h-36 overflow-y-auto pr-1 space-y-3 divider-y">
                  {/* Resumo do Agendamento Atual */}
                  <div className="space-y-1.5 pb-2 border-b border-border/60">
                    <div className="font-medium text-primary text-[10px] uppercase">
                      Agendamento Atual
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>
                        <span className="text-muted-foreground font-medium">Paciente:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {selectedPaciente ? selectedPaciente.nome : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Profissional:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {Array.isArray(profissionais) ? (profissionais.find((p: any) => p.id === form.profissional_id)?.nome || "—") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Especialidade:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {selectedSpecialty || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Data/Hora:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {safeFormatDate(form.data_inicio, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-1">
                        <span className="text-muted-foreground font-medium">Status:</span>{" "}
                        <Badge variant="secondary" className="h-4 px-1 text-[9px] font-semibold">
                          {STATUS_LABEL[form.status] || form.status || ""}
                        </Badge>
                        {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-green-600 hover:text-green-700 hover:underline font-semibold"
                              title="Contatar via WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5 fill-green-600/10" /> WhatsApp
                            </a>
                          )}
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Recorrência:</span>{" "}
                        <span className="text-foreground font-semibold capitalize">
                          {form.recorrencia || "única"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">
                          Meio de Pagamento:
                        </span>{" "}
                        <span className="text-foreground font-semibold">
                          {isMensal ? "Mensal" : form.meio_pagamento || "Pix"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Sala:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {Array.isArray(salas) ? (salas.find((s: any) => s.id === form.sala_id)?.nome || "Sem Sala") : "Sem Sala"}
                        </span>
                      </div>
                    </div>
                    {form.observacoes && (
                      <div className="mt-1">
                        <span className="text-muted-foreground font-medium">Observações:</span>{" "}
                        <span className="text-foreground whitespace-pre-wrap">
                          {form.observacoes}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Todos os Agendamentos do Paciente */}
                  <div className="space-y-1.5 pt-1">
                    <div className="font-medium text-primary text-[10px] uppercase flex items-center justify-between">
                      <span>Todos os Agendamentos do Paciente ({Array.isArray(patientAgs) ? patientAgs.length : 0})</span>
                    </div>
                    {Array.isArray(sortedPatientAgs) && sortedPatientAgs.length === 0 ? (
                      <p className="text-muted-foreground italic">
                        Nenhum outro agendamento encontrado.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {sortedPatientAgs.map((a: any) => (
                          <div
                            key={a.id}
                            className={cn(
                              "p-1.5 rounded border flex items-center justify-between text-[11px] transition",
                              a.id === editing?.id
                                ? "bg-primary/5 border-primary/30"
                                : "bg-card border-border/40",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: a.profissionais?.cor || "var(--primary)",
                                }}
                              />
                              <div>
                                <span className="font-medium text-foreground">
                                  {safeFormatDate(a.data_inicio, "dd/MM/yyyy HH:mm", {
                                    locale: ptBR,
                                  })}
                                </span>
                                <span className="text-muted-foreground mx-1">•</span>
                                <span className="text-muted-foreground">
                                  {a.profissionais?.nome} ({a.servicos?.nome || "Sessão"}){a.salas?.nome ? ` • ${a.salas.nome}` : ""}
                                </span>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-4 px-1 text-[8px] uppercase font-bold shrink-0",
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
                              {STATUS_LABEL[a.status] || a.status || ""}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Profissional *</Label>
                <Select value={form.profissional_id} onValueChange={handleProfissionalChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o profissional…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(profissionais) ? (
                      profissionais
                        .filter((p: any) => {
                          if (p.id === form.profissional_id) return true;
                          if (p.ativo) return true;
                          const config = p.valores_config as any;
                          if (config?.ativo_ate) {
                            const targetMonth = form.data_inicio ? form.data_inicio.substring(0, 7) : format(new Date(), "yyyy-MM");
                            return targetMonth <= config.ativo_ate;
                          }
                          return false;
                        })
                        .map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              {(form.profissional_id || editing) && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <Label>Especialidade *</Label>
                  <Select value={selectedSpecialty} onValueChange={handleSpecialtyChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a especialidade…" />
                    </SelectTrigger>
                    <SelectContent>
                      {professionalSpecialties.map((s: string) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {((form.profissional_id && selectedSpecialty) || editing) && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                {/* Paciente Column */}
                <div className="space-y-1.5">
                  <Label>Paciente *</Label>
                  <div className="flex gap-2">
                    <Popover open={pacienteOpen} onOpenChange={setPacienteOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={pacienteOpen}
                          className="flex-1 min-w-0 justify-between font-normal text-left px-3 animate-in fade-in duration-200"
                        >
                          <span className="truncate mr-2 flex-1">
                            {selectedPaciente ? selectedPaciente.nome : "Selecione o paciente..."}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] min-w-[400px] p-0"
                        align="start"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        <Command>
                          <CommandInput placeholder="Pesquisar paciente..." className="h-9" />
                          <CommandList className="max-h-[450px]">
                            <CommandEmpty className="p-4 text-center text-sm">
                              <p className="text-muted-foreground mb-2">
                                Nenhum paciente cadastrado nesta especialidade.
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full gap-1.5"
                                onClick={() => {
                                  setPacienteOpen(false);
                                  triggerNewPatient(
                                    selectedSpecialty,
                                    form.profissional_id,
                                    (newPac) => {
                                      if (newPac?.id) {
                                        handlePacienteChange(newPac.id);
                                      }
                                    },
                                  );
                                }}
                              >
                                <Plus className="h-4 w-4" /> Cadastrar Novo Paciente
                              </Button>
                            </CommandEmpty>
                            <CommandGroup>
                              {displayedPacientes.map((p: any) => (
                                <CommandItem
                                  key={p.id}
                                  value={`${normalizeString(p.nome)}-${p.id}`}
                                  onSelect={() => {
                                    handlePacienteChange(p.id);
                                    setPacienteOpen(false);
                                  }}
                                  className="flex items-center justify-between cursor-pointer"
                                >
                                  <div className="flex items-center flex-1 min-w-0">
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        form.paciente_id === p.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate font-medium">{p.nome}</span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] ml-2 shrink-0 font-medium bg-muted/50"
                                  >
                                    {p.valor_mensal && p.valor_mensal > 0 ? "Mensal" : "Por Sessão"}
                                  </Badge>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {selectedPaciente && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                          triggerEditPatient(selectedPaciente, () => {
                            qc.invalidateQueries({
                              queryKey: ["responsaveis-paciente-dialog", selectedPaciente.id],
                            });
                          })
                        }
                        title="Editar dados do paciente"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {selectedPaciente && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1.5 bg-muted/30 px-2.5 py-1.5 rounded border border-dashed border-border/80">
                      <span className="font-medium">Cobrança:</span>
                      <span
                        className={cn(
                          "font-semibold rounded-full px-2 py-0.5 text-[9px] uppercase",
                          selectedPaciente.valor_mensal && selectedPaciente.valor_mensal > 0
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-green-50 text-green-700 border border-green-200",
                        )}
                      >
                        {selectedPaciente.valor_mensal && selectedPaciente.valor_mensal > 0
                          ? "Plano Mensal"
                          : "Pagamento por Sessão"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tipo de Agendamento Column */}
                <div className="space-y-1.5 flex flex-col justify-start">
                  {(form.paciente_id && !isApoio(selectedSpecialty)) ||
                  (editing && !isApoio(selectedSpecialty)) ? (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <Label>Tipo de Agendamento *</Label>
                      <Select
                        value={tipoAgendamento}
                        onValueChange={(v: any) => setTipoAgendamento(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sessao">Sessão Padrão</SelectItem>
                          <SelectItem value="anamnese">Anamnese</SelectItem>
                        </SelectContent>
                      </Select>
                      {tipoAgendamento === "anamnese" && triggerAnamnese && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full mt-2 gap-1.5 border-primary/40 hover:bg-primary/5 text-primary text-xs font-semibold h-8"
                          onClick={() => {
                            if (!form.paciente_id) {
                              toast.error("Por favor, selecione um paciente antes de preencher a anamnese");
                              return;
                            }
                            triggerAnamnese(form.paciente_id, editing?.id, form.profissional_id);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {editing ? "Preencher Anamnese" : "Ver Rascunho Anamnese"}
                        </Button>
                      )}
                      {specialtyUpper === "AT ABA" && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full mt-2 gap-1.5 border-purple-400 hover:bg-purple-50 text-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/30 text-xs font-semibold h-8"
                          onClick={() => {
                            if (!form.paciente_id) {
                              toast.error("Por favor, selecione um paciente antes de abrir o Plano ABA");
                              return;
                            }
                            setPlanoAbaOpen(true);
                          }}
                        >
                          <Activity className="h-3.5 w-3.5 text-purple-600" />
                          {form.plano_aba ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Editar Plano ABA
                            </span>
                          ) : (
                            "Preencher Plano ABA"
                          )}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Apoio Frequency and Discount fields (only for Apoio) */}
                {form.paciente_id && isApoio(selectedSpecialty) && (
                  <div className="col-span-2 grid grid-cols-2 gap-4 border-t pt-3 mt-1 animate-in fade-in duration-200">
                    <div className="space-y-1.5">
                      <Label>Frequência do Aluno (Apoio) *</Label>
                      <Select value={apoioFrequencia} onValueChange={(v: any) => setApoioFrequencia(v)}>
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
                      <Label>Valor Customizado / Desconto (Opcional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={apoioFrequencia === 'avulso' ? "Ex: 40.00 (por sessão)" : "Ex: 100.00 (mensal)"}
                        value={apoioValorPersonalizado}
                        onChange={(e) => setApoioValorPersonalizado(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {((form.profissional_id && form.paciente_id && selectedSpecialty) || editing) && (
              <div className="space-y-3 animate-in fade-in duration-200">
                {currentPricing && (
                  <div className="rounded-lg border bg-accent/20 p-3 text-xs space-y-1.5 shadow-inner">
                    <div className="font-semibold text-muted-foreground flex justify-between">
                      <span>Valor do Agendamento</span>
                      <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                        {currentPricing.type}
                      </span>
                    </div>
                    <div className="mt-1">
                      {isApoio(selectedSpecialty) ? (
                        <div>
                          <span className="text-muted-foreground">Frequência/Cobrança (Apoio): </span>
                          <span className="font-semibold text-foreground text-xs block mt-0.5">
                            {apoioFrequencia === "avulso" && `Sessão Avulsa - R$ ${Number(apoioValorPersonalizado || 50).toFixed(2)} por sessão`}
                            {apoioFrequencia === "1x" && `1x por semana - R$ ${Number(apoioValorPersonalizado || 120).toFixed(2)} mensal`}
                            {apoioFrequencia === "2x" && `2x por semana - R$ ${Number(apoioValorPersonalizado || 240).toFixed(2)} mensal`}
                            {apoioFrequencia === "3x" && `3x por semana - R$ ${Number(apoioValorPersonalizado || 360).toFixed(2)} mensal`}
                            {apoioFrequencia === "semana_toda" && `Semana Toda - R$ ${Number(apoioValorPersonalizado || 450).toFixed(2)} mensal`}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-muted-foreground">
                            {tipoAgendamento === "sessao" ? "Sessão Padrão: " : "Anamnese: "}
                          </span>
                          <span className="font-bold text-foreground text-sm font-mono">
                            {tipoAgendamento === "sessao"
                              ? currentPricing.valor_sessao !== null &&
                                currentPricing.valor_sessao !== undefined
                                ? `R$ ${Number(currentPricing.valor_sessao).toFixed(2)}`
                                : "—"
                              : currentPricing.valor_avaliacao !== null &&
                                  currentPricing.valor_avaliacao !== undefined
                                ? `R$ ${Number(currentPricing.valor_avaliacao).toFixed(2)}`
                                : "—"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="date"
                      required
                      value={formDate || ""}
                      onChange={(e) => handleDateChange(e.target.value)}
                    />
                    <Input
                      type="time"
                      required
                      value={formTime || ""}
                      onChange={(e) => handleTimeChange(e.target.value)}
                    />
                  </div>
                </div>

                {/* Seleção de Sala */}
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <Label>Sala</Label>
                  <Select
                    value={form.sala_id || "sem_sala"}
                    onValueChange={(v) => setForm({ ...form, sala_id: v === "sem_sala" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma sala..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_sala">Sem Sala</SelectItem>
                      {salas.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div
                  className={cn(
                    "grid gap-3",
                    form.status === "pendente" ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
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
                        {Object.entries(STATUS_LABEL).map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full mt-1.5 h-8 gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200/60 dark:border-green-900/30 text-xs"
                      disabled={!whatsappUrl}
                      onClick={() => whatsappUrl && window.open(whatsappUrl, "_blank")}
                    >
                      <MessageCircle className="h-4 w-4 fill-green-600/10" />
                      {whatsappUrl ? "WhatsApp Paciente" : "Sem WhatsApp"}
                    </Button>
                  </div>
                  {form.status === "pendente" && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <Label>Recorrência</Label>
                      <Select
                        value={form.recorrencia}
                        onValueChange={(v) => setForm({ ...form, recorrencia: v as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unica">Única</SelectItem>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="quinzenal">Quinzenal</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {!isMensal && (
                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <Label>Meio de pagamento realizado na sessão</Label>
                    <Select
                      value={form.meio_pagamento}
                      onValueChange={(v) => setForm({ ...form, meio_pagamento: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o meio de pagamento..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Espécie">Espécie</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <DialogFooter className="gap-2 pt-2 border-t mt-4 justify-between flex-wrap">
                  <div className="flex gap-2">
                    {editing && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              "Tem certeza que deseja excluir permanentemente este agendamento? Esta ação não pode ser desfeita.",
                            )
                          ) {
                            const hasFuture = editing?.recorrencia_grupo;
                            let deleteAllFuture = false;
                            if (hasFuture) {
                              deleteAllFuture = confirm(
                                "Este agendamento faz parte de uma série recorrente. Deseja excluir também todos os agendamentos futuros desta série?",
                              );
                            }
                            deleteMutation.mutate(deleteAllFuture);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </Button>
                    )}
                    {editing && editing.status !== "cancelado" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => onCancel(editing)}
                      >
                        <X className="h-4 w-4" /> Cancelar agendamento
                      </Button>
                    )}
                  </div>
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </>
        )}
        <PlanoAbaDialog
          open={planoAbaOpen}
          onOpenChange={setPlanoAbaOpen}
          pacienteId={form.paciente_id}
          pacienteNome={selectedPaciente ? selectedPaciente.nome : ""}
          profissionalNome={Array.isArray(profissionais) ? (profissionais.find((p: any) => p.id === form.profissional_id)?.nome || "") : ""}
          value={form.plano_aba}
          onChange={(val) => setForm((prev) => ({ ...prev, plano_aba: val }))}
          onConfirm={editing?.id ? async (val) => {
            const { error } = await supabase
              .from("agendamentos")
              .update({ plano_aba: val })
              .eq("id", editing.id);
            if (error) throw error;
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["agendamentos"] }),
              qc.invalidateQueries({ queryKey: ["paciente-ags"] }),
            ]);
          } : undefined}
        />
      </form>
    </DialogContent>
  );
}

function CancelDialog({ ag, onDone }: any) {
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: async (cancelAllFuture: boolean) => {
      if (!motivo.trim()) throw new Error("Informe o motivo");
      if (cancelAllFuture && ag.recorrencia_grupo) {
        const { data: futureAgs } = await supabase
          .from("agendamentos")
          .select(
            "id, data_inicio, observacoes, paciente_id, profissional_id, servicos(nome), pacientes(cids_secundarios), profissionais(especialidade)",
          )
          .eq("recorrencia_grupo", ag.recorrencia_grupo)
          .gte("data_inicio", ag.data_inicio);

        const { error } = await supabase
          .from("agendamentos")
          .update({ status: "cancelado", motivo_cancelamento: motivo })
          .eq("recorrencia_grupo", ag.recorrencia_grupo)
          .gte("data_inicio", ag.data_inicio);
        if (error) throw error;

        if (futureAgs && futureAgs.length > 0) {
          for (const occ of futureAgs) {
            const occTipo = occ.observacoes?.startsWith("[Tipo: Anamnese]") ? "anamnese" : "sessao";
            const occSpec = getEspecialidade(occ) || "";
            await syncAgendamentoFinanceiro(
              occ.id,
              ag.paciente_id,
              ag.profissional_id,
              occ.data_inicio,
              "cancelado",
              occTipo,
              occSpec,
              0,
            );
          }
        }
      } else {
        const { error } = await supabase
          .from("agendamentos")
          .update({ status: "cancelado", motivo_cancelamento: motivo })
          .eq("id", ag.id);
        if (error) throw error;

        const occTipo = ag.observacoes?.startsWith("[Tipo: Anamnese]") ? "anamnese" : "sessao";
        const occSpec = getEspecialidade(ag) || "";
        await syncAgendamentoFinanceiro(
          ag.id,
          ag.paciente_id,
          ag.profissional_id,
          ag.data_inicio,
          "cancelado",
          occTipo,
          occSpec,
          0,
        );
      }
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Cancelar agendamento</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const cancelAllFuture = ag.recorrencia_grupo
            ? confirm(
                "Este agendamento faz parte de uma série recorrente. Deseja cancelar também todos os agendamentos futuros desta série?",
              )
            : false;
          m.mutate(cancelAllFuture);
        }}
        className="space-y-3"
      >
        <p className="text-sm text-muted-foreground">
          Informe o motivo do cancelamento. Esta ação não pode ser desfeita.
        </p>
        <Textarea
          required
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo…"
        />
        <DialogFooter>
          <Button type="submit" variant="destructive" disabled={m.isPending}>
            Confirmar cancelamento
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
