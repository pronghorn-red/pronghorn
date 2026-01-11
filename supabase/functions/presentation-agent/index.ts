import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PresentationRequest {
  projectId: string;
  presentationId: string;
  shareToken: string;
  mode: "concise" | "detailed";
  targetSlides: number;
  initialPrompt?: string;
}

interface BlackboardEntry {
  id: string;
  timestamp: string;
  source: string;
  category: "observation" | "insight" | "question" | "decision" | "estimate" | "analysis" | "narrative";
  content: string;
  data?: Record<string, any>;
}

interface ToolResult {
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
  blackboardEntries: BlackboardEntry[];
}

interface SlideContent {
  regionId: string;
  type: string;
  data: any;
}

interface GeneratedSlide {
  id: string;
  order: number;
  layoutId: string;
  title: string;
  subtitle?: string;
  content: SlideContent[];
  notes?: string;
  imageUrl?: string;
  imagePrompt?: string;
}

// SlideSpec is defined below in Phase 1 section

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// Create SSE message
function sseMessage(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Battle-tested JSON parser from coding-agent-orchestrator
function parseAgentResponseText(rawText: string): any {
  const originalText = rawText.trim();
  let text = originalText;

  console.log("Parsing agent response, length:", rawText.length);
  console.log("Raw preview:", rawText.slice(0, 300) + (rawText.length > 300 ? "..." : ""));

  const tryParse = (jsonStr: string, method: string): any | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`JSON parsed successfully via ${method}`);
      return parsed;
    } catch (e) {
      console.log(`JSON.parse failed in ${method}:`, (e as Error).message);
      return null;
    }
  };

  // Method 1: Direct parse
  let result = tryParse(text, "direct parse");
  if (result) return result;

  // Method 2: Extract from LAST ```json fence
  const lastFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
  if (lastFenceMatch?.[1]) {
    const extracted = lastFenceMatch[1].trim();
    const cleaned = extracted
      .replace(/^[\s\n]*here.?is.?the.?json.?[:\s]*/i, "")
      .replace(/^[\s\n]*json[:\s]*/i, "")
      .trim();
    result = tryParse(cleaned, "last code fence");
    if (result) return result;
  }

  // Method 3: Find ALL code blocks and try each (reverse order)
  const allFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return result;
    }
  }

  // Method 4: Brace/bracket matching (arrays for slides)
  const firstBracket = originalText.indexOf("[");
  const lastBracket = originalText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = originalText.slice(firstBracket, lastBracket + 1);
    result = tryParse(candidate, "bracket extraction (array)");
    if (result) return result;
  }

  // Method 5: Brace matching (objects)
  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;

    const cleaned = candidate.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    result = tryParse(cleaned, "brace extraction (cleaned)");
    if (result) return result;
  }

  console.error("All JSON parsing methods failed for response:", originalText.slice(0, 1000));
  return null;
}

