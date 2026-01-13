import { createSignal, createMemo, For, Show } from "solid-js"
import { MagnifyingGlass } from "phosphor-solid-js"
import * as PhosphorIcons from "phosphor-solid-js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconModule = Record<string, any>

// Curated list of commonly used icons
const ICON_LIST = [
  "Cube",
  "Stack",
  "User",
  "Users",
  "Gear",
  "Lightning",
  "Database",
  "Table",
  "FileText",
  "Folder",
  "FolderOpen",
  "House",
  "Bell",
  "BellRinging",
  "ChatCircle",
  "ChatCircleDots",
  "Envelope",
  "EnvelopeOpen",
  "Calendar",
  "CalendarBlank",
  "Clock",
  "Timer",
  "ChartBar",
  "ChartLine",
  "ChartPie",
  "TrendUp",
  "TrendDown",
  "CurrencyDollar",
  "Money",
  "CreditCard",
  "Wallet",
  "ShoppingCart",
  "ShoppingBag",
  "Package",
  "Truck",
  "MapPin",
  "MapTrifold",
  "Globe",
  "GlobeSimple",
  "Airplane",
  "Car",
  "Bicycle",
  "Heart",
  "HeartStraight",
  "Star",
  "StarFour",
  "Sparkle",
  "Sun",
  "Moon",
  "Cloud",
  "CloudSun",
  "Tree",
  "Flower",
  "Fire",
  "Drop",
  "Snowflake",
  "Rocket",
  "PaperPlane",
  "Trophy",
  "Medal",
  "Crown",
  "Diamond",
  "Gem",
  "Gift",
  "Tag",
  "Ticket",
  "Bookmark",
  "Flag",
  "CheckCircle",
  "XCircle",
  "WarningCircle",
  "Info",
  "Question",
  "Lightbulb",
  "Key",
  "Lock",
  "LockOpen",
  "Shield",
  "ShieldCheck",
  "Eye",
  "EyeSlash",
  "Fingerprint",
  "IdentificationCard",
  "IdentificationBadge",
  "Notebook",
  "NotePencil",
  "Pencil",
  "PencilSimple",
  "Eraser",
  "Highlighter",
  "Paperclip",
  "Link",
  "LinkSimple",
  "ArrowSquareOut",
  "Copy",
  "Clipboard",
  "ClipboardText",
  "Terminal",
  "Code",
  "CodeBlock",
  "BracketsCurly",
  "Function",
  "GitBranch",
  "GitCommit",
  "GitMerge",
  "GitPullRequest",
  "Bug",
  "Wrench",
  "Hammer",
  "ScrewdriverSimple",
  "Toolbox",
  "Cpu",
  "HardDrive",
  "DesktopTower",
  "Laptop",
  "DeviceMobile",
  "DeviceTablet",
  "Keyboard",
  "Mouse",
  "Headphones",
  "Microphone",
  "Camera",
  "VideoCamera",
  "Image",
  "Images",
  "FilmSlate",
  "MusicNote",
  "Play",
  "Pause",
  "Stop",
  "SkipForward",
  "SkipBack",
  "Repeat",
  "Shuffle",
  "SpeakerHigh",
  "SpeakerLow",
  "SpeakerNone",
  "Wifi",
  "WifiHigh",
  "Bluetooth",
  "Broadcast",
  "Rss",
  "Activity",
  "Pulse",
  "Heartbeat",
  "FirstAid",
  "Pill",
  "Syringe",
  "Thermometer",
  "Stethoscope",
  "Dna",
  "Atom",
  "Flask",
  "TestTube",
  "Beaker",
  "MathOperations",
  "Percent",
  "Hash",
  "At",
  "Asterisk",
  "CircleDashed",
  "Circle",
  "Square",
  "Triangle",
  "Pentagon",
  "Hexagon",
  "Octagon",
  "Polygon",
  "Path",
  "PaintBrush",
  "Palette",
  "Eyedropper",
  "SelectionAll",
  "BoundingBox",
  "GridFour",
  "Rows",
  "Columns",
  "Layout",
  "SplitHorizontal",
  "SplitVertical",
  "ArrowsHorizontal",
  "ArrowsVertical",
  "ArrowsOutCardinal",
  "ArrowsInCardinal",
  "Export",
  "DownloadSimple",
  "UploadSimple",
  "CloudArrowDown",
  "CloudArrowUp",
  "ShareNetwork",
  "Share",
  "Archive",
  "Trash",
  "TrashSimple",
  "Recycle",
  "PlusCircle",
  "MinusCircle",
  "Plus",
  "Minus",
  "X",
  "Check",
  "Power",
  "SignIn",
  "SignOut",
  "UserCircle",
  "UserPlus",
  "UserMinus",
  "AddressBook",
  "Handshake",
  "ThumbsUp",
  "ThumbsDown",
  "HandPointing",
  "HandWaving",
  "Smiley",
  "SmileyWink",
  "SmileyMeh",
  "SmileySad",
  "Skull",
  "Ghost",
  "Robot",
  "Alien",
  "Cat",
  "Dog",
  "Bird",
  "Fish",
  "Horse",
  "Paw",
] as const

