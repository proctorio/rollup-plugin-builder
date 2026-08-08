import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import builder, { renderBanner } from "../src/index.js";

const BANNER_TEXT = "COPYRIGHT (C) {{startYear}}-{{year}} EXAMPLE INC.\nALL RIGHTS RESERVED.";

let m_dir = null;
let m_in = null;
let m_out = null;

beforeEach(async() =>
{
	m_dir = await fs.mkdtemp(path.join(os.tmpdir(), "builder-test-"));
	m_in = path.join(m_dir, "in");
	m_out = path.join(m_dir, "out");
	await fs.mkdir(m_in, { recursive: true });
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2027-06-15"));
});

afterEach(async() =>
{
	vi.useRealTimers();
	await fs.rm(m_dir, {
		recursive: true,
		force: true
	});
});

/**
 * @description Writes a file into the input dir.
 * @param {string} name - File name.
 * @param {string|Buffer} content - File content.
 * @return {Promise<void>} Resolves when written.
 */
function writeInput(name, content)
{
	return fs.writeFile(path.join(m_in, name), content);
}

/**
 * @description Runs the plugin over the standard in/out mapping.
 * @param {Object} overrides - Option overrides.
 * @return {Promise<void>} Resolves when the build hook completes.
 */
function run(overrides = {})
{
	return builder({
		dirs: [{
			in: m_in,
			out: "assets"
		}],
		location: m_out,
		...overrides
	}).buildEnd();
}

/**
 * @description Reads a produced output file.
 * @param {string} name - File name under the assets output dir.
 * @return {Promise<string>} File content.
 */
function readOutput(name)
{
	return fs.readFile(path.join(m_out, "assets", name), "utf8");
}

describe("renderBanner()", function()
{
	it("Should wrap the text per style and substitute years", function()
	{
		expect(renderBanner("(C) {{startYear}}-{{year}} X", "css", 2013)).toBe("/*\n(C) 2013-2027 X\n*/\n");
		expect(renderBanner("(C) {{startYear}}-{{year}} X", "html", 2013)).toBe("<!--\n(C) 2013-2027 X\n-->\n");
		expect(renderBanner("(C) {{year}} X", "js")).toBe("/**\n* @license\n* (C) 2027 X\n*/");
	});

	it("Should prefix every line in js style", function()
	{
		expect(renderBanner("A\nB", "js")).toBe("/**\n* @license\n* A\n* B\n*/");
	});

	it("Should throw on an unknown style", function()
	{
		expect(() => renderBanner("X", "xml")).toThrow(/Unknown banner style/u);
	});

	it("Should throw when startYear and the placeholder disagree", function()
	{
		expect(() => renderBanner("(C) {{startYear}}-{{year}} X", "css")).toThrow(/no startYear was provided/u);
		expect(() => renderBanner("(C) {{year}} X", "css", 2013)).toThrow(/no \{\{startYear\}\} placeholder/u);
	});
});

