/**
 * Builds the JS string for the read-only 'siliconharbour' virtual module.
 *
 * Rather than async host callbacks (not supported in sync QuickJS), data is
 * pre-fetched on the host side and baked into the module as JSON literals.
 * Each function parses its data lazily to keep module init fast.
 *
 * The module is regenerated per sandbox invocation with fresh data.
 */

export interface ReadData {
  events: unknown[];
  jobs: unknown[];
  companies: unknown[];
  groups: unknown[];
  people: unknown[];
  technologies: unknown[];
  education: unknown[];
}

export function buildReadModuleJs(data: ReadData): string {
  const d = JSON.stringify(data);
  return `
const _data = ${d};

export async function events(_opts) {
  return _data.events;
}
export async function jobs(_opts) {
  return _data.jobs;
}
export async function companies(_opts) {
  return _data.companies;
}
export async function groups(_opts) {
  return _data.groups;
}
export async function people(_opts) {
  return _data.people;
}
export async function technologies(_opts) {
  return _data.technologies;
}
export async function education(_opts) {
  return _data.education;
}
`;
}
