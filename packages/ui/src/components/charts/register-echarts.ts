/// <reference path="../../echarts-subpaths.d.ts" />
import { BarChart, LineChart } from "echarts/charts"
import { BrushComponent, GridComponent, LegendComponent, ToolboxComponent, TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  BrushComponent,
  LegendComponent,
  CanvasRenderer,
])

export { echarts }
