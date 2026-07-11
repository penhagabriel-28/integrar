import { Link, useRouterState } from "@tanstack/react-router";
import { SUPABASE_PROJECT_ID } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Stethoscope,
  Brain,
  DollarSign,
  BarChart3,
  TrendingDown,
  ClipboardCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Agenda", url: "/agenda", icon: Calendar },
  { title: "Pacientes", url: "/pacientes", icon: Users },
  { title: "Profissionais", url: "/profissionais", icon: Stethoscope },
  { title: "Frequência", url: "/frequencia", icon: ClipboardCheck },
  { title: "Despesas", url: "/despesas", icon: TrendingDown },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { setOpenMobile } = useSidebar();

  const menuItems = [...items, { title: "Diretoria", url: "/diretoria", icon: DollarSign }];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="h-5 w-5" />
          </div>
          <div className="leading-tight group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold">Espaço MULTI</div>
            <div className="text-xs text-muted-foreground">Agendamento</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const active = path === item.url || path.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link
                        to={item.url}
                        onClick={() => {
                          setOpenMobile(false);
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <div className="truncate text-xs font-medium text-muted-foreground">Clínica Multi</div>
          <div className="truncate text-[9px] text-muted-foreground/60 mt-0.5">
            DB: {SUPABASE_PROJECT_ID}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
