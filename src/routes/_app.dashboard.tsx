import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, Stethoscope, CheckCircle2, Clock, XCircle, DoorOpen, DoorClosed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const statusColors: Record<string, string> = {
  confirmado: "bg-success/15 text-success",
  pendente: "bg-warning/20 text-warning-foreground",
  cancelado: "bg-destructive/15 text-destructive",
  realizado: "bg-primary/15 text-primary",
  falta: "bg-muted text-muted-foreground",
  pago: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function Dashboard() {
  // Estado para atualizar a contagem de tempo real a cada 15 segundos
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const dateKey = format(now, "yyyy-MM-dd");

  const { data: agHoje = [] } = useQuery({
    queryKey: ["ags", "hoje", dateKey],
    queryFn: async () => {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("agendamentos")
        .select("*, pacientes(nome), profissionais(nome, cor, especialidade), servicos(nome)")
        .gte("data_inicio", start.toISOString())
        .lte("data_inicio", end.toISOString())
        .order("data_inicio");
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery({
    queryKey: ["ags", "stats", dateKey],
    queryFn: async () => {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const [pac, prof, ag] = await Promise.all([
        supabase
          .from("pacientes")
          .select("id", { count: "exact", head: true })
          .eq("status", "ativo"),
        supabase
          .from("profissionais")
          .select("id", { count: "exact", head: true })
          .eq("ativo", true),
        supabase
          .from("agendamentos")
          .select("status")
          .gte("data_inicio", start.toISOString())
          .lte("data_inicio", end.toISOString()),
      ]);
      const ags = ag.data ?? [];
      return {
        pacientes: pac.count ?? 0,
        profissionais: prof.count ?? 0,
        agendamentosHoje: ags.length,
        realizados: ags.filter((a) => a.status === "realizado").length,
        faltas: ags.filter((a) => a.status === "falta").length,
      };
    },
    refetchInterval: 15000,
  });

  // Buscar salas ativas
  const { data: salas = [] } = useQuery({
    queryKey: ["salas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salas")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
        <h2 className="text-2xl font-semibold">Visão geral</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Calendar}
          label="Agendamentos hoje"
          value={stats?.agendamentosHoje ?? 0}
          tone="primary"
        />
        <StatCard
          icon={CheckCircle2}
          label="Realizados"
          value={stats?.realizados ?? 0}
          tone="success"
        />
        <StatCard icon={XCircle} label="Faltas" value={stats?.faltas ?? 0} tone="destructive" />
        <StatCard
          icon={Users}
          label="Pacientes ativos"
          value={stats?.pacientes ?? 0}
          tone="accent"
        />
      </div>

      {/* Central de Monitoramento de Salas */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Monitoramento de Salas (Tempo Real)
        </h3>

        {salas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma sala ativa cadastrada no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {salas.map((sala) => {
              // Filtrar agendamentos do dia vinculados a esta sala
              const roomAgendamentos = agHoje.filter(
                (a: any) =>
                  a.sala_id === sala.id &&
                  a.status !== "cancelado" &&
                  a.status !== "falta"
              );

              // Encontrar agendamento ativo agora
              const currentAppt = roomAgendamentos.find((a: any) => {
                const start = new Date(a.data_inicio);
                const specUpper = (a.servicos?.nome || a.profissionais?.especialidade || "").toUpperCase();
                const duration = specUpper === "AT ABA" ? 90 : 60;
                const end = new Date(start.getTime() + duration * 60000);
                return start <= now && end >= now;
              });

              const isOccupied = !!currentAppt;

              // Encontrar próximo agendamento hoje
              const nextAppt = roomAgendamentos
                .filter((a: any) => new Date(a.data_inicio) > now)
                .sort(
                  (a: any, b: any) =>
                    new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()
                )[0];

              // Computar tempo restante e progresso caso ocupada
              let progress = 0;
              let remainingMin = 0;
              if (currentAppt) {
                const start = new Date(currentAppt.data_inicio).getTime();
                const specUpper = (currentAppt.servicos?.nome || currentAppt.profissionais?.especialidade || "").toUpperCase();
                const duration = specUpper === "AT ABA" ? 90 : 60;
                const end = start + duration * 60000;
                const total = end - start;
                const elapsed = now.getTime() - start;
                progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
                remainingMin = Math.max(0, Math.round((end - now.getTime()) / 60000));
              }

              return (
                <Card
                  key={sala.id}
                  className={`overflow-hidden border transition-all duration-300 ${
                    isOccupied
                      ? "border-rose-500/25 bg-rose-500/[0.01] dark:bg-rose-500/[0.03]"
                      : "border-emerald-500/25 bg-emerald-500/[0.01] dark:bg-emerald-500/[0.03]"
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Nome da Sala e Badge de Status */}
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-card-foreground">
                        {sala.nome}
                      </span>
                      <Badge
                        className={
                          isOccupied
                            ? "bg-rose-500/10 text-rose-600 hover:bg-rose-500/15 dark:text-rose-400 border border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-500/20"
                        }
                        variant="outline"
                      >
                        <span
                          className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                            isOccupied ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                          }`}
                        />
                        {isOccupied ? "Ocupada" : "Disponível"}
                      </Badge>
                    </div>

                    {/* Detalhes de Atendimento */}
                    {isOccupied ? (
                      <div className="space-y-2.5">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 p-1 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">
                            <DoorClosed className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate text-foreground">
                              {currentAppt.pacientes?.nome}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {currentAppt.servicos?.nome} • {currentAppt.profissionais?.nome}
                            </div>
                          </div>
                        </div>

                        {/* Barra de Progresso e Tempo Restante */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {format(new Date(currentAppt.data_inicio), "HH:mm")} –{" "}
                              {(() => {
                                const start = new Date(currentAppt.data_inicio);
                                const specUpper = (currentAppt.servicos?.nome || currentAppt.profissionais?.especialidade || "").toUpperCase();
                                const duration = specUpper === "AT ABA" ? 90 : 60;
                                const end = new Date(start.getTime() + duration * 60000);
                                return format(end, "HH:mm");
                              })()}
                            </span>
                            <span>{remainingMin} min restantes</span>
                          </div>
                          <Progress value={progress} className="h-1 bg-rose-500/15" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 py-1">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 p-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <DoorOpen className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {nextAppt ? (
                              <div className="text-[10px] leading-tight">
                                <span className="text-muted-foreground block text-[9px] font-medium uppercase tracking-wider mb-0.5">
                                  Próximo Atendimento
                                </span>
                                <span className="font-semibold text-foreground truncate block">
                                  {nextAppt.pacientes?.nome}
                                </span>
                                <span className="text-muted-foreground block truncate">
                                  {format(new Date(nextAppt.data_inicio), "HH:mm")} •{" "}
                                  {nextAppt.servicos?.nome}
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground py-1">
                                Sem mais atendimentos hoje.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Agendamentos de hoje</CardTitle>
          <Link to="/agenda" className="text-sm text-primary hover:underline">
            Ver agenda completa
          </Link>
        </CardHeader>
        <CardContent>
          {agHoje.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Clock className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nenhum agendamento para hoje.
            </div>
          ) : (
            <div className="divide-y">
              {agHoje.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 py-3">
                  <div
                    className="h-10 w-1 rounded-full"
                    style={{ background: a.profissionais?.cor ?? "var(--primary)" }}
                  />
                  <div className="min-w-[80px] text-sm font-medium">
                    {format(new Date(a.data_inicio), "HH:mm")} –{" "}
                    {(() => {
                      const start = new Date(a.data_inicio);
                      const specUpper = (a.servicos?.nome || a.profissionais?.especialidade || "").toUpperCase();
                      const duration = specUpper === "AT ABA" ? 90 : 60;
                      const end = new Date(start.getTime() + duration * 60000);
                      return format(end, "HH:mm");
                    })()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.pacientes?.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.servicos?.nome} • {a.profissionais?.nome}
                    </div>
                  </div>
                  <Badge className={statusColors[a.status] ?? ""} variant="secondary">
                    {a.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <QuickLink
          to="/pacientes"
          icon={Users}
          title="Gerenciar pacientes"
          desc="Cadastros, responsáveis e histórico"
        />
        <QuickLink
          to="/profissionais"
          icon={Stethoscope}
          title="Equipe"
          desc="Profissionais, especialidades e cores"
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "primary" | "success" | "destructive" | "accent";
}) {
  const map = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/10 text-destructive",
    accent: "bg-accent/15 text-accent",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-11 w-11 place-items-center rounded-lg ${map[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ to, icon: Icon, title, desc }: any) {
  return (
    <Link
      to={to}
      className="group rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
    </Link>
  );
}
