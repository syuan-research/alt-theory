import type { Lang } from "@/i18n";
import { currentLang } from "@/i18n";

export interface ExternalAiSetupContent {
  title: string;
  intro: string;
  safety: string;
  modelIds: string;
  chatLabel: string;
  agentLabel: string;
  chatPrompt: string;
  agentPrompt: string;
  agentDocsLine: string;
}

const enPrompt = [
  "I'm adding an AI provider in a desktop app. Below is the setup guide the app gave me:",
  "",
  "The form has four fields (see the attached image if there is one): Name, Base URL (baseUrl), API type (openai-completions / openai-responses / anthropic-messages — pick one), and API key.",
  "",
  "Ask the user:",
  "1. If the user hasn't said, first ask which provider(s) they plan to use, e.g. DeepSeek, Opencode Go, etc. If already stated, skip.",
  "2. If the user hasn't said, ask whether they need help finding the page to get an API key. If so, help as much as possible, using language that someone who has never used an API can understand; keep jargon to a minimum.",
  "3. If the user has an API key, provide the three items other than the API key. If you are not sure about the baseUrl or which API type to choose, follow the provider's official documentation's current recommendation; if you cannot go online, use your own knowledge. The model list can be pulled inside the app; thinking levels are auto-fetched too, but if you search the web later, help the user find the latest list of thinking levels.",
  "",
  "When explaining, don't pile up too many terms at once; if this takes several rounds, cover only a few points each round and move forward step by step.",
].join("\n");

const enAgentPrompt = [
  "I'm using a desktop app and need to add an AI provider. If you cannot read or write files on this machine, say so directly and give me steps to do it myself instead — that's all.",
  "",
  "Target file: ~/.alt-theory/pi-agent/models.json (create it if it doesn't exist). Target structure:",
  "",
  "{",
  '  "providers": {',
  '    "<provider name>": {',
  '      "baseUrl": "<endpoint URL>",',
  '      "api": "openai-completions" | "openai-responses" | "anthropic-messages",',
  '      "apiKey": "<the key, or the name of an environment variable>",',
  '      "models": [{ "id": "<model id>" }]',
  "    }",
  "  }",
  "}",
  "",
  "Ask me three things first:",
  "1. Which provider am I adding?",
  "2. Is it a subscription or an API key? Subscriptions (e.g. ChatGPT subscription, Grok subscription, Kimi Code subscription) go through OAuth login — I sign in inside the app myself and you have nothing to write; just guide me through the login.",
  "3. Which tools have I configured this provider in before?",
  "",
  "Then scout: fetch the configured providers and keys from the tools I named; check this machine's environment variables for existing API keys (names only, values not needed); read the existing models.json; check your own harness's model support table.",
  "",
  "Order for model ids: first look at the model catalog the app has recorded — real ids for this provider are often already there (results of \"Fetch model list\" are recorded in it); then your harness's model support table; then fetch this provider's model list endpoint online; if still nothing, leave the array empty and tell me the two-step finish — open the provider in the app, click \"Fetch model list\", save.",
  "",
  "After scouting, report to me: what you found, what's missing, and how I should fill the gaps (get it now / paste it later / switch provider). Write only after I confirm what to use.",
  "",
  "Then ask me the division of labor: you edit the file directly, or you give me steps to do it myself.",
  "",
  "Before writing, copy the original file to a timestamped copy in the same directory (e.g. models.json.bak-20260916-2130); skip the backup if the file doesn't exist. After writing, report what changed and what you didn't touch, and let me click \"Test connection\" in the app.",
].join("\n");

const enAgentDocsLine =
  "For more detailed documentation see: {{docsRoot}}\\docs\\en\\system-guide\\models-providers-access.md";

const zhHansPrompt = [
  "我要在一个桌面应用里添加一个 AI 服务商，下面是它给我的配置指南：",
  "",
  "要填的表单一共四项 （若有附图，见附图）：名称、基础 URL（baseUrl）、API 类型（openai-completions / openai-responses / anthropic-messages 三选一）、API 密钥。",
  "",
  "询问用户：",
  "1. 若用户没有说，先问准备使用哪些服务商，如 Deepseek，Opencode Go 等等。若已说明，跳过。",
  "2. 若用户没有说，问是否需要讲解去哪个页面找到 API key，若需要，尽可能协助用户，要使用即使没有使用过api的人也能理解的语言，减少术语。",
  "3. 如果用户有 api key，提供除 API key之外的三项信息，如果你不确定 baseUrl 或该选哪种 API 类型，以这家服务商官方文档当前的推荐为准，如果不能联网就按你的内部知识。模型列表在应用里可以自己拉取，思考强度也有自动拉取，但你若后续联网搜索，请帮助用户找到最新的思考强度列表。",
  "",
  "解释时不要一次堆太多术语；如果要分多轮解决，每轮只讲几个要点，逐步推进。",
].join("\n");

