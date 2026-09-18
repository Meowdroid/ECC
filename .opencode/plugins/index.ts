/**
 * ECC OpenCode plugin entrypoint.
 *
 * OpenCode v2 auto-discovers this file from the global/project plugins directory.
 * Keep support modules outside plugins/ so they are not auto-loaded as separate
 * plugin implementations.
 */
import ECCHooksPlugin from "../plugin-support/ecc-hooks.ts"
import ECCV2Plugin from "../plugin-support/ecc-v2.ts"

export default {
  ...ECCV2Plugin,
  server: ECCHooksPlugin,
}
