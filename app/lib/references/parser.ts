// Matches both simple [[Target]] and relation [[{Relation} at|of {Target}]] syntax
const REFERENCE_REGEX = /\[\[([^\]]+)\]\]/g;
// Matches the relation syntax: {Relation} at|of {Target}
const RELATION_REGEX = /^\{([^}]+)\}\s+(at|of)\s+\{([^}]+)\}$/i;

export interface ParsedReference {
  text: string;
  relation?: string;
  fullMatch: string;
  index: number;
}

export function parseReferences(content: string): ParsedReference[] {
  const refs: ParsedReference[] = [];
  let match;

  while ((match = REFERENCE_REGEX.exec(content)) !== null) {
    const inner = match[1].trim();
    const relationMatch = RELATION_REGEX.exec(inner);

    if (relationMatch) {
      refs.push({
        text: relationMatch[3].trim(),
        relation: relationMatch[1].trim(),
        fullMatch: match[0],
        index: match.index,
      });
      continue;
    }

    refs.push({
      text: inner,
      fullMatch: match[0],
      index: match.index,
    });
  }

  return refs;
}
