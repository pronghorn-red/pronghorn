import { Circle, ArrowRight, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface SlideContent {
  regionId: string;
  type: string;
  data: any;
}

interface Slide {
  id: string;
  order: number;
  layoutId: string;
  title: string;
  subtitle?: string;
  content: SlideContent[];
  notes?: string;
  imageUrl?: string;
}

interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  muted: string;
}

interface ResponsiveSlideLayoutProps {
  slide: Slide;
  themeColors: ThemeColors;
}

// Markdown renderer for consistent styling
const MarkdownText = ({ content, className = "", style }: { content: string; className?: string; style?: React.CSSProperties }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <span className={className} style={style}>{children}</span>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
      li: ({ children }) => <li style={style}>{children}</li>,
    }}
  >
    {content}
  </ReactMarkdown>
);

export function ResponsiveSlideLayout({ slide, themeColors }: ResponsiveSlideLayoutProps) {
  const { layoutId, title, subtitle, content, imageUrl } = slide;

  // Get content by type
  const getContentByType = (type: string) => content?.find(c => c.type === type);
  const getContentByRegion = (regionId: string) => content?.find(c => c.regionId === regionId);
  
  // Get main content (bullets, text, etc.)
  const bulletsContent = getContentByType("bullets") || getContentByRegion("bullets") || getContentByRegion("main");
  const imageContent = getContentByType("image") || getContentByRegion("image");
  const timelineContent = getContentByType("timeline") || getContentByRegion("timeline");
  const statsContent = content?.filter(c => c.type === "stat");
  const gridContent = getContentByType("icon-grid") || getContentByRegion("grid");

  // Render title section
  const renderTitle = () => (
    <div className="shrink-0 px-6 pt-6 pb-4">
      <h2 
        className="text-xl md:text-2xl lg:text-3xl font-bold font-raleway leading-tight"
        style={{ color: themeColors.foreground }}
      >
        {title}
      </h2>
      {subtitle && (
        <p 
          className="mt-2 text-sm md:text-base opacity-80"
          style={{ color: themeColors.muted }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );

  // Render bullets
  const renderBullets = (items: any[]) => (
    <ul className="space-y-3">
      {items.map((item: any, i: number) => (
        <li 
          key={i} 
          className="flex items-start gap-3"
          style={{ color: themeColors.foreground }}
        >
          <Circle 
            className="flex-shrink-0 mt-1.5" 
            style={{ 
              width: 8, 
              height: 8,
              color: themeColors.primary,
              fill: themeColors.primary,
            }} 
          />
          <div className="flex-1 text-sm md:text-base">
            {typeof item === "string" ? (
              <MarkdownText content={item} style={{ color: themeColors.foreground }} />
            ) : (
              <>
                <span className="font-semibold">{item.title}</span>
                {item.description && (
                  <p className="mt-0.5 text-sm" style={{ color: themeColors.muted }}>
                    {item.description}
                  </p>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  // Render image
  const renderImage = (url: string, alt?: string) => (
    <div className="w-full h-full min-h-[150px] relative overflow-hidden rounded-lg">
      <img
        src={url}
        alt={alt || "Slide image"}
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );

  // Render timeline vertically for mobile
  const renderTimeline = (steps: any[]) => (
    <div className="flex flex-col gap-4">
      {steps.map((step: any, i: number) => (
        <div key={i} className="flex items-start gap-4">
          <div 
            className="shrink-0 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ 
              width: 32,
              height: 32,
              background: themeColors.primary,
              color: themeColors.background,
            }}
          >
            {i + 1}
          </div>
          <div className="flex-1 pt-1">
            <div className="font-semibold text-sm" style={{ color: themeColors.foreground }}>
              {step.title}
            </div>
            {step.description && (
              <div className="text-xs mt-0.5" style={{ color: themeColors.muted }}>
                {step.description}
              </div>
            )}
          </div>
          {i < steps.length - 1 && (
            <div 
              className="absolute left-[22px] top-[40px] w-0.5 h-4"
              style={{ background: themeColors.muted }}
            />
          )}
        </div>
      ))}
    </div>
  );

  // Render stats grid
  const renderStats = (stats: SlideContent[]) => (
    <div className="grid grid-cols-2 gap-4">
      {stats.map((stat, i) => (
        <div key={i} className="flex flex-col items-center justify-center p-4 rounded-lg" style={{ background: `${themeColors.primary}11` }}>
          <div 
            className="text-2xl md:text-3xl font-bold font-raleway"
            style={{ color: themeColors.primary }}
          >
            {stat.data?.value || "0"}
          </div>
          <div className="text-xs mt-1 text-center" style={{ color: themeColors.muted }}>
            {stat.data?.label || ""}
          </div>
        </div>
      ))}
    </div>
  );

  // Render icon grid
  const renderIconGrid = (items: any[]) => (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item: any, i: number) => (
        <div key={i} className="flex flex-col items-center text-center p-3">
          <div 
            className="rounded-lg flex items-center justify-center mb-2"
            style={{ 
              width: 40,
              height: 40,
              background: `${themeColors.primary}22`,
            }}
          >
            <CheckCircle2 style={{ width: 24, height: 24, color: themeColors.primary }} />
          </div>
          <div className="font-semibold text-sm" style={{ color: themeColors.foreground }}>
            {item.title}
          </div>
          <div className="text-xs" style={{ color: themeColors.muted }}>
            {item.description}
          </div>
        </div>
      ))}
    </div>
  );

  // Layout-specific rendering
  switch (layoutId) {
    case "title-cover":
    case "section-divider":
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          {imageUrl && (
            <div className="absolute inset-0 opacity-30">
              {renderImage(imageUrl)}
            </div>
          )}
          <div className="relative z-10">
            <h1 
              className="text-3xl md:text-4xl lg:text-5xl font-bold font-raleway leading-tight"
              style={{ color: themeColors.foreground }}
            >
              {title}
            </h1>
            {subtitle && (
              <p 
                className="mt-4 text-lg md:text-xl opacity-80"
                style={{ color: themeColors.muted }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      );

    case "image-left":
      const imgUrlLeft = imageContent?.data?.url || imageContent?.data?.imageUrl || imageUrl;
      return (
        <div className="flex flex-col h-full">
          {imgUrlLeft && (
            <div className="h-1/3 shrink-0">
              {renderImage(imgUrlLeft, imageContent?.data?.alt)}
            </div>
          )}
          <div className="flex-1 flex flex-col overflow-hidden">
            {renderTitle()}
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
              {bulletsContent?.data?.items && renderBullets(bulletsContent.data.items)}
            </div>
          </div>
        </div>
      );

    case "image-right":
      const imgUrlRight = imageContent?.data?.url || imageContent?.data?.imageUrl || imageUrl;
      return (
        <div className="flex flex-col h-full">
          <div className="flex-1 flex flex-col overflow-hidden">
            {renderTitle()}
            <div className="flex-1 px-6 pb-4 overflow-y-auto">
              {bulletsContent?.data?.items && renderBullets(bulletsContent.data.items)}
            </div>
          </div>
          {imgUrlRight && (
            <div className="h-1/3 shrink-0 px-6 pb-6">
              {renderImage(imgUrlRight, imageContent?.data?.alt)}
            </div>
          )}
        </div>
      );

    case "stats-grid":
      return (
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div className="flex-1 px-6 pb-6 flex items-center">
            {statsContent && statsContent.length > 0 && renderStats(statsContent)}
          </div>
        </div>
      );

    case "timeline":
      return (
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div className="flex-1 px-6 pb-6 overflow-y-auto">
            {timelineContent?.data?.steps && renderTimeline(timelineContent.data.steps)}
          </div>
        </div>
      );

    case "icon-grid":
      return (
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div className="flex-1 px-6 pb-6 overflow-y-auto">
            {gridContent?.data?.items && renderIconGrid(gridContent.data.items)}
          </div>
        </div>
      );

    case "two-column":
    case "comparison":
      const leftContent = getContentByRegion("left-content") || getContentByRegion("left");
      const rightContent = getContentByRegion("right-content") || getContentByRegion("right");
      return (
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div className="flex-1 px-6 pb-6 flex flex-col gap-4 overflow-y-auto">
            {leftContent?.data?.items && (
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-2" style={{ color: themeColors.primary }}>
                  {leftContent.data?.title || "Option A"}
                </h3>
                {renderBullets(leftContent.data.items)}
              </div>
            )}
            {rightContent?.data?.items && (
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-2" style={{ color: themeColors.primary }}>
                  {rightContent.data?.title || "Option B"}
                </h3>
                {renderBullets(rightContent.data.items)}
              </div>
            )}
          </div>
        </div>
      );

    case "architecture":
      const diagramUrl = getContentByRegion("diagram")?.data?.url || imageUrl;
      return (
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div className="flex-1 px-6 pb-6 flex items-center justify-center">
            {diagramUrl ? (
              renderImage(diagramUrl, "Architecture diagram")
            ) : (
              <div 
                className="text-center p-8 rounded-lg border-2 border-dashed"
                style={{ borderColor: themeColors.muted, color: themeColors.muted }}
              >
                Architecture Diagram
              </div>
            )}
          </div>
        </div>
      );

    case "bullets":
    default:
      return (
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div className="flex-1 px-6 pb-6 overflow-y-auto">
            {bulletsContent?.data?.items ? (
              renderBullets(bulletsContent.data.items)
            ) : bulletsContent?.data?.text ? (
              <div className="text-sm" style={{ color: themeColors.foreground }}>
                <MarkdownText content={bulletsContent.data.text} style={{ color: themeColors.foreground }} />
              </div>
            ) : null}
          </div>
        </div>
      );
  }
}