describe("builder()", function()
{
	it("Should require dirs and location", function()
	{
		expect(() => builder()).toThrow(/dirs option is required/u);
		expect(() => builder({ dirs: [] })).toThrow(/dirs option is required/u);
		expect(() => builder({ dirs: [{ in: "a",
																																		out: "b" }] })).toThrow(/location option is required/u);
	});

	it("Should reject a bad banner config at construction, not mid-build", function()
	{
		expect(() => builder({
			dirs: [{ in: "a",
												out: "b" }],
			location: "c",
			banner: { text: "(C) {{startYear}} X" }
		})).toThrow(/no startYear was provided/u);
	});

	it("Should minify html, strip comments and stamp the banner", async function()
	{
		await writeInput("page.html", "<html>\n\t<!-- note -->\n\t<body>  <p>hi</p>  </body>\n</html>");
		await run({ banner: { text: BANNER_TEXT,
																								startYear: 2013 } });

		const OUTPUT = await readOutput("page.html");
		expect(OUTPUT).toBe("<!--\nCOPYRIGHT (C) 2013-2027 EXAMPLE INC.\nALL RIGHTS RESERVED.\n-->\n<html><body><p>hi</p></body></html>");
	});

	it("Should minify css and stamp the banner", async function()
	{
		await writeInput("style.css", "body {\n\tcolor: red;\n}\n");
		await run({ banner: { text: BANNER_TEXT,
																								startYear: 2013 } });

		const OUTPUT = await readOutput("style.css");
		expect(OUTPUT).toBe("/*\nCOPYRIGHT (C) 2013-2027 EXAMPLE INC.\nALL RIGHTS RESERVED.\n*/\nbody{color:red}");
	});

	it("Should not stamp when no banner is configured", async function()
	{
		await writeInput("style.css", "body { color: red; }");
		await run();
		expect(await readOutput("style.css")).toBe("body{color:red}");
	});

	it("Should compress xml and pass json/svg through untouched", async function()
	{
		await writeInput("data.xml", "<root>\n  <item>1</item>\n</root>");
		await writeInput("data.json", "{\n\t\"a\": 1\n}");
		await writeInput("icon.svg", "<svg>\n<circle/>\n</svg>");
		await run();

		expect(await readOutput("data.xml")).toBe("<root><item>1</item></root>");
		expect(await readOutput("data.json")).toBe("{\n\t\"a\": 1\n}");
		expect(await readOutput("icon.svg")).toBe("<svg>\n<circle/>\n</svg>");
	});

	it("Should copy binary files byte for byte", async function()
	{
		const BYTES = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0xFF]);
		await writeInput("img.png", BYTES);
		await run();

		const OUTPUT = await fs.readFile(path.join(m_out, "assets", "img.png"));
		expect(Buffer.compare(OUTPUT, BYTES)).toBe(0);
	});

	it("Should apply the rename map", async function()
	{
		await writeInput("popup.html", "<p>x</p>");
		await builder({
			dirs: [{
				in: m_in,
				out: "assets",
				rename: { "popup.html": "GEVb.html" }
			}],
			location: m_out
		}).buildEnd();

		expect(await readOutput("GEVb.html")).toBe("<p>x</p>");
		await expect(readOutput("popup.html")).rejects.toThrow(/ENOENT/u);
	});

	it("Should skip unaccepted extensions and nested directories", async function()
	{
		await writeInput("script.js", "let a = 1;");
		await fs.mkdir(path.join(m_in, "nested"));
		await fs.writeFile(path.join(m_in, "nested", "inner.css"), "a{}");
		await run();

		await expect(readOutput("script.js")).rejects.toThrow(/ENOENT/u);
		await expect(readOutput("nested")).rejects.toThrow(/ENOENT|EISDIR/u);
	});

	it("Should honor a custom extensions list", async function()
	{
		await writeInput("notes.txt", "keep me");
		await run({ extensions: ["txt"] });
		expect(await readOutput("notes.txt")).toBe("keep me");
	});

	it("Should process multiple dirs in one run", async function()
	{
		const SECOND = path.join(m_dir, "in2");
		await fs.mkdir(SECOND);
		await writeInput("a.json", "{}");
		await fs.writeFile(path.join(SECOND, "b.json"), "[]");

		await builder({
			dirs: [
				{
					in: m_in,
					out: "assets"
				},
				{
					in: SECOND,
					out: "assets/second"
				}
			],
			location: m_out
		}).buildEnd();

		expect(await readOutput("a.json")).toBe("{}");
		expect(await fs.readFile(path.join(m_out, "assets", "second", "b.json"), "utf8")).toBe("[]");
	});

	it("Should fail the build when an input dir is missing", async function()
	{
		const PLUGIN = builder({
			dirs: [{ in: path.join(m_dir, "missing"),
												out: "assets" }],
			location: m_out
		});

		await expect(PLUGIN.buildEnd()).rejects.toThrow(/ENOENT/u);
	});
});
