/**
 * Published ECC OpenCode plugin entrypoint.
 *
 * Re-export the same dual v2/v1 definition used by local auto-discovery so the
 * package and installed config cannot drift onto different plugin implementations.
 */
export { default } from "./plugins/index.ts"
