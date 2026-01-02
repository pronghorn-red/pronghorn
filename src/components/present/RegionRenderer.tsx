import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";

// Markdown renderer component for consistent styling
const MarkdownContent = ({ 
  content, 
  className = "",
  style 
}: { 
  content: string; 
  className?: string; 
  style?: React.CSSProperties;
}) => (
  <div className={className}>
    <ReactMarkdown
      components={{
        p: ({ children }) => <span style={style}>{children}</span>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
        li: ({ children }) => <li style={style}>{children}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

interface LayoutRegion {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: string;
  level?: number;
  muted?: boolean;
  size?: string;
  zIndex?: number;
  objectFit?: string;
  columns?: number;
  italic?: boolean;
}

interface SlideContent {
  regionId: string;
  type: string;
  data: any;
}

interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  muted: string;
}

interface RegionRendererProps {
  region: LayoutRegion;
  content?: SlideContent;
  slideTitle?: string;
  slideSubtitle?: string;
  themeColors: ThemeColors;
  isPreview?: boolean;
}

export function RegionRenderer({ 
  region, 
  content, 
  slideTitle, 
  slideSubtitle, 
  themeColors, 
  isPreview = false 
}: RegionRendererProps) {
  const scaleFactor = isPreview ? 0.4 : 1;

  // Helper to get text alignment class
  const getAlignClass = () => {
    switch (region.align) {
      case "center": return "text-center";
      case "right": return "text-right";
      default: return "text-left";
    }
  };

  // Helper to get font size based on level or size
  const getFontSize = (defaultSize: string) => {
    if (region.size) {
      const sizes: Record<string, string> = {
        "xs": isPreview ? "0.5rem" : "0.75rem",
        "sm": isPreview ? "0.625rem" : "0.875rem",
        "base": isPreview ? "0.75rem" : "1rem",
        "lg": isPreview ? "0.875rem" : "1.125rem",
        "xl": isPreview ? "1rem" : "1.25rem",
        "2xl": isPreview ? "1.125rem" : "1.5rem",
        "3xl": isPreview ? "1.25rem" : "1.875rem",
        "4xl": isPreview ? "1.5rem" : "2.25rem",
        "5xl": isPreview ? "1.75rem" : "3rem",
        "6xl": isPreview ? "2rem" : "3.75rem",
      };
      return sizes[region.size] || defaultSize;
    }
    return defaultSize;
  };

  // Render based on region type or content type
  const renderContent = () => {
    // If content is provided, use its type
    if (content) {
      switch (content.type) {
        case "heading":
          return (
            <h2 
              className={`font-bold font-raleway ${getAlignClass()}`}
              style={{ 
                fontSize: getFontSize(isPreview ? "1rem" : "2rem"),
                color: themeColors.foreground,
              }}
            >
              {content.data?.text || slideTitle}
            </h2>
          );

        case "text":
          return (
            <div className={`${getAlignClass()} ${region.italic ? "italic" : ""}`}>
              <MarkdownContent 
                content={content.data?.text || ""}
                style={{ 
                  fontSize: getFontSize(isPreview ? "0.625rem" : "1rem"),
                  color: region.muted ? themeColors.muted : themeColors.foreground,
                }}
              />
            </div>
          );

        case "bullets":
          const items = content.data?.items || [];
          return (
            <ul className="space-y-2">
              {items.map((item: any, i: number) => (
                <li 
                  key={i} 
                  className="flex items-start gap-2"
                  style={{ 
                    fontSize: getFontSize(isPreview ? "0.5rem" : "0.875rem"),
                    color: themeColors.foreground,
                  }}
                >
                  <Circle 
                    className="flex-shrink-0 mt-1" 
                    style={{ 
                      width: isPreview ? 6 : 10, 
                      height: isPreview ? 6 : 10,
                      color: themeColors.primary,
                      fill: themeColors.primary,
                    }} 
                  />
                  <div>
                    {typeof item === "string" ? (
                      <MarkdownContent 
                        content={item} 
                        style={{ color: themeColors.foreground }}
                      />
                    ) : (
                      <>
                        <MarkdownContent 
                          content={item.title || ""} 
                          className="font-semibold"
                          style={{ color: themeColors.foreground }}
                        />
                        {item.description && (
                          <div className="mt-0.5">
                            <MarkdownContent
                              content={item.description}
                              style={{ 
                                color: themeColors.muted,
                                fontSize: isPreview ? "0.45rem" : "0.8rem",
                              }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          );

        case "stat":
          return (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div 
                className="font-bold font-raleway"
                style={{ 
                  fontSize: isPreview ? "1.25rem" : "3rem",
                  color: themeColors.primary,
                }}
              >
                {content.data?.value || "0"}
              </div>
              <div 
                style={{ 
                  fontSize: isPreview ? "0.5rem" : "0.875rem",
                  color: themeColors.muted,
                }}
              >
                {content.data?.label || ""}
              </div>
              {content.data?.change && (
                <div 
                  className="mt-1"
                  style={{ 
                    fontSize: isPreview ? "0.4rem" : "0.75rem",
                    color: content.data.change.startsWith("+") ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
                  }}
                >
                  {content.data.change}
                </div>
              )}
            </div>
          );

        case "image":
          return (
            <img
              src={content.data?.url || ""}
              alt={content.data?.alt || ""}
              className="w-full h-full"
              style={{ 
                objectFit: (region.objectFit as any) || "cover",
              }}
            />
          );

        case "timeline":
          const steps = content.data?.steps || [];
          return (
            <div className="flex items-center justify-between h-full px-4">
              {steps.map((step: any, i: number) => (
                <div key={i} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div 
                      className="rounded-full flex items-center justify-center font-bold"
                      style={{ 
                        width: isPreview ? 20 : 40,
                        height: isPreview ? 20 : 40,
                        background: themeColors.primary,
                        color: themeColors.background,
                        fontSize: isPreview ? "0.5rem" : "1rem",
                      }}
                    >
                      {i + 1}
                    </div>
                    <div className="mt-2 text-center">
                      <div 
                        className="font-semibold"
                        style={{ 
                          fontSize: isPreview ? "0.45rem" : "0.875rem",
                          color: themeColors.foreground,
                        }}
                      >
                        {step.title}
                      </div>
                      <div 
                        className="max-w-20"
                        style={{ 
                          fontSize: isPreview ? "0.35rem" : "0.75rem",
                          color: themeColors.muted,
                        }}
                      >
                        {step.description}
                      </div>
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <ArrowRight 
                      className="mx-2"
                      style={{ 
                        width: isPreview ? 12 : 24,
                        height: isPreview ? 12 : 24,
                        color: themeColors.muted,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          );

        case "icon-grid":
          const gridItems = content.data?.items || [];
          const columns = region.columns || 3;
          return (
            <div 
              className="grid gap-4 h-full"
              style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            >
              {gridItems.map((item: any, i: number) => (
                <div 
                  key={i} 
                  className="flex flex-col items-center text-center p-2"
                >
                  <div 
                    className="rounded-lg flex items-center justify-center mb-2"
                    style={{ 
                      width: isPreview ? 24 : 48,
                      height: isPreview ? 24 : 48,
                      background: `${themeColors.primary}22`,
                    }}
                  >
                    <CheckCircle2 
                      style={{ 
                        width: isPreview ? 14 : 28,
                        height: isPreview ? 14 : 28,
                        color: themeColors.primary,
                      }}
                    />
                  </div>
                  <div 
                    className="font-semibold"
                    style={{ 
                      fontSize: isPreview ? "0.45rem" : "0.875rem",
                      color: themeColors.foreground,
                    }}
                  >
                    {item.title}
                  </div>
                  <div 
                    style={{ 
                      fontSize: isPreview ? "0.35rem" : "0.75rem",
                      color: themeColors.muted,
                    }}
                  >
                    {item.description}
                  </div>
                </div>
              ))}
            </div>
          );

        case "richtext":
          // Strip any HTML tags and render as markdown
          const rawText = content.data?.text || content.data?.html || "";
          const cleanText = rawText.replace(/<[^>]*>/g, ''); // Remove HTML tags
          return (
            <div 
              className="overflow-y-auto max-h-full"
              style={{ 
                fontSize: getFontSize(isPreview ? "0.5rem" : "0.9rem"),
                lineHeight: 1.6,
              }}
            >
              <MarkdownContent 
                content={cleanText}
                style={{ color: themeColors.foreground }}
              />
            </div>
          );

        default:
          // Try to render as text
          if (content.data?.text) {
            return (
              <p 
                className={getAlignClass()}
                style={{ 
                  fontSize: getFontSize(isPreview ? "0.625rem" : "1rem"),
                  color: region.muted ? themeColors.muted : themeColors.foreground,
                }}
              >
                {content.data.text}
              </p>
            );
          }
          return null;
      }
    }

    // Fallback: Render based on region type with slide title/subtitle
    switch (region.type) {
      case "heading":
        const level = region.level || 2;
        const headingSizes: Record<number, string> = {
          1: isPreview ? "1.25rem" : "3rem",
          2: isPreview ? "1rem" : "2rem",
          3: isPreview ? "0.875rem" : "1.5rem",
        };
        return (
          <h2 
            className={`font-bold font-raleway ${getAlignClass()}`}
            style={{ 
              fontSize: headingSizes[level] || headingSizes[2],
              color: themeColors.foreground,
            }}
          >
            {slideTitle || ""}
          </h2>
        );

      case "text":
        return (
          <p 
            className={`${getAlignClass()} ${region.italic ? "italic" : ""}`}
            style={{ 
              fontSize: getFontSize(isPreview ? "0.625rem" : "1rem"),
              color: region.muted ? themeColors.muted : themeColors.foreground,
            }}
          >
            {slideSubtitle || ""}
          </p>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full overflow-hidden overflow-y-auto">
      {renderContent()}
    </div>
  );
}
