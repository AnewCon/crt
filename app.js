// ========== 全局模块引用 ==========
const defaultBanks = window.defaultBanks
const QS = window.QuizStorage

// ========== API 配置 ==========
// 根据当前环境自动选择 API 地址
const API_BASE = (() => {
  const host = window.location.host
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    // 本地开发时使用 Pages 部署地址（或替换为你的 Worker 地址）
    return ''
  }
  return ''
})()

// ========== 认证模块 ==========
const Auth = (function () {
  const TOKEN_KEY = 'crt_token'
  const USER_KEY = 'crt_user'

  function getToken() {
    return localStorage.getItem(TOKEN_KEY)
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY))
    } catch {
      return null
    }
  }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function api(path, options = {}) {
    const url = `${API_BASE}${path}`
    const token = getToken()
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
    const res = await fetch(url, { ...options, headers })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  }

  async function login(username, password) {
    const { ok, data } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    if (ok && data.success) {
      setAuth(data.data.token, { userId: data.data.userId, username: data.data.username })
      return { success: true }
    }
    return { success: false, message: data.message || '登录失败' }
  }

  async function register(username, password) {
    const { ok, data } = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    if (ok && data.success) {
      setAuth(data.data.token, { userId: data.data.userId, username: data.data.username })
      return { success: true }
    }
    return { success: false, message: data.message || '注册失败' }
  }

  function logout() {
    clearAuth()
    renderUserUI()
    showToast('已退出登录')
  }

  async function checkAuth() {
    const token = getToken()
    if (!token) return false
    const { ok, data } = await api('/api/auth/me')
    if (ok && data.success) {
      setAuth(token, { userId: data.data.userId, username: data.data.username })
      renderUserUI()
      return true
    }
    clearAuth()
    renderUserUI()
    return false
  }

  function renderUserUI() {
    const container = $('#nav-user')
    const user = getUser()
    if (user && user.username) {
      container.innerHTML = `
        <span class="nav-username">👤 ${escapeHtml(user.username)}</span>
        <button class="btn btn-ghost btn-sm" id="logout-btn">退出</button>
      `
      $('#logout-btn').addEventListener('click', logout)
    } else {
      container.innerHTML = `<button class="btn btn-primary btn-sm" id="login-btn">登录 / 注册</button>`
      $('#login-btn').addEventListener('click', openAuthModal)
    }
  }

  function openAuthModal() {
    $('#auth-modal').classList.remove('hidden')
    requestAnimationFrame(() => $('#auth-modal').classList.add('visible'))
  }

  function closeAuthModal() {
    $('#auth-modal').classList.remove('visible')
    setTimeout(() => $('#auth-modal').classList.add('hidden'), 250)
  }

  function switchAuthTab(tab) {
    $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === tab))
    $$('.auth-panel').forEach(p => p.classList.toggle('active', p.id === `auth-${tab}-panel`))
    $('#auth-modal-title').textContent = tab === 'login' ? '登录' : '注册'
  }

  function init() {
    renderUserUI()
    checkAuth()

    $('#auth-modal-close').addEventListener('click', closeAuthModal)
    $('#auth-modal').addEventListener('click', e => {
      if (e.target === $('#auth-modal')) closeAuthModal()
    })

    $$('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => switchAuthTab(tab.dataset.authTab))
    })

    $('#login-submit-btn').addEventListener('click', async () => {
      const username = $('#login-username').value.trim()
      const password = $('#login-password').value
      if (!username || !password) {
        showToast('请输入用户名和密码')
        return
      }
      const btn = $('#login-submit-btn')
      btn.disabled = true
      btn.textContent = '登录中...'
      const result = await login(username, password)
      btn.disabled = false
      btn.textContent = '登录'
      if (result.success) {
        renderUserUI()
        closeAuthModal()
        showToast('登录成功')
      } else {
        showToast(result.message)
      }
    })

    $('#register-submit-btn').addEventListener('click', async () => {
      const username = $('#register-username').value.trim()
      const password = $('#register-password').value
      const confirm = $('#register-password-confirm').value
      if (!username || !password) {
        showToast('请输入用户名和密码')
        return
      }
      if (password.length < 6) {
        showToast('密码长度至少为 6 位')
        return
      }
      if (password !== confirm) {
        showToast('两次输入的密码不一致')
        return
      }
      const btn = $('#register-submit-btn')
      btn.disabled = true
      btn.textContent = '注册中...'
      const result = await register(username, password)
      btn.disabled = false
      btn.textContent = '注册'
      if (result.success) {
        renderUserUI()
        closeAuthModal()
        showToast('注册成功')
      } else {
        showToast(result.message)
      }
    })
  }

  return { init, getToken, getUser, api, logout }
})()

// ========== 通用工具 ==========
function $(selector) { return document.querySelector(selector) }
function $$(selector) { return document.querySelectorAll(selector) }

function showToast(message, duration = 2000) {
  const toast = $('#toast')
  toast.textContent = message
  toast.classList.remove('hidden')
  if (toast._hideTimer) clearTimeout(toast._hideTimer)
  if (toast._transitionTimer) clearTimeout(toast._transitionTimer)
  requestAnimationFrame(() => toast.classList.add('visible'))
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('visible')
    toast._transitionTimer = setTimeout(() => toast.classList.add('hidden'), 250)
  }, duration)
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 自定义弹窗，替代原生 alert/confirm/prompt，适配手机 APK/WebView
function createCustomDialog() {
  const overlay = document.createElement('div')
  overlay.className = 'custom-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'custom-dialog'
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  return { overlay, dialog }
}

function showAlert(message) {
  return new Promise(resolve => {
    const { overlay, dialog } = createCustomDialog()
    dialog.innerHTML = `
      <div class="custom-dialog-message">${escapeHtml(message)}</div>
      <div class="custom-dialog-actions">
        <button class="btn btn-primary custom-dialog-ok">确定</button>
      </div>
    `
    dialog.querySelector('.custom-dialog-ok').addEventListener('click', () => {
      overlay.remove()
      resolve()
    })
  })
}

function showConfirm(message) {
  return new Promise(resolve => {
    const { overlay, dialog } = createCustomDialog()
    dialog.innerHTML = `
      <div class="custom-dialog-message">${escapeHtml(message)}</div>
      <div class="custom-dialog-actions">
        <button class="btn btn-ghost custom-dialog-cancel">取消</button>
        <button class="btn btn-primary custom-dialog-ok">确定</button>
      </div>
    `
    const finish = result => {
      overlay.remove()
      resolve(result)
    }
    dialog.querySelector('.custom-dialog-cancel').addEventListener('click', () => finish(false))
    dialog.querySelector('.custom-dialog-ok').addEventListener('click', () => finish(true))
    overlay.addEventListener('click', e => {
      if (e.target === overlay) finish(false)
    })
  })
}