const ICON_COLORS = [
  { id: "gray", value: "#6B7280", bgClass: "bg-gray-500" },
  { id: "yellow", value: "#F59E0B", bgClass: "bg-amber-500" },
  { id: "red", value: "#EF4444", bgClass: "bg-red-500" },
  { id: "blue", value: "#3B82F6", bgClass: "bg-blue-500" },
  { id: "green", value: "#22C55E", bgClass: "bg-green-500" },
  { id: "plum", value: "#A855F7", bgClass: "bg-purple-500" },
  { id: "indigo", value: "#6366F1", bgClass: "bg-indigo-500" },
] as const

export type IconColor = (typeof ICON_COLORS)[number]["id"]

type IconPickerProps = {
  selectedIcon: string
  selectedColor: IconColor
  onIconChange: (icon: string) => void
  onColorChange: (color: IconColor) => void
}

export function IconPicker(props: IconPickerProps) {
  const [search, setSearch] = createSignal("")

  const filteredIcons = createMemo(() => {
    const q = search().toLowerCase()
    if (!q) return ICON_LIST
    return ICON_LIST.filter((name) => name.toLowerCase().includes(q))
  })

  const selectedColorValue = createMemo(() => {
    return ICON_COLORS.find((c) => c.id === props.selectedColor)?.value ?? ICON_COLORS[0].value
  })

  const renderIcon = (name: string) => {
    const icons = PhosphorIcons as IconModule
    const IconComponent = icons[name]
    if (!IconComponent) return null
    const isSelected = props.selectedIcon === name
    return (
      <span style={{ color: isSelected ? "white" : selectedColorValue() }}>
        <IconComponent size={16} weight="duotone" />
      </span>
    )
  }

  return (
    <div class="flex flex-col gap-2 w-48">
      {/* Search */}
      <div class="relative">
        <MagnifyingGlass class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search icons..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="h-7 w-full rounded border border-border bg-surface-elevated pl-7 pr-2 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:shadow-[0_0_0_1px_var(--color-accent)]"
        />
      </div>

      {/* Icon Grid */}
      <div class="grid max-h-40 grid-cols-7 gap-0.5 overflow-y-auto scrollbar-thin">
        <For each={filteredIcons()}>
          {(name) => (
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded transition-colors"
              classList={{
                "bg-accent": props.selectedIcon === name,
                "hover:bg-surface-muted": props.selectedIcon !== name,
              }}
              onClick={() => props.onIconChange(name)}
              title={name}
            >
              {renderIcon(name)}
            </button>
          )}
        </For>
      </div>

      {/* Empty state */}
      <Show when={filteredIcons().length === 0}>
        <div class="flex h-20 items-center justify-center text-xs text-text-muted">No icons found</div>
      </Show>

      {/* Color picker */}
      <div class="grid grid-cols-7 gap-0.5 border-t border-border pt-2">
        <For each={ICON_COLORS}>
          {(color) => (
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded transition-colors"
              classList={{
                "ring-1 ring-offset-1 ring-offset-surface": props.selectedColor === color.id,
              }}
              style={{
                "background-color": color.value,
                "--tw-ring-color": props.selectedColor === color.id ? color.value : undefined,
              }}
              onClick={() => props.onColorChange(color.id)}
              title={color.id}
            />
          )}
        </For>
      </div>
    </div>
  )
}

// Utility to get icon component by name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getIconComponent(name: string): any {
  const icons = PhosphorIcons as IconModule
  return icons[name] ?? null
}

// Export color values for use elsewhere
export { ICON_COLORS, ICON_LIST }
