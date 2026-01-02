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

// Layout content requirements with exact JSON examples
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
  "timeline": { regions: ["timeline"], needsImage: false, description: "Vertical timeline with numbered steps" },
  "icon-grid": { regions: ["grid"], needsImage: false, description: "Grid of items with icons" },
  "architecture": { regions: ["diagram", "content"], needsImage: true, description: "Architecture or system diagram" },
  "quote": { regions: ["quote", "attribution"], needsImage: false, description: "Large quote with attribution" },
};

// EXACT JSON examples for each layout - this is what the SlideRenderer expects
const LAYOUT_EXAMPLES: Record<string, string> = {
  "title-cover": `{
  "title": "Main Title Here",
  "subtitle": "Subtitle or tagline",
  "content": []
}`,
  "section-divider": `{
  "title": "Section Title",
  "subtitle": "Section description",
  "content": []
}`,
  "title-content": `{
  "title": "Slide Title",
  "content": [
    { "regionId": "content", "type": "text", "data": { "text": "Main paragraph content goes here. Can be multiple sentences with rich detail about the topic." } }
  ]
}`,
  "bullets": `{
  "title": "Key Points",
  "subtitle": "Important takeaways",
  "content": [
    { "regionId": "bullets", "type": "bullets", "data": { "items": ["First bullet point with key information", "Second bullet point explaining another aspect", "Third bullet point with additional details", "Fourth bullet point summarizing"] } }
  ]
}`,
  "two-column": `{
  "title": "Two Column Layout",
  "content": [
    { "regionId": "left", "type": "text", "data": { "text": "Left column content goes here. This can contain detailed information about the first topic or aspect." } },
    { "regionId": "right", "type": "text", "data": { "text": "Right column content goes here. This can contain complementary information or a different perspective." } }
  ]
}`,
  "comparison": `{
  "title": "Comparison",
  "content": [
    { "regionId": "left", "type": "text", "data": { "text": "Option A details:\n• Feature 1\n• Feature 2\n• Feature 3" } },
    { "regionId": "right", "type": "text", "data": { "text": "Option B details:\n• Feature 1\n• Feature 2\n• Feature 3" } }
  ]
}`,
  "image-left": `{
  "title": "Visual Feature",
  "content": [
    { "regionId": "content", "type": "text", "data": { "text": "Description text explaining the visual. This content appears on the right side of the image and should provide context or details about what the image shows." } }
  ],
  "imagePrompt": "Professional visualization related to the slide title"
}`,
  "image-right": `{
  "title": "Visual Feature",
  "content": [
    { "regionId": "content", "type": "text", "data": { "text": "Description text explaining the visual. This content appears on the left side of the image and should provide context or details about what the image shows." } }
  ],
  "imagePrompt": "Professional visualization related to the slide title"
}`,
  "stats-grid": `{
  "title": "Key Metrics",
  "content": [
    { "regionId": "stats", "type": "stat", "data": { "label": "Users", "value": "10K+" } },
    { "regionId": "stats", "type": "stat", "data": { "label": "Revenue", "value": "$1M" } },
    { "regionId": "stats", "type": "stat", "data": { "label": "Growth", "value": "150%" } },
    { "regionId": "stats", "type": "stat", "data": { "label": "Rating", "value": "4.9" } }
  ]
}`,
  "timeline": `{
  "title": "Project Timeline",
  "content": [
    { "regionId": "timeline", "type": "timeline", "data": { "steps": [
      { "title": "Phase 1", "description": "Initial planning and setup" },
      { "title": "Phase 2", "description": "Development and implementation" },
      { "title": "Phase 3", "description": "Testing and refinement" },
      { "title": "Phase 4", "description": "Launch and deployment" }
    ] } }
  ]
}`,
  "icon-grid": `{
  "title": "Features Overview",
  "content": [
    { "regionId": "grid", "type": "icon-grid", "data": { "items": [
      { "title": "Feature One", "description": "Brief description of the first feature" },
      { "title": "Feature Two", "description": "Brief description of the second feature" },
      { "title": "Feature Three", "description": "Brief description of the third feature" },
      { "title": "Feature Four", "description": "Brief description of the fourth feature" }
    ] } }
  ]
}`,
  "architecture": `{
  "title": "System Architecture",
  "content": [
    { "regionId": "content", "type": "text", "data": { "text": "Description of the architecture or diagram being shown." } }
  ],
  "imagePrompt": "Technical architecture diagram showing system components"
}`,
  "quote": `{
  "title": "Quote",
  "content": [
    { "regionId": "quote", "type": "text", "data": { "text": "The actual quote text goes here. It should be impactful and memorable." } },
    { "regionId": "attribution", "type": "text", "data": { "text": "— Author Name, Title" } }
  ]
}`
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
    const targetExample = LAYOUT_EXAMPLES[targetLayoutId] || LAYOUT_EXAMPLES["title-content"];

    // Extract all text content from the source slide comprehensively
    const extractAllContent = (content: SlideContent[]): { texts: string[], bullets: string[], stats: any[], timeline: any[], grid: any[] } => {
      const result = { texts: [] as string[], bullets: [] as string[], stats: [] as any[], timeline: [] as any[], grid: [] as any[] };
      
      for (const item of content) {
        // Handle text data
        if (typeof item.data === "string") {
          result.texts.push(item.data);
        } else if (item.data?.text) {
          result.texts.push(item.data.text);
        }
        
        // Handle arrays (bullets, items, etc.)
        if (item.data?.items) {
          for (const d of item.data.items) {
            if (typeof d === "string") {
              result.bullets.push(d);
            } else if (d?.title || d?.description) {
              result.bullets.push(`${d.title || ''}: ${d.description || ''}`);
              result.grid.push(d);
            } else if (d?.text) {
              result.bullets.push(d.text);
            }
          }
        }
        
        // Handle stats
        if (item.type === "stat" && item.data) {
          result.stats.push(item.data);
        }
        
        // Handle timeline steps
        if (item.data?.steps) {
          result.timeline = item.data.steps;
          for (const step of item.data.steps) {
            result.bullets.push(`${step.title || step.label || ''}: ${step.description || ''}`);
          }
        }
      }
      
      return result;
    };

    const sourceContent = extractAllContent(slide.content);
    const allText = [...sourceContent.texts, ...sourceContent.bullets].filter(Boolean).join("\n\n");

    // Build comprehensive prompt for AI recasting
    const prompt = `You are a presentation slide layout adapter. Your job is to recast slide content from one layout format to another.

CRITICAL RULES:
1. PRESERVE ALL CONTENT - Do not lose any information from the source slide
2. ADAPT THE FORMAT - Restructure content to fit the target layout's structure exactly
3. USE THE EXACT JSON STRUCTURE - The output MUST match the example format precisely

SOURCE SLIDE DATA:
- Layout: ${slide.layoutId}
- Title: "${slide.title}"
${slide.subtitle ? `- Subtitle: "${slide.subtitle}"` : ""}
- All Content Text:
${allText}

${sourceContent.stats.length > 0 ? `- Stats Data: ${JSON.stringify(sourceContent.stats)}` : ""}
${sourceContent.timeline.length > 0 ? `- Timeline Data: ${JSON.stringify(sourceContent.timeline)}` : ""}
${sourceContent.grid.length > 0 ? `- Grid Items: ${JSON.stringify(sourceContent.grid)}` : ""}

TARGET LAYOUT: ${targetLayoutId}
Description: ${targetLayout.description}

EXACT JSON STRUCTURE REQUIRED (follow this format precisely):
${targetExample}

${targetLayout.needsImage ? 'IMPORTANT: This layout needs an image. Include an "imagePrompt" field with a description for generating a relevant image.' : ''}

INSTRUCTIONS:
1. Keep the title (you may adapt it slightly if needed)
2. Transform ALL the source content into the target format
3. If target is "bullets": Create an array of bullet point strings from all the text
4. If target is "two-column" or "comparison": Split content logically between left and right
5. If target is "timeline": Create steps array with title and description for each step
6. If target is "icon-grid": Create items array with title and description for each item
7. If target is "stats-grid": Create 4 stat objects with label and value (extract numbers/metrics from content or create relevant ones)
8. The "data" field structure must match the example exactly

Respond with ONLY valid JSON matching the structure above. No explanations.`;

    // Call Gemini for the conversion
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      // Fallback: transformation without AI
      console.log("No GEMINI_API_KEY, using fallback transformation");
      const fallbackContent = createFallbackContent(slide, targetLayoutId, targetLayout, sourceContent, allText);
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
            temperature: 0.2,
            maxOutputTokens: 3000,
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
    
    console.log("Gemini response:", responseText.slice(0, 1000));

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

// Improved fallback transformation without AI
function createFallbackContent(
  slide: Slide, 
  targetLayoutId: string, 
  targetLayout: { regions: string[], needsImage: boolean },
  sourceContent: { texts: string[], bullets: string[], stats: any[], timeline: any[], grid: any[] },
  allText: string
): { content: SlideContent[], imagePrompt?: string } {
  const content: SlideContent[] = [];
  const textLines = allText.split(/\n+/).filter(Boolean);

  // Generate content based on target layout
  switch (targetLayoutId) {
    case "bullets":
      // Use existing bullets or split text into bullets
      const bulletItems = sourceContent.bullets.length > 0 
        ? sourceContent.bullets.slice(0, 8)
        : textLines.slice(0, 8);
      content.push({
        regionId: "bullets",
        type: "bullets",
        data: { items: bulletItems.length > 0 ? bulletItems : ["Content from previous slide"] }
      });
      break;
      
    case "stats-grid":
      // Use existing stats or create placeholder stats
      if (sourceContent.stats.length >= 4) {
        sourceContent.stats.slice(0, 4).forEach(stat => {
          content.push({ regionId: "stats", type: "stat", data: stat });
        });
      } else {
        const defaultStats = [
          { label: "Key Metric 1", value: "100%" },
          { label: "Key Metric 2", value: "50+" },
          { label: "Key Metric 3", value: "24/7" },
          { label: "Key Metric 4", value: "5x" },
        ];
        defaultStats.forEach(stat => {
          content.push({ regionId: "stats", type: "stat", data: stat });
        });
      }
      break;
      
    case "timeline":
      // Use existing timeline or create from text lines
      const steps = sourceContent.timeline.length > 0 
        ? sourceContent.timeline.slice(0, 5)
        : textLines.slice(0, 5).map((text, i) => ({
            title: `Step ${i + 1}`,
            description: text
          }));
      content.push({
        regionId: "timeline",
        type: "timeline",
        data: { steps: steps.length > 0 ? steps : [{ title: "Step 1", description: "Content" }] }
      });
      break;
      
    case "icon-grid":
      // Use existing grid items or create from text
      const gridItems = sourceContent.grid.length > 0 
        ? sourceContent.grid.slice(0, 6)
        : textLines.slice(0, 6).map(text => ({
            title: text.slice(0, 30),
            description: text.length > 30 ? text.slice(30) : ""
          }));
      content.push({
        regionId: "grid",
        type: "icon-grid",
        data: { items: gridItems.length > 0 ? gridItems : [{ title: "Feature", description: "Description" }] }
      });
      break;
      
    case "two-column":
    case "comparison":
      const half = Math.ceil(textLines.length / 2);
      content.push({
        regionId: "left",
        type: "text",
        data: { text: textLines.slice(0, half).join("\n\n") || "Left column content" }
      });
      content.push({
        regionId: "right",
        type: "text",
        data: { text: textLines.slice(half).join("\n\n") || "Right column content" }
      });
      break;
      
    case "image-left":
    case "image-right":
    case "architecture":
      content.push({
        regionId: "content",
        type: "text",
        data: { text: allText || "Add content here" }
      });
      break;
      
    case "quote":
      content.push({
        regionId: "quote",
        type: "text",
        data: { text: allText || "Add your quote here" }
      });
      content.push({
        regionId: "attribution",
        type: "text",
        data: { text: "— Author" }
      });
      break;
      
    case "title-content":
    default:
      content.push({
        regionId: "content",
        type: "text",
        data: { text: allText || "Add content here" }
      });
  }

  return {
    content,
    imagePrompt: targetLayout.needsImage ? `Professional visualization for: ${slide.title}` : undefined
  };
}
