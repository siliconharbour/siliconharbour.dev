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

function _slice(arr, opts) {
  const offset = (opts && opts.offset) || 0;
  const limit = (opts && opts.limit) || 20;
  return arr.slice(offset, offset + limit);
}

export async function events(opts) {
  return _slice(_data.events, opts);
}
export async function jobs(opts) {
  return _slice(_data.jobs, opts);
}
export async function companies(opts) {
  return _slice(_data.companies, opts);
}
export async function groups(opts) {
  return _slice(_data.groups, opts);
}
export async function people(opts) {
  return _slice(_data.people, opts);
}
export async function technologies(opts) {
  return _slice(_data.technologies, opts);
}
export async function education(opts) {
  return _slice(_data.education, opts);
}
`;
}
