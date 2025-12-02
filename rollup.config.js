/**
 * Rollup configuration for Media Card
 * Bundles modular source into single ha-media-card.js file
 * Preserves CDN Lit import at top of output
 */

export default {
  input: 'src/main.js',
  output: {
    file: 'ha-media-card.js',
    format: 'es',
    banner: '/** \n * Media Card v5.4.0\n */',
    // Preserve the Lit CDN import - don't bundle it
    paths: {
      'https://unpkg.com/lit@3/index.js?module': 'https://unpkg.com/lit@3/index.js?module'
    }
  },
  external: [
    // Mark Lit as external so it's not bundled
    'https://unpkg.com/lit@3/index.js?module'
  ],
  // No plugins needed - we're just concatenating ES modules
  // The Lit import stays as CDN import, everything else gets inlined
};
