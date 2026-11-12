import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import handler from './server/app.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'local-functions',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        req.url = `/api${req.url}`;
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) { res.statusCode = 413; res.end(); return; }
        }
        req.body = body || '{}';
        res.status = (status) => { res.statusCode = status; return res; };
        res.json = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        await handler(req, res);
      });
    },
  }],
})
