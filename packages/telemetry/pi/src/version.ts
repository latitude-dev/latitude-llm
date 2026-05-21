declare const __PACKAGE_VERSION__: string

export const packageVersion = typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : "0.0.0-dev"
