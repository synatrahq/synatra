import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import sitemap from "@astrojs/sitemap"
import tailwindcss from "@tailwindcss/vite"
import solidJs from "@astrojs/solid-js"

export default defineConfig({
  site: "https://synatrahq.com",
  integrations: [
    solidJs(),
    sitemap(),
    starlight({
      title: "Synatra",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
      },
      description: "The AI workspace",
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Outfit:wght@600&display=swap",
          },
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/synatrahq/synatra",
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Introduction", slug: "docs" },
            { label: "Quickstart", slug: "docs/quickstart" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Agents", slug: "docs/concepts/agents" },
            { label: "Tools", slug: "docs/concepts/tools" },
            { label: "Resources", slug: "docs/concepts/resources" },
            { label: "Environments", slug: "docs/concepts/environments" },
            { label: "Triggers", slug: "docs/concepts/triggers" },
            { label: "Prompts", slug: "docs/concepts/prompts" },
            { label: "Subagents", slug: "docs/concepts/subagents" },
            { label: "Runs", slug: "docs/concepts/runs" },
            { label: "Inbox", slug: "docs/concepts/inbox" },
          ],
        },
      ],
      customCss: ["./src/styles/global.css", "./src/styles/docs.css"],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
