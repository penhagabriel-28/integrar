import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageCircle,
  Copy,
  Settings,
  RotateCcw,
  Sparkles,
  Save,
  Phone,
  User,
  ExternalLink,
} from "lucide-react";

export const STORAGE_KEY_TEMPLATE = "integrar_whatsapp_cobranca_template";
export const STORAGE_KEY_PIX = "integrar_whatsapp_pix";
export const STORAGE_KEY_CLINICA = "integrar_whatsapp_clinica";

export const DEFAULT_WHATSAPP_BILLING_TEMPLATE = `Olá, {responsavel}! Gostaríamos de lembrar do pagamento referente aos atendimentos de {mes} de *{paciente}* no valor total de *{valor}*.{resumo}

Nosso pix: {pix}

Agradecemos a atenção! *{clinica}*`;

export const DEFAULT_WHATSAPP_PIX = "54.747.611/0001-27";
export const DEFAULT_WHATSAPP_CLINICA = "Integrar";

export interface StoredWhatsAppConfig {
  template: string;
  pix: string;
  clinica: string;
}

export function getStoredWhatsAppConfig(): StoredWhatsAppConfig {
  if (typeof window === "undefined") {
    return {
      template: DEFAULT_WHATSAPP_BILLING_TEMPLATE,
      pix: DEFAULT_WHATSAPP_PIX,
      clinica: DEFAULT_WHATSAPP_CLINICA,
    };
  }
  return {
    template:
      window.localStorage.getItem(STORAGE_KEY_TEMPLATE) ||
      DEFAULT_WHATSAPP_BILLING_TEMPLATE,
    pix: window.localStorage.getItem(STORAGE_KEY_PIX) || DEFAULT_WHATSAPP_PIX,
    clinica:
      window.localStorage.getItem(STORAGE_KEY_CLINICA) || DEFAULT_WHATSAPP_CLINICA,
  };
}

export function saveStoredWhatsAppConfig(
  template: string,
  pix: string,
  clinica: string
) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY_TEMPLATE, template.trim());
    window.localStorage.setItem(STORAGE_KEY_PIX, pix.trim());
    window.localStorage.setItem(STORAGE_KEY_CLINICA, clinica.trim());
  }
}

export function formatPhoneForDisplay(rawPhone: string) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  let d = digits;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return rawPhone || "";
}

export function getCleanPhoneWithCountry(rawPhone: string) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildWhatsAppBillingMessage({
  template,
  responsavelNome,
  pacienteNome,
  mesRef,
  totalPendente,
  summaryLines,
  pixKey,
  clinicName,
}: {
  template: string;
  responsavelNome: string;
  pacienteNome: string;
  mesRef: string;
  totalPendente: number;
  summaryLines?: string[];
  pixKey: string;
  clinicName: string;
}) {
  const brl = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  let summaryText = "";
  if (summaryLines && summaryLines.length > 0) {
    summaryText = "\n\nResumo:\n" + summaryLines.join("\n");
  }
  const cleanSummary =
    summaryLines && summaryLines.length > 0 ? summaryLines.join("\n") : "";

  let result = template;

  if (result.includes("{resumo}")) {
    if (summaryLines && summaryLines.length > 0) {
      if (/resumo\s*:\s*\{resumo\}/i.test(result)) {
        result = result.replace(/\{resumo\}/gi, cleanSummary);
      } else {
        result = result.replace(/\{resumo\}/gi, summaryText);
      }
    } else {
      result = result.replace(/(\n*Resumo:\s*)?\{resumo\}/gi, "");
    }
  }

  result = result
    .replace(/\{(responsavel|nome_responsavel)\}/gi, responsavelNome || "")
    .replace(/\{(paciente|nome_paciente)\}/gi, pacienteNome || "")
    .replace(/\{(mes|mes_referencia)\}/gi, mesRef || "")
    .replace(/\{(valor|total|valor_total)\}/gi, brl(totalPendente))
    .replace(/\{(pix|chave_pix)\}/gi, pixKey || DEFAULT_WHATSAPP_PIX)
    .replace(/\{(clinica|nome_clinica)\}/gi, clinicName || DEFAULT_WHATSAPP_CLINICA);

  return result.trim();
}

export interface ResponsibleOption {
  id: string;
  nome: string;
  telefone?: string | null;
  whatsapp?: string | null;
  parentesco?: string | null;
}

export interface WhatsAppBillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteNome: string;
  responsavelNome: string;
  responsavelParentesco?: string;
  telefone: string;
  totalPendente: number;
  mesRef: string;
  summaryLines: string[];
  allResponsibles?: ResponsibleOption[];
  onOpenTemplateConfig: () => void;
}

