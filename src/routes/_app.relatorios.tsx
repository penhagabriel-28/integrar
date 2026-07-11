import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Calendar,
  Users,
  FileText,
  Plus,
  Search,
  Pencil,
  Trash2,
  Check,
  Clock,
  AlertTriangle,
  Undo2,
  TrendingUp,
  Settings,
  Activity,
  Eye,
  Download,
  Printer,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from "recharts";
import { format, startOfMonth, endOfMonth, differenceInDays, addDays, parseISO, isAfter } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatCPF } from "@/components/PacienteFormDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const qc = useQueryClient();
  const today = new Date();

  // 1. Existing general metrics state
  const [inicio, setInicio] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [fim, setFim] = useState(format(endOfMonth(today), "yyyy-MM-dd"));

  // 2. Report control state
  const [activeTab, setActiveTab] = useState("metricas");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "atrasado" | "entregue">("todos");
  
  // Dialog form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);
  
  // Custom document types state
  const [newTypeName, setNewTypeName] = useState("");
  const [editingTypeId, setEditingTypeId] = useState("");
  const [editingTypeName, setEditingTypeName] = useState("");

  // 3. Accountant communication state
  const [accountantDialogOpen, setAccountantDialogOpen] = useState(false);
  const [accountantPhone, setAccountantPhone] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("telefone_contador") || "";
    }
    return "";
  });

  const [formData, setFormData] = useState({
    id: "",
    paciente_id: "",
    responsavel_nome: "",
    responsavel_cpf: "",
    profissional_id: "",
    tipo_documento_id: "",
    data_solicitacao: format(new Date(), "yyyy-MM-dd"),
    data_limite: format(addDays(new Date(), 10), "yyyy-MM-dd"),
    data_entrega: "",
    observacoes: "",
    valor_total: "",
    especialidades: "",
  });

  // Queries
  const { data: agendamentos = [] } = useQuery({
    queryKey: ["rel-agendamentos", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, status, data_inicio, profissional:profissionais(nome)")
        .gte("data_inicio", `${inicio}T00:00:00`)
        .lte("data_inicio", `${fim}T23:59:59`);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pacientesAtivos = 0 } = useQuery({
    queryKey: ["rel-pacientes-ativos"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pacientes")
        .select("*", { count: "exact", head: true })
        .eq("status", "ativo");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Fetch report requests with fallback handling
  const { data: reportRequests = [] } = useQuery({
    queryKey: ["controle-relatorios"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("controle_relatorios")
          .select("*, paciente:pacientes(nome), profissional:profissionais(nome, telefone), tipo_documento:tipos_documento(nome)")
          .order("data_solicitacao", { ascending: false });
        if (error) {
          console.warn("Table controle_relatorios may not exist yet:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
  });

  // Fetch active patients list
  const { data: activePatients = [] } = useQuery({
    queryKey: ["active-patients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pacientes")
        .select("id, nome, cids_secundarios")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch responsibles list for auto-suggestion
  const { data: responsaveis = [] } = useQuery({
    queryKey: ["responsaveis-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responsaveis")
        .select("id, paciente_id, nome, parentesco");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all active professionals for assignment
  const { data: activeProfessionals = [] } = useQuery({
    queryKey: ["active-professionals-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id, nome, telefone, valores_config, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch patient-professional links
  const { data: pacienteProfissionais = [] } = useQuery({
    queryKey: ["paciente-profissional-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paciente_profissional")
        .select("paciente_id, profissional_id, profissionais(id, nome, telefone)");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all document types with fallback
  const { data: tiposDocumento = [] } = useQuery({
    queryKey: ["tipos-documento"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("tipos_documento")
          .select("*")
          .order("nome");
        if (error) {
          console.warn("Table tipos_documento may not exist yet:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
  });

  // Computed requests list with dynamic status calculation
  const computedRequests = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayParsed = parseISO(todayStr);

    return reportRequests.map((req: any) => {
      const dataLimite = parseISO(req.data_limite);
      const entregue = !!req.data_entrega;
      
      let status: "entregue" | "atrasado" | "pendente" = "pendente";
      let diasRestantes = 0;
      let diasAtraso = 0;

      if (entregue) {
        status = "entregue";
        const dataEntrega = parseISO(req.data_entrega);
        if (isAfter(dataEntrega, dataLimite)) {
          diasAtraso = differenceInDays(dataEntrega, dataLimite);
        }
      } else {
        if (isAfter(todayParsed, dataLimite)) {
          status = "atrasado";
          diasAtraso = differenceInDays(todayParsed, dataLimite);
        } else {
          status = "pendente";
          diasRestantes = differenceInDays(dataLimite, todayParsed);
        }
      }

      return {
        ...req,
        statusLabel: status,
        diasRestantes,
        diasAtraso,
      };
    });
  }, [reportRequests]);

  // General metrics calculations
  const stats = useMemo(() => {
    const total = agendamentos.length;
    const realizados = agendamentos.filter((a) => a.status === "realizado").length;
    const cancelados = agendamentos.filter((a) => a.status === "cancelado").length;
    const taxa = total > 0 ? Math.round((realizados / total) * 100) : 0;

    const porProfissional: Record<string, number> = {};
    agendamentos.forEach((a) => {
      const nome = a.profissional?.nome ?? "—";
      porProfissional[nome] = (porProfissional[nome] ?? 0) + 1;
    });
    const ranking = Object.entries(porProfissional).sort((a, b) => b[1] - a[1]);

    return { total, realizados, cancelados, taxa, ranking };
  }, [agendamentos]);

  // Report status stats summary
  const reportStats = useMemo(() => {
    const total = computedRequests.length;
    const entregues = computedRequests.filter((r) => r.statusLabel === "entregue").length;
    const atrasados = computedRequests.filter((r) => r.statusLabel === "atrasado").length;
    const pendentes = computedRequests.filter((r) => r.statusLabel === "pendente").length;
    return { total, entregues, atrasados, pendentes };
  }, [computedRequests]);

  // Filter and search logic
  const filteredRequests = useMemo(() => {
    return computedRequests.filter((req) => {
      const pacienteNome = req.paciente?.nome || "";
      const responsavelNome = req.responsavel_nome || "";
      const profissionalNome = req.profissional?.nome || "";
      const tipoNome = req.tipo_documento?.nome || "Relatório de Evolução";

      const matchesSearch =
        pacienteNome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        responsavelNome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        profissionalNome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tipoNome.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "todos" || req.statusLabel === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [computedRequests, searchQuery, statusFilter]);

  // Suggested elements
  const suggestedResponsibles = useMemo(() => {
    if (!formData.paciente_id) return [];
    return responsaveis.filter((r: any) => r.paciente_id === formData.paciente_id);
  }, [formData.paciente_id, responsaveis]);

  const suggestedProfessionals = useMemo(() => {
    if (!formData.paciente_id) return [];
    return pacienteProfissionais
      .filter((pp: any) => pp.paciente_id === formData.paciente_id)
      .map((pp: any) => pp.profissionais);
  }, [formData.paciente_id, pacienteProfissionais]);

  // Filter invoice requests within selected month
  const invoiceRequestsForSelectedMonth = useMemo(() => {
    return computedRequests.filter((req: any) => {
      const isInvoice = req.tipo_documento?.nome?.toLowerCase() === "nota fiscal";
      if (!isInvoice) return false;
      return req.data_solicitacao >= inicio && req.data_solicitacao <= fim;
    });
  }, [computedRequests, inicio, fim]);

  // Auto-fill CPF, Valor Total and Especialidades when paciente_id or data_solicitacao changes
  useEffect(() => {
    if (editingRequest) return; // Do not overwrite when editing an existing request
    if (!formData.paciente_id) return;

    const autoFillBillingInfo = async () => {
      try {
        // 1. Pre-fill CPF from pacientes table
        const { data: pacData, error: pacErr } = await supabase
          .from("pacientes")
          .select("cpf")
          .eq("id", formData.paciente_id)
          .single();

        if (pacErr) {
          console.error("Erro ao buscar dados do paciente:", pacErr);
        } else if (pacData) {
          setFormData((prev) => ({
            ...prev,
            responsavel_cpf: formatCPF(pacData.cpf || ""),
          }));
        }

        // 2. Pre-fill total value from faturas
        const d = parseISO(formData.data_solicitacao);
        const competencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

        const { data: faturaData, error: faturaErr } = await supabase
          .from("faturas")
          .select("valor")
          .eq("paciente_id", formData.paciente_id)
          .eq("competencia", competencia)
          .maybeSingle();

        let valorTotalPreFill = "";
        if (faturaErr) {
          console.error("Erro ao buscar fatura:", faturaErr);
        } else if (faturaData) {
          valorTotalPreFill = String(faturaData.valor || "");
        }

        // 3. Pre-fill unique specialties attended in the month
        const start = `${competencia}T00:00:00`;
        const end = `${format(endOfMonth(d), "yyyy-MM-dd")}T23:59:59`;

        const { data: sessions, error: sessionsErr } = await supabase
          .from("agendamentos")
          .select("servicos(nome), profissionais(especialidade)")
          .eq("paciente_id", formData.paciente_id)
          .gte("data_inicio", start)
          .lte("data_inicio", end)
          .in("status", ["realizado", "pago"]);

        let uniqueSpecs = "";
        if (sessionsErr) {
          console.error("Erro ao buscar especialidades atendidas:", sessionsErr);
        } else if (sessions) {
          const specsSet = new Set<string>();
          sessions.forEach((a: any) => {
            const spec = a.servicos?.nome || a.profissionais?.especialidade;
            if (spec) {
              spec.split(",").forEach((s: string) => {
                const trimmed = s.trim();
                if (trimmed) specsSet.add(trimmed);
              });
            }
          });
          uniqueSpecs = Array.from(specsSet).join(", ");
        }

        setFormData((prev) => ({
          ...prev,
          valor_total: valorTotalPreFill,
          especialidades: uniqueSpecs,
        }));
      } catch (err) {
        console.error("Erro no preenchimento automático:", err);
      }
    };

    autoFillBillingInfo();
  }, [formData.paciente_id, formData.data_solicitacao, editingRequest]);

  const getInvoicesTextSummary = () => {
    const dateStart = format(parseISO(inicio), "dd/MM/yyyy");
    const dateEnd = format(parseISO(fim), "dd/MM/yyyy");
    
    let text = `*Relatório de Solicitações de Notas Fiscais*\n`;
    text += `Período: ${dateStart} a ${dateEnd}\n`;
    text += `Total de solicitações no período: ${invoiceRequestsForSelectedMonth.length}\n\n`;
    
    if (invoiceRequestsForSelectedMonth.length === 0) {
      text += `Nenhum pedido de nota fiscal registrado neste período.`;
      return text;
    }

    invoiceRequestsForSelectedMonth.forEach((req: any, index: number) => {
      const paciente = req.paciente?.nome || "—";
      const responsavel = req.responsavel_nome || "—";
      const cpf = req.responsavel_cpf ? formatCPF(req.responsavel_cpf) : "—";
      const valorTotal = req.valor_total 
        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(req.valor_total))
        : "—";
      const especialidades = req.especialidades || "—";
      const dataSol = req.data_solicitacao ? format(parseISO(req.data_solicitacao), "dd/MM/yyyy") : "—";
      const obs = req.observacoes || "Nenhuma";
      
      text += `${index + 1}. *Paciente:* ${paciente}\n`;
      text += `   *Responsável:* ${responsavel} (CPF: ${cpf})\n`;
      text += `   *Valor Total das Sessões:* ${valorTotal}\n`;
      text += `   *Especialidades Atendidas:* ${especialidades}\n`;
      text += `   *Data Solicitação:* ${dataSol}\n`;
      text += `   *Observações:* ${obs}\n\n`;
    });
    
    return text;
  };

  const getAccountantWhatsAppLink = () => {
    const cleanNumber = accountantPhone.replace(/\D/g, "");
    const formattedNumber = cleanNumber.length <= 11 && !cleanNumber.startsWith("55") ? `55${cleanNumber}` : cleanNumber;
    const textSummary = getInvoicesTextSummary();
    return `https://wa.me/${formattedNumber}?text=${encodeURIComponent(textSummary)}`;
  };

  const handleCopyInvoicesSummary = () => {
    const summary = getInvoicesTextSummary();
    navigator.clipboard.writeText(summary);
    toast.success("Resumo copiado para a área de transferência!");
  };

  const exportInvoicesToCSV = () => {
    if (invoiceRequestsForSelectedMonth.length === 0) {
      toast.error("Nenhuma nota fiscal encontrada no período selecionado.");
      return;
    }
    
    const headers = [
      "Paciente",
      "Responsável Solicitante",
      "CPF do Responsável",
      "Valor Total das Sessões",
      "Especialidades Atendidas",
      "Profissional Responsável",
      "Data de Solicitação",
      "Prazo Limite",
      "Status",
      "Data de Entrega",
      "Observações"
    ];
    
    const rows = invoiceRequestsForSelectedMonth.map((req: any) => [
      req.paciente?.nome || "—",
      req.responsavel_nome || "—",
      req.responsavel_cpf ? formatCPF(req.responsavel_cpf) : "—",
      req.valor_total ? String(req.valor_total) : "—",
      req.especialidades || "—",
      req.profissional?.nome || "—",
      req.data_solicitacao || "—",
      req.data_limite || "—",
      req.statusLabel || "—",
      req.data_entrega || "—",
      req.observacoes || "—"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `solicitacoes_notas_fiscais_${inicio}_a_${fim}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exportado com sucesso!");
  };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        paciente_id: data.paciente_id,
        responsavel_nome: data.responsavel_nome,
        responsavel_cpf: data.responsavel_cpf ? data.responsavel_cpf.replace(/\D/g, "") : null,
        profissional_id: data.profissional_id === "none" || !data.profissional_id ? null : data.profissional_id,
        tipo_documento_id: data.tipo_documento_id || null,
        data_solicitacao: data.data_solicitacao,
        data_limite: data.data_limite,
        data_entrega: data.data_entrega || null,
        observacoes: data.observacoes || null,
        valor_total: data.valor_total ? Number(data.valor_total) : null,
        especialidades: data.especialidades || null,
      };

      if (data.id) {
        const { error } = await supabase
          .from("controle_relatorios")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("controle_relatorios")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Registro salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["controle-relatorios"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("controle_relatorios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["controle-relatorios"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir: " + err.message);
    },
  });

  const toggleDeliveryMutation = useMutation({
    mutationFn: async ({ id, dataEntrega }: { id: string; dataEntrega: string | null }) => {
      const { error } = await supabase
        .from("controle_relatorios")
        .update({ data_entrega: dataEntrega })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrega atualizada com sucesso!");
      qc.invalidateQueries({ queryKey: ["controle-relatorios"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar entrega: " + err.message);
    },
  });

  // Document Types CRUD Mutations
  const addTipoMutation = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("tipos_documento").insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo de documento adicionado com sucesso!");
      setNewTypeName("");
      qc.invalidateQueries({ queryKey: ["tipos-documento"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao adicionar tipo: " + err.message);
    },
  });

  const updateTipoMutation = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from("tipos_documento").update({ nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo de documento atualizado com sucesso!");
      setEditingTypeId("");
      setEditingTypeName("");
      qc.invalidateQueries({ queryKey: ["tipos-documento"] });
      qc.invalidateQueries({ queryKey: ["controle-relatorios"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar tipo: " + err.message);
    },
  });

  const deleteTipoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tipos_documento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo de documento excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["tipos-documento"] });
      qc.invalidateQueries({ queryKey: ["controle-relatorios"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir tipo: " + err.message);
    },
  });

  const resetForm = () => {
    setFormData({
      id: "",
      paciente_id: "",
      responsavel_nome: "",
      responsavel_cpf: "",
      profissional_id: "",
      tipo_documento_id: "",
      data_solicitacao: format(new Date(), "yyyy-MM-dd"),
      data_limite: format(addDays(new Date(), 10), "yyyy-MM-dd"),
      data_entrega: "",
      observacoes: "",
      valor_total: "",
      especialidades: "",
    });
    setEditingRequest(null);
  };

  const handleOpenNewDialog = () => {
    resetForm();
    const relEvolucao = tiposDocumento.find((t: any) => t.nome === "Relatório de Evolução");
    setFormData((prev) => ({
      ...prev,
      tipo_documento_id: relEvolucao?.id || tiposDocumento[0]?.id || "",
    }));
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (req: any) => {
    setEditingRequest(req);
    setFormData({
      id: req.id,
      paciente_id: req.paciente_id,
      responsavel_nome: req.responsavel_nome,
      responsavel_cpf: formatCPF(req.responsavel_cpf || ""),
      profissional_id: req.profissional_id || "",
      tipo_documento_id: req.tipo_documento_id || "",
      data_solicitacao: req.data_solicitacao,
      data_limite: req.data_limite,
      data_entrega: req.data_entrega || "",
      observacoes: req.observacoes || "",
      valor_total: req.valor_total ? String(req.valor_total) : "",
      especialidades: req.especialidades || "",
    });
    setDialogOpen(true);
  };

  const handleDataSolicitacaoChange = (val: string) => {
    try {
      const parsed = parseISO(val);
      const limit = addDays(parsed, 10);
      setFormData((prev) => ({
        ...prev,
        data_solicitacao: val,
        data_limite: format(limit, "yyyy-MM-dd"),
      }));
    } catch (err) {
      setFormData((prev) => ({ ...prev, data_solicitacao: val }));
    }
  };

  const handleDeleteRequest = (id: string, pacienteNome: string) => {
    if (confirm(`Tem certeza que deseja excluir o registro de ${pacienteNome}?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleQuickDeliver = (id: string) => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    toggleDeliveryMutation.mutate({ id, dataEntrega: todayStr });
  };

  const handleQuickUndoDeliver = (id: string) => {
    toggleDeliveryMutation.mutate({ id, dataEntrega: null });
  };

  const getWhatsAppReminderLink = (req: any) => {
    const profNome = req.profissional?.nome || "";
    const profTelefone = req.profissional?.telefone || "";
    if (!profTelefone) return "";

    const pacienteNome = req.paciente?.nome || "";
    const responsavelNome = req.responsavel_nome || "";
    const docTipo = req.tipo_documento?.nome || "documento";
    const dataLimite = req.data_limite
      ? format(parseISO(req.data_limite), "dd/MM/yyyy")
      : "";

    const mensagem = `Olá, ${profNome}! A família solicitou o ${docTipo} do(a) paciente ${pacienteNome} (solicitado por ${responsavelNome}). O prazo limite de entrega é o dia ${dataLimite}.`;

    const cleanNumber = profTelefone.replace(/\D/g, "");
    const formattedNumber = cleanNumber.length <= 11 && !cleanNumber.startsWith("55") ? `55${cleanNumber}` : cleanNumber;

    return `https://wa.me/${formattedNumber}?text=${encodeURIComponent(mensagem)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.paciente_id) {
      toast.error("Por favor, selecione um paciente.");
      return;
    }
    if (!formData.responsavel_nome.trim()) {
      toast.error("Por favor, informe o responsável solicitante.");
      return;
    }
    if (!formData.tipo_documento_id) {
      toast.error("Por favor, selecione um tipo de documento.");
      return;
    }
    saveMutation.mutate(formData);
  };

  // --- Módulo de Evolução AT ABA ---
  const [selectedAbaPacienteId, setSelectedAbaPacienteId] = useState("");
  const abaPatients = useMemo(() => {
    return activePatients.filter((p: any) => {
      const pacSpecs = Array.isArray(p.cids_secundarios)
        ? p.cids_secundarios.map((s: any) => String(s).trim().toLowerCase())
        : [];
      return pacSpecs.includes("at aba");
    });
  }, [activePatients]);
  const [abaInicio, setAbaInicio] = useState(() => {
    const d = addDays(new Date(), -180); // Default last 6 months
    return format(startOfMonth(d), "yyyy-MM-dd");
  });
  const [abaFim, setAbaFim] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedAbaProgram, setSelectedAbaProgram] = useState("");
  const [viewAbaOpen, setViewAbaOpen] = useState(false);
  const [viewAbaSession, setViewAbaSession] = useState<any>(null);

  // Query ABA sessions
  const { data: abaSessions = [], isLoading: isLoadingAba } = useQuery({
    queryKey: ["aba-sessions", selectedAbaPacienteId, abaInicio, abaFim],
    queryFn: async () => {
      if (!selectedAbaPacienteId) return [];
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, data_inicio, data_fim, status, profissional:profissionais(id, nome), plano_aba")
        .eq("paciente_id", selectedAbaPacienteId)
        .not("plano_aba", "is", null)
        .gte("data_inicio", `${abaInicio}T00:00:00`)
        .lte("data_inicio", `${abaFim}T23:59:59`)
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedAbaPacienteId,
  });

  // Calculate session-by-session stats for charts
  const chartData = useMemo(() => {
    return abaSessions.map((session: any) => {
      const plano = session.plano_aba as any;
      const programas = plano?.programas || [];
      let totRI = 0, totAP = 0, totAT = 0, totE = 0, totRespostas = 0;
      
      programas.forEach((prog: any) => {
        const tCount = prog.tentativas_prog || 12;
        for (let i = 1; i <= tCount; i++) {
          const res = prog.respostas?.[i] || "";
          if (res === "RI") totRI++;
          else if (res === "AP") totAP++;
          else if (res === "AT") totAT++;
          else if (res === "E") totE++;
          
          if (["RI", "AP", "AT", "E"].includes(res)) {
            totRespostas++;
          }
        }
      });

      const pctRI = totRespostas > 0 ? Math.round((totRI / totRespostas) * 100) : 0;
      const pctAP = totRespostas > 0 ? Math.round((totAP / totRespostas) * 100) : 0;
      const pctAT = totRespostas > 0 ? Math.round((totAT / totRespostas) * 100) : 0;
      const pctE = totRespostas > 0 ? Math.round((totE / totRespostas) * 100) : 0;

      return {
        id: session.id,
        dataCompleta: format(parseISO(session.data_inicio), "dd/MM/yyyy HH:mm"),
        dataLabel: format(parseISO(session.data_inicio), "dd/MM"),
        profissional: session.profissional?.nome || "—",
        supervisor: plano?.supervisor_nome || "—",
        totRI,
        totAP,
        totAT,
        totE,
        totRespostas,
        pctRI,
        pctAP,
        pctAT,
        pctE,
        plano,
      };
    });
  }, [abaSessions]);

  const tableSessions = useMemo(() => {
    return [...chartData].reverse();
  }, [chartData]);

  const abaMetrics = useMemo(() => {
    if (chartData.length === 0) return { avgRI: 0 };
    const sumRI = chartData.reduce((acc, curr) => acc + curr.pctRI, 0);
    return {
      avgRI: Math.round(sumRI / chartData.length),
    };
  }, [chartData]);

  // Extract unique programs list
  const uniquePrograms = useMemo(() => {
    const names = new Set<string>();
    abaSessions.forEach((session: any) => {
      const programs = session.plano_aba?.programas || [];
      programs.forEach((p: any) => {
        if (p.nome) names.add(p.nome);
      });
    });
    return Array.from(names).sort();
  }, [abaSessions]);

  // Handle program-specific chart selection
  useEffect(() => {
    if (uniquePrograms.length > 0 && !uniquePrograms.includes(selectedAbaProgram)) {
      setSelectedAbaProgram(uniquePrograms[0]);
    }
  }, [uniquePrograms, selectedAbaProgram]);

  const programChartData = useMemo(() => {
    if (!selectedAbaProgram) return [];
    
    return chartData.map((session: any) => {
      const prog = (session.plano?.programas || []).find((p: any) => p.nome === selectedAbaProgram);
      if (!prog) return null;
      
      let totRI = 0, totAP = 0, totAT = 0, totE = 0, totRespostas = 0;
      const tCount = prog.tentativas_prog || 12;
      for (let i = 1; i <= tCount; i++) {
        const res = prog.respostas?.[i] || "";
        if (res === "RI") totRI++;
        else if (res === "AP") totAP++;
        else if (res === "AT") totAT++;
        else if (res === "E") totE++;
        
        if (["RI", "AP", "AT", "E"].includes(res)) {
          totRespostas++;
        }
      }
      
      const pctRI = totRespostas > 0 ? Math.round((totRI / totRespostas) * 100) : 0;
      
      return {
        dataLabel: session.dataLabel,
        dataCompleta: session.dataCompleta.split(' ')[0],
        pctRI,
        totRI,
        totRespostas,
      };
    }).filter(Boolean);
  }, [chartData, selectedAbaProgram]);

  // Export individual session data as CSV
  const downloadSessionCSV = (session: any) => {
    const plano = session.plano;
    if (!plano) return;
    
    const headers = [
      "N.o",
      "Programa",
      "Descricao",
      "Tentativas Programadas",
      ...Array.from({ length: plano.tentativas_max || 19 }, (_, i) => `T${i + 1}`),
      "Total RI",
      "Total AP",
      "Total AT",
      "Total E"
    ];
    
    const metaRows = [
      ["Paciente", activePatients.find((p: any) => p.id === selectedAbaPacienteId)?.nome || ""],
      ["Terapeuta", session.profissional],
      ["Supervisor ABA", session.supervisor],
      ["Data/Hora", session.dataCompleta],
      ["Tentativas Maximas", String(plano.tentativas_max || 19)],
      ["Preferencias", (plano.avaliacoes_preferencia || []).join(" | ")],
      ["Observacoes Medicas", plano.observacoes_medica || ""],
      []
    ];

    const programRows = (plano.programas || []).map((prog: any, idx: number) => {
      const row = [
        String(idx + 1),
        prog.nome || "",
        prog.descricao || "",
        String(prog.tentativas_prog || 12)
      ];
      
      let totRI = 0, totAP = 0, totAT = 0, totE = 0;
      for (let i = 1; i <= (plano.tentativas_max || 19); i++) {
        const res = prog.respostas?.[i] || "";
        row.push(res);
        
        if (i <= (prog.tentativas_prog || 12)) {
          if (res === "RI") totRI++;
          else if (res === "AP") totAP++;
          else if (res === "AT") totAT++;
          else if (res === "E") totE++;
        }
      }
      
      row.push(String(totRI), String(totAP), String(totAT), String(totE));
      return row;
    });

    const csvContent = [
      ...metaRows.map((r: string[]) => r.map((val: string) => `"${val.replace(/"/g, '""')}"`).join(",")),
      headers.join(","),
      ...programRows.map((r: string[]) => r.map((val: string) => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const pacNome = activePatients.find((p: any) => p.id === selectedAbaPacienteId)?.nome || "paciente";
    const dataCompacta = session.dataCompleta.split(' ')[0].replace(/\//g, "-");
    link.setAttribute("download", `sessao_aba_${pacNome.replace(/\s+/g, "_")}_${dataCompacta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sessão baixada com sucesso!");
  };

  const handlePrintConsolidated = () => {
    if (chartData.length === 0) {
      toast.error("Nenhuma sessão disponível para exportar.");
      return;
    }
    
    const pacNome = activePatients.find((p: any) => p.id === selectedAbaPacienteId)?.nome || "";
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Por favor, permita pop-ups para imprimir.");
      return;
    }
    
    const sortedData = [...chartData].sort((a: any, b: any) => a.dataCompleta.localeCompare(b.dataCompleta));
    
    const tableRowsHtml = sortedData.map((session: any, idx: number) => {
      return `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; font-family: monospace;">${session.dataCompleta.split(' ')[0]}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px;">${session.profissional}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px;">${session.supervisor}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; color: #059669;">${session.pctRI}%</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #d97706;">${session.pctAP}%</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #dc2626;">${session.pctAT}%</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #4f46e5;">${session.pctE}%</td>
        </tr>
      `;
    }).join("");

    const avgRI = abaMetrics.avgRI;
    const avgAP = chartData.length > 0 ? Math.round(chartData.reduce((acc, curr) => acc + curr.pctAP, 0) / chartData.length) : 0;
    const avgAT = chartData.length > 0 ? Math.round(chartData.reduce((acc, curr) => acc + curr.pctAT, 0) / chartData.length) : 0;
    const avgE = chartData.length > 0 ? Math.round(chartData.reduce((acc, curr) => acc + curr.pctE, 0) / chartData.length) : 0;

    const programsSummaryHtml = uniquePrograms.map((progName: string) => {
      const progScores = sortedData.map((session: any) => {
        const prog = (session.plano?.programas || []).find((p: any) => p.nome === progName);
        if (!prog) return null;
        let totRI = 0, totRespostas = 0;
        const tCount = prog.tentativas_prog || 12;
        for (let i = 1; i <= tCount; i++) {
          const res = prog.respostas?.[i] || "";
          if (res === "RI") totRI++;
          if (["RI", "AP", "AT", "E"].includes(res)) totRespostas++;
        }
        return totRespostas > 0 ? Math.round((totRI / totRespostas) * 100) : 0;
      }).filter(v => v !== null) as number[];

      const initialScore = progScores.length > 0 ? `${progScores[0]}%` : "—";
      const finalScore = progScores.length > 0 ? `${progScores[progScores.length - 1]}%` : "—";

      return `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${progName}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${initialScore}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; color: #4f46e5;">${finalScore}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; color: #059669;">
            ${progScores.length > 1 ? (progScores[progScores.length - 1] >= progScores[0] ? "📈 Melhora" : "📉 Estável/Oscilando") : "—"}
          </td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Relatório de Evolução Consolidada ABA - ${pacNome}</title>
        <style>
          body { font-family: sans-serif; margin: 30px; color: #1e293b; }
          h1 { font-size: 22px; font-weight: bold; color: #4f46e5; margin-bottom: 5px; }
          .header-title { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-top: 20px; margin-bottom: 25px; font-size: 13px; }
          .meta-item { border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
          .meta-label { font-weight: bold; color: #64748b; font-size: 11px; text-transform: uppercase; }
          .meta-value { font-weight: 500; font-size: 13px; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-weight: bold; font-size: 11px; color: #475569; }
          td { border: 1px solid #cbd5e1; padding: 8px; }
          .section-title { font-size: 15px; font-weight: bold; color: #334155; margin-top: 30px; margin-bottom: 10px; border-left: 4px solid #4f46e5; padding-left: 8px; }
          .totals-summary { display: flex; gap: 20px; margin-top: 20px; margin-bottom: 20px; }
          .tot-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; }
          .tot-val { font-size: 18px; font-weight: bold; margin-top: 5px; }
          @media print {
            body { margin: 15px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header-title">
          <div>
            <h1>Relatório Clínico de Evolução Consolidada</h1>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Espaço Multi — Intervenção Comportamental (ABA)</div>
          </div>
          <button onclick="window.print()" style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Salvar como PDF</button>
        </div>
        
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value" style="font-size: 15px; font-weight: bold;">${pacNome}</div></div>
          <div class="meta-item"><div class="meta-label">Período de Análise</div><div class="meta-value">${abaInicio.split('-').reverse().join('/')} a ${abaFim.split('-').reverse().join('/')}</div></div>
          <div class="meta-item"><div class="meta-label">Total de Sessões Registradas</div><div class="meta-value">${chartData.length} sessões</div></div>
          <div class="meta-item"><div class="meta-label">Média Geral de Acertos Independentes (RI)</div><div class="meta-value" style="color: #047857; font-weight: bold;">${avgRI}%</div></div>
        </div>

        <div class="section-title">Resumo de Desempenho Clínico Geral</div>
        <div class="totals-summary">
          <div class="tot-card" style="background-color: #ecfdf5; border-color: #a7f3d0;"><div class="meta-label" style="color: #065f46;">Independente (RI)</div><div class="tot-val" style="color: #047857;">${avgRI}%</div></div>
          <div class="tot-card" style="background-color: #fffbeb; border-color: #fde68a;"><div class="meta-label" style="color: #92400e;">Ajuda Parcial (AP)</div><div class="tot-val" style="color: #b45309;">${avgAP}%</div></div>
          <div class="tot-card" style="background-color: #fef2f2; border-color: #fecaca;"><div class="meta-label" style="color: #991b1b;">Ajuda Total (AT)</div><div class="tot-val" style="color: #b91c1c;">${avgAT}%</div></div>
          <div class="tot-card" style="background-color: #f5f3ff; border-color: #ddd6fe;"><div class="meta-label" style="color: #3730a3;">Ecoico (E)</div><div class="tot-val" style="color: #4f46e5;">${avgE}%</div></div>
        </div>

        <div class="section-title">Evolução por Habilidade / Programa</div>
        <table>
          <thead>
            <tr>
              <th>Programa</th>
              <th style="width: 120px; text-align: center;">Nível Inicial (% RI)</th>
              <th style="width: 120px; text-align: center;">Nível Atual (% RI)</th>
              <th style="width: 150px; text-align: center;">Status de Evolução</th>
            </tr>
          </thead>
          <tbody>
            ${programsSummaryHtml}
          </tbody>
        </table>

        <div class="section-title">Histórico Detalhado de Sessões</div>
        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Nº</th>
              <th style="width: 90px;">Data</th>
              <th>Terapeuta</th>
              <th>Supervisor ABA</th>
              <th style="width: 60px; text-align: center;">% RI</th>
              <th style="width: 60px; text-align: center;">% AP</th>
              <th style="width: 60px; text-align: center;">% AT</th>
              <th style="width: 60px; text-align: center;">% E</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintSession = (session: any) => {
    const plano = session.plano;
    if (!plano) return;
    const pacNome = activePatients.find((p: any) => p.id === selectedAbaPacienteId)?.nome || "";
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Por favor, permita pop-ups para imprimir.");
      return;
    }
    
    let grandRI = 0, grandAP = 0, grandAT = 0, grandE = 0, grandRespostas = 0;
    const tableRowsHtml = (plano.programas || []).map((prog: any, idx: number) => {
      let totRI = 0, totAP = 0, totAT = 0, totE = 0;
      const trialsHtml = Array.from({ length: plano.tentativas_max || 19 }).map((_, i) => {
        const tNum = i + 1;
        const isEnabled = tNum <= (prog.tentativas_prog || 12);
        const res = prog.respostas?.[tNum] || "";
        
        if (isEnabled) {
          if (res === "RI") { totRI++; grandRI++; grandRespostas++; }
          else if (res === "AP") { totAP++; grandAP++; grandRespostas++; }
          else if (res === "AT") { totAT++; grandAT++; grandRespostas++; }
          else if (res === "E") { totE++; grandE++; grandRespostas++; }
        }
        
        let cellStyle = "color: #94a3b8; font-weight: normal;";
        if (!isEnabled) cellStyle = "background-color: #f1f5f9; color: transparent;";
        else if (res === "RI") cellStyle = "background-color: #d1fae5; color: #065f46; font-weight: bold;";
        else if (res === "AP") cellStyle = "background-color: #fef3c7; color: #92400e; font-weight: bold;";
        else if (res === "AT") cellStyle = "background-color: #fee2e2; color: #991b1b; font-weight: bold;";
        else if (res === "E") cellStyle = "background-color: #e0e7ff; color: #3730a3; font-weight: bold;";
        
        return `<td style="text-align: center; font-size: 10px; border: 1px solid #cbd5e1; width: 22px; height: 22px; ${cellStyle}">${isEnabled ? (res || "-") : ""}</td>`;
      }).join("");
      
      return `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 4px; font-weight: bold; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; font-weight: bold;">${prog.nome || ""}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 11px; color: #475569;">${prog.descricao || ""}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center;">${prog.tentativas_prog || 12}</td>
          ${trialsHtml}
          <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: bold; background-color: #ecfdf5;">${totRI}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: bold; background-color: #fffbeb;">${totAP}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: bold; background-color: #fef2f2;">${totAT}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: bold; background-color: #f5f3ff;">${totE}</td>
        </tr>
      `;
    }).join("");

    const pctRI = grandRespostas > 0 ? Math.round((grandRI / grandRespostas) * 100) : 0;
    const pctAP = grandRespostas > 0 ? Math.round((grandAP / grandRespostas) * 100) : 0;
    const pctAT = grandRespostas > 0 ? Math.round((grandAT / grandRespostas) * 100) : 0;
    const pctE = grandRespostas > 0 ? Math.round((grandE / grandRespostas) * 100) : 0;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Plano de Intervenção ABA - ${pacNome} - ${session.dataCompleta.split(' ')[0]}</title>
        <style>
          body { font-family: sans-serif; margin: 30px; color: #1e293b; }
          h1 { font-size: 20px; font-weight: bold; color: #4f46e5; margin-bottom: 5px; }
          .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-top: 20px; margin-bottom: 20px; font-size: 13px; }
          .meta-item { border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
          .meta-label { font-weight: bold; color: #64748b; font-size: 11px; text-transform: uppercase; }
          .meta-value { font-weight: 500; font-size: 13px; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 6px; text-align: left; font-weight: bold; font-size: 11px; color: #475569; }
          td { border: 1px solid #cbd5e1; padding: 6px; }
          .totals-summary { display: flex; gap: 20px; margin-top: 20px; border-top: 2px solid #e2e8f0; padding-top: 15px; }
          .tot-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; }
          .tot-val { font-size: 18px; font-weight: bold; margin-top: 5px; }
          @media print {
            body { margin: 15px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h1>Folha de Registro de Sessão — Plano ABA</h1>
          <button onclick="window.print()" style="padding: 6px 12px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Imprimir Relatório</button>
        </div>
        <div style="font-size: 12px; color: #64748b;">Relatório Gerencial de Desempenho Clínico</div>
        
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value">${pacNome}</div></div>
          <div class="meta-item"><div class="meta-label">Terapeuta Responsável</div><div class="meta-value">${session.profissional}</div></div>
          <div class="meta-item"><div class="meta-label">Supervisor ABA</div><div class="meta-value">${session.supervisor}</div></div>
          <div class="meta-item"><div class="meta-label">Data da Sessão</div><div class="meta-value">${session.dataCompleta}</div></div>
          <div class="meta-item" style="grid-column: span 2;"><div class="meta-label">Itens/Atividades de Preferência</div><div class="meta-value">${(plano.avaliacoes_preferencia || []).join(", ") || "Nenhum cadastrado"}</div></div>
          <div class="meta-item" style="grid-column: span 2;"><div class="meta-label">Observações Médicas / Medicamentos</div><div class="meta-value" style="font-style: italic;">${plano.observacoes_medica || "Nenhuma"}</div></div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Nº</th>
              <th>Programa</th>
              <th>Descrição</th>
              <th style="width: 50px; text-align: center;">Tents</th>
              ${Array.from({ length: plano.tentativas_max || 19 }).map((_, i) => `<th style="text-align: center; width: 22px;">${i + 1}</th>`).join("")}
              <th style="width: 30px; text-align: center;">RI</th>
              <th style="width: 30px; text-align: center;">AP</th>
              <th style="width: 30px; text-align: center;">AT</th>
              <th style="width: 30px; text-align: center;">E</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        
        <div class="totals-summary">
          <div class="tot-card" style="background-color: #ecfdf5; border-color: #a7f3d0;"><div class="meta-label" style="color: #065f46;">Resposta Independente (RI)</div><div class="tot-val" style="color: #047857;">${grandRI} (${pctRI}%)</div></div>
          <div class="tot-card" style="background-color: #fffbeb; border-color: #fde68a;"><div class="meta-label" style="color: #92400e;">Ajuda Parcial (AP)</div><div class="tot-val" style="color: #b45309;">${grandAP} (${pctAP}%)</div></div>
          <div class="tot-card" style="background-color: #fef2f2; border-color: #fecaca;"><div class="meta-label" style="color: #991b1b;">Ajuda Total (AT)</div><div class="tot-val" style="color: #b91c1c;">${grandAT} (${pctAT}%)</div></div>
          <div class="tot-card" style="background-color: #f5f3ff; border-color: #ddd6fe;"><div class="meta-label" style="color: #3730a3;">Ecoico (E)</div><div class="tot-val" style="color: #4f46e5;">${grandE} (${pctE}%)</div></div>
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="metricas" className="gap-2">
            <TrendingUp className="h-4 w-4" /> Métricas de Atendimento
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-2">
            <FileText className="h-4 w-4" /> Entrega de Relatórios
          </TabsTrigger>
          <TabsTrigger value="aba-evolucao" className="gap-2">
            <Activity className="h-4 w-4" /> Evolução AT ABA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metricas" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fim</Label>
                <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RelatorioStat icon={Calendar} label="Agendamentos" value={String(stats.total)} />
            <RelatorioStat
              icon={CheckCircle2}
              label="Realizados"
              value={`${stats.realizados} (${stats.taxa}%)`}
            />
            <RelatorioStat icon={Users} label="Pacientes ativos" value={String(pacientesAtivos)} />
          </div>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Agendamentos por profissional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.ranking.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                )}
                {stats.ranking.map(([nome, qtd]) => {
                  const max = stats.ranking[0]?.[1] ?? 1;
                  const pct = (qtd / max) * 100;
                  return (
                    <div key={nome}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{nome}</span>
                        <span className="text-muted-foreground">{qtd}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RelatorioStat icon={FileText} label="Total de Solicitações" value={String(reportStats.total)} />
            <RelatorioStat
              icon={Clock}
              label="Pendentes (No Prazo)"
              value={String(reportStats.pendentes)}
              variant="default"
            />
            <RelatorioStat
              icon={AlertTriangle}
              label="Atrasados"
              value={String(reportStats.atrasados)}
              variant={reportStats.atrasados > 0 ? "destructive" : "default"}
            />
            <RelatorioStat
              icon={CheckCircle2}
              label="Entregues"
              value={String(reportStats.entregues)}
              variant="success"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 max-w-2xl">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar paciente, responsável, tipo ou profissional…"
                  className="pl-9"
                />
              </div>

              <div className="w-[180px]">
                <Select
                  value={statusFilter}
                  onValueChange={(val: any) => setStatusFilter(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={() => setAccountantDialogOpen(true)} variant="outline" className="gap-1.5 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600/20 dark:text-emerald-400 dark:hover:bg-emerald-950/20">
                <FileText className="h-4 w-4" /> Enviar para Contador
              </Button>
              <Button onClick={handleOpenNewDialog} className="gap-1.5">
                <Plus className="h-4 w-4" /> Registrar Solicitação
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Responsável Solicitante</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Data Solicitação</TableHead>
                      <TableHead>Prazo Limite</TableHead>
                      <TableHead>Status / Tempo</TableHead>
                      <TableHead>Data Entrega</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          Nenhum registro encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRequests.map((req) => {
                        const pacienteNome = req.paciente?.nome || "—";
                        const profNome = req.profissional?.nome || "Não atribuído";
                        const docTipo = req.tipo_documento?.nome || "Relatório de Evolução";
                        const hasPhone = !!req.profissional?.telefone;
                        
                        return (
                          <TableRow key={req.id} className="group">
                            <TableCell className="font-medium">{pacienteNome}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal border-primary/20 bg-primary/5 text-primary text-[11px] px-2 py-0.5 whitespace-nowrap">
                                {docTipo}
                              </Badge>
                            </TableCell>
                            <TableCell>{req.responsavel_nome}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="truncate max-w-[120px]" title={profNome}>{profNome}</span>
                                {hasPhone && req.statusLabel !== "entregue" && (
                                  <a
                                    href={getWhatsAppReminderLink(req)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors"
                                    title={`Lembrar ${profNome} no WhatsApp`}
                                  >
                                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.46h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                    </svg>
                                  </a>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {req.data_solicitacao
                                ? format(parseISO(req.data_solicitacao), "dd/MM/yyyy")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {req.data_limite
                                ? format(parseISO(req.data_limite), "dd/MM/yyyy")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {req.statusLabel === "entregue" ? (
                                <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1 text-white border-0">
                                  <Check className="h-3 w-3" /> Entregue
                                </Badge>
                              ) : req.statusLabel === "atrasado" ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Atrasado ({req.diasAtraso}d)
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100/80 gap-1 dark:bg-amber-950/40 dark:text-amber-300 border-0">
                                  <Clock className="h-3 w-3" /> {req.diasRestantes === 0 ? "Hoje!" : `${req.diasRestantes}d restantes`}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {req.data_entrega
                                ? format(parseISO(req.data_entrega), "dd/MM/yyyy")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-1 opacity-90 group-hover:opacity-100">
                                {req.data_entrega ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    title="Desmarcar como Entregue"
                                    onClick={() => handleQuickUndoDeliver(req.id)}
                                    disabled={toggleDeliveryMutation.isPending}
                                  >
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                    title="Marcar como Entregue hoje"
                                    onClick={() => handleQuickDeliver(req.id)}
                                    disabled={toggleDeliveryMutation.isPending}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                                
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Editar registro"
                                  onClick={() => handleOpenEditDialog(req)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  title="Excluir registro"
                                  onClick={() => handleDeleteRequest(req.id, pacienteNome)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aba-evolucao" className="mt-4 space-y-6">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 p-4">
              <div className="space-y-1.5 flex-1 min-w-[240px]">
                <Label>Paciente</Label>
                <Select
                  value={selectedAbaPacienteId}
                  onValueChange={setSelectedAbaPacienteId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o paciente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {abaPatients.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 w-[140px]">
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={abaInicio}
                  onChange={(e) => setAbaInicio(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 w-[140px]">
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={abaFim}
                  onChange={(e) => setAbaFim(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handlePrintConsolidated}
                  disabled={!selectedAbaPacienteId || chartData.length === 0}
                  className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                >
                  <Printer className="h-4 w-4" /> Gerar PDF da Evolução
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Conditional rendering when patient is selected */}
          {selectedAbaPacienteId ? (
            <>
              {isLoadingAba ? (
                <div className="p-8 text-center text-muted-foreground">
                  Carregando sessões ABA...
                </div>
              ) : chartData.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                    <Activity className="h-12 w-12 text-slate-400 mb-2" />
                    <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhuma sessão registrada</p>
                    <p className="text-xs max-w-sm mt-1">Não encontramos sessões de Plano ABA para este paciente no período selecionado.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Summary Metrics */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <RelatorioStat
                      icon={Activity}
                      label="Sessões ABA no Período"
                      value={String(chartData.length)}
                    />
                    <RelatorioStat
                      icon={TrendingUp}
                      label="Desempenho Médio (Respostas Independentes - RI)"
                      value={`${abaMetrics.avgRI}%`}
                      variant="success"
                    />
                    <RelatorioStat
                      icon={Calendar}
                      label="Último Atendimento"
                      value={tableSessions[0]?.dataCompleta.split(' ')[0] || "—"}
                    />
                  </div>

                  {/* Graphs Panel */}
                  <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                    
                    {/* Graph 1: Overall Evolution */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Evolução Geral (% de Respostas)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="dataLabel" tickMargin={8} />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <RechartsTooltip formatter={(v: any) => [`${v}%`]} />
                            <RechartsLegend verticalAlign="top" height={36} />
                            <Line
                              type="monotone"
                              dataKey="pctRI"
                              name="Independente (RI)"
                              stroke="#10b981"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="pctAP"
                              name="Ajuda Parcial (AP)"
                              stroke="#f59e0b"
                              strokeWidth={1.5}
                              dot={{ r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="pctAT"
                              name="Ajuda Total (AT)"
                              stroke="#ef4444"
                              strokeWidth={1.5}
                              dot={{ r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="pctE"
                              name="Ecoico (E)"
                              stroke="#6366f1"
                              strokeWidth={1.5}
                              dot={{ r: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Graph 2: Program Specific Evolution */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                          <Activity className="h-4 w-4 text-purple-600 animate-pulse" />
                          Evolução por Programa Específico
                        </CardTitle>
                        <div className="w-[180px]">
                          <Select
                            value={selectedAbaProgram}
                            onValueChange={setSelectedAbaProgram}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecione o programa" />
                            </SelectTrigger>
                            <SelectContent>
                              {uniquePrograms.map((name) => (
                                <SelectItem key={name} value={name} className="text-xs">
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardHeader>
                      <CardContent className="h-[280px]">
                        {selectedAbaProgram ? (
                          programChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={programChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dataLabel" tickMargin={8} />
                                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                <RechartsTooltip formatter={(v: any, name: any, props: any) => {
                                  if (name === "pctRI") {
                                    return [`${v}% (${props.payload.totRI}/${props.payload.totRespostas} tents)`, "Acertos Independentes"];
                                  }
                                  return [v, name];
                                }} />
                                <Line
                                  type="monotone"
                                  dataKey="pctRI"
                                  name="Acertos Independentes"
                                  stroke="#8b5cf6"
                                  strokeWidth={3}
                                  dot={{ r: 4 }}
                                  activeDot={{ r: 6 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                              Sem dados de tentativas registradas para este programa.
                            </div>
                          )
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                            Nenhum programa selecionado.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                  </div>

                  {/* Sessions List */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Histórico de Registros de Sessões ABA</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data / Hora</TableHead>
                              <TableHead>Terapeuta</TableHead>
                              <TableHead>Supervisor ABA</TableHead>
                              <TableHead className="text-center">Respostas Realizadas</TableHead>
                              <TableHead className="text-center">Desempenho (% RI)</TableHead>
                              <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableSessions.map((session) => (
                              <TableRow key={session.id} className="group">
                                <TableCell className="font-semibold">{session.dataCompleta}</TableCell>
                                <TableCell>{session.profissional}</TableCell>
                                <TableCell>{session.supervisor}</TableCell>
                                <TableCell className="text-center font-mono">{session.totRespostas}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className={cn("border-0 text-white font-bold", 
                                    session.pctRI >= 80 ? "bg-emerald-500 hover:bg-emerald-600" :
                                    session.pctRI >= 50 ? "bg-amber-500 hover:bg-amber-600" :
                                    "bg-rose-500 hover:bg-rose-600"
                                  )}>
                                    {session.pctRI}% RI
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end items-center gap-2 opacity-90 group-hover:opacity-100">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-2.5 text-xs font-semibold gap-1.5"
                                      title="Visualizar Sessão"
                                      onClick={() => {
                                        setViewAbaSession(session);
                                        setViewAbaOpen(true);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" /> Visualizar
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-8 px-2.5 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                                      title="Salvar como PDF / Imprimir"
                                      onClick={() => handlePrintSession(session)}
                                    >
                                      <Printer className="h-3.5 w-3.5" /> Gerar PDF
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                <Users className="h-12 w-12 text-slate-400 mb-3" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">Selecione um Paciente</p>
                <p className="text-xs max-w-sm mt-1">Escolha um paciente na caixa de seleção acima para carregar o histórico de sessões, gráficos de melhora e relatórios evolutivos.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog for viewing read-only Plano ABA session details */}
      <Dialog open={viewAbaOpen} onOpenChange={setViewAbaOpen}>
        <DialogContent className="w-full max-w-full sm:max-w-[95vw] sm:w-[1400px] max-h-[92vh] flex flex-col p-6 border rounded-xl bg-background overflow-hidden">
          {viewAbaSession && (
            <>
              <DialogHeader className="border-b pb-3 flex flex-row items-center justify-between">
                <div>
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-600" />
                    Plano ABA — Detalhamento da Sessão
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Visualização em modo de leitura dos dados gravados na sessão.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold gap-1.5 text-indigo-600 hover:text-indigo-700 border-indigo-200"
                    onClick={() => handlePrintSession(viewAbaSession)}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Gerar PDF / Imprimir
                  </Button>
                </div>
              </DialogHeader>

              <div className="flex-1 grid grid-cols-1 xl:grid-cols-4 gap-6 py-3 overflow-y-auto min-h-0">
                {/* Spreadsheet Table (3 columns) */}
                <div className="xl:col-span-3 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl border p-4 space-y-3">
                  <div className="border rounded-lg overflow-auto bg-white dark:bg-slate-950 shadow-sm relative flex-1 min-h-[300px]">
                    <table className="w-full text-left border-collapse table-fixed">
                      <thead>
                        <tr className="bg-slate-100/80 dark:bg-slate-900 border-b text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-20">
                          <th className="w-10 p-1 text-center sticky left-0 bg-slate-100 dark:bg-slate-900 border-r z-30">Nº</th>
                          <th className="w-[180px] md:w-[240px] p-1 sticky left-10 bg-slate-100 dark:bg-slate-900 border-r z-30">Programas</th>
                          <th className="w-[120px] md:w-[160px] p-2 text-center border-r">Descrição</th>
                          <th className="w-[50px] md:w-[60px] p-2 text-center border-r">Tents</th>
                          
                          {Array.from({ length: viewAbaSession.plano?.tentativas_max || 19 }).map((_, i) => (
                            <th key={i} className="w-8 p-1 text-center font-mono border-r">
                              {i + 1}
                            </th>
                          ))}
                          
                          <th className="w-10 p-1 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 border-r">RI</th>
                          <th className="w-10 p-1 text-center bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 border-r">AP</th>
                          <th className="w-10 p-1 text-center bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 border-r">AT</th>
                          <th className="w-10 p-1 text-center bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700">E</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-xs">
                        {(viewAbaSession.plano?.programas || []).map((prog: any, index: number) => {
                          let ri = 0, ap = 0, at = 0, e = 0;
                          
                          return (
                            <tr key={prog.id || index} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                              <td className="p-1 text-center font-semibold font-mono border-r bg-white dark:bg-slate-950 sticky left-0 z-10 text-[10px]">
                                {index + 1}
                              </td>
                              <td className="p-2 border-r bg-white dark:bg-slate-950 sticky left-10 z-10 font-medium truncate max-w-[200px]" title={prog.nome}>
                                {prog.nome}
                              </td>
                              <td className="p-2 border-r text-slate-500 truncate max-w-[150px]" title={prog.descricao}>
                                {prog.descricao || "—"}
                              </td>
                              <td className="p-1.5 border-r text-center font-mono text-slate-600">
                                {prog.tentativas_prog || 12}
                              </td>
                              
                              {Array.from({ length: viewAbaSession.plano?.tentativas_max || 19 }).map((_, i) => {
                                const trialNum = i + 1;
                                const isDisabled = trialNum > (prog.tentativas_prog || 12);
                                const res = prog.respostas?.[trialNum] || "";
                                
                                if (!isDisabled) {
                                  if (res === "RI") ri++;
                                  else if (res === "AP") ap++;
                                  else if (res === "AT") at++;
                                  else if (res === "E") e++;
                                }

                                let cellClass = "text-slate-300";
                                let cellContent = "-";
                                
                                if (isDisabled) {
                                  cellContent = "";
                                  cellClass = "bg-slate-100/50 dark:bg-slate-900/40 cursor-not-allowed";
                                } else if (res === "RI") {
                                  cellContent = "RI";
                                  cellClass = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold";
                                } else if (res === "AP") {
                                  cellContent = "AP";
                                  cellClass = "bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold";
                                } else if (res === "AT") {
                                  cellContent = "AT";
                                  cellClass = "bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold";
                                } else if (res === "E") {
                                  cellContent = "E";
                                  cellClass = "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 font-bold";
                                }

                                return (
                                  <td key={i} className={cn("p-0.5 border-r text-center font-mono text-[10px]", cellClass)}>
                                    {cellContent}
                                  </td>
                                );
                              })}
                              
                              <td className="p-1 border-r text-center font-bold bg-emerald-50/10 text-emerald-600 font-mono">{ri}</td>
                              <td className="p-1 border-r text-center font-bold bg-amber-50/10 text-amber-600 font-mono">{ap}</td>
                              <td className="p-1 border-r text-center font-bold bg-rose-50/10 text-rose-600 font-mono">{at}</td>
                              <td className="p-1 text-center font-bold bg-indigo-50/10 text-indigo-600 font-mono">{e}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sidebar details (1 column) */}
                <div className="flex flex-col gap-4 overflow-y-auto pr-1 min-h-0">
                  <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1.5">
                      Ficha da Sessão
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-semibold block text-slate-500">Paciente:</span>
                        <span className="font-bold text-sm text-foreground">
                          {activePatients.find((p: any) => p.id === selectedAbaPacienteId)?.nome || ""}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold block text-slate-500">Terapeuta:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{viewAbaSession.profissional}</span>
                      </div>
                      <div>
                        <span className="font-semibold block text-slate-500">Supervisor ABA:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{viewAbaSession.supervisor}</span>
                      </div>
                      <div>
                        <span className="font-semibold block text-slate-500">Data e Hora:</span>
                        <span className="font-mono">{viewAbaSession.dataCompleta}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1.5">
                      Reforçadores Utilizados
                    </h4>
                    <ul className="text-xs list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                      {(viewAbaSession.plano?.avaliacoes_preferencia || []).length > 0 ? (
                        (viewAbaSession.plano?.avaliacoes_preferencia || []).map((item: string, i: number) => (
                          <li key={i}>{item}</li>
                        ))
                      ) : (
                        <span className="text-muted-foreground italic">Nenhum cadastrado</span>
                      )}
                    </ul>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-xl p-4 space-y-2 flex-1 flex flex-col min-h-[150px]">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1.5">
                      Medicação / Observações
                    </h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap flex-1">
                      {viewAbaSession.plano?.observacoes_medica || "Nenhuma observação registrada."}
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t pt-4">
                <Button type="button" onClick={() => setViewAbaOpen(false)}>
                  Fechar Visualização
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingRequest ? "Editar Solicitação" : "Nova Solicitação"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-2">
                <Label htmlFor="paciente_id">Paciente</Label>
                <Select
                  value={formData.paciente_id}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, paciente_id: val, responsavel_nome: "", profissional_id: "" }))}
                  disabled={!!editingRequest}
                >
                  <SelectTrigger id="paciente_id">
                    <SelectValue placeholder="Selecione o paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePatients.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsavel_nome">Responsável Solicitante</Label>
                <Input
                  id="responsavel_nome"
                  value={formData.responsavel_nome}
                  onChange={(e) => setFormData((prev) => ({ ...prev, responsavel_nome: e.target.value }))}
                  placeholder="Nome do responsável"
                />
                
                {suggestedResponsibles.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-muted-foreground mr-1">Sugestões:</span>
                    {suggestedResponsibles.map((resp: any) => (
                      <Button
                        key={resp.id}
                        type="button"
                        variant="outline"
                        className="text-[10px] px-2 py-0.5 h-auto rounded-full bg-secondary/50 hover:bg-secondary border-0"
                        onClick={() => setFormData((prev) => ({ ...prev, responsavel_nome: resp.nome }))}
                      >
                        {resp.nome} {resp.parentesco ? `(${resp.parentesco})` : ""}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsavel_cpf">CPF do Responsável</Label>
                  <Input
                    id="responsavel_cpf"
                    value={formData.responsavel_cpf}
                    onChange={(e) => {
                      const formatted = formatCPF(e.target.value);
                      setFormData((prev) => ({ ...prev, responsavel_cpf: formatted }));
                    }}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valor_total">Valor Total (R$)</Label>
                  <Input
                    id="valor_total"
                    type="number"
                    step="0.01"
                    value={formData.valor_total}
                    onChange={(e) => setFormData((prev) => ({ ...prev, valor_total: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="especialidades">Especialidades Atendidas (Opcional)</Label>
                <Input
                  id="especialidades"
                  value={formData.especialidades}
                  onChange={(e) => setFormData((prev) => ({ ...prev, especialidades: e.target.value }))}
                  placeholder="Ex: Fonoaudiologia, Terapia Ocupacional..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo_documento_id">Tipo de Documento</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={formData.tipo_documento_id}
                      onValueChange={(val) => setFormData((prev) => ({ ...prev, tipo_documento_id: val }))}
                    >
                      <SelectTrigger id="tipo_documento_id">
                        <SelectValue placeholder="Selecione o tipo de documento" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposDocumento.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Gerenciar tipos de documento"
                    onClick={() => setManageTypesOpen(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profissional_id">Profissional Responsável (Opcional)</Label>
                <Select
                  value={formData.profissional_id || "none"}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, profissional_id: val === "none" ? "" : val }))}
                >
                  <SelectTrigger id="profissional_id">
                    <SelectValue placeholder="Selecione o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum profissional</SelectItem>
                    {activeProfessionals
                      .filter((p: any) => {
                        if (p.id === formData.profissional_id) return true;
                        if (p.ativo) return true;
                        const config = p.valores_config as any;
                        if (config?.ativo_ate) {
                          const targetMonth = formData.data_solicitacao ? formData.data_solicitacao.substring(0, 7) : (inicio ? inicio.substring(0, 7) : format(new Date(), "yyyy-MM"));
                          return targetMonth <= config.ativo_ate;
                        }
                        return false;
                      })
                      .map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {suggestedProfessionals.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-muted-foreground mr-1">Sugestões (Vinculados):</span>
                    {suggestedProfessionals.map((p: any) => (
                      <Button
                        key={p.id}
                        type="button"
                        variant="outline"
                        className="text-[10px] px-2 py-0.5 h-auto rounded-full bg-secondary/50 hover:bg-secondary border-0"
                        onClick={() => setFormData((prev) => ({ ...prev, profissional_id: p.id }))}
                      >
                        {p.nome}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data_solicitacao">Data de Solicitação</Label>
                  <Input
                    id="data_solicitacao"
                    type="date"
                    value={formData.data_solicitacao}
                    onChange={(e) => handleDataSolicitacaoChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="data_limite">Prazo de Entrega (10 dias)</Label>
                  <Input
                    id="data_limite"
                    type="date"
                    value={formData.data_limite}
                    disabled
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações (Opcional)</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="Ex: Responsável solicitou relatório para fins escolares/médicos..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for managing custom document types */}
      <Dialog open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Gerenciar Tipos de Documento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Novo tipo de documento..."
              />
              <Button
                type="button"
                onClick={() => {
                  if (newTypeName.trim()) {
                    addTipoMutation.mutate(newTypeName.trim());
                  }
                }}
                disabled={addTipoMutation.isPending}
              >
                Adicionar
              </Button>
            </div>

            <div className="border rounded-md divide-y max-h-[220px] overflow-y-auto">
              {tiposDocumento.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum tipo cadastrado.
                </div>
              ) : (
                tiposDocumento.map((tipo: any) => (
                  <div key={tipo.id} className="flex items-center justify-between p-2.5">
                    {editingTypeId === tipo.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <Input
                          value={editingTypeName}
                          onChange={(e) => setEditingTypeName(e.target.value)}
                          className="h-8 py-1"
                        />
                        <Button
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => {
                            if (editingTypeName.trim()) {
                              updateTipoMutation.mutate({ id: tipo.id, nome: editingTypeName.trim() });
                            }
                          }}
                          disabled={updateTipoMutation.isPending}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => {
                            setEditingTypeId("");
                            setEditingTypeName("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{tipo.nome}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingTypeId(tipo.id);
                              setEditingTypeName(tipo.nome);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja excluir o tipo "${tipo.nome}"? registros que o utilizam ficarão "Não definido".`)) {
                                deleteTipoMutation.mutate(tipo.id);
                              }
                            }}
                            disabled={deleteTipoMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageTypesOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for sending invoices to Accountant */}
      <Dialog open={accountantDialogOpen} onOpenChange={setAccountantDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Enviar Notas ao Contador</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground">Resumo do Período</p>
              <p>Período selecionado: <span className="font-medium text-foreground">{format(parseISO(inicio), "dd/MM/yyyy")}</span> até <span className="font-medium text-foreground">{format(parseISO(fim), "dd/MM/yyyy")}</span></p>
              <p>Total de pedidos de Nota Fiscal: <span className="font-medium text-foreground">{invoiceRequestsForSelectedMonth.length}</span></p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountant_phone">WhatsApp do Contador</Label>
              <Input
                id="accountant_phone"
                value={accountantPhone}
                onChange={(e) => {
                  const val = e.target.value;
                  setAccountantPhone(val);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("telefone_contador", val);
                  }
                }}
                placeholder="Ex: (11) 99999-9999"
              />
              <p className="text-[10px] text-muted-foreground">
                O número fica salvo no seu navegador para os próximos envios.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Pré-visualização da Lista</Label>
              <div className="border rounded-md p-3 text-xs max-h-[160px] overflow-y-auto space-y-3 bg-card font-mono whitespace-pre-wrap">
                {getInvoicesTextSummary()}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={exportInvoicesToCSV}
              disabled={invoiceRequestsForSelectedMonth.length === 0}
            >
              Exportar CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyInvoicesSummary}
              disabled={invoiceRequestsForSelectedMonth.length === 0}
            >
              Copiar Texto
            </Button>
            {accountantPhone ? (
              <a
                href={getAccountantWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                onClick={() => setAccountantDialogOpen(false)}
              >
                Enviar por WhatsApp
              </a>
            ) : (
              <Button
                type="button"
                disabled
                title="Insira o número do contador para enviar"
              >
                Enviar por WhatsApp
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RelatorioStat({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: any;
  label: string;
  value: string;
  variant?: "default" | "destructive" | "success";
}) {
  const iconColors = {
    default: "bg-primary/10 text-primary",
    destructive: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-10 w-10 place-items-center rounded-md ${iconColors[variant]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