function showPrompt(message, defaultValue = '') {
  return new Promise(resolve => {
    const { overlay, dialog } = createCustomDialog()
    dialog.innerHTML = `
      <div class="custom-dialog-message">${escapeHtml(message)}</div>
      <input type="text" class="custom-dialog-input" value="${escapeHtml(defaultValue)}">
      <div class="custom-dialog-actions">
        <button class="btn btn-ghost custom-dialog-cancel">取消</button>
        <button class="btn btn-primary custom-dialog-ok">确定</button>
      </div>
    `
    const input = dialog.querySelector('.custom-dialog-input')
    const finish = result => {
      overlay.remove()
      resolve(result)
    }
    dialog.querySelector('.custom-dialog-cancel').addEventListener('click', () => finish(null))
    dialog.querySelector('.custom-dialog-ok').addEventListener('click', () => finish(input.value))
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(input.value)
    })
    overlay.addEventListener('click', e => {
      if (e.target === overlay) finish(null)
    })
    input.focus()
    input.select()
  })
}

function formatMoney(value) {
  const num = parseFloat(value) || 0
  return '¥' + num.toFixed(2)
}

function formatDate(date = new Date()) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// ========== 全局：标签切换 ==========
const tabs = $$('.nav-tab')
const sections = $$('.section')

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab
    tabs.forEach(t => t.classList.remove('active'))
    sections.forEach(s => s.classList.remove('active'))
    tab.classList.add('active')
    $(`#${target}-section`).classList.add('active')
    if (target === 'aa') AAModule.refresh()
    if (target === 'quiz') QuizModule.showHome()
    if (target === 'fortune') FortuneModule.refresh()
  })
})

