import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, Printer, Save, Loader2, User, HelpCircle, Users, Activity, GraduationCap, MessageSquare, Brain, RefreshCw, Heart, Milestone, MapPin, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";


const formatBirthDateForDisplay = (dateStr: any) => {
  if (!dateStr) return "";
  if (typeof dateStr !== "string") {
    try {
      if (dateStr instanceof Date) {
        return format(dateStr, "dd/MM/yyyy");
      }
      dateStr = String(dateStr);
    } catch {
      return "";
    }
  }
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

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

interface AnamneseFormDialogProps {
  pacienteId: string;
  agendamentoId?: string;
  profissionalId?: string;
  onClose: () => void;
}

export function AnamneseFormDialog({
  pacienteId,
  agendamentoId,
  profissionalId,
  onClose,
}: AnamneseFormDialogProps) {
  const qc = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("identificacao");

  // State to hold all form fields
  const [respostas, setRespostas] = useState<Record<string, string>>({
    // Identificação
    nome_completo: "",
    data_nascimento: "",
    sexo: "",
    diagnostico: "",
    responsavel: "",
    contato: "",
    endereco: "",
    escola: "",
    ano_serie: "",
    data_avaliacao: format(new Date(), "yyyy-MM-dd"),

    // Motivo
    queixa_principal: "",
    quem_trouxe_queixa: "",
    expectativas_familia: "",

    // Estrutura Familiar
    reside_com: "",
    dinamica_familiar: "",
    relacao_familiares: "",

    // Rotina e Hábitos
    sono: "",
    alimentacao: "",
    seletividade: "",
    telas: "",
    lazer: "",

    // Escolaridade
    escola_historico: "",
    habilidades_academicas: "",
    pontos_fortes_dificuldades: "",
    estrategias_adaptacoes: "",

    // Comunicação
    clareza_fala: "",
    compreensao_ordens: "",
    gestos_comunicacao: "",
    fluencia_pragmatica: "",

    // Aspectos Emocionais
    humor_sentimentos: "",
    reacoes_frustracao: "",
    comportamentos_interesse: "",
    regulacao: "",
    interesses_habilidades: "",

    // Intervenções
    acompanhamentos_anteriores: "",
    frequencia_duracao: "",
    resultados_percebidos: "",

    // Rede de Apoio
    rede_escola: "",
    rede_familia: "",
    rede_outros: "",

    // Desenvolvimento
    marcos_motores: "",
    primeiras_palavras: "",
    brincar_interacao: "",

    // Plano Inicial
    plano_terapeutico: "",

    // Observações
    observacoes_profissional: "",
  });

  // Fetch patient details
  const {
    data: paciente,
    isLoading: isLoadingPaciente,
    isError: errorPaciente,
    refetch: refetchPaciente,
  } = useQuery({
    queryKey: ["paciente-anamnese", pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pacientes")
        .select("*")
        .eq("id", pacienteId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId && pacienteId !== "",
  });

  // Fetch responsible people
  const {
    data: responsaveis = [],
    isLoading: isLoadingResponsaveis,
    isError: errorResponsaveis,
    refetch: refetchResponsaveis,
  } = useQuery({
    queryKey: ["responsaveis-anamnese", pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responsaveis")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!pacienteId && pacienteId !== "",
  });

  // Fetch existing anamnese
  const {
    data: existingAnamnese,
    isLoading: isLoadingAnamnese,
    isError: errorAnamnese,
    refetch: refetchAnamnese,
  } = useQuery({
    queryKey: ["anamnese-data", pacienteId, agendamentoId],
    queryFn: async () => {
      // First, try to fetch anamnese associated with this appointment
      if (agendamentoId) {
        const { data, error } = await supabase
          .from("anamneses")
          .select("*")
          .eq("agendamento_id", agendamentoId)
          .maybeSingle();
        if (data) return data;
      }

      // If none found for the appointment, fetch the most recent one for this patient
      const { data, error } = await supabase
        .from("anamneses")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return data;
    },
    enabled: !!pacienteId && pacienteId !== "",
  });

  // Populate data when loaded — only once per open to avoid resetting user edits
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (isLoadingPaciente || isLoadingResponsaveis || isLoadingAnamnese) return;

    if (existingAnamnese?.respostas) {
      setRespostas((prev) => ({
        ...prev,
        ...(existingAnamnese.respostas as Record<string, string>),
      }));
    } else {
      const formattedBirth = paciente?.data_nascimento
        ? formatBirthDateForDisplay(paciente.data_nascimento)
        : "";
      const age = paciente?.data_nascimento
        ? calculateAge(paciente.data_nascimento)
        : "";
      const formattedBirthWithAge = formattedBirth
        ? `${formattedBirth} (${age} anos)`
        : "";

      const primaryResp = responsaveis?.[0];
      const contactInfo = primaryResp
        ? [primaryResp.telefone, primaryResp.whatsapp, primaryResp.email].filter(Boolean).join(" / ")
        : "";

      setRespostas((prev) => ({
        ...prev,
        nome_completo: paciente?.nome ?? "",
        data_nascimento: formattedBirthWithAge,
        diagnostico: paciente?.cid_principal ?? "",
        responsavel: primaryResp?.nome ?? "",
        contato: contactInfo,
      }));
    }
    initializedRef.current = true;
  }, [paciente, responsaveis, existingAnamnese, isLoadingPaciente, isLoadingResponsaveis, isLoadingAnamnese]);

  const calculateAge = (birthDateStr: any) => {
    if (!birthDateStr) return "";
    try {
      const birthDate = new Date(birthDateStr);
      if (isNaN(birthDate.getTime())) return "";
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return "";
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setRespostas((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        paciente_id: pacienteId,
        agendamento_id: agendamentoId || null,
        profissional_id: profissionalId || null,
        respostas,
        atualizado_em: new Date().toISOString(),
      };

      if (existingAnamnese?.id) {
        // Update
        const { data, error } = await supabase
          .from("anamneses")
          .update(payload)
          .eq("id", existingAnamnese.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Insert
        const { data, error } = await supabase
          .from("anamneses")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      toast.success("Ficha de anamnese salva com sucesso!");
      qc.invalidateQueries({ queryKey: ["anamnese-data"] });
      qc.invalidateQueries({ queryKey: ["agendamentos"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const isLoading = isLoadingPaciente || isLoadingResponsaveis || isLoadingAnamnese;
  const isError = errorPaciente || errorResponsaveis || errorAnamnese;

  const handleRetry = () => {
    refetchPaciente();
    refetchResponsaveis();
    refetchAnamnese();
  };

  const tabItems = [
    { id: "identificacao", label: "Identificação", icon: User },
    { id: "motivo", label: "Motivo da Avaliação", icon: HelpCircle },
    { id: "familia", label: "Estrutura Familiar", icon: Users },
    { id: "rotina", label: "Rotina e Hábitos", icon: Activity },
    { id: "escolaridade", label: "Escolaridade e Aprendizagem", icon: GraduationCap },
    { id: "comunicacao", label: "Comunicação e Linguagem", icon: MessageSquare },
    { id: "emocional", label: "Aspectos Emocionais", icon: Brain },
    { id: "intervencoes", label: "Intervenções Anteriores", icon: RefreshCw },
    { id: "apoio", label: "Rede de Apoio", icon: Heart },
    { id: "desenvolvimento", label: "Desenvolvimento", icon: Milestone },
    { id: "plano", label: "Plano Inicial", icon: ClipboardList },
    { id: "observacoes", label: "Observações", icon: FileText },
  ];

  if (isError) {
    return (
      <DialogContent className="max-w-md p-6 bg-background animate-in fade-in duration-300">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-destructive flex items-center gap-2">
            Erro ao carregar anamnese
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 text-center space-y-4">
          <p className="text-xs text-muted-foreground">
            Não foi possível carregar os dados do paciente ou da anamnese do banco de dados. Verifique sua conexão ou tente novamente.
          </p>
          <Button onClick={handleRetry} className="w-full h-9 text-xs">
            Tentar novamente
          </Button>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
      <DialogHeader className="px-6 py-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 print:hidden">
        <div>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-primary">
            <FileText className="h-5 w-5" /> Ficha de Anamnese Digital
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Metodologia Integrada — Psicologia, Fonoaudiologia e Psicopedagogia
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto justify-end sm:mr-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 hover:bg-primary/5 hover:text-primary transition-all text-xs"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-1.5 shadow-sm transition-all text-xs"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Ficha
          </Button>
        </div>
      </DialogHeader>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Carregando dados da anamnese...</span>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden print:block print:h-auto">
          {/* Main interactive tabs - Hidden on Print */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col md:flex-row overflow-hidden print:hidden"
          >
            <TabsList className="w-full md:w-[280px] h-auto md:h-full flex flex-row md:flex-col justify-start items-center md:items-stretch border-b md:border-b-0 md:border-r border-border bg-muted/20 p-2 overflow-x-auto md:overflow-y-auto shrink-0">
              <div className="hidden md:block px-3 py-2 text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
                Seções do Formulário
              </div>
              {tabItems.map((tab) => {
                const IconComponent = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="justify-start gap-2.5 px-3 py-2 md:py-2.5 rounded-lg text-left text-sm font-medium transition-all hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground mb-0 md:mb-1 shrink-0 cursor-pointer"
                  >
                    <IconComponent className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="flex-1 flex flex-col overflow-hidden bg-card">
              <ScrollArea className="flex-1 p-6">
                {/* 1. IDENTIFICAÇÃO */}
                <TabsContent value="identificacao" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <User className="h-5 w-5 text-primary/80" /> 1. Identificação Geral
                    </h3>
                    <p className="text-xs text-muted-foreground">Dados pessoais e de contato básicos do paciente.</p>
                  </div>
                  <hr className="border-border/60" />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="nome_completo">Nome Completo</Label>
                      <Input
                        id="nome_completo"
                        value={respostas.nome_completo}
                        onChange={(e) => handleFieldChange("nome_completo", e.target.value)}
                        placeholder="Nome completo do paciente"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="data_nascimento">Data de Nascimento / Idade</Label>
                      <Input
                        id="data_nascimento"
                        value={respostas.data_nascimento}
                        onChange={(e) => handleFieldChange("data_nascimento", e.target.value)}
                        placeholder="Ex: 15/04/2018 (8 anos)"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sexo">Sexo</Label>
                      <Input
                        id="sexo"
                        value={respostas.sexo}
                        onChange={(e) => handleFieldChange("sexo", e.target.value)}
                        placeholder="Ex: Masculino, Feminino"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="diagnostico">Diagnóstico / CID Principal</Label>
                      <Input
                        id="diagnostico"
                        value={respostas.diagnostico}
                        onChange={(e) => handleFieldChange("diagnostico", e.target.value)}
                        placeholder="Ex: F84.0 - Autismo Infantil"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="responsavel">Responsável Legal</Label>
                      <Input
                        id="responsavel"
                        value={respostas.responsavel}
                        onChange={(e) => handleFieldChange("responsavel", e.target.value)}
                        placeholder="Nome do responsável"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contato">Contato (Telefone / E-mail)</Label>
                      <Input
                        id="contato"
                        value={respostas.contato}
                        onChange={(e) => handleFieldChange("contato", e.target.value)}
                        placeholder="Telefone ou WhatsApp"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="endereco">Endereço Residencial</Label>
                      <Input
                        id="endereco"
                        value={respostas.endereco}
                        onChange={(e) => handleFieldChange("endereco", e.target.value)}
                        placeholder="Rua, Número, Bairro, Cidade"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="escola">Escola Atual</Label>
                      <Input
                        id="escola"
                        value={respostas.escola}
                        onChange={(e) => handleFieldChange("escola", e.target.value)}
                        placeholder="Nome da instituição de ensino"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ano_serie">Ano / Série</Label>
                      <Input
                        id="ano_serie"
                        value={respostas.ano_serie}
                        onChange={(e) => handleFieldChange("ano_serie", e.target.value)}
                        placeholder="Ex: 3º ano do Ensino Fundamental"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="data_avaliacao">Data da Avaliação</Label>
                      <Input
                        id="data_avaliacao"
                        type="date"
                        value={respostas.data_avaliacao}
                        onChange={(e) => handleFieldChange("data_avaliacao", e.target.value)}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 2. MOTIVO DA AVALIAÇÃO */}
                <TabsContent value="motivo" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <HelpCircle className="h-5 w-5 text-primary/80" /> 2. Motivo da Avaliação
                    </h3>
                    <p className="text-xs text-muted-foreground">Queixas iniciais, expectativas e quem indicou/trouxe a queixa.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="queixa_principal">Queixa Principal Relatada</Label>
                      <Textarea
                        id="queixa_principal"
                        value={respostas.queixa_principal}
                        onChange={(e) => handleFieldChange("queixa_principal", e.target.value)}
                        placeholder="Qual a principal queixa ou preocupação sobre a criança?"
                        rows={4}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="quem_trouxe_queixa">Quem trouxe a queixa? (Pais, escola, paciente, etc.)</Label>
                      <Input
                        id="quem_trouxe_queixa"
                        value={respostas.quem_trouxe_queixa}
                        onChange={(e) => handleFieldChange("quem_trouxe_queixa", e.target.value)}
                        placeholder="Quem identificou a necessidade da avaliação e indicou a clínica?"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="expectativas_familia">Expectativas da Família / Paciente</Label>
                      <Textarea
                        id="expectativas_familia"
                        value={respostas.expectativas_familia}
                        onChange={(e) => handleFieldChange("expectativas_familia", e.target.value)}
                        placeholder="O que a família espera alcançar com a avaliação e o acompanhamento?"
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 3. ESTRUTURA FAMILIAR */}
                <TabsContent value="familia" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary/80" /> 3. Estrutura Familiar
                    </h3>
                    <p className="text-xs text-muted-foreground">Composição da casa, dinâmica do lar e relacionamentos afetivos.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reside_com">Com quem a criança/paciente reside?</Label>
                      <Input
                        id="reside_com"
                        value={respostas.reside_com}
                        onChange={(e) => handleFieldChange("reside_com", e.target.value)}
                        placeholder="Ex: Pais e um irmão mais novo"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dinamica_familiar">Dinâmica Familiar (Papéis, rotinas do lar, apoio)</Label>
                      <Textarea
                        id="dinamica_familiar"
                        value={respostas.dinamica_familiar}
                        onChange={(e) => handleFieldChange("dinamica_familiar", e.target.value)}
                        placeholder="Como é a rotina do lar, papéis de cuidado e rede de apoio familiar interna?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="relacao_familiares">Relação com Familiares</Label>
                      <Textarea
                        id="relacao_familiares"
                        value={respostas.relacao_familiares}
                        onChange={(e) => handleFieldChange("relacao_familiares", e.target.value)}
                        placeholder="Como o paciente se relaciona com pais, irmãos e outros familiares no dia a dia?"
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 4. ROTINA E HÁBITOS */}
                <TabsContent value="rotina" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary/80" /> 4. Rotina e Hábitos
                    </h3>
                    <p className="text-xs text-muted-foreground">Sono, alimentação, uso de eletrônicos e atividades de lazer.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="sono">Sono (Quantidade, qualidade, rituais, dificuldades)</Label>
                      <Textarea
                        id="sono"
                        value={respostas.sono}
                        onChange={(e) => handleFieldChange("sono", e.target.value)}
                        placeholder="Dorme bem? Acorda à noite? Tem pesadelos? Precisa de companhia?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="alimentacao">Alimentação (Aceitação, dificuldades, mastigação/deglutição, autonomia)</Label>
                      <Textarea
                        id="alimentacao"
                        value={respostas.alimentacao}
                        onChange={(e) => handleFieldChange("alimentacao", e.target.value)}
                        placeholder="Como se alimenta? Mastiga bem? Alimenta-se sozinho(a)?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="seletividade">Seletividade Alimentar (Se houver)</Label>
                      <Input
                        id="seletividade"
                        value={respostas.seletividade}
                        onChange={(e) => handleFieldChange("seletividade", e.target.value)}
                        placeholder="Descreva recusas alimentares por textura, cor, cheiro, etc."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="telas">Uso de Telas (Tempo de tela por dia, tipo de conteúdo)</Label>
                      <Input
                        id="telas"
                        value={respostas.telas}
                        onChange={(e) => handleFieldChange("telas", e.target.value)}
                        placeholder="Ex: 2 horas de celular/TV por dia, assiste desenhos no YouTube"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lazer">Atividades de Lazer e Brincadeiras favoritas</Label>
                      <Textarea
                        id="lazer"
                        value={respostas.lazer}
                        onChange={(e) => handleFieldChange("lazer", e.target.value)}
                        placeholder="O que gosta de fazer no tempo livre? Pratica esportes ou brinca ao ar livre?"
                        rows={2}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 5. ESCOLARIDADE E APRENDIZAGEM */}
                <TabsContent value="escolaridade" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-primary/80" /> 5. Escolaridade e Aprendizagem (Psicopedagogia)
                    </h3>
                    <p className="text-xs text-muted-foreground">Histórico escolar, habilidades acadêmicas, pontos fortes e dificuldades de aprendizagem.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="escola_historico">Histórico Escolar (Escola atual, mudanças de colégio, retenções)</Label>
                      <Textarea
                        id="escola_historico"
                        value={respostas.escola_historico}
                        onChange={(e) => handleFieldChange("escola_historico", e.target.value)}
                        placeholder="Como foi a adaptação escolar nas séries anteriores? Já mudou de escola?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="habilidades_academicas">Habilidades Acadêmicas Atuais (Leitura, escrita, matemática)</Label>
                      <Textarea
                        id="habilidades_academicas"
                        value={respostas.habilidades_academicas}
                        onChange={(e) => handleFieldChange("habilidades_academicas", e.target.value)}
                        placeholder="Como está o desempenho em leitura, escrita, cálculo matemático e raciocínio lógico?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pontos_fortes_dificuldades">Pontos Fortes e Dificuldades Percebidas</Label>
                      <Textarea
                        id="pontos_fortes_dificuldades"
                        value={respostas.pontos_fortes_dificuldades}
                        onChange={(e) => handleFieldChange("pontos_fortes_dificuldades", e.target.value)}
                        placeholder="Onde a criança brilha e onde encontra maiores barreiras para aprender?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="estrategias_adaptacoes">Estratégias ou Adaptações já Utilizadas na Escola</Label>
                      <Textarea
                        id="estrategias_adaptacoes"
                        value={respostas.estrategias_adaptacoes}
                        onChange={(e) => handleFieldChange("estrategias_adaptacoes", e.target.value)}
                        placeholder="A escola faz adaptação curricular, PEI, provas adaptadas ou oferece mediador?"
                        rows={2}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 6. COMUNICAÇÃO E LINGUAGEM */}
                <TabsContent value="comunicacao" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary/80" /> 6. Comunicação e Linguagem (Fonoaudiologia)
                    </h3>
                    <p className="text-xs text-muted-foreground">Frente de fala, vocabulário, compreensão de ordens, fluência e pragmática.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="clareza_fala">Clareza da Fala e Vocabulário Atual</Label>
                      <Textarea
                        id="clareza_fala"
                        value={respostas.clareza_fala}
                        onChange={(e) => handleFieldChange("clareza_fala", e.target.value)}
                        placeholder="A fala é inteligível para estranhos? Troca sons ao falar? Tem bom vocabulário?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="compreensao_ordens">Compreensão de Ordens Simples e Complexas</Label>
                      <Textarea
                        id="compreensao_ordens"
                        value={respostas.compreensao_ordens}
                        onChange={(e) => handleFieldChange("compreensao_ordens", e.target.value)}
                        placeholder="Atende comandos como 'pegue seu sapato e guarde no armário' sem precisar de ajuda?"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gestos_comunicacao">Uso de Gestos ou Comunicação Alternativa</Label>
                      <Input
                        id="gestos_comunicacao"
                        value={respostas.gestos_comunicacao}
                        onChange={(e) => handleFieldChange("gestos_comunicacao", e.target.value)}
                        placeholder="Aponta, puxa pela mão, usa PECS ou aplicativo de voz (se não-verbal)?"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fluencia_pragmatica">Observações sobre Fluência, Entonação e Pragmática</Label>
                      <Textarea
                        id="fluencia_pragmatica"
                        value={respostas.fluencia_pragmatica}
                        onChange={(e) => handleFieldChange("fluencia_pragmatica", e.target.value)}
                        placeholder="Tem gagueira infantil? Mantém contato visual? Inicia conversas e respeita turnos de fala?"
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 7. ASPECTOS EMOCIONAIS E COMPORTAMENTAIS */}
                <TabsContent value="emocional" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary/80" /> 7. Aspectos Emocionais e Comportamentais (Psicologia)
                    </h3>
                    <p className="text-xs text-muted-foreground">Regulação emocional, reações à frustração, birras, estereotipias e interesses.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="humor_sentimentos">Humor Geral e Expressão de Sentimentos</Label>
                      <Textarea
                        id="humor_sentimentos"
                        value={respostas.humor_sentimentos}
                        onChange={(e) => handleFieldChange("humor_sentimentos", e.target.value)}
                        placeholder="A criança costuma ser alegre, ansiosa, irritável, calma? Consegue expressar o que sente?"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reacoes_frustracao">Reações diante de Frustração e Desafios</Label>
                      <Textarea
                        id="reacoes_frustracao"
                        value={respostas.reacoes_frustracao}
                        onChange={(e) => handleFieldChange("reacoes_frustracao", e.target.value)}
                        placeholder="Como reage quando ouve um 'não' ou quando algo não sai como planejado?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="comportamentos_interesse">Comportamentos de Interesse (Birras, isolamento, agressividade, impulsividade, estereotipias)</Label>
                      <Textarea
                        id="comportamentos_interesse"
                        value={respostas.comportamentos_interesse}
                        onChange={(e) => handleFieldChange("comportamentos_interesse", e.target.value)}
                        placeholder="Descreva episódios de crises/birras, agitação motora, movimentos repetitivos ou desatenção extrema."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="regulacao">Estratégias de Regulação Utilizadas</Label>
                      <Textarea
                        id="regulacao"
                        value={respostas.regulacao}
                        onChange={(e) => handleFieldChange("regulacao", e.target.value)}
                        placeholder="O que ajuda a acalmar a criança nesses momentos? (Abraço, isolamento, objeto específico)"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="interesses_habilidades">Interesses, Gostos e Habilidades Destacadas</Label>
                      <Textarea
                        id="interesses_habilidades"
                        value={respostas.interesses_habilidades}
                        onChange={(e) => handleFieldChange("interesses_habilidades", e.target.value)}
                        placeholder="Tem hiperfocos? Quais habilidades ou temas a criança mais domina e gosta?"
                        rows={2}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 8. INTERVENÇÕES ANTERIORES */}
                <TabsContent value="intervencoes" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-primary/80" /> 8. Intervenções e Terapias Anteriores
                    </h3>
                    <p className="text-xs text-muted-foreground">Histórico de acompanhamentos com outros profissionais e clínicas.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="acompanhamentos_anteriores">Acompanhamentos Anteriores (Psicologia, fono, psicopedagogia, TO, etc.)</Label>
                      <Textarea
                        id="acompanhamentos_anteriores"
                        value={respostas.acompanhamentos_anteriores}
                        onChange={(e) => handleFieldChange("acompanhamentos_anteriores", e.target.value)}
                        placeholder="Quais terapias já realizou? Em quais especialidades?"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="frequencia_duracao">Frequência e Duração dos Tratamentos</Label>
                      <Input
                        id="frequencia_duracao"
                        value={respostas.frequencia_duracao}
                        onChange={(e) => handleFieldChange("frequencia_duracao", e.target.value)}
                        placeholder="Por quanto tempo permaneceu em acompanhamento? Quantas vezes na semana?"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="resultados_percebidos">Resultados Percebidos pelos Pais / Responsáveis</Label>
                      <Textarea
                        id="resultados_percebidos"
                        value={respostas.resultados_percebidos}
                        onChange={(e) => handleFieldChange("resultados_percebidos", e.target.value)}
                        placeholder="Quais foram os avanços ou dificuldades observados durante as intervenções passadas?"
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 9. REDE DE APOIO */}
                <TabsContent value="apoio" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <Heart className="h-5 w-5 text-primary/80" /> 9. Rede de Apoio
                    </h3>
                    <p className="text-xs text-muted-foreground">Parcerias e conexões para o desenvolvimento global do paciente.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="rede_escola">Apoio da Escola (Abertura para orientação, contato com equipe)</Label>
                      <Textarea
                        id="rede_escola"
                        value={respostas.rede_escola}
                        onChange={(e) => handleFieldChange("rede_escola", e.target.value)}
                        placeholder="A escola é parceira? Aceita visitas da clínica? Há canal de comunicação aberto?"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rede_familia">Apoio da Família Ampliada (Avós, tios, cuidadores)</Label>
                      <Textarea
                        id="rede_familia"
                        value={respostas.rede_familia}
                        onChange={(e) => handleFieldChange("rede_familia", e.target.value)}
                        placeholder="Quem ajuda a família no cuidado diário e no transporte para as terapias?"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rede_outros">Outras Instituições ou Profissionais que Acompanham</Label>
                      <Input
                        id="rede_outros"
                        value={respostas.rede_outros}
                        onChange={(e) => handleFieldChange("rede_outros", e.target.value)}
                        placeholder="Ex: Neuropediatra, Psiquiatra Infantil, Pediatra"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 10. DESENVOLVIMENTO */}
                <TabsContent value="desenvolvimento" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <Milestone className="h-5 w-5 text-primary/80" /> 10. Marcos de Desenvolvimento
                    </h3>
                    <p className="text-xs text-muted-foreground">Marcos motores, início da fala, tipo de brincadeira e interação social.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="marcos_motores">Primeiros Marcos Motores (Sustentação de cabeça, sentou, engatinhou, andou)</Label>
                      <Textarea
                        id="marcos_motores"
                        value={respostas.marcos_motores}
                        onChange={(e) => handleFieldChange("marcos_motores", e.target.value)}
                        placeholder="Desenvolvimento motor ocorreu dentro do esperado? Apresentou atrasos?"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="primeiras_palavras">Primeiras Palavras e Balbucio</Label>
                      <Textarea
                        id="primeiras_palavras"
                        value={respostas.primeiras_palavras}
                        onChange={(e) => handleFieldChange("primeiras_palavras", e.target.value)}
                        placeholder="Quando começou a balbuciar? Com que idade falou as primeiras palavras com intenção?"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brincar_interacao">Brincar e Interação Social Inicial</Label>
                      <Textarea
                        id="brincar_interacao"
                        value={respostas.brincar_interacao}
                        onChange={(e) => handleFieldChange("brincar_interacao", e.target.value)}
                        placeholder="Como era o brincar? (Funcional, simbólico, compartilhado, enfileirar objetos). Interagia com outras crianças?"
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 11. PLANO INICIAL */}
                <TabsContent value="plano" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-primary/80" /> 11. Plano Inicial / Metas Terapêuticas
                    </h3>
                    <p className="text-xs text-muted-foreground">Proposta preliminar de metas e focos de intervenção.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="plano_terapeutico">Metas Traçadas e Focos da Terapia</Label>
                      <Textarea
                        id="plano_terapeutico"
                        value={respostas.plano_terapeutico}
                        onChange={(e) => handleFieldChange("plano_terapeutico", e.target.value)}
                        placeholder="Com base na queixa e na metodologia inicial, quais são as metas prioritárias para as primeiras sessões?"
                        rows={6}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 12. OBSERVAÇÕES DO PROFISSIONAL */}
                <TabsContent value="observacoes" className="space-y-4 m-0 focus-visible:outline-none">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary/80" /> 12. Observações do Profissional
                    </h3>
                    <p className="text-xs text-muted-foreground">Anotações clínicas adicionais, impressões gerais do profissional.</p>
                  </div>
                  <hr className="border-border/60" />

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="observacoes_profissional">Anotações Gerais do Profissional</Label>
                      <Textarea
                        id="observacoes_profissional"
                        value={respostas.observacoes_profissional}
                        onChange={(e) => handleFieldChange("observacoes_profissional", e.target.value)}
                        placeholder="Impressões gerais de comportamento, cooperação, comunicação e outras notas durante a entrevista de anamnese."
                        rows={8}
                      />
                    </div>
                  </div>
                </TabsContent>
              </ScrollArea>

              {/* Progress Footer bar */}
              <div className="px-6 py-3 border-t border-border bg-muted/10 shrink-0 flex items-center justify-between text-xs text-muted-foreground">
                <div>
                  Paciente: <span className="font-semibold text-foreground">{paciente?.nome}</span>
                </div>
                <div>
                  Última atualização: {existingAnamnese?.atualizado_em ? safeFormatDate(existingAnamnese.atualizado_em, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "Não salvo"}
                </div>
              </div>
            </div>
          </Tabs>

          {/* PRINT-ONLY PREVIEW */}
          <div className="hidden print:block w-full p-8 font-sans text-foreground bg-white">
            {/* Header timbrado */}
            <div className="text-center border-b-2 border-primary pb-4 mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-primary">ESPAÇO MULTI</h1>
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mt-1">
                Psicologia | Fonoaudiologia | Psicopedagogia
              </p>
              <h2 className="text-lg font-bold mt-4 uppercase">Ficha de Anamnese Clínica</h2>
            </div>

            {/* Identificação Section */}
            <div className="mb-6">
              <h3 className="text-sm font-bold bg-muted/60 px-3 py-1.5 rounded border-l-4 border-primary uppercase mb-3">
                1. Identificação
              </h3>
              <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs">
                <div><span className="font-semibold">Nome Completo:</span> {respostas.nome_completo || "—"}</div>
                <div><span className="font-semibold">Nascimento/Idade:</span> {respostas.data_nascimento || "—"}</div>
                <div><span className="font-semibold">Sexo:</span> {respostas.sexo || "—"}</div>
                <div><span className="font-semibold">Diagnóstico/CID:</span> {respostas.diagnostico || "—"}</div>
                <div><span className="font-semibold">Responsável:</span> {respostas.responsavel || "—"}</div>
                <div><span className="font-semibold">Contato:</span> {respostas.contato || "—"}</div>
                <div className="col-span-2"><span className="font-semibold">Endereço:</span> {respostas.endereco || "—"}</div>
                <div><span className="font-semibold">Escola:</span> {respostas.escola || "—"}</div>
                <div><span className="font-semibold">Ano/Série:</span> {respostas.ano_serie || "—"}</div>
                <div><span className="font-semibold">Data de Avaliação:</span> {respostas.data_avaliacao ? safeFormatDate(respostas.data_avaliacao, "dd/MM/yyyy") : "—"}</div>
              </div>
            </div>

            {/* Render dynamically print sections */}
            {[
              { title: "2. Motivo da Avaliação", fields: [
                { label: "Queixa Principal", value: respostas.queixa_principal },
                { label: "Quem trouxe a queixa", value: respostas.quem_trouxe_queixa },
                { label: "Expectativas da família", value: respostas.expectativas_familia }
              ]},
              { title: "3. Estrutura Familiar", fields: [
                { label: "Com quem reside", value: respostas.reside_com },
                { label: "Dinâmica familiar", value: respostas.dinamica_familiar },
                { label: "Relação com familiares", value: respostas.relacao_familiares }
              ]},
              { title: "4. Rotina e Hábitos", fields: [
                { label: "Sono", value: respostas.sono },
                { label: "Alimentação", value: respostas.alimentacao },
                { label: "Seletividade alimentar", value: respostas.seletividade },
                { label: "Uso de telas", value: respostas.telas },
                { label: "Lazer e brincadeiras", value: respostas.lazer }
              ]},
              { title: "5. Escolaridade e Aprendizagem (Psicopedagogia)", fields: [
                { label: "Histórico escolar", value: respostas.escola_historico },
                { label: "Habilidades acadêmicas", value: respostas.habilidades_academicas },
                { label: "Pontos fortes e dificuldades", value: respostas.pontos_fortes_dificuldades },
                { label: "Estratégias / adaptações na escola", value: respostas.estrategias_adaptacoes }
              ]},
              { title: "6. Comunicação e Linguagem (Fonoaudiologia)", fields: [
                { label: "Clareza da fala / Vocabulário", value: respostas.clareza_fala },
                { label: "Compreensão de ordens", value: respostas.compreensao_ordens },
                { label: "Gestos / Comunicação alternativa", value: respostas.gestos_comunicacao },
                { label: "Fluência e pragmática", value: respostas.fluencia_pragmatica }
              ]},
              { title: "7. Aspectos Emocionais e Comportamentais (Psicologia)", fields: [
                { label: "Humor / Expressão de sentimentos", value: respostas.humor_sentimentos },
                { label: "Reações à frustração", value: respostas.reacoes_frustracao },
                { label: "Comportamentos de interesse", value: respostas.comportamentos_interesse },
                { label: "Estratégias de regulação", value: respostas.regulacao },
                { label: "Gostos e habilidades destacados", value: respostas.interesses_habilidades }
              ]},
              { title: "8. Intervenções e Terapias Anteriores", fields: [
                { label: "Terapias passadas", value: respostas.acompanhamentos_anteriores },
                { label: "Frequência e duração", value: respostas.frequencia_duracao },
                { label: "Resultados obtidos", value: respostas.resultados_percebidos }
              ]},
              { title: "9. Rede de Apoio", fields: [
                { label: "Apoio escolar", value: respostas.rede_escola },
                { label: "Apoio familiar", value: respostas.rede_familia },
                { label: "Outros profissionais", value: respostas.rede_outros }
              ]},
              { title: "10. Desenvolvimento", fields: [
                { label: "Marcos motores", value: respostas.marcos_motores },
                { label: "Primeiras palavras / linguagem", value: respostas.primeiras_palavras },
                { label: "Brincar e interação social", value: respostas.brincar_interacao }
              ]},
              { title: "11. Plano Inicial", fields: [
                { label: "Metas e foco terapêutico", value: respostas.plano_terapeutico }
              ]},
              { title: "12. Observações do Profissional", fields: [
                { label: "Anotações do profissional", value: respostas.observacoes_profissional }
              ]}
            ].map((section, idx) => (
              <div key={idx} className="mb-6 break-inside-avoid">
                <h3 className="text-sm font-bold bg-muted/60 px-3 py-1.5 rounded border-l-4 border-primary uppercase mb-3">
                  {section.title}
                </h3>
                <div className="space-y-3 pl-2 text-xs">
                  {section.fields.map((f, fIdx) => (
                    <div key={fIdx} className="space-y-1">
                      <span className="font-bold text-[10px] uppercase text-muted-foreground block">{f.label}:</span>
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">{f.value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Rodapé de assinaturas */}
            <div className="mt-16 border-t border-border pt-6 flex justify-around text-xs break-inside-avoid">
              <div className="text-center w-64">
                <div className="border-b border-foreground/60 h-8 mb-2"></div>
                <p className="font-semibold">Responsável Legal</p>
                <p className="text-muted-foreground text-[10px]">Assinatura / Data</p>
              </div>
              <div className="text-center w-64">
                <div className="border-b border-foreground/60 h-8 mb-2"></div>
                <p className="font-semibold">Profissional Responsável</p>
                <p className="text-muted-foreground text-[10px]">Assinatura / Registro</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  );
}
