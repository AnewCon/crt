const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, 'dist')
fs.mkdirSync(distDir, { recursive: true })

const staticFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'quiz-storage.js',
  'default-questions.js',
  'server.js',
  'start.bat',
  'DESIGN.md',
  'README.md'
]

staticFiles.forEach(file => {
  const src = path.join(__dirname, file)
  const dest = path.join(distDir, file)
  try {
    fs.copyFileSync(src, dest)
    console.log(`Copied: ${file}`)
  } catch (err) {
    console.warn(`Skipped: ${file} (${err.message})`)
  }
})

// 将 Worker 复制到 dist/_worker.js，供 Cloudflare Pages Functions 使用
try {
  fs.copyFileSync(path.join(__dirname, 'src', 'worker.js'), path.join(distDir, '_worker.js'))
  console.log('Copied: _worker.js')
} catch (err) {
  console.warn(`Skipped: _worker.js (${err.message})`)
}

console.log('Build complete')
