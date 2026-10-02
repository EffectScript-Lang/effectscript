# effect/String

The examples in the JSDoc of `packages/effect/src/String.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## isString

**Checking for strings**

```efx
import { String } from "effect"

String.isString("a") // => true
String.isString(1) // => false
```

## Order

**Comparing strings lexicographically**

```efx
import { String } from "effect"

String.Order("apple", "banana") // => -1
String.Order("banana", "apple") // => 1
String.Order("apple", "apple") // => 0
```

## Equivalence

**Comparing strings for equality**

```efx
import { String } from "effect"

String.Equivalence("hello", "hello") // => true
String.Equivalence("hello", "world") // => false
```

## empty

**Referencing the empty string**

```efx
import { String } from "effect"

String.empty // => ""
String.isEmpty(String.empty) // => true
```

## Concat

**Concatenating string literal types**

```efx
import type { String } from "effect"

// Type-level concatenation
type Result = String.Concat<"hello", "world"> // "helloworld"

const witness: Result = "helloworld"
```

## concat

**Concatenating strings**

```efx
import { pipe, String } from "effect"

String.concat("hello", "world") // => "helloworld"
"hello" |> String.concat("world") // => "helloworld"
```

## toUpperCase

**Converting strings to uppercase**

```efx
import { pipe, String } from "effect"

"a" |> String.toUpperCase // => "A"
String.toUpperCase("hello") // => "HELLO"
```

## toLowerCase

**Converting strings to lowercase**

```efx
import { pipe, String } from "effect"

"A" |> String.toLowerCase // => "a"
String.toLowerCase("HELLO") // => "hello"
```

## capitalize

**Capitalizing a string**

```efx
import { pipe, String } from "effect"

"abc" |> String.capitalize // => "Abc"
String.capitalize("hello") // => "Hello"
```

## uncapitalize

**Uncapitalizing a string**

```efx
import { pipe, String } from "effect"

"ABC" |> String.uncapitalize // => "aBC"
String.uncapitalize("Hello") // => "hello"
```

## replace

**Replacing a substring**

```efx
import { pipe, String } from "effect"

"abc" |> String.replace("b", "d") // => "adc"
"hello world" |> String.replace("world", "Effect") // => "hello Effect"
```

## Trim

**Trimming whitespace at the type level**

```efx
import type { String } from "effect"

type Result = String.Trim<"  hello  "> // "hello"

const witness: Result = "hello"
```

## trim

**Trimming whitespace**

```efx
import { String } from "effect"

String.trim(" a ") // => "a"
String.trim("  hello world  ") // => "hello world"
```

## TrimStart

**Trimming leading whitespace at the type level**

```efx
import type { String } from "effect"

type Result = String.TrimStart<"  hello"> // "hello"

const witness: Result = "hello"
```

## trimStart

**Trimming leading whitespace**

```efx
import { String } from "effect"

String.trimStart(" a ") // => "a "
String.trimStart("  hello world") // => "hello world"
```

## TrimEnd

**Trimming trailing whitespace at the type level**

```efx
import type { String } from "effect"

type Result = String.TrimEnd<"hello  "> // "hello"

const witness: Result = "hello"
```

## trimEnd

**Trimming trailing whitespace**

```efx
import { String } from "effect"

String.trimEnd(" a ") // => " a"
String.trimEnd("hello world  ") // => "hello world"
```

## slice

**Slicing strings**

```efx
import { pipe, String } from "effect"

"abcd" |> String.slice(1, 3) // => "bc"
"hello world" |> String.slice(0, 5) // => "hello"
```

## isEmpty

**Checking for empty strings**

```efx
import { String } from "effect"

String.isEmpty("") // => true
String.isEmpty("a") // => false
```

## isNonEmpty

**Checking for non-empty strings**

```efx
import { String } from "effect"

String.isNonEmpty("") // => false
String.isNonEmpty("a") // => true
```

## length

**Getting string length**

```efx
import { String } from "effect"

