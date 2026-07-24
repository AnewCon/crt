// ========== Cloudflare Worker - CRT 后端 API ==========

// 简单的 bcrypt-like 哈希（Worker 环境没有原生 crypto.scrypt，使用 PBKDF2）
async function hashPassword(password, salt) {
  const encoder = new TextEncoder()
  const passwordData = encoder.encode(password)
  const saltData = encoder.encode(salt)
  const keyMaterial = await crypto.subtle.importKey(
    'raw', passwordData, { name: 'PBKDF2' }, false, ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  )
  return arrayBufferToHex(hash)
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateSalt() {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return arrayBufferToHex(arr)
}

// JWT 实现
async function signJWT(payload, secret) {
  const encoder = new TextEncoder()
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '')
  const data = `${headerB64}.${payloadB64}`
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '')
  return `${data}.${sigB64}`
}

async function verifyJWT(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts
  const encoder = new TextEncoder()
  const data = `${headerB64}.${payloadB64}`
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(data))
  if (!valid) return null
  try {
    return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

// CORS 响应头
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  }
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  })
}

// 初始化数据库表
async function initDB(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS quiz_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      bank_name TEXT NOT NULL,
      progress_data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, bank_name),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      bank_name TEXT NOT NULL,
      bank_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, bank_name),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run()
}

// 请求处理器
async function handleRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const origin = request.headers.get('Origin') || '*'

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const db = env.DB
  await initDB(db)

  const headers = corsHeaders(origin)

  try {
    // 注册
    if (path === '/api/auth/register' && request.method === 'POST') {
      const { username, password } = await request.json()
      if (!username || !password) {
        return jsonResponse({ success: false, message: '用户名和密码不能为空' }, 400, headers)
      }
      if (username.length < 3 || username.length > 20) {
        return jsonResponse({ success: false, message: '用户名长度应为 3-20 位' }, 400, headers)
      }
      if (password.length < 6) {
        return jsonResponse({ success: false, message: '密码长度至少为 6 位' }, 400, headers)
      }

      const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
      if (existing) {
        return jsonResponse({ success: false, message: '用户名已存在' }, 409, headers)
      }

      const salt = generateSalt()
      const passwordHash = await hashPassword(password, salt)

      const result = await db.prepare(
        'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)'
      ).bind(username, passwordHash, salt).run()

      const userId = result.meta?.last_row_id
      const token = await signJWT({ userId, username }, env.JWT_SECRET)

      return jsonResponse({
        success: true,
        message: '注册成功',
        data: { token, username, userId }
      }, 201, headers)
    }

    // 登录
    if (path === '/api/auth/login' && request.method === 'POST') {
      const { username, password } = await request.json()
      if (!username || !password) {
        return jsonResponse({ success: false, message: '用户名和密码不能为空' }, 400, headers)
      }

      const user = await db.prepare(
        'SELECT id, username, password_hash, salt FROM users WHERE username = ?'
      ).bind(username).first()

      if (!user) {
        return jsonResponse({ success: false, message: '用户名或密码错误' }, 401, headers)
      }

      const inputHash = await hashPassword(password, user.salt)
      if (inputHash !== user.password_hash) {
        return jsonResponse({ success: false, message: '用户名或密码错误' }, 401, headers)
      }

      const token = await signJWT({ userId: user.id, username: user.username }, env.JWT_SECRET)

      return jsonResponse({
        success: true,
        message: '登录成功',
        data: { token, username, userId: user.id }
      }, 200, headers)
    }

    // 获取当前用户
    if (path === '/api/auth/me' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ success: false, message: '未登录' }, 401, headers)
      }

      const token = authHeader.slice(7)
      const payload = await verifyJWT(token, env.JWT_SECRET)
      if (!payload) {
        return jsonResponse({ success: false, message: '登录已过期' }, 401, headers)
      }

      return jsonResponse({
        success: true,
        data: { userId: payload.userId, username: payload.username }
      }, 200, headers)
    }

    // 同步答题进度
    if (path === '/api/progress/sync' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ success: false, message: '未登录' }, 401, headers)
      }

      const token = authHeader.slice(7)
      const payload = await verifyJWT(token, env.JWT_SECRET)
      if (!payload) {
        return jsonResponse({ success: false, message: '登录已过期' }, 401, headers)
      }

      const { bankName, progressData } = await request.json()
      if (!bankName || !progressData) {
        return jsonResponse({ success: false, message: '参数错误' }, 400, headers)
      }

      await db.prepare(`
        INSERT INTO quiz_progress (user_id, bank_name, progress_data)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, bank_name)
        DO UPDATE SET progress_data = excluded.progress_data, updated_at = CURRENT_TIMESTAMP
      `).bind(payload.userId, bankName, JSON.stringify(progressData)).run()

      return jsonResponse({ success: true, message: '同步成功' }, 200, headers)
    }

    // 获取答题进度
    if (path === '/api/progress/get' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ success: false, message: '未登录' }, 401, headers)
      }

      const token = authHeader.slice(7)
      const payload = await verifyJWT(token, env.JWT_SECRET)
      if (!payload) {
        return jsonResponse({ success: false, message: '登录已过期' }, 401, headers)
      }

      const bankName = url.searchParams.get('bankName')
      if (!bankName) {
        return jsonResponse({ success: false, message: '参数错误' }, 400, headers)
      }

      const row = await db.prepare(
        'SELECT progress_data FROM quiz_progress WHERE user_id = ? AND bank_name = ?'
      ).bind(payload.userId, bankName).first()

      return jsonResponse({
        success: true,
        data: row ? JSON.parse(row.progress_data) : null
      }, 200, headers)
    }

    return jsonResponse({ success: false, message: '接口不存在' }, 404, headers)
  } catch (error) {
    return jsonResponse({ success: false, message: error.message || '服务器错误' }, 500, headers)
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env)
  }
}
