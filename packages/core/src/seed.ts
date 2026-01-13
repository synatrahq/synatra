import { seedAgentTemplates } from "./agent-template"

console.log("Seeding agent templates")

seedAgentTemplates()
  .then(() => {
    console.log("Seed completed")
    process.exit(0)
  })
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
