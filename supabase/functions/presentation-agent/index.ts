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

// Slide content JSON schema for structured output enforcement
const SLIDE_CONTENT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Unique slide identifier" },
    order: { type: "integer", description: "Slide order number" },
    layoutId: { type: "string", description: "Layout identifier" },
    title: { type: "string", description: "Slide title" },
    subtitle: { type: "string", description: "Optional subtitle" },
    content: {
      type: "array",
      items: {
        type: "object",
        properties: {
          regionId: { type: "string", description: "Layout region ID" },
          type: { type: "string", description: "Content type" },
          data: { type: "object", description: "Content data" }
        },
        required: ["regionId", "type", "data"]
      }
    },
    notes: { type: "string", description: "Speaker notes" },
    imagePrompt: { type: "string", description: "AI image generation prompt" }
  },
  required: ["id", "order", "layoutId", "title", "content"]
};

// Gemini-compatible schema (no additionalProperties)
const GEMINI_SLIDE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    order: { type: "integer" },
    layoutId: { type: "string" },
    title: { type: "string" },
    subtitle: { type: "string" },
    content: {
      type: "array",
      items: {
        type: "object",
        properties: {
          regionId: { type: "string" },
          type: { type: "string" },
          data: { type: "object" }
        },
        required: ["regionId", "type", "data"]
      }
    },
    notes: { type: "string" },
    imagePrompt: { type: "string" }
  },
  required: ["id", "order", "layoutId", "title", "content"]
};

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

// Battle-tested JSON parser with sanitization for control characters
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

  // Sanitize control characters that break JSON parsing
  const sanitizeJson = (str: string): string => {
    // Fix unescaped newlines inside JSON strings (common LLM issue)
    // This is tricky - we need to escape newlines inside string values only
    return str
      // Remove any BOM or zero-width characters
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Replace literal tabs with escaped tabs
      .replace(/\t/g, '\\t');
  };

  const sanitizedText = sanitizeJson(text);

  // Method 1: Direct parse
  let result = tryParse(sanitizedText, "direct parse");
  if (result) return result;

  // Method 2: Extract from LAST ```json fence
  const lastFenceMatch = sanitizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
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
  const allFences = [...sanitizedText.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return result;
    }
  }

  // Method 4: Brace/bracket matching (arrays for slides)
  const firstBracket = sanitizedText.indexOf("[");
  const lastBracket = sanitizedText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = sanitizedText.slice(firstBracket, lastBracket + 1);
    result = tryParse(candidate, "bracket extraction (array)");
    if (result) return result;
  }

  // Method 5: Brace matching (objects)
  const firstBrace = sanitizedText.indexOf("{");
  const lastBrace = sanitizedText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = sanitizedText.slice(firstBrace, lastBrace + 1);
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;

    // Try aggressive cleanup - collapse all whitespace
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
    "image-full": "image(image) - Full screen image, no text",
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
  dataSources: string[]; // Which data sources are most relevant for this slide
}