export function WhatsAppBillingDialog({
  open,
  onOpenChange,
  pacienteNome,
  responsavelNome,
  responsavelParentesco,
  telefone,
  totalPendente,
  mesRef,
  summaryLines,
  allResponsibles = [],
  onOpenTemplateConfig,
}: WhatsAppBillingDialogProps) {
  const [selectedRespId, setSelectedRespId] = useState<string>("");
  const [currentRespName, setCurrentRespName] = useState<string>(responsavelNome);
  const [currentParentesco, setCurrentParentesco] = useState<string | undefined>(
    responsavelParentesco
  );
  const [phoneInput, setPhoneInput] = useState<string>(telefone);
  const [messageText, setMessageText] = useState<string>("");

  const generateMessage = (respName: string) => {
    const config = getStoredWhatsAppConfig();
    return buildWhatsAppBillingMessage({
      template: config.template,
      responsavelNome: respName,
      pacienteNome,
      mesRef,
      totalPendente,
      summaryLines,
      pixKey: config.pix,
      clinicName: config.clinica,
    });
  };

  // Sync state whenever the dialog opens with new patient data
  useEffect(() => {
    if (open) {
      setCurrentRespName(responsavelNome);
      setCurrentParentesco(responsavelParentesco);
      setPhoneInput(formatPhoneForDisplay(telefone));
      setMessageText(generateMessage(responsavelNome));

      if (allResponsibles.length > 0) {
        const found =
          allResponsibles.find((r) => r.nome === responsavelNome) ||
          allResponsibles[0];
        if (found) {
          setSelectedRespId(found.id);
        }
      }
    }
  }, [open, responsavelNome, responsavelParentesco, telefone, pacienteNome, mesRef, totalPendente]);

  const handleSelectResponsible = (respId: string) => {
    setSelectedRespId(respId);
    const resp = allResponsibles.find((r) => r.id === respId);
    if (resp) {
      setCurrentRespName(resp.nome);
      setCurrentParentesco(resp.parentesco || undefined);
      const phone = resp.whatsapp || resp.telefone || "";
      setPhoneInput(formatPhoneForDisplay(phone));
      setMessageText(generateMessage(resp.nome));
    }
  };

  const handleResetMessage = () => {
    setMessageText(generateMessage(currentRespName));
    toast.info("Texto restaurado a partir do modelo padrão.");
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      toast.success("Mensagem copiada para a área de transferência!");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const handleSendWhatsApp = () => {
    const cleanNum = getCleanPhoneWithCountry(phoneInput);
    if (!cleanNum || cleanNum.length < 10) {
      toast.error("Por favor, informe um número de telefone/WhatsApp válido.");
      return;
    }

    const url = `https://wa.me/${cleanNum}?text=${encodeURIComponent(messageText)}`;
    window.open(url, "_blank");
    toast.success("WhatsApp aberto em nova aba!");
    onOpenChange(false);
  };

  const brl = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <MessageCircle className="h-5 w-5 fill-emerald-600/20" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                Enviar Mensagem de Cobrança no WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs">
                Revise ou edite o texto abaixo antes de disparar para o WhatsApp.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Header info cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">
                Paciente
              </span>
              <span className="font-semibold text-foreground text-sm block">
                {pacienteNome}
              </span>
              <span className="text-muted-foreground text-[11px]">
                Competência: <strong className="text-foreground">{mesRef || "Período"}</strong>
              </span>
            </div>
            <div className="sm:text-right">
              <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">
                Total Pendente
              </span>
              <span className="font-bold text-rose-600 dark:text-rose-400 text-base block">
                {brl(totalPendente)}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {summaryLines.length} item(ns) pendente(s)
              </span>
            </div>
          </div>

          {/* Responsible selector (if multiple) & Phone field */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" /> Responsável
              </Label>
              {allResponsibles && allResponsibles.length > 1 ? (
                <Select value={selectedRespId} onValueChange={handleSelectResponsible}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {allResponsibles.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-xs">
                        {r.nome} {r.parentesco ? `(${r.parentesco})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={`${currentRespName}${currentParentesco ? ` (${currentParentesco})` : ""}`}
                  disabled
                  className="h-9 text-xs bg-muted"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" /> WhatsApp / Telefone
              </Label>
              <Input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="(00) 00000-0000"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Text Editor */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> Mensagem para o Responsável
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleResetMessage}
                  title="Restaurar mensagem gerada pelo modelo"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Restaurar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                  onClick={onOpenTemplateConfig}
                  title="Configurar o modelo padrão para todos os envios"
                >
                  <Settings className="h-3 w-3 mr-1" /> Configurar Modelo
                </Button>
              </div>
            </div>

            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={9}
              className="font-sans text-xs sm:text-sm leading-relaxed resize-y border-emerald-500/30 focus-visible:ring-emerald-500/40"
              placeholder="Digite a mensagem..."
            />
            <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-0.5">
              <span>Edite o texto livremente antes de enviar. O WhatsApp só será aberto ao clicar no botão abaixo.</span>
              <span>{messageText.length} caracteres</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-1 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCopyMessage}
            className="gap-1.5"
          >
            <Copy className="h-4 w-4" /> Copiar Mensagem
          </Button>
          <Button
            type="button"
            onClick={handleSendWhatsApp}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            <MessageCircle className="h-4 w-4 fill-white/20" /> Enviar no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface WhatsAppTemplateConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function WhatsAppTemplateConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: WhatsAppTemplateConfigDialogProps) {
  const [template, setTemplate] = useState<string>(DEFAULT_WHATSAPP_BILLING_TEMPLATE);
  const [pix, setPix] = useState<string>(DEFAULT_WHATSAPP_PIX);
  const [clinica, setClinica] = useState<string>(DEFAULT_WHATSAPP_CLINICA);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const config = getStoredWhatsAppConfig();
      setTemplate(config.template);
      setPix(config.pix);
      setClinica(config.clinica);
    }
  }, [open]);

  const insertVariable = (varTag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setTemplate((prev) => prev + varTag);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const nextVal = template.substring(0, start) + varTag + template.substring(end);
    setTemplate(nextVal);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + varTag.length, start + varTag.length);
    }, 50);
  };

  const handleResetDefault = () => {
    if (confirm("Deseja restaurar o modelo original de fábrica?")) {
      setTemplate(DEFAULT_WHATSAPP_BILLING_TEMPLATE);
      setPix(DEFAULT_WHATSAPP_PIX);
      setClinica(DEFAULT_WHATSAPP_CLINICA);
      toast.info("Modelo original restaurado. Clique em 'Salvar Modelo' para confirmar.");
    }
  };

  const handleSave = () => {
    saveStoredWhatsAppConfig(template, pix, clinica);
    toast.success("Modelo de mensagem salvo com sucesso!");
    if (onSaved) onSaved();
    onOpenChange(false);
  };

  // Sample data for preview
  const samplePreview = buildWhatsAppBillingMessage({
    template,
    responsavelNome: "Rosângela Teixeira",
    pacienteNome: "Jasmim Teixeira Ferraz",
    mesRef: "Outubro",
    totalPendente: 300,
    summaryLines: ["• 3 sessão(ões) de Fonoaudiólogo com Leandro Moraes"],
    pixKey: pix,
    clinicName: clinica,
  });

  const availableVariables = [
    { tag: "{responsavel}", label: "Nome do Responsável" },
    { tag: "{paciente}", label: "Nome do Paciente" },
    { tag: "{mes}", label: "Mês de Referência" },
    { tag: "{valor}", label: "Valor Total (R$)" },
    { tag: "{resumo}", label: "Resumo das Sessões" },
    { tag: "{pix}", label: "Chave PIX" },
    { tag: "{clinica}", label: "Nome da Clínica" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                Configurar Modelo de Mensagem WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs">
                Personalize o modelo padrão usado ao enviar cobranças pelo WhatsApp.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Pix and Clinic fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Chave PIX Padrão</Label>
              <Input
                value={pix}
                onChange={(e) => setPix(e.target.value)}
                placeholder="Ex: 54.747.611/0001-27"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome da Clínica</Label>
              <Input
                value={clinica}
                onChange={(e) => setClinica(e.target.value)}
                placeholder="Ex: Integrar"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Quick variable tags */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Variáveis Disponíveis (clique para inserir no texto):</span>
            </Label>
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/40 rounded-lg border border-border">
              {availableVariables.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => insertVariable(v.tag)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-background hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-500/40 border border-border shadow-xs cursor-pointer transition-colors"
                  title={`Inserir ${v.label}`}
                >
                  <code className="text-emerald-600 font-bold">{v.tag}</code>
                  <span className="text-[11px] text-muted-foreground">({v.label})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template Textarea */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Texto do Modelo</Label>
            <Textarea
              ref={textareaRef}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={7}
              className="font-mono text-xs leading-relaxed resize-y border-border focus-visible:ring-emerald-500/40"
              placeholder="Digite o modelo de mensagem..."
            />
          </div>

          {/* Live Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Pré-visualização com dados de exemplo
              </Label>
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20">
                Visualização ao vivo
              </Badge>
            </div>
            <div className="p-3.5 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans shadow-xs">
              {samplePreview}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-1 pt-3 border-t border-border flex-col sm:flex-row justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleResetDefault}
            className="text-xs text-muted-foreground hover:text-destructive self-start sm:self-center"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar Padrão de Fábrica
          </Button>
          <div className="flex items-center gap-2 self-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Save className="h-4 w-4" /> Salvar Modelo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
