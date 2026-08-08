import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.Test.js"],
		reporters: ["default", "junit"],
		outputFile: ".test_output/test-results.xml",
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "cobertura"],
			reportsDirectory: ".test_output",
			include: ["src/**/*.js"],
			thresholds: {
				lines: 70,
				statements: 80,
				functions: 80,
				branches: 50
			}
		}
	}
});
