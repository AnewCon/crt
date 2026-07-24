/**
 * CRT Backend — Cloudflare Pages Function
 * 基于 Cloudflare Workers + D1 的轻量账号认证后端
 * 参考模板风格：cloudflare/workers-jwt、cloudflare/d1-auth-examples
 * 无外部 npm 依赖，全部使用 Web Crypto API
 */

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      console.error('Worker error:', error)
      return jsonResponse({
        success: false,
        message: '服务器内部错误'
      }, 500)
    }
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname

  // 1) CORS 预检
  if (request.method === 'OPTIONS') {
    return handleCORS()
  }

  // 2) API 路由
  if (path.startsWith('/api/')) {
    // 初始化数据库表（幂等）
    if (env.DB) {
      await ensureSchema(env.DB)
    }

    if (path === '/api/health' && request.method === 'GET') {
      return handleHealth(request, env)
    }

    if (path === '/api/auth/register' && request.method === 'POST') {
      return handleRegister(request, env)
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
      return handleLogin(request, env)
    }

    if (path === '/api/auth/me' && request.method === 'GET') {
      return handleMe(request, env)
    }

    if (path === '/api/captcha/gen' && request.method === 'POST') {
      return handleCaptchaGen(request, env)
    }

    if (path === '/api/captcha/verify' && request.method === 'POST') {
      return handleCaptchaVerify(request, env)
    }

    return jsonResponse({ success: false, message: 'Not Found' }, 404)
  }

  // 3) 静态资源：交给 Pages 内置 ASSETS fetcher
  if (env.ASSETS) {
    return env.ASSETS.fetch(request)
  }

  return jsonResponse({ success: false, message: 'Static assets not available' }, 404)
}

// ===================== 路由处理器 =====================

async function handleHealth(request, env) {
  return jsonResponse({
    success: true,
    data: {
      ok: true,
      hasDB: !!env.DB,
      hasJWT: !!env.JWT_SECRET,
      time: new Date().toISOString()
    }
  })
}

async function handleRegister(request, env) {
  if (!env.DB) {
    return jsonResponse({ success: false, message: '数据库未绑定' }, 503)
  }

  const body = await parseJson(request)

  // 验证码校验
  const captchaToken = String(body.captchaToken || '')
  if (!await verifyCaptchaToken(captchaToken, env)) {
    return jsonResponse({ success: false, message: '请先完成验证码验证' }, 400)
  }

  const username = String(body.username || '').trim().toLowerCase()
  const password = String(body.password || '')

  // 参数校验
  if (!username || !password) {
    return jsonResponse({ success: false, message: '用户名和密码不能为空' }, 400)
  }
  if (!isValidUsername(username)) {
    return jsonResponse({ success: false, message: '用户名只能包含字母、数字、下划线，长度 3-32 位' }, 400)
  }
  if (password.length < 6) {
    return jsonResponse({ success: false, message: '密码长度至少为 6 位' }, 400)
  }

  // 检查用户名是否已存在
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).bind(username).first()

  if (existing) {
    return jsonResponse({ success: false, message: '用户名已被注册' }, 409)
  }

  // 密码哈希
  const { salt, hash } = await hashPassword(password)

  // 写入用户
  const result = await env.DB.prepare(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)'
  ).bind(username, hash, salt).run()

  const userId = result.meta?.last_row_id
  if (!userId) {
    return jsonResponse({ success: false, message: '注册失败，请稍后重试' }, 500)
  }

  // 签发 JWT
  const token = await signJWT({
    sub: String(userId),
    username,
    iat: now(),
    exp: now() + 60 * 60 * 24 * 7 // 7 天
  }, env.JWT_SECRET)

  return jsonResponse({
    success: true,
    message: '注册成功',
    data: { token, userId, username }
  })
}

async function handleLogin(request, env) {
  if (!env.DB) {
    return jsonResponse({ success: false, message: '数据库未绑定' }, 503)
  }

  const body = await parseJson(request)

  // 验证码校验
  const captchaToken = String(body.captchaToken || '')
  if (!await verifyCaptchaToken(captchaToken, env)) {
    return jsonResponse({ success: false, message: '请先完成验证码验证' }, 400)
  }

  const username = String(body.username || '').trim().toLowerCase()
  const password = String(body.password || '')

  if (!username || !password) {
    return jsonResponse({ success: false, message: '用户名和密码不能为空' }, 400)
  }

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash, salt FROM users WHERE username = ?'
  ).bind(username).first()

  if (!user) {
    return jsonResponse({ success: false, message: '用户名或密码错误' }, 401)
  }

  const valid = await verifyPassword(password, user.salt, user.password_hash)
  if (!valid) {
    return jsonResponse({ success: false, message: '用户名或密码错误' }, 401)
  }

  const token = await signJWT({
    sub: String(user.id),
    username: user.username,
    iat: now(),
    exp: now() + 60 * 60 * 24 * 7
  }, env.JWT_SECRET)

  return jsonResponse({
    success: true,
    message: '登录成功',
    data: {
      token,
      userId: user.id,
      username: user.username
    }
  })
}

async function handleMe(request, env) {
  if (!env.DB) {
    return jsonResponse({ success: false, message: '数据库未绑定' }, 503)
  }

  const user = await getAuthUser(request, env)
  if (!user) {
    return jsonResponse({ success: false, message: '未登录或 token 已过期' }, 401)
  }

  return jsonResponse({
    success: true,
    data: {
      userId: user.id,
      username: user.username
    }
  })
}

