/**
 * ECC OpenCode plugin entrypoint.
 *
 * OpenCode v2 requires a default { id, setup } definition.
 * OpenCode v1 >= 1.18.29 accepts the same object with a server() adapter.
 * Keep this module default-only because older v1 loaders iterate exports.
 */
import ECCHooksPlugin from "./plugins/ecc-hooks.ts"
import ECCV2Plugin from "./plugins/ecc-v2.ts"

export default {
  ...ECCV2Plugin,
  server: ECCHooksPlugin,
}
