import { useMemo } from "react";
import { Circle, CheckCircle2, ImageIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface SlideContent {
  regionId: string;
  type?: string;
  data?: any;
  // LLM sometimes outputs flat structure
  text?: string;
  items?: any[];
  steps?: any[];
  value?: string;
  label?: string;
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
  /** Font scale multiplier (default 1) - applies to all text */
  fontScale?: number;
  /** Callback for clicking image placeholder */
  onAddImageClick?: () => void;
  /** Design width for the canvas (default 960) */
  designWidth?: number;
  /** Design height for the canvas (default 540) */
  designHeight?: number;
}

// Fixed typography sizes for 960x540 design canvas
// All values in pixels - will scale uniformly with the canvas
const FONT_SIZES = {
  titleCover: 72,
  title: 42,
  subtitle: 22,
  body: 18,
  small: 14,
  statValue: 56,
  bulletIcon: 8,
  iconBox: 48,
  iconSize: 24,
  timelineCircle: 32,
};

const SPACING = {
  gap: 12,
  padding: 32,
  paddingSmall: 16,
};

// Normalize content item to handle both LLM formats:
// Format 1 (correct): { regionId, type, data: { text: "..." } }
// Format 2 (LLM outputs): { regionId, text: "..." }
function normalizeContent(item: SlideContent): SlideContent {
  // Already normalized
  if (item.data !== undefined) {
    return item;
  }
  
  // Convert flat format to normalized
  const normalized: SlideContent = {
    regionId: item.regionId,
    type: item.type || 'text',
    data: {},
  };
  
  // Move text/items/steps/value/label to data
  if (item.text) normalized.data.text = item.text;
  if (item.items) normalized.data.items = item.items;
  if (item.steps) normalized.data.steps = item.steps;
  if (item.value !== undefined) normalized.data.value = item.value;
  if (item.label) normalized.data.label = item.label;
  
  // Infer type from content
  if (item.items) normalized.type = 'bullets';
  if (item.steps) normalized.type = 'timeline';
  if (item.value !== undefined) normalized.type = 'stat';
  
  return normalized;
}

// Markdown renderer for consistent styling
const MarkdownText = ({ content, style, fontSize }: { content: string; style?: React.CSSProperties; fontSize?: number }) => (
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
  fontScale = 1,
  onAddImageClick,
  designWidth = 960,
  designHeight = 540,
}: SlideRendererProps) {
  const { layoutId, title, subtitle, content, imageUrl } = slide;
  
  // Apply font scale to all sizes
  const fs = useMemo(() => {
    return {
      titleCover: FONT_SIZES.titleCover * fontScale,
      title: FONT_SIZES.title * fontScale,
      subtitle: FONT_SIZES.subtitle * fontScale,
      body: FONT_SIZES.body * fontScale,
      small: FONT_SIZES.small * fontScale,
      statValue: FONT_SIZES.statValue * fontScale,
      bulletIcon: FONT_SIZES.bulletIcon * fontScale,
      iconBox: FONT_SIZES.iconBox * fontScale,
      iconSize: FONT_SIZES.iconSize * fontScale,
      timelineCircle: FONT_SIZES.timelineCircle * fontScale,
    };
  }, [fontScale]);

  const sp = SPACING;

  const themeColors = useMemo((): ThemeColors & { 
    sectionGradient: string; 
    titleOverlay: string;
    titleGradient: string;
  } => {
    switch (theme) {
      case "light":
        return {
          background: "hsl(0 0% 100%)",
          foreground: "hsl(222 47% 11%)",
          primary: "hsl(217 91% 50%)",
          muted: "hsl(215 16% 47%)",
          sectionGradient: "linear-gradient(135deg, hsl(210 80% 85%), hsl(205 70% 75%))",
          titleOverlay: "rgba(255, 255, 255, 0.85)",
          titleGradient: "linear-gradient(135deg, hsl(210 40% 96%) 0%, hsl(210 20% 90%) 100%)",
        };
      case "vibrant":
        return {
          background: "hsl(260 50% 10%)",
          foreground: "hsl(0 0% 100%)",
          primary: "hsl(280 100% 65%)",
          muted: "hsl(260 20% 70%)",
          sectionGradient: "linear-gradient(135deg, hsl(280 100% 65%), hsl(300 80% 55%))",
          titleOverlay: "rgba(26, 13, 38, 0.75)",
          titleGradient: "linear-gradient(135deg, hsl(260 50% 10%) 0%, hsl(280 40% 15%) 100%)",
        };
      default:
        return {
          background: "hsl(222 47% 11%)",
          foreground: "hsl(210 40% 98%)",
          primary: "hsl(217 91% 60%)",
          muted: "hsl(215 20% 65%)",
          sectionGradient: "linear-gradient(135deg, hsl(217 91% 60%), hsl(217 80% 45%))",
          titleOverlay: "rgba(30, 41, 59, 0.7)",
          titleGradient: "linear-gradient(135deg, hsl(222 47% 11%) 0%, hsl(217 33% 17%) 100%)",
        };
    }
  }, [theme]);

  // === NORMALIZE ALL CONTENT ON MOUNT ===
  const normalizedContent = useMemo(() => {
    return content?.map(normalizeContent) || [];
  }, [content]);

  // === UNIFIED CONTENT EXTRACTION (using normalized) ===
  const getContentByType = (type: string) => normalizedContent.find(c => c.type === type);
  const getContentByRegion = (regionId: string) => normalizedContent.find(c => c.regionId === regionId);
  
  const mainContent = useMemo(() => {
    // For quote layout, get quote region
    if (layoutId === 'quote') {
      return getContentByRegion("quote");
    }
    return getContentByRegion("content") || 
           getContentByRegion("main") || 
           getContentByRegion("bullets") ||
           getContentByType("richtext") ||
           getContentByType("text") ||
           getContentByType("bullets");
  }, [normalizedContent, layoutId]);

  const imageContent = getContentByType("image") || getContentByRegion("image");
  const timelineContent = getContentByType("timeline") || getContentByRegion("timeline");
  const statsContent = normalizedContent.filter(c => c.type === "stat" || c.regionId?.startsWith("stat-"));
  const gridContent = getContentByType("icon-grid") || getContentByRegion("grid");

  const mainText = mainContent?.data?.text || (typeof mainContent?.data === 'string' ? mainContent.data : null);
  const mainItems = mainContent?.data?.items;

  const getImageUrl = () => {
    // Prioritize slide-level imageUrl (user-set images take priority)
    if (imageUrl && typeof imageUrl === 'string' && 
        (imageUrl.startsWith('data:') || imageUrl.startsWith('http') || imageUrl.startsWith('/'))) {
      return imageUrl;
    }
    
    // Then check content-level URLs
    let url = imageContent?.data?.url || 
           imageContent?.data?.imageUrl || 
           getContentByRegion("diagram")?.data?.url;
    
    // Handle malformed URL objects (e.g., { _type: "String", value: "..." })
    if (url && typeof url === 'object' && (url as any).value) {
      url = (url as any).value;
    }
    
    if (url && typeof url === 'string' && 
        (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/'))) {
      return url;
    }
    
    if (url && typeof url === 'string' && (url.includes('placeholder') || url.endsWith('.svg') && !url.startsWith('http'))) {
      return null;
    }
    
    return url;
  };

  const imgUrl = getImageUrl();
  const isSectionDivider = layoutId === "section-divider";
  const isFullBleed = ["title-cover", "section-divider"].includes(layoutId);

  // === RENDER HELPERS WITH FIXED PIXEL SIZES ===
  const renderTitle = (centered = false) => (
    <div 
      className={`shrink-0 ${centered ? 'text-center' : ''}`}
      style={{ 
        padding: sp.padding,
        paddingBottom: sp.gap,
      }}
    >
      <h2 
        className="font-bold font-raleway leading-tight"
        style={{ 
          color: themeColors.foreground,
          fontSize: fs.title,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p 
          className="mt-1 opacity-80"
          style={{ 
            color: themeColors.muted,
            fontSize: fs.subtitle,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );

  const renderBullets = (items: any[]) => (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: sp.gap }}>
      {items.map((item: any, i: number) => (
        <li 
          key={i} 
          className="flex items-start"
          style={{ 
            color: themeColors.foreground,
            gap: sp.gap,
          }}
        >
          <Circle 
            className="flex-shrink-0 mt-1.5" 
            style={{ 
              width: fs.bulletIcon,
              height: fs.bulletIcon,
              color: themeColors.primary,
              fill: themeColors.primary,
            }} 
          />
          <div 
            className="flex-1"
            style={{ fontSize: fs.body }}
          >
            {typeof item === "string" ? (
              <MarkdownText 
                content={item} 
                style={{ color: themeColors.foreground }}
                fontSize={fs.body}
              />
            ) : (
              <>
                <span className="font-semibold">{item.title}</span>
                {item.description && (
                  <p style={{ color: themeColors.muted, fontSize: fs.small, marginTop: 4 }}>
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
          style={{ color: themeColors.foreground, fontSize: fs.body }}
        >
          <MarkdownText 
            content={mainText} 
            style={{ color: themeColors.foreground }}
            fontSize={fs.body}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp.gap }}>
      {steps.map((step: any, i: number) => (
        <div key={i} className="flex items-start" style={{ gap: sp.gap }}>
          <div 
            className="shrink-0 rounded-full flex items-center justify-center font-bold"
            style={{ 
              background: themeColors.primary, 
              color: themeColors.background,
              width: fs.timelineCircle,
              height: fs.timelineCircle,
              fontSize: fs.small,
            }}
          >
            {i + 1}
          </div>
          <div className="flex-1 pt-0.5">
            <div 
              className="font-semibold"
              style={{ color: themeColors.foreground, fontSize: fs.body }}
            >
              {step.title}
            </div>
            {step.description && (
              <div style={{ color: themeColors.muted, fontSize: fs.small, marginTop: 4 }}>
                {step.description}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderStats = (stats: SlideContent[]) => (
    <div className="grid grid-cols-2" style={{ gap: sp.gap }}>
      {stats.map((stat, i) => (
        <div 
          key={i} 
          className="flex flex-col items-center justify-center rounded-lg" 
          style={{ 
            background: `${themeColors.primary}11`,
            padding: sp.padding,
          }}
        >
          <div 
            className="font-bold font-raleway"
            style={{ color: themeColors.primary, fontSize: fs.statValue }}
          >
            {stat.data?.value || "0"}
          </div>
          <div 
            className="mt-1 text-center" 
            style={{ color: themeColors.muted, fontSize: fs.small }}
          >
            {stat.data?.label || ""}
          </div>
        </div>
      ))}
    </div>
  );

  const renderIconGrid = (items: any[]) => (
    <div className="grid grid-cols-2" style={{ gap: sp.gap }}>
      {items.map((item: any, i: number) => (
        <div 
          key={i} 
          className="flex flex-col items-center text-center"
          style={{ padding: sp.gap }}
        >
          <div 
            className="rounded-lg flex items-center justify-center mb-2"
            style={{ 
              background: `${themeColors.primary}22`,
              width: fs.iconBox,
              height: fs.iconBox,
            }}
          >
            <CheckCircle2 
              style={{ 
                width: fs.iconSize, 
                height: fs.iconSize, 
                color: themeColors.primary 
              }} 
            />
          </div>
          <div 
            className="font-semibold"
            style={{ color: themeColors.foreground, fontSize: fs.body }}
          >
            {item.title}
          </div>
          <div style={{ color: themeColors.muted, fontSize: fs.small }}>
            {item.description}
          </div>
        </div>
      ))}
    </div>
  );

  // Image placeholder for layouts without images
  const renderImagePlaceholder = () => (
    <div 
      className={`w-full h-full min-h-[100px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center ${onAddImageClick ? 'cursor-pointer hover:bg-opacity-20' : ''}`}
      style={{ 
        borderColor: themeColors.muted, 
        color: themeColors.muted,
        background: `${themeColors.primary}08`,
      }}
      onClick={onAddImageClick}
    >
      <ImageIcon 
        style={{ 
          width: fs.iconBox,
          height: fs.iconBox,
          marginBottom: sp.gap,
          opacity: 0.5,
        }} 
      />
      <span style={{ fontSize: fs.small }}>
        {onAddImageClick ? 'Click to add image' : 'No image'}
      </span>
    </div>
  );

  // Helper to render column content
  const renderColumnContent = (colContent: SlideContent | undefined) => {
    if (!colContent?.data) return null;
    
    if (colContent.data.items) {
      return renderBullets(colContent.data.items);
    }
    
    const textContent = colContent.data.text || (typeof colContent.data === 'string' ? colContent.data : null);
    if (textContent) {
      return (
        <div 
          className="leading-relaxed"
          style={{ color: themeColors.foreground, fontSize: fs.body }}
        >
          <MarkdownText 
            content={textContent} 
            style={{ color: themeColors.foreground }}
            fontSize={fs.body}
          />
        </div>
      );
    }
    
    return null;
  };

  // === CONTAINER STYLES ===
  // Fixed dimensions matching the design canvas - NO responsive breakpoints
  const containerStyle: React.CSSProperties = {
    width: designWidth,
    height: designHeight,
    background: isSectionDivider 
      ? themeColors.sectionGradient 
      : themeColors.background,
    color: themeColors.foreground,
    overflow: 'hidden',
    position: 'relative',
  };

  // Title cover / Section divider
  if (isFullBleed) {
    return (
      <div className={`font-raleway ${className}`} style={containerStyle}>
        {imgUrl && (
          <div className="absolute inset-0">
            <img 
              src={imgUrl} 
              alt="" 
              className="w-full h-full object-cover opacity-80"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div 
              className="absolute inset-0" 
              style={{ background: `linear-gradient(to top, ${themeColors.titleOverlay}, transparent)` }}
            />
          </div>
        )}
        {isFullBleed && !isSectionDivider && !imgUrl && (
          <div 
            className="absolute inset-0 z-0"
            style={{ background: themeColors.titleGradient }}
          />
        )}
        <div 
          className="relative z-10 flex flex-col items-center justify-center h-full text-center"
          style={{ padding: sp.padding }}
        >
          <h1 
            className="font-bold font-raleway leading-tight"
            style={{ 
              color: themeColors.foreground,
              fontSize: fs.titleCover,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p 
              className="mt-4 opacity-80"
              style={{ 
                color: themeColors.muted,
                fontSize: fs.subtitle,
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
  // FIXED: Always use side-by-side layout, never stack vertically
  if (["image-left", "image-right", "architecture"].includes(layoutId)) {
    const hasImage = !!imgUrl;
    const isArchitecture = layoutId === "architecture";
    const imageFirst = layoutId === "image-left";
    
    return (
      <div className={`font-raleway ${className}`} style={containerStyle}>
        <div className="flex flex-row h-full">
          {/* Image section - fixed 40% width */}
          {imageFirst && (
            <div 
              className="shrink-0 h-full"
              style={{ width: '40%', padding: sp.gap }}
            >
              {hasImage ? renderImage(imgUrl, imageContent?.data?.alt) : renderImagePlaceholder()}
            </div>
          )}
          
          {/* Content section - 60% width */}
          <div 
            className="flex-1 flex flex-col justify-center min-h-0"
            style={{ width: imageFirst || isArchitecture ? '60%' : '60%' }}
          >
            {renderTitle()}
            <div 
              className="flex-1 overflow-y-auto min-h-0"
              style={{ 
                paddingLeft: sp.padding,
                paddingRight: sp.padding,
                paddingBottom: sp.padding,
              }}
            >
              {isArchitecture && !hasImage ? (
                <div 
                  className="text-center rounded-lg border-2 border-dashed h-full flex items-center justify-center"
                  style={{ 
                    borderColor: themeColors.muted, 
                    color: themeColors.muted,
                    padding: sp.padding,
                    fontSize: fs.body,
                  }}
                >
                  Architecture Diagram Placeholder
                </div>
              ) : (
                renderTextContent()
              )}
            </div>
          </div>

          {/* Image at right for image-right */}
          {!imageFirst && !isArchitecture && (
            <div 
              className="shrink-0 h-full"
              style={{ width: '40%', padding: sp.gap }}
            >
              {hasImage ? renderImage(imgUrl, imageContent?.data?.alt) : renderImagePlaceholder()}
            </div>
          )}

          {/* Architecture shows image in content area if available */}
          {isArchitecture && hasImage && (
            <div 
              className="shrink-0 h-full"
              style={{ width: '40%', padding: sp.gap }}
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
      <div className={`font-raleway ${className}`} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 flex items-center justify-center min-h-0"
            style={{ 
              paddingLeft: sp.padding,
              paddingRight: sp.padding,
              paddingBottom: sp.padding,
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
      <div className={`font-raleway ${className}`} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 overflow-y-auto min-h-0"
            style={{ 
              paddingLeft: sp.padding,
              paddingRight: sp.padding,
              paddingBottom: sp.padding,
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
      <div className={`font-raleway ${className}`} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 flex items-center min-h-0"
            style={{ 
              paddingLeft: sp.padding,
              paddingRight: sp.padding,
              paddingBottom: sp.padding,
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

  // Two-column / Comparison - FIXED: Always side-by-side
  if (["two-column", "comparison"].includes(layoutId)) {
    const leftContent = getContentByRegion("left-content") || getContentByRegion("left");
    const rightContent = getContentByRegion("right-content") || getContentByRegion("right");
    
    const hasLeft = leftContent?.data?.items || leftContent?.data?.text || typeof leftContent?.data === 'string';
    const hasRight = rightContent?.data?.items || rightContent?.data?.text || typeof rightContent?.data === 'string';
    
    return (
      <div className={`font-raleway ${className}`} style={containerStyle}>
        <div className="flex flex-col h-full">
          {renderTitle()}
          <div 
            className="flex-1 overflow-y-auto min-h-0 flex flex-row"
            style={{ 
              paddingLeft: sp.padding,
              paddingRight: sp.padding,
              paddingBottom: sp.padding,
              gap: sp.gap,
            }}
          >
            {hasLeft && (
              <div className="flex-1">
                {leftContent?.data?.title && (
                  <h3 
                    className="font-semibold mb-2"
                    style={{ color: themeColors.primary, fontSize: fs.body }}
                  >
                    {leftContent.data.title}
                  </h3>
                )}
                {renderColumnContent(leftContent)}
              </div>
            )}
            {hasRight && (
              <div className="flex-1">
                {rightContent?.data?.title && (
                  <h3 
                    className="font-semibold mb-2"
                    style={{ color: themeColors.primary, fontSize: fs.body }}
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

  // Quote layout - centered quote with attribution
  if (layoutId === "quote") {
    const quoteContent = getContentByRegion("quote");
    const attributionContent = getContentByRegion("attribution");
    const quoteText = quoteContent?.data?.text || quoteContent?.text || "";
    const attributionText = attributionContent?.data?.text || attributionContent?.text || "";
    
    return (
      <div className={`font-raleway ${className}`} style={containerStyle}>
        <div className="flex flex-col h-full justify-center items-center text-center" style={{ padding: sp.padding * 2 }}>
          {title && (
            <h2 
              className="font-bold font-raleway mb-8"
              style={{ 
                color: themeColors.foreground,
                fontSize: fs.title,
              }}
            >
              {title}
            </h2>
          )}
          {quoteText && (
            <blockquote 
              className="italic leading-relaxed max-w-4xl"
              style={{ 
                color: themeColors.foreground,
                fontSize: fs.subtitle * 1.2,
              }}
            >
              <MarkdownText 
                content={`"${quoteText.replace(/^[""]|[""]$/g, '')}"` }
                style={{ color: themeColors.foreground }}
                fontSize={fs.subtitle * 1.2}
              />
            </blockquote>
          )}
          {attributionText && (
            <p 
              className="mt-6 opacity-80"
              style={{ 
                color: themeColors.primary,
                fontSize: fs.body,
              }}
            >
              — {attributionText}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Default: title-content, bullets, or any unrecognized layout
  return (
    <div className={`font-raleway ${className}`} style={containerStyle}>
      <div className="flex flex-col h-full justify-center">
        {renderTitle()}
        <div 
          className="flex-1 overflow-y-auto min-h-0"
          style={{ 
            paddingLeft: sp.padding,
            paddingRight: sp.padding,
            paddingBottom: sp.padding,
          }}
        >
          {renderTextContent()}
        </div>
      </div>
    </div>
  );
}