// ========== AA 记账模块 ==========
const AAModule = (function () {
  const STORAGE_KEY = 'aa_expenses'
  let editingId = null
  let filterFrom = null
  let filterTo = null

  function getExpenses() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch (e) {
      return []
    }
  }

  function saveExpenses(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  }

  function calculateAASplit(amount, people) {
    const base = Math.floor((amount / people) * 100) / 100
    const first = +(amount - base * (people - 1)).toFixed(2)
    return [first, ...Array(people - 1).fill(base)]
  }

  function filteredExpenses() {
    let list = getExpenses()
    if (filterFrom) {
      list = list.filter(e => e.date >= filterFrom)
    }
    if (filterTo) {
      list = list.filter(e => e.date <= filterTo)
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date))
  }

  function refreshStats() {
    const list = getExpenses()
    const today = formatDate()
    const todayTotal = list
      .filter(e => e.date === today)
      .reduce((sum, e) => sum + e.myCost, 0)

    const currentMonth = today.slice(0, 7)
    const monthList = list.filter(e => e.date.startsWith(currentMonth))
    const monthPersonal = monthList
      .filter(e => e.type === 'personal')
      .reduce((sum, e) => sum + e.myCost, 0)
    const monthAA = monthList
      .filter(e => e.type === 'aa')
      .reduce((sum, e) => sum + e.myCost, 0)

    $('#aa-today').textContent = formatMoney(todayTotal)
    $('#aa-month-personal').textContent = formatMoney(monthPersonal)
    $('#aa-month-aa').textContent = formatMoney(monthAA)
    $('#aa-month-total').textContent = formatMoney(monthPersonal + monthAA)
  }

  function renderTable() {
    const list = filteredExpenses()
    const tbody = $('#aa-table-body')
    $('#aa-record-count').textContent = `共 ${list.length} 条`

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无消费记录</td></tr>'
      return
    }

    tbody.innerHTML = list.map(e => `
      <tr>
        <td>${e.date}</td>
        <td>${e.name}</td>
        <td><span class="type-badge ${e.type}">${e.type === 'personal' ? '个人' : 'AA'}</span></td>
        <td>${formatMoney(e.amount)}</td>
        <td>${e.people}</td>
        <td>${formatMoney(e.myCost)}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn edit" data-id="${e.id}">编辑</button>
            <button class="action-btn delete" data-id="${e.id}">删除</button>
          </div>
        </td>
      </tr>
    `).join('')

    tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id))
    })
    tbody.querySelectorAll('.action-btn.delete').forEach(btn => {
      btn.addEventListener('click', () => deleteExpense(btn.dataset.id))
    })
  }

  function renderChart() {
    const canvas = $('#aa-chart')
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const days = []
    const values = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      days.push(dateStr.slice(5))
      const daySum = getExpenses()
        .filter(e => e.date === dateStr)
        .reduce((sum, e) => sum + e.myCost, 0)
      values.push(daySum)
    }

    const width = rect.width
    const height = rect.height
    const padding = { top: 30, right: 20, bottom: 40, left: 50 }
    const chartW = width - padding.left - padding.right
    const chartH = height - padding.top - padding.bottom
    const maxVal = Math.max(...values, 1)

    ctx.clearRect(0, 0, width, height)

    // 网格线
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
      ctx.fillStyle = '#94a3b8'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('¥' + (maxVal * (1 - i / 4)).toFixed(0), padding.left - 8, y + 4)
    }

    // 柱状图
    const barWidth = chartW / values.length * 0.5
    const gap = chartW / values.length
    values.forEach((v, i) => {
      const x = padding.left + gap * i + (gap - barWidth) / 2
      const barH = (v / maxVal) * chartH
      const y = padding.top + chartH - barH

      const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH)
      grad.addColorStop(0, '#6366f1')
      grad.addColorStop(1, '#a5b4fc')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barH, 6)
      ctx.fill()

      ctx.fillStyle = '#475569'
      ctx.textAlign = 'center'
      ctx.font = '12px sans-serif'
      ctx.fillText(days[i], x + barWidth / 2, height - 15)
    })
  }

  function openAddModal() {
    editingId = null
    $('#expense-modal-title').textContent = '添加消费'
    $('#expense-name').value = ''
    $('#expense-amount').value = ''
    $('#expense-date').value = formatDate()
    $('input[name="expense-type"][value="personal"]').checked = true
    updatePeopleConfig()
    $('#expense-modal').classList.remove('hidden')
  }

  function openEditModal(id) {
    const e = getExpenses().find(item => item.id === id)
    if (!e) return
    editingId = id
    $('#expense-modal-title').textContent = '编辑消费'
    $('#expense-name').value = e.name
    $('#expense-amount').value = e.amount
    $('#expense-date').value = e.date
    $(`input[name="expense-type"][value="${e.type}"]`).checked = true
    $('#aa-config-group').classList.toggle('visible', e.type === 'aa')
    if (e.type === 'aa') {
      const count = e.people
      $('#people-count').textContent = count + ' 人'
    }
    updatePerPerson()
    $('#expense-modal').classList.remove('hidden')
  }

  async function deleteExpense(id) {
    if (!await showConfirm('确定要删除这条消费记录吗？')) return
    saveExpenses(getExpenses().filter(e => e.id !== id))
    refresh()
    showToast('已删除')
  }

  function updatePeopleConfig() {
    const type = $('input[name="expense-type"]:checked').value
    $('#aa-config-group').classList.toggle('visible', type === 'aa')
    updatePerPerson()
  }

  function updatePerPerson() {
    const type = $('input[name="expense-type"]:checked').value
    const amount = parseFloat($('#expense-amount').value) || 0
    const countText = $('#people-count').textContent
    const count = parseInt(countText, 10) || 2
    if (type === 'aa' && amount > 0 && count > 0) {
      $('#per-person-amount').textContent = formatMoney(amount / count)
    } else {
      $('#per-person-amount').textContent = formatMoney(amount)
    }
  }

  function saveExpense() {
    const name = $('#expense-name').value.trim() || '消费'
    const amount = parseFloat($('#expense-amount').value)
    const date = $('#expense-date').value
    const type = $('input[name="expense-type"]:checked').value
    const countText = $('#people-count').textContent
    const people = parseInt(countText, 10) || 2

    if (!amount || amount <= 0) {
      showToast('请输入正确的消费金额')
      return
    }
    if (!date) {
      showToast('请选择消费日期')
      return
    }

    let myCost, perPerson
    if (type === 'personal') {
      myCost = amount
      perPerson = 0
    } else {
      if (people < 2) {
        showToast('AA人数至少为2人')
        return
      }
      const splits = calculateAASplit(amount, people)
      myCost = splits[0]
      perPerson = +(amount / people).toFixed(2)
    }

    const list = getExpenses()
    if (editingId) {
      const idx = list.findIndex(e => e.id === editingId)
      if (idx >= 0) {
        list[idx] = { ...list[idx], name, amount, date, type, people, perPerson, myCost }
      }
    } else {
      list.push({
        id: generateId(),
        name,
        amount,
        date,
        type,
        people: type === 'personal' ? 1 : people,
        perPerson,
        myCost,
        createdAt: Date.now(),
      })
    }
    saveExpenses(list)
    $('#expense-modal').classList.add('hidden')
    refresh()
    showToast(editingId ? '已保存' : '已添加')
  }

  function exportToExcel() {
    const list = filteredExpenses()
    if (list.length === 0) {
      showToast('没有可导出的数据')
      return
    }

    const personal = list.filter(e => e.type === 'personal')
    const aa = list.filter(e => e.type === 'aa')
    const personalTotal = personal.reduce((sum, e) => sum + e.myCost, 0)
    const aaTotal = aa.reduce((sum, e) => sum + e.myCost, 0)
    const grandTotal = personalTotal + aaTotal
    const dateStr = formatDate()

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    function money(v) {
      return '¥' + parseFloat(v).toFixed(2)
    }

    const style = `
      <style>
        body { font-family: "Microsoft YaHei", "Segoe UI", sans-serif; font-size: 12pt; color: #1f2937; }
        h1 { font-size: 18pt; color: #1e40af; margin: 0 0 6px; }
        .subtitle { font-size: 11pt; color: #4b5563; margin-bottom: 18px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 22px; }
        th { background: #2563eb; color: #ffffff; font-weight: bold; padding: 10px 8px; border: 1px solid #1d4ed8; text-align: center; }
        td { padding: 8px; border: 1px solid #d1d5db; vertical-align: middle; }
        .text-left { text-align: left; }
        .num { text-align: right; font-family: Consolas, "Courier New", monospace; }
        .section-title { font-size: 13pt; font-weight: bold; color: #1e3a8a; margin: 18px 0 8px; }
        .summary th { background: #059669; border-color: #047857; }
        .total-row td { background: #e0f2fe; font-weight: bold; border-color: #bae6fd; }
        .grand-total td { background: #dbeafe; font-weight: bold; font-size: 12.5pt; border-color: #93c5fd; }
      </style>
    `

    let personalRows = personal.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.date}</td>
        <td class="text-left">${escapeHtml(e.name)}</td>
        <td class="num">${money(e.myCost)}</td>
      </tr>
    `).join('')

    let aaRows = aa.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.date}</td>
        <td class="text-left">${escapeHtml(e.name)}</td>
        <td class="num">${money(e.amount)}</td>
        <td class="num">${e.people}</td>
        <td class="num">${money(e.myCost)}</td>
      </tr>
    `).join('')

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>消费账单 ${dateStr}</title>
  ${style}
</head>
<body>
  <h1>消费账单</h1>
  <div class="subtitle">导出日期：${dateStr}　|　共 ${list.length} 条记录</div>

  <div class="section-title">📊 汇总统计</div>
  <table class="summary">
    <thead>
      <tr><th>统计项</th><th>金额</th></tr>
    </thead>
    <tbody>
      <tr><td class="text-left">个人消费总计</td><td class="num">${money(personalTotal)}</td></tr>
      <tr><td class="text-left">AA消费总计</td><td class="num">${money(aaTotal)}</td></tr>
      <tr class="grand-total"><td class="text-left">总计</td><td class="num">${money(grandTotal)}</td></tr>
    </tbody>
  </table>

  <div class="section-title">💳 个人消费明细（${personal.length} 条）</div>
  <table>
    <thead>
      <tr><th>序号</th><th>日期</th><th>名称</th><th>金额</th></tr>
    </thead>
    <tbody>
      ${personalRows || '<tr><td colspan="4">无个人消费记录</td></tr>'}
      ${personal.length ? `<tr class="total-row"><td colspan="3" class="text-left">个人消费小计</td><td class="num">${money(personalTotal)}</td></tr>` : ''}
    </tbody>
  </table>

  <div class="section-title">🤝 AA消费明细（${aa.length} 条）</div>
  <table>
    <thead>
      <tr><th>序号</th><th>日期</th><th>名称</th><th>总金额</th><th>人数</th><th>我承担</th></tr>
    </thead>
    <tbody>
      ${aaRows || '<tr><td colspan="6">无AA消费记录</td></tr>'}
      ${aa.length ? `<tr class="total-row"><td colspan="5" class="text-left">AA消费小计</td><td class="num">${money(aaTotal)}</td></tr>` : ''}
    </tbody>
  </table>
