// Read only whitelisted Orchestrator model settings; never expose other config keys.
import { readFile } from 'node:fs/promises';
import { platformPaths } from './platform.mjs';
import { formatModelName } from '../sidecars/panel/context.mjs';

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const CONTROL_OR_BIDI_RE = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/;
const UNSAFE_TEXT_RE = /(?:^|[^a-z0-9])(?:https?:\/\/|file:\/\/|var\s*\(|url\s*\(|expression\s*\()|[\\;<>{}`"']|\.\.|^[/~]/i;
const SAFE_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9 ._()/:+-]{0,119}$/;

function sanitizeOrchestratorModel(value) {
  if (typeof value !== 'string' || CONTROL_OR_BIDI_RE.test(value)) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160 || GUID_RE.test(trimmed) || UNSAFE_TEXT_RE.test(trimmed)) return null;
  const formatted = formatModelName(trimmed);
  if (!formatted || formatted.length > 120) return null;
  if (GUID_RE.test(formatted) || UNSAFE_TEXT_RE.test(formatted) || !SAFE_MODEL_RE.test(formatted)) return null;
  return formatted;
}

export async function readHostOrchestrator({ file = platformPaths().pluginConfig, read = readFile } = {}) {
  const empty = { orchestratorModel: null, orchestratorExecutorModel: null };
  try {
    const text = await read(file, 'utf8');
    if (typeof text !== 'string' || text.length > 1048576 || Buffer.byteLength(text, 'utf8') > 1048576) return empty;
    const settings = JSON.parse(text.replace(/^\uFEFF/, ''))?.userSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return empty;
    return {
      orchestratorModel: sanitizeOrchestratorModel(settings.orchestratorModel),
      orchestratorExecutorModel: sanitizeOrchestratorModel(settings.orchestratorExecutorModel),
    };
  } catch {
    return empty;
  }
}
