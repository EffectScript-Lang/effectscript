import { Schema } from "effect"
export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", { id: Schema.String }, { httpApiStatus: 404 }) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}
class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  retryAfter: Schema.Number
}, { httpApiStatus: 429 }) {
  get message() { return `retry after ${this.retryAfter}s` }
}

// `status` is still a name everywhere else
const status = 200
export class Reply extends Schema.Class<Reply>("Reply")({ status: Schema.Number }) {}