// ===================== 验证码（参考 tianai-captcha 滑动拼图交互）=====================

const CAPTCHA_WIDTH = 280
const CAPTCHA_HEIGHT = 160
const CAPTCHA_SLOT_SIZE = 44
const CAPTCHA_TOLERANCE = 6

async function handleCaptchaGen(request, env) {
  if (!env.JWT_SECRET) {
    return jsonResponse({ success: false, message: '验证码服务未配置' }, 503)
  }

  const body = await parseJson(request)
  // 前端可传入实际显示宽度，后端按同比例生成
  let width = parseInt(body.width, 10)
  if (!width || width < 200 || width > 600) {
    width = CAPTCHA_WIDTH
  }
  const height = Math.round(width * CAPTCHA_HEIGHT / CAPTCHA_WIDTH)
  const slotSize = Math.round(width * CAPTCHA_SLOT_SIZE / CAPTCHA_WIDTH)

  // 缺口目标位置：宽度的 25% ~ 75%
  const minX = Math.floor(width * 0.25)
  const maxX = Math.floor(width * 0.75)
  const targetX = minX + Math.floor(Math.random() * (maxX - minX))

  const id = await signJWT({
    type: 'captcha',
    x: targetX,
    iat: now(),
    exp: now() + 300 // 5 分钟有效期
  }, env.JWT_SECRET)

  return jsonResponse({
    success: true,
    data: {
      id,
      width,
      height,
      slotSize,
      targetX
    }
  })
}

async function handleCaptchaVerify(request, env) {
  if (!env.JWT_SECRET) {
    return jsonResponse({ success: false, message: '验证码服务未配置' }, 503)
  }

  const body = await parseJson(request)
  const id = String(body.id || '')
  const x = parseInt(body.x, 10)

  if (!id || isNaN(x)) {
    return jsonResponse({ success: false, message: '参数错误' }, 400)
  }

  let payload
  try {
    payload = await verifyJWT(id, env.JWT_SECRET)
  } catch (err) {
    return jsonResponse({ success: false, message: '验证码已过期，请刷新' }, 400)
  }

  if (payload.type !== 'captcha' || typeof payload.x !== 'number') {
    return jsonResponse({ success: false, message: '验证码无效' }, 400)
  }

  if (Math.abs(x - payload.x) > CAPTCHA_TOLERANCE) {
    return jsonResponse({ success: false, message: '验证失败，请重试' }, 400)
  }

  // 签发一次性验证通过 token，用于后续注册/登录
  const token = await signJWT({
    type: 'captcha_verified',
    iat: now(),
    exp: now() + 120 // 2 分钟内有效
  }, env.JWT_SECRET)

  return jsonResponse({
    success: true,
    message: '验证成功',
    data: { token }
  })
}

async function verifyCaptchaToken(captchaToken, env) {
  if (!captchaToken) return false
  try {
    const payload = await verifyJWT(captchaToken, env.JWT_SECRET)
    return payload.type === 'captcha_verified'
  } catch {
    return false
  }
}

// ===================== 认证工具 =====================

async function getAuthUser(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (!match) return null

  const token = match[1]
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET)
    const userId = parseInt(payload.sub, 10)
    if (!userId || isNaN(userId)) return null

    const user = await env.DB.prepare(
      'SELECT id, username FROM users WHERE id = ?'
    ).bind(userId).first()

    return user || null
  } catch (err) {
    console.error('Auth error:', err)
    return null
  }
}

// ===================== 密码哈希（PBKDF2-SHA256）=====================

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  )

  return {
    salt: arrayBufferToBase64(salt),
    hash: arrayBufferToBase64(new Uint8Array(derived))
  }
}

async function verifyPassword(password, saltB64, hashB64) {
  const encoder = new TextEncoder()
  const salt = base64ToUint8Array(saltB64)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  )

  const actual = new Uint8Array(derived)
  const expected = base64ToUint8Array(hashB64)

  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i]
  }
  return diff === 0
}

// ===================== JWT（HS256，无外部依赖）=====================

async function signJWT(payload, secret) {
  const encoder = new TextEncoder()
  const header = { alg: 'HS256', typ: 'JWT' }

  const hB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)))
  const pB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${hB64}.${pB64}`

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  return `${signingInput}.${base64UrlEncode(signature)}`
}

async function verifyJWT(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const [hB64, pB64, sB64] = parts
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const signature = base64UrlDecode(sB64)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    encoder.encode(`${hB64}.${pB64}`)
  )

  if (!valid) throw new Error('Invalid token signature')

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(pB64)))
  if (payload.exp && payload.exp < now()) {
    throw new Error('Token expired')
  }
  return payload
}

// ===================== 数据库 =====================

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
}

// ===================== 通用工具 =====================

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders()
    }
  })
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  }
}

async function parseJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(username)
}

function now() {
  return Math.floor(Date.now() / 1000)
}

// Base64 / Base64Url
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function base64UrlEncode(buffer) {
  return arrayBufferToBase64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64UrlDecode(str) {
  const pad = (4 - (str.length % 4)) % 4
  if (pad) str += '='.repeat(pad)
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  return base64ToUint8Array(str)
}
