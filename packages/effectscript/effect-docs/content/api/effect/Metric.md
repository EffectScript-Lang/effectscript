# effect/Metric

The examples in the JSDoc of `packages/effect/src/Metric.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Metric

**Using multiple metric types**

```efx
const program = effect {
  // Create different types of metrics
  const requestCounter: Metric.Counter<number> = Metric.counter("requests", {
    description: "Total requests processed"
  })

  const memoryGauge: Metric.Gauge<number> = Metric.gauge("memory_usage", {
    description: "Current memory usage in MB"
  })

  const statusFrequency: Metric.Frequency = Metric.frequency("status_codes", {
    description: "HTTP status code frequency"
  })

  // All metrics share the same interface for updates and reads
  await Metric.update(requestCounter, 1)
  await Metric.update(memoryGauge, 128)
  await Metric.update(statusFrequency, "200")

  // All metrics can be read with Metric.value
  const counterState = await Metric.value(requestCounter)
  const gaugeState = await Metric.value(memoryGauge)
  const frequencyState = await Metric.value(statusFrequency)

  // Metrics have common properties accessible through the interface:
  // - id: unique identifier
  // - type: metric type ("Counter", "Gauge", "Frequency", etc.)
  // - description: optional human-readable description
  // - attributes: optional key-value attributes for tagging

  return {
    counter: {
      id: requestCounter.id,
      type: requestCounter.type,
      state: counterState
    },
    gauge: { id: memoryGauge.id, type: memoryGauge.type, state: gaugeState },
    frequency: {
      id: statusFrequency.id,
      type: statusFrequency.type,
      state: frequencyState
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [
  result.counter.state.count,
  result.gauge.state.value,
  result.frequency.state.occurrences.get("200")
] // => [1, 128, 1]
```

**Collecting application metrics**

```efx
const program = effect {
  // Create different types of metrics
  const requestCounter = Metric.counter("http_requests_total")
  const responseTimeHistogram = Metric.histogram("http_response_time", {
    boundaries: Metric.linearBoundaries({ start: 0, width: 10, count: 10 })
  })
  const activeConnectionsGauge = Metric.gauge("active_connections")
  const statusFrequency = Metric.frequency("http_status_codes")

  // Update metrics
  await Metric.update(requestCounter, 1)
  await Metric.update(responseTimeHistogram, 45.2)
  await Metric.update(activeConnectionsGauge, 12)
  await Metric.update(statusFrequency, "200")

  // Get metric values
  const counterValue = await Metric.value(requestCounter)
  const histogramValue = await Metric.value(responseTimeHistogram)
  const gaugeValue = await Metric.value(activeConnectionsGauge)
  const frequencyValue = await Metric.value(statusFrequency)

  return {
    counter: counterValue,
    histogram: histogramValue,
    gauge: gaugeValue,
    frequency: frequencyValue
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.counter.count, result.gauge.value] // => [1, 12]
```

## Counter

**Using counter metrics**

```efx
const program = effect {
  // Create different types of counters
  const requestCounter: Metric.Counter<number> = Metric.counter(
    "http_requests",
    {
      description: "Total HTTP requests processed",
      incremental: true // Only allows increments
    }
  )

  const bytesCounter: Metric.Counter<bigint> = Metric.counter(
    "bytes_processed",
    {
      description: "Total bytes processed",
      bigint: true,
      attributes: { service: "data-processor" }
    }
  )

  // Update counters
  await Metric.update(requestCounter, 1) // Increment by 1
  await Metric.update(requestCounter, 5) // Increment by 5 (total: 6)
  await Metric.update(bytesCounter, 1024n) // Add 1024 bytes

  // Read counter state
  const requestState: Metric.CounterState<number> = await Metric.value(
    requestCounter
  )
  const bytesState: Metric.CounterState<bigint> = await Metric.value(
    bytesCounter
  )

  // Counter state contains:
  // - count: current accumulated value
  // - incremental: whether only increments are allowed

  return {
    requests: {
      count: requestState.count,
      incremental: requestState.incremental
    },
    bytes: { count: bytesState.count, incremental: bytesState.incremental }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const counts = [result.requests.count, result.bytes.count] // => [6, 1024n]
```

## CounterState

**Reading counter state**

```efx
const program = effect {
  // Create different types of counters
  const requestCounter = Metric.counter("http_requests_total")
  const errorCounter = Metric.counter("errors_total", { incremental: true })
  const byteCounter = Metric.counter("bytes_processed", { bigint: true })

  // Update counters
  await Metric.update(requestCounter, 5) // Add 5 requests
  await Metric.update(requestCounter, -2) // Subtract 2 (allowed for non-incremental)
  await Metric.update(errorCounter, 3) // Add 3 errors
  await Metric.update(errorCounter, -1) // Attempt to subtract (ignored for incremental)
  await Metric.update(byteCounter, 1024000n) // Add bytes as bigint

  // Read counter states
  const requestState: Metric.CounterState<number> = await Metric.value(
    requestCounter
  )
  const errorState: Metric.CounterState<number> = await Metric.value(
    errorCounter
  )
  const byteState: Metric.CounterState<bigint> = await Metric.value(
    byteCounter
  )
  // CounterState contains:
  // - count: current count value (number or bigint based on counter type)
  // - incremental: whether counter only allows increases

  return {
    requests: {
      total: requestState.count, // 3 (5 - 2, decrements allowed)
      canDecrease: !requestState.incremental // true
    },
    errors: {
      total: errorState.count, // 3 (subtract ignored)
      canDecrease: !errorState.incremental // false
    },
    bytes: {
      total: byteState.count, // 1024000n
      canDecrease: !byteState.incremental // true
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const counts = [result.requests.total, result.errors.total, result.bytes.total] // => [3, 3, 1024000n]
```

## Frequency

**Using frequency metrics**

```efx
// Function that accepts any Frequency metric
const analyzeFrequencyMetric = (freq: Metric.Frequency) =>
  effect {
    const state = await Metric.value(freq)

    // Access the frequency state
    const occurrences: ReadonlyMap<string, number> = state.occurrences

    // Find most frequent value
    let maxCount = 0
    let mostFrequent = ""
    for (const [value, count] of occurrences) {
      if (count > maxCount) {
        maxCount = count
        mostFrequent = value
      }
    }

    return { mostFrequent, maxCount, totalUniqueValues: occurrences.size }
  }

const program = effect {
  // Create frequency metrics
  const statusCodes: Metric.Frequency = Metric.frequency("http_status", {
    description: "HTTP status code frequency"
  })

  const userActions: Metric.Frequency = Metric.frequency("user_actions", {
    description: "User action frequency"
  })

  // Record some occurrences
  await Metric.update(statusCodes, "200")
  await Metric.update(statusCodes, "200")
  await Metric.update(statusCodes, "404")
  await Metric.update(statusCodes, "500")
  await Metric.update(statusCodes, "200")

  await Metric.update(userActions, "login")
  await Metric.update(userActions, "view_dashboard")
  await Metric.update(userActions, "login")

  // Use the function with different frequency metrics
  const statusAnalysis = await analyzeFrequencyMetric(statusCodes)
  const actionAnalysis = await analyzeFrequencyMetric(userActions)
  return { statusAnalysis, actionAnalysis }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.statusAnalysis.mostFrequent, result.actionAnalysis.mostFrequent] // => ["200", "login"]
```

## FrequencyState

**Reading frequency state**

```efx
const program = effect {
  // Create frequency metrics for different categories
  const statusCodeFreq = Metric.frequency("http_status_codes", {
    description: "HTTP status code distribution"
  })

  const userActionFreq = Metric.frequency("user_actions", {
    description: "User action frequency"
  })

  // Record occurrences
  await Metric.update(statusCodeFreq, "200") // Success
  await Metric.update(statusCodeFreq, "200") // Another success
  await Metric.update(statusCodeFreq, "404") // Not found
  await Metric.update(statusCodeFreq, "500") // Server error
  await Metric.update(statusCodeFreq, "200") // Another success

  await Metric.update(userActionFreq, "login")
  await Metric.update(userActionFreq, "click")
  await Metric.update(userActionFreq, "login")
  await Metric.update(userActionFreq, "scroll")
  await Metric.update(userActionFreq, "click")
  await Metric.update(userActionFreq, "click")

  // Read frequency states
  const statusState: Metric.FrequencyState = await Metric.value(statusCodeFreq)
  const actionState: Metric.FrequencyState = await Metric.value(userActionFreq)

  // FrequencyState contains:
  // - occurrences: ReadonlyMap<string, number> with string values and their counts

  // Analyze frequency distributions
  const getMostFrequent = (occurrences: ReadonlyMap<string, number>) => {
    let maxKey = ""
    let maxCount = 0
    for (const [key, count] of occurrences) {
      if (count > maxCount) {
        maxKey = key
        maxCount = count
      }
    }
    return { key: maxKey, count: maxCount }
  }

  const topStatus = getMostFrequent(statusState.occurrences)
  const topAction = getMostFrequent(actionState.occurrences)
  return {
    statusCodes: {
      totalResponses: Array.from(statusState.occurrences.values()).reduce(
        (a, b) => a + b,
        0
      ), // 5
      mostCommon: topStatus, // { key: "200", count: 3 }
      uniqueCodes: statusState.occurrences.size // 3
    },
    userActions: {
      totalActions: Array.from(actionState.occurrences.values()).reduce(
        (a, b) => a + b,
        0
      ), // 6
      mostCommon: topAction, // { key: "click", count: 3 }
      uniqueActions: actionState.occurrences.size // 3
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const mostCommon = [result.statusCodes.mostCommon, result.userActions.mostCommon]
mostCommon.map(({ key, count }) => [key, count]) // => [["200", 3], ["click", 3]]
```

## Gauge

**Using gauge metrics**

```efx
const program = effect {
  // Create different types of gauges
  const memoryGauge: Metric.Gauge<number> = Metric.gauge("memory_usage_mb", {
    description: "Current memory usage in megabytes"
  })

  const diskSpaceGauge: Metric.Gauge<bigint> = Metric.gauge("disk_free_bytes", {
    description: "Available disk space in bytes",
    bigint: true,
    attributes: { mount: "/var" }
  })

  // Set gauge values (absolute values)
  await Metric.update(memoryGauge, 512) // Set to 512 MB
  await Metric.update(memoryGauge, 640) // Set to 640 MB (replaces 512)
  await Metric.update(diskSpaceGauge, 5000000000n) // Set to ~5GB free

  // Modify gauge values (relative changes)
  await Metric.modify(memoryGauge, 128) // Add 128 MB (total: 768)
  await Metric.modify(memoryGauge, -64) // Subtract 64 MB (total: 704)

  // Read gauge state
  const memoryState: Metric.GaugeState<number> = await Metric.value(
    memoryGauge
  )
  const diskState: Metric.GaugeState<bigint> = await Metric.value(
    diskSpaceGauge
  )
  // Gauge state contains:
  // - value: current instantaneous value

  return {
    memory: { currentValue: memoryState.value }, // 704
    disk: { currentValue: diskState.value } // 5000000000n
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.memory.currentValue, result.disk.currentValue] // => [704, 5000000000n]
```

## GaugeState

**Reading gauge state**

```efx
const program = effect {
  // Create different types of gauges
  const temperatureGauge = Metric.gauge("room_temperature_celsius", {
    description: "Current room temperature"
  })

  const diskSpaceGauge = Metric.gauge("disk_usage_bytes", {
    description: "Current disk usage",
    bigint: true
  })

  const queueSizeGauge = Metric.gauge("queue_size", {
    description: "Current queue size"
  })

  // Set gauge values (absolute values)
  await Metric.update(temperatureGauge, 22.5) // Set to 22.5°C
  await Metric.update(diskSpaceGauge, 5000000000n) // Set to 5GB usage
  await Metric.update(queueSizeGauge, 10) // Set to 10 items

  // Update gauge values (new absolute values)
  await Metric.update(temperatureGauge, 23.1) // Temperature changed
  await Metric.update(queueSizeGauge, 15) // Queue grew

  // Read gauge states
  const tempState: Metric.GaugeState<number> = await Metric.value(
    temperatureGauge
  )
  const diskState: Metric.GaugeState<bigint> = await Metric.value(
    diskSpaceGauge
  )
  const queueState: Metric.GaugeState<number> = await Metric.value(
    queueSizeGauge
  )
  // GaugeState contains:
  // - value: current instantaneous value (number or bigint based on gauge type)

  return {
    environment: {
      temperature: tempState.value, // 23.1
      temperatureUnit: "°C"
    },
    system: {
      diskUsage: diskState.value, // 5000000000n
      diskUsageGB: Number(diskState.value) / 1_000_000_000, // 5
      queueSize: queueState.value // 15
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.environment.temperature, result.system.diskUsage, result.system.queueSize]
values // => [23.1, 5000000000n, 15]
```

## Histogram

**Using histogram metrics**

```efx
const program = effect {
  // Create histograms with different boundary strategies
  const responseTimeHistogram: Metric.Histogram<number> = Metric.histogram(
    "http_response_time_ms",
    {
      description: "HTTP response time distribution in milliseconds",
      boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 20 }) // 50, 100, ..., 900, Infinity
    }
  )

  const fileSizeHistogram: Metric.Histogram<number> = Metric.histogram(
    "file_size_bytes",
    {
      description: "File size distribution in bytes",
      boundaries: Metric.exponentialBoundaries({
        start: 1,
        factor: 2,
        count: 10
      }) // 1, 2, 4, 8, ..., 512
    }
  )

  // Record observations (values get placed into appropriate buckets)
  await Metric.update(responseTimeHistogram, 125) // Goes into 100-150ms bucket
  await Metric.update(responseTimeHistogram, 75) // Goes into 50-100ms bucket
  await Metric.update(responseTimeHistogram, 200) // Goes into 150-200ms bucket
  await Metric.update(responseTimeHistogram, 45) // Goes into 0-50ms bucket

  await Metric.update(fileSizeHistogram, 3) // Goes into 2-4 bytes bucket
  await Metric.update(fileSizeHistogram, 15) // Goes into 8-16 bytes bucket
  await Metric.update(fileSizeHistogram, 100) // Goes into 64-128 bytes bucket

  // Read histogram state
  const responseTimeState: Metric.HistogramState = await Metric.value(
    responseTimeHistogram
  )
  const fileSizeState: Metric.HistogramState = await Metric.value(
    fileSizeHistogram
  )
  // Histogram state contains:
  // - buckets: Array of [boundary, cumulativeCount] pairs
  // - count: total number of observations
  // - min: smallest observed value
  // - max: largest observed value
  // - sum: sum of all observed values

  return {
    responseTime: {
      totalRequests: responseTimeState.count, // 4
      fastestRequest: responseTimeState.min, // 45
      slowestRequest: responseTimeState.max, // 200
      totalTime: responseTimeState.sum, // 445
      averageTime: responseTimeState.sum / responseTimeState.count // 111.25
    },
    fileSize: {
      totalFiles: fileSizeState.count, // 3
      smallestFile: fileSizeState.min, // 3
      largestFile: fileSizeState.max, // 100
      totalBytes: fileSizeState.sum // 118
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.responseTime.totalRequests, result.responseTime.totalTime, result.fileSize.totalBytes]
values // => [4, 445, 118]
```

## HistogramState

**Reading histogram state**

```efx
const program = effect {
  // Create histogram with linear boundaries
  const responseTimeHistogram = Metric.histogram("api_response_time_ms", {
    description: "API response time distribution",
    boundaries: Metric.linearBoundaries({ start: 0, width: 100, count: 10 }) // 100, 200, ..., 800, Infinity
  })

  // Record observations
  await Metric.update(responseTimeHistogram, 50) // Fast response
  await Metric.update(responseTimeHistogram, 150) // Average response
  await Metric.update(responseTimeHistogram, 750) // Slow response
  await Metric.update(responseTimeHistogram, 250) // Average response
  await Metric.update(responseTimeHistogram, 95) // Fast response

  // Read histogram state
  const state: Metric.HistogramState = await Metric.value(
    responseTimeHistogram
  )

  // HistogramState contains:
  // - buckets: Array of [boundary, cumulativeCount] pairs showing distribution
  // - count: total number of observations
  // - min: smallest observed value
  // - max: largest observed value
  // - sum: sum of all observed values

  // Analyze bucket distribution
  const analyzeBuckets = (buckets: ReadonlyArray<[number, number]>) => {
    const analysis: Array<
      { range: string; count: number; percentage: number }
    > = []
    let previousCount = 0
    const totalCount = buckets[buckets.length - 1]?.[1] ?? 0

    for (let i = 0; i < buckets.length; i++) {
      const [boundary, cumulativeCount] = buckets[i]
      const bucketCount = cumulativeCount - previousCount
      const percentage = totalCount > 0 ? (bucketCount / totalCount) * 100 : 0
      const prevBoundary = i === 0 ? 0 : buckets[i - 1][0]

      analysis.push({
        range: `${prevBoundary}-${boundary}ms`,
        count: bucketCount,
        percentage: Math.round(percentage * 10) / 10
      })
      previousCount = cumulativeCount
    }
    return analysis
  }

  const bucketAnalysis = analyzeBuckets(state.buckets)
  return {
    responseTime: {
      totalRequests: state.count, // 5
      fastestResponse: state.min, // 50
      slowestResponse: state.max, // 750
      averageResponse: state.sum / state.count, // 268
      totalTime: state.sum, // 1340
      distribution: bucketAnalysis
      // Example distribution:
      // [{ range: "0-100ms", count: 2, percentage: 40.0 },
      //  { range: "100-200ms", count: 1, percentage: 20.0 },
      //  { range: "200-300ms", count: 1, percentage: 20.0 },
      //  { range: "700-800ms", count: 1, percentage: 20.0 }]
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const stats = result.responseTime
const values = [stats.totalRequests, stats.fastestResponse, stats.slowestResponse, stats.totalTime]
values // => [5, 50, 750, 1295]
```

## Summary

**Using summary metrics**

```efx
const program = effect {
  // Create summaries with different quantile configurations
  const responseTimeSummary: Metric.Summary<number> = Metric.summary(
    "api_response_time_ms",
    {
      description: "API response time distribution in milliseconds",
      maxAge: "5 minutes", // Keep observations for 5 minutes
      maxSize: 1000, // Keep up to 1000 observations
      quantiles: [0.5, 0.95, 0.99] // Track median, 95th, and 99th percentiles
    }
  )

  const requestSizeSummary: Metric.Summary<number> = Metric.summary(
    "request_size_bytes",
    {
      description: "Request payload size distribution",
      maxAge: "10 minutes",
      maxSize: 500,
      quantiles: [0.25, 0.5, 0.75, 0.9] // Track quartiles and 90th percentile
    }
  )

  // Record observations (values are stored in time-based sliding window)
  await Metric.update(responseTimeSummary, 120) // Fast response
  await Metric.update(responseTimeSummary, 250) // Average response
  await Metric.update(responseTimeSummary, 45) // Very fast response
  await Metric.update(responseTimeSummary, 890) // Slow response
  await Metric.update(responseTimeSummary, 156) // Average response

  await Metric.update(requestSizeSummary, 1024) // 1KB request
  await Metric.update(requestSizeSummary, 512) // 512B request
  await Metric.update(requestSizeSummary, 2048) // 2KB request

  // Read summary state
  const responseTimeState: Metric.SummaryState = await Metric.value(
    responseTimeSummary
  )
  const requestSizeState: Metric.SummaryState = await Metric.value(
    requestSizeSummary
  )

  // Summary state contains:
  // - quantiles: Array of [quantile, optionalValue] pairs
  // - count: total number of observations in window
  // - min: smallest observed value in window
  // - max: largest observed value in window
  // - sum: sum of all observed values in window

  // Extract quantile values safely
  const getQuantileValue = (
    quantiles: ReadonlyArray<readonly [number, number | undefined]>,
    q: number
  ) => quantiles.find(([quantile]) => quantile === q)?.[1]

  const median = getQuantileValue(responseTimeState.quantiles, 0.5)
  const p95 = getQuantileValue(responseTimeState.quantiles, 0.95)
  const p99 = getQuantileValue(responseTimeState.quantiles, 0.99)
  return {
    responseTime: {
      totalRequests: responseTimeState.count, // 5
      fastestResponse: responseTimeState.min, // 45
      slowestResponse: responseTimeState.max, // 890
      totalTime: responseTimeState.sum, // 1461
      averageTime: responseTimeState.sum / responseTimeState.count, // 292.2
      medianTime: median ?? null, // ~156
      p95Time: p95 ?? null, // ~890
      p99Time: p99 ?? null // ~890
    },
    requestSize: {
      totalRequests: requestSizeState.count, // 3
      averageSize: requestSizeState.sum / requestSizeState.count // ~1194.7
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const counts = [result.responseTime.totalRequests, result.responseTime.totalTime, result.requestSize.totalRequests]
counts // => [5, 1461, 3]
```

## SummaryState

**Reading summary state**

```efx
const program = effect {
  // Create summary with specific quantiles
  const responseTimeSummary = Metric.summary("api_response_latency", {
    description: "API response time distribution with quantiles",
    maxAge: "5 minutes",
    maxSize: 1000,
    quantiles: [0.5, 0.95, 0.99] // Track median, 95th, and 99th percentiles
  })

  // Record observations over time
  await Metric.update(responseTimeSummary, 120) // Fast response
  await Metric.update(responseTimeSummary, 250) // Average response
  await Metric.update(responseTimeSummary, 45) // Very fast response
  await Metric.update(responseTimeSummary, 890) // Slow response
  await Metric.update(responseTimeSummary, 156) // Average response
  await Metric.update(responseTimeSummary, 78) // Fast response
  await Metric.update(responseTimeSummary, 340) // Slower response

  // Read summary state
  const state: Metric.SummaryState = await Metric.value(responseTimeSummary)

  // SummaryState contains:
  // - quantiles: Array of [quantile, optionalValue] pairs showing percentile values
  // - count: total number of observations in current window
  // - min: smallest observed value in window
  // - max: largest observed value in window
  // - sum: sum of all observed values in window

  // Extract quantile information safely
  const extractQuantiles = (
    quantiles: ReadonlyArray<readonly [number, number | undefined]>
  ) => {
    const result: Record<string, number | null> = {}
    for (const [quantile, valueOption] of quantiles) {
      const percentile = Math.round(quantile * 100)
      result[`p${percentile}`] = valueOption ?? null
    }
    return result
  }

  const quantileValues = extractQuantiles(state.quantiles)
  return {
    latencyAnalysis: {
      totalRequests: state.count, // 7
      fastestResponse: state.min, // 45
      slowestResponse: state.max, // 890
      averageResponse: state.sum / state.count, // ~268.4
      totalLatency: state.sum, // 1879
      percentiles: quantileValues,
      // Example percentiles:
      // { p50: 156, p95: 890, p99: 890 }
      performance: {
        fast: quantileValues.p50 !== null && quantileValues.p50 < 200
          ? "Good"
          : "Needs improvement",
        reliability: quantileValues.p95 !== null && quantileValues.p95 < 500
          ? "Reliable"
          : "Concerning"
      }
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const analysis = result.latencyAnalysis
const values = [analysis.totalRequests, analysis.fastestResponse, analysis.slowestResponse, analysis.totalLatency]
values // => [7, 45, 890, 1879]
```

## Metric.Type

**Inspecting metric types**

```efx
import { Metric } from "effect"

const metrics: ReadonlyArray<Metric.Metric<any, any>> = [
  Metric.counter("requests_total"),
  Metric.gauge("cpu_usage"),
  Metric.frequency("status_codes"),
  Metric.histogram("response_time", {
    boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 10 })
  }),
  Metric.summary("latency", {
    maxAge: "5 minutes",
    maxSize: 1000,
    quantiles: [0.5, 0.95, 0.99]
  })
]

const types: ReadonlyArray<Metric.Metric.Type> = metrics.map((metric) => metric.type)
const actual = types // => ["Counter", "Gauge", "Frequency", "Histogram", "Summary"]
```

## Metric.Attributes

**Providing attributes in different formats**

```efx
const program = effect {
  // Different ways to specify attributes
  const attributesAsObject = {
    service: "api",
    environment: "production",
    version: "1.2.3"
  }

  const attributesAsArray: ReadonlyArray<[string, string]> = [
    ["service", "api"],
    ["environment", "production"],
    ["version", "1.2.3"]
  ]

  // Create metrics with different attribute formats
  const requestCounter1 = Metric.counter("requests", {
    description: "Total requests",
    attributes: attributesAsObject // Using object format
  })

  const requestCounter2 = Metric.counter("requests", {
    description: "Total requests",
    attributes: attributesAsArray // Using array format
  })

  // Function to normalize attributes to object format
  const normalizeAttributes = (
    attrs: typeof attributesAsObject | ReadonlyArray<[string, string]>
  ) => {
    if (Array.isArray(attrs)) {
      return Object.fromEntries(attrs)
    }
    return attrs
  }

  // Add runtime attributes using withAttributes
  const contextualCounter = Metric.withAttributes(requestCounter1, {
    method: "GET",
    endpoint: "/api/users"
  })

  // Update metrics with different attribute combinations
  await Metric.update(contextualCounter, 1)

  // Both formats result in the same internal representation
  const normalizedObject = normalizeAttributes(attributesAsObject)
  const normalizedArray = normalizeAttributes(attributesAsArray)
  return {
    attributeFormats: {
      object: normalizedObject, // { service: "api", environment: "production", version: "1.2.3" }
      array: normalizedArray // { service: "api", environment: "production", version: "1.2.3" }
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const objectAttributes = result.attributeFormats.object
const arrayAttributes = result.attributeFormats.array
const sameAttributes = [objectAttributes, arrayAttributes]
sameAttributes // => [{ service: "api", environment: "production", version: "1.2.3" }, { service: "api", environment: "production", version: "1.2.3" }]
```

## Metric.AttributeSet

**Combining metric attribute sets**

```efx
const program = effect {
  // Define attribute sets for different contexts
  const serviceAttributes = {
    service: "user-api",
    version: "2.1.0",
    environment: "production"
  }

  const operationAttributes = {
    operation: "create_user",
    method: "POST",
    endpoint: "/api/users"
  }

  const infrastructureAttributes = {
    region: "us-east-1",
    datacenter: "dc1",
    host: "api-server-01"
  }

  // Create metrics with predefined attribute sets
  const requestCounter = Metric.counter("http_requests_total", {
    description: "Total HTTP requests",
    attributes: serviceAttributes
  })

  // Combine attribute sets
  const combineAttributes = (...attributeSets: Array<Record<string, string>>) =>
    Object.assign({}, ...attributeSets)

  const fullAttributes = combineAttributes(
    serviceAttributes,
    operationAttributes,
    infrastructureAttributes
  )

  // Create metric with combined attributes
  const detailedCounter = Metric.withAttributes(requestCounter, fullAttributes)

  // Helper to validate attribute keys (all must be strings)
  const validateAttributeSet = (attrs: Record<string, string>): boolean => {
    return Object.entries(attrs).every(([key, value]) =>
      typeof key === "string" && typeof value === "string"
    )
  }

  await Metric.update(detailedCounter, 1)

  return {
    attributes: {
      service: serviceAttributes,
      operation: operationAttributes,
      infrastructure: infrastructureAttributes,
      combined: fullAttributes,
      isValid: validateAttributeSet(fullAttributes), // true
      totalKeys: Object.keys(fullAttributes).length // 9
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const validation = [result.attributes.isValid, result.attributes.totalKeys] // => [true, 9]
```

## Metric.Input

**Extracting metric input types**

```efx
import { Metric } from "effect"

// Create various metric types
const numberCounter = Metric.counter("requests")
const bigintCounter = Metric.counter("bytes", { bigint: true })
const stringFrequency = Metric.frequency("status_codes")
const numberGauge = Metric.gauge("cpu_usage")
const numberHistogram = Metric.histogram("response_time", {
  boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 10 })
})

// The Input utility type extracts the input type from metric types:
// - Counter<number>: number
// - Counter<bigint>: bigint
// - Frequency: string
// - Gauge<number>: number
// - Histogram<number>: number

// Helper function that works with any metric
const createMetricInfo = (metric: Metric.Metric<any, any>) => ({
  id: metric.id,
  type: metric.type
})

const metrics = [
  createMetricInfo(numberCounter), // { id: "requests", type: "Counter" }
  createMetricInfo(bigintCounter), // { id: "bytes", type: "Counter" }
  createMetricInfo(stringFrequency), // { id: "status_codes", type: "Frequency" }
  createMetricInfo(numberGauge), // { id: "cpu_usage", type: "Gauge" }
  createMetricInfo(numberHistogram) // { id: "response_time", type: "Histogram" }
]

// Type safety is enforced at compile time:
// Metric.update(numberCounter, 123)     // ✓ Valid (number)
// Metric.update(numberCounter, "abc")   // ✗ Type error
// Metric.update(stringFrequency, "ok")  // ✓ Valid (string)
// Metric.update(stringFrequency, 404)   // ✗ Type error
const metricIds = metrics.map(({ id, type }) => `${id}:${type}`)
metricIds // => ["requests:Counter", "bytes:Counter", "status_codes:Frequency", "cpu_usage:Gauge", "response_time:Histogram"]
```

## Metric.State

**Extracting metric state types**

```efx
// Create various metric types
const requestCounter = Metric.counter("requests")
const cpuGauge = Metric.gauge("cpu_usage")
const statusFrequency = Metric.frequency("status_codes")
const responseHistogram = Metric.histogram("response_time", {
  boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 10 })
})
const latencySummary = Metric.summary("latency", {
  maxAge: "5 minutes",
  maxSize: 1000,
  quantiles: [0.5, 0.95, 0.99]
})

// The State utility type extracts the state type from metric types:
// - Counter<number>: CounterState<number>
// - Gauge<number>: GaugeState<number>
// - Frequency: FrequencyState
// - Histogram<number>: HistogramState
// - Summary<number>: SummaryState

// Type-safe state analysis functions
const program = effect {
  // Update metrics first
  await Metric.update(requestCounter, 10)
  await Metric.update(cpuGauge, 85.5)
  await Metric.update(statusFrequency, "200")
  await Metric.update(responseHistogram, 150)
  await Metric.update(latencySummary, 120)

  // Extract states with proper typing
  const counterState = await Metric.value(requestCounter)
  const gaugeState = await Metric.value(cpuGauge)
  const frequencyState = await Metric.value(statusFrequency)
  const histogramState = await Metric.value(responseHistogram)
  const summaryState = await Metric.value(latencySummary)
  return {
    counter: { count: counterState.count }, // { count: 10 }
    gauge: { value: gaugeState.value }, // { value: 85.5 }
    frequency: { uniqueValues: frequencyState.occurrences.size }, // { uniqueValues: 1 }
    histogram: { totalObservations: histogramState.count }, // { totalObservations: 1 }
    summary: { observations: summaryState.count } // { observations: 1 }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.counter.count, result.gauge.value, result.frequency.uniqueValues]
values // => [10, 85.5, 1]
```

## Metric.Hooks

**Using metric hooks**

```efx
const program = effect {
  // Create a counter metric
  const requestCounter = Metric.counter("requests_total", {
    description: "Total number of requests"
  })

  // The Hooks interface provides three core operations for metrics:
  // 1. get: retrieve current state
  // 2. update: add/set a value
  // 3. modify: transform the current state

  // These are low-level APIs. Most users should use high-level APIs:
  // - Metric.value() for getting state
  // - Metric.update() for updating values
  // - Metric.modify() for modifying values

  // Example using high-level APIs (recommended)
  await Metric.update(requestCounter, 1)
  await Metric.update(requestCounter, 5)
  const state = await Metric.value(requestCounter)

  return {
    currentCount: state.count, // 6
    isIncremental: state.incremental // false
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const state = result // => { currentCount: 6, isIncremental: false }
```

## Metric.Metadata

**Inspecting metric metadata**

```efx
const program = effect {
  // Create metrics with different configurations
  const requestCounter = Metric.counter("http_requests_total", {
    description: "Total number of HTTP requests",
    attributes: { service: "api", version: "1.0" }
  })

  const memoryGauge = Metric.gauge("memory_usage_bytes", {
    description: "Current memory usage in bytes"
  })

  const statusFrequency = Metric.frequency("http_status_codes")

  // The Metadata interface contains complete information about a metric:
  // - id: metric identifier
  // - type: metric type ("Counter", "Gauge", etc.)
  // - description: optional description
  // - attributes: optional key-value attributes
  // - hooks: low-level operations interface

  // Each metric has associated metadata that can be inspected
  await Metric.update(requestCounter, 10)
  await Metric.update(memoryGauge, 256000000)
  await Metric.update(statusFrequency, "200")

  return {
    counter: {
      id: requestCounter.id, // "http_requests_total"
      type: requestCounter.type, // "Counter"
      description: requestCounter.description // "Total number of HTTP requests"
    },
    gauge: {
      id: memoryGauge.id, // "memory_usage_bytes"
      type: memoryGauge.type, // "Gauge"
      description: memoryGauge.description // "Current memory usage in bytes"
    },
    frequency: {
      id: statusFrequency.id, // "http_status_codes"
      type: statusFrequency.type, // "Frequency"
      description: statusFrequency.description // undefined
    }
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const types = [result.counter.type, result.gauge.type, result.frequency.type] // => ["Counter", "Gauge", "Frequency"]
```

## Metric.SnapshotProto

**Inspecting metric snapshot protocols**

```efx
const program = effect {
  // Create and update metrics
  const requestCounter = Metric.counter("requests", {
    description: "Request count",
    attributes: { service: "api" }
  })

  const responseTimeHistogram = Metric.histogram("response_time", {
    description: "Response time distribution",
    boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 10 })
  })

  await Metric.update(requestCounter, 25)
  await Metric.update(responseTimeHistogram, 150)
  await Metric.update(responseTimeHistogram, 75)

  // Take snapshot of all metrics
  const snapshots = await Metric.snapshot

  // Each snapshot follows the SnapshotProto interface:
  // - id: metric identifier
  // - type: specific metric type
  // - description: optional description
  // - attributes: optional attributes
  // - state: current metric state

  const counterSnapshot = snapshots.find((s) => s.id === "requests")
  const histogramSnapshot = snapshots.find((s) => s.id === "response_time")

  return {
    counter: counterSnapshot ?
      {
        id: counterSnapshot.id, // "requests"
        type: counterSnapshot.type, // "Counter"
        description: counterSnapshot.description, // "Request count"
        hasAttributes: counterSnapshot.attributes !== undefined, // true
        count: (counterSnapshot.state as any).count // 25
      } :
      null,
    histogram: histogramSnapshot ?
      {
        id: histogramSnapshot.id, // "response_time"
        type: histogramSnapshot.type, // "Histogram"
        observations: (histogramSnapshot.state as any).count // 2
      } :
      null
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const counts = [result.counter?.count, result.histogram?.observations] // => [25, 2]
```

## Metric.Snapshot

**Analyzing metric snapshots**

```efx
const program = effect {
  // Create different types of metrics
  const requestCounter = Metric.counter("requests_total")
  const cpuGauge = Metric.gauge("cpu_usage_percent")
  const statusFrequency = Metric.frequency("http_status")
  const responseHistogram = Metric.histogram("response_time_ms", {
    boundaries: Metric.linearBoundaries({ start: 0, width: 100, count: 10 })
  })
  const latencySummary = Metric.summary("request_latency", {
    maxAge: "1 minute",
    maxSize: 100,
    quantiles: [0.5, 0.95, 0.99]
  })

  // Update all metrics
  await Metric.update(requestCounter, 150)
  await Metric.update(cpuGauge, 45.7)
  await Metric.update(statusFrequency, "200")
  await Metric.update(statusFrequency, "404")
  await Metric.update(responseHistogram, 250)
  await Metric.update(latencySummary, 120)

  // Take snapshot of all metrics
  const allSnapshots = await Metric.snapshot

  // Type-safe snapshot analysis using discriminated union
  const analyzeSnapshot = (snapshot: any) => {
    switch (snapshot.type) {
      case "Counter":
        return { type: "Counter", count: snapshot.state.count }
      case "Gauge":
        return { type: "Gauge", value: snapshot.state.value }
      case "Frequency":
        return {
          type: "Frequency",
          uniqueValues: snapshot.state.occurrences.size
        }
      case "Histogram":
        return { type: "Histogram", observations: snapshot.state.count }
      case "Summary":
        return { type: "Summary", observations: snapshot.state.count }
    }
  }

  const analysis = allSnapshots.map(analyzeSnapshot)

  return {
    totalMetrics: allSnapshots.length, // 5
    metricTypes: allSnapshots.map((s) => s.type), // ["Counter", "Gauge", "Frequency", "Histogram", "Summary"]
    analysis
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const types = result.metricTypes // => ["Counter", "Gauge", "Frequency", "Histogram", "Summary"]
```

## CurrentMetricAttributesKey

**Accessing the current metric attributes key**

```efx
const program = effect {
  // The key is used internally by the Effect runtime to manage metric attributes
  const key = Metric.CurrentMetricAttributesKey

  // Create metrics with base attributes
  const requestCounter = Metric.counter("requests_total", {
    description: "Total HTTP requests"
  })

  // The CurrentMetricAttributes service provides default attributes
  // that get applied to all metrics in the current context
  const baseAttributes = { service: "api", version: "1.0" }

  // Use withAttributes to apply attributes to metrics
  const taggedCounter1 = Metric.withAttributes(requestCounter, baseAttributes)
  const program1 = Metric.update(taggedCounter1, 1)

  const taggedCounter2 = Metric.withAttributes(requestCounter, {
    ...baseAttributes,
    endpoint: "/users"
  })
  const program2 = Metric.update(taggedCounter2, 5)

  await program1
  await program2

  return {
    keyValue: key, // "effect/Metric/CurrentMetricAttributes"
    keyType: typeof key, // "string"
    isConstant: key === "effect/Metric/CurrentMetricAttributes" // true
  }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const key = result // => { keyValue: "effect/Metric/CurrentMetricAttributes", keyType: "string", isConstant: true }
```

## CurrentMetricAttributes

**Providing current metric attributes**

```efx
const program = effect {
  // Access current metric attributes
  await Metric.CurrentMetricAttributes

  // Set new attributes context
  const newAttributes = { service: "api", version: "1.0" }
  const result = await provideService(
    effect {
      const updatedAttributes = await Metric.CurrentMetricAttributes
      return updatedAttributes
    },
    Metric.CurrentMetricAttributes,
    newAttributes
  )

  return result
}

const attributes = await runPromise(program)
const actual = attributes // => { service: "api", version: "1.0" }
```

## isMetric

**Checking metric values**

```efx
import { Metric } from "effect"

Metric.isMetric(Metric.counter("requests")) // => true
Metric.isMetric({ name: "requests" }) // => false
```

## counter

**Creating counter metrics**

```efx
const program = effect {
  // Create a basic counter for tracking requests
  const requestCounter = Metric.counter("http_requests_total", {
    description: "Total number of HTTP requests processed"
  })

  // Create an incremental-only counter for events
  const eventCounter = Metric.counter("events_processed", {
    description: "Events processed (increment only)",
    incremental: true
  })

  // Create a bigint counter for large values
  const bytesCounter = Metric.counter("bytes_transferred", {
    description: "Total bytes transferred",
    bigint: true,
    attributes: { service: "file-transfer" }
  })

  // Update counters with values
  await Metric.update(requestCounter, 1) // Increment by 1
  await Metric.update(requestCounter, 5) // Increment by 5 (total: 6)
  await Metric.update(eventCounter, 1) // Increment by 1
  await Metric.update(bytesCounter, 1024n) // Add 1024 bytes

  // Get current counter values
  const requestValue = await Metric.value(requestCounter)
  const eventValue = await Metric.value(eventCounter)
  const bytesValue = await Metric.value(bytesCounter)

  return { requestValue, eventValue, bytesValue }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const counts = [result.requestValue.count, result.eventValue.count, result.bytesValue.count] // => [6, 1, 1024n]
```

## gauge

**Creating gauge metrics**

```efx
const program = effect {
  // Create a gauge for tracking memory usage
  const memoryGauge = Metric.gauge("memory_usage_mb", {
    description: "Current memory usage in megabytes"
  })

  // Create a gauge for CPU utilization
  const cpuGauge = Metric.gauge("cpu_utilization", {
    description: "Current CPU utilization percentage",
    attributes: { host: "server-01" }
  })

  // Create a bigint gauge for large values
  const diskSpaceGauge = Metric.gauge("disk_free_bytes", {
    description: "Free disk space in bytes",
    bigint: true
  })

  // Set gauge values (replaces current value)
  await Metric.update(memoryGauge, 512) // Set to 512 MB
  await Metric.update(cpuGauge, 85.5) // Set to 85.5%
  await Metric.update(diskSpaceGauge, 1024000000n) // Set to ~1GB

  // Modify gauge values (adds to current value)
  await Metric.modify(memoryGauge, 128) // Increase by 128 MB (total: 640)
  await Metric.modify(cpuGauge, -10.5) // Decrease by 10.5% (total: 75%)

  // Update with new absolute values
  await Metric.update(memoryGauge, 800) // Set to 800 MB (replaces 640)

  // Get current gauge values
  const memoryValue = await Metric.value(memoryGauge)
  const cpuValue = await Metric.value(cpuGauge)
  const diskValue = await Metric.value(diskSpaceGauge)

  return { memoryValue, cpuValue, diskValue }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.memoryValue.value, result.cpuValue.value, result.diskValue.value] // => [800, 75, 1024000000n]
```

## frequency

**Creating frequency metrics**

```efx
const program = effect {
  // Create a frequency metric for HTTP status codes
  const statusFrequency = Metric.frequency("http_status_codes", {
    description: "Frequency of HTTP response status codes",
    preregisteredWords: ["200", "404", "500"] // Pre-register common codes
  })

  // Create a frequency metric for user actions
  const userActionFrequency = Metric.frequency("user_actions", {
    description: "Frequency of user actions performed",
    attributes: { application: "web-app" }
  })

  // Create a frequency metric for error types
  const errorTypeFrequency = Metric.frequency("error_types", {
    description: "Frequency of different error types"
  })

  // Record different occurrences
  await Metric.update(statusFrequency, "200") // Success response
  await Metric.update(statusFrequency, "200") // Another success
  await Metric.update(statusFrequency, "404") // Not found error
  await Metric.update(statusFrequency, "500") // Server error
  await Metric.update(statusFrequency, "200") // Another success

  await Metric.update(userActionFrequency, "login")
  await Metric.update(userActionFrequency, "view_dashboard")
  await Metric.update(userActionFrequency, "login")
  await Metric.update(userActionFrequency, "logout")

  await Metric.update(errorTypeFrequency, "ValidationError")
  await Metric.update(errorTypeFrequency, "NetworkError")
  await Metric.update(errorTypeFrequency, "ValidationError")

  // Get frequency counts
  const statusCounts = await Metric.value(statusFrequency)
  const actionCounts = await Metric.value(userActionFrequency)
  const errorCounts = await Metric.value(errorTypeFrequency)

  // statusCounts.occurrences will be:
  // Map { "200" => 3, "404" => 1, "500" => 1 }
  // actionCounts.occurrences will be:
  // Map { "login" => 2, "view_dashboard" => 1, "logout" => 1 }
  // errorCounts.occurrences will be:
  // Map { "ValidationError" => 2, "NetworkError" => 1 }

  return { statusCounts, actionCounts, errorCounts }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const counts = [
  result.statusCounts.occurrences.get("200"),
  result.actionCounts.occurrences.get("login"),
  result.errorCounts.occurrences.get("ValidationError")
]
counts // => [3, 2, 2]
```

## histogram

**Creating histogram metrics**

```efx
const program = effect {
  // Create a histogram for API response times
  const responseTimeHistogram = Metric.histogram("api_response_time", {
    description: "Distribution of API response times in milliseconds",
    boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 10 })
    // Creates buckets: 0-50ms, 50-100ms, 100-150ms, ..., 350-400ms, 400ms+
  })

  // Create a histogram for request payload sizes
  const payloadSizeHistogram = Metric.histogram("payload_size", {
    description: "Distribution of request payload sizes in KB",
    boundaries: Metric.exponentialBoundaries({ start: 1, factor: 2, count: 8 }),
    // Creates exponential buckets: 1KB, 2KB, 4KB, 8KB, 16KB, 32KB, 64KB, 128KB+
    attributes: { service: "api-gateway" }
  })

  // Create a histogram with custom boundaries
  const customHistogram = Metric.histogram("custom_metric", {
    description: "Custom distribution metric",
    boundaries: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100]
  })

  // Record various response times
  await Metric.update(responseTimeHistogram, 25) // Goes in 0-50ms bucket
  await Metric.update(responseTimeHistogram, 75) // Goes in 50-100ms bucket
  await Metric.update(responseTimeHistogram, 125) // Goes in 100-150ms bucket
  await Metric.update(responseTimeHistogram, 200) // Goes in 150-200ms bucket
  await Metric.update(responseTimeHistogram, 75) // Another 50-100ms

  // Record payload sizes
  await Metric.update(payloadSizeHistogram, 3) // Goes in 2-4KB bucket
  await Metric.update(payloadSizeHistogram, 15) // Goes in 8-16KB bucket
  await Metric.update(payloadSizeHistogram, 0.5) // Goes in 0-1KB bucket

  // Get histogram state with distribution data
  const responseTimeState = await Metric.value(responseTimeHistogram)
  const payloadSizeState = await Metric.value(payloadSizeHistogram)

  // responseTimeState will contain:
  // - buckets: [[50, 1], [100, 3], [150, 4], [200, 5], ...]
  // - count: 5, min: 25, max: 200, sum: 500
  // - Useful for calculating percentiles, averages, etc.

  return { responseTimeState, payloadSizeState }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.responseTimeState.count, result.responseTimeState.sum, result.payloadSizeState.count]
values // => [5, 500, 3]
```

## summary

**Creating summary metrics**

```efx
const program = effect {
  // Create a summary for API response times
  const responseTimeSummary = Metric.summary("api_response_time", {
    description: "API response time quantiles over 5-minute windows",
    maxAge: Duration.minutes(5), // Keep observations for 5 minutes
    maxSize: 1000, // Maximum 1000 observations in memory
    quantiles: [0.5, 0.9, 0.95, 0.99] // 50th, 90th, 95th, 99th percentiles
  })

  // Create a summary for request payload sizes
  const payloadSizeSummary = Metric.summary("request_payload_size", {
    description: "Request payload size distribution over 2-minute windows",
    maxAge: Duration.minutes(2), // Shorter window for recent trends
    maxSize: 500, // Smaller buffer for memory efficiency
    quantiles: [0.5, 0.75, 0.9], // Median, 75th, 90th percentiles
    attributes: { service: "upload-service" }
  })

  // Record deterministic response times
  const responseTimes = [82, 96, 104, 118, 135, 170, 210, 240]
  for (const responseTime of responseTimes) {
    await Metric.update(responseTimeSummary, responseTime)
  }

  // Record some payload sizes
  await Metric.update(payloadSizeSummary, 1.2) // 1.2KB
  await Metric.update(payloadSizeSummary, 5.8) // 5.8KB
  await Metric.update(payloadSizeSummary, 15.6) // 15.6KB
  await Metric.update(payloadSizeSummary, 3.4) // 3.4KB

  // Get summary statistics with quantiles
  const responseStats = await Metric.value(responseTimeSummary)
  const payloadStats = await Metric.value(payloadSizeSummary)

  // Both summaries include quantile information for their configured windows.

  return { responseStats, payloadStats }
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const response = result.responseStats
const payload = result.payloadStats
const responseValues = [response.count, response.min, response.max, response.sum] // => [8, 82, 240, 1155]
const payloadValues = [payload.count, payload.min, payload.max, payload.sum] // => [4, 1.2, 15.6, 26]
```

## summaryWithTimestamp

**Creating summaries with explicit timestamps**

```efx
import { Metric } from "effect"

const responseTimesSummary = Metric.summaryWithTimestamp(
  "response_times_summary",
  {
    description: "Measures the distribution of response times",
    maxAge: "60 seconds", // Retain observations for 60 seconds.
    maxSize: 1000, // Keep a maximum of 1000 observations.
    quantiles: [0.5, 0.9, 0.99] // Calculate 50th, 90th, and 99th quantiles.
  }
)
const metadata = [responseTimesSummary.id, responseTimesSummary.type] // => ["response_times_summary", "Summary"]
```

## timer

**Recording durations with a timer**

```efx
// Create a timer metric to track API request durations
const apiRequestTimer = Metric.timer("api_request_duration", {
  description: "Duration of API requests",
  attributes: { service: "user-api" }
})

// Record a measured API operation duration
const apiOperation = effect {
  const duration = Duration.millis(120)
  await Metric.update(apiRequestTimer, duration)

  const state = await Metric.value(apiRequestTimer)
  return {
    count: state.count,
    min: state.min,
    max: state.max,
    sum: state.sum
  }
}

await runPromise(
  provideService(apiOperation, Metric.MetricRegistry, new Map())
) // => { count: 1, min: 120, max: 120, sum: 120 }
```

## value

**Reading metric state**

```efx
const requestCounter = Metric.counter("modify_requests")
const responseTime = Metric.histogram("response_time", {
  boundaries: [100, 500, 1000, 2000]
})

const program = effect {
  // Update metrics
  await Metric.update(requestCounter, 1)
  await Metric.update(responseTime, 750)

  // Get current values
  const counterState = await Metric.value(requestCounter)
  const histogramState = await Metric.value(responseTime)
  return {
    requestCount: counterState.count,
    count: histogramState.count,
    min: histogramState.min,
    max: histogramState.max,
    average: histogramState.sum / histogramState.count
  }
}

await runPromise(
  provideService(program, Metric.MetricRegistry, new Map())
) // => { requestCount: 1, count: 1, min: 750, max: 750, average: 750 }
```

## modify

**Modifying metric values**

```efx
const temperatureGauge = Metric.gauge("temperature")
const requestCounter = Metric.counter("requests")

const program = effect {
  // Set initial temperature
  await Metric.update(temperatureGauge, 20)

  // Modify by adding/subtracting values
  await Metric.modify(temperatureGauge, 5) // Now 25
  await Metric.modify(temperatureGauge, -3) // Now 22

  // For counters, modify increments by the specified amount
  await Metric.modify(requestCounter, 10) // Add 10 to counter
  await Metric.modify(requestCounter, 5) // Add 5 more (total: 15)

  const temp = await Metric.value(temperatureGauge)
  const requests = await Metric.value(requestCounter)
  return [temp.value, requests.count] as const
}

await runPromise(provideService(program, Metric.MetricRegistry, new Map())) // => [22, 15]
```

## update

**Updating metric values**

```efx
const cpuUsage = Metric.gauge("cpu_usage_percent")
const httpStatus = Metric.frequency("http_status_codes")
const responseTime = Metric.histogram("response_time_ms", {
  boundaries: [100, 500, 1000, 2000]
})

const program = effect {
  // Update gauge to specific values
  await Metric.update(cpuUsage, 45.2)
  await Metric.update(cpuUsage, 67.8) // Replaces previous value

  // Track HTTP status code occurrences
  await Metric.update(httpStatus, "200")
  await Metric.update(httpStatus, "404")
  await Metric.update(httpStatus, "200") // Increments 200 count

  // Record response times
  await Metric.update(responseTime, 250)
  await Metric.update(responseTime, 750)
  await Metric.update(responseTime, 1500)

  // Check current states
  const cpu = await Metric.value(cpuUsage)
  const statuses = await Metric.value(httpStatus)
  const times = await Metric.value(responseTime)
  return [cpu.value, statuses.occurrences.get("200"), times.count] as const
}

await runPromise(provideService(program, Metric.MetricRegistry, new Map())) // => [67.8, 2, 3]
```

## mapInput

**Mapping metric inputs**

```efx
const durationHistogram = Metric.histogram("request_duration_ms", {
  description: "Request duration in milliseconds",
  boundaries: Metric.linearBoundaries({ start: 0, width: 100, count: 10 })
})

// Accept duration strings while recording numeric milliseconds
const durationStringHistogram = Metric.mapInput(
  durationHistogram,
  (input: string) => Number(input)
)

const program = effect {
  await Metric.update(durationStringHistogram, "250")
  return await Metric.value(durationStringHistogram)
}

const value = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [value.count, value.sum] // => [1, 250]
```

## withConstantInput

**Ignoring inputs with a constant value**

```efx
// Create a counter that normally expects a number increment
const requestCounter = Metric.counter("total_requests", {
  description: "Total number of requests processed"
})

// Create a version that always increments by 1, regardless of input
const simpleRequestCounter = Metric.withConstantInput(requestCounter, 1)

const program = effect {
  // These all increment the counter by 1, ignoring the input value
  await Metric.update(simpleRequestCounter, "any string")
  await Metric.update(simpleRequestCounter, { complex: "object" })
  await Metric.update(simpleRequestCounter, 999) // Still increments by 1

  const value = await Metric.value(simpleRequestCounter)
  return value // Counter state will show count: 3
}

const value = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const count = value.count // => 3
```

## withAttributes

**Applying metric attributes**

```efx
const requestCounter = Metric.counter("http_requests_total", {
  description: "Total HTTP requests"
})

// Create tagged versions of the metric
const getRequests = Metric.withAttributes(requestCounter, {
  method: "GET",
  endpoint: "/api/users"
})

const postRequests = Metric.withAttributes(requestCounter, {
  method: "POST",
  endpoint: "/api/users"
})

const program = effect {
  // These will be tracked as separate metric series
  await Metric.update(getRequests, 1) // http_requests_total{method="GET", endpoint="/api/users"}
  await Metric.update(postRequests, 1) // http_requests_total{method="POST", endpoint="/api/users"}
  await Metric.update(getRequests, 1) // Increments the GET counter

  // You can also chain attributes
  const taggedMetric = requestCounter.pipe(
    Metric.withAttributes({ service: "user-api" }),
    Metric.withAttributes({ version: "v1" })
  )

  await Metric.update(taggedMetric, 1) // http_requests_total{service="user-api", version="v1"}
}

const result = effect {
  await program
  const get = await Metric.value(getRequests)
  const post = await Metric.value(postRequests)
  return [get.count, post.count] as const
}

await runPromise(provideService(result, Metric.MetricRegistry, new Map())) // => [2, 1]
```

## snapshot

**Capturing metric snapshots**

```efx
const program = effect {
  // Create and update some metrics
  const requestCounter = Metric.counter("http_requests", {
    description: "Total HTTP requests"
  })
  const responseTime = Metric.histogram("response_time_ms", {
    description: "Response time in milliseconds",
    boundaries: Metric.linearBoundaries({ start: 0, width: 100, count: 5 })
  })

  // Update the metrics with some values
  await Metric.update(requestCounter, 1)
  await Metric.update(requestCounter, 1)
  await Metric.update(responseTime, 150)
  await Metric.update(responseTime, 75)

  // Take a snapshot of all metrics
  const snapshots = await Metric.snapshot

  return snapshots
}

const snapshots = await runPromise(
  provideService(program, Metric.MetricRegistry, new Map())
)
const ids = snapshots.map((snapshot) => snapshot.id).sort() // => ["http_requests", "response_time_ms"]
```

## dump

**Dumping metrics as text**

```efx
const program = effect {
  // Create and update some metrics for demonstration
  const requestCounter = Metric.counter("http_requests_total", {
    description: "Total HTTP requests"
  })
  const responseTime = Metric.gauge("response_time_ms", {
    description: "Current response time in milliseconds"
  })
  const statusFreq = Metric.frequency("http_status_codes", {
    description: "Frequency of HTTP status codes"
  })

  // Update metrics with some values
  await Metric.update(requestCounter, 1)
  await Metric.update(requestCounter, 1)
  await Metric.update(responseTime, 125)
  await Metric.update(statusFreq, "200")
  await Metric.update(statusFreq, "404")
  await Metric.update(statusFreq, "200")

  // Get formatted dump of all metrics
  const metricsReport = await Metric.dump
  return metricsReport
}

const report = await runPromise(
  provideService(program, Metric.MetricRegistry, new Map())
)
const included = [
  report.includes("http_requests_total"),
  report.includes("response_time_ms"),
  report.includes("http_status_codes")
]
included // => [true, true, true]
```

## snapshotUnsafe

**Capturing snapshots from a context**

```efx
const requestCounter = Metric.counter("http_requests")
const program = effect {
  await Metric.update(requestCounter, 1)
  const context = await Effect.context()
  return Metric.snapshotUnsafe(context).map((snapshot) => snapshot.id)
}

await runPromise(provideService(program, Metric.MetricRegistry, new Map())) // => ["http_requests"]
```

## boundariesFromIterable

**Creating boundaries from values**

```efx
import { Metric } from "effect"

Metric.boundariesFromIterable([-5, 0, 10, 10, 25, 50]) // => [10, 25, 50, Infinity]
```

## linearBoundaries

**Creating linear boundaries**

```efx
import { Metric } from "effect"

Metric.linearBoundaries({ start: 10, width: 20, count: 5 }) // => [10, 30, 50, 70, Infinity]
```

## exponentialBoundaries

**Creating exponential boundaries**

```efx
import { Metric } from "effect"

Metric.exponentialBoundaries({ start: 1, factor: 2, count: 5 }) // => [1, 2, 4, 8, Infinity]
```

## FiberRuntimeMetricsKey

**Accessing the fiber runtime metrics key**

```efx
import { Metric } from "effect"

Metric.FiberRuntimeMetricsKey // => "effect/Metric/FiberRuntimeMetrics"
```

## FiberRuntimeMetricsService

**Providing a custom fiber metrics service**

```efx
import { Context, Exit, Metric } from "effect"

const events: Array<string> = []
const customMetricsService: Metric.FiberRuntimeMetricsService = {
  recordFiberStart: () => {
    events.push("start")
  },
  recordFiberEnd: (_context, exit) => {
    events.push(Exit.isSuccess(exit) ? "success" : "failure")
  }
}

customMetricsService.recordFiberStart(Context.empty())
customMetricsService.recordFiberEnd(Context.empty(), Exit.succeed("ok"))
events // => ["start", "success"]
```

## FiberRuntimeMetrics

**Accessing the fiber runtime metrics service**

```efx
const program = effect {
  const metricsService = await Metric.FiberRuntimeMetrics
  return metricsService === Metric.FiberRuntimeMetricsImpl
}

const result = await runPromise(
  provideService(program, Metric.FiberRuntimeMetrics, Metric.FiberRuntimeMetricsImpl)
)
const isDefault = result // => true
```

## FiberRuntimeMetricsImpl

**Accessing the default fiber metrics implementation**

```efx
import { Metric } from "effect"

[
  typeof Metric.FiberRuntimeMetricsImpl.recordFiberStart,
  typeof Metric.FiberRuntimeMetricsImpl.recordFiberEnd
] // => ["function", "function"]
```

## enableRuntimeMetricsLayer

**Enabling runtime metrics with a layer**

```efx
const program = effect {
  const service = await Metric.FiberRuntimeMetrics
  return service === Metric.FiberRuntimeMetricsImpl
}

await runPromise(provide(program, Metric.enableRuntimeMetricsLayer)) // => true
```

## disableRuntimeMetricsLayer

**Disabling runtime metrics with a layer**

```efx
const program = effect {
  // Disable runtime metrics collection
  const disabledLayer = Metric.disableRuntimeMetricsLayer

  return await effect {
    // Check that metrics service is disabled
    const metricsService = await Metric.FiberRuntimeMetrics

    // Run some Effects - no metrics will be collected
    await forkChild(sleep("50 millis"))
    await forkChild(sleep("100 millis"))
    await sleep("200 millis")

    // Create test metrics to show they still work
    const testCounter = Metric.counter("test_counter")
    await Metric.update(testCounter, 1)
    const counterValue = await Metric.value(testCounter)

    return { counterValue, metricsEnabled: metricsService !== undefined }
  } |> provide(disabledLayer)
}

const result = await runPromise(provideService(program, Metric.MetricRegistry, new Map()))
const values = [result.counterValue.count, result.metricsEnabled] // => [1, false]
```

## enableRuntimeMetrics

**Enabling runtime metrics for an effect**

```efx
const program = effect {
  const service = await Metric.FiberRuntimeMetrics
  return service === Metric.FiberRuntimeMetricsImpl
}

await runPromise(Metric.enableRuntimeMetrics(program)) // => true
```

## disableRuntimeMetrics

**Disabling runtime metrics for an effect**

```efx
const program = effect {
  const service = await Metric.FiberRuntimeMetrics
  return service === undefined
}

await runPromise(Metric.disableRuntimeMetrics(program)) // => true
```
