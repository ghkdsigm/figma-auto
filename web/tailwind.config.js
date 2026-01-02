/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  safelist: [
    // layout
    { pattern: /^(block|inline-block|inline|flex|inline-flex|grid|hidden)$/ },
    { pattern: /^flex-(row|col|row-reverse|col-reverse)$/ },
    { pattern: /^items-(start|center|end|baseline|stretch)$/ },
    { pattern: /^justify-(start|center|end|between|around|evenly)$/ },

    // spacing (0~96 정도는 대부분 커버)
    { pattern: /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-([0-9]|[1-9][0-9])$/ },
    { pattern: /^gap-([0-9]|[1-9][0-9])$/ },

    // size
    { pattern: /^w-(auto|full|screen|min|max|fit)$/ },
    { pattern: /^h-(auto|full|screen|min|max|fit)$/ },

    // typography
    { pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/ },
    { pattern: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/ },
    { pattern: /^leading-(none|tight|snug|normal|relaxed|loose)$/ },
    { pattern: /^tracking-(tighter|tight|normal|wide|wider|widest)$/ },

    // border / radius / shadow
    { pattern: /^rounded(-[a-z0-9]+)?$/ },
    { pattern: /^border(-[a-z0-9]+)?$/ },
    { pattern: /^shadow(-[a-z0-9]+)?$/ },

    // colors (hex / css var 기반 arbitrary)
    { pattern: /^(bg|text|border)-\[#([0-9a-fA-F]{3,8})\]$/ },
    { pattern: /^(bg|text|border)-\[var\(--.*\)\]$/ },
  ],
  theme: { extend: {} },
  plugins: [],
}
