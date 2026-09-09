/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ConsCell design tokens (CSS variables defined in index.css) */
        abyss: "var(--bg-abyss)",
        panel: "var(--bg-panel)",
        editor: "var(--bg-editor)",
        raised: "var(--bg-raised)",
        inset: "var(--bg-inset)",
        hairline: "var(--border-hairline)",
        strong: "var(--border-strong)",
        /* text colors: text-primary / text-secondary / text-muted */
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        /* accents */
        steel: {
          DEFAULT: "var(--steel)",
          bright: "var(--steel-bright)",
          dim: "var(--steel-dim)",
        },
        lisp: {
          DEFAULT: "var(--lisp-purple)",
          purple: "var(--lisp-purple)",
          deep: "var(--lisp-deep)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        info: "var(--info)",
        /* shadcn-compatible aliases mapped onto the dark design tokens */
        border: "var(--border-hairline)",
        input: "var(--border-hairline)",
        ring: "var(--steel)",
        background: "var(--bg-abyss)",
        foreground: "var(--text-primary)",
        "primary-foreground": "var(--bg-abyss)",
        "secondary-foreground": "var(--text-primary)",
        "muted-foreground": "var(--text-secondary)",
        "accent-foreground": "var(--text-primary)",
        "destructive-foreground": "var(--bg-abyss)",
        "card-foreground": "var(--text-primary)",
        "popover-foreground": "var(--text-primary)",
        destructive: "var(--error)",
        accent: "var(--steel-dim)",
        popover: "var(--bg-raised)",
        card: "var(--bg-raised)",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "12px",
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      boxShadow: {
        modal: "0 24px 64px rgba(0,0,0,.55)",
        "glow-cta": "0 8px 32px rgba(124,110,220,.35)",
        "focus-ring": "0 0 0 2px rgba(110,168,220,.45)",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(.2,.7,.3,1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "float-soft": {
          "0%,100%": { transform: "translateY(-6px)" },
          "50%": { transform: "translateY(6px)" },
        },
        "glow-pulse": {
          "0%,100%": { boxShadow: "0 8px 32px rgba(124,110,220,.35)" },
          "50%": { boxShadow: "0 8px 48px rgba(124,110,220,.5)" },
        },
        "scan-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "chevron-drop": {
          "0%,100%": { transform: "translateY(0)", opacity: "0.5" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        marquee: "marquee 24s linear infinite",
        "float-soft": "float-soft 4s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "scan-x": "scan-x 240ms cubic-bezier(.2,.7,.3,1) both",
        "chevron-drop": "chevron-drop 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
