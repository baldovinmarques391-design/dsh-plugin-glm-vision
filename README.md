# dsh-plugin-glm-vision

给 [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) 加上"看图"能力的插件。

即使你用的模型本身不支持图片（比如纯文本的 DeepSeek），装了这个插件后，用户发送的图片会被自动转发给智谱 GLM-4V-Flash 视觉模型，生成的文字描述会注入对话中，让模型"看到"图片内容。

## 它能做什么

- **自动图片翻译**：用户上传图片 → 插件拦截 → 调用 GLM-4V-Flash 生成描述 → 作为文本发给模型
- **image_query 工具**：模型可以主动调用这个工具来分析任意图片（支持多张）
- **图片缓存**：相同图片不会重复请求 API（SHA-256 去重）
- **多图支持**：一条消息里发多张图片，每张都会被分别描述
- **旧对话兼容**：已在进行中的对话也能识别新发的图片

## 安装

### 前提条件

- DSH 已安装且可正常运行
- [pnpm](https://pnpm.io/) 已安装
- 智谱 AI 的 API Key（[申请地址](https://open.bigmodel.cn/)）

### 第一步：安装插件

```bash
dsh plugin --profile web add git+https://github.com/baldovinmarques391-design/dsh-plugin-glm-vision.git
```

> 安装后需要手动将 `dsh-plugin-glm-vision` 添加到 bundles 列表。编辑 `$DSH_HOME/profiles/web/package.json`，在 `dsh.profile.bundles` 数组中加入 `"dsh-plugin-glm-vision"`：
> ```json
> "dsh": {
>   "profile": {
>     "bundles": [
>       "@deepseek-ai/dsh-base",
>       "@deepseek-ai/dsh-web-app",
>       "dsh-plugin-glm-vision"
>     ]
>   }
> }
> ```

### 第二步：配置 API Key

在 `$DSH_HOME/.credentials.yaml` 中添加：

```yaml
GLM_API_KEY: 你的智谱API密钥
```

### 第三步：重启 DSH

重启后，控制台应出现以下日志，表示插件加载成功：

```
dsh-plugin-glm-vision: loaded (model: GLM-4V-Flash, cache: 0 entries).
dsh-plugin-glm-vision: image translation layer active.
dsh-plugin-glm-vision: all modules active.
```

## 配置项

插件安装后会自动在 DSH 设置界面中显示配置项。也可通过 `cordis.patch.yml` 手动配置：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `glmApiKeyEnv` | `GLM_API_KEY` | 存放 API Key 的环境变量名 |
| `toolTimeoutMs` | `120000` | image_query 工具超时时间（毫秒） |
| `model` | `GLM-4.1V-Thinking-Flash` | 使用的 GLM 模型名 |
| `autoTranslate` | `true` | 是否自动翻译图片 |
| `enableTool` | `true` | 是否注册 image_query 工具 |

## 工作原理

```
用户发送图片
    ↓
插件拦截消息，提取图片
    ↓
调用 GLM-4V-Flash API 生成图片描述
    ↓
用文字描述替换原始图片
    ↓
模型收到文字描述，正常回复
```

同时，插件会注册 `image_query` 工具，模型可以在任何时候主动调用来分析图片。

## 测试结果

| 场景 | 结果 |
|------|------|
| 单张图片 | ✅ 正确识别并描述 |
| 两张图片同时发送 | ✅ 分别描述每张图片 |
| 旧对话中发新图片 | ✅ 描述图片 + 保持上下文 |
| 纯文本对话 | ✅ 正常工作，不影响 |
| 进程稳定性 | ✅ 无崩溃 |

## 已知限制

- GLM-4V-Flash 的 max_tokens 上限为 1024，图片描述可能不够详细
- 需要对 DSH 内置的 LLM 适配器进行源码级 patch（插件启动时自动处理，但 DSH 更新后 patch 会丢失）

## 许可证

MIT
