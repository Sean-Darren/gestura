# Formula benchmark (live, audio)

Evaluator: HyperFormula 3.5.0 (GPLv3)
Models: scripted-audio-transport-smoke-NOT-LLM

| Group | Cases | First try | After correction | First p50/p95 ms | Correction p50/p95 ms | End-to-end p50/p95 ms | USD/request |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| overall | 1 | 100.0% | 100.0% | 60.71/60.71 | N/A/N/A | 7192.79/7192.79 | 0.000000 |
| lang:en | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| lang:yue | 1 | 100.0% | 100.0% | 60.71/60.71 | N/A/N/A | 7192.79/7192.79 | 0.000000 |
| lang:mixed | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| category:aggregation | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| category:lookup | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| category:logical | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| category:date | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| category:text | 0 | N/A | N/A | N/A/N/A | N/A/N/A | N/A/N/A | N/A |
| category:uncategorized | 1 | 100.0% | 100.0% | 60.71/60.71 | N/A/N/A | 7192.79/7192.79 | 0.000000 |

- Mock results test the harness, not LLM quality.
- After-one-correction is cumulative over every case; failures and missing audio stay in the denominator.
- First/correction latency measures generation through structured response, including internal retries and failed requests; evaluation time is excluded. Attempts that never reach generation have no generation latency. End-to-end includes evaluation and audio playback/ASR, summed across attempts.
- Cost is an estimate from configured model rates and reported tokens, including retries; missing usage/pricing or failed billed calls makes cost unknown.
- HyperFormula results are not proof of Excel compatibility.

Cases SHA-256: e990c11a524cb8beb35120526aa4bfb93071c1e2adebb47b7efe8922540fcbf5
