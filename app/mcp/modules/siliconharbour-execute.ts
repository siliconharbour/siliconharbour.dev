/**
 * Builds the JS string for the authenticated 'siliconharbour' virtual module.
 * Superset of the read module — adds sync actions and pending review data.
 * All data (including sync results) is pre-fetched on the host and baked in.
 */

import type { ReadData } from "./siliconharbour-read.js";

export interface ExecuteData extends ReadData {
  eventImportSources: unknown[];
  jobImportSources: unknown[];
  pendingEvents: unknown[];
  pendingJobs: unknown[];
  // Sync results are populated lazily — the execute module exposes sync functions
  // that call back to the host via __syncFn__ injected by the sandbox
  _syncEnabled: true;
}

export function buildExecuteModuleJs(data: ExecuteData): string {
  const d = JSON.stringify(data);
  return `
const _data = ${d};

export async function events(_opts) { return _data.events; }
export async function jobs(_opts) { return _data.jobs; }
export async function companies(_opts) { return _data.companies; }
export async function groups(_opts) { return _data.groups; }
export async function people(_opts) { return _data.people; }
export async function technologies(_opts) { return _data.technologies; }
export async function education(_opts) { return _data.education; }
export async function eventImportSources() { return _data.eventImportSources; }
export async function jobImportSources() { return _data.jobImportSources; }
export async function pendingEvents() { return _data.pendingEvents; }
export async function pendingJobs() { return _data.pendingJobs; }

// Sync functions: results are returned from globalThis.__syncResults__ 
// which the host pre-populates when the user's code is inspected for sync calls.
// For a simpler model: sync functions just return a "not available in sandbox" message,
// and the host tool handler detects sync function calls and runs them directly.
// See execute tool handler in app/mcp/server.ts for the actual sync logic.
export async function syncEventSource(sourceId) {
  const results = globalThis.__syncResults__ || {};
  return results['syncEventSource:' + sourceId] || { error: 'Sync not pre-executed' };
}
export async function syncAllEventSources() {
  const results = globalThis.__syncResults__ || {};
  return results['syncAllEventSources'] || { error: 'Sync not pre-executed' };
}
export async function syncJobSource(sourceId) {
  const results = globalThis.__syncResults__ || {};
  return results['syncJobSource:' + sourceId] || { error: 'Sync not pre-executed' };
}
export async function syncAllJobSources() {
  const results = globalThis.__syncResults__ || {};
  return results['syncAllJobSources'] || { error: 'Sync not pre-executed' };
}
`;
}
