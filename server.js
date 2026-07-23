const http = require('http')
const fs = require('fs')
const path = require('path')

const root = __dirname
const port = 8080

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0]
  let filePath = path.join(root, cleanUrl === '/' ? 'index.html' : cleanUrl)
  const ext = path.extname(filePath).toLowerCase()
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    const charset = contentType.startsWith('text/') || contentType === 'application/javascript' || contentType === 'application/json' ? '; charset=utf-8' : ''
    res.writeHead(200, { 'Content-Type': contentType + charset })
    res.end(data)
  })
})

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`)
})
