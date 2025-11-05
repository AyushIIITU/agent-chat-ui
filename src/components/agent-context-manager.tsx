import { useState } from "react";
import { useAgentContext } from "@/providers/Stream";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Settings } from "lucide-react";
import { toast } from "sonner";

export function AgentContextManager() {
  const { agentContext, setAgentContext } = useAgentContext();
  const [contextInput, setContextInput] = useState(
    JSON.stringify(agentContext, null, 2)
  );
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    try {
      const parsed = contextInput.trim()
        ? JSON.parse(contextInput)
        : {};
      
      // Validate required field - user_id is ALWAYS required
      if (!parsed.user_id) {
        toast.error("Missing required field", {
          description: "The 'user_id' field is required in the context.",
          duration: 5000,
        });
        return;
      }
      
      // Validate role if provided
      if (parsed.role && parsed.role !== "user" && parsed.role !== "admin") {
        toast.error("Invalid role value", {
          description: "The 'role' field must be either 'user' or 'admin'.",
          duration: 5000,
        });
        return;
      }
      
      setAgentContext(parsed);
      setIsOpen(false);
      toast.success("Agent context updated successfully");
    } catch {
      toast.error("Invalid JSON format", {
        description: "Please ensure the context is valid JSON.",
      });
    }
  };

  const handleClear = () => {
    setContextInput("{}");
    setAgentContext({});
    toast.success("Agent context cleared");
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Agent Context Settings</SheetTitle>
          <SheetDescription>
            Configure static runtime context that will be passed to your agent
            on every invocation.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-4 text-sm">
            <h4 className="font-semibold mb-2">Expected Schema:</h4>
            <ul className="space-y-1 text-xs">
              <li>
                <code className="rounded bg-background px-1 py-0.5">user_id</code>
                <span className="text-red-500 ml-1">*</span> - User identifier (required)
              </li>
              <li>
                <code className="rounded bg-background px-1 py-0.5">model</code> - LLM model name (optional, default: gpt-4o-mini)
              </li>
              <li>
                <code className="rounded bg-background px-1 py-0.5">role</code> - User role: "user" or "admin" (optional, default: user)
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="context-editor">Context (JSON)</Label>
            <p className="text-sm text-muted-foreground">
              This context is available in your agent&apos;s runtime via <code className="rounded bg-muted px-1 py-0.5">runtime.context</code>
            </p>
            <Textarea
              id="context-editor"
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              className="font-mono text-sm min-h-[240px]"
              placeholder='{\n  "user_id": "user_123",\n  "model": "gpt-4o",\n  "role": "admin"\n}'
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1">
              Save Context
            </Button>
            <Button onClick={handleClear} variant="outline">
              Clear
            </Button>
          </div>
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="text-sm font-semibold mb-2">Current Context:</h4>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(agentContext, null, 2)}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
