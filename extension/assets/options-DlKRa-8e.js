import "./ui-BOAe4Mgc.js";
const DEFAULTS = { languages: ["简体中文", "English"] };
const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español", "Português（葡萄牙语）", "Italiano（意大利语）", "Nederlands（荷兰语）", "Русский（俄语）", "Українська（乌克兰语）", "Polski（波兰语）", "Čeština（捷克语）", "Svenska（瑞典语）", "Dansk（丹麦语）", "Norsk（挪威语）", "Suomi（芬兰语）", "Ελληνικά（希腊语）", "Türkçe（土耳其语）", "العربية（阿拉伯语）", "עברית（希伯来语）", "فارسی（波斯语）", "हिन्दी（印地语）", "বাংলা（孟加拉语）", "ไทย（泰语）", "Tiếng Việt（越南语）", "Bahasa Indonesia（印尼语）", "Bahasa Melayu（马来语）", "Filipino（菲律宾语）"];
const $ = (id) => document.getElementById(id);
const key = $("api-key"), model = $("model"), language = $("language"), storageMode = $("storage-mode");
let selectedLanguages = [...DEFAULTS.languages];
function drawLanguages(preferred = language.value) {
  language.replaceChildren();
  $("language-list").replaceChildren();
  for (const l of selectedLanguages) {
    const o = document.createElement("option");
    o.value = o.textContent = l;
    language.append(o);
    const chip = document.createElement("span");
    chip.className = "language-chip";
    const text = document.createElement("span");
    text.textContent = l;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `移除 ${l}`);
    remove.disabled = selectedLanguages.length === 1;
    remove.addEventListener("click", () => {
      const current = language.value;
      selectedLanguages = selectedLanguages.filter((x) => x !== l);
      drawLanguages(current);
    });
    chip.append(text, remove);
    $("language-list").append(chip);
  }
  language.value = selectedLanguages.includes(preferred) ? preferred : selectedLanguages[0];
  const add = $("add-language");
  add.replaceChildren();
  LANGUAGES.filter((l) => !selectedLanguages.includes(l)).forEach((l) => {
    const o = document.createElement("option");
    o.value = o.textContent = l;
    add.append(o);
  });
  add.disabled = selectedLanguages.length === LANGUAGES.length;
  $("add-language-button").disabled = add.disabled;
}
$("add-language-button").addEventListener("click", () => {
  const value = $("add-language").value;
  if (value && !selectedLanguages.includes(value)) {
    selectedLanguages.push(value);
    drawLanguages();
  }
});
async function message(data) {
  const result = await chrome.runtime.sendMessage(data);
  if (result.error) throw new Error(result.error);
  return result;
}
function status(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error", error);
}
function drawStorage() {
  const mode = storageMode.value;
  $("password-fields").hidden = mode !== "encrypted";
  $("device-disclosure").hidden = mode !== "device";
  $("storage-help").textContent = mode === "device" ? "保存一次，重启 Chrome 后也可直接使用，无需解锁。" : mode === "encrypted" ? "重启 Chrome 或重载扩展后解锁一次，之后的划词与打开浮窗都不需要重复输入密码。" : "关闭浏览器或重载扩展后，需要重新填写 Key。";
}
function draw(c) {
  model.value = c.settings.model;
  selectedLanguages = [...c.settings.languages];
  drawLanguages(c.settings.language);
  storageMode.value = c.storageMode;
  $("key-status").textContent = c.hasKey ? "Key 已配置" : c.hasVault ? "Key 已锁定" : "尚未配置 Key";
  $("key-status").classList.toggle("connected", c.hasKey);
  key.placeholder = c.hasKey ? "已保存 · 留空保留，输入新 Key 可替换" : "sk-…";
  $("key-hint").textContent = c.deviceError ? "本机凭据无法读取，请重新填写 API Key 并保存。" : c.storageMode === "device" && c.hasKey ? "已记住 Key，本机自动加密，重启 Chrome 后无需解锁。" : c.hasVault ? c.hasKey ? "已加密保存到本机，本次会话已解锁。" : "已加密保存到本机，请输入解锁密码。" : c.hasKey ? "仅保留在本次浏览器会话，不写入磁盘。" : "Key 仅在扩展后台使用，不会传给网页脚本。";
  $("migration-note").hidden = !c.migrated;
  $("unlock-section").hidden = !c.hasVault || c.hasKey;
  drawStorage();
  $("lock-key").disabled = !c.hasKey || c.storageMode === "device";
  $("lock-key").hidden = c.storageMode === "device";
  $("data-consent").checked = c.dataConsent;
  $("blocked").replaceChildren();
  if (c.settings.blockedHosts.length) {
    const title = document.createElement("p");
    title.className = "help";
    title.textContent = "已暂停的站点";
    $("blocked").append(title);
    for (const host of c.settings.blockedHosts) {
      const row = document.createElement("div");
      row.className = "site-item";
      const name = document.createElement("span");
      name.textContent = host;
      const b = document.createElement("button");
      b.textContent = "恢复";
      b.addEventListener("click", () => {
        void message({ type: "unblock", host }).then(load).catch((e) => status("site-status", e.message, true));
      });
      row.append(name, b);
      $("blocked").append(row);
    }
  }
}
async function load() {
  draw(await message({ type: "config" }));
  await sites();
}
void load().catch((e) => status("save-status", e.message, true));
$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = document.querySelector('button[type="submit"]');
  b.disabled = true;
  try {
    const c = await message({ type: "save", key: key.value.trim(), model: model.value.trim(), language: language.value, languages: selectedLanguages, storageMode: storageMode.value, deviceConsent: storageMode.value === "device", password: $("vault-password").value, passwordConfirm: $("vault-confirm").value, dataConsent: $("data-consent").checked });
    key.value = "";
    $("vault-password").value = "";
    $("vault-confirm").value = "";
    key.type = "password";
    $("reveal").textContent = "显示";
    draw(c);
    status("save-status", "设置已保存。已打开的窗口可点击重试，或关闭后重新划词。");
  } catch (e2) {
    status("save-status", e2.message, true);
  } finally {
    b.disabled = false;
  }
});
storageMode.addEventListener("change", drawStorage);
$("unlock-key").addEventListener("click", async () => {
  const password = $("unlock-password"), button = $("unlock-key");
  button.disabled = true;
  try {
    draw(await message({ type: "unlock", password: password.value }));
    status("save-status", "已解锁，本次浏览器会话可用。");
  } catch (e) {
    status("save-status", e.message, true);
  } finally {
    password.value = "";
    button.disabled = false;
  }
});
$("lock-key").addEventListener("click", async () => {
  try {
    draw(await message({ type: "lock" }));
    status("save-status", "已清除会话中的 Key 并停止正在进行的请求。");
  } catch (e) {
    status("save-status", e.message, true);
  }
});
$("reveal").addEventListener("click", () => {
  key.type = key.type === "password" ? "text" : "password";
  $("reveal").textContent = key.type === "password" ? "显示" : "隐藏";
});
$("delete-key").addEventListener("click", async () => {
  if (!confirm("删除此扩展保存的 Key？这不会撤销 OpenAI 平台上的密钥。")) return;
  try {
    draw(await message({ type: "deleteKey" }));
    key.value = "";
    status("save-status", "已删除扩展中的 Key。");
  } catch (e) {
    status("save-status", e.message, true);
  }
});
let testPort = null;
$("test").addEventListener("click", () => {
  if (testPort) {
    testPort.disconnect();
    testPort = null;
    $("test").textContent = "测试连接";
    status("save-status", "测试已停止。");
    return;
  }
  if (key.value.trim()) {
    status("save-status", "请先保存新 Key，再测试连接。", true);
    return;
  }
  const port = chrome.runtime.connect({ name: "lingo-task" });
  testPort = port;
  let complete = false;
  let output = "";
  status("save-status", "正在使用已保存的模型翻译固定示例…");
  $("test").textContent = "停止测试";
  const timer = setTimeout(() => {
    complete = true;
    status("save-status", "连接超时，请稍后再试。", true);
    finish();
  }, 35e3);
  const finish = () => {
    clearTimeout(timer);
    testPort = null;
    $("test").textContent = "测试连接";
    port.disconnect();
  };
  port.onMessage.addListener((event) => {
    if (event.type === "delta") output += event.text;
    if (event.type === "done") {
      complete = true;
      status("save-status", `连接成功 · ${output}`);
      finish();
    }
    if (event.type === "error") {
      complete = true;
      status("save-status", event.error, true);
      finish();
    }
  });
  port.onDisconnect.addListener(() => {
    clearTimeout(timer);
    if (testPort === port) {
      testPort = null;
      $("test").textContent = "测试连接";
      if (!complete) status("save-status", "连接已中断，请重试。", true);
    }
  });
  port.postMessage({ type: "run", task: { id: crypto.randomUUID(), text: "A little clearer, a little better.", mode: "translate", language: language.value } });
});
async function sites() {
  const p = await chrome.permissions.getAll();
  const origins = (p.origins || []).filter((x) => /^https?:/.test(x) && x !== "https://api.openai.com/*");
  const all = origins.includes("https://*/*") && origins.includes("http://*/*");
  $("all-sites").textContent = all ? "关闭所有网站授权" : "一键授权所有普通网页";
  $("permission-summary").textContent = all ? "已授权所有普通网页 · 划词即可使用" : origins.length ? "已授权部分站点 · 可开启所有普通网页" : "还差一步：授权网站后，划词才会自动出现入口";
  $("sites").replaceChildren();
  for (const origin of origins.filter((x) => !["http://*/*", "https://*/*"].includes(x))) {
    const row = document.createElement("div");
    row.className = "site-item";
    const text = document.createElement("span");
    text.textContent = origin;
    const b = document.createElement("button");
    b.textContent = "移除";
    b.addEventListener("click", async () => {
      await chrome.permissions.remove({ origins: [origin] });
      await message({ type: "syncSites" });
      await sites();
      status("site-status", "已移除授权，请刷新该站点已打开的页面。");
    });
    row.append(text, b);
    $("sites").append(row);
  }
}
$("all-sites").addEventListener("click", async () => {
  try {
    if ($("all-sites").textContent?.startsWith("关闭")) {
      await chrome.permissions.remove({ origins: ["https://*/*", "http://*/*"] });
      status("site-status", "已关闭所有网站授权，请刷新已打开的网页。");
    } else {
      const granted = await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] });
      status("site-status", granted ? "已启用，请刷新网页后划选文字。" : "未授权；仍可从扩展菜单临时调用。");
    }
    await message({ type: "syncSites" });
    await sites();
  } catch (e) {
    status("site-status", e.message, true);
  }
});
$("site-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const url = new URL($("site-url").value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("请输入 HTTP 或 HTTPS 网站地址。");
    const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
    await message({ type: "syncSites" });
    await sites();
    status("site-status", granted ? "站点已添加，请刷新网页后使用。" : "未授权该站点。");
  } catch (e2) {
    status("site-status", e2.message, true);
  }
});
chrome.permissions.onAdded.addListener(() => {
  void sites();
});
chrome.permissions.onRemoved.addListener(() => {
  void sites();
});
