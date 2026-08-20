/**
 * image_query Tool — Official DSH defineTool pattern.
 * @module dsh-plugin-glm-vision/tool-image-query
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import { callGlmVision, resolveImageSource } from './glm-api.js';

/**
 * Register the image_query tool.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} options
 */
export function registerImageQueryTool(ctx, options) {
  const { apiKey, cache, timeoutMs = 120_000 } = options;

  ctx.tools.register(defineTool({
    name: 'image_query',
    description: '向视觉大模型（GLM-4.1V-Thinking-Flash）发送图片并提出问题，获取视觉分析结果。支持本地文件路径和网络URL。可以一次发送多张图片。',
    parameters: {
      paths: {
        type: 'array',
        required: true,
        description: '图片路径数组。每个元素可以是本地文件绝对路径或网络URL（http/https）。',
        items: { type: 'string' }
      },
      question: {
        type: 'string',
        required: true,
        description: '针对这些图片提出的问题。'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          answer: { type: 'string', required: true },
          imageCount: { type: 'integer', required: true }
        }
      },
      render(_args, value) {
        return [{ type: 'text', text: value.answer }];
      }
    },
    timeoutMs,
    isConcurrencySafe() { return true; },

    async execute(args, exec) {
      const { paths, question } = args;
      if (!Array.isArray(paths) || paths.length === 0) throw new Error('paths must be a non-empty array');
      if (typeof question !== 'string' || question.trim().length === 0) throw new Error('question must be a non-empty string');

      const cachedImages = [];
      for (const source of paths) {
        try {
          let result;
          if (source.startsWith('http://') || source.startsWith('https://')) {
            result = await cache.storeUrl(source, exec.signal);
          } else {
            result = cache.storeFile(source);
          }
          cachedImages.push(result);
        } catch (err) {
          throw new Error(`Failed to process image "${source}": ${err.message}`);
        }
      }

      if (cachedImages.length === 1) {
        const imageUrl = resolveImageSource(cachedImages[0].path);
        const answer = await callGlmVision(apiKey, imageUrl, question, exec.signal);
        return { answer, imageCount: 1 };
      }

      const answers = [];
      for (let i = 0; i < cachedImages.length; i++) {
        const imageUrl = resolveImageSource(cachedImages[i].path);
        const q = `这是第 ${i + 1}/${cachedImages.length} 张图片。${question}`;
        const answer = await callGlmVision(apiKey, imageUrl, q, exec.signal);
        answers.push(`[图片 ${i + 1}]\n${answer}`);
      }
      return { answer: answers.join('\n\n---\n\n'), imageCount: cachedImages.length };
    },

    presentCall(args) {
      return {
        card: 'generic',
        title: `image_query: ${(args.question || '').slice(0, 60)}`,
        kind: 'vision',
        rawInput: JSON.stringify(args)
      };
    },
    presentResult(args, result) {
      if (result.isError) return undefined;
      return {
        card: 'generic',
        title: `image_query: ${(args.question || '').slice(0, 60)}`,
        kind: 'vision-result'
      };
    }
  }));
}
