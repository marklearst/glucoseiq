import { createMDX } from "fumadocs-mdx/next"
import { createCoreApiRedirects } from "./scripts/lib/api-redirects.mjs"

const withMDX = createMDX()

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  redirects: async () => createCoreApiRedirects(),
}

export default withMDX(config)
