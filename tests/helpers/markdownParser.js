/**
 * Parse markdown into Obsidian's listItems structure
 * Mimics what Obsidian's metadataCache.getFileCache() returns
 */
export function parseMarkdownToListItems(markdown) {
  const lines = markdown.trim().split('\n');
  const listItems = [];
  const stack = []; // Track parent hierarchy: [{ indent, line }, ...]

  lines.forEach((line, lineNum) => {
    // Detect list items: optional whitespace + bullet (-, *, +) + optional checkbox
    const match = line.match(/^(\s*)([-*+])\s+(\[[^\[\]]\])?\s*/);
    if (!match) return;

    const indentStr = match[1];
    const indent = indentStr.length;

    // Find parent by looking for nearest less-indented item
    let parent = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].indent < indent) {
        parent = stack[i].line;
        break;
      }
    }

    const item = {
      position: {
        start: { line: lineNum, col: 0 },
        end: { line: lineNum, col: line.length }
      },
      parent
    };

    listItems.push(item);

    // Update stack: remove items with same or greater indent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    stack.push({ indent, line: lineNum });
  });

  return listItems;
}

/**
 * Normalize markdown by trimming and ensuring consistent line endings
 */
export function normalizeMarkdown(markdown) {
  if (!markdown) return '';
  return markdown.trim();
}
