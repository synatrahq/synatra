import { theme } from "../app"
import intercomLight from "../assets/images/intercom_light.svg"
import intercomDark from "../assets/images/intercom_dark.svg"
import githubLight from "../assets/images/github_light.svg"
import githubDark from "../assets/images/github_dark.svg"

const APP_ICONS: Record<string, { light: string; dark: string }> = {
  intercom: { light: intercomLight, dark: intercomDark },
  github: { light: githubLight, dark: githubDark },
}

export function AppIcon(props: { appId: string; class?: string }) {
  const icon = APP_ICONS[props.appId]
  if (!icon) return null
  return <img src={theme() === "dark" ? icon.dark : icon.light} alt="" class={props.class} />
}
