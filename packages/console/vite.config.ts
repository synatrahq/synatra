import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss(), solid()],
  server: {
    host: true,
    port: 5173,
  },
})
