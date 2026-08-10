import type { Lang } from "@/i18n";
import { currentLang } from "@/i18n";

export interface ExternalAiSetupContent {
  title: string;
  intro: string;
  prompt: string;
  safety: string;
  modelIds: string;
}

const enPrompt = [
  "I use an app called Alt Theory. It reads its model configuration from",
  "~/.alt-theory/pi-agent/models.json (Windows: %USERPROFILE%\\.alt-theory\\pi-agent\\models.json).",
  "It does NOT read ~/.pi/ or any other agent's configuration.",
  "",
  "The file looks like this:",
  "",
  "{",
  '  "providers": {',
  '    "<provider-name>": {',
  '      "baseUrl": "<endpoint URL>",',
  '      "api": "openai-completions" | "openai-responses" | "anthropic-messages",',
  '      "apiKey": "<the key, or the name of an environment variable>",',
  '      "models": [{ "id": "<model id>" }]',
  "    }",
  "  }",
  "}",
  "",
  "Please ask me which provider I have access to and what my key is, then show",
  "me the exact file contents to save. Explain anything I need to check first.",
  "Do not invent model ids: after the provider entry exists, I will click",
  '"Fetch model list" in Alt Theory\'s Settings and it will ask the provider',
  "itself.",
].join("\n");

const zhHansPrompt = [
  "我在用一个叫 Alt Theory 的应用。它从",
  "~/.alt-theory/pi-agent/models.json 读取模型配置",
  "（Windows：%USERPROFILE%\\.alt-theory\\pi-agent\\models.json）。",
  "它不会读取 ~/.pi/ 或其他代理的配置。",
  "",
  "文件结构如下：",
  "",
  "{",
  '  "providers": {',
  '    "<提供方名称>": {',
  '      "baseUrl": "<接口地址>",',
  '      "api": "openai-completions" | "openai-responses" | "anthropic-messages",',
  '      "apiKey": "<密钥，或环境变量名>",',
  '      "models": [{ "id": "<模型 id>" }]',
  "    }",
  "  }",
  "}",
  "",
  "请先问我有哪个提供方的访问权限、密钥是什么，然后给出我该保存的完整文件内容，",
  "并说明我需要先确认哪些事。不要臆造模型 id：提供方条目建好之后，我会在",
  "Alt Theory 的设置里点「获取模型列表」，由它去问提供方本身。",
].join("\n");

const zhHantPrompt = [
  "我正在使用一個叫 Alt Theory 的應用程式。它從",
  "~/.alt-theory/pi-agent/models.json 讀取模型設定",
  "（Windows：%USERPROFILE%\\.alt-theory\\pi-agent\\models.json）。",
  "它不會讀取 ~/.pi/ 或其他代理的設定。",
  "",
  "檔案結構如下：",
  "",
  "{",
  '  "providers": {',
  '    "<提供方名稱>": {',
  '      "baseUrl": "<介面地址>",',
  '      "api": "openai-completions" | "openai-responses" | "anthropic-messages",',
  '      "apiKey": "<密鑰，或環境變數名稱>",',
  '      "models": [{ "id": "<模型 id>" }]',
  "    }",
  "  }",
  "}",
  "",
  "請先問我可以使用哪個提供方、密鑰是甚麼，然後給出我要儲存的完整檔案內容，",
  "並說明我需要先確認哪些事項。不要臆造模型 id：提供方項目建立後，我會在",
  "Alt Theory 的設定中按「取得模型清單」，由它直接查詢提供方。",
].join("\n");

export const EXTERNAL_AI_SETUP: Record<Lang, ExternalAiSetupContent> = {
  en: {
    title: "Configure models with another AI",
    intro:
      "Copy this prompt into ChatGPT, Kimi, DeepSeek, Gemini, or a local agent that can edit files.",
    prompt: enPrompt,
    safety:
      "An API key is a password. Only give it to a tool you trust.",
    modelIds:
      "After the provider entry exists, use Fetch model list in Settings. It asks the provider directly instead of trusting an AI to invent current model IDs.",
  },
  "zh-Hans": {
    title: "让另一个 AI 帮你配置模型",
    intro:
      "把这段提示词复制到 ChatGPT、Kimi、DeepSeek、Gemini，或能编辑文件的本地代理中。",
    prompt: zhHansPrompt,
    safety: "API 密钥等同于密码，只交给你信任的工具。",
    modelIds:
      "提供方条目建好后，在设置中使用「获取模型列表」。它会直接询问提供方，不让 AI 臆造当前模型 ID。",
  },
  "zh-Hant-HK": {
    title: "讓另一個 AI 協助設定模型",
    intro:
      "把這段提示複製到 ChatGPT、Kimi、DeepSeek、Gemini，或能編輯檔案的本地代理。",
    prompt: zhHantPrompt,
    safety: "API 密鑰等同密碼，只交給你信任的工具。",
    modelIds:
      "建立提供方項目後，請在設定中使用「取得模型清單」。它會直接查詢提供方，不讓 AI 臆造目前的模型 ID。",
  },
};

export function externalAiSetupContent(
  lang = currentLang(),
): ExternalAiSetupContent {
  return EXTERNAL_AI_SETUP[lang];
}
