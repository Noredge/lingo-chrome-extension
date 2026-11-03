import { l as localize, s as setLanguage, t } from "./i18n-BW9HZsYX.js";
import { M as MODES, D as DEFAULTS } from "./core-DItjoKfo.js";
localize(document);
const $ = (id) => document.getElementById(id);
const language = $("language");
let settings = { ...DEFAULTS }, windowId = 0, source = "", result = "", lastMode = "translate", port = null, generation = 0, timer;
let sourceTabId = -1, lastSelection = "", inboxQueue = Promise.resolve();
async function configure() {
  const c = await chrome.runtime.sendMessage({ type: "config" });
  if (!c.settings) throw new Error(c.error || "无法读取设置。");
  settings = c.settings;
  setLanguage(settings.uiLanguage);
  const old = language.value;
  language.replaceChildren(...settings.languages.map((l) => {
    const option = new Option(l.split("（")[0], l);
    option.translate = false;
    return option;
  }));
  language.value = settings.languages.includes(old) ? old : settings.language;
  $("destination").textContent = t("数据传送到：") + settings.baseUrl + "/chat/completions";
}
function stop() {
  generation++;
  clearTimeout(timer);
  port?.disconnect();
  port = null;
  $("stop").disabled = true;
}
function clear() {
  stop();
  source = result = "";
  $("selection").hidden = true;
  $("empty").hidden = false;
  $("side-source").textContent = $("side-result").textContent = $("status").textContent = "";
}
async function run(mode) {
  stop();
  const runId = generation;
  result = "";
  lastMode = mode;
  $("side-result").textContent = "";
  $("status").textContent = "正在生成…";
  $("copy").disabled = true;
  try {
    await configure();
    if (runId !== generation || !source) return;
    const p = chrome.runtime.connect({ name: "lingo-task" });
    port = p;
    const id = crypto.randomUUID();
    $("stop").disabled = false;
    const watchdog = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (runId === generation) {
          stop();
          $("status").textContent = "连接中断或后台已休眠，请重试。";
        }
      }, 35e3);
    };
    watchdog();
    p.onMessage.addListener((e) => {
      if (runId !== generation || e.id !== id) return;
      watchdog();
      if (e.type === "delta") {
        result += e.text;
        $("side-result").textContent = result;
      }
      if (e.type === "done") {
        stop();
        $("status").textContent = "";
        $("copy").disabled = false;
      }
      if (e.type === "error") {
        stop();
        $("status").textContent = e.error;
      }
    });
    p.onDisconnect.addListener(() => {
      if (runId === generation) {
        stop();
        $("status").textContent = "连接已中断，请重试。";
      }
    });
    p.postMessage({ type: "run", task: { id, text: source, mode, language: language.value } });
  } catch (e) {
    if (runId === generation) {
      stop();
      $("status").textContent = e.message;
    }
  }
}
async function receive() {
  const item = await chrome.runtime.sendMessage({ type: "panelSelection", windowId });
  if (!item?.id || item.id === lastSelection) return;
  lastSelection = item.id;
  clear();
  sourceTabId = item.tabId;
  source = item.text;
  $("side-source").textContent = source;
  $("selection").hidden = false;
  $("empty").hidden = true;
  await run("translate");
}
function queueReceive() {
  inboxQueue = inboxQueue.catch(() => {
  }).then(receive);
}
for (const mode of ["translate", "proofread", "natural", "concise"]) {
  const b = document.createElement("button");
  b.textContent = MODES[mode];
  b.onclick = () => void run(mode);
  $("presets").append(b);
}
$("settings").onclick = () => void chrome.runtime.openOptionsPage();
$("retry").onclick = () => void run(lastMode);
$("stop").onclick = () => {
  stop();
  $("status").textContent = "已停止生成。";
};
$("clear").onclick = clear;
$("copy").onclick = () => {
  void navigator.clipboard.writeText(result).then(() => {
    $("status").textContent = "已复制";
  }).catch(() => {
    $("status").textContent = "复制失败，请选中结果手动复制。";
  });
};
language.onchange = () => void run("translate");
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes["panel:" + windowId]?.newValue) queueReceive();
  if (area === "local" && changes.settings) void configure();
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === sourceTabId && change.status === "loading") clear();
});
chrome.tabs.onRemoved.addListener((id) => {
  if (id === sourceTabId) clear();
});
chrome.tabs.onActivated.addListener((info) => {
  if (info.windowId === windowId) clear();
});
void chrome.windows.getCurrent().then(async (w) => {
  windowId = w.id;
  await configure();
  queueReceive();
}).catch((e) => {
  $("empty").textContent = e.message;
});
window.addEventListener("pagehide", () => {
  stop();
});
