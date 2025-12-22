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
  variant?: "ghost" | "outline" | "default";
  size?: "icon" | "sm" | "default";
  iconOnly?: boolean;
}

export function ArtifactDownloadDropdown({
  title,
  content,
  variant = "ghost",
  size = "icon",
  iconOnly = true,
}: ArtifactDownloadDropdownProps) {
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
      const sections = [{ title: "Content", value: content }];
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
      const markdownContent = `# ${title}\n\n${content}`;
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
      const jsonContent = JSON.stringify({ title, content }, null, 2);
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
  );
}
