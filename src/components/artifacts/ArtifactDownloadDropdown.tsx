import React from "react";
import { Download, FileText, FileJson, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { MarkdownProcessor } from "@/utils/markdownProcessor";

interface ArtifactDownloadDropdownProps {
  title: string;
  content: string;
  aiSummary?: string | null;
  variant?: "ghost" | "outline" | "default";
  size?: "icon" | "sm" | "default";
  iconOnly?: boolean;
}

export const ArtifactDownloadDropdown = React.forwardRef<
  HTMLDivElement,
  ArtifactDownloadDropdownProps
>(({ title, content, aiSummary, variant = "ghost", size = "icon", iconOnly = true }, ref) => {
  const sanitizeFilename = (name: string) => {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50) || "artifact";
  };

  const handleDownloadWord = async () => {
    try {
      const processor = new MarkdownProcessor();
      const sections: Array<{ title: string; value: string }> = [];
      
      if (aiSummary) {
        sections.push({ title: "Summary", value: aiSummary });
      }
      sections.push({ title: "Content", value: content });
      
      const blob = await processor.generateWordDocument(title, sections);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(title)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Downloaded as Word document");
    } catch (error) {
      console.error("Error downloading Word:", error);
      toast.error("Failed to download Word document");
    }
  };

  const handleDownloadMarkdown = () => {
    try {
      let markdownContent = `# ${title}\n\n`;
      if (aiSummary) {
        markdownContent += `## Summary\n\n${aiSummary}\n\n`;
      }
      markdownContent += `## Content\n\n${content}`;
      
      const blob = new Blob([markdownContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(title)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Downloaded as Markdown");
    } catch (error) {
      console.error("Error downloading Markdown:", error);
      toast.error("Failed to download Markdown");
    }
  };

  const handleDownloadJson = () => {
    try {
      const jsonData: Record<string, string> = { title, content };
      if (aiSummary) {
        jsonData.ai_summary = aiSummary;
      }
      const jsonContent = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(title)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Downloaded as JSON");
    } catch (error) {
      console.error("Error downloading JSON:", error);
      toast.error("Failed to download JSON");
    }
  };

  return (
    <div ref={ref}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} title="Download">
            <Download className={size === "icon" ? "h-4 w-4" : "h-3 w-3"} />
            {!iconOnly && <span className="ml-2">Download</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover">
          <DropdownMenuItem onClick={handleDownloadWord} className="cursor-pointer">
            <FileType className="h-4 w-4 mr-2" />
            Download as Word
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadMarkdown} className="cursor-pointer">
            <FileText className="h-4 w-4 mr-2" />
            Download as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadJson} className="cursor-pointer">
            <FileJson className="h-4 w-4 mr-2" />
            Download as JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

ArtifactDownloadDropdown.displayName = "ArtifactDownloadDropdown";
