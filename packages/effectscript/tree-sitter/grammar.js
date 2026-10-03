/**
 * @file EffectScript for tree-sitter: TypeScript's grammar, plus Effect as syntax (ADR-0058).
 *
 * Every EffectScript keyword is contextual, as in the compiler (spec §4.19): each one is also a
 * `_reserved_identifier`, so `const effect = 1` or `schema.parse(x)` stay identifiers.
 *
 * @license MIT
 */
import TypeScript from "tree-sitter-typescript/typescript/grammar.js"

const keywords = [
  "effect",
  "schema",
  "error",
  "service",
  "layer",
  "config",
  "atom",
  "group",
  "api",
  "command",
  "test",
  "describe",
  "doctest",
  "impl",
  "main",
  "defer",
  "throws",
  "needs",
  "match",
  "when",
  "middleware"
]

/** One or more `rule`, separated by `separator`. */
const sep1 = (rule, separator) => seq(rule, repeat(seq(separator, rule)))

export default grammar(TypeScript, {
  name: "effectscript",

  conflicts: ($, previous) =>
    previous.concat([
      [$.primary_expression, $.effect_arrow_function],
      [$.schema_variant, $.primary_type],
      [$.primary_expression, $.test_statement],
      [$.primary_expression, $.describe_statement],
      [$.primary_expression, $.defer_statement],
      [$.primary_expression, $.effect_block],
      [$.primary_expression, $.match_expression],
      [$.primary_expression, $.impl_expression],
      [$.primary_expression, $._property_name, $.effect_arrow_function],
      [$.primary_expression, $.effect_method],
      [$.primary_expression, $._property_name, $.impl_expression],
      [$.primary_expression, $._property_name, $.defer_statement],
      [$.primary_expression, $._property_name, $.match_expression],
      [$.primary_expression, $.internal_module],
      [$.primary_expression, $.function_expression, $.generator_function],
      [$._property_name, $.effect_declaration],
      [$.method_definition, $._property_name],
      [$.method_definition, $._property_name, $.effect_method],
      [$.method_definition, $._property_name, $.schema_field],
      [$._property_name, $.effect_method],
      [$._property_name, $.accessibility_modifier],
      [$._property_name, $.override_modifier],
      [$.method_definition, $.service_body],
      [$._pipe_tail, $.pipeline_expression],
      [$.primary_expression, $._keyword_identifier],
      [$.primary_expression, $.generic_type, $.effect_arrow_function],
      [$.primary_expression, $.primary_type, $.impl_expression],
      [$.primary_expression, $.generic_type, $.impl_expression],
      [$.primary_type, $._keyword_identifier],
      [$.primary_expression, $._keyword_identifier, $.effect_arrow_function],
      [$.primary_expression, $._keyword_identifier, $.impl_expression],
      [$.primary_expression, $._keyword_identifier, $.match_expression]
      // keyword-or-identifier and construct overlaps, resolved by GLR
    ]),

  // `|>` binds looser than `??` and every operator above it, and tighter than the conditional, `,`
  // and `=>`, as in the compiler (Plan 19 review I6). JavaScript gives `??` the conditional's
  // precedence name; `??` gets its own, just above it, which leaves TypeScript's trees as they were.
  // (Named precedences only compare within one list.)
  precedences: ($, previous) =>
    previous.concat([
      [
        "member",
        "template_call",
        "call",
        $.update_expression,
        "unary_void",
        "binary_exp",
        "binary_times",
        "binary_plus",
        "binary_shift",
        "binary_compare",
        "binary_relation",
        "binary_equality",
        "bitwise_and",
        "bitwise_xor",
        "bitwise_or",
        "logical_and",
        "logical_or",
        "nullish",
        "pipeline",
        "ternary",
        $.sequence_expression,
        $.arrow_function
      ],
      ["binary", "pipeline"],
      ["unary", "pipeline"]
    ]),

  rules: {
    _reserved_identifier: ($, previous) => choice(...keywords, previous),

    // In type positions TypeScript reads names where its grammar has no `_reserved_identifier`:
    // there, EffectScript's keywords are names too (Plan 19 review C1)
    _keyword_identifier: ($) => alias(choice(...keywords), $.identifier),

    _type_identifier: ($) =>
      choice(alias($.identifier, $.type_identifier), alias(choice(...keywords), $.type_identifier)),

    asserts: ($) => seq("asserts", choice($.type_predicate, $.identifier, $._keyword_identifier, $.this)),

    tuple_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $._keyword_identifier, $.rest_pattern)),
        field("type", $.type_annotation)
      ),

    optional_tuple_parameter: ($) =>
      seq(field("name", choice($.identifier, $._keyword_identifier)), "?", field("type", $.type_annotation)),

    type_predicate: ($) =>
      seq(
        field("name", choice($.identifier, $._keyword_identifier, $.this, alias($.predefined_type, $.identifier))),
        "is",
        field("type", $.type)
      ),

    nested_type_identifier: ($) =>
      prec(
        "member",
        seq(
          field("module", choice($.identifier, $._keyword_identifier, $.nested_identifier)),
          ".",
          field("name", $._type_identifier)
        )
      ),

    nested_identifier: ($) =>
      prec(
        "member",
        seq(
          field("object", choice($.identifier, $._keyword_identifier, alias($.nested_identifier, $.member_expression))),
          ".",
          field("property", alias($.identifier, $.property_identifier))
        )
      ),

    type_query: ($) =>
      prec.right(
        seq(
          "typeof",
          choice(
            alias($._type_query_subscript_expression, $.subscript_expression),
            alias($._type_query_member_expression, $.member_expression),
            alias($._type_query_call_expression, $.call_expression),
            alias($._type_query_instantiation_expression, $.instantiation_expression),
            $.identifier,
            $._keyword_identifier,
            $.this
          )
        )
      ),

    _type_query_member_expression: ($) =>
      seq(
        field(
          "object",
          choice(
            $.identifier,
            $._keyword_identifier,
            $.this,
            alias($._type_query_subscript_expression, $.subscript_expression),
            alias($._type_query_member_expression, $.member_expression),
            alias($._type_query_call_expression, $.call_expression)
          )
        ),
        choice(".", "?."),
        field("property", choice($.private_property_identifier, alias($.identifier, $.property_identifier)))
      ),

    _type_query_subscript_expression: ($) =>
      seq(
        field(
          "object",
          choice(
            $.identifier,
            $._keyword_identifier,
            $.this,
            alias($._type_query_subscript_expression, $.subscript_expression),
            alias($._type_query_member_expression, $.member_expression),
            alias($._type_query_call_expression, $.call_expression)
          )
        ),
        optional("?."),
        "[",
        field("index", choice($.predefined_type, $.string, $.number)),
        "]"
      ),

    _type_query_call_expression: ($) =>
      seq(
        field(
          "function",
          choice(
            $.import,
            $.identifier,
            $._keyword_identifier,
            alias($._type_query_member_expression, $.member_expression),
            alias($._type_query_subscript_expression, $.subscript_expression)
          )
        ),
        field("arguments", $.arguments)
      ),

    _type_query_instantiation_expression: ($) =>
      seq(
        field(
          "function",
          choice(
            $.import,
            $.identifier,
            $._keyword_identifier,
            alias($._type_query_member_expression, $.member_expression),
            alias($._type_query_subscript_expression, $.subscript_expression)
          )
        ),
        field("type_arguments", $.type_arguments)
      ),

    declaration: ($, previous) =>
      choice(
        previous,
        $.effect_declaration,
        $.error_declaration,
        $.schema_declaration,
        $.service_declaration,
        $.layer_declaration,
        $.config_declaration,
        $.atom_declaration,
        $.group_declaration,
        $.api_declaration,
        $.command_declaration
      ),

    statement: ($, previous) =>
      choice(
        previous,
        $.main_statement,
        $.test_statement,
        $.describe_statement,
        $.doctest_statement,
        $.defer_statement
      ),

    expression: ($, previous) => choice(previous, $.pipeline_expression, $.throw_expression),

    binary_expression: ($) =>
      choice(
        ...[
          ["&&", "logical_and"],
          ["||", "logical_or"],
          [">>", "binary_shift"],
          [">>>", "binary_shift"],
          ["<<", "binary_shift"],
          ["&", "bitwise_and"],
          ["^", "bitwise_xor"],
          ["|", "bitwise_or"],
          ["+", "binary_plus"],
          ["-", "binary_plus"],
          ["*", "binary_times"],
          ["/", "binary_times"],
          ["%", "binary_times"],
          ["**", "binary_exp", "right"],
          ["<", "binary_relation"],
          ["<=", "binary_relation"],
          ["==", "binary_equality"],
          ["===", "binary_equality"],
          ["!=", "binary_equality"],
          ["!==", "binary_equality"],
          [">=", "binary_relation"],
          [">", "binary_relation"],
          ["??", "nullish"],
          ["instanceof", "binary_relation"],
          ["in", "binary_relation"]
        ].map(([operator, precedence, associativity]) =>
          (associativity === "right" ? prec.right : prec.left)(
            precedence,
            seq(
              field("left", operator === "in" ? choice($.expression, $.private_property_identifier) : $.expression),
              field("operator", operator),
              field("right", $.expression)
            )
          )
        )
      ),

    // `(id: string) => User throws NotFound`: a function type's contract
    function_type: ($) =>
      prec.left(
        seq(
          field("type_parameters", optional($.type_parameters)),
          field("parameters", $.formal_parameters),
          "=>",
          field("return_type", choice($.type, $.asserts, $.type_predicate)),
          optional($.effect_clauses)
        )
      ),

    // a class's `effect find(): T throws E` declares an effect method without a body
    method_signature: ($, previous) => choice(previous, $.effect_method_signature),

    // `const x = do { … }`: in statement position `do` is always the loop (review I5)
    _initializer: ($) => seq("=", field("value", choice($.expression, $.do_expression))),

    primary_expression: ($, previous) =>
      choice(
        previous,
        $.effect_block,
        $.effect_arrow_function,
        $.match_expression,
        $.impl_expression,
        $.topic_reference
      ),

    method_definition: ($, previous) => choice(previous, $.effect_method),

    // inside `effect`, one `try` takes a `catch (e: T)` per error type (ADR-0010)
    try_statement: ($) =>
      seq(
        "try",
        field("body", $.statement_block),
        repeat(field("handler", $.catch_clause)),
        optional(field("finalizer", $.finally_clause))
      ),

    // `: A throws E needs R`, after a return type
    effect_clauses: ($) =>
      prec.right(
        choice(
          seq("throws", field("throws", $.type), optional(seq("needs", field("needs", $.type)))),
          seq("needs", field("needs", $.type))
        )
      ),

    /** `|> f(%)` after a declaration's body: the whole declaration goes through the pipeline. */
    _pipe_tail: ($) => seq(repeat1(seq("|>", field("pipe", $.expression))), $._semicolon),

    // effect functions

    effect_declaration: ($) =>
      prec.right(
        "declaration",
        seq(
          "effect",
          field("name", $.identifier),
          $._call_signature,
          optional($.effect_clauses),
          field("body", $.statement_block),
          optional($._pipe_tail)
        )
      ),

    effect_block: ($) => prec.right(seq("effect", field("body", $.statement_block))),

    effect_arrow_function: ($) =>
      prec.right(
        seq(
          "effect",
          choice(field("parameter", $.identifier), $._call_signature),
          optional($.effect_clauses),
          "=>",
          field("body", choice($.expression, $.statement_block))
        )
      ),

    effect_method: ($) =>
      prec.left(
        seq(
          optional($.accessibility_modifier),
          optional("static"),
          optional($.override_modifier),
          "effect",
          field("name", $._property_name),
          $._call_signature,
          optional($.effect_clauses),
          field("body", $.statement_block)
        )
      ),

    // data: schema, error, config

    schema_declaration: ($) =>
      prec.right(
        seq(
          "schema",
          field("name", $.identifier),
          optional(field("type_parameters", $.type_parameters)),
          choice(
            field("body", $.schema_body),
            seq("=", field("value", choice($.schema_variants, $.type)))
          ),
          optional($._semicolon)
        )
      ),

    schema_variants: ($) => prec.right(seq(optional("|"), sep1($.schema_variant, "|"))),

    schema_variant: ($) => seq(field("name", $.identifier), field("body", $.schema_body)),

    schema_body: ($) =>
      seq(
        "{",
        repeat(choice(seq($.schema_field, optional(choice(";", ","))), $.method_definition, ";")),
        "}"
      ),

    schema_field: ($) =>
      prec.right(
        seq(
          optional("readonly"),
          field("name", $._property_name),
          optional("?"),
          optional(field("type", $.type_annotation)),
          optional(seq("=", field("value", $.expression)))
        )
      ),

    error_declaration: ($) =>
      prec.right(
        seq("error", field("name", $.identifier), optional(field("body", $.schema_body)), optional($._semicolon))
      ),

    config_declaration: ($) => seq("config", field("name", $.identifier), field("body", $.schema_body)),

    // services and layers

    // `as "key"` names the service's key (ADR-0014)
    service_declaration: ($) =>
      seq(
        "service",
        field("name", $.identifier),
        optional(seq("as", field("key", $.string))),
        field("body", $.service_body)
      ),

    service_body: ($) =>
      seq(
        "{",
        repeat(
          choice(
            seq($.effect_method_signature, optional(choice(";", ","))),
            $.effect_method,
            seq($.layer_member, optional(choice(";", ","))),
            seq($.service_property, optional(choice(";", ","))),
            $.method_definition,
            ";"
          )
        ),
        "}"
      ),

    effect_method_signature: ($) =>
      prec.right(
        seq(
          "effect",
          field("name", $._property_name),
          $._call_signature,
          optional($.effect_clauses)
        )
      ),

    service_property: ($) =>
      prec.right(
        seq(
          optional("readonly"),
          field("name", $._property_name),
          optional("?"),
          field("type", $.type_annotation)
        )
      ),

    layer_member: ($) =>
      prec.right(seq("layer", optional(field("name", $.identifier)), "=", field("value", $.expression))),

    layer_declaration: ($) =>
      prec.right(
        seq(
          "layer",
          field("name", $.identifier),
          optional(field("type", $.type_annotation)),
          "=",
          field("value", $.expression),
          optional($._semicolon)
        )
      ),

    atom_declaration: ($) =>
      prec.right(
        seq(
          "atom",
          field("name", $.identifier),
          optional(field("type", $.type_annotation)),
          "=",
          field("value", $.expression),
          optional($._semicolon)
        )
      ),

    // programs, tests, docs

    main_statement: ($) => prec.right(seq("main", field("body", $.statement_block), optional($._pipe_tail))),

    // `defer(x)` is a call, as in the compiler (review I4): where both readings fit, the call wins
    defer_statement: ($) =>
      prec.dynamic(
        -1,
        prec.right(
          seq(
            "defer",
            choice(field("body", $.statement_block), seq(field("value", $.expression), optional($._semicolon)))
          )
        )
      ),

    test_statement: ($) =>
      prec.right(
        seq(
          "test",
          optional(seq(".", field("modifier", $.identifier))),
          field("name", $.string),
          optional(seq("with", field("layer", $.expression))),
          field("body", $.statement_block),
          optional($._pipe_tail)
        )
      ),

    describe_statement: ($) =>
      prec.right(
        seq(
          "describe",
          optional(seq(".", field("modifier", $.identifier))),
          field("name", $.string),
          optional(seq("with", field("layer", $.expression))),
          field("body", $.statement_block),
          optional($._pipe_tail)
        )
      ),

    doctest_statement: ($) =>
      prec.right(
        seq(
          "doctest",
          field("module", $.string),
          optional(seq("with", field("layer", $.expression))),
          optional($._semicolon)
        )
      ),

    // CLIs and HTTP APIs

    command_declaration: ($) =>
      seq(
        "command",
        field("name", $.identifier),
        field("parameters", $.command_parameters),
        field("body", $.statement_block)
      ),

    command_parameters: ($) =>
      seq("(", optional(seq(sep1(choice($.flag_parameter, $._formal_parameter), ","), optional(","))), ")"),

    flag_parameter: ($) =>
      seq(
        "--",
        field("name", $.identifier),
        optional("?"),
        optional(field("type", $.type_annotation)),
        optional(seq("=", field("value", $.expression)))
      ),

    group_declaration: ($) =>
      seq(
        "group",
        field("name", $.identifier),
        optional(field("prefix", $.string)),
        "{",
        repeat(choice($.route, $.middleware_clause, ";")),
        "}"
      ),

    route: ($) =>
      prec.right(
        seq(
          field("method", $.identifier),
          field("name", $.identifier),
          field("path", $.string),
          optional(field("parameters", $.formal_parameters)),
          optional(field("type", $.type_annotation)),
          optional($.effect_clauses)
        )
      ),

    middleware_clause: ($) => prec.right(seq("middleware", field("value", $.expression))),

    api_declaration: ($) =>
      seq(
        "api",
        field("name", $.identifier),
        optional(field("id", $.string)),
        "{",
        optional(seq(sep1($.expression, ","), optional(","))),
        "}"
      ),

    impl_expression: ($) =>
      prec.right(seq("impl", field("group", $.member_expression), field("body", $.statement_block))),

    // expressions

    match_expression: ($) => seq("match", field("value", $.parenthesized_expression), "{", repeat($.match_arm), "}"),

    match_arm: ($) =>
      prec.right(
        seq(
          // a guard after the pattern (ADR-0063)
          choice(
            seq("when", field("pattern", $.expression), optional(seq("if", field("guard", $.expression)))),
            "default"
          ),
          ":",
          field("value", $.expression),
          optional(choice(";", ","))
        )
      ),

    pipeline_expression: ($) =>
      prec.left("pipeline", seq(field("left", $.expression), "|>", field("right", $.expression))),

    topic_reference: (_) => "%",

    throw_expression: ($) => prec.right(-1, seq("throw", field("value", $.expression))),

    do_expression: ($) => seq("do", field("body", $.statement_block))
  }
})
