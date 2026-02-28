# Logging

Logs are an important tool for developers to both understand program flow and trace down bugs and errors as they appear in software.
Comprehensive, cohesive and focused log messages are key to the efficacy of logs as a development tool.
To ensure that we empower developers with our software, we have put in place guiding principles for writing log messages.

## Structured log messages

Traditionally log messages have been stored as strings with data embedded using string formatting.
While simple to store and transmit, these strings lose semantic and contextual information about data types and parameters,
making searching and displaying log messages labour intensive and requiring specialized tools.

Modern logging frameworks support structured or semantic log messages.
These frameworks split the definition of the human readable log message from the data it contains.
All popular logging frameworks support the [message template](https://messagetemplates.org/) format specification, or a subset thereof.

## Log message categories

To allow filtering of log messages from different parts of the source code during execution flow, log messages must contain a category.
In most languages this category is defined by the fully qualified name of the type that defines the code being executed, including the
package or namespace in which the type resides.
These categories are commonly used during debugging to selectively enable `Debug` or `Trace` messages for parts of the software
by defining filters on the log message output.

## Log message levels

We define five log message levels that represent the intent or severity of the log message.
They are, in decreasing order of severity:

* `Error` - unrecoverable failure, resulting in an end-user error.
* `Warning` - recoverable failure, performance or functionality is degraded.
* `Information` - information that is needed to use the software, and user activity traces.
* `Debug` - execution activity and sub-activity checkpoints.
* `Trace` - detailed execution trace with data that affects the flow path.

### Error

An error log message indicates that an unrecoverable failure has occurred and that the current execution flow has stopped as a consequence.
The current activity the software was performing cannot be completed, and will in most cases lead to an end-user error message being shown.
For languages that have the concept of exceptions, these must be included in an error log message.
An error log message indicates that immediate action is required to recover full software functionality.

### Warning

While an error message indicates an unrecoverable failure, warning log messages indicate a recoverable failure or abnormal and unexpected behavior.
The current execution flow is able to continue by recovering to a fail-safe state, albeit with possible degraded performance or functionality.
Typical examples would be an expected data structure not being found but it is possible to continue with default values, or multiple data structures
being found where there should only be one but it is safe to continue.
A warning log message indicates that cleanup or validation is required at a later point to recover or verify the intended software functionality.

Warning log messages are also used to warn developers about incorrect usage of functionality, and deprecated functionality that will be removed in the future.

### Information

Informational log messages track the general execution flow of the software and provide the developer with information needed to use the software correctly.
These log messages have long term value, and typically include host startup information and user interactions with the application.

Information level log messages are typically the lowest severity messages written by default, and must therefore not be used to log messages
that are not useful when the software is working as expected.

### Debug

Debug log messages are used by developers to figure out _where_ failures occur during execution flow while investigating interactively with the software.
These log messages represent high-level checkpoints of activities and sub-activities during execution flow, to give hints for what log message categories
and source code to investigate in more detail.
Debug messages should not contain any data other than correlation and trace identifiers used to identify unique failing interactions.

### Trace

Trace log messages are the most verbose of the log levels.
They are used by developers to figure out _what_ caused a failure or unexpected behavior, and should therefore contain the data that affects the execution flow path.
Typical uses of trace log messages are public methods on interface implementations and contents of collections used for lookup.

## Log message content

Log messages should be written in a style that makes it easy to navigate and filter out irrelevant information so that we can find the cause of any error
by simply reviewing them. Logs should be focused and comprehensive for both humans and machines, and consistent in format and style across platforms, languages and frameworks.

### Stick to English

There are many reasons to stick to English-only log messages. One technical reason is that English ensures we stick to the ASCII character set.
This is important because we don't necessarily know what happens to the log message - if it uses a special character set it might not render correctly
or can become corrupt and unreadable.

### Log context

Each log message should contain enough information so that the reader understands exactly what is going on without having to read any prior log messages.
When writing log messages it is easy to forget that the context of where the log statement is in the code is not implicit in the output.

There are multiple aspects of _context_ in regards to logging: the current environment or execution context of the application, and domain specific context
such as information about where the logging is taking place in the execution flow or values of interest like IDs and names.
Log messages should include appropriate context relevant to the information being communicated.
For example, for multi-tenanted applications it would make sense to include information about the tenant the operation is performed in.

The amount of context information on a log message should be in proportion to the log level.
An information log message should not contain lots of contextual information that is not strictly needed for the end-user to use the software,
while a trace or debug log message should contain the information necessary to deduce the cause of an error.
For warning and error log messages produced as a result of an exception, it is important to include the exception stacktrace.

### Keep the reader in mind

We add logs to software because someone will likely have to read them someday.
The intended audience affects all aspects of a log message: its content, level and category.
Information log messages are intended for the end-user, while trace and debug messages are most likely only read during troubleshooting by developers.
The content of the log message should be targeted towards the intended audience.

### Don't log sensitive information

Sensitive information such as personally identifiable information, passwords and social security numbers has no place in log messages.

## C# logging

Logging can impact running performance. You therefore have to use the concept of
[LoggerMessage](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/logging/loggermessage?view=aspnetcore-5.0),
which generates optimized actions that can simply be called.

We encapsulate log messages for a type in a class named the same as the type suffixed with `LogMessages`.
It holds partial methods that represent specific log messages, leveraging the
[compile-time logging source generation](https://docs.microsoft.com/en-us/dotnet/core/extensions/logger-message-generator) of .NET 6.

Below is an example:

```csharp
public partial static class EventLogLogMessages
{
    [LoggerMessage(LogLevel.Information, "Committing event with '{SequenceNumber}' as sequence number")]
    internal static partial void Committing(this ILogger logger, EventType eventType, EventSourceId eventSource, uint sequenceNumber, EventLogId eventLog);

    [LoggerMessage(LogLevel.Error, "Problem committing event to storage")]
    internal static partial void CommitFailure(this ILogger logger, Exception exception);
}
```

When you want to use any of the messages you need the `ILogger` in your type:

```csharp
public class EventLog
{
    readonly ILogger<EventLog> _logger;

    public EventLog(ILogger<EventLog> logger)
    {
        _logger = logger;
    }

    public Task Commit(EventLogId eventLog, EventType type, EventSourceId eventSourceId, uint sequenceNumber)
    {
        _logger.Committing(eventType, eventSourceId, sequenceNumber, eventLog);

        return Task.CompletedTask;
    }
}
```
