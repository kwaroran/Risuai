// Centralized regex for matching inlay tokens in chat content.
// Used by both renderer/parsers and summarization sanitizers.
export const inlayTokenRegex = /{{(inlay|inlayed|inlayeddata)::(.+?)}}/g;

