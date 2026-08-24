import { generateMetadata } from "@tryforge/forgescript" 
import { join } from "node:path"

generateMetadata(join(__dirname, "native"), "native")