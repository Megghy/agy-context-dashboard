// On-demand session audit (Issue #29 Phase 2): lazy File Activity,
// Command Executions, and Step/Context Browser backed by an idle auto-sweep
// fold cache so memory stays well under the 192 MiB RSS ceiling.
import { open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { compositionMetrics } from './composition.mjs';
import { contextMetrics, formatModelName, modelContextReference } from './context.mjs';
import { tokenCount } from './metrics.mjs';
import { estimateModelsCost } from './pricing.mjs';
import { TrajectoryJson } from './trajectory-json.mjs';
import { transcriptBrainRoot } from './transcript.mjs';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scalar = 'scalar', presence = 'presence';

const HOST_MODEL_PLACEHOLDERS = new Map([
  ['model_placeholder_m525', 'Gemini 4 Hydrogen (High)'],
  ['model_placeholder_m526', 'Gemini 4 Hydrogen (Medium)'],
  ['model_placeholder_m527', 'Gemini 4 Hydrogen (Low)'],
  ['model_placeholder_m528', 'Gemini 4 Hydrogen (XHigh)'],
  ['model_placeholder_m532', 'Gemini 4 Neon (High)'],
  ['model_placeholder_m533', 'Gemini 4 Neon (Medium)'],
  ['model_placeholder_m534', 'Gemini 4 Neon (Low)'],
  ['model_placeholder_m535', 'Gemini 4 Neon (XHigh)'],
  ['model_placeholder_m427', 'Gemini 4 Carbon (High)'],
  ['model_placeholder_m437', 'Gemini 4 Carbon (Medium)'],
  ['model_placeholder_m438', 'Gemini 4 Carbon (Low)'],
  ['model_placeholder_m417', 'Gemini 4 Argon (High)'],
  ['model_placeholder_m418', 'Gemini 4 Argon (Medium)'],
  ['model_placeholder_m419', 'Gemini 4 Argon (Low)'],
  ['model_placeholder_m537', 'Orchestrator (Neon)'],
  ['model_placeholder_m667', 'Orchestrator (Carbon)'],
  ['model_placeholder_m681', 'Orchestrator (Argon)'],
]);

export function resolveAuditModel(raw, runtimeAliases = null) {
  const cleaned = typeof raw === 'string' ? raw.replace(/^word\//i, '').trim() : '';
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const mapped = (runtimeAliases instanceof Map ? runtimeAliases.get(lower) : null) || HOST_MODEL_PLACEHOLDERS.get(lower) || null;
  return formatModelName(mapped || cleaned) || mapped || cleaned;
}

const cleanText = (value, max = 200) => typeof value === 'string'
  ? value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

const AUDIT_MODEL_USAGE = {
  inputTokens: scalar,
  outputTokens: scalar,
  responseOutputTokens: scalar,
  thinkingOutputTokens: scalar,
  cacheReadTokens: scalar,
  cacheWriteTokens: scalar,
};

const GENERATOR_AUDIT_PROJECTION = {
  generatorMetadata: {
    '*': {
      stepIndices: { '*': scalar },
      chatModel: {
        model: scalar,
        modelDisplayName: scalar,
        responseModel: scalar,
        usage: {
          apiProvider: scalar,
          responseId: scalar,
          messageId: scalar,
          model: scalar,
          inputTokens: scalar,
          cacheReadTokens: scalar,
          cacheWriteTokens: scalar,
        },
      },
    },
  },
};

export const AUDIT_STEPS_PROJECTION = {
  steps: {
    '*': {
      type: scalar,
      status: scalar,
      metadata: {
        createdAt: scalar,
        startedAt: scalar,
        completedAt: scalar,
        generatorModel: scalar,
        modelUsage: AUDIT_MODEL_USAGE,
        toolCall: { id: scalar, name: scalar },
      },
      viewFile: {
        absolutePathUri: scalar,
        numLines: scalar,
        isSkillFile: scalar,
        skillMetadata: { name: scalar },
      },
      runCommand: {
        commandLine: scalar,
        proposedCommandLine: scalar,
        cwd: scalar,
        exitCode: scalar,
        shellName: scalar,
      },
      codeAction: {
        actionSpec: { command: { file: scalar, isEdit: scalar } },
        actionResult: { edit: { absoluteUri: scalar } },
        diffStats: { additions: scalar, deletions: scalar },
      },
      generic: {
        args: {
          Path: scalar,
          AbsolutePath: scalar,
          TargetFile: scalar,
          DirectoryPath: scalar,
          SearchPath: scalar,
          File: scalar,
          CommandLine: scalar,
          cwd: scalar,
          Action: scalar,
        },
      },
      plannerResponse: {
        thinking: presence,
        response: presence,
        thinkingDuration: scalar,
        toolCalls: { '*': { id: scalar, name: scalar } },
      },
      userInput: { items: presence },
    },
  },
};

const TRANSCRIPT_AUDIT_PROJECTION = {
  step_index: scalar,
  type: scalar,
  status: scalar,
  created_at: scalar,
  model: scalar,
  input_tokens: scalar,
  cache_read_tokens: scalar,
  cache_write_tokens: scalar,
  output_tokens: scalar,
  content: 'textEstimate',
  thinking: 'textEstimate',
  tool_calls: {
    '*': {
      name: scalar,
      args: {
        Path: scalar,
        AbsolutePath: scalar,
        TargetFile: scalar,
        DirectoryPath: scalar,
        SearchPath: scalar,
        File: scalar,
        CommandLine: scalar,
        cwd: scalar,
        Action: scalar,
      },
    },
  },
};

/**
 * Bounded LRU cache with an unref'd idle sweep timer so lazy detail
 * projections automatically release memory after idleMs (default 20s).
 */
export function makeFoldCache({ maxEntries = 4, idleMs = 20_000, now = Date.now } = {}) {
  const limit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 4;
  const ttl = Number.isFinite(idleMs) && idleMs > 0 ? idleMs : 20_000;
  const entries = new Map();
  let timer = null;
  let lastActivityAt = 0;
  let disposed = false;

  const cancelTimer = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  const armTimer = () => {
    cancelTimer();
    if (disposed || !entries.size) return;
    timer = setTimeout(() => {
      timer = null;
      if (!disposed && entries.size && now() - lastActivityAt >= ttl) {
        entries.clear();
      } else if (!disposed && entries.size) {
        armTimer();
      }
    }, ttl);
    timer.unref?.();
  };

  return {
    get size() { return entries.size; },
    get(key, mark = undefined) {
      if (disposed) return undefined;
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (mark !== undefined && entry.mark !== mark) {
        entries.delete(key);
        if (!entries.size) cancelTimer();
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      lastActivityAt = now();
      armTimer();
      return entry.value;
    },
    set(key, value, mark = undefined) {
      if (disposed) return value;
      entries.delete(key);
      while (entries.size >= limit) entries.delete(entries.keys().next().value);
      lastActivityAt = now();
      entries.set(key, { value, mark, touchedAt: lastActivityAt });
      armTimer();
      return value;
    },
    delete(key) {
      const removed = entries.delete(key);
      if (!entries.size) cancelTimer();
      return removed;
    },
    sweepIfIdle() {
      if (entries.size && now() - lastActivityAt >= ttl) {
        entries.clear();
        cancelTimer();
        return true;
      }
      return false;
    },
    clear() {
      entries.clear();
      cancelTimer();
    },
    dispose() {
      disposed = true;
      entries.clear();
      cancelTimer();
    },
  };
}

function normalizeFilePath(raw) {
  let text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith('file://')) {
    text = text.slice(7);
    if (/^\/[A-Za-z]:/.test(text)) text = text.slice(1);
    try { text = decodeURIComponent(text); } catch {}
  }
  return cleanText(text, 300);
}

const OP_ORDER = ['edit', 'write', 'read', 'search'];

function classifyFileOperation(step, transcriptEntry = null) {
  const type = String(step?.type || '').replace(/^CORTEX_STEP_TYPE_/, '');
  const toolName = cleanText(step?.metadata?.toolCall?.name || transcriptEntry?.toolName || '', 64);
  const args = step?.generic?.args || transcriptEntry?.args || {};

  if (type === 'VIEW_FILE' || /^(?:read_file|view_file|view_file_outline|view_code_item)$/i.test(toolName)) {
    const path = normalizeFilePath(step?.viewFile?.absolutePathUri || args.Path || args.AbsolutePath || args.File);
    return path ? { path, op: 'read', additions: 0, deletions: 0 } : null;
  }
  if (type === 'CODE_ACTION' || /^(?:edit_file|write_file|replace_file_content|multi_replace_file_content|write_to_file)$/i.test(toolName)) {
    const path = normalizeFilePath(
      step?.codeAction?.actionResult?.edit?.absoluteUri ||
      step?.codeAction?.actionSpec?.command?.file ||
      args.Path || args.TargetFile || args.AbsolutePath,
    );
    if (!path) return null;
    const isWrite = /write/i.test(toolName) || step?.codeAction?.actionSpec?.command?.isEdit === false;
    return {
      path,
      op: isWrite ? 'write' : 'edit',
      additions: tokenCount(step?.codeAction?.diffStats?.additions) ?? 0,
      deletions: tokenCount(step?.codeAction?.diffStats?.deletions) ?? 0,
    };
  }
  if (/GREP|FIND|LIST|SEARCH/.test(type) || /^(?:grep_search|find_by_name|list_dir)$/i.test(toolName)) {
    const path = normalizeFilePath(args.SearchPath || args.DirectoryPath || args.Path || args.AbsolutePath);
    return path ? { path, op: 'search', additions: 0, deletions: 0 } : null;
  }
  return null;
}

function stepDurationMs(metadata) {
  const start = Date.parse(metadata?.startedAt || metadata?.createdAt || '');
  const end = Date.parse(metadata?.completedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round(end - start);
}

function buildGeneratorDeltaMap(generators, modelAliases = null) {
  const stepToDelta = new Map();
  const seen = new Set();
  let prevTotal = null;
  for (const [index, g] of (Array.isArray(generators) ? generators : []).entries()) {
    const usage = g?.chatModel?.usage;
    if (!usage || typeof usage !== 'object') continue;
    const input = tokenCount(usage.inputTokens);
    if (input === null) continue;
    const read = usage.cacheReadTokens === undefined ? 0 : tokenCount(usage.cacheReadTokens);
    const write = usage.cacheWriteTokens === undefined ? 0 : tokenCount(usage.cacheWriteTokens);
    if (read === null || write === null) continue;
    const id = usage.responseId ? `response:${usage.apiProvider || ''}:${usage.responseId}`
      : usage.messageId ? `message:${usage.messageId}` : `index:${index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const total = input + read + write;
    const delta = prevTotal === null ? total : total - prevTotal;
    prevTotal = total;
    const indices = Array.isArray(g.stepIndices) ? g.stepIndices.filter(n => Number.isInteger(n) && n >= 0) : [];
    if (indices.length) {
      const anchor = Math.min(...indices);
      stepToDelta.set(anchor, {
        delta,
        model: resolveAuditModel(g.chatModel?.modelDisplayName || g.chatModel?.responseModel || g.chatModel?.model || usage.model || '', modelAliases),
      });
    }
  }
  return stepToDelta;
}

function buildStepSummaryLabel(type, step, fileInfo, commandText) {
  const toolName = cleanText(step?.metadata?.toolCall?.name || '', 64);
  if (commandText) return `$ ${commandText.slice(0, 96)}`;
  if (fileInfo) return `${fileInfo.op}: ${basename(fileInfo.path) || fileInfo.path}`;
  if (type === 'PLANNER_RESPONSE') {
    const calls = (step?.plannerResponse?.toolCalls || []).map(c => cleanText(c?.name, 40)).filter(Boolean);
    if (calls.length) return `Tools: ${calls.slice(0, 3).join(', ')}${calls.length > 3 ? ` (+${calls.length - 3})` : ''}`;
    if (step?.plannerResponse?.response) return 'Assistant reply';
    if (step?.plannerResponse?.thinking) return 'Assistant thinking';
    return 'Planner response';
  }
  if (type === 'USER_INPUT') return 'User message';
  if (/COMPACTION/.test(type)) return 'Context compaction';
  if (/CHECKPOINT/.test(type)) return 'Checkpoint';
  if (toolName) return toolName;
  return type.toLowerCase().replace(/_/g, ' ');
}

export function createAuditAccumulator({ conversationId = null, generators = [], transcriptSteps = null, modelAliases = null } = {}) {
  const fileMap = new Map();
  const commands = [];
  const stepEntries = [];
  const counts = { user: 0, thinking: 0, tools: 0, answer: 0, compactions: 0 };
  const stepDeltaMap = buildGeneratorDeltaMap(generators, modelAliases);
  const maxSteps = 1000;
  const maxCommands = 500;
  let totalSteps = 0;
  let totalCommands = 0;

  const addStep = (step, i = totalSteps) => {
    totalSteps += 1;
    if (!step || typeof step !== 'object') return;
    const type = String(step.type || '').replace(/^CORTEX_STEP_TYPE_/, '') || 'UNKNOWN';
    const transcriptEntry = transcriptSteps?.get(i) || null;
    const fileInfo = classifyFileOperation(step, transcriptEntry);

    if (fileInfo) {
      let entry = fileMap.get(fileInfo.path);
      if (!entry) {
        entry = {
          path: fileInfo.path,
          name: basename(fileInfo.path) || fileInfo.path,
          ops: new Set(),
          reads: 0,
          edits: 0,
          writes: 0,
          searches: 0,
          additions: 0,
          deletions: 0,
          stepIndices: [],
          lastStepIndex: i,
        };
        fileMap.set(fileInfo.path, entry);
      }
      entry.ops.add(fileInfo.op);
      if (fileInfo.op === 'read') entry.reads++;
      else if (fileInfo.op === 'edit') entry.edits++;
      else if (fileInfo.op === 'write') entry.writes++;
      else if (fileInfo.op === 'search') entry.searches++;
      entry.additions += fileInfo.additions;
      entry.deletions += fileInfo.deletions;
      if (entry.stepIndices.length < 32) entry.stepIndices.push(i);
      entry.lastStepIndex = i;
    }

    const toolName = cleanText(step.metadata?.toolCall?.name || '', 64);
    let commandText = '';
    if (type === 'RUN_COMMAND' || toolName === 'run_command') {
      commandText = cleanText(step.runCommand?.commandLine || step.runCommand?.proposedCommandLine || step.generic?.args?.CommandLine || transcriptEntry?.args?.CommandLine || '', 240);
      if (commandText || step.runCommand) {
        totalCommands += 1;
        commands.push({
          stepIndex: i,
          command: commandText || '(command)',
          cwd: cleanText(step.runCommand?.cwd || step.generic?.args?.cwd || transcriptEntry?.args?.cwd || '', 180) || null,
          exitCode: Number.isInteger(step.runCommand?.exitCode) ? step.runCommand.exitCode : null,
          shell: cleanText(step.runCommand?.shellName || '', 32) || null,
          durationMs: stepDurationMs(step.metadata),
          status: cleanText(String(step.status || '').replace(/^CORTEX_STEP_STATUS_/, ''), 32) || null,
          createdAt: typeof step.metadata?.createdAt === 'string' ? step.metadata.createdAt : null,
        });
        if (commands.length >= maxCommands * 2) commands.splice(0, commands.length - maxCommands);
      }
    }

    const usage = step.metadata?.modelUsage;
    const inputTokens = tokenCount(usage?.inputTokens);
    const thinkingTokens = tokenCount(usage?.thinkingOutputTokens);
    const responseTokens = tokenCount(usage?.responseOutputTokens);
    const outputTokens = tokenCount(usage?.outputTokens);
    const cacheReadTokens = tokenCount(usage?.cacheReadTokens);

    const isUser = type === 'USER_INPUT';
    const isThinking = type === 'PLANNER_RESPONSE' && ((thinkingTokens ?? 0) > 0 || step.plannerResponse?.thinking === true || Boolean(step.plannerResponse?.thinkingDuration));
    const isAnswer = type === 'PLANNER_RESPONSE' && ((responseTokens ?? 0) > 0 || step.plannerResponse?.response === true);
    const isTools = ['RUN_COMMAND', 'VIEW_FILE', 'CODE_ACTION', 'GENERIC', 'MCP_TOOL', 'INVOKE_SUBAGENT', 'GREP_SEARCH', 'FIND_BY_NAME', 'LIST_DIR'].includes(type) ||
      Boolean(toolName) ||
      (type === 'PLANNER_RESPONSE' && Array.isArray(step.plannerResponse?.toolCalls) && step.plannerResponse.toolCalls.length > 0);
    const isCompaction = /COMPACTION|CHECKPOINT/.test(type);

    if (isUser) counts.user++;
    if (isThinking) counts.thinking++;
    if (isTools) counts.tools++;
    if (isAnswer) counts.answer++;
    if (isCompaction) counts.compactions++;

    const categories = [];
    if (isUser) categories.push('user');
    if (isThinking) categories.push('thinking');
    if (isTools) categories.push('tools');
    if (isAnswer) categories.push('answer');

    const reqInfo = stepDeltaMap.get(i);
    let contextDeltaTokens = null;
    let deltaEstimated = false;
    if (reqInfo) {
      contextDeltaTokens = reqInfo.delta;
    } else if (outputTokens !== null && outputTokens > 0) {
      contextDeltaTokens = outputTokens;
    } else if (transcriptEntry && transcriptEntry.tokens > 0) {
      contextDeltaTokens = transcriptEntry.tokens;
      deltaEstimated = true;
    }

    const toolNames = [];
    if (toolName) toolNames.push(toolName);
    for (const tc of step.plannerResponse?.toolCalls || []) {
      const name = cleanText(tc?.name, 48);
      if (name && !toolNames.includes(name)) toolNames.push(name);
    }

    stepEntries.push({
      index: i,
      type,
      categories,
      status: cleanText(String(step.status || '').replace(/^CORTEX_STEP_STATUS_/, ''), 32) || null,
      createdAt: typeof step.metadata?.createdAt === 'string' ? step.metadata.createdAt : null,
      model: resolveAuditModel(reqInfo?.model || step.metadata?.generatorModel || '', modelAliases),
      inputTokens,
      thinkingTokens,
      responseTokens,
      outputTokens,
      cacheReadTokens,
      contextDeltaTokens,
      deltaEstimated,
      toolNames: toolNames.slice(0, 8),
      label: buildStepSummaryLabel(type, step, fileInfo, commandText),
    });
    if (stepEntries.length >= maxSteps * 2) stepEntries.splice(0, stepEntries.length - maxSteps);
  };

  const finish = () => {
    const files = [...fileMap.values()]
      .map(item => ({
        ...item,
        ops: OP_ORDER.filter(op => item.ops.has(op)),
      }))
      .sort((a, b) => b.lastStepIndex - a.lastStepIndex)
      .slice(0, 500);

    const truncatedSteps = totalSteps > maxSteps;
    const boundedSteps = stepEntries.length > maxSteps ? stepEntries.slice(-maxSteps) : stepEntries;

    return {
      version: 1,
      conversationId: conversationId ? conversationId.toLowerCase() : null,
      totalSteps,
      totalFiles: fileMap.size,
      totalCommands,
      counts,
      truncated: truncatedSteps || fileMap.size > 500 || totalCommands > maxCommands,
      files,
      commands: commands.slice(-maxCommands).reverse(),
      steps: boundedSteps,
    };
  };

  return { addStep, finish };
}

/**
 * Build lazy File Activity, Command Executions, and Step/Context Browser
 * projections from streamed steps, generators, and optional transcript estimates.
 */
export function buildSessionAudit({ conversationId = null, steps = [], generators = [], transcriptSteps = null, modelAliases = null } = {}) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const acc = createAuditAccumulator({ conversationId, generators, transcriptSteps, modelAliases });
  for (let i = 0; i < safeSteps.length; i++) acc.addStep(safeSteps[i], i);
  return acc.finish();
}

export async function resolveTranscriptFile(root, conversationId) {
  if (!root || !GUID.test(conversationId || '')) return null;
  const id = conversationId.toLowerCase();
  let resolvedRoot;
  try { resolvedRoot = await realpath(root); } catch { return null; }

  for (const name of ['transcript.jsonl', 'transcript_full.jsonl']) {
    const candidate = join(root, id, '.system_generated', 'logs', name);
    try {
      const file = await realpath(candidate);
      const expected = join(resolvedRoot, id, '.system_generated', 'logs', name);
      const rel = relative(resolvedRoot, file);
      if (!rel || rel.startsWith('..') || isAbsolute(rel) || file !== expected) continue;
      const info = await stat(file);
      if (info.isFile()) return file;
    } catch {}
  }
  return null;
}

async function streamTranscriptJsonl(filePath, projection, onRecord) {
  const handle = await open(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(65536);
    const decoder = new StringDecoder('utf8');
    const lineParser = new TrajectoryJson({ projection, maxRetainedBytes: 32768 });
    let lineStarted = false;
    let badLine = false;
    const finishLine = () => {
      if (lineStarted && !badLine) {
        try { onRecord(lineParser.end()); } catch {}
      }
      lineParser.reset();
      lineStarted = false;
      badLine = false;
    };

    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, null);
      if (!bytesRead) break;
      const text = decoder.write(buf.subarray(0, bytesRead));
      let start = 0;
      for (let i = 0; i <= text.length; i++) {
        if (i !== text.length && text[i] !== '\n') continue;
        const part = text.slice(start, i);
        start = i + 1;
        if (part.trim().length || lineStarted) {
          lineStarted = true;
          if (!badLine) {
            try { lineParser.write(part); } catch { badLine = true; }
          }
        }
        if (i < text.length) finishLine();
      }
      await yieldLoop();
    }
    const tail = decoder.end();
    if (tail.trim().length) {
      lineStarted = true;
      if (!badLine) { try { lineParser.write(tail); } catch { badLine = true; } }
    }
    finishLine();
  } finally {
    await handle.close();
  }
}

/**
 * Stream local transcript.jsonl (fallback transcript_full.jsonl) for per-step
 * text token estimates and tool args without retaining message bodies.
 */
export async function readTranscriptStepEstimates(root, conversationId, { maxRows = 8192 } = {}) {
  const targetFile = await resolveTranscriptFile(root, conversationId);
  if (!targetFile) return null;
  const map = new Map();
  await streamTranscriptJsonl(targetFile, TRANSCRIPT_AUDIT_PROJECTION, obj => {
    if (Number.isSafeInteger(obj?.step_index) && obj.step_index >= 0 && map.size < maxRows) {
      const contentTokens = obj.content?.tokens || 0;
      const thinkingTokens = obj.thinking?.tokens || 0;
      const firstTool = Array.isArray(obj.tool_calls) ? obj.tool_calls[0] : null;
      map.set(obj.step_index, {
        tokens: contentTokens + thinkingTokens,
        toolName: cleanText(firstTool?.name || '', 64),
        args: firstTool?.args || null,
      });
    }
  });
  return map;
}

/**
 * Build a complete Session Audit fallback directly from local transcript*.jsonl
 * when a cold/archived conversation is absent from the running daemon.
 */
export async function buildAuditFromTranscript(root, conversationId, { modelAliases = null } = {}) {
  const targetFile = await resolveTranscriptFile(root, conversationId);
  if (!targetFile) return null;
  const id = conversationId.toLowerCase();
  const acc = createAuditAccumulator({ conversationId: id, modelAliases });
  let prevContext = null;
  let lastIdx = -1;

  await streamTranscriptJsonl(targetFile, TRANSCRIPT_AUDIT_PROJECTION, obj => {
    if (!obj || typeof obj !== 'object') return;
    const rawType = cleanText(String(obj.type || '').replace(/^CORTEX_STEP_TYPE_/, ''), 64) || 'UNKNOWN';
    const baseIdx = Number.isSafeInteger(obj.step_index) && obj.step_index >= 0 ? obj.step_index : (lastIdx + 1);
    const stepIdx = Math.max(baseIdx, lastIdx + 1);
    lastIdx = stepIdx;

    const inTok = tokenCount(obj.input_tokens);
    const readTok = tokenCount(obj.cache_read_tokens) ?? 0;
    const writeTok = tokenCount(obj.cache_write_tokens) ?? 0;
    const outTok = tokenCount(obj.output_tokens);
    const contentTok = obj.content?.tokens || 0;
    const thinkingTok = obj.thinking?.tokens || 0;
    const hasUsage = inTok !== null || readTok > 0 || outTok !== null;
    const ctxTotal = inTok !== null ? inTok + readTok + writeTok : null;
    if (ctxTotal !== null) prevContext = ctxTotal;

    const toolCalls = Array.isArray(obj.tool_calls) ? obj.tool_calls.filter(Boolean) : [];
    const createdAt = typeof obj.created_at === 'string' ? obj.created_at : null;
    const resolvedModel = resolveAuditModel(obj.model || '', modelAliases);

    acc.addStep({
      type: `CORTEX_STEP_TYPE_${rawType}`,
      status: obj.status ? `CORTEX_STEP_STATUS_${cleanText(obj.status, 32)}` : null,
      metadata: {
        createdAt,
        generatorModel: resolvedModel || obj.model || null,
        modelUsage: hasUsage ? {
          inputTokens: inTok ?? 0,
          cacheReadTokens: readTok,
          cacheWriteTokens: writeTok,
          outputTokens: outTok ?? 0,
          thinkingOutputTokens: thinkingTok > 0 ? thinkingTok : undefined,
          responseOutputTokens: contentTok > 0 ? contentTok : undefined,
        } : undefined,
      },
      plannerResponse: rawType === 'PLANNER_RESPONSE' ? {
        thinking: thinkingTok > 0,
        response: contentTok > 0,
        toolCalls: toolCalls.map(tc => ({ name: cleanText(tc.name || '', 48) })).filter(c => c.name),
      } : undefined,
    }, stepIdx);

    for (let j = 0; j < toolCalls.length; j++) {
      const tc = toolCalls[j];
      const name = cleanText(tc?.name || '', 64);
      if (!name) continue;
      const args = tc.args || {};
      const toolIdx = stepIdx + j + 1;
      lastIdx = Math.max(lastIdx, toolIdx);
      const isCmd = /^run_command$/i.test(name);
      acc.addStep({
        type: isCmd ? 'CORTEX_STEP_TYPE_RUN_COMMAND' : 'CORTEX_STEP_TYPE_GENERIC',
        status: 'CORTEX_STEP_STATUS_DONE',
        metadata: { createdAt, toolCall: { name } },
        generic: { args },
        runCommand: isCmd ? {
          commandLine: cleanText(args.CommandLine || '', 240),
          cwd: cleanText(args.cwd || '', 180) || null,
        } : undefined,
      }, toolIdx);
    }
  });

  const audit = acc.finish();
  return audit.totalSteps > 0 ? { ...audit, archivedFallback: 'transcript' } : null;
}

/**
 * Summarize a local transcript*.jsonl conversation into a single-session speed/context
 * snapshot for archived sessions absent from GetAllCascadeTrajectories.
 */
export async function summarizeTranscriptArchive(root, conversationId, { modelAliases = null } = {}) {
  const targetFile = await resolveTranscriptFile(root, conversationId);
  if (!targetFile) return null;
  const id = conversationId.toLowerCase();
  let steps = 0, rounds = 0, measuredRequests = 0, compactions = 0;
  const stepBreakdown = { user: 0, planner: 0, tool: 0, compaction: 0, other: 0 };
  let userTokens = 0, assistantTokens = 0, toolTokens = 0, systemTokens = 0;
  let uncached = 0, cacheRead = 0, cacheWrite = 0, output = 0;
  let lastContextTokens = 0, lastActiveAt = null;
  const modelMap = new Map();
  let primaryRawModel = null, maxModelReqs = -1;

  await streamTranscriptJsonl(targetFile, TRANSCRIPT_AUDIT_PROJECTION, obj => {
    if (!obj || typeof obj !== 'object') return;
    steps += 1;
    const rawType = cleanText(String(obj.type || '').replace(/^CORTEX_STEP_TYPE_/, ''), 64);
    const createdAt = typeof obj.created_at === 'string' ? obj.created_at : null;
    if (createdAt && Number.isFinite(Date.parse(createdAt))) {
      if (!lastActiveAt || Date.parse(createdAt) > Date.parse(lastActiveAt)) lastActiveAt = createdAt;
    }
    const contentTok = obj.content?.tokens || 0;
    const thinkingTok = obj.thinking?.tokens || 0;
    if (rawType === 'USER_INPUT') { rounds += 1; stepBreakdown.user += 1; userTokens += contentTok; }
    else if (rawType === 'PLANNER_RESPONSE') { stepBreakdown.planner += 1; assistantTokens += contentTok + thinkingTok; }
    else if (/COMPACTION|CHECKPOINT/.test(rawType)) { compactions += 1; stepBreakdown.compaction += 1; systemTokens += contentTok; }
    else if (rawType === 'SYSTEM_MESSAGE') { stepBreakdown.other += 1; systemTokens += contentTok; }
    else { stepBreakdown.tool += 1; toolTokens += contentTok; }

    const inTok = tokenCount(obj.input_tokens) ?? 0;
    const readTok = tokenCount(obj.cache_read_tokens) ?? 0;
    const writeTok = tokenCount(obj.cache_write_tokens) ?? 0;
    const outTok = tokenCount(obj.output_tokens) ?? 0;
    if (inTok || readTok || writeTok || outTok) {
      measuredRequests += 1;
      uncached += inTok;
      cacheRead += readTok;
      cacheWrite += writeTok;
      output += outTok;
      const ctx = inTok + readTok + writeTok;
      if (ctx > 0) lastContextTokens = ctx;
      const rawModel = cleanText(obj.model || '', 120);
      const display = resolveAuditModel(rawModel, modelAliases) || 'Unknown';
      const entry = modelMap.get(display) || { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0 };
      entry.uncached += inTok; entry.cacheRead += readTok; entry.cacheWrite += writeTok; entry.output += outTok;
      entry.requests += 1;
      modelMap.set(display, entry);
      if (entry.requests > maxModelReqs) { maxModelReqs = entry.requests; primaryRawModel = rawModel || display; }
    }
  });

  if (steps === 0) return null;
  const model = resolveAuditModel(primaryRawModel || '', modelAliases);
  const totalInput = uncached + cacheRead + cacheWrite;
  const totalTokens = totalInput + output;
  const ref = model ? modelContextReference(model) : null;
  const maxTokens = ref?.tokens ?? null;
  const context = lastContextTokens > 0
    ? (contextMetrics({ estimatedTokensUsed: lastContextTokens, maxContextTokens: maxTokens ?? 0 }, { model, sampledAt: lastActiveAt }) || {
      usedTokens: lastContextTokens,
      maxTokens: null,
      remainingTokens: null,
      usedFraction: null,
      remainingFraction: null,
      model,
    })
    : null;
  const transcriptStats = {
    status: 'ready',
    matchedSteps: steps,
    tokens: { user: userTokens, assistant: assistantTokens, tool: toolTokens, system: systemTokens },
    compactionMarkers: compactions,
  };
  const contextComposition = context && context.maxTokens ? compositionMetrics({ context, transcript: transcriptStats }) : null;
  const est = estimateModelsCost(Object.fromEntries(modelMap));

  return {
    source: 'Local archived transcript',
    archivedFallback: 'transcript',
    conversationId: id,
    status: 'CASCADE_RUN_STATUS_ARCHIVED',
    steps,
    rounds,
    stepBreakdown,
    requests: measuredRequests,
    measuredRequests,
    model,
    lastActiveAt,
    tps: null,
    latestTps: null,
    peakTps: null,
    ttftSeconds: null,
    modelSeconds: null,
    toolSeconds: null,
    counts: { responseOutput: output || null, thinkingOutput: null },
    tokens: {
      uncachedTokens: uncached,
      cachedTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      inputTokens: totalInput,
      outputTokens: output,
      totalTokens,
      measuredRequests,
      complete: true,
    },
    cache: {
      inputTokens: totalInput,
      cachedTokens: cacheRead,
      uncachedTokens: uncached,
      cacheWriteTokens: cacheWrite,
      outputTokens: output,
      totalTokens,
      hitRate: totalInput > 0 ? cacheRead / totalInput : null,
      measuredRequests,
      complete: true,
    },
    context,
    transcriptStats,
    contextComposition,
    ...(est.hasPriced ? { estimatedCost: est } : {}),
    complete: true,
  };
}

export class SessionAuditService {
  constructor(client, { transcriptRoot = transcriptBrainRoot(), maxEntries = 4, idleMs = 20_000, now = Date.now } = {}) {
    this.client = client;
    this.transcriptRoot = transcriptRoot;
    this.cache = makeFoldCache({ maxEntries, idleMs, now });
    this.pending = new Map();
  }

  async fetchAndFoldSteps(id, acc) {
    if (typeof this.client.streamTrajectoryPage === 'function') {
      let offset = 0;
      for (let page = 0; page < 256; page++) {
        let added = 0;
        await this.client.streamTrajectoryPage(
          'GetCascadeTrajectorySteps',
          { cascadeId: id, stepOffset: offset, trajectoryVerbosity: 3 },
          {
            projection: AUDIT_STEPS_PROJECTION,
            recordKeys: ['steps'],
            maxRetainedBytes: 4 * 1024 * 1024,
            onRecord: (_kind, _idx, step) => {
              acc.addStep(step, offset + added);
              added += 1;
            },
          },
        );
        if (added === 0) break;
        offset += added;
      }
      return offset;
    }
    if (typeof this.client.call === 'function') {
      const res = await this.client.call('GetCascadeTrajectorySteps', { cascadeId: id, stepOffset: 0, trajectoryVerbosity: 3 });
      const steps = Array.isArray(res?.steps) ? res.steps : [];
      for (let i = 0; i < steps.length; i++) acc.addStep(steps[i], i);
      return steps.length;
    }
    return 0;
  }

  async fetchAllGenerators(id) {
    if (typeof this.client.streamTrajectoryPage === 'function') {
      const generators = [];
      let offset = 0;
      for (let page = 0; page < 256; page++) {
        const before = generators.length;
        await this.client.streamTrajectoryPage(
          'GetCascadeTrajectoryGeneratorMetadata',
          { cascadeId: id, generatorMetadataOffset: offset, includeMessages: false },
          {
            projection: GENERATOR_AUDIT_PROJECTION,
            recordKeys: ['generatorMetadata'],
            maxRetainedBytes: 2 * 1024 * 1024,
            onRecord: (_kind, _idx, gen) => { generators.push(gen); },
          },
        );
        const added = generators.length - before;
        if (added === 0) break;
        offset += added;
      }
      return generators;
    }
    if (typeof this.client.call === 'function') {
      const res = await this.client.call('GetCascadeTrajectoryGeneratorMetadata', { cascadeId: id, generatorMetadataOffset: 0, includeMessages: false });
      return Array.isArray(res?.generatorMetadata) ? res.generatorMetadata : [];
    }
    return [];
  }

  async getAudit(conversationId, { force = false } = {}) {
    if (!GUID.test(conversationId || '')) throw new Error('会话标识无效');
    const id = conversationId.toLowerCase();
    let mark = null;
    if (typeof this.client.reader?.summary === 'function') {
      try {
        const s = await this.client.reader.summary(id, null, force, 2000);
        mark = JSON.stringify([s?.stepCount ?? null, s?.lastModifiedTime ?? null, s?.status ?? null]);
      } catch {}
    }
    if (!force && mark !== null) {
      const hit = this.cache.get(id, mark);
      if (hit) return hit;
    } else if (!force && mark === null) {
      const hit = this.cache.get(id);
      if (hit) return hit;
    }

    if (this.pending.has(id)) return this.pending.get(id);
    const run = (async () => {
      const modelAliases = this.client?.modelAliases || null;
      const [generators, transcriptSteps] = await Promise.all([
        this.fetchAllGenerators(id).catch(() => []),
        readTranscriptStepEstimates(this.transcriptRoot, id).catch(() => null),
      ]);
      const acc = createAuditAccumulator({ conversationId: id, generators, transcriptSteps, modelAliases });
      let result = null;
      let stepErr = null;
      try {
        await this.fetchAndFoldSteps(id, acc);
        result = acc.finish();
      } catch (err) {
        stepErr = err;
      }
      if (!result || result.totalSteps === 0) {
        const transcriptFallback = await buildAuditFromTranscript(this.transcriptRoot, id, { modelAliases }).catch(() => null);
        if (transcriptFallback) {
          result = transcriptFallback;
        } else if (stepErr && typeof this.client.trajectory === 'function') {
          const raw = await this.client.trajectory(id, { force });
          result = buildSessionAudit({
            conversationId: id,
            steps: raw?.trajectory?.steps || [],
            generators: generators.length ? generators : (raw?.trajectory?.generatorMetadata || []),
            transcriptSteps,
            modelAliases,
          });
        } else if (stepErr) {
          throw stepErr;
        } else {
          result ||= acc.finish();
        }
      }
      this.cache.set(id, result, mark ?? String(result.totalSteps));
      return result;
    })().finally(() => {
      if (this.pending.get(id) === run) this.pending.delete(id);
    });
    this.pending.set(id, run);
    return run;
  }

  dispose() {
    this.cache.dispose();
    this.pending.clear();
  }
}
