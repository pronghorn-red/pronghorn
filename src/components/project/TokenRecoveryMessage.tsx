import { ShieldAlert, LogIn, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

export function TokenRecoveryMessage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <ShieldAlert className="h-16 w-16 text-amber-500 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Session Token Expired</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Your access token is no longer stored in this browser session. 
        This can happen after closing the browser tab or clearing browser data.
      </p>
      
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <p className="text-sm font-medium mb-3 text-left">To regain access:</p>
          <ul className="text-sm text-left space-y-3">
            <li className="flex items-start gap-2">
              <Link2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Use your original share link with the full token (check your bookmarks, chat history, or email)</span>
            </li>
            <li className="flex items-start gap-2">
              <Link2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Ask the project owner to share the access link again</span>
            </li>
            <li className="flex items-start gap-2">
              <LogIn className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>If you're the owner, sign in to access your projects directly</span>
            </li>
          </ul>
          
          <div className="mt-6 pt-4 border-t flex gap-2 justify-center">
            <Button variant="outline" onClick={() => navigate("/")}>
              Go to Home
            </Button>
            <Button onClick={() => navigate("/auth")}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
