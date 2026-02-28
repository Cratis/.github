# C# coding standards

## Async

* If your API in a type supports both synchronous and asynchronous operations you **MUST** postfix the async version with `Async`.
* If your API in a type supports only synchronous or only asynchronous operations you don't need to postfix with `Async`.
* If your system is calling the consumer either by convention or by the means of a registered callback, the system must
  be clear on its support of sync/async. If it does not support one or the other, it should throw an exception at runtime.

## Fluent APIs

The goal of a fluent API is that it should provide a highly readable fluent way of describing something.

* If you're describing something, Fluent APIs can be very helpful. e.g. configuration, mapping files, projection descriptors etc.
* If you're prescribing something, Fluent APIs can be a very bad choice due to it being harder to debug and follow its flow - its no longer naturally flowing.

## Immutable

We favor immutability when we can. The reason behind that is that immutability leads to less side-effects. Think about multi core processors
and asynchronous code as an example, having multiple threads modify state can be dangerous and lead to unwanted side-effects. It is also
very hard to reason about what happened. Keeping things immutable leads to designs of creating new instances for each of these with the
state at the time and enabling composition. With the threading example it also helps us from a performance perspective as we wouldn't
need to lock and use expensive semaphores to assure anyone else is not modifying state.

With C#'s support for [record types](https://docs.microsoft.com/en-us/dotnet/csharp/fundamentals/types/records) and init-only setters for properties, we can create immutable objects:

```csharp
public record Person(SocialSecurityNumber SocialSecurityNumber);
```

These types implement `IEquatable` and `IComparable` and act as a value object, which is very convenient for comparing instances.

If you're not looking for what records give, another approach to immutability could be to leverage the [init-only](https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/init) properties in classes.

```csharp
public class Person
{
    public SocialSecurityNumber SocialSecurityNumber { get; init; }
}
```

The value will be set only at construction time and can't be modified after.

Immutability also extends into the design of APIs. APIs should not return mutable objects. The source owns its state and reason to change and therefor
be the one mutating it. An example of this is returning a `List` or `Dictionary`. These are by design mutable. Instead you should have on
your public contract `IEnumerable` and `IReadOnlyDictionary`. The implementation could be using mutable enumerables and return these directly
as they implement `IEnumerable`. This implementation detail should not bleed out and by exposing the immutable interface, the consumer should
then not just assume it can be mutated.

When returning mutable objects you're at the mercy of the consumer and having to rely on it not altering the state in which it does not
own. This can lead to unwanted side-effects and very hard to debug and reason about.

## Concepts

To articulate the domain we're working on, we prefer using specific types for everything rather than technical building blocks such as primitives.
We tend to create these by leveraging what we have in [Cratis](https://github.com/cratis/Cratis/blob/main/Documentation/fundamentals/concepts.md).
For instance, lets say you have a domain where you have a model that includes person. On the person model you have a property holding the persons social security number.
In its basic form this is a string.

```csharp
public record Person(string SocialSecurityNumber)
```

Instead of using `string`, we want this to actually be a specific type of `SocialSecurityNumber`. We call these domain concepts and can be created
in the following way:

```csharp
public record SocialSecurityNumber(string value) : ConceptAs<string>(value);
```

Then our class would change as follows:

```csharp
public record Person(SocialSecurityNumber SocialSecurityNumber)
```

When we use this new type we will quickly see the type it is expecting on the signature.
This becomes even more clear when used in APIs, such as a repository:

```csharp
public interface IPersons
{
    Person GetBy(SocialSecurityNumber socialSecurityNumber);
}
```
