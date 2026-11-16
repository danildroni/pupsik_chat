const { messageBuilder } = getApp()._options.globalData
const LAYOUTS = {
  RU: ["АБВГ", "ДЕЖЗ", "ИЙКЛ", "МНОП", "РСТУ", "ФХЦЧ", "ШЩЫЬ", "ЭЮЯ?", "___"],
  EN: ["ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ", "___"],
  NUM: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0+-=", "*/()", ".,?!"]
}
const MODES = ["RU", "EN", "NUM"]
const TOKEN_PRESETS = Array.of(150, 300, 500, 1000)
const TOKEN_COLORS = Array.of(0x3730a3, 0x1d4ed8, 0x701a75, 0x831843)
const shortModel = (name) => String(name || "?").replace("gemini-", "").replace("-flash-lite", " L").replace("-flash", " F").replace("-preview", "")
const barStr = (r, cap) => {
  const n = Math.max(0, Math.min(10, Math.round(10 * r / cap)))
  let s = "["
  for (let j = 0; j < 10; j++) { s += (j < n ? "#" : ".") }
  return s + "]"
}
const calcTextHeight = (text) => {
  const paras = String(text || "").split("\n")
  let lines = 0
  for (let i = 0; i < paras.length; i++) { lines += Math.max(1, Math.ceil(paras[i].length / 15)) }
  return Math.max(180, lines * 27 + 44)
}

