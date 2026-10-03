; EffectScript (ADR-0058): its keywords, operators and declarations, after JavaScript's and
; TypeScript's patterns (later patterns win)

[
  "effect"
  "schema"
  "error"
  "service"
  "layer"
  "config"
  "atom"
  "group"
  "api"
  "command"
  "test"
  "describe"
  "doctest"
  "impl"
  "main"
  "defer"
  "throws"
  "needs"
  "match"
  "when"
  "middleware"
  "status"
] @keyword

(match_arm "default" @keyword)

"|>" @operator

(topic_reference) @variable.builtin

(flag_parameter "--" @operator)

(effect_declaration
  name: (identifier) @function)

(effect_method
  name: (property_identifier) @function.method)

(effect_method_signature
  name: (property_identifier) @function.method)

(command_declaration
  name: (identifier) @function)

(schema_declaration
  name: (identifier) @type)

(schema_variant
  name: (identifier) @type)

(error_declaration
  name: (identifier) @type)

(config_declaration
  name: (identifier) @type)

(service_declaration
  name: (identifier) @type)

(group_declaration
  name: (identifier) @type)

(api_declaration
  name: (identifier) @type)

(schema_field
  name: (property_identifier) @property)

(service_property
  name: (property_identifier) @property)

(flag_parameter
  name: (identifier) @variable.parameter)

(route
  method: (identifier) @keyword
  name: (identifier) @function.method
  path: (string) @string.special)