function createSlideStructure(
  targetSlides: number,
  mode: string,
  projectName: string,
  blackboard: BlackboardEntry[]
): SlideSpec[] {
  // Define section templates with layout sequences and data sources
  const sectionTemplates = [
    { 
      section: "Opening", 
      minSlides: 2,
      dataSources: ["settings", "synthesis"],
      slides: [
        { layout: "title-cover", purpose: "Cover slide with project title", titleTemplate: "{project}", requiresImage: true },
        { layout: "quote", purpose: "Executive summary - key message", titleTemplate: "Executive Summary", requiresImage: false },
      ]
    },
    { 
      section: "Context", 
      minSlides: 1,
      dataSources: ["settings", "artifacts", "synthesis"],
      slides: [
        { layout: "bullets", purpose: "Problem statement and context", titleTemplate: "The Challenge", requiresImage: false },
        { layout: "image-right", purpose: "Current state visualization", titleTemplate: "Current State", requiresImage: true },
        { layout: "stats-grid", purpose: "Key metrics driving the need", titleTemplate: "By The Numbers", requiresImage: false },
      ]
    },
    { 
      section: "Solution", 
      minSlides: 1,
      dataSources: ["requirements", "canvas", "synthesis"],
      slides: [
        { layout: "image-left", purpose: "Solution overview", titleTemplate: "Our Solution", requiresImage: true },
        { layout: "icon-grid", purpose: "Key capabilities", titleTemplate: "Key Capabilities", requiresImage: false },
      ]
    },
    { 
      section: "Requirements", 
      minSlides: 2,
      dataSources: ["requirements"],
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
      dataSources: ["canvas"],
      slides: [
        { layout: "architecture", purpose: "System architecture diagram", titleTemplate: "System Architecture", requiresImage: true },
        { layout: "image-left", purpose: "Component details", titleTemplate: "Key Components", requiresImage: true },
        { layout: "bullets", purpose: "Technology stack", titleTemplate: "Technology Stack", requiresImage: false },
      ]
    },
    { 
      section: "Status", 
      minSlides: 1,
      dataSources: ["synthesis", "deployments", "repoStructure"],
      slides: [
        { layout: "stats-grid", purpose: "Current progress metrics", titleTemplate: "Project Status", requiresImage: false },
        { layout: "timeline", purpose: "Milestones achieved", titleTemplate: "Progress Timeline", requiresImage: false },
      ]
    },
    { 
      section: "Risks", 
      minSlides: 1,
      dataSources: ["synthesis", "requirements"],
      slides: [
        { layout: "two-column", purpose: "Risks and mitigations", titleTemplate: "Risks & Mitigations", requiresImage: false },
        { layout: "bullets", purpose: "Challenges identified", titleTemplate: "Key Challenges", requiresImage: false },
      ]
    },
    { 
      section: "Next Steps", 
      minSlides: 1,
      dataSources: ["synthesis", "deployments"],
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
        dataSources: section.dataSources || ["synthesis"],
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
      dataSources: ["synthesis"],
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

interface ModelConfig {
  model: string;
  maxTokens: number;
  apiKey: string;
  anthropicKey?: string;
  xaiKey?: string;
}

async function generateSlideContent(
  spec: SlideSpec,
  blackboard: BlackboardEntry[],
  collectedData: Record<string, any>,
  allSpecs: SlideSpec[],
  previousSlides: GeneratedSlide[],
  modelConfig: ModelConfig
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

  // Get previous slides content for narrative continuity - IMPROVED extraction
  const prevSlidesContext = previousSlides.slice(-3).map(slide => {
    const extractText = (content: SlideContent[]): string => {
      return content.map(c => {
        const data = c.data || {};
        if (data.text) return data.text;
        if (data.items) return data.items.map((i: any) => `${i.title}: ${i.description || ''}`).join('; ');
        if (data.steps) return data.steps.map((s: any) => `${s.title}: ${s.description || ''}`).join('; ');
        if (data.value && data.label) return `${data.label}: ${data.value}`;
        return '';
      }).filter(Boolean).join(' ').slice(0, 400);
    };
    const textContent = extractText(slide.content || []);
    return `Slide ${slide.order} "${slide.title}": ${textContent || 'Content pending'}`;
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
  
  const systemPrompt = `You are a senior presentation content expert creating executive-quality slides.

ABSOLUTE REQUIREMENTS:
1. Use ACTUAL project data provided - no generic placeholders like "TBD", "Details to be added", "Key Point 1"
2. Include SPECIFIC numbers, names, requirement codes, and component names from the project
3. Use markdown formatting: **bold**, *italic* - ABSOLUTELY NO HTML tags
4. Content must flow naturally from previous slides
5. For stats-grid layouts: Use REAL numbers from the project data
6. For timeline layouts: Create realistic phases based on actual project scope
7. For risks: Identify REAL concerns based on project gaps visible in the data

If project data is sparse, CREATE plausible content based on:
- Project name and description
- The section's purpose
- Standard project patterns

NEVER return empty content arrays. Every slide MUST have substantive content.`;

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

=== REQUIRED JSON OUTPUT ===
{
  "id": "slide-${spec.order}",
  "order": ${spec.order},
  "layoutId": "${spec.layoutId}",
  "title": "Your specific title using actual project terms",
  "content": [
    { "regionId": "region-name", "type": "content-type", "data": { ... } }
  ],
  "notes": "Speaker notes with key talking points"${spec.requiresImage ? `,
  "imagePrompt": "Detailed professional image description - specify style (isometric, photorealistic, diagram), colors, and subject matter. No text in image."` : ''}
}

CONTENT TYPE FORMATS:
- heading: { "text": "Title", "level": 2 }
- text/richtext: { "text": "Markdown content here" }
- bullets: { "items": [{ "title": "Point", "description": "Detail" }] }
- stat: { "value": "42", "label": "Metric name" }
- timeline: { "steps": [{ "title": "Step", "description": "Detail" }] }
- icon-grid: { "items": [{ "icon": "📊", "title": "Item", "description": "Detail" }] }

Return ONLY valid JSON with no additional text.`;

  // Call LLM based on model selection
  const { model, maxTokens, apiKey, anthropicKey, xaiKey } = modelConfig;
  let response: Response;
  
  if (model.startsWith("gemini")) {
    // Gemini with JSON schema enforcement
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: Math.min(maxTokens, 8192), // Gemini has per-request limit
            temperature: 0.5,
            responseMimeType: "application/json",
            responseSchema: GEMINI_SLIDE_SCHEMA,
          },
        }),
      }
    );
  } else if (model.startsWith("claude")) {
    // Claude with tool-based JSON enforcement
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 4096),
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        tools: [{
          name: "generate_slide",
          description: "Generate slide content as structured JSON",
          input_schema: { ...SLIDE_CONTENT_SCHEMA, additionalProperties: false },
        }],
        tool_choice: { type: "tool", name: "generate_slide" },
      }),
    });
  } else if (model.startsWith("grok")) {
    // Grok/xAI with JSON schema
    response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${xaiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 8192),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "slide_content",
            strict: true,
            schema: SLIDE_CONTENT_SCHEMA,
          },
        },
      }),
    });
  } else {
    // Fallback to Gemini
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      }
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Slide ${spec.order} content generation failed:`, response.status, errorText);
    throw new Error(`Slide content generation failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract text based on model
  let text = "";
  if (model.startsWith("claude")) {
    // Claude tool response
    const toolUse = data.content?.find((c: any) => c.type === "tool_use");
    text = toolUse?.input ? JSON.stringify(toolUse.input) : "";
  } else if (model.startsWith("grok")) {
    text = data.choices?.[0]?.message?.content || "";
  } else {
    // Gemini
    text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  
  const parsed = parseAgentResponseText(text);

  if (!parsed || typeof parsed !== "object") {
    console.error(`Invalid slide content for ${spec.order}:`, text.slice(0, 500));
    throw new Error("Invalid slide content format");
  }

  // Build the slide with guaranteed fields
  const slide: GeneratedSlide = {
    id: parsed.id || generateId(),
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

// Create a data-aware fallback slide when LLM fails
function createFallbackSlideFromSpec(
  spec: SlideSpec, 
  collectedData?: Record<string, any>
): GeneratedSlide {
  const requirements = collectedData?.requirements || [];
  const nodes = collectedData?.canvas?.nodes || [];
  const files = collectedData?.repoStructure?.files || [];
  const projectName = collectedData?.settings?.name || "Project";
  
  // Section-specific data-aware fallback content
  const getSectionContent = (): SlideContent[] => {
    switch (spec.section) {
      case "Status":
        return [
          { regionId: "title", type: "heading", data: { text: "Project Status", level: 2 } },
          { regionId: "stat-1", type: "stat", data: { value: String(requirements.length), label: "Requirements" } },
          { regionId: "stat-2", type: "stat", data: { value: String(nodes.length), label: "Components" } },
          { regionId: "stat-3", type: "stat", data: { value: String(files.length), label: "Code Files" } },
          { regionId: "stat-4", type: "stat", data: { value: files.length > 0 ? "In Progress" : "Planning", label: "Phase" } },
        ];
        
      case "Risks":
        const risks = [];
        if (requirements.length === 0) risks.push({ title: "Scope Definition", description: "Requirements not yet documented" });
        if (nodes.length === 0) risks.push({ title: "Architecture Gap", description: "System design needs definition" });
        if (files.length === 0) risks.push({ title: "Implementation Start", description: "Development not yet begun" });
        if (risks.length === 0) risks.push({ title: "Ongoing Monitoring", description: "Regular risk assessment needed" });
        
        return [
          { regionId: "title", type: "heading", data: { text: "Risks & Mitigations", level: 2 } },
          { regionId: "left-content", type: "bullets", data: { items: risks } },
          { regionId: "right-content", type: "richtext", data: { 
            text: `**Mitigation Strategy**\n\n- Regular stakeholder reviews\n- Iterative development approach\n- Continuous documentation` 
          } },
        ];
        
      case "Next Steps":
        const steps = [];
        if (requirements.length === 0) steps.push({ title: "Phase 1", description: "Define core requirements" });
        else if (nodes.length === 0) steps.push({ title: "Phase 1", description: "Design system architecture" });
        else if (files.length === 0) steps.push({ title: "Phase 1", description: "Begin implementation" });
        else steps.push({ title: "Phase 1", description: "Continue development" });
        steps.push({ title: "Phase 2", description: "Testing and validation" });
        steps.push({ title: "Phase 3", description: "Deployment and rollout" });
        
        return [
          { regionId: "title", type: "heading", data: { text: "Roadmap", level: 2 } },
          { regionId: "timeline", type: "timeline", data: { steps } },
        ];
        
      case "Requirements":
        const topReqs = requirements.filter((r: any) => !r.parent_id).slice(0, 4);
        if (topReqs.length > 0) {
          return [
            { regionId: "title", type: "heading", data: { text: "Core Requirements", level: 2 } },
            { regionId: "bullets", type: "bullets", data: { items: topReqs.map((r: any) => ({
              title: `${r.code || 'REQ'}: ${r.title}`,
              description: (r.content || '').slice(0, 100)
            })) } },
          ];
        }
        break;
        
      case "Architecture":
        if (nodes.length > 0) {
          const nodeTypes = [...new Set(nodes.map((n: any) => n.type || 'component'))].slice(0, 4);
          return [
            { regionId: "title", type: "heading", data: { text: "System Architecture", level: 2 } },
            { regionId: "content", type: "richtext", data: { 
              text: `**${projectName} Architecture**\n\n${nodes.length} components across ${nodeTypes.length} layers:\n${nodeTypes.map(t => `- ${t}`).join('\n')}`
            } },
          ];
        }
        break;
    }
    return [];
  };
  
  const sectionContent = getSectionContent();
  
  // Layout-based fallback if section-specific didn't work
  const contentMap: Record<string, SlideContent[]> = {
    "title-cover": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 1 } },
      { regionId: "subtitle", type: "text", data: { text: spec.purpose } },
    ],
    "quote": [
      { regionId: "quote", type: "text", data: { text: `"${spec.purpose}"` } },
      { regionId: "attribution", type: "text", data: { text: projectName } },
    ],
    "bullets": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "bullets", type: "bullets", data: { items: [
        { title: "Key deliverable", description: "Primary outcome for this phase" },
        { title: "Success criteria", description: "Measurable objectives" },
        { title: "Dependencies", description: "Required inputs and resources" },
      ] } },
    ],
    "stats-grid": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "stat-1", type: "stat", data: { value: String(requirements.length), label: "Requirements" } },
      { regionId: "stat-2", type: "stat", data: { value: String(nodes.length), label: "Components" } },
      { regionId: "stat-3", type: "stat", data: { value: String(files.length), label: "Files" } },
      { regionId: "stat-4", type: "stat", data: { value: "Active", label: "Status" } },
    ],
    "timeline": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "timeline", type: "timeline", data: { steps: [
        { title: "Phase 1", description: "Foundation and planning" },
        { title: "Phase 2", description: "Development and testing" },
        { title: "Phase 3", description: "Deployment and review" },
      ] } },
    ],
    "two-column": [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "left-content", type: "richtext", data: { text: `**Overview**\n\n${spec.purpose}` } },
      { regionId: "right-content", type: "richtext", data: { text: `**Key Points**\n\n- Point 1\n- Point 2\n- Point 3` } },
    ],
    "image-full": [
      { regionId: "image", type: "image", data: { url: "", alt: spec.purpose } },
    ],
  };

  return {
    id: generateId(),
    order: spec.order,
    layoutId: spec.layoutId,
    title: spec.suggestedTitle,
    content: sectionContent.length > 0 ? sectionContent : (contentMap[spec.layoutId] || [
      { regionId: "title", type: "heading", data: { text: spec.suggestedTitle, level: 2 } },
      { regionId: "content", type: "richtext", data: { text: spec.purpose } },
    ]),
    notes: `[Fallback] ${spec.purpose}`,
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
        const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
        const xaiKey = Deno.env.get("XAI_API_KEY");

        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: {
            headers: authHeader ? { Authorization: authHeader } : {},
          },
        });

        const requestData: PresentationRequest = await req.json();
        const { projectId, presentationId, shareToken, mode, targetSlides, initialPrompt } = requestData;

        console.log("Starting presentation generation:", { projectId, presentationId, mode, targetSlides });

        controller.enqueue(encoder.encode(sseMessage("status", { phase: "starting", message: "Initializing presentation agent..." })));

        // Get project settings for model selection
        const { data: projectSettings, error: projectError } = await supabase.rpc("get_project_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });

        if (projectError) {
          console.error("Failed to get project settings:", projectError);
        }

        const selectedModel = projectSettings?.selected_model || "gemini-2.5-flash";
        const maxTokens = projectSettings?.max_tokens || 8192;

        // Build model config
        const modelConfig: ModelConfig = {
          model: selectedModel,
          maxTokens,
          apiKey: geminiKey,
          anthropicKey,
          xaiKey,
        };

        console.log("Using model config:", { model: selectedModel, maxTokens });

        // Update presentation status
        await supabase.rpc("update_presentation_with_token", {
          p_presentation_id: presentationId,
          p_token: shareToken,
          p_status: "generating",
        });

        if (!geminiKey && selectedModel.startsWith("gemini")) {
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

        // Tool: Read Requirements with ENHANCED deep analysis
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

            if (reqs.length === 0) {
              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "observation",
                content: "**No formal requirements documented** - presentation should focus on vision and roadmap rather than detailed requirements. This is common for early-stage projects.",
                data: { count: 0 },
              }));
              return { tool: "read_requirements", success: true, data: requirements, blackboardEntries: entries };
            }

            const topLevel = reqs.filter((r: any) => !r.parent_id);
            const nested = reqs.filter((r: any) => r.parent_id);
            const decompositionRatio = nested.length / Math.max(topLevel.length, 1);

            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "observation",
              content: `**Requirements corpus**: ${reqs.length} total items (${topLevel.length} top-level, ${nested.length} decomposed). ${decompositionRatio > 3 ? "Well-decomposed requirements indicate mature planning." : decompositionRatio > 1 ? "Moderate decomposition suggests ongoing refinement." : "Flat structure may indicate high-level scope."}`,
              data: { count: reqs.length, topLevel: topLevel.length, nested: nested.length, decompositionRatio },
            }));

            // Analyze completeness - how many have descriptions
            const withContent = reqs.filter((r: any) => r.content && r.content.length > 20).length;
            const completeness = (withContent / reqs.length * 100).toFixed(0);
            
            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "analysis",
              content: `**Requirement completeness**: ${completeness}% have detailed descriptions (${withContent}/${reqs.length}). ${parseInt(completeness) > 70 ? "Requirements are well-documented." : parseInt(completeness) > 40 ? "Requirements have moderate detail." : "Requirements need more elaboration."}`,
              data: { withContent, completeness: parseInt(completeness) },
            }));

            // Priority analysis
            const byPriority: Record<string, any[]> = {};
            reqs.forEach((r: any) => {
              const priority = r.priority || 'unset';
              if (!byPriority[priority]) byPriority[priority] = [];
              byPriority[priority].push(r);
            });

            const priorityBreakdown = Object.entries(byPriority).map(([p, items]) => `${p}: ${items.length}`).join(', ');
            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "analysis",
              content: `**Priority distribution**: ${priorityBreakdown}. ${byPriority['high']?.length > 0 ? `${byPriority['high'].length} high-priority items define the MVP scope.` : 'No explicit priority set - consider prioritization.'}`,
              data: { byPriority: Object.fromEntries(Object.entries(byPriority).map(([k, v]) => [k, v.length])) },
            }));

            // Extract key requirements with FULL content for narrative
            const keyReqs = topLevel.slice(0, 8);
            for (const req of keyReqs.slice(0, 5)) {
              entries.push(await addToBlackboard({
                source: "read_requirements",
                category: "insight",
                content: `**${req.code || 'REQ'}**: ${req.title}${req.content ? ` - ${req.content.slice(0, 300)}` : ''}`,
                data: { requirementId: req.id, code: req.code, title: req.title, priority: req.priority },
              }));
            }

            // Narrative summary
            entries.push(await addToBlackboard({
              source: "read_requirements",
              category: "narrative",
              content: `**Key requirements for slides**: ${keyReqs.map((r: any) => `${r.code || 'REQ'}: ${r.title}`).join("; ")}. These form the core value proposition and should be highlighted in requirements slides.`,
              data: { keyRequirements: keyReqs.map((r: any) => ({ code: r.code, title: r.title })) },
            }));

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

        // Tool: Read Canvas with ENHANCED architecture analysis
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

            if (nodeList.length === 0) {
              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "observation",
                content: "No architecture defined yet. This is an early-stage project - architecture slides should focus on vision and planned structure rather than current implementation.",
                data: { nodes: 0, edges: 0 },
              }));
              return { tool: "read_canvas", success: true, data: collectedData.canvas, blackboardEntries: entries };
            }

            // Group nodes by type with descriptions
            const nodesByType: Record<string, {label: string, description: string}[]> = {};
            nodeList.forEach((n: any) => {
              const type = n.type || 'component';
              if (!nodesByType[type]) nodesByType[type] = [];
              nodesByType[type].push({
                label: n.data?.label || n.data?.title || 'Unnamed',
                description: n.data?.description || ''
              });
            });

            // Determine architecture style
            const archTypes = Object.keys(nodesByType);
            const hasDatabase = archTypes.some(t => t.includes('DATABASE') || t.includes('TABLE') || t.includes('SCHEMA'));
            const hasAPI = archTypes.some(t => t.includes('API') || t.includes('SERVICE') || t.includes('CONTROLLER'));
            const hasFrontend = archTypes.some(t => t.includes('PAGE') || t.includes('COMPONENT') || t.includes('WEB'));
            const hasExternal = archTypes.some(t => t.includes('EXTERNAL'));
            
            let archStyle = "custom architecture";
            if (hasDatabase && hasAPI && hasFrontend) {
              archStyle = "full-stack architecture with frontend, API layer, and database";
            } else if (hasAPI && hasDatabase) {
              archStyle = "backend-focused architecture with API and data layers";
            } else if (hasFrontend && hasAPI) {
              archStyle = "client-server architecture with frontend and API integration";
            } else if (hasFrontend) {
              archStyle = "frontend-focused architecture";
            }
            if (hasExternal) archStyle += " with external service integrations";

            entries.push(await addToBlackboard({
              source: "read_canvas",
              category: "observation",
              content: `System employs a **${archStyle}**. ${nodeList.length} components organized into ${archTypes.length} categories: ${archTypes.slice(0, 6).join(', ')}${archTypes.length > 6 ? ` (+${archTypes.length - 6} more)` : ''}.`,
              data: { nodeCount: nodeList.length, edgeCount: edgeList.length, types: archTypes, archStyle },
            }));

            // Detailed component analysis by category - top 4 categories
            for (const [type, components] of Object.entries(nodesByType).slice(0, 4)) {
              const compNames = components.slice(0, 4).map(c => c.label).join(', ');
              const compDescs = components.filter(c => c.description).slice(0, 2);
              
              let insight = `**${type}** layer (${components.length}): ${compNames}${components.length > 4 ? ` (+${components.length - 4} more)` : ''}.`;
              if (compDescs.length > 0) {
                insight += ` Key functionality: ${compDescs[0].description.slice(0, 200)}`;
              }
              
              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "insight",
                content: insight,
                data: { type, count: components.length, components: components.slice(0, 6) },
              }));
            }

            // Connectivity and coupling analysis
            const connectivity = edgeList.length / Math.max(nodeList.length, 1);
            let couplingAnalysis = "";
            if (connectivity > 2.5) {
              couplingAnalysis = "**Highly interconnected** - suggests tightly integrated system or rich domain model. Emphasize system coherence and integration benefits.";
            } else if (connectivity > 1.2) {
              couplingAnalysis = "**Moderate coupling** - balanced trade-offs between integration and modularity. Architecture appears maintainable and well-structured.";
            } else if (connectivity > 0.5) {
              couplingAnalysis = "**Loosely coupled** - microservices or modular design pattern. Emphasize scalability and independent deployment capabilities.";
            } else {
              couplingAnalysis = "**Very loose coupling** - may indicate early architecture or intentionally decoupled components. Focus on integration strategy.";
            }

            entries.push(await addToBlackboard({
              source: "read_canvas",
              category: "analysis",
              content: `Connectivity: ${connectivity.toFixed(1)} connections per component. ${couplingAnalysis}`,
              data: { connectivity },
            }));

            // Identify key integration hubs (high connectivity nodes)
            const nodeConnectivity: {node: any, connections: number}[] = nodeList.map((n: any) => {
              const incoming = edgeList.filter((e: any) => e.target_id === n.id || e.target === n.id).length;
              const outgoing = edgeList.filter((e: any) => e.source_id === n.id || e.source === n.id).length;
              return { node: n, connections: incoming + outgoing };
            }).sort((a: {node: any, connections: number}, b: {node: any, connections: number}) => b.connections - a.connections);

            const hubs = nodeConnectivity.filter(nc => nc.connections >= 3).slice(0, 4);
            if (hubs.length > 0) {
              entries.push(await addToBlackboard({
                source: "read_canvas",
                category: "narrative",
                content: `**Core integration hubs**: ${hubs.map(h => `${h.node.data?.label || h.node.type} (${h.connections} connections)`).join(', ')}. These components are central to the system and should be featured prominently in architecture slides.`,
                data: { hubs: hubs.map(h => ({ id: h.node.id, label: h.node.data?.label, connections: h.connections })) },
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
              modelConfig
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

            // Use data-aware fallback slide from spec
            const fallbackSlide = createFallbackSlideFromSpec(spec, collectedData);
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
                // Add to content array for image region
                const imageLayouts: Record<string, string> = {
                  "image-left": "image",
                  "image-right": "image",
                  "image-full": "image",
                  "architecture": "diagram",
                  "title-cover": "background",
                };

                const imageRegion = imageLayouts[slide.layoutId];
                
                // Use immutable update to ensure changes persist
                const updatedContent = [...(slidesJson[slideIndex].content || [])];
                
                if (imageRegion) {
                  const hasImageContent = updatedContent.some(
                    (c: any) => c.regionId === imageRegion && c.type === "image"
                  );

                  if (!hasImageContent) {
                    updatedContent.push({
                      regionId: imageRegion,
                      type: "image",
                      data: { url: imageUrl, alt: slide.imagePrompt }
                    });
                  }
                }
                
                // Create new slide object with all updates
                slidesJson[slideIndex] = {
                  ...slidesJson[slideIndex],
                  imageUrl: imageUrl,
                  content: updatedContent,
                };
                
                // Stream the updated slide
                controller.enqueue(encoder.encode(sseMessage("slide", slidesJson[slideIndex])));
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
          model: selectedModel,
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
          model: selectedModel,
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
