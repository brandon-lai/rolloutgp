/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from 'node:child_process';

const commit=process.env.VERCEL_GIT_COMMIT_SHA || (()=>{try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{return 'unknown';}})();

export default defineConfig({
  plugins: [react(), {name:'build-revision',generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({version:'1.1.0-rc.1',commit})+'\n'});}}],
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
  test: { environment: "node", testTimeout: 120000, hookTimeout: 60000 },
});
