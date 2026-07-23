// ========== 题库存储与解析工具 ==========

const BANKS_KEY = 'quiz_banks_v4'
const OLD_BANKS_KEY = 'quiz_banks_v3'
const WRONG_PREFIX = 'wrong_'
const STATS_PREFIX = 'stats_'
const PROGRESS_KEY = 'quiz_progress'

const DEFAULT_BANK_IDS = ['politics_default', 'motor_default']

// 初始化默认题库（同时迁移旧版自定义题库）
function initDefaultBanks(defaultBanks) {
  let banks = getQuestionBanks()
  let changed = false

  // 迁移旧版题库数据：保留用户自定义题库，丢弃旧默认题库
  try {
    const oldRaw = localStorage.getItem(OLD_BANKS_KEY)
    if (oldRaw) {
      const oldBanks = JSON.parse(oldRaw)
      const defaultIds = new Set(defaultBanks.map(d => d.id))
      const migrated = oldBanks.filter(b => !defaultIds.has(b.id))
      if (migrated.length > 0) {
        banks = banks.concat(migrated)
        changed = true
      }
      localStorage.removeItem(OLD_BANKS_KEY)
    }
  } catch (e) {
    // ignore
  }

  for (const defaultBank of defaultBanks) {
    const exists = banks.find(b => b.id === defaultBank.id)
    if (!exists) {
      banks.push({ ...defaultBank })
      changed = true
    }
  }

  if (changed) {
    saveQuestionBanks(banks)
  }
}

// 题库 CRUD
function getQuestionBanks() {
  try {
    const raw = localStorage.getItem(BANKS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch (e) {
    return []
  }
}

function saveQuestionBanks(banks) {
  localStorage.setItem(BANKS_KEY, JSON.stringify(banks))
}

function getQuestionBank(bankId) {
  return getQuestionBanks().find(b => b.id === bankId)
}

function addQuestionBank(name, questions) {
  const banks = getQuestionBanks()
  const id = 'bank_' + Date.now()
  banks.push({ id, name: name.trim(), questions })
  saveQuestionBanks(banks)
  return id
}

function replaceQuestionBank(name, questions) {
  const banks = getQuestionBanks()
  const existing = banks.find(b => b.name === name.trim() && !DEFAULT_BANK_IDS.includes(b.id))
  if (existing) {
    existing.questions = questions
    saveQuestionBanks(banks)
    return existing.id
  }
  return addQuestionBank(name, questions)
}

function renameQuestionBank(bankId, newName) {
  const banks = getQuestionBanks()
  const bank = banks.find(b => b.id === bankId)
  if (bank) {
    bank.name = newName.trim()
    saveQuestionBanks(banks)
  }
}

function deleteQuestionBank(bankId) {
  const banks = getQuestionBanks().filter(b => b.id !== bankId)
  saveQuestionBanks(banks)
  localStorage.removeItem(WRONG_PREFIX + bankId)
  localStorage.removeItem(STATS_PREFIX + bankId)
  return true
}

// 错题本
function getWrongQuestions(bankId) {
  try {
    const raw = localStorage.getItem(WRONG_PREFIX + bankId)
    if (!raw) return []
    return JSON.parse(raw)
  } catch (e) {
    return []
  }
}

function saveWrongQuestions(bankId, list) {
  localStorage.setItem(WRONG_PREFIX + bankId, JSON.stringify(list))
}

function addWrongQuestion(bankId, question, wrongAnswer) {
  const list = getWrongQuestions(bankId)
  const exists = list.find(w => w.questionId === question.id)
  if (exists) {
    exists.wrongCount += 1
    exists.wrongAnswer = wrongAnswer
    exists.addedAt = Date.now()
  } else {
    list.push({
      questionId: question.id,
      type: question.type,
      content: question.content,
      options: question.options,
      answer: question.answer,
      analysis: question.analysis,
      wrongAnswer,
      wrongCount: 1,
      addedAt: Date.now(),
    })
  }
  saveWrongQuestions(bankId, list)
}

function removeWrongQuestion(bankId, questionId) {
  const list = getWrongQuestions(bankId).filter(w => w.questionId !== questionId)
  saveWrongQuestions(bankId, list)
}

function clearWrongQuestions(bankId) {
  localStorage.removeItem(WRONG_PREFIX + bankId)
}

// 学习统计
function getStudyStats(bankId) {
  try {
    const raw = localStorage.getItem(STATS_PREFIX + bankId)
    if (!raw) return { totalAnswered: 0, correctCount: 0, totalQuestions: 0 }
    return JSON.parse(raw)
  } catch (e) {
    return { totalAnswered: 0, correctCount: 0, totalQuestions: 0 }
  }
}

function updateStudyStats(bankId, isCorrect) {
  const bank = getQuestionBank(bankId)
  const stats = getStudyStats(bankId)
  stats.totalAnswered += 1
  if (isCorrect) stats.correctCount += 1
  stats.totalQuestions = bank ? bank.questions.length : stats.totalAnswered
  stats.accuracy = stats.totalAnswered > 0
    ? Math.round((stats.correctCount / stats.totalAnswered) * 100)
    : 0
  localStorage.setItem(STATS_PREFIX + bankId, JSON.stringify(stats))
}

// 进度保存
function saveQuizProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}

function getQuizProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function clearQuizProgress() {
  localStorage.removeItem(PROGRESS_KEY)
}

// ========== 题目文本解析器 ==========

function isQuestionNumberLine(line) {
  return /^\s*(?:第\s*\d+\s*题|\d+\s*[\.、．]|\*\*第\d+题\*\*)/.test(line)
}

function isAnswerLine(line) {
  return /^\s*(?:\*\*)?(?:正确答案|答案|参考答案|标准答案)[：:：]\s*([A-Z,，、\s]+)/i.test(line)
}

function isOptionLine(line) {
  return /^\s*([A-Z])[\.、．)\]\s]+(.+)/.test(line)
}

