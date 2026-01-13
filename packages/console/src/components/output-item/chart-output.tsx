import { onMount, onCleanup, createSignal, createEffect, on, Show } from "solid-js"
import { theme } from "../../app"
import type { OutputItem } from "../../app/api"

type ChartDataset = {
  label?: string
  data: number[]
}

type ChartPayload = {
  type: "line" | "bar" | "pie"
  data: {
    labels: string[]
    datasets: ChartDataset[]
  }
}

type ChartOutputProps = {
  item: OutputItem
  compact?: boolean
}

export function ChartOutput(props: ChartOutputProps) {
  let containerRef: HTMLDivElement | undefined
  let plotlyRef: typeof import("plotly.js-basic-dist-min") | null = null
  const [error, setError] = createSignal<string | null>(null)

  const payload = () => props.item.payload as ChartPayload
  const chartData = () => payload()?.data
  const chartType = () => payload()?.type ?? "line"

  const buildPlotlyData = () => {
    const data = chartData()
    if (!data) return []
    const { labels, datasets } = data
    if (!labels || labels.length === 0 || !datasets || datasets.length === 0) return []

    switch (chartType()) {
      case "line":
        return datasets.map((ds) => ({ x: labels, y: ds.data, type: "scatter", mode: "lines+markers", name: ds.label }))
      case "bar":
        return datasets.map((ds) => ({ x: labels, y: ds.data, type: "bar", name: ds.label }))
      case "pie":
        return [{ labels, values: datasets[0].data, type: "pie" }]
      default:
        return datasets.map((ds) => ({ x: labels, y: ds.data, type: "scatter", mode: "lines+markers", name: ds.label }))
    }
  }

  const buildLayout = (isDark: boolean) => {
    const gridColor = isDark ? "#21262d" : "#e4e4e7"
    const textColor = isDark ? "#e6edf3" : "#18181b"
    return {
      margin: { t: 30, r: 20, b: 40, l: 50 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { color: textColor, size: 10 },
      xaxis: { gridcolor: gridColor, zerolinecolor: gridColor },
      yaxis: { gridcolor: gridColor, zerolinecolor: gridColor },
      autosize: true,
    }
  }

  onMount(async () => {
    if (!containerRef) return

    onCleanup(() => {
      if (containerRef && plotlyRef) {
        plotlyRef.default.purge(containerRef)
      }
    })

    try {
      plotlyRef = await import("plotly.js-basic-dist-min")
      const data = buildPlotlyData()
      const layout = buildLayout(theme() === "dark")
      const config = { responsive: true, displayModeBar: false }
      await plotlyRef.default.newPlot(containerRef, data, layout, config)
    } catch (e) {
      setError("Failed to load chart library")
      console.error("Chart error:", e)
    }
  })

  createEffect(
    on(
      theme,
      (currentTheme) => {
        if (!containerRef || !plotlyRef) return
        const data = buildPlotlyData()
        const layout = buildLayout(currentTheme === "dark")
        plotlyRef.default.react(containerRef, data, layout)
      },
      { defer: true },
    ),
  )

  return (
    <div class={props.compact ? "space-y-1" : "space-y-2"}>
      <Show when={props.item.name && !props.compact}>
        <h4 class="text-sm font-medium text-text">{props.item.name}</h4>
      </Show>

      <Show when={error()}>
        <div
          class={
            props.compact
              ? "rounded border border-danger/50 bg-danger/5 p-2 text-2xs text-danger"
              : "rounded-lg border border-danger/50 bg-danger/5 p-3 text-xs text-danger"
          }
        >
          {error()}
        </div>
      </Show>

      <div
        ref={containerRef}
        class={
          props.compact
            ? "w-full h-40 rounded border border-border bg-surface"
            : "w-full h-64 rounded-lg border border-border bg-surface"
        }
      />
    </div>
  )
}
