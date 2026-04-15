/// <reference path="../../echarts-subpaths.d.ts" />
import { BarChart, PieChart } from "echarts/charts"
import { BrushComponent, GridComponent, LegendComponent, ToolboxComponent, TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  ToolboxComponent,
  BrushComponent,
  CanvasRenderer,
])

export { echarts }
