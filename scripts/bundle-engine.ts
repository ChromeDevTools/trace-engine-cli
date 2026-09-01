// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import path from 'node:path';
import * as esbuild from 'esbuild';

const devtoolsPath = process.env.DEVTOOLS_PATH || '../devtools-frontend';
const entryPoint = path.resolve(devtoolsPath, 'front_end/models/trace/trace.ts');
const outfile = path.resolve('./src/engine/vendor/trace_engine.js');

await esbuild.build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  loader: { '.ts': 'ts', '.js': 'js' },
  resolveExtensions: ['.ts', '.js'],
  plugins: [
    {
      name: 'resolve-ts-imports',
      setup(build) {
        build.onResolve({ filter: /^\..*\.js$/ }, (args) => {
          const tsPath = path.resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
          return { path: tsPath };
        });
      },
    },
  ],
});
