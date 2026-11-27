// Pure transforms. No credentials, prompts, or message text enter the public result.
import { contextMetrics, formatModelName, quotaPoolForModel } from './context.mjs';
import { estimateTextTokens } from './trajectory-json.mjs';
import { classifyRates, median, RATE_VERSION, RATE_REASONS } from './rate-quality.mjs';
const TOOL_STEP_RE=/SEARCH_WEB|BROWSE|RUN_COMMAND|COMMAND|READ|WRITE|EDIT|CODE_ACTION|TOOL|MCP|LIST|GREP|VIEW|FIND|TERMINAL/i;
const cleanToolName=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,80):'';
const isBuiltInPlannerModel=(rawModel,formattedModel)=>{
  const raw=String(rawModel||'').toLowerCase().replace(/^word\//,'');
  const fmt=String(formattedModel||'');
  return /^model_placeholder_m(?:537|667|681)$/.test(raw)||
    /^gemini-pro-orchestrator(?:-(?:neon|carbon|argon|g1-pro))?$/.test(raw)||
    /^Orchestrator \(.+\)$/.test(fmt);
};
const isBuiltInExecutorModel=(rawModel,formattedModel)=>{
  const raw=String(rawModel||'').toLowerCase().replace(/^word\//,'');
  const fmt=String(formattedModel||'');
  return raw==='model_placeholder_m669'||raw==='gemini-flash-worker-agy'||fmt==='Gemini 4 Hydrogen (Orchestrator)';
};
const isExitPlanModeStep=step=>{
  if(/EXIT_PLAN_MODE/.test(String(step?.type||'')))return true;
  if(String(step?.metadata?.toolCall?.name||'').trim()==='exit_plan_mode')return true;
  return Array.isArray(step?.plannerResponse?.toolCalls)&&step.plannerResponse.toolCalls.some(tc=>String(tc?.name||'').trim()==='exit_plan_mode');
};
const hasPlanReviewMarker=step=>{
  if(!/USER_INPUT|SYSTEM_MESSAGE/.test(String(step?.type||'')))return false;
  const fields=[step?.userInput?.text,step?.userInput?.userResponse,step?.systemMessage?.message,step?.systemMessage?.text,step?.content,step?.text,
    ...(Array.isArray(step?.userInput?.items)?step.userInput.items.map(item=>item?.text):[])];
  return fields.some(v=>typeof v==='string'&&/\[plan review\]/i.test(v));
};
const createOrchBucket=()=>({model:'',pool:'other',requests:0,inputTokens:0,cachedTokens:0,uncachedTokens:0,outputTokens:0,totalTokens:0});
const addToOrchBucket=(bucket,model,pool,reqUncached,reqRead,reqInput,reqOutput)=>{
  if(model&&model!=='Unknown'){bucket.model=model;bucket.pool=pool;}
  else if(!bucket.model){bucket.model=model||'Unknown';bucket.pool=pool;}
  bucket.requests++;
  bucket.inputTokens+=reqInput;
  bucket.cachedTokens+=reqRead;
  bucket.uncachedTokens+=reqUncached;
  bucket.outputTokens+=reqOutput;
  bucket.totalTokens+=reqInput+reqOutput;
};
const finalizeOrchBucket=bucket=>bucket&&bucket.requests>0?{...bucket,hitRate:bucket.inputTokens>0?bucket.cachedTokens/bucket.inputTokens:null}:null;
const normalizeToolSource=value=>{
  const raw=typeof value==='string'?value.toUpperCase():'';
  if(!raw)return '';
  if(raw.includes('CUSTOM')||raw.includes('MCP'))return 'mcp';
  if(raw.includes('PROVIDER'))return 'provider';
  if(raw.includes('BUILTIN'))return 'builtin';
  return raw.replace(/^CORTEX_COMPONENT_SOURCE_/,'').toLowerCase().slice(0,24);
};
export function seconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value)) {
    const n = Number(value.slice(0, -1));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    if (value.seconds === undefined && value.nanos === undefined) return null;
    const whole = Number(value.seconds ?? 0), nanos = Number(value.nanos ?? 0);
    if (!Number.isSafeInteger(whole) || whole < 0 || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null;
    const n = whole + nanos / 1e9;
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export function tokenCount(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function requestCacheMetrics(usage) {
  const input = tokenCount(usage.inputTokens);
  if ((usage.cacheReadTokens !== undefined && tokenCount(usage.cacheReadTokens) === null) ||
      (usage.cacheWriteTokens !== undefined && tokenCount(usage.cacheWriteTokens) === null)) return null;
  const read = tokenCount(usage.cacheReadTokens) ?? 0;
  const write = tokenCount(usage.cacheWriteTokens) ?? 0;
  const provider = String(usage.apiProvider || '');
  if (input === null) return null;
  // Antigravity ModelUsageStats normalizes inputTokens to uncached input,
  // including Gemini (verified against live records with cacheRead > input).
  // These are NOT upstream Gemini/OpenAI prompt_tokens. Add the separate
  // cache read/write counts exactly once for this local interface.
  const total = input + read + write;
  // A tool follow-up can explicitly report zero input. It is a valid neutral
  // sample, even though an all-zero denominator cannot produce a hit ratio.
  if (!Number.isSafeInteger(total) || total < 0 || read + write > total) return null;
  // A provider label is unnecessary for a validated zero denominator: it
  // contributes neither numerator nor denominator and never invents a ratio.
  if (total > 0 && !/GOOGLE_GEMINI|OPENAI|ANTHROPIC/.test(provider)) return null;
  return { inputTokens:total, cachedTokens:read, cacheWriteTokens:write, uncachedTokens:total-read-write };
}

function settledUsageTokens(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cached = requestCacheMetrics(usage);
  if (!cached || cached.inputTokens <= 0) return null;
  const out = usage.outputTokens === undefined ? 0 : tokenCount(usage.outputTokens);
  if (out === null) return null;
  return tokenCount(cached.inputTokens + out);
}

function unionSeconds(intervals) {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a, b) => a[0] - b[0]);
  let total = 0, start = null, end = null;
  for (const [a, b] of sorted) {
    if (start === null) { start = a; end = b; }
    else if (a <= end) end = Math.max(end, b);
    else { total += end - start; start = a; end = b; }
  }
  if (start !== null) total += end - start;
  return total / 1000;
}

export function trajectoryMetrics(response, storage = null, options = null) {
  const trajectory = response.trajectory || {};
  const generators = trajectory.generatorMetadata || [];
  const samples = storage?.samples || [], ids = storage?.ids || new Map();
  const steps = trajectory.steps || [];
  const stepPhases = new Uint8Array(steps.length);
  const stepTurns = new Int32Array(steps.length);
  const orchTurns = new Set();
  let curPhase = 0, curTurn = 0, phaseSwitchCount = 0, hasExitPlanMode = false, stepIdx = 0;
  for (const s of steps) {
    const typeText = String(s?.type || '');
    const isUser = /USER_INPUT/.test(typeText);
    const isPlanReview = hasPlanReviewMarker(s);
    const isExitPlan = isExitPlanModeStep(s);
    if (isExitPlan) {
      if (stepIdx < stepPhases.length) {
        stepPhases[stepIdx] = curPhase;
        stepTurns[stepIdx] = curTurn;
      }
      orchTurns.add(curTurn);
      if (curPhase !== 1) phaseSwitchCount++;
      curPhase = 1;
      hasExitPlanMode = true;
    } else if (isPlanReview) {
      if (curPhase === 1) phaseSwitchCount++;
      curPhase = 0;
      orchTurns.add(curTurn);
      if (stepIdx < stepPhases.length) {
        stepPhases[stepIdx] = curPhase;
        stepTurns[stepIdx] = curTurn;
      }
    } else if (isUser) {
      curTurn++;
      curPhase = 0;
      if (stepIdx < stepPhases.length) {
        stepPhases[stepIdx] = curPhase;
        stepTurns[stepIdx] = curTurn;
      }
    } else if (stepIdx < stepPhases.length) {
      stepPhases[stepIdx] = curPhase;
      stepTurns[stepIdx] = curTurn;
    }
    stepIdx++;
  }
  const orchCfg = options?.orchestratorSettings && typeof options.orchestratorSettings === 'object' ? options.orchestratorSettings : null;
  const configuredPlanner = typeof orchCfg?.orchestratorModel === 'string' && orchCfg.orchestratorModel
    ? (formatModelName(orchCfg.orchestratorModel) || orchCfg.orchestratorModel) : null;
  const configuredExecutor = typeof orchCfg?.orchestratorExecutorModel === 'string' && orchCfg.orchestratorExecutorModel
    ? (formatModelName(orchCfg.orchestratorExecutorModel) || orchCfg.orchestratorExecutorModel) : null;
  const hasConfiguredPair = Boolean(configuredPlanner && configuredExecutor);
  let plannerBucket = null, pendingPlannerBucket = null, executorBucket = null;
  let hasBuiltInPlanner = false, hasBuiltInExecutor = false;
  let prevOrchRole = null, inActiveExecutorSegment = false, coldStartSwitches = 0;
  const counts = { input: 0, output: 0, responseOutput: 0, thinkingOutput: 0, cacheRead: 0, cacheWrite: 0 };
  let modelSeconds = 0, cacheMissSurges = 0, cacheMissSurgeTokens = 0;
  const byModel = new Map();
  const cache = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0, measuredRequests:0, missingRequests:0 };
  // Token availability is independent of cache-ratio availability. In particular,
  // a historical request may retain output usage but lack normalized input data.
  const tokens = { inputTokens:0, cachedTokens:0, cacheWriteTokens:0, uncachedTokens:0, outputTokens:0,
    measuredRequests:0, inputRequests:0, outputRequests:0, missingInputRequests:0, missingOutputRequests:0,
    uncachedRequests:0, cachedRequests:0, cacheWriteRequests:0 };
  const turnSegments = [];
  let turnSeg = { start: 0, end: -1, hasVisible: false, completed: false };
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const typeText = String(s?.type || '');
    const isUser = /USER_INPUT/.test(typeText);
    const isSystem = /SYSTEM_MESSAGE/.test(typeText);
    if (isUser || (isSystem && turnSeg.hasVisible && turnSeg.completed)) {
      if (turnSeg.hasVisible && turnSeg.completed) turnSegments.push({ start: turnSeg.start, end: i - 1 });
      turnSeg = { start: i, end: i, hasVisible: false, completed: false };
    }
    turnSeg.end = i;
    if (/PLANNER_RESPONSE/.test(typeText) && String(s?.plannerResponse?.response || '').trim()) {
      turnSeg.hasVisible = true;
      turnSeg.completed = !/RUNNING|PENDING|GENERATING/.test(String(s?.status || ''));
    }
  }
  if (turnSeg.hasVisible && turnSeg.completed) turnSegments.push({ start: turnSeg.start, end: turnSeg.end });
  const turnAcc = turnSegments.map(() => ({
    model: '', models: new Set(), requests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, streamTokens: 0, streamSeconds: 0,
  }));
  let lastSettledContext = null, lastChatStepIdx = -1;
  for (const [index, generator] of generators.entries()) {
    const chat = generator.chatModel;
    if (chat && Array.isArray(generator.stepIndices)) {
      for (const si of generator.stepIndices) if (Number.isInteger(si) && si > lastChatStepIdx) lastChatStepIdx = si;
    }
    const chatCwm = chat?.chatStartMetadata?.contextWindowMetadata;
    const chatMax = tokenCount(chatCwm?.maxContextTokens);
    const chatSettled = settledUsageTokens(chat?.usage);
    if (chatMax > 0 && chatSettled !== null) {
      lastSettledContext = {
        usedTokens: chatSettled,
        maxTokens: chatMax,
        cwmEst: tokenCount(chatCwm?.estimatedTokensUsed),
        model: formatModelName(chat.modelDisplayName || chat.responseModel || String(chat.model || chat.usage?.model || '')) || '',
      };
    }
    if (!chat?.usage) continue;
    const usage = chat.usage;
    // IDE executionId identifies a planner run/turn, not an individual model
    // request: tool follow-ups share it while having distinct responseIds.
    // Never collapse those follow-ups, even when no request ID was returned.
    const id = usage.responseId ? `response:${usage.apiProvider||''}:${usage.responseId}`
      : usage.messageId ? `message:${usage.messageId}` : `index:${index}`;
    const signature = JSON.stringify([usage.outputTokens,usage.responseOutputTokens,usage.thinkingOutputTokens,
      seconds(chat.streamingDuration),seconds(chat.timeToFirstToken),chat.responseModel,chat.model,usage.model]);
    if (ids.has(id)) {
      const previous = ids.get(id);
      if (previous.signature !== signature && !previous.sample.reasons.includes('duplicate-scope')) previous.sample.reasons.push('duplicate-scope');
      if(storage)ids.set(id,previous);
      continue;
    }
    const cached = requestCacheMetrics(usage);
    if(cached) {
      for(const key of ['inputTokens','cachedTokens','cacheWriteTokens','uncachedTokens'])cache[key]+=cached[key];
      cache.outputTokens+=tokenCount(usage.outputTokens)??0;
      cache.measuredRequests++;
    } else cache.missingRequests++;
    const output = tokenCount(usage.outputTokens);
    // These fields come from the local normalized ModelUsageStats contract,
    // not upstream prompt_tokens. Account for each readable component even
    // when another component (or the cache-ratio provider) is unavailable.
    const input = tokenCount(usage.inputTokens);
    const read = usage.cacheReadTokens === undefined && input !== null ? 0 : tokenCount(usage.cacheReadTokens);
    const write = usage.cacheWriteTokens === undefined && input !== null ? 0 : tokenCount(usage.cacheWriteTokens);
    const parts = [['uncachedTokens','uncachedRequests',input],['cachedTokens','cachedRequests',read],['cacheWriteTokens','cacheWriteRequests',write]];
    for (const [field,coverage,value] of parts) if (value !== null) {
      tokens[field] = tokens[field] === null ? null : tokenCount(tokens[field]+value);
      tokens[coverage]++;
    }
    if (input !== null && read !== null && write !== null && tokenCount(input+read+write) !== null) tokens.inputRequests++;
    else tokens.missingInputRequests++;
    if (output !== null) { tokens.outputTokens = tokens.outputTokens === null ? null : tokenCount(tokens.outputTokens+output); tokens.outputRequests++; }
    else tokens.missingOutputRequests++;
    if (parts.some(([, ,value])=>value!==null) || output !== null) tokens.measuredRequests++;
    const visible = tokenCount(usage.responseOutputTokens);
    const thinking = tokenCount(usage.thinkingOutputTokens);
    const responseTokens = visible ?? (output !== null && thinking !== null ? Math.max(0, output - thinking) : output);
    const combinedOutput = visible !== null && thinking !== null ? tokenCount(thinking + visible) : null;
    // Antigravity chatModel.streamingDuration spans thinking and visible output
    // together, so pair it with total outputTokens (thinking + response).
    const streamTokens = output ?? combinedOutput ?? visible;
    const duration = seconds(chat.streamingDuration);
    const ttft = seconds(chat.timeToFirstToken);
    counts.input += tokenCount(usage.inputTokens) ?? 0;
    counts.output += output ?? 0;
    counts.responseOutput += responseTokens ?? 0;
    counts.thinkingOutput += thinking ?? 0;
    counts.cacheRead += tokenCount(usage.cacheReadTokens) ?? 0;
    counts.cacheWrite += tokenCount(usage.cacheWriteTokens) ?? 0;
    modelSeconds += (ttft ?? 0) + (duration ?? 0);
    const reasons = [];
    if (['outputTokens','responseOutputTokens','thinkingOutputTokens'].some(key=>usage[key] !== undefined && tokenCount(usage[key]) === null) ||
        output !== null && (visible !== null && visible > output || thinking !== null && thinking > output ||
          visible !== null && thinking !== null && visible + thinking > output)) reasons.push('token-scope');
    // One retryInfos entry is the ordinary attempt record, not evidence of a retry.
    // Multiple differing usage records lack attempt-specific timing in this API.
    const attempts = (Array.isArray(chat.retryInfos) ? chat.retryInfos : []).filter(info=>info?.usage);
    if (attempts.length > 1 && attempts.some(info=>['outputTokens','responseOutputTokens','thinkingOutputTokens'].some(key=>
        tokenCount(info.usage[key]) !== tokenCount(usage[key])))) reasons.push('retry-scope');
    const planners = (generator.stepIndices || []).map(i=>Number.isInteger(i) && i >= 0 ? steps[i] : null)
      .filter(step=>/PLANNER_RESPONSE/.test(String(step?.type || '')));
    const toolOnly = planners.length > 0 && planners.every(step=>step.plannerResponse?.toolCalls?.length > 0 &&
      !String(step.plannerResponse?.response || '').trim());
    const basis = output !== null || combinedOutput !== null ? 'all-output' : visible !== null ? 'response' : 'all-output';
    const rawModel = chat.modelDisplayName || chat.responseModel || String(chat.model || usage.model || '');
    const formattedModel = formatModelName(rawModel) || '';
    const modelKey = formattedModel || 'Unknown';
    const pool = quotaPoolForModel(rawModel || modelKey, usage.apiProvider || '');
    const bucketKey = `${pool}\0${modelKey}`;
    let row = byModel.get(bucketKey);
    if (!row) {
      row = { model: modelKey, pool, requests: 0, uncachedTokens: 0, cachedTokens: 0, cacheWriteTokens: 0,
        inputTokens: 0, outputTokens: 0, responseTokens: 0, thinkingTokens: 0, totalTokens: 0,
        cacheMissSurges: 0, cacheMissSurgeTokens: 0 };
      byModel.set(bucketKey, row);
    }
    const reqUncached = input ?? 0, reqRead = read ?? 0, reqWrite = write ?? 0, reqInput = reqUncached + reqRead + reqWrite, reqOutput = output ?? 0;
    row.requests++;
    row.uncachedTokens += reqUncached;
    row.cachedTokens += reqRead;
    row.cacheWriteTokens += reqWrite;
    row.inputTokens += reqInput;
    row.outputTokens += reqOutput;
    row.responseTokens += responseTokens ?? 0;
    row.thinkingTokens += thinking ?? 0;
    row.totalTokens += reqInput + reqOutput;
    if (reqRead === 0 && reqUncached >= 100000) {
      row.cacheMissSurges++;
      row.cacheMissSurgeTokens += reqUncached;
      cacheMissSurges++;
      cacheMissSurgeTokens += reqUncached;
    }
    const builtInPlanner = isBuiltInPlannerModel(rawModel, formattedModel);
    const builtInExecutor = isBuiltInExecutorModel(rawModel, formattedModel);
    if (builtInPlanner) hasBuiltInPlanner = true;
    if (builtInExecutor) hasBuiltInExecutor = true;
    const gStepIndices = Array.isArray(generator.stepIndices) ? generator.stepIndices : [];
    let inExecutorPhase = false, inPlannerPhase = false, inOrchTurn = false;
    for (const si of gStepIndices) {
      if (Number.isInteger(si) && si >= 0 && si < stepPhases.length) {
        if (stepPhases[si] === 1) inExecutorPhase = true;
        else inPlannerPhase = true;
        if (orchTurns.has(stepTurns[si])) inOrchTurn = true;
      }
    }
    if (inExecutorPhase) inPlannerPhase = false;
    let orchRole = null;
    if (builtInPlanner) orchRole = 'planner';
    else if (builtInExecutor) orchRole = 'executor';
    else if (inExecutorPhase) orchRole = 'executor';
    else if (inPlannerPhase && inOrchTurn) orchRole = 'planner';
    else if (!hasExitPlanMode && hasConfiguredPair && configuredPlanner !== configuredExecutor) {
      if (formattedModel === configuredPlanner) orchRole = 'planner';
      else if (formattedModel === configuredExecutor) orchRole = 'executor';
    } else if (!hasExitPlanMode && hasConfiguredPair && formattedModel === configuredPlanner) {
      orchRole = 'planner';
    }
    if (orchRole === 'planner') {
      plannerBucket ||= createOrchBucket();
      addToOrchBucket(plannerBucket, modelKey, pool, reqUncached, reqRead, reqInput, reqOutput);
      inActiveExecutorSegment = false;
      prevOrchRole = 'planner';
    } else if (orchRole === 'executor') {
      executorBucket ||= createOrchBucket();
      addToOrchBucket(executorBucket, modelKey, pool, reqUncached, reqRead, reqInput, reqOutput);
      if (!inActiveExecutorSegment && (hasExitPlanMode || prevOrchRole === 'planner' || inExecutorPhase)) {
        inActiveExecutorSegment = true;
        if (reqRead === 0 && reqInput > 0) coldStartSwitches++;
      }
      prevOrchRole = 'executor';
    } else if (inPlannerPhase) {
      pendingPlannerBucket ||= createOrchBucket();
      addToOrchBucket(pendingPlannerBucket, modelKey, pool, reqUncached, reqRead, reqInput, reqOutput);
      inActiveExecutorSegment = false;
    }
    let turnSegIdx = -1;
    const firstTurnStep = gStepIndices.find(si => Number.isInteger(si) && si >= 0 && si < steps.length);
    if (firstTurnStep !== undefined) {
      turnSegIdx = turnSegments.findIndex(seg => firstTurnStep >= seg.start && firstTurnStep <= seg.end);
      if (turnSegIdx >= 0) {
        const acc = turnAcc[turnSegIdx];
        if (formattedModel) { acc.model = formattedModel; acc.models.add(formattedModel); }
        acc.requests++;
        acc.inputTokens += reqInput;
        acc.cachedTokens += reqRead;
        acc.outputTokens += reqOutput;
      }
    }
    const sample = { outputTokens: streamTokens, responseTokens, duration, ttft, reasons, toolOnly,
      turnSegIdx,
      tps: streamTokens !== null && duration > 0 ? streamTokens / duration : null,
      model: formattedModel, basis,
      profile: JSON.stringify([usage.apiProvider || '',chat.responseModel || usage.model || chat.model || chat.modelDisplayName || '',basis]) };
    samples.push(sample);
    ids.set(id,{signature,sample});
  }
  (storage?.classify || classifyRates)(samples);
  let acceptedCount = 0, streamingSeconds = 0, sampledTokens = 0, e2eTokens = 0, e2eSeconds = 0, peakTps = null;
  let missingTiming = 0, excludedTiming = 0, rateWarnings = 0, sampleCount = 0, latest = null, lastQualified = null;
  let allResponse = true, acceptedResponse = true;
  const timingReasons = Object.fromEntries(RATE_REASONS.map(reason=>[reason,0]));
  const recentTps = [], ttftValues = [];
  for (const s of samples) {
    sampleCount++;
    latest = s;
    if (s.basis !== 'response') allResponse = false;
    if (typeof s.ttft === 'number' && Number.isFinite(s.ttft)) ttftValues.push(s.ttft);
    for (const reason of s.reasons) if (Object.hasOwn(timingReasons, reason)) timingReasons[reason]++;
    if (s.status === 'missing' && (s.outputTokens ?? 0) > 0) missingTiming++;
    else if (s.status === 'unreliable' || s.status === 'buffered' || s.status === 'short') excludedTiming++;
    else if (s.status === 'ok') {
      lastQualified = s;
      if (s.basis !== 'response') acceptedResponse = false;
      if (s.outlier) rateWarnings++;
      acceptedCount++;
      streamingSeconds += s.duration;
      sampledTokens += s.outputTokens;
      if (s.turnSegIdx >= 0 && s.duration > 0 && s.outputTokens !== null) {
        turnAcc[s.turnSegIdx].streamTokens += s.outputTokens;
        turnAcc[s.turnSegIdx].streamSeconds += s.duration;
      }
      if (typeof s.ttft === 'number' && Number.isFinite(s.ttft) && s.ttft + s.duration > 0) {
        e2eTokens += s.outputTokens;
        e2eSeconds += s.ttft + s.duration;
      }
      if (typeof s.tps === 'number' && Number.isFinite(s.tps)) {
        if (peakTps === null || s.tps > peakTps) peakTps = s.tps;
        if (recentTps.length === 16) recentTps.shift();
        recentTps.push(Math.round(s.tps * 10) / 10);
      }
    }
  }
  const ttftMedianSeconds = median(ttftValues);
  const latestTtftSeconds = typeof latest?.ttft === 'number' && Number.isFinite(latest.ttft) ? latest.ttft : null;
  const latestOutputTokens = typeof latest?.outputTokens === 'number' && Number.isSafeInteger(latest.outputTokens) ? latest.outputTokens : null;
  const latestDurationSeconds = typeof latest?.duration === 'number' && Number.isFinite(latest.duration) ? latest.duration : null;
  const latestE2eTps = latest && typeof latest.outputTokens === 'number' && latestTtftSeconds !== null && latestDurationSeconds !== null && latestTtftSeconds + latestDurationSeconds > 0
    ? latest.outputTokens / (latestTtftSeconds + latestDurationSeconds) : null;
  const prevQualifiedTps = lastQualified && typeof lastQualified.tps === 'number' && Number.isFinite(lastQualified.tps) ? lastQualified.tps : null;
  const prevQualifiedSameModel = Boolean(lastQualified && latest?.model && lastQualified.model === latest.model);
  let rounds = 0, toolTotalCalls = 0, toolArgTokens = 0, lastCompactCmdIdx = -1, lastCompactionIdx = -1, compactingInProgress = false;
  const stepBreakdown = { user: 0, planner: 0, tool: 0, compaction: 0, other: 0 };
  const toolIntervals = storage ? null : [];
  const toolMap = new Map();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const typeText = String(s?.type || '');
    const isUser = /USER_INPUT/.test(typeText);
    if (isUser) {
      rounds++;
      const isCompactCmd = /^\s*\/compact\b/i.test(s?.userInput?.userResponse || s?.userInput?.text || s?.content || '') ||
        (Array.isArray(s?.userInput?.items) && s.userInput.items.some(item => /^\s*\/compact\b/i.test(item?.text || '')));
      if (isCompactCmd) lastCompactCmdIdx = i;
    }
    const isCompactionStep = /COMPACTION|CONTEXT_COMPACTION/.test(typeText) ||
      (/CHECKPOINT/.test(typeText) && (Boolean(s?.checkpoint) || /^\s*(?:\[?context (?:summary|compaction)\]?|conversation (?:summary|checkpoint)|checkpoint summary|# Resuming from a compaction|<CONTEXT_SUMMARY>)/i.test(s?.content?.prefix || s?.checkpoint?.sessionSummary || '')));
    if (isCompactionStep) {
      lastCompactionIdx = i;
      if (/RUNNING/.test(String(s?.status || ''))) compactingInProgress = true;
    }
    const tc = s?.metadata?.toolCall;
    const isTool = TOOL_STEP_RE.test(typeText) || Boolean(tc);
    if (isUser) stepBreakdown.user++;
    else if (isTool) stepBreakdown.tool++;
    else if (/PLANNER_RESPONSE/.test(typeText)) stepBreakdown.planner++;
    else if (/COMPACTION|CHECKPOINT/.test(typeText)) stepBreakdown.compaction++;
    else stepBreakdown.other++;
    if (!isTool) continue;
    if (toolIntervals) toolIntervals.push([Date.parse(s.metadata?.startedAt || s.metadata?.createdAt), Date.parse(s.metadata?.completedAt)]);
    const explicitName = cleanToolName(tc?.name);
    const fallbackName = cleanToolName(typeText.replace(/^CORTEX_STEP_TYPE_/, '').toLowerCase());
    const name = explicitName || fallbackName || (tc ? 'tool' : '');
    if (name) {
      const argValue = tc?.argumentsJson;
      const args = tokenCount(argValue) ?? (typeof argValue === 'string' ? estimateTextTokens(argValue) : 0);
      const source = normalizeToolSource(s.metadata?.toolSource);
      let entry = toolMap.get(name);
      if (!entry) { entry = { name, calls: 0, argTokens: 0, source }; toolMap.set(name, entry); }
      else if (!entry.source && source) entry.source = source;
      entry.calls++;
      entry.argTokens += args;
      toolTotalCalls++;
      toolArgTokens += args;
    }
  }
  const toolSeconds = storage ? storage.toolSeconds() : unionSeconds(toolIntervals);
  const modelBreakdown = [...byModel.values()]
    .sort((a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests || a.model.localeCompare(b.model))
    .slice(0, 16);
  const toolSummary = {
    totalCalls: toolTotalCalls,
    argTokens: toolArgTokens,
    tools: [...toolMap.values()].sort((a, b) => b.argTokens - a.argTokens || b.calls - a.calls || a.name.localeCompare(b.name)).slice(0, 16),
  };
  const lastChat = storage ? storage.lastChat() : [...generators].reverse().find(g => g.chatModel)?.chatModel;
  let lastActiveMs = NaN;
  const considerTime = value => {
    if (typeof value !== 'string') return;
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && (!Number.isFinite(lastActiveMs) || ms > lastActiveMs)) lastActiveMs = ms;
  };
  considerTime(lastChat?.chatStartMetadata?.createdAt);
  for (let i = steps.length - 1, stop = Math.max(0, steps.length - 8); i >= stop; i--) {
    const meta = steps[i]?.metadata;
    considerTime(meta?.completedAt);
    considerTime(meta?.startedAt);
    considerTime(meta?.createdAt);
  }
  const lastActiveAt = Number.isFinite(lastActiveMs) ? new Date(lastActiveMs).toISOString() : null;
  const inputParts=[tokens.uncachedTokens,tokens.cachedTokens,tokens.cacheWriteTokens];
  tokens.inputTokens = tokenCount(inputParts.reduce((sum,value)=>sum+(value??0),0));
  const totalTokens=tokenCount((tokens.inputTokens??0)+(tokens.outputTokens??0));
  const hasBuiltIn = hasBuiltInPlanner || hasBuiltInExecutor;
  if (hasBuiltIn && !plannerBucket && pendingPlannerBucket) plannerBucket = pendingPlannerBucket;
  const latestModel = latest?.model || null;
  const settingsMatch = hasConfiguredPair && Boolean(latestModel) && (latestModel === configuredPlanner || latestModel === configuredExecutor);
  const detected = hasExitPlanMode || hasBuiltIn || settingsMatch;
  const source = hasExitPlanMode ? 'trajectory' : hasBuiltIn ? 'model-id' : 'settings';
  const finalPlanner = finalizeOrchBucket(plannerBucket);
  const finalExecutor = finalizeOrchBucket(executorBucket);
  const orchestrator = detected ? {
    detected: true,
    source,
    configuredPlanner,
    configuredExecutor,
    switched: hasExitPlanMode || Boolean(finalPlanner && finalExecutor),
    phaseSwitchCount,
    coldStartSwitches,
    planner: finalPlanner,
    executor: finalExecutor,
  } : null;
  const responseRunning = /RUNNING/.test(String(response.status || ''));
  const compactionState = compactingInProgress || (responseRunning && lastCompactCmdIdx >= 0 && lastCompactCmdIdx >= lastCompactionIdx && lastCompactCmdIdx > lastChatStepIdx)
    ? 'compacting'
    : (lastCompactionIdx >= 0 && lastCompactionIdx > lastChatStepIdx ? 'compacted' : 'idle');
  return {
    source: 'Antigravity request metadata', status: response.status || null, compactionState,
    conversationId: trajectory.cascadeId || null,
    steps: Number(response.numTotalSteps ?? steps.length), rounds, stepBreakdown,
    requests: ids.size, measuredRequests: acceptedCount, missingTiming, excludedTiming, rateWarnings, timingReasons, rateVersion: RATE_VERSION, counts,
    modelBreakdown, cacheMissSurges, cacheMissSurgeTokens, toolSummary, orchestrator,
    tokens:{...tokens,totalTokens,
      complete:tokens.missingInputRequests===0&&tokens.missingOutputRequests===0&&inputParts.every(value=>value!==null)&&tokens.outputTokens!==null&&totalTokens!==null},
    cache:{...cache,totalTokens:cache.inputTokens+cache.outputTokens,hitRate:cache.inputTokens>0?cache.cachedTokens/cache.inputTokens:null,complete:cache.missingRequests===0},
    tps: streamingSeconds > 0 ? sampledTokens / streamingSeconds : null, latestTps: latest?.status === 'ok' ? latest.tps : null,
    e2eTps: e2eSeconds > 0 ? e2eTokens / e2eSeconds : null,
    peakTps, recentTps, lastActiveAt,
    latestRateStatus: latest?.status ?? 'missing',
    rateBasis: (acceptedCount ? acceptedResponse : sampleCount > 0 && allResponse) ? 'response' : 'all-output',
    streamingSeconds, modelSeconds, toolSeconds,
    ttftSeconds: ttftMedianSeconds, ttftMedianSeconds, latestTtftSeconds,
    latestOutputTokens, latestDurationSeconds, latestE2eTps, prevQualifiedTps, prevQualifiedSameModel,
    model: latest?.model || null,
    context: (() => {
      const lastCwm = lastChat?.chatStartMetadata?.contextWindowMetadata;
      if (!lastCwm || typeof lastCwm !== 'object' || Array.isArray(lastCwm)) return null;
      const lastMax = tokenCount(lastCwm.maxContextTokens);
      const lastEst = tokenCount(lastCwm.estimatedTokensUsed);
      const lastModelRaw = lastChat?.modelDisplayName || lastChat?.responseModel || String(lastChat?.model || '');
      const lastSettled = settledUsageTokens(lastChat?.usage);
      const sampledAt = lastChat?.chatStartMetadata?.createdAt;
      if (lastMax > 0 && lastSettled !== null) {
        return contextMetrics({ estimatedTokensUsed: lastSettled, maxContextTokens: lastMax }, { model: lastModelRaw, sampledAt, estimated: false });
      }
      const lastModelNorm = formatModelName(lastModelRaw) || '';
      if (lastMax > 0 && lastSettled === null && lastEst !== null && lastSettledContext &&
          lastSettledContext.maxTokens === lastMax && lastSettledContext.cwmEst !== null &&
          lastEst >= lastSettledContext.cwmEst * 0.5 &&
          (!lastSettledContext.model || !lastModelNorm || lastModelNorm === lastSettledContext.model)) {
        const carried = tokenCount(lastSettledContext.usedTokens + Math.max(0, lastEst - lastSettledContext.cwmEst));
        return contextMetrics({ estimatedTokensUsed: carried ?? lastEst, maxContextTokens: lastMax }, { model: lastModelRaw, sampledAt, estimated: true });
      }
      return contextMetrics(lastCwm, { model: lastModelRaw, sampledAt, estimated: true });
    })(),
    turns: turnAcc.slice(-64).map(item => ({
      model: item.model || null,
      multiModel: item.models.size > 1,
      requests: item.requests,
      inputTokens: item.inputTokens,
      cachedTokens: item.cachedTokens,
      outputTokens: item.outputTokens,
      hitRate: item.inputTokens > 0 ? item.cachedTokens / item.inputTokens : null,
      tps: item.streamSeconds > 0 && item.streamTokens > 0 ? item.streamTokens / item.streamSeconds : null,
    })),
    totalCompletedTurns: turnSegments.length,
    complete: Number(response.numTotalGeneratorMetadata ?? generators.length) === generators.length,
  };
}

export function quotaMetrics(response, now = Date.now()) {
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string'?value:'';
  const root = object(response?.response)?response.response:object(response)?response:{};
  const bucketFamily=bucket=>text(bucket?.bucketId).replace(/-(5h|weekly)$/, '');
  const cadence=bucket=>{
    // Do not reinterpret an explicitly different cadence from its name.
    if(Object.hasOwn(bucket,'window'))return ['5h','weekly'].includes(bucket.window)?bucket.window:null;
    return text(bucket.bucketId).match(/-(5h|weekly)$/)?.[1]||null;
  };
  const remainingValue=(bucket,field)=>Object.hasOwn(bucket,field)?bucket[field]
    :object(bucket.remaining)?bucket.remaining[field]:undefined;
  const fraction=value=>{
    // Proto JSON uses a number. Also accept decimal text from legacy adapters,
    // but never turn null, blanks, booleans or arrays into an exhausted quota.
    if(typeof value!=='number'&&!(typeof value==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)))return null;
    const result=Number(value);return Number.isFinite(result)&&result>=0&&result<=1?result:null;
  };
  let groups=Array.isArray(root.groups)?root.groups.filter(object):[];
  if(!groups.length&&Array.isArray(root.buckets)){
    // Older summaries may return only a flat bucket list. Keep each bucket
    // family distinct so Argon's weekly allowance cannot replace Gemini's.
    const families=new Map();
    for(const [index,bucket]of root.buckets.entries()){
      if(!object(bucket))continue;
      const key=bucketFamily(bucket)||`group-${index}`;
      if(!families.has(key))families.set(key,{displayName:text(bucket.displayName)||key,buckets:[]});
      families.get(key).buckets.push(bucket);
    }
    groups=[...families.values()];
  }
  return groups.map((group, index) => ({
    id: (Array.isArray(group.buckets)?group.buckets.filter(object).map(bucketFamily).find(Boolean):null)||`group-${index}`,
    name: text(group.displayName) || `额度组 ${index + 1}`, description: text(group.description),
    windows: Object.fromEntries(['5h', 'weekly'].map(window => {
      const bucket = (Array.isArray(group.buckets)?group.buckets:[]).find(b=>object(b)&&cadence(b)===window);
      if (!bucket) return [window, { available: false, reason: '账户未返回此额度窗口' }];
      const remaining = fraction(remainingValue(bucket,'remainingFraction'));
      const date = typeof bucket.resetTime==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(bucket.resetTime)?Date.parse(bucket.resetTime):NaN;
      return [window, { available: true, id: text(bucket.bucketId), remaining, amount: tokenCount(remainingValue(bucket,'remainingAmount')),
        resetAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
        expired: Number.isFinite(date) && date <= now, disabled: bucket.disabled === true, description: text(bucket.description) }];
    })),
  }));
}
