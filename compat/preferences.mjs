// App-independent preferences: no renderer origin, account or conversation data.
import { readFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { platformPaths } from './platform.mjs';

export function validateUsageScope(value) {
  if(!['local','account'].includes(value))throw new Error('Invalid usage scope preference');
  return value;
}
function storedUsageScope(value) {
  return ['local','account'].includes(value)?value:undefined;
}
export function validateAutoRelaunchDebug(value) {
  if(typeof value!=='boolean')throw new Error('Invalid auto relaunch preference');
  return value;
}
function storedAutoRelaunchDebug(value) {
  return typeof value==='boolean'?value:undefined;
}
export function validateLanguage(value) {
  if (value!=='en'&&value!=='zh-CN'&&value!=='zh-TW') throw new Error('Invalid language preference');
  return value;
}

export function validateSpeedStyle(value) {
  if (value!=='minimal'&&value!=='cat') throw new Error('Invalid speed style preference');
  return value;
}
const storedSpeedStyle=value=>value==='minimal'||value==='cat'?value:null;
export function validateQuotaDisplay(value) {
  if (value!=='both'&&value!=='auto'&&value!=='compact') throw new Error('Invalid quota display preference');
  return value;
}
const storedQuotaDisplay=value=>value==='both'||value==='auto'||value==='compact'?value:null;
const CONTEXT_LIMIT_MIN=16384,CONTEXT_LIMIT_MAX=2097152,CONTEXT_LIMIT_MAX_OVERRIDES=64;
const FORBIDDEN_MODEL_KEYS=new Set(['__proto__','constructor','prototype']);
const isValidContextLimit=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=CONTEXT_LIMIT_MIN&&value<=CONTEXT_LIMIT_MAX;
const cleanModelKey=raw=>{
  if(typeof raw!=='string')return '';
  const cleaned=raw.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
  return cleaned&&!FORBIDDEN_MODEL_KEYS.has(cleaned)?cleaned:'';
};
export function validateContextLimitTokens(value) {
  if(value===null)return null;
  if(!isValidContextLimit(value))throw new Error('Invalid context limit preference');
  return value;
}
function storedContextLimitTokens(value) {
  return isValidContextLimit(value)?value:undefined;
}
export function validateContextLimitOverrides(value) {
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid context limit overrides preference');
  const entries=Object.entries(value);
  if(entries.length>CONTEXT_LIMIT_MAX_OVERRIDES)throw new Error('Too many context limit overrides');
  const out={};
  for(const [rawKey,rawVal]of entries){
    const key=cleanModelKey(rawKey);
    if(!key)throw new Error('Invalid context limit model key');
    if(rawVal===null)continue;
    if(rawVal!==0&&!isValidContextLimit(rawVal))throw new Error('Invalid context limit override value');
    out[key]=rawVal;
  }
  return Object.keys(out).length?out:null;
}
function storedContextLimitOverrides(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const out={};
  let count=0;
  for(const [rawKey,rawVal]of Object.entries(value)){
    if(count>=CONTEXT_LIMIT_MAX_OVERRIDES)break;
    const key=cleanModelKey(rawKey);
    if(!key)continue;
    if(rawVal===0||isValidContextLimit(rawVal)){out[key]=rawVal;count++;}
  }
  return count?out:undefined;
}

export class PreferencesStore {
  constructor({file=join(dirname(platformPaths().settings),'preferences.json')}={}) {
    this.file=file;this.queue=Promise.resolve();
  }
  async get() {
    await this.queue;
    try {
      const value=JSON.parse((await readFile(this.file,'utf8')).replace(/^\uFEFF/,''));
      if(value.schema!==1)throw new Error('Invalid preferences schema');
      const usageScope=storedUsageScope(value.usageScope);
      const autoRelaunchDebug=storedAutoRelaunchDebug(value.autoRelaunchDebug);
      const contextLimitTokens=storedContextLimitTokens(value.contextLimitTokens);
      const contextLimitOverrides=storedContextLimitOverrides(value.contextLimitOverrides);
      return {language:value.language===null?null:validateLanguage(value.language),languageGuideDismissed:value.languageGuideDismissed===true,usageGuideDismissed:value.usageGuideDismissed===true,speedStyle:storedSpeedStyle(value.speedStyle),quotaDisplay:storedQuotaDisplay(value.quotaDisplay),...(usageScope?{usageScope}:{}),...(typeof autoRelaunchDebug==='boolean'?{autoRelaunchDebug}:{}),...(contextLimitTokens?{contextLimitTokens}:{}),...(contextLimitOverrides?{contextLimitOverrides}:{}),revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0};
    } catch(error) {
      if(error.code==='ENOENT')return {language:null,languageGuideDismissed:false,usageGuideDismissed:false,speedStyle:null,quotaDisplay:null,revision:0};
      throw new Error('Language preference could not be read');
    }
  }
  async set(input) {
    if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(key=>!['language','languageGuideDismissed','usageGuideDismissed','speedStyle','quotaDisplay','usageScope','autoRelaunchDebug','contextLimitTokens','contextLimitOverrides'].includes(key)))throw new Error('Invalid preferences request');
    if(Object.hasOwn(input,'language'))validateLanguage(input.language);
    if(Object.hasOwn(input,'speedStyle'))validateSpeedStyle(input.speedStyle);
    if(Object.hasOwn(input,'quotaDisplay'))validateQuotaDisplay(input.quotaDisplay);
    if(Object.hasOwn(input,'usageScope'))validateUsageScope(input.usageScope);
    if(Object.hasOwn(input,'autoRelaunchDebug'))validateAutoRelaunchDebug(input.autoRelaunchDebug);
    const validatedContextLimit=Object.hasOwn(input,'contextLimitTokens')?validateContextLimitTokens(input.contextLimitTokens):undefined;
    const validatedContextOverrides=Object.hasOwn(input,'contextLimitOverrides')?validateContextLimitOverrides(input.contextLimitOverrides):undefined;
    if(Object.hasOwn(input,'languageGuideDismissed')&&input.languageGuideDismissed!==true)throw new Error('Invalid guide preference');
    if(Object.hasOwn(input,'usageGuideDismissed')&&input.usageGuideDismissed!==true)throw new Error('Invalid usage guide preference');
    const operation=this.queue.then(async()=>{
      await mkdir(dirname(this.file),{recursive:true});
      let prior=0,previous={language:null,languageGuideDismissed:false,usageGuideDismissed:false,speedStyle:null,quotaDisplay:null,usageScope:undefined,autoRelaunchDebug:undefined,contextLimitTokens:undefined,contextLimitOverrides:undefined};
      try {const value=JSON.parse((await readFile(this.file,'utf8')).replace(/^\uFEFF/,''));if(Number.isSafeInteger(value.revision))prior=value.revision;previous={language:['en','zh-CN','zh-TW'].includes(value.language)?value.language:null,languageGuideDismissed:value.languageGuideDismissed===true,usageGuideDismissed:value.usageGuideDismissed===true,speedStyle:storedSpeedStyle(value.speedStyle),quotaDisplay:storedQuotaDisplay(value.quotaDisplay),usageScope:storedUsageScope(value.usageScope),autoRelaunchDebug:storedAutoRelaunchDebug(value.autoRelaunchDebug),contextLimitTokens:storedContextLimitTokens(value.contextLimitTokens),contextLimitOverrides:storedContextLimitOverrides(value.contextLimitOverrides)};}catch{}
      const language=Object.hasOwn(input,'language')?input.language:previous.language;
      const languageGuideDismissed=previous.languageGuideDismissed||Object.hasOwn(input,'language')||input.languageGuideDismissed===true;
      const usageGuideDismissed=previous.usageGuideDismissed||input.usageGuideDismissed===true;
      const speedStyle=Object.hasOwn(input,'speedStyle')?input.speedStyle:previous.speedStyle;
      const quotaDisplay=Object.hasOwn(input,'quotaDisplay')?input.quotaDisplay:previous.quotaDisplay;
      const usageScope=Object.hasOwn(input,'usageScope')?input.usageScope:previous.usageScope;
      const autoRelaunchDebug=Object.hasOwn(input,'autoRelaunchDebug')?input.autoRelaunchDebug:previous.autoRelaunchDebug;
      const contextLimitTokens=Object.hasOwn(input,'contextLimitTokens')?(validatedContextLimit??undefined):previous.contextLimitTokens;
      const contextLimitOverrides=Object.hasOwn(input,'contextLimitOverrides')?(validatedContextOverrides??undefined):previous.contextLimitOverrides;
      const revision=Math.max(Date.now(),prior+1);
      const temporary=this.file+'.'+process.pid+'.'+randomUUID()+'.tmp';
      try {
        const handle=await open(temporary,'wx',0o600);
        try {await handle.writeFile(JSON.stringify({schema:1,language,languageGuideDismissed,usageGuideDismissed,speedStyle,quotaDisplay,...(usageScope?{usageScope}:{}),...(typeof autoRelaunchDebug==='boolean'?{autoRelaunchDebug}:{}),...(contextLimitTokens?{contextLimitTokens}:{}),...(contextLimitOverrides?{contextLimitOverrides}:{}),revision})+'\n','utf8');await handle.sync();}
        finally {await handle.close();}
        await rename(temporary,this.file);
      } finally {await rm(temporary,{force:true});}
      return {language,languageGuideDismissed,usageGuideDismissed,speedStyle,quotaDisplay,...(usageScope?{usageScope}:{}),...(typeof autoRelaunchDebug==='boolean'?{autoRelaunchDebug}:{}),...(contextLimitTokens?{contextLimitTokens}:{}),...(contextLimitOverrides?{contextLimitOverrides}:{}),revision};
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
  async snapshot() {
    try {return await this.get();}catch{return {error:'Language preference could not be read'};}
  }
}
