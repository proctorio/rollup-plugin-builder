// Produces the dual-format lib/: the ESM source copied as-is plus an esbuild CJS transform, so
// the plugin loads in both native ESM consumers and build tools that require() their config
// dependencies as CommonJS.
import { build } from "esbuild";
import fs from "node:fs/promises";

await fs.rm("lib", { recursive: true, force: true });
await fs.mkdir("lib", { recursive: true });
await fs.copyFile("src/index.js", "lib/index.js");
await build({
	entryPoints: ["src/index.js"],
	outfile: "lib/index.cjs",
	format: "cjs",
	platform: "node",
	bundle: false,
	logLevel: "error"
});
console.log("built lib/index.js (esm) + lib/index.cjs (cjs)");
