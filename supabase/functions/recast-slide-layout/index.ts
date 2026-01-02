import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  fontScale?: number;
}

interface RecastRequest {
  slide: Slide;
  targetLayoutId: string;
  projectContext?: string;
}

// Layout content requirements
const LAYOUT_REQUIREMENTS: Record<string, { regions: string[], needsImage: boolean, description: string }> = {
  "title-cover": { regions: ["subtitle"], needsImage: false, description: "Full-bleed cover with title and subtitle" },
  "section-divider": { regions: ["subtitle"], needsImage: false, description: "Bold section break" },
  "title-content": { regions: ["content"], needsImage: false, description: "Title with main content text" },
  "bullets": { regions: ["bullets"], needsImage: false, description: "Title with bullet points list" },
  "two-column": { regions: ["left", "right"], needsImage: false, description: "Two columns of content" },
  "comparison": { regions: ["left", "right"], needsImage: false, description: "Side-by-side comparison" },
  "image-left": { regions: ["content", "image"], needsImage: true, description: "Image on left with content on right" },
  "image-right": { regions: ["content", "image"], needsImage: true, description: "Content on left with image on right" },
  "stats-grid": { regions: ["stats"], needsImage: false, description: "Grid of 4 statistics with labels and values" },
  "timeline": { regions: ["timeline"], needsImage: false, description: "Horizontal timeline with steps" },
  "icon-grid": { regions: ["icons"], needsImage: false, description: "Grid of icons with labels" },
  "architecture": { regions: ["diagram", "content"], needsImage: true, description: "Architecture or system diagram" },
  "quote": { regions: ["quote", "attribution"], needsImage: false, description: "Large quote with attribution" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slide, targetLayoutId, projectContext }: RecastRequest = await req.json();

    if (!slide || !targetLayoutId) {
      return new Response(
        JSON.stringify({ error: "Missing slide or targetLayoutId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sourceLayout = LAYOUT_REQUIREMENTS[slide.layoutId] || LAYOUT_REQUIREMENTS["title-content"];
    const targetLayout = LAYOUT_REQUIREMENTS[targetLayoutId] || LAYOUT_REQUIREMENTS["title-content"];

    // Extract all text content from the source slide
    const extractText = (content: SlideContent[]): string => {
      const texts: string[] = [];
      for (const item of content) {
        if (typeof item.data === "string") {
          texts.push(item.data);
        } else if (Array.isArray(item.data)) {
          for (const d of item.data) {
            if (typeof d === "string") texts.push(d);
            else if (d?.text) texts.push(d.text);
            else if (d?.label) texts.push(`${d.label}: ${d.value || ""}`);
            else if (d?.title) texts.push(d.title);
          }
        } else if (item.data?.text) {
          texts.push(item.data.text);
        }
      }
      return texts.join("\n");
    };

    const sourceText = extractText(slide.content);

    // Build prompt for AI recasting
    const prompt = `You are a presentation slide content adapter. Convert content from one slide layout to another while preserving meaning.

SOURCE SLIDE:
- Layout: ${slide.layoutId} (${sourceLayout.description})
- Title: ${slide.title}
${slide.subtitle ? `- Subtitle: ${slide.subtitle}` : ""}
- Content: ${sourceText}

TARGET LAYOUT: ${targetLayoutId} (${targetLayout.description})
Required regions: ${targetLayout.regions.join(", ")}
${targetLayout.needsImage ? "This layout includes an image area - provide an imagePrompt for generation." : ""}

${projectContext ? `Project Context: ${projectContext}` : ""}

Generate a JSON object with the adapted slide content. The response MUST be valid JSON with this structure:
{
  "title": "slide title (may keep or adapt)",
  "subtitle": "optional subtitle",
  "content": [
    { "regionId": "region_name", "type": "content_type", "data": ... }
  ]${targetLayout.needsImage ? ',\n  "imagePrompt": "description for image generation"' : ''}
}

Content type examples:
- For "bullets" region: { "regionId": "bullets", "type": "bullets", "data": ["Point 1", "Point 2", "Point 3"] }
- For "content" region: { "regionId": "content", "type": "text", "data": "paragraph text here" }
- For "stats" region: { "regionId": "stats", "type": "stats", "data": [{"label": "Metric", "value": "100%"}, ...] }
- For "timeline" region: { "regionId": "timeline", "type": "timeline", "data": [{"step": 1, "label": "Step 1", "description": "..."}, ...] }
- For "icons" region: { "regionId": "icons", "type": "icon-grid", "data": [{"icon": "star", "label": "Feature"}, ...] }
- For "left"/"right" regions: { "regionId": "left", "type": "text", "data": "content" }
- For "quote" region: { "regionId": "quote", "type": "text", "data": "The quote text" }
- For "attribution" region: { "regionId": "attribution", "type": "text", "data": "- Author Name" }

Respond with ONLY the JSON object, no explanation.`;

    // Call Gemini for the conversion
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      // Fallback: simple content transformation without AI
      console.log("No GEMINI_API_KEY, using fallback transformation");
      const fallbackContent = createFallbackContent(slide, targetLayoutId, targetLayout);
      return new Response(
        JSON.stringify({ 
          success: true, 
          recastSlide: {
            ...slide,
            layoutId: targetLayoutId,
            content: fallbackContent.content,
            imagePrompt: fallbackContent.imagePrompt,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    console.log("Gemini response:", responseText.slice(0, 500));

    // Parse the response
    let recastData;
    try {
      recastData = JSON.parse(responseText);
    } catch (e) {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        recastData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    const recastSlide: Slide = {
      ...slide,
      layoutId: targetLayoutId,
      title: recastData.title || slide.title,
      subtitle: recastData.subtitle,
      content: recastData.content || [],
      imageUrl: targetLayout.needsImage ? (slide.imageUrl || undefined) : undefined,
    };

    // Add imagePrompt if layout needs image and we got one
    if (targetLayout.needsImage && recastData.imagePrompt) {
      (recastSlide as any).imagePrompt = recastData.imagePrompt;
    }

    return new Response(
      JSON.stringify({ success: true, recastSlide }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Recast error:", error);
    const message = error instanceof Error ? error.message : "Failed to recast slide";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fallback transformation without AI
function createFallbackContent(slide: Slide, targetLayoutId: string, targetLayout: { regions: string[], needsImage: boolean }): { content: SlideContent[], imagePrompt?: string } {
  const content: SlideContent[] = [];
  
  // Extract text from existing content
  const extractedTexts: string[] = [];
  for (const item of slide.content) {
    if (typeof item.data === "string") {
      extractedTexts.push(item.data);
    } else if (Array.isArray(item.data)) {
      extractedTexts.push(...item.data.map(d => typeof d === "string" ? d : d?.text || d?.label || ""));
    }
  }
  
  const combinedText = extractedTexts.filter(Boolean).join("\n");
  const textLines = combinedText.split("\n").filter(Boolean);

  // Generate content based on target layout
  switch (targetLayoutId) {
    case "bullets":
      content.push({
        regionId: "bullets",
        type: "bullets",
        data: textLines.length > 0 ? textLines.slice(0, 6) : ["Point 1", "Point 2", "Point 3"]
      });
      break;
      
    case "stats-grid":
      content.push({
        regionId: "stats",
        type: "stats",
        data: [
          { label: "Metric 1", value: "100%" },
          { label: "Metric 2", value: "50+" },
          { label: "Metric 3", value: "24/7" },
          { label: "Metric 4", value: "5x" },
        ]
      });
      break;
      
    case "timeline":
      content.push({
        regionId: "timeline",
        type: "timeline",
        data: textLines.slice(0, 4).map((text, i) => ({
          step: i + 1,
          label: `Step ${i + 1}`,
          description: text
        }))
      });
      break;
      
    case "icon-grid":
      content.push({
        regionId: "icons",
        type: "icon-grid",
        data: textLines.slice(0, 6).map(text => ({
          icon: "star",
          label: text.slice(0, 30)
        }))
      });
      break;
      
    case "two-column":
    case "comparison":
      const half = Math.ceil(textLines.length / 2);
      content.push({
        regionId: "left",
        type: "text",
        data: textLines.slice(0, half).join("\n") || "Left column content"
      });
      content.push({
        regionId: "right",
        type: "text",
        data: textLines.slice(half).join("\n") || "Right column content"
      });
      break;
      
    case "image-left":
    case "image-right":
      content.push({
        regionId: "content",
        type: "text",
        data: combinedText || "Add content here"
      });
      break;
      
    case "quote":
      content.push({
        regionId: "quote",
        type: "text",
        data: combinedText || "Add your quote here"
      });
      content.push({
        regionId: "attribution",
        type: "text",
        data: "- Author"
      });
      break;
      
    default:
      content.push({
        regionId: "content",
        type: "text",
        data: combinedText || "Add content here"
      });
  }

  return {
    content,
    imagePrompt: targetLayout.needsImage ? `Professional visualization for: ${slide.title}` : undefined
  };
}
