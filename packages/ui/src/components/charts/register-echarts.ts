/// <reference path="../../echarts-subpaths.d.ts" />
import { BarChart } from "echarts/charts"
import { BrushComponent, GridComponent, ToolboxComponent, TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

echarts.use([BarChart, GridComponent, TooltipComponent, ToolboxComponent, BrushComponent, CanvasRenderer])

export { echarts }
