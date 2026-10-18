import type { SatoriNode } from "satori";

export const OG_LOGO_ID = "preview-brand-logo";
export interface LogoBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface OGPreviewTemplate {
  svg: string;
  logo: LogoBounds;
}

export function logoBounds(node: SatoriNode): LogoBounds | undefined {
  if (node.props.id !== OG_LOGO_ID) return;
  return { left: node.left, top: node.top, width: node.width, height: node.height };
}
export function ogPreviewResponse(template: OGPreviewTemplate) {
  return Response.json(template, { headers: { "Cache-Control": "no-store" } });
}
