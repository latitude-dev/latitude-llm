/**
 * ECharts `package.json` `exports` omit `types` for `./core`, `./charts`, etc., so under
 * `moduleResolution: "NodeNext"` TypeScript does not attach the correct `.d.ts` for those
 * subpaths. Re-export the official declaration bundles so tree-shaken imports typecheck.
 */
declare module "echarts/core" {
  export * from "echarts/types/dist/core"
}

declare module "echarts/charts" {
  export * from "echarts/types/dist/charts"
}

declare module "echarts/components" {
  export * from "echarts/types/dist/components"
}

declare module "echarts/renderers" {
  export * from "echarts/types/dist/renderers"
}

declare module "echarts-for-react/lib/core" {
  const EChartsReactCore: unknown
  export default EChartsReactCore
}