String.length("abc") // => 3
```

## split

**Splitting strings**

```efx
import { pipe, String } from "effect"

"abc" |> String.split("") // => ["a", "b", "c"]
"" |> String.split("") // => [""]
String.split("hello,world", ",") // => ["hello", "world"]
```

## includes

**Checking for substrings**

```efx
import { pipe, String } from "effect"

"hello world" |> String.includes("world") // => true
"hello world" |> String.includes("foo") // => false
```

## startsWith

**Checking string prefixes**

```efx
import { pipe, String } from "effect"

"hello world" |> String.startsWith("hello") // => true
"hello world" |> String.startsWith("world") // => false
```

## endsWith

**Checking string suffixes**

```efx
import { pipe, String } from "effect"

"hello world" |> String.endsWith("world") // => true
"hello world" |> String.endsWith("hello") // => false
```

## charCodeAt

**Reading character codes**

```efx
import { Option, String } from "effect"

String.charCodeAt("abc", 1) // => Option.some(98)
String.charCodeAt("abc", 4) // => Option.none()
```

## substring

**Extracting substrings**

```efx
import { pipe, String } from "effect"

"abcd" |> String.substring(1) // => "bcd"
"abcd" |> String.substring(1, 3) // => "bc"
```

## at

**Accessing characters safely**

```efx
import { Option, pipe, String } from "effect"

"abc" |> String.at(1) // => Option.some("b")
"abc" |> String.at(4) // => Option.none()
```

## charAt

**Reading characters safely**

```efx
import { Option, pipe, String } from "effect"

"abc" |> String.charAt(1) // => Option.some("b")
"abc" |> String.charAt(4) // => Option.none()
```

## codePointAt

**Reading code points**

```efx
import { Option, pipe, String } from "effect"

"abc" |> String.codePointAt(1) // => Option.some(98)
"abc" |> String.codePointAt(10) // => Option.none()
```

## indexOf

**Finding the first substring index**

```efx
import { Option, pipe, String } from "effect"

"abbbc" |> String.indexOf("b") // => Option.some(1)
"abbbc" |> String.indexOf("z") // => Option.none()
```

## lastIndexOf

**Finding the last substring index**

```efx
import { Option, pipe, String } from "effect"

"abbbc" |> String.lastIndexOf("b") // => Option.some(3)
"abbbc" |> String.lastIndexOf("d") // => Option.none()
```

## localeCompare

**Comparing strings by locale**

```efx
import { pipe, String } from "effect"

"a" |> String.localeCompare("b") // => -1
"b" |> String.localeCompare("a") // => 1
"a" |> String.localeCompare("a") // => 0
```

## match

**Matching regular expressions**

```efx
import { Option, pipe, String } from "effect"

"hello"
  |> String.match(/l+/)
  |> Option.map((match) => [match[0], match.index]) // => Option.some(["ll", 2])
"hello" |> String.match(/x/) // => Option.none()
```

## matchAll

**Iterating regular expression matches**

```efx
import { pipe, String } from "effect"

const matches = "hello world" |> String.matchAll(/l/g)

Array.from(matches, (match) => [match[0], match.index]) // => [["l", 2], ["l", 3], ["l", 9]]
```

## normalize

**Normalizing Unicode strings**

```efx
import { pipe, String } from "effect"

const str = "\u1E9B\u0323"
Array.from(pipe(str, String.normalize()), (character) => character.codePointAt(0)) // => [0x1e9b, 0x323]
Array.from(pipe(str, String.normalize("NFC")), (character) => character.codePointAt(0)) // => [0x1e9b, 0x323]
Array.from(
  pipe(str, String.normalize("NFD")),
  (character) => character.codePointAt(0)
) // => [0x17f, 0x323, 0x307]
Array.from(pipe(str, String.normalize("NFKC")), (character) => character.codePointAt(0)) // => [0x1e69]
Array.from(
  pipe(str, String.normalize("NFKD")),
  (character) => character.codePointAt(0)
) // => [0x73, 0x323, 0x307]
```

## padEnd

**Padding strings at the end**

```efx
import { pipe, String } from "effect"

