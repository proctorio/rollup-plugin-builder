# rollup-plugin-builder

Copies static asset directories into the build output, minifying text assets on the way and optionally stamping a license banner into html/css files. Banner text is caller-supplied with `{{year}}`/`{{startYear}}` placeholders — nothing company- or year-specific is baked into the plugin.

Processing by extension:

| Extension            | Treatment |
| -------------------- | --------- |
| `htm`, `html`        | whitespace/comment minify + banner |
| `css`                | clean-css minify + banner |
| `xml`                | inter-tag whitespace compression |
| `json`, `nmf`, `svg` | copied through untouched |
| `webp`, `gif`, `png` | copied byte for byte |

Files with other extensions and nested directories are skipped — configure nested directories as their own `dirs` entries.

## Installation

```bash
npm install rollup-plugin-builder
```

## Usage

```js
// rollup.config.js
import builder, { renderBanner } from "rollup-plugin-builder";

const BANNER = "COPYRIGHT (C) {{startYear}}-{{year}} EXAMPLE INC.\nALL RIGHTS RESERVED.";

export default {
	output: {
		// the js-style banner works for rollup's own banner option too
		banner: renderBanner(BANNER, "js", 2010)
	},
	plugins: [
		builder({
			location: "_build/",
			banner: {
				text: BANNER,
				startYear: 2010
			},
			dirs: [
				{ in: "src", out: "assets", rename: { "popup.html": "p.html" } },
				{ in: "webassets", out: "webassets" }
			]
		})
	]
};
```

## Options

| Option       | Required | Description |
| ------------ | -------- | ----------- |
| `dirs`       | yes      | Array of `{ in, out, rename? }` mappings. `out` is resolved against `location`; `rename` maps input filenames to output filenames. |
| `location`   | yes      | Output root directory. |
| `banner`     | no       | `{ text, startYear? }`. Rendered and stamped into html/css outputs. `{{year}}` becomes the current year; `{{startYear}}` requires the `startYear` value (and vice versa). |
| `extensions` | no       | Accepted file extensions (defaults to the table above). |

`renderBanner(text, style, startYear?)` is exported for stamping banners outside the copy pipeline — `style` is `"js"`, `"css"` or `"html"`.

All failures throw and fail the build.

## Development

```
npm install
npm test        # vitest
npm run coverage
npm run lint
```