Page({
  state: {
    prompt: "", lastPrompt: "", lastKey: -1, charIndex: 0, lastTapTime: 0,
    modeIdx: 0, tokenIdx: 1, activeShort: "?", currentChatId: String(Date.now()), noContextMode: false, editLast: false,
    chatList: [], isReading: false, isMenuOpen: false, lastTextH: 200, lastBarY: 0, readSplit: false, lastAnswerText: ""
  },
  onInit() { if (typeof hmSetting !== "undefined" && hmSetting.setBrightScreen) hmSetting.setBrightScreen(300) },
  onDestroy() { if (typeof hmSetting !== "undefined" && hmSetting.setBrightScreenCancel) hmSetting.setBrightScreenCancel() },
  build() {
    const setPageScroll = (enable) => {
      if (typeof hmUI !== "undefined" && hmUI.setScrollView) hmUI.setScrollView(enable)
      if (!enable && typeof hmApp !== "undefined" && hmApp.setLayerY) hmApp.setLayerY(0)
    }
    setPageScroll(false)
    const devInfo = (typeof hmSetting !== "undefined" && hmSetting.getDeviceInfo) ? hmSetting.getDeviceInfo() : { height: 368 }
    const H = devInfo.height || 368
    const bottomBtnH = 52
    const bottomY = H - bottomBtnH - 4
    const promptH = Math.max(72, bottomY - 244)
    const TOP_PAD = 6
    const vBottom = (hmUI.align && hmUI.align.BOTTOM !== undefined) ? hmUI.align.BOTTOM : hmUI.align.TOP
    const keyButtons = []; const chatSlotBtns = []; const chatDelBtns = []
    const appBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: 192, h: H, color: 0x0b0f14 })
    const setBg = (h) => { try { appBg.setProperty(hmUI.prop.MORE, { x: 0, y: 0, w: 192, h: Math.max(H, h), color: 0x0b0f14 }) } catch (e) {} }

    const displayBox = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 52, w: 180, h: promptH,
      text: "Новый диалог\nВведите запрос:", text_size: 16, color: 0x38bdf8,
      align_h: hmUI.align.LEFT, text_style: hmUI.text_style.WRAP
    })
    const prefixBox = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 52, w: 180, h: 180, text: "", text_size: 16, color: 0x8b98a9,
      align_h: hmUI.align.LEFT, align_v: vBottom, text_style: hmUI.text_style.WRAP
    })
    const answerBox = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 52, w: 180, h: 180, text: "", text_size: 16, color: 0xf1f5f9,
      align_h: hmUI.align.LEFT, text_style: hmUI.text_style.WRAP
    })
    prefixBox.setProperty(hmUI.prop.VISIBLE, false)
    answerBox.setProperty(hmUI.prop.VISIBLE, false)
    const useSingle = () => {
      prefixBox.setProperty(hmUI.prop.VISIBLE, false)
      answerBox.setProperty(hmUI.prop.VISIBLE, false)
      displayBox.setProperty(hmUI.prop.VISIBLE, true)
      this.state.readSplit = false
    }

    const chatsBtn = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 4, y: 8, w: 92, h: 40, text: "Чаты", text_size: 15, radius: 14,
      normal_color: 0x1c212b, press_color: 0x2d3646,
      click_func: () => { if (this.state.isMenuOpen) closeChatMenu(); else openChatMenu() }
    })
    const tokenBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 100, y: 8, w: 88, h: 40, radius: 14, color: 0x1d4ed8 })
    const tokenBtn = hmUI.createWidget(hmUI.widget.TEXT, { x: 100, y: 8, w: 88, h: 40, text: "?/300т", text_size: 11, color: 0xe2e8f0, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V })
    const refreshTokenText = () => { tokenBtn.setProperty(hmUI.prop.TEXT, this.state.activeShort + "/" + String(TOKEN_PRESETS[this.state.tokenIdx]) + "т") }
    tokenBtn.addEventListener(hmUI.event.CLICK_UP, () => {
      this.state.tokenIdx = (this.state.tokenIdx + 1) % TOKEN_PRESETS.length
      tokenBg.setProperty(hmUI.prop.COLOR, TOKEN_COLORS[this.state.tokenIdx])
      refreshTokenText()
    })
    messageBuilder.request({ method: "GET_ACTIVE" }).then((res) => {
      if (res && res.name) { this.state.activeShort = shortModel(res.name); refreshTokenText() }
    }).catch(() => {})

    const retryBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 4, y: bottomY, w: 60, h: bottomBtnH, radius: 14, color: 0x1c212b })
    const retryBtn = hmUI.createWidget(hmUI.widget.TEXT, { x: 4, y: bottomY, w: 60, h: bottomBtnH, text: "Ещё", text_size: 13, color: 0xe2e8f0, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V })
    retryBtn.addEventListener(hmUI.event.CLICK_UP, () => {
      useSingle(); setBg(H)
      displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: promptH, text: "Проверяю...", text_size: 16, color: 0xffffff })
      messageBuilder.request({ method: "CHECK_AI" }).then((st) => {
        if (st && st.done && st.answer && st.answer !== this.state.lastAnswerText) { this.state.lastAnswerText = st.answer; showScrollableAnswer(st.answer, 0xf1f5f9, true) }
        else if (this.state.lastPrompt) { this.state.lastAnswerText = ""; sendPromptToAI(this.state.lastPrompt, true) }
      }).catch(() => { if (this.state.lastPrompt) { this.state.lastAnswerText = ""; sendPromptToAI(this.state.lastPrompt, true) } })
    })

    const editBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 68, y: bottomY, w: 56, h: bottomBtnH, radius: 14, color: 0x78350f })
    const editBtn = hmUI.createWidget(hmUI.widget.TEXT, { x: 68, y: bottomY, w: 56, h: bottomBtnH, text: "Изм.", text_size: 13, color: 0xfef3c7, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V })
    editBtn.addEventListener(hmUI.event.CLICK_UP, () => {
      useSingle(); setBg(H)
      if (!this.state.lastPrompt) { displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: promptH, text: "Нет сообщения для правки", text_size: 16, color: 0x38bdf8 }); return }
      this.state.prompt = this.state.lastPrompt
      this.state.editLast = true
      this.state.isReading = false
      setPageScroll(false)
      positionAnswerBar(bottomY, false)
      displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: promptH, text: this.state.prompt, text_size: 16, color: 0xfbbf24 })
      toggleKeyboard(true)
    })

    const backBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 128, y: bottomY, w: 60, h: bottomBtnH, radius: 14, color: 0x2b7fff })
    const backBtn = hmUI.createWidget(hmUI.widget.TEXT, { x: 128, y: bottomY, w: 60, h: bottomBtnH, text: "Отв", text_size: 13, color: 0xffffff, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V })
    backBtn.addEventListener(hmUI.event.CLICK_UP, () => { this.state.prompt = ""; resetToInput("Продолжите диалог:") })

    const positionAnswerBar = (barY, show) => {
      const widgets = Array.of(retryBg, retryBtn, editBg, editBtn, backBg, backBtn)
      for (let i = 0; i < widgets.length; i++) { widgets[i].setProperty(hmUI.prop.Y, barY); widgets[i].setProperty(hmUI.prop.VISIBLE, show) }
    }
    positionAnswerBar(bottomY, false)

    const showScrollableAnswer = (text, color, toBottom) => {
      const str = String(text)
      this.state.isReading = true
      const ai = str.lastIndexOf("ИИ:")
      const split = !!(toBottom && ai > 0)
      let barY = bottomY
      let anchorY = 52
      if (split) {
        const prefix = str.slice(0, ai).replace(/\n+$/, "")
        const answerPart = str.slice(ai)
        const pH = calcTextHeight(prefix)
        const aH = calcTextHeight(answerPart)
        anchorY = 52 + pH
        displayBox.setProperty(hmUI.prop.VISIBLE, false)
        prefixBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: pH, text: prefix, text_size: 16, color: 0x8b98a9, align_h: hmUI.align.LEFT, align_v: vBottom, text_style: hmUI.text_style.WRAP })
        prefixBox.setProperty(hmUI.prop.VISIBLE, true)
        answerBox.setProperty(hmUI.prop.MORE, { x: 10, y: anchorY, w: 180, h: aH, text: answerPart, text_size: 16, color: color || 0xf1f5f9, align_h: hmUI.align.LEFT, text_style: hmUI.text_style.WRAP })
        answerBox.setProperty(hmUI.prop.VISIBLE, true)
        barY = Math.max(bottomY, anchorY + H - bottomBtnH, anchorY + aH + 10)
        this.state.lastTextH = pH + aH
      } else {
        const tH = calcTextHeight(str)
        useSingle()
        displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: tH, text: str, text_size: 16, color: color || 0xf1f5f9, align_h: hmUI.align.LEFT, text_style: hmUI.text_style.WRAP })
        barY = Math.max(bottomY, 52 + tH + 10)
        this.state.lastTextH = tH
      }
      this.state.readSplit = split
      this.state.lastBarY = barY
      setBg(barY + bottomBtnH)
      positionAnswerBar(barY, true)
      const needScroll = barY + bottomBtnH > H
      setPageScroll(needScroll)
      if (split && needScroll) {
        const maxScroll = Math.max(0, barY + bottomBtnH - H)
        const target = Math.max(0, Math.min(maxScroll, anchorY - TOP_PAD))
        setTimeout(() => { if (!this.state.isReading) return; try { hmApp.setLayerY(-target) } catch (e) {} }, 60)
      } else {
        try { hmApp.setLayerY(0) } catch (e) {}
      }
    }

    const newChatMenuBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 6, y: 52, w: 182, h: 44, text: "+ Новый чат", text_size: 15, radius: 14, normal_color: 0x2b7fff, press_color: 0x1d4ed8, click_func: () => toggleNewChatDialog(true) })
    newChatMenuBtn.setProperty(hmUI.prop.VISIBLE, false)
    const dlgBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 8, y: 65, w: 178, h: 215, radius: 16, color: 0x161b22 })
    const dlgTitle = hmUI.createWidget(hmUI.widget.TEXT, { x: 14, y: 74, w: 166, h: 28, text: "Режим диалога:", text_size: 15, color: 0xf8fafc, align_h: hmUI.align.CENTER_H })
    const dlgCtxBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 16, y: 108, w: 162, h: 48, text: "С памятью", text_size: 15, radius: 12, normal_color: 0x2b7fff, press_color: 0x1d4ed8, click_func: () => { toggleNewChatDialog(false); this.state.currentChatId = String(Date.now()); this.state.noContextMode = false; this.state.prompt = ""; this.state.lastPrompt = ""; this.state.editLast = false; closeChatMenu(); resetToInput("Чат с памятью:") } })
    const dlgNoCtxBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 16, y: 164, w: 162, h: 48, text: "Без памяти", text_size: 15, radius: 12, normal_color: 0x252c38, press_color: 0x3b4659, click_func: () => { toggleNewChatDialog(false); this.state.currentChatId = String(Date.now()); this.state.noContextMode = true; this.state.prompt = ""; this.state.lastPrompt = ""; this.state.editLast = false; closeChatMenu(); resetToInput("Разовый вопрос:") } })
    const dlgCancelBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 16, y: 222, w: 162, h: 44, text: "Отмена", text_size: 14, radius: 12, normal_color: 0x1c212b, press_color: 0x2d3646, click_func: () => toggleNewChatDialog(false) })

    const toggleNewChatDialog = (show) => {
      if (show) toggleKeyboard(false)
      setPageScroll(false)
      dlgBg.setProperty(hmUI.prop.VISIBLE, show); dlgTitle.setProperty(hmUI.prop.VISIBLE, show)
      dlgCtxBtn.setProperty(hmUI.prop.VISIBLE, show); dlgNoCtxBtn.setProperty(hmUI.prop.VISIBLE, show); dlgCancelBtn.setProperty(hmUI.prop.VISIBLE, show)
      newChatMenuBtn.setProperty(hmUI.prop.VISIBLE, !show && this.state.isMenuOpen)
      if (show) { for (let i = 0; i < 5; i++) { chatSlotBtns[i].setProperty(hmUI.prop.VISIBLE, false); chatDelBtns[i].setProperty(hmUI.prop.VISIBLE, false) } }
      else if (this.state.isMenuOpen) renderChatSlots()
    }
    toggleNewChatDialog(false)

    for (let i = 0; i < 5; i++) {
      const rowY = 102 + i * 44
      const cBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 6, y: rowY, w: 142, h: 40, text: "", text_size: 14, radius: 12, normal_color: 0x1c212b, press_color: 0x2d3646, click_func: () => { const item = this.state.chatList[i]; if (!item) return; this.state.currentChatId = item.id; this.state.editLast = false; closeChatMenu(); toggleKeyboard(false); setPageScroll(false); useSingle(); displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: promptH, text: "Открываю...", text_size: 16, color: 0x94a3b8 }); messageBuilder.request({ method: "OPEN_CHAT", params: { chatId: item.id } }).then((res) => { if (res && res.lastPrompt) this.state.lastPrompt = res.lastPrompt; showScrollableAnswer((res && res.transcript) ? res.transcript : "Пусто", 0xf1f5f9, false) }) } })
      const dBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 151, y: rowY, w: 37, h: 40, text: "x", text_size: 18, radius: 12, normal_color: 0x3f1d24, press_color: 0x6b2835, click_func: () => { const item = this.state.chatList[i]; if (!item) return; messageBuilder.request({ method: "DELETE_CHAT", params: { chatId: item.id } }).then((res) => { this.state.chatList = (res && Array.isArray(res.chats)) ? res.chats : []; renderChatSlots() }) } })
      cBtn.setProperty(hmUI.prop.VISIBLE, false); dBtn.setProperty(hmUI.prop.VISIBLE, false); chatSlotBtns.push(cBtn); chatDelBtns.push(dBtn)
    }
    const renderChatSlots = () => { for (let i = 0; i < 5; i++) { const item = this.state.chatList[i]; if (item) { chatSlotBtns[i].setProperty(hmUI.prop.TEXT, item.title); chatSlotBtns[i].setProperty(hmUI.prop.VISIBLE, true); chatDelBtns[i].setProperty(hmUI.prop.VISIBLE, true) } else { chatSlotBtns[i].setProperty(hmUI.prop.VISIBLE, false); chatDelBtns[i].setProperty(hmUI.prop.VISIBLE, false) } } }

    const limBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 4, y: 324, w: 184, h: 40, text: "Лимиты", text_size: 15, radius: 12, normal_color: 0x14532d, press_color: 0x166534, click_func: () => openLimits() })
    limBtn.setProperty(hmUI.prop.VISIBLE, false)
    const limBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: 192, h: H, color: 0x0b0f14 })
    const limTitle = hmUI.createWidget(hmUI.widget.TEXT, { x: 10, y: 58, w: 172, h: 26, text: "Лимиты за день", text_size: 15, color: 0xf8fafc })
    const limClose = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 40, y: 318, w: 112, h: 40, radius: 12, color: 0x2b7fff })
    const limCloseTxt = hmUI.createWidget(hmUI.widget.TEXT, { x: 40, y: 318, w: 112, h: 40, text: "Закрыть", text_size: 14, color: 0xffffff, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V })
    limCloseTxt.addEventListener(hmUI.event.CLICK_UP, () => closeLimits())
    const limWidgets = [limBg, limTitle, limClose, limCloseTxt]

    const limModelRows = []
    const paintRow = (i) => {
      const row = limModelRows[i]
      if (!row || !row.have) { row.bg.setProperty(hmUI.prop.VISIBLE, false); row.txt.setProperty(hmUI.prop.VISIBLE, false); return }
      row.bg.setProperty(hmUI.prop.VISIBLE, true); row.txt.setProperty(hmUI.prop.VISIBLE, true)
      row.bg.setProperty(hmUI.prop.COLOR, row.active ? 0x065f46 : 0x1f2937)
      row.txt.setProperty(hmUI.prop.TEXT, shortModel(row.name) + " " + barStr(row.r, row.capR) + " " + row.r + "/" + row.capR + (row.active ? " *" : ""))
    }
    for (let i = 0; i < 4; i++) {
      const rowY = 92 + i * 56
      const bg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 8, y: rowY, w: 176, h: 50, radius: 10, color: 0x1f2937 })
      const txt = hmUI.createWidget(hmUI.widget.TEXT, { x: 12, y: rowY, w: 168, h: 50, text: "", text_size: 11, color: 0xf8fafc, align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V })
      bg.setProperty(hmUI.prop.VISIBLE, false); txt.setProperty(hmUI.prop.VISIBLE, false)
      const rowObj = { bg, txt, name: "", active: false, r: 0, capR: 1, have: false }
      txt.addEventListener(hmUI.event.CLICK_UP, ((idx) => () => {
        const it = limModelRows[idx]
        if (!it || !it.have || it.active) return
        for (let k = 0; k < 4; k++) { limModelRows[k].active = (k === idx) }
        it.active = true
        this.state.activeShort = shortModel(it.name)
        refreshTokenText()
        for (let k = 0; k < 4; k++) paintRow(k)
        messageBuilder.request({ method: "SET_ACTIVE_MODEL", params: { name: it.name } }).catch(() => {})
      })(i))
      limModelRows.push(rowObj)
    }

    const setLimVisible = (v) => { for (let i = 0; i < limWidgets.length; i++) limWidgets[i].setProperty(hmUI.prop.VISIBLE, v) }
    const closeLimits = () => {
      setLimVisible(false)
      for (let i = 0; i < 4; i++) { limModelRows[i].bg.setProperty(hmUI.prop.VISIBLE, false); limModelRows[i].txt.setProperty(hmUI.prop.VISIBLE, false) }
    }
    const openLimits = () => {
      toggleNewChatDialog(false)
      setLimVisible(true)
      messageBuilder.request({ method: "GET_MODELS_STATS" }).then((res) => {
        const list = (res && res.models) || []
        for (let i = 0; i < 4; i++) {
          const row = limModelRows[i]; const m = list[i]
          if (m) {
            row.have = true; row.name = m.name; row.active = m.active; row.r = m.r; row.capR = m.capR
            if (m.active) this.state.activeShort = shortModel(m.name)
          } else { row.have = false }
          paintRow(i)
        }
        refreshTokenText()
      }).catch(() => {})
    }
    setLimVisible(false)

    const openChatMenu = () => {
      limBtn.setProperty(hmUI.prop.VISIBLE, true); this.state.isMenuOpen = true; this.state.isReading = false
      setPageScroll(false); toggleKeyboard(false); positionAnswerBar(bottomY, false); setBg(H)
      displayBox.setProperty(hmUI.prop.VISIBLE, false)
      prefixBox.setProperty(hmUI.prop.VISIBLE, false)
      answerBox.setProperty(hmUI.prop.VISIBLE, false)
      newChatMenuBtn.setProperty(hmUI.prop.VISIBLE, true)
      messageBuilder.request({ method: "GET_CHATS" }).then((res) => { this.state.chatList = (res && Array.isArray(res.chats)) ? res.chats : []; renderChatSlots() }).catch(() => renderChatSlots())
    }
    const closeChatMenu = () => {
      limBtn.setProperty(hmUI.prop.VISIBLE, false); closeLimits(); this.state.isMenuOpen = false
      toggleNewChatDialog(false); newChatMenuBtn.setProperty(hmUI.prop.VISIBLE, false)
      for (let i = 0; i < 5; i++) { chatSlotBtns[i].setProperty(hmUI.prop.VISIBLE, false); chatDelBtns[i].setProperty(hmUI.prop.VISIBLE, false) }
      if (this.state.isReading) {
        if (this.state.readSplit) { displayBox.setProperty(hmUI.prop.VISIBLE, false); prefixBox.setProperty(hmUI.prop.VISIBLE, true); answerBox.setProperty(hmUI.prop.VISIBLE, true) }
        else { useSingle() }
        const barY = this.state.lastBarY || bottomY
        setBg(barY + bottomBtnH)
        positionAnswerBar(barY, true)
        setPageScroll(barY + bottomBtnH > H)
      } else { useSingle(); setBg(H); setPageScroll(false); toggleKeyboard(true) }
    }
    const resetToInput = (placeholder) => {
      this.state.isReading = false; this.state.lastKey = -1; setPageScroll(false); positionAnswerBar(bottomY, false)
      useSingle(); setBg(H)
      displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: promptH, text: this.state.prompt || placeholder, text_size: 16, color: 0x38bdf8 })
      toggleKeyboard(true)
    }

    const sendPromptToAI = (textToSend, isRetry) => {
      if (lockTimer) { clearTimeout(lockTimer); lockTimer = null }
      this.state.lastKey = -1; this.state.lastPrompt = textToSend; this.state.isReading = false; setPageScroll(false)
      const myJobId = String(Date.now()).slice(-6)
      toggleKeyboard(false); positionAnswerBar(bottomY, false)
      useSingle(); setBg(H)
      displayBox.setProperty(hmUI.prop.MORE, { x: 10, y: 52, w: 180, h: promptH, text: "Передаю...", text_size: 16, color: 0xffffff })

      const pollAnswer = (attempt) => {
        if (this.state.isReading || this.state.isMenuOpen) return
        if (attempt > 120) { showScrollableAnswer("Долгий ответ. Нажмите Ещё", 0xf1f5f9, false); return }
        const sec = Math.round(attempt * 1.5)
        displayBox.setProperty(hmUI.prop.TEXT, "Думаю (" + sec + "с)...")
        messageBuilder.request({ method: "CHECK_AI" })
          .then((st) => {
            if (this.state.isReading) return
            if (st && st.done && st.answer && st.answer !== this.state.lastAnswerText) { this.state.lastAnswerText = st.answer; showScrollableAnswer(st.answer, 0xf1f5f9, true) }
            else setTimeout(() => pollAnswer(attempt + 1), 1500)
          })
          .catch(() => {
            messageBuilder.request({ method: "GET_CHATS" }).then((gRes) => {
              const list = (gRes && Array.isArray(gRes.chats)) ? gRes.chats : []
              const targetId = list.length > 0 ? list[0].id : this.state.currentChatId
              return messageBuilder.request({ method: "OPEN_CHAT", params: { chatId: targetId } })
            }).then((oRes) => {
              if (this.state.isReading) return
              if (oRes && oRes.transcript && oRes.transcript !== this.state.lastAnswerText && oRes.transcript.includes("ИИ:")) { this.state.lastAnswerText = oRes.transcript; showScrollableAnswer(oRes.transcript, 0xf1f5f9, true) }
              else setTimeout(() => pollAnswer(attempt + 1), 1500)
            }).catch(() => setTimeout(() => pollAnswer(attempt + 1), 1500))
          })
      }

      const chunks = []; for (let i = 0; i < textToSend.length; i += 6) { chunks.push(textToSend.slice(i, i + 6)) }
      const fallbackDirectAsk = () => {
        displayBox.setProperty(hmUI.prop.TEXT, "Думаю (0с)...")
        messageBuilder.request({ method: "ASK_AI", params: { prompt: textToSend, max_tokens: TOKEN_PRESETS[this.state.tokenIdx], chatId: this.state.currentChatId.slice(-6), jobId: myJobId, isRetry: isRetry ? 1 : 0, noContext: this.state.noContextMode ? 1 : 0 } })
          .then((data) => { if (data && data.chatId) this.state.currentChatId = data.chatId; if (data && data.answer) { this.state.lastAnswerText = data.answer; showScrollableAnswer(data.answer, 0xf1f5f9, true) } else setTimeout(() => pollAnswer(1), 1500) })
          .catch(() => pollAnswer(7))
      }
      const sendNextChunk = (idx) => {
        if (idx >= chunks.length) {
          displayBox.setProperty(hmUI.prop.TEXT, "Думаю (0с)...")
          messageBuilder.request({ method: "ASK_AI", params: { useBuf: 1, max_tokens: TOKEN_PRESETS[this.state.tokenIdx], chatId: this.state.currentChatId.slice(-6), jobId: myJobId, isRetry: isRetry ? 1 : 0, noContext: this.state.noContextMode ? 1 : 0 } })
            .then((data) => { if (data && data.chatId) this.state.currentChatId = data.chatId; if (data && data.answer) { this.state.lastAnswerText = data.answer; showScrollableAnswer(data.answer, 0xf1f5f9, true) } else setTimeout(() => pollAnswer(1), 1500) })
            .catch(() => fallbackDirectAsk())
          return
        }
        let answered = false
        const guard = setTimeout(() => { if (!answered) { answered = true; fallbackDirectAsk() } }, 1200)
        messageBuilder.request({ method: "ADD_PART", params: { p: chunks[idx], reset: idx === 0 ? 1 : 0 } })
          .then(() => { if (!answered) { answered = true; clearTimeout(guard); sendNextChunk(idx + 1) } })
          .catch(() => { if (!answered) { answered = true; clearTimeout(guard); fallbackDirectAsk() } })
      }
      sendNextChunk(0)
    }

    const SPACE_KEY = String.fromCharCode(95, 95, 95)
    let lockTimer = null
    const renderTypingPrompt = () => {
      if (!this.state.prompt) { displayBox.setProperty(hmUI.prop.COLOR, 0x38bdf8); displayBox.setProperty(hmUI.prop.TEXT, "Введите запрос:"); return }
      const isEditing = this.state.lastKey !== -1
      displayBox.setProperty(hmUI.prop.COLOR, isEditing ? 0xfbbf24 : 0x38bdf8)
      displayBox.setProperty(hmUI.prop.TEXT, isEditing ? (this.state.prompt.slice(0, -1) + "[" + this.state.prompt.slice(-1) + "]") : this.state.prompt)
    }

    for (let idx = 0; idx < 12; idx++) {
      const btn = hmUI.createWidget(hmUI.widget.BUTTON, {
        x: 4 + (idx % 3) * 63, y: (bottomY - 188) + Math.floor(idx / 3) * 62, w: 60, h: 58,
        text: "", text_size: 16, radius: 12, normal_color: 0x1c212b, press_color: 0x2d3646,
        click_func: () => {
          const letters = LAYOUTS[MODES[this.state.modeIdx]][idx]
          if (!letters) return
          const now = Date.now()
          if (lockTimer) { clearTimeout(lockTimer); lockTimer = null }
          if (letters === SPACE_KEY) { this.state.prompt += " "; this.state.lastKey = -1 }
          else if (letters.length === 1) { this.state.prompt += letters; this.state.lastKey = -1 }
          else if (this.state.lastKey === idx && now - this.state.lastTapTime < 1100) { this.state.charIndex = (this.state.charIndex + 1) % letters.length; this.state.prompt = this.state.prompt.slice(0, -1) + letters.charAt(this.state.charIndex) }
          else { this.state.lastKey = idx; this.state.charIndex = 0; this.state.prompt += letters.charAt(0) }
          this.state.lastTapTime = now; renderTypingPrompt()
          if (this.state.lastKey !== -1) { lockTimer = setTimeout(() => { this.state.lastKey = -1; renderTypingPrompt() }, 1100) }
        }
      })
      keyButtons.push(btn)
    }
    const langBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 4, y: bottomY, w: 56, h: bottomBtnH, text: "РУС", text_size: 15, radius: 14, normal_color: 0x252c38, press_color: 0x3b4659, click_func: () => { this.state.modeIdx = (this.state.modeIdx + 1) % MODES.length; this.state.lastKey = -1; updateKeyboardLabels() } })
    const delBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 64, y: bottomY, w: 50, h: bottomBtnH, text: "<", text_size: 22, radius: 14, normal_color: 0x252c38, press_color: 0x3b4659, click_func: () => { this.state.prompt = this.state.prompt.slice(0, -1); this.state.lastKey = -1; renderTypingPrompt() } })
    const askBtn = hmUI.createWidget(hmUI.widget.BUTTON, { x: 118, y: bottomY, w: 72, h: bottomBtnH, text: "Отпр", text_size: 16, radius: 14, normal_color: 0x2b7fff, press_color: 0x1d4ed8, click_func: () => { if (!this.state.prompt.trim()) { displayBox.setProperty(hmUI.prop.TEXT, "Введите текст!"); return } sendPromptToAI(this.state.prompt, this.state.editLast); this.state.editLast = false } })

    const updateKeyboardLabels = () => {
      const currentMode = MODES[this.state.modeIdx]
      langBtn.setProperty(hmUI.prop.TEXT, { RU: "РУС", EN: "ENG", NUM: "123" }[currentMode])
      const keys = LAYOUTS[currentMode]
      const isFourRows = keys.length > 9
      const btnH = isFourRows ? 43 : 58; const stepY = isFourRows ? 46 : 62; const startY = bottomY - (isFourRows ? 186 : 188)
      for (let i = 0; i < 12; i++) {
        const label = keys[i]; const btn = keyButtons[i]
        if (label) { btn.setProperty(hmUI.prop.MORE, { x: 4 + (i % 3) * 63, y: startY + Math.floor(i / 3) * stepY, w: 60, h: btnH, text: label }); btn.setProperty(hmUI.prop.VISIBLE, true) }
        else btn.setProperty(hmUI.prop.VISIBLE, false)
      }
    }
    const toggleKeyboard = (show) => {
      langBtn.setProperty(hmUI.prop.VISIBLE, show); delBtn.setProperty(hmUI.prop.VISIBLE, show); askBtn.setProperty(hmUI.prop.VISIBLE, show)
      if (show) updateKeyboardLabels()
      else for (let i = 0; i < 12; i++) keyButtons[i].setProperty(hmUI.prop.VISIBLE, false)
    }
    updateKeyboardLabels()

    messageBuilder.request({ method: "GET_CHATS" }).then((res) => {
      const list = (res && res.chats) || []
      if (list.length > 0) {
        this.state.currentChatId = list[0].id
        messageBuilder.request({ method: "OPEN_CHAT", params: { chatId: list[0].id } }).then((r) => {
          if (r && r.lastPrompt) this.state.lastPrompt = r.lastPrompt
        }).catch(() => {})
      }
    }).catch(() => {})
  }
})
