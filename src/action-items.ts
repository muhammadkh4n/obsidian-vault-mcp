/**
 * Action-item parser — extracts TODOs, checkboxes, and tagged items from markdown.
 */

export interface ActionItem {
  text: string;
  done: boolean;
  line: number;
}

export function parseActionItems(content: string): ActionItem[] {
  const lines = content.split('\n');
  const items: ActionItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const checkboxMatch = line.match(/^[\s]*[-*]\s+\[([ xX])\]\s+(.+)/);
    if (checkboxMatch) {
      items.push({
        text: checkboxMatch[2].trim(),
        done: checkboxMatch[1] !== ' ',
        line: i + 1,
      });
      continue;
    }

    const todoMatch = line.match(/(?:TODO|TODO:|TODO\s*[-–])\s+(.+)/i);
    if (todoMatch) {
      items.push({ text: todoMatch[1].trim(), done: false, line: i + 1 });
      continue;
    }

    const actionMatch = line.match(/(?:ACTION|ACTION:|ACTION\s*[-–])\s+(.+)/i);
    if (actionMatch) {
      items.push({ text: actionMatch[1].trim(), done: false, line: i + 1 });
      continue;
    }

    if (line.includes('#action-item')) {
      const text = line.replace(/#action-item/g, '').trim().replace(/^[-*]\s+/, '');
      if (text) {
        items.push({ text, done: false, line: i + 1 });
      }
    }
  }

  return items;
}