const zhHansAgentPrompt = [
  "我在用一个桌面应用，需要添加一个 AI 服务商。你没有读写本机文件的能力就直说，改为给我自己操作的步骤，到此为止。",
  "",
  "目标文件：~/.alt-theory/pi-agent/models.json（不存在就由你创建）。目标结构：",
  "",
  "{",
  '  "providers": {',
  '    "<服务商名称>": {',
  '      "baseUrl": "<接口地址>",',
  '      "api": "openai-completions" | "openai-responses" | "anthropic-messages",',
  '      "apiKey": "<密钥明文，或环境变量名>",',
  '      "models": [{ "id": "<模型 id>" }]',
  "    }",
  "  }",
  "}",
  "",
  "先问我三件事：",
  "1. 打算接哪家服务商？",
  "2. 它是订阅制还是 API key？订阅制（如 ChatGPT 订阅、Grok 订阅、Kimi Code 订阅）走 OAuth 登录，key 由我在应用里自己登录取得，你没有可写的——指引我完成登录即可。",
  "3. 这家服务商我之前在哪些工具里已经配过？",
  "",
  "然后侦察：到我点名的工具配置里取已配的服务商和 key；查这台机器环境变量里现成的 API key（只要变量名，值不需要）；读现有 models.json；查你所在 harness 的模型支持表。",
  "",
  "模型 id 的获取顺序：先看应用记录的模型缓存，里面常已有这家服务商的真实 id（「获取模型列表」的结果就记在这里）；再看你所在 harness 的模型支持表；不够再联网调这家服务商的模型列表接口；还拿不到就留空数组，并告诉我两步收尾——应用里打开该服务商，点「获取模型列表」，保存。",
  "",
  "侦察完向我汇报：找到了什么、缺什么、缺的部分我怎么补（现在去拿 / 稍后粘贴 / 换一家）。我确认用哪些之后你才写。",
  "",
  "再问我分工：文件由你直接改，还是你给出步骤我自己改。",
  "",
  "动手前把原文件复制成同目录的时间戳副本（如 models.json.bak-20260916-2130）；文件不存在就跳过备份。写完汇报改了什么、什么没做，让我在应用里点「测试连接」。",
].join("\n");

const zhHansAgentDocsLine =
  "更仔细的说明见：{{docsRoot}}\\docs\\zh-Hans\\system-guide\\02-models-providers-access.md";

const zhHantPrompt = [
  "我要在一個桌面 app 加一個 AI 服務商，下面是它給我的設定指南：",
  "",
  "要填的表單一共四項（若有附圖，見附圖）：名稱、基礎 URL（baseUrl）、API 類型（openai-completions / openai-responses / anthropic-messages 三選一）、API 密鑰。",
  "",
  "詢問用戶：",
  "1. 如果用戶沒有說，先問打算用哪些服務商，例如 DeepSeek、Opencode Go 等；已經說了就跳過。",
  "2. 如果用戶沒有說，問是否需要講解去哪個頁面取得 API key；需要就盡量協助，用就算沒用過 API 都聽得明的講法，少用術語。",
  "3. 如果用戶有 API key，就提供 API key 以外的三項。baseUrl 或 API 類型不確定的話，以這家服務商官方文件的最新建議為準；不能上網就靠你的內部知識。模型清單在 app 內可以自己拉取，思考強度也有自動拉取；但你之後如果有上網搜尋，請幫用戶找最新的思考強度清單。",
  "",
  "解釋時不要一次過塞太多術語；如果要分多輪處理，每輪只講幾個重點，逐步推進。",
].join("\n");

