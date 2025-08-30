import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/media-card.js',
    format: 'es',
    sourcemap: false
  },
  plugins: [
    resolve(),
    commonjs(),
    terser()
  ],
  external: ['lit']
};
