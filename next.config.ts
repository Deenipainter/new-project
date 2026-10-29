import type { NextConfig } from "next";

// Written by IQX because this project had no Next config. Edit or replace it
// freely: IQX never overwrites a config that already exists.
const nextConfig: NextConfig = {
  devIndicators: false,
  // three / @react-three/* ship untranspiled ESM that Next must transpile, else
  // 3D scenes fail to render. Listing packages a project does not install is a
  // harmless no-op.
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  // The preview is served from a public host that differs from the in-container
  // dev origin, so Next 16 blocks cross-origin /_next and HMR without this.
  allowedDevOrigins: [
    "*.iqx.dev",
    ...(process.env.IQX_PROJECT_ID || process.env.PROJECT_ID
      ? [
          `https://preview-${process.env.IQX_PROJECT_ID || process.env.PROJECT_ID}-web.iqx.dev`,
          `preview-${process.env.IQX_PROJECT_ID || process.env.PROJECT_ID}-mobile.iqx.dev`,
        ]
      : []),
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
  },
};

export default nextConfig;