function isAnalysisLine(line) {
  return /^\s*(?:解析|分析|说明)[：:：]\s*/.test(line)
}

function normalizeAnswer(answerText) {
  return answerText
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .join('')
}

function detectQuestionType(options, answer) {
  const texts = options.map(o => o.text).join('')
  if (texts.includes('对') && texts.includes('错') && options.length === 2) {
    return 'judge'
  }
  if (answer.length > 1) return 'multiple'
  return 'single'
}

function preprocessRawText(raw) {
  // 先用占位符统一替换各类答案标记，避免“正确答案”被后续的“答案”规则二次破坏
  return raw
    .replace(/第\s+(\d+)\s+题/g, '第$1题')
    .replace(/([A-Z])\s*[、]/g, '$1. ')
    .replace(/(?:参考答案|正确答案|答案)[：:]/g, '{{ANSWER}}')
    .replace(/{{ANSWER}}/g, '**正确答案：**')
}

function previewNormalizedText(raw) {
  const lines = raw.split(/\r?\n/)
  return lines.map(line => {
    let l = line
      .replace(/第\s+(\d+)\s+题/g, '**第$1题**')
      .replace(/^(\d+)\s*[\.、．]\s*/g, '**第$1题** ')
      .replace(/([A-Z])\s*[、]/g, '$1. ')
      .replace(/(?:参考答案|正确答案|答案)[：:]/g, '{{ANSWER}}')
      .replace(/{{ANSWER}}/g, '**正确答案：**')
    return l
  }).join('\n')
}

function parseQuestionText(raw) {
  const normalized = preprocessRawText(raw)
  const lines = normalized.split(/\r?\n/).map(l => l.trim()).filter(l => l)

  const questions = []
  let current = null
  let currentAnalysis = []

  function pushCurrent() {
    if (current && current.options.length > 0) {
      if (currentAnalysis.length > 0) {
        current.analysis = currentAnalysis.join('\n')
      }
      current.type = detectQuestionType(current.options, current.answer || '')
      // 判断题答案转换：对=A, 错=B（去掉 ** 等格式标记）
      if (current.type === 'judge') {
        const ans = current.answer.replace(/\*\*/g, '').trim().toUpperCase()
        if (ans === '对' || ans === 'A') current.answer = 'A'
        else if (ans === '错' || ans === 'B') current.answer = 'B'
      }
      questions.push(current)
    }
    current = null
    currentAnalysis = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (isQuestionNumberLine(line)) {
      pushCurrent()
      const match = line.match(/(?:第\s*(\d+)\s*题|(\d+)\s*[\.、．])/)
      const id = match ? parseInt(match[1] || match[2], 10) : questions.length + 1
      current = {
        id,
        type: 'single',
        content: line.replace(/^\s*(?:第\s*\d+\s*题|\*\*第\d+题\*\*|\d+\s*[\.、．])\s*/, '').replace(/\*\*/g, ''),
        options: [],
        answer: '',
        analysis: '',
      }
      continue
    }

    const answerMatch = line.match(/^\s*(?:\*\*)?(?:正确答案|答案|参考答案|标准答案)[：:：]\s*(.+)/i)
    if (answerMatch) {
      if (current) {
        const ans = answerMatch[1].trim()
        const optionTexts = current.options.map(o => o.text)
        // 判断题保留原始答案（对/错 或 A/B），其他题型归一化为大写字母
        if (optionTexts.includes('对') && optionTexts.includes('错')) {
          current.answer = ans.toUpperCase()
        } else {
          current.answer = normalizeAnswer(ans)
        }
      }
      continue
    }

    const optionMatch = line.match(/^\s*([A-Z])[\.、．)\]\s]+(.+)/)
    if (optionMatch && current) {
      current.options.push({
        label: optionMatch[1].toUpperCase(),
        text: optionMatch[2].replace(/\*\*/g, '').trim(),
      })
      continue
    }

    const analysisMatch = line.match(/^\s*(?:解析|分析|说明)[：:：]\s*(.*)/)
    if (analysisMatch) {
      currentAnalysis.push(analysisMatch[1])
      continue
    }

    if (current && !current.answer && current.options.length === 0 && line) {
      if (current.content) {
        current.content += '\n' + line.replace(/\*\*/g, '')
      } else {
        current.content = line.replace(/\*\*/g, '')
      }
    } else if (current && line && currentAnalysis.length > 0) {
      currentAnalysis.push(line)
    }
  }

  pushCurrent()

  // 去重并重新编号
  const seen = new Set()
  const unique = []
  questions.forEach(q => {
    const key = q.content.trim()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(q)
    }
  })

  return unique.map((q, idx) => ({ ...q, id: idx + 1 }))
}

// 工具：打乱数组
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 工具：类型标签
function getTypeLabel(type) {
  if (type === 'single') return '单选'
  if (type === 'multiple') return '多选'
  return '判断'
}

window.QuizStorage = {
  DEFAULT_BANK_IDS,
  initDefaultBanks,
  getQuestionBanks,
  getQuestionBank,
  addQuestionBank,
  replaceQuestionBank,
  renameQuestionBank,
  deleteQuestionBank,
  getWrongQuestions,
  addWrongQuestion,
  removeWrongQuestion,
  clearWrongQuestions,
  getStudyStats,
  updateStudyStats,
  saveQuizProgress,
  getQuizProgress,
  clearQuizProgress,
  parseQuestionText,
  previewNormalizedText,
  shuffleArray,
  getTypeLabel,
}
