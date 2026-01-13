export const ChannelIconColors = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const

export type ChannelIconColor = (typeof ChannelIconColors)[number]
