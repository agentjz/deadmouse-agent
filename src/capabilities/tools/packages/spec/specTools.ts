import type { RegisteredTool } from "../../core/types.js";
import {
  specCheckpointCreateTool,
  specCheckpointListTool,
  specCheckpointRestoreTool,
} from "./checkpointTools.js";
import {
  specListTool,
  specSearchTool,
} from "./discoveryTools.js";
import {
  specAppendNoteTool,
  specReadDocumentTool,
  specWriteDocumentTool,
} from "./documentTools.js";
import {
  specCreateTool,
  specOpenTool,
} from "./lifecycleTools.js";
import { specUpdateStateTool } from "./stateTools.js";
import { specTaskUpdateTool } from "./taskTools.js";

export {
  specCheckpointCreateTool,
  specCheckpointListTool,
  specCheckpointRestoreTool,
  specCreateTool,
  specAppendNoteTool,
  specListTool,
  specOpenTool,
  specReadDocumentTool,
  specSearchTool,
  specTaskUpdateTool,
  specUpdateStateTool,
  specWriteDocumentTool,
};

export function createSpecTools(): RegisteredTool[] {
  return [
    specListTool,
    specSearchTool,
    specCreateTool,
    specOpenTool,
    specUpdateStateTool,
    specAppendNoteTool,
    specWriteDocumentTool,
    specReadDocumentTool,
    specCheckpointCreateTool,
    specCheckpointListTool,
    specCheckpointRestoreTool,
    specTaskUpdateTool,
  ];
}
