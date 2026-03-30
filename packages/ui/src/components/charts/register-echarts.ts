/// <reference path="../../echarts-subpaths.d.ts" />
import { BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

export { echarts }
