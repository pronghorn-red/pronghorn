import { useMemo } from "react";
import { Circle, CheckCircle2 } from "lucide-react";
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

interface SlideRendererProps {
  slide: Slide;
  layouts?: any[];
  theme?: "default" | "light" | "vibrant";
  className?: string;
  isPreview?: boolean;
  isFullscreen?: boolean;
  fontScale?: number;
}

// Fluid typography scale based on container width
const fluidSize = {
  // Titles
  titleFull: 'clamp(1.5rem, 5cqw, 4rem)',
  titlePreview: 'clamp(0.75rem, 4cqw, 1.25rem)',
  titleCoverFull: 'clamp(2rem, 7cqw, 5rem)',
  titleCoverPreview: 'clamp(1rem, 5cqw, 1.5rem)',
  
  // Subtitles
  subtitleFull: 'clamp(0.875rem, 2.5cqw, 1.5rem)',
  subtitlePreview: 'clamp(0.5rem, 2cqw, 0.875rem)',
  
  // Body text
  bodyFull: 'clamp(0.875rem, 2cqw, 1.25rem)',
  bodyPreview: 'clamp(0.5rem, 1.5cqw, 0.75rem)',
  
  // Small text (descriptions, muted)
  smallFull: 'clamp(0.75rem, 1.5cqw, 1rem)',
  smallPreview: 'clamp(0.5rem, 1.25cqw, 0.625rem)',
  
  // Stats
  statValueFull: 'clamp(1.5rem, 5cqw, 3.5rem)',
  statValuePreview: 'clamp(1rem, 4cqw, 1.5rem)',
  
  // Spacing
  gapFull: 'clamp(0.5rem, 1.5cqw, 1rem)',
  gapPreview: 'clamp(0.25rem, 1cqw, 0.5rem)',
  paddingFull: 'clamp(1rem, 3cqw, 2rem)',
  paddingPreview: 'clamp(0.5rem, 2cqw, 1rem)',
  
  // Icons
  bulletIconFull: 'clamp(6px, 1cqw, 12px)',
  bulletIconPreview: 'clamp(4px, 1cqw, 6px)',
  iconBoxFull: 'clamp(2rem, 4cqw, 3.5rem)',
  iconBoxPreview: 'clamp(1.25rem, 3cqw, 2rem)',
  iconSizeFull: 'clamp(1rem, 2cqw, 1.75rem)',
  iconSizePreview: 'clamp(0.75rem, 1.5cqw, 1rem)',
  
  // Timeline
  timelineCircleFull: 'clamp(1.5rem, 3cqw, 2.5rem)',
  timelineCirclePreview: 'clamp(1rem, 2.5cqw, 1.5rem)',
};

// Markdown renderer for consistent styling
const MarkdownText = ({ content, style, fontSize }: { content: string; style?: React.CSSProperties; fontSize?: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="mb-2" style={{ ...style, fontSize }}>{children}</p>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
      li: ({ children }) => <li style={{ ...style, fontSize }}>{children}</li>,
    }}
  >
    {content}
  </ReactMarkdown>
);

