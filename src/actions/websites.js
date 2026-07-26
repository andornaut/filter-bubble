import { createCollectionActions } from "./factories";

export const websiteActions = createCollectionActions("websites", "addresses");
export const { toContentKey, toId } = websiteActions;
