import { generateMetadata } from "@tryforge/forgescript"
import { join } from "node:path"
import { HANDLER } from "../managers"

generateMetadata(
    join(__dirname, "..", "native"),
    "native",
    HANDLER,
    undefined,
    undefined,
    join(__dirname, "..", "events")
)
