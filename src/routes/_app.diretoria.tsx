import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
const supabase = supabaseClient as any;
import { useState, useMemo, useEffect, Fragment } from "react";
import { format, startOfMonth, endOfMonth, differenceInDays, startOfDay } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Lock,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Calendar,
  AlertTriangle,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Check,
  Pencil,
  Search,
  DollarSign,
  AlertCircle,
  Clock,
  MessageCircle,
  ExternalLink,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Printer,
} from "lucide-react";

function parseDateFromDescription(desc: string): number | null {
  if (!desc) return null;
  const dateTimeMatch = desc.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (dateTimeMatch) {
    const [_, day, month, year, hour, minute] = dateTimeMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
  }
  const dateMatch = desc.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dateMatch) {
    const [_, day, month, year] = dateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0).getTime();
  }
  return null;
}

export const Route = createFileRoute("/_app/diretoria")({
  component: DiretoriaPage,
});

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const expectedPassword = import.meta.env.VITE_DIRETORIA_PASSWORD || "Gabi2020@";
      if (password === expectedPassword) {
        onUnlock();
        toast.success("Acesso liberado!");
      } else {
        toast.error("Senha incorreta!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao validar senha.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-lg">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary mb-3">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">Acesso Restrito</CardTitle>
          <CardDescription>
            Digite sua senha de administrador para visualizar as informações financeiras da
            diretoria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Senha do Administrador</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="text-center tracking-widest pr-10"
                  autoFocus
                  disabled={verifying}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={verifying}>
              {verifying ? "Verificando..." : "Confirmar Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function DiretoriaPageContent() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("diretoria-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "faturas" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fatura_itens" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens"] });
          queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pacientes" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dir-pacientes-min"] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
  const today = new Date();
  const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const [inicio, setInicio] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [fim, setFim] = useState(format(lastDayOfPrevMonth, "yyyy-MM-dd"));

  useEffect(() => {
    async function fetchOldestPendingCompetence() {
      try {
        const { data, error } = await supabase
          .from("faturas")
          .select("competencia")
          .in("status", ["aberta", "vencida"])
          .order("competencia", { ascending: true })
          .limit(1);
        
        if (error) throw error;
        
        if (data && data.length > 0 && data[0]?.competencia) {
          const rawDate = data[0].competencia;
          const formattedDate = typeof rawDate === "string" ? rawDate.substring(0, 10) : format(new Date(rawDate), "yyyy-MM-dd");
          setInicio(formattedDate);
        }
      } catch (err) {
        console.error("Erro ao buscar competência mais antiga pendente:", err);
      }
    }
    void fetchOldestPendingCompetence();
  }, []);

  const normalizeString = (str: string) =>
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

  const getPatientProfessionals = (pacienteId: string) => {
    const patientFats = (faturas || []).filter((f) => f.paciente_id === pacienteId);
    const names = new Set<string>();
    patientFats.forEach((f) => {
      const pros = faturaProfessionalsMap.get(f.id);
      if (pros) {
        pros.forEach((p) => names.add(p));
      }
    });

    const p = patientDetailsMap.get(pacienteId);
    if (p && p.paciente_profissional) {
      p.paciente_profissional.forEach((pp: any) => {
        const name = professionalMap.get(pp.profissional_id);
        if (name) {
          names.add(name);
        }
      });
    }

    return Array.from(names);
  };

  // Fetch Patients
  const { data: pacientes = [] } = useQuery<any[]>({
    queryKey: ["dir-pacientes-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pacientes")
        .select(`
          id, 
          nome, 
          valor_mensal, 
          cids_secundarios, 
          apoio_frequencia, 
          apoio_valor_personalizado,
          paciente_profissional (
            profissional_id
          )
        `)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const patientMap = useMemo(() => {
    return new Map<string, string>((pacientes || []).map((p) => [p.id, p.nome]));
  }, [pacientes]);

  const patientDetailsMap = useMemo(() => {
    return new Map<string, any>((pacientes || []).map((p) => [p.id, p]));
  }, [pacientes]);

  // Fetch all responsaveis to map their contacts
  const { data: responsaveis = [] } = useQuery<any[]>({
    queryKey: ["dir-responsaveis-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responsaveis")
        .select("id, paciente_id, nome, telefone, whatsapp, parentesco");
      if (error) throw error;
      return data;
    },
  });

  const responsaveisMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of responsaveis || []) {
      const list = map.get(r.paciente_id) || [];
      list.push(r);
      map.set(r.paciente_id, list);
    }
    return map;
  }, [responsaveis]);

  // Fetch Invoices
  const { data: faturas = [], isLoading: loadingFaturas } = useQuery<any[]>({
    queryKey: ["dir-faturas", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturas")
        .select(
           "id, valor, status, competencia, vencimento, pago_em, metodo, observacoes, paciente_id, profissional_id, especialidade",
        )
        .gte("competencia", inicio)
        .lte("competencia", fim)
        .order("competencia", { ascending: true })
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Confirm payment mutation
  const confirmPaymentMutation = useMutation({
    mutationFn: async ({
      id,
      pago_em,
      metodo,
      observacoes,
    }: {
      id: string;
      pago_em: string;
      metodo: string;
      observacoes?: string;
    }) => {
      const { error } = await supabase
        .from("faturas")
        .update({
          status: "paga",
          pago_em,
          metodo: metodo as any,
          observacoes: observacoes || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      toast.success("Pagamento confirmado com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao confirmar pagamento: " + err.message);
    },
  });

  // Confirm all patient payments mutation
  const confirmAllPatientPaymentsMutation = useMutation({
    mutationFn: async ({ pacienteId, patientName }: { pacienteId: string; patientName: string }) => {
      const patientFats = (faturas || []).filter(
        (f) => f.paciente_id === pacienteId && (f.status === "aberta" || f.status === "vencida")
      );

      if (patientFats.length === 0) return;

      const fatIds = patientFats.map(f => f.id);
      
      const { data: items } = await supabase
        .from("fatura_itens")
        .select("id, agendamento_id, fatura_id")
        .in("fatura_id", fatIds);

      const agIds = (items || [])
        .map((item: any) => item.agendamento_id)
        .filter(Boolean) as string[];

      if (agIds.length > 0) {
        const { error: agErr } = await supabase
          .from("agendamentos")
          .update({ status: "pago" })
          .in("id", agIds);
        if (agErr) throw agErr;
      }

      const faturasWithAgendamento = new Set((items || []).filter((item: any) => item.agendamento_id).map((item: any) => item.fatura_id));
      const manualFatIds = fatIds.filter(id => !faturasWithAgendamento.has(id));

      if (manualFatIds.length > 0) {
        const { error: fatErr } = await supabase
          .from("faturas")
          .update({
            status: "paga",
            pago_em: new Date().toISOString(),
            metodo: "pix",
          })
          .in("id", manualFatIds);
        if (fatErr) throw fatErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
      queryClient.invalidateQueries({ queryKey: ["dir-linked-agendamentos"] });
      toast.success("Todos os pagamentos do período foram confirmados!");
    },
    onError: (err: any) => {
      toast.error("Erro ao confirmar pagamentos: " + err.message);
    },
  });

  // Create billing (manual) mutation
  const createFaturaMutation = useMutation({
    mutationFn: async (newFatura: {
      paciente_id: string;
      competencia: string;
      vencimento?: string | null;
      valor: number;
      status: string;
      observacoes?: string | null;
      profissional_id?: string | null;
      especialidade?: string | null;
    }) => {
      const { error } = await supabase.from("faturas").insert({
        paciente_id: newFatura.paciente_id,
        competencia: newFatura.competencia,
        vencimento: newFatura.vencimento || null,
        valor: newFatura.valor,
        status: newFatura.status as any,
        observacoes: newFatura.observacoes || null,
        profissional_id: newFatura.profissional_id || null,
        especialidade: newFatura.especialidade || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      toast.success("Cobrança criada com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao criar cobrança: " + err.message);
    },
  });

  // Edit billing mutation
  const editFaturaMutation = useMutation({
    mutationFn: async (updatedFatura: {
      id: string;
      competencia: string;
      vencimento?: string | null;
      valor: number;
      status: string;
      pago_em?: string | null;
      metodo?: string | null;
      observacoes?: string | null;
      profissional_id?: string | null;
      especialidade?: string | null;
    }) => {
      const { error } = await supabase
        .from("faturas")
        .update({
          competencia: updatedFatura.competencia,
          vencimento: updatedFatura.vencimento || null,
          valor: updatedFatura.valor,
          status: updatedFatura.status as any,
          pago_em:
            updatedFatura.status === "paga"
              ? (updatedFatura.pago_em
                ? new Date(updatedFatura.pago_em + "T12:00:00").toISOString()
                : new Date().toISOString())
              : null,
          metodo: updatedFatura.status === "paga" ? (updatedFatura.metodo as any || "pix") : null,
          observacoes: updatedFatura.observacoes || null,
          profissional_id: updatedFatura.profissional_id || null,
          especialidade: updatedFatura.especialidade || null,
        })
        .eq("id", updatedFatura.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      toast.success("Cobrança atualizada com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar cobrança: " + err.message);
    },
  });

  // Delete billing mutation
  const deleteFaturaMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("fatura_itens").delete().eq("fatura_id", id);
      const { error } = await supabase.from("faturas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      toast.success("Cobrança excluída com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir cobrança: " + err.message);
    },
  });

  // Delete individual billing item mutation
  const deleteFaturaItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // 1. Fetch the item to know its parent fatura_id
      const { data: itemToDelete, error: getError } = await supabase
        .from("fatura_itens")
        .select("fatura_id")
        .eq("id", itemId)
        .single();
      if (getError) throw getError;
      const faturaId = itemToDelete?.fatura_id;

      // 2. Delete the item
      const { error: deleteError } = await supabase
        .from("fatura_itens")
        .delete()
        .eq("id", itemId);
      if (deleteError) throw deleteError;

      // 3. Recalculate or delete parent fatura
      if (faturaId) {
        const { data: remainingItems, error: fetchError } = await supabase
          .from("fatura_itens")
          .select("total")
          .eq("fatura_id", faturaId);
        if (fetchError) throw fetchError;

        if (!remainingItems || remainingItems.length === 0) {
          // Delete parent fatura if empty
          const { error: deleteFaturaError } = await supabase
            .from("faturas")
            .delete()
            .eq("id", faturaId);
          if (deleteFaturaError) throw deleteFaturaError;
        } else {
          // Recalculate total and update parent fatura
          const newTotal = remainingItems.reduce((sum: number, item: any) => sum + (Number(item.total) || 0), 0);
          const { error: updateFaturaError } = await supabase
            .from("faturas")
            .update({ valor: newTotal })
            .eq("id", faturaId);
          if (updateFaturaError) throw updateFaturaError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
      toast.success("Sessão excluída da cobrança com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir sessão: " + err.message);
    },
  });

  // Delete multiple faturas or items mutation
  const deleteMultipleFaturasOrItemsMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      const faturaIdsToDelete = rows.filter(r => r.isFaturaOnly).map(r => r.faturaId);
      const itemsToDelete = rows.filter(r => !r.isFaturaOnly);
      const itemIdsToDelete = itemsToDelete.map(r => r.item.id);

      const parentFaturaIds = Array.from(new Set(itemsToDelete.map(r => r.faturaId)));

      // 1. Delete items
      if (itemIdsToDelete.length > 0) {
        const { error: itemDeleteError } = await supabase
          .from("fatura_itens")
          .delete()
          .in("id", itemIdsToDelete);
        if (itemDeleteError) throw itemDeleteError;
      }

      // 2. Delete faturas (manual faturas selected directly)
      if (faturaIdsToDelete.length > 0) {
        await supabase.from("fatura_itens").delete().in("fatura_id", faturaIdsToDelete);
        const { error: faturaDeleteError } = await supabase
          .from("faturas")
          .delete()
          .in("id", faturaIdsToDelete);
        if (faturaDeleteError) throw faturaDeleteError;
      }

      // 3. Update or delete parent faturas of deleted items
      for (const parentId of parentFaturaIds) {
        if (faturaIdsToDelete.includes(parentId)) continue;

        const { data: remainingItems, error: fetchError } = await supabase
          .from("fatura_itens")
          .select("total")
          .eq("fatura_id", parentId);
        if (fetchError) throw fetchError;

        if (!remainingItems || remainingItems.length === 0) {
          const { error: deleteFaturaError } = await supabase
            .from("faturas")
            .delete()
            .eq("id", parentId);
          if (deleteFaturaError) throw deleteFaturaError;
        } else {
          const newTotal = remainingItems.reduce((sum: number, item: any) => sum + (Number(item.total) || 0), 0);
          const { error: updateFaturaError } = await supabase
            .from("faturas")
            .update({ valor: newTotal })
            .eq("id", parentId);
          if (updateFaturaError) throw updateFaturaError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
      toast.success("Itens e cobranças selecionados foram excluídos com sucesso!");
      setSelectedRowIds([]);
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir itens/cobranças: " + err.message);
    },
  });

  // Edit fatura item mutation
  const editFaturaItemMutation = useMutation({
    mutationFn: async ({
      id,
      descricao,
      valor_unitario,
    }: {
      id: string;
      descricao: string;
      valor_unitario: number;
    }) => {
      const { error } = await supabase
        .from("fatura_itens")
        .update({
          descricao,
          valor_unitario,
          total: valor_unitario,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
      toast.success("Sessão atualizada com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar sessão: " + err.message);
    },
  });

  // Create fatura item mutation
  const createFaturaItemMutation = useMutation({
    mutationFn: async ({
      fatura_id,
      descricao,
      valor_unitario,
    }: {
      fatura_id: string;
      descricao: string;
      valor_unitario: number;
    }) => {
      const { error } = await supabase
        .from("fatura_itens")
        .insert({
          fatura_id,
          descricao,
          quantidade: 1,
          valor_unitario,
          total: valor_unitario,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
      toast.success("Sessão adicionada com sucesso!");
    },
    onError: (err: any) => {
      toast.error("Erro ao adicionar sessão: " + err.message);
    },
  });

  // Update appointment status mutation
  const updateAppointmentStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: string;
    }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dir-faturas"] });
      queryClient.invalidateQueries({ queryKey: ["dir-fatura-itens-all"] });
      queryClient.invalidateQueries({ queryKey: ["dir-linked-agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["dir-agendamentos-repasses"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar status da sessão: " + err.message);
    },
  });

  // Fetch Expenses
  const { data: despesas = [], isLoading: loadingDespesas } = useQuery<any[]>({
    queryKey: ["dir-despesas", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas")
        .select("*")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Calculations
  const stats = useMemo(() => {
    // Faturamento Recebido (Pagas)
    const faturamentoRecebido = (faturas || [])
      .filter((f) => f.status === "paga")
      .reduce((acc, f) => acc + Number(f.valor), 0);

    // Faturamento A Receber (Abertas)
    const faturamentoAReceber = (faturas || [])
      .filter((f) => f.status === "aberta")
      .reduce((acc, f) => acc + Number(f.valor), 0);

    // Faturamento Vencido (Vencidas)
    const faturamentoVencido = (faturas || [])
      .filter((f) => f.status === "vencida")
      .reduce((acc, f) => acc + Number(f.valor), 0);

    // Faturamento Pendente (Abertas/Vencidas)
    const faturamentoPendente = faturamentoAReceber + faturamentoVencido;

    // Faturamento Geral (Total Faturas)
    const faturamentoTotal = (faturas || [])
      .filter((f) => f.status !== "cancelada")
      .reduce((acc, f) => acc + Number(f.valor), 0);

    // Despesas
    const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);

    // Balanços
    const balancoReal = faturamentoRecebido - totalDespesas;
    const balancoEstimado = faturamentoTotal - totalDespesas;

    return {
      faturamentoRecebido,
      faturamentoAReceber,
      faturamentoVencido,
      faturamentoPendente,
      faturamentoTotal,
      totalDespesas,
      balancoReal,
      balancoEstimado,
    };
  }, [faturas, despesas]);

  function brl(n: number) {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const renderSessionDates = (fatura: any, allowDelete = false) => {
    let items = faturaItens.filter((item: any) => item.fatura_id === fatura.id);
    if (fatura.especialidade === "Apoio") {
      items = items.filter((item: any) => !item.agendamento_id);
    }
    if (items.length === 0) {
      if (fatura.especialidade) {
        let label = fatura.especialidade;
        if (fatura.especialidade === "Apoio") {
          const p = patientDetailsMap.get(fatura.paciente_id);
          const freq = p?.apoio_frequencia || 'avulso';
          const freqLabels: Record<string, string> = {
            avulso: "Pacote Apoio - Sessões Avulsas",
            "1x": "Pacote Apoio - 1x por semana",
            "2x": "Pacote Apoio - 2x por semana",
            "3x": "Pacote Apoio - 3x por semana",
            semana_toda: "Pacote Apoio - Semana Inteira",
          };
          label = freqLabels[freq] || "Pacote Apoio";
        }
        return (
          <span className="text-[10px] font-semibold text-foreground bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded whitespace-nowrap block w-max">
            {label} (Manual)
          </span>
        );
      }
      return <span className="text-muted-foreground italic">—</span>;
    }

    return (
      <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto pr-2 scrollbar-thin">
        {items.map((item: any, idx: number) => {
          if (!item.descricao) return null;
          let itemDesc = item.descricao;
          if (fatura.especialidade === "Apoio" && !item.descricao.startsWith("Pacote Apoio")) {
            const p = patientDetailsMap.get(fatura.paciente_id);
            const freq = p?.apoio_frequencia || 'avulso';
            const freqLabels: Record<string, string> = {
              avulso: "Pacote Apoio - Sessões Avulsas",
              "1x": "Pacote Apoio - 1x por semana",
              "2x": "Pacote Apoio - 2x por semana",
              "3x": "Pacote Apoio - 3x por semana",
              semana_toda: "Pacote Apoio - Semana Inteira",
            };
            itemDesc = freqLabels[freq] || "Pacote Apoio";
          }
          const valBrl = brl(Number(item.total || 0));
          return (
            <div
              key={item.id || idx}
              className="text-[10px] font-medium text-foreground bg-muted/65 px-1.5 py-0.5 rounded border border-border/50 whitespace-nowrap flex items-center gap-1.5 w-max hover:bg-muted transition duration-150"
            >
              <span>{itemDesc}: {valBrl}</span>
              {allowDelete && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer ml-1 bg-transparent border-0 p-0 leading-none flex items-center justify-center"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(`Tem certeza que deseja excluir a sessão "${item.descricao}" desta cobrança?`)) {
                      deleteFaturaItemMutation.mutate(item.id);
                    }
                  }}
                  title="Excluir esta sessão"
                >
                  <X className="h-3 w-3 shrink-0" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Fetch active professionals
  const { data: profissionais = [] } = useQuery<any[]>({
    queryKey: ["dir-profissionais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id, nome, especialidade, cor, valor_sessao, valores_config, ativo")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const professionalMap = useMemo(() => {
    return new Map<string, string>((profissionais || []).map((p) => [p.id, p.nome]));
  }, [profissionais]);

  const professionalSpecsMap = useMemo(() => {
    return new Map<string, string>((profissionais || []).map((p) => [p.id, p.especialidade || ""]));
  }, [profissionais]);

  const professionalMatchesSpecialty = (profId: string, fatSpecialty: string | null | undefined) => {
    if (!fatSpecialty) return true;
    const specsStr = professionalSpecsMap.get(profId);
    if (specsStr === undefined) return true; // Fallback if we don't have professional info in our active list
    const cleanFat = fatSpecialty.trim().toLowerCase();
    const cleanSpecs = specsStr.split(",").map((s) => s.trim().toLowerCase());
    return cleanSpecs.includes(cleanFat);
  };

  const getProfessionalsForFatura = (fatura: any) => {
    const set = new Set<string>();
    const prosSet = faturaProfessionalsMap.get(fatura.id);
    if (prosSet) {
      prosSet.forEach((p) => set.add(p));
    }
    if (fatura.profissional_id) {
      const name = professionalMap.get(fatura.profissional_id);
      if (name) set.add(name);
    }
    return Array.from(set);
  };

  // Fetch all agendamentos for professional payment calculation
  const { data: agendamentosRepasses = [], isLoading: loadingAgendamentos } = useQuery<any[]>({
    queryKey: ["dir-agendamentos-repasses", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(
          `
          id,
          status,
          data_inicio,
          paciente_id,
          profissional_id,
          servico_id,
          observacoes,
          pacientes (
            id,
            nome,
            cids_secundarios
          ),
          profissionais (
            id,
            nome,
            especialidade,
            valor_sessao,
            valores_config
          ),
          servicos (
            id,
            nome
          )
        `,
        )
        .gte("data_inicio", `${inicio}T00:00:00`)
        .lte("data_inicio", `${fim}T23:59:59`);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all fatura_itens to link them to agendamentos in memory (avoids missing relation schema constraint join issue)
  const { data: faturaItens = [], isLoading: loadingFaturaItens } = useQuery<any[]>({
    queryKey: ["dir-fatura-itens", inicio, fim],
    queryFn: async () => {
      // First fetch faturas for this date range to get their IDs
      const { data: fList, error: fError } = await supabase
        .from("faturas")
        .select("id")
        .gte("competencia", inicio)
        .lte("competencia", fim);
      if (fError) throw fError;
      
      const fIds = (fList || []).map((f: any) => f.id);
      if (fIds.length === 0) return [];
      
      // Fetch in chunks of 100 to avoid URL length limit
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < fIds.length; i += chunkSize) {
        chunks.push(fIds.slice(i, i + chunkSize));
      }
      
      const promises = chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("fatura_itens")
          .select(`
            id,
            fatura_id,
            total,
            valor_unitario,
            agendamento_id,
            descricao,
            faturas (
              id,
              status,
              pago_em,
              metodo,
              vencimento,
              profissional_id,
              especialidade,
              paciente_id,
              competencia,
              valor
            )
          `)
          .in("fatura_id", chunk);
        if (error) throw error;
        return data || [];
      });
      
      const results = await Promise.all(promises);
      return results.flat();
    },
  });

  const linkedAgendamentoIds = useMemo(() => {
    const ids = new Set<string>();
    (faturaItens || []).forEach((item: any) => {
      const comp = item.faturas?.competencia;
      if (comp && comp >= inicio && comp <= fim && item.agendamento_id) {
        ids.add(item.agendamento_id);
      }
    });
    return Array.from(ids);
  }, [faturaItens, inicio, fim]);

  const { data: linkedAgendamentos = [] } = useQuery<any[]>({
    queryKey: ["dir-linked-agendamentos", linkedAgendamentoIds],
    queryFn: async () => {
      if (linkedAgendamentoIds.length === 0) return [];
      
      // Chunk the IDs to avoid URL length limit (max ~100 IDs per request)
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < linkedAgendamentoIds.length; i += chunkSize) {
        chunks.push(linkedAgendamentoIds.slice(i, i + chunkSize));
      }
      
      const promises = chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id, profissional_id, status, data_inicio")
          .in("id", chunk);
        if (error) throw error;
        return data || [];
      });
      
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: linkedAgendamentoIds.length > 0,
  });

  const agendamentoProfIdMap = useMemo(() => {
    const map = new Map<string, string>();
    (linkedAgendamentos || []).forEach((ag: any) => {
      if (ag.id && ag.profissional_id) {
        map.set(ag.id, ag.profissional_id);
      }
    });
    return map;
  }, [linkedAgendamentos]);

  const agendamentoStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    (linkedAgendamentos || []).forEach((ag: any) => {
      if (ag.id && ag.status) {
        map.set(ag.id, ag.status);
      }
    });
    return map;
  }, [linkedAgendamentos]);

  const agendamentoDateMap = useMemo(() => {
    const map = new Map<string, string>();
    (linkedAgendamentos || []).forEach((ag: any) => {
      if (ag.id && ag.data_inicio) {
        map.set(ag.id, ag.data_inicio);
      }
    });
    return map;
  }, [linkedAgendamentos]);

  const faturaItensMap = useMemo(() => {
    const map = new Map<string, any>();
    faturaItens.forEach((item: any) => {
      if (item.agendamento_id) {
        map.set(item.agendamento_id, item);
      }
    });
    return map;
  }, [faturaItens]);

  const agendamentoProfMap = useMemo(() => {
    const map = new Map<string, string>();
    (agendamentosRepasses || []).forEach((ag: any) => {
      if (ag.id && ag.profissionais?.nome) {
        map.set(ag.id, ag.profissionais.nome);
      }
    });
    return map;
  }, [agendamentosRepasses]);

  const faturaProfessionalsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    (faturas || []).forEach((f: any) => {
      if (f.profissional_id) {
        const profName = professionalMap.get(f.profissional_id);
        if (profName) {
          const set = map.get(f.id) || new Set<string>();
          set.add(profName);
          map.set(f.id, set);
        }
      }
    });

    (faturaItens || []).forEach((item: any) => {
      const fatId = item.fatura_id || item.faturas?.id;
      if (!fatId) return;

      const profId = item.agendamento_id ? agendamentoProfIdMap.get(item.agendamento_id) : null;
      if (profId) {
        const profName = professionalMap.get(profId);
        if (profName) {
          const set = map.get(fatId) || new Set<string>();
          set.add(profName);
          map.set(fatId, set);
        }
      }
    });
    return map;
  }, [faturas, faturaItens, agendamentoProfIdMap, professionalMap]);

  const faturaProfIdsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();

    (faturas || []).forEach((f: any) => {
      const set = map.get(f.id) || new Set<string>();
      if (f.profissional_id) {
        set.add(f.profissional_id);
      } else {
        // Fallback for faturas without a professional_id:
        // Use the patient's accompanying professional IDs
        const p = patientDetailsMap.get(f.paciente_id);
        const pProfs = p?.paciente_profissional || [];
        pProfs.forEach((pp: any) => {
          if (professionalMatchesSpecialty(pp.profissional_id, f.especialidade)) {
            set.add(pp.profissional_id);
          }
        });
      }
      if (set.size > 0) {
        map.set(f.id, set);
      }
    });

    (faturaItens || []).forEach((item: any) => {
      const fatId = item.fatura_id || item.faturas?.id;
      if (!fatId) return;

      const profId = item.agendamento_id ? agendamentoProfIdMap.get(item.agendamento_id) : null;
      if (profId) {
        const set = map.get(fatId) || new Set<string>();
        set.add(profId);
        map.set(fatId, set);
      }
    });
    return map;
  }, [faturas, faturaItens, agendamentoProfIdMap, patientDetailsMap, professionalSpecsMap]);

  // Helper to resolve specialty of an appointment
  const getAppointmentSpecialty = (a: any) => {
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
    return "Geral";
  };

  const getApoioSessionValue = (pacienteId: string, profissionalId: string, dataInicioStr: string) => {
    if (!pacienteId || !dataInicioStr) return 0;
    
    const date = new Date(dataInicioStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const competenciaStr = `${year}-${month}-01`;
    
    const p = patientDetailsMap.get(pacienteId);
    if (!p) return 0;
    
    const freq = p.apoio_frequencia || 'avulso';
    const customVal = p.apoio_valor_personalizado;
    
    const totalSessions = agendamentosRepasses.filter((ag: any) => {
      if (ag.paciente_id !== pacienteId || ag.profissional_id !== profissionalId) return false;
      const statusOk = ag.status === "realizado" || ag.status === "pago" || ag.status === "falta";
      if (!statusOk) return false;
      
      const agDate = new Date(ag.data_inicio);
      const agYear = agDate.getFullYear();
      const agMonth = String(agDate.getMonth() + 1).padStart(2, '0');
      const agCompetencia = `${agYear}-${agMonth}-01`;
      
      const specName = getAppointmentSpecialty(ag);
      const isApoio = specName === "Apoio" || specName === "AP";
      return isApoio && agCompetencia === competenciaStr;
    }).length;
    
    if (totalSessions === 0) return 0;

    let fatValue = 0;
    if (freq === 'avulso') {
      const rate = (customVal !== null && customVal !== undefined && String(customVal) !== "")
        ? Number(customVal)
        : 50.00;
      fatValue = totalSessions * rate;
    } else {
      if (customVal !== null && customVal !== undefined && String(customVal) !== "") {
        fatValue = Number(customVal);
      } else {
        const defaultRates: Record<string, number> = {
          "1x": 120.00,
          "2x": 240.00,
          "3x": 360.00,
          semana_toda: 450.00
        };
        fatValue = defaultRates[freq] ?? 120.00;
      }
    }
    
    return fatValue / totalSessions;
  };

  // Helper to get session value
  const getAppointmentValue = (a: any) => {
    const spec = getAppointmentSpecialty(a);
    const isApoio = spec === "Apoio" || spec === "AP";
    if (isApoio) {
      return getApoioSessionValue(a.paciente_id, a.profissional_id, a.data_inicio);
    }

    const fatItem = faturaItensMap.get(a.id);
    if (fatItem) {
      return Number(fatItem.total || 0);
    }

    // Fallback logic equivalent to fn_get_pricing
    const prof = a.profissionais;
    if (!prof) return 0;

    const isAnamnese = a.observacoes?.includes("[Tipo: Anamnese]");

    const config = prof.valores_config || { especialidades: [], descontos: [] };
    const valorDefault = Number(prof.valor_sessao || 0);

    // 1. Check custom patient discount
    if (Array.isArray(config.descontos) && config.descontos.length > 0) {
      const d = config.descontos.find(
        (item: any) =>
          item.paciente_id === a.paciente_id &&
          String(item.especialidade || "").toLowerCase() === String(spec || "").toLowerCase(),
      );
      if (d) {
        return isAnamnese ? Number(d.valor_avaliacao || 0) : Number(d.valor_sessao || 0);
      }
    }

    // 2. Check standard specialty rates
    if (Array.isArray(config.especialidades) && config.especialidades.length > 0) {
      const e = config.especialidades.find(
        (item: any) => String(item.nome || "").toLowerCase() === String(spec || "").toLowerCase(),
      );
      if (e) {
        if (isAnamnese) {
          return Number(e.valor_avaliacao || 0);
        } else {
          if (String(spec).toLowerCase() === "ap") return 0;
          return Number(e.valor_sessao ?? valorDefault ?? 0);
        }
      }
    }

    // 3. Default professional rate
    if (isAnamnese) {
      return 0;
    } else {
      return valorDefault;
    }
  };

  const isApoioSpec = (specialty: string) => {
    const s = String(specialty || "").trim().toUpperCase();
    return s === "APOIO" || s === "AP";
  };

  const getRepasseRates = (specialty: string) => {
    const specNorm = String(specialty || "").trim().toUpperCase();
    if (specNorm === "AT ABA") {
      return { profPct: 0.5, clinicPct: 0.5, label: "50% / 50%" };
    }
    if (specNorm === "APOIO" || specNorm === "AP") {
      return { profPct: 0.6, clinicPct: 0.4, label: "60% / 40%" };
    }
    return { profPct: 0.7, clinicPct: 0.3, label: "70% / 30%" };
  };

  const getProfessionalBreakdown = (sessoes: any[]) => {
    let standardCount = 0;
    let standardFat = 0;
    let standardRep = 0;

    let anamneseCount = 0;
    let anamneseFat = 0;
    let anamneseRep = 0;

    let normalCount = 0;
    let normalFat = 0;
    let normalRep = 0;

    let discountCount = 0;
    let discountFat = 0;
    let discountRep = 0;

    sessoes.forEach((a: any) => {
      const val = getAppointmentValue(a);
      const spec = getAppointmentSpecialty(a);
      const { profPct } = getRepasseRates(spec);
      const repVal = val * profPct;

      const isAnamnese = a.observacoes?.includes("[Tipo: Anamnese]");
      
      const config = a.profissionais?.valores_config || { especialidades: [], descontos: [] };
      const hasDiscount = Array.isArray(config.descontos) && config.descontos.some(
        (item: any) =>
          item.paciente_id === a.paciente_id &&
          String(item.especialidade || "").toLowerCase() === String(spec || "").toLowerCase()
      );

      if (isAnamnese) {
        anamneseCount++;
        anamneseFat += val;
        anamneseRep += repVal;
      } else {
        standardCount++;
        standardFat += val;
        standardRep += repVal;
      }

      if (hasDiscount) {
        discountCount++;
        discountFat += val;
        discountRep += repVal;
      } else {
        normalCount++;
        normalFat += val;
        normalRep += repVal;
      }
    });

    return {
      standardCount, standardFat, standardRep,
      anamneseCount, anamneseFat, anamneseRep,
      normalCount, normalFat, normalRep,
      discountCount, discountFat, discountRep
    };
  };

  const isCoordenadora = (profId: string | null) => {
    if (!profId) return false;
    const prof = (profissionais || []).find((p: any) => p.id === profId);
    if (!prof?.especialidade) return false;
    return prof.especialidade
      .split(",")
      .map((s: string) => s.trim().toLowerCase())
      .includes("coordenadora ap");
  };

  // State variables for payment calculation tab
  const [selectedProfId, setSelectedProfId] = useState<string>("all");
  const [sessionStatusFilter, setSessionStatusFilter] = useState<string>("realizado_pago_falta");
  const [viewingProfDetail, setViewingProfDetail] = useState<string | null>(null);
  const [expandedProfs, setExpandedProfs] = useState<Set<string>>(new Set());
  const [customRepasses, setCustomRepasses] = useState<Record<string, Record<string, { sessions: number, value: number, rate: number }>>>({});

  const toggleExpandProf = (profId: string) => {
    setExpandedProfs((prev) => {
      const next = new Set(prev);
      if (next.has(profId)) {
        next.delete(profId);
      } else {
        next.add(profId);
      }
      return next;
    });
  };

  const getPatientBreakdownForSpecialty = (profId: string, spec: string, sessoes: any[]) => {
    const isApoio = isApoioSpec(spec);
    
    // Group sessions by patient
    const groups: Record<
      string,
      {
        sessions: number;
        totalVal: number;
        defaultRate: number;
        pacienteNome: string;
        freqLabel: string;
      }
    > = {};

    sessoes.forEach((a: any) => {
      const s = getAppointmentSpecialty(a);
      if (s !== spec) return; // Only process sessions for this specialty

      const val = getAppointmentValue(a);
      const { profPct } = getRepasseRates(spec);
      const pacId = a.paciente_id;
      if (!pacId) return;
      const pacName = a.pacientes?.nome || "Paciente Sem Nome";

      if (!groups[pacId]) {
        let freqLabel = "";
        if (isApoio) {
          const p = patientDetailsMap.get(pacId);
          const freq = p?.apoio_frequencia || "avulso";
          const customVal = p?.apoio_valor_personalizado;
          
          freqLabel =
            freq === "avulso"
              ? `Avulso (R$ ${customVal !== null && customVal !== undefined ? Number(customVal).toFixed(2) : "50.00"}/sessão)`
              : `${freq}/semana (R$ ${customVal !== null && customVal !== undefined ? Number(customVal).toFixed(2) : "120.00"}/mês)`;
          if (freq === "semana_toda") {
            freqLabel = `Semana Toda (R$ ${customVal !== null && customVal !== undefined ? Number(customVal).toFixed(2) : "450.00"}/mês)`;
          }
        }

        groups[pacId] = {
          sessions: 0,
          totalVal: 0,
          defaultRate: profPct * 100,
          pacienteNome: pacName,
          freqLabel,
        };
      }
      groups[pacId].sessions += 1;
      groups[pacId].totalVal += val;
    });

    const list = Object.entries(groups).map(([pacId, data]) => {
      const key = isApoio ? `apoio_paciente_${pacId}` : `${spec}_paciente_${pacId}`;
      const override = customRepasses[profId]?.[key];
      
      const sessions = override?.sessions !== undefined ? override.sessions : data.sessions;
      const rate = override?.rate !== undefined ? override.rate : data.defaultRate;
      
      let faturamento = 0;
      let repVal = 0;
      let value = 0;

      if (isApoio) {
        faturamento = override?.value !== undefined ? override.value : data.totalVal;
        repVal = faturamento * (rate / 100);
        value = faturamento;
      } else {
        const defaultAvg = data.sessions > 0 ? data.totalVal / data.sessions : 0;
        value = override?.value !== undefined ? override.value : defaultAvg;
        faturamento = sessions * value;
        repVal = faturamento * (rate / 100);
      }

      return {
        pacienteId: pacId,
        key,
        pacienteNome: data.pacienteNome,
        freqLabel: data.freqLabel,
        sessions,
        value,
        rate,
        faturamento,
        repVal,
      };
    });

    return list;
  };

  const handleOverrideChange = (
    profId: string,
    key: string,
    field: "sessions" | "value" | "rate",
    valStr: string,
    defaultSess: number,
    defaultValue: number,
    defaultRate: number
  ) => {
    setCustomRepasses((prev) => {
      const next = { ...prev };
      if (!next[profId]) {
        next[profId] = {};
      }
      if (!next[profId][key]) {
        next[profId][key] = { sessions: defaultSess, value: defaultValue, rate: defaultRate };
      }

      const current = {
        sessions: prev[profId]?.[key]?.sessions !== undefined ? prev[profId][key].sessions : defaultSess,
        value: prev[profId]?.[key]?.value !== undefined ? prev[profId][key].value : defaultValue,
        rate: prev[profId]?.[key]?.rate !== undefined ? prev[profId][key].rate : defaultRate,
      };

      if (field === "sessions") {
        current.sessions = valStr === "" ? 0 : Number(valStr);
      } else if (field === "value") {
        current.value = valStr === "" ? 0 : Number(valStr);
      } else if (field === "rate") {
        current.rate = valStr === "" ? 0 : Number(valStr);
      }

      next[profId][key] = current;
      return next;
    });
  };

  const handleSelectProf = (val: string) => {
    setSelectedProfId(val);
    if (val === "all") {
      setViewingProfDetail(null);
    } else {
      setViewingProfDetail(val);
    }
  };

  const filteredRepasses = useMemo(() => {
    return agendamentosRepasses.filter((a: any) => {
      if (a.status === "cancelado") return false;

      const matchesProf = selectedProfId === "all" || a.profissional_id === selectedProfId;

      let matchesStatus = true;
      if (sessionStatusFilter === "realizado_pago_falta") {
        matchesStatus = a.status === "realizado" || a.status === "pago" || a.status === "falta";
      } else if (sessionStatusFilter === "confirmado") {
        matchesStatus = a.status === "confirmado";
      } else if (sessionStatusFilter === "pago") {
        matchesStatus = a.status === "pago";
      } else if (sessionStatusFilter === "realizado") {
        matchesStatus = a.status === "realizado";
      }

      return matchesProf && matchesStatus;
    });
  }, [agendamentosRepasses, selectedProfId, sessionStatusFilter]);

  const getPatientPaymentStatus = (a: any) => {
    const fatItem = faturaItensMap.get(a.id);
    if (a.status === "pago" || fatItem?.faturas?.status === "paga") {
      return "paga";
    }
    const fat = fatItem?.faturas;
    if (!fat) {
      return "nao_faturado";
    }
    if (fat.status === "aberta" && fat.vencimento) {
      const today = startOfDay(new Date());
      const dueDate = startOfDay(new Date(fat.vencimento + "T12:00:00"));
      const diff = differenceInDays(today, dueDate);
      if (diff > 0) return "vencida";
    }
    return fat.status; // aberta, vencida, cancelada
  };

  const professionalPatients = useMemo(() => {
    if (!viewingProfDetail || viewingProfDetail === "all") return [];

    const map = new Map<
      string,
      {
        pacienteId: string;
        nome: string;
        totalSessões: number;
        faturamentoBruto: number;
        repasseProfissional: number;
        repasseApto: number;
        repasseBloqueado: number;
      }
    >();

    filteredRepasses.forEach((a: any) => {
      if (a.profissional_id !== viewingProfDetail) return;

      const pId = a.paciente_id;
      if (!pId) return;
      const pNome = a.pacientes?.nome || "Paciente Desconhecido";
      const val = getAppointmentValue(a);
      const spec = getAppointmentSpecialty(a);
      const { profPct } = getRepasseRates(spec);
      const repVal = val * profPct;

      const isClientePago = getPatientPaymentStatus(a) === "paga";

      let entry = map.get(pId);
      if (!entry) {
        entry = {
          pacienteId: pId,
          nome: pNome,
          totalSessões: 0,
          faturamentoBruto: 0,
          repasseProfissional: 0,
          repasseApto: 0,
          repasseBloqueado: 0,
        };
        map.set(pId, entry);
      }

      entry.totalSessões += 1;
      entry.faturamentoBruto += val;
      entry.repasseProfissional += repVal;
      if (isClientePago) {
        entry.repasseApto += repVal;
      } else {
        entry.repasseBloqueado += repVal;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredRepasses, viewingProfDetail]);

  const consolidatedRepasses = useMemo(() => {
    const groups = new Map<
      string,
      {
        profissionalId: string;
        nome: string;
        cor: string;
        especialidades: Set<string>;
        totalSessões: number;
        faturamentoBruto: number;
        repasseProfissional: number;
        comissaoClinica: number;
        repasseApto: number;
        repasseBloqueado: number;
        comissaoRecebida: number;
        comissaoPendente: number;
        sessoes: any[];
      }
    >();

    filteredRepasses.forEach((a: any) => {
      const profId = a.profissional_id;
      if (!profId) return;

      const profName = a.profissionais?.nome || "Desconhecido";
      const profCor = a.profissionais?.cor || "#000000";
      const spec = getAppointmentSpecialty(a);
      const val = getAppointmentValue(a);
      const { profPct, clinicPct } = getRepasseRates(spec);

      let group = groups.get(profId);
      if (!group) {
        group = {
          profissionalId: profId,
          nome: profName,
          cor: profCor,
          especialidades: new Set<string>(),
          totalSessões: 0,
          faturamentoBruto: 0,
          repasseProfissional: 0,
          comissaoClinica: 0,
          repasseApto: 0,
          repasseBloqueado: 0,
          comissaoRecebida: 0,
          comissaoPendente: 0,
          sessoes: [],
        };
        groups.set(profId, group);
      }

      group.especialidades.add(spec);
      group.sessoes.push(a);
    });

    // Apply custom overrides
    groups.forEach((group, profId) => {
      // Group sessions by specialty and patient
      const patientSpecGroups: Record<
        string,
        {
          spec: string;
          pacId: string;
          sessions: number;
          totalVal: number;
          defaultRate: number;
          key: string;
        }
      > = {};

      group.sessoes.forEach((a: any) => {
        const spec = getAppointmentSpecialty(a);
        const pacId = a.paciente_id;
        if (!pacId) return;

        const val = getAppointmentValue(a);
        const { profPct } = getRepasseRates(spec);
        const defaultRate = profPct * 100;
        const key = isApoioSpec(spec) ? `apoio_paciente_${pacId}` : `${spec}_paciente_${pacId}`;
        const groupKey = `${spec}_${pacId}`;

        if (!patientSpecGroups[groupKey]) {
          patientSpecGroups[groupKey] = {
            spec,
            pacId,
            sessions: 0,
            totalVal: 0,
            defaultRate,
            key,
          };
        }
        patientSpecGroups[groupKey].sessions += 1;
        patientSpecGroups[groupKey].totalVal += val;
      });

      let totalSess = 0;
      let totalFat = 0;
      let totalRep = 0;

      Object.values(patientSpecGroups).forEach((data) => {
        const override = customRepasses[profId]?.[data.key];
        const rate = override?.rate !== undefined ? override.rate : data.defaultRate;
        const sessions = override?.sessions !== undefined ? override.sessions : data.sessions;

        if (isApoioSpec(data.spec)) {
          const totalVal = override?.value !== undefined ? override.value : data.totalVal;
          const repVal = totalVal * (rate / 100);

          totalSess += sessions;
          totalFat += totalVal;
          totalRep += repVal;
        } else {
          const avgValue = data.sessions > 0 ? data.totalVal / data.sessions : 0;
          const value = override?.value !== undefined ? override.value : avgValue;
          const totalVal = sessions * value;
          const repVal = totalVal * (rate / 100);

          totalSess += sessions;
          totalFat += totalVal;
          totalRep += repVal;
        }
      });

      group.totalSessões = totalSess;
      group.faturamentoBruto = totalFat;
      group.repasseProfissional = totalRep;

      if (isCoordenadora(profId)) {
        group.repasseProfissional += 300;
      }

      group.comissaoClinica = group.faturamentoBruto - group.repasseProfissional + (isCoordenadora(profId) ? 300 : 0);
      group.repasseApto = group.repasseProfissional;
      group.comissaoRecebida = group.comissaoClinica;
    });

    return Array.from(groups.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredRepasses, profissionais, customRepasses]);

  const repasseStats = useMemo(() => {
    let totalSessões = 0;
    let faturamentoBruto = 0;
    let repasseProfissional = 0;
    let comissaoClinica = 0;

    consolidatedRepasses.forEach((group) => {
      totalSessões += group.totalSessões;
      faturamentoBruto += group.faturamentoBruto;
      repasseProfissional += group.repasseProfissional;
      comissaoClinica += group.comissaoClinica;
    });

    return {
      totalSessões,
      faturamentoBruto,
      repasseProfissional,
      comissaoClinica,
      repasseApto: repasseProfissional,
      repasseBloqueado: 0,
      comissaoRecebida: comissaoClinica,
      comissaoPendente: 0,
    };
  }, [consolidatedRepasses]);

  const repasseCardsStats = useMemo(() => {
    let totalSessões = 0;
    let repasseTotal = 0;
    let comissaoTotal = 0;

    consolidatedRepasses.forEach((group) => {
      totalSessões += group.totalSessões;
      repasseTotal += group.repasseProfissional;
      comissaoTotal += group.comissaoClinica;
    });

    return {
      totalSessões,
      repasseTotal,
      comissaoTotal,
    };
  }, [consolidatedRepasses]);

  const caixaLiquidoReal =
    stats.faturamentoRecebido - repasseStats.repasseApto - stats.totalDespesas;
  const caixaLiquidoPrevisto =
    stats.faturamentoTotal - repasseStats.repasseProfissional - stats.totalDespesas;

  // Billing Filters
  const [searchPatient, setSearchPatient] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profFilter, setProfFilter] = useState("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<"all" | "mensal" | "sessao">("all");
  const [subTab, setSubTab] = useState<"consolidado" | "historico">("consolidado");

  // Patient Faturas Modal state
  const [patientFaturasDialog, setPatientFaturasDialog] = useState<{
    open: boolean;
    pacienteId: string;
    pacienteNome: string;
  }>({ open: false, pacienteId: "", pacienteNome: "" });

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  const handleOpenPatientFaturas = (pacienteId: string, pacienteNome: string) => {
    setPatientFaturasDialog({ open: true, pacienteId, pacienteNome });
  };

  const getApoioFaturaValor = (fatura: any) => {
    const p = patientDetailsMap.get(fatura.paciente_id);
    if (!p) return Number(fatura.valor) || 0;
    
    const freq = p.apoio_frequencia || 'avulso';
    const customVal = p.apoio_valor_personalizado;
    
    if (freq === 'avulso') {
      const sessionsCount = (faturaItens || []).filter(
        (item: any) => item.fatura_id === fatura.id && item.agendamento_id
      ).length;
      const rate = (customVal !== null && customVal !== undefined && String(customVal) !== "") 
        ? Number(customVal) 
        : 50.00;
      return sessionsCount > 0 ? (sessionsCount * rate) : rate;
    } else {
      if (customVal !== null && customVal !== undefined && String(customVal) !== "") {
        return Number(customVal);
      }
      const defaultRates: Record<string, number> = {
        "1x": 120.00,
        "2x": 240.00,
        "3x": 360.00,
        semana_toda: 450.00
      };
      return defaultRates[freq] ?? 120.00;
    }
  };

  // Memoized consolidated billing by patient
  const consolidatedPatients = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        pacienteId: string;
        billingType: "mensal" | "sessao";
        nome: string;
        faturasPendentesCount: number;
        totalPendente: number;
        totalPago: number;
        totalGeral: number;
        temAtraso: boolean;
        faturas: any[];
      }
    >();

    for (const f of faturas || []) {
      if (profFilter !== "all") {
        const profIds = faturaProfIdsMap.get(f.id);
        if (!profIds || !profIds.has(profFilter)) continue;
      }

      const pId = f.paciente_id;
      if (!pId) continue;
      const patientName = patientMap.get(pId) || "Paciente Desconhecido";
      const pDetails = patientDetailsMap.get(pId);
      
      const billingType = f.especialidade === "Apoio" 
        ? "mensal" 
        : (pDetails && pDetails.valor_mensal && pDetails.valor_mensal > 0 ? "mensal" : "sessao");

      const key = `${pId}-${billingType}`;

      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          pacienteId: pId,
          billingType,
          nome: patientName,
          faturasPendentesCount: 0,
          totalPendente: 0,
          totalPago: 0,
          totalGeral: 0,
          temAtraso: false,
          faturas: [],
        };
        map.set(key, entry);
      }

      entry.faturas.push(f);
      const val = f.especialidade === "Apoio" ? getApoioFaturaValor(f) : (Number(f.valor) || 0);

      if (f.status === "paga") {
        entry.totalPago += val;
      } else if (f.status === "aberta" || f.status === "vencida") {
        entry.totalPendente += val;
        entry.faturasPendentesCount += 1;

        // Calculate delay days
        if (f.vencimento) {
          const today = startOfDay(new Date());
          const dueDate = startOfDay(new Date(f.vencimento + "T12:00:00"));
          const diff = differenceInDays(today, dueDate);
          if (diff > 0 || f.status === "vencida") {
            entry.temAtraso = true;
          }
        }
      }

      if (f.status !== "cancelada") {
        entry.totalGeral += val;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [faturas, patientMap, profFilter, faturaProfIdsMap, patientDetailsMap, faturaItens]);

  const filteredConsolidated = useMemo(() => {
    return consolidatedPatients.filter((c) => {
      const matchesSearch = normalizeString(c.nome).includes(normalizeString(searchPatient));
      if (statusFilter === "aberta" && c.totalPendente === 0) return false;
      if (statusFilter === "paga" && c.totalPago === 0) return false;
      if (statusFilter === "vencida" && !c.temAtraso) return false;
      return matchesSearch;
    });
  }, [consolidatedPatients, searchPatient, statusFilter]);

  const patientFaturas = useMemo(() => {
    if (!patientFaturasDialog.pacienteId) return [];
    return (faturas || [])
      .filter((f) => {
        const matchesPatient = f.paciente_id === patientFaturasDialog.pacienteId;
        let matchesProf = true;
        if (profFilter !== "all") {
          const profIds = faturaProfIdsMap.get(f.id);
          matchesProf = profIds ? profIds.has(profFilter) : false;
        }
        return matchesPatient && matchesProf;
      })
      .sort((a, b) => new Date(b.competencia).getTime() - new Date(a.competencia).getTime());
  }, [faturas, patientFaturasDialog.pacienteId, profFilter, faturaProfIdsMap]);

  const patientDetailedRows = useMemo(() => {
    const rows: any[] = [];
    (patientFaturas || []).forEach((f) => {
      let items = (faturaItens || []).filter((item: any) => item.fatura_id === f.id);
      if (f.especialidade === "Apoio") {
        items = items.filter((item: any) => !item.agendamento_id);
      }
      if (items.length === 0) {
        // Manual fatura or fatura with no items
        const rowProfId = f.profissional_id;
        if (profFilter !== "all" && rowProfId !== profFilter) return;

        let rowDesc = f.observacoes || (f.especialidade ? `${f.especialidade} (Manual)` : "Cobrança Manual");
        if (f.especialidade === "Apoio") {
          const p = patientDetailsMap.get(f.paciente_id);
          const freq = p?.apoio_frequencia || 'avulso';
          const freqLabels: Record<string, string> = {
            avulso: "Pacote Apoio - Sessões Avulsas",
            "1x": "Pacote Apoio - 1x por semana",
            "2x": "Pacote Apoio - 2x por semana",
            "3x": "Pacote Apoio - 3x por semana",
            semana_toda: "Pacote Apoio - Semana Inteira",
          };
          rowDesc = freqLabels[freq] || "Pacote Apoio";
        }

        let profNome = f.profissional_id ? (professionalMap.get(f.profissional_id) || "—") : "—";
        if (f.especialidade === "Apoio" && profNome === "—") {
          const fatProfs = faturaProfIdsMap.get(f.id);
          if (fatProfs && fatProfs.size > 0) {
            profNome = Array.from(fatProfs)
              .map((pId: string) => professionalMap.get(pId))
              .filter(Boolean)
              .join(", ") || "—";
          } else {
            const p = patientDetailsMap.get(f.paciente_id);
            const pProfs = p?.paciente_profissional || [];
            profNome = pProfs
              .filter((pp: any) => professionalMatchesSpecialty(pp.profissional_id, f.especialidade))
              .map((pp: any) => professionalMap.get(pp.profissional_id))
              .filter(Boolean)
              .join(", ") || "—";
          }
        }

        rows.push({
          id: `fatura-${f.id}`,
          faturaId: f.id,
          paciente_id: f.paciente_id,
          competencia: f.competencia,
          vencimento: f.vencimento,
          pago_em: f.pago_em,
          status: f.status,
          metodo: f.metodo,
          valor: f.especialidade === "Apoio" ? getApoioFaturaValor(f) : (Number(f.valor) || 0),
          descricao: rowDesc,
          profissionalNome: profNome,
          especialidade: f.especialidade || null,
          fatura: f,
          isFaturaOnly: true,
        });
      } else {
        // Session items
        items.forEach((item: any) => {
          const isApoioMatch = f.especialidade === "Apoio" && profFilter !== "all" && faturaProfIdsMap.get(f.id)?.has(profFilter);
          const rowProfId = isApoioMatch 
            ? profFilter 
            : (item.agendamento_id ? agendamentoProfIdMap.get(item.agendamento_id) : f.profissional_id);
          if (profFilter !== "all" && rowProfId !== profFilter) return;
 
          const profName = isApoioMatch 
            ? (professionalMap.get(profFilter) || "—") 
            : (item.agendamento_id ? (agendamentoProfIdMap.get(item.agendamento_id) ? professionalMap.get(agendamentoProfIdMap.get(item.agendamento_id)!) : null) : null);
          let finalProfName = profName || (f.profissional_id ? (professionalMap.get(f.profissional_id) || "—") : "—");
          if (f.especialidade === "Apoio" && finalProfName === "—") {
            const fatProfs = faturaProfIdsMap.get(f.id);
            if (fatProfs && fatProfs.size > 0) {
              finalProfName = Array.from(fatProfs)
                .map((pId: string) => professionalMap.get(pId))
                .filter(Boolean)
                .join(", ") || "—";
            } else {
              const p = patientDetailsMap.get(f.paciente_id);
              const pProfs = p?.paciente_profissional || [];
              finalProfName = pProfs
                .filter((pp: any) => professionalMatchesSpecialty(pp.profissional_id, f.especialidade))
                .map((pp: any) => professionalMap.get(pp.profissional_id))
                .filter(Boolean)
                .join(", ") || "—";
            }
          }

          let rowDesc = item.descricao || "Sessão";
          if (f.especialidade === "Apoio") {
            if (item.descricao && item.descricao.startsWith("Pacote Apoio")) {
              rowDesc = item.descricao;
            } else {
              const p = patientDetailsMap.get(f.paciente_id);
              const freq = p?.apoio_frequencia || 'avulso';
              const freqLabels: Record<string, string> = {
                avulso: "Pacote Apoio - Sessões Avulsas",
                "1x": "Pacote Apoio - 1x por semana",
                "2x": "Pacote Apoio - 2x por semana",
                "3x": "Pacote Apoio - 3x por semana",
                semana_toda: "Pacote Apoio - Semana Inteira",
              };
              rowDesc = freqLabels[freq] || "Pacote Apoio";
            }
          }
          
          rows.push({
            id: `item-${item.id}`,
            faturaId: f.id,
            paciente_id: f.paciente_id,
            competencia: f.competencia,
            vencimento: f.vencimento,
            pago_em: f.pago_em,
            status: f.status,
            metodo: f.metodo,
            valor: f.especialidade === "Apoio" ? getApoioFaturaValor(f) : (Number(item.total || 0)),
            descricao: rowDesc,
            profissionalNome: finalProfName,
            especialidade: f.especialidade || null,
            fatura: f,
            item: item,
            isFaturaOnly: false,
          });
        });
      }
    });

    // Sort by session date/time ascending, falling back to competence/vencimento
    return rows.sort((a, b) => {
      let timeA = parseDateFromDescription(a.descricao);
      let timeB = parseDateFromDescription(b.descricao);

      if (timeA === null && a.item?.agendamento_id) {
        const agDate = agendamentoDateMap.get(a.item.agendamento_id);
        if (agDate) timeA = new Date(agDate).getTime();
      }
      if (timeB === null && b.item?.agendamento_id) {
        const agDate = agendamentoDateMap.get(b.item.agendamento_id);
        if (agDate) timeB = new Date(agDate).getTime();
      }

      const dateA = timeA !== null ? timeA : (a.competencia ? new Date(a.competencia).getTime() : 0);
      const dateB = timeB !== null ? timeB : (b.competencia ? new Date(b.competencia).getTime() : 0);

      return dateA - dateB;
    });
  }, [patientFaturas, faturaItens, professionalMap, agendamentoProfMap, agendamentoProfIdMap, agendamentoStatusMap, agendamentoDateMap, profFilter, patientDetailsMap, faturaProfIdsMap]);

  const handlePrintAllBilling = () => {
    if (filteredConsolidated.length === 0) {
      toast.error("Nenhuma cobrança encontrada nos filtros selecionados para imprimir.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Por favor, permita pop-ups para imprimir.");
      return;
    }

    const brl = (val: number) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const getRowDateStr = (row: any) => {
      const rawDate = row.item?.agendamento_id ? agendamentoDateMap.get(row.item.agendamento_id) : null;
      if (rawDate) {
        return format(new Date(rawDate), "dd/MM/yyyy HH:mm");
      }
      if (row.competencia) {
        return format(new Date(row.competencia + "T12:00:00"), "MM/yyyy");
      }
      return "—";
    };

    const patientBlocksHtml = filteredConsolidated.map((c: any) => {
      const resps = responsaveisMap.get(c.pacienteId) || [];
      const respNames = resps.map((r: any) => `${r.nome}${r.parentesco ? ` (${r.parentesco})` : ""}`).join(", ");

      const pFats = c.faturas.filter((f: any) => {
        let matchesProf = true;
        if (profFilter !== "all") {
          const profIds = faturaProfIdsMap.get(f.id);
          matchesProf = profIds ? profIds.has(profFilter) : false;
        }
        return matchesProf;
      });

      const rows: any[] = [];
      pFats.forEach((f: any) => {
        let items = (faturaItens || []).filter((item: any) => item.fatura_id === f.id);
        if (f.especialidade === "Apoio") {
          items = items.filter((item: any) => !item.agendamento_id);
        }
        if (items.length === 0) {
          const rowProfId = f.profissional_id;
          if (profFilter !== "all" && rowProfId !== profFilter) return;

          let rowDesc = f.observacoes || (f.especialidade ? `${f.especialidade} (Manual)` : "Cobrança Manual");
          if (f.especialidade === "Apoio") {
            const p = patientDetailsMap.get(f.paciente_id);
            const freq = p?.apoio_frequencia || 'avulso';
            const freqLabels: Record<string, string> = {
              avulso: "Pacote Apoio - Sessões Avulsas",
              "1x": "Pacote Apoio - 1x por semana",
              "2x": "Pacote Apoio - 2x por semana",
              "3x": "Pacote Apoio - 3x por semana",
              semana_toda: "Pacote Apoio - Semana Inteira",
            };
            rowDesc = freqLabels[freq] || "Pacote Apoio";
          }

          let profNome = f.profissional_id ? (professionalMap.get(f.profissional_id) || "—") : "—";
          if (f.especialidade === "Apoio" && profNome === "—") {
            const fatProfs = faturaProfIdsMap.get(f.id);
            if (fatProfs && fatProfs.size > 0) {
              profNome = Array.from(fatProfs)
                .map((pId: string) => professionalMap.get(pId))
                .filter(Boolean)
                .join(", ") || "—";
            } else {
              const p = patientDetailsMap.get(f.paciente_id);
              const pProfs = p?.paciente_profissional || [];
              profNome = pProfs
                .filter((pp: any) => professionalMatchesSpecialty(pp.profissional_id, f.especialidade))
                .map((pp: any) => professionalMap.get(pp.profissional_id))
                .filter(Boolean)
                .join(", ") || "—";
            }
          }

          rows.push({
            id: `fatura-${f.id}`,
            faturaId: f.id,
            paciente_id: f.paciente_id,
            competencia: f.competencia,
            vencimento: f.vencimento,
            pago_em: f.pago_em,
            status: f.status,
            metodo: f.metodo,
            valor: f.especialidade === "Apoio" ? getApoioFaturaValor(f) : (Number(f.valor) || 0),
            descricao: rowDesc,
            profissionalNome: profNome,
            especialidade: f.especialidade || null,
            fatura: f,
            isFaturaOnly: true,
          });
        } else {
          items.forEach((item: any) => {
            const isApoioMatch = f.especialidade === "Apoio" && profFilter !== "all" && faturaProfIdsMap.get(f.id)?.has(profFilter);
            const rowProfId = isApoioMatch 
              ? profFilter 
              : (item.agendamento_id ? agendamentoProfIdMap.get(item.agendamento_id) : f.profissional_id);
            if (profFilter !== "all" && rowProfId !== profFilter) return;

            const profName = isApoioMatch 
              ? (professionalMap.get(profFilter) || "—") 
              : (item.agendamento_id ? (agendamentoProfIdMap.get(item.agendamento_id) ? professionalMap.get(agendamentoProfIdMap.get(item.agendamento_id)!) : null) : null);
            let finalProfName = profName || (f.profissional_id ? (professionalMap.get(f.profissional_id) || "—") : "—");
            if (f.especialidade === "Apoio" && finalProfName === "—") {
              const fatProfs = faturaProfIdsMap.get(f.id);
              if (fatProfs && fatProfs.size > 0) {
                finalProfName = Array.from(fatProfs)
                  .map((pId: string) => professionalMap.get(pId))
                  .filter(Boolean)
                  .join(", ") || "—";
              } else {
                const p = patientDetailsMap.get(f.paciente_id);
                const pProfs = p?.paciente_profissional || [];
                finalProfName = pProfs
                  .filter((pp: any) => professionalMatchesSpecialty(pp.profissional_id, f.especialidade))
                  .map((pp: any) => professionalMap.get(pp.profissional_id))
                  .filter(Boolean)
                  .join(", ") || "—";
              }
            }

            let rowDesc = item.descricao || "Sessão";
            if (f.especialidade === "Apoio") {
              if (item.descricao && item.descricao.startsWith("Pacote Apoio")) {
                rowDesc = item.descricao;
              } else {
                const p = patientDetailsMap.get(f.paciente_id);
                const freq = p?.apoio_frequencia || 'avulso';
                const freqLabels: Record<string, string> = {
                  avulso: "Pacote Apoio - Sessões Avulsas",
                  "1x": "Pacote Apoio - 1x por semana",
                  "2x": "Pacote Apoio - 2x por semana",
                  "3x": "Pacote Apoio - 3x por semana",
                  semana_toda: "Pacote Apoio - Semana Inteira",
                };
                rowDesc = freqLabels[freq] || "Pacote Apoio";
              }
            }

            rows.push({
              id: `item-${item.id}`,
              faturaId: f.id,
              paciente_id: f.paciente_id,
              competencia: f.competencia,
              vencimento: f.vencimento,
              pago_em: f.pago_em,
              status: f.status,
              metodo: f.metodo,
              valor: f.especialidade === "Apoio" ? getApoioFaturaValor(f) : (Number(item.total || 0)),
              descricao: rowDesc,
              profissionalNome: finalProfName,
              especialidade: f.especialidade || null,
              fatura: f,
              item: item,
              isFaturaOnly: false,
            });
          });
        }
      });

      rows.sort((a, b) => {
        let timeA = parseDateFromDescription(a.descricao);
        let timeB = parseDateFromDescription(b.descricao);

        if (timeA === null && a.item?.agendamento_id) {
          const agDate = agendamentoDateMap.get(a.item.agendamento_id);
          if (agDate) timeA = new Date(agDate).getTime();
        }
        if (timeB === null && b.item?.agendamento_id) {
          const agDate = agendamentoDateMap.get(b.item.agendamento_id);
          if (agDate) timeB = new Date(agDate).getTime();
        }

        const dateA = timeA !== null ? timeA : (a.competencia ? new Date(a.competencia).getTime() : 0);
        const dateB = timeB !== null ? timeB : (b.competencia ? new Date(b.competencia).getTime() : 0);

        return dateA - dateB;
      });

      const profGroups = new Map<string, any[]>();
      rows.forEach((row) => {
        const list = profGroups.get(row.profissionalNome) || [];
        list.push(row);
        profGroups.set(row.profissionalNome, list);
      });

      const profSectionsHtml = Array.from(profGroups.entries()).map(([profName, groupRows]) => {
        const groupTotal = groupRows.reduce((acc, r) => acc + r.valor, 0);
        const groupRowsHtml = groupRows.map((row) => {
          let statusStyle = "color: #e11d48; font-weight: bold;";
          if (row.status === "paga") statusStyle = "color: #059669; font-weight: bold;";
          else if (row.status === "aberta") statusStyle = "color: #d97706; font-weight: bold;";
          
          return `
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 6px; font-family: monospace;">${getRowDateStr(row)}</td>
              <td style="border: 1px solid #cbd5e1; padding: 6px;">${row.descricao}</td>
              <td style="border: 1px solid #cbd5e1; padding: 6px; text-transform: capitalize; ${statusStyle}">${row.status}</td>
              <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-weight: bold;">${brl(row.valor)}</td>
            </tr>
          `;
        }).join("");

        return `
          <div style="margin-top: 15px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
            <div style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 8px 12px; font-weight: bold; color: #1e293b; display: flex; justify-content: space-between;">
              <span>👤 Profissional: ${profName}</span>
              <span style="color: #4f46e5;">Subtotal: ${brl(groupTotal)}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background-color: #ffffff; border-bottom: 1px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 6px; text-align: left; width: 130px;">Data/Período</th>
                  <th style="padding: 6px; text-align: left;">Descrição da Sessão/Fatura</th>
                  <th style="padding: 6px; text-align: left; width: 80px;">Status</th>
                  <th style="padding: 6px; text-align: right; width: 90px;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${groupRowsHtml}
              </tbody>
            </table>
          </div>
        `;
      }).join("");

      return `
        <div style="margin-bottom: 40px; border-bottom: 2px dashed #cbd5e1; padding-bottom: 25px; page-break-after: auto;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 16px; color: #1e293b; font-weight: bold;">${c.nome}</h2>
              ${respNames ? `<div style="font-size: 11px; color: #475569; margin-top: 2px; font-weight: 500;">Responsável: ${respNames}</div>` : ""}
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                Tipo de Faturamento: <span style="font-weight: bold; text-transform: uppercase;">${c.billingType}</span>
              </div>
            </div>
          </div>
          
          ${rows.length === 0 ? `
            <div style="padding: 15px; border: 1px dashed #cbd5e1; border-radius: 6px; text-align: center; font-size: 12px; color: #64748b; margin-top: 15px;">
              Nenhum item ou sessão de cobrança encontrado para os filtros ativos.
            </div>
          ` : profSectionsHtml}
        </div>
      `;
    }).join("");

    const statusLabel = statusFilter === "all" ? "Todos os Status" : statusFilter;
    const profLabel = profFilter === "all" ? "Todos os Profissionais" : (professionalMap.get(profFilter) || profFilter);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Relatório Geral da Central de Cobrança</title>
        <style>
          body { font-family: sans-serif; margin: 30px; color: #1e293b; }
          h1 { font-size: 20px; font-weight: bold; color: #4f46e5; margin: 0; }
          .header-title { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; }
          .filter-summary { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 15px; margin-top: 15px; margin-bottom: 25px; font-size: 11px; display: grid; grid-template-cols: 1fr 1fr 1fr; gap: 10px; }
          .filter-item span { font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 9px; display: block; }
          .filter-item div { font-size: 11px; font-weight: 600; margin-top: 2px; }
          @media print {
            body { margin: 15px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header-title">
          <div>
            <h1>Relatório Geral da Central de Cobrança</h1>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Espaço Multi — Gestão Financeira Consolidada</div>
          </div>
          <button onclick="window.print()" style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Imprimir Relatório / Salvar como PDF</button>
        </div>
        
        <div class="filter-summary">
          <div class="filter-item"><span>Período Selecionado</span><div>${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}</div></div>
          <div class="filter-item"><span>Filtro de Status</span><div>${statusLabel}</div></div>
          <div class="filter-item"><span>Filtro de Profissional</span><div>${profLabel}</div></div>
        </div>

        ${patientBlocksHtml}
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleWhatsAppClick = (pacienteId: string, totalPendente: number, patientName: string) => {
    const resps = responsaveisMap.get(pacienteId) || [];
    const primaryResp = resps.find((r) => r.whatsapp) || resps.find((r) => r.telefone) || resps[0];
    if (!primaryResp) {
      toast.error("Nenhum responsável com telefone cadastrado para este paciente.");
      return;
    }
    const num = primaryResp.whatsapp || primaryResp.telefone;
    if (!num) {
      toast.error("Responsável sem telefone ou WhatsApp cadastrado.");
      return;
    }
    const cleanNum = String(num).replace(/\D/g, "");
    if (!cleanNum) {
      toast.error("Número de telefone inválido.");
      return;
    }
    let phoneWithCountry = cleanNum;
    if (cleanNum.length === 10 || cleanNum.length === 11) {
      phoneWithCountry = "55" + cleanNum;
    }

    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const monthIndex = inicio ? parseInt(inicio.split("-")[1], 10) - 1 : -1;
    const mesRef = months[monthIndex] || "";

    const periodFats = (faturas || []).filter(
      (f) => f.paciente_id === pacienteId && (f.status === "aberta" || f.status === "vencida")
    );

    const summaryLines: string[] = [];
    const groupedSessions: Record<string, { count: number; spec: string; profName: string }> = {};
    const groupedPackages: Record<string, { desc: string; profName: string }> = {};

    periodFats.forEach((f) => {
      let items = (faturaItens || []).filter((item: any) => item.fatura_id === f.id);
      if (f.especialidade === "Apoio") {
        items = items.filter((item: any) => !item.agendamento_id);
      }

      if (items.length === 0) {
        let profNome = f.profissional_id ? (professionalMap.get(f.profissional_id) || "—") : "—";
        if (f.especialidade === "Apoio" && profNome === "—") {
          const fatProfs = faturaProfIdsMap.get(f.id);
          if (fatProfs && fatProfs.size > 0) {
            profNome = Array.from(fatProfs)
              .map((pId: string) => professionalMap.get(pId))
              .filter(Boolean)
              .join(", ") || "—";
          } else {
            const p = patientDetailsMap.get(f.paciente_id);
            const pProfs = p?.paciente_profissional || [];
            profNome = pProfs
              .filter((pp: any) => professionalMatchesSpecialty(pp.profissional_id, f.especialidade))
              .map((pp: any) => professionalMap.get(pp.profissional_id))
              .filter(Boolean)
              .join(", ") || "—";
          }
        }

        if (f.especialidade === "Apoio") {
          const p = patientDetailsMap.get(f.paciente_id);
          const freq = p?.apoio_frequencia || 'avulso';
          const freqLabels: Record<string, string> = {
            avulso: "Pacote Apoio - Sessões Avulsas",
            "1x": "Pacote Apoio - 1x por semana",
            "2x": "Pacote Apoio - 2x por semana",
            "3x": "Pacote Apoio - 3x por semana",
            semana_toda: "Pacote Apoio - Semana Inteira",
          };
          const desc = freqLabels[freq] || "Pacote Apoio";
          const key = `${desc}-${profNome}`;
          groupedPackages[key] = { desc, profName: profNome };
        } else {
          const spec = f.especialidade || "Cobrança Manual";
          const key = `${spec}-${profNome}`;
          if (!groupedSessions[key]) {
            groupedSessions[key] = { count: 0, spec, profName: profNome };
          }
          groupedSessions[key].count += 1;
        }
      } else {
        items.forEach((item: any) => {
          const profId = item.agendamento_id ? agendamentoProfIdMap.get(item.agendamento_id) : f.profissional_id;
          const profName = profId ? (professionalMap.get(profId) || "—") : "—";
          
          if (f.especialidade === "Apoio") {
            const desc = item.descricao || "Pacote Apoio";
            const key = `${desc}-${profName}`;
            groupedPackages[key] = { desc, profName };
          } else {
            const spec = item.descricao ? item.descricao.split(" - ")[0].trim() : (f.especialidade || "Sessão");
            const key = `${spec}-${profName}`;
            if (!groupedSessions[key]) {
              groupedSessions[key] = { count: 0, spec, profName };
            }
            groupedSessions[key].count += 1;
          }
        });
      }
    });

    Object.values(groupedPackages).forEach((p) => {
      summaryLines.push(`• ${p.desc} (${p.profName})`);
    });

    Object.values(groupedSessions).forEach((s) => {
      summaryLines.push(`• ${s.count} sessão(ões) de ${s.spec} com ${s.profName}`);
    });

    const summaryText = summaryLines.length > 0 ? "\n\nResumo:\n" + summaryLines.join("\n") : "";

    const textMsg = `Olá, ${primaryResp.nome}! Gostaríamos de lembrar do pagamento referente aos atendimentos de ${mesRef} de *${patientName}* no valor total de *${brl(totalPendente)}*.${summaryText}

Nosso pix: 54.747.611/0001-27

 Agradecemos a atenção! *Espaço Multi*`;

    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(textMsg)}`;
    window.open(url, "_blank");
  };

  // Billing Modals
  const [payDialog, setPayDialog] = useState<{ open: boolean; fatura: any }>({
    open: false,
    fatura: null,
  });
  const [editDialog, setEditDialog] = useState<{ open: boolean; fatura: any }>({
    open: false,
    fatura: null,
  });
  const [createDialog, setCreateDialog] = useState(false);

  // Form states
  const [payForm, setPayForm] = useState({
    pago_em: format(new Date(), "yyyy-MM-dd"),
    metodo: "pix",
    observacoes: "",
  });

  const [faturaForm, setFaturaForm] = useState({
    paciente_id: "",
    competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    vencimento: "",
    valor: "",
    status: "aberta",
    pago_em: "",
    observacoes: "",
    profissional_id: "",
    especialidade: "",
  });

  const availableSpecialties = useMemo(() => {
    if (!faturaForm.profissional_id) return [];
    const prof = (profissionais || []).find((p: any) => p.id === faturaForm.profissional_id);
    if (!prof?.especialidade) return [];
    return prof.especialidade
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }, [faturaForm.profissional_id, profissionais]);

  const [invoiceDetailsDialog, setInvoiceDetailsDialog] = useState<{ open: boolean; fatura: any }>({
    open: false,
    fatura: null,
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemDesc, setEditingItemDesc] = useState("");
  const [editingItemVal, setEditingItemVal] = useState("");
  const [editingItemStatus, setEditingItemStatus] = useState<string>("");

  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemVal, setNewItemVal] = useState("");

  // Helper to get pricing based on professional configuration and patient-specific discounts
  const getFaturaPrice = (pacienteId: string, profissionalId: string, especialidade: string, isAnamnese = false) => {
    if (!pacienteId) return 0;

    if (especialidade === "Apoio") {
      const p = patientDetailsMap.get(pacienteId);
      if (p) {
        const freq = p.apoio_frequencia || 'avulso';
        const customVal = p.apoio_valor_personalizado;
        if (customVal !== null && customVal !== undefined && String(customVal) !== "") {
          return Number(customVal);
        }
        const defaultRates: Record<string, number> = {
          avulso: 50.00,
          "1x": 120.00,
          "2x": 240.00,
          "3x": 360.00,
          semana_toda: 450.00
        };
        return defaultRates[freq] ?? 50.00;
      }
      return 0;
    }

    if (!profissionalId) return 0;
    const prof = (profissionais || []).find((p: any) => p.id === profissionalId);
    if (!prof) return 0;

    const config = prof.valores_config || { especialidades: [], descontos: [] };
    const valorDefault = Number(prof.valor_sessao || 0);

    // 1. Check custom patient discount
    if (Array.isArray(config.descontos) && config.descontos.length > 0) {
      const d = config.descontos.find(
        (item: any) =>
          item.paciente_id === pacienteId &&
          String(item.especialidade || "").toLowerCase() === String(especialidade || "").toLowerCase(),
      );
      if (d) {
        return isAnamnese ? Number(d.valor_avaliacao || 0) : Number(d.valor_sessao || 0);
      }
    }

    // 2. Check standard specialty rates
    if (Array.isArray(config.especialidades) && config.especialidades.length > 0) {
      const e = config.especialidades.find(
        (item: any) => String(item.nome || "").toLowerCase() === String(especialidade || "").toLowerCase(),
      );
      if (e) {
        if (isAnamnese) {
          return Number(e.valor_avaliacao || 0);
        } else {
          if (String(especialidade).toLowerCase() === "ap") return 0;
          return Number(e.valor_sessao ?? valorDefault ?? 0);
        }
      }
    }

    // 3. Default professional rate
    if (isAnamnese) {
      return 0;
    } else {
      return valorDefault;
    }
  };

  const updateFaturaFormPrice = (pacienteId: string, profissionalId: string, especialidade: string) => {
    const price = getFaturaPrice(pacienteId, profissionalId, especialidade);
    setFaturaForm((prev) => ({ ...prev, valor: price > 0 ? String(price) : "" }));
  };

  const detectedDiscount = useMemo(() => {
    if (!faturaForm.paciente_id || !faturaForm.profissional_id || !faturaForm.especialidade) return null;
    const prof = (profissionais || []).find((p: any) => p.id === faturaForm.profissional_id);
    if (!prof) return null;
    const config = prof.valores_config || { descontos: [] };
    if (!Array.isArray(config.descontos)) return null;

    return config.descontos.find(
      (d: any) =>
        d.paciente_id === faturaForm.paciente_id &&
        String(d.especialidade || "").toLowerCase() === String(faturaForm.especialidade || "").toLowerCase(),
    );
  }, [faturaForm.paciente_id, faturaForm.profissional_id, faturaForm.especialidade, profissionais]);

  const detectedSpecialtyRate = useMemo(() => {
    if (detectedDiscount) return null;
    if (!faturaForm.profissional_id || !faturaForm.especialidade) return null;
    const prof = (profissionais || []).find((p: any) => p.id === faturaForm.profissional_id);
    if (!prof) return null;
    const config = prof.valores_config || { especialidades: [] };
    if (!Array.isArray(config.especialidades)) return null;

    return config.especialidades.find(
      (e: any) => String(e.nome || "").toLowerCase() === String(faturaForm.especialidade || "").toLowerCase(),
    );
  }, [detectedDiscount, faturaForm.profissional_id, faturaForm.especialidade, profissionais]);

  // Detailed Fatura form states for inline editing the parent invoice inside details dialog
  const [detailsFaturaForm, setDetailsFaturaForm] = useState({
    competencia: "",
    vencimento: "",
    status: "aberta",
    pago_em: "",
    metodo: "pix",
    observacoes: "",
    profissional_id: "",
    especialidade: "",
  });

  const detailsAvailableSpecialties = useMemo(() => {
    if (!detailsFaturaForm.profissional_id) return [];
    const prof = (profissionais || []).find((p: any) => p.id === detailsFaturaForm.profissional_id);
    if (!prof?.especialidade) return [];
    return prof.especialidade
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }, [detailsFaturaForm.profissional_id, profissionais]);

  const activeDetailedFatura = useMemo(() => {
    if (!invoiceDetailsDialog.fatura?.id) return null;
    return (faturas || []).find((f) => f.id === invoiceDetailsDialog.fatura.id) || invoiceDetailsDialog.fatura;
  }, [faturas, invoiceDetailsDialog.fatura]);

  const detectedDetailsDiscount = useMemo(() => {
    if (!activeDetailedFatura?.paciente_id || !activeDetailedFatura?.profissional_id || !activeDetailedFatura?.especialidade) return null;
    const prof = (profissionais || []).find((p: any) => p.id === activeDetailedFatura.profissional_id);
    if (!prof) return null;
    const config = prof.valores_config || { descontos: [] };
    if (!Array.isArray(config.descontos)) return null;

    return config.descontos.find(
      (d: any) =>
        d.paciente_id === activeDetailedFatura.paciente_id &&
        String(d.especialidade || "").toLowerCase() === String(activeDetailedFatura.especialidade || "").toLowerCase(),
    );
  }, [activeDetailedFatura, profissionais]);

  const detectedDetailsSpecialtyRate = useMemo(() => {
    if (detectedDetailsDiscount) return null;
    if (!activeDetailedFatura?.profissional_id || !activeDetailedFatura?.especialidade) return null;
    const prof = (profissionais || []).find((p: any) => p.id === activeDetailedFatura.profissional_id);
    if (!prof) return null;
    const config = prof.valores_config || { especialidades: [] };
    if (!Array.isArray(config.especialidades)) return null;

    return config.especialidades.find(
      (e: any) => String(e.nome || "").toLowerCase() === String(activeDetailedFatura.especialidade || "").toLowerCase(),
    );
  }, [detectedDetailsDiscount, activeDetailedFatura, profissionais]);

  const handleOpenInvoiceDetails = (fatura: any) => {
    setInvoiceDetailsDialog({ open: true, fatura });
    
    let profId = fatura.profissional_id || "";
    if (fatura.especialidade === "Apoio" && !profId) {
      const p = patientDetailsMap.get(fatura.paciente_id);
      const matchedProf = p?.paciente_profissional?.find((pp: any) =>
        professionalMatchesSpecialty(pp.profissional_id, fatura.especialidade)
      );
      if (matchedProf) {
        profId = matchedProf.profissional_id;
      }
    }

    setDetailsFaturaForm({
      competencia: fatura.competencia || "",
      vencimento: fatura.vencimento || "",
      status: fatura.status || "aberta",
      pago_em: fatura.pago_em ? format(new Date(fatura.pago_em), "yyyy-MM-dd") : "",
      metodo: fatura.metodo || "pix",
      observacoes: fatura.observacoes || "",
      profissional_id: profId,
      especialidade: fatura.especialidade || "",
    });
    setEditingItemId(null);
    setNewItemDesc("");
    const price = getFaturaPrice(fatura.paciente_id, profId, fatura.especialidade);
    setNewItemVal(price > 0 ? String(price) : "");
  };

  const handleOpenConfirmPayment = (fatura: any) => {
    setPayForm({
      pago_em: format(new Date(), "yyyy-MM-dd"),
      metodo: fatura.metodo || "pix",
      observacoes: fatura.observacoes || "",
    });
    setPayDialog({ open: true, fatura });
  };

  const handleOpenEdit = (fatura: any) => {
    setFaturaForm({
      paciente_id: fatura.paciente_id,
      competencia: fatura.competencia,
      vencimento: fatura.vencimento || "",
      valor: String(fatura.valor),
      status: fatura.status,
      pago_em: fatura.pago_em ? format(new Date(fatura.pago_em), "yyyy-MM-dd") : "",
      observacoes: fatura.observacoes || "",
      profissional_id: fatura.profissional_id || "",
      especialidade: fatura.especialidade || "",
    });
    setEditDialog({ open: true, fatura });
  };

  const getDaysDelayed = (fatura: any) => {
    if (fatura.status === "paga") {
      if (fatura.pago_em && fatura.vencimento) {
        const payDate = startOfDay(new Date(fatura.pago_em));
        const dueDate = startOfDay(new Date(fatura.vencimento + "T12:00:00"));
        const diff = differenceInDays(payDate, dueDate);
        return diff > 0 ? diff : 0;
      }
      return 0;
    }
    if (fatura.status === "cancelada") return 0;
    if (fatura.vencimento) {
      const today = startOfDay(new Date());
      const dueDate = startOfDay(new Date(fatura.vencimento + "T12:00:00"));
      const diff = differenceInDays(today, dueDate);
      return diff > 0 ? diff : 0;
    }
    return 0;
  };

  const filteredFaturas = useMemo(() => {
    return (faturas || [])
      .filter((f) => {
        const patientName = patientMap.get(f.paciente_id) || "";
        const matchesSearch = normalizeString(patientName).includes(normalizeString(searchPatient));
        const matchesStatus = statusFilter === "all" || f.status === statusFilter;

        let matchesProf = true;
        if (profFilter !== "all") {
          const profIds = faturaProfIdsMap.get(f.id);
          matchesProf = profIds ? profIds.has(profFilter) : false;
        }

        return matchesSearch && matchesStatus && matchesProf;
      })
      .sort((a, b) => new Date(a.competencia).getTime() - new Date(b.competencia).getTime());
  }, [faturas, searchPatient, statusFilter, profFilter, faturaProfIdsMap, patientMap]);
  const mensalPatients = useMemo(() => {
    return filteredConsolidated.filter((c) => c.billingType === "mensal");
  }, [filteredConsolidated]);

  const sessaoPatients = useMemo(() => {
    return filteredConsolidated.filter((c) => c.billingType === "sessao");
  }, [filteredConsolidated]);

  const renderPatientTable = (list: typeof filteredConsolidated, emptyMessage: string) => {
    if (list.length === 0) {
      return (
        <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-card/30">
          {emptyMessage}
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader className="bg-muted/40 font-semibold text-foreground">
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Profissionais</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-center">Fats. Pend.</TableHead>
              <TableHead>Soma Pend.</TableHead>
              <TableHead>Soma Paga</TableHead>
              <TableHead>Soma Geral</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-[130px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((c) => {
              const resps = responsaveisMap.get(c.pacienteId) || [];
              const primaryResp =
                resps.find((r) => r.whatsapp) ||
                resps.find((r) => r.telefone) ||
                resps[0];

              return (
                <TableRow key={c.key} className="hover:bg-muted/30">
                  <TableCell className="font-semibold text-foreground">
                    <div>{c.nome}</div>
                    {(() => {
                      const p = patientDetailsMap.get(c.pacienteId);
                      const hasApoio = p?.cids_secundarios?.some((s: string) => s.toLowerCase() === "apoio" || s.toUpperCase() === "AP");
                      if (hasApoio) {
                        const freq = p?.apoio_frequencia || 'avulso';
                        const customVal = p?.apoio_valor_personalizado;
                        let label = "";
                        if (freq === 'avulso') label = `Apoio: Avulso (${customVal ? brl(customVal) : "R$ 50,00"}/sessão)`;
                        else if (freq === '1x') label = `Apoio: 1x/semana (${customVal ? brl(customVal) : "R$ 120,00"}/mês)`;
                        else if (freq === '2x') label = `Apoio: 2x/semana (${customVal ? brl(customVal) : "R$ 240,00"}/mês)`;
                        else if (freq === '3x') label = `Apoio: 3x/semana (${customVal ? brl(customVal) : "R$ 360,00"}/mês)`;
                        else if (freq === 'semana_toda') label = `Apoio: Semana Toda (${customVal ? brl(customVal) : "R$ 450,00"}/mês)`;
                        return (
                          <div className="space-y-1 mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-normal block bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5 w-max">
                              {label}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[155px]">
                      {getPatientProfessionals(c.pacienteId).length > 0 ? (
                        getPatientProfessionals(c.pacienteId).map((name) => (
                          <Badge
                            key={name}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap"
                          >
                            {name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {primaryResp ? (
                      <div className="flex items-center gap-2">
                        <div className="text-sm">
                          <span className="font-semibold text-foreground block leading-tight">
                            {primaryResp.nome}
                          </span>
                          {primaryResp.parentesco && (
                            <span className="text-muted-foreground text-[11px]">
                              {primaryResp.parentesco}
                            </span>
                          )}
                        </div>
                        {(primaryResp.whatsapp || primaryResp.telefone) && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-500/40 shrink-0"
                            onClick={() =>
                              handleWhatsAppClick(c.pacienteId, c.totalPendente, c.nome)
                            }
                            title={`Chamar no WhatsApp: ${primaryResp.whatsapp || primaryResp.telefone}`}
                          >
                            <MessageCircle className="h-4 w-4 fill-emerald-600/10" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        Nenhum responsável
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {c.faturasPendentesCount}
                  </TableCell>
                  <TableCell
                    className={`font-semibold ${c.totalPendente > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                  >
                    {brl(c.totalPendente)}
                  </TableCell>
                  <TableCell
                    className={`font-medium ${c.totalPago > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                  >
                    {brl(c.totalPago)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {brl(c.totalGeral)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.temAtraso
                          ? "destructive"
                          : c.totalPendente > 0
                            ? "outline"
                            : c.totalPago > 0
                              ? "default"
                              : "secondary"
                      }
                      className={
                        c.temAtraso
                          ? "bg-rose-500 hover:bg-rose-600 text-white border-transparent"
                          : c.totalPendente > 0
                            ? "bg-sky-500 hover:bg-sky-600 text-white border-transparent"
                            : c.totalPago > 0
                              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
                              : ""
                      }
                    >
                      {c.temAtraso
                        ? "Atrasado"
                        : c.totalPendente > 0
                          ? "No Prazo"
                          : c.totalPago > 0
                            ? "Em Dia"
                            : "Sem Faturas"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex justify-end gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.totalPendente > 0 && (
                        <Button
                          variant="outline"
                          size="icon"
                          title="Confirmar pagamento de todas as faturas do período"
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-500/40"
                          onClick={() => {
                            if (
                              confirm(
                                `Deseja confirmar o pagamento de todas as faturas pendentes do período do paciente ${c.nome} no valor total de ${brl(c.totalPendente)}?`
                              )
                            ) {
                              confirmAllPatientPaymentsMutation.mutate({
                                pacienteId: c.pacienteId,
                                patientName: c.nome,
                              });
                            }
                          }}
                          disabled={confirmAllPatientPaymentsMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        title="Ver Faturas"
                        onClick={() => handleOpenPatientFaturas(c.pacienteId, c.nome)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Nova Cobrança para este Paciente"
                        className="h-8 w-8 text-primary hover:bg-primary/5"
                        onClick={() => {
                          setFaturaForm({
                            paciente_id: c.pacienteId,
                            competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                            vencimento: "",
                            valor: "",
                            status: "aberta",
                            pago_em: "",
                            observacoes: "",
                            profissional_id: "",
                            especialidade: "",
                          });
                          setCreateDialog(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      {/* Date Filter */}
      <Card className="border-border shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <Calendar className="h-3.5 w-3.5" /> Data Início
            </Label>
            <Input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <Calendar className="h-3.5 w-3.5" /> Data Fim
            </Label>
            <Input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Financial Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-500/10 shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Receita Recebida
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {brl(stats.faturamentoRecebido)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Total Faturado no período:{" "}
                <span className="font-medium">{brl(stats.faturamentoTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Faturas Pendentes
              </div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {brl(stats.faturamentoPendente)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                A Receber: <span className="font-medium">{brl(stats.faturamentoAReceber)}</span> |
                Vencido: <span className="font-medium">{brl(stats.faturamentoVencido)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-rose-500/10 shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200">
          <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400">
              <TrendingDown className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Despesas Totais
              </div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {brl(stats.totalDespesas)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Comprometimento de receita no período selecionado
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200 ${
            stats.balancoReal >= 0 ? "border-emerald-500/10" : "border-rose-500/10"
          }`}
        >
          <div
            className={`absolute top-0 left-0 w-full h-1 ${
              stats.balancoReal >= 0 ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <CardContent className="flex items-center gap-4 p-5">
            <div
              className={`grid h-12 w-12 place-items-center rounded-xl ${
                stats.balancoReal >= 0
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400"
              }`}
            >
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Balanço Líquido
              </div>
              <div
                className={`text-2xl font-bold ${
                  stats.balancoReal >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {brl(stats.balancoReal)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Balanço Estimado (Total Faturado):{" "}
                <span className="font-semibold">{brl(stats.balancoEstimado)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="cobrancas" className="w-full space-y-6">
        <TabsList className="bg-muted p-1 rounded-xl inline-flex">
          <TabsTrigger value="cobrancas" className="rounded-lg px-4 py-2 text-sm font-medium">
            Cobranças por Paciente
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="rounded-lg px-4 py-2 text-sm font-medium">
            Pagamento dos Profissionais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cobrancas" className="mt-0">
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle className="text-lg">Central de Cobrança</CardTitle>
                <CardDescription>
                  Acompanhamento consolidado de valores, contato com responsáveis e confirmação de
                  pagamentos.
                </CardDescription>
              </div>
              <div className="flex gap-2 self-start sm:self-center">
                <Button
                  onClick={handlePrintAllBilling}
                  disabled={filteredConsolidated.length === 0}
                  variant="outline"
                  className="gap-1.5 border-primary/20 text-primary hover:bg-primary/5"
                >
                  <Printer className="h-4 w-4" /> Imprimir Relatório Geral
                </Button>
                <Button
                  onClick={() => {
                    setFaturaForm({
                      paciente_id: "",
                      competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                      vencimento: "",
                      valor: "",
                      status: "aberta",
                      pago_em: "",
                      observacoes: "",
                      profissional_id: "",
                      especialidade: "",
                    });
                    setCreateDialog(true);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Nova Cobrança
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar paciente..."
                    value={searchPatient}
                    onChange={(e) => setSearchPatient(e.target.value)}
                    className="pl-9 h-10"
                  />
                </div>
                <div className="w-[180px]">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      <SelectItem value="aberta">Em Aberto</SelectItem>
                      <SelectItem value="paga">Pagas</SelectItem>
                      <SelectItem value="vencida">Vencidas</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[190px]">
                  <Select value={profFilter} onValueChange={setProfFilter}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Todos os Profissionais" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Profissionais</SelectItem>
                      {(profissionais || [])
                        .filter((p: any) => {
                          if (p.id === profFilter) return true;
                          if (p.ativo) return true;
                          const config = p.valores_config as any;
                          if (config?.ativo_ate) {
                            const targetMonth = inicio.substring(0, 7);
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
                </div>
                <div className="w-[190px]">
                  <Select
                    value={paymentTypeFilter}
                    onValueChange={(val: any) => setPaymentTypeFilter(val)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Tipo de Faturamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Faturamentos</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="sessao">Por Sessão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loadingFaturas ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Carregando cobranças consolidadas...
                </div>
              ) : filteredConsolidated.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  Nenhuma cobrança consolidada encontrada para os filtros selecionados.
                </div>
              ) : (
                <div className="space-y-6">
                  {(paymentTypeFilter === "all" || paymentTypeFilter === "mensal") && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-sm text-foreground bg-muted/40 px-3 py-2 rounded-lg border border-border/50">
                        <span className="text-primary font-bold">💳 Pagamento Mensal</span>
                        <span className="text-xs text-muted-foreground">
                          ({mensalPatients.length} {mensalPatients.length === 1 ? "paciente" : "pacientes"})
                        </span>
                      </div>
                      {renderPatientTable(mensalPatients, "Nenhum paciente com faturamento mensal.")}
                    </div>
                  )}

                  {(paymentTypeFilter === "all" || paymentTypeFilter === "sessao") && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-sm text-foreground bg-muted/40 px-3 py-2 rounded-lg border border-border/50">
                        <span className="text-primary font-bold">📅 Pagamento por Sessão</span>
                        <span className="text-xs text-muted-foreground">
                          ({sessaoPatients.length} {sessaoPatients.length === 1 ? "paciente" : "pacientes"})
                        </span>
                      </div>
                      {renderPatientTable(sessaoPatients, "Nenhum paciente com faturamento por sessão.")}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagamentos" className="space-y-6 mt-0">
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
              <CardContent className="flex items-center gap-4 p-5">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/5 text-primary">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total de Sessões
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {repasseCardsStats.totalSessões}
                  </div>
                  <div className="text-[11px] text-muted-foreground">No período selecionado</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/10 shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              <CardContent className="flex items-center gap-4 p-5">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                  <Check className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Repasse Profissional
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {brl(repasseCardsStats.repasseTotal)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Valor total de repasses</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/10 shadow-sm relative overflow-hidden group hover:shadow-md transition duration-200">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
              <CardContent className="flex items-center gap-4 p-5">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
                  <Clock className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Comissão Clínica
                  </div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {brl(repasseCardsStats.comissaoTotal)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Valor total da comissão
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>



          {/* Main Calculation Content */}
          {loadingAgendamentos || loadingFaturaItens ? (
            <Card className="border-border shadow-sm p-8 text-center text-sm text-muted-foreground">
              Carregando dados de agendamentos e faturamento...
            </Card>
          ) : (
            /* CONSOLIDATED VIEW OF ALL PROFESSIONALS */
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Resumo por Profissional</CardTitle>
                <CardDescription>
                  Valores totais a repassar e comissões consolidadas por profissional no período
                  selecionado.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                {consolidatedRepasses.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                    Nenhum profissional com sessões correspondentes no período.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader className="bg-muted/40 font-semibold text-foreground">
                        <TableRow>
                          <TableHead>Profissional</TableHead>
                          <TableHead>Especialidades Atendidas</TableHead>
                          <TableHead className="text-center">Qtd de Sessões</TableHead>
                          <TableHead>Faturamento Bruto</TableHead>
                          <TableHead>Repasse Profissional</TableHead>
                          <TableHead>Comissão Clínica</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {consolidatedRepasses.map((group) => {
                          const specsArr = Array.from(group.especialidades);

                          const hasDetailsButton = true;

                          return (
                            <Fragment key={group.profissionalId}>
                              <TableRow className="hover:bg-muted/30">
                                <TableCell className="font-semibold text-foreground">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: group.cor }}
                                    />
                                    <span>{group.nome}</span>
                                    {isCoordenadora(group.profissionalId) && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-700 border-yellow-500/20 font-bold shrink-0">
                                        Coord. (+R$300)
                                      </Badge>
                                    )}
                                    {hasDetailsButton && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 p-0 hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 rounded"
                                        onClick={() => toggleExpandProf(group.profissionalId)}
                                      >
                                        {expandedProfs.has(group.profissionalId) ? (
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {specsArr.map((spec) => (
                                      <span
                                        key={spec}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                                      >
                                        {spec}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center font-medium">
                                  {group.totalSessões}
                                </TableCell>
                                <TableCell className="font-semibold text-foreground">
                                  {brl(group.faturamentoBruto)}
                                </TableCell>
                                <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {brl(group.repasseProfissional)}
                                </TableCell>
                                <TableCell className="font-semibold text-purple-600 dark:text-purple-400">
                                  {brl(group.comissaoClinica)}
                                </TableCell>
                              </TableRow>
                              {expandedProfs.has(group.profissionalId) && (
                                <TableRow className="bg-muted/10 border-t-0">
                                  <TableCell colSpan={6} className="p-4">
                                    <div className="space-y-4 w-full">
                                       {/* Patient Calculator Tables grouped by Specialty */}
                                       {(() => {
                                         const specs = Array.from(group.especialidades).sort();
                                         return specs.map((spec) => {
                                           const isApoio = isApoioSpec(spec);
                                           const bd = getPatientBreakdownForSpecialty(group.profissionalId, spec, group.sessoes);
                                           if (bd.length === 0) return null;

                                           const totalSess = bd.reduce((sum, item) => sum + item.sessions, 0);
                                           const totalFat = bd.reduce((sum, item) => sum + item.faturamento, 0);
                                           const totalRep = bd.reduce((sum, item) => sum + item.repVal, 0);

                                           return (
                                             <div key={spec} className="space-y-4 p-4 bg-background border border-border/60 rounded-lg shadow-sm w-full">
                                               <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] border-b pb-1 flex justify-between items-center">
                                                 <span>Resumo de Pacientes - {spec}</span>
                                                 <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-foreground font-normal">
                                                   Taxa Padrão: {getRepasseRates(spec).label}
                                                 </span>
                                               </div>
                                               <div className="overflow-x-auto">
                                                 <Table className="text-xs">
                                                   <TableHeader className="bg-muted/30">
                                                     <TableRow>
                                                       <TableHead className="font-semibold text-foreground">Paciente</TableHead>
                                                       {isApoio && (
                                                         <TableHead className="font-semibold text-foreground">Frequência/Pacote</TableHead>
                                                       )}
                                                       <TableHead className="font-semibold text-foreground w-[100px] text-center">Sessões</TableHead>
                                                       <TableHead className="font-semibold text-foreground w-[140px] text-center">
                                                         {isApoio ? "Valor do Plano" : "Valor da Sessão"}
                                                       </TableHead>
                                                       <TableHead className="font-semibold text-foreground w-[100px] text-center">% Repasse</TableHead>
                                                       <TableHead className="font-semibold text-foreground text-right">Repasse</TableHead>
                                                     </TableRow>
                                                   </TableHeader>
                                                   <TableBody>
                                                     {bd.map((item) => {
                                                       let defaultSessions = 0;
                                                       let defaultFaturamento = 0;
                                                       group.sessoes.forEach((a: any) => {
                                                         const s = getAppointmentSpecialty(a);
                                                         if (s === spec && a.paciente_id === item.pacienteId) {
                                                           defaultSessions += 1;
                                                           defaultFaturamento += getAppointmentValue(a);
                                                         }
                                                       });
                                                       const defaultAvgValue = defaultSessions > 0 ? defaultFaturamento / defaultSessions : 0;
                                                       const defaultRate = getRepasseRates(spec).profPct * 100;

                                                       return (
                                                         <TableRow key={item.pacienteId} className="hover:bg-transparent">
                                                           <TableCell className="font-medium text-foreground py-2">{item.pacienteNome}</TableCell>
                                                           {isApoio && (
                                                             <TableCell className="text-muted-foreground py-2">{item.freqLabel}</TableCell>
                                                           )}
                                                           <TableCell className="text-center py-2">
                                                             <Input
                                                               type="number"
                                                               className="h-8 text-center text-xs p-1 max-w-[80px] mx-auto border-muted-foreground/30 bg-muted cursor-not-allowed"
                                                               value={item.sessions}
                                                               disabled
                                                             />
                                                           </TableCell>
                                                           <TableCell className="text-center py-2">
                                                             <div className="relative max-w-[120px] mx-auto">
                                                               <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
                                                               <Input
                                                                 type="number"
                                                                 className="h-8 text-center text-xs pl-6 pr-1 border-muted-foreground/30"
                                                                 value={Number(item.value.toFixed(2))}
                                                                 onChange={(e) =>
                                                                   handleOverrideChange(
                                                                     group.profissionalId,
                                                                     item.key,
                                                                     "value",
                                                                     e.target.value,
                                                                     defaultSessions,
                                                                     isApoio ? defaultFaturamento : defaultAvgValue,
                                                                     defaultRate
                                                                   )
                                                                 }
                                                               />
                                                             </div>
                                                           </TableCell>
                                                           <TableCell className="text-center py-2">
                                                             <div className="relative max-w-[80px] mx-auto">
                                                               <Input
                                                                 type="number"
                                                                 className="h-8 text-center text-xs pr-4 pl-1 border-muted-foreground/30"
                                                                 value={item.rate}
                                                                 onChange={(e) =>
                                                                   handleOverrideChange(
                                                                     group.profissionalId,
                                                                     item.key,
                                                                     "rate",
                                                                     e.target.value,
                                                                     defaultSessions,
                                                                     isApoio ? defaultFaturamento : defaultAvgValue,
                                                                     defaultRate
                                                                   )
                                                                 }
                                                               />
                                                               <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                                                             </div>
                                                           </TableCell>
                                                           <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2">
                                                             {brl(item.repVal)}
                                                           </TableCell>
                                                         </TableRow>
                                                       );
                                                     })}
                                                     {/* Partial Sum Row */}
                                                     <TableRow className="bg-muted/20 border-t border-muted font-semibold">
                                                       <TableCell colSpan={isApoio ? 2 : 1} className="font-bold text-foreground py-2">
                                                         Total Parcial ({spec})
                                                       </TableCell>
                                                       <TableCell className="text-center py-2">
                                                         {totalSess}
                                                       </TableCell>
                                                       <TableCell className="text-center py-2">
                                                         {brl(totalFat)}
                                                       </TableCell>
                                                       <TableCell className="py-2" />
                                                       <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400 py-2">
                                                         {brl(totalRep)}
                                                       </TableCell>
                                                     </TableRow>
                                                   </TableBody>
                                                 </Table>
                                               </div>
                                             </div>
                                           );
                                         });
                                       })()}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirmar Pagamento Dialog */}
      <Dialog
        open={payDialog.open}
        onOpenChange={(open) => setPayDialog({ open, fatura: open ? payDialog.fatura : null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (payDialog.fatura) {
                confirmPaymentMutation.mutate(
                  {
                    id: payDialog.fatura.id,
                    pago_em: new Date(payForm.pago_em + "T12:00:00").toISOString(),
                    metodo: payForm.metodo,
                    observacoes: payForm.observacoes,
                  },
                  {
                    onSuccess: () => setPayDialog({ open: false, fatura: null }),
                  },
                );
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label>Paciente</Label>
              <Input
                value={payDialog.fatura ? patientMap.get(payDialog.fatura.paciente_id) || "—" : ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <Input
                  value={payDialog.fatura ? brl(Number(payDialog.fatura.valor)) : ""}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Pagamento</Label>
                <Input
                  type="date"
                  required
                  value={payForm.pago_em}
                  onChange={(e) => setPayForm({ ...payForm, pago_em: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Método de Pagamento</Label>
              <Select
                value={payForm.metodo}
                onValueChange={(val) => setPayForm({ ...payForm, metodo: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="convenio">Convênio</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Alguma observação sobre o pagamento..."
                rows={2}
                value={payForm.observacoes}
                onChange={(e) => setPayForm({ ...payForm, observacoes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayDialog({ open: false, fatura: null })}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={confirmPaymentMutation.isPending}>
                {confirmPaymentMutation.isPending ? "Confirmando..." : "Confirmar Pagamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar Cobrança Dialog */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog({ open, fatura: open ? editDialog.fatura : null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editDialog.fatura) {
                editFaturaMutation.mutate(
                  {
                    id: editDialog.fatura.id,
                    competencia: faturaForm.competencia,
                    vencimento: faturaForm.vencimento ? faturaForm.vencimento : null,
                    valor: parseFloat(faturaForm.valor.replace(",", ".")),
                    status: faturaForm.status,
                    pago_em: faturaForm.status === "paga" && faturaForm.pago_em ? faturaForm.pago_em : null,
                    observacoes: faturaForm.observacoes,
                    profissional_id: faturaForm.profissional_id || null,
                    especialidade: faturaForm.especialidade || null,
                  },
                  {
                    onSuccess: () => setEditDialog({ open: false, fatura: null }),
                  },
                );
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label>Paciente</Label>
              <Input
                value={
                  editDialog.fatura ? patientMap.get(editDialog.fatura.paciente_id) || "—" : ""
                }
                disabled
                className="bg-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Mês de Competência</Label>
                <Input
                  type="month"
                  required
                  value={faturaForm.competencia ? faturaForm.competencia.substring(0, 7) : ""}
                  onChange={(e) => setFaturaForm({ ...faturaForm, competencia: e.target.value ? e.target.value + "-01" : "" })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={faturaForm.vencimento}
                  onChange={(e) => setFaturaForm({ ...faturaForm, vencimento: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input
                  required
                  placeholder="0.00"
                  value={faturaForm.valor}
                  onChange={(e) => setFaturaForm({ ...faturaForm, valor: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={faturaForm.status}
                  onValueChange={(val) => setFaturaForm((prev) => ({
                    ...prev,
                    status: val,
                    pago_em: val === "paga" && !prev.pago_em ? format(new Date(), "yyyy-MM-dd") : prev.pago_em
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Em Aberto</SelectItem>
                    <SelectItem value="paga">Pago</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>



            {faturaForm.status === "paga" && (
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <Label>Data do Pagamento</Label>
                <Input
                  type="date"
                  required
                  value={faturaForm.pago_em || format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setFaturaForm({ ...faturaForm, pago_em: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações da cobrança..."
                rows={2}
                value={faturaForm.observacoes}
                onChange={(e) => setFaturaForm({ ...faturaForm, observacoes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialog({ open: false, fatura: null })}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={editFaturaMutation.isPending}>
                {editFaturaMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nova Cobrança Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Cobrança Manual</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!faturaForm.paciente_id) {
                toast.error("Selecione um paciente.");
                return;
              }
              createFaturaMutation.mutate(
                {
                  paciente_id: faturaForm.paciente_id,
                  competencia: faturaForm.competencia,
                  vencimento: faturaForm.vencimento ? faturaForm.vencimento : null,
                  valor: parseFloat(faturaForm.valor.replace(",", ".")),
                  status: faturaForm.status,
                  observacoes: faturaForm.observacoes,
                  profissional_id: faturaForm.profissional_id || null,
                  especialidade: faturaForm.especialidade || null,
                },
                {
                  onSuccess: () => {
                    setCreateDialog(false);
                    setFaturaForm({
                      paciente_id: "",
                      competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                      vencimento: "",
                      valor: "",
                      status: "aberta",
                      pago_em: "",
                      observacoes: "",
                      profissional_id: "",
                      especialidade: "",
                    });
                  },
                },
              );
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label>Paciente</Label>
              <Select
                value={faturaForm.paciente_id}
                onValueChange={(val) => {
                  setFaturaForm((prev) => {
                    const p = patientDetailsMap.get(val);
                    const isApoio = prev.especialidade === "Apoio" || p?.cids_secundarios?.some((s: string) => s.toLowerCase() === "apoio" || s.toUpperCase() === "AP");
                    let profId = prev.profissional_id;
                    let spec = prev.especialidade;
                    if (isApoio) {
                      spec = "Apoio";
                      if (!profId && p?.paciente_profissional?.length > 0) {
                        const matchedProf = p.paciente_profissional.find((pp: any) =>
                          professionalMatchesSpecialty(pp.profissional_id, spec)
                        );
                        if (matchedProf) {
                          profId = matchedProf.profissional_id;
                        }
                      }
                    }
                    const price = getFaturaPrice(val, profId, spec);
                    return { 
                      ...prev, 
                      paciente_id: val, 
                      profissional_id: profId,
                      especialidade: spec,
                      valor: price > 0 ? String(price) : "" 
                    };
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o paciente..." />
                </SelectTrigger>
                <SelectContent>
                  {(pacientes || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Mês de Competência</Label>
                <Input
                  type="date"
                  required
                  value={faturaForm.competencia}
                  onChange={(e) => setFaturaForm({ ...faturaForm, competencia: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={faturaForm.vencimento}
                  onChange={(e) => setFaturaForm({ ...faturaForm, vencimento: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input
                  required
                  placeholder="0.00"
                  value={faturaForm.valor}
                  onChange={(e) => setFaturaForm({ ...faturaForm, valor: e.target.value })}
                />
                {detectedDiscount ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-1 animate-in fade-in duration-200">
                    🏷️ Desconto de paciente aplicado: {brl(Number(detectedDiscount.valor_sessao || 0))}
                  </span>
                ) : detectedSpecialtyRate ? (
                  <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1 mt-1 animate-in fade-in duration-200">
                    ⭐ Valor padrão da especialidade: {brl(Number(detectedSpecialtyRate.valor_sessao || 0))}
                  </span>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={faturaForm.status}
                  onValueChange={(val) => setFaturaForm({ ...faturaForm, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Em Aberto</SelectItem>
                    <SelectItem value="paga">Pago</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select
                  value={faturaForm.profissional_id || "none"}
                  onValueChange={(val) => {
                    const pId = val === "none" ? "" : val;
                    const prof = (profissionais || []).find((p: any) => p.id === pId);
                    const specs = prof?.especialidade
                      ? prof.especialidade.split(",").map((s: string) => s.trim()).filter(Boolean)
                      : [];
                    const currentSpec = faturaForm.especialidade;
                    const nextSpec = specs.includes(currentSpec)
                      ? currentSpec
                      : (specs.length > 0 ? specs[0] : "");
                    setFaturaForm((prev) => {
                      const price = getFaturaPrice(prev.paciente_id, pId, nextSpec);
                      return {
                        ...prev,
                        profissional_id: pId,
                        especialidade: nextSpec,
                        valor: price > 0 ? String(price) : "",
                      };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(profissionais || [])
                      .filter((p: any) => {
                        if (p.id === faturaForm.profissional_id) return true;
                        if (p.ativo) return true;
                        const config = p.valores_config as any;
                        if (config?.ativo_ate) {
                          const targetMonth = faturaForm.competencia ? faturaForm.competencia.substring(0, 7) : (inicio ? inicio.substring(0, 7) : format(new Date(), "yyyy-MM"));
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
              </div>
               <div className="space-y-1.5">
                <Label>Especialidade</Label>
                <Select
                  value={faturaForm.especialidade || "none"}
                  onValueChange={(val) => {
                    const spec = val === "none" ? "" : val;
                    setFaturaForm((prev) => {
                      let profId = prev.profissional_id;
                      if (spec === "Apoio" && !profId && prev.paciente_id) {
                        const p = patientDetailsMap.get(prev.paciente_id);
                        if (p?.paciente_profissional?.length > 0) {
                          const matchedProf = p.paciente_profissional.find((pp: any) =>
                            professionalMatchesSpecialty(pp.profissional_id, spec)
                          );
                          if (matchedProf) {
                            profId = matchedProf.profissional_id;
                          }
                        }
                      }
                      const price = getFaturaPrice(prev.paciente_id, profId, spec);
                      return {
                        ...prev,
                        especialidade: spec,
                        profissional_id: profId,
                        valor: price > 0 ? String(price) : "",
                      };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {availableSpecialties.map((spec: string) => (
                      <SelectItem key={spec} value={spec}>
                        {spec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações da cobrança..."
                rows={2}
                value={faturaForm.observacoes}
                onChange={(e) => setFaturaForm({ ...faturaForm, observacoes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createFaturaMutation.isPending}>
                {createFaturaMutation.isPending ? "Criando..." : "Criar Cobrança"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Faturas do Paciente Dialog */}
      <Dialog
        open={patientFaturasDialog.open}
        onOpenChange={(open) => {
          setSelectedRowIds([]);
          setPatientFaturasDialog({
            open,
            pacienteId: open ? patientFaturasDialog.pacienteId : "",
            pacienteNome: open ? patientFaturasDialog.pacienteNome : "",
          });
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-xl">
                Faturas de {patientFaturasDialog.pacienteNome}
              </DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">
                Visualização de todas as cobranças vinculadas a este paciente.
              </div>
            </div>
            <div className="flex items-center gap-2 mr-6">
              {selectedRowIds.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 font-semibold cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir Selecionadas ({selectedRowIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir Itens/Cobranças Selecionados</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja excluir as {selectedRowIds.length} cobranças/sessões selecionadas?
                        Esta ação removerá as cobranças manuais ou sessões selecionadas, recalculando as cobranças pai quando aplicável.
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        onClick={() => {
                          const selectedRows = patientDetailedRows.filter((r: any) =>
                            selectedRowIds.includes(r.id)
                          );
                          deleteMultipleFaturasOrItemsMutation.mutate(selectedRows);
                        }}
                        disabled={deleteMultipleFaturasOrItemsMutation.isPending}
                      >
                        {deleteMultipleFaturasOrItemsMutation.isPending ? "Excluindo..." : "Excluir"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                size="sm"
                className="gap-1.5 font-semibold cursor-pointer"
                onClick={() => {
                  setFaturaForm({
                    paciente_id: patientFaturasDialog.pacienteId,
                    competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                    vencimento: "",
                    valor: "",
                    status: "aberta",
                    pago_em: "",
                    observacoes: "",
                    profissional_id: "",
                    especialidade: "",
                  });
                  setCreateDialog(true);
                }}
              >
                <Plus className="h-4 w-4" /> Nova Cobrança
              </Button>
            </div>
          </DialogHeader>

          <div className="py-4">
            {patientDetailedRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                Nenhuma fatura cadastrada para este paciente no período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/40 font-semibold text-foreground">
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <Checkbox
                          checked={
                            patientDetailedRows.length > 0 &&
                            selectedRowIds.length === patientDetailedRows.length
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRowIds(patientDetailedRows.map((r: any) => r.id));
                            } else {
                              setSelectedRowIds([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead>Sessão / Descrição</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Dias de Atraso</TableHead>
                      <TableHead className="w-[140px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patientDetailedRows.map((row: any) => {
                      const daysDelayed = getDaysDelayed(row.fatura);
                      const isSelected = selectedRowIds.includes(row.id);
                      return (
                        <TableRow key={row.id} className={isSelected ? "bg-muted/50" : ""}>
                          <TableCell className="w-12 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedRowIds([...selectedRowIds, row.id]);
                                } else {
                                  setSelectedRowIds(selectedRowIds.filter((id) => id !== row.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {row.competencia
                              ? format(new Date(row.competencia + "T12:00:00"), "MM/yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-xs text-foreground break-words max-w-[320px] md:max-w-md">{row.descricao}</div>
                          </TableCell>
                          <TableCell>
                            {row.profissionalNome && row.profissionalNome !== "—" ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0.5 font-medium whitespace-nowrap"
                              >
                                {row.profissionalNome}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.vencimento
                              ? format(new Date(row.vencimento + "T12:00:00"), "dd/MM/yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell className="font-semibold">{brl(Number(row.valor))}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.status === "paga"
                                  ? "default"
                                  : row.status === "vencida" ||
                                      (row.status === "aberta" && daysDelayed > 0)
                                    ? "destructive"
                                    : row.status === "cancelada"
                                      ? "secondary"
                                      : "outline"
                              }
                              className={
                                row.status === "paga"
                                  ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
                                  : row.status === "aberta" && daysDelayed > 0
                                    ? "bg-rose-500 hover:bg-rose-600 text-white border-transparent"
                                    : row.status === "aberta"
                                      ? "bg-sky-500 hover:bg-sky-600 text-white border-transparent"
                                      : ""
                              }
                            >
                              {row.status === "aberta" && daysDelayed > 0
                                ? "Vencida (Atrasada)"
                                : row.status === "aberta"
                                  ? "Em Aberto"
                                  : row.status === "paga"
                                    ? "Pago"
                                    : row.status === "vencida"
                                      ? "Vencida"
                                      : "Cancelada"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.status === "paga" ? (
                              <div className="space-y-0.5">
                                <div>
                                  {row.pago_em ? format(new Date(row.pago_em), "dd/MM/yyyy") : "—"}
                                </div>
                                <div className="font-semibold uppercase tracking-wider text-[10px] text-emerald-600 dark:text-emerald-400">
                                  {row.metodo || ""}
                                </div>
                              </div>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {row.status === "paga" ? (
                              daysDelayed > 0 ? (
                                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                  Pago com {daysDelayed}d de atraso
                                </span>
                              ) : (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                  <Check className="h-3 w-3" /> Pago em dia
                                </span>
                              )
                            ) : row.status === "cancelada" ? (
                              "—"
                            ) : row.vencimento ? (
                              daysDelayed > 0 ? (
                                <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {daysDelayed}{" "}
                                  dias de atraso
                                </span>
                              ) : (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> No prazo
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Sem vencimento
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div
                              className="flex justify-end gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.status !== "paga" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Confirmar Pagamento"
                                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                  onClick={async () => {
                                    if (row.isFaturaOnly || !row.item?.agendamento_id) {
                                      handleOpenConfirmPayment(row.fatura);
                                    } else {
                                      if (confirm(`Confirmar o pagamento da sessão "${row.descricao}"?`)) {
                                        await updateAppointmentStatusMutation.mutateAsync({
                                          id: row.item.agendamento_id,
                                          status: "pago",
                                        });
                                      }
                                    }
                                  }}
                                  disabled={!row.isFaturaOnly && row.item?.agendamento_id && updateAppointmentStatusMutation.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ver Detalhes / Sessões"
                                className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary/5"
                                onClick={() => handleOpenInvoiceDetails(row.fatura)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar Cobrança"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenEdit(row.fatura)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title={row.isFaturaOnly ? "Excluir Cobrança" : "Excluir Sessão"}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir {row.isFaturaOnly ? "Cobrança" : "Sessão"}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {row.isFaturaOnly
                                        ? "Tem certeza que deseja excluir esta cobrança manual? Esta ação não pode ser desfeita."
                                        : `Tem certeza que deseja excluir a sessão "${row.descricao}" desta cobrança? O valor da cobrança pai será recalculado automaticamente.`}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                      onClick={() => {
                                        if (row.isFaturaOnly) {
                                          deleteFaturaMutation.mutate(row.faturaId);
                                        } else {
                                          deleteFaturaItemMutation.mutate(row.item.id);
                                        }
                                      }}
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhes da Cobrança Dialog */}
      <Dialog
        open={invoiceDetailsDialog.open}
        onOpenChange={(open) =>
          setInvoiceDetailsDialog({
            open,
            fatura: open ? invoiceDetailsDialog.fatura : null,
          })
        }
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <span>Detalhes da Cobrança</span>
              {activeDetailedFatura && (
                <Badge variant="outline" className="text-sm bg-primary/5">
                  {patientMap.get(activeDetailedFatura.paciente_id) || "—"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {activeDetailedFatura && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-4">
              {/* Left Column: General Info Form */}
              <div className="lg:col-span-5 space-y-4 border-r border-border/60 pr-0 lg:pr-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Informações Gerais
                </h3>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    editFaturaMutation.mutate({
                      id: activeDetailedFatura.id,
                      competencia: detailsFaturaForm.competencia,
                      vencimento: detailsFaturaForm.vencimento ? detailsFaturaForm.vencimento : null,
                      valor: Number(activeDetailedFatura.valor) || 0,
                      status: detailsFaturaForm.status,
                      pago_em: detailsFaturaForm.status === "paga" && detailsFaturaForm.pago_em ? detailsFaturaForm.pago_em : null,
                      metodo: detailsFaturaForm.status === "paga" ? detailsFaturaForm.metodo : null,
                      observacoes: detailsFaturaForm.observacoes,
                      profissional_id: detailsFaturaForm.profissional_id || null,
                      especialidade: detailsFaturaForm.especialidade || null,
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Mês de Competência</Label>
                      <Input
                        type="month"
                        required
                        value={detailsFaturaForm.competencia ? detailsFaturaForm.competencia.substring(0, 7) : ""}
                        onChange={(e) =>
                          setDetailsFaturaForm({
                            ...detailsFaturaForm,
                            competencia: e.target.value ? e.target.value + "-01" : "",
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Vencimento</Label>
                      <Input
                        type="date"
                        value={detailsFaturaForm.vencimento}
                        onChange={(e) =>
                          setDetailsFaturaForm({
                            ...detailsFaturaForm,
                            vencimento: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Profissional Principal</Label>
                      <Select
                        value={detailsFaturaForm.profissional_id || "none"}
                        onValueChange={(val) => {
                          const pId = val === "none" ? "" : val;
                          const prof = (profissionais || []).find((p: any) => p.id === pId);
                          const specs = prof?.especialidade
                            ? prof.especialidade.split(",").map((s: string) => s.trim()).filter(Boolean)
                            : [];
                          const currentSpec = detailsFaturaForm.especialidade;
                          const nextSpec = specs.includes(currentSpec)
                            ? currentSpec
                            : (specs.length > 0 ? specs[0] : "");
                          setDetailsFaturaForm({
                            ...detailsFaturaForm,
                            profissional_id: pId,
                            especialidade: nextSpec,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {(profissionais || [])
                            .filter((p: any) => {
                              if (p.id === detailsFaturaForm.profissional_id) return true;
                              if (p.ativo) return true;
                              const config = p.valores_config as any;
                              if (config?.ativo_ate) {
                                const targetMonth = detailsFaturaForm.competencia ? detailsFaturaForm.competencia.substring(0, 7) : (inicio ? inicio.substring(0, 7) : format(new Date(), "yyyy-MM"));
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
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Especialidade Principal</Label>
                      <Select
                        value={detailsFaturaForm.especialidade || "none"}
                        onValueChange={(val) =>
                          setDetailsFaturaForm({
                            ...detailsFaturaForm,
                            especialidade: val === "none" ? "" : val,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {detailsAvailableSpecialties.map((spec: string) => (
                            <SelectItem key={spec} value={spec}>
                              {spec}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Status</Label>
                    <Select
                      value={detailsFaturaForm.status}
                      onValueChange={(val) =>
                        setDetailsFaturaForm((prev) => ({
                          ...prev,
                          status: val,
                          pago_em: val === "paga" && !prev.pago_em ? format(new Date(), "yyyy-MM-dd") : prev.pago_em,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aberta">Em Aberto</SelectItem>
                        <SelectItem value="paga">Pago</SelectItem>
                        <SelectItem value="vencida">Vencida</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {detailsFaturaForm.status === "paga" && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Data do Pagamento</Label>
                        <Input
                          type="date"
                          required
                          value={detailsFaturaForm.pago_em || format(new Date(), "yyyy-MM-dd")}
                          onChange={(e) =>
                            setDetailsFaturaForm({ ...detailsFaturaForm, pago_em: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Método</Label>
                        <Select
                          value={detailsFaturaForm.metodo || "pix"}
                          onValueChange={(val) =>
                            setDetailsFaturaForm({ ...detailsFaturaForm, metodo: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="dinheiro">Dinheiro</SelectItem>
                            <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                            <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                            <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="convenio">Convênio</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Observações</Label>
                    <Textarea
                      placeholder="Observações da cobrança..."
                      rows={2}
                      value={detailsFaturaForm.observacoes}
                      onChange={(e) =>
                        setDetailsFaturaForm({ ...detailsFaturaForm, observacoes: e.target.value })
                      }
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full font-semibold"
                    disabled={editFaturaMutation.isPending}
                  >
                    {editFaturaMutation.isPending ? "Salvando..." : "Salvar Informações Gerais"}
                  </Button>
                </form>
              </div>

              {/* Right Column: Sessions List, Edit and Add */}
              <div className="lg:col-span-7 space-y-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Sessões e Itens Faturados
                    </h3>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block font-semibold uppercase">
                        Valor Total
                      </span>
                      <span className="text-2xl font-bold text-primary">
                        {brl(Number(activeDetailedFatura.valor) || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Sessions Table */}
                  <div className="border border-border rounded-lg overflow-hidden bg-card/50">
                    <Table>
                      <TableHeader className="bg-muted/40 font-semibold">
                        <TableRow>
                          <TableHead>Descrição da Sessão</TableHead>
                          <TableHead className="w-[120px]">Valor (R$)</TableHead>
                          <TableHead className="w-[130px]">Status</TableHead>
                          <TableHead className="w-[100px] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          let items = faturaItens.filter((item: any) => item.fatura_id === activeDetailedFatura.id);
                          if (activeDetailedFatura.especialidade === "Apoio") {
                            items = items.filter((item: any) => !item.agendamento_id);
                          }
                          const sortedItems = items.sort((a: any, b: any) => {
                            const dateA = a.agendamento_id ? agendamentoDateMap.get(a.agendamento_id) : null;
                            const dateB = b.agendamento_id ? agendamentoDateMap.get(b.agendamento_id) : null;
                            if (dateA && dateB) {
                              return new Date(dateA).getTime() - new Date(dateB).getTime();
                            }
                            return (a.descricao || "").localeCompare(b.descricao || "");
                          });
                          if (sortedItems.length === 0) {
                            return (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground italic">
                                  Nenhuma sessão faturada vinculada. A cobrança é manual ou está sem itens.
                                </TableCell>
                              </TableRow>
                            );
                          }
                          return sortedItems.map((item: any) => {
                            const isEditing = editingItemId === item.id;
                            const appStatus = item.agendamento_id ? agendamentoStatusMap.get(item.agendamento_id) : null;
                            return (
                              <TableRow key={item.id} className="hover:bg-muted/10">
                                <TableCell>
                                  {isEditing ? (
                                    <Input
                                      value={editingItemDesc}
                                      onChange={(e) => setEditingItemDesc(e.target.value)}
                                      className="h-8 text-xs"
                                    />
                                  ) : (
                                    <span className="text-xs font-semibold text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">
                                      {item.descricao}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditing ? (
                                    <Input
                                      value={editingItemVal}
                                      onChange={(e) => setEditingItemVal(e.target.value)}
                                      placeholder="0.00"
                                      className="h-8 text-xs font-semibold"
                                    />
                                  ) : (
                                    <span className="text-xs font-semibold text-foreground">
                                      {brl(Number(item.total) || 0)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isEditing && item.agendamento_id ? (
                                    <Select
                                      value={editingItemStatus}
                                      onValueChange={setEditingItemStatus}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="realizado">Realizado</SelectItem>
                                        <SelectItem value="pago">Pago</SelectItem>
                                        <SelectItem value="falta">Falta</SelectItem>
                                        <SelectItem value="confirmado">Confirmado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : item.agendamento_id ? (
                                    <Badge
                                      variant={
                                        appStatus === "pago"
                                          ? "default"
                                          : appStatus === "falta"
                                            ? "destructive"
                                            : "outline"
                                      }
                                      className={
                                        appStatus === "pago"
                                          ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent text-[10px] px-1.5 py-0.5"
                                          : appStatus === "realizado"
                                            ? "bg-sky-500 hover:bg-sky-600 text-white border-transparent text-[10px] px-1.5 py-0.5"
                                            : appStatus === "falta"
                                              ? "bg-rose-500 hover:bg-rose-600 text-white border-transparent text-[10px] px-1.5 py-0.5"
                                              : "text-[10px] px-1.5 py-0.5"
                                      }
                                    >
                                      {appStatus === "pago"
                                        ? "Pago"
                                        : appStatus === "realizado"
                                          ? "Realizado"
                                          : appStatus === "falta"
                                            ? "Falta"
                                            : appStatus || "—"}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">Manual</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    {isEditing ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                          onClick={async () => {
                                            const val = parseFloat(editingItemVal.replace(",", "."));
                                            if (isNaN(val) || val < 0) {
                                              toast.error("Valor inválido.");
                                              return;
                                            }
                                            if (!editingItemDesc.trim()) {
                                              toast.error("Descrição é obrigatória.");
                                              return;
                                            }
                                            try {
                                              if (item.agendamento_id && editingItemStatus && editingItemStatus !== appStatus) {
                                                await updateAppointmentStatusMutation.mutateAsync({
                                                  id: item.agendamento_id,
                                                  status: editingItemStatus,
                                                });
                                              }
                                              await editFaturaItemMutation.mutateAsync({
                                                id: item.id,
                                                descricao: editingItemDesc,
                                                valor_unitario: val,
                                              });
                                              setEditingItemId(null);
                                            } catch (err) {
                                              // Handled by query mutation onError
                                            }
                                          }}
                                          disabled={editFaturaItemMutation.isPending || updateAppointmentStatusMutation.isPending}
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                          onClick={() => setEditingItemId(null)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                          onClick={() => {
                                            setEditingItemId(item.id);
                                            setEditingItemDesc(item.descricao || "");
                                            setEditingItemVal(String(item.valor_unitario || item.total || 0));
                                            setEditingItemStatus(appStatus || "");
                                          }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                          onClick={() => {
                                            if (
                                              confirm(
                                                `Tem certeza que deseja excluir a sessão "${item.descricao}" desta cobrança?`
                                              )
                                            ) {
                                              deleteFaturaItemMutation.mutate(item.id);
                                            }
                                          }}
                                          disabled={deleteFaturaItemMutation.isPending}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          });
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Add Session Form */}
                <div className="border border-border/80 bg-muted/20 p-3 rounded-lg space-y-2 mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Adicionar Sessão / Item Manual
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-8">
                      <Input
                        placeholder="Ex: Psicoterapia - 24/06/2026 16:00"
                        value={newItemDesc}
                        onChange={(e) => setNewItemDesc(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        placeholder="0.00"
                        value={newItemVal}
                        onChange={(e) => setNewItemVal(e.target.value)}
                        className="h-9 text-xs font-semibold"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Button
                        type="button"
                        size="icon"
                        className="h-9 w-full sm:w-9"
                        onClick={() => {
                          const val = parseFloat(newItemVal.replace(",", "."));
                          if (isNaN(val) || val < 0) {
                            toast.error("Valor inválido.");
                            return;
                          }
                          if (!newItemDesc.trim()) {
                            toast.error("Descrição é obrigatória.");
                            return;
                          }
                          createFaturaItemMutation.mutate({
                            fatura_id: activeDetailedFatura.id,
                            descricao: newItemDesc,
                            valor_unitario: val,
                          }, {
                            onSuccess: () => {
                              setNewItemDesc("");
                              setNewItemVal("");
                            }
                          });
                        }}
                        disabled={createFaturaItemMutation.isPending}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {detectedDetailsDiscount && (
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 animate-in fade-in duration-200">
                      🏷️ Desconto de paciente aplicado: {brl(Number(detectedDetailsDiscount.valor_sessao || 0))}
                    </div>
                  )}
                  {detectedDetailsSpecialtyRate && (
                    <div className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold mt-1 animate-in fade-in duration-200">
                      ⭐ Valor padrão da especialidade: {brl(Number(detectedDetailsSpecialtyRate.valor_sessao || 0))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiretoriaPage() {
  const { loading } = useAuth();
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("diretoria_unlocked") === "true";
    }
    return false;
  });

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!unlocked) {
    return (
      <PasswordGate
        onUnlock={() => {
          setUnlocked(true);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("diretoria_unlocked", "true");
          }
        }}
      />
    );
  }

  return <DiretoriaPageContent />;
}