const zhHantAgentPrompt = [
  "我在用一個桌面 app，需要加一個 AI 服務商。你不能讀寫本機檔案就直接講，改為給我步驟自己操作。",
  "",
  "目標檔案：~/.alt-theory/pi-agent/models.json（不存在就由你建立）。目標結構：",
  "",
  "{",
  '  "providers": {',
  '    "<服務商名稱>": {',
  '      "baseUrl": "<介面地址>",',
  '      "api": "openai-completions" | "openai-responses" | "anthropic-messages",',
  '      "apiKey": "<密鑰明文，或環境變數名稱>",',
  '      "models": [{ "id": "<模型 id>" }]',
  "    }",
  "  }",
  "}",
  "",
  "先問我三件事：",
  "1. 打算接哪家服務商？",
  "2. 是訂閱還是 API key？訂閱（如 ChatGPT 訂閱、Grok 訂閱、Kimi Code 訂閱）經 OAuth 登入，key 由我在 app 內自己登入取得，你沒有可寫的——引導我完成登入就可以。",
  "3. 這家服務商我之前在哪些工具配過？",
  "",
  "然後偵察：到我點名的工具設定裡取已配的服務商和 key；查這台機器的環境變數有沒有現成 API key（只要變數名，值不用）；讀現有 models.json；看你所在 harness 的模型支援表。",
  "",
  "模型 id 的取得順序：先看 app 記錄的模型快取，裡面多數已有這家服務商的真實 id（「取得模型清單」的結果就記在這裡）；再看 harness 的模型支援表；不夠就上網調這家服務商的模型清單 API；再拿不到就留空陣列，並告訴我兩步收尾——在 app 內打開該服務商，按「取得模型清單」，儲存。",
  "",
  "偵察完向我彙報：找到什麼、缺什麼、缺的部分怎麼補（現在去拿／稍後貼上／轉用另一家）。我確認用哪些你才寫。",
  "",
  "再問我分工：檔案由你直接改，還是給我步驟我自己改。",
  "",
  "動手前把原檔案複製成同目錄的時間戳副本（例如 models.json.bak-20260916-2130）；檔案不存在就不用備份。寫完彙報改了什麼、沒動什麼，讓我在 app 內按「測試連線」。",
].join("\n");

const zhHantAgentDocsLine =
  "更詳細的說明見：{{docsRoot}}\\docs\\zh-Hans\\system-guide\\02-models-providers-access.md";

export const EXTERNAL_AI_SETUP: Record<Lang, ExternalAiSetupContent> = {
  en: {
    title: "Configure models with another AI",
    intro:
      "Copy the matching prompt to the other side. For a web chatbot, use the first prompt and attach a screenshot of the provider form in Settings; for an agent that can edit files, use the second prompt.",
    safety: "An API key is a password. Only give it to a tool you trust.",
    modelIds: "After the provider entry exists, use Fetch model list in Settings.",
    chatLabel: "For a web chatbot",
    agentLabel: "For an agent that can edit files",
    chatPrompt: enPrompt,
    agentPrompt: enAgentPrompt,
    agentDocsLine: enAgentDocsLine,
  },
  "zh-Hans": {
    title: "让另一个 AI 帮你配置模型",
    intro:
      "把对应的提示词复制给对方。网页聊天机器人用第一段，发送时附一张设置页的表单截图；能编辑文件的 agent 用第二段。",
    safety: "API 密钥等同于密码，只交给你信任的工具。",
    modelIds: "提供方条目建好后，在设置中使用「获取模型列表」。",
    chatLabel: "给网页聊天机器人",
    agentLabel: "给能编辑文件的 agent",
    chatPrompt: zhHansPrompt,
    agentPrompt: zhHansAgentPrompt,
    agentDocsLine: zhHansAgentDocsLine,
  },
  "zh-Hant-HK": {
    title: "讓另一個 AI 協助設定模型",
    intro:
      "把對應的提示複製給對方。網頁聊天機器人用第一段，傳送時附上一張設定頁的表單截圖；能編輯檔案的 agent 用第二段。",
    safety: "API 密鑰等同密碼，只交給你信任的工具。",
    modelIds: "建立提供方項目後，請在設定中使用「取得模型清單」。",
    chatLabel: "給網頁聊天機器人",
    agentLabel: "給能編輯檔案的 agent",
    chatPrompt: zhHantPrompt,
    agentPrompt: zhHantAgentPrompt,
    agentDocsLine: zhHantAgentDocsLine,
  },
};

export function externalAiSetupContent(
  lang = currentLang(),
): ExternalAiSetupContent {
  return EXTERNAL_AI_SETUP[lang];
}
