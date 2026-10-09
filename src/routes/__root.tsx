import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AlertTriangle, Copy, Check, RotateCcw, Home, RefreshCw } from "lucide-react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: any; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(true);

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : typeof error?.message === "string"
      ? error.message
      : JSON.stringify(error, null, 2) || "Erro inesperado desconhecido";

  const errorStack = error instanceof Error ? error.stack : error?.stack ? String(error.stack) : "";
  const errorName = error instanceof Error ? error.name : error?.name ? String(error.name) : "Erro";

  const fullErrorDetails = `Tipo: ${errorName}\nMensagem: ${errorMessage}${
    errorStack ? `\n\nRastreamento de Pilha (Stack):\n${errorStack}` : ""
  }\n\nURL: ${typeof window !== "undefined" ? window.location.href : ""}\nData/Hora: ${new Date().toLocaleString("pt-BR")}`;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(fullErrorDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8 text-foreground">
      <div className="w-full max-w-2xl rounded-2xl border border-destructive/30 bg-card p-6 shadow-xl space-y-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-destructive/10 p-3 text-destructive shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Ocorreu um erro nesta página
              </h1>
              <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-destructive">
                {errorName}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A aplicação encontrou uma falha ao carregar este conteúdo. Os detalhes do erro estão exibidos abaixo:
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-destructive">
              Mensagem do Erro:
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Copiar detalhes</span>
                </>
              )}
            </button>
          </div>
          <div className="rounded-lg bg-background/80 p-3 font-mono text-sm font-semibold text-destructive break-words whitespace-pre-wrap border border-destructive/20 select-all">
            {errorMessage}
          </div>
        </div>

        {errorStack && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Rastreamento técnico (Stack Trace):
              </span>
              <button
                type="button"
                onClick={() => setShowStack((prev) => !prev)}
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                {showStack ? "Ocultar detalhes técnicos" : "Exibir detalhes técnicos"}
              </button>
            </div>
            {showStack && (
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-4 text-xs font-mono leading-relaxed text-slate-100 select-all">
                {errorStack}
              </pre>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar página
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Home className="h-4 w-4" />
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Integrar — Sistema de Agendamento" },
      {
        name: "description",
        content:
          "Sistema de agendamento para clínicas infantis especializadas em crianças neurodivergentes.",
      },
      { property: "og:title", content: "Integrar — Sistema de Agendamento" },
      { name: "twitter:title", content: "Integrar — Sistema de Agendamento" },
      {
        property: "og:description",
        content:
          "Sistema de agendamento para clínicas infantis especializadas em crianças neurodivergentes.",
      },
      {
        name: "twitter:description",
        content:
          "Sistema de agendamento para clínicas infantis especializadas em crianças neurodivergentes.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/nMdj4W20UNO8FGFZoy3nF7xJd572/social-images/social-1780087028450-capa_2026.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/nMdj4W20UNO8FGFZoy3nF7xJd572/social-images/social-1780087028450-capa_2026.webp",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      {
        name: "description",
        content: "Integrar displays a preview of your GitHub repository.",
      },
      {
        property: "og:description",
        content: "Integrar displays a preview of your GitHub repository.",
      },
      {
        name: "twitter:description",
        content: "Integrar displays a preview of your GitHub repository.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/G7SKzAnWG7T78hTWrTtj8nnXpF53/social-images/social-1780583190067-CAPA_NOVA.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/G7SKzAnWG7T78hTWrTtj8nnXpF53/social-images/social-1780583190067-CAPA_NOVA.webp",
      },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
