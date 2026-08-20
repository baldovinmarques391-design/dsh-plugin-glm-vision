# dsh-plugin-glm-vision

DSH (DeepSeek Harness) 插件 — 为不支持多模态输入的模型提供图片视觉能力。

## 功能

### 模块 1: 图片翻译层 (Image Translation Layer)
- 拦截发送给不支持图片的模型的消息
- 自动提取图片，调用 GLM-4V-Flash 生成描述
- 将描述作为文本注入消息，模型无需原生支持图片

### 模块 2: 图片持久化缓存 (Image Cache)
- SHA-256 内容寻址去重
- 缓存目录: `$DSH_HOME/image-cache/`

### 模块 3: image_query 视觉问答工具
- LLM 可调用的工具，支持单图/多图分析
- 底层调用 GLM-4V-Flash

### 模块 4: 系统提示词
- 向模型声明 image_query 工具的存在和用法

### 模块 5: 旧对话兼容注入
- 在已有对话中注入工具声明

## 配置

在 `cordis.patch.yml` 中配置:

```yaml
- insert:
    - id: glm-vision
      name: ../plugins/dsh-plugin-glm-vision/index.js
      config:
        glmApiKeyEnv: GLM_API_KEY    # 环境变量名
        toolTimeoutMs: 120000        # 工具超时(ms)
        model: GLM-4V-Flash          # GLM模型名
        descriptionLength: 4950      # 描述目标字数
        autoTranslate: true          # 自动翻译图片
        enableTool: true             # 注册image_query工具
```

API Key 存放在 `$DSH_HOME/.credentials.yaml`:
```yaml
GLM_API_KEY: your-api-key-here
```

## 已知限制

- 需要对 `dsh-llm-deepseek` 和 `dsh-llm-pi-ai` 适配器进行源码 patch（绕过图片内容检查）
- GLM-4V-Flash 的 max_tokens 限制为 1024

## 测试结果 (2026-08-20)

| 测试场景 | 结果 |
|---------|------|
| 单图片识别 | ✅ 通过 |
| 双图片上传 (同一条消息) | ✅ 通过 — 模型分别描述了两张图片 |
| 旧对话 + 新图片 | ✅ 通过 — 模型描述图片并记住之前的暗号 |
| 非图片文件处理 | ✅ 通过 — 无崩溃，正常响应 |
| 进程稳定性 | ✅ 通过 — 无 EPIPE 崩溃 |

## 安装

1. 将插件目录复制到 `$DSH_HOME/profiles/plugins/dsh-plugin-glm-vision/`
2. 在 `cordis.patch.yml` 中添加插件条目
3. 在 `.credentials.yaml` 中配置 `GLM_API_KEY`
4. 重启 DSH

## 版本

- v2.1.0 — 修复 max_tokens、EPIPE、adapter patch
