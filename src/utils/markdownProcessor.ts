import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";

// Interface for parsed markdown structure
interface MarkdownElement {
  type: 'heading' | 'paragraph' | 'list' | 'bold' | 'italic' | 'code' | 'text' | 'table';
  level?: number; // For headings (1-6)
  content: string;
  children?: MarkdownElement[];
  rows?: string[][]; // For tables
  headers?: string[]; // For table headers
}

// Enhanced markdown parser that handles nested structures
export class MarkdownProcessor {
  private fontFamily = "Calibri";
  
  private parseMarkdown(markdown: string): MarkdownElement[] {
    const lines = markdown.split('\n');
    const elements: MarkdownElement[] = [];
    let currentListItems: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Handle empty lines
      if (trimmedLine === '') {
        if (currentListItems.length > 0) {
          elements.push({
            type: 'list',
            content: '',
            children: currentListItems.map(item => ({
              type: 'text',
              content: item
            }))
          });
          currentListItems = [];
        }
        elements.push({ type: 'paragraph', content: '' });
        continue;
      }
      
      // Handle headings
      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        if (currentListItems.length > 0) {
          elements.push({
            type: 'list',
            content: '',
            children: currentListItems.map(item => ({
              type: 'text',
              content: item
            }))
          });
          currentListItems = [];
        }
        elements.push({
          type: 'heading',
          level: headingMatch[1].length,
          content: headingMatch[2]
        });
        continue;
      }
      
      // Handle list items
      const listMatch = trimmedLine.match(/^[-*+]\s+(.*)$/);
      if (listMatch) {
        currentListItems.push(listMatch[1]);
        continue;
      }
      
      // Handle numbered lists
      const numberedListMatch = trimmedLine.match(/^\d+\.\s+(.*)$/);
      if (numberedListMatch) {
        currentListItems.push(numberedListMatch[1]);
        continue;
      }
      
      // Handle tables
      if (trimmedLine.includes('|') && trimmedLine.length > 3) {
        const isTableSeparator = /^\|?[\s\-\|:]+\|?$/.test(trimmedLine);
        const isTableRow = trimmedLine.startsWith('|') || trimmedLine.endsWith('|') || trimmedLine.split('|').length > 2;
        
        if (isTableRow && !isTableSeparator) {
          const tableRows: string[] = [trimmedLine];
          let j = i + 1;
          let foundSeparator = false;
          
          if (j < lines.length) {
            const nextLine = lines[j].trim();
            if (/^\|?[\s\-\|:]+\|?$/.test(nextLine)) {
              foundSeparator = true;
              j++;
              
              while (j < lines.length) {
                const rowLine = lines[j].trim();
                if (rowLine.includes('|') && rowLine.length > 3 && !rowLine.match(/^#{1,6}\s/)) {
                  tableRows.push(rowLine);
                  j++;
                } else {
                  break;
                }
              }
              
              if (tableRows.length >= 2) {
                const headers = tableRows[0].split('|').map(h => h.trim()).filter(h => h);
                const rows = tableRows.slice(1).map(row => 
                  row.split('|').map(cell => cell.trim()).filter(cell => cell)
                );
                
                if (currentListItems.length > 0) {
                  elements.push({
                    type: 'list',
                    content: '',
                    children: currentListItems.map(item => ({
                      type: 'text',
                      content: item
                    }))
                  });
                  currentListItems = [];
                }
                
                elements.push({
                  type: 'table',
                  content: '',
                  headers,
                  rows
                });
                
                i = j - 1;
                continue;
              }
            }
          }
        }
      }
      
      // If we have accumulated list items and this isn't a list item, output the list
      if (currentListItems.length > 0) {
        elements.push({
          type: 'list',
          content: '',
          children: currentListItems.map(item => ({
            type: 'text',
            content: item
          }))
        });
        currentListItems = [];
      }
      
      // Handle regular paragraphs with inline formatting
      if (trimmedLine) {
        elements.push({
          type: 'paragraph',
          content: trimmedLine
        });
      }
    }
    
    // Don't forget any remaining list items
    if (currentListItems.length > 0) {
      elements.push({
        type: 'list',
        content: '',
        children: currentListItems.map(item => ({
          type: 'text',
          content: item
        }))
      });
    }
    
