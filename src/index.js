import fs from "node:fs/promises";
import path from "node:path";
import CleanCSS from "clean-css";

// Rollup plugin that copies static asset directories into the build output, minifying text
// assets on the way and optionally stamping a license banner into html/css files. Banner text
// is caller-supplied with {{year}}/{{startYear}} placeholders - nothing company- or
// year-specific is baked into the plugin.

const DEFAULT_EXTENSIONS = ["htm", "html", "css", "json", "nmf", "xml", "svg", "webp", "gif", "png"];
const BINARY_EXTENSIONS = ["webp", "gif", "png"];

const BANNER_STYLES = {
	js: {
		open: "/**\n* @license\n",
		linePrefix: "* ",
		close: "*/",
		trailingNewline: false
	},
	css: {
		open: "/*\n",
		linePrefix: "",
		close: "*/",
		trailingNewline: true
	},
	html: {
		open: "<!--\n",
		linePrefix: "",
		close: "-->",
		trailingNewline: true
	}
};

/**
 * @description Renders banner text as a comment block for the given file style, substituting
 * the {{year}} and {{startYear}} placeholders.
 * @param {string} text - Banner text lines (may contain {{year}} and {{startYear}}).
 * @param {string} style - One of "js", "css" or "html".
 * @param {number|string} [startYear] - Value for the {{startYear}} placeholder.
 * @return {string} Comment-wrapped banner.
 */
export function renderBanner(text, style, startYear)
{
	const STYLE = BANNER_STYLES[style];
	if (!STYLE)
	{
		throw new Error(`[builder] Unknown banner style "${style}" - use js, css or html.`);
	}

	let rendered = text.replaceAll("{{year}}", new Date().getFullYear());

	const HAS_START_PLACEHOLDER = rendered.includes("{{startYear}}");
	if (startYear === null || typeof startYear === "undefined")
	{
		if (HAS_START_PLACEHOLDER)
		{
			throw new Error("[builder] The banner has a {{startYear}} placeholder but no startYear was provided.");
		}
	}
	else
	{
		if (!HAS_START_PLACEHOLDER)
		{
			throw new Error("[builder] startYear was provided but the banner has no {{startYear}} placeholder.");
		}

		rendered = rendered.replaceAll("{{startYear}}", startYear);
	}

	const LINES = rendered.split("\n").map(line => STYLE.linePrefix + line).join("\n");

	return STYLE.open + LINES + "\n" + STYLE.close + (STYLE.trailingNewline ? "\n" : "");
}

/**
 * @description Minifies html: collapses whitespace and strips comments.
 * @param {string} content - Raw html.
 * @return {string} Minified html.
 */
function minifyHtml(content)
{
	let minified = content.replaceAll(/\r\n|\n|\t/giu, " ");
	minified = minified.replaceAll(/>\s+</giu, "><").trim();
	minified = minified.replaceAll(/\s{2,}/giu, " ");
	minified = minified.replaceAll(/<!--[\d\D]*?-->/giu, "");

	return minified;
}

/**
 * @description Minifies css through clean-css.
 * @param {string} content - Raw css.
 * @return {string} Minified css.
 */
function minifyCss(content)
{
	return new CleanCSS().minify(content).styles;
}

/**
 * @description Compresses xml by collapsing inter-tag whitespace.
 * @param {string} content - Raw xml.
 * @return {string} Compressed xml.
 */
function compressXml(content)
{
	return content.replaceAll(/>\s+</giu, "><").trim();
}

/**
 * @description Processes one text asset by extension, prepending the rendered banner where the
 * format supports comments.
 * @param {string} content - File content.
 * @param {string} extension - Lowercase file extension.
 * @param {Object} banners - Pre-rendered banners keyed by style, or empty object.
 * @return {string} Processed content.
 */
