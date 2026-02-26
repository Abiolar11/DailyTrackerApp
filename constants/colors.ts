const palette = {
  blue: "#4F8EF7",
  blueDim: "#2D6EE8",
  amber: "#F7A84F",
  amberDim: "#E08A2A",
  green: "#5EE0A0",
  red: "#F76F6F",
  purple: "#9B7FE8",
  teal: "#4FD8D8",
};

const theme = {
  bg0: "#0a0a0f",
  bg1: "#12121a",
  bg2: "#1a1a26",
  bg3: "#22223a",
  border: "#2a2a42",
  borderLight: "#3a3a55",
  text: "#f0f0f8",
  textSub: "#9090b8",
  textMuted: "#5a5a7a",
};

export default {
  palette,
  theme,
  categories: {
    work: palette.blue,
    health: palette.green,
    personal: palette.amber,
    learning: palette.purple,
    social: palette.teal,
    rest: "#8899BB",
    other: "#6677AA",
  },
  light: {
    text: theme.text,
    background: theme.bg0,
    tint: palette.blue,
    tabIconDefault: theme.textMuted,
    tabIconSelected: palette.blue,
  },
};
