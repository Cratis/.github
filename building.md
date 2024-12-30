# Building

All Cratis projects follow the same structure and way of building.

## Prerequisites

The repositories use one or more of the following technologies:

- [.NET Core 9](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node JS version 23](https://nodejs.org/)
- [Docker](https://www.docker.com/products/docker-desktop)

## Build and Test

All C# based projects are added to the solution file at the root level, you can therefor
build it quite easily from root:

```shell
dotnet build
```

Similarly with the specifications you can do:

```shell
dotnet test
```

If you're using an IDE such as Visual Studio, Rider or similar - open the solution file at the root.
file and do the build / test run from within the IDE.
