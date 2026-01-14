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
      description: "The AI workspace for human-AI collaboration",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/synatrahq/synatra",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "docs" },
            { label: "Quick Start", slug: "docs/quick-start" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Agents", slug: "docs/concepts/agents" },
            { label: "Tools", slug: "docs/concepts/tools" },
            { label: "Resources", slug: "docs/concepts/resources" },
          ],
        },
      ],
      customCss: ["./src/styles/global.css"],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