    return elements;
  }
  
  // Parse inline formatting within text
  private parseInlineFormatting(text: string): TextRun[] {
    const textRuns: TextRun[] = [];
    let currentIndex = 0;
    
    // Regex to match bold (**text**), italic (*text*), and code (`text`)
    const formatRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    let match;
    
    while ((match = formatRegex.exec(text)) !== null) {
      // Add any text before the match
      if (match.index > currentIndex) {
        const beforeText = text.slice(currentIndex, match.index);
        if (beforeText) {
          textRuns.push(new TextRun({
            text: beforeText,
            font: this.fontFamily,
            size: 22
          }));
        }
      }
      
      // Add the formatted text
      if (match[2]) { // Bold text
        textRuns.push(new TextRun({
          text: match[2],
          bold: true,
          font: this.fontFamily,
          size: 22
        }));
      } else if (match[3]) { // Italic text
        textRuns.push(new TextRun({
          text: match[3],
          italics: true,
          font: this.fontFamily,
          size: 22
        }));
      } else if (match[4]) { // Code text
        textRuns.push(new TextRun({
          text: match[4],
          font: "Courier New",
          size: 20
        }));
      }
      
      currentIndex = match.index + match[0].length;
    }
    
    // Add any remaining text
    if (currentIndex < text.length) {
      const remainingText = text.slice(currentIndex);
      if (remainingText) {
        textRuns.push(new TextRun({
          text: remainingText,
          font: this.fontFamily,
          size: 22
        }));
      }
    }
    
    // If no formatting was found, return the original text
    if (textRuns.length === 0) {
      textRuns.push(new TextRun({
        text: text,
        font: this.fontFamily,
        size: 22
      }));
    }
    
    return textRuns;
  }
  
  // Generate Word document with proper markdown rendering
  async generateWordDocument(title: string, sections: Array<{ title: string; value: string }>): Promise<Blob> {
    const children: (Paragraph | Table)[] = [];
    
    // Add main title
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            bold: true,
            font: this.fontFamily,
            size: 36,
          }),
        ],
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
        alignment: AlignmentType.CENTER,
      })
    );
    
    sections.forEach((section) => {
      if (section.value.trim()) {
        // Add section title
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.title,
                bold: true,
                font: this.fontFamily,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
        
        // Parse and process markdown content
        const elements = this.parseMarkdown(section.value);
        
        elements.forEach((element) => {
          switch (element.type) {
            case 'heading':
              const headingLevel = element.level === 1 ? HeadingLevel.HEADING_2 :
                                  element.level === 2 ? HeadingLevel.HEADING_3 :
                                  element.level === 3 ? HeadingLevel.HEADING_4 :
                                  element.level === 4 ? HeadingLevel.HEADING_5 :
                                  HeadingLevel.HEADING_6;
              
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: element.content,
                      bold: true,
                      font: this.fontFamily,
                      size: Math.max(18, 28 - element.level! * 2),
                    }),
                  ],
                  heading: headingLevel,
                  spacing: { before: 200, after: 100 },
                })
              );
              break;
              
            case 'list':
              element.children?.forEach((listItem) => {
                children.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: "• ", font: this.fontFamily, size: 22 }),
                      ...this.parseInlineFormatting(listItem.content)
                    ],
                    spacing: { after: 100 },
                    indent: { left: 720 },
                  })
                );
              });
              break;
              
            case 'table':
              if (element.headers && element.rows) {
                const tableRows: TableRow[] = [];
                
                // Add header row
                tableRows.push(
                  new TableRow({
                    children: element.headers.map(header => 
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: header,
                                bold: true,
                                font: this.fontFamily,
                                size: 22
                              })
                            ]
                          })
                        ],
                        width: { size: 100 / element.headers!.length, type: WidthType.PERCENTAGE }
                      })
                    )
                  })
                );
                
                // Add data rows
                element.rows.forEach(row => {
                  tableRows.push(
                    new TableRow({
                      children: row.map(cell => 
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: this.parseInlineFormatting(cell)
                            })
                          ],
                          width: { size: 100 / element.headers!.length, type: WidthType.PERCENTAGE }
                        })
                      )
                    })
                  );
                });
                
                children.push(
                  new Table({
                    rows: tableRows,
                    width: { size: 100, type: WidthType.PERCENTAGE }
                  })
                );
                
                // Add spacing after table
                children.push(
                  new Paragraph({
                    children: [new TextRun({ text: "" })],
                    spacing: { after: 200 },
                  })
                );
              }
              break;
              
            case 'paragraph':
              if (element.content.trim()) {
                children.push(
                  new Paragraph({
                    children: this.parseInlineFormatting(element.content),
                    spacing: { after: 200 },
                  })
                );
              } else {
                children.push(
                  new Paragraph({
                    children: [new TextRun({ text: "" })],
                    spacing: { after: 100 },
                  })
                );
              }
              break;
          }
        });
      }
    });
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });
    
    return await Packer.toBlob(doc);
  }
}
