import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAUpdatePrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  // Handle install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setInstallPrompt(promptEvent);

      toast("Install Pronghorn", {
        description: "Add to your home screen for the best experience.",
        icon: <Download className="h-4 w-4" />,
        action: {
          label: "Install",
          onClick: async () => {
            await promptEvent.prompt();
            const { outcome } = await promptEvent.userChoice;
            if (outcome === "accepted") {
              setInstallPrompt(null);
            }
          },
        },
        duration: 15000,
        id: "pwa-install",
      });
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Handle update prompt
  useEffect(() => {
    if (needRefresh) {
      toast("New version available!", {
        description: "Click to update and get the latest features.",
        icon: <RefreshCw className="h-4 w-4" />,
        action: {
          label: "Update",
          onClick: () => updateServiceWorker(true),
        },
        duration: Infinity,
        id: "pwa-update",
      });
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
