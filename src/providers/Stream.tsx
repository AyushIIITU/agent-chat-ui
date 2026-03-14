import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { getApiKey } from "@/lib/api-key";
import { useThreads } from "./Thread";
import { toast } from "sonner";

export type StateType = { messages: Message[]; ui?: UIMessage[]; role?: string };

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
      role?: string;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream>;
const StreamContext = createContext<StreamContextType | undefined>(undefined);

// Agent Context for passing static runtime context
export type AgentContextType = {
  agentContext: Record<string, unknown>;
  setAgentContext: (context: Record<string, unknown>) => void;
};

export const AgentContext = createContext<AgentContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/info`, {
      ...(apiKey && {
        headers: {
          "X-Api-Key": apiKey,
        },
      }),
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();

  console.log("[DEBUG StreamSession] Init params:", {
    apiUrl,
    assistantId,
    threadId,
    hasApiKey: !!apiKey,
  });

  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    threadId: threadId ?? null,
    fetchStateHistory: true,
    onCustomEvent: (event, options) => {
      console.log("[DEBUG StreamSession] onCustomEvent:", event);
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
    },
    onThreadId: (id) => {
      console.log("[DEBUG StreamSession] onThreadId — new thread created:", id);
      setThreadId(id);
      // Refetch threads list when thread ID changes.
      // Wait for some seconds before fetching so we're able to get the new thread that was created.
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
    onError: (error: unknown) => {
      console.error("[DEBUG StreamSession] onError — stream error:", error);
    },
  });

  // ─── Fetch interceptor: logs every HTTP request/response to the LangGraph API ───
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;

      const isLangGraphCall = url.startsWith(apiUrl);

      if (isLangGraphCall) {
        let parsedBody: unknown = "(no body)";
        try {
          if (init?.body) {
            parsedBody = JSON.parse(init.body as string);
          }
        } catch {
          parsedBody = init?.body ?? "(no body)";
        }

        console.group(`[DEBUG API →] ${init?.method ?? "GET"} ${url}`);
        console.log("Headers:", init?.headers ?? {});
        console.log("Body:", JSON.stringify(parsedBody, null, 2));
        console.groupEnd();
      }

      const response = await originalFetch(input, init);

      if (isLangGraphCall) {
        console.group(`[DEBUG API ←] ${response.status} ${response.statusText} — ${url}`);
        if (!response.ok) {
          // Clone so the SDK can still read the body
          const cloned = response.clone();
          cloned.text().then((text) => {
            console.error("Error response body:", text);
          });
        }
        console.groupEnd();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [apiUrl]);
  // ────────────────────────────────────────────────────────────────────────────────

  // Log stream state on every change
  useEffect(() => {
    console.log("[DEBUG StreamSession] Stream state changed:", {
      isLoading: streamValue.isLoading,
      error: streamValue.error,
      messageCount: streamValue.messages?.length ?? 0,
    });
  }, [streamValue.isLoading, streamValue.error, streamValue.messages]);

  useEffect(() => {
    console.log("[DEBUG StreamSession] Checking server at:", apiUrl);
    checkGraphStatus(apiUrl, apiKey).then((ok) => {
      console.log("[DEBUG StreamSession] Server reachable:", ok);
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl]);

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = "agent";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;

  console.log("[DEBUG StreamProvider] Env vars:", {
    NEXT_PUBLIC_API_URL: envApiUrl ?? "(not set)",
    NEXT_PUBLIC_ASSISTANT_ID: envAssistantId ?? "(not set)",
  });

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // For API key, use localStorage with env var fallback
  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  // Agent context state - stores static context for agent invocations
  const [agentContext, setAgentContext] = useState<Record<string, unknown>>(
    () => {
      try {
        const stored = window.localStorage.getItem("lg:chat:agentContext");
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    }
  );

  const updateAgentContext = (context: Record<string, unknown>) => {
    console.log("[DEBUG StreamProvider] Saving agentContext:", context);
    window.localStorage.setItem("lg:chat:agentContext", JSON.stringify(context));
    setAgentContext(context);
  };

  // Determine final values to use, prioritizing URL params then env vars
  const finalApiUrl = apiUrl || envApiUrl;
  const finalAssistantId = assistantId || envAssistantId;

  console.log("[DEBUG StreamProvider] Final resolved values:", {
    apiUrl,
    finalApiUrl,
    assistantId,
    finalAssistantId,
    agentContextKeys: Object.keys(agentContext),
    hasUserId: !!(agentContext as Record<string, unknown>).user_id,
  });

  // Show the form if we: don't have an API URL, or don't have an assistant ID
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <LangGraphLogoSVG className="h-7" />
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to Agent Chat! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;
              const apiKey = formData.get("apiKey") as string;
              const contextData = formData.get("agentContext") as string;

              // Parse context JSON if provided
              let parsedContext: Record<string, unknown> = {};
              if (contextData && contextData.trim()) {
                try {
                  parsedContext = JSON.parse(contextData);
                } catch {
                  toast.error("Invalid context JSON", {
                    description: "Please ensure the context is valid JSON format.",
                    duration: 5000,
                  });
                  return;
                }
              }
              
              // Validate required fields
              if (!parsedContext.user_id) {
                toast.error("Missing required field", {
                  description: "The 'user_id' field is required in the agent context.",
                  duration: 5000,
                });
                return;
              }
              
              if (!parsedContext.user_name) {
                toast.error("Missing required field", {
                  description: "The 'user_name' field is required in the agent context.",
                  duration: 5000,
                });
                return;
              }
              
              // Validate role if provided
              if (parsedContext.role && parsedContext.role !== "user" && parsedContext.role !== "trainer") {
                toast.error("Invalid role value", {
                  description: "The 'role' field must be either 'user' or 'trainer'.",
                  duration: 5000,
                });
                return;
              }

              setApiUrl(apiUrl);
              setApiKey(apiKey);
              setAssistantId(assistantId);
              updateAgentContext(parsedContext);

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the graph (can be the graph name), or
                assistant to fetch threads from, and invoke when actions are
                taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={assistantId || DEFAULT_ASSISTANT_ID}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
              <PasswordInput
                id="apiKey"
                name="apiKey"
                defaultValue={apiKey ?? ""}
                className="bg-background"
                placeholder="lsv2_pt_..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="agentContext">
                Agent Context<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                Provide static runtime context as JSON. This context will be
                passed to your agent on every invocation. Required fields:
                <code className="mx-1 rounded bg-muted px-1 py-0.5">user_id</code>,
                <code className="mx-1 rounded bg-muted px-1 py-0.5">user_name</code>.
                Optional fields:
                <code className="mx-1 rounded bg-muted px-1 py-0.5">model</code>,
                <code className="mx-1 rounded bg-muted px-1 py-0.5">role</code> ("user" or "trainer"),
                <code className="mx-1 rounded bg-muted px-1 py-0.5">trainer_id</code>,
                <code className="mx-1 rounded bg-muted px-1 py-0.5">trainer_name</code>
              </p>
              <Textarea
                id="agentContext"
                name="agentContext"
                className="bg-background font-mono text-sm"
                placeholder='{"user_id": "user_123", "user_name": "John Doe", "model": "gpt-4o-mini", "role": "user", "trainer_id": "trainer_456", "trainer_name": "Jane Smith"}'
                defaultValue={
                  Object.keys(agentContext).length > 0
                    ? JSON.stringify(agentContext, null, 2)
                    : '{"user_id": "", "user_name": ""}'
                }
                rows={5}
                required
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
              >
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AgentContext.Provider value={{ agentContext, setAgentContext: updateAgentContext }}>
      <StreamSession
        apiKey={apiKey}
        apiUrl={apiUrl}
        assistantId={assistantId}
      >
        {children}
      </StreamSession>
    </AgentContext.Provider>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

// Create a custom hook to use the agent context
export const useAgentContext = (): AgentContextType => {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgentContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
