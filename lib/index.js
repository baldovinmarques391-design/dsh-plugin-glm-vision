/**
 * dsh-plugin-glm-vision — Official DSH Plugin
 *
 * Modules:
 * 1. Image Translation Layer — bypass model image check, redirect to image_query
 * 2. Image Persistent Cache — content-addressed dedup storage
 * 3. Vision Q&A Tool (image_query) — LLM-callable tool via GLM-4.1V
 * 4. Standard Dialog Mode — system prompt tool declaration
 * 5. Old Conversation Compat — context injection for pre-plugin sessions
 *
 * @module dsh-plugin-glm-vision
 */

import z from '@deepseek-ai/schemastery';
import { ImageCache } from './image-cache.js';
import { registerImageQueryTool } from './tool-image-query.js';
import { registerPromptSections } from './prompt-sections.js';
import { registerContextInjection } from './context-inject.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Cordis plugin name */
export const name = 'dsh-plugin-glm-vision';

/** Required services */
export const inject = ['tools', 'systemPrompt', 'llm'];

/** Config schema (schemastery) — auto-exposed to DSH Settings UI */
export const Config = z.object({
  /** GLM API Key environment variable name */
  glmApiKeyEnv: z.string().default('GLM_API_KEY'),
  /** image_query tool timeout in milliseconds */
  toolTimeoutMs: z.number().step(1).min(10000).max(600000).default(120000),
  /** GLM model name */
  model: z.string().default('GLM-4.1V-Thinking-Flash'),
  /** Image description target length (characters) */
  descriptionLength: z.number().step(1).min(500).max(20000).default(4950),
  /** Enable automatic image translation for non-multimodal models */
  autoTranslate: z.boolean().default(true),
  /** Enable image_query tool registration */
  enableTool: z.boolean().default(true),
});

/**
 * Resolve API key from DSH credentials or environment.
 */
function resolveApiKey(envName) {
  if (process.env[envName]) return process.env[envName];
  const dshHome = process.env.DSH_HOME;
  if (dshHome) {
    const credPath = join(dshHome, '.credentials.yaml');
    if (existsSync(credPath)) {
      try {
        for (const line of readFileSync(credPath, 'utf-8').split('\n')) {
          const m = line.match(/^([A-Z_]+):\s*(.+)$/);
          if (m && m[1] === envName) return m[2].trim();
        }
      } catch {}
    }
  }
  return null;
}

/**
 * Read attachment file path from DSH storage.
 */
function readAttachmentPath(attachmentId) {
  const dshHome = process.env.DSH_HOME || '';
  const id = String(attachmentId || '');
  const m = id.match(/^sha256:([a-f0-9]{64})$/);
  if (!m) return null;
  const objPath = join(dshHome, 'attachments', 'v1', 'objects', m[1].slice(0, 2), m[1]);
  return existsSync(objPath) ? objPath : null;
}

/**
 * Strip image blocks and replace with image_query directive.
 */
function stripImages(messages, cache) {
  const converted = [];
  for (const message of messages) {
    if (!message.content?.some?.(b => b.type === 'image')) {
      converted.push(message);
      continue;
    }
    const newContent = [];
    for (const block of message.content) {
      if (block.type !== 'image') { newContent.push(block); continue; }

      let filePath = null;
      if (block.attachment && typeof block.attachment === 'object') {
        filePath = readAttachmentPath(block.attachment.attachmentId);
      } else if (block.data && typeof block.data === 'string') {
        try {
          const cached = cache.store(Buffer.from(block.data, 'base64'), block.mediaType || 'image/png');
          filePath = cached.path;
        } catch {}
      }

      const pathHint = filePath || '（路径未知，请在工作目录中搜索图片文件）';
      newContent.push({
        type: 'text',
        text: `[用户发送了一张图片。图片文件路径: ${pathHint}]\n\n请立即调用 image_query 工具来分析这张图片的内容，然后回答用户的问题。`
      });
    }
    converted.push({ ...message, content: newContent });
  }
  return converted;
}

/**
 * Plugin activation — official DSH pattern.
 */
export function apply(ctx, config) {
  const { glmApiKeyEnv, toolTimeoutMs, model, descriptionLength, autoTranslate, enableTool } = config;

  const apiKey = resolveApiKey(glmApiKeyEnv);
  if (!apiKey || apiKey.startsWith('请填入')) {
    process.stderr.write(`${name}: no API key (env: ${glmApiKeyEnv}), disabled.\n`);
    return;
  }

  const cache = new ImageCache();
  process.stderr.write(`${name}: loaded (model: ${model}, cache: ${cache.stats().entries} entries).\n`);

  // ═══ Module 1 Step 1: Patch resolveModelInfo ═══
  if (autoTranslate) {
    const origResolve = ctx.llm.resolveModelInfo.bind(ctx.llm);
    ctx.llm.resolveModelInfo = async function (provider, modelId, signal) {
      const info = await origResolve(provider, modelId, signal);
      if (!info.inputModalities) info.inputModalities = ['text', 'image'];
      else if (!info.inputModalities.includes('image')) info.inputModalities = [...info.inputModalities, 'image'];
      return info;
    };

    // ═══ Module 1 Step 2: Patch adapter streams ═══
    function patchAdapter(adapter) {
      if (adapter._glmPatched) return;
      const origStream = adapter.stream.bind(adapter);
      adapter.stream = async function* (options) {
        const hasImage = options.messages?.some(msg => msg.content?.some?.(b => b.type === 'image'));
        if (!hasImage) { yield* origStream(options); return; }
        try {
          const stripped = stripImages(options.messages, cache);
          yield* origStream({ ...options, messages: stripped });
        } catch (err) {
          process.stderr.write(`${name}: stream error: ${err.message}\n`);
          const fallback = options.messages.map(msg => ({
            ...msg,
            content: msg.content?.map(b => b.type === 'image' ? { type: 'text', text: '[图片]' } : b) || msg.content
          }));
          yield* origStream({ ...options, messages: fallback });
        }
      };
      adapter._glmPatched = true;
    }

    if (ctx.llm.adapters) {
      for (const reg of ctx.llm.adapters.values()) {
        if (reg.adapter) patchAdapter(reg.adapter);
      }
    }
    ctx.on('llm/adapters-updated', () => {
      if (ctx.llm.adapters) {
        for (const reg of ctx.llm.adapters.values()) {
          if (reg.adapter) patchAdapter(reg.adapter);
        }
      }
    });
    process.stderr.write(`${name}: image translation layer active.\n`);
  }

  // ═══ Module 3: image_query tool ═══
  if (enableTool) {
    registerImageQueryTool(ctx, { apiKey, cache, timeoutMs: toolTimeoutMs });
  }

  // ═══ Module 4: System prompt ═══
  registerPromptSections(ctx);

  // ═══ Module 5: Old conversation compat ═══
  registerContextInjection(ctx, { pluginInstalledAt: Date.now() });

  process.stderr.write(`${name}: all modules active.\n`);
}
