import { Hono } from "hono"
import { serveStatic } from "@hono/node-server/serve-static"
import fs from "node:fs"
import path from "node:path"

const STATIC_DIR = path.join(import.meta.dirname, "../static")
const WWW_DIR = path.join(STATIC_DIR, "www")
const CONSOLE_DIR = path.join(STATIC_DIR, "console")

const IMMUTABLE = "public, max-age=31536000, immutable"
const ONE_DAY = "public, max-age=86400"
const ONE_HOUR = "public, max-age=3600"

function staticExists() {
  return fs.existsSync(WWW_DIR) && fs.existsSync(CONSOLE_DIR)
}

export function setupStatic(app: Hono) {
  if (!staticExists()) return

  app.use(
    "/_astro/*",
    serveStatic({
      root: WWW_DIR,
      rewriteRequestPath: (p) => p,
      onFound: (_, c) => c.header("Cache-Control", IMMUTABLE),
    }),
  )

  app.use(
    "/pagefind/*",
    serveStatic({
      root: WWW_DIR,
      rewriteRequestPath: (p) => p,
      onFound: (_, c) => c.header("Cache-Control", ONE_DAY),
    }),
  )

  app.use(
    "/videos/*",
    serveStatic({
      root: WWW_DIR,
      rewriteRequestPath: (p) => p,
      onFound: (_, c) => c.header("Cache-Control", ONE_DAY),
    }),
  )

  const wwwFiles = [
    "/favicon.svg",
    "/sitemap-index.xml",
    "/sitemap-0.xml",
    "/robots.txt",
    "/og-image.png",
    "/llms.txt",
    "/llms-full.txt",
  ]
  for (const file of wwwFiles) {
    app.get(
      file,
      serveStatic({
        root: WWW_DIR,
        path: file,
        onFound: (_, c) => c.header("Cache-Control", ONE_DAY),
      }),
    )
  }

  app.get(
    "/",
    serveStatic({
      root: WWW_DIR,
      path: "/index.html",
      onFound: (_, c) => c.header("Cache-Control", ONE_HOUR),
    }),
  )

  const wwwPages = ["/pricing", "/terms", "/privacy", "/commercial-transactions-act"]
  for (const page of wwwPages) {
    app.get(page, (c) => {
      const file = path.join(WWW_DIR, page, "index.html")
      if (!fs.existsSync(file)) return c.notFound()
      c.header("Cache-Control", ONE_HOUR)
      return c.html(fs.readFileSync(file, "utf-8"))
    })
  }

  app.get(
    "/docs",
    serveStatic({
      root: WWW_DIR,
      path: "/docs/index.html",
      onFound: (_, c) => c.header("Cache-Control", ONE_HOUR),
    }),
  )

  app.get("/docs/*", (c) => {
    const p = c.req.path
    const file = path.resolve(WWW_DIR, "." + p, "index.html")
    if (!file.startsWith(WWW_DIR) || !fs.existsSync(file)) {
      return c.html(fs.readFileSync(path.join(WWW_DIR, "404.html"), "utf-8"), 404)
    }
    c.header("Cache-Control", ONE_HOUR)
    return c.html(fs.readFileSync(file, "utf-8"))
  })

  app.use(
    "/assets/*",
    serveStatic({
      root: CONSOLE_DIR,
      rewriteRequestPath: (p) => p,
      onFound: (_, c) => c.header("Cache-Control", IMMUTABLE),
    }),
  )

  app.get("*", (c) => {
    c.header("Cache-Control", ONE_HOUR)
    return c.html(fs.readFileSync(path.join(CONSOLE_DIR, "index.html"), "utf-8"))
  })
}