"a" |> String.padEnd(5) // => "a    "
"a" |> String.padEnd(5, "_") // => "a____"
```

## padStart

**Padding strings at the start**

```efx
import { pipe, String } from "effect"

"a" |> String.padStart(5) // => "    a"
"a" |> String.padStart(5, "_") // => "____a"
```

## repeat

**Repeating strings**

```efx
import { pipe, String } from "effect"

"a" |> String.repeat(5) // => "aaaaa"
"hello" |> String.repeat(3) // => "hellohellohello"
```

## replaceAll

**Replacing all matches**

```efx
import { pipe, String } from "effect"

"ababb" |> String.replaceAll("b", "c") // => "acacc"
"ababb" |> String.replaceAll(/ba/g, "cc") // => "accbb"
```

## search

**Searching strings**

```efx
import { Option, String } from "effect"

String.search("ababb", "b") // => Option.some(1)
String.search("ababb", /abb/) // => Option.some(2)
String.search("ababb", "d") // => Option.none()
```

## toLocaleLowerCase

**Lowercasing strings by locale**

```efx
import { pipe, String } from "effect"

const str = "\u0130"
str |> String.toLocaleLowerCase("tr") // => "i"
```

## toLocaleUpperCase

**Uppercasing strings by locale**

```efx
import { pipe, String } from "effect"

const str = "i\u0307"
str |> String.toLocaleUpperCase("lt-LT") // => "I"
```

## takeLeft

**Taking characters from the start**

```efx
import { String } from "effect"

String.takeLeft("Hello World", 5) // => "Hello"
```

## takeRight

**Taking characters from the end**

```efx
import { String } from "effect"

String.takeRight("Hello World", 5) // => "World"
```

## linesIterator

**Iterating lines without separators**

```efx
import { String } from "effect"

Array.from(String.linesIterator("hello\nworld\n")) // => ["hello", "world"]
```

## linesWithSeparators

**Iterating lines with separators**

```efx
import { String } from "effect"

Array.from(String.linesWithSeparators("hello\nworld\n")) // => ["hello\n", "world\n"]
```

## stripMarginWith

**Stripping custom margins**

```efx
import { String } from "effect"

String.stripMarginWith("  |hello\n  |world", "|") // => "hello\nworld"
```

## stripMargin

**Stripping pipe margins**

```efx
import { String } from "effect"

String.stripMargin("  |hello\n  |world") // => "hello\nworld"
```

## snakeToCamel

**Converting snake_case to camelCase**

```efx
import { String } from "effect"

String.snakeToCamel("hello_world") // => "helloWorld"
String.snakeToCamel("foo_bar_baz") // => "fooBarBaz"
```

## snakeToPascal

**Converting snake_case to PascalCase**

```efx
import { String } from "effect"

String.snakeToPascal("hello_world") // => "HelloWorld"
String.snakeToPascal("foo_bar_baz") // => "FooBarBaz"
```

## snakeToKebab

**Converting snake_case to kebab-case**

```efx
import { String } from "effect"

String.snakeToKebab("hello_world") // => "hello-world"
String.snakeToKebab("foo_bar_baz") // => "foo-bar-baz"
```

## camelToSnake

**Converting camelCase to snake_case**

```efx
import { String } from "effect"

String.camelToSnake("helloWorld") // => "hello_world"
String.camelToSnake("fooBarBaz") // => "foo_bar_baz"
```

## pascalToSnake

**Converting PascalCase to snake_case**

```efx
import { String } from "effect"

String.pascalToSnake("HelloWorld") // => "hello_world"
String.pascalToSnake("FooBarBaz") // => "foo_bar_baz"
```

## kebabToSnake

**Converting kebab-case to snake_case**

```efx
import { String } from "effect"

String.kebabToSnake("hello-world") // => "hello_world"
String.kebabToSnake("foo-bar-baz") // => "foo_bar_baz"
```
