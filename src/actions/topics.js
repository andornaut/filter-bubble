import { createCollectionActions } from "./factories";

export const topicActions = createCollectionActions("topics", "text");
export const { toContentKey, toId } = topicActions;
