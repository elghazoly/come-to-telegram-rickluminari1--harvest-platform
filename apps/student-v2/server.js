const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const PORT = 3003

// Simple reverse proxy for /api calls → student Next.js app
const NEXT_APP = 'http://localhost:3002'

http.createServer(async (req, res) => {
  // Serve the HTML file for all non-API routes
  if (!req.url.startsWith('/api/')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  // Proxy /api/* to Next.js student app
  const { default: http2 } = await import('http')
  const options = {
    hostname: '127.0.0.1',
    port: 3002,
    path: req.url,
    method: req.method,
    headers: req.headers
  }
  const proxy = http2.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxy.on('error', () => { res.writeHead(500); res.end('API Error') })
  req.pipe(proxy)
}).listen(PORT, () => console.log(`Student v2 running on port ${PORT}`))
