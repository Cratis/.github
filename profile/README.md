# Cratis

**Open-source (MIT) tools for building event-sourced and CQRS applications — free to use, from the event store to the UI.**

At the center is [**Chronicle**](https://github.com/Cratis/Chronicle), an event-sourcing database and processing runtime with a first-class .NET SDK and additional TypeScript, Kotlin/Java (JVM), and Elixir clients — with a Python client coming soon — plus pluggable storage-provider implementations including MongoDB (default), PostgreSQL, SQL Server, and SQLite. Around Chronicle, Cratis provides [Arc](https://github.com/Cratis/Arc), an opinionated CQRS framework for ASP.NET Core that works with or without event sourcing; [Components](https://github.com/Cratis/Components) for React; the [CLI](https://github.com/Cratis/cli) and Workbench inspection surfaces; an experimental model-first layer; and supporting libraries and tools. Everything Cratis publishes today is MIT licensed and free to use.

All documentation can be found at [https://cratis.io](https://cratis.io). Want to see it running? Start with the [Samples](https://github.com/Cratis/Samples).

## The ecosystem

### Chronicle and its clients

| Project | What it is |
| ------- | ---------- |
| [Chronicle](https://github.com/Cratis/Chronicle) | Event-sourcing database and runtime — Orleans-based .NET kernel, pluggable storage (MongoDB default; PostgreSQL, SQL Server, SQLite, in-memory), and language-agnostic gRPC contracts. [Docs](https://www.cratis.io/chronicle/) |
| [.NET SDK](https://github.com/Cratis/Chronicle) | The first-class client, shipped with Chronicle itself. |
| [TypeScript](https://github.com/Cratis/Chronicle.TypeScript) | Event sourcing for TypeScript and Node.js — the idiomatic client for Chronicle. |
| [Kotlin/Java](https://github.com/Cratis/Chronicle.Kotlin) | Event sourcing for Kotlin and Java (JVM), with a Spring Boot starter and a testing library. |
| [Elixir](https://github.com/Cratis/Chronicle.Elixir) | Event sourcing for Elixir, with transactions, optimistic concurrency, and webhooks. |
| [Python](https://github.com/Cratis/Chronicle.Python) | Coming soon — pre-alpha, not yet published. |
| [MCP server](https://github.com/Cratis/Chronicle.Mcp) | Connects AI agents to a running Chronicle — works regardless of client language. |

### Application layer

| Project | What it is |
| ------- | ---------- |
| [Arc](https://github.com/Cratis/Arc) | Opinionated CQRS framework for ASP.NET Core — commands, queries, validation, authorization, and TypeScript proxy generation. Works without event sourcing; Chronicle integration is optional. [Docs](https://www.cratis.io/arc/) |
| [Components](https://github.com/Cratis/Components) | React components for CQRS and event-sourced applications built with Arc — command dialogs, typed forms, and query-backed data tables. [Docs](https://www.cratis.io/components/) |

### Inspection and diagnosis

| Project | What it is |
| ------- | ---------- |
| [CLI](https://github.com/Cratis/cli) | Terminal workflows for inspecting and diagnosing Chronicle — events, observers, projections, read models, and failed partitions. [Docs](https://www.cratis.io/cli/) |
| Workbench | The web-based inspection surface for Chronicle event stores, shipped with Chronicle. |
| [Narrator](https://github.com/Cratis/Narrator) | Browse Chronicle event stores from VS Code. |
| [Lens](https://github.com/Cratis/Lens) | Browser extension for Arc apps — switch tenant and identity, execute commands and queries. |

### Model-first layer (experimental)

| Project | What it is |
| ------- | ---------- |
| Studio | Collaborative environment for designing, visualizing, and editing Screenplay event models. |
| [Screenplay](https://github.com/Cratis/Screenplay) | A model-first language for event-sourced, CQRS systems — commands, events, projections. |
| [Stage](https://github.com/Cratis/Stage) | Renders Screenplay models into reviewable Arc + Chronicle applications. |
| [Scene](https://github.com/Cratis/Scene) | Describing a user interface without describing a platform — the UI model of the model-first layer. |
| [Prologue](https://github.com/Cratis/Prologue) | Captures existing system behavior (SQL Server CDC, Postgres logical replication, HTTP, OTLP) into event models. |

### Supporting projects

| Project | What it is |
| ------- | ---------- |
| [Fundamentals](https://github.com/Cratis/Fundamentals) | The shared building blocks beneath the Cratis stack — concepts, serialization, dependency injection, and type discovery for .NET and TypeScript. |
| [Specifications](https://github.com/Cratis/Specifications) | Specification by Example (BDD) for .NET — Given/When/Then specs with xUnit and NUnit. |
| [Synopsis](https://github.com/Cratis/Synopsis) | Turns your specs into living documentation — browsable HTML from .NET, JS/TS, and Gherkin test suites. |
| [AI](https://github.com/Cratis/AI) | Free, MIT-licensed AI skills, rules, and agent guidance for building with the Cratis ecosystem (preview). |
| Ensemble | Deterministic expert workflows for AI agents building with the Cratis stack — pre-release, coming soon. |
| [Samples](https://github.com/Cratis/Samples) | Runnable event sourcing and CQRS samples for the whole stack. |

## Values

We have a belief system founded in a set of core values.
They represent a mindset of how we approach software development and what we
consider important. You can read more about them [here](/values.md).

## Code of Conduct

Our responsibility for running the community is to provide a safe space for everyone. To assure this
we have put together a [code of conduct](/CODE_OF_CONDUCT.md).

## Architectural characteristics

All that we do follows a set of [characteristics](/characteristics.md) that we use as guiding stars.
These are characteristics we are building towards and will also be what we look at for contributions.

## Contributing

We welcome contributions to our journey, we have put together a [contribution guide](/contributing.md)
to help in setting what our expectations are for contributions.

## Versions

### Chronicle

[![Nuget](https://img.shields.io/nuget/v/Cratis.Chronicle?label=Cratis.Chronicle&logo=nuget)](http://nuget.org/packages/cratis.chronicle)
[![Docker](https://img.shields.io/docker/v/cratis/chronicle?label=Chronicle&logo=docker&sort=semver)](https://hub.docker.com/r/cratis/chronicle)
[![NPM](https://img.shields.io/npm/v/@cratis/chronicle?label=@cratis/chronicle&logo=npm)](https://www.npmjs.com/package/@cratis/chronicle)
[![Maven Central](https://img.shields.io/maven-central/v/io.cratis/chronicle?label=io.cratis:chronicle&logo=apachemaven)](https://central.sonatype.com/artifact/io.cratis/chronicle)
[![Hex.pm](https://img.shields.io/hexpm/v/cratis_chronicle?label=cratis_chronicle&logo=elixir)](https://hex.pm/packages/cratis_chronicle)

### Arc

[![Nuget](https://img.shields.io/nuget/v/Cratis.Arc?label=Cratis.Arc&logo=nuget)](http://nuget.org/packages/cratis.arc)
[![NPM](https://img.shields.io/npm/v/@cratis/arc?label=@cratis/arc&logo=npm)](https://www.npmjs.com/package/@cratis/arc)

### Components

[![NPM](https://img.shields.io/npm/v/@cratis/components?label=@cratis/components&logo=npm)](https://www.npmjs.com/package/@cratis/components)

### CLI

[![Nuget](https://img.shields.io/nuget/v/Cratis.Cli?label=Cratis.Cli&logo=nuget)](http://nuget.org/packages/cratis.cli)

### Fundamentals

[![Nuget](https://img.shields.io/nuget/v/Cratis.Fundamentals?label=Cratis.Fundamentals&logo=nuget)](http://nuget.org/packages/cratis.fundamentals)
[![NPM](https://img.shields.io/npm/v/@cratis/fundamentals?label=@cratis/fundamentals&logo=npm)](https://www.npmjs.com/package/@cratis/fundamentals)

### Specifications

[![Nuget](https://img.shields.io/nuget/v/cratis.specifications.xunit?label=XUnit)](http://nuget.org/packages/cratis.specifications.xunit)
[![Nuget](https://img.shields.io/nuget/v/cratis.specifications.nunit?label=NUnit)](http://nuget.org/packages/cratis.specifications.nunit)
