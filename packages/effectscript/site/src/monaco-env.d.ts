/**
 * Monaco's editor contributions ship as untyped side-effect modules: the playground loads the
 * hover widget this way, since `editor.api` leaves contributions out (ADR-0088).
 */
declare module "monaco-editor/editor/contrib/hover/browser/hoverContribution"
