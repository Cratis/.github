# Profiling

If you have an IDE like Visual Studio or Jetbrains Rider, you can use the built in profiler of these.

[Dotnet-trace](https://docs.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-trace) offers a simple way to collect profiling
telemetry. This can then be used with [Speedscope](https://www.speedscope.app) by importing the result.

Navigate to the project you want to profile and run the following:

```shell
dotnet trace collect --format Speedscope -- dotnet bin/Debug/net9.0/<name of assembly>.dll
```

> Note: You'll see a file called **dotnet_<date_time>.speedscope.json** file, this is the one you'll upload to Speedscope.
