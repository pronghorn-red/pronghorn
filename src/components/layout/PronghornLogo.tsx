import pronghornLogo from "@/assets/pronghorn-logo.jpeg";
import { cn } from "@/lib/utils";

export function PronghornLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img 
      src={pronghornLogo} 
      alt="Pronghorn Logo" 
      className={cn("rounded-lg", className)}
    />
  );
}