export function SlideRenderer({ 
  slide, 
  layouts, 
  theme = "default", 
  className = "", 
  isPreview = false, 
  isFullscreen = false,
  fontScale = 1 
}: SlideRendererProps) {
  const { layoutId, title, subtitle, content, imageUrl } = slide;
  
  // Apply font scale multiplier to fluid sizes
  const scaledFluidSize = useMemo(() => {
    if (fontScale === 1) return fluidSize;
    // Apply scale factor to clamp values
    const scale = (value: string) => {
      // Parse clamp and multiply the values
      const match = value.match(/clamp\(([\d.]+)rem,\s*([\d.]+)([a-z]+)\s*(?:\+\s*([\d.]+)rem)?,\s*([\d.]+)rem\)/);
      if (match) {
        const [, min, preferred, unit, offset, max] = match;
        const scaledMin = (parseFloat(min) * fontScale).toFixed(3);
        const scaledMax = (parseFloat(max) * fontScale).toFixed(3);
        const scaledPreferred = (parseFloat(preferred) * fontScale).toFixed(2);
        const scaledOffset = offset ? (parseFloat(offset) * fontScale).toFixed(3) : null;
        return `clamp(${scaledMin}rem, ${scaledPreferred}${unit}${scaledOffset ? ` + ${scaledOffset}rem` : ''}, ${scaledMax}rem)`;
      }
      return value;
    };
    
    return Object.fromEntries(
      Object.entries(fluidSize).map(([key, value]) => [key, scale(value)])
    ) as typeof fluidSize;
  }, [fontScale]);

  const themeColors = useMemo((): ThemeColors => {
    switch (theme) {
      case "light":
        return {
          background: "hsl(0 0% 100%)",
          foreground: "hsl(222 47% 11%)",
          primary: "hsl(217 91% 50%)",
          muted: "hsl(215 16% 47%)",
        };
      case "vibrant":
        return {
          background: "hsl(260 50% 10%)",
          foreground: "hsl(0 0% 100%)",
          primary: "hsl(280 100% 65%)",
          muted: "hsl(260 20% 70%)",
        };
      default:
        return {
          background: "hsl(222 47% 11%)",
          foreground: "hsl(210 40% 98%)",
          primary: "hsl(217 91% 60%)",
          muted: "hsl(215 20% 65%)",
        };
    }
  }, [theme]);

  // Fluid size helpers - use scaled version
  const fs = (full: keyof typeof fluidSize, preview: keyof typeof fluidSize) => 
    isPreview ? scaledFluidSize[preview] : scaledFluidSize[full];

  // === UNIFIED CONTENT EXTRACTION ===
  const getContentByType = (type: string) => content?.find(c => c.type === type);
  const getContentByRegion = (regionId: string) => content?.find(c => c.regionId === regionId);
  
  // Get main content - check all possible formats
  const mainContent = useMemo(() => {
    return getContentByRegion("content") || 
           getContentByRegion("main") || 
           getContentByRegion("bullets") ||
           getContentByType("richtext") ||
           getContentByType("text") ||
           getContentByType("bullets");
  }, [content]);

  const imageContent = getContentByType("image") || getContentByRegion("image");
  const timelineContent = getContentByType("timeline") || getContentByRegion("timeline");
  const statsContent = content?.filter(c => c.type === "stat");
  const gridContent = getContentByType("icon-grid") || getContentByRegion("grid");

  // Extract the actual text/items from mainContent
  const mainText = mainContent?.data?.text || (typeof mainContent?.data === 'string' ? mainContent.data : null);
  const mainItems = mainContent?.data?.items;

  // Get image URL from various possible locations
  const getImageUrl = () => {
    const url = imageContent?.data?.url || 
           imageContent?.data?.imageUrl || 
           getContentByRegion("diagram")?.data?.url ||
           imageUrl;
    
    // Check if URL is a valid image (not a placeholder filename)
    if (url && (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/'))) {
      return url;
    }
    // Reject placeholder-like URLs that won't load
    if (url && (url.includes('placeholder') || url.endsWith('.svg') && !url.startsWith('http'))) {
      return null;
    }
    return url;
  };

  const imgUrl = getImageUrl();
  const isSectionDivider = layoutId === "section-divider";
  const isFullBleed = ["title-cover", "section-divider"].includes(layoutId);

  // === RENDER HELPERS WITH FLUID TYPOGRAPHY ===
  const renderTitle = (centered = false) => (
    <div 
      className={`shrink-0 ${centered ? 'text-center' : ''}`}
      style={{ 
        padding: fs('paddingFull', 'paddingPreview'),
        paddingBottom: fs('gapFull', 'gapPreview'),
      }}
    >
      <h2 
        className="font-bold font-raleway leading-tight"
        style={{ 
          color: themeColors.foreground,
          fontSize: fs('titleFull', 'titlePreview'),
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p 
          className="mt-1 opacity-80"
          style={{ 
            color: themeColors.muted,
            fontSize: fs('subtitleFull', 'subtitlePreview'),
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );

  const renderBullets = (items: any[]) => (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: fs('gapFull', 'gapPreview') }}>
      {items.map((item: any, i: number) => (
        <li 
          key={i} 
          className="flex items-start"
          style={{ 
            color: themeColors.foreground,
            gap: fs('gapFull', 'gapPreview'),
          }}
        >
          <Circle 
            className="flex-shrink-0 mt-1.5" 
            style={{ 
              width: fs('bulletIconFull', 'bulletIconPreview'),
              height: fs('bulletIconFull', 'bulletIconPreview'),
              color: themeColors.primary,
              fill: themeColors.primary,
            }} 
          />
          <div 
            className="flex-1"
            style={{ fontSize: fs('bodyFull', 'bodyPreview') }}
          >
            {typeof item === "string" ? (
              <MarkdownText 
                content={item} 
                style={{ color: themeColors.foreground }}
                fontSize={fs('bodyFull', 'bodyPreview')}
              />
            ) : (
              <>
                <span className="font-semibold">{item.title}</span>
                {item.description && (
                  <p style={{ color: themeColors.muted, fontSize: fs('smallFull', 'smallPreview'), marginTop: '0.25rem' }}>
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

  const renderTextContent = () => {
    if (mainItems) {
      return renderBullets(mainItems);
    }
    if (mainText) {
      return (
        <div 
          className="leading-relaxed"
          style={{ color: themeColors.foreground, fontSize: fs('bodyFull', 'bodyPreview') }}
        >
          <MarkdownText 
            content={mainText} 
            style={{ color: themeColors.foreground }}
            fontSize={fs('bodyFull', 'bodyPreview')}
          />
        </div>
      );
    }
    return null;
  };

  const renderImage = (url: string, alt?: string) => (
    <div className="w-full h-full min-h-[100px] relative overflow-hidden rounded-lg">
      <img
        src={url}
        alt={alt || "Slide image"}
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );

  const renderTimeline = (steps: any[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: fs('gapFull', 'gapPreview') }}>
      {steps.map((step: any, i: number) => (
        <div key={i} className="flex items-start" style={{ gap: fs('gapFull', 'gapPreview') }}>
          <div 
            className="shrink-0 rounded-full flex items-center justify-center font-bold"
            style={{ 
              background: themeColors.primary, 
              color: themeColors.background,
              width: fs('timelineCircleFull', 'timelineCirclePreview'),
              height: fs('timelineCircleFull', 'timelineCirclePreview'),
              fontSize: fs('smallFull', 'smallPreview'),
            }}
          >
            {i + 1}
          </div>
          <div className="flex-1 pt-0.5">
            <div 
              className="font-semibold"
              style={{ color: themeColors.foreground, fontSize: fs('bodyFull', 'bodyPreview') }}
            >
              {step.title}
            </div>
            {step.description && (
              <div style={{ color: themeColors.muted, fontSize: fs('smallFull', 'smallPreview'), marginTop: '0.25rem' }}>
                {step.description}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderStats = (stats: SlideContent[]) => (
    <div className="grid grid-cols-2" style={{ gap: fs('gapFull', 'gapPreview') }}>
      {stats.map((stat, i) => (
        <div 
          key={i} 
          className="flex flex-col items-center justify-center rounded-lg" 
          style={{ 
            background: `${themeColors.primary}11`,
            padding: fs('paddingFull', 'paddingPreview'),
          }}
        >
          <div 
            className="font-bold font-raleway"
            style={{ color: themeColors.primary, fontSize: fs('statValueFull', 'statValuePreview') }}
          >
            {stat.data?.value || "0"}
          </div>
          <div 
            className="mt-1 text-center" 
            style={{ color: themeColors.muted, fontSize: fs('smallFull', 'smallPreview') }}
          >
            {stat.data?.label || ""}
          </div>
        </div>
      ))}
    </div>
  );

  const renderIconGrid = (items: any[]) => (
    <div className="grid grid-cols-2" style={{ gap: fs('gapFull', 'gapPreview') }}>
      {items.map((item: any, i: number) => (
        <div 
          key={i} 
          className="flex flex-col items-center text-center"
          style={{ padding: fs('gapFull', 'gapPreview') }}
        >
          <div 
            className="rounded-lg flex items-center justify-center mb-2"
            style={{ 
              background: `${themeColors.primary}22`,
              width: fs('iconBoxFull', 'iconBoxPreview'),
              height: fs('iconBoxFull', 'iconBoxPreview'),
            }}
          >
            <CheckCircle2 
              style={{ 
                width: fs('iconSizeFull', 'iconSizePreview'), 
                height: fs('iconSizeFull', 'iconSizePreview'), 
                color: themeColors.primary 
              }} 
            />
          </div>
          <div 
            className="font-semibold"
            style={{ color: themeColors.foreground, fontSize: fs('bodyFull', 'bodyPreview') }}
          >
            {item.title}
          </div>
          <div style={{ color: themeColors.muted, fontSize: fs('smallFull', 'smallPreview') }}>
            {item.description}
          </div>
        </div>
      ))}
    </div>
  );

  // === LAYOUT RENDERING ===
  // Container with size containment for cqw units
  const containerClass = `
    relative font-raleway w-full h-full
    ${isFullscreen ? '' : 'aspect-video'}
    ${className}
  `;

  const containerStyle: React.CSSProperties = {
    containerType: 'size',
    background: isSectionDivider 
      ? `linear-gradient(135deg, ${themeColors.primary}, hsl(217 80% 45%))` 
      : themeColors.background,
    color: themeColors.foreground,
  };

  // Title cover / Section divider
  if (isFullBleed) {
    return (
      <div className={containerClass} style={containerStyle}>
        {imgUrl && (
          <div className="absolute inset-0">
            <img 
              src={imgUrl} 
              alt="" 
              className="w-full h-full object-cover opacity-80"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
        {isFullBleed && !isSectionDivider && !imgUrl && (
          <div 
            className="absolute inset-0 z-0"
            style={{
              background: `linear-gradient(135deg, ${themeColors.background} 0%, hsl(217 33% 17%) 100%)`,
            }}
          />
        )}
        <div 
          className="relative z-10 flex flex-col items-center justify-center h-full text-center"
          style={{ padding: fs('paddingFull', 'paddingPreview') }}
        >
          <h1 
            className="font-bold font-raleway leading-tight"
            style={{ 
              color: themeColors.foreground,
              fontSize: fs('titleCoverFull', 'titleCoverPreview'),
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p 
              className="mt-3 sm:mt-4 opacity-80"
              style={{ 
                color: themeColors.muted,
                fontSize: fs('subtitleFull', 'subtitlePreview'),
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Image layouts (image-left, image-right, architecture)
  if (["image-left", "image-right", "architecture"].includes(layoutId)) {
    const hasImage = !!imgUrl;
    const isArchitecture = layoutId === "architecture";
    const imageFirst = layoutId === "image-left";
    
    return (
      <div className={containerClass} style={containerStyle}>
        <div className={`
          flex flex-col h-full
          ${isFullscreen ? 'lg:flex-row' : ''}
        `}>
          {/* Image section - on mobile: top for image-left, bottom for image-right */}
          {hasImage && imageFirst && (
            <div className={`
              shrink-0 
              ${isFullscreen ? 'h-[35%] lg:h-full lg:w-[40%]' : 'h-[40%]'}
            `}
            style={{ padding: fs('gapFull', 'gapPreview') }}
            >
              {renderImage(imgUrl, imageContent?.data?.alt)}
            </div>
          )}
          
          {/* Content section */}
          <div className={`
            flex-1 flex flex-col justify-center min-h-0
            ${isFullscreen ? 'lg:flex-1' : ''}
          `}>
            {renderTitle()}
            <div 
              className="flex-1 overflow-y-auto min-h-0"
              style={{ 
                paddingLeft: fs('paddingFull', 'paddingPreview'),
                paddingRight: fs('paddingFull', 'paddingPreview'),
                paddingBottom: fs('paddingFull', 'paddingPreview'),
              }}
            >
              {isArchitecture && !hasImage ? (
                <div 
                  className="text-center rounded-lg border-2 border-dashed h-full flex items-center justify-center"
                  style={{ 
                    borderColor: themeColors.muted, 
                    color: themeColors.muted,
                    padding: fs('paddingFull', 'paddingPreview'),
                    fontSize: fs('bodyFull', 'bodyPreview'),
                  }}
                >
                  Architecture Diagram Placeholder
                </div>
              ) : (
                renderTextContent()
              )}
            </div>
          </div>

          {/* Image at bottom for image-right */}
          {hasImage && !imageFirst && !isArchitecture && (
            <div className={`
              shrink-0 
              ${isFullscreen ? 'h-[35%] lg:h-full lg:w-[40%]' : 'h-[40%]'}
            `}
            style={{ padding: fs('gapFull', 'gapPreview') }}
            >
              {renderImage(imgUrl, imageContent?.data?.alt)}
            </div>
          )}

          {/* Architecture shows image in content area if available */}
          {isArchitecture && hasImage && (
            <div 
              className="flex-1"
              style={{ 
                paddingLeft: fs('paddingFull', 'paddingPreview'),
                paddingRight: fs('paddingFull', 'paddingPreview'),
                paddingBottom: fs('paddingFull', 'paddingPreview'),
              }}
            >
              {renderImage(imgUrl, "Architecture diagram")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Stats grid
  if (layoutId === "stats-grid" && statsContent && statsContent.length > 0) {
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 flex items-center justify-center min-h-0"
            style={{ 
              paddingLeft: fs('paddingFull', 'paddingPreview'),
              paddingRight: fs('paddingFull', 'paddingPreview'),
              paddingBottom: fs('paddingFull', 'paddingPreview'),
            }}
          >
            {renderStats(statsContent)}
          </div>
        </div>
      </div>
    );
  }

  // Timeline
  if (layoutId === "timeline" && timelineContent?.data?.steps) {
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 overflow-y-auto min-h-0"
            style={{ 
              paddingLeft: fs('paddingFull', 'paddingPreview'),
              paddingRight: fs('paddingFull', 'paddingPreview'),
              paddingBottom: fs('paddingFull', 'paddingPreview'),
            }}
          >
            {renderTimeline(timelineContent.data.steps)}
          </div>
        </div>
      </div>
    );
  }

  // Icon grid
  if (layoutId === "icon-grid" && gridContent?.data?.items) {
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 flex items-center min-h-0"
            style={{ 
              paddingLeft: fs('paddingFull', 'paddingPreview'),
              paddingRight: fs('paddingFull', 'paddingPreview'),
              paddingBottom: fs('paddingFull', 'paddingPreview'),
            }}
          >
            <div className="w-full">
              {renderIconGrid(gridContent.data.items)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to render column content (handles items, text, or richtext)
  const renderColumnContent = (colContent: SlideContent | undefined) => {
    if (!colContent?.data) return null;
    
    // If it has items, render as bullets
    if (colContent.data.items) {
      return renderBullets(colContent.data.items);
    }
    
    // If it has text, render as markdown
    const textContent = colContent.data.text || (typeof colContent.data === 'string' ? colContent.data : null);
    if (textContent) {
      return (
        <div 
          className="leading-relaxed"
          style={{ color: themeColors.foreground, fontSize: fs('bodyFull', 'bodyPreview') }}
        >
          <MarkdownText 
            content={textContent} 
            style={{ color: themeColors.foreground }}
            fontSize={fs('bodyFull', 'bodyPreview')}
          />
        </div>
      );
    }
    
    return null;
  };

  // Two-column / Comparison
  if (["two-column", "comparison"].includes(layoutId)) {
    const leftContent = getContentByRegion("left-content") || getContentByRegion("left");
    const rightContent = getContentByRegion("right-content") || getContentByRegion("right");
    
    const hasLeft = leftContent?.data?.items || leftContent?.data?.text || typeof leftContent?.data === 'string';
    const hasRight = rightContent?.data?.items || rightContent?.data?.text || typeof rightContent?.data === 'string';
    
    return (
      <div className={containerClass} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className={`
              flex-1 overflow-y-auto min-h-0
              flex flex-col
              ${isFullscreen ? 'lg:flex-row' : ''}
            `}
            style={{ 
              paddingLeft: fs('paddingFull', 'paddingPreview'),
              paddingRight: fs('paddingFull', 'paddingPreview'),
              paddingBottom: fs('paddingFull', 'paddingPreview'),
              gap: fs('gapFull', 'gapPreview'),
            }}
          >
            {hasLeft && (
              <div className={isFullscreen ? 'lg:flex-1' : ''}>
                {leftContent?.data?.title && (
                  <h3 
                    className="font-semibold mb-2"
                    style={{ color: themeColors.primary, fontSize: fs('bodyFull', 'bodyPreview') }}
                  >
                    {leftContent.data.title}
                  </h3>
                )}
                {renderColumnContent(leftContent)}
              </div>
            )}
            {hasRight && (
              <div className={isFullscreen ? 'lg:flex-1' : ''}>
                {rightContent?.data?.title && (
                  <h3 
                    className="font-semibold mb-2"
                    style={{ color: themeColors.primary, fontSize: fs('bodyFull', 'bodyPreview') }}
                  >
                    {rightContent.data.title}
                  </h3>
                )}
                {renderColumnContent(rightContent)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: title-content, bullets, or any unrecognized layout
  return (
    <div className={containerClass} style={containerStyle}>
      <div className="flex flex-col h-full justify-center">
        {renderTitle()}
        <div 
          className="flex-1 overflow-y-auto min-h-0"
          style={{ 
            paddingLeft: fs('paddingFull', 'paddingPreview'),
            paddingRight: fs('paddingFull', 'paddingPreview'),
            paddingBottom: fs('paddingFull', 'paddingPreview'),
          }}
        >
          {renderTextContent()}
        </div>
      </div>
    </div>
  );
}
