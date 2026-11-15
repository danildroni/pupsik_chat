import { MessageBuilder } from "../shared/message"

const messageBuilder = new MessageBuilder()
const PROXY_HOST = "https://long-snow-d028" + ".danildroni10.workers.dev"

const MODELS = [
  { name: "gemini-3.6-flash", capR: 20 },
  { name: "gemini-3.5-flash-lite", capR: 500 },
  { name: "gemini-2.5-flash-lite", capR: 1500 }
]
const ACTIVE_KEY = "pupsik_active_model"
const STATS_KEY = "pupsik_stats_"
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() }
const sn = (n) => String(n || "?").replace("gemini-", "").replace("-flash-lite", " L").replace("-flash", " F").replace("-preview", "")

const getActiveModel = () => {
  let n = "gemini-3.5-flash-lite"
  try { if (typeof settings !== "undefined" && settings.settingsStorage) { const r = settings.settingsStorage.getItem(ACTIVE_KEY); if (r) n = r } } catch (err) {}
  let ok = false
  for (let i = 0; i < MODELS.length; i++) { if (MODELS[i].name === n) ok = true }
  return ok ? n : MODELS[0].name
}
const setActiveModel = (n) => { try { if (typeof settings !== "undefined" && settings.settingsStorage) settings.settingsStorage.setItem(ACTIVE_KEY, n) } catch (e) {} }
const loadStats = (mn) => {
  const m = mn || getActiveModel(); const k = STATS_KEY + m
  try { if (typeof settings !== "undefined" && settings.settingsStorage) { const r = settings.settingsStorage.getItem(k); if (r) { const o = JSON.parse(r); if (o.d === todayStr()) return o } } } catch (e) {}
  return { d: todayStr(), r: 0 }
}
const saveStats = (o, mn) => {
  const m = mn || getActiveModel(); const k = STATS_KEY + m
  try { if (typeof settings !== "undefined" && settings.settingsStorage) settings.settingsStorage.setItem(k, JSON.stringify(o)) } catch (e) {}
}

let activeJob = { id: "", done: false, answer: "", chatId: "" }
let partBuf = ""
const log = function () { try { console.log.apply(console, ["[pupsik]"].concat(Array.prototype.slice.call(arguments))) } catch (e) {} }

