// Runs the compiled `test`/`describe` fixture under vitest (§4.14): the golden registers its
// describe blocks when imported. (A computed import keeps the excluded fixture out of the TS project.)
const fixture = new URL("./fixtures/test/users.ts", import.meta.url).href
await import(/* @vite-ignore */ fixture)
