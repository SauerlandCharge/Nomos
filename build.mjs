// Frontend-Build: Tailwind-CSS + esbuild-Bundle. Aufruf: `node build.mjs [--watch]`.
import { execFileSync, spawn } from "node:child_process";
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const tw = (extra) => ["tailwindcss", "-c", "tailwind.config.js", "-i", "public/src/app.css", "-o", "public/app.css", "--minify", ...extra];
const esbuildOpts = {
  entryPoints: ["public/src/app.jsx"],
  bundle: true,
  format: "esm",
  outfile: "public/app.js",
  loader: { ".js": "jsx", ".jsx": "jsx" },
  jsx: "transform",
  minify: !watch,
  sourcemap: true,
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "info",
};

if (watch) {
  spawn("npx", tw(["--watch"]), { stdio: "inherit" });
  const ctx = await esbuild.context(esbuildOpts);
  await ctx.watch();
  console.log("watching …");
} else {
  execFileSync("npx", tw([]), { stdio: "inherit" });
  await esbuild.build(esbuildOpts);
  console.log("build done.");
}
