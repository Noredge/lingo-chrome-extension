const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULTS = { baseUrl: DEFAULT_BASE_URL, uiLanguage: "auto", model: "gpt-6-luna", language: "简体中文", languages: ["简体中文", "English"], blockedHosts: [] };
const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español", "Português（葡萄牙语）", "Italiano（意大利语）", "Nederlands（荷兰语）", "Русский（俄语）", "Українська（乌克兰语）", "Polski（波兰语）", "Čeština（捷克语）", "Svenska（瑞典语）", "Dansk（丹麦语）", "Norsk（挪威语）", "Suomi（芬兰语）", "Ελληνικά（希腊语）", "Türkçe（土耳其语）", "العربية（阿拉伯语）", "עברית（希伯来语）", "فارسی（波斯语）", "हिन्दी（印地语）", "বাংলা（孟加拉语）", "ไทย（泰语）", "Tiếng Việt（越南语）", "Bahasa Indonesia（印尼语）", "Bahasa Melayu（马来语）", "Filipino（菲律宾语）"];
const MODES = { translate: "翻译", proofread: "校对", natural: "自然", professional: "专业", friendly: "友好", concise: "简洁", precise: "精准", custom: "自定义" };
function normalizeBaseUrl(value) {
  try {
    if (typeof value !== "string" || value.length > 512 || /[\s\\]/.test(value)) throw 0;
    const u = new URL(value);
    if (u.username || u.password || u.search || u.hash) throw 0;
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) throw 0;
    u.pathname = u.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "").replace(/\/+$/, "");
    return u.href.replace(/\/$/, "");
  } catch {
    throw new Error("请输入有效的 HTTPS Base URL，不包含账号、查询参数或片段；本机服务可使用 HTTP。");
  }
}
function apiOrigin(base) {
  const u = new URL(normalizeBaseUrl(base));
  return `${u.protocol}//${u.hostname}/*`;
}
export {
  DEFAULTS as D,
  LANGUAGES as L,
  MODES as M,
  apiOrigin as a,
  normalizeBaseUrl as n
};
