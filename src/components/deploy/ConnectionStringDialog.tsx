import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, Eye, EyeOff, Database } from "lucide-react";
import { toast } from "sonner";

interface ConnectionStringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionInfo: any;
  databaseName: string;
}

export function ConnectionStringDialog({
  open,
  onOpenChange,
  connectionInfo,
  databaseName,
}: ConnectionStringDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (value: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!connectionInfo) return null;

  const CopyButton = ({ value, fieldName }: { value: string; fieldName: string }) => (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => handleCopy(value, fieldName)}
      className="h-8 w-8"
    >
      {copiedField === fieldName ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Connection Details: {databaseName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Password */}
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="flex items-center gap-2">
              <Input
                type={showPassword ? "text" : "password"}
                value={connectionInfo.password || ""}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="h-8 w-8"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <CopyButton value={connectionInfo.password || ""} fieldName="Password" />
            </div>
          </div>

          {/* Internal Connection String */}
          <div className="space-y-2">
            <Label>Internal Connection String</Label>
            <p className="text-xs text-muted-foreground">
              Use this for Render services in the same region (faster, no egress costs)
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={connectionInfo.internalConnectionString || ""}
                readOnly
                className="font-mono text-sm"
              />
              <CopyButton
                value={connectionInfo.internalConnectionString || ""}
                fieldName="Internal Connection String"
              />
            </div>
          </div>

          {/* External Connection String */}
          <div className="space-y-2">
            <Label>External Connection String</Label>
            <p className="text-xs text-muted-foreground">
              Use this for external connections (outside Render)
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={connectionInfo.externalConnectionString || ""}
                readOnly
                className="font-mono text-sm"
              />
              <CopyButton
                value={connectionInfo.externalConnectionString || ""}
                fieldName="External Connection String"
              />
            </div>
          </div>

          {/* PSQL Command */}
          <div className="space-y-2">
            <Label>PSQL Command</Label>
            <p className="text-xs text-muted-foreground">
              Copy-paste ready command for psql CLI
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={connectionInfo.psqlCommand || `PGPASSWORD='${connectionInfo.password}' psql -h ${connectionInfo.host} -p ${connectionInfo.port} -U ${connectionInfo.user} ${connectionInfo.database}`}
                readOnly
                className="font-mono text-sm"
              />
              <CopyButton
                value={connectionInfo.psqlCommand || `PGPASSWORD='${connectionInfo.password}' psql -h ${connectionInfo.host} -p ${connectionInfo.port} -U ${connectionInfo.user} ${connectionInfo.database}`}
                fieldName="PSQL Command"
              />
            </div>
          </div>

          {/* Individual connection details */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Host</Label>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                  {connectionInfo.host}
                </code>
                <CopyButton value={connectionInfo.host || ""} fieldName="Host" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Port</Label>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                  {connectionInfo.port}
                </code>
                <CopyButton value={String(connectionInfo.port || "")} fieldName="Port" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Database</Label>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                  {connectionInfo.database}
                </code>
                <CopyButton value={connectionInfo.database || ""} fieldName="Database" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">User</Label>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                  {connectionInfo.user}
                </code>
                <CopyButton value={connectionInfo.user || ""} fieldName="User" />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Copy the connection string and paste it as <code className="bg-muted px-1 rounded">DATABASE_URL</code> in your deployment's environment variables.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
