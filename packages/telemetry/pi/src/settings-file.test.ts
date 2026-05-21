import { describe, expect, it } from "vitest"
import { addPackage, hasPackage, removePackage } from "./settings-file.ts"

describe("pi settings package helpers", () => {
  it("adds a pinned npm package source and replaces previous Latitude entries", () => {
    const settings = addPackage(
      {
        theme: "dark",
        packages: [
          "npm:@latitude-data/pi-telemetry@0.0.0",
          "npm:other-package",
          { source: "@latitude-data/pi-telemetry@0.0.0", extensions: [] },
        ],
      },
      "npm:@latitude-data/pi-telemetry@0.0.1",
    )

    expect(settings.theme).toBe("dark")
    expect(settings.packages).toEqual(["npm:other-package", "npm:@latitude-data/pi-telemetry@0.0.1"])
    expect(hasPackage(settings)).toBe(true)
  })

  it("removes string and object package entries", () => {
    const settings = removePackage({
      packages: ["npm:@latitude-data/pi-telemetry@0.0.1", { source: "npm:@latitude-data/pi-telemetry" }, "npm:x"],
    })

    expect(settings.packages).toEqual(["npm:x"])
    expect(hasPackage(settings)).toBe(false)
  })
})
