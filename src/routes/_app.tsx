import { createFileRoute, Navigate, Outlet, useRouterState, Link } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calendar, Lock } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/agenda": "Agenda",
  "/pacientes": "Pacientes",
  "/profissionais": "Profissionais",
  "/frequencia": "Frequência",
  "/relatorios": "Relatórios",
  "/diretoria": "Diretoria",
  "/despesas": "Despesas",
};

function AppLayout() {
  const { session, loading } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Carregando…</div>
    );
  }

  const title =
    Object.entries(titles).find(([k]) => path === k || path.startsWith(k + "/"))?.[1] ?? "";

  const isDiretoriaUnlocked =
    typeof window !== "undefined" && window.sessionStorage.getItem("diretoria_unlocked") === "true";
  const isDespesasUnlocked =
    typeof window !== "undefined" && window.sessionStorage.getItem("despesas_unlocked") === "true";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <h1 className="text-base font-semibold">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              {path === "/diretoria" && isDiretoriaUnlocked && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
                  onClick={() => {
                    window.sessionStorage.removeItem("diretoria_unlocked");
                    window.location.reload();
                  }}
                >
                  <Lock className="h-4 w-4" /> Bloquear Acesso
                </Button>
              )}
              {path === "/despesas" && isDespesasUnlocked && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
                  onClick={() => {
                    window.sessionStorage.removeItem("despesas_unlocked");
                    window.location.reload();
                  }}
                >
                  <Lock className="h-4 w-4" /> Bloquear Acesso
                </Button>
              )}
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/agenda">
                  <Calendar className="h-4 w-4" /> Acessar Agenda
                </Link>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// trigger rebuild