const loadChats = () => { try { if (typeof settings !== "undefined" && settings.settingsStorage) { const r = settings.settingsStorage.getItem("pupsik_chats"); if (r) return JSON.parse(r) } } catch (e) {} return [] }
const saveChats = (chats) => { const s = chats.slice(0, 6); try { if (typeof settings !== "undefined" && settings.settingsStorage) settings.settingsStorage.setItem("pupsik_chats", JSON.stringify(s)) } catch (e) {} }
const formatChatTranscript = (messages) => messages.map((m) => (m.role === "user" ? "Вы:\n" : "ИИ:\n") + m.content).join("\n\n")
const getLastUserPrompt = (messages) => { for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === "user") return messages[i].content } return "" }
const cleanOutputText = (rawText) => String(rawText || "").replace(/[*#_`~]/g, "").replace(/\n{3,}/g, "\n\n").trim()

const ladderFor = (n) => {
  if (String(n).indexOf("3.8") !== -1) return ["level:low", "none"]
  if (String(n).indexOf("3.6") !== -1) return ["level:minimal", "none"]
  return ["none"]
}
const isThinkErr = (r) => r.status === 400 && /thinking|level|minimal|low|not supported|unsupported|invalid|enum|parameter/i.test(String(r.errMsg || ""))
const isSwitchable = (r) => r.status >= 500 || /429|quota|limit|not found|not available|timeout|504|deadline|enotfound|network|resource/i.test(String(r.errMsg || ""))

const sendToProxy = (body, cb) => {
  fetch({ url: PROXY_HOST, method: "POST", timeout: 30000, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((res) => {
      let data = null; try { data = typeof res.body === "string" ? JSON.parse(res.body) : res.body } catch (e) {}
      const cand = (data && Array.isArray(data.candidates) && data.candidates.length > 0) ? data.candidates.slice(0, 1).pop() : null
      const allParts = (cand && cand.content && Array.isArray(cand.content.parts)) ? cand.content.parts : []
      const content = allParts.filter((p) => !p.thought).map((p) => p.text || "").join("")
      const finishReason = cand ? String(cand.finishReason || "") : ""
      const errMsg = (data && data.error && data.error.message) ? String(data.error.message) : ""
      log("RESP", res.status, "finish:", finishReason, "len:", content.length, "err:", errMsg.slice(0, 70))
      cb({ content: content, finishReason: finishReason, errMsg: errMsg, status: res.status, hasCand: !!cand })
    })
    .catch((err) => { log("FETCH CATCH:", String(err)); cb({ content: "", finishReason: "CATCH", errMsg: String(err), status: 0, hasCand: false }) })
}

AppSideService({
  onInit() {
    log("SIDE INIT OK, active:", getActiveModel())
    messageBuilder.listen(() => {})
    messageBuilder.on("request", (ctx) => {
      const jsonRpc = messageBuilder.buf2Json(ctx.request.payload)
      log("REQ:", jsonRpc.method)

      if (jsonRpc.method === "GET_MODELS") ctx.response({ data: { models: MODELS.map((m) => m.name) } })
      if (jsonRpc.method === "LOAD_MODEL") ctx.response({ data: { msg: "Активна: " + getActiveModel() } })
      if (jsonRpc.method === "ADD_PART") {
        if (jsonRpc.params && jsonRpc.params.reset) partBuf = ""
        partBuf += String((jsonRpc.params && jsonRpc.params.p) || "")
        ctx.response({ data: { ok: 1, len: partBuf.length } })
      }
      if (jsonRpc.method === "GET_CHATS") ctx.response({ data: { chats: loadChats().map((c) => ({ id: c.id, title: c.title })) } })
      if (jsonRpc.method === "OPEN_CHAT") {
        const found = loadChats().find((c) => c.id === jsonRpc.params.chatId)
        ctx.response({ data: { transcript: found ? formatChatTranscript(found.messages) : "", lastPrompt: found ? getLastUserPrompt(found.messages) : "" } })
      }
      if (jsonRpc.method === "DELETE_CHAT") {
        const chats = loadChats().filter((c) => c.id !== jsonRpc.params.chatId)
        saveChats(chats)
        ctx.response({ data: { chats: chats.map((c) => ({ id: c.id, title: c.title })) } })
      }
      if (jsonRpc.method === "CHECK_AI") ctx.response({ data: activeJob })
      if (jsonRpc.method === "GET_ACTIVE") ctx.response({ data: { name: getActiveModel() } })
      if (jsonRpc.method === "GET_MODELS_STATS") {
        const active = getActiveModel()
        const list = MODELS.map((m) => { const st = loadStats(m.name); return { name: m.name, capR: m.capR, r: st.r, active: m.name === active } })
        ctx.response({ data: { models: list } })
      }
      if (jsonRpc.method === "SET_ACTIVE_MODEL") {
        setActiveModel(jsonRpc.params.name)
        ctx.response({ data: { ok: 1, name: jsonRpc.params.name } })
      }

      if (jsonRpc.method === "ASK_AI") {
        let cleanPrompt
        if (jsonRpc.params && jsonRpc.params.useBuf) { cleanPrompt = partBuf; partBuf = "" }
        else { cleanPrompt = String(jsonRpc.params.prompt || "") }
        cleanPrompt = String(cleanPrompt || "").trim()
        try { if (cleanPrompt.includes("%")) cleanPrompt = decodeURIComponent(cleanPrompt).trim() } catch (e) {}
        log("ASK_AI:", cleanPrompt.slice(0, 40))

        const maxTokens = Number(jsonRpc.params.max_tokens) || 300
        const chatId = jsonRpc.params.chatId || String(Date.now())
        const isRetry = Boolean(jsonRpc.params.isRetry)
        const noContext = Boolean(jsonRpc.params.noContext)
        const jobId = jsonRpc.params.jobId || String(Date.now())

        let chats = loadChats()
        let chat = chats.find((c) => c.id === chatId)
        if (!chat) { chat = { id: chatId, title: (noContext ? "[Б] " : "") + cleanPrompt.slice(0, 12), noContext: noContext, messages: [] }; chats.unshift(chat) }
        if (isRetry && chat.messages.length >= 2 && chat.messages[chat.messages.length - 1].role === "assistant") { chat.messages.pop(); chat.messages.pop() }
        saveChats(chats)

        activeJob = { id: jobId, done: false, answer: "", chatId: chat.id }
        ctx.response({ data: { status: "STARTED", jobId: jobId, chatId: chat.id } })

        const history = chat.noContext
          ? Array.of({ role: "user", content: cleanPrompt })
          : chat.messages.slice(-16).concat(Array.of({ role: "user", content: cleanPrompt }))
        const baseContents = history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: Array.of({ text: m.content }) }))
        const baseSystem = { parts: Array.of({ text: "Ты умный русскоязычный ассистент на часах. Текущий год 2026. Учитывай историю чата. Отвечай чётко, по-русски без markdown-звёздочек и лишних вступлений." }) }

        const failJob = (msg) => { activeJob = { id: jobId, done: true, answer: msg, chatId: chat.id }; log("FAIL:", msg) }

        const finalize = (modelName, requestedName, content, finishReason) => {
          let out = cleanOutputText(content) || content
          if (finishReason === "MAX_TOKENS") out = out + "\n[обрезано по бюджету - подними токены]"
          if (modelName !== requestedName) out = "[" + sn(requestedName) + " не ответила, через " + sn(modelName) + "]\n" + out
          let freshChats = loadChats()
          let freshChat = freshChats.find((c) => c.id === chatId) || chat
          freshChat.messages.push({ role: "user", content: cleanPrompt })
          freshChat.messages.push({ role: "assistant", content: out })
          if (!freshChats.find((c) => c.id === chatId)) freshChats.unshift(freshChat)
          saveChats(freshChats)
          const stx = loadStats(modelName); stx.r += 1; saveStats(stx, modelName)
          activeJob = { id: jobId, done: true, answer: formatChatTranscript(freshChat.messages), chatId: freshChat.id }
          log("DONE via", modelName, "finish:", finishReason)
        }

        const tryModel = (modelIdx, maxTok, retriedTokens, thinkStep) => {
          if (modelIdx >= MODELS.length) { failJob("Все модели исчерпали лимит"); return }
          const modelName = MODELS[modelIdx].name
          const lad = ladderFor(modelName)
          const mode = lad[Math.min(thinkStep, lad.length - 1)]
          const genCfg = { temperature: 0.3, maxOutputTokens: maxTok }
          if (mode !== "none") genCfg.thinkingConfig = { thinkingLevel: mode.split(":")[1] }
          const body = { systemInstruction: baseSystem, contents: baseContents, generationConfig: genCfg, model: modelName }
          log("TRY", modelName, "max:", maxTok, "think:", mode)
          sendToProxy(body, (r) => {
            if (isThinkErr(r) && thinkStep + 1 < lad.length) {
              log("THINK ERR", modelName, "-> step", lad[thinkStep + 1], String(r.errMsg).slice(0, 50))
              tryModel(modelIdx, maxTok, retriedTokens, thinkStep + 1); return
            }
            if (r.content) {
              if (r.finishReason === "MAX_TOKENS" && !retriedTokens) {
                log("MAX_TOKENS text -> retry x2"); tryModel(modelIdx, Math.min(2000, maxTok * 2), true, thinkStep); return
              }
              finalize(modelName, MODELS[0] ? requestedOf(startIdxSafe) : modelName, r.content, r.finishReason); return
            }
            if (r.errMsg) {
              if (isSwitchable(r) && modelIdx + 1 < MODELS.length) {
                log("FALLBACK", modelName, "->", MODELS[modelIdx + 1].name, "because", String(r.errMsg).slice(0, 40))
                tryModel(modelIdx + 1, maxTok, false, 0); return
              }
              failJob("Ошибка: " + r.errMsg + " [status " + r.status + " think=" + mode + "]"); return
            }
            if (r.finishReason === "MAX_TOKENS") {
              if (!retriedTokens) { log("empty MAX_TOKENS -> retry x2"); tryModel(modelIdx, Math.min(2000, maxTok * 2), true, thinkStep); return }
              failJob("[думала и не выдала текст - budget съеден. Подними токены или возьми лёгкую]"); return
            }
            failJob("Пустой ответ [finish=" + (r.finishReason || "none") + " status=" + r.status + " think=" + mode + "]")
          })
        }

        const startIdx = MODELS.findIndex((m) => m.name === getActiveModel())
        const startIdxSafe = startIdx >= 0 ? startIdx : 0
        const requestedName = MODELS[startIdxSafe].name
        function requestedOf(i) { return MODELS[i] ? MODELS[i].name : requestedName }
        tryModel(startIdxSafe, maxTokens, false, 0)
      }
    })
  },
  onRun() {},
  onDestroy() {}
})
