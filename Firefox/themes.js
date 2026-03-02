/**
 * AI Chat TOC - Shared Theme Data
 * Defines the 8 predefined themes and default settings.
 */

const THEMES = {
    emerald: {
        name: "Emerald",
        light: { accent: "#10a37f", accentLight: "rgba(16, 163, 127, 0.1)", accentHover: "#0d8a6a" },
        dark: { accent: "#34d399", accentLight: "rgba(52, 211, 153, 0.14)", accentHover: "#10b981" }
    },
    sapphire: {
        name: "Sapphire",
        light: { accent: "#4285f4", accentLight: "rgba(66, 133, 244, 0.1)", accentHover: "#3367d6" },
        dark: { accent: "#60a5fa", accentLight: "rgba(96, 165, 250, 0.14)", accentHover: "#3b82f6" }
    },
    teal: {
        name: "Teal",
        light: { accent: "#20b2aa", accentLight: "rgba(32, 178, 170, 0.1)", accentHover: "#1a9690" },
        dark: { accent: "#2dd4bf", accentLight: "rgba(45, 212, 191, 0.14)", accentHover: "#14b8a6" }
    },
    sunset: {
        name: "Sunset",
        light: { accent: "#ea580c", accentLight: "rgba(234, 88, 12, 0.1)", accentHover: "#c2410c" },
        dark: { accent: "#fb923c", accentLight: "rgba(251, 146, 60, 0.14)", accentHover: "#f97316" }
    },
    slate: {
        name: "Slate",
        light: { accent: "#0f172a", accentLight: "rgba(15, 23, 42, 0.1)", accentHover: "#1e293b" },
        dark: { accent: "#f8fafc", accentLight: "rgba(248, 250, 252, 0.2)", accentHover: "#e2e8f0" }
    },
    rose: {
        name: "Rose",
        light: { accent: "#e11d48", accentLight: "rgba(225, 29, 72, 0.1)", accentHover: "#be123c" },
        dark: { accent: "#fb7185", accentLight: "rgba(251, 113, 133, 0.14)", accentHover: "#f43f5e" }
    },
    violet: {
        name: "Violet",
        light: { accent: "#7c3aed", accentLight: "rgba(124, 58, 237, 0.1)", accentHover: "#6d28d9" },
        dark: { accent: "#a78bfa", accentLight: "rgba(167, 139, 250, 0.14)", accentHover: "#8b5cf6" }
    }
};

const DEFAULT_THEMES = {
    chatgpt: "emerald",
    gemini: "sapphire",
    perplexity: "teal",
    claude: "sunset",
    grok: "slate"
};

const DEFAULT_SETTINGS = {
    themeMode: "system", // light, dark, system
    themes: DEFAULT_THEMES,
    showAnswers: false,
    tocSize: "normal"
};

// Make it available to content script and popup
if (typeof module !== 'undefined') {
    module.exports = { THEMES, DEFAULT_THEMES, DEFAULT_SETTINGS };
}
