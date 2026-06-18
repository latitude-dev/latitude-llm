import { flue } from "@flue/runtime/routing"
import { Hono } from "hono"
import "./telemetry.ts"

const app = new Hono()
app.route("/", flue())

export default app
