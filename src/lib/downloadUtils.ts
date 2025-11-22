import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export interface DownloadOptions {
  includeSettings: boolean;
  includeRequirements: boolean;
  includeStandards: boolean;
  includeCanvas: boolean;
  includeGeneratedSpec: boolean;
}

export async function fetchProjectData(projectId: string, shareToken: string | null) {
  // CRITICAL: All project data must use token-based RPC functions
  if (!shareToken) {
    throw new Error("Share token is required for project data access");
  }

  // Fetch project via RPC
  const { data: project } = await supabase.rpc('get_project_with_token', {
    p_project_id: projectId,
    p_token: shareToken
  });

  // Fetch requirements via RPC
  const { data: requirements } = await supabase.rpc('get_requirements_with_token', {
    p_project_id: projectId,
    p_token: shareToken
  });

  // Fetch canvas nodes via RPC
  const { data: canvasNodes } = await supabase.rpc('get_canvas_nodes_with_token', {
    p_project_id: projectId,
    p_token: shareToken
  });

  // Fetch canvas edges via RPC
  const { data: canvasEdges } = await supabase.rpc('get_canvas_edges_with_token', {
    p_project_id: projectId,
    p_token: shareToken
  });

  // Fetch project standards via RPC
  const { data: projectStandardsRaw } = await supabase.rpc('get_project_standards_with_token', {
    p_project_id: projectId,
    p_token: shareToken
  });

  // Enrich with standard details (standards table is not project-scoped)
  const projectStandards = await Promise.all(
    (projectStandardsRaw || []).map(async (ps: any) => {
      const { data: standard } = await supabase
        .from('standards')
        .select('id, code, title, description, content')
        .eq('id', ps.standard_id)
        .single();
      return { ...ps, standards: standard };
    })
  );

  // Fetch project tech stacks via RPC
  const { data: projectTechStacksRaw } = await supabase.rpc('get_project_tech_stacks_with_token', {
    p_project_id: projectId,
    p_token: shareToken
  });

  // Enrich with tech stack details (tech_stacks table is not project-scoped)
  const projectTechStacks = await Promise.all(
    (projectTechStacksRaw || []).map(async (pts: any) => {
      const { data: techStack } = await supabase
        .from('tech_stacks')
        .select('id, name, description, metadata')
        .eq('id', pts.tech_stack_id)
        .single();
      return { tech_stack_id: pts.tech_stack_id, tech_stacks: techStack };
    })
  );

  // Fetch saved specification
  let specification = null;
  if (shareToken) {
    const { data: spec } = await supabase.rpc('get_project_specification_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });
    specification = spec;
  }

  // Fetch requirement files from storage
  const requirementFiles: any[] = [];
  if (requirements) {
    for (const req of requirements) {
      const { data: files } = await supabase.storage
        .from('requirement-sources')
        .list(req.id);
      
      if (files && files.length > 0) {
        for (const file of files) {
          const { data: publicUrl } = supabase.storage
            .from('requirement-sources')
            .getPublicUrl(`${req.id}/${file.name}`);
          
          requirementFiles.push({
            requirementId: req.id,
            requirementCode: req.code,
            fileName: file.name,
            url: publicUrl.publicUrl
          });
        }
      }
    }
  }

  // Fetch standard attachments
  const standardAttachments: any[] = [];
  if (projectStandards) {
    for (const ps of projectStandards) {
      const standard = (ps as any).standards;
      if (standard) {
        const { data: attachments } = await supabase
          .from('standard_attachments')
          .select('*')
          .eq('standard_id', standard.id);
        
        if (attachments) {
          standardAttachments.push(...attachments.map(att => ({
            ...att,
            standardCode: standard.code,
            standardTitle: standard.title
          })));
        }
      }
    }
  }

  return {
    project,
    requirements,
    canvasNodes,
    canvasEdges,
    projectStandards,
    projectTechStacks,
    specification,
    requirementFiles,
    standardAttachments
  };
}

export function buildMarkdownDocument(data: any, options: DownloadOptions): string {
  let markdown = `# Project Specification: ${data.project?.name || 'Untitled'}\n\n`;
  
  if (options.includeSettings && data.project) {
    markdown += `## Project Details\n\n`;
    markdown += `- **Name**: ${data.project.name}\n`;
    markdown += `- **Description**: ${data.project.description || 'N/A'}\n`;
    markdown += `- **Organization**: ${data.project.organization || 'N/A'}\n`;
    markdown += `- **Budget**: ${data.project.budget || 'N/A'}\n`;
    markdown += `- **Scope**: ${data.project.scope || 'N/A'}\n`;
    markdown += `- **Priority**: ${data.project.priority || 'N/A'}\n`;
    markdown += `- **Timeline**: ${data.project.timeline_start || 'N/A'} to ${data.project.timeline_end || 'N/A'}\n`;
    markdown += `- **Status**: ${data.project.status || 'N/A'}\n\n`;
  }

  if (options.includeRequirements && data.requirements) {
    markdown += `## Requirements (${data.requirements.length})\n\n`;
    for (const req of data.requirements) {
      markdown += `### [${req.code}] ${req.title}\n`;
      markdown += `${req.content || 'No description'}\n\n`;
      
      const reqFiles = data.requirementFiles?.filter((f: any) => f.requirementId === req.id);
      if (reqFiles && reqFiles.length > 0) {
        markdown += `**Attachments:**\n`;
        for (const file of reqFiles) {
          markdown += `- [${file.fileName}](${file.url})\n`;
        }
        markdown += `\n`;
      }
    }
  }

  if (options.includeStandards && data.projectStandards) {
    markdown += `## Project Standards (${data.projectStandards.length})\n\n`;
    for (const ps of data.projectStandards) {
      const standard = (ps as any).standards;
      if (standard) {
        markdown += `### [${standard.code}] ${standard.title}\n`;
        markdown += `${standard.description || 'No description'}\n\n`;
        if (standard.content) {
          markdown += `${standard.content}\n\n`;
        }
        
        const attachments = data.standardAttachments?.filter((a: any) => a.standard_id === standard.id);
        if (attachments && attachments.length > 0) {
          markdown += `**Attachments:**\n`;
          for (const att of attachments) {
            markdown += `- [${att.name}](${att.url})\n`;
          }
          markdown += `\n`;
        }
      }
    }
  }

  if (options.includeCanvas && data.canvasNodes) {
    markdown += `## Architecture Canvas\n\n`;
    markdown += `- **Total Nodes**: ${data.canvasNodes.length}\n`;
    markdown += `- **Total Edges**: ${data.canvasEdges?.length || 0}\n\n`;
    markdown += `### Canvas Nodes\n\n`;
    for (const node of data.canvasNodes) {
      markdown += `- **${node.type}**: ${node.data?.label || 'Unlabeled'}\n`;
      if (node.data?.description) {
        markdown += `  - ${node.data.description}\n`;
      }
    }
    markdown += `\n`;
  }

  if (options.includeGeneratedSpec && data.specification) {
    markdown += `## AI Generated Specification\n\n`;
    markdown += data.specification.generated_spec;
    markdown += `\n\n`;
  }

  // Attachment sections
  if (data.requirementFiles && data.requirementFiles.length > 0) {
    markdown += `---\n\n## Requirement Attachments\n\n`;
    for (const file of data.requirementFiles) {
      markdown += `### ${file.requirementCode} - ${file.fileName}\n`;
      markdown += `URL: ${file.url}\n\n`;
    }
  }

  if (data.standardAttachments && data.standardAttachments.length > 0) {
    markdown += `---\n\n## Standard Attachments\n\n`;
    for (const att of data.standardAttachments) {
      markdown += `### [${att.standardCode}] ${att.name}\n`;
      markdown += `${att.description || 'No description'}\n`;
      markdown += `URL: ${att.url}\n\n`;
    }
  }

  return markdown;
}

export function buildIndividualJSONs(data: any, options: DownloadOptions) {
  const jsons: Record<string, any> = {};

  if (options.includeSettings && data.project) {
    jsons['project-details.json'] = {
      name: data.project.name,
      description: data.project.description,
      organization: data.project.organization,
      budget: data.project.budget,
      scope: data.project.scope,
      priority: data.project.priority,
      timeline_start: data.project.timeline_start,
      timeline_end: data.project.timeline_end,
      status: data.project.status,
      tags: data.project.tags
    };
  }

  if (options.includeRequirements && data.requirements) {
    jsons['requirements.json'] = data.requirements.map((req: any) => ({
      id: req.id,
      code: req.code,
      title: req.title,
      content: req.content,
      type: req.type,
      parent_id: req.parent_id,
      attachments: data.requirementFiles
        ?.filter((f: any) => f.requirementId === req.id)
        .map((f: any) => ({ fileName: f.fileName, url: f.url })) || []
    }));
  }

  if (options.includeStandards && data.projectStandards) {
    jsons['standards.json'] = data.projectStandards.map((ps: any) => {
      const standard = ps.standards;
      return {
        id: standard.id,
        code: standard.code,
        title: standard.title,
        description: standard.description,
        content: standard.content,
        attachments: data.standardAttachments
          ?.filter((a: any) => a.standard_id === standard.id)
          .map((a: any) => ({ name: a.name, url: a.url, description: a.description })) || []
      };
    });
  }

  if (options.includeCanvas) {
    jsons['canvas.json'] = {
      nodes: data.canvasNodes || [],
      edges: data.canvasEdges || []
    };
  }

  if (options.includeGeneratedSpec && data.specification) {
    jsons['generated-specification.json'] = {
      generated_at: data.specification.created_at,
      specification: data.specification.generated_spec
    };
  }

  return jsons;
}

export function buildComprehensiveJSON(data: any, options: DownloadOptions) {
  const comprehensive: any = {
    metadata: {
      exported_at: new Date().toISOString(),
      project_id: data.project?.id
    }
  };

  if (options.includeSettings && data.project) {
    comprehensive.project = {
      name: data.project.name,
      description: data.project.description,
      organization: data.project.organization,
      budget: data.project.budget,
      scope: data.project.scope,
      priority: data.project.priority,
      timeline_start: data.project.timeline_start,
      timeline_end: data.project.timeline_end,
      status: data.project.status,
      tags: data.project.tags
    };
  }

  if (options.includeRequirements && data.requirements) {
    comprehensive.requirements = data.requirements.map((req: any) => ({
      id: req.id,
      code: req.code,
      title: req.title,
      content: req.content,
      type: req.type,
      parent_id: req.parent_id,
      attachments: data.requirementFiles
        ?.filter((f: any) => f.requirementId === req.id)
        .map((f: any) => ({ fileName: f.fileName, url: f.url })) || []
    }));
  }

  if (options.includeStandards && data.projectStandards) {
    comprehensive.standards = data.projectStandards.map((ps: any) => {
      const standard = ps.standards;
      return {
        id: standard.id,
        code: standard.code,
        title: standard.title,
        description: standard.description,
        content: standard.content,
        attachments: data.standardAttachments
          ?.filter((a: any) => a.standard_id === standard.id)
          .map((a: any) => ({ name: a.name, url: a.url, description: a.description })) || []
      };
    });
  }

  if (options.includeCanvas) {
    comprehensive.canvas = {
      nodes: data.canvasNodes || [],
      edges: data.canvasEdges || [],
      statistics: {
        totalNodes: data.canvasNodes?.length || 0,
        totalEdges: data.canvasEdges?.length || 0
      }
    };
  }

  if (options.includeGeneratedSpec && data.specification) {
    comprehensive.generated_specification = {
      generated_at: data.specification.created_at,
      specification: data.specification.generated_spec
    };
  }

  return comprehensive;
}

export async function downloadAsZip(data: any, options: DownloadOptions, projectName: string, canvasPNG?: Blob) {
  const zip = new JSZip();

  if (options.includeSettings && data.project) {
    zip.file('project-details.json', JSON.stringify({
      name: data.project.name,
      description: data.project.description,
      organization: data.project.organization,
      budget: data.project.budget,
      scope: data.project.scope,
      priority: data.project.priority,
      timeline_start: data.project.timeline_start,
      timeline_end: data.project.timeline_end,
      status: data.project.status,
      tags: data.project.tags
    }, null, 2));
  }

  if (options.includeRequirements && data.requirements) {
    const reqFolder = zip.folder('requirements');
    if (reqFolder) {
      reqFolder.file('requirements.json', JSON.stringify(data.requirements, null, 2));
      
      // Add requirement attachments
      if (data.requirementFiles && data.requirementFiles.length > 0) {
        const attFolder = reqFolder.folder('attachments');
        if (attFolder) {
          for (const file of data.requirementFiles) {
            attFolder.file(`${file.requirementCode}_${file.fileName}.txt`, 
              `Requirement: ${file.requirementCode}\nFile: ${file.fileName}\nURL: ${file.url}`);
          }
        }
      }
    }
  }

  if (options.includeStandards && data.projectStandards) {
    const stdFolder = zip.folder('standards');
    if (stdFolder) {
      stdFolder.file('standards.json', JSON.stringify(data.projectStandards.map((ps: any) => ps.standards), null, 2));
      
      // Add standard attachments
      if (data.standardAttachments && data.standardAttachments.length > 0) {
        const attFolder = stdFolder.folder('attachments');
        if (attFolder) {
          for (const att of data.standardAttachments) {
            attFolder.file(`${att.standardCode}_${att.name}.txt`,
              `Standard: [${att.standardCode}] ${att.standardTitle}\nFile: ${att.name}\nDescription: ${att.description || 'N/A'}\nURL: ${att.url}`);
          }
        }
      }
    }
  }

  if (options.includeCanvas) {
    const canvasFolder = zip.folder('canvas');
    if (canvasFolder) {
      canvasFolder.file('canvas.json', JSON.stringify({
        nodes: data.canvasNodes || [],
        edges: data.canvasEdges || []
      }, null, 2));
      
      if (canvasPNG) {
        canvasFolder.file('canvas.png', canvasPNG);
      }
    }
  }

  if (options.includeGeneratedSpec && data.specification) {
    zip.file('generated-specification.md', data.specification.generated_spec);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}-specification.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAsMarkdown(markdown: string, projectName: string) {
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}-specification.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAsJSON(json: any, fileName: string) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}