declare module "plotly.js-basic-dist-min" {
  const Plotly: {
    newPlot: (root: HTMLElement | string, data: unknown[], layout?: unknown, config?: unknown) => Promise<void>
    purge: (root: HTMLElement | string) => void
    react: (root: HTMLElement | string, data: unknown[], layout?: unknown, config?: unknown) => Promise<void>
  }
  export default Plotly
}
