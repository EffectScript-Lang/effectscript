; Indents in nvim-treesitter's format (ADR-0058)
[
  (statement_block)
  (class_body)
  (object)
  (array)
  (arguments)
  (formal_parameters)
  (object_type)
  (switch_body)
  (schema_body)
  (service_body)
  (command_parameters)
  (match_expression)
  (group_declaration)
  (api_declaration)
] @indent.begin

[ "}" "]" ")" ] @indent.end @indent.branch

(comment) @indent.auto