// Generate slide image using the enhance-image edge function
async function generateSlideImage(
  prompt: string, 
  supabaseUrl: string, 
  supabaseKey: string
): Promise<string | null> {
  try {
    console.log(`🎨 Generating slide image for: "${prompt.substring(0, 100)}..."`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/enhance-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        prompt: `Professional presentation visual: ${prompt}. High quality, clean, modern design suitable for a business presentation slide.`,
        model: "gemini-2.5-flash-image",
        images: [], // No source images, pure generation
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation failed:", response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    console.log("✅ Slide image generated successfully");
    return data.imageUrl; // Returns base64 data URL
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}

// Get layout regions for a specific layout
function getLayoutRegions(layoutId: string): string {
  const layoutRegions: Record<string, string> = {
    "title-cover": "background(image), title(heading), subtitle(text), date(text)",
    "section-divider": "section-number(heading), title(heading), subtitle(text)",
    "title-content": "title(heading), content(richtext)",
    "two-column": "title(heading), left-content(richtext), right-content(richtext)",
    "image-left": "title(heading), image(image), content(richtext)",
    "image-right": "title(heading), content(richtext), image(image)",
    "stats-grid": "title(heading), stat-1(stat), stat-2(stat), stat-3(stat), stat-4(stat)",
    "bullets": "title(heading), bullets(bullets)",
    "quote": "quote(text), attribution(text)",
    "architecture": "title(heading), diagram(image)",
    "comparison": "title(heading), left-header(heading), right-header(heading), left-content(bullets), right-content(bullets)",
    "timeline": "title(heading), timeline(timeline)",
    "icon-grid": "title(heading), subtitle(text), grid(icon-grid)",
    "table": "title(heading), table(table)",
    "chart-full": "title(heading), chart(chart)",
  };
  return layoutRegions[layoutId] || "title(heading), content(richtext)";
}

// Context data is built inline in generateSlideContent

// ============ PHASE 1: DETERMINISTIC SLIDE STRUCTURE ============
// Creates exact number of slides with layouts - NO LLM, guaranteed to work

interface SlideSpec {
  order: number;
  layoutId: string;
  section: string;
  purpose: string;
  suggestedTitle: string;
  requiresImage: boolean;
}

function createSlideStructure(
  targetSlides: number,
  mode: string,
  projectName: string,
  blackboard: BlackboardEntry[]
): SlideSpec[] {
  // Define section templates with layout sequences
  const sectionTemplates = [
    { 
      section: "Opening", 
      minSlides: 2,
      slides: [
        { layout: "title-cover", purpose: "Cover slide with project title", titleTemplate: "{project}", requiresImage: true },
        { layout: "quote", purpose: "Executive summary - key message", titleTemplate: "Executive Summary", requiresImage: false },
      ]
    },
    { 
      section: "Context", 
      minSlides: 1,
      slides: [
        { layout: "bullets", purpose: "Problem statement and context", titleTemplate: "The Challenge", requiresImage: false },
        { layout: "image-right", purpose: "Current state visualization", titleTemplate: "Current State", requiresImage: true },
        { layout: "stats-grid", purpose: "Key metrics driving the need", titleTemplate: "By The Numbers", requiresImage: false },
      ]
    },
    { 
      section: "Solution", 
      minSlides: 1,
      slides: [
        { layout: "image-left", purpose: "Solution overview", titleTemplate: "Our Solution", requiresImage: true },
        { layout: "icon-grid", purpose: "Key capabilities", titleTemplate: "Key Capabilities", requiresImage: false },
      ]
    },
    { 
      section: "Requirements", 
      minSlides: 2,
      slides: [
        { layout: "bullets", purpose: "Primary requirements overview", titleTemplate: "Core Requirements", requiresImage: false },
        { layout: "two-column", purpose: "Functional vs non-functional", titleTemplate: "Functional Requirements", requiresImage: false },
        { layout: "comparison", purpose: "Priority breakdown", titleTemplate: "High Priority Items", requiresImage: false },
        { layout: "bullets", purpose: "Additional requirements", titleTemplate: "Additional Requirements", requiresImage: false },
      ]
    },
    { 
      section: "Architecture", 
      minSlides: 1,
      slides: [
        { layout: "architecture", purpose: "System architecture diagram", titleTemplate: "System Architecture", requiresImage: true },
        { layout: "image-left", purpose: "Component details", titleTemplate: "Key Components", requiresImage: true },
        { layout: "bullets", purpose: "Technology stack", titleTemplate: "Technology Stack", requiresImage: false },
      ]
    },
    { 
      section: "Status", 
      minSlides: 1,
      slides: [
        { layout: "stats-grid", purpose: "Current progress metrics", titleTemplate: "Project Status", requiresImage: false },
        { layout: "timeline", purpose: "Milestones achieved", titleTemplate: "Progress Timeline", requiresImage: false },
      ]
    },
    { 
      section: "Risks", 
      minSlides: 1,
      slides: [
        { layout: "two-column", purpose: "Risks and mitigations", titleTemplate: "Risks & Mitigations", requiresImage: false },
        { layout: "bullets", purpose: "Challenges identified", titleTemplate: "Key Challenges", requiresImage: false },
      ]
    },
    { 
      section: "Next Steps", 
      minSlides: 1,
      slides: [
        { layout: "timeline", purpose: "Roadmap and next steps", titleTemplate: "Roadmap", requiresImage: false },
        { layout: "quote", purpose: "Call to action", titleTemplate: "Call to Action", requiresImage: false },
      ]
    },
  ];

  const result: SlideSpec[] = [];
  let slideOrder = 1;
  let remainingSlides = targetSlides;
  
  // Calculate how many slides per section
  const totalMinSlides = sectionTemplates.reduce((sum, s) => sum + s.minSlides, 0);
  const extraSlides = Math.max(0, targetSlides - totalMinSlides);
  
  // Distribute slides across sections
  const slideCounts: number[] = sectionTemplates.map(s => s.minSlides);
  let extra = extraSlides;
  
  // Give extra slides to sections that can use them (proportionally)
  while (extra > 0) {
    for (let i = 0; i < slideCounts.length && extra > 0; i++) {
      const maxForSection = sectionTemplates[i].slides.length;
      if (slideCounts[i] < maxForSection) {
        slideCounts[i]++;
        extra--;
      }
    }
    // If we couldn't distribute any more, break to avoid infinite loop
    if (extra === extraSlides) break;
  }
  
  // If we still have extra slides, add more to requirements/architecture
  while (extra > 0) {
    slideCounts[3]++; // Requirements
    extra--;
    if (extra > 0) {
      slideCounts[4]++; // Architecture
      extra--;
    }
  }

  // Build the slide specs
  for (let sectionIdx = 0; sectionIdx < sectionTemplates.length; sectionIdx++) {
    const section = sectionTemplates[sectionIdx];
    const count = slideCounts[sectionIdx];
    
    for (let i = 0; i < count; i++) {
      const slideTemplate = section.slides[i % section.slides.length];
      
      // Generate title from template
      let title = slideTemplate.titleTemplate.replace("{project}", projectName);
      if (i > 0 && i >= section.slides.length) {
        title = `${title} (Part ${Math.floor(i / section.slides.length) + 1})`;
      }
      
      result.push({
        order: slideOrder++,
        layoutId: slideTemplate.layout,
        section: section.section,
        purpose: slideTemplate.purpose,
        suggestedTitle: title,
        requiresImage: slideTemplate.requiresImage,
      });
      
      if (slideOrder > targetSlides) break;
    }
    
    if (slideOrder > targetSlides) break;
  }
  
  // Ensure we have exactly the target number
  while (result.length < targetSlides) {
    const idx = result.length;
    result.push({
      order: idx + 1,
      layoutId: idx % 2 === 0 ? "bullets" : "two-column",
      section: "Additional",
      purpose: "Additional project information",
      suggestedTitle: `Additional Details ${idx - totalMinSlides + 1}`,
      requiresImage: false,
    });
  }
  
  // Trim if somehow over
  if (result.length > targetSlides) {
    result.length = targetSlides;
  }
  
  // Re-number
  result.forEach((s, i) => s.order = i + 1);
  
  console.log(`✅ Created ${result.length} slide specs deterministically`);
  return result;
}

// ============ PHASE 2: LLM CONTENT GENERATION FOR SINGLE SLIDE ============

async function generateSlideContent(
  spec: SlideSpec,
  blackboard: BlackboardEntry[],
  collectedData: Record<string, any>,
  allSpecs: SlideSpec[],
  previousSlides: GeneratedSlide[],
  apiKey: string
): Promise<GeneratedSlide> {
  const projectName = collectedData.settings?.name || "Project";
  const projectDesc = collectedData.settings?.description || "";
  
  // Get comprehensive project summary
  const blufEntry = blackboard.find(e => e.data?.type === 'bluf');
  const maturityEntry = blackboard.find(e => e.category === 'estimate');
  
  const projectSummary = `
PROJECT: ${projectName}
DESCRIPTION: ${projectDesc || 'No description provided'}
STATUS: ${maturityEntry?.content || 'Unknown maturity'}
EXECUTIVE SUMMARY: ${blufEntry?.content || 'Project under development'}
`.trim();

  // Get previous slides content for narrative continuity
  const prevSlidesContext = previousSlides.slice(-3).map(slide => {
    const textContent = slide.content?.map(c => 
      c.data?.text || c.data?.items?.map((i: any) => i.title).join(', ') || ''
    ).filter(Boolean).join(' ') || '';
    return `Slide ${slide.order} "${slide.title}": ${textContent.slice(0, 200)}`;
  }).join('\n');
  
  // Get relevant data based on section - WITH ACTUAL CONTENT
  let contextData = "";
  const requirements = collectedData.requirements || [];
  const nodes = collectedData.canvas?.nodes || [];
  const files = collectedData.repoStructure?.files || [];
  const specs = collectedData.specifications || [];
  
  switch (spec.section) {
    case "Opening":
      contextData = `
${projectSummary}
Total Requirements: ${requirements.length}
Architecture Components: ${nodes.length}
Code Files: ${files.length}
Key narrative hooks from analysis:
${blackboard.filter(e => e.category === "narrative").slice(0, 3).map(e => `- ${e.content}`).join('\n')}`;
      break;
      
    case "Context":
      const observations = blackboard.filter(e => e.category === "observation" || e.category === "narrative");
      contextData = `
PROJECT CONTEXT:
${projectDesc || 'No description - create compelling context based on project structure'}

KEY OBSERVATIONS:
${observations.slice(0, 6).map(e => `- ${e.content}`).join('\n')}

PROBLEM INDICATORS:
- ${requirements.length} requirements defined indicates ${requirements.length > 20 ? 'complex scope' : requirements.length > 5 ? 'well-defined scope' : 'early stage definition'}
- ${nodes.length} architecture nodes indicates ${nodes.length > 10 ? 'detailed technical design' : 'architectural planning ongoing'}`;
      break;
      
    case "Solution":
      const insights = blackboard.filter(e => e.category === "insight");
      contextData = `
SOLUTION OVERVIEW:
${projectDesc || projectName}

KEY INSIGHTS FROM ANALYSIS:
${insights.slice(0, 8).map(e => `- ${e.content}`).join('\n')}

TECHNICAL COMPONENTS:
${nodes.slice(0, 6).map((n: any) => `- ${n.data?.label || n.type}: ${(n.data?.description || '').slice(0, 100)}`).join('\n')}`;
      break;
      
    case "Requirements":
      const topReqs = requirements.filter((r: any) => !r.parent_id).slice(0, 10);
      contextData = `
REQUIREMENTS OVERVIEW (${requirements.length} total):

TOP-LEVEL REQUIREMENTS:
${topReqs.map((r: any) => `
**${r.code || 'REQ'}: ${r.title}**
${(r.content || 'No description').slice(0, 200)}
Priority: ${r.priority || 'Not set'}
`).join('\n')}

REQUIREMENT ANALYSIS:
${blackboard.filter(e => e.source === 'read_requirements').slice(0, 3).map(e => `- ${e.content}`).join('\n')}`;
      break;
      
    case "Architecture":
      const keyNodes = nodes.slice(0, 15);
      const nodesByType: Record<string, any[]> = {};
      keyNodes.forEach((n: any) => {
        const type = n.type || 'component';
        if (!nodesByType[type]) nodesByType[type] = [];
        nodesByType[type].push(n);
      });
      
      contextData = `
ARCHITECTURE OVERVIEW (${nodes.length} components):

${Object.entries(nodesByType).map(([type, items]) => `
${type.toUpperCase()} (${items.length}):
${items.slice(0, 5).map((n: any) => `- ${n.data?.label || 'Component'}: ${(n.data?.description || '').slice(0, 150)}`).join('\n')}
`).join('\n')}

ARCHITECTURE INSIGHTS:
${blackboard.filter(e => e.source === 'read_canvas').slice(0, 3).map(e => `- ${e.content}`).join('\n')}`;
      break;
      
    case "Status":
      const estimates = blackboard.filter(e => e.category === "estimate" || e.category === "analysis");
      contextData = `
PROJECT STATUS:
${maturityEntry?.content || 'Status being assessed'}

KEY METRICS:
- Requirements defined: ${requirements.length}
- Architecture components: ${nodes.length}
- Code files implemented: ${files.length}
- Specifications generated: ${specs.length}

STATUS ANALYSIS:
${estimates.slice(0, 5).map(e => `- ${e.content}`).join('\n')}`;
      break;
      
    case "Risks":
      const riskIndicators = blackboard.filter(e => 
        e.category === "question" || 
        e.content.toLowerCase().includes("risk") || 
        e.content.toLowerCase().includes("challeng") ||
        e.content.toLowerCase().includes("concern")
      );
      contextData = `
RISK ANALYSIS:

PROJECT SCOPE: ${requirements.length} requirements, ${nodes.length} components, ${files.length} files

IDENTIFIED CONCERNS:
${riskIndicators.slice(0, 6).map(e => `- ${e.content}`).join('\n') || '- No explicit risks identified in analysis'}

CONSIDERATIONS:
- ${requirements.length === 0 ? 'Requirements not yet documented - scope clarity risk' : 'Requirements documented'}
- ${nodes.length === 0 ? 'Architecture not yet defined - design risk' : 'Architecture defined'}
- ${files.length === 0 ? 'Implementation not started - timeline risk' : 'Implementation in progress'}`;
      break;
      
    case "Next Steps":
      const decisions = blackboard.filter(e => e.category === "decision" || e.category === "narrative");
      contextData = `
NEXT STEPS CONTEXT:
${decisions.slice(0, 5).map(e => `- ${e.content}`).join('\n')}

PROJECT STATE:
- Requirements: ${requirements.length > 0 ? 'Defined' : 'Needs definition'}
- Architecture: ${nodes.length > 0 ? 'Designed' : 'Needs design'}
- Implementation: ${files.length > 0 ? 'In progress' : 'Not started'}

RECOMMENDED FOCUS AREAS:
${requirements.length === 0 ? '- Define core requirements' : ''}
${nodes.length === 0 ? '- Design system architecture' : ''}
${files.length === 0 ? '- Begin implementation' : '- Continue development'}`;
      break;
      
    default:
      contextData = blackboard.slice(0, 8).map(e => e.content).join('\n');
  }
  
  // Build previous/next context
  const prevSlides = allSpecs.slice(0, spec.order - 1).slice(-3);
  const nextSlides = allSpecs.slice(spec.order).slice(0, 2);
  
  const layoutRegions = getLayoutRegions(spec.layoutId);
  
  const prompt = `Generate SPECIFIC, DATA-RICH content for slide ${spec.order}/${allSpecs.length} of "${projectName}" presentation.

=== SLIDE SPECIFICATION ===
Order: ${spec.order}
Layout: ${spec.layoutId}  
Section: ${spec.section}
Purpose: ${spec.purpose}
Suggested title: "${spec.suggestedTitle}"

=== LAYOUT REGIONS TO FILL ===
${layoutRegions}

=== PROJECT CONTEXT ===
${projectSummary}

=== PREVIOUS SLIDES (for narrative continuity) ===
${prevSlidesContext || 'This is the first slide'}

=== STORY FLOW ===
Previous: ${prevSlides.map(s => s.suggestedTitle).join(" → ") || "None"}
Next: ${nextSlides.map(s => s.suggestedTitle).join(" → ") || "Final slide"}

=== PROJECT DATA FOR THIS SLIDE ===
${contextData}

=== CRITICAL CONTENT RULES ===
1. Use ACTUAL project data from above - no generic placeholders
2. Include SPECIFIC numbers, names, and details from the project
3. Use markdown: **bold**, *italic* - ABSOLUTELY NO HTML tags (<br>, <ul>, etc.)
4. Content must flow naturally from previous slides
5. Make content compelling and actionable

=== JSON FORMAT RULES ===
Return a JSON object with this EXACT structure:
{
  "id": "slide-${spec.order}",
  "order": ${spec.order},
  "layoutId": "${spec.layoutId}",
  "title": "Your specific title",
  "content": [
    { "regionId": "region-name", "type": "content-type", "data": { ... } }
  ],
  "notes": "Speaker notes",
  ${spec.requiresImage ? '"imagePrompt": "Detailed image description"' : ''}
}

CONTENT TYPE FORMATS:
- text/richtext: { "text": "Markdown content here" }
- bullets: { "items": [{ "title": "Point", "description": "Detail" }] }
- stat: { "value": "42", "label": "Metric name" }
- timeline: { "steps": [{ "title": "Step", "description": "Detail" }] }
- icon-grid: { "items": [{ "icon": "📊", "title": "Item", "description": "Detail" }] }

Return ONLY valid JSON.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are a presentation content expert. Generate rich, specific slide content using actual project data. Return ONLY valid JSON with no HTML tags - use markdown for formatting. Never use placeholder text like 'TBD' or 'Details to be added'." }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 3000,
          temperature: 0.5,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Slide ${spec.order} content generation failed:`, response.status, errorText);
    throw new Error(`Slide content generation failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = parseAgentResponseText(text);

  if (!parsed || typeof parsed !== "object") {
    console.error(`Invalid slide content for ${spec.order}:`, text.slice(0, 500));
    throw new Error("Invalid slide content format");
  }

  // Build the slide with guaranteed fields
  const slide: GeneratedSlide = {
    id: parsed.id || `slide-${spec.order}`,
    order: spec.order,
    layoutId: spec.layoutId,
    title: parsed.title || spec.suggestedTitle,
    content: Array.isArray(parsed.content) ? parsed.content : [],
    notes: parsed.notes || spec.purpose,
  };

  if (parsed.subtitle) slide.subtitle = parsed.subtitle;
  if (parsed.imagePrompt || spec.requiresImage) {
    slide.imagePrompt = parsed.imagePrompt || `Professional visualization for: ${spec.purpose}`;
  }

  console.log(`✅ Generated slide ${spec.order}: "${slide.title}" with ${slide.content.length} content items`);
  return slide;
}

// Create a fallback slide when LLM fails
function createFallbackSlideFromSpec(spec: SlideSpec): GeneratedSlide {
  const contentMap: Record<string, SlideContent[]> = {
    "title-cover": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 1 } },
      { regionId: "subtitle", type: "text", data: { text: spec.purpose } },
    ],
    "quote": [
      { regionId: "quote", type: "text", data: { text: `"${spec.purpose}"` } },
      { regionId: "attribution", type: "text", data: { text: "Project Team" } },
    ],
    "bullets": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "bullets", type: "bullets", data: { items: [
        { title: "Key Point 1", description: "Details to be added" },
        { title: "Key Point 2", description: "Details to be added" },
        { title: "Key Point 3", description: "Details to be added" },
      ] } },
    ],
    "stats-grid": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "stat-1", type: "stat", data: { value: "—", label: "Metric 1" } },
      { regionId: "stat-2", type: "stat", data: { value: "—", label: "Metric 2" } },
      { regionId: "stat-3", type: "stat", data: { value: "—", label: "Metric 3" } },
      { regionId: "stat-4", type: "stat", data: { value: "—", label: "Metric 4" } },
    ],
    "timeline": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "timeline", type: "timeline", data: { steps: [
        { title: "Step 1", description: "First milestone" },
        { title: "Step 2", description: "Second milestone" },
        { title: "Step 3", description: "Third milestone" },
      ] } },
    ],
  };

  return {
    id: generateId(),
    order: spec.order,
    layoutId: spec.layoutId,
    title: spec.suggestedTitle,
    content: contentMap[spec.layoutId] || [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "content", type: "richtext", data: { text: spec.purpose } },
    ],
    notes: spec.purpose,
    imagePrompt: spec.requiresImage ? `Professional visualization for: ${spec.purpose}` : undefined,
  };
}

// Old generateSingleSlide and createFallbackSlide removed - now using generateSlideContent and createFallbackSlideFromSpec

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const authHeader = req.headers.get("authorization");
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: {
            headers: authHeader ? { Authorization: authHeader } : {},
          },
        });

        const requestData: PresentationRequest = await req.json();
        const { projectId, presentationId, shareToken, mode, targetSlides, initialPrompt } = requestData;

        console.log("Starting presentation generation:", { projectId, presentationId, mode, targetSlides });

        controller.enqueue(encoder.encode(sseMessage("status", { phase: "starting", message: "Initializing presentation agent..." })));

        // Update presentation status
        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_status: "generating",
        });

        if (!geminiKey) {
          throw new Error("GEMINI_API_KEY is not configured");
        }

        const blackboard: BlackboardEntry[] = [];
        const collectedData: Record<string, any> = {};

        // Helper to add blackboard entry and stream it
        const addToBlackboard = async (entry: Omit<BlackboardEntry, "id" | "timestamp">) => {
          const fullEntry: BlackboardEntry = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            ...entry,
          };
          blackboard.push(fullEntry);
          controller.enqueue(encoder.encode(sseMessage("blackboard", fullEntry)));

          await supabase.rpc("append_presentation_blackboard_with_token", {
            p_presentation_id: presentationId,
            p_token: shareToken,
            p_entry: fullEntry,
          });

          return fullEntry;
        };

        // ============ DEEP DATA COLLECTION TOOLS ============

        // Tool: Read Settings with deep analysis
        const readSettings = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_settings", message: "Analyzing project settings..." })));

          try {
            const { data: proj, error } = await supabase.rpc("get_project_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.settings = proj;
            const entries: BlackboardEntry[] = [];

            // Deep observation
            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "observation",
              content: `Project "${proj.name}" established on ${new Date(proj.created_at).toLocaleDateString()}. ${proj.description ? `Core purpose: ${proj.description}` : "No description provided - this may indicate early-stage planning."}`,
              data: { name: proj.name, description: proj.description, created: proj.created_at },
            }));

            if (proj.organization) {
              entries.push(await addToBlackboard({
                source: "read_settings",
                category: "observation",
                content: `Organizational context: ${proj.organization}. This provides institutional framing for stakeholder communications.`,
                data: { organization: proj.organization },
              }));
            }

            // Derive insights
            const ageInDays = Math.floor((Date.now() - new Date(proj.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const maturityAssessment = ageInDays < 7 ? "nascent" : ageInDays < 30 ? "developing" : ageInDays < 90 ? "maturing" : "established";

            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "insight",
              content: `Project age: ${ageInDays} days (${maturityAssessment} phase). ${maturityAssessment === "nascent" ? "Expect foundational elements still forming." : maturityAssessment === "established" ? "Should have substantial documentation and implementation." : "Active development likely ongoing."}`,
              data: { ageInDays, maturityAssessment },
            }));

            entries.push(await addToBlackboard({
              source: "read_settings",
              category: "narrative",
              content: `Opening narrative hook: "${proj.name}" ${proj.description ? `aims to ${proj.description.toLowerCase().replace(/^\w/, (c: string) => c.toLowerCase())}` : "represents a strategic initiative requiring further definition"}.`,
            }));

            return { tool: "read_settings", success: true, data: proj, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_settings", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Requirements with deep analysis
        const readRequirements = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_requirements", message: "Analyzing requirements in depth..." })));

          try {
            const { data: requirements, error } = await supabase.rpc("get_requirements_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.requirements = requirements || [];
            const entries: BlackboardEntry[] = [];
            const reqs = requirements || [];

            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "observation",
              content: `Requirements corpus contains ${reqs.length} items. ${reqs.length === 0 ? "No formal requirements documented - presentation will need to focus on vision and roadmap." : `Comprehensive requirements provide solid foundation for detailed analysis.`}`,
              data: { count: reqs.length },
            }));

            if (reqs.length > 0) {
              const topLevel = reqs.filter((r: any) => !r.parent_id);
              const nested = reqs.filter((r: any) => r.parent_id);
              const decompositionRatio = nested.length / Math.max(topLevel.length, 1);

              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "analysis",
                content: `Requirements structure analysis: ${topLevel.length} top-level requirements with ${nested.length} child items. Decomposition ratio: ${decompositionRatio.toFixed(1)}x. ${decompositionRatio > 3 ? "Well-decomposed requirements indicate mature planning." : decompositionRatio > 1 ? "Moderate decomposition suggests ongoing refinement." : "Flat structure may benefit from further breakdown."}`,
                data: { topLevel: topLevel.length, nested: nested.length, decompositionRatio },
              }));

              // Extract key requirements for narrative
              const keyReqs = topLevel.slice(0, 6).map((r: { code?: string; title?: string; content?: string }) => ({
                code: r.code,
                title: r.title,
                content: (r.content || "").slice(0, 200),
              }));

              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "narrative",
                content: `Key requirements to highlight: ${keyReqs.map((r: any) => `${r.code}: ${r.title}`).join("; ")}. These form the core value proposition.`,
                data: { keyRequirements: keyReqs },
              }));

              // Add insight for each key requirement
              for (const req of keyReqs.slice(0, 5)) {
                entries.push(await addToBlackboard({
                  source: "read_requirements",
                  category: "insight",
                  content: `${req.code}: ${req.content || req.title}`,
                  data: { requirementId: req.code, title: req.title },
                }));
              }
            }

            return { tool: "read_requirements", success: true, data: requirements, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_requirements", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Artifacts
        const readArtifacts = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_artifacts", message: "Scanning project artifacts..." })));

          try {
            const { data: artifacts, error } = await supabase.rpc("get_artifacts_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.artifacts = artifacts || [];
            const entries: BlackboardEntry[] = [];
            const arts = artifacts || [];

            entries.push(await addToBlackboard({
              source: "read_artifacts",
              category: "observation",
              content: `Documentation inventory: ${arts.length} artifacts. ${arts.length === 0 ? "No artifacts uploaded yet." : "Rich documentation provides narrative material."}`,
              data: { count: arts.length },
            }));

            if (arts.length > 0) {
              const withImages = arts.filter((a: any) => a.image_url).length;
              const withSummaries = arts.filter((a: any) => a.ai_summary).length;
              const titled = arts.filter((a: any) => a.ai_title).length;

              entries.push(await addToBlackboard({
                source: "read_artifacts",
                category: "observation",
                content: `Artifact composition: ${withImages} include images (visual assets for slides), ${withSummaries} have AI summaries (pre-analyzed content), ${titled} have titles.`,
                data: { images: withImages, summaries: withSummaries, titled },
              }));

              // Extract key artifacts for slide content
              for (const art of arts.slice(0, 3)) {
                if (art.ai_summary) {
                  entries.push(await addToBlackboard({
                    source: "read_artifacts",
                    category: "insight",
                    content: `${art.ai_title || "Untitled artifact"}: ${art.ai_summary}`,
                    data: { artifactId: art.id, title: art.ai_title },
                  }));
                } else if (art.content) {
                  entries.push(await addToBlackboard({
                    source: "read_artifacts",
                    category: "observation",
                    content: `${art.ai_title || "Untitled artifact"}: ${art.content.slice(0, 300)}...`,
                    data: { artifactId: art.id },
                  }));
                }
              }
            }

            return { tool: "read_artifacts", success: true, data: artifacts, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_artifacts", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Specifications
        const readSpecifications = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_specifications", message: "Reviewing generated specifications..." })));

          try {
            const { data: specs, error } = await supabase.rpc("get_specifications_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.specifications = specs || [];
            const entries: BlackboardEntry[] = [];

            entries.push(await addToBlackboard({
              source: "read_specifications",
              category: "observation",
              content: `${(specs || []).length} generated specification(s) available. ${(specs || []).length === 0 ? "No formal specs generated yet." : "Formal specifications available for reference."}`,
              data: { count: (specs || []).length },
            }));

            return { tool: "read_specifications", success: true, data: specs, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_specifications", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Canvas with architecture analysis
        const readCanvas = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_canvas", message: "Analyzing architecture canvas..." })));

          try {
            const { data: nodes, error: nodesError } = await supabase.rpc("get_canvas_nodes_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            const { data: edges, error: edgesError } = await supabase.rpc("get_canvas_edges_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (nodesError) throw nodesError;
            collectedData.canvas = { nodes: nodes || [], edges: edges || [] };
            const entries: BlackboardEntry[] = [];

            const nodeList = nodes || [];
            const edgeList = edges || [];

            entries.push(await addToBlackboard({
              source: "read_canvas",
              category: "observation",
              content: `Architecture canvas contains ${nodeList.length} components and ${edgeList.length} connections. ${nodeList.length === 0 ? "No architecture defined yet." : "Visual architecture available for presentation."}`,
              data: { nodes: nodeList.length, edges: edgeList.length },
            }));

            if (nodeList.length > 0) {
              // Analyze node types
              const nodeTypes: Record<string, number> = {};
              nodeList.forEach((n: any) => {
                nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
              });

              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "analysis",
                content: `Architecture composition: ${Object.entries(nodeTypes).map(([t, c]) => `${c} ${t}`).join(", ")}. This reveals the system's structural paradigm.`,
                data: { nodeTypes },
              }));

              // Connectivity analysis
              const connectivity = edgeList.length / Math.max(nodeList.length, 1);
              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "insight",
                content: `Connectivity analysis: ${connectivity.toFixed(2)} connections per component. ${connectivity > 2 ? "Highly interconnected system." : connectivity > 1 ? "Moderate coupling indicates balanced architecture." : "Loosely coupled components suggest microservices or modular design."}`,
                data: { connectivity },
              }));

              // Extract key components for slides
              const keyComponents = nodeList.slice(0, 10).map((n: any) => ({
                type: n.type,
                label: n.data?.label || n.data?.title || "Unnamed",
                description: n.data?.description || "",
              }));

              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "narrative",
                content: `Key architectural components: ${keyComponents.map((c: any) => `${c.label} (${c.type})`).join(", ")}. These form the system's backbone.`,
                data: { components: keyComponents },
              }));
            }

            return { tool: "read_canvas", success: true, data: collectedData.canvas, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_canvas", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Repo Structure
        const readRepoStructure = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_repo", message: "Scanning code repositories..." })));

          try {
            const { data: repos, error: reposError } = await supabase.rpc("get_repos_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (reposError) throw reposError;

            const allFiles: any[] = [];
            for (const repo of repos || []) {
              const { data: files } = await supabase.rpc("get_repo_files_with_token", {
                p_repo_id: repo.id,
                p_token: shareToken,
              });
              if (files) allFiles.push(...files);
            }

            collectedData.repoStructure = { repos: repos || [], files: allFiles };
            const entries: BlackboardEntry[] = [];

            entries.push(await addToBlackboard({
              source: "read_repo_structure",
              category: "observation",
              content: `Codebase inventory: ${(repos || []).length} repositories containing ${allFiles.length} files. ${allFiles.length === 0 ? "No code files yet - project is in planning phase." : "Active development with trackable progress."}`,
              data: { repoCount: (repos || []).length, fileCount: allFiles.length },
            }));

            if (allFiles.length > 0) {
              // Analyze file types
              const extensions: Record<string, number> = {};
              const directories = new Set<string>();
              allFiles.forEach((f: any) => {
                const ext = f.path?.split(".").pop() || "unknown";
                extensions[ext] = (extensions[ext] || 0) + 1;
                const dir = f.path?.split("/").slice(0, -1).join("/");
                if (dir) directories.add(dir);
              });

              entries.push(await addToBlackboard({
                source: "read_repo_structure",
                category: "analysis",
                content: `Code organization: ${directories.size} directories. Primary languages/formats: ${Object.entries(extensions).slice(0, 5).map(([e, c]) => `${e} (${c} files)`).join(", ")}. This indicates technology choices and project scope.`,
                data: { extensions, directories: directories.size },
              }));
            }

            return { tool: "read_repo_structure", success: true, data: collectedData.repoStructure, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_repo_structure", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Databases
        const readDatabases = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_databases", message: "Checking database configurations..." })));

          try {
            const { data: databases, error } = await supabase.rpc("get_databases_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.databases = databases || [];
            const entries: BlackboardEntry[] = [];

            entries.push(await addToBlackboard({
              source: "read_databases",
              category: "observation",
              content: `Database infrastructure: ${(databases || []).length} database(s) configured. ${(databases || []).length === 0 ? "No databases configured yet." : "Data layer established."}`,
              data: { count: (databases || []).length },
            }));

            return { tool: "read_databases", success: true, data: databases, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_databases", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Connections
        const readConnections = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_connections", message: "Reviewing external connections..." })));

          try {
            const { data: connections, error } = await supabase.rpc("get_database_connections_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.connections = connections || [];
            const entries: BlackboardEntry[] = [];

            entries.push(await addToBlackboard({
              source: "read_connections",
              category: "observation",
              content: `External integrations: ${(connections || []).length} connection(s). ${(connections || []).length === 0 ? "No external data sources connected." : "Integration points established."}`,
              data: { count: (connections || []).length },
            }));

            return { tool: "read_connections", success: true, data: connections, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_connections", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // Tool: Read Deployments
        const readDeployments = async (): Promise<ToolResult> => {
          controller.enqueue(encoder.encode(sseMessage("status", { phase: "read_deployments", message: "Checking deployment status..." })));

          try {
            const { data: deployments, error } = await supabase.rpc("get_deployments_with_token", {
              p_project_id: projectId,
              p_token: shareToken,
            });

            if (error) throw error;
            collectedData.deployments = deployments || [];
            const entries: BlackboardEntry[] = [];
            const deps = deployments || [];

            entries.push(await addToBlackboard({
              source: "read_deployments",
              category: "observation",
              content: `Deployment configurations: ${deps.length}. ${deps.length === 0 ? "No deployments configured - project not yet production-ready." : "Deployment pipeline established."}`,
              data: { count: deps.length },
            }));

            if (deps.length > 0) {
              const live = deps.filter((d: any) => d.status === "deployed" || d.status === "live" || d.status === "running");
              entries.push(await addToBlackboard({
                source: "read_deployments",
                category: "insight",
                content: `${live.length}/${deps.length} deployments are live. ${live.length > 0 ? "Production presence established." : "Deployments configured but not yet live."}`,
                data: { liveCount: live.length },
              }));
            }

            return { tool: "read_deployments", success: true, data: deployments, blackboardEntries: entries };
          } catch (error: any) {
            return { tool: "read_deployments", success: false, error: error.message, blackboardEntries: [] };
          }
        };

        // ============ EXECUTE DATA COLLECTION ============
        const toolResults: ToolResult[] = [];

        toolResults.push(await readSettings());
        toolResults.push(await readRequirements());
        toolResults.push(await readArtifacts());
        toolResults.push(await readSpecifications());
        toolResults.push(await readCanvas());
        toolResults.push(await readRepoStructure());
        toolResults.push(await readDatabases());
        toolResults.push(await readConnections());
        toolResults.push(await readDeployments());

        // ============ SYNTHESIS PHASE ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "synthesis", message: "Synthesizing insights..." })));

        const reqCount = collectedData.requirements?.length || 0;
        const nodeCount = collectedData.canvas?.nodes?.length || 0;
        const fileCount = collectedData.repoStructure?.files?.length || 0;
        const specCount = collectedData.specifications?.length || 0;
        const artifactCount = collectedData.artifacts?.length || 0;
        const dbCount = collectedData.databases?.length || 0;
        const deployCount = collectedData.deployments?.length || 0;

        const completionScore = Math.min(100, Math.round(
          (reqCount > 0 ? 15 : 0) +
          (nodeCount > 0 ? 20 : 0) +
          (fileCount > 0 ? 25 : 0) +
          (specCount > 0 ? 15 : 0) +
          (artifactCount > 0 ? 10 : 0) +
          (dbCount > 0 ? 8 : 0) +
          (deployCount > 0 ? 7 : 0)
        ));

        await addToBlackboard({
          source: "synthesis",
          category: "estimate",
          content: `Project maturity assessment: ${completionScore}% complete. ${completionScore < 30 ? "Early stage - focus on vision and roadmap." : completionScore < 60 ? "Mid-development - balance current state with future plans." : "Advanced - emphasize achievements and remaining work."}`,
          data: {
            completionScore,
            breakdown: { requirements: reqCount, architecture: nodeCount, code: fileCount, specs: specCount, artifacts: artifactCount, databases: dbCount, deployments: deployCount },
          },
        });

        const projectName = collectedData.settings?.name || "Project";
        await addToBlackboard({
          source: "synthesis",
          category: "narrative",
          content: `Executive Summary (BLUF): ${projectName}. Current status: ${completionScore}% complete with ${reqCount} requirements defined, ${nodeCount} architectural components designed, and ${fileCount} code files implemented.`,
          data: { type: "bluf" },
        });

        // ============ CHECKPOINT: Save blackboard before slide generation ============
        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_blackboard: blackboard,
          p_status: "generating_slides",
        });

        // ============ PHASE 1: CREATE SLIDE STRUCTURE (DETERMINISTIC) ============
        controller.enqueue(encoder.encode(sseMessage("status", { 
          phase: "planning", 
          message: `Creating ${targetSlides} slide structure...` 
        })));

        const slideSpecs = createSlideStructure(targetSlides, mode, projectName, blackboard);
        
        console.log(`Phase 1 complete: Created ${slideSpecs.length} slide specs`);
        
        // Create empty slide shells and save immediately
        const slidesJson: GeneratedSlide[] = slideSpecs.map(spec => ({
          id: generateId(),
          order: spec.order,
          layoutId: spec.layoutId,
          title: spec.suggestedTitle,
          content: [],
          notes: spec.purpose,
          imagePrompt: spec.requiresImage ? `Professional visualization for: ${spec.purpose}` : undefined,
        }));

        // Save the shell structure immediately
        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_slides: slidesJson,
          p_status: "generating",
        });

        controller.enqueue(encoder.encode(sseMessage("status", { 
          phase: "generating_slides", 
          message: `Generating content for ${slideSpecs.length} slides...`,
          total: slideSpecs.length,
          current: 0
        })));

        // ============ PHASE 2: FILL SLIDE CONTENT (LLM) ============
        // Track generated slides for context passing
        const generatedSlides: GeneratedSlide[] = [];
        
        for (let i = 0; i < slideSpecs.length; i++) {
          const spec = slideSpecs[i];

          controller.enqueue(encoder.encode(sseMessage("status", { 
            phase: "generating_slides", 
            message: `Generating slide ${i + 1}/${slideSpecs.length}: "${spec.suggestedTitle}"`,
            current: i + 1,
            total: slideSpecs.length
          })));

          try {
            const fullSlide = await generateSlideContent(
              spec,
              blackboard,
              collectedData,
              slideSpecs,
              generatedSlides, // Pass previously generated slides for context
              geminiKey
            );

            // Update the slide in our array
            slidesJson[i] = fullSlide;
            generatedSlides.push(fullSlide);

            // Stream the slide to client immediately
            controller.enqueue(encoder.encode(sseMessage("slide", fullSlide)));

            // Checkpoint save every 3 slides
            if ((i + 1) % 3 === 0 || i === slideSpecs.length - 1) {
              await supabase.rpc("update_presentation_with_token", {
                p_presentation_id: presentationId,
                p_token: shareToken,
                p_slides: slidesJson,
                p_status: "generating",
              });
            }

          } catch (slideError: any) {
            console.error(`Failed to generate content for slide ${i + 1}:`, slideError);

            // Use fallback slide from spec
            const fallbackSlide = createFallbackSlideFromSpec(spec);
            slidesJson[i] = fallbackSlide;
            generatedSlides.push(fallbackSlide);
            controller.enqueue(encoder.encode(sseMessage("slide", fallbackSlide)));
          }
        }

        console.log(`✅ Phase 2 complete: Generated content for ${slidesJson.length} slides`);

        // ============ IMAGE GENERATION PHASE ============
        const slidesNeedingImages = slidesJson.filter(
          (s: any) => s.imagePrompt && !s.imageUrl
        );

        if (slidesNeedingImages.length > 0) {
          controller.enqueue(encoder.encode(sseMessage("status", { 
            phase: "generating_images", 
            message: `Generating images for ${Math.min(slidesNeedingImages.length, 5)} slides...` 
          })));

          let imagesGenerated = 0;
          const maxImages = Math.min(slidesNeedingImages.length, 5);

          for (let i = 0; i < maxImages; i++) {
            const slide = slidesNeedingImages[i];

            controller.enqueue(encoder.encode(sseMessage("status", { 
              phase: "generating_images", 
              message: `Generating image ${i + 1}/${maxImages}: "${slide.title}"...` 
            })));

            const imageUrl = await generateSlideImage(
              slide.imagePrompt!,
              supabaseUrl,
              supabaseKey
            );

            if (imageUrl) {
              const slideIndex = slidesJson.findIndex((s: any) => s.id === slide.id);
              if (slideIndex !== -1) {
                slidesJson[slideIndex].imageUrl = imageUrl;

                // Add to content array for image region
                const imageLayouts: Record<string, string> = {
                  "image-left": "image",
                  "image-right": "image",
                  "architecture": "diagram",
                  "title-cover": "background",
                };

                const imageRegion = imageLayouts[slide.layoutId];
                if (imageRegion) {
                  const hasImageContent = slidesJson[slideIndex].content?.some(
                    (c: any) => c.regionId === imageRegion && c.type === "image"
                  );

                  if (!hasImageContent) {
                    slidesJson[slideIndex].content = slidesJson[slideIndex].content || [];
                    slidesJson[slideIndex].content.push({
                      regionId: imageRegion,
                      type: "image",
                      data: { url: imageUrl, alt: slide.imagePrompt }
                    });
                  }
                }
              }
              imagesGenerated++;
            }
          }

          await addToBlackboard({
            source: "image_generation",
            category: "observation",
            content: `Generated ${imagesGenerated} images for ${slidesNeedingImages.length} image-capable slides.`,
            data: { generated: imagesGenerated, requested: slidesNeedingImages.length }
          });
        }

        // ============ SAVE FINAL PRESENTATION ============
        controller.enqueue(encoder.encode(sseMessage("status", { phase: "saving", message: "Saving presentation..." })));

        const metadata = {
          generatedAt: new Date().toISOString(),
          model: "gemini-2.5-flash",
          mode,
          targetSlides,
          actualSlides: slidesJson.length,
          blackboardEntries: blackboard.length,
          dataStats: {
            requirements: reqCount,
            artifacts: artifactCount,
            canvasNodes: nodeCount,
            specifications: specCount,
            codeFiles: fileCount,
            databases: dbCount,
            deployments: deployCount,
          },
          completionEstimate: completionScore,
        };

        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_slides: slidesJson,
          p_blackboard: blackboard,
          p_metadata: metadata,
          p_status: "completed",
        });

        controller.enqueue(encoder.encode(sseMessage("complete", {
          presentationId,
          slideCount: slidesJson.length,
          blackboardCount: blackboard.length,
          model: "gemini-2.5-flash",
        })));

        controller.close();
      } catch (error: any) {
        console.error("Presentation agent error:", error);
        controller.enqueue(encoder.encode(sseMessage("error", { message: error.message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