</body>
</html>
    `.trim()

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `消费账单_${dateStr}.xls`
    a.click()
    URL.revokeObjectURL(url)
    showToast('导出成功')
  }

  function refresh() {
    refreshStats()
    renderTable()
    renderChart()
  }

  // 事件绑定
  $('#aa-add-btn').addEventListener('click', openAddModal)
  $('#aa-export-btn').addEventListener('click', exportToExcel)
  $('#expense-modal-close').addEventListener('click', () => $('#expense-modal').classList.add('hidden'))
  $('#expense-cancel').addEventListener('click', () => $('#expense-modal').classList.add('hidden'))
  $('#expense-save').addEventListener('click', saveExpense)
  $('#expense-modal').addEventListener('click', e => {
    if (e.target === $('#expense-modal')) $('#expense-modal').classList.add('hidden')
  })

  $$('input[name="expense-type"]').forEach(r => {
    r.addEventListener('change', updatePeopleConfig)
  })
  $('#expense-amount').addEventListener('input', updatePerPerson)

  $('#people-minus').addEventListener('click', () => {
    const count = parseInt($('#people-count').textContent, 10)
    if (count > 2) {
      $('#people-count').textContent = (count - 1) + ' 人'
      updatePerPerson()
    }
  })
  $('#people-plus').addEventListener('click', () => {
    const count = parseInt($('#people-count').textContent, 10)
    $('#people-count').textContent = (count + 1) + ' 人'
    updatePerPerson()
  })

  $('#aa-filter-btn').addEventListener('click', () => {
    filterFrom = $('#aa-date-from').value || null
    filterTo = $('#aa-date-to').value || null
    refresh()
  })
  $('#aa-reset-filter').addEventListener('click', () => {
    $('#aa-date-from').value = ''
    $('#aa-date-to').value = ''
    filterFrom = null
    filterTo = null
    refresh()
  })

  window.addEventListener('resize', () => {
    if ($('#aa-section').classList.contains('active')) renderChart()
  })

  return { refresh }
})()

// ========== 题库复习模块 ==========
const QuizModule = (function () {
  let currentBankId = ''
  let currentMode = 'full' // 'full' | 'wrong'
  let questionPool = []
  let currentIndex = 0
  let selectedAnswers = []
  let submitted = false
  let results = []
  let wrongBook = []
  let importParsedQuestions = []

  const quizViews = {
    home: $('#quiz-home-view'),
    play: $('#quiz-play-view'),
    result: $('#quiz-result-view'),
    wrong: $('#quiz-wrong-view'),
    import: $('#quiz-import-view'),
  }

  function switchView(viewName) {
    Object.values(quizViews).forEach(v => v.classList.remove('active'))
    quizViews[viewName].classList.add('active')

    $$('.quiz-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.quizView === viewName)
    })
  }

  function shufflePool() {
    if (currentMode === 'wrong') {
      const wrongList = QS.getWrongQuestions(currentBankId)
        .sort((a, b) => b.wrongCount - a.wrongCount)
      const wrongIds = new Set(wrongList.map(w => w.questionId))
      const bank = QS.getQuestionBank(currentBankId)
      if (!bank) return
      questionPool = bank.questions.filter(q => wrongIds.has(q.id))
      questionPool.sort((a, b) => {
        const aIdx = wrongList.findIndex(w => w.questionId === a.id)
        const bIdx = wrongList.findIndex(w => w.questionId === b.id)
        return aIdx - bIdx
      })
    } else {
      const bank = QS.getQuestionBank(currentBankId)
      if (!bank) return
      questionPool = QS.shuffleArray([...bank.questions])
    }
  }

  function startQuiz(bankId, mode) {
    currentBankId = bankId
    currentMode = mode
    currentIndex = 0
    selectedAnswers = []
    submitted = false
    results = []
    shufflePool()
    QS.clearQuizProgress()
    refreshWrongBook()
    renderQuestion()
    switchView('play')
  }

  function resumeQuiz() {
    const saved = QS.getQuizProgress()
    if (!saved) return
    const bank = QS.getQuestionBank(saved.bankId)
    if (!bank) return

    const idMap = new Map(bank.questions.map(q => [q.id, q]))
    const pool = saved.questionIds.map(id => idMap.get(id)).filter(Boolean)
    if (pool.length === 0) return

    currentBankId = saved.bankId
    currentMode = saved.mode
    questionPool = pool
    currentIndex = saved.currentIndex
    selectedAnswers = []
    submitted = false
    results = saved.results || []
    refreshWrongBook()
    renderQuestion()
    switchView('play')
  }

  function saveProgress() {
    QS.saveQuizProgress({
      bankId: currentBankId,
      mode: currentMode,
      currentIndex,
      results,
      questionIds: questionPool.map(q => q.id),
    })
  }

  function getCurrentQuestion() {
    return questionPool[currentIndex] || null
  }

  function isLastQuestion() {
    return currentIndex >= questionPool.length - 1
  }

  function refreshWrongBook() {
    wrongBook = currentBankId ? QS.getWrongQuestions(currentBankId) : []
  }

  function toggleAnswer(label) {
    if (submitted) return
    const q = getCurrentQuestion()
    if (!q) return

    if (q.type === 'single' || q.type === 'judge') {
      selectedAnswers = [label]
    } else {
      const idx = selectedAnswers.indexOf(label)
      if (idx >= 0) {
        selectedAnswers = selectedAnswers.filter(a => a !== label)
      } else {
        selectedAnswers = [...selectedAnswers, label].sort()
      }
    }
    renderOptions()
  }

  function submitAnswer() {
    if (selectedAnswers.length === 0) {
      showToast('请先选择答案')
      return
    }
    const q = getCurrentQuestion()
    if (!q) return

    const userAnswer = selectedAnswers.join('')
    let isCorrect = false

    if (q.type === 'judge' || q.type === 'single') {
      isCorrect = userAnswer === q.answer
    } else {
      isCorrect = userAnswer === q.answer.split('').sort().join('')
    }

    QS.updateStudyStats(currentBankId, isCorrect)

    if (!isCorrect) {
      QS.addWrongQuestion(currentBankId, q, userAnswer)
    } else if (currentMode === 'full') {
      QS.removeWrongQuestion(currentBankId, q.id)
    }

    const result = {
      questionId: q.id,
      userAnswer,
      correctAnswer: q.answer,
      isCorrect,
    }
    results.push(result)
    submitted = true
    refreshWrongBook()
    renderOptions()
    renderFeedback(isCorrect, q)
    saveProgress()
  }

  function nextQuestion() {
    if (currentIndex < questionPool.length - 1) {
      currentIndex++
      selectedAnswers = []
      submitted = false
      renderQuestion()
    } else {
      QS.clearQuizProgress()
      showResult()
    }
  }

  function skipQuestion() {
    if (currentMode !== 'wrong') return
    const q = getCurrentQuestion()
    if (!q) return

    QS.removeWrongQuestion(currentBankId, q.id)
    questionPool = questionPool.filter((_, idx) => idx !== currentIndex)
    results.push({
      questionId: q.id,
      userAnswer: 'SKIPPED',
      correctAnswer: q.answer,
      isCorrect: false,
    })
    selectedAnswers = []
    submitted = false
    refreshWrongBook()

    if (questionPool.length === 0 || currentIndex >= questionPool.length) {
      QS.clearQuizProgress()
      showResult()
    } else {
      renderQuestion()
      saveProgress()
    }
  }

  function renderQuestion() {
    const q = getCurrentQuestion()
    if (!q) return

    const bank = QS.getQuestionBank(currentBankId)
    $('#question-bank-name').textContent = bank ? bank.name : ''
    $('#question-type').textContent = QS.getTypeLabel(q.type)
    $('#question-type').className = 'question-type ' + q.type
    $('#question-content').textContent = q.content

    $('#quiz-progress-text').textContent = `第 ${currentIndex + 1} / ${questionPool.length} 题`
    $('#quiz-progress-fill').style.setProperty('--progress', ((currentIndex + 1) / questionPool.length).toString())

    $('#quiz-mode-badge').textContent = currentMode === 'wrong' ? '错题强化' : '完整复习'
    $('#quiz-mode-badge').className = 'quiz-mode-badge ' + (currentMode === 'wrong' ? 'wrong' : '')

    $('#question-feedback').classList.add('hidden')
    $('#question-actions').classList.remove('hidden')
    $('#submit-answer-btn').disabled = false
    $('#skip-wrong-btn').classList.toggle('hidden', currentMode !== 'wrong')

    renderOptions()
  }

  function renderOptions() {
    const q = getCurrentQuestion()
    if (!q) return
    const container = $('#question-options')
    container.innerHTML = q.options.map(opt => {
      let cls = 'option-item'
      let mark = ''
      if (selectedAnswers.includes(opt.label)) cls += ' selected'
      if (submitted) {
        cls += ' disabled'
        const isCorrect = q.answer.includes(opt.label)
        const isSelected = selectedAnswers.includes(opt.label)
        if (isCorrect) {
          cls += ' correct'
          mark = '✓ 正确'
        } else if (isSelected && !isCorrect) {
          cls += ' wrong'
          mark = '✗ 错误'
        }
      }
      return `
        <div class="${cls}" data-label="${opt.label}">
          <div class="option-label">${opt.label}</div>
          <div class="option-text">${opt.text}</div>
          ${mark ? `<div class="option-mark">${mark}</div>` : ''}
        </div>
      `
    }).join('')

    container.querySelectorAll('.option-item').forEach(item => {
      item.addEventListener('click', () => {
        if (!submitted) toggleAnswer(item.dataset.label)
      })
    })
  }

  function renderFeedback(isCorrect, q) {
    $('#question-actions').classList.add('hidden')
    const fb = $('#question-feedback')
    fb.classList.remove('hidden')

    const resultEl = $('#feedback-result')
    resultEl.textContent = isCorrect ? '✓ 回答正确！' : '✗ 回答错误'
    resultEl.className = 'feedback-result ' + (isCorrect ? 'correct' : 'wrong')

    const answerEl = $('#feedback-answer')
    const userText = selectedAnswers.join('') || '未选'
    answerEl.innerHTML = `你的答案：<strong>${userText}</strong>　|　正确答案：<strong>${q.answer}</strong>`

    const analysisEl = $('#feedback-analysis')
    if (q.analysis) {
      analysisEl.classList.remove('hidden')
      analysisEl.innerHTML = `<strong>解析：</strong>${q.analysis}`
    } else {
      analysisEl.classList.add('hidden')
    }

    const nextBtn = $('#next-question-btn')
    nextBtn.textContent = isLastQuestion() ? '查看结果' : '下一题'
  }

  function showResult() {
    switchView('result')
    const total = results.length
    const correct = results.filter(r => r.isCorrect).length
    const wrong = total - correct
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    $('#result-score').textContent = accuracy + '%'
    $('#result-total').textContent = total
    $('#result-correct').textContent = correct
    $('#result-wrong').textContent = wrong

    let title = ''
    if (accuracy === 100) title = '完美！全对！🎉'
    else if (accuracy >= 90) title = '太棒了，继续保持！💪'
    else if (accuracy >= 70) title = '不错，继续加油！👍'
    else if (accuracy >= 50) title = '还需要努力哦～📚'
    else title = '建议复习错题，再接再厉！🌱'
    $('#result-title').textContent = title

    const list = $('#result-detail-list')
    const bank = QS.getQuestionBank(currentBankId)
    list.innerHTML = results.map(r => {
      const q = bank.questions.find(item => item.id === r.questionId)
      if (!q) return ''
      const icon = r.isCorrect ? '<span class="result-icon correct">✓</span>' : '<span class="result-icon wrong">✗</span>'
      return `
        <div class="result-detail-item">
          <div class="result-detail-question">${icon} ${q.content}</div>
          <div class="result-detail-answer">
            你的答案：${r.userAnswer}　|　正确答案：${r.correctAnswer}
          </div>
        </div>
      `
    }).join('')
  }

  // 首页
  function renderBankCards() {
    const banks = QS.getQuestionBanks()
    const grid = $('#quiz-banks-grid')
    grid.innerHTML = banks.map(bank => {
      const stats = QS.getStudyStats(bank.id)
      const wrongCount = QS.getWrongQuestions(bank.id).length
      const isDefault = QS.DEFAULT_BANK_IDS.includes(bank.id)
      return `
        <div class="bank-card ${isDefault ? 'default' : ''}">
          <div class="bank-header">
            <div class="bank-name">${bank.name}</div>
            <div class="bank-actions">
              <button class="bank-action-btn" data-action="rename" data-id="${bank.id}" title="重命名">✏️</button>
              <button class="bank-action-btn danger" data-action="delete" data-id="${bank.id}" title="删除">🗑️</button>
            </div>
          </div>
          <div class="bank-stats">
            <div class="bank-stat">
              <span class="bank-stat-value">${bank.questions.length}</span>
              <span class="bank-stat-label">总题数</span>
            </div>
            <div class="bank-stat">
              <span class="bank-stat-value">${stats.totalAnswered}</span>
              <span class="bank-stat-label">已答</span>
            </div>
            <div class="bank-stat">
              <span class="bank-stat-value wrong">${wrongCount}</span>
              <span class="bank-stat-label">错题</span>
            </div>
          </div>
          <div class="bank-buttons">
            <button class="btn btn-primary start-full" data-id="${bank.id}">完整复习</button>
            <button class="btn btn-secondary start-wrong ${wrongCount === 0 ? 'disabled' : ''}" data-id="${bank.id}" ${wrongCount === 0 ? 'disabled' : ''}>错题强化</button>
          </div>
        </div>
      `
    }).join('')

    grid.querySelectorAll('.start-full').forEach(btn => {
      btn.addEventListener('click', () => startQuiz(btn.dataset.id, 'full'))
    })
    grid.querySelectorAll('.start-wrong').forEach(btn => {
      btn.addEventListener('click', () => startQuiz(btn.dataset.id, 'wrong'))
    })
    grid.querySelectorAll('.bank-action-btn[data-action="rename"]').forEach(btn => {
      btn.addEventListener('click', () => handleRename(btn.dataset.id))
    })
    grid.querySelectorAll('.bank-action-btn[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id))
    })
  }

  function renderResumeBanner() {
    const saved = QS.getQuizProgress()
    const banner = $('#quiz-resume-banner')
    if (saved) {
      const bank = QS.getQuestionBank(saved.bankId)
      banner.classList.remove('hidden')
      $('#resume-detail').textContent = `${bank ? bank.name : '未知题库'} · ${saved.mode === 'wrong' ? '错题强化' : '完整复习'} · 第 ${saved.currentIndex + 1} 题`
    } else {
      banner.classList.add('hidden')
    }
  }

  async function handleRename(bankId) {
    const bank = QS.getQuestionBank(bankId)
    if (!bank) return
    const name = await showPrompt('请输入新的题库名称：', bank.name)
    if (name && name.trim()) {
      QS.renameQuestionBank(bankId, name.trim())
      showHome()
      showToast('已重命名')
    }
  }

  async function handleDelete(bankId) {
    const bank = QS.getQuestionBank(bankId)
    if (!bank) return
    if (await showConfirm(`确定要删除题库"${bank.name}"吗？此操作不可恢复！`)) {
      QS.deleteQuestionBank(bankId)
      showHome()
      showToast('已删除')
    }
  }

  // 错题库
  let wrongSelectedBank = ''
  let wrongFilterType = 'all'

  function renderWrongBook() {
    const banks = QS.getQuestionBanks()
    const selector = $('#wrong-bank-selector')
    if (banks.length === 0) {
      selector.innerHTML = ''
      $('#wrong-list').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>暂无题库</p></div>'
      return
    }

    if (!wrongSelectedBank || !banks.find(b => b.id === wrongSelectedBank)) {
      wrongSelectedBank = banks[0].id
    }

    selector.innerHTML = banks.map(b => `
      <button class="${b.id === wrongSelectedBank ? 'active' : ''}" data-id="${b.id}">
        ${b.name} (${QS.getWrongQuestions(b.id).length})
      </button>
    `).join('')

    selector.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        wrongSelectedBank = btn.dataset.id
        renderWrongBook()
      })
    })

    const list = QS.getWrongQuestions(wrongSelectedBank)
    const filtered = wrongFilterType === 'all' ? list : list.filter(w => w.type === wrongFilterType)

    const container = $('#wrong-list')
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>该题库暂无错题</p></div>'
      return
    }

    container.innerHTML = filtered.map(w => `
      <div class="wrong-item">
        <div class="wrong-item-header">
          <div class="wrong-item-meta">
            <span class="question-type ${w.type}">${QS.getTypeLabel(w.type)}</span>
            <span class="text-muted">第 ${w.questionId} 题</span>
            <span class="wrong-count">错 ${w.wrongCount} 次</span>
          </div>
          <button class="wrong-remove-btn" data-qid="${w.questionId}">移除</button>
        </div>
        <p>${w.content}</p>
        <div class="wrong-options">
          ${w.options.map(opt => {
            const isCorrect = w.type === 'judge' ? opt.label === w.answer : w.answer.includes(opt.label)
            const isWrong = w.wrongAnswer.includes(opt.label)
            let cls = 'wrong-option'
            if (isCorrect) cls += ' correct'
            else if (isWrong) cls += ' wrong'
            return `<div class="${cls}"><strong>${opt.label}.</strong> ${opt.text}${isCorrect ? ' <span>(正确答案)</span>' : ''}${isWrong && !isCorrect ? ' <span>(你的答案)</span>' : ''}</div>`
          }).join('')}
        </div>
        ${w.analysis ? `<div class="feedback-analysis" style="margin-top:12px"><strong>解析：</strong>${w.analysis}</div>` : ''}
      </div>
    `).join('')

    container.querySelectorAll('.wrong-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        QS.removeWrongQuestion(wrongSelectedBank, parseInt(btn.dataset.qid, 10))
        renderWrongBook()
        showToast('已移除')
      })
    })
  }

  // 导入向导
  let importStep = 1
  const importPanels = $$('.wizard-panel')
  const importSteps = $$('.wizard-step')

  function setImportStep(step) {
    importStep = step
    importPanels.forEach(p => p.classList.toggle('active', parseInt(p.dataset.panel, 10) === step))
    importSteps.forEach(s => {
      const sNum = parseInt(s.dataset.step, 10)
      s.classList.remove('active', 'completed')
      if (sNum === step) s.classList.add('active')
      else if (sNum < step) s.classList.add('completed')
    })
  }

  function renderImportPreview() {
    const raw = $('#import-raw-text').value
    const normalized = QS.previewNormalizedText(raw)
    $('#import-preview-normalized').textContent = normalized
    $('#import-preview-info').textContent = `已识别 ${importParsedQuestions.length} 道题目（预览为自动校正后的格式）`
  }

  function showHome() {
    switchView('home')
    renderBankCards()
    renderResumeBanner()
  }

  // 事件绑定
  $$('.quiz-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.quizView
      if (view === 'home') showHome()
      if (view === 'wrong') {
        switchView('wrong')
        renderWrongBook()
      }
      if (view === 'import') {
        switchView('import')
        setImportStep(1)
      }
    })
  })

  $('#add-bank-card').addEventListener('click', () => {
    switchView('import')
    setImportStep(1)
    $$('.quiz-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.quizView === 'import'))
  })

  $('#resume-continue-btn').addEventListener('click', resumeQuiz)
  $('#resume-abandon-btn').addEventListener('click', () => {
    QS.clearQuizProgress()
    renderResumeBanner()
    showToast('已放弃进度')
  })

  $('#quiz-exit-btn').addEventListener('click', async () => {
    if (await showConfirm('确定要退出答题吗？进度会自动保存。')) {
      showHome()
    }
  })

  $('#submit-answer-btn').addEventListener('click', submitAnswer)
  $('#next-question-btn').addEventListener('click', nextQuestion)
  $('#skip-wrong-btn').addEventListener('click', skipQuestion)

  $('#result-retry-btn').addEventListener('click', () => startQuiz(currentBankId, 'full'))
  $('#result-wrong-btn').addEventListener('click', () => {
    const wrongCount = QS.getWrongQuestions(currentBankId).length
    if (wrongCount === 0) {
      showToast('暂无错题')
      return
    }
    startQuiz(currentBankId, 'wrong')
  })
  $('#result-home-btn').addEventListener('click', showHome)

  $('#wrong-type-filter').addEventListener('click', e => {
    if (e.target.classList.contains('filter-btn')) {
      wrongFilterType = e.target.dataset.filter
      $$('#wrong-type-filter .filter-btn').forEach(b => b.classList.remove('active'))
      e.target.classList.add('active')
      renderWrongBook()
    }
  })

  $('#clear-wrong-btn').addEventListener('click', async () => {
    if (!wrongSelectedBank) return
    const bank = QS.getQuestionBank(wrongSelectedBank)
    if (await showConfirm(`确定要清空"${bank ? bank.name : ''}"的错题库吗？`)) {
      QS.clearWrongQuestions(wrongSelectedBank)
      renderWrongBook()
      showToast('已清空')
    }
  })

  // 导入向导事件
  $$('.wizard-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (importStep < 4) setImportStep(importStep + 1)
    })
  })
  $$('.wizard-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      if (importStep > 1) setImportStep(importStep - 1)
    })
  })

  $('#import-parse-btn').addEventListener('click', () => {
    const raw = $('#import-raw-text').value.trim()
    if (!raw) {
      showToast('请先粘贴题目文本')
      return
    }
    importParsedQuestions = QS.parseQuestionText(raw)
    if (importParsedQuestions.length === 0) {
      showToast('未能识别任何题目，请检查格式')
      return
    }
    renderImportPreview()
    setImportStep(3)
  })

  $('#import-save-btn').addEventListener('click', () => {
    const name = $('#import-bank-name').value.trim()
    if (!name) {
      showToast('请输入题库名称')
      return
    }
    if (importParsedQuestions.length === 0) {
      showToast('没有可保存的题目')
      return
    }

    const replace = $('#import-replace-existing').checked
    let bankId
    if (replace) {
      bankId = QS.replaceQuestionBank(name, importParsedQuestions)
    } else {
      bankId = QS.addQuestionBank(name, importParsedQuestions)
    }

    $('#import-raw-text').value = ''
    $('#import-bank-name').value = ''
    $('#import-replace-existing').checked = false
    importParsedQuestions = []
    setImportStep(1)
    showHome()
    showToast(replace ? '已替换题库' : '题库保存成功')
  })

  return { showHome }
})()

// ========== 幸运转盘模块 ==========
const FortuneModule = (function () {
  const FORTUNE_DATABASE = [
    { score: 1, title: '韬光养晦', advice: '今天适合放慢脚步，把精力留给真正重要的事情。', color: '#8B5CF6', icon: '🌙' },
    { score: 2, title: '静待花开', advice: '许多事情正在悄悄酝酿，请保持耐心。', color: '#8B5CF6', icon: '🍃' },
    { score: 3, title: '平稳前行', advice: '今天整体较为平稳，适合处理日常事务。', color: '#A78BFA', icon: '🌤' },
    { score: 4, title: '渐入佳境', advice: '运势正在慢慢回暖，今天是一个不错的转折点。', color: '#A78BFA', icon: '🌱' },
    { score: 5, title: '渐入佳境', advice: '你的状态正在逐渐提升，行动会带来新的机会。', color: '#F59E0B', icon: '🌱' },
    { score: 6, title: '稳中向好', advice: '今天适合积极推进重要事务，事情会逐步顺利起来。', color: '#F59E0B', icon: '☀' },
    { score: 7, title: '顺风渐起', advice: '好运正在慢慢靠近，大胆迈出一步，或许会有惊喜。', color: '#10B981', icon: '🌈' },
    { score: 8, title: '好运降临', advice: '今天的整体运势相当不错，适合主动争取机会。', color: '#10B981', icon: '✨' },
    { score: 9, title: '鸿运渐盛', advice: '今天充满积极能量，适合做出重要决定。', color: '#EF4444', icon: '🌟' },
    { score: 10, title: '鸿运当头', advice: '今天仿佛被幸运轻轻眷顾，状态处于最佳区间。', color: '#EF4444', icon: '👑' },
  ]

  const WEIGHTS = [3, 5, 8, 12, 15, 15, 12, 8, 5, 3]

  const LEVELS = [
    { threshold: 10.0, level: '鸿运当头', emoji: '👑' },
    { threshold: 9.5, level: '鸿运当头', emoji: '👑' },
    { threshold: 9.0, level: '鸿运渐盛', emoji: '🌟' },
    { threshold: 8.5, level: '鸿运渐盛', emoji: '🌟' },
    { threshold: 8.0, level: '好运降临', emoji: '✨' },
    { threshold: 7.5, level: '好运降临', emoji: '✨' },
    { threshold: 7.0, level: '顺风渐起', emoji: '🌈' },
    { threshold: 6.5, level: '顺风渐起', emoji: '🌈' },
    { threshold: 6.0, level: '稳中向好', emoji: '☀' },
    { threshold: 5.5, level: '稳中向好', emoji: '☀' },
    { threshold: 5.0, level: '渐入佳境', emoji: '🌱' },
    { threshold: 4.5, level: '渐入佳境', emoji: '🌱' },
    { threshold: 4.0, level: '平稳前行', emoji: '🌤' },
    { threshold: 3.5, level: '平稳前行', emoji: '🌤' },
    { threshold: 3.0, level: '静待花开', emoji: '🍃' },
    { threshold: 2.5, level: '静待花开', emoji: '🍃' },
    { threshold: 2.0, level: '韬光养晦', emoji: '🌙' },
    { threshold: 1.5, level: '韬光养晦', emoji: '🌙' },
    { threshold: 1.0, level: '韬光养晦', emoji: '🌙' },
  ]

  const STORAGE_KEY = 'fortune_history'
  let isAnimating = false
  let currentResult = null

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch (e) {
      return []
    }
  }

  function saveHistory(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)))
  }

  function weightedRandom() {
    const total = WEIGHTS.reduce((a, b) => a + b, 0)
    let rand = Math.random() * total
    for (let i = 0; i < WEIGHTS.length; i++) {
      rand -= WEIGHTS[i]
      if (rand <= 0) return i + 1
    }
    return 5
  }

  function generateResult() {
    const first = weightedRandom()
    const second = weightedRandom()
    const average = (first + second) / 2
    return { first, second, average }
  }

  function getLevelInfo(average) {
    for (const item of LEVELS) {
      if (average >= item.threshold) {
        return item
      }
    }
    return LEVELS[LEVELS.length - 1]
  }

  function getFortuneInfo(score) {
    return FORTUNE_DATABASE.find(f => f.score === score)
  }

  function renderCard(cardIndex, info) {
    $(`#card-${cardIndex}-icon`).textContent = info.icon
    $(`#card-${cardIndex}-score`).textContent = info.score
    $(`#card-${cardIndex}-title`).textContent = info.title
    $(`#card-${cardIndex}-advice`).textContent = info.advice
    $(`#card-${cardIndex}-score`).style.color = info.color
  }

  function resetCards() {
    $('#card-1').classList.remove('flipped', 'flipping')
    $('#card-2').classList.remove('flipped', 'flipping')
    $('#fortune-result').classList.add('hidden')
    $('#fortune-start-btn').classList.remove('hidden')
    $('#fortune-retry-btn').classList.add('hidden')
  }

  function flipCard(cardId, score, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        const card = $(cardId)
        card.classList.add('flipping')
        setTimeout(() => {
          renderCard(cardId === '#card-1' ? 1 : 2, getFortuneInfo(score))
          card.classList.remove('flipping')
          card.classList.add('flipped')
          resolve()
        }, 600)
      }, delay)
    })
  }

  async function startFortune() {
    if (isAnimating) return
    isAnimating = true
    $('#fortune-start-btn').disabled = true

    resetCards()
    currentResult = generateResult()

    await flipCard('#card-1', currentResult.first, 200)
    await flipCard('#card-2', currentResult.second, 400)

    showResult()

    // 保存历史
    const history = getHistory()
    history.unshift({
      time: new Date().toLocaleString('zh-CN'),
      first: currentResult.first,
      second: currentResult.second,
      average: currentResult.average,
      level: getLevelInfo(currentResult.average),
    })
    saveHistory(history)
    renderHistory()

    isAnimating = false
    $('#fortune-start-btn').classList.add('hidden')
    $('#fortune-start-btn').disabled = false
    $('#fortune-retry-btn').classList.remove('hidden')
  }

  function showResult() {
    const level = getLevelInfo(currentResult.average)
    const displayAverage = Number.isInteger(currentResult.average)
      ? currentResult.average.toFixed(1)
      : currentResult.average.toFixed(1)

    $('#fortune-level').textContent = `${level.emoji} ${level.level}`
    $('#fortune-average').textContent = `${currentResult.first} + ${currentResult.second} = 平均 ${displayAverage} 分`

    // 随机选一条描述
    const descriptions = {
      '鸿运当头': ['今天仿佛被幸运轻轻眷顾。', '适合完成一直想做却迟迟未开始的事情。', '你的状态处于最佳区间。'],
      '鸿运渐盛': ['今天充满积极能量。', '适合做出重要决定。', '你的判断力和执行力都处于不错的状态。'],
      '好运降临': ['今天的整体运势相当不错。', '适合主动争取机会。', '你的状态和行动力都在线。'],
      '顺风渐起': ['好运正在慢慢靠近。', '适合推进停滞已久的计划。', '今天容易遇到积极的变化。'],
      '稳中向好': ['今天适合积极推进重要事务。', '保持行动力，事情会逐步顺利起来。', '你的努力正在获得回应。'],
      '渐入佳境': ['你的状态正在逐渐提升。', '今天适合尝试新的想法与计划。', '行动会带来新的机会。'],
      '平稳前行': ['今天整体较为平稳，适合处理日常事务。', '按计划推进即可，无需额外给自己压力。', '认真完成每一步，结果自然会慢慢显现。'],
      '静待花开': ['今天更适合观察局势，而不是贸然行动。', '许多事情正在悄悄酝酿，请保持耐心。', '机会可能还在路上，不妨先做好准备。'],
      '韬光养晦': ['今天适合放慢脚步，把精力留给真正重要的事情。', '有些事情不必急于求成，保持耐心会更有收获。', '适合学习、整理和沉淀，为未来积蓄力量。'],
    }
    const descList = descriptions[level.level] || descriptions['平稳前行']
    $('#fortune-description').textContent = descList[Math.floor(Math.random() * descList.length)]

    $('#fortune-result').classList.remove('hidden')
  }

  function renderHistory() {
    const history = getHistory()
    const container = $('#fortune-history-list')
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无历史记录</p></div>'
      return
    }
    container.innerHTML = history.map(h => `
      <div class="history-item">
        <span>${h.time}</span>
        <span class="history-score">${h.first} + ${h.second}</span>
        <span class="history-level">${h.level.emoji} ${h.level.level}</span>
      </div>
    `).join('')
  }

  function refresh() {
    renderHistory()
  }

  $('#fortune-start-btn').addEventListener('click', startFortune)
  $('#fortune-retry-btn').addEventListener('click', startFortune)
  $('#clear-fortune-history').addEventListener('click', async () => {
    if (await showConfirm('确定要清空历史记录吗？')) {
      localStorage.removeItem(STORAGE_KEY)
      renderHistory()
      showToast('已清空')
    }
  })

  return { refresh }
})()

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  QS.initDefaultBanks(defaultBanks)
  Auth.init()
  AAModule.refresh()
  QuizModule.showHome()
  FortuneModule.refresh()
})

