"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const node_path_1 = require("node:path");
const managers_1 = require("../managers");
(0, forgescript_1.generateMetadata)((0, node_path_1.join)(__dirname, "..", "native"), "native", managers_1.HANDLER, undefined, undefined, (0, node_path_1.join)(__dirname, "..", "events"));
//# sourceMappingURL=docgen.js.map