function processContent(content, extension, banners)
{
	if (extension === "htm" || extension === "html")
	{
		return (banners.html || "") + minifyHtml(content);
	}

	if (extension === "css")
	{
		return (banners.css || "") + minifyCss(content);
	}

	if (extension === "xml")
	{
		return compressXml(content);
	}

	// json, nmf and svg are copied through untouched
	return content;
}

/**
 * @description Gets the lowercase extension of a filename.
 * @param {string} name - File name.
 * @return {string} Lowercase extension.
 */
function fileExtension(name)
{
	return name.split(".").pop().toLowerCase();
}

/**
 * @description Copies or processes one file into the output directory.
 * @param {Object} dir - Directory mapping the file belongs to.
 * @param {string} name - File name.
 * @param {string} output - Resolved output directory.
 * @param {Object} banners - Pre-rendered banners keyed by style.
 * @return {Promise<void>} Resolves when the file is written.
 */
async function processFile(dir, name, output, banners)
{
	const EXTENSION = fileExtension(name);
	const SOURCE = path.join(dir.in, name);
	const TARGET = path.join(output, (dir.rename || {})[name] || name);

	if (BINARY_EXTENSIONS.includes(EXTENSION))
	{
		return fs.copyFile(SOURCE, TARGET);
	}

	const CONTENT = await fs.readFile(SOURCE, "utf8");

	return fs.writeFile(TARGET, processContent(CONTENT, EXTENSION, banners), "utf8");
}

/**
 * @description Copies and processes the accepted files of one directory (files only - nested
 * directories are configured as their own entries).
 * @param {Object} dir - Directory mapping.
 * @param {string} dir.in - Input directory.
 * @param {string} dir.out - Output directory relative to location.
 * @param {Object} [dir.rename] - Output filename overrides keyed by input filename.
 * @param {string} location - Output root.
 * @param {Array<string>} extensions - Accepted file extensions.
 * @param {Object} banners - Pre-rendered banners keyed by style.
 * @return {Promise<void>} Resolves when the directory is processed.
 */
async function processDir(dir, location, extensions, banners)
{
	const OUTPUT = path.join(location, dir.out);
	await fs.mkdir(OUTPUT, { recursive: true });

	const ITEMS = await fs.readdir(dir.in, { withFileTypes: true });
	const ACCEPTED = ITEMS.filter(item => item.isFile() && extensions.includes(fileExtension(item.name)));

	await Promise.all(ACCEPTED.map(item => processFile(dir, item.name, OUTPUT, banners)));
}

/**
 * @description Rollup plugin that copies asset directories into the build output, minifying
 * text assets and stamping the configured banner into html/css files. Failures throw and fail
 * the build.
 * @param {Object} options - Plugin options.
 * @param {Array<Object>} options.dirs - Directory mappings: { in, out, rename? }.
 * @param {string} options.location - Output root the out paths are resolved against.
 * @param {Object} [options.banner] - Banner config: { text, startYear? }. Stamped into html/css.
 * @param {Array<string>} [options.extensions] - Accepted file extensions (default covers common web assets).
 * @return {Object} Rollup plugin.
 */
export default function builder(options)
{
	const { dirs, location, banner, extensions = DEFAULT_EXTENSIONS } = options || {};

	if (!Array.isArray(dirs) || !dirs.length)
	{
		throw new Error("[builder] The dirs option is required and must be a non-empty array.");
	}

	if (!location || typeof location !== "string")
	{
		throw new Error("[builder] The location option is required.");
	}

	// render once up front so a bad banner config fails at config load, not mid-build
	const BANNERS = banner ? {
		html: renderBanner(banner.text, "html", banner.startYear),
		css: renderBanner(banner.text, "css", banner.startYear)
	} : {};

	return {
		name: "builder",

		/**
		 * @description Processes every configured directory once the bundle finishes; a
		 * rejection here fails the build.
		 */
		async buildEnd()
		{
			await Promise.all(dirs.map(dir => processDir(dir, location, extensions, BANNERS)));
		}
	};
}
